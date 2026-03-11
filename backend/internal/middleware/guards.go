package middleware

import (
	"net/http"

	"maidshowcase-api/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		if role != models.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin role required"})
			return
		}
		c.Next()
	}
}

func AgencyOnly(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := c.GetString("role")
		if role != models.RoleAgency {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "agency role required"})
			return
		}

		userID := c.GetUint("user_id")
		var agency models.AgencyProfile
		if err := db.Where("user_id = ?", userID).First(&agency).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "agency profile not found"})
			return
		}

		c.Set("agency_id", agency.ID)
		// Subscription mode is temporarily disabled: approved agencies get full access.
		c.Set("agency_subscription_status", models.SubStatusActive)
		c.Next()
	}
}

func ActiveSubscriptionOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Subscription mode is temporarily disabled.
		c.Next()
	}
}
