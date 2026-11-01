# Project: sagar-pal.dev

## Overview

Personal website for Sagar Pal, being rebuilt on branch `redesign`: an Astro 7 front end with React islands (`web/`) and a FastAPI back end (`api/`), shipped later as one Docker image on the Coolify VPS. `main` still holds the old Jekyll + Chirpy site and stays deployable until the cut-over in Phase 8.

## Read before doing any work (in this order)

1. `REDESIGN_PLAN.md` (repo root): decisions, architecture, phased tasks with acceptance criteria. Tick its boxes as phases finish.
2. `docs/redesign/DESIGN.md`: design system, page specs, final copy. It wins over the mockups when they disagree.
3. `docs/redesign/API.md`: FastAPI spec.
4. `docs/redesign/design-reference/README.md`: how to read the mockup sources (`*.dc.html`).

Rules that come from the plan:
- Work on `redesign`. Never push to `main`, never force-push.
- Ask Sagar before deploying, touching DNS/Cloudflare/Coolify, deleting anything outside this repo, or changing a decision in plan §1.
- Never ship the mockups' placeholder content (DESIGN.md §10, "Must not ship"). Blog and reading list launch empty.

## Status

- Phases 0, 1 and 2 are done (Phase 2: home page, static parts; Lighthouse mobile 98/100/96/100). Phase 3 (live hero simulation) is built and tested; a frame-rate check on a real mid-range phone is pending. Phases 4 (blog), 5 (FastAPI back end), 6 (reading page and home band) and 7 (projects, publications and 404 pages, SEO, the old service-worker kill switch) are done. Phase 8 (container and deployment) is done: staging runs at `https://next.sagar-pal.dev` (Coolify app "Personal Website (staging)", branch `redesign`, Auto Deploy on), without Litestream/R2 (Sagar's decision; nightly copies plus VPS disk backups). Next: Phase 9 (QA) against staging, then the production cut-over (DEPLOYMENT.md §8).

## Layout

- `web/`: Astro project (npm). `src/pages/` routes, `src/data/*.yml` profile data migrated from Jekyll's `_data/` (publications, projects, experience, education), `public/assets/{pdfs,img}/` files that keep their old public URLs (for example `/assets/pdfs/Sagar_Pal_CV_2025.pdf`). `trailingSlash: 'always'` keeps the old `/projects/` and `/publications/` URLs.
- Design system (`web/src/`): `styles/tokens.css` (colour tokens on any `[data-theme]` element, layout, font stacks), `styles/fonts.css` (Fontsource + Capsize-matched fallbacks), `styles/base.css` (reset, type role classes such as `.display`, `.h-section`, `.statement`, `.dek`, `.meta`; `.btn--primary/--secondary` with `--lg/--sm/--xs`; `.pill` with `aria-pressed`; `.row-link`; `.band`, `.card`; `.only-night/.only-day`; phone breakpoint `max-width: 719.98px`). `layouts/Base.astro` (head, SEO, JSON-LD via `person` prop, `ClientRouter`, skip link, focus to `<main>` after navigation; `footer="full"` on home, `"compact"` elsewhere). `components/ThemeScript.astro` (blocking head script; `window.__theme.get/set` is the only theme writer), `ThemeToggle.astro`, `Nav.astro` (phone Menu sheet is a native modal `<dialog>` with a Tab wrap), `Footer.astro`. `data/site.ts` holds name, links, CV path, nav and JSON-LD.
- Home (Phase 2): `src/content.config.ts` (`file()` collections for the four YAML files; each entry needs an `id`; `getCollection()` does not keep file order, so sort explicitly), `components/Hero.astro` (poster pair + `lib/hero-poster.ts`, preloaded from the home page's `head` slot in `Base.astro`), `CareerList`, `ProjectCard`, `PaperList`, `WritingList` (reused by Phase 7 pages), `lib/format.ts`. `base.css` adds `.section-head`, `.phone-only`/`.phone-hidden` and the `[data-reveal]` entrance styles; the entrance script is in `Base.astro`.
- Hero field (Phase 3): plain TypeScript, not React (React's runtime alone is 68 KB gz; the budget is 25 KB). `lib/field-presets.ts`, `lib/gray-scott.ts` (WebGL2 engine), `lib/hero-field.ts` (wiring); the loader script in `Hero.astro` imports it once the hero is visible, the poster has decoded and the browser is idle. The field root `[data-hero-field]` exposes `data-state` (idle, warming, running, paused, play, unsupported) for tests. Favicon: `public/favicon.ico` and `apple-touch-icon.png`, made by `docs/redesign/scripts/make_assets.py --favicon`.
- Blog (Phase 4): posts are `src/content/blog/<slug>.mdx` (`blog` collection; topic enum `TOPICS` in `content.config.ts`). `lib/posts.ts` `getPosts()` is the only source of posts (drafts only under `astro dev`, newest first, with `readingMinutes` and `plainText` from `remarkPluginFrontmatter`). Markdown runs through `markdown.processor: unified(...)` in `astro.config.mjs` (Astro 7's default Sätteri processor ignores remark/rehype plugins); `lib/markdown.ts` holds `remarkPostMeta` (plain text, reading time, numbering) and the Shiki filename transformer. Post components (`components/post/`: `Figure`, `Sidenote`, `Callout`, `LiveField`) are passed to `<Content components>` in `pages/blog/[...slug].astro`, so posts do not import them. `layouts/Post.astro` + `lib/post.ts` (contents highlighting, note buttons, Copy link, Useful and views), `styles/prose.css` (prose, Shiki variables → tokens, KaTeX, sidenotes by container query), `pages/blog/index.astro` + `lib/blog-filter.ts`, `pages/content-manifest.json.ts` (never lists drafts). `components/ThemedPicture.astro` renders night/day image pairs. The example draft `example-draft.mdx` is the test fixture: keep it `draft: true`.
- Gray–Scott fields: `lib/field-runner.ts` (loop, brush, pausing, theme, resize) and `lib/field-loader.ts` (when to start: visible, poster decoded, idle; Play button under reduced motion) are shared by `lib/hero-field.ts` (presets) and `lib/live-field.ts` (sliders). Keep `field-loader.ts` free of engine imports so the engine stays lazy.
- The field refuses software-rendered WebGL (headless Chromium, CI): it shows the poster. Field tests opt in with an init script setting `window.__heroFieldTest = { shortSide: 96 }` (small grid; also enables the freeze/step hooks). Playwright defaults to `reducedMotion: 'reduce'`; tests about motion opt in with `page.emulateMedia({ reducedMotion: 'no-preference' })`. Real-GPU measurements work with `chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu'] })`.
- Reading list (Phase 6, plain TypeScript, no React): `pages/what-im-reading/index.astro` is a static shell with `<template>`s; `lib/reading-page.ts` fetches `GET /api/reading` at run time (never at build time: items added in the admin must show without a rebuild) and filters locally. `lib/reading.ts` (types, `fetchReading`, text helpers; set item text with `textContent` only). Home band: `components/ReadingBand.astro` + `lib/reading-band.ts` (hidden unless the API returns a "reading" item). Typographic cover: `components/ReadingCover.astro`. Tests mock the endpoint with `tests/e2e/reading-fixtures.ts` (`mockReading`); `astro preview` has no API, so unmocked pages show the error state and the home band stays hidden.
- Secondary pages and SEO (Phase 7): `pages/projects/index.astro` and `pages/publications/index.astro` reuse the home components with `full` (longer descriptions); `components/ProjectGrid.astro` and `lib/profile.ts` (`getProjects()`, `getPapers()`) are shared with home. `pages/404.astro` (`noindex`: no canonical). `Base.astro` props `image` (Open Graph image, default `/og/default.png`) and `type`; posts add `/og/{slug}.png`, `article:*` meta and `BlogPosting` JSON-LD in `Post.astro`. `public/robots.txt`. `public/sw.min.js` is the kill switch for the old Chirpy service worker (that exact path; FastAPI serves it `no-store`; keep until at least May 2027).
- Container and deployment (Phase 8): `Dockerfile` (Node build → uv deps → `python:3.12-slim` runtime with the Litestream binary, user `app` 10001:10001, `HEALTHCHECK` on `/api/health`), `deploy/entrypoint.sh` (restores `/data/site.db` from R2 when the volume has none, then runs uvicorn under `litestream replicate`; plain uvicorn when `LITESTREAM_BUCKET` is unset), `deploy/litestream.yml`, `.dockerignore`. `DEPLOYMENT.md` has the Coolify, R2, staging, restore and cut-over steps. The image installs `fastapi` + `uvicorn`, not `fastapi[standard]` (that is a dev dependency for `fastapi dev`). `CF-Connecting-IP` counts only from Cloudflare's ranges (`app/privacy.py`, `from_cloudflare`); uvicorn's `FORWARDED_ALLOW_IPS` must be the Coolify proxy network, and `/api/health` reports `via_cloudflare` to check it. `NOINDEX=true` (staging) adds `X-Robots-Tag`. `python -m app.tools.backup` writes nightly copies to `/data/backups` (newest 14). CI job `image` builds the image and waits for its health check. Local S3 tests: MinIO's images are no longer public; SeaweedFS (`chrislusf/seaweedfs server -s3`) works.
- Styleguide: `src/dev/styleguide.astro`, served at `/styleguide/` by `astro dev` only. Add each new component's specimens to `src/dev/Specimens.astro`.
- Playwright has two projects: `build` (against `astro preview` on :4322) and `dev` (against `astro dev` on :4323, files under `tests/e2e/dev/`). The build has zero posts (`tests/e2e/blog.spec.ts`); the example draft is tested in `dev/post.spec.ts`, which aborts `/api` calls by default and mocks the endpoints a test needs. `tests/e2e/helpers.ts` has the axe and no-sideways-scroll checks.
- `api/` (Phase 5): uv project, Python 3.12, spec in `docs/redesign/API.md`. `app/main.py` `create_app(settings)` (lifespan: FTS5 check, `alembic upgrade head` under a file lock, manifest load; routers; `SiteStatic` mount of `STATIC_DIR` only if it exists; `SecurityHeaders` and `RequestLog` middleware). The module-level `app` reads settings at import, so `HASH_SECRET`, `SESSION_SECRET` (≥ 32 chars) and `ADMIN_PASSWORD_HASH` must be set (`api/.env.example` says how to make them; `uv run python -m app.tools.hash_password`). `app/deps.py` `AppContext` on `app.state.ctx` (settings, engine, sessions, `ManifestStore`, rate limiters). `app/manifest.py` (reloads `content-manifest.json` when its mtime/size changes, checked at most once a minute; rebuilds `posts_fts`; a bad file keeps the previous manifest). `app/privacy.py` (daily HMAC visitor keys, bot regex, `CF-Connecting-IP` only with `TRUST_CLOUDFLARE`). `app/static.py` (redirects, cache headers, 404, Umami injection, CSP report-only with inline-script hashes). `app/auth.py` + `app/routers/admin.py` (Jinja2 pages under `/admin`, bearer JSON API under `/api/admin`), `app/services/lookup.py` (Open Library, arXiv, Crossref; tests use `httpx.MockTransport` through the `get_http_client` dependency), `app/services/og_image.py` (Pillow cards cached in `<data dir>/og-cache`). Migrations: `migrations/versions/0001_initial.py` (hand-written; `env.py` ignores `posts_fts*` for autogenerate). Logs are JSON lines; uvicorn's access log is disabled because it prints client IPs. One uvicorn worker serves the API and the whole static site, so a route that does blocking work (SQLAlchemy, argon2, httpx, Pillow, a manifest reload) must be a plain `def` (FastAPI runs it in the thread pool), never `async def`. The admin reads its form in the async dependencies `CsrfForm`/`AdminForm` for this reason.
- API tests: `tests/conftest.py` sets test secrets before importing `app.main`; the `client` fixture serves a fake `dist/` with a two-post manifest over `https://testserver` (the admin cookies are `Secure`). Use `with TestClient(...)` so the lifespan runs migrations. Bot filtering ignores `HeadlessChrome`, so a browser check of Useful/views needs a normal `userAgent`. For a manual end-to-end run, point `STATIC_DIR` at a scratch copy of `dist/` with a hand-written manifest listing `example-draft`, run uvicorn on :8000 and open the draft under `astro dev`; never un-draft the fixture.
- `.github/workflows/ci.yml`: web job (prettier, eslint, astro check, build, Playwright smoke) and api job (ruff, ruff format, mypy strict, pytest with coverage).
- Old Jekyll inputs that later phases still need (the JSON-LD `Person` block in `index.html`, social links in `_config.yml` and `_data/contact.yml`) exist only on `main`. Read them with `git show main:index.html` and similar.

## Local development

Needs Node ≥ 22.23.4 (Astro 7.4 requirement) and uv. uv fetches Python 3.12 itself.

```bash
make install    # npm ci in web/, uv sync in api/
make dev        # Astro on :4321 (proxies /api, /admin, /feed.xml, /og to :8000) + FastAPI on :8000
make build      # astro build -> web/dist
make test       # pytest with coverage, then build + Playwright smoke (preview server on :4322)
make lint       # prettier --check, eslint, astro check, ruff, ruff format --check, mypy
make fmt        # prettier --write, ruff --fix, ruff format
```

Local DB defaults to `./.data/site.db` (gitignored). `make dev` needs `api/.env`: copy `api/.env.example` and fill in the three required secrets (it says how). `make build` first if you want FastAPI to serve `web/dist` and its manifest; otherwise it serves the API only.

Astro 7 quirks that matter for agents:
- When Astro detects an AI agent, `astro dev` and `astro preview` start in the background and the command exits at once. Stop them with `npx astro dev stop` / `npx astro preview stop` (run in `web/`). `--ignore-lock` forces the foreground; Playwright's `webServer` uses it.
- With `trailingSlash: 'always'`, Astro's dev server answers 404 for slashless paths like `/api/health` before Vite's proxy runs. The small `proxyBeforeAstro` plugin in `web/astro.config.mjs` moves the proxy first. It finds Vite's proxy by its internal name and throws at start-up if a Vite upgrade renames it.


## Version pins worth knowing

- TypeScript is pinned to `~6.0.3`. TypeScript 7 (the native Go compiler) is out, but typescript-eslint supports only `<6.1` and `@astrojs/check` only `^5 || ^6`.
- `eslint-plugin-jsx-a11y` is not installed because it does not support ESLint 10. Accessibility is checked with axe in Phase 9.

## Licence

`LICENSE`: MIT for code; site content (posts, profile text, images, PDFs) is all rights reserved.

## GPG signing

Git commits on this repo may have GPG signing configured. If signing fails, the user may need to enter their passphrase or disable signing temporarily.
