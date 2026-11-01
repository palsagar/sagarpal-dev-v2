# Design spec — "Living Field", Carina palette

Signed off by Sagar on 31 Oct 2026. The values below are lifted from the signed-off mockups in `design-reference/`. If a number here and a mockup disagree, this file wins.

**Idea in one line:** Sagar's own simulations (Gray–Scott reaction–diffusion, fluid flow) are the site's material. The home hero is a live field visitors can stir; the same field fills the footer name; project images are his own apps, recoloured.

**House rules** (distilled from taste-skill / hallmark, adapted with judgement):
- One ground, one ink, one accent. Running text in full ink; secondary ink only for meta.
- Surfaces separate by a **tone step**, never by borders or shadows. No gradients (field imagery excepted), no glass, no glows on UI, no emoji.
- No eyebrow labels, no tracked-caps labels, no index numbers (01/02), no middot-joined meta strings, no left-border callouts.
- Headings are at most two lines at every width. Left-aligned. Every section opens with a heading that names it.
- Monospace only in real code or a real terminal fragment (marked `data-ui`).
- Pills are fully round (`999px`); images are square-cornered on pages, 16px-rounded inside posts.
- Every animation has a `prefers-reduced-motion` path; content is visible without JS.

---

## 1. Layout grid

| Token | Value |
|---|---|
| Container max width | `1440px`, centred |
| Side gutter | `clamp(16px, 3vw, 40px)` (same on both sides at every width) |
| Section spacing | `200px` desktop · `112px` phone (top padding of each section) |
| Inner gaps | 48–72px between columns; 24–44px inside a column |
| Breakpoint behaviour | Flex-wrap with basis widths (e.g. `flex: 1 1 520px`), so no media queries are needed for most stacking. Nav collapses to a Menu sheet below ~720px |
| Reading measure | Prose paragraphs `max-width: 680px` (~68ch at 20px) |

## 2. Colour tokens

Defined as CSS custom properties on `:root[data-theme="night"]` and `:root[data-theme="day"]`. The no-JS fallback uses `@media (prefers-color-scheme: light)` to apply the day values when no `data-theme` is set.

| Token | Night | Day | Used for |
|---|---|---|---|
| `--ground` | `#0A0E16` | `#F3F4F6` | Page background |
| `--surface` | `#111823` | `#E7EBEF` | Bands (Reading, Up next), code, callouts, row hover |
| `--surface-2` | `#1A2330` | `#DCE2E8` | Secondary pills/buttons, inputs, tiles |
| `--surface-3` | `#232E3D` | `#D0D8E0` | Hover state of `--surface-2` |
| `--ink` | `#EEEAE2` | `#111925` | Text, headings |
| `--ink-2` | `#A0A8B4` | `#4E5866` | Meta, captions, nav links, secondary text |
| `--ink-3` | `#8A93A1` | `#56606E` | Placeholders only |
| `--accent` | `#F2A64A` | `#F2A64A` | Primary buttons, selected pills, the book cover tile |
| `--accent-hover` | `#F6B867` | `#EE9A33` | Hover of accent fills |
| `--on-accent` | `#0A0E16` | `#111925` | Text on accent |
| `--link` | `#F2A64A` | `#9A520E` | Text links on hover, sidenote numbers, focus ring, active highlights |
| `--teal` | `#6CC3CA` | `#1F6F7A` | Code keywords, secondary data colour |
| `color-scheme` | `dark` | `light` | Native controls |
| `theme-color` meta | `#0A0E16` | `#F3F4F6` | Browser UI |

Contrast (WCAG 2.x, approximate): night ink/ground ≈ 16:1, ink-2/ground ≈ 8:1, on-accent/accent ≈ 9:1; day ink/ground ≈ 16:1, ink-2/ground ≈ 6.8:1, link/ground ≈ 5.4:1, link/surface ≈ 5.0:1. Amber `#F2A64A` is **never** used as text on the day ground (≈ 2:1); use `--link` there.

### Field colormaps (simulation LUT and posters)
Applied to normalised `v` (`v / v_max`, clamp 0–1; `v_max ≈ 0.40–0.45` for coral, so tune visually against `assets/field-hero-*.jpg`).

