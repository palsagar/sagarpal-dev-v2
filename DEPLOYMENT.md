# Deployment: Coolify VPS behind Cloudflare

The site is one Docker image built from the `Dockerfile` at the repo root. It runs on the
existing Coolify VPS. Cloudflare sits in front of it as DNS, proxy and cache.

```
Browser ──► Cloudflare ──► Coolify proxy (Traefik) ──► container :8000 ──► /data (volume)
```

Inside the container, one uvicorn process serves the Astro build, the JSON API, the admin,
the RSS feed and the Open Graph images. The database and the Open Graph image cache live on
a Docker volume mounted at `/data`.

**Backups (decided with Sagar on 1 Nov 2026):** staging and production run without
Litestream and R2. A Coolify scheduled task makes a consistent copy of the database every
night in `/data/backups` (section 6), and the VPS's own disk backups take those copies off
the server. The image still contains Litestream. Setting the `LITESTREAM_*` variables
(section 3) turns it on, with no rebuild.

| File | What it does |
|---|---|
| `Dockerfile` | Stage 1 (`node:22-slim`) runs `npm ci` and `astro build`. Stage 2 (`python:3.12-slim` with uv) installs the API's dependencies. Stage 3 is the runtime: the API code, `web/dist`, the Litestream binary, a non-root user (`app`, uid 10001) and a `HEALTHCHECK` on `/api/health`. |
| `deploy/entrypoint.sh` | Starts the site. Without `LITESTREAM_BUCKET` it runs uvicorn directly. With it, it first restores the database from R2 if the volume has none, then runs uvicorn under `litestream replicate`. |
| `deploy/litestream.yml` | Litestream's settings. Every value comes from the `LITESTREAM_*` variables. |
| `.dockerignore` | Sends only `web/`, `api/` and `deploy/` to the build, without `node_modules`, local builds, tests or `api/.env`. |

The image is about 290 MB on disk and 100 MB compressed. The Litestream binary is 35 MB
of that. The build keeps its memory low (one image-processing thread, Node's heap capped
at 1.5 GB), so it does not push a small VPS into swap.

**Where things are in Coolify** (checked on 1 Nov 2026):

| What | Where |
|---|---|
| Server | **Yorkhost-VPS**, with the Traefik proxy. Production and staging both run on it. Its IP address is under **Servers → Yorkhost-VPS**. The address is not written here, because the repo is public and Cloudflare keeps the server's address hidden. |
| Project | **Personal Projects**. The environment **production** holds the app **Personal Website**. The environment **staging** holds the app **Personal Website (staging)**, set up on 1 Nov 2026 (section 5). |
| Docker network | `coolify`, the same for both apps |
| Git source | The GitHub App **my-private-repos-sagar**, which has access to `palsagar/sagarpal-dev-v2` |

## 1. Build and run the image locally

```bash
docker build -t sagar-pal-dev .

# A scratch env file: three secrets (see section 2) and nothing else.
docker volume create sagar-pal-dev-data
docker run --rm -p 8091:8000 --env-file scratch.env -v sagar-pal-dev-data:/data sagar-pal-dev
```

Then run the smoke checks in `docs/redesign/API.md` §9 with `BASE=http://localhost:8091`.
Without `LITESTREAM_BUCKET` the container logs one line saying that the database is not
copied off the server. That is expected locally.

## 2. Environment variables

Set these in Coolify as **runtime** variables. Untick **Available at Buildtime**: the build
needs none of them. Coolify ticks it by default for a new variable, and a build-time
variable is written into the Dockerfile as an `ARG`, so a secret would end up in the
image's build metadata. A change takes effect on the next restart, without a rebuild.

