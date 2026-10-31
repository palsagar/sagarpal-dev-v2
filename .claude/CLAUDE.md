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

- Phase 0 (branch, clean-up, scaffold) and Phase 1 (design system foundations) are done. Next is Phase 2 (home page, static parts).

## Layout

- `web/`: Astro project (npm). `src/pages/` routes, `src/data/*.yml` profile data migrated from Jekyll's `_data/` (publications, projects, experience, education), `public/assets/{pdfs,img}/` files that keep their old public URLs (for example `/assets/pdfs/Sagar_Pal_CV_2025.pdf`). `trailingSlash: 'always'` keeps the old `/projects/` and `/publications/` URLs.
- Design system (`web/src/`): `styles/tokens.css` (colour tokens on any `[data-theme]` element, layout, font stacks), `styles/fonts.css` (Fontsource + Capsize-matched fallbacks), `styles/base.css` (reset, type role classes such as `.display`, `.h-section`, `.statement`, `.dek`, `.meta`; `.btn--primary/--secondary` with `--lg/--sm/--xs`; `.pill` with `aria-pressed`; `.row-link`; `.band`, `.card`; `.only-night/.only-day`; phone breakpoint `max-width: 719.98px`). `layouts/Base.astro` (head, SEO, JSON-LD via `person` prop, `ClientRouter`, skip link, focus to `<main>` after navigation; `footer="full"` on home, `"compact"` elsewhere). `components/ThemeScript.astro` (blocking head script; `window.__theme.get/set` is the only theme writer), `ThemeToggle.astro`, `Nav.astro` (phone Menu sheet is a native modal `<dialog>` with a Tab wrap), `Footer.astro`. `data/site.ts` holds name, links, CV path, nav and JSON-LD.
- Styleguide: `src/dev/styleguide.astro`, served at `/styleguide/` by `astro dev` only. Add each new component's specimens to `src/dev/Specimens.astro`.
- Playwright has two projects: `build` (against `astro preview` on :4322) and `dev` (against `astro dev` on :4323, files under `tests/e2e/dev/`). `tests/e2e/helpers.ts` has the axe and no-sideways-scroll checks.
- `api/`: uv project, Python 3.12. `app/main.py` (app factory), `app/config.py` (pydantic-settings; reads env vars and `api/.env`), `app/db.py` (SQLite engine with the API.md PRAGMAs), `app/routers/`, `migrations/` (Alembic, no versions yet), `tests/`.
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

Local DB defaults to `./.data/site.db` (gitignored). Copy `api/.env.example` to `api/.env` to override settings.

Astro 7 quirks that matter for agents:
- When Astro detects an AI agent, `astro dev` and `astro preview` start in the background and the command exits at once. Stop them with `npx astro dev stop` / `npx astro preview stop` (run in `web/`). `--ignore-lock` forces the foreground; Playwright's `webServer` uses it.
- With `trailingSlash: 'always'`, Astro's dev server answers 404 for slashless paths like `/api/health` before Vite's proxy runs. The small `proxyBeforeAstro` plugin in `web/astro.config.mjs` moves the proxy first. It finds Vite's proxy by its internal name and throws at start-up if a Vite upgrade renames it.

`README.md` and `DEPLOYMENT.md` still describe the Jekyll site. Rewrite them for the new stack (DEPLOYMENT.md is a Phase 8 task).

## Version pins worth knowing

- TypeScript is pinned to `~6.0.3`. TypeScript 7 (the native Go compiler) is out, but typescript-eslint supports only `<6.1` and `@astrojs/check` only `^5 || ^6`.
- `eslint-plugin-jsx-a11y` is not installed because it does not support ESLint 10. Accessibility is checked with axe in Phase 9.

## Licence

`LICENSE`: MIT for code; site content (posts, profile text, images, PDFs) is all rights reserved.

## GPG signing

Git commits on this repo may have GPG signing configured. If signing fails, the user may need to enter their passphrase or disable signing temporarily.
