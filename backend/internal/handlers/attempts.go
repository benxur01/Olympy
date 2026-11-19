package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/services"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gin-gonic/gin"
)

type SubmitAnswerItem struct {
	QuestionID     uint   `json:"question_id" binding:"required"`
	SelectedAnswer string `json:"selected_answer"`
}

type SubmitAttemptRequest struct {
	OlympiadID       uint               `json:"olympiad_id" binding:"required"`
	TimeSpentSeconds int                `json:"time_spent_seconds"`
	Answers          []SubmitAnswerItem `json:"answers"`
}

func SubmitAttempt(c *gin.Context) {
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Foydalanuvchi aniqlanmadi"})
		return
	}
	userID := userIDVal.(uint)

	var req SubmitAttemptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Olimpiada ID majburiy: " + err.Error()})
		return
	}

	var olympiad models.Olympiad
	if err := database.DB.Preload("Questions").First(&olympiad, req.OlympiadID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Olimpiada topilmadi"})
		return
	}

	// Map of questions
	questionsMap := make(map[uint]models.Question)
	totalMaxScore := 0
	for _, q := range olympiad.Questions {
		questionsMap[q.ID] = q
		totalMaxScore += q.Points
	}
	if totalMaxScore == 0 {
		totalMaxScore = olympiad.MaxScore
		if totalMaxScore == 0 {
			totalMaxScore = 100
		}
	}

	totalEarnedScore := 0
	var testAnswers []models.TestAnswer

	for _, userAns := range req.Answers {
		q, ok := questionsMap[userAns.QuestionID]
		if !ok {
			continue
		}

		isCorrect := strings.TrimSpace(strings.ToLower(userAns.SelectedAnswer)) == strings.TrimSpace(strings.ToLower(q.CorrectAnswer))
		pointsEarned := 0
		if isCorrect {
			pointsEarned = q.Points
			totalEarnedScore += pointsEarned
		}

		testAnswers = append(testAnswers, models.TestAnswer{
			QuestionID:     q.ID,
			SelectedAnswer: userAns.SelectedAnswer,
			IsCorrect:      isCorrect,
			PointsEarned:   pointsEarned,
		})
	}

	percentage := services.CalculatePercentage(totalEarnedScore, totalMaxScore)
	isPassed := int(percentage) >= olympiad.PassingScore
	cefrLevel := services.CalculateCEFRLevel(percentage)
	ieltsBand := services.CalculateIELTSBand(percentage)

	now := time.Now()
	attempt := models.TestAttempt{
		UserID:           userID,
		OlympiadID:       olympiad.ID,
		Status:           "submitted",
		Score:            totalEarnedScore,
		MaxScore:         totalMaxScore,
		Percentage:       percentage,
		IsPassed:         isPassed,
		StartedAt:        now.Add(-time.Duration(req.TimeSpentSeconds) * time.Second),
		SubmittedAt:      &now,
		TimeSpentSeconds: req.TimeSpentSeconds,
	}

	if err := database.DB.Create(&attempt).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Natijani saqlashda xatolik"})
		return
	}

	// Save detailed answers
	for i := range testAnswers {
		testAnswers[i].AttemptID = attempt.ID
		database.DB.Create(&testAnswers[i])
	}

	// Reward coins if passed
	if isPassed {
		database.DB.Model(&models.User{}).Where("id = ?", userID).Update("coins", database.DB.Raw("coins + ?", 20))
	}

	certUUID := uuid.New().String()

	c.JSON(http.StatusCreated, gin.H{
		"message":          "Test muvaffaqiyatli topshirildi va tekshirildi!",
		"attempt_id":       attempt.ID,
		"score":            attempt.Score,
		"max_score":        attempt.MaxScore,
		"percentage":       attempt.Percentage,
		"is_passed":        attempt.IsPassed,
		"cefr_level":       cefrLevel,
		"ielts_band":       ieltsBand,
		"certificate_uuid": certUUID,
		"answers":          testAnswers,
	})
}

func GetMyResults(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var attempts []models.TestAttempt
	database.DB.Preload("Olympiad").Where("user_id = ?", userID).Order("id DESC").Find(&attempts)

	c.JSON(http.StatusOK, attempts)
}

func GetAttemptDetail(c *gin.Context) {
	id := c.Param("id")
	var attempt models.TestAttempt
	if err := database.DB.Preload("Olympiad").Preload("Answers.Question").First(&attempt, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Natija topilmadi"})
		return
	}
	c.JSON(http.StatusOK, attempt)
}