| Variable | Staging | Production | Notes |
|---|---|---|---|
| `SITE_URL` | `https://next.sagar-pal.dev` | `https://sagar-pal.dev` (image default) | Absolute URLs in the RSS feed and the Open Graph images |
| `HASH_SECRET` | own value | own value | Required. 32+ characters. Keys the daily visitor hash |
| `SESSION_SECRET` | own value | own value | Required. 32+ characters. Signs the admin cookie and CSRF tokens |
| `ADMIN_PASSWORD_HASH` | own value | own value | Required. argon2id hash of the admin password. Set its **Interpolation** to **Literal (keep $ characters as-is)** (see below) |
| `ADMIN_API_TOKEN` | optional | optional | Turns on the bearer JSON admin API. Empty means off |
| `TRUST_CLOUDFLARE` | `true` | `true` | Use `CF-Connecting-IP` as the visitor's IP (only from Cloudflare addresses, see section 4) |
| `FORWARDED_ALLOW_IPS` | proxy network | proxy network | The subnet of Coolify's proxy network, for example `10.0.1.0/24`. Section 4 says how to find it |
| `NOINDEX` | `true` | unset | Adds `X-Robots-Tag: noindex, nofollow` to every response, so search engines skip staging |
| `LITESTREAM_BUCKET` | unset | unset | Unset means no Litestream (the current set-up). Set, it turns on Litestream, and the next four `LITESTREAM_*` values must then be set too. Each site has its own bucket (section 3) |
| `LITESTREAM_PATH` | `staging` | `production` | Folder inside the bucket that holds the copy |
| `LITESTREAM_ENDPOINT` | R2 endpoint | R2 endpoint | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `LITESTREAM_ACCESS_KEY_ID` | staging R2 key | production R2 key | From the site's own R2 API token (section 3) |
| `LITESTREAM_SECRET_ACCESS_KEY` | staging R2 secret | production R2 secret | From the site's own R2 API token |
| `LITESTREAM_HEARTBEAT_URL` | optional | optional | Ping URL from an uptime service. Litestream calls it while replication works (section 3). Empty means off |
| `UMAMI_DOMAIN`, `UMAMI_ID` | unset | as today | Both set means the Umami tag is added to every page. No trailing slash on the domain |
| `CONTACT_EMAIL` | optional | optional | Sent in the User-Agent of Crossref, arXiv and Open Library lookups |
| `LOG_LEVEL` | `info` | `info` | |

The image already sets `STATIC_DIR=/app/web/dist` and `DATABASE_URL=sqlite:////data/site.db`.
Do not change `DATABASE_URL`: Litestream watches `/data/site.db`.

Make the secrets on your own machine, in `api/`, and use different values for staging and
production:

```bash
uv run python -c "import secrets; print(secrets.token_urlsafe(32))"   # HASH_SECRET, then again for SESSION_SECRET
uv run python -m app.tools.hash_password                              # ADMIN_PASSWORD_HASH
```

The argon2id hash contains `$` characters. Coolify can expand `$` references in a variable's
value, which would change the hash so that every admin login fails. So, in Coolify, set the
**Interpolation** of `ADMIN_PASSWORD_HASH` to **Literal (keep $ characters as-is)**.

## 3. R2 buckets for Litestream (optional, not used)

Not set up: on 1 Nov 2026 Sagar decided that the nightly copies and the VPS's disk backups
are enough. R2 is not enabled on the Cloudflare account. Follow this section only to turn
Litestream on later.

Staging and production each have their own bucket and their own API token. An R2 API token
can be limited to one bucket, but not to a folder inside a bucket. With one shared bucket,
the staging container would hold a key that can overwrite or delete production's backups,
and a wrong `LITESTREAM_PATH` on staging would write into production's copy.

1. Cloudflare dashboard → **R2** → **Create bucket**. Create two buckets, for example
   `sagar-pal-dev-staging-backups` and `sagar-pal-dev-production-backups`. For EU-only
   storage, pick the EU jurisdiction for both. The endpoint then has `eu` in it:
   `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`.
2. R2 → **Manage API tokens** → **Create API token**, once for each bucket. Permission:
   **Object Read & Write**. Scope: only that one bucket. For each token, copy the
   **Access Key ID**, the **Secret Access Key** and the **S3 endpoint** it shows. The secret
   is shown only once.
3. Put them in each Coolify app as `LITESTREAM_ENDPOINT`, `LITESTREAM_ACCESS_KEY_ID` and
   `LITESTREAM_SECRET_ACCESS_KEY`, with `LITESTREAM_BUCKET` set to that site's bucket. The
   staging app gets the staging token and bucket; the production app gets the production
   token and bucket.

For extra protection, an R2 bucket lock rule can stop objects in the production bucket
from being deleted for a set time.

Litestream sends each change to R2 within about a second. By default, Litestream keeps the
last 24 hours of history in the bucket, so a restore from R2 can go back up to a day. The nightly copies in
section 6 go back two weeks.

