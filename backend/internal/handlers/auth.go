package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/middleware"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/services"
	"olympy-backend-go/internal/utils"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type RegisterRequest struct {
	FullName    string      `json:"full_name" binding:"required"`
	Phone       string      `json:"phone" binding:"required"`
	Password    string      `json:"password" binding:"required,min=6"`
	Role        string      `json:"role"`
	CenterID    interface{} `json:"center_id"`
	JoinRole    string      `json:"join_role"`
	JoinSubject string      `json:"join_subject"`
}

type RegisterOrganizationRequest struct {
	FullName string `json:"full_name" binding:"required"`
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
	Center   struct {
		Name             string   `json:"name" binding:"required"`
		OrganizationType string   `json:"organization_type"`
		Country          string   `json:"country"`
		Region           string   `json:"region"`
		District         string   `json:"district"`
		City             string   `json:"city"`
		Subjects         []string `json:"subjects"`
	} `json:"center" binding:"required"`
}

type LoginRequest struct {
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required"`
	TOTPCode string `json:"totp_code"`
}

type RefreshTokenRequest struct {
	Refresh string `json:"refresh"`
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
			jsonError(c, http.StatusBadRequest, "Barcha maydonlarni to'g'ri to'ldiring: "+err.Error())
			return
		}

		normPhone := utils.NormalizePhone(req.Phone)
		if normPhone == "" {
			jsonError(c, http.StatusBadRequest, "Telefon raqam formati noto'g'ri (+998901234567)")
			return
		}

		var existingUser models.User
		if err := database.DB.Where("normalized_phone = ?", normPhone).First(&existingUser).Error; err == nil {
			jsonError(c, http.StatusConflict, "Bu telefon raqam avval ro'yxatdan o'tgan")
			return
		}

		hashedPassword, err := utils.HashPassword(req.Password)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Parolni shifrlashda xatolik")
			return
		}

		requestedRole := strings.ToLower(strings.TrimSpace(req.Role))
		if requestedRole == "" {
			requestedRole = "student"
		}
		if requestedRole != "student" && requestedRole != "teacher" && requestedRole != "parent" {
			jsonError(c, http.StatusBadRequest, "Noto'g'ri rol tanlandi")
			return
		}

		// Elevated center roles are only granted upon center approval; unapproved accounts stay student-scoped.
		initialRole := requestedRole
		if initialRole == "teacher" {
			initialRole = "student"
		}

		parts := strings.Fields(strings.TrimSpace(req.FullName))
		firstName := req.FullName
		lastName := ""
		if len(parts) > 1 {
			firstName = parts[0]
			lastName = strings.Join(parts[1:], " ")
		}

		user := models.User{
			FullName:            req.FullName,
			FirstName:           firstName,
			LastName:            lastName,
			Phone:               normPhone,
			NormalizedPhone:     normPhone,
			Password:            hashedPassword,
			Roles:               models.StringArray{initialRole},
			IsActive:            true,
			OnboardingCompleted: true,
			Coins:               50,
		}

		if err := database.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}

			if centerID, ok := parseFlexUint(req.CenterID); ok {
				joinRole := strings.ToLower(strings.TrimSpace(req.JoinRole))
				if joinRole == "" {
					joinRole = requestedRole
				}
				if joinRole != "student" && joinRole != "teacher" {
					joinRole = "student"
				}
				status := "approved"
				if joinRole == "teacher" {
					status = "pending"
				}
				return tx.Create(&models.CenterMembership{
					CenterID: centerID,
					UserID:   user.ID,
					Role:     joinRole,
					Subject:  req.JoinSubject,
					Status:   status,
				}).Error
			}
			return nil
		}); err != nil {
			jsonError(c, http.StatusInternalServerError, "Foydalanuvchini saqlashda xatolik")
			return
		}

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Token generatsiya qilishda xatolik")
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"token":       access,
			"access":      access,
			"refresh":     refresh,
			"cookie_auth": false,
			"user":        SerializeUser(user),
		})
	}
}

