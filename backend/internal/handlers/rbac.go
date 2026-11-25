package handlers

import (
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"

	"github.com/gin-gonic/gin"
)

func currentUserID(c *gin.Context) (uint, bool) {
	val, exists := c.Get("userID")
	if !exists {
		return 0, false
	}
	id, ok := val.(uint)
	return id, ok && id > 0
}

func currentUserIsAdmin(c *gin.Context) bool {
	val, exists := c.Get("isAdmin")
	if !exists {
		return false
	}
	isAdmin, ok := val.(bool)
	return ok && isAdmin
}

func userIsStaff(c *gin.Context) bool {
	if currentUserIsAdmin(c) {
		return true
	}
	rolesVal, ok := c.Get("roles")
	if !ok {
		return false
	}
	roles, ok := rolesVal.([]string)
	if !ok {
		return false
	}
	for _, r := range roles {
		if r == "admin" || r == "owner" || r == "manager" || r == "teacher" {
			return true
		}
	}
	return false
}

// canManageCenter reports whether the authenticated caller can manage centerID.
func canManageCenter(c *gin.Context, centerID uint, allowTeacher bool) bool {
	if currentUserIsAdmin(c) {
		return true
	}
	userID, ok := currentUserID(c)
	if !ok || centerID == 0 {
		return false
	}

	var center models.EducationCenter
	if err := database.DB.Select("id, owner_id").First(&center, centerID).Error; err == nil && center.OwnerID == userID {
		return true
	}

	allowedRoles := []string{"owner", "manager"}
	if allowTeacher {
		allowedRoles = append(allowedRoles, "teacher")
	}
	var count int64
	if err := database.DB.Model(&models.CenterMembership{}).
		Where("center_id = ? AND user_id = ? AND status = ? AND role IN ?", centerID, userID, "approved", allowedRoles).
		Count(&count).Error; err == nil && count > 0 {
		return true
	}
	return false
}

// userManagedCenterIDs returns center IDs owned or staffed by userID.
func userManagedCenterIDs(userID uint, roles ...string) []uint {
	seen := make(map[uint]bool)

	var owned []models.EducationCenter
	if err := database.DB.Select("id").Where("owner_id = ?", userID).Find(&owned).Error; err == nil {
		for _, c := range owned {
			seen[c.ID] = true
		}
	}

	if len(roles) > 0 {
		var memberships []models.CenterMembership
		if err := database.DB.Select("center_id").
			Where("user_id = ? AND status = ? AND role IN ?", userID, "approved", roles).
			Find(&memberships).Error; err == nil {
			for _, m := range memberships {
				seen[m.CenterID] = true
			}
		}
	}

	ids := make([]uint, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	return ids
}
