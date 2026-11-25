package handlers

import (
	"crypto/md5"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type PaymeRPCRequest struct {
	Method string                 `json:"method"`
	Params map[string]interface{} `json:"params"`
	ID     interface{}            `json:"id"`
}

type ClickRequest struct {
	ClickTransID    int     `form:"click_trans_id" json:"click_trans_id"`
	ServiceID       int     `form:"service_id" json:"service_id"`
	ClickPaydocID   int     `form:"click_paydoc_id" json:"click_paydoc_id"`
	MerchantTransID string  `form:"merchant_trans_id" json:"merchant_trans_id"`
	MerchantPrepare int     `form:"merchant_prepare_id" json:"merchant_prepare_id"`
	Amount          float64 `form:"amount" json:"amount"`
	Action          int     `form:"action" json:"action"` // 0: Prepare, 1: Complete
	Error           int     `form:"error" json:"error"`
	SignTime        string  `form:"sign_time" json:"sign_time"`
	SignString      string  `form:"sign_string" json:"sign_string"`
}

func verifyPaymeAuth(c *gin.Context) bool {
	secretKey := strings.TrimSpace(os.Getenv("PAYME_SECRET_KEY"))
	if secretKey == "" {
		return gin.Mode() != gin.ReleaseMode
	}

	authHeader := c.GetHeader("Authorization")
	if !strings.HasPrefix(authHeader, "Basic ") {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(authHeader, "Basic "))
	if err != nil {
		return false
	}
	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) != 2 || parts[0] != "Paycom" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(parts[1]), []byte(secretKey)) == 1
}

func verifyClickSignature(req ClickRequest) bool {
	secretKey := strings.TrimSpace(os.Getenv("CLICK_SECRET_KEY"))
	if secretKey == "" {
		return gin.Mode() != gin.ReleaseMode
	}

	var raw string
	if req.Action == 0 {
		raw = fmt.Sprintf("%d%d%s%s%.2f%d%s",
			req.ClickTransID, req.ServiceID, secretKey, req.MerchantTransID, req.Amount, req.Action, req.SignTime)
	} else {
		raw = fmt.Sprintf("%d%d%s%s%d%.2f%d%s",
			req.ClickTransID, req.ServiceID, secretKey, req.MerchantTransID, req.MerchantPrepare, req.Amount, req.Action, req.SignTime)
	}
	sum := md5.Sum([]byte(raw))
	expected := hex.EncodeToString(sum[:])
	return subtle.ConstantTimeCompare([]byte(strings.ToLower(expected)), []byte(strings.ToLower(req.SignString))) == 1
}

// PaymeWebhook handles official Payme JSON-RPC 2.0 requests
func PaymeWebhook(c *gin.Context) {
	if !verifyPaymeAuth(c) {
		c.JSON(http.StatusOK, gin.H{
			"error": gin.H{"code": -32504, "message": "Insufficient privilege"},
			"id":    nil,
		})
		return
	}

	var rpc PaymeRPCRequest
	if err := c.ShouldBindJSON(&rpc); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"error": gin.H{"code": -32700, "message": "Parse error"},
			"id":    nil,
		})
		return
	}

	switch rpc.Method {
	case "CheckPerformTransaction":
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{"allow": true},
			"id":     rpc.ID,
		})

	case "CreateTransaction":
		txID := fmt.Sprintf("payme_%v", rpc.Params["id"])
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{
				"create_time": time.Now().UnixMilli(),
				"transaction": txID,
				"state":       1,
			},
			"id": rpc.ID,
		})

	case "PerformTransaction":
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{
				"perform_time": time.Now().UnixMilli(),
				"transaction":  rpc.Params["id"],
				"state":        2,
			},
			"id": rpc.ID,
		})

	case "CancelTransaction":
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{
				"cancel_time": time.Now().UnixMilli(),
				"transaction": rpc.Params["id"],
				"state":       -1,
			},
			"id": rpc.ID,
		})

	case "CheckTransaction":
		c.JSON(http.StatusOK, gin.H{
			"result": gin.H{
				"create_time":  time.Now().UnixMilli(),
				"perform_time": time.Now().UnixMilli(),
				"state":        2,
			},
			"id": rpc.ID,
		})

	default:
		c.JSON(http.StatusOK, gin.H{
			"error": gin.H{"code": -32601, "message": "Method not found"},
			"id":    rpc.ID,
		})
	}
}

// ClickWebhook handles official Click payment prepare & complete requests
func ClickWebhook(c *gin.Context) {
	var req ClickRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": -8, "error_note": "Error in request"})
		return
	}

	if !verifyClickSignature(req) {
		c.JSON(http.StatusOK, gin.H{"error": -1, "error_note": "SIGN CHECK FAILED!"})
		return
	}

	if req.Action == 0 {
		c.JSON(http.StatusOK, gin.H{
			"click_trans_id":      req.ClickTransID,
			"merchant_trans_id":   req.MerchantTransID,
			"merchant_prepare_id": 1001,
			"error":               0,
			"error_note":          "Success",
		})
		return
	}

	tx := models.PaymentTransaction{
		Amount:                req.Amount,
		Provider:              "click",
		Status:                "success",
		ProviderTransactionID: fmt.Sprintf("click_%d", req.ClickTransID),
	}
	if err := database.DB.Create(&tx).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"error": -7, "error_note": "Transaction persistence failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"click_trans_id":      req.ClickTransID,
		"merchant_trans_id":   req.MerchantTransID,
		"merchant_confirm_id": 2002,
		"error":               0,
		"error_note":          "Success",
	})
}
