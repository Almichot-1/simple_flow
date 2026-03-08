package middleware

import (
	"net/http"
	"time"

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

		if !isSubscriptionWindowValid(agency) {
			agency.SubscriptionStatus = models.SubStatusExpired
			db.Save(&agency)
		}

		c.Set("agency_id", agency.ID)
		c.Set("agency_subscription_status", agency.SubscriptionStatus)
		c.Next()
	}
}

func ActiveSubscriptionOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.GetString("agency_subscription_status")
		if status != models.SubStatusActive {
			c.AbortWithStatusJSON(http.StatusPaymentRequired, gin.H{"error": "active subscription required"})
			return
		}
		c.Next()
	}
}

func isSubscriptionWindowValid(agency models.AgencyProfile) bool {
	if agency.SubscriptionStatus != models.SubStatusActive {
		return true
	}
	if agency.SubscriptionEndDate == nil {
		return false
	}
	return agency.SubscriptionEndDate.After(time.Now())
}
