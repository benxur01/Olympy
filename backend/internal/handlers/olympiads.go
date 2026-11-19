package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type CreateOlympiadRequest struct {
	Title           string     `json:"title" binding:"required"`
	Description     string     `json:"description"`
	CenterID        *uint      `json:"center_id"`
	SubjectID       *uint      `json:"subject_id"`
	DurationMinutes int        `json:"duration_minutes"`
	PassingScore    int        `json:"passing_score"`
	StartTime       *time.Time `json:"start_time"`
	EndTime         *time.Time `json:"end_time"`
}

type CreateSubjectRequest struct {
	Name string `json:"name" binding:"required"`
	Icon string `json:"icon"`
}

func ListOlympiads(c *gin.Context) {
	var olympiads []models.Olympiad
	query := database.DB.Preload("Center").Preload("Subject")

	if c.Query("center") != "" {
		query = query.Where("center_id = ?", c.Query("center"))
	}
	if c.Query("all") != "true" {
		query = query.Where("status = ?", "published")
	}

	query.Find(&olympiads)
	c.JSON(http.StatusOK, olympiads)
}

func GetOlympiad(c *gin.Context) {
	id := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.Preload("Center").Preload("Subject").Preload("Questions").First(&olympiad, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Olimpiada topilmadi"})
		return
	}
	c.JSON(http.StatusOK, olympiad)
}

func CreateOlympiad(c *gin.Context) {
	var req CreateOlympiadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nom majburiy"})
		return
	}

	duration := req.DurationMinutes
	if duration <= 0 {
		duration = 60
	}
	passing := req.PassingScore
	if passing <= 0 {
		passing = 60
	}

	olympiad := models.Olympiad{
		Title:           req.Title,
		Description:     req.Description,
		CenterID:        req.CenterID,
		SubjectID:       req.SubjectID,
		DurationMinutes: duration,
		PassingScore:    passing,
		Status:          "published",
		IsPublic:        true,
		StartTime:       req.StartTime,
		EndTime:         req.EndTime,
	}

	if err := database.DB.Create(&olympiad).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Olimpiadani saqlashda xatolik"})
		return
	}

	c.JSON(http.StatusCreated, olympiad)
}

func PublishOlympiad(c *gin.Context) {
	id := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.First(&olympiad, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Olimpiada topilmadi"})
		return
	}

	olympiad.Status = "published"
	database.DB.Save(&olympiad)

	c.JSON(http.StatusOK, gin.H{"message": "Olimpiada e'lon qilindi", "olympiad": olympiad})
}

func ListSubjects(c *gin.Context) {
	var subjects []models.Subject
	database.DB.Find(&subjects)
	c.JSON(http.StatusOK, subjects)
}

func CreateSubject(c *gin.Context) {
	var req CreateSubjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Fan nomi majburiy"})
		return
	}

	slug := strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	subject := models.Subject{
		Name: req.Name,
		Slug: slug,
		Icon: req.Icon,
	}

	if err := database.DB.Create(&subject).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Fanni saqlashda xatolik"})
		return
	}

	c.JSON(http.StatusCreated, subject)
}

func GetOlympiadStats(c *gin.Context) {
	id := c.Param("id")

	var totalAttempts int64
	var passedAttempts int64
	database.DB.Model(&models.TestAttempt{}).Where("olympiad_id = ? AND status = 'submitted'", id).Count(&totalAttempts)
	database.DB.Model(&models.TestAttempt{}).Where("olympiad_id = ? AND is_passed = ?", id, true).Count(&passedAttempts)

	passRate := float64(0)
	if totalAttempts > 0 {
		passRate = (float64(passedAttempts) / float64(totalAttempts)) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"olympiad_id":     id,
		"total_attempts":  totalAttempts,
		"passed_attempts": passedAttempts,
		"pass_rate":       passRate,
	})
}
