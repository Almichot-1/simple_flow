package utils

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

const cloudinaryBaseUploadURL = "https://api.cloudinary.com/v1_1"

func UploadVideoToCloudinary(file *multipart.FileHeader) (string, error) {
	cloudName := strings.TrimSpace(os.Getenv("CLOUDINARY_CLOUD_NAME"))
	apiKey := strings.TrimSpace(os.Getenv("CLOUDINARY_API_KEY"))
	apiSecret := strings.TrimSpace(os.Getenv("CLOUDINARY_API_SECRET"))
	folder := strings.TrimSpace(os.Getenv("CLOUDINARY_VIDEO_FOLDER"))

	if cloudName == "" || apiKey == "" || apiSecret == "" {
		return "", fmt.Errorf("cloudinary is not configured")
	}

	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	signatureParams := map[string]string{
		"timestamp": timestamp,
	}
	if folder != "" {
		signatureParams["folder"] = folder
	}
	signature := signCloudinaryParams(signatureParams, apiSecret)

	source, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open video file")
	}
	defer source.Close()

	bodyReader, bodyWriter := io.Pipe()
	writer := multipart.NewWriter(bodyWriter)

	go func() {
		defer bodyWriter.Close()
		defer writer.Close()

		_ = writer.WriteField("api_key", apiKey)
		_ = writer.WriteField("timestamp", timestamp)
		_ = writer.WriteField("signature", signature)
		if folder != "" {
			_ = writer.WriteField("folder", folder)
		}

		part, createErr := writer.CreateFormFile("file", file.Filename)
		if createErr != nil {
			_ = bodyWriter.CloseWithError(createErr)
			return
		}
		if _, copyErr := io.Copy(part, source); copyErr != nil {
			_ = bodyWriter.CloseWithError(copyErr)
			return
		}
	}()

	uploadURL := fmt.Sprintf("%s/%s/video/upload", cloudinaryBaseUploadURL, cloudName)
	req, err := http.NewRequest(http.MethodPost, uploadURL, bodyReader)
	if err != nil {
		return "", fmt.Errorf("failed to build cloudinary request")
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to upload video")
	}
	defer resp.Body.Close()

	var payload struct {
		SecureURL string `json:"secure_url"`
		Error     struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if decodeErr := json.NewDecoder(resp.Body).Decode(&payload); decodeErr != nil {
		return "", fmt.Errorf("failed to parse cloudinary response")
	}

	if resp.StatusCode >= http.StatusBadRequest {
		if strings.TrimSpace(payload.Error.Message) != "" {
			return "", errors.New(payload.Error.Message)
		}
		return "", fmt.Errorf("cloudinary upload failed with status %d", resp.StatusCode)
	}

	if strings.TrimSpace(payload.SecureURL) == "" {
		return "", fmt.Errorf("cloudinary upload did not return a secure url")
	}

	return payload.SecureURL, nil
}

func signCloudinaryParams(params map[string]string, apiSecret string) string {
	keys := make([]string, 0, len(params))
	for key, value := range params {
		if strings.TrimSpace(value) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, key+"="+params[key])
	}

	base := strings.Join(pairs, "&") + apiSecret
	hash := sha1.Sum([]byte(base))
	return hex.EncodeToString(hash[:])
}
