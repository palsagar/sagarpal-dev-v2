# Design reference (signed-off mockups)

These are the source files of the signed-off design canvas (Claude Design artifact, 31 Oct 2026). They are **reference, not production code**:

- Each `*.dc.html` is a "Design Component" page. It needs the canvas runtime (`./support.js`) to render, so it won't open correctly in a plain browser. Read it as annotated markup: every inline `style="…"` carries the exact sizes, weights, gaps and colours used in the mockup.
- `{{tk.*}}` holes are theme tokens resolved in the `<script type="text/x-dc">` block at the bottom of each file (the `TK.night` / `TK.day` objects). They match `../DESIGN.md` §2.
- `var(--ground)`, `var(--ink)`, … are the same tokens as CSS custom properties. Use those names in the real code.
- `{{fieldImg}}`, `{{fig1Img}}` switch between the night and day images.
- `<sc-for>` / `<sc-if>` are the canvas's loop/conditional tags. Read them as "repeat for each item" / "render if".
- Sample content inside (post titles, reading items, counts) is **placeholder**. See `../DESIGN.md` §10 "Must not ship".

| File | Page | Canvas size |
|---|---|---|
| `Main.dc.html` | Home, desktop (night default; `theme` prop switches) | 1440 × 6900 |
| `HomeMobile.dc.html` | Home, phone | 390 × 4300 |
| `Blog.dc.html` | `/blog/` index with search, topic filters, year groups, no-results state | 1440 × 3300 |
| `Post.dc.html` | `/blog/[slug]`: TOC, sidenotes, equations, code, callout, live figure, Useful | 1440 × 4200 |
| `PostMobile.dc.html` | Post, phone (inline sidenotes, `<details>` TOC) | 390 × 3000 |
| `Reading.dc.html` | `/what-im-reading/`: type filter, Reading now, Finished, Up next | 1440 × 3600 |
| `canvas.json` | Canvas index (artboard positions and titles) | — |

The canvas also has day-theme variants of each page (they import these same files with `theme="day"`) and three palette explorations. Carina was chosen; the others are not included.

## Image URLs → files in `../assets/`

| In the mockup | Local file |
|---|---|
| `/_blob/40813c46a1c75d0fd522dfd0d0bc7414` | `field-hero-night.jpg` (the mockup used a 720×920 render; the asset is the 1100×1400 regeneration) |
| `/_blob/7a87896c02709481adb079cb1b9b79be` | `field-hero-day.jpg` |
| `/_blob/ac55cd7207977ca2f420825075fa57a4` | `fig-mitosis-night.jpg` |
| `/_blob/70de8d55278ed2a084e28b3b088e7554` | `fig-mitosis-day.jpg` |
| `/_blob/e16fa8a14cf8de63d19687d764d7c80a` | `project-flowlab.jpg` |
| `/_blob/7584d50266de59135c885d8e22e09824` | `project-gray-scott.jpg` (also the footer name fill) |
| `/_blob/c4fbc47523e50575971406226cd33ce1` | `project-rent-vs-buy.jpg` |
| `/_blob/875cb299adf33fa463a88c4a60b58811` | `portrait.jpg` |
