package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type RedeemRequest struct {
	ProductID uint `json:"product_id" binding:"required"`
}

type AnswerDailyQuestionRequest struct {
	DailyQuestionID uint   `json:"daily_question_id" binding:"required"`
	Answer          string `json:"answer" binding:"required"`
}

func ListRewardProducts(c *gin.Context) {
	var products []models.RewardProduct
	database.DB.Where("is_active = ?", true).Find(&products)
	c.JSON(http.StatusOK, products)
}

func RedeemProduct(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req RedeemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Mahsulot tanlanishi shart"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Foydalanuvchi topilmadi"})
		return
	}

	var product models.RewardProduct
	if err := database.DB.First(&product, req.ProductID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Mahsulot topilmadi"})
		return
	}

	if user.Coins < product.CostCoins {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Tangalaringiz yetarli emas!"})
		return
	}

	// Deduct coins
	newBalance := user.Coins - product.CostCoins
	database.DB.Model(&user).Update("coins", newBalance)

	// Create redemption
	redemption := models.RewardRedemption{
		UserID:    userID,
		ProductID: product.ID,
		CostCoins: product.CostCoins,
		Status:    "pending",
	}
	database.DB.Create(&redemption)

	// Log transaction
	tx := models.CoinTransaction{
		UserID:  userID,
		Amount:  -product.CostCoins,
		Balance: newBalance,
		Reason:  "Do'kondan xarid: " + product.Title,
	}
	database.DB.Create(&tx)

	c.JSON(http.StatusOK, gin.H{
		"message":    "Xarid muvaffaqiyatli amalga oshirildi! Menejer tez orada bog'lanadi.",
		"redemption": redemption,
		"new_coins":  newBalance,
	})
}

func GetDailyGoal(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	today := time.Now().Format("2006-01-02")
	var goal models.DailyGoal
	if err := database.DB.Where("user_id = ? AND date = ?", userID, today).First(&goal).Error; err != nil {
		goal = models.DailyGoal{
			UserID:         userID,
			Date:           today,
			TargetCount:    10,
			CompletedCount: 0,
			IsAchieved:     false,
		}
		database.DB.Create(&goal)
	}

	c.JSON(http.StatusOK, goal)
}

func GetDailyQuestion(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var dq models.DailyQuestion
	if err := database.DB.Where("date = ?", today).First(&dq).Error; err != nil {
		// Provide default if not present today
		database.DB.Order("id DESC").First(&dq)
	}
	c.JSON(http.StatusOK, dq)
}

func AnswerDailyQuestion(c *gin.Context) {
	userIDVal, _ := c.Get("userID")
	userID := userIDVal.(uint)

	var req AnswerDailyQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Javobni kiriting"})
		return
	}

	var dq models.DailyQuestion
	if err := database.DB.First(&dq, req.DailyQuestionID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Savol topilmadi"})
		return
	}

	isCorrect := strings.TrimSpace(strings.ToLower(req.Answer)) == strings.TrimSpace(strings.ToLower(dq.CorrectAnswer))

	answer := models.DailyQuestionAnswer{
		UserID:          userID,
		DailyQuestionID: dq.ID,
		SelectedAnswer:  req.Answer,
		IsCorrect:       isCorrect,
	}
	database.DB.Create(&answer)

	if isCorrect {
		database.DB.Model(&models.User{}).Where("id = ?", userID).Update("coins", database.DB.Raw("coins + ?", dq.Points))
	}

	c.JSON(http.StatusOK, gin.H{
		"is_correct":  isCorrect,
		"explanation": dq.Explanation,
		"points":      dq.Points,
	})
}
