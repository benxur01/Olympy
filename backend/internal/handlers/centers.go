package handlers

import (
	"fmt"
	"net/http"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

type CreateCenterRequest struct {
	Name             string   `json:"name" binding:"required"`
	Description      string   `json:"description"`
	OrganizationType string   `json:"organization_type"`
	Country          string   `json:"country"`
	Region           string   `json:"region"`
	District         string   `json:"district"`
	City             string   `json:"city"`
	Address          string   `json:"address"`
	Phone            string   `json:"phone"`
	Subjects         []string `json:"subjects"`
}

type JoinCenterRequest struct {
	Role    string `json:"role"`
	Subject string `json:"subject"`
}

type MemberActionRequest struct {
	UserID       interface{} `json:"user_id"`
	MembershipID interface{} `json:"membership_id"`
}

func serializeCenters(centers []models.EducationCenter) []gin.H {
	out := make([]gin.H, 0, len(centers))
	for _, center := range centers {
		out = append(out, SerializeCenter(center))
	}
	return out
}

func ListCenters(c *gin.Context) {
	var centers []models.EducationCenter
	query := database.DB.Preload("Owner")
	if status := c.Query("status"); status != "" && status != "all" {
		query = query.Where("status = ?", status)
	} else if c.Query("all") != "true" && c.Request.URL.Path != "/api/admin/centers/" {
		query = query.Where("status = ?", "approved")
	}
	query.Order("id DESC").Find(&centers)

	c.JSON(http.StatusOK, serializeCenters(centers))
}

func GetMyCenters(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var memberships []models.CenterMembership
	database.DB.Where("user_id = ?", userID).Find(&memberships)

	centerIDMap := make(map[uint]bool)
	for _, m := range memberships {
		centerIDMap[m.CenterID] = true
	}

	var owned []models.EducationCenter
	database.DB.Preload("Owner").Where("owner_id = ?", userID).Find(&owned)
	for _, oc := range owned {
		centerIDMap[oc.ID] = true
	}

	if len(centerIDMap) == 0 {
		c.JSON(http.StatusOK, []gin.H{})
		return
	}

	ids := make([]uint, 0, len(centerIDMap))
	for id := range centerIDMap {
		ids = append(ids, id)
	}

	var centers []models.EducationCenter
	database.DB.Preload("Owner").Where("id IN ?", ids).Find(&centers)
	c.JSON(http.StatusOK, serializeCenters(centers))
}

// GetCenterRouter dispatches /api/centers/:id/ safely without Gin radix-tree conflicts.
func GetCenterRouter(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		switch c.Param("id") {
		case "ranking":
			GetCenterRanking(c)
		case "ratings":
			GetCenterRatings(c)
		case "mine":
			authHeader := c.GetHeader("Authorization")
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				jsonError(c, http.StatusUnauthorized, "Authorization sarlavhasi talab qilinadi")
				return
			}
			claims, err := utils.ValidateToken(parts[1], cfg.JWTSecret)
			if err != nil {
				jsonError(c, http.StatusUnauthorized, "Yaroqsiz yoki muddati o'tgan token")
				return
			}
			c.Set("userID", claims.UserID)
			GetMyCenters(c)
		default:
			GetCenter(c)
		}
	}
}

func GetCenter(c *gin.Context) {
	id := c.Param("id")
	var center models.EducationCenter
	if err := database.DB.Preload("Owner").First(&center, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Markaz topilmadi")
		return
	}
	c.JSON(http.StatusOK, SerializeCenter(center))
}

func CreateCenter(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req CreateCenterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Nom majburiy")
		return
	}

	orgType := req.OrganizationType
	if orgType == "" {
		orgType = "O'quv markaz"
	}
	country := req.Country
	if country == "" {
		country = "O'zbekiston"
	}

	center := models.EducationCenter{
		Name:             req.Name,
		Slug:             slugify(req.Name),
		Description:      req.Description,
		OrganizationType: orgType,
		Country:          country,
		Region:           req.Region,
		District:         req.District,
		City:             req.City,
		Address:          req.Address,
		Phone:            req.Phone,
		Subjects:         models.StringArray(req.Subjects),
		OwnerID:          userID,
		Status:           "pending",
	}

	if err := database.DB.Create(&center).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Markazni saqlashda xatolik")
		return
	}

	database.DB.Create(&models.CenterMembership{
		CenterID: center.ID,
		UserID:   userID,
		Role:     "owner",
		Status:   "pending",
	})
	database.DB.Preload("Owner").First(&center, center.ID)

	c.JSON(http.StatusCreated, SerializeCenter(center))
}

