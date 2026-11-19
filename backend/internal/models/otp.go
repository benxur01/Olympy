package models

import (
	"time"
)

// OTPVerification stores one-time passwords for Telegram phone verification & password reset
type OTPVerification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Phone     string    `gorm:"size:20;index;not null" json:"phone"`
	Code      string    `gorm:"size:10;not null" json:"code"`
	Purpose   string    `gorm:"size:30;not null" json:"purpose"` // phone_verify, password_reset, email_link
	Email     string    `gorm:"size:254" json:"email,omitempty"`
	Attempts  int       `gorm:"default:0" json:"attempts"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	ExpiresAt time.Time `gorm:"index" json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}
