package handlers

import (
	"net/http"
	"strconv"
	"time"

	"maidshowcase-api/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type EmployerHandler struct {
	db *gorm.DB
}

type EmployerSavedRow struct {
	ID           uint      `json:"id"`
	Name         string    `json:"name"`
	Availability string    `json:"availability"`
	SavedAt      time.Time `json:"saved_at"`
}

type EmployerRecentRow struct {
	ID       uint      `json:"id"`
	Name     string    `json:"name"`
	ViewedAt time.Time `json:"viewed_at"`
}

func NewEmployerHandler(db *gorm.DB) *EmployerHandler {
	return &EmployerHandler{db: db}
}

func (h *EmployerHandler) SaveProfile(c *gin.Context) {
	employerID := c.GetUint("user_id")
	maidID, err := strconv.Atoi(c.Param("maidId"))
	if err != nil || maidID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid maid id"})
		return
	}

	var maid models.MaidProfile
	if err := h.db.Select("id").First(&maid, maidID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "maid not found"})
		return
	}

	record := models.EmployerSavedProfile{
		EmployerID: employerID,
		MaidID:     uint(maidID),
		SavedAt:    time.Now(),
	}
	if err := h.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "employer_id"}, {Name: "maid_id"}},
		DoUpdates: clause.Assignments(map[string]any{"saved_at": record.SavedAt}),
	}).Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "profile saved"})
}

func (h *EmployerHandler) UnsaveProfile(c *gin.Context) {
	employerID := c.GetUint("user_id")
	maidID, err := strconv.Atoi(c.Param("maidId"))
	if err != nil || maidID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid maid id"})
		return
	}

	if err := h.db.Where("employer_id = ? AND maid_id = ?", employerID, maidID).Delete(&models.EmployerSavedProfile{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove saved profile"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "profile removed"})
}

func (h *EmployerHandler) ListSavedProfiles(c *gin.Context) {
	employerID := c.GetUint("user_id")
	rows := make([]EmployerSavedRow, 0)
	if err := h.db.Table("employer_saved_profiles").
		Select("maid_profiles.id, maid_profiles.name, maid_profiles.availability_status AS availability, employer_saved_profiles.saved_at").
		Joins("inner join maid_profiles on maid_profiles.id = employer_saved_profiles.maid_id").
		Where("employer_saved_profiles.employer_id = ?", employerID).
		Order("employer_saved_profiles.saved_at desc").
		Limit(50).
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list saved profiles"})
		return
	}

	c.JSON(http.StatusOK, rows)
}

func (h *EmployerHandler) TrackRecentView(c *gin.Context) {
	employerID := c.GetUint("user_id")
	maidID, err := strconv.Atoi(c.Param("maidId"))
	if err != nil || maidID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid maid id"})
		return
	}

	var maid models.MaidProfile
	if err := h.db.Select("id").First(&maid, maidID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "maid not found"})
		return
	}

	record := models.EmployerRecentView{
		EmployerID: employerID,
		MaidID:     uint(maidID),
		ViewedAt:   time.Now(),
	}
	if err := h.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "employer_id"}, {Name: "maid_id"}},
		DoUpdates: clause.Assignments(map[string]any{"viewed_at": record.ViewedAt}),
	}).Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to track view"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "view tracked"})
}

func (h *EmployerHandler) ListRecentViews(c *gin.Context) {
	employerID := c.GetUint("user_id")
	rows := make([]EmployerRecentRow, 0)
	if err := h.db.Table("employer_recent_views").
		Select("maid_profiles.id, maid_profiles.name, employer_recent_views.viewed_at").
		Joins("inner join maid_profiles on maid_profiles.id = employer_recent_views.maid_id").
		Where("employer_recent_views.employer_id = ?", employerID).
		Order("employer_recent_views.viewed_at desc").
		Limit(50).
		Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list recent views"})
		return
	}

	c.JSON(http.StatusOK, rows)
}
