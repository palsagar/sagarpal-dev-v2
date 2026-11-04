"""Serving the Astro build (API.md §6): redirects, cache headers, 404, Umami, security headers."""

import base64
import hashlib
import html
import re
from pathlib import Path
from urllib.parse import quote

from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException
from starlette.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from starlette.staticfiles import StaticFiles
from starlette.types import ASGIApp, Message, Receive, Scope, Send

CV_PATH = "/assets/pdfs/Sagar_Pal_CV_2025.pdf"

HTML_CACHE = "public, max-age=0, must-revalidate"
IMMUTABLE = "public, max-age=31536000, immutable"
ASSET_CACHE = "public, max-age=86400"
# Files whose content changes without a new name: always revalidate.
_REVALIDATE_TYPES = ("text/html", "application/json", "application/xml", "text/plain", "text/xml")
# Types that Python's built-in table lacks. python:3.12-slim has no /etc/mime.types, so
# without these the image serves them as application/octet-stream (with "nosniff").
_MEDIA_TYPES = {
    ".webp": "image/webp",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
}

FALLBACK_404 = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found — Sagar Pal</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0e16;
color:#eeeae2;font:18px/1.5 'Helvetica Neue',Arial,sans-serif;padding:16px}a{color:#f2a64a}</style>
</head><body><main><h1>Not found</h1><p>That page drifted out of the field.</p>
<p><a href="/">Back home</a></p></main></body></html>"""

_CHIRPY_TABS = re.compile(r"/(?:categories|tags|archives)(?:/.*)?")
_CHIRPY_POST = re.compile(r"/posts/([^/]+)/?")


def redirect_for(path: str) -> tuple[str, int] | None:
    """Return ``(location, status)`` for the old URLs of plan §2.2, else None.

    ``/sitemap.xml`` is the old Jekyll sitemap; Astro writes ``/sitemap-index.xml``.

    ``/cv`` is a 302 because its target changes with each new CV; a cached 301
    would keep returning visitors on the old file.

    Examples
    --------
    .. code-block:: python

        redirect_for("/posts/hello/")  # ('/blog/hello/', 301)
    """
    if path in ("/cv", "/cv/"):
        return (CV_PATH, 302)
    if path == "/sitemap.xml":
        return ("/sitemap-index.xml", 301)
    if _CHIRPY_TABS.fullmatch(path):
        return ("/blog/", 301)
    if match := _CHIRPY_POST.fullmatch(path):
        # The path is already percent-decoded: re-encode it so it cannot break the header.
        return (f"/blog/{quote(match.group(1), safe='')}/", 301)
    return None


def umami_tag(domain: str, website_id: str) -> bytes:
    """The Umami script tag, attribute-escaped."""
    return (
        f'<script defer src="{html.escape(domain)}/script.js" '
        f'data-website-id="{html.escape(website_id)}"></script>'
    ).encode()


class SiteStatic(StaticFiles):
    """StaticFiles for ``dist/`` with the site's URL, cache and analytics rules.

    Parameters
    ----------
    directory
        The Astro build output.
    umami
        The Umami tag to insert before ``</head>``, or None.

    Examples
    --------
    .. code-block:: python

        app.mount("/", SiteStatic(directory=dist, umami=None), name="static")
    """

    def __init__(self, directory: Path, umami: bytes | None) -> None:
        super().__init__(directory=directory, html=True)
        self.umami = umami

    async def get_response(self, path: str, scope: Scope) -> Response:
        """Redirect old URLs, serve the file or the 404 page, then set headers."""
        target = redirect_for(scope["path"])
        if target is not None:
            location, status = target
            return RedirectResponse(location + _query(scope), status_code=status)
        try:
            response = await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            response = HTMLResponse(FALLBACK_404, status_code=404)
        if isinstance(response, RedirectResponse):
            # Directory URL without its slash: Starlette answers 307 with an absolute URL.
            # The slash form is canonical, so 301, and relative so the scheme never matters.
            # Built from the normalised path, never the raw one: "//blog" must not become the
            # protocol-relative "//blog/" (an open redirect to a host named "blog").
            location = "/" + quote(Path(path).as_posix().strip("/")) + "/" + _query(scope)
            return RedirectResponse(location, status_code=301)
        if isinstance(response, FileResponse):
            # Name the types the system table may not know, whatever the host has installed.
            media_type = _MEDIA_TYPES.get(Path(response.path).suffix.lower())
            if media_type is not None:
                response.headers["Content-Type"] = media_type
        response.headers["Cache-Control"] = self._cache_control(path, response)
        if self.umami and isinstance(response, FileResponse) and _is_html(response):
            return self._inject(response)
        return response

    @staticmethod
    def _cache_control(path: str, response: Response) -> str:
        # Checked first: a missing hashed chunk must not be cached as a year-long 404.
        if response.status_code == 404:
            return HTML_CACHE
        if path.startswith("_astro/"):
            return IMMUTABLE
        # The kill switch for the old site's service worker (web/public/sw.min.js).
        if path == "sw.min.js":
            return "no-store"
        if response.headers.get("content-type", "").startswith(_REVALIDATE_TYPES):
            return HTML_CACHE
        return ASSET_CACHE

    def _inject(self, response: FileResponse) -> Response:
        assert self.umami is not None
        body = Path(response.path).read_bytes().replace(b"</head>", self.umami + b"</head>", 1)
        # ETag and Last-Modified describe the file, not this body, so they are dropped.
        headers = {
            k: v
            for k, v in response.headers.items()
            if k not in ("content-length", "etag", "last-modified")
        }
        return Response(body, status_code=response.status_code, headers=headers)


def _query(scope: Scope) -> str:
    query = scope.get("query_string", b"").decode("latin-1")
    return f"?{query}" if query else ""


def _is_html(response: Response) -> bool:
    return response.headers.get("content-type", "").startswith("text/html")


_INLINE_SCRIPT = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.DOTALL | re.IGNORECASE)
_SRC_ATTR = re.compile(r"\bsrc\s*=", re.IGNORECASE)
_TYPE_ATTR = re.compile(r"""\btype\s*=\s*["']?([^"'\s>]+)""", re.IGNORECASE)
_JS_TYPES = {"module", "text/javascript", "application/javascript"}


def inline_script_hashes(static_dir: Path) -> list[str]:
    """CSP ``'sha256-…'`` sources for every inline executable script in the build.

    JSON-LD and other data blocks are skipped: CSP does not apply to them.

    Examples
    --------
    .. code-block:: python

        inline_script_hashes(Path("web/dist"))  # ["'sha256-…'", ...]
    """
    hashes: set[str] = set()
    for page in static_dir.rglob("*.html"):
        for attrs, body in _INLINE_SCRIPT.findall(page.read_text(encoding="utf-8")):
            type_match = _TYPE_ATTR.search(attrs)
            if _SRC_ATTR.search(attrs) or (type_match and type_match.group(1) not in _JS_TYPES):
                continue
            digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
            hashes.add(f"'sha256-{digest}'")
    return sorted(hashes)


def content_security_policy(script_hashes: list[str], umami_domain: str | None) -> str:
    """The policy: self, the inline scripts' hashes, Umami, data: images and fonts.

    ``img-src`` also allows any https image because reading-list covers come from
    URLs the admin enters (Open Library and others). ``font-src`` allows ``data:``
    because the Astro build inlines small font files into its CSS (a KaTeX font and a
    JetBrains Mono subset).
    """
    analytics = [umami_domain] if umami_domain else []
    script_src = " ".join(["'self'", *script_hashes, *analytics])
    connect_src = " ".join(["'self'", *analytics])
    return (
        f"default-src 'self'; script-src {script_src}; style-src 'self' 'unsafe-inline'; "
        f"img-src 'self' data: https:; font-src 'self' data:; connect-src {connect_src}; "
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    )


class SecurityHeaders:
    """ASGI middleware that adds the API.md §6 headers to every response.

    A header a route set itself (for example its own ``Cache-Control``) is never
    replaced; these are only defaults.
    """

    def __init__(self, app: ASGIApp, headers: dict[str, str]) -> None:
        self.app = app
        self.headers = headers

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self.headers.items():
                    if name not in headers:
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_headers)


def security_headers(csp: str, noindex: bool = False) -> dict[str, str]:
    """The fixed header set, with the CSP enforced (report-only until the cut-over).

    ``noindex`` adds ``X-Robots-Tag: noindex, nofollow`` (the staging site).
    """
    headers = {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": csp,
    }
    if noindex:
        headers["X-Robots-Tag"] = "noindex, nofollow"
    return headers
