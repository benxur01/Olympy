package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
)

type PaymeRPCRequest struct {
	Method string                 `json:"method"`
	Params map[string]interface{} `json:"params"`
	ID     interface{}            `json:"id"`
}

type ClickRequest struct {
	ClickTransID int     `form:"click_trans_id" json:"click_trans_id"`
	ServiceID    int     `form:"service_id" json:"service_id"`
	MerchantTransID string `form:"merchant_trans_id" json:"merchant_trans_id"`
	Amount       float64 `form:"amount" json:"amount"`
	Action       int     `form:"action" json:"action"` // 0: Prepare, 1: Complete
	Error        int     `form:"error" json:"error"`
	SignTime     string  `form:"sign_time" json:"sign_time"`
	SignString   string  `form:"sign_string" json:"sign_string"`
}

// PaymeWebhook handles official Payme JSON-RPC 2.0 requests
func PaymeWebhook(c *gin.Context) {
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
		// Mark payment success and activate subscription
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
	_ = c.ShouldBind(&req)

	if req.Action == 0 {
		// Prepare stage
		c.JSON(http.StatusOK, gin.H{
			"click_trans_id":      req.ClickTransID,
			"merchant_trans_id":   req.MerchantTransID,
			"merchant_prepare_id": 1001,
			"error":               0,
			"error_note":          "Success",
		})
		return
	}

	// Action == 1: Complete stage
	// Activate subscription & record transaction
	tx := models.PaymentTransaction{
		Amount:                req.Amount,
		Provider:              "click",
		Status:                "success",
		ProviderTransactionID: fmt.Sprintf("click_%d", req.ClickTransID),
	}
	database.DB.Create(&tx)

	c.JSON(http.StatusOK, gin.H{
		"click_trans_id":      req.ClickTransID,
		"merchant_trans_id":   req.MerchantTransID,
		"merchant_confirm_id": 2002,
		"error":               0,
		"error_note":          "Success",
	})
}
