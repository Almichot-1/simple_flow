package models

import "gorm.io/gorm"

const (
	AvailAvailable    = "AVAILABLE"
	AvailArrived      = "ARRIVED"
	AvailNotAvailable = "NOT_AVAILABLE"
	AvailBooked       = "BOOKED"
)

type MaidProfile struct {
	gorm.Model
	AgencyID           uint          `gorm:"index" json:"agency_id"`
	Agency             AgencyProfile `gorm:"foreignKey:AgencyID" json:"-"`
	Name               string        `gorm:"not null" json:"name"`
	Age                int           `gorm:"check:age >= 18" json:"age"`
	ExperienceYears    int           `json:"experience_years"`
	ExpectedSalary     string        `json:"expected_salary"`
	Languages          string        `json:"languages"`
	Narrative          string        `json:"narrative"`
	AvailabilityStatus string        `gorm:"default:AVAILABLE" json:"availability_status"`
	PhotoURL           string        `json:"photo_url"`
	IntroVideoURL      string        `json:"intro_video_url"`
}
