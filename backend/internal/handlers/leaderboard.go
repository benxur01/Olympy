package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

type LeaderboardEntry struct {
	Rank       int     `json:"rank"`
	UserID     uint    `json:"user_id"`
	FullName   string  `json:"full_name"`
	AvatarURL  string  `json:"avatar_url"`
	Score      int     `json:"score"`
	MaxScore   int     `json:"max_score"`
	Percentage float64 `json:"percentage"`
	Coins      int     `json:"coins"`
}

func GetLeaderboard(c *gin.Context) {
	olympiadID := c.Query("olympiad")

	var attempts []models.TestAttempt
	query := database.DB.Preload("User").Where("status = ?", "submitted")

	if olympiadID != "" {
		query = query.Where("olympiad_id = ?", olympiadID)
	}

	query.Order("score DESC, percentage DESC, time_spent_seconds ASC").Limit(50).Find(&attempts)

	var leaderboard []LeaderboardEntry
	for i, att := range attempts {
		leaderboard = append(leaderboard, LeaderboardEntry{
			Rank:       i + 1,
			UserID:     att.UserID,
			FullName:   att.User.FullName,
			AvatarURL:  att.User.AvatarURL,
			Score:      att.Score,
			MaxScore:   att.MaxScore,
			Percentage: att.Percentage,
			Coins:      att.User.Coins,
		})
	}

	c.JSON(http.StatusOK, leaderboard)
}
