package models

import "gorm.io/gorm"

const NotificationTypeAgencyRegistration = "agency_registration"

type AgencyNotification struct {
	gorm.Model
	Type        string `gorm:"not null;index" json:"type"`
	AgencyID    uint   `gorm:"index" json:"agency_id"`
	UserID      uint   `gorm:"index" json:"user_id"`
	AgencyEmail string `gorm:"not null;index" json:"agency_email"`
	Country     string `json:"country"`
	Phone       string `json:"phone"`
	Source      string `gorm:"default:web-register" json:"source"`
}
