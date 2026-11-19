package handlers

import (
	"net/http"
	"olympy-backend-go/internal/database"
	"time"

	"github.com/gin-gonic/gin"
)

func HealthCheck(c *gin.Context) {
	dbStatus := "ok"
	sqlDB, err := database.DB.DB()
	if err != nil || sqlDB.Ping() != nil {
		dbStatus = "unreachable"
	}

	c.JSON(http.StatusOK, gin.H{
		"status":      "ok",
		"service":     "olympy-api-go",
		"version":     "2.0.0-golang",
		"database":    dbStatus,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
		"environment": "production",
	})
}
