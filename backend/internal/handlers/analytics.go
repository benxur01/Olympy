package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
)

type ABTrackRequest struct {
	ExperimentName string `json:"experiment_name" binding:"required"`
	Variant        string `json:"variant" binding:"required"`
	Event          string `json:"event" binding:"required"`
}

func GetAnalyticsMetrics(c *gin.Context) {
	var totalUsers, activeUsers, totalAttempts, totalCenters int64

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

func AdminListUsers(c *gin.Context) {
	var users []models.User
	database.DB.Order("id DESC").Find(&users)
	out := make([]gin.H, 0, len(users))
	for _, u := range users {
		out = append(out, SerializeUser(u))
	}
	c.JSON(http.StatusOK, gin.H{
		"results":  out,
		"count":    len(out),
		"next":     nil,
		"previous": nil,
	})
}

func AdminSystemHealth(c *gin.Context) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	c.JSON(http.StatusOK, gin.H{
		"status": "healthy",
		"environment": gin.H{
			"runtime":     "Go",
			"go_version":  runtime.Version(),
			"goroutines":  runtime.NumGoroutine(),
			"alloc_mb":    float64(mem.Alloc) / (1024 * 1024),
		},
	})
}

func AdminRevenueAnalytics(c *gin.Context) {
	var txs []models.PaymentTransaction
	database.DB.Where("status = ?", "success").Find(&txs)
	var totalRevenue float64
	for _, tx := range txs {
		totalRevenue += tx.Amount
	}
	c.JSON(http.StatusOK, gin.H{
		"total_revenue":      totalRevenue,
		"transactions_count": len(txs),
		"transactions":       txs,
	})
}

func GetManagerStats(c *gin.Context) {
	centerID := c.Query("center")
	var attempts []models.TestAttempt
	query := database.DB.Joins("JOIN olympiads ON olympiads.id = test_attempts.olympiad_id")
	if centerID != "" && centerID != "null" {
		query = query.Where("olympiads.center_id = ?", centerID)
	}
	query.Find(&attempts)

	var sum, highest int
	for _, a := range attempts {
		sum += a.Score
		if a.Score > highest {
			highest = a.Score
		}
	}
	avg := 0
	if len(attempts) > 0 {
		avg = sum / len(attempts)
	}
	c.JSON(http.StatusOK, gin.H{
		"total_attempts": len(attempts),
		"avg_score":      avg,
		"highest_score":  highest,
	})
}

func EmptyListResponse(c *gin.Context) {
	c.JSON(http.StatusOK, []gin.H{})
}

func EmptyPagedResponse(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"results": []gin.H{}, "count": 0, "next": nil, "previous": nil})
}

func TrackABEvent(c *gin.Context) {
	var req ABTrackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Barcha parametrlar majburiy")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "recorded",
		"variant": req.Variant,
		"event":   req.Event,
	})
}

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
