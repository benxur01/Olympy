package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	DBEngine       string
	DBName         string
	JWTSecret      string
	AllowedOrigins string
}

func generateEphemeralSecret() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("Failed to generate fallback JWT secret: %v", err)
	}
	return hex.EncodeToString(b)
}

func LoadConfig() *Config {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	dbEngine := os.Getenv("OLYMPY_DB_ENGINE")
	if dbEngine == "" {
		dbEngine = "sqlite"
	}

	dbName := os.Getenv("OLYMPY_DB_NAME")
	if dbName == "" {
		dbName = "olympy.db"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		if os.Getenv("GIN_MODE") == "release" {
			log.Fatal("JWT_SECRET environment variable must be set in release mode")
		}
		log.Println("[WARN] JWT_SECRET not set; generating ephemeral development secret")
		jwtSecret = generateEphemeralSecret()
	}

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:5173,http://127.0.0.1:5173"
	}

	return &Config{
		Port:           port,
		DBEngine:       dbEngine,
		DBName:         dbName,
		JWTSecret:      jwtSecret,
		AllowedOrigins: allowedOrigins,
	}
}
