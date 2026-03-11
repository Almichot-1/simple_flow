package server

import (
	"net/http"
	"net/url"
	"strings"

	"maidshowcase-api/internal/config"
	"maidshowcase-api/internal/handlers"
	"maidshowcase-api/internal/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func NewRouter(db *gorm.DB, cfg config.Config) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestLogger())
	r.Use(middleware.RateLimit())
	r.Use(cors(cfg.AllowedOrigins))
	r.Static("/uploads", "./uploads")

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	authHandler := handlers.NewAuthHandler(db, cfg)
	agencyHandler := handlers.NewAgencyHandler(db)
	browseHandler := handlers.NewBrowseHandler(db)
	adminHandler := handlers.NewAdminHandler(db)
	employerHandler := handlers.NewEmployerHandler(db)

	r.GET("/public/maids/:id", browseHandler.PublicMaidProfile)

	auth := r.Group("/api")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
		auth.POST("/login/firebase", authHandler.FirebaseLogin)
		auth.GET("/public/maids/:id", browseHandler.PublicMaidProfileJSON)
	}

	protected := r.Group("/api")
	protected.Use(middleware.JWTAuth(cfg.JWTSecret))
	{
		protected.GET("/maids", browseHandler.ListMaids)
		protected.DELETE("/account", authHandler.DeleteMyAccount)

		agency := protected.Group("/agency")
		agency.Use(middleware.AgencyOnly(db))
		{
			agency.GET("/maids", agencyHandler.ListMyMaids)
			agency.POST("/maids", agencyHandler.CreateMaid)
			agency.PUT("/maids/:id", agencyHandler.UpdateMaid)
			agency.DELETE("/maids/:id", agencyHandler.DeleteMaid)
			agency.GET("/contact", agencyHandler.GetAgencyContact)
			agency.PATCH("/contact", agencyHandler.UpdateAgencyContact)
			agency.POST("/subscribe", agencyHandler.RequestSubscription)
		}

		employer := protected.Group("/employer")
		employer.Use(middleware.EmployerOnly())
		{
			employer.GET("/saved", employerHandler.ListSavedProfiles)
			employer.POST("/saved/:maidId", employerHandler.SaveProfile)
			employer.DELETE("/saved/:maidId", employerHandler.UnsaveProfile)
			employer.GET("/recent", employerHandler.ListRecentViews)
			employer.POST("/recent/:maidId", employerHandler.TrackRecentView)
		}

		admin := protected.Group("/admin")
		admin.Use(middleware.AdminOnly())
		{
			admin.GET("/agencies/pending", adminHandler.ListPendingAgencies)
			admin.GET("/agencies/activated", adminHandler.ListActivatedAgencies)
			admin.PATCH("/agencies/:id/approve", adminHandler.ApproveAgency)
			admin.PATCH("/agencies/:id/block", adminHandler.BlockAgency)
			admin.PATCH("/agencies/:id/unblock", adminHandler.UnblockAgency)
			admin.PATCH("/agencies/:id/ban", adminHandler.BanAgency)
			admin.PATCH("/agencies/:id/unban", adminHandler.UnbanAgency)
			admin.GET("/subscriptions", adminHandler.ListAllSubscriptions)
			admin.GET("/visit-stats", adminHandler.VisitStats)
			admin.PATCH("/subscriptions/:id/activate", adminHandler.ActivateSubscription)
		}
	}

	return r
}

func cors(allowedOrigins string) gin.HandlerFunc {
	allowedSet := map[string]bool{}
	for _, origin := range strings.Split(allowedOrigins, ",") {
		value := strings.TrimSpace(origin)
		if value != "" {
			allowedSet[value] = true
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowedSet[origin] || isEquivalentLocalOrigin(origin, allowedSet) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

func isEquivalentLocalOrigin(origin string, allowedSet map[string]bool) bool {
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" {
		return false
	}

	for allowed := range allowedSet {
		au, parseErr := url.Parse(allowed)
		if parseErr != nil {
			continue
		}
		sameScheme := strings.EqualFold(au.Scheme, u.Scheme)
		samePort := au.Port() == u.Port()
		localPair := (au.Hostname() == "localhost" && u.Hostname() == "127.0.0.1") || (au.Hostname() == "127.0.0.1" && u.Hostname() == "localhost")
		if sameScheme && samePort && localPair {
			return true
		}
	}

	return false
}
