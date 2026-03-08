# Security Checklist

This project uses environment-based secrets and external services (Supabase, Render, Vercel).
Use this checklist before every deploy and push.

## 1. Secrets Rotation (Do This Immediately If Exposed)

- Rotate Supabase DB password in Supabase dashboard.
- Update `DATABASE_URL` in Render backend env vars.
- Rotate `JWT_SECRET` to a random value (64+ characters).
- Change `ADMIN_PASSWORD` from default value.
- Revoke or replace any tokens/keys accidentally shared.

## 2. Never Commit Secrets

- Keep secrets only in deployment env vars or local `.env` files.
- `backend/.env` and `frontend/.env` must stay gitignored.
- Commit only `.env.example` files with placeholders.
- Do not store secrets in docs, scripts, or test fixtures.

## 3. Safe Git Workflow

- Run `git status -sb` before each commit.
- Run `git diff --staged` before each push.
- If secrets are staged, unstage immediately: `git restore --staged <file>`.
- If secrets were committed but not pushed, rewrite local history before push.
- If secrets were pushed, rotate them first, then clean history.

## 4. Deployment Safety Checks

- Confirm backend env vars are set in Render:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `JWT_EXPIRY_MINS`
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - `ALLOWED_ORIGINS`
- Ensure `ALLOWED_ORIGINS` matches production frontend domain.
- Verify `GET /health` after deployment.

## 5. Uploads and Data Protection

- Local disk uploads are not durable on many hosts.
- Migrate media uploads to Supabase Storage for production reliability.
- Restrict bucket access using proper policies.

## 6. Optional Guardrails

- Add secret scanning in CI (for example, gitleaks/trufflehog).
- Enable GitHub secret scanning and push protection.
- Protect `main` branch with required reviews/checks.
