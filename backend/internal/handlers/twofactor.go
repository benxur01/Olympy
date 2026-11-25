package handlers

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GenerateRandomBase32 generates a 16-character base32 secret
func GenerateRandomBase32() string {
	bytes := make([]byte, 10)
	if _, err := rand.Read(bytes); err != nil {
		return ""
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)
}

// ValidateTOTPCode validates a 6-digit TOTP code according to RFC 6238
func ValidateTOTPCode(secret string, code string) bool {
	secret = strings.ToUpper(strings.TrimSpace(secret))
	cleanCode := strings.TrimSpace(code)
	if secret == "" || cleanCode == "" {
		return false
	}
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return false
	}

	currentTime := time.Now().Unix() / 30
	for _, t := range []int64{currentTime - 1, currentTime, currentTime + 1} {
		buf := make([]byte, 8)
		binary.BigEndian.PutUint64(buf, uint64(t))

		mac := hmac.New(sha1.New, key)
		mac.Write(buf)
		h := mac.Sum(nil)

		offset := h[len(h)-1] & 0x0f
		truncated := binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff
		expectedCode := fmt.Sprintf("%06d", truncated%1000000)

		if subtle.ConstantTimeCompare([]byte(expectedCode), []byte(cleanCode)) == 1 {
			return true
		}
	}
	return false
}

// Setup2FA initiates TOTP setup and persists the pending secret on user so Verify only needs { code }.
func Setup2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	secret := GenerateRandomBase32()
	qrURL := fmt.Sprintf("otpauth://totp/Olympy:%s?secret=%s&issuer=Olympy", user.Phone, secret)

	database.DB.Model(&user).Update("totp_secret", secret)

	c.JSON(http.StatusOK, gin.H{
		"secret":  secret,
		"uri":     qrURL,
		"qr_uri":  qrURL,
		"message": "Google Authenticator ilovasiga ushbu kalitni kiriting va 6 xonali kod bilan tasdiqlang",
	})
}

// VerifyAndEnable2FA verifies the 6-digit code against the user's stored TOTP secret (or explicit secret).
func VerifyAndEnable2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req struct {
		Secret string `json:"secret"`
		Code   string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "6 xonali kod kiritilishi shart")
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	secret := strings.TrimSpace(req.Secret)
	if secret == "" {
		secret = user.TOTPSecret
	}

	if !ValidateTOTPCode(secret, req.Code) {
		jsonError(c, http.StatusBadRequest, "Kiritilgan 6 xonali kod noto'g'ri")
		return
	}

	database.DB.Model(&user).Updates(map[string]interface{}{
		"totp_secret":  secret,
		"totp_enabled": true,
	})
	database.DB.First(&user, userID)

	c.JSON(http.StatusOK, gin.H{
		"message":      "Ikki bosqichli autentifikatsiya (2FA) muvaffaqiyatli faollashtirildi!",
		"enabled":      true,
		"totp_enabled": true,
		"user":         SerializeUser(user),
	})
}

// Disable2FA disables TOTP after checking password or current TOTP code.
func Disable2FA(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req struct {
		Password string `json:"password"`
		TOTPCode string `json:"totp_code"`
		Code     string `json:"code"`
	}
	_ = c.ShouldBindJSON(&req)

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	code := req.TOTPCode
	if code == "" {
		code = req.Code
	}
	validPass := req.Password != "" && utils.CheckPasswordHash(req.Password, user.Password)
	validCode := code != "" && ValidateTOTPCode(user.TOTPSecret, code)
	if user.TOTPEnabled && !validPass && !validCode {
		jsonError(c, http.StatusBadRequest, "2FA o'chirish uchun parol yoki joriy TOTP kodini kiriting")
		return
	}

	database.DB.Model(&user).Updates(map[string]interface{}{
		"totp_secret":  "",
		"totp_enabled": false,
	})
	database.DB.First(&user, userID)

	c.JSON(http.StatusOK, gin.H{
		"message":      "2FA muvaffaqiyatli o'chirildi",
		"enabled":      false,
		"totp_enabled": false,
		"user":         SerializeUser(user),
	})
}
