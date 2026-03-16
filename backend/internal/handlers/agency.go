package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"maidshowcase-api/internal/models"
	"maidshowcase-api/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type AgencyHandler struct {
	db *gorm.DB
}

const imgBBUploadURL = "https://api.imgbb.com/1/upload"

func NewAgencyHandler(db *gorm.DB) *AgencyHandler {
	return &AgencyHandler{db: db}
}

type MaidRequest struct {
	Name               string `json:"name" binding:"required"`
	Age                int    `json:"age" binding:"required,gte=18"`
	ExperienceYears    int    `json:"experience_years"`
	ExpectedSalary     string `json:"expected_salary"`
	Languages          string `json:"languages"`
	Narrative          string `json:"narrative"`
	AvailabilityStatus string `json:"availability_status" binding:"required,oneof=AVAILABLE NOT_AVAILABLE BOOKED"`
	PhotoURL           string `json:"photo_url"`
	IntroVideoURL      string `json:"intro_video_url"`
}

type SubscriptionRequest struct {
	PlanType        string `json:"plan_type" binding:"required"`
	PaymentMethod   string `json:"payment_method" binding:"required"`
	TransactionRef  string `json:"transaction_ref" binding:"required"`
	RequestedMonths int    `json:"requested_months" binding:"required,gte=1,lte=12"`
}

type AgencyContactRequest struct {
	Phone string `json:"phone" binding:"required"`
}

func (h *AgencyHandler) ListMyMaids(c *gin.Context) {
	agencyID := c.GetUint("agency_id")
	var maids []models.MaidProfile
	if err := h.db.Where("agency_id = ?", agencyID).Order("created_at desc").Find(&maids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list maids"})
		return
	}
	c.JSON(http.StatusOK, maids)
}

func (h *AgencyHandler) CreateMaid(c *gin.Context) {
	agencyID := c.GetUint("agency_id")

	req, err := parseMaidRequest(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	maid := models.MaidProfile{
		AgencyID:           agencyID,
		Name:               req.Name,
		Age:                req.Age,
		ExperienceYears:    req.ExperienceYears,
		ExpectedSalary:     req.ExpectedSalary,
		Languages:          req.Languages,
		Narrative:          req.Narrative,
		AvailabilityStatus: req.AvailabilityStatus,
		PhotoURL:           req.PhotoURL,
		IntroVideoURL:      req.IntroVideoURL,
	}

	if err := h.db.Create(&maid).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create maid"})
		return
	}

	c.JSON(http.StatusCreated, maid)
}

func (h *AgencyHandler) UpdateMaid(c *gin.Context) {
	agencyID := c.GetUint("agency_id")
	id, _ := strconv.Atoi(c.Param("id"))

	var maid models.MaidProfile
	if err := h.db.Where("id = ? AND agency_id = ?", id, agencyID).First(&maid).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "maid not found"})
		return
	}

	req, err := parseMaidRequest(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	maid.Name = req.Name
	maid.Age = req.Age
	maid.ExperienceYears = req.ExperienceYears
	maid.ExpectedSalary = req.ExpectedSalary
	maid.Languages = req.Languages
	maid.Narrative = req.Narrative
	maid.AvailabilityStatus = req.AvailabilityStatus
	if req.PhotoURL != "" {
		maid.PhotoURL = req.PhotoURL
	}
	if req.IntroVideoURL != "" {
		maid.IntroVideoURL = req.IntroVideoURL
	}

	if err := h.db.Save(&maid).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update maid"})
		return
	}

	c.JSON(http.StatusOK, maid)
}

func parseMaidRequest(c *gin.Context) (MaidRequest, error) {
	if strings.Contains(c.GetHeader("Content-Type"), "multipart/form-data") {
		age, _ := strconv.Atoi(c.PostForm("age"))
		experienceYears, _ := strconv.Atoi(c.PostForm("experience_years"))
		availability := c.DefaultPostForm("availability_status", models.AvailAvailable)
		req := MaidRequest{
			Name:               c.PostForm("name"),
			Age:                age,
			ExperienceYears:    experienceYears,
			ExpectedSalary:     c.PostForm("expected_salary"),
			Languages:          c.PostForm("languages"),
			Narrative:          c.PostForm("narrative"),
			AvailabilityStatus: availability,
		}

		photoPath, err := saveUploadedFile(c, "photo", "photo")
		if err != nil {
			return MaidRequest{}, err
		}
		videoPath, err := saveUploadedFile(c, "video", "video")
		if err != nil {
			return MaidRequest{}, err
		}

		req.PhotoURL = photoPath
		req.IntroVideoURL = videoPath

		if req.Name == "" || req.Age < 18 {
			return MaidRequest{}, fmt.Errorf("name and age >= 18 are required")
		}

		return req, nil
	}

	var req MaidRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return MaidRequest{}, err
	}
	return req, nil
}

