# sagar-pal.dev redesign — build plan

> Status: **design signed off (31 Oct 2026). Phases 0–2 and 4–7 done on branch `redesign`. Phase 3 built; its real-phone frame-rate check is pending. Phase 8: the image, backups and DEPLOYMENT.md are done; the staging deploy waits on Sagar's Coolify, DNS and R2 steps (DEPLOYMENT.md §3–§6).**
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
| Front end | **Astro 7 + React islands + MDX**, static output | Minimal JS by default; islands only for the simulation, search/filter, reading list, reactions. **Changed with Sagar (Phases 3–4):** the hero field and the blog search/filter are plain TypeScript, because React's runtime alone is 68 KB gzipped. The post's Useful/views script followed the same rule (to confirm with Sagar). **Phase 6 (with Sagar):** the reading page and the home Reading band are plain TypeScript too, so no React island ships |
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
│   │   └── sw.min.js             # self-unregistering kill switch for the old Chirpy PWA (Phase 7; Chirpy's worker URL)
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
├── deploy/                       # entrypoint.sh (Litestream + uvicorn), litestream.yml
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
| `/sitemap.xml` | 301 → `/sitemap-index.xml` | The old Jekyll sitemap URL, named in its robots.txt and probably in Search Console |

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
- [x] `styles/tokens.css`: every token in DESIGN.md §2 for `[data-theme="night"]` and `[data-theme="day"]`, plus a `prefers-color-scheme` fallback for no-JS.
- [x] Theme bootstrapping (DESIGN.md §3): blocking inline `<head>` script → `data-theme` on `<html>`; toggle button; persistence in `localStorage` (wrapped in try/catch); follow OS changes until the user picks; set `color-scheme`; update `<meta name="theme-color">`.
- [x] Fonts via Fontsource: `@fontsource-variable/archivo/wdth.css` (wdth + wght), `@fontsource-variable/source-serif-4/opsz.css`, `@fontsource-variable/jetbrains-mono`. Preload the Archivo woff2 used above the fold. `font-display: swap` with metric-matched fallbacks (`size-adjust`) to keep CLS low.
- [x] `Base.astro` (head, SEO meta, JSON-LD Person carried over from today's `index.html`, Umami placeholder comment), `Nav.astro` (desktop links, phone Menu sheet), `Footer.astro` (links, name filled with the field image via `background-clip: text`, colophon).
- [x] Buttons/pills, link styles, focus ring, row hover, surfaces, from DESIGN.md §6.
- [x] A dev-only `/styleguide` page (excluded from the sitemap and the production build) showing tokens, type scale and components in both themes.
- [x] View transitions (Astro's client router) for page-to-page navigation. Ensure the theme script reruns or persists across swaps, and that focus moves to `<main>`.

**Done when:** `/styleguide` matches DESIGN.md in both themes. The toggle flips the theme instantly with no flash on reload. Axe reports zero contrast violations.

*Phase 1 notes (31 Oct 2026):* tokens apply to any `[data-theme]` element (not only `:root`), so the styleguide renders both themes side by side; the no-JS fallback is as specified. The styleguide is injected only by `astro dev` (`devStyleguide` integration in `astro.config.mjs`), so it can never build or ship; it covers the Phase 1 components, and later phases add theirs. Fallback font metrics come from Capsize. On phones the footer name is sized to fit the column (the 92px mockup value overflows a 390px screen by 48px; the mockup clipped it). Nav "Projects"/"Papers" point to `/#work` and `/#papers`, as in the mockups. Checks: `tests/e2e/theme.spec.ts`, `layout.spec.ts`, `dev/styleguide.spec.ts` (axe: zero violations in both themes at 390/768/1440, with the Menu sheet open, and on both styleguide panels).

### Phase 2 — Home page (static parts)
- [x] Data collections with zod schemas for publications, projects, experience, education (fields exactly as in today's YAML; add `image` to projects).
- [x] Sections per DESIGN.md §7.1, in order: Hero (poster only for now), Path (portrait + paragraphs + career list), Writing (hidden when there are 0 published posts), Reading band (island placeholder; hidden when empty), Simulations and tools (four projects, alternating 7/5 and 5/7 widths), Papers (reverse-chronological, Sagar's name bold, PDF/DOI/arXiv pills), Footer.
- [x] Hero CTAs: when there are 0 posts, the primary becomes "View projects" (`#work`) and the secondary stays "Download CV".
- [x] Images through `astro:assets` (AVIF/WebP, responsive `srcset`, explicit width/height).

**Done when:** at 390, 768 and 1440 px in both themes, the page matches `design-reference/Main.dc.html` (desktop) and `HomeMobile.dc.html` (phone): no horizontal scroll, headings at most two lines, equal outer margins. Lighthouse (mobile) ≥ 95 for Performance, Accessibility, Best Practices and SEO.

*Phase 2 notes (31 Oct 2026):* data decisions confirmed with Sagar: `projects.yml` keeps its old fields for `/projects/` and adds `order`, `summary`, `tech`, `image`/`image_alt`/`image_position` or `terminal` (PortWhisperer), title "Rent vs Buy"; `education.yml` adds optional short `label`/`org`, and year ranges come from `period` ("Present" → "now"); phones show all four projects and papers, stacked (only the career list is cut to four rows plus "Full CV"). Every YAML entry has an `id` (the `file()` loader needs one). `getCollection()` does not keep file order, so projects sort by `order` and papers by year, then featured, then id (so within 2021: JCP, Computers and Fluids, PARIS; the mockup had PARIS second). The Writing section is wired to `posts: PostRow[] = []` until Phase 4; the Reading band renders nothing until Phase 6. The hero shows the poster and caption only; the preset controls arrive with the island in Phase 3. Both theme posters are lazy `<picture>`s (a hidden lazy image is never fetched) and a head script preloads the active theme's AVIF with `fetchpriority="high"`. Projects render in explicit rows of two, because at 1440px the three flex bases fit on one line. Section entrances (DESIGN.md §8) are in `Base.astro`: blocks with `data-reveal="0|1|2"` that start below the fold; skipped under reduced motion and without JS. Checks: `tests/e2e/home.spec.ts` (CTAs, hidden sections, order, career, projects rows at 1160/1440/1920, papers and pills, poster loading, headings ≤ 2 lines, no element overflow, equal margins at 390/768/1440, entrances, no-JS); page-wide axe runs with reduced motion. Throttled Playwright measurement (412px, 4× CPU, 1.6 Mbps, 150 ms): LCP 0.8–0.9 s on the poster, CLS 0, 0.4 MB. Lighthouse 12 (mobile, 3 runs against `astro preview`): Performance 98, Accessibility 100, Best Practices 96, SEO 100 on every run. Remaining flags: simulated LCP 2.5 s with "LCP image lazily loaded" (deliberate: lazy keeps the hidden theme's poster from downloading, and the head preload fetches the visible one early), 8 KB render-blocking CSS, and a `/favicon.ico` 404 (the site has no favicon yet; the old one came from the Chirpy gem).

### Phase 3 — Live hero simulation (`HeroField` island)
Spec in DESIGN.md §5. Summary:
- [x] WebGL2 ping-pong Gray–Scott (RGBA16F, or RGBA32F when `EXT_color_buffer_float` is available) with the 9-point Laplacian, Du = 1.0, Dv = 0.5, dt = 1, and 8–16 substeps per frame. Grid ≈ 256 px on the short side for phones, ≈ 512 on desktop.
- [x] Presets (buttons with `aria-pressed`): Coral (F 0.0545, k 0.0620), Mitosis (0.0367, 0.0649), Mazes (0.0290, 0.0570), Spots & loops (0.0180, 0.0510). Readout uses tabular figures.
- [x] Colour via a 256×1 LUT texture built from the theme's field colormap; rebuild it on theme change.
- [x] Pointer/touch drag seeds `v = 1` in a small disc, with no CPU readback.
- [x] Start state: six noisy discs, warm-up of about 2,000 steps before the first visible frame. Show the poster until ready, then cross-fade (≤ 400 ms).
- [x] Pause when off-screen (IntersectionObserver) or the tab is hidden. `prefers-reduced-motion`: no animation, show the poster plus a "Play simulation" button. No WebGL2: keep the poster and hide the controls. Cap DPR at 1.5.
- [x] Load with `client:visible`. The island must not block LCP: the poster `<img>` is the LCP element and is server-rendered with `fetchpriority="high"`.

**Done when:** 60 fps on a 2020-class laptop and ≥ 30 fps on a mid-range phone, verified with the Performance panel. Main-thread long tasks from the island stay under 50 ms each. Reduced-motion and no-WebGL paths are verified. Total island JS ≤ 25 KB gzipped.

*Phase 3 notes (31 Oct 2026):* **plain TypeScript, not a React island** (decided with Sagar): React's client runtime alone is 68 KB gzipped, so a React `HeroField.tsx` could not meet the 25 KB budget. React stays the plan for the other islands. Files: `lib/field-presets.ts` (presets, colormaps), `lib/gray-scott.ts` (WebGL2 engine: RGBA32F with RGBA16F fallback, brush segment in the step shader, bilinear display through a 256×1 LUT), `lib/hero-field.ts` (controls, pointer/touch, IntersectionObserver and visibility pausing, theme LUT swaps, resize, clean-up), and a loader `<script>` in `Hero.astro` that acts like `client:visible`: it imports the engine once the hero is on screen, after the visible poster has decoded and the browser is idle. Shaders compile with `KHR_parallel_shader_compile` polling, because querying `LINK_STATUS` on a cold cache blocked the main thread for 180 ms (M2 Pro). `V_MAX = 0.39` matches the poster's normalisation (99.6th percentile of v = 0.394). Phones (< 720px) use a 256-cell grid and 8 substeps per frame; desktop 512 and 12. The preset controls and Play button are server-rendered `hidden`, so no-JS and no-WebGL2 visitors see the poster only. Software-rendered WebGL (SwiftShader, llvmpipe, Windows Basic Render: blocklisted GPU drivers, VMs, CI) also gets the poster only, via `failIfMajorPerformanceCaveat` and the unmasked renderer name; the tests opt back in with `window.__heroFieldTest = { shortSide: 96 }`, which also enables the freeze/step test hooks. Phone preset buttons are 44px tall (the mockup's 40px is below DESIGN.md §9's 44px touch minimum). Playwright now defaults to reduced motion so pages do not all run software WebGL at once; motion tests opt in. Measured (headless Chrome on the Apple M2 Pro GPU through Metal): 60 fps at 1440 and 390px, also with 4× CPU throttling; no long tasks from the island (the one 56–64 ms task under 4× throttling is page start-up and also happens with the field off); live 0.85–0.97 s after navigation; island JS 5.7 KB gzipped (loader 1.4 KB + engine 4.2 KB). Checks: `tests/e2e/hero-field.spec.ts`. **Pending:** ≥ 30 fps on a real mid-range phone (GPU speed cannot be emulated); the M2 Pro is also faster than a 2020-class laptop.

### Phase 4 — Blog
- [x] `blog` collection schema: `title`, `dek`, `date`, `updated?`, `tags[]` (from a fixed topic list: Numerics, HPC, Scientific ML, GPU, Notes), `draft` (default `true`), `hero?` (image + alt), `toc` (default `true`). Drafts are visible in dev and excluded from the build, sitemap, RSS and manifest.
- [x] MDX pipeline: `remark-math` + `rehype-katex` (self-host the KaTeX CSS and fonts; equation numbers via `\tag{}`); Shiki with dual themes driven by the tokens (night and day); auto-linked headings; reading time.
- [x] MDX components: `<Figure>` (caption, optional `wide`), `<Sidenote>` (desktop: right margin; phone: inline expandable button with `aria-expanded`), `<Callout title>` (tone-step surface, no left border), `<Equation>` (if needed beyond `$$`), `<LiveField preset=… />` (reuses the hero engine, `client:visible`).
- [x] `/blog/` index: big title, sentence, topic filter (pills with `aria-pressed`), search input (instant client filter on title/dek, plus `/api/search` for body text, debounced 200 ms), latest post featured, the rest grouped by year. Empty state per DESIGN.md §7.2.
- [x] Post layout per DESIGN.md §7.3: sticky TOC (desktop) / `<details>` TOC (phone), measure ~68ch, Useful + Copy link + RSS at the end, previous/next.
- [x] `content-manifest.json` endpoint: published posts only → `{slug, url, title, dek, date, updated, tags, readingMinutes, text}` where `text` is plain text stripped of MDX/JSX/code.
- [x] Write one hidden example post (`draft: true`) that exercises every component. It's the test fixture and must never publish.

**Done when:** the example draft renders correctly in dev in both themes at all three widths. KaTeX and code don't overflow on phones (they scroll inside their own box). `astro build` produces zero posts, a valid empty manifest and the blog empty state.

*Phase 4 notes (1 Nov 2026):* decided with Sagar: the search/topic filter is plain TypeScript (`lib/blog-filter.ts`, no React); `Notes` stays in the topic enum and the index shows a pill only for topics with posts; the Useful button, read count and body-text search are built now and stay hidden until their `/api` endpoints answer (Phase 5), and tests mock those endpoints; `<LiveField preset=… />` has F and k sliders as in `Post.dc.html`. **Pipeline:** Astro 7's default Markdown processor (Sätteri) does not run remark/rehype plugins, so `markdown.processor` is `unified()` from `@astrojs/markdown-remark` with `remark-math`, `remarkPostMeta` (`lib/markdown.ts`: plain text for the manifest, reading time at 230 wpm, numbering of `<Sidenote>` and `<Figure>`/`<LiveField>`; a hero with a caption is Figure 1), `rehype-katex` (`htmlAndMathml`), Astro's `rehypeHeadingIds` (its own id pass runs after user plugins) and `rehype-autolink-headings` (wrap). KaTeX is pinned to 0.16 to match `rehype-katex` 7; its CSS and fonts are bundled by Vite (self-hosted). Shiki uses its `css-variables` theme; `styles/prose.css` maps the variables to the tokens (keywords `--teal`, strings `--link`, comments `--ink-2`), so code follows the toggle with no flash. A fence's `title="…"` becomes a filename caption. **Components** (`components/post/`): `Figure`, `Callout`, `Sidenote` (written inline in a paragraph; margin note when the prose column is ≥ 996px, by container query; otherwise inline, collapsed behind a 26px button with `aria-expanded` when JS runs and open without JS), `LiveField`; plus `components/ThemedPicture.astro` for night/day image pairs. No `<Equation>`: `$$ … \tag{n} $$` covers it. The hero's loop, brush and pausing moved into `lib/field-runner.ts` and its start rules into `lib/field-loader.ts`, shared by the hero and `LiveField` (hero island JS unchanged: 1.4 + 4.3 KB gzipped). **Layout:** from 1024px a 240px column holds the sticky contents list; below 1024px it becomes a `<details>`. Display math scrolls inside its own box (a `--surface` box on phones) and gets `tabindex="0"` only while it overflows; equation numbers sit after a scrolling equation instead of over it. Code is full-bleed on phones. **Drafts** come from `lib/posts.ts` (`import.meta.env.DEV || !draft`); the manifest also drops drafts in dev. Example draft: `src/content/blog/example-draft.mdx`. The post hero and the featured image on `/blog/` use `ThemedPicture priority`: the active theme's AVIF is preloaded with high priority (both images stay lazy, as on the home hero). A view counts after 10 s on the visible page or once half the post has been scrolled; loading a short post does not count by itself. Only captioned figures take a number. Checks: `tests/e2e/blog.spec.ts` (build: empty state at three widths in both themes with axe, empty valid manifest, draft URL 404, no file in `dist/` mentions the draft, home unchanged) and `tests/e2e/dev/post.spec.ts` (dev: numbering, KaTeX with MathML and self-hosted fonts, code colours following the theme, heading links, TOC and margin notes on desktop, `<details>` and note buttons on phones, no-JS, no sideways scroll and boxes scrolling inside at three widths in both themes with axe, Copy link, Useful/read count with and without the API, the live field in both motion modes, index filter/search/no-results, `/api/search` debounce, home listing the draft).

### Phase 5 — FastAPI back end
Full spec in `docs/redesign/API.md`.
- [x] Settings via `pydantic-settings`; SQLite at `/data/site.db` (WAL mode); Alembic migrations run on start-up.
- [x] Reading list: model, public `GET /api/reading`, admin CRUD (server-rendered Jinja2 forms, phone-friendly), metadata lookup by ISBN (Open Library), arXiv ID (arXiv API) or DOI (Crossref).
- [x] Views + Useful: privacy-preserving dedupe (daily-rotating HMAC of IP + UA, never stored raw), bot filtering, rate limits.
- [x] Search: SQLite FTS5 index built from the manifest at start-up and on manifest change.
- [x] RSS 2.0 `/feed.xml` and OG images `/og/{slug}.png` (Pillow, bundled fonts, field-image background, disk cache keyed by content hash).
- [x] Static hosting of `web/dist` with correct cache headers, 404 page, redirects (§2.2), security headers, and Umami tag injection into HTML when `UMAMI_DOMAIN` and `UMAMI_ID` are set (parity with today's nginx `sub_filter`).
- [x] Tests: pytest + httpx for every endpoint, auth, dedupe, migrations on an empty DB, manifest reload.

**Done when:** `pytest` passes with ≥ 90% coverage on `app/`. Admin works on a phone viewport. `curl` checks in API.md §9 pass locally against the built image.

*Phase 5 notes (1 Nov 2026):* 141 pytest tests, 99% coverage on `app/`; CI and `make test-api` now fail below 90%. The §9 `curl` checks pass against uvicorn serving a fresh `web/dist` (the Docker image is Phase 8), except `/publications/`, which is 404 until Phase 7 builds the page. End to end through `astro dev`'s proxy with a scratch manifest listing the example draft: the real `/stats`, `/useful`, `/view` and `/api/search` drive the post page and the blog search, and the admin works at 390px in both themes (no sideways scroll). **Decisions taken without asking (confirm or change):** the 404 page is `dist/404.html` when it exists, otherwise a plain built-in page until Phase 7's `404.astro`; `/cv` is a **302** (its target changes with each CV; a cached 301 would pin the old file), the other redirects are 301; directory URLs without a slash get a relative 301 (Starlette's default is a 307); lookups send `CONTACT_EMAIL` (new optional variable, empty by default) in the User-Agent, so no address is chosen for Sagar; the OG card darkens the text column by **55%**, not the 30% of API.md §7, because the serif dek was hard to read over the bright corals at 30%; `counts` in `GET /api/reading` ignore the `kind` filter (so the pills can show every count) but respect `status`; a queued item's label is "Paper, added January 2026" (from `created_at`); `GET /api/search` caps `limit` at 50 and the default stays 10; `/docs` and `/openapi.json` are off; expired dedupe keys are purged on writes at most once an hour, not by a timer. **Privacy:** uvicorn's access log is disabled (it prints client IPs); the app logs JSON lines with method, path (no query string), status and duration. **Security:** the three secrets are required (min. 32 characters for the two HMAC keys), so the app refuses to start without them; admin cookies are `HttpOnly; Secure; SameSite=Strict; Path=/admin` (browsers accept `Secure` on `http://localhost`); CSRF is a signed double-submit token; reading-list URLs must be `http(s)`; search snippets are HTML-escaped before `<mark>` is added; the CSP is report-only and hashes every inline script found in `dist/` at start-up (`img-src` allows any `https:` image for covers). There is no `report-uri` yet, so "a week without reports" cannot be measured until one is added. Fonts: Archivo and Source Serif 4 variable TTFs from the Google Fonts repository with their OFL files in `api/app/fonts/`; the OG background is `api/app/assets/field-hero-night.jpg`. FastAPI routes answer HEAD too (`/api/health`, `/feed.xml`, `/og/*`), so `curl -I` and uptime monitors work.

### Phase 6 — Reading page + home band
- [x] `/what-im-reading/` per DESIGN.md §7.4: title, sentence, type filter with counts, "Reading now" (lead item large with typographic cover; others stacked), "Finished" grouped by year, "Up next" in a surface band. Empty state.
- [x] Book covers: if `cover_url` is set (admin can fetch from Open Library by ISBN), show it; otherwise use the typographic cover (amber for books, surface tiles for papers/articles).
- [x] Home Reading band: up to 3 "reading now" items; hidden when empty.
- [x] Loading skeletons with fixed heights (no CLS). If the API errors, show a quiet error line and no broken layout.

**Done when:** items added in admin appear on both pages without a redeploy; filters work by keyboard; the empty state renders in both themes.

*Phase 6 notes (1 Nov 2026):* decided with Sagar: plain TypeScript, no React (plan §1 updated); the type filter lives in memory, not in the URL (reload returns to All, as on the blog); home band titles link to `/what-im-reading/` (as in the mockup), reading-page titles and Finished rows link to the item's own `url`, and items without a `url` render as plain text. **Structure:** `pages/what-im-reading/index.astro` is a static shell (header, skeleton, empty and error states, `<template>`s for every item shape); `lib/reading-page.ts` fetches `GET /api/reading` once at run time and renders the three sections; filtering is local and the pill counts come from `counts`. `lib/reading.ts` holds the types, `fetchReading` (10 s timeout; a non-2xx or a body without `items`/`counts` is an error) and the text helpers; item text is only ever set with `textContent`. `components/ReadingBand.astro` + `lib/reading-band.ts` fetch `?status=reading` and show up to three items. `components/ReadingCover.astro` is the typographic cover (also in the styleguide). **Decisions taken without asking (confirm or change):** pills whose count is 0 are not shown (as the blog shows only topics with posts); "Up next" shows the type ("Book"), not the API's "added …" label, as in the mockup; Finished rows show the month of `finished_on`, and finished items without that date go in a last group headed "Undated"; the cover's top line is the authors for books, and for papers and articles "arXiv {id}" when the source is arXiv, else the source, else the URL's domain; the small tile shows the title up to its first colon ("MACE"); a lead paper or article gets a 360px-wide tile at 1:1.414; a cover image that fails, or answers with Open Library's 1×1 "no cover" image, falls back to the typographic cover; covers load with `referrerpolicy="no-referrer"`; the error line reads "The reading list did not load. Please try again later." (not in the copy deck); without JS the page says "The reading list needs JavaScript."; the home band stays hidden when the API fails (no error line on the home page); a filter change is announced in a polite live region ("Showing 3 papers."); on phones the band hides its sentence and notes and puts the button after the list (HomeMobile.dc.html). **No CLS:** the pills keep their space while invisible, and the list area has `min-height: max(480px, 60vh)` in every state so the footer stays below the fold; a test measures CLS < 0.001 at three widths with an 800 ms API delay. **Test note:** under reduced motion `base.css` gives every property a 0.01 ms transition, so `visibility` changes land one frame late; tests that run axe right after the list loads wait for the pills to be visible. Each cover element is built once per item and reused across filter changes (no re-request, no fallback flash); the lead cover loads eagerly with high fetch priority. `fetchReading` combines its abort signals by hand, because `AbortSignal.any()` needs Safari 17.4. `monthAbbr` moved to `lib/format.ts` so client code can use it. The home band has no styleguide specimen: it is an empty shell that only the API fills, and the mocked tests in `home.spec.ts` cover its layout. JS added: home 1.1 KB gz, reading page 2.2 KB gz. Checks: `tests/e2e/reading.spec.ts` (mocked API: header and nav, empty, 500, malformed body, unreachable, skeleton and CLS, no-JS, counts, Reading now with typographic and real covers and fallbacks, Finished by year, Up next band, keyboard filters with announcements, one request, text never parsed as HTML, three widths × two themes with axe) and the Reading band tests in `home.spec.ts`. End to end with uvicorn on a scratch database behind `astro dev`: empty states, then items added through `POST /api/admin/reading` appeared on both pages on reload without a rebuild, keyboard filtering, no sideways scroll at 390/768/1440 in both themes.

### Phase 7 — Secondary pages, SEO, migration safety
- [x] `/projects/` and `/publications/` (richer versions of the home sections, same components).
- [x] 404 page in the design language (a small static field image + link home).
- [x] SEO: canonical URLs, OG/Twitter meta (OG image from `/og/…`), JSON-LD `Person` on home and `BlogPosting` on posts, sitemap, `robots.txt`.
- [x] Redirects from §2.2 (served by FastAPI, 301).
- [x] **Old PWA kill switch.** The Chirpy site registered a service worker (`pwa.enabled: true`), so returning visitors may otherwise keep seeing the cached old site. Check the live site for the registered script URL (likely `/sw.js`; confirm with `curl -s https://sagar-pal.dev/ | grep -io 'serviceWorker[^;]*'` or DevTools). Ship a worker at **that exact path** that clears all caches, unregisters itself and reloads open clients. Keep it for at least six months.
- [x] Favicons/app icons (generate from a small field crop), `theme-color` per theme.

**Done when:** every old URL in Google's index resolves (200 or 301): `/`, `/publications/`, `/projects/`, `/feed.xml`, `/assets/pdfs/*`, `/categories/`, `/tags/`, `/archives/`. A browser profile that visited the old site loads the new one after one reload.

*Phase 7 notes (1 Nov 2026):* decided with Sagar: the nav's "Projects" and "Papers" now link to `/projects/` and `/publications/` (they used to jump to `/#work` and `/#papers`; the hero's "View projects" button still jumps to `#work`, as the copy deck says); the page headers reuse the home wording ("Simulations and tools" with the home sentence; "Papers" with "Peer-reviewed work on numerical methods and the physics of multiphase flows." and a Google Scholar button). **Pages:** `components/ProjectGrid.astro` (the 7/5 rows, moved out of the home page) and `lib/profile.ts` (`getProjects()`, `getPapers()`: the sorting, shared with home); `ProjectCard` and `PaperList` take `full`, which shows the longer `description` from the YAML. On phones the projects title is `min(76px, 16.5vw)`, because "Simulations" at 76px is wider than a 390px screen. 404: `pages/404.astro` (copy from DESIGN.md §7.5, the mitosis field image, `noindex`); FastAPI serves `dist/404.html` with status 404. **SEO:** `Base.astro` takes `image` (default `/og/default.png`, the FastAPI card; the old Chirpy `og-card.png` stays at its URL but is no longer used) and `type`; `noindex` pages get no canonical URL or `og:url`. Posts (`Post.astro`) use `/og/{slug}.png`, `og:type` article, `article:*` tags and a `BlogPosting` JSON-LD block (`<` escaped). `public/robots.txt` disallows `/admin` and `/api/` and names the sitemap. The sitemap integration already leaves out the 404 page. The review added a 301 from `/sitemap.xml` (the old site's sitemap, which listed 10 URLs that all resolve on the new site) to `/sitemap-index.xml`. **Kill switch:** the old site registers **`/sw.min.js`** (not `/sw.js`; found in Chirpy's `app.min.js`), a cache-first worker. `public/sw.min.js` skips waiting, deletes every cache, unregisters itself and reloads open tabs; FastAPI sends it `no-store`. Keep it until at least May 2027. **Done before this phase:** the redirects (Phase 5, `app/static.py`), the favicon and Apple touch icon (Phase 3) and the `theme-color` per theme (Phase 1, `ThemeScript.astro`). **Checks:** FastAPI on the real build answered 200 for `/`, `/publications/`, `/projects/`, `/feed.xml` and all four PDFs, 301 → `/blog/` for `/categories/`, `/tags/`, `/archives/` (and their subpaths), 301 for `/posts/<slug>/`, 302 for `/cv`, and 404 with the new page for unknown paths. With the real Chirpy worker downloaded from the live site (scratch script, not in the repo), a profile that it controlled showed the old page for a moment on the first reload, then the new site; caches and workers were empty afterwards. `tests/e2e/seo.spec.ts` repeats this with a cache-first stand-in. make lint clean; make test: 148 pytest (99.60 % coverage) and 158 Playwright passed.

### Phase 8 — Container + deployment (needs Sagar for Coolify/DNS steps)
- [x] Multi-stage `Dockerfile`: `node:22-slim` builds `web/` → `python:3.12-slim` with uv installs `api/` → copy `web/dist` → run `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers` (from `deploy/entrypoint.sh`). Non-root user, `HEALTHCHECK` on `/api/health`, image < 250 MB (actual: about 290 MB on disk, 100 MB compressed; the Litestream binary is 35 MB of it).
- [x] With `TRUST_CLOUDFLARE=true`, make the origin reachable only through Cloudflare (firewall to Cloudflare's IP ranges, or a Cloudflare Tunnel), and set uvicorn's `--forwarded-allow-ips` to the proxy's address rather than `*`. Otherwise anyone can forge `CF-Connecting-IP` and bypass the per-IP login limit and the view/Useful dedupe (security review of Phase 5). **Done in the app instead (with Sagar):** `CF-Connecting-IP` counts only when the peer is in Cloudflare's published ranges, and `FORWARDED_ALLOW_IPS` is the Coolify proxy's network (DEPLOYMENT.md §4).
- [x] Bound build memory (the VPS swap-thrash fix in today's Dockerfile is a lesson: keep `npm ci` single-job friendly, no parallel native builds).
- [x] Rewrite `DEPLOYMENT.md`. Coolify app: build pack Dockerfile, **exposed port 8000** (was 80), persistent volume → `/data`, runtime env vars (API.md §8). Staging first: a second Coolify app on branch `redesign` at `next.sagar-pal.dev` (decided with Sagar).
- [x] Backups: nightly `sqlite3 .backup` to the volume plus off-box copy. **Sagar chose Litestream → Cloudflare R2.**
- [x] Cut-over checklist (DEPLOYMENT.md): staging sign-off → merge `redesign` → `main` → production redeploy → verify URLs, SW kill switch, Umami realtime hit, RSS validator, OG preview (e.g. opengraph.xyz) → keep the previous image tag for instant rollback.
- [ ] Sagar: create the two R2 buckets (staging and production) with one token each, the staging app, the `next` DNS record and the scheduled task (DEPLOYMENT.md §3–§6), then run the staging checks.

**Done when:** staging passes Phase 9 QA and Sagar approves the production cut-over.

**Phase 8 notes (1 Nov 2026).**
- **Decisions with Sagar.** Litestream → R2 for off-server backups. Coolify's S3 backups cover only databases Coolify runs, not a SQLite file in an app volume. The origin check is done in the app, so no firewall or tunnel is needed. Staging is at `next.sagar-pal.dev`. Cloudflare Access for `/admin` is not added for now.
- **Image.**
  - `fastapi[standard]` moved to the dev dependencies. The image installs `fastapi` and `uvicorn` only, because the extras brought OpenTelemetry, a second HTTP client, `requests` and the CLI. That cut the Python packages from 138 MB to 80 MB.
  - Coolify uses the Dockerfile's `HEALTHCHECK` for Dockerfile apps. Its own HTTP check would need `curl` in the image, which the image does not have.
  - The request log skips successful health checks.
- **App changes.**
  - `app/privacy.py` has Cloudflare's ranges and `from_cloudflare()`.
  - `/api/health` reports `via_cloudflare`, so the proxy setting can be checked from outside.
  - `NOINDEX=true` adds `X-Robots-Tag` on staging.
  - `python -m app.tools.backup` writes the nightly local copies.
- **Checked locally (Docker 29, arm64).**
  - The API.md §9 smoke checks pass.
  - The proxy trust works both ways: through a Cloudflare address, `via_cloudflare` is true; with a forged `X-Forwarded-For`, it is false.
  - The container stops in under a second, with or without Litestream.
  - Litestream copies to an S3-compatible store (SeaweedFS; MinIO's images are no longer public). It restores into an empty volume, skips the restore when the database exists, and keeps working after a nightly copy is put back.
  - A misconfiguration (missing secret, partial `LITESTREAM_*`) stops the container with exit status 1.
- **CI.** A new `image` job builds the image, starts it and waits for its health check.

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
2. ~~Staging hostname and Cloudflare Access for the admin.~~ Answered (Phase 8): `next.sagar-pal.dev`; no Access for now.
3. ~~Backup target.~~ Answered (Phase 8): Litestream → Cloudflare R2, plus nightly local copies.
4. Should the "From droplets to materials" section get the same quieter tone as the hero? (Raised on the canvas; currently unchanged.)
5. CV file: keep `Sagar_Pal_CV_2025.pdf` or upload a 2026 version (and add the `/cv` redirect target)?
6. Rent vs Buy site: its intro-tour overlay stays faintly visible behind the results after loading. Not part of this repo, but it shows in the project thumbnail.
