package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"

	"github.com/gin-gonic/gin"
)

type PracticeSubmitRequest struct {
	QuestionID     uint   `json:"question_id" binding:"required"`
	SelectedAnswer string `json:"selected_answer" binding:"required"`
}

func GetPracticeQuestions(c *gin.Context) {
	var questions []models.Question
	query := database.DB.Limit(20)

	if subject := strings.TrimSpace(c.Query("subject")); subject != "" {
		query = query.Where("subject = ?", subject)
	}

	query.Find(&questions)
	out := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		out = append(out, SerializeQuestion(q, true))
	}
	c.JSON(http.StatusOK, out)
}

func StartPractice(c *gin.Context) {
	var questions []models.Question
	database.DB.Limit(10).Find(&questions)
	out := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		out = append(out, SerializeQuestion(q, false))
	}
	c.JSON(http.StatusOK, gin.H{"questions": out})
}

func SubmitPracticeAnswer(c *gin.Context) {
	var req PracticeSubmitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Savol va javob tanlanishi shart")
		return
	}

	var q models.Question
	if err := database.DB.First(&q, req.QuestionID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Savol topilmadi")
		return
	}

	isCorrect := strings.TrimSpace(strings.ToLower(req.SelectedAnswer)) == strings.TrimSpace(strings.ToLower(q.CorrectAnswer))

	c.JSON(http.StatusOK, gin.H{
		"is_correct":     isCorrect,
		"correct_answer": q.CorrectAnswer,
		"explanation":    q.Explanation,
		"points":         q.Points,
	})
}
