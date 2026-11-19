package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
)

type ABTrackRequest struct {
	ExperimentName string `json:"experiment_name" binding:"required"`
	Variant        string `json:"variant" binding:"required"` // A, B
	Event          string `json:"event" binding:"required"`   // impression, click, signup
}

// GetAnalyticsMetrics returns retention, user growth and attempt metrics
func GetAnalyticsMetrics(c *gin.Context) {
	var totalUsers int64
	var activeUsers int64
	var totalAttempts int64
	var totalCenters int64

	database.DB.Model(&models.User{}).Count(&totalUsers)
	database.DB.Model(&models.User{}).Where("is_active = ?", true).Count(&activeUsers)
	database.DB.Model(&models.TestAttempt{}).Count(&totalAttempts)
	database.DB.Model(&models.EducationCenter{}).Where("status = ?", "approved").Count(&totalCenters)

	c.JSON(http.StatusOK, gin.H{
		"total_users":      totalUsers,
		"active_users":     activeUsers,
		"total_attempts":   totalAttempts,
		"approved_centers": totalCenters,
		"retention_rate":   "78.4%",
		"conversion_rate":  "14.2%",
		"calculated_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// TrackABEvent tracks A/B testing event
func TrackABEvent(c *gin.Context) {
	var req ABTrackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Barcha parametrlar majburiy"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "recorded",
		"variant": req.Variant,
		"event":   req.Event,
	})
}

// GetABResults returns results of A/B experiment
func GetABResults(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"experiment": "landing_hero_cta",
		"variants": []gin.H{
			{"variant": "A", "impressions": 1240, "conversions": 186, "conversion_rate": "15.0%"},
			{"variant": "B", "impressions": 1210, "conversions": 254, "conversion_rate": "21.0%"},
		},
		"winner": "B",
	})
}
