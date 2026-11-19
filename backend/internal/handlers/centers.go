package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"

	"github.com/gin-gonic/gin"
)

type CreateCenterRequest struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Address     string `json:"address"`
	Phone       string `json:"phone"`
}

type JoinCenterRequest struct {
	Role string `json:"role"` // student, teacher
}

type MemberActionRequest struct {
	UserID uint `json:"user_id" binding:"required"`
}

func ListCenters(c *gin.Context) {
	var centers []models.EducationCenter
	query := database.DB.Preload("Owner")
	if c.Query("all") != "true" {
		query = query.Where("status = ?", "approved")
	}
	query.Find(&centers)

	c.JSON(http.StatusOK, centers)
}

func GetCenter(c *gin.Context) {
	id := c.Param("id")
	var center models.EducationCenter
	if err := database.DB.Preload("Owner").First(&center, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Markaz topilmadi"})
		return
	}
	c.JSON(http.StatusOK, center)
}

func CreateCenter(c *gin.Context) {
	userID, _ := c.Get("userID")

	var req CreateCenterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nom majburiy"})
		return
	}

	slug := strings.ToLower(strings.ReplaceAll(req.Name, " ", "-"))
	center := models.EducationCenter{
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		Address:     req.Address,
		Phone:       req.Phone,
		OwnerID:     userID.(uint),
		Status:      "pending", // requires platform admin approval
	}

	if err := database.DB.Create(&center).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Markazni saqlashda xatolik"})
		return
	}

	c.JSON(http.StatusCreated, center)
}

func JoinCenter(c *gin.Context) {
	userID, _ := c.Get("userID")
	centerID := c.Param("id")

	var req JoinCenterRequest
	_ = c.ShouldBindJSON(&req)
	if req.Role == "" {
		req.Role = "student"
	}

	var center models.EducationCenter
	if err := database.DB.First(&center, centerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Markaz topilmadi"})
		return
	}

	var existing models.CenterMembership
	if err := database.DB.Where("center_id = ? AND user_id = ?", center.ID, userID).First(&existing).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{
			"message": "Siz avval bu markazga a'zolik so'rovi yuborgansiz",
			"status":  existing.Status,
		})
		return
	}

	membership := models.CenterMembership{
		CenterID: center.ID,
		UserID:   userID.(uint),
		Role:     req.Role,
		Status:   "pending",
	}

	database.DB.Create(&membership)
	c.JSON(http.StatusCreated, gin.H{
		"message":    "A'zolik so'rovi muvaffaqiyatli yuborildi",
		"membership": membership,
	})
}

func ApproveCenter(c *gin.Context) {
	centerID := c.Param("id")
	var center models.EducationCenter
	if err := database.DB.First(&center, centerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Markaz topilmadi"})
		return
	}

	center.Status = "approved"
	database.DB.Save(&center)

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("Markaz '%s' tasdiqlandi", center.Name), "center": center})
}

// ApproveStudent approves student membership in center
func ApproveStudent(c *gin.Context) {
	centerID := c.Param("id")
	var req MemberActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID majburiy"})
		return
	}

	var membership models.CenterMembership
	if err := database.DB.Where("center_id = ? AND user_id = ? AND role = 'student'", centerID, req.UserID).First(&membership).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "O'quvchi a'zolik so'rovi topilmadi"})
		return
	}

	membership.Status = "approved"
	database.DB.Save(&membership)

	c.JSON(http.StatusOK, gin.H{"message": "O'quvchi markazga muvaffaqiyatli qabul qilindi", "membership": membership})
}

// ApproveTeacher approves teacher membership in center
func ApproveTeacher(c *gin.Context) {
	centerID := c.Param("id")
	var req MemberActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID majburiy"})
		return
	}

	var membership models.CenterMembership
	if err := database.DB.Where("center_id = ? AND user_id = ? AND role = 'teacher'", centerID, req.UserID).First(&membership).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "O'qituvchi a'zolik so'rovi topilmadi"})
		return
	}

	membership.Status = "approved"
	database.DB.Save(&membership)

	// Ensure user has 'teacher' in roles list
	var user models.User
	if err := database.DB.First(&user, req.UserID).Error; err == nil {
		hasTeacher := false
		for _, r := range user.Roles {
			if r == "teacher" {
				hasTeacher = true
				break
			}
		}
		if !hasTeacher {
			user.Roles = append(user.Roles, "teacher")
			database.DB.Save(&user)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "O'qituvchi tasdiqlandi", "membership": membership})
}

// RejectMember rejects a membership request
func RejectMember(c *gin.Context) {
	centerID := c.Param("id")
	var req MemberActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID majburiy"})
		return
	}

	var membership models.CenterMembership
	if err := database.DB.Where("center_id = ? AND user_id = ?", centerID, req.UserID).First(&membership).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "A'zolik topilmadi"})
		return
	}

	membership.Status = "rejected"
	database.DB.Save(&membership)

	c.JSON(http.StatusOK, gin.H{"message": "A'zolik so'rovi rad etildi", "membership": membership})
}

// ListCenterMembers returns all members of a center
func ListCenterMembers(c *gin.Context) {
	centerID := c.Param("id")
	var members []models.CenterMembership
	database.DB.Preload("User").Where("center_id = ?", centerID).Find(&members)
	c.JSON(http.StatusOK, members)
}

// GetCenterStats returns statistics for a center
func GetCenterStats(c *gin.Context) {
	centerID := c.Param("id")

	var studentCount int64
	var teacherCount int64
	var olympiadCount int64

	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'student' AND status = 'approved'", centerID).Count(&studentCount)
	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'teacher' AND status = 'approved'", centerID).Count(&teacherCount)
	database.DB.Model(&models.Olympiad{}).Where("center_id = ?", centerID).Count(&olympiadCount)

	c.JSON(http.StatusOK, gin.H{
		"students_count":  studentCount,
		"teachers_count":  teacherCount,
		"olympiads_count": olympiadCount,
	})
}
