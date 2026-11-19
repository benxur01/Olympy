package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// StringArray custom type for JSON field in SQLite/Postgres
type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "[]", nil
	}
	return json.Marshal(a)
}

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = []string{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		str, ok := value.(string)
		if !ok {
			return errors.New("cannot scan type into StringArray")
		}
		bytes = []byte(str)
	}
	return json.Unmarshal(bytes, a)
}

// User model matching Django accounts.User
type User struct {
	ID                uint        `gorm:"primaryKey" json:"id"`
	FullName          string      `gorm:"size:120;not null" json:"full_name"`
	FirstName         string      `gorm:"size:60" json:"first_name"`
	LastName          string      `gorm:"size:60" json:"last_name"`
	Username          *string     `gorm:"size:32;uniqueIndex" json:"username,omitempty"`
	Phone             string      `gorm:"size:20;uniqueIndex;not null" json:"phone"`
	NormalizedPhone   string      `gorm:"size:20;uniqueIndex;not null" json:"normalized_phone"`
	Email             *string     `gorm:"size:254;uniqueIndex" json:"email,omitempty"`
	Password          string      `gorm:"size:255;not null" json:"-"`
	Roles             StringArray `gorm:"type:text" json:"roles"`
	IsPlatformAdmin   bool        `gorm:"default:false" json:"is_platform_admin"`
	IsPremium         bool        `gorm:"default:false" json:"is_premium"`
	Coins             int         `gorm:"default:0" json:"coins"`
	AvatarURL         string      `gorm:"size:500" json:"avatar_url"`
	TelegramChatID    string      `gorm:"size:64" json:"telegram_chat_id,omitempty"`
	CreatedAt         time.Time   `json:"created_at"`
	UpdatedAt         time.Time   `json:"updated_at"`
}

// EducationCenter matching centers.EducationCenter
type EducationCenter struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Name        string    `gorm:"size:120;not null" json:"name"`
	Slug        string    `gorm:"size:120;uniqueIndex" json:"slug"`
	Description string    `gorm:"type:text" json:"description"`
	Address     string    `gorm:"size:255" json:"address"`
	Phone       string    `gorm:"size:20" json:"phone"`
	OwnerID     uint      `gorm:"not null" json:"owner_id"`
	Owner       User      `gorm:"foreignKey:OwnerID" json:"owner,omitempty"`
	Status      string    `gorm:"size:20;default:'pending'" json:"status"` // pending, approved, rejected
	IsPremium   bool      `gorm:"default:false" json:"is_premium"`
	LogoURL     string    `gorm:"size:500" json:"logo_url"`
	Rating      float64   `gorm:"default:5.0" json:"rating"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// CenterMembership matching centers.CenterMembership
type CenterMembership struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	CenterID  uint            `gorm:"not null;uniqueIndex:idx_center_user" json:"center_id"`
	Center    EducationCenter `gorm:"foreignKey:CenterID" json:"center,omitempty"`
	UserID    uint            `gorm:"not null;uniqueIndex:idx_center_user" json:"user_id"`
	User      User            `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Role      string          `gorm:"size:20;not null" json:"role"` // student, teacher, manager
	Status    string          `gorm:"size:20;default:'pending'" json:"status"` // pending, approved, rejected
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// Subject matching olympiads.Subject
type Subject struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Name string `gorm:"size:100;not null" json:"name"`
	Slug string `gorm:"size:100;uniqueIndex" json:"slug"`
	Icon string `gorm:"size:100" json:"icon"`
}

// Olympiad matching olympiads.Olympiad
type Olympiad struct {
	ID              uint             `gorm:"primaryKey" json:"id"`
	Title           string           `gorm:"size:200;not null" json:"title"`
	Description     string           `gorm:"type:text" json:"description"`
	CenterID        *uint            `json:"center_id,omitempty"`
	Center          *EducationCenter `gorm:"foreignKey:CenterID" json:"center,omitempty"`
	SubjectID       *uint            `json:"subject_id,omitempty"`
	Subject         *Subject         `gorm:"foreignKey:SubjectID" json:"subject,omitempty"`
	DurationMinutes int              `gorm:"default:60" json:"duration_minutes"`
	PassingScore    int              `gorm:"default:60" json:"passing_score"`
	MaxScore        int              `gorm:"default:100" json:"max_score"`
	Status          string           `gorm:"size:20;default:'published'" json:"status"` // draft, published, finished
	IsPublic        bool             `gorm:"default:true" json:"is_public"`
	StartTime       *time.Time       `json:"start_time,omitempty"`
	EndTime         *time.Time       `json:"end_time,omitempty"`
	Questions       []Question       `gorm:"foreignKey:OlympiadID" json:"questions,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

// Question matching questions.Question
type Question struct {
	ID            uint        `gorm:"primaryKey" json:"id"`
	OlympiadID    *uint       `json:"olympiad_id,omitempty"`
	CenterID      *uint       `json:"center_id,omitempty"`
	Text          string      `gorm:"type:text;not null" json:"text"`
	QuestionType  string      `gorm:"size:30;default:'single'" json:"question_type"` // single, multiple, text, code
	OptionsJSON   StringArray `gorm:"type:text" json:"options"`                      // ["A", "B", "C", "D"]
	CorrectAnswer string      `gorm:"size:255;not null" json:"correct_answer,omitempty"`
	Points        int         `gorm:"default:5" json:"points"`
	Order         int         `gorm:"default:0" json:"order"`
	Explanation   string      `gorm:"type:text" json:"explanation,omitempty"`
	CreatedAt     time.Time   `json:"created_at"`
}

// TestAttempt matching attempts.TestAttempt
type TestAttempt struct {
	ID              uint         `gorm:"primaryKey" json:"id"`
	UserID          uint         `gorm:"not null" json:"user_id"`
	User            User         `gorm:"foreignKey:UserID" json:"user,omitempty"`
	OlympiadID      uint         `gorm:"not null" json:"olympiad_id"`
	Olympiad        Olympiad     `gorm:"foreignKey:OlympiadID" json:"olympiad,omitempty"`
	Status          string       `gorm:"size:20;default:'in_progress'" json:"status"` // in_progress, submitted, expired
	Score           int          `gorm:"default:0" json:"score"`
	MaxScore        int          `gorm:"default:100" json:"max_score"`
	Percentage      float64      `gorm:"default:0" json:"percentage"`
	IsPassed        bool         `gorm:"default:false" json:"is_passed"`
	StartedAt       time.Time    `json:"started_at"`
	SubmittedAt     *time.Time   `json:"submitted_at,omitempty"`
	TimeSpentSeconds int         `gorm:"default:0" json:"time_spent_seconds"`
	Answers         []TestAnswer `gorm:"foreignKey:AttemptID" json:"answers,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
}

// TestAnswer detail for an attempt
type TestAnswer struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AttemptID      uint      `gorm:"not null" json:"attempt_id"`
	QuestionID     uint      `gorm:"not null" json:"question_id"`
	Question       Question  `gorm:"foreignKey:QuestionID" json:"question,omitempty"`
	SelectedAnswer string    `gorm:"size:255" json:"selected_answer"`
	IsCorrect      bool      `gorm:"default:false" json:"is_correct"`
	PointsEarned   int       `gorm:"default:0" json:"points_earned"`
	CreatedAt      time.Time `json:"created_at"`
}

// Notification matching notifications.Notification
type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null" json:"user_id"`
	Title     string    `gorm:"size:200;not null" json:"title"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Type      string    `gorm:"size:50;default:'info'" json:"type"`
	IsRead    bool      `gorm:"default:false" json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}
