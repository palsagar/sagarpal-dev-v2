# sagar-pal.dev

[![Deploy Status](https://github.com/palsagar/sagarpal-dev-v2/workflows/Build%20and%20Deploy/badge.svg)](https://github.com/palsagar/sagarpal-dev-v2/actions)

Personal website of Sagar Pal. Live at **[sagar-pal.dev](https://sagar-pal.dev)**.

Built with [Jekyll](https://jekyllrb.com/) + [Chirpy theme](https://github.com/cotes2020/jekyll-theme-chirpy). Deployed via GitHub Pages on push to `main`.

## Structure

```
_config.yml          # Site config (title, social links, SEO)
_data/
  publications.yml   # Paper metadata (title, authors, journal, pdf, doi)
  projects.yml       # Side project metadata (title, demo url, github, tags)
  experience.yml     # Career timeline
  education.yml      # Education history
  contact.yml        # Sidebar contact links
_tabs/
  publications.md    # Publications page (Liquid loop over publications.yml)
  projects.md        # Projects page (Liquid loop over projects.yml)
  categories.md      # Blog categories
  tags.md            # Blog tags
  archives.md        # Blog archives
_posts/              # Blog posts (empty, ready for content)
assets/
  img/prof_pic.jpg   # Profile photo (square crop for sidebar avatar)
  pdfs/              # Downloadable PDFs (papers + CV)
index.html           # Landing page (hero, expertise, experience, education, featured pubs, projects)
CNAME                # Custom domain: sagar-pal.dev
```

## Local dev

Requires Ruby 3.x.

```bash
bundle install
bundle exec jekyll serve
# http://localhost:4000
```

## License

Content is copyright Sagar Pal. Theme is [MIT](https://github.com/cotes2020/jekyll-theme-chirpy/blob/master/LICENSE).