- **Night:** `0 #0A0E16 · 0.30 #0C131E · 0.42 #11414D · 0.57 #2C9AA6 · 0.68 #6FC0B6 · 0.80 #E39A45 · 0.92 #F7CC88 · 1.0 #FFF4DE` (teal rims → amber → starlight cores). The poster adds faint nebular gas (teal `#1F5966` and rust `#6A3416` fBm wisps) and a soft bloom. The live sim may skip the gas.
- **Day:** `0 #F3F4F6 · 0.40 #E2EBEE · 0.56 #93C3CA · 0.70 #23707C · 0.84 #12404C · 1.0 #C9822F` (teal outlines with amber cores).
- **Project screenshot duotone (night):** `0 #0A0E16 · 0.30 #0E1C27 · 0.50 #17505B · 0.66 #2C9AA6 · 0.80 #E39A45 · 0.93 #F7CC88 · 1.0 #FFF4DE`. Project images use the night duotone in both themes.

`scripts/make_assets.py` encodes all three; keep it in sync if the palette changes.

## 3. Theme behaviour
1. Blocking inline script in `<head>` (before CSS paints): `stored = localStorage.getItem('theme')` (try/catch) → else `matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night'` → `document.documentElement.dataset.theme = …` and update `meta[name=theme-color]`.
2. Toggle button in the nav (`aria-label="Switch to day theme"` / `"Switch to night theme"`; sun icon in night, moon in day). It writes `localStorage.theme` and swaps `data-theme`.
3. While the user hasn't chosen, listen to `prefers-color-scheme` changes and follow them.
4. Re-apply on Astro view-transition swaps (`astro:after-swap`).
5. Theme-dependent images (hero poster, post figures) use `<picture>` with both sources toggled by CSS (`[data-theme] .only-night/.only-day`), or the island swaps them. Avoid layout shift: both share the same box.
6. No transition on theme change except a 150ms colour/background fade on `body` (and none under reduced motion).

## 4. Typography

Families (self-hosted, Fontsource):
- **Archivo** variable (`wght` 100–900, `wdth` 62–125). UI, headings, meta. Fallback `'Helvetica Neue', Arial, sans-serif` with `size-adjust` tuned to Archivo.
- **Source Serif 4** variable (`opsz`, `wght`). Post body, deks, reading notes. Fallback `Georgia, serif`.
- **JetBrains Mono** (400/500). Code and terminal fragments only.

| Role | Size | Weight / width | Tracking / leading | Notes |
|---|---|---|---|---|
| Display (h1 home, blog, reading) | `clamp(76px, 10.4vw, 156px)` home; `clamp(72px, 10vw, 148px)` blog; `clamp(64px, 9vw, 136px)` reading; phone 76px | 640 / `font-stretch: 112%` | −0.05em / 0.86–0.88 | Reading title `max-width: 9ch` (2 lines) |
| Section h2 | `clamp(42px, 4.8vw, 72px)`; phone 44px | 620 / 108% | −0.04em / 0.96 | |
| Post title (h1) | `clamp(40px, 5vw, 72px)`; phone 40px | 630 / 108% | −0.045em / 0.98 | `max-width: 16ch` |
| Featured post title | `clamp(34px, 3.4vw, 50px)` | 620 / 106% | −0.035em / 1.02 | |
| Statement / dek | `clamp(21px, 1.95vw, 28px)` hero; deks `clamp(20px, 1.8vw, 26px)` | 400 | −0.01em / 1.32–1.4 | Hero statement `max-width: 34ch`. Post deks in Source Serif |
| List title (writing rows) | `clamp(25px, 2.4vw, 34px)` home; `clamp(23px, 2.1vw, 30px)` blog | 580 | −0.02em / 1.15–1.18 | |
| Card/project h3 | 32px (phone 26px) | 600 | −0.025em / 1.1 | |
| Prose h2 | 34px (phone 28px) | 620 Archivo | −0.03em / 1.1 | |
| Body UI | 18px (phone 17px) | 400 | 0 / 1.5 | |
| Prose body | 20px (phone 19px), Source Serif 4 | 400 | 0 / 1.62 (phone 1.6) | |
| Meta | 15–16px | 400–500 | 0 | `--ink-2`; tabular figures for dates/numbers |
| Small print | 13–14px | 400 | 0 | Captions, colophon |

Numbers: `font-variant-numeric: tabular-nums` for years, dates, F/k readouts, counts.

## 5. The live hero field (HeroField island)

**Purpose:** the one live thing on the site. It is the home page's signature, so it must be fast, quiet and optional.

