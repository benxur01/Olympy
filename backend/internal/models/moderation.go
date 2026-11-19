package models

import (
	"time"
)

// ModerationFlag administrative queue item
type ModerationFlag struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	FlagType       string    `gorm:"size:30;not null;index" json:"flag_type"` // question, olympiad, suspicious_ip, appeal
	TargetType     string    `gorm:"size:50" json:"target_type"`
	TargetID       *uint     `json:"target_id"`
	Reason         string    `gorm:"size:255;not null" json:"reason"`
	RaisedByID     *uint     `json:"raised_by_id"`
	Status         string    `gorm:"size:20;default:'pending';index" json:"status"` // pending, resolved, dismissed
	ResolvedByID   *uint     `json:"resolved_by_id"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	ResolutionNote string    `gorm:"size:255" json:"resolution_note"`
	CreatedAt      time.Time `gorm:"index" json:"created_at"`
}

// BlockedIP blacklisted IP addresses
type BlockedIP struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	IPAddress string    `gorm:"size:60;uniqueIndex;not null" json:"ip_address"`
	Reason    string    `gorm:"size:255" json:"reason"`
	BlockedBy *uint     `json:"blocked_by"`
	CreatedAt time.Time `json:"created_at"`
}

// AuditLog security and operations log
type AuditLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	ActorID    *uint     `json:"actor_id"`
	Action     string    `gorm:"size:100;not null" json:"action"`
	TargetType string    `gorm:"size:50" json:"target_type"`
	TargetID   *uint     `json:"target_id"`
	IPAddress  string    `gorm:"size:60" json:"ip_address"`
	Details    string    `gorm:"type:text" json:"details"`
	CreatedAt  time.Time `gorm:"index" json:"created_at"`
}

// SupportMessage chat messages between user and support/AI
type SupportMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"user_id"`
	Sender    string    `gorm:"size:20;not null" json:"sender"` // user, support, ai
	Message   string    `gorm:"type:text;not null" json:"message"`
	IsRead    bool      `gorm:"default:false" json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}
