package models

import (
	"time"
)

// RewardProduct for student coin shop
type RewardProduct struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Title       string    `gorm:"size:200;not null" json:"title"`
	Description string    `gorm:"type:text" json:"description"`
	CostCoins   int       `gorm:"not null" json:"cost_coins"`
	ImageURL    string    `gorm:"size:500" json:"image_url"`
	Stock       int       `gorm:"default:10" json:"stock"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
}

// RewardRedemption when student redeems coins for a product
type RewardRedemption struct {
	ID        uint          `gorm:"primaryKey" json:"id"`
	UserID    uint          `gorm:"not null" json:"user_id"`
	User      User          `gorm:"foreignKey:UserID" json:"user,omitempty"`
	ProductID uint          `gorm:"not null" json:"product_id"`
	Product   RewardProduct `gorm:"foreignKey:ProductID" json:"product,omitempty"`
	CostCoins int           `gorm:"not null" json:"cost_coins"`
	Status    string        `gorm:"size:20;default:'pending'" json:"status"` // pending, approved, delivered, rejected
	CreatedAt time.Time     `json:"created_at"`
}

// CoinTransaction audit log of all coin additions and spendings
type CoinTransaction struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"not null;index" json:"user_id"`
	Amount      int       `gorm:"not null" json:"amount"` // +20, -50, etc.
	Balance     int       `gorm:"not null" json:"balance"`
	Reason      string    `gorm:"size:255;not null" json:"reason"`
	ReferenceID string    `gorm:"size:100" json:"reference_id,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// DailyGoal tracking daily target questions
type DailyGoal struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"not null;uniqueIndex:idx_user_date" json:"user_id"`
	Date           string    `gorm:"size:10;uniqueIndex:idx_user_date" json:"date"` // YYYY-MM-DD
	TargetCount    int       `gorm:"default:10" json:"target_count"`
	CompletedCount int       `gorm:"default:0" json:"completed_count"`
	IsAchieved     bool      `gorm:"default:false" json:"is_achieved"`
	CreatedAt      time.Time `json:"created_at"`
}

// DailyQuestion one platform-wide question of the day
type DailyQuestion struct {
	ID            uint        `gorm:"primaryKey" json:"id"`
	Date          string      `gorm:"size:10;uniqueIndex" json:"date"` // YYYY-MM-DD
	SubjectID     uint        `json:"subject_id"`
	Text          string      `gorm:"type:text;not null" json:"text"`
	OptionsJSON   StringArray `gorm:"type:text" json:"options"`
	CorrectAnswer string      `gorm:"size:255;not null" json:"correct_answer"`
	Points        int         `gorm:"default:10" json:"points"`
	Explanation   string      `gorm:"type:text" json:"explanation"`
	CreatedAt     time.Time   `json:"created_at"`
}

// DailyQuestionAnswer student answer to daily question
type DailyQuestionAnswer struct {
	ID              uint          `gorm:"primaryKey" json:"id"`
	UserID          uint          `gorm:"not null;uniqueIndex:idx_user_daily_q" json:"user_id"`
	DailyQuestionID uint          `gorm:"not null;uniqueIndex:idx_user_daily_q" json:"daily_question_id"`
	SelectedAnswer  string        `gorm:"size:255" json:"selected_answer"`
	IsCorrect       bool          `gorm:"default:false" json:"is_correct"`
	CreatedAt       time.Time     `json:"created_at"`
}

// WeeklyContest weekly ranking tournament
type WeeklyContest struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Title     string    `gorm:"size:200;not null" json:"title"`
	StartDate time.Time `json:"start_date"`
	EndDate   time.Time `json:"end_date"`
	IsActive  bool      `gorm:"default:true" json:"is_active"`
}

// WeeklyContestResult results of weekly contests
type WeeklyContestResult struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	ContestID uint      `gorm:"not null" json:"contest_id"`
	UserID    uint      `gorm:"not null" json:"user_id"`
	Rank      int       `json:"rank"`
	Score     int       `json:"score"`
	Prize     string    `gorm:"size:100" json:"prize"`
}
