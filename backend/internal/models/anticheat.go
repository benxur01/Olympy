package models

import (
	"time"
)

// TestSession real-time session tracking, randomized orders, anti-cheat status
type TestSession struct {
	ID                     uint        `gorm:"primaryKey" json:"id"`
	UserID                 uint        `gorm:"not null;uniqueIndex:idx_session_user_olympiad" json:"user_id"`
	User                   User        `gorm:"foreignKey:UserID" json:"user,omitempty"`
	OlympiadID             uint        `gorm:"not null;uniqueIndex:idx_session_user_olympiad" json:"olympiad_id"`
	Olympiad               Olympiad    `gorm:"foreignKey:OlympiadID" json:"olympiad,omitempty"`
	Status                 string      `gorm:"size:30;default:'active'" json:"status"` // active, pending_review, disqualified, completed, removed
	CheatingReason         string      `gorm:"size:255" json:"cheating_reason"`
	QuestionOrder          StringArray `gorm:"type:text" json:"question_order"`
	LastDeviceID           string      `gorm:"size:64" json:"last_device_id"`
	LastPingAt             *time.Time  `json:"last_ping_at"`
	PausedSeconds          int         `gorm:"default:0" json:"paused_seconds"`
	CameraConsentGiven     bool        `gorm:"default:false" json:"camera_consent_given"`
	MicrophoneConsentGiven bool        `gorm:"default:false" json:"microphone_consent_given"`
	StartedAt              time.Time   `json:"started_at"`
	DisqualifiedAt         *time.Time  `json:"disqualified_at,omitempty"`
}

// EvidenceSnapshot anti-cheat webcam / screen capture frame
type EvidenceSnapshot struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	SessionID   uint      `gorm:"not null;index" json:"session_id"`
	Reason      string    `gorm:"size:120;not null" json:"reason"` // tab_switch, multiple_faces, no_face, audio_detected
	Confidence  float64   `gorm:"default:1.0" json:"confidence"`
	ImageURL    string    `gorm:"size:500" json:"image_url"`
	Metadata    string    `gorm:"type:text" json:"metadata"` // JSON with audio level, coordinates, etc.
	CreatedAt   time.Time `gorm:"index" json:"created_at"`
}

// CodeSubmission Judge0 submission for programming questions
type CodeSubmission struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	AttemptID    uint      `gorm:"not null;index" json:"attempt_id"`
	QuestionID   uint      `gorm:"not null" json:"question_id"`
	LanguageID   int       `gorm:"not null" json:"language_id"` // Judge0 language ID
	SourceCode   string    `gorm:"type:text;not null" json:"source_code"`
	Status       string    `gorm:"size:50;default:'pending'" json:"status"` // Accepted, Wrong Answer, Time Limit Exceeded...
	ExecutionTime float64   `json:"execution_time"`
	MemoryUsed   int       `json:"memory_used"`
	Output       string    `gorm:"type:text" json:"output"`
	CreatedAt    time.Time `json:"created_at"`
}

// EssayGrade AI grading of essay submissions
type EssayGrade struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	AttemptID  uint      `gorm:"not null;index" json:"attempt_id"`
	QuestionID uint      `gorm:"not null" json:"question_id"`
	Text       string    `gorm:"type:text;not null" json:"text"`
	Score      int       `json:"score"`
	Feedback   string    `gorm:"type:text" json:"feedback"`
	GradedByAI bool      `gorm:"default:true" json:"graded_by_ai"`
	CreatedAt  time.Time `json:"created_at"`
}

// SpeakingAnswer audio upload for IELTS/CEFR speaking tests
type SpeakingAnswer struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	AttemptID  uint      `gorm:"not null;index" json:"attempt_id"`
	QuestionID uint      `gorm:"not null" json:"question_id"`
	AudioURL   string    `gorm:"size:500;not null" json:"audio_url"`
	Duration   int       `json:"duration"` // seconds
	Score      float64   `json:"score"`
	Feedback   string    `gorm:"type:text" json:"feedback"`
	CreatedAt  time.Time `json:"created_at"`
}
