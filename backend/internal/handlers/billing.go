package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
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
	database.DB.Where("is_active = ?", true).Find(&plans)
	c.JSON(http.StatusOK, plans)
}

func CreateSubscription(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req SubscribeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Plan tanlanishi shart"})
		return
	}

	var plan models.SubscriptionPlan
	if err := database.DB.First(&plan, req.PlanID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Obuna rejasi topilmadi"})
		return
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
	database.DB.Create(&sub)

	// Update user is_premium
	database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_premium", true)

	// Record payment transaction
	provider := req.Provider
	if provider == "" {
		provider = "payme"
	}
	tx := models.PaymentTransaction{
		UserID:                &userID,
		PlanID:                &plan.ID,
		Amount:                plan.Price,
		Provider:              provider,
		Status:                "success",
		ProviderTransactionID: fmt.Sprintf("tx_%d_%d", userID, time.Now().Unix()),
	}
	database.DB.Create(&tx)

	c.JSON(http.StatusCreated, gin.H{
		"message":      "Obuna muvaffaqiyatli faollashtirildi!",
		"subscription": sub,
		"plan":         plan,
	})
}

func ApplyPromoCode(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req PromoCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Promokodni kiriting"})
		return
	}

	var promo models.PromoCode
	if err := database.DB.Where("code = ? AND is_active = ?", req.Code, true).First(&promo).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Promokod mavjud emas yoki muddati o'tgan"})
		return
	}

	if promo.ExpiresAt != nil && promo.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Promokod muddati tugagan"})
		return
	}

	if promo.UsedCount >= promo.MaxUses {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Promokod limiti tugagan"})
		return
	}

	// Apply trial days if promo has trial
	if promo.FreeTrialDays > 0 {
		database.DB.Model(&models.User{}).Where("id = ?", userID).Update("is_premium", true)
	}

	// Increment usage
	database.DB.Model(&promo).Update("used_count", promo.UsedCount+1)

	c.JSON(http.StatusOK, gin.H{
		"message":          "Promokod muvaffaqiyatli qo'llanildi!",
		"discount_percent": promo.DiscountPercent,
		"free_trial_days":  promo.FreeTrialDays,
	})
}
