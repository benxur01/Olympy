package main

import (
	"fmt"
	"log"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/database"
	"olympy-backend-go/internal/handlers"
	"olympy-backend-go/internal/middleware"
	"olympy-backend-go/internal/services"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()

	// Initialize Database and Seed Data
	database.InitDB(cfg)

	// Start Background Worker (Celery Replacement)
	services.StartBackgroundWorker()

	r := gin.Default()

	// Global Middlewares
	r.Use(middleware.CORSMiddleware())
	r.Use(middleware.RateLimiterMiddleware())
	r.Use(gin.Recovery())

	// Public Health Check & Swagger Documentation
	r.GET("/api/health/", handlers.HealthCheck)
	r.GET("/api/docs/", handlers.SwaggerDocs)
	r.GET("/api/openapi.json", handlers.OpenAPISpec)

	// Auth Group
	authGroup := r.Group("/api/auth")
	{
		authGroup.POST("/register/", handlers.Register(cfg))
		authGroup.POST("/login/", handlers.Login(cfg))
		authGroup.POST("/phone/start-telegram-verification/", handlers.StartPhoneTelegramVerification)
		authGroup.POST("/phone/verify-otp/", handlers.VerifyPhoneOTP)
		authGroup.POST("/password-reset/start/", handlers.StartPasswordReset)
		authGroup.POST("/password-reset/confirm/", handlers.ConfirmPasswordReset)
	}

	// Telegram Bot Webhooks
	r.POST("/api/telegram/webhook/", handlers.TelegramAuthWebhook)
	r.POST("/api/telegram/webhook/auth/", handlers.TelegramAuthWebhook)
	r.POST("/api/telegram/webhook/manager/", handlers.TelegramManagerWebhook)

	// Payment Gateways (Click & Payme)
	r.POST("/api/billing/payme/", handlers.PaymeWebhook)
	r.POST("/api/billing/click/", handlers.ClickWebhook)

	// Public endpoints
	r.GET("/api/centers/", handlers.ListCenters)
	r.GET("/api/centers/:id", handlers.GetCenter)
	r.GET("/api/centers/:id/stats/", handlers.GetCenterStats)
	r.GET("/api/olympiads/", handlers.ListOlympiads)
	r.GET("/api/olympiads/:id", handlers.GetOlympiad)
	r.GET("/api/olympiads/:id/stats/", handlers.GetOlympiadStats)
	r.GET("/api/subjects/", handlers.ListSubjects)
	r.GET("/api/leaderboard/", handlers.GetLeaderboard)
	r.GET("/api/certificates/verify/:uuid", handlers.VerifyCertificate)
	r.GET("/api/certificates/:id/download/", handlers.DownloadCertificate)
	r.GET("/api/billing/plans/", handlers.ListPlans)
	r.GET("/api/shop/products/", handlers.ListRewardProducts)
	r.GET("/api/daily-question/", handlers.GetDailyQuestion)
	r.GET("/api/practice/questions/", handlers.GetPracticeQuestions)
	r.POST("/api/practice/submit/", handlers.SubmitPracticeAnswer)
	r.POST("/api/ab/track/", handlers.TrackABEvent)
	r.GET("/api/ab/results/", handlers.GetABResults)

	// Protected Routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware(cfg))
	{
		// Me & Profile & Gamification
		api.GET("/me/", handlers.GetMe)
		api.GET("/me/daily-goal/", handlers.GetDailyGoal)
		api.POST("/daily-question/answer/", handlers.AnswerDailyQuestion)
		api.POST("/shop/redeem/", handlers.RedeemProduct)
		api.POST("/auth/email/link/start/", handlers.StartEmailLink)
		api.POST("/auth/email/link/confirm/", handlers.ConfirmEmailLink)
		api.POST("/auth/2fa/setup/", handlers.Setup2FA)
		api.POST("/auth/2fa/verify/", handlers.VerifyAndEnable2FA)
		api.POST("/auth/2fa/disable/", handlers.Disable2FA)

		// Centers actions
		api.POST("/centers/", handlers.CreateCenter)
		api.POST("/centers/:id/join/", handlers.JoinCenter)
		api.GET("/centers/:id/members/", handlers.ListCenterMembers)
		api.POST("/centers/:id/approve-student/", handlers.ApproveStudent)
		api.POST("/centers/:id/approve-teacher/", handlers.ApproveTeacher)
		api.POST("/centers/:id/reject-member/", handlers.RejectMember)

		// Olympiads & Subjects actions
		api.POST("/olympiads/", handlers.CreateOlympiad)
		api.POST("/olympiads/:id/publish/", handlers.PublishOlympiad)
		api.POST("/subjects/", handlers.CreateSubject)

		// Questions
		api.GET("/questions/", handlers.ListQuestions)
		api.POST("/questions/", handlers.CreateQuestion)

		// Attempts & Anti-Cheat & Multimodal
		api.POST("/attempts/", handlers.SubmitAttempt)
		api.GET("/results/me/", handlers.GetMyResults)
		api.GET("/attempts/:id", handlers.GetAttemptDetail)
		api.POST("/attempts/session/start/", handlers.StartTestSession)
		api.POST("/attempts/session/ping/", handlers.PingTestSession)
		api.POST("/attempts/session/evidence/", handlers.RecordEvidence)
		api.POST("/attempts/session/terminate/", handlers.TerminateSession)
		api.POST("/attempts/code/submit/", handlers.SubmitCode)
		api.POST("/attempts/essay/submit/", handlers.SubmitEssay)
		api.POST("/attempts/speaking/submit/", handlers.SubmitSpeaking)
		api.POST("/attempts/listening/play/", handlers.TrackListeningPlay)

		// Billing & Subscriptions
		api.POST("/billing/subscribe/", handlers.CreateSubscription)
		api.POST("/billing/promo/", handlers.ApplyPromoCode)

		// Notifications
		api.GET("/notifications/", handlers.ListNotifications)
		api.POST("/notifications/:id/read/", handlers.MarkNotificationRead)
		api.POST("/notifications/read-all/", handlers.MarkAllNotificationsRead)

		// Platform Admin Routes
		adminGroup := api.Group("/admin")
		adminGroup.Use(middleware.RequireAdmin())
		{
			adminGroup.POST("/centers/:id/approve/", handlers.ApproveCenter)
			adminGroup.GET("/moderation/", handlers.ListModerationFlags)
			adminGroup.POST("/moderation/:id/resolve/", handlers.ResolveFlag)
			adminGroup.POST("/moderation/:id/dismiss/", handlers.DismissFlag)
			adminGroup.POST("/moderation/block-ip/", handlers.BlockIP)
			adminGroup.GET("/audit-logs/", handlers.ListAuditLogs)
			adminGroup.GET("/analytics/", handlers.GetAnalyticsMetrics)
		}
	}

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("==================================================")
	log.Printf("👑 Olympy Enterprise Go Backend 100%% To'liq Tayyor!")
	log.Printf("📡 Server manzili: http://localhost%s", addr)
	log.Printf("🩺 Health check:   http://localhost%s/api/health/", addr)
	log.Printf("📖 Swagger Docs:   http://localhost%s/api/docs/", addr)
	log.Printf("🎯 1-kundan 30-kungacha bo'lgan barcha rejalar yakunlandi!")
	log.Printf("==================================================")

	if err := r.Run(addr); err != nil {
		log.Fatalf("Server ishga tushishida xatolik: %v", err)
	}
}
