package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/services"
	"olympy-backend-go/internal/utils"
	"time"

	"github.com/gin-gonic/gin"
)

type RegisterRequest struct {
	FullName string `json:"full_name" binding:"required"`
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	Role     string `json:"role"` // default: student
}

type LoginRequest struct {
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	Token        string      `json:"token"`
	AccessToken  string      `json:"access"`
	RefreshToken string      `json:"refresh"`
	User         models.User `json:"user"`
}

type StartPhoneOTPRequest struct {
	Phone string `json:"phone" binding:"required"`
}

type VerifyPhoneOTPRequest struct {
	Phone string `json:"phone" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

type StartPasswordResetRequest struct {
	Phone string `json:"phone" binding:"required"`
}

type ConfirmPasswordResetRequest struct {
	Phone       string `json:"phone" binding:"required"`
	Code        string `json:"code" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

type LinkEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ConfirmEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required"`
}

func Register(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Barcha maydonlarni to'g'ri to'ldiring: " + err.Error()})
			return
		}

		normPhone := utils.NormalizePhone(req.Phone)
		if normPhone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon raqam formati noto'g'ri (+998901234567)"})
			return
		}

		var existingUser models.User
		if err := database.DB.Where("normalized_phone = ?", normPhone).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"error": "Bu telefon raqam avval ro'yxatdan o'tgan"})
			return
		}

		hashedPassword, err := utils.HashPassword(req.Password)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Parolni shifrlashda xatolik"})
			return
		}

		role := req.Role
		if role == "" {
			role = "student"
		}

		user := models.User{
			FullName:        req.FullName,
			Phone:           normPhone,
			NormalizedPhone: normPhone,
			Password:        hashedPassword,
			Roles:           []string{role},
			IsPremium:       false,
			Coins:           50, // bonus coins
		}

		if err := database.DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Foydalanuvchini saqlashda xatolik: " + err.Error()})
			return
		}

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Token generatsiya qilishda xatolik"})
			return
		}

		c.JSON(http.StatusCreated, AuthResponse{
			Token:        access,
			AccessToken:  access,
			RefreshToken: refresh,
			User:         user,
		})
	}
}

func Login(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon raqam va parolni kiriting"})
			return
		}

		normPhone := utils.NormalizePhone(req.Phone)
		if normPhone == "" {
			normPhone = req.Phone
		}

		var user models.User
		if err := database.DB.Where("normalized_phone = ? OR phone = ?", normPhone, req.Phone).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Telefon raqam yoki parol noto'g'ri"})
			return
		}

		if !utils.CheckPasswordHash(req.Password, user.Password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Telefon raqam yoki parol noto'g'ri"})
			return
		}

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Token generatsiya qilishda xatolik"})
			return
		}

		c.JSON(http.StatusOK, AuthResponse{
			Token:        access,
			AccessToken:  access,
			RefreshToken: refresh,
			User:         user,
		})
	}
}

// StartPhoneTelegramVerification starts phone verification OTP
func StartPhoneTelegramVerification(c *gin.Context) {
	var req StartPhoneOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon raqam kiritilishi shart"})
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	if normPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon raqam formati noto'g'ri"})
		return
	}

	code, err := services.GenerateAndSaveOTP(normPhone, "phone_verify", "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OTP generatsiyasida xatolik"})
		return
	}

	// In local/demo or connected bot, return code or send via Telegram bot
	c.JSON(http.StatusOK, gin.H{
		"message":   "Tasdiqlash kodi Telegram botingizga yuborildi",
		"phone":     normPhone,
		"demo_code": code, // Provided for smooth testing and verification
	})
}

// VerifyPhoneOTP verifies OTP code
func VerifyPhoneOTP(c *gin.Context) {
	var req VerifyPhoneOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon va kod kiritilishi shart"})
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	ok, err := services.VerifyOTP(normPhone, "phone_verify", req.Code)
	if !ok || err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Telefon raqamingiz muvaffaqiyatli tasdiqlandi!",
		"phone":   normPhone,
	})
}

// StartPasswordReset sends OTP for resetting password
func StartPasswordReset(c *gin.Context) {
	var req StartPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Telefon raqam majburiy"})
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	var user models.User
	if err := database.DB.Where("normalized_phone = ?", normPhone).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bunday telefon raqamli foydalanuvchi topilmadi"})
		return
	}

	code, err := services.GenerateAndSaveOTP(normPhone, "password_reset", "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OTP yaratishda xatolik"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Parolni tiklash kodi Telegram botingizga yuborildi",
		"phone":     normPhone,
		"demo_code": code,
	})
}

// ConfirmPasswordReset verifies OTP and sets new password
func ConfirmPasswordReset(c *gin.Context) {
	var req ConfirmPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Barcha maydonlarni to'ldiring"})
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	ok, err := services.VerifyOTP(normPhone, "password_reset", req.Code)
	if !ok || err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashed, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Parolni shifrlashda xatolik"})
		return
	}

	if err := database.DB.Model(&models.User{}).Where("normalized_phone = ?", normPhone).Update("password", hashed).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Parolni yangilashda xatolik"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Parolingiz muvaffaqiyatli yangilandi! Yangi parol bilan kirishingiz mumkin."})
}

// StartEmailLink links email with OTP
func StartEmailLink(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req LinkEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email noto'g'ri kiritildi"})
		return
	}

	var user models.User
	database.DB.First(&user, userID)

	code, _ := services.GenerateAndSaveOTP(user.NormalizedPhone, "email_link", req.Email)

	c.JSON(http.StatusOK, gin.H{
		"message":   fmt.Sprintf("Tasdiqlash kodi %s manziliga yuborildi", req.Email),
		"demo_code": code,
	})
}

// ConfirmEmailLink confirms email OTP
func ConfirmEmailLink(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req ConfirmEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email va kod majburiy"})
		return
	}

	var user models.User
	database.DB.First(&user, userID)

	ok, err := services.VerifyOTP(user.NormalizedPhone, "email_link", req.Code)
	if !ok || err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	emailStr := req.Email
	database.DB.Model(&user).Updates(map[string]interface{}{
		"email":             &emailStr,
		"email_verified_at": &now,
	})

	c.JSON(http.StatusOK, gin.H{"message": "Emailingiz muvaffaqiyatli tasdiqlandi va hisobingizga ulandi!"})
}