- **Model:** Gray–Scott, Karl Sims normalisation: `Du = 1.0`, `Dv = 0.5`, `dt = 1`; 9-point Laplacian (centre −1, edges 0.2, corners 0.05); periodic boundaries.
- **Engine:** WebGL2 fragment shaders, ping-pong between two float textures (prefer `RGBA32F` + `EXT_color_buffer_float`, fall back to `RGBA16F` + `EXT_color_buffer_half_float`). `u` in R, `v` in G. Display pass samples `v` → LUT (256×1 texture from the theme colormap) → screen with linear upscaling. Sagar's `webgpu-gray-scott` repo has WGSL that can be ported for reference. A WebGPU path is optional and not required.
- **Grid:** ~512 cells on the short side on desktop, ~256 on phones; match the canvas aspect. 8–16 substeps per animation frame (tune for 60 fps).
- **Presets** (real `<button aria-pressed>` in a `role="group" aria-label="Pattern preset"`):

  | Label | F | k |
  |---|---|---|
  | Coral (default) | 0.0545 | 0.0620 |
  | Mitosis | 0.0367 | 0.0649 |
  | Mazes | 0.0290 | 0.0570 |
  | Spots & loops | 0.0180 | 0.0510 |

  Switching preset changes uniforms only (no reset); the field reorganises live. The readout pill shows `F = 0.0545` and `k = 0.0620` in tabular figures.
- **Initial state:** `u = 1, v = 0`, six noisy discs of `v = 1, u = 0.5` (see `make_assets.py::hero_field` for positions/radii relative to a 440×560 grid). Warm up ~2,000 steps before the first visible frame.
- **Interaction:** pointer/touch drag writes `v = 1` (and `u = 0.5`) in a disc of radius ≈ 1.5% of the grid's short side via a brush uniform in the step shader (no readback). `touch-action: pan-y` so vertical scrolling still works on phones; seed only on horizontal-dominant drags or after a 150ms press.
- **Fallbacks:** the server-rendered poster `<img>` (`assets/field-hero-{night,day}.jpg`) is always present and is the LCP element. The canvas fades in over it once warmed up. No WebGL2 → poster only, controls hidden. `prefers-reduced-motion: reduce` → poster plus a "Play simulation" button (user-initiated motion is fine). `navigator.connection.saveData` → same as reduced motion.
- **Efficiency:** pause on `visibilitychange` hidden and when the IntersectionObserver reports off-screen. Cap `devicePixelRatio` at 1.5. Island hydrates `client:visible`. Budget ≤ 25 KB gz JS.
- **A11y:** the canvas is `aria-hidden="true"` (decorative); the figure has a caption; preset buttons are keyboard reachable; the caption explains the interaction.

## 6. Components

