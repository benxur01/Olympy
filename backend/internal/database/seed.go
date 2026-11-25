package database

import (
	"log"
	"olympy-backend-go/internal/models"
	"olympy-backend-go/internal/utils"
	"time"

	"gorm.io/gorm"
)

func SeedDatabase(db *gorm.DB) {
	var count int64
	db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return // already seeded
	}

	log.Println("Seeding initial demo data for Olympy...")

	// 1. Users (admin, owner, teacher, student)
	adminPassword, _ := utils.HashPassword("admin123")
	ownerPassword, _ := utils.HashPassword("owner123")
	teacherPassword, _ := utils.HashPassword("teacher123")
	studentPassword, _ := utils.HashPassword("student123")

	admin := models.User{
		FullName:            "Platform Admin",
		FirstName:           "Platform",
		LastName:            "Admin",
		Phone:               "+998901234567",
		NormalizedPhone:     "+998901234567",
		Password:            adminPassword,
		Roles:               models.StringArray{"admin"},
		IsPlatformAdmin:     true,
		IsActive:            true,
		IsPremium:           true,
		Coins:               1000,
		StreakCount:         7,
		OnboardingCompleted: true,
	}
	db.Create(&admin)

	owner := models.User{
		FullName:            "Sardor Direktor",
		FirstName:           "Sardor",
		LastName:            "Direktor",
		Phone:               "+998902223344",
		NormalizedPhone:     "+998902223344",
		Password:            ownerPassword,
		Roles:               models.StringArray{"owner"},
		IsActive:            true,
		IsPremium:           true,
		Coins:               500,
		OnboardingCompleted: true,
	}
	db.Create(&owner)

	teacher := models.User{
		FullName:            "Umar O'qituvchi",
		FirstName:           "Umar",
		LastName:            "O'qituvchi",
		Phone:               "+998901112233",
		NormalizedPhone:     "+998901112233",
		Password:            teacherPassword,
		Roles:               models.StringArray{"teacher"},
		IsActive:            true,
		Coins:               250,
		OnboardingCompleted: true,
	}
	db.Create(&teacher)

	student := models.User{
		FullName:            "Ali Talaba",
		FirstName:           "Ali",
		LastName:            "Talaba",
		Phone:               "+998909998877",
		NormalizedPhone:     "+998909998877",
		Password:            studentPassword,
		Roles:               models.StringArray{"student"},
		IsActive:            true,
		Coins:               100,
		StreakCount:         3,
		OnboardingCompleted: true,
	}
	db.Create(&student)

	// 2. Subjects
	mathSubject := models.Subject{Name: "Matematika", Slug: "matematika", Icon: "calculator"}
	physicsSubject := models.Subject{Name: "Fizika", Slug: "fizika", Icon: "atom"}
	csSubject := models.Subject{Name: "Informatika", Slug: "informatika", Icon: "code"}
	engSubject := models.Subject{Name: "Ingliz tili", Slug: "ingliz-tili", Icon: "book"}
	db.Create(&mathSubject)
	db.Create(&physicsSubject)
	db.Create(&csSubject)
	db.Create(&engSubject)

	// 3. Center
	center := models.EducationCenter{
		Name:             "Registon O'quv Markazi",
		Slug:             "registon",
		Description:      "Toshkent shahridagi yetakchi zamonaviy ta'lim markazi",
		OrganizationType: "O'quv markaz",
		Country:          "O'zbekiston",
		Region:           "Toshkent shahri",
		District:         "Chilonzor",
		City:             "Chilonzor",
		Address:          "Toshkent sh., Chilonzor tumani",
		Phone:            "+998712000000",
		Subjects:         models.StringArray{"Matematika", "Fizika", "Informatika"},
		OwnerID:          owner.ID,
		Status:           "approved",
		IsPremium:        true,
		Rating:           4.9,
	}
	db.Create(&center)

	// Center Memberships (Owner, Teacher, Student all approved so every demo role enters its dashboard)
	db.Create(&models.CenterMembership{
		CenterID: center.ID,
		UserID:   owner.ID,
		Role:     "owner",
		Status:   "approved",
	})
	db.Create(&models.CenterMembership{
		CenterID: center.ID,
		UserID:   teacher.ID,
		Role:     "teacher",
		Subject:  "Matematika",
		Status:   "approved",
	})
	db.Create(&models.CenterMembership{
		CenterID: center.ID,
		UserID:   student.ID,
		Role:     "student",
		Subject:  "Matematika",
		Status:   "approved",
	})

	// 4. Active Public Olympiad
	startedAt := time.Now().Add(-5 * time.Minute)
	olympiad := models.Olympiad{
		Title:           "Respublika Matematika Olimpiadasi 2025",
		Description:     "Iqtidorli yoshlar o'rtasida matematika fani bo'yicha ochiq olimpiada",
		CenterID:        &center.ID,
		SubjectID:       &mathSubject.ID,
		SubjectName:     "Matematika",
		EventType:       "olympiad",
		TestType:        "multiple_choice",
		TestLevel:       "O'rta",
		ExamFormat:      "standard",
		DurationMinutes: 45,
		PassingScore:    60,
		MaxScore:        100,
		Status:          "active",
		IsPublic:        true,
		StartTime:       &startedAt,
	}
	db.Create(&olympiad)

	// 5. Seed 5 real Olympiad Questions (MCQ answers stored as index "0".."3" and text-compatible)
	questions := []models.Question{
		{
			OlympiadID:    &olympiad.ID,
			CenterID:      &center.ID,
			Subject:       "Matematika",
			Difficulty:    "easy",
			Text:          "2x + 6 = 20 tenglamaning yechimini toping:",
			QuestionType:  "multiple_choice",
			OptionsJSON:   models.StringArray{"5", "7", "8", "10"},
			CorrectAnswer: "7",
			Points:        20,
			Order:         1,
			Explanation:   "2x = 14 => x = 7",
		},
		{
			OlympiadID:    &olympiad.ID,
			CenterID:      &center.ID,
			Subject:       "Matematika",
			Difficulty:    "easy",
			Text:          "Qaysi son tub son hisoblanadi?",
			QuestionType:  "multiple_choice",
			OptionsJSON:   models.StringArray{"9", "15", "17", "21"},
			CorrectAnswer: "17",
			Points:        20,
			Order:         2,
			Explanation:   "17 faqat 1 ga va o'ziga bo'linadi.",
		},
		{
			OlympiadID:    &olympiad.ID,
			CenterID:      &center.ID,
			Subject:       "Matematika",
			Difficulty:    "medium",
			Text:          "Uchburchakning ichki burchaklari yig'indisi nechaga teng?",
			QuestionType:  "multiple_choice",
			OptionsJSON:   models.StringArray{"90°", "180°", "270°", "360°"},
			CorrectAnswer: "180°",
			Points:        20,
			Order:         3,
			Explanation:   "Yevklid geometriyasida uchburchakning ichki burchaklari yig'indisi 180° ga teng.",
		},
		{
			OlympiadID:    &olympiad.ID,
			CenterID:      &center.ID,
			Subject:       "Matematika",
			Difficulty:    "medium",
			Text:          "Agar kvadratning perimetri 36 sm bo'lsa, uning yuzasi necha sm² bo'ladi?",
			QuestionType:  "multiple_choice",
			OptionsJSON:   models.StringArray{"36", "64", "81", "144"},
			CorrectAnswer: "81",
			Points:        20,
			Order:         4,
			Explanation:   "Tomoni a = 36 / 4 = 9 sm, yuzasi S = 9² = 81 sm².",
		},
		{
			OlympiadID:    &olympiad.ID,
			CenterID:      &center.ID,
			Subject:       "Matematika",
			Difficulty:    "hard",
			Text:          "log₂(32) qiymatini hisoblang:",
			QuestionType:  "multiple_choice",
			OptionsJSON:   models.StringArray{"3", "4", "5", "6"},
			CorrectAnswer: "5",
			Points:        20,
			Order:         5,
			Explanation:   "2⁵ = 32 bo'lgani uchun log₂(32) = 5.",
		},
	}
	for i := range questions {
		db.Create(&questions[i])
	}

	// 6. Seed Subscription Plans & Shop Rewards & Daily Question
	db.Create(&models.SubscriptionPlan{
		Name:         "Standart",
		PlanType:     "student",
		Price:        0,
		DurationDays: 30,
		Description:  "Ochiq olimpiadalar va asosiy natijalar",
		Features:     models.StringArray{"Ochiq olimpiadalar", "Asosiy natijalar"},
		IsActive:     true,
	})
	db.Create(&models.SubscriptionPlan{
		Name:         "Plus",
		PlanType:     "student",
		Price:        49000,
		DurationDays: 30,
		Description:  "AI tushuntirish, xatolar tahlili va cheksiz mashqlar",
		Features:     models.StringArray{"AI tushuntirish", "Xatolar tahlili", "Cheksiz mashqlar"},
		IsPopular:    true,
		IsActive:     true,
	})
	db.Create(&models.SubscriptionPlan{
		Name:         "Pro (1 yil)",
		PlanType:     "student",
		Price:        390000,
		DurationDays: 365,
		Description:  "Barcha imkoniyatlar, PDF eksport va IELTS/CEFR AI",
		Features:     models.StringArray{"Barcha imkoniyatlar", "PDF eksport", "IELTS/CEFR AI"},
		IsActive:     true,
	})

	db.Create(&models.RewardProduct{
		Title:       "Olympy Brend Futbolka",
		Description: "Yuqori sifatli 100% paxtadan tayyorlangan rasmiy futbolka",
		CostCoins:   250,
		Stock:       20,
		IsActive:    true,
	})
	db.Create(&models.RewardProduct{
		Title:       "Plus Tarif (1 oy)",
		Description: "Tangalar evaziga 1 oylik Plus obuna",
		CostCoins:   150,
		Stock:       100,
		IsActive:    true,
	})

	db.Create(&models.DailyQuestion{
		Date:          time.Now().Format("2006-01-02"),
		SubjectID:     mathSubject.ID,
		Text:          "15% ning 200 ga ko'paytmasi (200 dan 15%) nechaga teng?",
		OptionsJSON:   models.StringArray{"20", "25", "30", "35"},
		CorrectAnswer: "30",
		Explanation:   "200 * 0.15 = 30",
		Points:        15,
	})

	log.Println("Seed data created! Demo accounts: +998901234567 (admin123), +998902223344 (owner123), +998901112233 (teacher123), +998909998877 (student123)")
}
