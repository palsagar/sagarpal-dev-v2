# sagar-pal.dev redesign — build plan

> Status: **design signed off (31 Oct 2026). Phase 0 done on branch `redesign` (all checks pass locally; CI runs on the first push). Phase 1 next.**
> This is the master plan for replacing the Jekyll/Chirpy site with an Astro front end and a FastAPI back end.
> It is written for Claude Code to execute phase by phase; a human can follow it too.

Companion documents (read them in this order before writing code):

| File | What it holds |
|---|---|
| `REDESIGN_PLAN.md` (this file) | Decisions, architecture, repo layout, phased tasks with acceptance criteria, deployment and cut-over |
| `docs/redesign/DESIGN.md` | The design system: tokens for both themes, type scale, spacing, components, page anatomy, motion, the live hero simulation, final copy |
| `docs/redesign/API.md` | FastAPI back end: endpoints, data model, auth, privacy, caching, ops |
| `docs/redesign/design-reference/` | Source of the signed-off mockups (`*.dc.html`). Inline styles carry the exact values. See its README |
| `docs/redesign/assets/` | Final imagery: hero posters (night/day), example figure, project thumbnails, portrait |
| `docs/redesign/scripts/make_assets.py` | Regenerates the Gray–Scott imagery deterministically |

The live design canvas (private to Sagar; Claude Code cannot open it):
https://claude.ai/code/artifact/bf5de569-0bd5-4cdc-a5fb-1a6450f71221

---

## 0. How Claude Code should work through this

1. Work on the branch **`redesign`** (create it from `main` in Phase 0). Never push to `main`; never force-push.
2. One phase at a time. At the end of each phase: run the phase's checks, tick its boxes in this file, and commit with the repo's existing conventional style (`feat:`, `chore:`, `fix:`, `docs:`, `style:`).
3. Treat `DESIGN.md` as the spec and `design-reference/*.dc.html` as the pixel source. When the two disagree, `DESIGN.md` wins (it includes copy changes made after some mockups).
4. Use current docs for tool versions. Versions observed on npm/PyPI on 31 Oct 2026: `astro 7.4.x`, `@astrojs/mdx 8.x`, `@astrojs/react 7.x`, `@astrojs/sitemap 3.x`, `react 19.x`, `katex 0.19.x`, `remark-math 6`, `rehype-katex 7`, `@playwright/test 1.64`, `fastapi 0.162`, `uvicorn 0.54`, `sqlalchemy 2.1`, `alembic 1.20`, `pydantic-settings 2.16`, `pillow 13`. Astro has changed APIs across majors (content collections, view transitions), so check the Astro 7 docs instead of relying on memory.
5. Stop and ask Sagar before: deploying anything, touching DNS/Cloudflare/Coolify, deleting anything outside this repo, or changing a decision listed in §1.
6. No invented content. Blog and reading list ship **empty** with designed empty states. Mockup sample posts, reading items, view counts and like counts are placeholders and must not ship.

---

## 1. Decisions already made (with Sagar)

| Topic | Decision | Notes / trade-off accepted |
|---|---|---|
| Visual direction | **"Living Field"**: Sagar's own simulations are the site's material; the home hero is a live, touchable Gray–Scott field | Distinctive and personal; costs a WebGL island on the home page (budgeted, with a poster fallback) |
| Palette | **Carina** (Hubble-inspired): deep-space navy + amber accent + teal secondary | Blue/orange contrast is colour-blind friendly; amber needs a darker shade for text links on the light theme |
| Themes | **Night and day**, both first-class. First visit follows the OS setting; the toggle overrides and persists | Needs a blocking inline script in `<head>` to avoid a flash of the wrong theme |
| Type | Archivo (variable, `wdth` + `wght`) for UI and display; Source Serif 4 (variable, `opsz`) for long-form; JetBrains Mono only in code | Self-hosted via Fontsource. Do not load from Google Fonts: there are GDPR concerns for an EU site, and self-hosting is faster |
| Front end | **Astro 7 + React islands + MDX**, static output | Minimal JS by default; islands only for the simulation, search/filter, reading list, reactions |
| Back end | **FastAPI**, which owns: reading list (SQLite) + admin, per-post views + "Useful" reactions, full-text search, RSS (`/feed.xml`), OG images | A static site doesn't strictly need a backend. These features justify one. RSS/OG could be build-time in Astro instead; kept in FastAPI per decision (see API.md §7 for the fallback) |
| Blog at launch | Empty, with a designed empty state; RSS ready | Home hides the Writing section until the first post |
| Reading list at launch | Empty; Sagar adds items from the admin page | Home hides the Reading band until there is at least one item |
| Repo strategy | New branch `redesign`, Jekyll removed there, `main` untouched until merge | Rollback = redeploy `main` |
| Hosting | Existing Coolify VPS behind Cloudflare, one Docker image | FastAPI serves the static build and `/api` from one container (see §4) |
| Hero copy | "I work at the intersection of scientific computing, AI for science and high-performance ML systems." | Sagar iterated on this four times. Do not reword it |