func RegisterOrganization(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RegisterOrganizationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			jsonError(c, http.StatusBadRequest, "Tashkilot va foydalanuvchi ma'lumotlarini to'liq kiriting: "+err.Error())
			return
		}

		normPhone := utils.NormalizePhone(req.Phone)
		if normPhone == "" {
			jsonError(c, http.StatusBadRequest, "Telefon raqam formati noto'g'ri (+998901234567)")
			return
		}

		var existingUser models.User
		if err := database.DB.Where("normalized_phone = ?", normPhone).First(&existingUser).Error; err == nil {
			jsonError(c, http.StatusConflict, "Bu telefon raqam avval ro'yxatdan o'tgan")
			return
		}

		hashedPassword, err := utils.HashPassword(req.Password)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Parolni shifrlashda xatolik")
			return
		}

		user := models.User{
			FullName:            req.FullName,
			FirstName:           req.FullName,
			Phone:               normPhone,
			NormalizedPhone:     normPhone,
			Password:            hashedPassword,
			Roles:               models.StringArray{"owner"},
			IsActive:            true,
			OnboardingCompleted: true,
			Coins:               100,
		}
		var center models.EducationCenter
		if err := database.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			center = models.EducationCenter{
				Name:             req.Center.Name,
				Slug:             slugify(req.Center.Name),
				OrganizationType: req.Center.OrganizationType,
				Country:          req.Center.Country,
				Region:           req.Center.Region,
				District:         req.Center.District,
				City:             req.Center.City,
				Subjects:         models.StringArray(req.Center.Subjects),
				OwnerID:          user.ID,
				Status:           "pending",
			}
			if err := tx.Create(&center).Error; err != nil {
				return err
			}
			return tx.Create(&models.CenterMembership{
				CenterID: center.ID,
				UserID:   user.ID,
				Role:     "owner",
				Status:   "pending",
			}).Error
		}); err != nil {
			jsonError(c, http.StatusInternalServerError, "Tashkilotni ro'yxatdan o'tkazishda xatolik")
			return
		}

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Token generatsiya qilishda xatolik")
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"token":       access,
			"access":      access,
			"refresh":     refresh,
			"cookie_auth": false,
			"user":        SerializeUser(user),
			"center":      SerializeCenter(center),
		})
	}
}

func Login(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req LoginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			jsonError(c, http.StatusBadRequest, "Telefon raqam va parolni kiriting")
			return
		}

		normPhone := utils.NormalizePhone(req.Phone)
		if normPhone == "" {
			normPhone = req.Phone
		}

		var user models.User
		if err := database.DB.Where("normalized_phone = ? OR phone = ?", normPhone, req.Phone).First(&user).Error; err != nil {
			middleware.RecordFailedLogin(c.ClientIP())
			jsonError(c, http.StatusUnauthorized, "Telefon raqam yoki parol noto'g'ri")
			return
		}

		if !user.IsActive {
			jsonError(c, http.StatusForbidden, "Hisobingiz vaqtincha bloklangan")
			return
		}

		if !utils.CheckPasswordHash(req.Password, user.Password) {
			middleware.RecordFailedLogin(c.ClientIP())
			jsonError(c, http.StatusUnauthorized, "Telefon raqam yoki parol noto'g'ri")
			return
		}

		if user.TOTPEnabled && user.TOTPSecret != "" {
			if strings.TrimSpace(req.TOTPCode) == "" {
				c.JSON(http.StatusOK, gin.H{
					"requires_2fa": true,
					"message":      "2FA kodini kiriting",
				})
				return
			}
			if !ValidateTOTPCode(user.TOTPSecret, strings.TrimSpace(req.TOTPCode)) {
				c.JSON(http.StatusOK, gin.H{
					"requires_2fa": true,
					"detail":       "Noto'g'ri 2FA kod",
				})
				return
			}
		}

		middleware.ResetFailedLogin(c.ClientIP())

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Token generatsiya qilishda xatolik")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":       access,
			"access":      access,
			"refresh":     refresh,
			"cookie_auth": false,
			"user":        SerializeUser(user),
		})
	}
}

func RefreshToken(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req RefreshTokenRequest
		_ = c.ShouldBindJSON(&req)

		rawRefresh := strings.TrimSpace(req.Refresh)
		if rawRefresh == "" {
			jsonError(c, http.StatusUnauthorized, "Refresh token talab qilinadi")
			return
		}

		claims, err := utils.ValidateToken(rawRefresh, cfg.JWTSecret)
		if err != nil || claims.UserID == 0 || (claims.TokenType != "" && claims.TokenType != "refresh") {
			jsonError(c, http.StatusUnauthorized, "Refresh token yaroqsiz yoki muddati tugagan")
			return
		}

		var user models.User
		if err := database.DB.First(&user, claims.UserID).Error; err != nil {
			jsonError(c, http.StatusUnauthorized, "Foydalanuvchi topilmadi")
			return
		}
		if !user.IsActive {
			jsonError(c, http.StatusForbidden, "Hisobingiz vaqtincha bloklangan")
			return
		}

		access, refresh, err := utils.GenerateTokens(user.ID, user.Phone, user.Roles, user.IsPlatformAdmin, cfg.JWTSecret)
		if err != nil {
			jsonError(c, http.StatusInternalServerError, "Token yangilashda xatolik")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":       access,
			"access":      access,
			"refresh":     refresh,
			"cookie_auth": false,
		})
	}
}

func Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"detail": "Tizimdan chiqildi", "status": "ok"})
}

// StartPhoneTelegramVerification starts phone verification OTP
func StartPhoneTelegramVerification(c *gin.Context) {
	var req StartPhoneOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Telefon raqam kiritilishi shart")
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	if normPhone == "" {
		jsonError(c, http.StatusBadRequest, "Telefon raqam formati noto'g'ri")
		return
	}

	_, err := services.GenerateAndSaveOTP(normPhone, "phone_verify", "")
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "OTP generatsiyasida xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Tasdiqlash kodi Telegram botingizga yuborildi",
		"phone":   normPhone,
	})
}

// VerifyPhoneOTP verifies OTP code
func VerifyPhoneOTP(c *gin.Context) {
	var req VerifyPhoneOTPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Telefon va kod kiritilishi shart")
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	ok, err := services.VerifyOTP(normPhone, "phone_verify", req.Code)
	if !ok || err != nil {
		msg := "Kod noto'g'ri"
		if err != nil {
			msg = err.Error()
		}
		jsonError(c, http.StatusBadRequest, msg)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "Telefon raqamingiz muvaffaqiyatli tasdiqlandi!",
		"verified": true,
		"phone":    normPhone,
	})
}

// StartPasswordReset sends OTP for resetting password
func StartPasswordReset(c *gin.Context) {
	var req StartPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Telefon raqam majburiy")
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	var user models.User
	if err := database.DB.Where("normalized_phone = ?", normPhone).First(&user).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Bunday telefon raqamli foydalanuvchi topilmadi")
		return
	}

	_, err := services.GenerateAndSaveOTP(normPhone, "password_reset", "")
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "OTP yaratishda xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Parolni tiklash kodi Telegram botingizga yuborildi",
		"phone":   normPhone,
	})
}

// ConfirmPasswordReset verifies OTP and sets new password
func ConfirmPasswordReset(c *gin.Context) {
	var req ConfirmPasswordResetRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Barcha maydonlarni to'ldiring")
		return
	}

	normPhone := utils.NormalizePhone(req.Phone)
	ok, err := services.VerifyOTP(normPhone, "password_reset", req.Code)
	if !ok || err != nil {
		msg := "Kod noto'g'ri"
		if err != nil {
			msg = err.Error()
		}
		jsonError(c, http.StatusBadRequest, msg)
		return
	}

	hashed, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "Parolni shifrlashda xatolik")
		return
	}

	if err := database.DB.Model(&models.User{}).Where("normalized_phone = ?", normPhone).Update("password", hashed).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Parolni yangilashda xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Parolingiz muvaffaqiyatli yangilandi! Yangi parol bilan kirishingiz mumkin."})
}

// StartEmailLink links email with OTP
func StartEmailLink(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req LinkEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Email noto'g'ri kiritildi")
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	if _, err := services.GenerateAndSaveOTP(user.NormalizedPhone, "email_link", req.Email); err != nil {
		jsonError(c, http.StatusInternalServerError, "OTP yaratishda xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Tasdiqlash kodi %s manziliga yuborildi", req.Email),
	})
}

// ConfirmEmailLink confirms email OTP
func ConfirmEmailLink(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req ConfirmEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Email va kod majburiy")
		return
	}

	var user models.User
	database.DB.First(&user, userID)

	ok, err := services.VerifyOTP(user.NormalizedPhone, "email_link", req.Code)
	if !ok || err != nil {
		msg := "Kod noto'g'ri"
		if err != nil {
			msg = err.Error()
		}
		jsonError(c, http.StatusBadRequest, msg)
		return
	}

	emailStr := req.Email
	database.DB.Model(&user).Updates(map[string]interface{}{
		"email":          &emailStr,
		"email_verified": true,
	})
	database.DB.First(&user, userID)

	c.JSON(http.StatusOK, gin.H{
		"message": "Emailingiz muvaffaqiyatli tasdiqlandi va hisobingizga ulandi!",
		"user":    SerializeUser(user),
	})
}
