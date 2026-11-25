package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type CreateOlympiadRequest struct {
	Title                   string        `json:"title" binding:"required"`
	Description             string        `json:"description"`
	Center                  interface{}   `json:"center"`
	CenterID                interface{}   `json:"center_id"`
	Subject                 string        `json:"subject"`
	SubjectID               interface{}   `json:"subject_id"`
	EventType               string        `json:"event_type"`
	TestType                string        `json:"test_type"`
	TestLevel               string        `json:"test_level"`
	ExamFormat              string        `json:"exam_format"`
	DurationMinutes         int           `json:"duration_minutes"`
	Duration                int           `json:"duration"`
	PassingScore            int           `json:"passing_score"`
	Status                  string        `json:"status"`
	StartDatetime           string        `json:"start_datetime"`
	StartTime               *time.Time    `json:"start_time"`
	EndTime                 *time.Time    `json:"end_time"`
	QuestionIDs             []interface{} `json:"question_ids"`
	CameraProctoringEnabled bool          `json:"camera_proctoring_enabled"`
	VoiceProctoringEnabled  bool          `json:"voice_proctoring_enabled"`
}

type CreateSubjectRequest struct {
	Name string `json:"name" binding:"required"`
	Icon string `json:"icon"`
}

func ListOlympiads(c *gin.Context) {
	var olympiads []models.Olympiad
	query := database.DB.Preload("Center").Preload("Subject")

	if center := c.Query("center"); center != "" {
		query = query.Where("center_id = ?", center)
	}
	if c.Query("all") != "true" {
		query = query.Where("status IN ?", []string{"active", "published", "finished", "draft"})
	}

	query.Order("id DESC").Find(&olympiads)
	out := make([]gin.H, 0, len(olympiads))
	for _, o := range olympiads {
		out = append(out, SerializeOlympiad(o))
	}
	c.JSON(http.StatusOK, out)
}

func GetOlympiad(c *gin.Context) {
	id := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.Preload("Center").Preload("Subject").First(&olympiad, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}
	c.JSON(http.StatusOK, SerializeOlympiad(olympiad))
}

func userIsStaff(c *gin.Context) bool {
	if isAdmin, ok := c.Get("isAdmin"); ok && isAdmin.(bool) {
		return true
	}
	rolesVal, ok := c.Get("roles")
	if !ok {
		return false
	}
	roles, _ := rolesVal.([]string)
	for _, r := range roles {
		if r == "admin" || r == "owner" || r == "manager" || r == "teacher" {
			return true
		}
	}
	return false
}

// GetOlympiadQuestions returns per-index or full exam questions and initializes/returns the TestSession.
func GetOlympiadQuestions(c *gin.Context) {
	olympiadID := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.Preload("Questions").First(&olympiad, olympiadID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}

	var questions []models.Question
	database.DB.Where("olympiad_id = ?", olympiad.ID).Order("`order` ASC, id ASC").Find(&questions)

	isStaff := userIsStaff(c)
	now := time.Now().UTC()

	// Ensure a TestSession exists when an authenticated user loads exam questions
	var sessionResp gin.H
	if userIDVal, exists := c.Get("userID"); exists {
		userID := userIDVal.(uint)
		var session models.TestSession
		err := database.DB.Where("user_id = ? AND olympiad_id = ?", userID, olympiad.ID).First(&session).Error
		if err != nil {
			qOrder := make(models.StringArray, 0, len(questions))
			for _, q := range questions {
				qOrder = append(qOrder, fmt.Sprintf("%d", q.ID))
			}
			session = models.TestSession{
				UserID:        userID,
				OlympiadID:    olympiad.ID,
				Status:        "active",
				QuestionOrder: qOrder,
				StartedAt:     now,
				LastPingAt:    &now,
			}
			database.DB.Create(&session)
		}

		dur := olympiad.DurationMinutes
		if dur <= 0 {
			dur = 60
		}
		expiresAt := session.StartedAt.Add(time.Duration(dur)*time.Minute + time.Duration(session.PausedSeconds)*time.Second)
		sessionResp = gin.H{
			"id":         session.ID,
			"status":     session.Status,
			"started_at": session.StartedAt.UTC().Format(time.RFC3339),
			"expires_at": expiresAt.UTC().Format(time.RFC3339),
			"server_now": now.Format(time.RFC3339),
		}
		if session.Status == "pending_review" {
			c.JSON(http.StatusOK, gin.H{
				"status":  "pending_review",
				"session": sessionResp,
			})
			return
		}
		if session.Status == "disqualified" || session.Status == "removed" {
			c.JSON(http.StatusForbidden, gin.H{
				"detail":  "Sizning ishtirokingiz bekor qilindi",
				"removed": true,
			})
			return
		}
	}

	total := len(questions)
	qIdxParam := c.Query("q")
	if qIdxParam != "" {
		idx, err := strconv.Atoi(qIdxParam)
		if err != nil || idx < 0 || idx >= total {
			c.JSON(http.StatusOK, gin.H{
				"questions":       []gin.H{},
				"question_index":  idx,
				"total_questions": total,
				"session":         sessionResp,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"questions":       []gin.H{SerializeQuestion(questions[idx], isStaff)},
			"question_index":  idx,
			"total_questions": total,
			"session":         sessionResp,
		})
		return
	}

	out := make([]gin.H, 0, total)
	for _, q := range questions {
		out = append(out, SerializeQuestion(q, isStaff))
	}
	c.JSON(http.StatusOK, gin.H{
		"questions":       out,
		"total_questions": total,
		"session":         sessionResp,
	})
}

func CreateOlympiad(c *gin.Context) {
	var req CreateOlympiadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Nom majburiy")
		return
	}

	var centerPtr *uint
	if cid, ok := parseFlexUint(req.CenterID); ok {
		centerPtr = &cid
	} else if cid, ok := parseFlexUint(req.Center); ok {
		centerPtr = &cid
	}

	var subjectPtr *uint
	if sid, ok := parseFlexUint(req.SubjectID); ok {
		subjectPtr = &sid
	}

	duration := req.DurationMinutes
	if duration <= 0 {
		duration = req.Duration
	}
	if duration <= 0 {
		duration = 60
	}
	passing := req.PassingScore
	if passing <= 0 {
		passing = 60
	}
	status := normalizeOlympiadStatus(req.Status)
	eventType := strings.TrimSpace(req.EventType)
	if eventType == "" {
		eventType = "olympiad"
	}

	startTime := req.StartTime
	if startTime == nil && req.StartDatetime != "" {
		if parsed, err := time.Parse(time.RFC3339, req.StartDatetime); err == nil {
			startTime = &parsed
		}
	}
	if startTime == nil {
		now := time.Now()
		startTime = &now
	}

	olympiad := models.Olympiad{
		Title:                   req.Title,
		Description:             req.Description,
		CenterID:                centerPtr,
		SubjectID:               subjectPtr,
		SubjectName:             req.Subject,
		EventType:               eventType,
		TestType:                req.TestType,
		TestLevel:               req.TestLevel,
		ExamFormat:              req.ExamFormat,
		CameraProctoringEnabled: req.CameraProctoringEnabled,
		VoiceProctoringEnabled:  req.VoiceProctoringEnabled,
		DurationMinutes:         duration,
		PassingScore:            passing,
		Status:                  status,
		IsPublic:                eventType == "olympiad",
		StartTime:               startTime,
		EndTime:                 req.EndTime,
	}

	if err := database.DB.Create(&olympiad).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Olimpiadani saqlashda xatolik")
		return
	}

	// Attach pre-selected question bank IDs if provided
	for idx, rawQID := range req.QuestionIDs {
		if qid, ok := parseFlexUint(rawQID); ok {
			database.DB.Model(&models.Question{}).Where("id = ?", qid).Updates(map[string]interface{}{
				"olympiad_id": olympiad.ID,
				"order":       idx + 1,
			})
		}
	}

	database.DB.Preload("Center").Preload("Subject").First(&olympiad, olympiad.ID)
	c.JSON(http.StatusCreated, SerializeOlympiad(olympiad))
}