---

## 2. Target architecture

```
Browser ──► Cloudflare (proxy + cache) ──► Coolify/Traefik ──► container :8000
                                                              │
                                                              ├─ FastAPI (uvicorn)
                                                              │   ├─ /api/*            JSON API (reading, stats, search)
                                                              │   ├─ /admin            server-rendered admin (Jinja2)
                                                              │   ├─ /feed.xml         RSS from content manifest
                                                              │   ├─ /og/{slug}.png    OG images (Pillow, disk-cached)
                                                              │   └─ /*                static Astro build (dist/), Umami tag injected
                                                              └─ /data (volume)        site.db (SQLite), og-cache/
```

- **Build time (Astro):** pages, MDX posts (KaTeX, Shiki), data collections (publications, projects, experience, education), sitemap, plus a `content-manifest.json` describing published posts. FastAPI reads the manifest for search, RSS, OG and slug validation.
- **Run time (FastAPI):** dynamic data only. Pages never depend on the API to render. Islands fetch from it and degrade gracefully (static fallback text) if it's down.
- **Why one container:** a personal site's traffic is low and Cloudflare caches static assets. One process means one deploy, one health check and one log stream. nginx in front would be faster for static files, but it isn't worth a second service here. Revisit if origin CPU ever matters.

### 2.1 Repo layout on `redesign`

```
/
├── web/                          # Astro front end
│   ├── astro.config.mjs
│   ├── package.json
│   ├── tsconfig.json
│   ├── public/
│   │   ├── assets/pdfs/          # moved from /assets/pdfs (same public URLs)
│   │   ├── assets/img/           # og-card.png, qr code, favicon set
│   │   ├── robots.txt
│   │   └── sw.js                 # self-unregistering kill switch for the old Chirpy PWA (Phase 7)
│   └── src/
│       ├── content.config.ts     # collections + zod schemas
│       ├── content/blog/         # MDX posts (empty at launch; drafts allowed)
│       ├── data/                 # publications.yml, projects.yml, experience.yml, education.yml (migrated from _data/)
│       ├── assets/               # images processed by astro:assets (posters, project thumbs, portrait)
│       ├── styles/               # tokens.css, base.css, prose.css, shiki theme
│       ├── layouts/              # Base.astro, Post.astro
│       ├── components/           # see DESIGN.md §6
│       ├── islands/              # HeroField.tsx, BlogFilter.tsx, ReadingList.tsx, Useful.tsx
│       ├── lib/                  # gray-scott (WebGL2), theme, api client, reading-time
│       └── pages/
│           ├── index.astro
│           ├── blog/index.astro
│           ├── blog/[...slug].astro
│           ├── what-im-reading.astro
│           ├── projects.astro          # keeps old URL /projects/
│           ├── publications.astro      # keeps old URL /publications/
│           ├── 404.astro
│           └── content-manifest.json.ts
├── api/                          # FastAPI back end (uv project)
│   ├── pyproject.toml
│   ├── alembic.ini, migrations/
│   ├── app/                      # main.py, config.py, db.py, models.py, schemas.py, routers/, services/, templates/admin/, fonts/
│   └── tests/
├── docs/redesign/                # this hand-off
├── Dockerfile                    # multi-stage: build web → run api + static
├── .dockerignore
├── Makefile                      # dev / build / test / lint shortcuts
├── .github/workflows/ci.yml      # lint + test + build on PRs (replaces pages-deploy.yml)
├── README.md, DEPLOYMENT.md      # rewritten for the new stack
└── .claude/CLAUDE.md             # updated project context
```

### 2.2 Routes

