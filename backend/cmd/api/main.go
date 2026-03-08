package main

import (
	"log"

	"maidshowcase-api/internal/config"
	"maidshowcase-api/internal/database"
	"maidshowcase-api/internal/server"
)

func main() {
	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	if err := database.EnsureDefaultAdmin(db, cfg.AdminEmail, cfg.AdminPassword); err != nil {
		log.Fatalf("failed to ensure default admin: %v", err)
	}

	r := server.NewRouter(db, cfg)
	if err := r.Run(cfg.Port); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}