func UpdateOlympiad(c *gin.Context) {
	id := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.First(&olympiad, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}

	var raw map[string]interface{}
	if err := c.ShouldBindJSON(&raw); err != nil {
		jsonError(c, http.StatusBadRequest, "Noto'g'ri ma'lumot")
		return
	}

	updates := map[string]interface{}{}
	for _, key := range []string{"title", "description", "test_level", "test_type", "exam_format", "duration_minutes", "passing_score", "camera_proctoring_enabled", "voice_proctoring_enabled"} {
		if v, ok := raw[key]; ok {
			updates[key] = v
		}
	}
	if v, ok := raw["subject"].(string); ok && v != "" {
		updates["subject_name"] = v
	}
	if v, ok := raw["status"].(string); ok && v != "" {
		updates["status"] = normalizeOlympiadStatus(v)
	}
	if len(updates) > 0 {
		database.DB.Model(&olympiad).Updates(updates)
	}

	if qIDsRaw, ok := raw["question_ids"].([]interface{}); ok {
		for idx, item := range qIDsRaw {
			if qid, ok := parseFlexUint(item); ok {
				database.DB.Model(&models.Question{}).Where("id = ?", qid).Updates(map[string]interface{}{
					"olympiad_id": olympiad.ID,
					"order":       idx + 1,
				})
			}
		}
	}

	database.DB.Preload("Center").Preload("Subject").First(&olympiad, olympiad.ID)
	c.JSON(http.StatusOK, SerializeOlympiad(olympiad))
}

func DeleteOlympiad(c *gin.Context) {
	id := c.Param("id")
	database.DB.Delete(&models.Olympiad{}, id)
	c.JSON(http.StatusNoContent, nil)
}

func setOlympiadStatus(c *gin.Context, status string, msg string) {
	id := c.Param("id")
	var olympiad models.Olympiad
	if err := database.DB.First(&olympiad, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}
	olympiad.Status = status
	database.DB.Save(&olympiad)
	database.DB.Preload("Center").Preload("Subject").First(&olympiad, id)
	c.JSON(http.StatusOK, gin.H{"message": msg, "olympiad": SerializeOlympiad(olympiad)})
}

func PublishOlympiad(c *gin.Context) {
	setOlympiadStatus(c, "active", "Olimpiada faollashtirildi")
}

func DeactivateOlympiad(c *gin.Context) {
	setOlympiadStatus(c, "draft", "Olimpiada nofaol qilindi")
}

func FinishOlympiad(c *gin.Context) {
	setOlympiadStatus(c, "finished", "Olimpiada yakunlandi")
}

func ListSubjects(c *gin.Context) {
	var subjects []models.Subject
	database.DB.Find(&subjects)
	c.JSON(http.StatusOK, subjects)
}

func CreateSubject(c *gin.Context) {
	var req CreateSubjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Fan nomi majburiy")
		return
	}

	subject := models.Subject{
		Name: req.Name,
		Slug: slugify(req.Name),
		Icon: req.Icon,
	}

	if err := database.DB.Create(&subject).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Fanni saqlashda xatolik")
		return
	}

	c.JSON(http.StatusCreated, subject)
}

func GetOlympiadStats(c *gin.Context) {
	id := c.Param("id")

	var totalAttempts, passedAttempts int64
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