| Component | Spec |
|---|---|
| **Nav** | Height ~80px; padding `20px gutter`. Wordmark "Sagar Pal" 18px/650/−0.01em. Links 16px `--ink-2`, gap 28px; current page `--ink` + 600 + `aria-current="page"`. Right cluster: "CV" pill (40px, `--surface-2`) + theme toggle (40×40 round, `--surface-2`). Phone: wordmark + theme toggle (44×44) + "Menu" pill (44px) opening a full-height sheet (`dialog`, focus-trapped, Esc closes). Plain bar: no blur, no shadow |
| **Primary button** | Pill, `--accent` bg, `--on-accent` text, 600. Heights: 52px (hero), 48px (sections), 44px (project rows). Hover `--accent-hover` |
| **Secondary button** | Pill, `--surface-2` bg, `--ink`, 500. Hover `--surface-3` |
| **Filter pill** (topics, types, presets) | 40–44px; selected = accent fill; unselected = `--surface-2` (or transparent inside the hero control bar). `aria-pressed`. Counts in tabular figures, `--ink-2` when unselected |
| **Row link** (writing, finished reading) | Whole row is one `<a>`; padding `28px 24px` with `margin: 0 -24px` so text aligns to the grid; radius 20px; hover → `--surface` bg and title → `--link` |
| **Search input** | 52px pill, `--surface-2`, 17px, left icon (stroke `currentColor` in `--ink-2`), visible `<label>` "Search posts" |
| **Figure** | Square corners on pages, radius 16 in posts; caption 14–15px `--ink-2`, prefixed "Figure n." in posts |
| **Sidenote** | Desktop: right column 260px, Archivo 15px `--ink-2`, number in `--link` 600; superscript reference 13px `--link` 600 linking to the note. Phone: superscript becomes a 26px round button (`aria-expanded`) that reveals the note inline on `--surface`, radius 14px |
| **Callout** | `--surface`, radius 16px, padding `24px 28px`, title 18px/620, body Archivo 17px/1.55. No left border, no icon |
| **Code block** | Optional filename caption 14px `--ink-2`; `pre` on `--surface`, radius 16px, padding `24px 28px`, JetBrains Mono 14.5px/1.7, horizontal scroll inside the block; Shiki dual theme from tokens (keywords `--teal`, strings `--link`, comments `--ink-2`). Phone: full-bleed (negative margin), 13px |
| **Display math** | KaTeX, ~23px, scrolls horizontally inside its own box on phones (`--surface` box on phone only); equation numbers right-aligned `--ink-2` |
| **Useful reaction** | 48px accent pill: thumb icon + "Useful" + count (tabular). `aria-pressed`. Optimistic update; one per visitor per day (server-side dedupe + `localStorage` hint) |
| **Typographic cover** | Book: `--accent` tile 3:4, padding 36px, author top (16px/500), title bottom (`clamp(34px,3.2vw,48px)`/680/108%). Paper/article: `--surface-2` tile 150px wide, 1:1.414, padding 18px, identifier (arXiv ID / domain) top 13px `--ink-2`, short title bottom 17px/640 |
| **Terminal fragment** | `<pre data-ui>` on `--surface`, JetBrains Mono 13px/1.7, padding 28px; prompt `$` in `--ink-2`; real CLI output from the project's README |
| **Footer** | Links row (GitHub, LinkedIn, Google Scholar, Email, RSS) 16px `--ink-2` + "Paris, YYYY". Then the name "Sagar Pal" at `clamp(72px, 17.6vw, 262px)`/720/115%/−0.06em/0.82, `white-space: nowrap`, `aria-hidden="true"`, filled via `background-clip: text` with `assets/project-gray-scott.jpg` (dense pattern, legible in both themes). Colophon 14px `--ink-2`. Subpages use a compact footer (links + "Sagar Pal, Paris, YYYY") without the big name |

Icons: inline stroke SVGs (1.8px stroke, round caps), `aria-hidden` when decorative; icon-only buttons have `aria-label`.

## 7. Pages

### 7.1 Home (`design-reference/Main.dc.html`, `HomeMobile.dc.html`)
1. **Hero:** two columns. Left (`flex: 1 1 520px`, top padding 88px): h1, statement, CTAs, social text links at the column's foot. Right (`flex: 1.15 1 520px`): the field, bleeding to the right edge, height `clamp(440px, 54vw, 780px)`; control bar overlaid bottom-left (preset group) and bottom-right (F/k readout), both on solid `--ground` pills; caption below. **Phone:** the field comes first, full-bleed 400px tall under the nav, with a horizontally scrollable preset row inside; then h1, statement, CTAs (equal-width, wrapping).
2. **Path** ("From droplets to materials"): portrait (4:5, max 440px) + column with h2, three paragraphs (the third in `--ink-2`), career list (years column 8.5rem tabular `--ink-2`; role 560 + ", Org" in `--ink-2`). Seven rows: Entalpic 2025–now, Saint-Gobain 2021–2025, Sorbonne post-doc 2020–2021, PhD 2017–2020, MSc 2016–2017, IISc 2015–2016, IIT 2011–2015. Phone shows the first four plus "Full CV".
3. **Writing:** h2 + "All posts". Three latest posts as row links (date | title + dek | reading time). **Hidden when there are 0 published posts.**
4. **Reading band:** full-bleed `--surface`, padding 120px. Left: h2, sentence, "Everything I'm reading" button. Right: up to 3 "reading now" items (type label | title, byline, note). **Hidden when empty** (client-rendered; below the fold, so no CLS concern).
5. **Simulations and tools:** h2 (max 12ch) + side sentence. Four project articles in a wrapping row with alternating weights: FlowLab (7) + Gray-Scott (5), then PortWhisperer (5, terminal fragment) + Rent vs Buy (7). Each: image, h3, description, tech line (`--ink-2`), buttons (primary "Live demo"/"PyPI", secondary "Source"). Data from `projects.yml`.
6. **Papers:** h2 + "Google Scholar". `<ol reversed>` rows: year (30px/500 `--ink-2`), title, authors (Sagar bold in `--ink`) + journal, pills (PDF if present, DOI or arXiv). Data from `publications.yml`, sorted by year desc.
7. **Footer** (big name).

