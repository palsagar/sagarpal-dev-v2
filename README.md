# sagar-pal.dev

[![CI](https://github.com/palsagar/sagarpal-dev-v2/actions/workflows/ci.yml/badge.svg)](https://github.com/palsagar/sagarpal-dev-v2/actions/workflows/ci.yml)

Personal website of Sagar Pal. Live at **[sagar-pal.dev](https://sagar-pal.dev)**.

The front end is a static [Astro](https://astro.build/) site in `web/`. The back end in `api/`
is [FastAPI](https://fastapi.tiangolo.com/) with SQLite. It runs the reading list and its
admin page, post views and "Useful" reactions, search, the RSS feed and the Open Graph
images, and it also serves the static site. Both ship as one Docker image on a Coolify VPS
behind Cloudflare.

## Structure

```
web/                  Astro front end (npm)
  src/pages/          Routes: home, blog, reading list, projects, publications, 404
  src/content/blog/   Posts as MDX
  src/data/           Profile data: publications, projects, experience, education
  public/             Files served as they are (PDFs, images, robots.txt)
api/                  FastAPI back end (uv, Python 3.12)
  app/                Application code
  migrations/         Alembic migrations
deploy/               Container start-up script and Litestream settings
Dockerfile            Builds the site and the API into one image
docs/redesign/        Plan, design system and API specification
```

## Local development

Needs Node 22.23.4 or later and [uv](https://docs.astral.sh/uv/).

```bash
make install    # npm ci in web/, uv sync in api/
cp api/.env.example api/.env   # then fill in the three required secrets (the file says how)
make dev        # Astro on :4321 and FastAPI on :8000
make test       # API tests, then a build and the Playwright tests
make lint       # Prettier, ESLint, astro check, ruff, mypy
```

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md).

## Licence

Code: MIT. Site content (posts, profile text, images, PDFs): all rights reserved.
See [LICENSE](LICENSE).
