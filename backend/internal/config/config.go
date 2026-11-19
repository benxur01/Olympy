package config

import (
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
		jwtSecret = "olympy-go-super-secret-key-2025"
	}

	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "*"
	}

	return &Config{
		Port:           port,
		DBEngine:       dbEngine,
		DBName:         dbName,
		JWTSecret:      jwtSecret,
		AllowedOrigins: allowedOrigins,
	}
}
