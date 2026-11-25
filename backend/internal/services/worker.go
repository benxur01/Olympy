package services

import (
	"log"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/middleware"
	"olympy-backend-go/internal/models"
	"time"

	"gorm.io/gorm"
)

// StartBackgroundWorker starts periodic background maintenance routines (replacing Celery & Beat).
func StartBackgroundWorker() {
	go func() {
		log.Println("[Background Worker] started")
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			cleanExpiredSessions()
			checkExpiredSubscriptions()
			middleware.CleanupExpiredRateLimits()
		}
	}()
}

// cleanExpiredSessions closes test sessions that exceeded their cutoff duration.
func cleanExpiredSessions() {
	now := time.Now()
	cutoff := now.Add(-2 * time.Hour)

	res := database.DB.Model(&models.TestSession{}).
		Where("status = ? AND started_at < ?", "active", cutoff).
		Update("status", "completed")
	if res.Error != nil {
		log.Printf("[Worker] cleanExpiredSessions error: %v", res.Error)
		return
	}
	if res.RowsAffected > 0 {
		log.Printf("[Worker] closed %d expired test sessions", res.RowsAffected)
	}
}

// checkExpiredSubscriptions atomically deactivates expired subscriptions and updates is_premium.
func checkExpiredSubscriptions() {
	now := time.Now()
	var expiredSubs []models.UserSubscription
	if err := database.DB.Where("is_active = ? AND end_date < ?", true, now).Find(&expiredSubs).Error; err != nil {
		log.Printf("[Worker] checkExpiredSubscriptions query error: %v", err)
		return
	}
	if len(expiredSubs) == 0 {
		return
	}

	for _, sub := range expiredSubs {
		err := database.DB.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&models.UserSubscription{}).
				Where("id = ?", sub.ID).
				Update("is_active", false).Error; err != nil {
				return err
			}

			var activeCount int64
			if err := tx.Model(&models.UserSubscription{}).
				Where("user_id = ? AND is_active = ? AND end_date > ?", sub.UserID, true, now).
				Count(&activeCount).Error; err != nil {
				return err
			}

			if activeCount == 0 {
				if err := tx.Model(&models.User{}).
					Where("id = ?", sub.UserID).
					Update("is_premium", false).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			log.Printf("[Worker] subscription %d cleanup error: %v", sub.ID, err)
		}
	}
}

// DispatchNotification sends an in-app notification to a user.
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
