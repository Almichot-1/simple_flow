package models

import "gorm.io/gorm"

// EmployerAgencyVisit tracks agency discovery behavior from employer browse actions.
type EmployerAgencyVisit struct {
	gorm.Model
	EmployerID uint `gorm:"index;not null" json:"employer_id"`
	AgencyID   uint `gorm:"index;not null" json:"agency_id"`
}
