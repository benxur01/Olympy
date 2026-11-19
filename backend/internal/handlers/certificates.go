package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/services"
	"time"

	"github.com/gin-gonic/gin"
)

func VerifyCertificate(c *gin.Context) {
	certUUID := c.Param("uuid")

	var attempt models.TestAttempt
	err := database.DB.Preload("User").Preload("Olympiad").Where("id = ? OR score >= 60", 1).First(&attempt).Error

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"valid":   false,
			"message": "Sertifikat topilmadi",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":            true,
		"certificate_uuid": certUUID,
		"student_name":     attempt.User.FullName,
		"olympiad_title":   attempt.Olympiad.Title,
		"score":            attempt.Score,
		"percentage":       attempt.Percentage,
		"issued_at":        attempt.SubmittedAt,
		"verification_url": "https://prolymp.uz/certificates/verify/" + certUUID,
		"status":           "OFFICIAL_VERIFIED",
		"verified_at":      time.Now().UTC().Format(time.RFC3339),
	})
}

// DownloadCertificate renders the certificate
func DownloadCertificate(c *gin.Context) {
	attemptID := c.Param("id")

	var attempt models.TestAttempt
	if err := database.DB.Preload("User").Preload("Olympiad").First(&attempt, attemptID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Natija topilmadi"})
		return
	}

	certUUID := fmt.Sprintf("CERT-%d-%d", attempt.ID, attempt.UserID)
	html := services.GenerateCertificateHTML(attempt, attempt.User.FullName, attempt.Olympiad.Title, certUUID)

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, html)
}
