# Supabase Deployment Plan (Real Data Only)

This project is now configured to run without mock mode.

## What is already done

- Removed mock runtime branch from `backend/cmd/api/main.go`.
- Removed `MockMode` from `backend/internal/config/config.go`.
- Removed `MOCK_MODE` from `backend/.env.example`.
- Deleted mock implementation files:
  - `backend/internal/server/mock_router.go`
  - `backend/internal/server/mock_router_test.go`

## Phase 1: Supabase project link

Prerequisite: you already ran `supabase login`.

1. Create a Supabase project from dashboard.
2. Copy your project ref (looks like `abcdefghijklmnopqrst`).
3. In repo root, link CLI to project:

```powershell
supabase link --project-ref <YOUR_PROJECT_REF>
```

## Phase 2: Database connection

From Supabase dashboard:

- Go to `Project Settings -> Database -> Connection string`.
- Use transaction pooler connection string for app runtime.
- Ensure `sslmode=require` is present.

Set backend environment values in `backend/.env`:

```env
PORT=:8080
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<host>:6543/postgres?sslmode=require
JWT_SECRET=<very-long-random-secret-64-plus-chars>
JWT_EXPIRY_MINS=60
ADMIN_EMAIL=admin@maidshowcase.com
ADMIN_PASSWORD=<strong-password>
ALLOWED_ORIGINS=http://localhost:5173,https://<your-frontend-domain>
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_VIDEO_FOLDER=maidshowcase/videos
```

## Phase 3: First run against Supabase

```powershell
cd backend
go mod tidy
go run ./cmd/api
```

Expected behavior:
- Connects to Supabase Postgres.
- Runs `AutoMigrate` for models.
- Ensures default admin account exists.

## Phase 4: Frontend env

Set `frontend/.env`:

```env
VITE_API_URL=https://<your-backend-domain>/api
```

Local dev fallback can remain `http://localhost:8080/api`.

## Phase 5: Deploy backend and frontend

Recommended hosts:
- Backend: Render / Railway / Fly.io
- Frontend: Vercel / Netlify

### Render setup (recommended)

This repo now includes `render.yaml` in project root.

1. Push latest code to GitHub.
2. In Render dashboard, click `New +` -> `Blueprint`.
3. Select this repository and deploy the detected `render.yaml`.
4. In Render service env vars, set secret values:
  - `DATABASE_URL` = Supabase transaction pooler URL (`sslmode=require`)
  - `JWT_SECRET` = long random secret (64+ chars)
  - `ADMIN_PASSWORD` = strong production password
  - `ALLOWED_ORIGINS` = frontend origin(s), comma separated
    - `CLOUDINARY_CLOUD_NAME` = Cloudinary cloud name
    - `CLOUDINARY_API_KEY` = Cloudinary API key
    - `CLOUDINARY_API_SECRET` = Cloudinary API secret
5. Keep defaults from blueprint:
  - `JWT_EXPIRY_MINS=60`
  - `ADMIN_EMAIL=admin@maidshowcase.com` (change if needed)
    - `CLOUDINARY_VIDEO_FOLDER=maidshowcase/videos` (optional)
6. Deploy and verify `GET /health` returns `200`.

Notes:
- Render usually provides `PORT` automatically. Backend now accepts both `10000` and `:10000` formats.
- Video uploads use Cloudinary when `CLOUDINARY_*` vars are configured; local disk `/uploads` can still be used for non-video fallbacks.

### Frontend deployment (Render static site)

`render.yaml` now includes a frontend static service:

- Service name: `maidshowcase-frontend`
- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- `VITE_API_URL`: `https://simple-flow.onrender.com/api`

After frontend deploy completes:

1. Copy frontend URL from Render (for example `https://maidshowcase-frontend.onrender.com`).
2. Update backend env var `ALLOWED_ORIGINS` to include that domain.
  Example:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://maidshowcase-frontend.onrender.com
```

3. Redeploy backend after changing `ALLOWED_ORIGINS`.

Backend deploy env vars must include:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRY_MINS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ALLOWED_ORIGINS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## Phase 6: Post-deploy smoke tests

1. `GET /health`
2. Register employer
3. Register agency
4. Admin login and approve agency
5. Agency login and create maid profile
6. Employer browse and filter
7. Open public profile page
8. Update and delete maid profile

## Phase 7: Next upgrade (recommended)

Current uploads are local filesystem (`/uploads`).
For production multi-instance reliability, migrate media to Supabase Storage:
- upload image/video to bucket
- store public URL in DB
- stop relying on local disk persistence

---

If you send me your Supabase project ref and preferred backend host, I can do the next implementation step immediately:
- switch you from local uploads to Supabase Storage,
- add the storage env vars,
- and ship a deployment-ready config.
