package models

import "time"

// EmployerSavedProfile persists employer shortlist actions across devices.
type EmployerSavedProfile struct {
	EmployerID uint      `gorm:"not null;index:idx_employer_saved_unique,unique" json:"employer_id"`
	MaidID     uint      `gorm:"not null;index:idx_employer_saved_unique,unique" json:"maid_id"`
	SavedAt    time.Time `gorm:"not null;autoCreateTime" json:"saved_at"`
}

// EmployerRecentView stores latest profile view timestamps per employer+maid.
type EmployerRecentView struct {
	EmployerID uint      `gorm:"not null;index:idx_employer_recent_unique,unique" json:"employer_id"`
	MaidID     uint      `gorm:"not null;index:idx_employer_recent_unique,unique" json:"maid_id"`
	ViewedAt   time.Time `gorm:"not null" json:"viewed_at"`
}
