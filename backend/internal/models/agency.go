package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	SubStatusActive  = "ACTIVE"
	SubStatusExpired = "EXPIRED"
	SubStatusPending = "PENDING"
)

type AgencyProfile struct {
	gorm.Model
	UserID                uint       `gorm:"uniqueIndex" json:"user_id"`
	User                  User       `gorm:"foreignKey:UserID" json:"-"`
	Country               string     `json:"country"`
	Phone                 string     `json:"phone"`
	SubscriptionStatus    string     `gorm:"default:PENDING" json:"subscription_status"`
	SubscriptionStartDate *time.Time `json:"subscription_start_date"`
	SubscriptionEndDate   *time.Time `json:"subscription_end_date"`
}
