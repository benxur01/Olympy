package handlers

import (
	"fmt"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// jsonError sends uniform error payloads readable by both React (`data.detail`) and legacy clients (`data.error`).
func jsonError(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{
		"detail": msg,
		"error":  msg,
	})
}

// parseFlexUint parses string, int, or float64 JSON ID values into uint.
func parseFlexUint(v interface{}) (uint, bool) {
	switch val := v.(type) {
	case nil:
		return 0, false
	case uint:
		return val, val > 0
	case int:
		if val <= 0 {
			return 0, false
		}
		return uint(val), true
	case int64:
		if val <= 0 {
			return 0, false
		}
		return uint(val), true
	case float64:
		if val <= 0 {
			return 0, false
		}
		return uint(val), true
	case string:
		s := strings.TrimSpace(val)
		if s == "" || s == "null" || s == "undefined" {
			return 0, false
		}
		n, err := strconv.ParseUint(s, 10, 64)
		if err != nil || n == 0 {
			return 0, false
		}
		return uint(n), true
	default:
		return 0, false
	}
}

func slugify(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "'", "")
	s = strings.ReplaceAll(s, "’", "")
	if s == "" {
		return fmt.Sprintf("item-%d", time.Now().UnixNano())
	}
	return s
}

func normalizeOlympiadStatus(status string) string {
	s := strings.ToLower(strings.TrimSpace(status))
	if s == "published" || s == "" {
		return "active"
	}
	return s
}

// buildRolesDetail converts user roles and center memberships into the exact object format expected by mapBackendUser.
func buildRolesDetail(user models.User) map[string]interface{} {
	detail := make(map[string]interface{})

	var memberships []models.CenterMembership
	database.DB.Preload("Center").Where("user_id = ?", user.ID).Find(&memberships)

	for _, m := range memberships {
		centerName := m.Center.Name
		centerInfo := gin.H{
			"membership_id":     m.ID,
			"status":            m.Status,
			"center_id":         m.CenterID,
			"center_name":       centerName,
			"organization_type": m.Center.OrganizationType,
			"country":           m.Center.Country,
			"region":            m.Center.Region,
			"district":          m.Center.District,
			"city":              m.Center.City,
			"image_url":         m.Center.LogoURL,
			"created_at":        m.Center.CreatedAt.UTC().Format(time.RFC3339),
		}

		existing, ok := detail[m.Role].(gin.H)
		if !ok {
			detail[m.Role] = gin.H{
				"status":      m.Status,
				"center_id":   m.CenterID,
				"center_name": centerName,
				"subject":     m.Subject,
				"centers":     []gin.H{centerInfo},
			}
		} else {
			centers, _ := existing["centers"].([]gin.H)
			centers = append(centers, centerInfo)
			existing["centers"] = centers
			if m.Status == "approved" {
				existing["status"] = "approved"
				existing["center_id"] = m.CenterID
				existing["center_name"] = centerName
			}
			detail[m.Role] = existing
		}
	}

	// Ensure roles listed on user.Roles without explicit membership (e.g. owned centers) stay usable.
	var ownedCenters []models.EducationCenter
	database.DB.Where("owner_id = ?", user.ID).Find(&ownedCenters)

	for _, role := range user.Roles {
		if _, exists := detail[role]; exists {
			continue
		}
		if role == "student" {
			detail["student"] = gin.H{
				"status":      "approved",
				"center_id":   nil,
				"center_name": "",
				"subject":     "",
				"centers":     []gin.H{},
			}
		} else if role == "owner" && len(ownedCenters) > 0 {
			c := ownedCenters[0]
			detail["owner"] = gin.H{
				"status":      c.Status,
				"center_id":   c.ID,
				"center_name": c.Name,
				"subject":     "",
				"centers": []gin.H{{
					"status":            c.Status,
					"center_id":         c.ID,
					"center_name":       c.Name,
					"organization_type": c.OrganizationType,
					"country":           c.Country,
					"region":            c.Region,
					"district":          c.District,
					"city":              c.City,
					"image_url":         c.LogoURL,
					"created_at":        c.CreatedAt.UTC().Format(time.RFC3339),
				}},
			}
		}
	}

	return detail
}

