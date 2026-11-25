package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
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
		log.Printf("[Telegram Skipped] missing token or chatID")
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
		log.Printf("[Telegram Error] request failed: %v", err)
		return err
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("telegram API status %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.Unmarshal(respBytes, &parsed); err == nil && !parsed.OK {
		return fmt.Errorf("telegram API error: %s", parsed.Description)
	}

	return nil
}
