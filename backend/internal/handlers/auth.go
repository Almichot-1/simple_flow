package handlers

import (
	"net/http"
	"strings"
	"time"

	"maidshowcase-api/internal/config"
	"maidshowcase-api/internal/models"
	"maidshowcase-api/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db  *gorm.DB
	cfg config.Config
}

func NewAuthHandler(db *gorm.DB, cfg config.Config) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Role     string `json:"role" binding:"required,oneof=AGENCY EMPLOYER"`
	Country  string `json:"country"`
	Phone    string `json:"phone"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	verified := req.Role == models.RoleEmployer
	user := models.User{
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
		Verified:     verified,
	}

	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
		return
	}

	if req.Role == models.RoleAgency {
		agency := models.AgencyProfile{
			UserID:             user.ID,
			Country:            req.Country,
			Phone:              req.Phone,
			SubscriptionStatus: models.SubStatusPending,
		}
		if err := h.db.Create(&agency).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agency profile"})
			return
		}
	}

	c.JSON(http.StatusCreated, gin.H{"message": "registration successful"})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := h.db.Where("email = ?", strings.ToLower(strings.TrimSpace(req.Email))).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !utils.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if user.Role == models.RoleAgency && !user.Verified {
		c.JSON(http.StatusForbidden, gin.H{"error": "agency not approved by admin yet"})
		return
	}

	user.LastLogin = time.Now()
	h.db.Save(&user)

	token, err := utils.GenerateToken(h.cfg.JWTSecret, h.cfg.JWTExpiryMins, user.ID, user.Role, user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": token,
		"user": gin.H{
			"id":       user.ID,
			"email":    user.Email,
			"role":     user.Role,
			"verified": user.Verified,
		},
	})
}
