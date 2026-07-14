# ---- Build stage: compile the Jekyll site ----
FROM ruby:3.3-slim-bookworm AS build

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

COPY --from=build /site/_site /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
