package handlers

import (
	"errors"
	"net/http"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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
	if err := database.DB.Where("is_active = ?", true).Find(&products).Error; err != nil {
		jsonError(c, http.StatusInternalServerError, "Mahsulotlarni yuklashda xatolik")
		return
	}
	c.JSON(http.StatusOK, products)
}

func RedeemProduct(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req RedeemRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Mahsulot tanlanishi shart")
		return
	}

	var product models.RewardProduct
	if err := database.DB.Where("id = ? AND is_active = ?", req.ProductID, true).First(&product).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Mahsulot topilmadi")
		return
	}

	var redemption models.RewardRedemption
	var newBalance int
	errInsufficientCoins := errors.New("insufficient coins")
	errOutOfStock := errors.New("out of stock")

	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		stockRes := tx.Model(&models.RewardProduct{}).
			Where("id = ? AND stock > 0", product.ID).
			Update("stock", gorm.Expr("stock - 1"))
		if stockRes.Error != nil {
			return stockRes.Error
		}
		if stockRes.RowsAffected == 0 {
			return errOutOfStock
		}

		coinRes := tx.Model(&models.User{}).
			Where("id = ? AND coins >= ?", userID, product.CostCoins).
			Update("coins", gorm.Expr("coins - ?", product.CostCoins))
		if coinRes.Error != nil {
			return coinRes.Error
		}
		if coinRes.RowsAffected == 0 {
			return errInsufficientCoins
		}

		var updatedUser models.User
		if err := tx.Select("coins").First(&updatedUser, userID).Error; err != nil {
			return err
		}
		newBalance = updatedUser.Coins

		redemption = models.RewardRedemption{
			UserID:    userID,
			ProductID: product.ID,
			CostCoins: product.CostCoins,
			Status:    "pending",
		}
		if err := tx.Create(&redemption).Error; err != nil {
			return err
		}

		coinTx := models.CoinTransaction{
			UserID:  userID,
			Amount:  -product.CostCoins,
			Balance: newBalance,
			Reason:  "Do'kondan xarid: " + product.Title,
		}
		return tx.Create(&coinTx).Error
	})

	if txErr != nil {
		switch {
		case errors.Is(txErr, errOutOfStock):
			jsonError(c, http.StatusBadRequest, "Mahsulot zaxirada qolmagan")
		case errors.Is(txErr, errInsufficientCoins):
			jsonError(c, http.StatusBadRequest, "Tangalaringiz yetarli emas!")
		default:
			jsonError(c, http.StatusInternalServerError, "Xaridni rasmiylashtirishda xatolik")
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Xarid muvaffaqiyatli amalga oshirildi! Menejer tez orada bog'lanadi.",
		"redemption": redemption,
		"new_coins":  newBalance,
	})
}

func GetDailyGoal(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

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
		if createErr := database.DB.Create(&goal).Error; createErr != nil {
			jsonError(c, http.StatusInternalServerError, "Kunlik maqsadni yaratishda xatolik")
			return
		}
	}

	c.JSON(http.StatusOK, goal)
}

func GetDailyQuestion(c *gin.Context) {
	today := time.Now().Format("2006-01-02")
	var dq models.DailyQuestion
	if err := database.DB.Where("date = ?", today).First(&dq).Error; err != nil {
		if err := database.DB.Order("id DESC").First(&dq).Error; err != nil {
			jsonError(c, http.StatusNotFound, "Kunlik savol topilmadi")
			return
		}
	}
	c.JSON(http.StatusOK, dq)
}

func AnswerDailyQuestion(c *gin.Context) {
	userID, ok := currentUserID(c)
	if !ok {
		jsonError(c, http.StatusUnauthorized, "Foydalanuvchi aniqlanmadi")
		return
	}

	var req AnswerDailyQuestionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		jsonError(c, http.StatusBadRequest, "Javobni kiriting")
		return
	}

	var dq models.DailyQuestion
	if err := database.DB.First(&dq, req.DailyQuestionID).Error; err != nil {
		jsonError(c, http.StatusNotFound, "Savol topilmadi")
		return
	}

	isCorrect := strings.TrimSpace(strings.ToLower(req.Answer)) == strings.TrimSpace(strings.ToLower(dq.CorrectAnswer))

	errAlreadyAnswered := errors.New("already answered")
	txErr := database.DB.Transaction(func(tx *gorm.DB) error {
		var existing models.DailyQuestionAnswer
		if err := tx.Where("user_id = ? AND daily_question_id = ?", userID, dq.ID).First(&existing).Error; err == nil {
			return errAlreadyAnswered
		}

		answer := models.DailyQuestionAnswer{
			UserID:          userID,
			DailyQuestionID: dq.ID,
			SelectedAnswer:  req.Answer,
			IsCorrect:       isCorrect,
		}
		if err := tx.Create(&answer).Error; err != nil {
			return err
		}

		if isCorrect {
			if err := tx.Model(&models.User{}).
				Where("id = ?", userID).
				Update("coins", gorm.Expr("coins + ?", dq.Points)).Error; err != nil {
				return err
			}
		}
		return nil
	})

	if txErr != nil {
		if errors.Is(txErr, errAlreadyAnswered) {
			jsonError(c, http.StatusBadRequest, "Bu kunlik savolga allaqachon javob bergansiz")
			return
		}
		jsonError(c, http.StatusInternalServerError, "Javobni saqlashda xatolik")
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"is_correct":  isCorrect,
		"explanation": dq.Explanation,
		"points":      dq.Points,
	})
}
