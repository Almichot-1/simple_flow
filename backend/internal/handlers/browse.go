package handlers

import (
	"bytes"
	"fmt"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"maidshowcase-api/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type BrowseHandler struct {
	db *gorm.DB
}

type MaidBrowseResponse struct {
	models.MaidProfile
	AgencyPhone       string `json:"agency_phone"`
	AgencyWhatsApp    string `json:"agency_whatsapp"`
	AgencyWhatsAppURL string `json:"agency_whatsapp_url"`
	AgencyVerified    bool   `json:"agency_verified"`
	LastUpdatedAt     string `json:"last_updated_at"`
}

type publicMaidPageData struct {
	Title             string
	Description       string
	CanonicalURL      string
	ImageURL          string
	AgencyWhatsAppURL string
	MaidName          string
	Age               int
	ExperienceYears   int
	Languages         string
	ExpectedSalary    string
	Availability      string
}

func NewBrowseHandler(db *gorm.DB) *BrowseHandler {
	return &BrowseHandler{db: db}
}

func (h *BrowseHandler) ListMaids(c *gin.Context) {
	query := h.db.Model(&models.MaidProfile{}).
		Where("availability_status = ?", models.AvailAvailable)

	if v := c.Query("age_min"); v != "" {
		if ageMin, err := strconv.Atoi(v); err == nil {
			query = query.Where("age >= ?", ageMin)
		}
	}
	if v := c.Query("age_max"); v != "" {
		if ageMax, err := strconv.Atoi(v); err == nil {
			query = query.Where("age <= ?", ageMax)
		}
	}
	if v := c.Query("experience_min"); v != "" {
		if exp, err := strconv.Atoi(v); err == nil {
			query = query.Where("experience_years >= ?", exp)
		}
	}
	if lang := strings.TrimSpace(c.Query("lang")); lang != "" {
		query = query.Where("LOWER(languages) LIKE ?", "%"+strings.ToLower(lang)+"%")
	}

	var maids []models.MaidProfile
	if err := query.Order("created_at desc").Find(&maids).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list maids"})
		return
	}

	agencyIDs := make([]uint, 0)
	seen := map[uint]bool{}
	for _, maid := range maids {
		if !seen[maid.AgencyID] {
			agencyIDs = append(agencyIDs, maid.AgencyID)
			seen[maid.AgencyID] = true
		}
	}

	type agencyContact struct {
		Phone    string
		Verified bool
	}

	agencyContacts := map[uint]agencyContact{}
	if len(agencyIDs) > 0 {
		var agencies []struct {
			ID       uint
			Phone    string
			Verified bool
		}
		if err := h.db.Table("agency_profiles").
			Select("agency_profiles.id, agency_profiles.phone, users.verified").
			Joins("left join users on users.id = agency_profiles.user_id").
			Where("agency_profiles.id IN ?", agencyIDs).
			Find(&agencies).Error; err == nil {
			for _, agency := range agencies {
				agencyContacts[agency.ID] = agencyContact{Phone: agency.Phone, Verified: agency.Verified}
			}
		}
	}

	response := make([]MaidBrowseResponse, 0, len(maids))
	for index := range maids {
		maids[index].PhotoURL = maskURL(maids[index].PhotoURL)
		maids[index].IntroVideoURL = maskURL(maids[index].IntroVideoURL)
		contact := agencyContacts[maids[index].AgencyID]
		phone := strings.TrimSpace(contact.Phone)
		response = append(response, MaidBrowseResponse{
			MaidProfile:       maids[index],
			AgencyPhone:       phone,
			AgencyWhatsApp:    normalizeWhatsAppDigits(phone),
			AgencyWhatsAppURL: buildWhatsAppURL(phone, fmt.Sprintf("Hello, I am interested in %s profile.", maids[index].Name)),
			AgencyVerified:    contact.Verified,
			LastUpdatedAt:     maids[index].UpdatedAt.Format(time.RFC3339),
		})
	}

	if c.GetString("role") == models.RoleEmployer {
		employerID := c.GetUint("user_id")
		if employerID != 0 {
			visitRows := make([]models.EmployerAgencyVisit, 0, len(agencyIDs))
			for _, agencyID := range agencyIDs {
				visitRows = append(visitRows, models.EmployerAgencyVisit{
					EmployerID: employerID,
					AgencyID:   agencyID,
				})
			}
			if len(visitRows) > 0 {
				_ = h.db.Create(&visitRows).Error
			}
		}
	}

	c.JSON(http.StatusOK, response)
}

