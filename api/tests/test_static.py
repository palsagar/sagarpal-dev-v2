import base64
import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.static import redirect_for
from tests.conftest import BROWSER_UA

THEME_SCRIPT = "document.documentElement.dataset.theme='night'"


def test_html_revalidates_and_carries_security_headers(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert "home" in response.text
    headers = response.headers
    assert headers["cache-control"] == "public, max-age=0, must-revalidate"
    assert headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert headers["permissions-policy"] == "camera=(), microphone=(), geolocation=()"
    assert headers["x-frame-options"] == "DENY"
    assert "content-security-policy" not in headers  # report-only for now


def test_csp_hashes_the_inline_theme_script_only(client: TestClient) -> None:
    csp = client.get("/").headers["content-security-policy-report-only"]
    digest = base64.b64encode(hashlib.sha256(THEME_SCRIPT.encode()).digest()).decode()
    assert f"'sha256-{digest}'" in csp
    assert csp.count("'sha256-") == 1  # JSON-LD and external scripts are not hashed
    assert "frame-ancestors 'none'" in csp


def test_api_responses_also_get_security_headers(client: TestClient) -> None:
    headers = client.get("/api/health").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["cache-control"] == "no-store"  # the route's own value is kept


def test_fingerprinted_assets_are_immutable_and_others_cached_a_day(client: TestClient) -> None:
    assert client.get("/_astro/a.js").headers["cache-control"] == (
        "public, max-age=31536000, immutable"
    )
    assert client.get("/favicon.ico").headers["cache-control"] == "public, max-age=86400"
    manifest = client.get("/content-manifest.json")
    assert manifest.headers["cache-control"] == "public, max-age=0, must-revalidate"


def test_directory_urls_get_a_301_to_the_slash_form(client: TestClient) -> None:
    response = client.get("/blog?x=1", follow_redirects=False)
    assert response.status_code == 301
    assert response.headers["location"] == "/blog/?x=1"
    assert client.get("/blog/").text.endswith("blog</body></html>")


def test_slash_redirect_cannot_point_at_another_host(client: TestClient) -> None:
    for raw in ["//blog", "///blog", "/./blog", "/_astro/../blog"]:
        # A full URL, so httpx sends the path as is instead of reading "//blog" as a host.
        response = client.get(f"https://testserver{raw}", follow_redirects=False)
        assert response.status_code == 301, raw
        assert response.headers["location"] == "/blog/", raw


@pytest.mark.parametrize(
    ("path", "status", "location"),
    [
        ("/categories/", 301, "/blog/"),
        ("/categories", 301, "/blog/"),
        ("/tags/numerics/", 301, "/blog/"),
        ("/archives/", 301, "/blog/"),
        ("/posts/old-post/", 301, "/blog/old-post/"),
        ("/posts/old-post", 301, "/blog/old-post/"),
        ("/cv", 302, "/assets/pdfs/Sagar_Pal_CV_2025.pdf"),
        ("/cv/", 302, "/assets/pdfs/Sagar_Pal_CV_2025.pdf"),
    ],
)
def test_old_urls_redirect(client: TestClient, path: str, status: int, location: str) -> None:
    response = client.get(path, follow_redirects=False)
    assert response.status_code == status
    assert response.headers["location"] == location


def test_redirect_targets_are_encoded() -> None:
    assert redirect_for("/posts/a b\r\nSet-Cookie: x/") == (
        "/blog/a%20b%0D%0ASet-Cookie%3A%20x/",
        301,
    )
    assert redirect_for("/postsx/") is None
    assert redirect_for("/tagsoup/") is None


def test_unknown_paths_get_the_custom_404_page(client: TestClient) -> None:
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    assert "custom 404" in response.text
    assert response.headers["cache-control"] == "public, max-age=0, must-revalidate"


def test_without_404_html_a_plain_fallback_is_served(static_dir: Path) -> None:
    (static_dir / "404.html").unlink()
    with TestClient(create_app()) as client:
        response = client.get("/nope")
    assert response.status_code == 404
    assert "That page drifted out of the field." in response.text


def test_posting_to_a_static_path_is_405(client: TestClient) -> None:
    assert client.post("/").status_code == 405


def test_umami_is_injected_before_head_only_when_configured(
    client: TestClient, static_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert "script.js" not in client.get("/").text

    monkeypatch.setenv("UMAMI_DOMAIN", "https://analytics.example/")
    monkeypatch.setenv("UMAMI_ID", 'id-"1"')
    from app.config import get_settings

    get_settings.cache_clear()
    with TestClient(create_app(), headers={"User-Agent": BROWSER_UA}) as umami_client:
        page = umami_client.get("/")
        not_found = umami_client.get("/missing")
        head = umami_client.head("/")
    tag = (
        '<script defer src="https://analytics.example/script.js" '
        'data-website-id="id-&quot;1&quot;"></script></head>'
    )
    assert tag in page.text
    assert page.text.count("script.js") == 1
    assert "etag" not in page.headers
    assert int(page.headers["content-length"]) == len(page.content)
    assert tag in not_found.text and not_found.status_code == 404
    assert head.status_code == 200
    csp = page.headers["content-security-policy-report-only"]
    assert "https://analytics.example" in csp


def test_umami_needs_both_variables(static_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UMAMI_DOMAIN", "https://analytics.example")
    from app.config import get_settings

    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert "script.js" not in client.get("/").text


def test_head_works_on_api_feed_and_og_routes(client: TestClient) -> None:
    # curl -I and uptime monitors send HEAD; it must not fall through to the static 404.
    for path in ["/api/health", "/feed.xml", "/og/default.png", "/"]:
        assert client.head(path).status_code == 200, path


def test_api_and_feed_routes_win_over_static_files(client: TestClient) -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/feed.xml").headers["content-type"].startswith("application/rss+xml")
    assert client.get("/api/nope").status_code == 404


def test_a_missing_hashed_asset_is_not_cached_for_a_year(client: TestClient) -> None:
    response = client.get("/_astro/gone.abc123.js")
    assert response.status_code == 404
    assert response.headers["cache-control"] == "public, max-age=0, must-revalidate"
