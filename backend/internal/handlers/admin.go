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

type PendingAgencyRow struct {
	AgencyID            uint       `json:"agency_id"`
	UserID              uint       `json:"user_id"`
	Email               string     `json:"email"`
	Country             string     `json:"country"`
	Phone               string     `json:"phone"`
	Verified            bool       `json:"verified"`
	SubscriptionStatus  string     `json:"subscription_status"`
	SubscriptionEndDate *time.Time `json:"subscription_end_date"`
	CreatedAt           time.Time  `json:"created_at"`
}

type ActivatedAgencyRow struct {
	AgencyID            uint       `json:"agency_id"`
	UserID              uint       `json:"user_id"`
	Email               string     `json:"email"`
	Country             string     `json:"country"`
	Phone               string     `json:"phone"`
	Blocked             bool       `json:"blocked"`
	Banned              bool       `json:"banned"`
	SubscriptionStatus  string     `json:"subscription_status"`
	SubscriptionEndDate *time.Time `json:"subscription_end_date"`
	LastLogin           time.Time  `json:"last_login"`
	MaidCount           int64      `json:"maid_count"`
	CreatedAt           time.Time  `json:"created_at"`
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

	now := time.Now()
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).
			Where("id = ?", agency.UserID).
			Update("verified", true).Error; err != nil {
			return err
		}

		// Subscription mode is temporarily disabled: mark approved agencies as active.
		if err := tx.Model(&models.AgencyProfile{}).
			Where("id = ?", agency.ID).
			Updates(map[string]any{
				"subscription_status":     models.SubStatusActive,
				"subscription_start_date": now,
				"subscription_end_date":   nil,
			}).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to approve agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency approved"})
}

func (h *AdminHandler) ListPendingAgencies(c *gin.Context) {
	rows := make([]PendingAgencyRow, 0)

	if err := h.db.Table("agency_profiles").
		Select("agency_profiles.id AS agency_id, agency_profiles.user_id, users.email, agency_profiles.country, agency_profiles.phone, users.verified, agency_profiles.subscription_status, agency_profiles.subscription_end_date, agency_profiles.created_at").
		Joins("inner join users on users.id = agency_profiles.user_id").
		Where("users.role = ?", models.RoleAgency).
		Where("users.verified = ?", false).
		Order("agency_profiles.created_at desc").
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list pending agencies"})
		return
	}

	c.JSON(http.StatusOK, rows)
}

func (h *AdminHandler) ListActivatedAgencies(c *gin.Context) {
	rows := make([]ActivatedAgencyRow, 0)

	if err := h.db.Table("agency_profiles").
		Select("agency_profiles.id AS agency_id, agency_profiles.user_id, users.email, agency_profiles.country, agency_profiles.phone, users.blocked, users.banned, agency_profiles.subscription_status, agency_profiles.subscription_end_date, users.last_login, COUNT(maid_profiles.id) AS maid_count, agency_profiles.created_at").
		Joins("inner join users on users.id = agency_profiles.user_id").
		Joins("left join maid_profiles on maid_profiles.agency_id = agency_profiles.id").
		Where("users.role = ?", models.RoleAgency).
		Where("users.verified = ?", true).
		Group("agency_profiles.id, agency_profiles.user_id, users.email, agency_profiles.country, agency_profiles.phone, users.blocked, users.banned, agency_profiles.subscription_status, agency_profiles.subscription_end_date, users.last_login, agency_profiles.created_at").
		Order("users.last_login desc").
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list activated agencies"})
		return
	}

	c.JSON(http.StatusOK, rows)
}

func (h *AdminHandler) BlockAgency(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var agency models.AgencyProfile
	if err := h.db.First(&agency, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency not found"})
		return
	}

	if err := h.db.Model(&models.User{}).
		Where("id = ?", agency.UserID).
		Update("blocked", true).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to block agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency blocked"})
}

func (h *AdminHandler) UnblockAgency(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var agency models.AgencyProfile
	if err := h.db.First(&agency, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency not found"})
		return
	}

	if err := h.db.Model(&models.User{}).
		Where("id = ?", agency.UserID).
		Update("blocked", false).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unblock agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency unblocked"})
}

func (h *AdminHandler) BanAgency(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var agency models.AgencyProfile
	if err := h.db.First(&agency, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency not found"})
		return
	}

	if err := h.db.Model(&models.User{}).
		Where("id = ?", agency.UserID).
		Updates(map[string]any{"banned": true, "blocked": true}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to ban agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency banned"})
}

func (h *AdminHandler) UnbanAgency(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var agency models.AgencyProfile
	if err := h.db.First(&agency, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency not found"})
		return
	}

	if err := h.db.Model(&models.User{}).
		Where("id = ?", agency.UserID).
		Updates(map[string]any{"banned": false, "blocked": false}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to unban agency"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "agency unbanned"})
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
