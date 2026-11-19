package services

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/models"
	"time"
)

const OTPTTLSeconds = 300 // 5 minutes
const MaxOTPAttempts = 5

// GenerateAndSaveOTP creates a 6-digit code and saves it
func GenerateAndSaveOTP(phone string, purpose string, email string) (string, error) {
	// Generate 6 digit code (100000 - 999999)
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "", err
	}
	code := fmt.Sprintf("%06d", n.Int64()+100000)

	// Invalidate previous active OTPs for this phone & purpose
	database.DB.Model(&models.OTPVerification{}).
		Where("phone = ? AND purpose = ? AND is_used = ?", phone, purpose, false).
		Update("is_used", true)

	otpRecord := models.OTPVerification{
		Phone:     phone,
		Code:      code,
		Purpose:   purpose,
		Email:     email,
		Attempts:  0,
		IsUsed:    false,
		ExpiresAt: time.Now().Add(time.Duration(OTPTTLSeconds) * time.Second),
	}

	if err := database.DB.Create(&otpRecord).Error; err != nil {
		return "", err
	}

	return code, nil
}

// VerifyOTP checks the code, attempts limit, and expiration
func VerifyOTP(phone string, purpose string, inputCode string) (bool, error) {
	var record models.OTPVerification
	err := database.DB.Where("phone = ? AND purpose = ? AND is_used = ?", phone, purpose, false).
		Order("id DESC").
		First(&record).Error

	if err != nil {
		return false, errors.New("tasdiqlash kodi topilmadi yoki eskirgan")
	}

	if time.Now().After(record.ExpiresAt) {
		record.IsUsed = true
		database.DB.Save(&record)
		return false, errors.New("kodning amal qilish muddati tugagan (5 daqiqa)")
	}

	if record.Attempts >= MaxOTPAttempts {
		record.IsUsed = true
		database.DB.Save(&record)
		return false, errors.New("noto'g'ri urinishlar soni oshib ketdi (maksimal 5 marta)")
	}

	record.Attempts++
	if record.Code != inputCode {
		database.DB.Save(&record)
		return false, errors.New("noto'g'ri kod kiritildi")
	}

	record.IsUsed = true
	database.DB.Save(&record)
	return true, nil
}
