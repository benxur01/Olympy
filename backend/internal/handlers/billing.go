package handlers

import (
	"errors"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SubscribeRequest struct {
	PlanID   uint   `json:"plan_id" binding:"required"`
	Provider string `json:"provider"` // click, payme
}

type PromoCodeRequest struct {
	Code string `json:"code" binding:"required"`
}

func ListPlans(c *gin.Context) {
	var plans []models.SubscriptionPlan
	if err := database.DB.Where("is_active = ?", true).Find(&plans).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Tariflarni yuklashda xatolik")
		return
	}
	c.JSON(http.StatusOK, plans)
}

func CreateSubscription(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req SubscribeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Plan tanlanishi shart")
		return
	}

	var plan models.SubscriptionPlan
	if err := database.DB.Where("id = ? AND is_active = ?", req.PlanID, true).First(&plan).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Obuna rejasi topilmadi")
		return
	}

	provider := req.Provider
	if provider == "" {
		provider = "payme"
	}

	now := time.Now()
	endDate := now.AddDate(0, 0, plan.DurationDays)
	sub := models.UserSubscription{
		UserID:    userID,
		PlanID:    &plan.ID,
		StartDate: now,
		EndDate:   endDate,
		IsActive:  true,
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&sub).Error; err != nil {
			return err
		}
		if err := tx.Model(&models.User{}).Where("id = ?", userID).Update("is_premium", true).Error; err != nil {
			return err
		}
		paymentTx := models.PaymentTransaction{
			UserID:                &userID,
			PlanID:                &plan.ID,
			Amount:                plan.Price,
			Provider:              provider,
			Status:                "success",
			ProviderTransactionID: "tx_" + uuid.NewString(),
		}
		return tx.Create(&paymentTx).Error
	})
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "Obunani rasmiylashtirishda xatolik")
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":      "Obuna muvaffaqiyatli faollashtirildi!",
		"subscription": sub,
		"plan":         plan,
	})
}

func ApplyPromoCode(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req PromoCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Promokodni kiriting")
		return
	}

	var promo models.PromoCode
	if err := database.DB.Where("code = ? AND is_active = ?", req.Code, true).First(&promo).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Promokod mavjud emas yoki muddati o'tgan")
		return
	}

	if promo.ExpiresAt != nil && promo.ExpiresAt.Before(time.Now()) {
		jsonError(c, http.StatusBadRequest, "Promokod muddati tugagan")
		return
	}

	errLimitReached := errors.New("promo limit reached")
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&models.PromoCode{}).
			Where("id = ? AND used_count < max_uses", promo.ID).
			Update("used_count", gorm.Expr("used_count + 1"))
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return errLimitReached
		}

		if promo.FreeTrialDays > 0 {
			if err := tx.Model(&models.User{}).Where("id = ?", userID).Update("is_premium", true).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, errLimitReached) {
			jsonError(c, http.StatusBadRequest, "Promokod limiti tugagan")
			return
		}
		jsonError(c, http.StatusInternalServerError, "Promokodni qo'llashda xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "Promokod muvaffaqiyatli qo'llanildi!",
		"discount_percent": promo.DiscountPercent,
		"free_trial_days":  promo.FreeTrialDays,
	})
}
