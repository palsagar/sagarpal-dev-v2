# Back-end spec — FastAPI

The FastAPI service owns everything dynamic and also serves the static Astro build. Pages never need the API to render; islands call it and degrade gracefully.

Responsibilities (decided with Sagar): **reading list + admin**, **per-post views + "Useful" reactions**, **full-text search**, **RSS**, **OG images**. Plus static hosting, redirects, security headers and Umami injection.

## 1. Stack
- Python 3.12, managed with **uv** (`api/pyproject.toml`, lockfile committed).
- FastAPI + uvicorn; Pydantic v2 + `pydantic-settings`.
- SQLAlchemy 2.x (sync engine is fine for SQLite; endpoints are tiny) + Alembic migrations, run on start-up.
- SQLite at `/data/site.db`: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. FTS5 for search (bundled with Python's sqlite3 on Debian images; assert at start-up).
- Jinja2 for the admin and RSS templates; Pillow for OG images; `httpx` for metadata lookups; `argon2-cffi` for the admin password; `itsdangerous` for the signed session cookie.
- Tests: pytest, httpx `TestClient`, `freezegun` for the daily salt rotation.

```
api/
├── pyproject.toml
├── alembic.ini
├── migrations/
├── app/
│   ├── main.py            # app factory, lifespan (migrations, manifest load), routers, static mount
│   ├── config.py          # Settings (env vars below)
│   ├── db.py              # engine, session, PRAGMAs
│   ├── models.py          # ReadingItem, PostStat, SeenKey
│   ├── schemas.py         # Pydantic I/O models
│   ├── manifest.py        # load/validate content-manifest.json, mtime watch, FTS rebuild
│   ├── privacy.py         # daily HMAC visitor key, bot filter
│   ├── ratelimit.py       # small in-memory token bucket (single process)
│   ├── routers/
│   │   ├── reading.py     # public reading API
│   │   ├── posts.py       # views + useful
│   │   ├── search.py
│   │   ├── feed.py        # /feed.xml
│   │   ├── og.py          # /og/{slug}.png
│   │   ├── admin.py       # /admin (HTML) + /api/admin (JSON, bearer)
│   │   └── health.py
│   ├── services/lookup.py # Open Library / arXiv / Crossref
│   ├── static.py          # StaticFiles subclass: cache headers, 404, Umami injection, redirects
│   ├── templates/admin/*.html, templates/feed.xml.j2
│   └── fonts/             # Archivo + Source Serif TTFs for OG rendering
└── tests/
```

## 2. Data model

```sql
-- reading list
CREATE TABLE reading_items (
  id            INTEGER PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('book','paper','article')),
  title         TEXT NOT NULL,
  authors       TEXT NOT NULL DEFAULT '',          -- display string, e.g. "Batatia, Kovács, Simm, Ortner, Csányi"
  year          INTEGER,
  source        TEXT,                               -- publisher / journal / site (e.g. "incompleteideas.net")
  url           TEXT,
  identifier    TEXT,                               -- ISBN-13 | arXiv ID | DOI
  cover_url     TEXT,                               -- optional (books)
  status        TEXT NOT NULL CHECK (status IN ('reading','finished','queued')),
  started_on    DATE,
  finished_on   DATE,
  note          TEXT CHECK (length(note) <= 280),   -- one line on why it matters
  verb          TEXT,                               -- optional label override, e.g. "reread"
  published     BOOLEAN NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at    TIMESTAMP                           -- soft delete
);
CREATE INDEX ix_reading_status ON reading_items(status, deleted_at, published);

-- aggregate stats per post (no per-visitor rows are kept long-term)
CREATE TABLE post_stats (
  slug    TEXT PRIMARY KEY,
  views   INTEGER NOT NULL DEFAULT 0,
  useful  INTEGER NOT NULL DEFAULT 0
);

-- short-lived dedupe keys (purged daily); key = HMAC(daily_secret, ip|ua|slug|action)
CREATE TABLE seen_keys (
  key        TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL
);

-- search (rebuilt from the manifest; not authoritative)
CREATE VIRTUAL TABLE posts_fts USING fts5(slug UNINDEXED, title, dek, tags, body, tokenize='porter unicode61');
```

## 3. Content manifest contract
Astro emits `dist/content-manifest.json` at build time (published posts only):

```json
{
  "generated_at": "2026-11-15T10:00:00Z",
  "site": "https://sagar-pal.dev",
  "posts": [
    {
      "slug": "gray-scott-wgsl",
      "url": "/blog/gray-scott-wgsl/",
      "title": "…", "dek": "…",
      "date": "2026-11-12", "updated": null,
      "tags": ["Numerics", "GPU"],
      "readingMinutes": 14,
      "text": "plain text of the body, no code blocks, no JSX"
    }
  ]
}
```

FastAPI loads it in the lifespan hook from `STATIC_DIR`, validates it with Pydantic, rebuilds `posts_fts`, and re-checks the file's mtime at most once a minute. Slugs not in the manifest get 404 from the stats endpoints, so nobody can create arbitrary rows.

## 4. Public endpoints (`/api`, JSON, same origin, no CORS)

| Method & path | Purpose | Response |
|---|---|---|
| `GET /api/health` | Liveness + DB check | `{"status":"ok","posts":N,"via_cloudflare":bool}`. `via_cloudflare` says whether this request came from a Cloudflare edge address; through the public URL it must be `true` (DEPLOYMENT.md §4) |
| `GET /api/reading?status=&kind=` | Published, non-deleted items. Order: `reading` by `started_on` desc; `finished` by `finished_on` desc; `queued` by `created_at` desc | `{"items":[ReadingItemOut…], "counts":{"all":n,"book":n,"paper":n,"article":n}}` |
| `GET /api/posts/{slug}/stats` | Counts for one post | `{"views":n,"useful":n,"reacted":bool}` (`reacted` = this visitor already reacted today) |
| `POST /api/posts/{slug}/view` | Count a view (deduped per visitor/day; bots ignored) | `204` |
| `POST /api/posts/{slug}/useful` | Count a Useful reaction (one per visitor/day) | `{"useful":n,"reacted":true}` |
| `GET /api/search?q=&limit=10` | FTS5 over title/dek/tags/body; `bm25` ranking; `snippet()` with `<mark>` | `{"results":[{"slug","url","title","dek","date","snippet"}]}` |
| `GET /feed.xml` | RSS 2.0 of published posts (latest 20, full `dek` + link; `atom:link rel=self`) | `application/rss+xml`, `Cache-Control: public, max-age=600` |
| `GET /og/{slug}.png`, `/og/default.png` | 1200×630 OG card | `image/png`, cached on disk under `/data/og-cache/{slug}-{hash}.png`, `Cache-Control: public, max-age=86400` |

Cache headers: `GET /api/reading` and `/stats` → `Cache-Control: no-store` (Cloudflare must not cache them); search → `public, max-age=60`.

`ReadingItemOut`: `id, kind, title, authors, year, source, url, identifier, cover_url, status, started_on, finished_on, note, label` where `label` is computed for display, e.g. `"Book, started October 2026"` or `"Article, reread October 2026"`.

### 4.1 Privacy-preserving dedupe
- Visitor key = `HMAC_SHA256(daily_secret, client_ip + "|" + user_agent + "|" + slug + "|" + action)`, where `daily_secret = HMAC_SHA256(HASH_SECRET, YYYY-MM-DD UTC)`. Store only the key with `expires_at = tomorrow 00:00 UTC + 1h`, and purge expired keys hourly. Raw IPs and UAs are never written to disk or logs.
- Client IP comes from `CF-Connecting-IP` when the request came via Cloudflare (trust only when `TRUST_CLOUDFLARE=true` and the peer is in Cloudflare's published ranges, `app/privacy.py`), else from uvicorn's proxy headers (`FORWARDED_ALLOW_IPS` = the Coolify proxy's network).
- Bot filter: ignore `view`/`useful` when the UA matches a conservative crawler regex or is empty.
- Rate limits (per hashed IP): `POST` stats 30/min; search 60/min; admin login 5/15 min.
- No cookies for visitors. This matches Umami's cookieless setup, so no consent banner is needed.

## 5. Admin

- **UI:** `GET /admin` (login form if no session) → list grouped by status, with a "New item" form and edit/delete per row. Server-rendered Jinja2, phone-first (Sagar will add items from his phone), styled with the site tokens (inline a small CSS file; no JS framework). `X-Robots-Tag: noindex, nofollow`.
- **Auth:** single user. `ADMIN_PASSWORD_HASH` (argon2id) from env. On success, set a signed session cookie (`itsdangerous`, 30-day expiry, `HttpOnly; Secure; SameSite=Strict; Path=/admin`). Every POST form carries a CSRF token (double-submit, signed). Logout clears the cookie.
- **Lookup:** "Fetch details" button next to the identifier field: `POST /admin/lookup` → ISBN via Open Library (`https://openlibrary.org/isbn/{isbn}.json` plus author lookups; cover `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg`), arXiv via the export API (`http://export.arxiv.org/api/query?id_list=`), DOI via Crossref (`https://api.crossref.org/works/{doi}`). 5s timeout; the form stays editable if lookup fails. Send a descriptive `User-Agent` with a contact email (Crossref etiquette).
- **JSON API for scripting:** `POST/PATCH/DELETE /api/admin/reading[/{id}]` with `Authorization: Bearer ${ADMIN_API_TOKEN}` (optional; disabled when unset).
- **Deletes are soft** (`deleted_at`). A separate "Permanently delete" action asks for confirmation.

## 6. Static hosting, redirects, headers
- Mount `STATIC_DIR` (the Astro `dist/`) after the API routers, using a `StaticFiles` subclass with `html=True`:
  - `/_astro/*` and fingerprinted assets → `Cache-Control: public, max-age=31536000, immutable`.
  - HTML → `Cache-Control: public, max-age=0, must-revalidate`.
  - Unknown paths → `dist/404.html` with status 404.
- **Redirects (301):** `/categories/*`, `/tags/*`, `/archives/*` → `/blog/`; `/posts/{slug}/` → `/blog/{slug}/`; `/cv` → `/assets/pdfs/Sagar_Pal_CV_2025.pdf`; `/sitemap.xml` → `/sitemap-index.xml` (the old Jekyll sitemap URL). Trailing-slash policy matches Astro's `trailingSlash` setting (pick `always` to keep the Chirpy-era `/projects/` and `/publications/` URLs).
- **Umami injection:** when `UMAMI_DOMAIN` and `UMAMI_ID` are both set, insert `<script defer src="{UMAMI_DOMAIN}/script.js" data-website-id="{UMAMI_ID}"></script>` before `</head>` in HTML responses (stream-safe: HTML files are small, so read, replace, send). When unset, inject nothing. This keeps today's runtime-configurable behaviour (see the old `nginx.conf.template`). Optional later: proxy the script and `/api/send` through the same origin to dodge ad-blockers.
- **Security headers** on all responses: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Frame-Options: DENY`. Start CSP as `Content-Security-Policy-Report-Only` (self + Umami domain + `data:` images and fonts + the inline theme script's hash, which Astro can expose at build time), then enforce after a week without reports.
- **Old PWA kill switch:** served as a normal static file from `web/public/` at the old service-worker path (see the plan, Phase 7), with `Cache-Control: no-store`.

## 7. RSS and OG details (and the fallback)
- **RSS:** Jinja2 template; items carry `title`, `link`, `guid` (permalink), `pubDate` (RFC 822), `description` (dek), `category` per tag. Channel `title` "Sagar Pal — Writing", `link` site URL, `description` "Long-form notes on numerical methods, high-performance computing and machine learning for science.", `atom:link rel=self`. Validate against the W3C feed validator in Phase 8.
- **OG image:** 1200×630, background = night field crop (`assets/field-hero-night.jpg`, darkened 30% under the text area), title in Archivo 64px/640 (wrap to max 3 lines; shrink to 52px if needed), dek in Source Serif 28px (max 2 lines), "sagar-pal.dev" bottom-left in amber `#F2A64A`. Default card for non-post pages uses the name and the hero statement. Bundle TTFs in `app/fonts/`.
- **Fallback, if this proves fiddly:** both can move to Astro build time (`@astrojs/rss` for `/feed.xml`; `satori` + `@resvg/resvg-js` for OG PNGs) with no change to URLs. Tell Sagar before switching; FastAPI ownership was his explicit choice.

## 8. Configuration (env vars)

| Variable | Required | Example / default | Notes |
|---|---|---|---|
| `SITE_URL` | yes | `https://sagar-pal.dev` | Absolute URLs in RSS/OG |
| `STATIC_DIR` | yes | `/app/web/dist` | Astro build output |
| `DATABASE_URL` | yes | `sqlite:////data/site.db` | Volume-backed |
| `HASH_SECRET` | yes | 32+ random bytes (base64) | Daily visitor HMAC; rotate = reset of today's dedupe only |
| `SESSION_SECRET` | yes | 32+ random bytes | Admin cookie + CSRF signing |
| `ADMIN_PASSWORD_HASH` | yes | `$argon2id$…` | Generate with `uv run python -m app.tools.hash_password` |
| `ADMIN_API_TOKEN` | no | — | Enables the bearer JSON admin API |
| `TRUST_CLOUDFLARE` | no | `true` in prod | Use `CF-Connecting-IP`, only from Cloudflare addresses |
| `FORWARDED_ALLOW_IPS` | in prod | `10.0.1.0/24` | Read by uvicorn: the proxy network whose `X-Forwarded-For` is trusted. Never `*` |
| `NOINDEX` | no | `true` on staging | Adds `X-Robots-Tag: noindex, nofollow` to every response |
| `LITESTREAM_BUCKET`, `LITESTREAM_PATH`, `LITESTREAM_ENDPOINT`, `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` | no | R2 bucket, `production` | Read by `deploy/entrypoint.sh`. Bucket set = Litestream replicates `/data/site.db` to R2 (all five needed) |
| `UMAMI_DOMAIN`, `UMAMI_ID` | no | `https://analytics.sagar-pal.dev`, UUID | Same semantics as today: no trailing slash; both empty → no tag |
| `CONTACT_EMAIL` | no | — | Added to the lookup User-Agent (Crossref etiquette); empty = no address sent |
| `LOG_LEVEL` | no | `info` | Never log IPs/UAs |

Coolify: set these as **runtime** variables (not build variables). Mount a persistent volume at `/data`.

## 9. Smoke checks (local image and staging)

```bash
curl -s  $BASE/api/health                              # {"status":"ok",...}
curl -sI $BASE/ | grep -i -E 'cache-control|strict-transport'
curl -s  $BASE/ | grep -o '<script[^>]*script.js[^>]*>'  # Umami tag present only when env set
curl -sI $BASE/categories/ | head -1                   # 301
curl -sI $BASE/publications/ | head -1                 # 200
curl -s  $BASE/feed.xml | head -5                      # valid RSS (empty channel at launch)
curl -s  "$BASE/api/search?q=test"                     # {"results":[]}
curl -s  $BASE/api/reading                             # {"items":[],"counts":{...}}
curl -sI $BASE/og/default.png | grep -i content-type   # image/png
curl -sI $BASE/does-not-exist | head -1                # 404 (custom page)
```

## 10. Ops
- **Migrations:** Alembic `upgrade head` in the lifespan hook, guarded by a file lock (single process anyway).
- **Backups (decided with Sagar, Phase 8):** Litestream → Cloudflare R2 runs in the container and copies every change off the server within about a second. A Coolify scheduled task runs `python -m app.tools.backup` nightly: SQLite's online backup API to `/data/backups/site-YYYY-MM-DD.db`, newest 14 kept. Restore steps: DEPLOYMENT.md §7.
- **Logs:** JSON lines to stdout (Coolify collects them); request logs exclude IP/UA and query strings for `/api/search`.
- **Workers:** a single uvicorn worker is enough, and simplifies the in-memory rate limiter. If scaling later, move rate limits to SQLite or Redis.
