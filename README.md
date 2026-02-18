# sagar-pal.dev - Personal Website

[![Deploy Status](https://github.com/palsagar/sagarpal-dev-v2/workflows/Build%20and%20Deploy/badge.svg)](https://github.com/palsagar/sagarpal-dev-v2/actions)
[![Jekyll](https://img.shields.io/badge/Jekyll-4.4.1-red.svg)](https://jekyllrb.com/)
[![Theme](https://img.shields.io/badge/Theme-Chirpy-blue.svg)](https://github.com/cotes2020/jekyll-theme-chirpy)

> Personal website and blog of Sagar Pal — Computational Scientist, Scientific ML & HPC practitioner.
> 
> **Live at:** https://sagar-pal.dev

---

## 🚀 Quick Start

### Prerequisites
- Ruby 3.x
- Bundler (`gem install bundler`)

### Local Development

```bash
# Clone the repo
git clone https://github.com/palsagar/sagarpal-dev-v2.git
cd sagarpal-dev-v2

# Install dependencies
bundle install

# Serve locally
bundle exec jekyll serve

# Open browser to http://localhost:4000
```

### Build for Production

```bash
bundle exec jekyll build
# Output is in `_site/` directory
```

---

## 📁 Repository Structure

```
.
├── _config.yml              # Site configuration (title, URL, social links)
├── _data/                   # Data files (locales, navigation)
├── _posts/                  # Blog posts (Markdown)
├── _tabs/                   # Navigation tabs (About, Categories, Tags, etc.)
├── _site/                   # Generated site (GitHub builds this automatically)
├── assets/
│   └── img/
│       └── prof_pic.jpg     # Your profile photo
├── CNAME                    # Custom domain configuration
├── index.html               # Landing page
└── README.md                # This file
```

---

## ✏️ How to Make Changes

### 1. Update Landing Page Content

Edit: `index.html`

The landing page uses the `page` layout and contains your About section. To modify:

```yaml
---
layout: page
title: ""
---

<img src="/assets/img/prof_pic.jpg" ... />

## Hi, I'm Sagar Pal
... your content here ...
```

### 2. Update Profile Photo

1. Replace `assets/img/prof_pic.jpg` with new photo
2. Update `_config.yml` if filename changes:
   ```yaml
   avatar: /assets/img/prof_pic.jpg
   ```
3. Commit and push — GitHub Actions will deploy automatically

### 3. Update Site Settings

Edit: `_config.yml`

Key sections to modify:

```yaml
# Basic info
title: Sagar Pal
tagline: Computational Scientist | Scientific ML & HPC
description: >-
  Your description here...

# Domain
url: "https://sagar-pal.dev"

# Social links
github:
  username: palsagar

social:
  name: Sagar Pal
  email: sagar2204pal@gmail.com
  links:
    - https://github.com/palsagar
    - https://linkedin.com/in/spal220493
```

### 4. Update About Page

Edit: `_tabs/about.md`

This appears as the "About" tab in navigation. Same Markdown format as landing page.

### 5. Add a Blog Post

1. Create file: `_posts/YYYY-MM-DD-post-title.md`
2. Add front matter:
   ```yaml
   ---
   title: "Your Post Title"
   date: YYYY-MM-DD HH:MM:SS +0100
   categories: [category1, category2]
   tags: [tag1, tag2]
   ---
   ```
3. Write content in Markdown below
4. Commit and push

### 6. Add Images to Posts

1. Copy image to `assets/img/`
2. Reference in post:
   ```markdown
   ![Alt text](/assets/img/your-image.jpg)
   ```

---

## 🌐 Deployment

### Automatic (GitHub Actions)

Every push to `main` triggers automatic deployment:

1. GitHub Actions builds the Jekyll site
2. Deploys to GitHub Pages
3. Live at https://sagar-pal.dev within 2-3 minutes

### Manual Verification

Check build status: https://github.com/palsagar/sagarpal-dev-v2/actions

---

## 🎨 Theme: Chirpy

This site uses the [Chirpy Jekyll Theme](https://github.com/cotes2020/jekyll-theme-chirpy).

### Theme Features Available:

- **Dark/Light mode** — Toggle in bottom-left corner
- **Responsive design** — Mobile-friendly
- **SEO optimized** — Automatic meta tags, Open Graph
- **Code highlighting** — Syntax highlighting for code blocks
- **Math support** — LaTeX via MathJax (enable in `_config.yml`)
- **Search** — Built-in search functionality
- **Comments** — Optional (Disqus, Utterances, Giscus)
- **Analytics** — Optional (Google Analytics, etc.)

### Theme Documentation

For advanced customization: https://github.com/cotes2020/jekyll-theme-chirpy/wiki

---

## 📝 Common Tasks

### Update Landing Page Layout

Change `layout:` in front matter:
- `layout: home` — Shows latest posts (default Chirpy)
- `layout: page` — Static content (current setup)

### Add New Navigation Tab

1. Create file: `_tabs/new-tab.md`
2. Add front matter:
   ```yaml
   ---
   layout: page
   icon: fas fa-icon-name
   order: 5
   title: New Tab
   ---
   ```
3. Content in Markdown below
4. `order` controls position in navigation

### Change Colors/Fonts

Advanced: Create `assets/css/style.scss` and override variables.

See Chirpy docs for customization options.

---

## 🔧 Troubleshooting

### Build Fails

1. Check GitHub Actions: https://github.com/palsagar/sagarpal-dev-v2/actions
2. Test locally: `bundle exec jekyll build`
3. Common issues:
   - Invalid YAML in `_config.yml` or front matter
   - Missing image files
   - Incorrect Markdown syntax

### Changes Not Appearing

1. Wait 2-3 minutes for GitHub Pages to update
2. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Check if build succeeded in Actions tab

### Local Server Won't Start

```bash
# Update dependencies
bundle update

# Or reinstall
rm -rf Gemfile.lock
bundle install
```

---

## 📜 License

This site's content is © Sagar Pal. 

The Jekyll theme (Chirpy) is licensed under [MIT](https://github.com/cotes2020/jekyll-theme-chirpy/blob/master/LICENSE).

---

## 🆘 Need Help?

- **Jekyll docs:** https://jekyllrb.com/docs/
- **Chirpy wiki:** https://github.com/cotes2020/jekyll-theme-chirpy/wiki
- **Markdown guide:** https://www.markdownguide.org/

---

*Last updated: 2026-02-18*  
*Maintained by: Sagar Pal (@palsagar)*
