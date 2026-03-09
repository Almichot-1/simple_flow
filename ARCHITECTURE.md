    # Maid Showcase MVP Architecture

    ## 1. Purpose and Scope

    Maid Showcase MVP is a two-tier web application that lets recruitment agencies publish domestic worker profiles and lets employers browse/contact agencies.

    Primary goals:
    - Agency onboarding with approval workflow.
    - Profile publishing with media upload support.
    - Authenticated browsing and filtered search.
    - Admin operations for agency approval and subscription activation.
    - Public shareable profile page for each maid.

    ## 2. Repository Layout

    - `backend/`: Go API server (Gin + GORM + PostgreSQL)
    - `frontend/`: React + Vite single-page app
    - `docker-compose.yml`: local PostgreSQL service
    - `uploads/`: uploaded profile assets (images/videos), served statically by backend

    ## 3. High-Level System View

    ```mermaid
    flowchart LR
    U[Browser User\nAgency/Admin/Employer] --> F[React Frontend\nVite app]
    F -->|HTTP JSON + Bearer token| B[Go API\nGin Router]
    B -->|ORM| D[(PostgreSQL)]
    B --> S[/uploads static files/]
    U -->|Shared profile URL| P[Public profile page\n/public/maids/:id]
    P --> B
    ```

    ## 4. Runtime Modes

    The backend supports two execution modes selected by `MOCK_MODE`:

    - `MOCK_MODE=false` (default):
    - Connects to PostgreSQL.
    - Runs auto-migrations.
    - Ensures default admin account exists.
    - Starts full router with real persistence.

    - `MOCK_MODE=true`:
    - Uses in-memory store seeded with test users/data.
    - Generates mock bearer tokens only from mock `/api/login`.
    - Avoids database dependency.

    Entry point: `backend/cmd/api/main.go`.

    ## 5. Backend Architecture

    ### 5.1 Core Building Blocks

    - Router layer: `internal/server/router.go`
    - Handler layer: `internal/handlers/*.go`
    - Middleware layer: `internal/middleware/*.go`
    - Data models: `internal/models/*.go`
    - Persistence bootstrap: `internal/database/database.go`
    - Auth utilities: `internal/utils/jwt.go`, `internal/utils/password.go`
    - Configuration: `internal/config/config.go`

    ### 5.2 Middleware Pipeline

    Applied globally in this order:
    1. Panic recovery (`gin.Recovery`)
    2. Request logging
    3. In-memory IP rate limiting
    4. CORS handling
    5. Static assets route (`/uploads`)

    Authentication and authorization are applied on route groups:
    - `JWTAuth`: validates bearer JWT and sets `user_id`, `role`, `email` in request context.
    - `AgencyOnly`: ensures role is `AGENCY`, loads agency profile, computes subscription expiry status, sets `agency_id` and `agency_subscription_status`.
    - `AdminOnly`: ensures role is `ADMIN`.

    ### 5.3 API Surface

    Public routes:
    - `GET /health`
    - `GET /public/maids/:id` (SEO/social-preview HTML page)

    Auth routes:
    - `POST /api/register`
    - `POST /api/login`

    Protected routes (`JWTAuth`):
    - `GET /api/maids` (browse with filters)

    Agency routes (`JWTAuth + AgencyOnly`):
    - `GET /api/agency/maids`
    - `POST /api/agency/maids`
    - `PUT /api/agency/maids/:id`
    - `DELETE /api/agency/maids/:id`
    - `GET /api/agency/contact`
    - `PATCH /api/agency/contact`
    - `POST /api/agency/subscribe`

    Admin routes (`JWTAuth + AdminOnly`):
    - `PATCH /api/admin/agencies/:id/approve`
    - `GET /api/admin/subscriptions`
    - `PATCH /api/admin/subscriptions/:id/activate`

    ## 6. Data Model

    ```mermaid
    erDiagram
    USER ||--o| AGENCY_PROFILE : has
    AGENCY_PROFILE ||--o{ MAID_PROFILE : owns
    AGENCY_PROFILE ||--o{ SUBSCRIPTION : requests

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
    ```

    Key business rules encoded in code:
    - Agencies require admin approval before successful login (`user.verified`).
    - Employer accounts are auto-verified at registration.
    - Maid minimum age is 18.
    - Browse endpoint returns only `AVAILABLE` maids.
    - Agency subscription status can be marked expired when window has elapsed.

    ## 7. Authentication and Authorization Flow

    ```mermaid
    sequenceDiagram
    participant C as Client
    participant A as API
    participant DB as PostgreSQL

    C->>A: POST /api/login (email, password)
    A->>DB: Lookup user by email
    A->>A: Validate bcrypt password
    A->>A: Check agency approval if role=AGENCY
    A->>A: Generate JWT (HS256)
    A-->>C: access_token + user payload

    C->>A: Protected request with Bearer token
    A->>A: JWTAuth parse/verify token
    A->>A: Role guard middleware
    A-->>C: JSON response or 401/403
    ```

    Token details:
    - Signed with `JWT_SECRET`.
    - Expiry controlled by `JWT_EXPIRY_MINS`.
    - Claims include `user_id`, `role`, `email`.

    ## 8. Frontend Architecture

    Frontend is a single React app (`frontend/src/App.jsx`) with local state-driven views.

    Core characteristics:
    - API base URL from `VITE_API_URL` (fallback `http://localhost:8080/api`).
    - Stores `token` and `user` in `localStorage` for session persistence.
    - Uses `fetch` wrappers for JSON APIs and direct `FormData` upload for maid media.
    - Role-based UI sections:
    - Browse (all roles)
    - Agency tools (create/delete profiles, contact update)
    - Admin tools (agency approval)
    - Supports route-like behavior using browser history for profile deep links (e.g., `/maids/:id`) without a dedicated router package.

    ## 9. Data and Request Flows

    ### 9.1 Agency Profile Creation
    1. Agency logs in and receives JWT.
    2. Agency submits multipart form with profile + optional media files.
    3. Backend stores media under `uploads/` and persists maid record with file URLs.
    4. Profile becomes visible in browse when availability is `AVAILABLE`.

    ### 9.2 Employer Browsing and Contact
    1. Employer queries `/api/maids` with optional filters (age/experience/language).
    2. Backend enriches results with agency WhatsApp contact metadata.
    3. Frontend builds click-to-chat links and optional profile-share links.

    ### 9.3 Admin Governance
    1. Admin approves agencies through `PATCH /api/admin/agencies/:id/approve`.
    2. Admin activates subscription requests through `PATCH /api/admin/subscriptions/:id/activate`.
    3. Agency subscription status and dates are updated in DB transaction.

    ## 10. Configuration and Environment

    Backend config (`internal/config/config.go`) loads from `.env` / `backend/.env` with defaults for local dev:
    - `PORT`
    - `MOCK_MODE`
    - `DATABASE_URL`
    - `JWT_SECRET`
    - `JWT_EXPIRY_MINS`
    - `ADMIN_EMAIL`
    - `ADMIN_PASSWORD`
    - `ALLOWED_ORIGINS`

    Frontend config:
    - `VITE_API_URL`

    Infrastructure:
    - Local PostgreSQL via `docker-compose.yml` (`postgres:16`, mapped to `5432`).

    ## 11. Security and Operational Considerations

    Current safeguards:
    - Password hashing with bcrypt.
    - JWT-based stateless auth.
    - Role-based access control in middleware.
    - Basic in-memory rate limiting by client IP.
    - CORS allow-list with localhost equivalence handling.

    Operational caveats:
    - Rate limiter is in-memory, so limits are per process and reset on restart.
    - File uploads use local filesystem; multi-instance deployments need shared/object storage.
    - Static uploads are directly served by API process.
    - Default admin credentials exist for bootstrap and must be overridden in non-local environments.

    ## 12. Testing Strategy Snapshot

    - Mock router tests in `backend/internal/server/mock_router_test.go` validate key endpoints using in-memory mode.
    - Tests cover health, login, protected browsing, agency maid management, and admin subscriptions listing.
    - The mock auth system accepts only tokens issued by mock `/api/login`.

    ## 13. Future Evolution Options

    Potential next architecture steps:
    - Introduce service/repository layers for domain isolation beyond handlers.
    - Replace in-memory rate limiter with Redis-backed distributed limiter.
    - Move uploads to object storage (S3-compatible) with signed URLs.
    - Add explicit API versioning (`/api/v1`) and OpenAPI documentation.
    - Add background jobs for moderation, notifications, and media processing.
    - Add CI pipeline with backend unit/integration tests and frontend build/lint gates.