### Monitoring replication

The container's health check tests only the site, not the backups. When the database
already exists, a revoked or wrong R2 key does not stop the site: Litestream logs errors
and keeps retrying, and nothing else tells you that the copies in R2 have stopped.

So set `LITESTREAM_HEARTBEAT_URL` to a ping URL from an uptime service, for example a
healthchecks.io check or an Uptime Kuma "push" monitor. Set the service to alert you when
the pings stop. Litestream calls the URL every 5 minutes, but only while every sync
succeeds. When the variable is empty, Litestream sends no pings.

## 4. Visitor IPs behind Cloudflare (`FORWARDED_ALLOW_IPS`)

The API reads the visitor's IP from `CF-Connecting-IP` to rate-limit admin logins and to
count each visitor once. Anyone who reaches the server without going through Cloudflare
can send that header too. So the API trusts it only when the request arrived from one of
Cloudflare's published address ranges. The ranges are in `api/app/privacy.py`.

The ranges in `CLOUDFLARE_NETWORKS` are a copy of <https://www.cloudflare.com/ips/>. They
were checked against that page on 1 Nov 2026. If Cloudflare adds a range, visitors who
arrive through it are treated as coming from the Cloudflare address itself, so they share
one login limit and one view count. Compare the list with that page now and then (for
example, when you update dependencies) and update the code if the page has changed.

Coolify's proxy stands between Cloudflare and the container, so uvicorn must be told to
trust the proxy's `X-Forwarded-For` header. It then takes the address that connected to the
proxy as the peer. `FORWARDED_ALLOW_IPS` must be the subnet of the Docker network that the
proxy and the app share. Find it on the VPS:

```bash
# On Yorkhost-VPS. The app's network is shown under General → Internal access → Docker network: "coolify".
docker network inspect coolify --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

Set `FORWARDED_ALLOW_IPS` to that subnet, for example `10.0.1.0/24`. Never use `*`. With
`*`, uvicorn trusts the first address in `X-Forwarded-For`, which a visitor can write.

Check it through the public URL, with the DNS record proxied (orange cloud):

```bash
curl -s https://next.sagar-pal.dev/api/health
# {"status":"ok","posts":0,"via_cloudflare":true}
```

`via_cloudflare` must be `true`. If it is `false`, the subnet is wrong. Then every visitor
appears to come from the proxy's address, so they all share one login limit and one view
count.

## 5. Staging at `next.sagar-pal.dev`

Staging is a second Coolify app built from the `develop` branch (`redesign` until 2 Nov 2026). It has its own volume,
database and secrets. Phase 9 QA runs against it.

1. **Coolify → Projects → Personal Projects → staging → + New → Private Repository (with
   GitHub App).** GitHub App **my-private-repos-sagar**, server **Yorkhost-VPS**, network
   `coolify`. Repository `palsagar/sagarpal-dev-v2`, branch `develop`, build pack
   **Dockerfile**.
2. **Ports Exposes:** `8000`. Leave **Ports Mappings** empty, so the container is reachable
   only through the proxy.
3. **Domains:** `https://next.sagar-pal.dev`.
4. **Persistent Storage → Add → Volume Mount:** name `sagar-pal-dev-staging-data`,
   destination path `/data`. Coolify puts the app's UUID in front of the name. Use a
   volume, not a directory mount: a new Docker volume takes
   its owner from the image, so the `app` user can write to it. A directory on the server
   is owned by root, and the container stops with "/data is not writable".
5. **Environment variables:** the staging column of section 2. Set the **Interpolation** of
   `ADMIN_PASSWORD_HASH` to **Literal (keep $ characters as-is)** (section 2).
6. **Container naming:** choose **Consistent name (no rolling updates)**. With rolling
   updates, Coolify starts the new container before it stops the old one, so two Litestream
   processes would write to one replica, which can corrupt it. The entrypoint refuses to
   start a second Litestream on the same volume, so a deploy with rolling updates on fails.
   The cost of this setting is a few seconds of downtime on each deploy. Without Litestream
   the setting is not strictly needed, but keep it, so that turning Litestream on later
   needs no other change.
7. **Health check:** leave Coolify's own health check off. Coolify then uses the
   Dockerfile's `HEALTHCHECK`. Coolify's HTTP check would run `curl` inside the container,
   and the image does not include curl.