### 7.2 Blog index (`design-reference/Blog.dc.html`)
- Header: h1 "Writing" + sentence (left, `flex 7`); right column (`flex 5`, bottom-aligned): search + topic pills.
- Latest post featured: image (16:9) + text (date, title, dek, meta: reading time and topics as separate spans). Whole block is one link with row-hover styling.
- Remaining posts grouped by year: year as h2 (240px column) + row list. Rows: date (`12 Oct`), title + dek, right meta column (reading time / topics).
- No-results state: "Nothing matches “{q}” in that topic." + "Clear search and filters" button.
- **Empty state (launch):** keep the header (h1 + sentence; hide search and filters), then a single block: "Nothing published yet." (h2 size `clamp(28px, 2.6vw, 36px)`) + "The first post is on its way. Subscribe to the RSS feed to get it when it lands." + primary pill "Subscribe via RSS" → `/feed.xml`. Optionally a small field image to the right so the screen isn't empty.

### 7.3 Post (`design-reference/Post.dc.html`, `PostMobile.dc.html`)
- Header aligned to the prose column (a 240px spacer + 56px gap on desktop): "All writing" link, h1, dek (Source Serif), meta (date, reading time, views, topics as separate spans).
- Optional hero figure at full container width, caption aligned to the prose column.
- Body: sticky TOC column (240px; "On this page", current section in `--ink` 600), prose column (max 680px), sidenote column (260px). Phone: TOC in a `<details>` on `--surface`; sidenotes inline.
- End: Useful, Copy link (copies the canonical URL, announces "Link copied" via `aria-live`), "Follow by RSS" link; then previous/next as a `--surface` card (radius 24px, padding `36px 40px`).
- Views counter: increments once per visitor per day via `POST /api/posts/{slug}/view` after 10s visible or 50% scroll; the meta shows "n reads" only when n ≥ 10 (avoids "1 read").

### 7.4 What I'm reading (`design-reference/Reading.dc.html`)
- Header: h1 "What I'm reading" (2 lines) + sentence; type filter pills with counts (All / Books / Papers / Articles).
- **Reading now:** lead item (first by `started_on` desc) with typographic or real cover; others stacked to the right with small tiles.
- **Finished:** grouped by year (h3 36px `--ink-2`, 240px column); rows: month | title, byline, note (serif) | type.
- **Up next:** `--surface` band, grid `repeat(auto-fit, minmax(min(300px, 100%), 1fr))`.
- **Empty state:** "Nothing on the shelf yet." + "Check back soon." (no button).
- Labels are sentence case: "Book, started October 2026", "Article, reread October 2026".

### 7.5 Projects, Publications, 404
Reuse the home section components at full length. 404: h1 "Not found", sentence "That page drifted out of the field.", button "Back home", small static field crop.

## 8. Motion
- **Section entrances:** heading → text → media, staggered 70ms; `translateY(20px) → 0` + opacity 0 → 1; 500ms `cubic-bezier(0.2, 0.7, 0.2, 1)`; once per element via IntersectionObserver. Add the "pre-animate" class from JS only, so content is visible without JS.
- **Hover/press:** 150ms on `background-color`, `color`, `transform` (press `scale(0.98)`). Never `transition: all`; never animate width/height/top/left.
- **Page transitions:** Astro view transitions, 200–250ms cross-fade; no slide.
- **Hero:** canvas fades in over the poster (≤ 400ms) once warmed up.
- **Reduced motion:** all of the above off; hero shows the poster with a Play button.

## 9. Accessibility checklist
- Landmarks (`header`, `nav`, `main`, `footer`), a skip link, one `h1` per page, sections labelled by their headings.
- Visible `:focus-visible` ring: 2px `--link`, offset 3px, instant.
- Real `button`/`a`/`input`+`label`; `aria-pressed` for toggles, `aria-expanded` for disclosures, `aria-current` for nav.
- Alt text for every content image. Decorative canvas/name-fill `aria-hidden`.
- KaTeX output `htmlAndMathml` so screen readers get MathML.
- Hit targets ≥ 44px on touch.
- Tested in both themes with axe, keyboard only, VoiceOver (Safari) spot check.

## 10. Copy deck (final)

**Global**
- Site title: "Sagar Pal". Title pattern: "{Page} — Sagar Pal"; home: "Sagar Pal — Scientific computing, AI for science, HPC".
- Meta description (home): "Sagar Pal works at the intersection of scientific computing, AI for science and high-performance ML systems. Writing, reading notes, simulations and papers."
- Nav: Writing · Reading · Projects · Papers · CV (separate links, not a dotted string).

