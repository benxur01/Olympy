package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

type TelegramSendMessagePayload struct {
	ChatID    string `json:"chat_id"`
	Text      string `json:"text"`
	ParseMode string `json:"parse_mode"`
}

// SendTelegramMessage sends a message to user via Telegram Bot API
func SendTelegramMessage(chatID string, text string) error {
	token := os.Getenv("TELEGRAM_MANAGER_BOT_TOKEN")
	if token == "" {
		token = os.Getenv("TELEGRAM_AUTH_BOT_TOKEN")
	}

	if token == "" || chatID == "" {
		log.Printf("[Telegram Mock] ChatID: %s | Xabar: %s", chatID, text)
		return nil
	}

	apiURL := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := TelegramSendMessagePayload{
		ChatID:    chatID,
		Text:      text,
		ParseMode: "HTML",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(apiURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("[Telegram Error] Xabar yuborishda xatolik: %v", err)
		return err
	}
	defer resp.Body.Close()

	return nil
}
