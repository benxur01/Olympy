package middleware

import (
	"olympy-backend-go/internal/config"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORSMiddleware configures CORS with credential support compatible with browser preflight checks.
func CORSMiddleware(cfg *config.Config) gin.HandlerFunc {
	rawOrigins := "*"
	if cfg != nil && strings.TrimSpace(cfg.AllowedOrigins) != "" {
		rawOrigins = strings.TrimSpace(cfg.AllowedOrigins)
	}

	var allowedList []string
	allowAll := rawOrigins == "*"
	if !allowAll {
		for _, o := range strings.Split(rawOrigins, ",") {
			trimmed := strings.TrimSpace(o)
			if trimmed != "" {
				allowedList = append(allowedList, trimmed)
			}
		}
	}

	return cors.New(cors.Config{
		// Echo exact Origin when wildcard is configured so AllowCredentials=true complies with Fetch spec.
		AllowOriginFunc: func(origin string) bool {
			if allowAll {
				return true
			}
			for _, allowed := range allowedList {
				if strings.EqualFold(allowed, origin) || allowed == "*" {
					return true
				}
			}
			return strings.HasPrefix(origin, "http://localhost:") ||
				strings.HasPrefix(origin, "http://127.0.0.1:")
		},
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders: []string{
			"Origin",
			"Content-Type",
			"Accept",
			"Authorization",
			"X-Requested-With",
			"X-Olympy-Auth-Storage",
			"X-Idempotency-Key",
			"X-CSRFToken",
			"Cache-Control",
			"Pragma",
		},
		ExposeHeaders:    []string{"Content-Length", "Authorization", "X-Export-Truncated"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