| Path | Source | Notes |
|---|---|---|
| `/` | Astro | Hero (live field), Path, Writing*, Reading*, Simulations and tools, Papers, footer. *hidden when empty |
| `/blog/` | Astro + island | Index with topic filters + search (island calls `/api/search`; client-side title filtering works without the API) |
| `/blog/<slug>/` | Astro (MDX) | TOC, sidenotes, KaTeX, Shiki, figures, Useful + views island |
| `/what-im-reading/` | Astro shell + island | Island fetches `/api/reading`; `<noscript>` explains it needs JS |
| `/projects/`, `/publications/` | Astro | Preserve existing URLs (they're indexed) |
| `/feed.xml` | FastAPI | Same URL as today's Chirpy feed |
| `/og/<slug>.png`, `/og/default.png` | FastAPI | 1200×630 |
| `/admin/…` | FastAPI (Jinja2) | `noindex`, password login |
| `/api/…` | FastAPI | see API.md |
| `/cv` | redirect → `/assets/pdfs/Sagar_Pal_CV_2025.pdf` | Convenience |
| `/categories/*`, `/tags/*`, `/archives/*` | 301 → `/blog/` | Old Chirpy tabs |
| `/posts/<slug>/` | 301 → `/blog/<slug>/` | Chirpy post URL pattern, in case anything linked it |

---

## 3. Phases

Each phase lists tasks, then **Done when** criteria. Tick boxes as you go.

### Phase 0 — Branch, clean-up, scaffold
- [x] `git checkout -b redesign` from an up-to-date `main`.
- [x] Remove Jekyll/Chirpy: `_config.yml`, `_tabs/`, `_plugins/`, `_posts/`, `index.html`, `Gemfile`, `tools/`, `.devcontainer/` (Jekyll image), `CNAME`, `.nojekyll`, `.github/workflows/pages-deploy.yml`, `nginx.conf.template`, the old `Dockerfile`, and the `assets/lib` submodule (`git submodule deinit -f assets/lib && git rm -f assets/lib`, then delete `.gitmodules`). *(The submodule was never in the index; only `.gitmodules` needed deleting.)*
- [x] **Migrate, don't delete:** `_data/{publications,projects,experience,education}.yml` → `web/src/data/`; `assets/pdfs/*` → `web/public/assets/pdfs/` (same public paths); `assets/img/og-card.png`, `qr-sagar-pal-dev.png` → `web/public/assets/img/`; `assets/img/prof_pic.jpg` stays available (used for JSON-LD).
- [x] `LICENSE` is Chirpy's MIT notice (© Cotes Chung). Remove it with the theme and **ask Sagar** which licence to add (suggestion: MIT for code, content all rights reserved). **Chosen 31 Oct 2026: MIT for code, content all rights reserved.**
- [x] Scaffold `web/` (Astro 7, TypeScript strict, MDX, React, sitemap) and `api/` (uv, FastAPI, SQLAlchemy 2, Alembic, pytest).
- [x] `Makefile`: `dev` (Astro :4321 with Vite proxy `/api`, `/admin`, `/feed.xml`, `/og` → `localhost:8000`, plus `uv run fastapi dev` on :8000), `build`, `test`, `lint`, `fmt`.
- [x] Tooling: Prettier + `prettier-plugin-astro`, ESLint (flat config), `astro check`; Ruff + mypy (or pyright) for `api/`.
- [x] `.gitignore` for node/uv/dist/`.data/`; remove Jekyll entries.
- [x] CI workflow: install, lint, typecheck, `pytest`, `astro build`, Playwright smoke (Phase 9 adds more).

**Done when:** `make dev` serves an Astro placeholder page and `/api/health` returns `{"status":"ok"}`. CI is green. No Jekyll files remain except the migrated data and assets.

### Phase 1 — Design system foundations
- [ ] `styles/tokens.css`: every token in DESIGN.md §2 for `[data-theme="night"]` and `[data-theme="day"]`, plus a `prefers-color-scheme` fallback for no-JS.
- [ ] Theme bootstrapping (DESIGN.md §3): blocking inline `<head>` script → `data-theme` on `<html>`; toggle button; persistence in `localStorage` (wrapped in try/catch); follow OS changes until the user picks; set `color-scheme`; update `<meta name="theme-color">`.
- [ ] Fonts via Fontsource: `@fontsource-variable/archivo/wdth.css` (wdth + wght), `@fontsource-variable/source-serif-4/opsz.css`, `@fontsource-variable/jetbrains-mono`. Preload the Archivo woff2 used above the fold. `font-display: swap` with metric-matched fallbacks (`size-adjust`) to keep CLS low.
- [ ] `Base.astro` (head, SEO meta, JSON-LD Person carried over from today's `index.html`, Umami placeholder comment), `Nav.astro` (desktop links, phone Menu sheet), `Footer.astro` (links, name filled with the field image via `background-clip: text`, colophon).
- [ ] Buttons/pills, link styles, focus ring, row hover, surfaces, from DESIGN.md §6.
- [ ] A dev-only `/styleguide` page (excluded from the sitemap and the production build) showing tokens, type scale and components in both themes.
- [ ] View transitions (Astro's client router) for page-to-page navigation. Ensure the theme script reruns or persists across swaps, and that focus moves to `<main>`.

**Done when:** `/styleguide` matches DESIGN.md in both themes. The toggle flips the theme instantly with no flash on reload. Axe reports zero contrast violations.

### Phase 2 — Home page (static parts)
- [ ] Data collections with zod schemas for publications, projects, experience, education (fields exactly as in today's YAML; add `image` to projects).
- [ ] Sections per DESIGN.md §7.1, in order: Hero (poster only for now), Path (portrait + paragraphs + career list), Writing (hidden when there are 0 published posts), Reading band (island placeholder; hidden when empty), Simulations and tools (four projects, alternating 7/5 and 5/7 widths), Papers (reverse-chronological, Sagar's name bold, PDF/DOI/arXiv pills), Footer.
- [ ] Hero CTAs: when there are 0 posts, the primary becomes "View projects" (`#work`) and the secondary stays "Download CV".
- [ ] Images through `astro:assets` (AVIF/WebP, responsive `srcset`, explicit width/height).

**Done when:** at 390, 768 and 1440 px in both themes, the page matches `design-reference/Main.dc.html` (desktop) and `HomeMobile.dc.html` (phone): no horizontal scroll, headings at most two lines, equal outer margins. Lighthouse (mobile) ≥ 95 for Performance, Accessibility, Best Practices and SEO.

### Phase 3 — Live hero simulation (`HeroField` island)
Spec in DESIGN.md §5. Summary:
- [ ] WebGL2 ping-pong Gray–Scott (RGBA16F, or RGBA32F when `EXT_color_buffer_float` is available) with the 9-point Laplacian, Du = 1.0, Dv = 0.5, dt = 1, and 8–16 substeps per frame. Grid ≈ 256 px on the short side for phones, ≈ 512 on desktop.
- [ ] Presets (buttons with `aria-pressed`): Coral (F 0.0545, k 0.0620), Mitosis (0.0367, 0.0649), Mazes (0.0290, 0.0570), Spots & loops (0.0180, 0.0510). Readout uses tabular figures.
- [ ] Colour via a 256×1 LUT texture built from the theme's field colormap; rebuild it on theme change.
- [ ] Pointer/touch drag seeds `v = 1` in a small disc, with no CPU readback.
- [ ] Start state: six noisy discs, warm-up of about 2,000 steps before the first visible frame. Show the poster until ready, then cross-fade (≤ 400 ms).
- [ ] Pause when off-screen (IntersectionObserver) or the tab is hidden. `prefers-reduced-motion`: no animation, show the poster plus a "Play simulation" button. No WebGL2: keep the poster and hide the controls. Cap DPR at 1.5.
- [ ] Load with `client:visible`. The island must not block LCP: the poster `<img>` is the LCP element and is server-rendered with `fetchpriority="high"`.

**Done when:** 60 fps on a 2020-class laptop and ≥ 30 fps on a mid-range phone, verified with the Performance panel. Main-thread long tasks from the island stay under 50 ms each. Reduced-motion and no-WebGL paths are verified. Total island JS ≤ 25 KB gzipped.

### Phase 4 — Blog
- [ ] `blog` collection schema: `title`, `dek`, `date`, `updated?`, `tags[]` (from a fixed topic list: Numerics, HPC, Scientific ML, GPU, Notes), `draft` (default `true`), `hero?` (image + alt), `toc` (default `true`). Drafts are visible in dev and excluded from the build, sitemap, RSS and manifest.
- [ ] MDX pipeline: `remark-math` + `rehype-katex` (self-host the KaTeX CSS and fonts; equation numbers via `\tag{}`); Shiki with dual themes driven by the tokens (night and day); auto-linked headings; reading time.
- [ ] MDX components: `<Figure>` (caption, optional `wide`), `<Sidenote>` (desktop: right margin; phone: inline expandable button with `aria-expanded`), `<Callout title>` (tone-step surface, no left border), `<Equation>` (if needed beyond `$$`), `<LiveField preset=… />` (reuses the hero engine, `client:visible`).
- [ ] `/blog/` index: big title, sentence, topic filter (pills with `aria-pressed`), search input (instant client filter on title/dek, plus `/api/search` for body text, debounced 200 ms), latest post featured, the rest grouped by year. Empty state per DESIGN.md §7.2.
- [ ] Post layout per DESIGN.md §7.3: sticky TOC (desktop) / `<details>` TOC (phone), measure ~68ch, Useful + Copy link + RSS at the end, previous/next.
- [ ] `content-manifest.json` endpoint: published posts only → `{slug, url, title, dek, date, updated, tags, readingMinutes, text}` where `text` is plain text stripped of MDX/JSX/code.
- [ ] Write one hidden example post (`draft: true`) that exercises every component. It's the test fixture and must never publish.

**Done when:** the example draft renders correctly in dev in both themes at all three widths. KaTeX and code don't overflow on phones (they scroll inside their own box). `astro build` produces zero posts, a valid empty manifest and the blog empty state.

### Phase 5 — FastAPI back end
Full spec in `docs/redesign/API.md`.
- [ ] Settings via `pydantic-settings`; SQLite at `/data/site.db` (WAL mode); Alembic migrations run on start-up.
- [ ] Reading list: model, public `GET /api/reading`, admin CRUD (server-rendered Jinja2 forms, phone-friendly), metadata lookup by ISBN (Open Library), arXiv ID (arXiv API) or DOI (Crossref).
- [ ] Views + Useful: privacy-preserving dedupe (daily-rotating HMAC of IP + UA, never stored raw), bot filtering, rate limits.
- [ ] Search: SQLite FTS5 index built from the manifest at start-up and on manifest change.
- [ ] RSS 2.0 `/feed.xml` and OG images `/og/{slug}.png` (Pillow, bundled fonts, field-image background, disk cache keyed by content hash).
- [ ] Static hosting of `web/dist` with correct cache headers, 404 page, redirects (§2.2), security headers, and Umami tag injection into HTML when `UMAMI_DOMAIN` and `UMAMI_ID` are set (parity with today's nginx `sub_filter`).
- [ ] Tests: pytest + httpx for every endpoint, auth, dedupe, migrations on an empty DB, manifest reload.

**Done when:** `pytest` passes with ≥ 90% coverage on `app/`. Admin works on a phone viewport. `curl` checks in API.md §9 pass locally against the built image.

### Phase 6 — Reading page + home band
- [ ] `/what-im-reading/` per DESIGN.md §7.4: title, sentence, type filter with counts, "Reading now" (lead item large with typographic cover; others stacked), "Finished" grouped by year, "Up next" in a surface band. Empty state.
- [ ] Book covers: if `cover_url` is set (admin can fetch from Open Library by ISBN), show it; otherwise use the typographic cover (amber for books, surface tiles for papers/articles).
- [ ] Home Reading band: up to 3 "reading now" items; hidden when empty.
- [ ] Loading skeletons with fixed heights (no CLS). If the API errors, show a quiet error line and no broken layout.

**Done when:** items added in admin appear on both pages without a redeploy; filters work by keyboard; the empty state renders in both themes.

### Phase 7 — Secondary pages, SEO, migration safety
- [ ] `/projects/` and `/publications/` (richer versions of the home sections, same components).
- [ ] 404 page in the design language (a small static field image + link home).
- [ ] SEO: canonical URLs, OG/Twitter meta (OG image from `/og/…`), JSON-LD `Person` on home and `BlogPosting` on posts, sitemap, `robots.txt`.
- [ ] Redirects from §2.2 (served by FastAPI, 301).
- [ ] **Old PWA kill switch.** The Chirpy site registered a service worker (`pwa.enabled: true`), so returning visitors may otherwise keep seeing the cached old site. Check the live site for the registered script URL (likely `/sw.js`; confirm with `curl -s https://sagar-pal.dev/ | grep -io 'serviceWorker[^;]*'` or DevTools). Ship a worker at **that exact path** that clears all caches, unregisters itself and reloads open clients. Keep it for at least six months.
- [ ] Favicons/app icons (generate from a small field crop), `theme-color` per theme.

**Done when:** every old URL in Google's index resolves (200 or 301): `/`, `/publications/`, `/projects/`, `/feed.xml`, `/assets/pdfs/*`, `/categories/`, `/tags/`, `/archives/`. A browser profile that visited the old site loads the new one after one reload.

### Phase 8 — Container + deployment (needs Sagar for Coolify/DNS steps)
- [ ] Multi-stage `Dockerfile`: `node:22-slim` builds `web/` → `python:3.12-slim` with uv installs `api/` → copy `web/dist` → run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'`. Non-root user, `HEALTHCHECK` on `/api/health`, image < 250 MB.
- [ ] Bound build memory (the VPS swap-thrash fix in today's Dockerfile is a lesson: keep `npm ci` single-job friendly, no parallel native builds).
- [ ] Rewrite `DEPLOYMENT.md`. Coolify app: build pack Dockerfile, **exposed port 8000** (was 80), persistent volume → `/data`, runtime env vars (API.md §8). Staging first: a second Coolify app on branch `redesign` at e.g. `next.sagar-pal.dev` (**ask Sagar**).
- [ ] Backups: nightly `sqlite3 .backup` to the volume plus off-box copy (Coolify S3 backup or Litestream → Cloudflare R2). **Ask Sagar** which.
- [ ] Cut-over checklist (DEPLOYMENT.md): staging sign-off → merge `redesign` → `main` → production redeploy → verify URLs, SW kill switch, Umami realtime hit, RSS validator, OG preview (e.g. opengraph.xyz) → keep the previous image tag for instant rollback.

**Done when:** staging passes Phase 9 QA and Sagar approves the production cut-over.

### Phase 9 — QA and polish
- [ ] Playwright e2e at 390, 768, 1440 × {night, day} × {JS on, JS off (where meaningful)}: navigation, theme toggle persistence, blog filter/search, Useful (dedupe), reading filters, admin happy path.
- [ ] Axe (via `@axe-core/playwright`): zero serious/critical violations. Keyboard-only pass: visible focus, logical order, skip link, Menu sheet traps focus and closes on Esc.
- [ ] Lighthouse CI budgets (mobile): Performance ≥ 95, LCP < 2.0 s, CLS < 0.05, TBT < 150 ms; home JS ≤ 60 KB gz total; post pages ≤ 15 KB gz JS.
- [ ] Reduced-motion run: no animation anywhere except user-initiated.
- [ ] Visual review against `design-reference/` at all widths in both themes. List any deliberate deviations in the PR description.
- [ ] Copy pass: no placeholder text remains (`grep -ri "sample\|lorem\|\[your" web/src`).

**Done when:** all checks are green in CI on the staging URL and the PR into `main` lists the results.

---

## 4. Environment and local development

```
make dev        # Astro on :4321 (proxying /api, /admin, /feed.xml, /og to :8000) + FastAPI on :8000
make build      # astro build → web/dist ; then api can serve it with STATIC_DIR=web/dist
make test       # pytest + vitest (if any) + playwright (headless)
make lint       # eslint, prettier --check, astro check, ruff, mypy
```

Local env (`api/.env`, gitignored): see API.md §8 for the full list. Local DB at `./.data/site.db`.

---

## 5. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hero sim hurts LCP or battery on phones | Medium | Poster is the LCP element; island is `client:visible`; DPR cap; pause off-screen; reduced-motion and low-power paths |
| Theme flash or mismatch with view transitions | Medium | Blocking head script; re-apply on `astro:after-swap`; e2e test reloads in both themes |
| Old Chirpy service worker serves the stale site | High (it's enabled today) | Kill-switch worker at the old SW path (Phase 7) |
| SQLite data loss on VPS | Low, but costly | Volume + nightly backup + off-box copy; Alembic migrations tested on an empty DB and a copy of prod |
| Admin page attacked | Medium (public URL) | Argon2 password hash, signed HttpOnly SameSite=Strict cookie, CSRF token, login rate limit, `noindex`, optional Cloudflare Access in front |
| Search/RSS drift from content | Low | Single source: the build-emitted manifest; API reloads on change; tests compare manifest vs routes |
| Google Fonts / GDPR | Avoided | Self-hosted fonts |
| Visual drift from the signed-off design | Medium | `/styleguide`, design-reference values, Phase 9 visual review |

## 6. Open questions for Sagar (non-blocking unless noted)
1. Licence for the new code and content (blocking Phase 0 licence file only).
2. Staging hostname (e.g. `next.sagar-pal.dev`) and whether to put the admin behind Cloudflare Access.
3. Backup target: Coolify S3 backups vs Litestream → Cloudflare R2.
4. Should the "From droplets to materials" section get the same quieter tone as the hero? (Raised on the canvas; currently unchanged.)
5. CV file: keep `Sagar_Pal_CV_2025.pdf` or upload a 2026 version (and add the `/cv` redirect target)?
6. Rent vs Buy site: its intro-tour overlay stays faintly visible behind the results after loading. Not part of this repo, but it shows in the project thumbnail.
