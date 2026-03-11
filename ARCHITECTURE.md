# Maid Showcase System Design

## 1. Goal

This document explains how the system works end-to-end:
- Frontend architecture
- Backend architecture
- Data model
- Authentication and authorization
- Deployment topology
- Main request flows

## 2. Current Tech Stack

- Frontend: React + Vite + React Router + React Query
- Backend: Go + Gin + GORM
- Database: PostgreSQL (Supabase)
- Auth session: App JWT (backend-issued)
- Optional identity provider: Firebase ID token -> backend token exchange
- Hosting: Vercel/Netlify (frontend) + Render (backend) + Supabase (DB)

## 3. High-Level Architecture

```mermaid
flowchart LR
  subgraph Client
    U[Employer / Agency / Admin Browser]
    FE[React SPA\nfrontend/]
  end

  subgraph API
    BE[Go Gin API\nbackend/]
    UP[/uploads static files/]
  end

  subgraph Data
    DB[(Supabase Postgres)]
  end

  subgraph External
    FB[Firebase Auth\noptional login source]
  end

  U --> FE
  FE -->|JSON over HTTPS| BE
  FE -->|Google sign-in| FB
  FB -->|ID token| FE
  FE -->|POST /api/login/firebase| BE
  BE --> DB
  BE --> UP
  U -->|Public profile URL| BE
```

## 4. Runtime Components

```mermaid
flowchart TD
  A[cmd/api/main.go] --> B[config.Load]
  A --> C[database.Connect]
  A --> D[database.AutoMigrate]
  A --> E[database.EnsureDefaultAdmin]
  A --> F[server.NewRouter]
  F --> G[Gin middleware chain]
  F --> H[AuthHandler]
  F --> I[BrowseHandler]
  F --> J[AgencyHandler]
  F --> K[AdminHandler]
```

## 5. Backend Design

### 5.1 API Routing

Public:
- `GET /health`
- `GET /public/maids/:id`

Authentication:
- `POST /api/register`
- `POST /api/login`
- `POST /api/login/firebase`

Protected (`JWTAuth`):
- `GET /api/maids`

Agency (`JWTAuth + AgencyOnly`):
- `GET /api/agency/maids`
- `POST /api/agency/maids`
- `PUT /api/agency/maids/:id`
- `DELETE /api/agency/maids/:id`
- `GET /api/agency/contact`
- `PATCH /api/agency/contact`
- `POST /api/agency/subscribe`

Admin (`JWTAuth + AdminOnly`):
- `GET /api/admin/agencies/pending`
- `PATCH /api/admin/agencies/:id/approve`
- `GET /api/admin/subscriptions`
- `PATCH /api/admin/subscriptions/:id/activate`
- `GET /api/admin/visit-stats`

### 5.2 Middleware Pipeline

```mermaid
flowchart LR
  R[Incoming Request]
  M1[gin.Recovery]
  M2[RequestLogger]
  M3[RateLimit]
  M4[CORS]
  M5[Route Group Guards\nJWTAuth / AgencyOnly / AdminOnly]
  H[Handler]

  R --> M1 --> M2 --> M3 --> M4 --> M5 --> H
```

### 5.3 Core Backend Rules

- Agency users must be approved (`users.verified = true`) before successful login.
- Employer users are auto-verified on registration.
- Maid age is validated to be at least 18.
- Browse endpoint returns only `AVAILABLE` maids.
- Agency subscription status can be marked `EXPIRED` when end date passes.
- Backend always runs on real database (no mock runtime mode).

## 6. Authentication Design

### 6.1 Email/Password Login Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant API as AuthHandler
  participant DB as PostgreSQL

  C->>API: POST /api/login (email, password)
  API->>DB: Find user by email
  API->>API: Check bcrypt password
  API->>API: Verify agency approval (if role=AGENCY)
  API->>API: Generate app JWT
  API-->>C: access_token + user
```

### 6.2 Firebase Login Exchange Flow

```mermaid
sequenceDiagram
  participant C as Client
  participant FB as Firebase
  participant API as AuthHandler
  participant DB as PostgreSQL

  C->>FB: Sign in with Google
  FB-->>C: Firebase ID token
  C->>API: POST /api/login/firebase (id_token, role, profile)
  API->>API: Verify token signature + audience + issuer
  API->>DB: Find or create local user
  API->>API: Generate app JWT
  API-->>C: access_token + user
