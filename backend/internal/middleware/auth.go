package middleware

import (
	"net/http"
	"olympy-backend-go/internal/config"
	"olympy-backend-go/internal/utils"
	"strings"

	"github.com/gin-gonic/gin"
)

func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Authorization sarlavhasi talab qilinadi", "error": "Authorization sarlavhasi talab qilinadi"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Noto'g'ri token formati (Bearer <token>)", "error": "Noto'g'ri token formati (Bearer <token>)"})
			c.Abort()
			return
		}

		claims, err := utils.ValidateToken(parts[1], cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Yaroqsiz yoki muddati o'tgan token", "error": "Yaroqsiz yoki muddati o'tgan token"})
			c.Abort()
			return
		}

		if claims.TokenType != "" && claims.TokenType != "access" {
			c.JSON(http.StatusUnauthorized, gin.H{"detail": "Access token talab qilinadi", "error": "Access token talab qilinadi"})
			c.Abort()
			return
		}

		c.Set("userID", claims.UserID)
		c.Set("phone", claims.Phone)
		c.Set("roles", claims.Roles)
		c.Set("isAdmin", claims.IsAdmin)

		c.Next()
	}
}

func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		isAdminVal, exists := c.Get("isAdmin")
		isAdmin, ok := isAdminVal.(bool)
		if !exists || !ok || !isAdmin {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Faqat platforma admini uchun ruxsat berilgan", "error": "Faqat platforma admini uchun ruxsat berilgan"})
			c.Abort()
			return
		}
		c.Next()
	}
}
