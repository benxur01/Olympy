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

func CertificateRouter(c *gin.Context) {
	p1 := c.Param("param1")
	p2 := c.Param("param2")

	if p1 == "verify" {
		verifyCertificateByUUID(c, p2)
		return
	}
	if p2 == "download" {
		downloadCertificateByID(c, p1)
		return
	}

	jsonError(c, http.StatusNotFound, "Sertifikat marshruti topilmadi")
}

func VerifyCertificate(c *gin.Context) {
	verifyCertificateByUUID(c, c.Param("uuid"))
}

func verifyCertificateByUUID(c *gin.Context, certUUID string) {

	var attempt models.TestAttempt
	err := database.DB.Preload("User").Preload("Olympiad").Where("certificate_uuid = ?", certUUID).First(&attempt).Error
	if err != nil {
		err = database.DB.Preload("User").Preload("Olympiad").Where("id = ?", certUUID).First(&attempt).Error
	}

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

func DownloadCertificate(c *gin.Context) {
	downloadCertificateByID(c, c.Param("id"))
}

func downloadCertificateByID(c *gin.Context, attemptID string) {

	var attempt models.TestAttempt
	if err := database.DB.Preload("User").Preload("Olympiad").First(&attempt, attemptID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Natija topilmadi")
		return
	}

	certUUID := attempt.CertificateUUID
	if certUUID == "" {
		certUUID = fmt.Sprintf("CERT-%d-%d", attempt.ID, attempt.UserID)
	}
	html := services.GenerateCertificateHTML(attempt, attempt.User.FullName, attempt.Olympiad.Title, certUUID)

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, html)
}
