# Shortcuts for the Astro front end (web/) and the FastAPI back end (api/).
# See REDESIGN_PLAN.md §4.

.PHONY: install post dev dev-web dev-api build test test-api test-e2e lint fmt

# New draft post (docs/WRITING.md): make post title="My title"
post:
	cd web && node scripts/new-post.mjs "$(title)"

install:
	cd web && npm ci
	cd api && uv sync

# Astro on :4321 (proxies /api, /admin, /feed.xml, /og to :8000) + FastAPI on :8000.
# Ctrl-C stops both.
dev:
	@trap 'kill 0' INT TERM EXIT; \
	$(MAKE) --no-print-directory dev-api & \
	$(MAKE) --no-print-directory dev-web & \
	wait

dev-web:
	cd web && npm run dev

dev-api:
	cd api && uv run fastapi dev --port 8000

# Astro build -> web/dist (the API serves it from STATIC_DIR from Phase 5 on).
build:
	cd web && npm run build

test: test-api test-e2e

test-api:
	cd api && uv run pytest --cov=app --cov-report=term-missing --cov-fail-under=90

test-e2e: build
	cd web && npm run test:e2e

lint:
	cd web && npm run fmt:check && npm run lint && npm run check
	cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests

fmt:
	cd web && npm run fmt
	cd api && uv run ruff check --fix . && uv run ruff format .
