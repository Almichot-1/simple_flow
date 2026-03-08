package handlers

import (
	"net/http"
	"strconv"
	"time"

	"maidshowcase-api/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AdminHandler struct {
	db *gorm.DB
}

func NewAdminHandler(db *gorm.DB) *AdminHandler {
	return &AdminHandler{db: db}
}

func (h *AdminHandler) ApproveAgency(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var agency models.AgencyProfile
	if err := h.db.First(&agency, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency not found"})
		return
	}

	if err := h.db.Model(&models.User{}).
		Where("id = ?", agency.UserID).
		Update("verified", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to approve agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency approved"})
}

func (h *AdminHandler) ListAllSubscriptions(c *gin.Context) {
	var subs []models.Subscription
	if err := h.db.Preload("Agency").Order("created_at desc").Find(&subs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list subscriptions"})
		return
	}
	c.JSON(http.StatusOK, subs)
}

func (h *AdminHandler) ActivateSubscription(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var sub models.Subscription
	if err := h.db.First(&sub, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subscription not found"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		sub.Status = models.PaymentPaid
		if err := tx.Save(&sub).Error; err != nil {
			return err
		}

		updates := map[string]any{
			"subscription_status":     models.SubStatusActive,
			"subscription_start_date": time.Now(),
			"subscription_end_date":   sub.EndDate,
		}
		if err := tx.Model(&models.AgencyProfile{}).Where("id = ?", sub.AgencyID).Updates(updates).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to activate subscription"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "subscription activated"})
}

func (h *AdminHandler) VisitStats(c *gin.Context) {
	var totalVisits int64
	if err := h.db.Model(&models.EmployerAgencyVisit{}).Count(&totalVisits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load visit stats"})
		return
	}

	var uniqueEmployers int64
	if err := h.db.Model(&models.EmployerAgencyVisit{}).
		Distinct("employer_id").
		Count(&uniqueEmployers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load employer visit stats"})
		return
	}

	var uniqueAgencies int64
	if err := h.db.Model(&models.EmployerAgencyVisit{}).
		Distinct("agency_id").
		Count(&uniqueAgencies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load agency visit stats"})
		return
	}

	var last24hVisits int64
	if err := h.db.Model(&models.EmployerAgencyVisit{}).
		Where("created_at >= ?", time.Now().Add(-24*time.Hour)).
		Count(&last24hVisits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load last 24h visit stats"})
		return
	}

	type topEmployerRow struct {
		EmployerID uint   `json:"employer_id"`
		Email      string `json:"email"`
		Visits     int64  `json:"visits"`
	}

	topEmployers := make([]topEmployerRow, 0)
	if err := h.db.Table("employer_agency_visits").
		Select("employer_agency_visits.employer_id, users.email, COUNT(*) AS visits").
		Joins("left join users on users.id = employer_agency_visits.employer_id").
		Group("employer_agency_visits.employer_id, users.email").
		Order("visits desc").
		Limit(8).
		Find(&topEmployers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load top employers"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"total_employer_visits":    totalVisits,
		"unique_employers_visited": uniqueEmployers,
		"unique_agencies_visited":  uniqueAgencies,
		"last_24h_visits":          last24hVisits,
		"top_employers":            topEmployers,
	})
}
