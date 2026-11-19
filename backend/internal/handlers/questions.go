package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

type CreateQuestionRequest struct {
	OlympiadID    *uint    `json:"olympiad_id"`
	CenterID      *uint    `json:"center_id"`
	Text          string   `json:"text" binding:"required"`
	QuestionType  string   `json:"question_type"` // single, multiple, text
	Options       []string `json:"options"`
	CorrectAnswer string   `json:"correct_answer" binding:"required"`
	Points        int      `json:"points"`
	Explanation   string   `json:"explanation"`
}

func ListQuestions(c *gin.Context) {
	var questions []models.Question
	query := database.DB

	if c.Query("olympiad") != "" {
		query = query.Where("olympiad_id = ?", c.Query("olympiad"))
	}
	if c.Query("center") != "" {
		query = query.Where("center_id = ?", c.Query("center"))
	}

	query.Order("`order` ASC, id ASC").Find(&questions)
	c.JSON(http.StatusOK, questions)
}

func CreateQuestion(c *gin.Context) {
	var req CreateQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Savol matni va to'g'ri javob majburiy: " + err.Error()})
		return
	}

	points := req.Points
	if points <= 0 {
		points = 5
	}
	qType := req.QuestionType
	if qType == "" {
		qType = "single"
	}

	question := models.Question{
		OlympiadID:    req.OlympiadID,
		CenterID:      req.CenterID,
		Text:          req.Text,
		QuestionType:  qType,
		OptionsJSON:   req.Options,
		CorrectAnswer: req.CorrectAnswer,
		Points:        points,
		Explanation:   req.Explanation,
	}

	if err := database.DB.Create(&question).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Savolni saqlashda xatolik"})
		return
	}

	c.JSON(http.StatusCreated, question)
}
