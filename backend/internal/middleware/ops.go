package middleware

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type limiterStore struct {
	mu     sync.Mutex
	hits   map[string]int
	resets map[string]time.Time
	limit  int
	window time.Duration
	prefix string
}

func newLimiter(limit int, window time.Duration, prefix string) *limiterStore {
	return &limiterStore{
		hits:   map[string]int{},
		resets: map[string]time.Time{},
		limit:  limit,
		window: window,
		prefix: prefix,
	}
}

func (ls *limiterStore) allow(key string) bool {
	ls.mu.Lock()
	defer ls.mu.Unlock()

	now := time.Now()
	reset, exists := ls.resets[key]
	if !exists || now.After(reset) {
		ls.hits[key] = 0
		ls.resets[key] = now.Add(ls.window)
	}

	ls.hits[key]++
	return ls.hits[key] <= ls.limit
}

func RateLimit() gin.HandlerFunc {
	publicLimiter := newLimiter(100, time.Minute, "public")
	authLimiter := newLimiter(500, time.Minute, "auth")

	return func(c *gin.Context) {
		ip := c.ClientIP()
		isAuth := c.GetHeader("Authorization") != ""

		allowed := false
		if isAuth {
			allowed = authLimiter.allow(ip)
		} else {
			allowed = publicLimiter.allow(ip)
		}

		if !allowed {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limit exceeded"})
			return
		}

		c.Next()
	}
}

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		latency := time.Since(start)

		log.Printf("method=%s path=%s status=%d latency=%s ip=%s", c.Request.Method, c.Request.URL.Path, c.Writer.Status(), latency, c.ClientIP())
	}
}
