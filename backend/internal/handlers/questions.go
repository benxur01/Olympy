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
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Savollar bankiga faqat xodimlar kira oladi")
		return
	}

	var questions []models.Question
	query := database.DB

	if olympiadID := c.Query("olympiad"); olympiadID != "" {
		query = query.Where("olympiad_id = ?", olympiadID)
	}
	if centerID := c.Query("center"); centerID != "" && centerID != "null" && centerID != "undefined" {
		if cid, ok := parseFlexUint(centerID); ok && !canManageCenter(c, cid, true) {
			jsonError(c, http.StatusForbidden, "Ushbu markaz savollarini ko'rish huquqingiz yo'q")
			return
		}
		query = query.Where("center_id = ?", centerID)
	} else if !currentUserIsAdmin(c) {
		if uid, ok := currentUserID(c); ok {
			ids := userManagedCenterIDs(uid, "owner", "manager", "teacher")
			if len(ids) > 0 {
				query = query.Where("center_id IN ? OR center_id IS NULL", ids)
			} else {
				query = query.Where("center_id IS NULL")
			}
		}
	}

	if err := query.Order("`order` ASC, id ASC").Find(&questions).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Savollarni yuklashda xatolik")
		return
	}
	out := make([]gin.H, 0, len(questions))
	for _, q := range questions {
		out = append(out, SerializeQuestion(q, true))
	}
	c.JSON(http.StatusOK, out)
}

func CreateQuestion(c *gin.Context) {
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Savol yaratish uchun o'qituvchi yoki markaz boshqaruvchisi huquqi talab qilinadi")
		return
	}

	var req CreateQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Savol matni majburiy")
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
	if centerPtr != nil && !canManageCenter(c, *centerPtr, true) {
		jsonError(c, http.StatusForbidden, "Ushbu markazga savol qo'shish huquqingiz yo'q")
		return
	}
	if olympiadPtr != nil {
		var ol models.Olympiad
		if err := database.DB.First(&ol, *olympiadPtr).Error; err != nil {
			jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
			return
		}
		if ol.CenterID != nil && !canManageCenter(c, *ol.CenterID, true) {
			jsonError(c, http.StatusForbidden, "Ushbu olimpiadaga savol qo'shish huquqingiz yo'q")
			return
		}
		if centerPtr == nil {
			centerPtr = ol.CenterID
		}
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
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Savolni tahrirlash huquqingiz yo'q")
		return
	}

	id := c.Param("id")
	var q models.Question
	if err := database.DB.First(&q, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Savol topilmadi")
		return
	}
	if q.CenterID != nil && !canManageCenter(c, *q.CenterID, true) {
		jsonError(c, http.StatusForbidden, "Ushbu savolni tahrirlash huquqingiz yo'q")
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
		if err := database.DB.Model(&q).Updates(updates).Error; err != nil {
			jsonError(c, http.StatusInternalServerError, "Savolni yangilashda xatolik")
			return
		}
		database.DB.First(&q, id)
	}
	c.JSON(http.StatusOK, SerializeQuestion(q, true))
}

func DeleteQuestion(c *gin.Context) {
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Savolni o'chirish huquqingiz yo'q")
		return
	}
	id := c.Param("id")
	var q models.Question
	if err := database.DB.First(&q, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Savol topilmadi")
		return
	}
	if q.CenterID != nil && !canManageCenter(c, *q.CenterID, true) {
		jsonError(c, http.StatusForbidden, "Ushbu savolni o'chirish huquqingiz yo'q")
		return
	}
	if err := database.DB.Delete(&q).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Savolni o'chirishda xatolik")
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
