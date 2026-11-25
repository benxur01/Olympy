package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

func GetLeaderboard(c *gin.Context) {
	olympiadID := c.Query("olympiad")

	var attempts []models.TestAttempt
	query := database.DB.Preload("User").Preload("Olympiad.Center").Where("status = ?", "submitted")

	if olympiadID != "" {
		query = query.Where("olympiad_id = ?", olympiadID)
	}

	query.Order("score DESC, percentage DESC, time_spent_seconds ASC").Limit(50).Find(&attempts)

	entries := make([]gin.H, 0, len(attempts))
	for i, att := range attempts {
		centerName := "—"
		orgType := "O'quv markaz"
		country := "O'zbekiston"
		region := ""
		district := ""
		if att.Olympiad.Center != nil {
			centerName = att.Olympiad.Center.Name
			if att.Olympiad.Center.OrganizationType != "" {
				orgType = att.Olympiad.Center.OrganizationType
			}
			if att.Olympiad.Center.Country != "" {
				country = att.Olympiad.Center.Country
			}
			region = att.Olympiad.Center.Region
			district = att.Olympiad.Center.District
		}
		subject := att.Olympiad.SubjectName
		if subject == "" {
			subject = "Matematika"
		}

		entries = append(entries, gin.H{
			"attempt_id":        att.ID,
			"rank":              i + 1,
			"user_id":           att.UserID,
			"name":              att.User.FullName,
			"full_name":         att.User.FullName,
			"center":            centerName,
			"organization_type": orgType,
			"country":           country,
			"region":            region,
			"district":          district,
			"subject":           subject,
			"avatar_url":        att.User.AvatarURL,
			"is_premium":        att.User.IsPremium,
			"score":             att.Score,
			"max_score":         att.MaxScore,
			"percentage":        att.Percentage,
			"time_spent":        att.TimeSpentSeconds,
			"coins":             att.User.Coins,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"entries":    entries,
		"results":    entries,
		"header":     nil,
		"olympiad":   nil,
		"pagination": nil,
	})
}