// SerializeUser builds the backend user payload matching src/services/api.js:mapBackendUser.
func SerializeUser(user models.User) gin.H {
	rolesDetail := buildRolesDetail(user)
	var currentPlan *string
	var activeSub models.UserSubscription
	if err := database.DB.Preload("Plan").Where("user_id = ? AND is_active = ?", user.ID, true).Order("id DESC").First(&activeSub).Error; err == nil && activeSub.Plan != nil {
		currentPlan = &activeSub.Plan.Name
	}

	return gin.H{
		"id":                           user.ID,
		"full_name":                    user.FullName,
		"first_name":                   user.FirstName,
		"last_name":                    user.LastName,
		"username":                     user.Username,
		"phone":                        user.Phone,
		"normalized_phone":             user.NormalizedPhone,
		"email":                        user.Email,
		"email_verified":               user.EmailVerified,
		"roles":                        user.Roles,
		"roles_detail":                 rolesDetail,
		"is_platform_admin":            user.IsPlatformAdmin,
		"is_active":                    user.IsActive,
		"is_premium":                   user.IsPremium,
		"is_premium_active":            user.IsPremium,
		"current_plan_name":            currentPlan,
		"coins":                        user.Coins,
		"streak_count":                 user.StreakCount,
		"avatar_url":                   user.AvatarURL,
		"telegram_chat_id":             user.TelegramChatID,
		"telegram_linked":              user.TelegramChatID != "" && user.TelegramChatID != "2fa_enabled",
		"totp_enabled":                 user.TOTPEnabled,
		"onboarding_completed":         user.OnboardingCompleted,
		"onboarding_center_completed":  true,
		"onboarding_manager_completed": true,
		"onboarding_teacher_completed": true,
		"created_at":                   user.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// SerializeCenter builds the EducationCenter JSON matching pages/store.jsx:mapApiCenter.
func SerializeCenter(c models.EducationCenter) gin.H {
	var studentCount, olympiadCount int64
	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'student' AND status = 'approved'", c.ID).Count(&studentCount)
	database.DB.Model(&models.Olympiad{}).Where("center_id = ?", c.ID).Count(&olympiadCount)

	subjects := []string(c.Subjects)
	if len(subjects) == 0 {
		subjects = []string{"Matematika", "Fizika"}
	}

	city := c.City
	if city == "" {
		city = c.District
	}
	orgType := c.OrganizationType
	if orgType == "" {
		orgType = "O'quv markaz"
	}
	country := c.Country
	if country == "" {
		country = "O'zbekiston"
	}

	return gin.H{
		"id":                c.ID,
		"name":              c.Name,
		"slug":              c.Slug,
		"description":       c.Description,
		"organization_type": orgType,
		"country":           country,
		"region":            c.Region,
		"district":          c.District,
		"city":              city,
		"address":           c.Address,
		"phone":             c.Phone,
		"owner":             c.OwnerID,
		"owner_id":          c.OwnerID,
		"owner_full_name":   c.Owner.FullName,
		"owner_phone":       c.Owner.Phone,
		"status":            c.Status,
		"is_premium":        c.IsPremium,
		"image_url":         c.LogoURL,
		"logo_url":          c.LogoURL,
		"rating":            c.Rating,
		"students":          studentCount,
		"olympiads":         olympiadCount,
		"subjects":          subjects,
		"created_at":        c.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// SerializeOlympiad builds the Olympiad JSON matching pages/store.jsx:mapApiOlympiad.
func SerializeOlympiad(o models.Olympiad) gin.H {
	subjectName := strings.TrimSpace(o.SubjectName)
	if subjectName == "" && o.Subject != nil {
		subjectName = o.Subject.Name
	}
	if subjectName == "" {
		subjectName = "Matematika"
	}

	centerName := ""
	if o.Center != nil {
		centerName = o.Center.Name
	}

	eventType := o.EventType
	if eventType == "" {
		if o.IsPublic {
			eventType = "olympiad"
		} else {
			eventType = "competition"
		}
	}

	testType := o.TestType
	if testType == "" {
		testType = "multiple_choice"
	}

	examFormat := o.ExamFormat
	if examFormat == "" {
		examFormat = "standard"
	}

	startTime := o.CreatedAt
	if o.StartTime != nil {
		startTime = *o.StartTime
	}

	var qIDs []uint
	database.DB.Model(&models.Question{}).Where("olympiad_id = ?", o.ID).Order("`order` ASC, id ASC").Pluck("id", &qIDs)
	if qIDs == nil {
		qIDs = []uint{}
	}

	var participants int64
	database.DB.Model(&models.TestAttempt{}).Where("olympiad_id = ?", o.ID).Count(&participants)

	var endTimeStr *string
	if o.EndTime != nil {
		formatted := o.EndTime.UTC().Format(time.RFC3339)
		endTimeStr = &formatted
	}

	return gin.H{
		"id":                        o.ID,
		"title":                     o.Title,
		"description":               o.Description,
		"center":                    o.CenterID,
		"center_id":                 o.CenterID,
		"center_name":               centerName,
		"subject":                   subjectName,
		"subject_id":                o.SubjectID,
		"event_type":                eventType,
		"exam_format":               examFormat,
		"test_type":                 testType,
		"test_level":                o.TestLevel,
		"duration_minutes":          o.DurationMinutes,
		"passing_score":             o.PassingScore,
		"max_score":                 o.MaxScore,
		"status":                    normalizeOlympiadStatus(o.Status),
		"is_public":                 o.IsPublic,
		"start_datetime":            startTime.UTC().Format(time.RFC3339),
		"end_datetime":              endTimeStr,
		"question_ids":              qIDs,
		"questions":                 qIDs,
		"participants":              participants,
		"camera_proctoring_enabled": o.CameraProctoringEnabled,
		"voice_proctoring_enabled":  o.VoiceProctoringEnabled,
		"created_at":                o.CreatedAt.UTC().Format(time.RFC3339),
	}
}

// resolveCorrectIndex returns the 0-based option index when CorrectAnswer matches an option, or parses an explicit numeric index.
func resolveCorrectIndex(q models.Question) interface{} {
	ans := strings.TrimSpace(q.CorrectAnswer)
	if idx, err := strconv.Atoi(ans); err == nil && idx >= 0 && idx < len(q.OptionsJSON) {
		return idx
	}
	for i, opt := range q.OptionsJSON {
		if strings.EqualFold(strings.TrimSpace(opt), ans) {
			return i
		}
	}
	return ans
}

// SerializeQuestion builds the Question JSON matching pages/store.jsx:mapApiQuestion and OlympiadTest.
func SerializeQuestion(q models.Question, includeAnswer bool) gin.H {
	subject := strings.TrimSpace(q.Subject)
	if subject == "" {
		subject = "Matematika"
	}
	difficulty := strings.TrimSpace(q.Difficulty)
	if difficulty == "" {
		difficulty = "medium"
	}
	qType := q.QuestionType
	if qType == "" || qType == "single" {
		qType = "multiple_choice"
	}

	payload := gin.H{
		"id":            q.ID,
		"olympiad_id":   q.OlympiadID,
		"center":        q.CenterID,
		"center_id":     q.CenterID,
		"subject":       subject,
		"text":          q.Text,
		"question_type": qType,
		"options":       []string(q.OptionsJSON),
		"score":         q.Points,
		"points":        q.Points,
		"difficulty":    difficulty,
		"source":        "manual",
		"order":         q.Order,
		"created_at":    q.CreatedAt.UTC().Format(time.RFC3339),
	}
	if includeAnswer {
		payload["correct_answer"] = resolveCorrectIndex(q)
		payload["correct_text"] = q.CorrectAnswer
		payload["explanation"] = q.Explanation
	}
	return payload
}
