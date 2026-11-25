package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

func GetMe(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	c.JSON(http.StatusOK, SerializeUser(user))
}

func UpdateMe(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	var req struct {
		FullName  string  `json:"full_name"`
		FirstName string  `json:"first_name"`
		LastName  string  `json:"last_name"`
		Username  *string `json:"username"`
		Email     *string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Ma'lumotlar noto'g'ri")
		return
	}

	updates := map[string]interface{}{}
	if strings.TrimSpace(req.FullName) != "" {
		updates["full_name"] = strings.TrimSpace(req.FullName)
	}
	if req.FirstName != "" {
		updates["first_name"] = strings.TrimSpace(req.FirstName)
	}
	if req.LastName != "" {
		updates["last_name"] = strings.TrimSpace(req.LastName)
	}
	if req.Username != nil && strings.TrimSpace(*req.Username) != "" {
		u := strings.TrimSpace(*req.Username)
		updates["username"] = &u
	}
	if req.Email != nil && strings.TrimSpace(*req.Email) != "" {
		e := strings.TrimSpace(*req.Email)
		updates["email"] = &e
	}

	if len(updates) > 0 {
		if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
			jsonError(c, http.StatusConflict, "Foydalanuvchi nomi yoki email band")
			return
		}
		if err := database.DB.First(&user, userID).Error; err != nil {
			jsonError(c, http.StatusInternalServerError, "Profilni yuklashda xatolik")
			return
		}
	}

	c.JSON(http.StatusOK, SerializeUser(user))
}

func ChangePassword(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req struct {
		OldPassword     string `json:"old_password"`
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Yangi parol kamida 6 ta belgidan iborat bo'lsin")
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	oldPass := req.OldPassword
	if oldPass == "" {
		oldPass = req.CurrentPassword
	}
	if user.Password != "" && (oldPass == "" || !utils.CheckPasswordHash(oldPass, user.Password)) {
		jsonError(c, http.StatusBadRequest, "Joriy parol noto'g'ri")
		return
	}

	hashed, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		jsonError(c, http.StatusInternalServerError, "Parolni saqlashda xatolik")
		return
	}
	if err := database.DB.Model(&user).Update("password", hashed).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Parolni yangilashda xatolik")
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Parol muvaffaqiyatli o'zgartirildi"})
}

func CompleteOnboardingFlag(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}
	if err := database.DB.Model(&models.User{}).Where("id = ?", userID).Update("onboarding_completed", true).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Yangilashda xatolik")
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "onboarding_completed": true})
}

func GetActivityLeaderboard(c *gin.Context) {
	var users []models.User
	if err := database.DB.Where("is_active = ?", true).Order("coins DESC, streak_count DESC").Limit(20).Find(&users).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Reytingni yuklashda xatolik")
		return
	}
	res := make([]gin.H, 0, len(users))
	for i, u := range users {
		res = append(res, gin.H{
			"rank":         i + 1,
			"user_id":      u.ID,
			"full_name":    u.FullName,
			"coins":        u.Coins,
			"streak_count": u.StreakCount,
			"avatar_url":   u.AvatarURL,
			"is_premium":   u.IsPremium,
		})
	}
	c.JSON(http.StatusOK, res)
}

func GetMyFlashAlert(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"alert": nil})
}

func GetMyPredictions(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"predicted_score": 82,
		"trend":           "up",
		"recommendation":  "Matematika va mantiqiy masalalarga ko'proq e'tibor bering.",
	})
}

func GetMyRewards(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Foydalanuvchi topilmadi")
		return
	}

	var products []models.RewardProduct
	database.DB.Where("is_active = ?", true).Find(&products)

	c.JSON(http.StatusOK, gin.H{
		"coins":    user.Coins,
		"products": products,
	})
}

func GetMyRedemptions(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}
	var redemptions []models.RewardRedemption
	if err := database.DB.Preload("Product").Where("user_id = ?", userID).Order("id DESC").Find(&redemptions).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Xaridlar tarixini yuklashda xatolik")
		return
	}
	c.JSON(http.StatusOK, redemptions)
}

func GetTeacherStudents(c *gin.Context) {
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Faqat o'qituvchi va markaz xodimlari uchun")
		return
	}
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var members []models.CenterMembership
	query := database.DB.Preload("User").Where("role = 'student' AND status = 'approved'")
	if !currentUserIsAdmin(c) {
		centerIDs := userManagedCenterIDs(userID, "owner", "manager", "teacher")
		if len(centerIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"results": []gin.H{}})
			return
		}
		query = query.Where("center_id IN ?", centerIDs)
	}
	query.Find(&members)

	results := make([]gin.H, 0, len(members))
	for _, m := range members {
		results = append(results, gin.H{
			"id":        m.User.ID,
			"full_name": m.User.FullName,
			"phone":     m.User.Phone,
			"coins":     m.User.Coins,
			"subject":   m.Subject,
		})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}

func GetTeacherOlympiads(c *gin.Context) {
	if !userIsStaff(c) {
		jsonError(c, http.StatusForbidden, "Faqat o'qituvchi va markaz xodimlari uchun")
		return
	}
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var olympiads []models.Olympiad
	query := database.DB.Order("id DESC")
	if !currentUserIsAdmin(c) {
		centerIDs := userManagedCenterIDs(userID, "owner", "manager", "teacher")
		if len(centerIDs) == 0 {
			c.JSON(http.StatusOK, gin.H{"results": []gin.H{}})
			return
		}
		query = query.Where("center_id IN ?", centerIDs)
	}
	query.Find(&olympiads)

	results := make([]gin.H, 0, len(olympiads))
	for _, o := range olympiads {
		var count int64
		database.DB.Model(&models.TestAttempt{}).Where("olympiad_id = ?", o.ID).Count(&count)
		results = append(results, gin.H{
			"olympiad_id":        o.ID,
			"id":                 o.ID,
			"title":              o.Title,
			"participants_count": count,
		})
	}
	c.JSON(http.StatusOK, gin.H{"results": results})
}