func (h *BrowseHandler) PublicMaidProfile(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		c.String(http.StatusBadRequest, "invalid maid id")
		return
	}

	var maid models.MaidProfile
	if err := h.db.First(&maid, id).Error; err != nil {
		c.String(http.StatusNotFound, "profile not found")
		return
	}

	var agency models.AgencyProfile
	_ = h.db.Select("id", "phone").Where("id = ?", maid.AgencyID).First(&agency).Error

	description := fmt.Sprintf("%s, %d years old, %d years experience. Languages: %s. Status: %s.", maid.Name, maid.Age, maid.ExperienceYears, maid.Languages, maid.AvailabilityStatus)
	if strings.TrimSpace(maid.ExpectedSalary) != "" {
		description += " Expected salary: " + maid.ExpectedSalary + "."
	}

	pageData := publicMaidPageData{
		Title:             maid.Name + " | Maid Showcase Profile",
		Description:       description,
		CanonicalURL:      absoluteRequestURL(c, fmt.Sprintf("/public/maids/%d", maid.ID)),
		ImageURL:          absoluteAssetURL(c, maid.PhotoURL),
		AgencyWhatsAppURL: buildWhatsAppURL(agency.Phone, fmt.Sprintf("Hello, I am interested in %s profile.", maid.Name)),
		MaidName:          maid.Name,
		Age:               maid.Age,
		ExperienceYears:   maid.ExperienceYears,
		Languages:         maid.Languages,
		ExpectedSalary:    maid.ExpectedSalary,
		Availability:      maid.AvailabilityStatus,
	}

	var html bytes.Buffer
	if err := publicMaidPageTemplate.Execute(&html, pageData); err != nil {
		c.String(http.StatusInternalServerError, "failed to render profile")
		return
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, html.String())
}

func maskURL(value string) string {
	if value == "" {
		return ""
	}
	return value
}

func absoluteRequestURL(c *gin.Context, path string) string {
	scheme := c.Request.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		scheme = "http"
	}
	host := c.Request.Host
	if strings.HasPrefix(path, "/") {
		return scheme + "://" + host + path
	}
	return scheme + "://" + host + "/" + path
}

func absoluteAssetURL(c *gin.Context, value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		return trimmed
	}
	return absoluteRequestURL(c, trimmed)
}