8. **Advanced → Auto Deploy:** on. Every push to `develop` then deploys staging.
9. **Cloudflare DNS:** add an `A` record `next` with the IP address of Yorkhost-VPS,
   **DNS only (grey cloud)**, so Let's Encrypt can reach Coolify's proxy and issue the
   certificate.
10. **Deploy.** The first build takes a few minutes. Check the logs: the last line should be
    `Uvicorn running on http://0.0.0.0:8000`. Without Litestream, the first line is
    `LITESTREAM_BUCKET is not set; the database is not copied off the server`. With it,
    Litestream logs `replicating to`.
11. Once `https://next.sagar-pal.dev` loads with a valid certificate, switch the DNS record
    to **Proxied (orange cloud)**. Then run the check in section 4.
12. **Scheduled task** (section 6).
13. Run the smoke checks from `docs/redesign/API.md` §9 with `BASE=https://next.sagar-pal.dev`.
    Every response also carries `x-robots-tag: noindex, nofollow`.
14. Sign in at `https://next.sagar-pal.dev/admin/`. If the login fails with the right
    password, check the **Interpolation** of `ADMIN_PASSWORD_HASH` (section 2).

On staging, canonical links and `og:image` URLs point at `https://sagar-pal.dev`, because
Astro builds them from its fixed site URL. That is intended: search engines that find
staging anyway are told that the real pages live on the main domain.

To check automatic deploys, push a commit to `develop`. A new deployment appears under
**Deployment Logs** within a minute. If none appears, check that **Git Source** is the
GitHub App and that **Auto Deploy** is on. On GitHub, the App's settings → **Advanced** →
**Recent Deliveries** shows whether GitHub sent the push to Coolify and what Coolify
answered.

Production uses a different route. Since 4 Nov 2026, a signed webhook on the GitHub repo
(**Settings → Webhooks**, push events only) sends pushes to
`https://coolify.gpuphysics.dev/webhooks/source/github/events/manual`, and the production
app holds the matching secret (**Webhooks → GitHub Webhook Secret**). The secret is stored
nowhere else: to replace it, generate a new one and set it in both places. If a push to
`main` starts no deployment, that webhook's **Recent Deliveries** tab shows what Coolify
answered. Do not also set the production app's **Git Source** to the GitHub App while this
webhook exists, because each push could then start two deployments.

## 6. Nightly local copies (Coolify scheduled task)

In the app → **Scheduled Tasks** → **Add**:

