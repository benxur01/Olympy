package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/services"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SubmitAnswerItem struct {
	QuestionID     uint   `json:"question_id"`
	SelectedAnswer string `json:"selected_answer"`
}

func extractSubmittedAnswer(raw interface{}, q models.Question) string {
	switch val := raw.(type) {
	case nil:
		return ""
	case float64:
		idx := int(val)
		if idx < 0 {
			return ""
		}
		if idx < len(q.OptionsJSON) {
			return q.OptionsJSON[idx]
		}
		return strconv.Itoa(idx)
	case int:
		if val < 0 {
			return ""
		}
		if val < len(q.OptionsJSON) {
			return q.OptionsJSON[val]
		}
		return strconv.Itoa(val)
	case string:
		if idx, err := strconv.Atoi(strings.TrimSpace(val)); err == nil && idx >= 0 && idx < len(q.OptionsJSON) {
			return q.OptionsJSON[idx]
		}
		return val
	case map[string]interface{}:
		if t, ok := val["text"].(string); ok {
			return t
		}
		if idxVal, ok := val["chosen_idx"]; ok {
			return extractSubmittedAnswer(idxVal, q)
		}
		if v, ok := val["value"]; ok {
			return fmt.Sprintf("%v", v)
		}
		b, _ := json.Marshal(val)
		return string(b)
	default:
		return fmt.Sprintf("%v", val)
	}
}

func answerMatchesCorrect(raw interface{}, selectedText string, q models.Question) bool {
	if strings.TrimSpace(selectedText) == "" {
		return false
	}
	expected := strings.TrimSpace(strings.ToLower(q.CorrectAnswer))
	if strings.TrimSpace(strings.ToLower(selectedText)) == expected {
		return true
	}
	// Support CorrectAnswer stored as 0-based index when client submits index or option text
	if idx, err := strconv.Atoi(expected); err == nil && idx >= 0 && idx < len(q.OptionsJSON) {
		if strings.TrimSpace(strings.ToLower(q.OptionsJSON[idx])) == strings.TrimSpace(strings.ToLower(selectedText)) {
			return true
		}
		if f, ok := raw.(float64); ok && int(f) == idx {
			return true
		}
	}
	return false
}

