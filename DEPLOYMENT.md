# Deployment — self-hosted on a Coolify VPS

This site is a Jekyll + Chirpy static site. It is built and served as a Docker
image (Jekyll build → nginx) and deployed on a self-hosted **Coolify** VPS.
DNS is managed at Cloudflare; TLS is Let's Encrypt, issued by Coolify's proxy.

## How it builds

| File | Purpose |
|---|---|
| `Dockerfile` | Multi-stage. Stage 1 (`ruby:3.3-slim`) runs `bundle install` + `JEKYLL_ENV=production jekyll build`. Stage 2 (`nginx:alpine`) serves the built `_site/` on port 80. `git` + `.git` are included so `_plugins/posts-lastmod-hook.rb` works when posts are added. |
| `nginx.conf` | Serves `_site`, wires Chirpy's custom `/404.html`, enables gzip. |
| `.dockerignore` | Keeps the build context lean; keeps `.git` (the lastmod hook needs it). |

`_config.yml` already has `url: https://sagar-pal.dev` and `baseurl: ""`, so no
config changes are needed — the site serves at the domain root.

Build/serve is verified locally with:

```bash
docker build -t sagarpal-dev-test .
docker run -d --name sp-test -p 8099:80 sagarpal-dev-test
curl -sI http://localhost:8099/            # 200, Server: nginx
docker rm -f sp-test && docker rmi sagarpal-dev-test
```

## Migration runbook (GitHub Pages → Coolify VPS)

Zero-downtime: GitHub Pages stays live until the final step, so rollback is
just a DNS revert.

### Phase 0 — Prerequisites
1. Coolify installed and running on the VPS.
2. Know the VPS public IP (`<VPS_IP>` below).
3. VPS firewall allows inbound **80** and **443** (80 for Let's Encrypt
   HTTP-01, 443 for serving).

### Phase 1 — Commit & push the deploy files
```bash
git add Dockerfile nginx.conf .dockerignore DEPLOYMENT.md
git commit -m "chore: Add Docker/nginx deploy for Coolify VPS hosting"
git push origin main
```
This also triggers the existing GitHub Actions Pages build — fine, and
intended. Pages stays live as the fallback until Phase 6.

### Phase 2 — Connect GitHub to Coolify (auto-deploy on push)
1. Coolify: **Sources → + Add → GitHub App**; install Coolify's GitHub App.
2. Grant it access to **`palsagar/sagarpal-dev-v2`**.

   Every push to `main` then auto-rebuilds — replacing what GitHub Actions did.

### Phase 3 — Create the application
1. **Projects → + New → Application → Private/Public Repository** (GitHub App source).
2. Repo **`palsagar/sagarpal-dev-v2`**, branch **`main`**.
3. **Build Pack: `Dockerfile`** (auto-detected at repo root).
4. **Ports Exposes: `80`**.
5. Save and **Deploy once**. Verify via Coolify's temporary domain
   (`*.sslip.io`) or `http://<VPS_IP>:<mapped-port>` before touching DNS.

### Phase 4 — Set the real domain + SSL in Coolify
In the app → **Domains**, enter:
- `https://sagar-pal.dev`
- `https://www.sagar-pal.dev`

Coolify's proxy requests Let's Encrypt certs automatically once DNS resolves
to the VPS (next phase).

### Phase 5 — Repoint Cloudflare DNS

| Action | Current record | New record |
|---|---|---|
| **Delete** | `A  sagar-pal.dev → 185.199.108–111.153` (×4) | — |
| **Add** | — | `A  sagar-pal.dev → <VPS_IP>` · **DNS only (grey)** |
| **Edit** | `CNAME  www → palsagar.github.io` | `CNAME  www → sagar-pal.dev` · **DNS only (grey)** |

Keep the grey cloud (DNS-only) during cutover so Let's Encrypt's HTTP-01
challenge reaches the origin cleanly. TTLs are "Auto" (~5 min unproxied).

Within a few minutes Coolify issues certs and the site is live over HTTPS.
Redeploy in Coolify if it doesn't pick up the certs automatically.

### Phase 6 — Verify, then decommission GitHub Pages
```bash
curl -sI https://sagar-pal.dev | head -n 1        # HTTP/2 200
curl -sI https://sagar-pal.dev | grep -i server    # nginx
echo | openssl s_client -connect sagar-pal.dev:443 -servername sagar-pal.dev 2>/dev/null \
  | openssl x509 -noout -issuer                     # Let's Encrypt
```
Click through `/`, `/publications/`, `/projects/`, and a bad URL (Chirpy 404).
Only once this passes:
1. **GitHub → Settings → Pages**: **Remove** the custom domain, **Unpublish site**, set Source to *None*.
2. Delete `.github/workflows/pages-deploy.yml` (or leave it — harmless once Pages is unpublished).
3. *(Optional)* Remove GitHub-Pages artifacts `CNAME` and `.nojekyll` — harmless on nginx, cosmetic.

### Phase 7 — Optional Cloudflare hardening (after HTTPS confirmed)
- Flip apex `A` and `www` `CNAME` to **Proxied (orange)** for DDoS/caching + origin hiding.
- **SSL/TLS → Overview → Full (strict)**; enable **Always Use HTTPS**.
- Canonical www→apex: Cloudflare **Redirect Rule** `www.sagar-pal.dev/*` → `https://sagar-pal.dev/$1` (301).

### Rollback
Pages stays live through Phase 5, so rollback = DNS revert: re-add the four
`185.199.10x.153` A records and set `www → palsagar.github.io`.

## Note: PWA service worker
`pwa.enabled: true`, so returning visitors carry a cached service worker from
the Pages deploy. Same domain, so the browser fetches the new `sw.js` on next
visit and self-heals — possibly one stale load. Not a blocker.
