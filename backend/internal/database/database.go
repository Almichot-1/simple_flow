package database

import (
	"fmt"
	"time"

	"maidshowcase-api/internal/models"
	"maidshowcase-api/internal/utils"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("sql db: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&models.User{},
		&models.AgencyProfile{},
		&models.MaidProfile{},
		&models.Subscription{},
		&models.EmployerAgencyVisit{},
		&models.EmployerSavedProfile{},
		&models.EmployerRecentView{},
	)
}

func EnsureDefaultAdmin(db *gorm.DB, email, password string) error {
	var existing models.User
	err := db.Where("email = ?", email).First(&existing).Error
	if err == nil {
		return nil
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	admin := models.User{
		Email:        email,
		PasswordHash: hash,
		Role:         models.RoleAdmin,
		Verified:     true,
	}
	return db.Create(&admin).Error
}
