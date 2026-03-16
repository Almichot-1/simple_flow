package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                  string
	DatabaseURL           string
	JWTSecret             string
	JWTExpiryMins         string
	AdminEmail            string
	AdminPassword         string
	AllowedOrigins        string
	CloudinaryCloudName   string
	CloudinaryAPIKey      string
	CloudinaryAPISecret   string
	CloudinaryVideoFolder string
	FirebaseProjectID     string
	FirebaseClientEmail   string
	FirebasePrivateKey    string
}

func Load() Config {
	_ = godotenv.Load(".env", "backend/.env")

	return Config{
		Port:                  normalizePort(getEnv("PORT", ":8080")),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/maidshowcase?sslmode=disable"),
		JWTSecret:             getEnv("JWT_SECRET", "change-this-to-a-long-random-64-char-secret-in-production"),
		JWTExpiryMins:         getEnv("JWT_EXPIRY_MINS", "60"),
		AdminEmail:            getEnv("ADMIN_EMAIL", "admin@maidshowcase.com"),
		AdminPassword:         getEnv("ADMIN_PASSWORD", "Admin123!"),
		AllowedOrigins:        getEnv("ALLOWED_ORIGINS", "http://localhost:5173"),
		CloudinaryCloudName:   getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:      getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret:   getEnv("CLOUDINARY_API_SECRET", ""),
		CloudinaryVideoFolder: getEnv("CLOUDINARY_VIDEO_FOLDER", "maidshowcase/videos"),
		FirebaseProjectID:     getEnv("FIREBASE_PROJECT_ID", ""),
		FirebaseClientEmail:   getEnv("FIREBASE_CLIENT_EMAIL", ""),
		FirebasePrivateKey:    getEnv("FIREBASE_PRIVATE_KEY", ""),
	}
}

func normalizePort(port string) string {
	value := strings.TrimSpace(port)
	if value == "" {
		return ":8080"
	}
	if strings.HasPrefix(value, ":") {
		return value
	}
	return ":" + value
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
