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
	OlympiadID       uint   `json:"olympiad_id" binding:"required"`
	CameraConsent     bool   `json:"camera_consent"`
	MicrophoneConsent bool   `json:"microphone_consent"`
	DeviceID          string `json:"device_id"`
}

type PingSessionRequest struct {
	SessionID uint   `json:"session_id" binding:"required"`
	DeviceID  string `json:"device_id" binding:"required"`
}

type EvidenceRequest struct {
	SessionID  uint    `json:"session_id" binding:"required"`
	Reason     string  `json:"reason" binding:"required"` // tab_switch, fullscreen_exit, no_face
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
		c.JSON(http.StatusBadRequest, gin.H{"error": "Olimpiada ID majburiy"})
		return
	}

	var olympiad models.Olympiad
	if err := database.DB.Preload("Questions").First(&olympiad, req.OlympiadID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Olimpiada topilmadi"})
		return
	}

	// Fetch or create session
	var session models.TestSession
	err := database.DB.Where("user_id = ? AND olympiad_id = ?", userID, olympiad.ID).First(&session).Error
	if err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "Sessiya mavjud",
			"session": session,
		})
		return
	}

	// Randomize questions
	var qOrder []string
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Sessiya ochishda xatolik: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Imtihon sessiyasi muvaffaqiyatli boshlandi!",
		"session": session,
	})
}

func PingTestSession(c *gin.Context) {
	var req PingSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "SessionID va DeviceID majburiy"})
		return
	}

	var session models.TestSession
	if err := database.DB.First(&session, req.SessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sessiya topilmadi"})
		return
	}

	now := time.Now()
	// Parallel device login check
	if session.LastDeviceID != "" && session.LastDeviceID != req.DeviceID {
		if session.LastPingAt != nil && now.Sub(*session.LastPingAt) < 30*time.Second {
			// Disqualify for dual device cheating!
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

	session.LastDeviceID = req.DeviceID
	session.LastPingAt = &now
	database.DB.Save(&session)

	c.JSON(http.StatusOK, gin.H{"status": session.Status})
}

func RecordEvidence(c *gin.Context) {
	var req EvidenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ma'lumotlar to'liq emas"})
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

func TerminateSession(c *gin.Context) {
	var req TerminateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Sabab ko'rsatilishi shart"})
		return
	}

	var session models.TestSession
	if err := database.DB.First(&session, req.SessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sessiya topilmadi"})
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