func UpdateCenter(c *gin.Context) {
	id := c.Param("id")
	var center models.EducationCenter
	if err := database.DB.Preload("Owner").First(&center, id).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Markaz topilmadi")
		return
	}

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		jsonError(c, http.StatusBadRequest, "Noto'g'ri ma'lumot")
		return
	}

	allowed := map[string]interface{}{}
	for _, key := range []string{"name", "description", "organization_type", "country", "region", "district", "city", "address", "phone", "is_premium", "logo_url", "status"} {
		if v, ok := updates[key]; ok {
			allowed[key] = v
		}
	}
	if len(allowed) > 0 {
		database.DB.Model(&center).Updates(allowed)
		database.DB.Preload("Owner").First(&center, id)
	}
	c.JSON(http.StatusOK, SerializeCenter(center))
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
		jsonError(c, http.StatusNotFound, "Markaz topilmadi")
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
		Subject:  req.Subject,
		Status:   "pending",
	}

	database.DB.Create(&membership)
	c.JSON(http.StatusCreated, gin.H{
		"message":    "A'zolik so'rovi muvaffaqiyatli yuborildi",
		"membership": membership,
	})
}

func setCenterStatus(c *gin.Context, status string, msgFmt string) {
	centerID := c.Param("id")
	var center models.EducationCenter
	if err := database.DB.Preload("Owner").First(&center, centerID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Markaz topilmadi")
		return
	}

	database.DB.Model(&center).Update("status", status)
	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'owner'", center.ID).Update("status", status)
	database.DB.Preload("Owner").First(&center, center.ID)

	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf(msgFmt, center.Name),
		"center":  SerializeCenter(center),
	})
}

func ApproveCenter(c *gin.Context) {
	setCenterStatus(c, "approved", "Markaz '%s' tasdiqlandi")
}

func RejectCenter(c *gin.Context) {
	setCenterStatus(c, "rejected", "Markaz '%s' rad etildi")
}

func resolveMembership(centerID string, req MemberActionRequest, role string) (*models.CenterMembership, error) {
	var membership models.CenterMembership
	if mID, ok := parseFlexUint(req.MembershipID); ok {
		err := database.DB.Where("id = ? AND center_id = ?", mID, centerID).First(&membership).Error
		return &membership, err
	}
	if uID, ok := parseFlexUint(req.UserID); ok {
		q := database.DB.Where("center_id = ? AND user_id = ?", centerID, uID)
		if role != "" {
			q = q.Where("role = ?", role)
		}
		err := q.First(&membership).Error
		return &membership, err
	}
	return nil, fmt.Errorf("missing user_id or membership_id")
}

func approveMembershipRole(c *gin.Context, role string, msg string) {
	centerID := c.Param("id")
	var req MemberActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "User ID majburiy")
		return
	}

	membership, err := resolveMembership(centerID, req, role)
	if err != nil {
		jsonError(c, http.StatusNotFound, "A'zolik so'rovi topilmadi")
		return
	}

	membership.Status = "approved"
	database.DB.Save(membership)

	var user models.User
	if err := database.DB.First(&user, membership.UserID).Error; err == nil {
		hasRole := false
		for _, r := range user.Roles {
			if r == role {
				hasRole = true
				break
			}
		}
		if !hasRole {
			user.Roles = append(user.Roles, role)
			database.DB.Save(&user)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": msg, "membership": membership})
}

func ApproveStudent(c *gin.Context) {
	approveMembershipRole(c, "student", "O'quvchi markazga muvaffaqiyatli qabul qilindi")
}

func ApproveTeacher(c *gin.Context) {
	approveMembershipRole(c, "teacher", "O'qituvchi tasdiqlandi")
}

func ApproveManager(c *gin.Context) {
	approveMembershipRole(c, "manager", "Manager tasdiqlandi")
}

func RejectMember(c *gin.Context) {
	centerID := c.Param("id")
	var req MemberActionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "User ID majburiy")
		return
	}

	membership, err := resolveMembership(centerID, req, "")
	if err != nil {
		jsonError(c, http.StatusNotFound, "A'zolik topilmadi")
		return
	}

	membership.Status = "rejected"
	database.DB.Save(membership)

	c.JSON(http.StatusOK, gin.H{"message": "A'zolik so'rovi rad etildi", "membership": membership})
}

