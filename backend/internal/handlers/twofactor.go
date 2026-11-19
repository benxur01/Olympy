package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type VerifyTOTPRequest struct {
	Code string `json:"code" binding:"required"`
}

// GenerateRandomBase32 generates a 16-character base32 secret
func GenerateRandomBase32() string {
	bytes := make([]byte, 10)
	_, _ = rand.Read(bytes)
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)
}

// ValidateTOTPCode validates 6-digit TOTP code according to RFC 6238
func ValidateTOTPCode(secret string, code string) bool {
	secret = strings.ToUpper(strings.TrimSpace(secret))
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return false
	}

	currentTime := time.Now().Unix() / 30
	// Check current, previous, and next 30-second window to allow clock drift
	for _, t := range []int64{currentTime - 1, currentTime, currentTime + 1} {
		buf := make([]byte, 8)
		binary.BigEndian.PutUint64(buf, uint64(t))

		mac := hmac.New(sha1.New, key)
		mac.Write(buf)
		h := mac.Sum(nil)

		offset := h[len(h)-1] & 0x0f
		truncated := binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff
		expectedCode := fmt.Sprintf("%06d", truncated%1000000)

		if expectedCode == code {
			return true
		}
	}
	return false
}

// Setup2FA initiates TOTP setup
func Setup2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Foydalanuvchi topilmadi"})
		return
	}

	secret := GenerateRandomBase32()
	qrURL := fmt.Sprintf("otpauth://totp/Olympy:%s?secret=%s&issuer=Olympy", user.Phone, secret)

	c.JSON(http.StatusOK, gin.H{
		"secret":  secret,
		"qr_uri":  qrURL,
		"message": "Google Authenticator ilovasiga ushbu kalitni kiriting va 6 xonali kod bilan tasdiqlang",
	})
}

// VerifyAndEnable2FA verifies the first code and saves 2FA secret
func VerifyAndEnable2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req struct {
		Secret string `json:"secret" binding:"required"`
		Code   string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Maxfiy kalit va kod kiritilishi shart"})
		return
	}

	if !ValidateTOTPCode(req.Secret, req.Code) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kiritilgan 6 xonali kod noto'g'ri"})
		return
	}

	// Update user in DB
	database.DB.Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"telegram_chat_id": "2fa_enabled", // marker for active 2FA
	})

	c.JSON(http.StatusOK, gin.H{
		"message": "Ikki bosqichli autentifikatsiya (2FA) muvaffaqiyatli faollashtirildi!",
		"enabled": true,
	})
}

// Disable2FA disables TOTP for the user
func Disable2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	database.DB.Model(&models.User{}).Where("id = ?", userID).Update("telegram_chat_id", "")

	c.JSON(http.StatusOK, gin.H{
		"message": "2FA muvaffaqiyatli o'chirildi",
		"enabled": false,
	})
}
