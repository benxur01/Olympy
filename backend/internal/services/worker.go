package services

import (
	"log"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"
)

// StartBackgroundWorker starts periodic background maintenance routines (replacing Celery & Beat)
func StartBackgroundWorker() {
	go func() {
		log.Println("⏱ [Background Worker] Asinxron fon xizmati ishga tushdi (Celery o'rniga)...")
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			cleanExpiredSessions()
			checkExpiredSubscriptions()
		}
	}()
}

// cleanExpiredSessions closes test sessions that passed duration
func cleanExpiredSessions() {
	var activeSessions []models.TestSession
	now := time.Now()
	// Find active sessions started more than 2 hours ago
	cutoff := now.Add(-2 * time.Hour)
	err := database.DB.Where("status = 'active' AND started_at < ?", cutoff).Find(&activeSessions).Error
	if err == nil && len(activeSessions) > 0 {
		for _, s := range activeSessions {
			database.DB.Model(&s).Updates(map[string]interface{}{
				"status": "completed",
			})
		}
		log.Printf("🧹 [Worker] %d ta muddati o'tgan imtihon sessiyalari avtomatik yopildi", len(activeSessions))
	}
}

// checkExpiredSubscriptions updates is_premium to false if subscription expired
func checkExpiredSubscriptions() {
	now := time.Now()
	var expiredSubs []models.UserSubscription
	err := database.DB.Where("is_active = true AND end_date < ?", now).Find(&expiredSubs).Error
	if err == nil && len(expiredSubs) > 0 {
		for _, sub := range expiredSubs {
			database.DB.Model(&sub).Update("is_active", false)
			// Check if user has any other active subs
			var activeCount int64
			database.DB.Model(&models.UserSubscription{}).Where("user_id = ? AND is_active = true AND end_date > ?", sub.UserID, now).Count(&activeCount)
			if activeCount == 0 {
				database.DB.Model(&models.User{}).Where("id = ?", sub.UserID).Update("is_premium", false)
			}
		}
		log.Printf("🔒 [Worker] %d ta muddati tugagan obunalar deaktivatsiya qilindi", len(expiredSubs))
	}
}

// DispatchNotification sends in-app notification to a user
func DispatchNotification(userID uint, title, message, nType string) error {
	notif := models.Notification{
		UserID:    userID,
		Title:     title,
		Message:   message,
		Type:      nType,
		IsRead:    false,
		CreatedAt: time.Now(),
	}
	return database.DB.Create(&notif).Error
}
