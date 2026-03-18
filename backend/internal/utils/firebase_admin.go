package utils

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"

	"maidshowcase-api/internal/config"
)

func hasFirebaseServiceCredentials(cfg config.Config) bool {
	return strings.TrimSpace(cfg.FirebaseProjectID) != "" &&
		strings.TrimSpace(cfg.FirebaseClientEmail) != "" &&
		strings.TrimSpace(cfg.FirebasePrivateKey) != ""
}

func buildFirebaseServiceAccountJSON(cfg config.Config) ([]byte, error) {
	if !hasFirebaseServiceCredentials(cfg) {
		return nil, errors.New("firebase service credentials are not configured")
	}

	privateKey := strings.TrimSpace(cfg.FirebasePrivateKey)
	privateKey = strings.Trim(privateKey, "\"")
	privateKey = strings.Trim(privateKey, "'")
	privateKey = strings.ReplaceAll(privateKey, "\\\\n", "\n")
	privateKey = strings.ReplaceAll(privateKey, "\\n", "\n")

	payload := map[string]string{
		"type":         "service_account",
		"project_id":   strings.TrimSpace(cfg.FirebaseProjectID),
		"private_key":  privateKey,
		"client_email": strings.TrimSpace(cfg.FirebaseClientEmail),
		"token_uri":    "https://oauth2.googleapis.com/token",
	}

	return json.Marshal(payload)
}

func FirebaseAuthClient(ctx context.Context, cfg config.Config) (*auth.Client, error) {
	credJSON, err := buildFirebaseServiceAccountJSON(cfg)
	if err != nil {
		return nil, err
	}

	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: strings.TrimSpace(cfg.FirebaseProjectID)}, option.WithCredentialsJSON(credJSON))
	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("init firebase auth client: %w", err)
	}

	return client, nil
}

func EnsureFirebaseUserByEmail(ctx context.Context, cfg config.Config, email, tempPassword string) (string, bool, error) {
	client, err := FirebaseAuthClient(ctx, cfg)
	if err != nil {
		return "", false, err
	}

	normalizedEmail := strings.ToLower(strings.TrimSpace(email))
	if normalizedEmail == "" {
		return "", false, errors.New("email is required")
	}

	user, err := client.GetUserByEmail(ctx, normalizedEmail)
	if err == nil {
		return user.UID, false, nil
	}
	if !auth.IsUserNotFound(err) {
		return "", false, fmt.Errorf("lookup firebase user: %w", err)
	}

	createParams := (&auth.UserToCreate{}).
		Email(normalizedEmail).
		EmailVerified(true)

	if strings.TrimSpace(tempPassword) != "" {
		createParams = createParams.Password(tempPassword)
	}

	created, createErr := client.CreateUser(ctx, createParams)
	if createErr != nil {
		return "", false, fmt.Errorf("create firebase user: %w", createErr)
	}

	return created.UID, true, nil
}
