package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

func ListNotifications(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var notifs []models.Notification
	database.DB.Where("user_id = ?", userID).Order("id DESC").Limit(30).Find(&notifs)

	c.JSON(http.StatusOK, notifs)
}

func MarkNotificationRead(c *gin.Context) {
	id := c.Param("id")
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	database.DB.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("is_read", true)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func MarkAllNotificationsRead(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	database.DB.Model(&models.Notification{}).Where("user_id = ?", userID).Update("is_read", true)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
