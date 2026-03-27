# Project: sagar-pal.dev

## Overview

Personal website for Sagar Pal. Jekyll + Chirpy theme v7.4.1, deployed via GitHub Pages.

## Architecture

- **Data-driven content**: Publications, projects, experience, and education are managed via `_data/*.yml` files. Tab pages use Liquid templates to iterate over these.
- **No custom theme overrides**: No `_layouts/`, `_includes/`, or `_sass/` directories. All customization is done through `_config.yml`, inline `<style>` blocks, and `_data/` files.
- **Styling**: Inline `<style>` blocks in page files use Chirpy CSS custom properties (`var(--btn-border-color)`, `var(--link-color)`, `var(--text-muted-color)`, `var(--card-bg)`, `var(--text-color)`) with fallback values for dark/light mode compatibility.
- **Blog infrastructure preserved**: `_posts/`, Categories, Tags, Archives tabs are intact. Blog posts will appear natively when added.

## Content management

- **Add a publication**: Add entry to `_data/publications.yml`. Set `featured: true` to show on landing page. Put PDF in `assets/pdfs/`.
- **Add a project**: Add entry to `_data/projects.yml`. It appears automatically on the Projects tab and landing page.
- **Add experience/education**: Edit `_data/experience.yml` or `_data/education.yml`.
- **Profile photo**: Must be square crop (`assets/img/prof_pic.jpg`). Non-square images don't fill Chirpy's circular sidebar avatar.

## Tab ordering

Publications (1), Projects (2), Categories (3), Tags (4), Archives (5). Set via `order:` in each `_tabs/*.md` front matter.

## Local development

Requires Ruby 3.x (not 4.x — Chirpy requires `~> 3.1`). Use `brew install ruby@3.3` on macOS.

```bash
export PATH="/opt/homebrew/opt/ruby@3.3/bin:$PATH"
bundle install
bundle exec jekyll serve
```

## Key files

- `index.html` — Landing page with hero bio, expertise pills, experience/education timelines, featured publications, side projects
- `_tabs/publications.md` — Full publications list with stacked cards (PDF download + DOI links)
- `_tabs/projects.md` — Project card grid (live demo + GitHub links)
- `_config.yml` — Site title, tagline, description, social links, Google Scholar ID
- `_data/contact.yml` — Sidebar contact links (GitHub, Twitter, Email, RSS, LinkedIn, Google Scholar)

## GPG signing

Git commits on this repo may have GPG signing configured. If signing fails, the user may need to enter their passphrase or disable signing temporarily.
