package services

import (
	"crypto/rand"
	"crypto/subtle"
	"errors"
	"fmt"
	"math/big"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"strings"
	"time"

	"gorm.io/gorm"
)

const OTPTTLSeconds = 300 // 5 minutes
const MaxOTPAttempts = 5

// GenerateAndSaveOTP creates a 6-digit code and persists it atomically.
func GenerateAndSaveOTP(phone string, purpose string, email string) (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	code := fmt.Sprintf("%06d", n.Int64()+100000)

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.OTPVerification{}).
			Where("phone = ? AND purpose = ? AND is_used = ?", phone, purpose, false).
			Update("is_used", true).Error; err != nil {
			return err
		}

		otpRecord := models.OTPVerification{
			Phone:     phone,
			Code:      code,
			Purpose:   purpose,
			Email:     email,
			Attempts:  0,
			IsUsed:    false,
			ExpiresAt: time.Now().Add(time.Duration(OTPTTLSeconds) * time.Second),
		}
		return tx.Create(&otpRecord).Error
	})
	if err != nil {
		return "", err
	}

	return code, nil
}

// VerifyOTP atomically validates code, enforces attempts limit, and prevents replay.
func VerifyOTP(phone string, purpose string, inputCode string) (bool, error) {
	var verifyErr error
	var verified bool

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var record models.OTPVerification
		if err := tx.Where("phone = ? AND purpose = ? AND is_used = ?", phone, purpose, false).
			Order("id DESC").
			First(&record).Error; err != nil {
			verifyErr = errors.New("tasdiqlash kodi topilmadi yoki eskirgan")
			return nil
		}

		if time.Now().After(record.ExpiresAt) {
			if err := tx.Model(&record).Update("is_used", true).Error; err != nil {
				return err
			}
			verifyErr = errors.New("kodning amal qilish muddati tugagan (5 daqiqa)")
			return nil
		}

		if record.Attempts >= MaxOTPAttempts {
			if err := tx.Model(&record).Update("is_used", true).Error; err != nil {
				return err
			}
			verifyErr = errors.New("noto'g'ri urinishlar soni oshib ketdi (maksimal 5 marta)")
			return nil
		}

		cleanInput := strings.TrimSpace(inputCode)
		if subtle.ConstantTimeCompare([]byte(record.Code), []byte(cleanInput)) != 1 {
			if err := tx.Model(&record).Update("attempts", gorm.Expr("attempts + 1")).Error; err != nil {
				return err
			}
			verifyErr = errors.New("noto'g'ri kod kiritildi")
			return nil
		}

		res := tx.Model(&models.OTPVerification{}).
			Where("id = ? AND is_used = ?", record.ID, false).
			Updates(map[string]interface{}{
				"is_used":  true,
				"attempts": gorm.Expr("attempts + 1"),
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			verifyErr = errors.New("tasdiqlash kodi allaqachon ishlatilgan")
			return nil
		}

		verified = true
		return nil
	})
	if err != nil {
		return false, err
	}
	if verifyErr != nil {
		return false, verifyErr
	}
	return verified, nil
}
