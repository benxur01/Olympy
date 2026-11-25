package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

type CreateQuestionRequest struct {
	OlympiadID    interface{} `json:"olympiad_id"`
	Olympiad      interface{} `json:"olympiad"`
	CenterID      interface{} `json:"center_id"`
	Center        interface{} `json:"center"`
	Subject       string      `json:"subject"`
	Difficulty    string      `json:"difficulty"`
	Text          string      `json:"text" binding:"required"`
	QuestionType  string      `json:"question_type"`
	Options       []string    `json:"options"`
	CorrectAnswer interface{} `json:"correct_answer"`
	CorrectText   string      `json:"correct_text"`
	Score         int         `json:"score"`
	Points        int         `json:"points"`
	Explanation   string      `json:"explanation"`
}

func ListQuestions(c *gin.Context) {
	var questions []models.Question
	query := database.DB

	if olympiadID := c.Query("olympiad"); olympiadID != "" {
		query = query.Where("olympiad_id = ?", olympiadID)
	}
	if centerID := c.Query("center"); centerID != "" && centerID != "null" && centerID != "undefined" {
		query = query.Where("center_id = ?", centerID)
	}

	query.Order("`order` ASC, id ASC").Find(&questions)
	isStaff := userIsStaff(c)
	out := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		out = append(out, SerializeQuestion(q, isStaff))
	}
	c.JSON(http.StatusOK, out)
}

func CreateQuestion(c *gin.Context) {
	var req CreateQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Savol matni majburiy: "+err.Error())
		return
	}

	var olympiadPtr *uint
	if oid, ok := parseFlexUint(req.OlympiadID); ok {
		olympiadPtr = &oid
	} else if oid, ok := parseFlexUint(req.Olympiad); ok {
		olympiadPtr = &oid
	}

	var centerPtr *uint
	if cid, ok := parseFlexUint(req.CenterID); ok {
		centerPtr = &cid
	} else if cid, ok := parseFlexUint(req.Center); ok {
		centerPtr = &cid
	}

	points := req.Points
	if points <= 0 {
		points = req.Score
	}
	if points <= 0 {
		points = 5
	}
	qType := req.QuestionType
	if qType == "" || qType == "single" {
		qType = "multiple_choice"
	}

	correctAns := req.CorrectText
	if correctAns == "" && req.CorrectAnswer != nil {
		correctAns = fmt.Sprintf("%v", req.CorrectAnswer)
	}

	question := models.Question{
		OlympiadID:    olympiadPtr,
		CenterID:      centerPtr,
		Subject:       req.Subject,
		Difficulty:    req.Difficulty,
		Text:          req.Text,
		QuestionType:  qType,
		OptionsJSON:   models.StringArray(req.Options),
		CorrectAnswer: correctAns,
		Points:        points,
		Explanation:   req.Explanation,
	}

	if err := database.DB.Create(&question).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Savolni saqlashda xatolik")
		return
	}

	c.JSON(http.StatusCreated, SerializeQuestion(question, true))
}

func UpdateQuestion(c *gin.Context) {
	id := c.Param("id")
	var q models.Question
	if err := database.DB.First(&q, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Savol topilmadi")
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		jsonError(c, http.StatusBadRequest, "Noto'g'ri ma'lumot")
		return
	}

	updates := map[string]interface{}{}
	for _, key := range []string{"text", "subject", "difficulty", "question_type", "explanation"} {
		if v, ok := raw[key]; ok {
			updates[key] = v
		}
	}
	if v, ok := raw["score"]; ok {
		updates["points"] = v
	} else if v, ok := raw["points"]; ok {
		updates["points"] = v
	}
	if v, ok := raw["correct_answer"]; ok && v != nil {
		updates["correct_answer"] = fmt.Sprintf("%v", v)
	}
	if opts, ok := raw["options"].([]interface{}); ok {
		strOpts := make(models.StringArray, 0, len(opts))
		for _, o := range opts {
			strOpts = append(strOpts, fmt.Sprintf("%v", o))
		}
		updates["options_json"] = strOpts
	}

	if len(updates) > 0 {
		database.DB.Model(&q).Updates(updates)
		database.DB.First(&q, id)
	}
	c.JSON(http.StatusOK, SerializeQuestion(q, true))
}

func DeleteQuestion(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&models.Question{}, id)
	c.JSON(http.StatusNoContent, nil)
}
