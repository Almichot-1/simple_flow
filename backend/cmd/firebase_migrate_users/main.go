package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"log"
	"strings"

	"firebase.google.com/go/v4/auth"

	"maidshowcase-api/internal/config"
	"maidshowcase-api/internal/database"
	"maidshowcase-api/internal/models"
	"maidshowcase-api/internal/utils"
)

func main() {
	resetLinks := flag.Bool("reset-links", false, "generate Firebase reset links for users")
	resetURL := flag.String("reset-url", "", "optional continue URL for Firebase password reset links")
	targetEmail := flag.String("email", "", "optional single email to process")
	limit := flag.Int("limit", 0, "optional max number of users to process")
	flag.Parse()

	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect db: %v", err)
	}

	var users []models.User
	query := db.Model(&models.User{}).Order("id asc")
	if strings.TrimSpace(*targetEmail) != "" {
		query = query.Where("LOWER(email) = ?", strings.ToLower(strings.TrimSpace(*targetEmail)))
	}
	if *limit > 0 {
		query = query.Limit(*limit)
	}
	if err := query.Find(&users).Error; err != nil {
		log.Fatalf("failed to load users: %v", err)
	}

	if len(users) == 0 {
		fmt.Println("No users found in database.")
		return
	}

	authClient, authErr := utils.FirebaseAuthClient(context.Background(), cfg)
	if authErr != nil {
		log.Fatalf("failed to initialize firebase auth: %v", authErr)
	}

	createdCount := 0
	existingCount := 0
	failureCount := 0

	fmt.Println("email,uid,status,temp_password")
	for _, user := range users {
		email := strings.ToLower(strings.TrimSpace(user.Email))
		if email == "" {
			failureCount++
			fmt.Printf("%s,,failed,missing-email\n", user.Email)
			continue
		}

		tempPassword, pwdErr := generateTempPassword()
		if pwdErr != nil {
			failureCount++
			fmt.Printf("%s,,failed,password-gen-error\n", email)
			continue
		}

		uid, created, ensureErr := utils.EnsureFirebaseUserByEmail(context.Background(), cfg, email, tempPassword)
		if ensureErr != nil {
			failureCount++
			fmt.Printf("%s,,failed,%s\n", email, csvSafe(ensureErr.Error()))
			continue
		}

		status := "existing"
		if created {
			createdCount++
			status = "created"
		} else {
			existingCount++
		}

		if created {
			fmt.Printf("%s,%s,%s,%s\n", email, uid, status, tempPassword)
		} else {
			fmt.Printf("%s,%s,%s,\n", email, uid, status)
		}

		if *resetLinks {
			link, linkErr := generateResetLink(context.Background(), authClient, email, *resetURL)
			if linkErr != nil {
				fmt.Printf("# reset-link for %s failed: %s\n", email, csvSafe(linkErr.Error()))
			} else {
				fmt.Printf("# reset-link for %s => %s\n", email, link)
			}
		}
	}

	fmt.Println()
	fmt.Printf("Summary => total=%d created=%d existing=%d failed=%d\n", len(users), createdCount, existingCount, failureCount)
}

func generateTempPassword() (string, error) {
	b := make([]byte, 18)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	base := base64.RawURLEncoding.EncodeToString(b)
	return "Tmp#" + base + "9A", nil
}

func csvSafe(value string) string {
	clean := strings.ReplaceAll(value, "\n", " ")
	clean = strings.ReplaceAll(clean, "\r", " ")
	return strings.ReplaceAll(clean, ",", ";")
}

func generateResetLink(ctx context.Context, authClient *auth.Client, email, continueURL string) (string, error) {
	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" {
		return "", fmt.Errorf("email is required")
	}

	if strings.TrimSpace(continueURL) == "" {
		return authClient.PasswordResetLink(ctx, normalizedEmail)
	}

	settings := &auth.ActionCodeSettings{
		URL:             strings.TrimSpace(continueURL),
		HandleCodeInApp: true,
	}
	return authClient.PasswordResetLinkWithSettings(ctx, normalizedEmail, settings)
}
