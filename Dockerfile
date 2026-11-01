# sagar-pal.dev: one image that serves the Astro build and the FastAPI back end on :8000.
# Build:  docker build -t sagar-pal-dev .
# Deploy: DEPLOYMENT.md (Coolify, port 8000, volume at /data, runtime env vars).

# ---- 1. Astro build -> /web/dist ----
FROM node:22-slim AS web

# Keep peak memory low so a small VPS does not swap during the build: one libvips
# thread for image processing and a capped Node heap.
ENV VIPS_CONCURRENCY=1 \
    NODE_OPTIONS=--max-old-space-size=1536 \
    ASTRO_TELEMETRY_DISABLED=1

WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- 2. Python dependencies -> /app/.venv ----
FROM python:3.12-slim AS api-deps

COPY --from=ghcr.io/astral-sh/uv:0.10.4 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app/api
COPY api/pyproject.toml api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# ---- 3. Runtime ----
FROM python:3.12-slim

# Litestream copies every database change to Cloudflare R2 (deploy/entrypoint.sh).
COPY --from=litestream/litestream:0.5.17 /usr/local/bin/litestream /usr/local/bin/litestream

# Fixed ids, so files on the volume can be handled from outside as 10001:10001 (DEPLOYMENT.md §7).
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data \
    && chown app:app /data

COPY --from=api-deps /app/.venv /app/.venv
COPY --chown=root:root api/ /app/api/
COPY --from=web /web/dist /app/web/dist
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh

# Defaults for the container; the secrets and the rest come from Coolify (API.md §8).
# FORWARDED_ALLOW_IPS is read by uvicorn itself; set it to Coolify's proxy network.
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    SITE_URL=https://sagar-pal.dev \
    STATIC_DIR=/app/web/dist \
    DATABASE_URL=sqlite:////data/site.db

WORKDIR /app/api
USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