var publicMaidPageTemplate = template.Must(template.New("public-maid-profile").Parse(`<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>{{ .Title }}</title>
	<meta name="description" content="{{ .Description }}">
	<link rel="canonical" href="{{ .CanonicalURL }}">
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">

	<meta property="og:type" content="website">
	<meta property="og:title" content="{{ .Title }}">
	<meta property="og:description" content="{{ .Description }}">
	<meta property="og:url" content="{{ .CanonicalURL }}">
	{{ if .ImageURL }}<meta property="og:image" content="{{ .ImageURL }}">{{ end }}

	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="{{ .Title }}">
	<meta name="twitter:description" content="{{ .Description }}">
	{{ if .ImageURL }}<meta name="twitter:image" content="{{ .ImageURL }}">{{ end }}

	<style>
		:root {
			--bg-a: #f4f9f9;
			--bg-b: #fef8f2;
			--card: #ffffff;
			--ink: #11243a;
			--muted: #4a6076;
			--line: #d7e3ec;
			--accent: #0e9f6e;
			--accent-strong: #087f57;
			--chip: #e7f5ef;
		}

		* { box-sizing: border-box; }

		body {
			margin: 0;
			font-family: "Sora", "Trebuchet MS", sans-serif;
			color: var(--ink);
			background: radial-gradient(circle at 12% 0%, #d7f6ee 0%, transparent 34%), radial-gradient(circle at 87% 100%, #ffe5c8 0%, transparent 34%), linear-gradient(135deg, var(--bg-a), var(--bg-b));
			min-height: 100vh;
		}

		.scene {
			max-width: 1020px;
			margin: 0 auto;
			padding: 28px 16px 36px;
		}

		.badge {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 7px 12px;
			border-radius: 999px;
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.07em;
			text-transform: uppercase;
			border: 1px solid #9bd9c2;
			background: #f0faf6;
			color: #066345;
		}

		.card {
			margin-top: 14px;
			display: grid;
			grid-template-columns: minmax(280px, 0.95fr) 1.05fr;
			gap: 22px;
			background: var(--card);
			border: 1px solid var(--line);
			border-radius: 22px;
			padding: 20px;
			box-shadow: 0 20px 60px rgba(19, 40, 60, 0.08);
			animation: rise 520ms ease-out;
		}

		.media {
			position: relative;
			border-radius: 16px;
			overflow: hidden;
			min-height: 250px;
			background: linear-gradient(160deg, #e1f5eb, #dcecf8);
		}

		.media img {
			display: block;
			width: 100%;
			height: 100%;
			object-fit: cover;
			animation: reveal 800ms ease-out;
		}

		.media-empty {
			height: 100%;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 1.2rem;
			font-weight: 700;
			color: #3e5f77;
		}

		h1 {
			font-family: "Fraunces", Georgia, serif;
			font-size: clamp(1.9rem, 3vw, 2.6rem);
			line-height: 1.06;
			margin: 4px 0 12px;
		}

		.subtitle {
			margin: 0 0 14px;
			color: var(--muted);
			font-size: 0.96rem;
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
			margin: 0;
			padding: 0;
			list-style: none;
		}

		.item {
			padding: 10px 12px;
			border-radius: 12px;
			background: #fbfdff;
			border: 1px solid #e4edf4;
		}

		.label {
			display: block;
			font-size: 0.73rem;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			font-weight: 700;
			color: #6a8197;
			margin-bottom: 4px;
		}

		.value {
			font-size: 0.97rem;
			font-weight: 600;
		}

		.chip {
			display: inline-flex;
			align-items: center;
			margin-top: 12px;
			padding: 7px 12px;
			border-radius: 999px;
			background: var(--chip);
			border: 1px solid #b4dfcc;
			font-size: 0.78rem;
			font-weight: 700;
			letter-spacing: 0.05em;
			text-transform: uppercase;
			color: #0b6445;
		}

		.cta {
			display: inline-flex;
			align-items: center;
			gap: 10px;
			margin-top: 18px;
			padding: 11px 16px;
			text-decoration: none;
			border-radius: 999px;
			color: #ffffff;
			font-weight: 700;
			background: linear-gradient(135deg, var(--accent), var(--accent-strong));
			box-shadow: 0 10px 25px rgba(14, 159, 110, 0.32);
			transition: transform 160ms ease, box-shadow 160ms ease;
		}

		.cta:hover {
			transform: translateY(-1px);
			box-shadow: 0 14px 28px rgba(14, 159, 110, 0.38);
		}

		.cta svg {
			width: 18px;
			height: 18px;
		}

		@keyframes rise {
			from { opacity: 0; transform: translateY(12px); }
			to { opacity: 1; transform: translateY(0); }
		}

		@keyframes reveal {
			from { opacity: 0.2; transform: scale(1.02); }
			to { opacity: 1; transform: scale(1); }
		}

		@media (max-width: 860px) {
			.card { grid-template-columns: 1fr; }
			.media { min-height: 220px; }
		}

		@media (max-width: 560px) {
			.scene { padding-left: 12px; padding-right: 12px; }
			.card { border-radius: 16px; padding: 14px; gap: 14px; }
			.grid { grid-template-columns: 1fr; }
		}
	</style>
</head>
<body>
	<main class="scene">
		<span class="badge">Verified Showcase Profile</span>
		<section class="card">
			<div class="media">
				{{ if .ImageURL }}
					<img src="{{ .ImageURL }}" alt="{{ .MaidName }} profile photo">
				{{ else }}
					<div class="media-empty">Profile Photo Coming Soon</div>
				{{ end }}
			</div>
			<div>
				<h1>{{ .MaidName }}</h1>
				<p class="subtitle">Trusted domestic worker profile curated for fast employer review.</p>

				<ul class="grid">
					<li class="item"><span class="label">Age</span><span class="value">{{ .Age }} years</span></li>
					<li class="item"><span class="label">Experience</span><span class="value">{{ .ExperienceYears }} years</span></li>
					<li class="item"><span class="label">Languages</span><span class="value">{{ .Languages }}</span></li>
					{{ if .ExpectedSalary }}<li class="item"><span class="label">Expected Salary</span><span class="value">{{ .ExpectedSalary }}</span></li>{{ end }}
				</ul>

				<span class="chip">{{ .Availability }}</span>

				{{ if .AgencyWhatsAppURL }}
					<a class="cta" href="{{ .AgencyWhatsAppURL }}" target="_blank" rel="noreferrer noopener">
						<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.04 2C6.55 2 2.1 6.45 2.1 11.94c0 1.93.56 3.81 1.61 5.41L2 22l4.8-1.67a9.91 9.91 0 0 0 5.24 1.5h.01c5.49 0 9.94-4.45 9.94-9.94A9.95 9.95 0 0 0 12.04 2Zm0 18.2c-1.57 0-3.1-.42-4.44-1.22l-.32-.19-2.85.99.93-2.77-.2-.34a8.26 8.26 0 0 1-1.28-4.43c0-4.57 3.72-8.29 8.3-8.29a8.3 8.3 0 0 1 8.29 8.29c0 4.58-3.72 8.29-8.3 8.29Zm4.55-6.2c-.25-.12-1.48-.73-1.71-.82-.23-.09-.39-.12-.56.12-.16.25-.64.82-.78.99-.14.16-.28.19-.53.06-.24-.12-1.03-.38-1.95-1.22a7.35 7.35 0 0 1-1.36-1.69c-.14-.24-.02-.37.1-.49.11-.11.24-.29.36-.44.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.56-1.36-.76-1.86-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.02s.87 2.35.99 2.51c.12.17 1.7 2.6 4.11 3.64.57.25 1.02.4 1.37.51.58.18 1.1.16 1.52.1.47-.07 1.48-.61 1.68-1.2.2-.59.2-1.09.14-1.2-.05-.12-.22-.18-.46-.3Z"/></svg>
						<span>Contact Agency on WhatsApp</span>
					</a>
				{{ end }}
			</div>
		</section>
	</main>
</body>
</html>`))
