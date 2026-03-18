package utils

import (
	"fmt"
	"net/smtp"
	"strings"
	"time"

	"maidshowcase-api/internal/config"
)

func CanSendResetOTPEmail(cfg config.Config) bool {
	return len(MissingSMTPFields(cfg)) == 0
}

func MissingSMTPFields(cfg config.Config) []string {
	missing := make([]string, 0, 5)
	if strings.TrimSpace(cfg.SMTPHost) == "" {
		missing = append(missing, "SMTP_HOST")
	}
	if strings.TrimSpace(cfg.SMTPPort) == "" {
		missing = append(missing, "SMTP_PORT")
	}
	if strings.TrimSpace(cfg.SMTPUsername) == "" {
		missing = append(missing, "SMTP_USERNAME")
	}
	if strings.TrimSpace(cfg.SMTPPassword) == "" {
		missing = append(missing, "SMTP_PASSWORD")
	}
	if strings.TrimSpace(cfg.SMTPFrom) == "" {
		missing = append(missing, "SMTP_FROM")
	}
	return missing
}

func SendResetOTPEmail(cfg config.Config, recipientEmail, otp string, expiresAt time.Time) error {
	if !CanSendResetOTPEmail(cfg) {
		return fmt.Errorf("smtp credentials are not configured")
	}

	host := strings.TrimSpace(cfg.SMTPHost)
	port := strings.TrimSpace(cfg.SMTPPort)
	username := strings.TrimSpace(cfg.SMTPUsername)
	password := normalizeSMTPPassword(host, cfg.SMTPPassword)
	from := strings.TrimSpace(cfg.SMTPFrom)
	to := strings.ToLower(strings.TrimSpace(recipientEmail))
	if to == "" {
		return fmt.Errorf("recipient email is required")
	}

	subject := "Your SimFlow one-time reset code"
	body := fmt.Sprintf(
		"Hello,\r\n\r\nYour one-time password reset code is: %s\r\n\r\nThis code expires at %s UTC.\r\n\r\nIf you did not request this, you can ignore this email.\r\n",
		otp,
		expiresAt.UTC().Format("2006-01-02 15:04:05"),
	)

	message := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	auth := smtp.PlainAuth("", username, password, host)
	addr := host + ":" + port
	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(message)); err != nil {
		return fmt.Errorf("smtp send failed: %w", err)
	}

	return nil
}

func normalizeSMTPPassword(host, rawPassword string) string {
	password := strings.TrimSpace(rawPassword)

	if strings.Contains(strings.ToLower(strings.TrimSpace(host)), "gmail.com") {
		password = strings.ReplaceAll(password, " ", "")
	}

	return password
}
