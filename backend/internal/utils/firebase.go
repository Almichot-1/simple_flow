package utils

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"

	"maidshowcase-api/internal/config"
)

var (
	firebaseAuthOnce   sync.Once
	firebaseAuthClient *auth.Client
	firebaseAuthErr    error
)

func VerifyFirebaseIDToken(ctx context.Context, cfg config.Config, idToken string) (*auth.Token, error) {
	if strings.TrimSpace(cfg.FirebaseProjectID) == "" || strings.TrimSpace(cfg.FirebaseClientEmail) == "" || strings.TrimSpace(cfg.FirebasePrivateKey) == "" {
		return nil, errors.New("firebase auth is not configured")
	}

	client, err := getFirebaseAuthClient(ctx, cfg)
	if err != nil {
		return nil, err
	}

	return client.VerifyIDToken(ctx, strings.TrimSpace(idToken))
}

func getFirebaseAuthClient(ctx context.Context, cfg config.Config) (*auth.Client, error) {
	firebaseAuthOnce.Do(func() {
		privateKey := strings.ReplaceAll(cfg.FirebasePrivateKey, "\\n", "\n")

		creds := map[string]string{
			"type":         "service_account",
			"project_id":   cfg.FirebaseProjectID,
			"private_key":  privateKey,
			"client_email": cfg.FirebaseClientEmail,
			"token_uri":    "https://oauth2.googleapis.com/token",
		}

		credsJSON, marshalErr := json.Marshal(creds)
		if marshalErr != nil {
			firebaseAuthErr = marshalErr
			return
		}

		app, appErr := firebase.NewApp(ctx, nil, option.WithCredentialsJSON(credsJSON))
		if appErr != nil {
			firebaseAuthErr = appErr
			return
		}

		client, clientErr := app.Auth(ctx)
		if clientErr != nil {
			firebaseAuthErr = clientErr
			return
		}

		firebaseAuthClient = client
	})

	if firebaseAuthErr != nil {
		return nil, firebaseAuthErr
	}

	return firebaseAuthClient, nil
}
