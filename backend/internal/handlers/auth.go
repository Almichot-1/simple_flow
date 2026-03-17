package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
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

type FirebaseLoginRequest struct {
	IDToken string `json:"id_token" binding:"required"`
	Role    string `json:"role" binding:"omitempty,oneof=AGENCY EMPLOYER"`
	Country string `json:"country"`
	Phone   string `json:"phone"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
	Email        string `json:"email" binding:"required,email"`
	RecoveryCode string `json:"recovery_code" binding:"required"`
	NewPassword  string `json:"new_password" binding:"required,min=8"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !utils.ValidateStrongPassword(req.Password) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 10 characters and include uppercase, lowercase, number, and symbol"})
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

		notification := models.AgencyNotification{
			Type:        models.NotificationTypeAgencyRegistration,
			AgencyID:    agency.ID,
			UserID:      user.ID,
			AgencyEmail: user.Email,
			Country:     agency.Country,
			Phone:       agency.Phone,
			Source:      "web-register",
		}
		if err := h.db.Create(&notification).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agency notification"})
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

	if user.Banned {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is banned"})
		return
	}

	if user.Blocked {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is blocked by admin"})
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

func (h *AuthHandler) FirebaseLogin(c *gin.Context) {
	var req FirebaseLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	firebaseToken, err := utils.VerifyFirebaseIDToken(c.Request.Context(), h.cfg, req.IDToken)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not configured") {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "firebase auth is not configured"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid firebase token"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(firebaseToken.Email))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "firebase token missing email"})
		return
	}

	var user models.User
	findErr := h.db.Where("email = ?", email).First(&user).Error
	if findErr != nil {
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to lookup user"})
			return
		}

		role := models.RoleEmployer
		if req.Role == models.RoleAgency {
			role = models.RoleAgency
		}

		generatedPassword, hashErr := utils.HashPassword("firebase-user-" + firebaseToken.UID)
		if hashErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare user"})
			return
		}

		user = models.User{
			Email:        email,
			PasswordHash: generatedPassword,
			Role:         role,
			Verified:     role == models.RoleEmployer,
		}

		if err = h.db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}

		if role == models.RoleAgency {
			agency := models.AgencyProfile{
				UserID:             user.ID,
				Country:            req.Country,
				Phone:              req.Phone,
				SubscriptionStatus: models.SubStatusPending,
			}
			if err = h.db.Create(&agency).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create agency profile"})
				return
			}
		}
	}

	if user.Role == models.RoleAgency && !user.Verified {
		c.JSON(http.StatusForbidden, gin.H{"error": "agency not approved by admin yet"})
		return
	}

	if user.Banned {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is banned"})
		return
	}

	if user.Blocked {
		c.JSON(http.StatusForbidden, gin.H{"error": "account is blocked by admin"})
		return
	}

	user.LastLogin = time.Now()
	h.db.Save(&user)

	appToken, tokenErr := utils.GenerateToken(h.cfg.JWTSecret, h.cfg.JWTExpiryMins, user.ID, user.Role, user.Email)
	if tokenErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": appToken,
		"user": gin.H{
			"id":       user.ID,
			"email":    user.Email,
			"role":     user.Role,
			"verified": user.Verified,
		},
	})
}

func (h *AuthHandler) DeleteMyAccount(c *gin.Context) {
	userID := c.GetUint("user_id")
	role := c.GetString("role")

	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid session"})
		return
	}

	if role != models.RoleEmployer {
		c.JSON(http.StatusForbidden, gin.H{"error": "only employer accounts can self-delete"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("employer_id = ?", userID).Delete(&models.EmployerAgencyVisit{}).Error; err != nil {
			return err
		}

		if err := tx.Where("id = ?", userID).Delete(&models.User{}).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "account deleted"})
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	response := gin.H{
		"message": "If an account exists for this email, a recovery code has been generated.",
	}

	var user models.User
	err := h.db.Where("email = ?", email).First(&user).Error
	if err == nil {
		recoveryCode, codeErr := generateRecoveryCode(32)
		if codeErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare recovery code"})
			return
		}

		tokenHash := hashRecoveryCode(recoveryCode)
		expiresAt := time.Now().Add(30 * time.Minute)

		txErr := h.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Where("user_id = ?", user.ID).Delete(&models.PasswordResetToken{}).Error; err != nil {
				return err
			}

			entry := models.PasswordResetToken{
				UserID:    user.ID,
				TokenHash: tokenHash,
				ExpiresAt: expiresAt,
			}

			if err := tx.Create(&entry).Error; err != nil {
				return err
			}

			return nil
		})

		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create recovery code"})
			return
		}

		response["recovery_code"] = recoveryCode
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process recovery request"})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !utils.ValidateStrongPassword(req.NewPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 10 characters and include uppercase, lowercase, number, and symbol"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	var user models.User
	if err := h.db.Where("email = ?", email).First(&user).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired recovery code"})
		return
	}

	tokenHash := hashRecoveryCode(req.RecoveryCode)
	now := time.Now()

	var resetToken models.PasswordResetToken
	if err := h.db.Where("user_id = ? AND token_hash = ? AND used_at IS NULL AND expires_at > ?", user.ID, tokenHash, now).First(&resetToken).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired recovery code"})
		return
	}

	newHash, err := utils.HashPassword(req.NewPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).Where("id = ?", user.ID).Update("password_hash", newHash).Error; err != nil {
			return err
		}

		usedAt := time.Now()
		if err := tx.Model(&models.PasswordResetToken{}).Where("id = ?", resetToken.ID).Update("used_at", usedAt).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}

func generateRecoveryCode(byteLen int) (string, error) {
	b := make([]byte, byteLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashRecoveryCode(code string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}
