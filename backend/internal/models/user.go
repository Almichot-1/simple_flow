package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	RoleAdmin    = "ADMIN"
	RoleAgency   = "AGENCY"
	RoleEmployer = "EMPLOYER"
)

type User struct {
	gorm.Model
	Email        string    `gorm:"uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Role         string    `gorm:"not null" json:"role"`
	Verified     bool      `gorm:"default:false" json:"verified"`
	Blocked      bool      `gorm:"default:false" json:"blocked"`
	Banned       bool      `gorm:"default:false" json:"banned"`
	LastLogin    time.Time `json:"last_login"`
}
