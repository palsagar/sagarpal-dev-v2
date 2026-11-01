#!/bin/sh
# FastAPI serving the real build (web/dist) on :8001 for the `api` Playwright
# project. Throwaway secrets, a fresh database in a temporary folder, and every
# optional setting cleared, so values in api/.env never leak into the run.
set -eu
cd "$(dirname "$0")/../../../../api"
DB_DIR=$(mktemp -d)
export HASH_SECRET=e2e-only-hash-secret-0123456789abcdef
export SESSION_SECRET=e2e-only-session-secret-0123456789abc
ADMIN_PASSWORD_HASH=$(uv run python -c 'from app.auth import hash_password; print(hash_password("e2e-password"))')
export ADMIN_PASSWORD_HASH
export DATABASE_URL="sqlite:///$DB_DIR/site.db"
STATIC_DIR=$(cd ../web/dist && pwd)
export STATIC_DIR
export SITE_URL=http://localhost:8001 ADMIN_API_TOKEN= TRUST_CLOUDFLARE=false \
  NOINDEX=false UMAMI_DOMAIN= UMAMI_ID= CONTACT_EMAIL= LOG_LEVEL=warning
exec uv run uvicorn app.main:app --port 8001
