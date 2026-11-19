package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type ipRecord struct {
	failedLogins int
	lockedUntil  time.Time
	reqCount     int
	windowStart  time.Time
}

var (
	ipStore   = make(map[string]*ipRecord)
	storeLock sync.Mutex
)

// RateLimiterMiddleware limits requests to max 120 per minute per IP
func RateLimiterMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		storeLock.Lock()
		rec, exists := ipStore[ip]
		if !exists {
			rec = &ipRecord{windowStart: now}
			ipStore[ip] = rec
		}

		// Check if locked out due to bruteforce
		if rec.lockedUntil.After(now) {
			storeLock.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Ko'p muvaffaqiyatsiz urinishlar tufayli IP vaqtincha bloklangan. Iltimos, keyinroq urinib ko'ring.",
				"locked_until": rec.lockedUntil.Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		// Sliding window for general request count
		if now.Sub(rec.windowStart) > time.Minute {
			rec.reqCount = 0
			rec.windowStart = now
		}

		rec.reqCount++
		if rec.reqCount > 120 {
			storeLock.Unlock()
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "So'rovlar soni me'yordan oshdi (daqiqasiga maksimal 120 ta)"})
			c.Abort()
			return
		}
		storeLock.Unlock()

		c.Next()
	}
}

// RecordFailedLogin records a failed login attempt for bruteforce lockout
func RecordFailedLogin(ip string) {
	storeLock.Lock()
	defer storeLock.Unlock()

	rec, exists := ipStore[ip]
	if !exists {
		rec = &ipRecord{windowStart: time.Now()}
		ipStore[ip] = rec
	}

	rec.failedLogins++
	if rec.failedLogins >= 5 {
		// Lock for 15 minutes
		rec.lockedUntil = time.Now().Add(15 * time.Minute)
		rec.failedLogins = 0
	}
}

// ResetFailedLogin resets login attempts on successful login
func ResetFailedLogin(ip string) {
	storeLock.Lock()
	defer storeLock.Unlock()

	if rec, exists := ipStore[ip]; exists {
		rec.failedLogins = 0
		rec.lockedUntil = time.Time{}
	}
}
