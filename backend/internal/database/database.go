package database

import (
	"log"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB(cfg *config.Config) *gorm.DB {
	var err error

	dbPath := cfg.DBName
	if dbPath == "" {
		dbPath = "olympy.db"
	}

	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	log.Println("Migrating database models (full Olympy schema)...")
	err = DB.AutoMigrate(
		// Core
		&models.User{},
		&models.EducationCenter{},
		&models.CenterMembership{},
		&models.Subject{},
		&models.Olympiad{},
		&models.Question{},
		&models.TestAttempt{},
		&models.TestAnswer{},
		&models.Notification{},
		// Gamification
		&models.RewardProduct{},
		&models.RewardRedemption{},
		&models.CoinTransaction{},
		&models.DailyGoal{},
		&models.DailyQuestion{},
		&models.DailyQuestionAnswer{},
		&models.WeeklyContest{},
		&models.WeeklyContestResult{},
		// Billing
		&models.SubscriptionPlan{},
		&models.UserSubscription{},
		&models.PaymentTransaction{},
		&models.PromoCode{},
		// Moderation & Audit
		&models.ModerationFlag{},
		&models.BlockedIP{},
		&models.AuditLog{},
		&models.SupportMessage{},
		// Anti-cheat & Multimodal testing
		&models.TestSession{},
		&models.EvidenceSnapshot{},
		&models.CodeSubmission{},
		&models.EssayGrade{},
		&models.SpeakingAnswer{},
	)
	if err != nil {
		log.Fatalf("Database auto-migration failed: %v", err)
	}

	log.Println("All 25+ database models migrated successfully!")
	SeedDatabase(DB)

	return DB
}