func serializeMemberships(members []models.CenterMembership) []gin.H {
	out := make([]gin.H, 0, len(members))
	for _, m := range members {
		out = append(out, gin.H{
			"id":            m.ID,
			"membership_id": m.ID,
			"center_id":     m.CenterID,
			"center_name":   m.Center.Name,
			"user_id":       m.UserID,
			"full_name":     m.User.FullName,
			"name":          m.User.FullName,
			"phone":         m.User.Phone,
			"role":          m.Role,
			"subject":       m.Subject,
			"status":        m.Status,
			"created_at":    m.CreatedAt,
		})
	}
	return out
}

func ListCenterMembers(c *gin.Context) {
	centerID := c.Param("id")
	var members []models.CenterMembership
	query := database.DB.Preload("User").Preload("Center").Where("center_id = ?", centerID)
	if role := c.Query("role"); role != "" {
		query = query.Where("role = ?", role)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	query.Find(&members)
	c.JSON(http.StatusOK, serializeMemberships(members))
}

func GetPendingMemberships(c *gin.Context) {
	centerID := c.Param("id")
	var members []models.CenterMembership
	query := database.DB.Preload("User").Preload("Center").Where("center_id = ? AND status = 'pending'", centerID)
	if role := c.Query("role"); role != "" {
		query = query.Where("role = ?", role)
	}
	query.Find(&members)
	c.JSON(http.StatusOK, serializeMemberships(members))
}

func GetStaffMemberships(c *gin.Context) {
	centerID := c.Param("id")
	var members []models.CenterMembership
	query := database.DB.Preload("User").Preload("Center").Where("center_id = ? AND role IN ?", centerID, []string{"teacher", "manager"})
	if role := c.Query("role"); role != "" {
		query = query.Where("role = ?", role)
	}
	query.Find(&members)
	c.JSON(http.StatusOK, serializeMemberships(members))
}

func GetStudentMemberships(c *gin.Context) {
	centerID := c.Param("id")
	var members []models.CenterMembership
	query := database.DB.Preload("User").Preload("Center").Where("center_id = ? AND role = 'student'", centerID)
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	query.Find(&members)
	c.JSON(http.StatusOK, serializeMemberships(members))
}

func GetAdminPendingMemberships(c *gin.Context) {
	var members []models.CenterMembership
	database.DB.Preload("User").Preload("Center").Where("status = 'pending'").Find(&members)
	c.JSON(http.StatusOK, serializeMemberships(members))
}

func GetCenterStats(c *gin.Context) {
	centerID := c.Param("id")

	var studentCount, teacherCount, olympiadCount int64
	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'student' AND status = 'approved'", centerID).Count(&studentCount)
	database.DB.Model(&models.CenterMembership{}).Where("center_id = ? AND role = 'teacher' AND status = 'approved'", centerID).Count(&teacherCount)
	database.DB.Model(&models.Olympiad{}).Where("center_id = ?", centerID).Count(&olympiadCount)

	c.JSON(http.StatusOK, gin.H{
		"students_count":  studentCount,
		"teachers_count":  teacherCount,
		"olympiads_count": olympiadCount,
	})
}

func GetCenterRanking(c *gin.Context) {
	var centers []models.EducationCenter
	database.DB.Preload("Owner").Where("status = ?", "approved").Order("rating DESC").Find(&centers)
	c.JSON(http.StatusOK, serializeCenters(centers))
}

func GetCenterRatings(c *gin.Context) {
	var centers []models.EducationCenter
	database.DB.Preload("Owner").Where("status = ?", "approved").Order("rating DESC").Find(&centers)
	c.JSON(http.StatusOK, gin.H{"results": serializeCenters(centers)})
}
