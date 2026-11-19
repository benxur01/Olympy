package models

import (
	"time"
)

// SubscriptionPlan organization or student plan
type SubscriptionPlan struct {
	ID                       uint        `gorm:"primaryKey" json:"id"`
	Name                     string      `gorm:"size:100;not null" json:"name"`
	PlanType                 string      `gorm:"size:20;default:'student'" json:"plan_type"` // student, organization
	Price                    float64     `gorm:"not null" json:"price"`
	DurationDays             int         `gorm:"default:30" json:"duration_days"`
	Description              string      `gorm:"size:255" json:"description"`
	Features                 StringArray `gorm:"type:text" json:"features"`
	MaxStudents              int         `gorm:"default:0" json:"max_students"` // 0 = unlimited
	MaxTeachers              int         `gorm:"default:0" json:"max_teachers"`
	MaxOlympiadsMonthly      int         `gorm:"default:0" json:"max_olympiads_monthly"`
	MaxAiGenerationsMonthly int         `gorm:"default:0" json:"max_ai_generations_monthly"`
	IsPopular                bool        `gorm:"default:false" json:"is_popular"`
	IsActive                 bool        `gorm:"default:true" json:"is_active"`
	CreatedAt                time.Time   `json:"created_at"`
}

// UserSubscription user active subscriptions
type UserSubscription struct {
	ID        uint              `gorm:"primaryKey" json:"id"`
	UserID    uint              `gorm:"not null;index" json:"user_id"`
	User      User              `gorm:"foreignKey:UserID" json:"user,omitempty"`
	PlanID    *uint             `json:"plan_id"`
	Plan      *SubscriptionPlan `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	StartDate time.Time         `json:"start_date"`
	EndDate   time.Time         `gorm:"index" json:"end_date"`
	IsActive  bool              `gorm:"default:true;index" json:"is_active"`
	CreatedAt time.Time         `json:"created_at"`
}

// PaymentTransaction transactions from Click / Payme
type PaymentTransaction struct {
	ID                    uint              `gorm:"primaryKey" json:"id"`
	UserID                *uint             `gorm:"index" json:"user_id"`
	PlanID                *uint             `json:"plan_id"`
	Plan                  *SubscriptionPlan `gorm:"foreignKey:PlanID" json:"plan,omitempty"`
	Amount                float64           `gorm:"not null" json:"amount"`
	Provider              string            `gorm:"size:50;not null" json:"provider"` // click, payme
	Status                string            `gorm:"size:20;default:'pending';index" json:"status"` // pending, success, failed, cancelled
	ProviderTransactionID string            `gorm:"size:255;uniqueIndex" json:"provider_transaction_id"`
	FailureReason         string            `gorm:"type:text" json:"failure_reason"`
	CreatedAt             time.Time         `gorm:"index" json:"created_at"`
	UpdatedAt             time.Time         `json:"updated_at"`
}

// PromoCode discount or trial code
type PromoCode struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	Code            string     `gorm:"size:50;uniqueIndex;not null" json:"code"`
	DiscountPercent int        `gorm:"default:0" json:"discount_percent"`
	FreeTrialDays   int        `gorm:"default:0" json:"free_trial_days"`
	MaxUses         int        `gorm:"default:100" json:"max_uses"`
	UsedCount       int        `gorm:"default:0" json:"used_count"`
	ExpiresAt       *time.Time `json:"expires_at"`
	IsActive        bool       `gorm:"default:true" json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
}
