package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"

	"github.com/gin-gonic/gin"
)

type BlockIPRequest struct {
	IPAddress string `json:"ip_address" binding:"required"`
	Reason    string `json:"reason"`
}

type ResolveFlagRequest struct {
	ResolutionNote string `json:"resolution_note"`
}

func ListModerationFlags(c *gin.Context) {
	var flags []models.ModerationFlag
	query := database.DB

	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if flagType := c.Query("type"); flagType != "" {
		query = query.Where("flag_type = ?", flagType)
	}

	query.Order("id DESC").Limit(100).Find(&flags)
	c.JSON(http.StatusOK, flags)
}

func ResolveFlag(c *gin.Context) {
	flagID := c.Param("id")
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req ResolveFlagRequest
	_ = c.ShouldBindJSON(&req)

	var flag models.ModerationFlag
	if err := database.DB.First(&flag, flagID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bayroq topilmadi"})
		return
	}

	now := time.Now()
	flag.Status = "resolved"
	flag.ResolvedByID = &userID
	flag.ResolvedAt = &now
	flag.ResolutionNote = req.ResolutionNote
	database.DB.Save(&flag)

	c.JSON(http.StatusOK, gin.H{"message": "Bayroq hal qilindi", "flag": flag})
}

func DismissFlag(c *gin.Context) {
	flagID := c.Param("id")
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var flag models.ModerationFlag
	if err := database.DB.First(&flag, flagID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Bayroq topilmadi"})
		return
	}

	now := time.Now()
	flag.Status = "dismissed"
	flag.ResolvedByID = &userID
	flag.ResolvedAt = &now
	database.DB.Save(&flag)

	c.JSON(http.StatusOK, gin.H{"message": "Bayroq rad etildi", "flag": flag})
}

func BlockIP(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req BlockIPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "IP manzil majburiy"})
		return
	}

	blocked := models.BlockedIP{
		IPAddress: req.IPAddress,
		Reason:    req.Reason,
		BlockedBy: &userID,
	}
	database.DB.Create(&blocked)

	c.JSON(http.StatusCreated, gin.H{"message": "IP muvaffaqiyatli bloklandi", "blocked": blocked})
}

func ListAuditLogs(c *gin.Context) {
	var logs []models.AuditLog
	database.DB.Order("id DESC").Limit(100).Find(&logs)
	c.JSON(http.StatusOK, logs)
}
