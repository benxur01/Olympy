package handlers

import (
	"crypto/subtle"
	"fmt"
	"log"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"
	"os"
	"strings"

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

func verifyTelegramWebhookSecret(c *gin.Context, envKey string) bool {
	secret := strings.TrimSpace(os.Getenv(envKey))
	if secret == "" {
		return gin.Mode() != gin.ReleaseMode
	}
	provided := c.GetHeader("X-Telegram-Bot-Api-Secret-Token")
	return subtle.ConstantTimeCompare([]byte(provided), []byte(secret)) == 1
}

func TelegramAuthWebhook(c *gin.Context) {
	if !verifyTelegramWebhookSecret(c, "TELEGRAM_AUTH_WEBHOOK_SECRET") {
		jsonError(c, http.StatusForbidden, "Invalid webhook secret")
		return
	}

	var update TelegramUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	if update.Message == nil || update.Message.Chat == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	if update.Message.Contact != nil {
		phone := utils.NormalizePhone(update.Message.Contact.PhoneNumber)
		chatID := update.Message.Chat.ID

		log.Printf("[Telegram Auth] Contact shared for chatID %d", chatID)

		var user models.User
		if err := database.DB.Where("normalized_phone = ?", phone).First(&user).Error; err == nil {
			if updateErr := database.DB.Model(&user).Update("telegram_chat_id", fmt.Sprintf("%d", chatID)).Error; updateErr != nil {
				log.Printf("[Telegram Auth] Failed to update chat ID: %v", updateErr)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func TelegramManagerWebhook(c *gin.Context) {
	if !verifyTelegramWebhookSecret(c, "TELEGRAM_MANAGER_WEBHOOK_SECRET") {
		jsonError(c, http.StatusForbidden, "Invalid webhook secret")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": "manager_bot_received"})
}