- Name: `backup`
- Command: `python -m app.tools.backup`
- Frequency: `0 3 * * *` (03:00 in the server's time zone)

The task copies the database with SQLite's online backup API to
`/data/backups/site-YYYY-MM-DD.db` and keeps the newest 14 copies. It prints the path of the
copy. Use **Execute Now** once to check it.

## 7. Restore

**From R2, after the volume or the server is lost** (only when Litestream is on; today,
restore the volume from the VPS's disk backup, then use a nightly copy as below). Start the app with an empty volume
and the same `LITESTREAM_*` values. The entrypoint finds no database and restores the
latest copy from R2 before the site starts. A successful restore prints nothing, so check
that the reading list and the view counts are back. The log line
`no matching backups found` means R2 had no copy yet, and the site started with an empty
database.

This was tested locally. With a wrong key, the restore fails with a 403 error and the
container stops, so the site never starts with an empty database by mistake. When R2
cannot be reached, the restore keeps retrying, and the site starts only after the restore
has finished.

**From a nightly copy, after a bad change.** Stop the app in Coolify. Then, on the VPS:

```bash
docker volume ls | grep data               # Coolify may prefix the name you gave the volume
VOLUME=<full volume name>
docker run --rm --user 10001:10001 -v "$VOLUME":/data alpine:3.22 ls /data/backups
docker run --rm --user 10001:10001 -v "$VOLUME":/data alpine:3.22 sh -c \
  'rm -f /data/site.db-wal /data/site.db-shm && cp /data/backups/site-2026-11-01.db /data/site.db'
```

`--user 10001:10001` is the image's `app` user, so the restored file keeps the owner the
site needs.

Start the app again. Litestream picks up the restored file and sends it to R2. This was
tested locally: the restored items came back, and writes after the restore reached the
replica with no Litestream errors.

## 8. Production cut-over

Do this only after staging passes Phase 9 and you approve the switch. Today the production
app builds `main` (Jekyll + nginx on port 80). Changing its settings before `main` has the
new code would break the live site, and merging first would deploy the new code with the
old settings. So turn off automatic deployment for the short switch.

Before you start, open **Servers → Yorkhost-VPS → Proxy**. On 1 Nov 2026, Coolify
reported that the proxy's saved configuration differs from the one that runs. A proxy
restart applies the saved one, so find out what changed before the switch.

1. In the production app, turn off **Advanced → Auto Deploy**. The rollback target is the
   Jekyll image `f70270ae35bcc92637000414cc5a6132dfabf662` (commit `f70270a` on `main`).
   Coolify keeps no deployment history for this app, so use the image, not a deployment.
   Check that the image is listed under **Rollback**.
2. Merge the `redesign` pull request into `main`.
3. Change the production app:
   - **Ports Exposes:** `80` → `8000`.
   - **Persistent Storage:** volume `sagar-pal-dev-data` at `/data`.
   - **Environment variables:** the production column of section 2. `UMAMI_DOMAIN` and
     `UMAMI_ID` keep their current values and meaning. Set the **Interpolation** of
     `ADMIN_PASSWORD_HASH` to **Literal (keep $ characters as-is)**.
   - **Container naming:** **Consistent name (no rolling updates)** (section 5, step 6).
     Without it, every deploy after the first one fails, because the new container cannot
     start Litestream while the old one still runs it. With it, each deploy has a few
     seconds of downtime.
   - **Health check:** Coolify's own check off (section 5, step 7).
   - **Scheduled task:** section 6.
4. **Deploy** and watch the logs until uvicorn has started (and Litestream, if it is on).
5. Verify:
   - The API.md §9 smoke checks with `BASE=https://sagar-pal.dev`. There is no
     `x-robots-tag` header in production.
   - `curl -s https://sagar-pal.dev/api/health` shows `"via_cloudflare":true`. If it
     shows `false`, check that the `sagar-pal.dev` and `www` DNS records are **Proxied
     (orange cloud)**, then check `FORWARDED_ALLOW_IPS` (section 4).
   - The old URLs: `/publications/`, `/projects/`, `/feed.xml`, `/assets/pdfs/…` return 200;
     `/categories/`, `/tags/`, `/archives/` and `/sitemap.xml` return 301.
   - The service-worker kill switch: open the site in a browser that visited the old site.
     After at most one reload it shows the new site. DevTools → Application → Service
     workers lists none.
   - Umami: a visit appears in the Realtime view.
   - RSS: <https://validator.w3.org/feed/check.cgi?url=https://sagar-pal.dev/feed.xml>.
   - Open Graph: preview `https://sagar-pal.dev/` on <https://www.opengraph.xyz/>.
   - Google Search Console: submit `https://sagar-pal.dev/sitemap-index.xml`.
   - The admin: sign in at `/admin` and add a test item. It appears on `/what-im-reading/`.
     Delete it again.
6. Make automatic deploys work, then turn **Advanced → Auto Deploy** back on. An app with
   the source **Public GitHub** gets no push events from the GitHub App. Production was
   left in that state on 1 Nov 2026, and setting the source through Coolify's API on
   4 Nov 2026 did not fix it. It uses the signed webhook in section 5 instead. The next push
   to `main` must start a deployment.

### Rollback

In the production app, set **Ports Exposes** back to `80`, then **Rollback** to the Jekyll
image `f70270ae35bcc92637000414cc5a6132dfabf662` (step 1). That image is still on the
server, so no rebuild is needed. The server's nightly Docker cleanup keeps images for
rollback while **Disable application image retention** stays off. The `/data` volume stays and is unused by the old site. For a lasting
rollback, also revert the merge on `main` (a new revert commit, never a force-push), so
that the next push does not deploy the new site again.

## 9. Analytics (Umami)

Same behaviour as the old nginx set-up, now done by FastAPI. When `UMAMI_DOMAIN` and
`UMAMI_ID` are both set, every HTML page gets
`<script defer src="${UMAMI_DOMAIN}/script.js" data-website-id="${UMAMI_ID}"></script>`
before `</head>`. When either is empty, no tag is added. The Content-Security-Policy
(enforced) allows that domain. Change or remove the variables and restart: no
rebuild is needed.
