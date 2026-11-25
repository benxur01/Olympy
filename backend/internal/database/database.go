package database

import (
	"log"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/models"
	"os"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// MigrateSchema runs GORM auto-migrations for all platform models.
func MigrateSchema(db *gorm.DB) error {
	return db.AutoMigrate(
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
		&models.OTPVerification{},
	)
}

// InitTestDB initializes an isolated SQLite database for automated tests.
func InitTestDB(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, err
	}
	if err := MigrateSchema(db); err != nil {
		return nil, err
	}
	DB = db
	return db, nil
}

func InitDB(cfg *config.Config) *gorm.DB {
	dbPath := cfg.DBName
	if dbPath == "" {
		dbPath = "olympy.db"
	}

	logLevel := logger.Info
	if os.Getenv("GIN_MODE") == "release" {
		logLevel = logger.Warn
	}

	var err error
	DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("Failed to connect database: %v", err)
	}

	log.Println("Migrating database models...")
	if err := MigrateSchema(DB); err != nil {
		log.Fatalf("Database auto-migration failed: %v", err)
	}

	log.Println("Database models migrated successfully!")
	SeedDatabase(DB)

	return DB
}
