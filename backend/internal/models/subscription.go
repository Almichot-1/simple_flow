package models

import (
	"time"

	"gorm.io/gorm"
)

const (
	PaymentPaid      = "PAID"
	PaymentPending   = "PENDING"
	PaymentFailed    = "FAILED"
	PaymentCancelled = "CANCELLED"
)

type Subscription struct {
	gorm.Model
	AgencyID        uint          `gorm:"index" json:"agency_id"`
	Agency          AgencyProfile `gorm:"foreignKey:AgencyID" json:"-"`
	PlanType        string        `json:"plan_type"`
	StartDate       time.Time     `json:"start_date"`
	EndDate         time.Time     `json:"end_date"`
	Status          string        `gorm:"default:PENDING" json:"status"`
	PaymentMethod   string        `json:"payment_method"`
	TransactionRef  string        `json:"transaction_ref"`
	RequestedMonths int           `json:"requested_months"`
}
