package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
)

type StartSessionRequest struct {
	OlympiadID        uint   `json:"olympiad_id" binding:"required"`
	CameraConsent     bool   `json:"camera_consent"`
	MicrophoneConsent bool   `json:"microphone_consent"`
	DeviceID          string `json:"device_id"`
}

type PingSessionRequest struct {
	SessionID     uint        `json:"session_id"`
	Olympiad      interface{} `json:"olympiad"`
	OlympiadID    interface{} `json:"olympiad_id"`
	AnsweredCount int         `json:"answered_count"`
	TabEscapes    int         `json:"tab_escapes"`
	DeviceID      string      `json:"device_id"`
}

type EvidenceRequest struct {
	SessionID  uint    `json:"session_id" binding:"required"`
	Reason     string  `json:"reason" binding:"required"`
	Confidence float64 `json:"confidence"`
	ImageURL   string  `json:"image_url"`
	Metadata   string  `json:"metadata"`
}

type TerminateSessionRequest struct {
	SessionID uint   `json:"session_id" binding:"required"`
	Reason    string `json:"reason" binding:"required"`
}

func StartTestSession(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req StartSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Olimpiada ID majburiy")
		return
	}

	var olympiad models.Olympiad
	if err := database.DB.Preload("Questions").First(&olympiad, req.OlympiadID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Olimpiada topilmadi")
		return
	}

	var session models.TestSession
	err := database.DB.Where("user_id = ? AND olympiad_id = ?", userID, olympiad.ID).First(&session).Error
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "Sessiya mavjud",
			"session": session,
		})
		return
	}

	var qOrder models.StringArray
	for _, q := range olympiad.Questions {
		qOrder = append(qOrder, fmt.Sprintf("%d", q.ID))
	}

	now := time.Now()
	session = models.TestSession{
		UserID:                 userID,
		OlympiadID:             olympiad.ID,
		Status:                 "active",
		QuestionOrder:          qOrder,
		LastDeviceID:           req.DeviceID,
		LastPingAt:             &now,
		CameraConsentGiven:     req.CameraConsent,
		MicrophoneConsentGiven: req.MicrophoneConsent,
		StartedAt:              now,
	}

	if err := database.DB.Create(&session).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Sessiya ochishda xatolik: "+err.Error())
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Imtihon sessiyasi muvaffaqiyatli boshlandi!",
		"session": session,
	})
}

func PingTestSession(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req PingSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Session yoki Olimpiada ID majburiy")
		return
	}

	var session models.TestSession
	var err error
	if req.SessionID > 0 {
		err = database.DB.First(&session, req.SessionID).Error
	} else {
		oid, ok := parseFlexUint(req.Olympiad)
		if !ok {
			oid, ok = parseFlexUint(req.OlympiadID)
		}
		if !ok {
			jsonError(c, http.StatusBadRequest, "Olympiad ID majburiy")
			return
		}
		err = database.DB.Where("user_id = ? AND olympiad_id = ?", userID, oid).First(&session).Error
	}

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "active"})
		return
	}

	now := time.Now()
	if req.DeviceID != "" && session.LastDeviceID != "" && session.LastDeviceID != req.DeviceID {
		if session.LastPingAt != nil && now.Sub(*session.LastPingAt) < 30*time.Second {
			session.Status = "disqualified"
			session.CheatingReason = "Bir vaqtning o'zida ikkita qurilmadan kirish aniqlandi!"
			session.DisqualifiedAt = &now
			database.DB.Save(&session)

			c.JSON(http.StatusForbidden, gin.H{
				"status": "disqualified",
				"reason": session.CheatingReason,
			})
			return
		}
	}

	if req.DeviceID != "" {
		session.LastDeviceID = req.DeviceID
	}
	session.LastPingAt = &now
	database.DB.Save(&session)

	c.JSON(http.StatusOK, gin.H{"status": session.Status})
}

func RecordEvidence(c *gin.Context) {
	var req EvidenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Ma'lumotlar to'liq emas")
		return
	}

	evidence := models.EvidenceSnapshot{
		SessionID:  req.SessionID,
		Reason:     req.Reason,
		Confidence: req.Confidence,
		ImageURL:   req.ImageURL,
		Metadata:   req.Metadata,
		CreatedAt:  time.Now(),
	}
	database.DB.Create(&evidence)

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Dalil muvaffaqiyatli qayd etildi",
		"evidence": evidence,
	})
}

func ReportCheating(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusOK, gin.H{"recorded": true})
		return
	}

	oid, ok := parseFlexUint(body["olympiad"])
	if !ok {
		oid, _ = parseFlexUint(body["olympiad_id"])
	}
	reason, _ := body["reason"].(string)
	if reason == "" {
		reason = "cheating_detected"
	}

	var session models.TestSession
	if oid > 0 && database.DB.Where("user_id = ? AND olympiad_id = ?", userID, oid).First(&session).Error == nil {
		database.DB.Create(&models.EvidenceSnapshot{
			SessionID: session.ID,
			Reason:    reason,
			CreatedAt: time.Now(),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"recorded": true,
		"reason":   reason,
	})
}

func RecordProctorConsent(kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDVal, _ := c.Get("userID")
		userID := userIDVal.(uint)

		var body map[string]interface{}
		_ = c.ShouldBindJSON(&body)
		oid, ok := parseFlexUint(body["olympiad"])
		if !ok {
			oid, _ = parseFlexUint(body["olympiad_id"])
		}
		if oid > 0 {
			var session models.TestSession
			if database.DB.Where("user_id = ? AND olympiad_id = ?", userID, oid).First(&session).Error == nil {
				if kind == "camera" {
					database.DB.Model(&session).Update("camera_consent_given", true)
				} else {
					database.DB.Model(&session).Update("microphone_consent_given", true)
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{"consent": true, "kind": kind})
	}
}

func TerminateSession(c *gin.Context) {
	var req TerminateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Sabab ko'rsatilishi shart")
		return
	}

	var session models.TestSession
	if err := database.DB.First(&session, req.SessionID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Sessiya topilmadi")
		return
	}

	now := time.Now()
	session.Status = "removed"
	session.CheatingReason = req.Reason
	session.DisqualifiedAt = &now
	database.DB.Save(&session)

	c.JSON(http.StatusOK, gin.H{
		"message": "Imtihonchi sessiyadan chetlatildi",
		"session": session,
	})
}
