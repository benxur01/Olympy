package database

import (
	"log"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"

	"gorm.io/gorm"
)

func SeedDatabase(db *gorm.DB) {
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return // already seeded
	}

	log.Println("Seeding initial demo data for Olympy...")

	// 1. Users
	adminPassword, _ := utils.HashPassword("admin123")
	teacherPassword, _ := utils.HashPassword("teacher123")
	studentPassword, _ := utils.HashPassword("student123")

	admin := models.User{
		FullName:        "Platform Admin",
		Phone:           "+998901234567",
		NormalizedPhone: "+998901234567",
		Password:        adminPassword,
		Roles:           []string{"admin"},
		IsPlatformAdmin: true,
		IsPremium:       true,
		Coins:           1000,
	}
	db.Create(&admin)

	teacher := models.User{
		FullName:        "Umar O'qituvchi",
		Phone:           "+998901112233",
		NormalizedPhone: "+998901112233",
		Password:        teacherPassword,
		Roles:           []string{"teacher"},
		Coins:           250,
	}
	db.Create(&teacher)

	student := models.User{
		FullName:        "Ali Talaba",
		Phone:           "+998909998877",
		NormalizedPhone: "+998909998877",
		Password:        studentPassword,
		Roles:           []string{"student"},
		Coins:           100,
	}
	db.Create(&student)

	// 2. Subjects
	mathSubject := models.Subject{Name: "Matematika", Slug: "matematika", Icon: "calculator"}
	physicsSubject := models.Subject{Name: "Fizika", Slug: "fizika", Icon: "atom"}
	csSubject := models.Subject{Name: "Informatika", Slug: "informatika", Icon: "code"}
	db.Create(&mathSubject)
	db.Create(&physicsSubject)
	db.Create(&csSubject)

	// 3. Center
	center := models.EducationCenter{
		Name:        "Registon O'quv Markazi",
		Slug:        "registon",
		Description: "Toshkent shahridagi yetakchi zamonaviy ta'lim markazi",
		Address:     "Toshkent sh., Chilonzor tumani",
		Phone:       "+998712000000",
		OwnerID:     admin.ID,
		Status:      "approved",
		IsPremium:   true,
		Rating:      4.9,
	}
	db.Create(&center)

	// Center Membership
	membership := models.CenterMembership{
		CenterID: center.ID,
		UserID:   student.ID,
		Role:     "student",
		Status:   "approved",
	}
	db.Create(&membership)

	// 4. Olympiad
	olympiad := models.Olympiad{
		Title:           "Respublika Matematika Olimpiadasi 2025",
		Description:     "Iqtidorli yoshlar o'rtasida matematika fani bo'yicha saralash musobaqasi",
		CenterID:        &center.ID,
		SubjectID:       &mathSubject.ID,
		DurationMinutes: 45,
		PassingScore:    60,
		MaxScore:        100,
		Status:          "published",
		IsPublic:        true,
	}
	db.Create(&olympiad)

	// 5. Questions
	q1 := models.Question{
		OlympiadID:    &olympiad.ID,
		CenterID:      &center.ID,
		Text:          "2x + 6 = 20 tenglamaning yechimini toping:",
		QuestionType:  "single",
		OptionsJSON:   []string{"5", "7", "8", "10"},
		CorrectAnswer: "7",
		Points:        30,
		Order:         1,
		Explanation:   "2x = 14 => x = 7",
	}
	q2 := models.Question{
		OlympiadID:    &olympiad.ID,
		CenterID:      &center.ID,
		Text:          "Qaysi son tub son hisoblanadi?",
		QuestionType:  "single",
		OptionsJSON:   []string{"9", "15", "17", "21"},
		CorrectAnswer: "17",
		Points:        30,
		Order:         2,
		Explanation:   "17 soni faqat 1 ga va o'ziga bo'linadi.",
	}
	q3 := models.Question{
		OlympiadID:    &olympiad.ID,
		CenterID:      &center.ID,
		Text:          "Kvadratning tomoni 6 sm bo'lsa, uning yuzini hisoblang:",
		QuestionType:  "single",
		OptionsJSON:   []string{"24", "30", "36", "48"},
		CorrectAnswer: "36",
		Points:        40,
		Order:         3,
		Explanation:   "S = a * a = 6 * 6 = 36",
	}
	db.Create(&q1)
	db.Create(&q2)
	db.Create(&q3)

	log.Println("Demo seed data created successfully!")
}
