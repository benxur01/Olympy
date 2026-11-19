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

// GetPracticeQuestions returns questions for free unranked practice
func GetPracticeQuestions(c *gin.Context) {
	var questions []models.Question
	query := database.DB.Limit(20)

	if subjectID := c.Query("subject"); subjectID != "" {
		query = query.Where("subject_id = ?", subjectID)
	}

	query.Find(&questions)
	c.JSON(http.StatusOK, questions)
}

// SubmitPracticeAnswer verifies answer instantly without affecting official ranking
func SubmitPracticeAnswer(c *gin.Context) {
	var req PracticeSubmitRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Savol va javob tanlanishi shart"})
		return
	}

	var q models.Question
	if err := database.DB.First(&q, req.QuestionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Savol topilmadi"})
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