**Home**
- h1: "Sagar Pal"
- Statement: "I work at the intersection of scientific computing, AI for science and high-performance ML systems."
- CTAs: "Read the writing" (→ `/blog/`) and "Download CV" (→ PDF). When there are 0 posts: "View projects" (→ `#work`) and "Download CV".
- Field caption: "Gray–Scott reaction–diffusion, solved live on your GPU. Drag across the field to seed new growth." (phone: "Gray–Scott reaction–diffusion, live. Touch the field to seed growth.")
- Path h2: "From droplets to materials"
  - "I started in mechanical engineering, moved into theoretical fluid dynamics, and spent my PhD at Sorbonne Université building numerical methods for multiphase flows: air meeting water at extreme speeds, breaking into droplets and sprays."
  - "A post-doc pushed me into statistical physics, coupling direct numerical simulation with Monte Carlo to model how liquids fragment. Today I lead the technical side of Entalpic's ML platform for materials discovery, where generative and predictive models run next to HPC chemistry."
  - (`--ink-2`) "Across the whole stack, from hand-tuned Fortran on 64,000 cores to PyTorch and JAX on GPU clusters."
  - Phone condensed: "Mechanical engineering, then theoretical fluid dynamics, then a PhD at Sorbonne Université on numerical methods for multiphase flows. A post-doc in statistical physics. Now the technical side of Entalpic's ML platform for materials discovery."
- Writing h2: "Writing" · link "All posts"
- Reading h2: "Reading" · "Books, papers and long reads on my desk right now, each with a line on why it's there." · button "Everything I'm reading"
- Projects h2: "Simulations and tools" · "Side projects, mostly physics running in a browser tab."
  - FlowLab: "Real-time 2D Navier–Stokes in the browser: pressure projection, semi-Lagrangian advection, obstacles you can drag through the flow." · "WebGPU, WGSL, Navier–Stokes"
  - Gray-Scott: "Turing patterns on your GPU: twelve presets, brush seeding and live parameter tuning with vim-style keys." · "WebGPU, WGSL, reaction–diffusion"
  - PortWhisperer: "See what's running on your ports, with framework detection, Docker containers and cleanup of orphaned processes." · "Python, CLI"
  - Rent vs Buy: "Compare realistic renting and buying scenarios with mortgage rates, appreciation, returns, taxes and upkeep." · "Python, simulation, finance"
- Papers h2: "Papers" · link "Google Scholar"
- Footer colophon: "Set in Archivo and Source Serif 4. Every pattern on this site is a solution of the Gray–Scott equations."

**Blog:** h1 "Writing" · "Long-form notes on numerical methods, high-performance computing and machine learning for science." · search label "Search posts", placeholder "Laplacian, MPI, equivariance…" · topics: All, Numerics, HPC, Scientific ML, GPU (show only topics that have posts).

**Reading:** h1 "What I'm reading" · "Books, papers and long reads on physics, computing and learning machines, each with a line on why it's here." · section titles "Reading now", "Finished", "Up next".

**Must not ship (mockup placeholders):** the six sample post titles/deks/dates, the sample post body, all reading-list items and notes, "2,140 reads", "38" likes.

## 11. Imagery inventory (`assets/`)
| File | Use | Provenance |
|---|---|---|
| `field-hero-night.jpg`, `field-hero-day.jpg` (1100×1400) | Hero poster / fallback; theme-specific | Computed Gray–Scott (coral, F 0.0545 k 0.062), `make_assets.py` |
| `fig-mitosis-night.jpg`, `fig-mitosis-day.jpg` (1600×750) | Example post figure, 404/empty-state art | Computed Gray–Scott (mitosis, F 0.0367 k 0.0649) |
| `project-flowlab.jpg` | FlowLab thumbnail | Screenshot of flow.gpuphysics.dev (Kármán vortex preset), night duotone |
| `project-gray-scott.jpg` | Gray-Scott thumbnail + footer name fill | Screenshot of patterns.gpuphysics.dev ("Spots & Loops", F 0.018 k 0.051), night duotone |
| `project-rent-vs-buy.jpg` | Rent vs Buy thumbnail | Screenshot of rent-or-buy-sim.com (US defaults, 1520px window at 2x: sidebar, verdict and net-value chart), in the site's own colours, cropped to 1528:720 and saved at 1600 px. Retaken on 1 Nov 2026 |
| `portrait.jpg` (640×800) | Path section | Crop of `assets/img/prof_pic.jpg` |
