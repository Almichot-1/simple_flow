package utils

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"maidshowcase-api/internal/config"
)

const secureTokenCertsURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type FirebaseToken struct {
	UID           string
	Email         string
	EmailVerified bool
}

type firebaseCertCache struct {
	mu        sync.RWMutex
	keys      map[string]any
	expiresAt time.Time
}

var certCache = &firebaseCertCache{}

func VerifyFirebaseIDToken(ctx context.Context, cfg config.Config, idToken string) (*FirebaseToken, error) {
	projectID := strings.TrimSpace(cfg.FirebaseProjectID)
	if projectID == "" {
		return nil, errors.New("firebase auth is not configured")
	}

	tokenString := strings.TrimSpace(idToken)
	if tokenString == "" {
		return nil, errors.New("missing firebase token")
	}

	if hasFirebaseServiceCredentials(cfg) {
		client, clientErr := FirebaseAuthClient(ctx, cfg)
		if clientErr == nil {
			verifiedToken, verifyErr := client.VerifyIDToken(ctx, tokenString)
			if verifyErr == nil {
				email, _ := verifiedToken.Claims["email"].(string)
				emailVerified, _ := verifiedToken.Claims["email_verified"].(bool)
				return &FirebaseToken{
					UID:           strings.TrimSpace(verifiedToken.UID),
					Email:         strings.ToLower(strings.TrimSpace(email)),
					EmailVerified: emailVerified,
				}, nil
			}
		}
	}

	keySet, err := getFirebasePublicKeys(ctx)
	if err != nil {
		return nil, err
	}

	claims := jwt.MapClaims{}
	token, parseErr := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %s", t.Method.Alg())
		}

		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("firebase token missing kid")
		}

		key, ok := keySet[kid]
		if !ok {
			return nil, errors.New("firebase signing key not found")
		}
		return key, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}))
	if parseErr != nil || token == nil || !token.Valid {
		return nil, errors.New("invalid firebase token")
	}

	if aud, _ := claims["aud"].(string); aud != projectID {
		return nil, errors.New("invalid firebase audience")
	}

	expectedIssuer := "https://securetoken.google.com/" + projectID
	if iss, _ := claims["iss"].(string); iss != expectedIssuer {
		return nil, errors.New("invalid firebase issuer")
	}

	uid, _ := claims["sub"].(string)
	if strings.TrimSpace(uid) == "" {
		return nil, errors.New("invalid firebase subject")
	}

	email, _ := claims["email"].(string)
	emailVerified, _ := claims["email_verified"].(bool)

	return &FirebaseToken{
		UID:           uid,
		Email:         strings.ToLower(strings.TrimSpace(email)),
		EmailVerified: emailVerified,
	}, nil
}

func getFirebasePublicKeys(ctx context.Context) (map[string]any, error) {
	now := time.Now()

	certCache.mu.RLock()
	if certCache.keys != nil && now.Before(certCache.expiresAt) {
		keys := certCache.keys
		certCache.mu.RUnlock()
		return keys, nil
	}
	certCache.mu.RUnlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, secureTokenCertsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch firebase certs: %s", resp.Status)
	}

	var certs map[string]string
	if decodeErr := json.NewDecoder(resp.Body).Decode(&certs); decodeErr != nil {
		return nil, decodeErr
	}

	parsedKeys := make(map[string]any, len(certs))
	for kid, certPEM := range certs {
		block, _ := pem.Decode([]byte(certPEM))
		if block == nil {
			continue
		}

		cert, certErr := x509.ParseCertificate(block.Bytes)
		if certErr != nil {
			continue
		}
		parsedKeys[kid] = cert.PublicKey
	}

	if len(parsedKeys) == 0 {
		return nil, errors.New("no firebase certs available")
	}

	ttl := time.Hour
	cacheControl := resp.Header.Get("Cache-Control")
	if strings.Contains(cacheControl, "max-age=") {
		parts := strings.Split(cacheControl, "max-age=")
		if len(parts) > 1 {
			maxAgePart := strings.Split(parts[1], ",")[0]
			if seconds, convErr := time.ParseDuration(strings.TrimSpace(maxAgePart) + "s"); convErr == nil && seconds > 0 {
				ttl = seconds
			}
		}
	}

	certCache.mu.Lock()
	certCache.keys = parsedKeys
	certCache.expiresAt = time.Now().Add(ttl)
	certCache.mu.Unlock()

	return parsedKeys, nil
}
