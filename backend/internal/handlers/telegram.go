package handlers

import (
	"fmt"
	"log"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"

	"github.com/gin-gonic/gin"
)

type TelegramUpdate struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		MessageID int `json:"message_id"`
		From      *struct {
			ID        int64  `json:"id"`
			FirstName string `json:"first_name"`
			Username  string `json:"username"`
		} `json:"from"`
		Chat *struct {
			ID   int64  `json:"id"`
			Type string `json:"type"`
		} `json:"chat"`
		Text    string `json:"text"`
		Contact *struct {
			PhoneNumber string `json:"phone_number"`
			FirstName   string `json:"first_name"`
			UserID      int64  `json:"user_id"`
		} `json:"contact"`
	} `json:"message"`
}

func TelegramAuthWebhook(c *gin.Context) {
	var update TelegramUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	if update.Message == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	// If user shares contact
	if update.Message.Contact != nil {
		phone := utils.NormalizePhone(update.Message.Contact.PhoneNumber)
		chatID := update.Message.Chat.ID

		log.Printf("[Telegram Auth] User shared phone: %s (chatID: %d)", phone, chatID)

		// Link telegram chat ID with user
		var user models.User
		if err := database.DB.Where("normalized_phone = ?", phone).First(&user).Error; err == nil {
			database.DB.Model(&user).Update("telegram_chat_id", fmt.Sprintf("%d", chatID))
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func TelegramManagerWebhook(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": "manager_bot_received"})
}