func SubmitAttempt(c *gin.Context) {
	userID, exists := currentUserID(c)
	if !exists {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonError(c, http.StatusBadRequest, "Noto'g'ri so'rov formati")
		return
	}

	olympiadID, ok := parseFlexUint(body["olympiad_id"])
	if !ok {
		olympiadID, ok = parseFlexUint(body["olympiad"])
	}
	if !ok {
		jsonError(c, http.StatusBadRequest, "Olimpiada ID majburiy")
		return
	}

	timeSpent := 0
	if ts, ok := body["time_spent_seconds"].(float64); ok && ts > 0 {
		timeSpent = int(ts)
	} else if ts, ok := body["time_spent"].(float64); ok && ts > 0 {
		timeSpent = int(ts)
	}

	var olympiad models.Olympiad
	if err := database.DB.Preload("Questions").First(&olympiad, olympiadID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}
	if olympiad.Status != "active" && olympiad.Status != "published" {
		jsonError(c, http.StatusBadRequest, "Ushbu olimpiada hozirda faol emas")
		return
	}

	var activeSession models.TestSession
	if err := database.DB.Where("user_id = ? AND olympiad_id = ?", userID, olympiad.ID).First(&activeSession).Error; err == nil {
		if activeSession.Status == "disqualified" || activeSession.Status == "removed" {
			jsonError(c, http.StatusForbidden, "Siz imtihondan chetlatilgansiz")
			return
		}
	}

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
	correctCount := 0
	var testAnswers []models.TestAnswer

	// Accept either frontend map (`{ "12": 1 }`) or legacy array (`[{ question_id: 12, selected_answer: "7" }]`)
	switch rawAnswers := body["answers"].(type) {
	case map[string]interface{}:
		for qIDStr, val := range rawAnswers {
			qID, qOk := parseFlexUint(qIDStr)
			if !qOk {
				continue
			}
			q, exists := questionsMap[qID]
			if !exists {
				continue
			}
			selected := extractSubmittedAnswer(val, q)
			isCorrect := answerMatchesCorrect(val, selected, q)
			pointsEarned := 0
			if isCorrect {
				pointsEarned = q.Points
				totalEarnedScore += pointsEarned
				correctCount++
			}
			testAnswers = append(testAnswers, models.TestAnswer{
				QuestionID:     q.ID,
				SelectedAnswer: selected,
				IsCorrect:      isCorrect,
				PointsEarned:   pointsEarned,
			})
		}
	case []interface{}:
		for _, item := range rawAnswers {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			qID, qOk := parseFlexUint(m["question_id"])
			if !qOk {
				continue
			}
			q, exists := questionsMap[qID]
			if !exists {
				continue
			}
			selected := extractSubmittedAnswer(m["selected_answer"], q)
			isCorrect := answerMatchesCorrect(m["selected_answer"], selected, q)
			pointsEarned := 0
			if isCorrect {
				pointsEarned = q.Points
				totalEarnedScore += pointsEarned
				correctCount++
			}
			testAnswers = append(testAnswers, models.TestAnswer{
				QuestionID:     q.ID,
				SelectedAnswer: selected,
				IsCorrect:      isCorrect,
				PointsEarned:   pointsEarned,
			})
		}
	}

	totalQuestions := len(olympiad.Questions)
	wrongCount := totalQuestions - correctCount
	if wrongCount < 0 {
		wrongCount = 0
	}

	percentage := services.CalculatePercentage(totalEarnedScore, totalMaxScore)
	isPassed := int(percentage) >= olympiad.PassingScore
	cefrLevel := services.CalculateCEFRLevel(percentage)
	ieltsBand := services.CalculateIELTSBand(percentage)
	certUUID := uuid.New().String()

	now := time.Now()
	attempt := models.TestAttempt{
		UserID:           userID,
		OlympiadID:       olympiad.ID,
		Status:           "submitted",
		Score:            totalEarnedScore,
		MaxScore:         totalMaxScore,
		CorrectCount:     correctCount,
		WrongCount:       wrongCount,
		TotalQuestions:   totalQuestions,
		Percentage:       percentage,
		IsPassed:         isPassed,
		CertificateUUID:  certUUID,
		StartedAt:        now.Add(-time.Duration(timeSpent) * time.Second),
		SubmittedAt:      &now,
		TimeSpentSeconds: timeSpent,
	}

	errDuplicateAttempt := errors.New("duplicate attempt")
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		var existingCount int64
		if err := tx.Model(&models.TestAttempt{}).
			Where("user_id = ? AND olympiad_id = ? AND status = ?", userID, olympiad.ID, "submitted").
			Count(&existingCount).Error; err != nil {
			return err
		}
		if existingCount > 0 {
			return errDuplicateAttempt
		}

		if err := tx.Create(&attempt).Error; err != nil {
			return err
		}

		for i := range testAnswers {
			testAnswers[i].AttemptID = attempt.ID
			if err := tx.Create(&testAnswers[i]).Error; err != nil {
				return err
			}
		}

		if err := tx.Model(&models.TestSession{}).
			Where("user_id = ? AND olympiad_id = ?", userID, olympiad.ID).
			Update("status", "completed").Error; err != nil {
			return err
		}

		if isPassed {
			if err := tx.Model(&models.User{}).
				Where("id = ?", userID).
				Update("coins", gorm.Expr("coins + ?", 20)).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if txErr != nil {
		if errors.Is(txErr, errDuplicateAttempt) {
			jsonError(c, http.StatusConflict, "Siz ushbu olimpiadani allaqachon topshirgansiz")
			return
		}
		jsonError(c, http.StatusInternalServerError, "Natijani saqlashda xatolik")
		return
	}

	// Compute live rank among submitted attempts for this olympiad
	var betterCount int64
	database.DB.Model(&models.TestAttempt{}).
		Where("olympiad_id = ? AND status = 'submitted' AND (score > ? OR (score = ? AND time_spent_seconds < ?))",
			olympiad.ID, attempt.Score, attempt.Score, attempt.TimeSpentSeconds).
		Count(&betterCount)
	rank := int(betterCount) + 1

	c.JSON(http.StatusCreated, gin.H{
		"message":          "Test muvaffaqiyatli topshirildi va tekshirildi!",
		"id":               attempt.ID,
		"attempt_id":       attempt.ID,
		"score":            attempt.Score,
		"max_score":        attempt.MaxScore,
		"correct_count":    attempt.CorrectCount,
		"wrong_count":      attempt.WrongCount,
		"total_questions":  attempt.TotalQuestions,
		"time_spent":       attempt.TimeSpentSeconds,
		"percentage":       attempt.Percentage,
		"is_passed":        attempt.IsPassed,
		"cefr_level":       cefrLevel,
		"ielts_band":       ieltsBand,
		"certificate_uuid": certUUID,
		"rank":             rank,
		"position":         rank,
		"answers":          testAnswers,
	})
}

func GetMyResults(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var attempts []models.TestAttempt
	database.DB.Preload("Olympiad").Where("user_id = ?", userID).Order("id DESC").Find(&attempts)

	out := make([]gin.H, 0, len(attempts))
	for _, a := range attempts {
		var submittedAt *string
		if a.SubmittedAt != nil {
			s := a.SubmittedAt.UTC().Format(time.RFC3339)
			submittedAt = &s
		}
		out = append(out, gin.H{
			"id":               a.ID,
			"user":             a.UserID,
			"olympiad":         a.OlympiadID,
			"olympiad_title":   a.Olympiad.Title,
			"subject":          a.Olympiad.SubjectName,
			"status":           a.Status,
			"score":            a.Score,
			"max_score":        a.MaxScore,
			"correct_count":    a.CorrectCount,
			"wrong_count":      a.WrongCount,
			"total_questions":  a.TotalQuestions,
			"percentage":       a.Percentage,
			"is_passed":        a.IsPassed,
			"time_spent":       a.TimeSpentSeconds,
			"certificate_uuid": a.CertificateUUID,
			"submitted_at":     submittedAt,
		})
	}
	c.JSON(http.StatusOK, out)
}

func GetMyStats(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var attempts []models.TestAttempt
	database.DB.Where("user_id = ?", userID).Find(&attempts)

	total := len(attempts)
	best := 0
	sum := 0
	for _, a := range attempts {
		sum += a.Score
		if a.Score > best {
			best = a.Score
		}
	}
	avg := 0
	if total > 0 {
		avg = sum / total
	}
	c.JSON(http.StatusOK, gin.H{
		"total_attempts": total,
		"avg_score":      avg,
		"best_score":     best,
	})
}

func GetMistakes(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var wrongAnswers []models.TestAnswer
	database.DB.Preload("Question").
		Joins("JOIN test_attempts ON test_attempts.id = test_answers.attempt_id").
		Where("test_attempts.user_id = ? AND test_answers.is_correct = ?", userID, false).
		Order("test_answers.id DESC").
		Limit(50).
		Find(&wrongAnswers)

	out := make([]gin.H, 0, len(wrongAnswers))
	for _, ans := range wrongAnswers {
		out = append(out, gin.H{
			"id":              ans.ID,
			"question_id":     ans.QuestionID,
			"text":            ans.Question.Text,
			"subject":         ans.Question.Subject,
			"options":         []string(ans.Question.OptionsJSON),
			"selected_answer": ans.SelectedAnswer,
			"correct_answer":  ans.Question.CorrectAnswer,
			"explanation":     ans.Question.Explanation,
		})
	}
	c.JSON(http.StatusOK, gin.H{"mistakes": out})
}

// GetAttemptRouter dispatches /api/attempts/:id/ without Gin wildcard/static conflicts.
func GetAttemptRouter(c *gin.Context) {
	switch c.Param("id") {
	case "mistakes":
		GetMistakes(c)
	case "listening-play":
		GetListeningPlayState(c)
	default:
		GetAttemptDetail(c)
	}
}

func GetAttemptDetail(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}
	id := c.Param("id")
	var attempt models.TestAttempt
	if err := database.DB.Preload("Olympiad").Preload("Answers.Question").First(&attempt, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Natija topilmadi")
		return
	}
	if attempt.UserID != userID && !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Ushbu natijani ko'rish huquqingiz yo'q")
		return
	}

	review := make([]gin.H, 0, len(attempt.Answers))
	for _, ans := range attempt.Answers {
		review = append(review, gin.H{
			"question_id":     ans.QuestionID,
			"text":            ans.Question.Text,
			"question_type":   ans.Question.QuestionType,
			"options":         []string(ans.Question.OptionsJSON),
			"selected_answer": ans.SelectedAnswer,
			"correct_answer":  ans.Question.CorrectAnswer,
			"is_correct":      ans.IsCorrect,
			"points_earned":   ans.PointsEarned,
			"score":           ans.Question.Points,
			"explanation":     ans.Question.Explanation,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               attempt.ID,
		"user":             attempt.UserID,
		"olympiad":         attempt.OlympiadID,
		"olympiad_detail":  SerializeOlympiad(attempt.Olympiad),
		"status":           attempt.Status,
		"score":            attempt.Score,
		"max_score":        attempt.MaxScore,
		"correct_count":    attempt.CorrectCount,
		"wrong_count":      attempt.WrongCount,
		"total_questions":  attempt.TotalQuestions,
		"percentage":       attempt.Percentage,
		"is_passed":        attempt.IsPassed,
		"time_spent":       attempt.TimeSpentSeconds,
		"cefr_level":       services.CalculateCEFRLevel(attempt.Percentage),
		"ielts_band":       services.CalculateIELTSBand(attempt.Percentage),
		"certificate_uuid": attempt.CertificateUUID,
		"submitted_at":     attempt.SubmittedAt,
		"questions_review": review,
	})
}
