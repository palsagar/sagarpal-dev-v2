# ---- Build stage: compile the Jekyll site ----
FROM ruby:3.3-slim-bookworm AS build

# Keep the build small and bounded so it can't push a low-RAM VPS into swap:
#  - skip the :test group (html-proofer/nokogiri) — not needed to build the site
#  - single-threaded gem installs + C compiles cap peak memory
ENV BUNDLE_WITHOUT="test" \
    BUNDLE_JOBS="1" \
    MAKEFLAGS="-j1"

# build-essential: native gems (sass-embedded, ffi, ...).
# git: required by _plugins/posts-lastmod-hook.rb, which shells out to `git log`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /site

# Install gems first so this layer stays cached until the Gemfile changes.
COPY Gemfile ./
RUN bundle install

# Copy the rest (including .git, needed by the lastmod hook) and build.
COPY . .
RUN JEKYLL_ENV=production bundle exec jekyll build -d _site

# ---- Serve stage: static files behind nginx ----
FROM nginx:1.27-alpine AS serve

# Umami analytics is injected at request time by nginx (see nginx.conf.template),
# driven by these runtime env vars — set them in Coolify. Empty default = inert.
# NGINX_ENVSUBST_FILTER limits envsubst to UMAMI_* so it never touches nginx's $vars.
ENV UMAMI_DOMAIN="" \
    UMAMI_ID="" \
    NGINX_ENVSUBST_FILTER="^UMAMI_"

COPY --from=build /site/_site /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