```

Token model:
- Firebase token is used only as identity proof at login exchange time.
- App session is always maintained by backend JWT for protected API calls.

## 7. Data Model (Logical ERD)

```mermaid
erDiagram
  USER ||--o| AGENCY_PROFILE : owns
  AGENCY_PROFILE ||--o{ MAID_PROFILE : publishes
  AGENCY_PROFILE ||--o{ SUBSCRIPTION : requests
  USER ||--o{ EMPLOYER_AGENCY_VISIT : generates
  AGENCY_PROFILE ||--o{ EMPLOYER_AGENCY_VISIT : receives

  USER {
    uint id
    string email
    string password_hash
    string role
    bool verified
    datetime last_login
  }

  AGENCY_PROFILE {
    uint id
    uint user_id
    string country
    string phone
    string subscription_status
    datetime subscription_start_date
    datetime subscription_end_date
  }

  MAID_PROFILE {
    uint id
    uint agency_id
    string name
    int age
    int experience_years
    string expected_salary
    string languages
    string availability_status
    string photo_url
    string intro_video_url
  }

  SUBSCRIPTION {
    uint id
    uint agency_id
    string plan_type
    datetime start_date
    datetime end_date
    string status
    string payment_method
    string transaction_ref
    int requested_months
  }

  EMPLOYER_AGENCY_VISIT {
    uint id
    uint employer_id
    uint agency_id
    datetime created_at
  }
```

## 8. Main Business Flows

### 8.1 Agency Publishes Profile

```mermaid
sequenceDiagram
  participant A as Agency UI
  participant API as AgencyHandler
  participant FS as /uploads
  participant DB as PostgreSQL

  A->>API: POST /api/agency/maids (multipart or JSON)
  API->>FS: Save photo/video if provided
  API->>DB: Insert maid profile
  API-->>A: Created maid profile
```

### 8.2 Employer Browses and Contacts Agency

```mermaid
sequenceDiagram
  participant E as Employer UI
  participant API as BrowseHandler
  participant DB as PostgreSQL

  E->>API: GET /api/maids?filters
  API->>DB: Query available maids + agency contact data
  API->>DB: Insert employer_agency_visit rows
  API-->>E: Maid list + WhatsApp details
```

### 8.3 Admin Approval and Activation

```mermaid
sequenceDiagram
  participant AD as Admin UI
  participant API as AdminHandler
  participant DB as PostgreSQL

  AD->>API: PATCH /api/admin/agencies/:id/approve
  API->>DB: users.verified = true
  API-->>AD: Agency approved

  AD->>API: PATCH /api/admin/subscriptions/:id/activate
  API->>DB: Set subscription status paid
  API->>DB: Set agency status active + dates
  API-->>AD: Subscription activated
```

## 9. Frontend Design

```mermaid
flowchart TD
  M[main.jsx] --> AF[AuthProvider]
  M --> R[BrowserRouter]
  M --> Q[React Query Client]
  M --> FI[initFirebase]

  R --> AP[App Routes]
  AP --> L[LoginPage]
  AP --> RG[RegisterPage]
  AP --> D[DashboardPage]

  D --> C1[Browse View]
  D --> C2[Agency CRUD View]
  D --> C3[Admin View]
```

Frontend behavior highlights:
- API base URL is selected from `VITE_API_URL`, with production fallback to Render API.
- Auth context stores app token/user in local storage.
- Firebase is initialized in frontend startup and used for Google sign-in.
- Canonical redirect is applied on Vercel preview hosts to keep auth domain consistent.

## 10. Deployment Topology

```mermaid
flowchart LR
  subgraph Users
    B[Browser]
  end

  subgraph Frontend Hosting
    V[Vercel/Netlify Static Site]
  end

  subgraph Backend Hosting
    R[Render Web Service\nGo API]
  end

  subgraph Data Services
    S[(Supabase PostgreSQL)]
  end

  subgraph Identity
    F[Firebase Auth]
  end

  B --> V
  V -->|HTTPS /api/*| R
  V -->|Google auth popup| F
  R --> S
```

## 11. Configuration Map

Backend (`backend/.env`):
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRY_MINS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Frontend (`frontend/.env`):
- `VITE_API_URL`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

## 12. Operational Notes

- Uploads are stored on local filesystem (`/uploads`) on the backend instance.
- For stronger production durability, move media to object storage (for example Supabase Storage).
- Rate limiting is in-memory and per-instance.
- CORS is allow-list based; frontend domains must match backend `ALLOWED_ORIGINS`.

## 13. Quick Mental Model

If you remember only one thing, remember this path:
1. User signs in (email/password or Firebase exchange).
2. Backend issues app JWT.
3. Frontend uses app JWT for all protected API calls.
4. Backend enforces role rules (`ADMIN`, `AGENCY`, `EMPLOYER`) and persists data to Supabase Postgres.
