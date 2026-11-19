package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

func GetMe(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Foydalanuvchi aniqlanmadi"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Foydalanuvchi topilmadi"})
		return
	}

	var memberships []models.CenterMembership
	database.DB.Preload("Center").Where("user_id = ?", user.ID).Find(&memberships)

	c.JSON(http.StatusOK, gin.H{
		"id":                user.ID,
		"full_name":         user.FullName,
		"first_name":        user.FirstName,
		"last_name":         user.LastName,
		"username":          user.Username,
		"phone":             user.Phone,
		"normalized_phone":  user.NormalizedPhone,
		"email":             user.Email,
		"roles":             user.Roles,
		"is_platform_admin": user.IsPlatformAdmin,
		"is_premium":        user.IsPremium,
		"coins":             user.Coins,
		"avatar_url":        user.AvatarURL,
		"memberships":       memberships,
		"created_at":        user.CreatedAt,
	})
}
