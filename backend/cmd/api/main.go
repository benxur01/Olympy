package main

import (
	"fmt"
	"log"
	"net/http"
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
	r.Use(middleware.CORSMiddleware(cfg))
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
		authGroup.POST("/register-organization/", handlers.RegisterOrganization(cfg))
		authGroup.POST("/login/", handlers.Login(cfg))
		authGroup.POST("/token/refresh/", handlers.RefreshToken(cfg))
		authGroup.POST("/logout/", handlers.Logout)
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
	r.GET("/api/centers/:id/", handlers.GetCenterRouter(cfg))
	r.GET("/api/centers/:id/stats/", handlers.GetCenterStats)
	r.GET("/api/olympiads/", handlers.ListOlympiads)
	r.GET("/api/olympiads/:id/", handlers.GetOlympiad)
	r.GET("/api/olympiads/:id/stats/", handlers.GetOlympiadStats)
	r.GET("/api/subjects/", handlers.ListSubjects)
	r.GET("/api/leaderboard/", handlers.GetLeaderboard)
	r.GET("/api/certificates/:param1/:param2/", handlers.CertificateRouter)
	r.GET("/api/billing/plans/", handlers.ListPlans)
	r.GET("/api/shop/products/", handlers.ListRewardProducts)
	r.GET("/api/daily-question/", handlers.GetDailyQuestion)
	r.GET("/api/daily-questions/", handlers.GetDailyQuestion)
	r.GET("/api/daily-questions/stats/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"answered": 0, "streak": 0})
	})
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
		api.PATCH("/me/", handlers.UpdateMe)
		api.GET("/me/daily-goal/", handlers.GetDailyGoal)
		api.POST("/me/daily-goal/", handlers.GetDailyGoal)
		api.GET("/me/activity-leaderboard/", handlers.GetActivityLeaderboard)
		api.GET("/me/flash-alert/", handlers.GetMyFlashAlert)
		api.GET("/me/predictions/", handlers.GetMyPredictions)
		api.GET("/me/rewards/", handlers.GetMyRewards)
		api.POST("/me/rewards/redeem/", handlers.RedeemProduct)
		api.GET("/me/rewards/my-redemptions/", handlers.GetMyRedemptions)
		api.GET("/me/teacher/students/", handlers.GetTeacherStudents)
		api.GET("/me/teacher/olympiads/", handlers.GetTeacherOlympiads)
		api.POST("/me/complete-onboarding/", handlers.CompleteOnboardingFlag)
		api.PATCH("/me/center-onboarding/", handlers.CompleteOnboardingFlag)
		api.PATCH("/me/manager-onboarding/", handlers.CompleteOnboardingFlag)
		api.PATCH("/me/teacher-onboarding/", handlers.CompleteOnboardingFlag)
		api.POST("/daily-question/answer/", handlers.AnswerDailyQuestion)
		api.POST("/shop/redeem/", handlers.RedeemProduct)

		api.POST("/auth/me/change-password/", handlers.ChangePassword)
		api.POST("/auth/email/link/start/", handlers.StartEmailLink)
		api.POST("/auth/email/link/confirm/", handlers.ConfirmEmailLink)
		api.POST("/auth/2fa/setup/", handlers.Setup2FA)
		api.POST("/auth/2fa/verify/", handlers.VerifyAndEnable2FA)
		api.POST("/auth/2fa/disable/", handlers.Disable2FA)

		// Centers actions
		api.POST("/centers/", handlers.CreateCenter)
		api.PATCH("/centers/:id/", handlers.UpdateCenter)
		api.POST("/centers/:id/join/", handlers.JoinCenter)
		api.GET("/centers/:id/members/", handlers.ListCenterMembers)
		api.GET("/centers/:id/memberships/pending/", handlers.GetPendingMemberships)
		api.GET("/centers/:id/memberships/staff/", handlers.GetStaffMemberships)
		api.GET("/centers/:id/memberships/students/", handlers.GetStudentMemberships)
		api.POST("/centers/:id/approve-student/", handlers.ApproveStudent)
		api.POST("/centers/:id/approve-teacher/", handlers.ApproveTeacher)
		api.POST("/centers/:id/approve-manager/", handlers.ApproveManager)
		api.POST("/centers/:id/reject-member/", handlers.RejectMember)

		// Manager & Analytics endpoints
		api.GET("/manager/stats/", handlers.GetManagerStats)
		api.GET("/analytics/online/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"online": 1}) })
		api.GET("/analytics/attempts-trend/", handlers.EmptyListResponse)
		api.GET("/analytics/olympiad-stats/", handlers.EmptyListResponse)
		api.GET("/analytics/question-stats/", handlers.EmptyListResponse)
		api.GET("/analytics/revenue-trend/", handlers.EmptyListResponse)
		api.GET("/analytics/center-stats/", handlers.EmptyListResponse)
		api.GET("/analytics/abuse-stats/", handlers.EmptyListResponse)
		api.GET("/analytics/live-radar/", handlers.EmptyListResponse)
		api.GET("/analytics/recent-transactions/", handlers.EmptyListResponse)

		// Olympiads & Subjects actions
		api.GET("/olympiads/:id/questions/", handlers.GetOlympiadQuestions)
		api.POST("/olympiads/", handlers.CreateOlympiad)
		api.PATCH("/olympiads/:id/", handlers.UpdateOlympiad)
		api.DELETE("/olympiads/:id/", handlers.DeleteOlympiad)
		api.POST("/olympiads/:id/publish/", handlers.PublishOlympiad)
		api.POST("/olympiads/:id/deactivate/", handlers.DeactivateOlympiad)
		api.POST("/olympiads/:id/finish/", handlers.FinishOlympiad)
		api.POST("/subjects/", handlers.CreateSubject)

		// Questions
		api.GET("/questions/", handlers.ListQuestions)
		api.POST("/questions/", handlers.CreateQuestion)
		api.PATCH("/questions/:id/", handlers.UpdateQuestion)
		api.DELETE("/questions/:id/", handlers.DeleteQuestion)

		// Attempts & Anti-Cheat & Multimodal
		api.POST("/attempts/", handlers.SubmitAttempt)
		api.GET("/results/me/", handlers.GetMyResults)
		api.GET("/results/me/stats/", handlers.GetMyStats)
		api.GET("/attempts/:id/", handlers.GetAttemptRouter)
		api.POST("/attempts/ping/", handlers.PingTestSession)
		api.POST("/attempts/cheating/", handlers.ReportCheating)
		api.POST("/attempts/camera-consent/", handlers.RecordProctorConsent("camera"))
		api.POST("/attempts/microphone-consent/", handlers.RecordProctorConsent("microphone"))
		api.POST("/attempts/session/start/", handlers.StartTestSession)
		api.POST("/attempts/session/ping/", handlers.PingTestSession)
		api.POST("/attempts/session/evidence/", handlers.RecordEvidence)
		api.POST("/attempts/session/terminate/", handlers.TerminateSession)
		api.POST("/attempts/code/submit/", handlers.SubmitCode)
		api.POST("/attempts/essay/submit/", handlers.SubmitEssay)
		api.POST("/attempts/speaking/submit/", handlers.SubmitSpeaking)
		api.POST("/attempts/speaking-answer/", handlers.SubmitSpeaking)
		api.POST("/attempts/listening-play/", handlers.TrackListeningPlay)
		api.POST("/attempts/listening/play/", handlers.TrackListeningPlay)

		// Practice
		api.POST("/practice/start/", handlers.StartPractice)

		// Billing & Subscriptions
		api.POST("/billing/subscribe/", handlers.CreateSubscription)
		api.POST("/billing/promo/", handlers.ApplyPromoCode)
		api.POST("/billing/promocode/validate/", handlers.ApplyPromoCode)

		// Notifications
		api.GET("/notifications/", handlers.ListNotifications)
		api.POST("/notifications/:id/", handlers.NotificationRouterPOST)
		api.POST("/notifications/:id/read/", handlers.MarkNotificationRead)

		// Platform Admin Routes
		adminGroup := api.Group("/admin")
		adminGroup.Use(middleware.RequireAdmin())
		{
			adminGroup.GET("/centers/", handlers.ListCenters)
			adminGroup.POST("/centers/:id/approve/", handlers.ApproveCenter)
			adminGroup.POST("/centers/:id/reject/", handlers.RejectCenter)
			adminGroup.GET("/centers/pending-memberships/", handlers.GetAdminPendingMemberships)
			adminGroup.GET("/users/", handlers.AdminListUsers)
			adminGroup.GET("/system/health/", handlers.AdminSystemHealth)
			adminGroup.GET("/system/config/", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{}) })
			adminGroup.GET("/moderation/", handlers.ListModerationFlags)
			adminGroup.GET("/moderation/queue/", handlers.EmptyPagedResponse)
			adminGroup.GET("/moderation/blocked-ips/", handlers.EmptyPagedResponse)
			adminGroup.POST("/moderation/:id/", handlers.ModerationRouterPOST)
			adminGroup.POST("/moderation/:id/resolve/", handlers.ResolveFlag)
			adminGroup.POST("/moderation/:id/dismiss/", handlers.DismissFlag)
			adminGroup.GET("/audit-logs/", handlers.ListAuditLogs)
			adminGroup.GET("/audit-log/", handlers.EmptyPagedResponse)
			adminGroup.GET("/analytics/", handlers.GetAnalyticsMetrics)
			adminGroup.GET("/security/live-proctoring/", handlers.EmptyPagedResponse)
			adminGroup.GET("/presence/live/", handlers.EmptyListResponse)
			adminGroup.GET("/rewards/products/", handlers.ListRewardProducts)
			adminGroup.GET("/rewards/redemptions/", handlers.EmptyPagedResponse)
		}
		api.GET("/billing/admin/revenue/", handlers.AdminRevenueAnalytics)
		api.GET("/billing/admin/promocodes/", handlers.EmptyPagedResponse)
	}

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("==================================================")
	log.Printf("Olympy Go Backend API Ready")
	log.Printf("Server URL:   http://localhost%s", addr)
	log.Printf("Health check: http://localhost%s/api/health/", addr)
	log.Printf("Swagger Docs: http://localhost%s/api/docs/", addr)
	log.Printf("==================================================")

	if err := r.Run(addr); err != nil {
		log.Fatalf("Server ishga tushishida xatolik: %v", err)
	}
}