func saveUploadedFile(c *gin.Context, field, prefix string) (string, error) {
	file, err := c.FormFile(field)
	if err != nil {
		return "", nil
	}

	if field == "photo" {
		if uploadedURL, uploadErr := uploadPhotoToImgBB(file); uploadErr == nil && uploadedURL != "" {
			return uploadedURL, nil
		}
	}

	if field == "video" {
		uploadedURL, uploadErr := utils.UploadVideoToCloudinary(file)
		if uploadErr != nil {
			return "", fmt.Errorf("failed to upload video: %w", uploadErr)
		}
		if strings.TrimSpace(uploadedURL) == "" {
			return "", fmt.Errorf("failed to upload video")
		}
		return uploadedURL, nil
	}

	if mkErr := os.MkdirAll("uploads", os.ModePerm); mkErr != nil {
		return "", fmt.Errorf("failed to create upload directory")
	}

	name := fmt.Sprintf("%s_%d%s", prefix, time.Now().UnixNano(), filepath.Ext(file.Filename))
	path := filepath.ToSlash(filepath.Join("uploads", name))
	if saveErr := c.SaveUploadedFile(file, path); saveErr != nil {
		return "", fmt.Errorf("failed to save uploaded file")
	}

	return "/" + path, nil
}

func uploadPhotoToImgBB(file *multipart.FileHeader) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("IMGBB_API_KEY"))
	if apiKey == "" {
		return "", fmt.Errorf("imgbb api key is not configured")
	}

	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open image file")
	}
	defer src.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("image", file.Filename)
	if err != nil {
		return "", fmt.Errorf("failed to create upload payload")
	}
	if _, err = io.Copy(part, src); err != nil {
		return "", fmt.Errorf("failed to stream image payload")
	}
	if err = writer.Close(); err != nil {
		return "", fmt.Errorf("failed to finalize upload payload")
	}

	uploadURL := fmt.Sprintf("%s?key=%s", imgBBUploadURL, url.QueryEscape(apiKey))
	req, err := http.NewRequest(http.MethodPost, uploadURL, &body)
	if err != nil {
		return "", fmt.Errorf("failed to create imgbb request")
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to upload image")
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("imgbb upload failed with status %d", resp.StatusCode)
	}

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err = json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("failed to decode imgbb response")
	}
	if !payload.Success || strings.TrimSpace(payload.Data.URL) == "" {
		return "", fmt.Errorf("imgbb upload did not return a valid url")
	}

	return payload.Data.URL, nil
}

func (h *AgencyHandler) DeleteMaid(c *gin.Context) {
	agencyID := c.GetUint("agency_id")
	id, _ := strconv.Atoi(c.Param("id"))

	result := h.db.Where("id = ? AND agency_id = ?", id, agencyID).Delete(&models.MaidProfile{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete maid"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "maid not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "maid deleted"})
}

func (h *AgencyHandler) RequestSubscription(c *gin.Context) {
	agencyID := c.GetUint("agency_id")

	var req SubscriptionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	sub := models.Subscription{
		AgencyID:        agencyID,
		PlanType:        req.PlanType,
		StartDate:       now,
		EndDate:         now.AddDate(0, req.RequestedMonths, 0),
		Status:          models.PaymentPending,
		PaymentMethod:   req.PaymentMethod,
		TransactionRef:  req.TransactionRef,
		RequestedMonths: req.RequestedMonths,
	}

	if err := h.db.Create(&sub).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create subscription request"})
		return
	}

	h.db.Model(&models.AgencyProfile{}).
		Where("id = ?", agencyID).
		Updates(map[string]any{"subscription_status": models.SubStatusPending})

	c.JSON(http.StatusCreated, sub)
}

func (h *AgencyHandler) GetAgencyContact(c *gin.Context) {
	agencyID := c.GetUint("agency_id")

	var agency models.AgencyProfile
	if err := h.db.Where("id = ?", agencyID).First(&agency).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agency profile not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"phone":               agency.Phone,
		"whatsapp_normalized": normalizeWhatsAppDigits(agency.Phone),
		"whatsapp_url":        buildWhatsAppURL(agency.Phone, "Hello, I am contacting from the Maid Showcase platform."),
	})
}

func (h *AgencyHandler) UpdateAgencyContact(c *gin.Context) {
	agencyID := c.GetUint("agency_id")

	var req AgencyContactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	phone := strings.TrimSpace(req.Phone)
	if normalizeWhatsAppDigits(phone) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "valid phone is required"})
		return
	}

	if err := h.db.Model(&models.AgencyProfile{}).
		Where("id = ?", agencyID).
		Updates(map[string]any{"phone": phone}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update agency contact"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":             "agency contact updated",
		"phone":               phone,
		"whatsapp_normalized": normalizeWhatsAppDigits(phone),
		"whatsapp_url":        buildWhatsAppURL(phone, "Hello, I am contacting from the Maid Showcase platform."),
	})
}

func normalizeWhatsAppDigits(phone string) string {
	var builder strings.Builder
	for _, ch := range phone {
		if ch >= '0' && ch <= '9' {
			builder.WriteRune(ch)
		}
	}
	return builder.String()
}

func buildWhatsAppURL(phone, message string) string {
	digits := normalizeWhatsAppDigits(phone)
	if digits == "" {
		return ""
	}
	if strings.TrimSpace(message) == "" {
		return "https://wa.me/" + digits
	}
	return "https://wa.me/" + digits + "?text=" + url.QueryEscape(message)
}
