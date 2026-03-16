# Maid Showcase MVP

MVP platform for Ethiopian recruitment agencies to showcase domestic worker profiles to employers/brokers.

## Stack

- Backend: Go, Gin, GORM, PostgreSQL
- Frontend: React + Vite
- Auth: JWT (HS256)

## Project Structure

- `backend/` Go API
- `frontend/` React app
- `docker-compose.yml` local PostgreSQL

## Quick Start

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Backend setup:

```bash
cd backend
cp .env.example .env
go mod tidy
go run ./cmd/api
```

3. Frontend setup:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

4. For agency video uploads, set Cloudinary variables in `backend/.env`:

```env
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CLOUDINARY_VIDEO_FOLDER=maidshowcase/videos
```

## Default Admin

- Email: `admin@maidshowcase.com`
- Password: `Admin123!`

Change these in `backend/.env` before production.

## Implemented MVP Features

- Register/login with JWT
- Agency approval by admin
- Role-based authorization (`ADMIN`, `AGENCY`, `EMPLOYER`)
- Agency maid profile CRUD (active subscription required)
- Public/authenticated maid browsing with filters
- Manual subscription request + admin activation flow
- Basic rate limiting and request logging

## Security Notes

- Use a strong 64+ character `JWT_SECRET`
- Keep HTTPS enabled in deployment (Nginx/Cloudflare)
- Do not expose DB directly to internet
- Replace default admin credentials immediately
