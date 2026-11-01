import json
import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password

# Test-only secrets. They must exist before app.main is imported, because the module
# builds the production app (and its Settings) at import time.
TEST_PASSWORD = "test password, never used anywhere else"
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD)
TEST_ENV = {
    "SITE_URL": "http://testserver",
    "HASH_SECRET": "h" * 40,
    "SESSION_SECRET": "s" * 40,
    "ADMIN_PASSWORD_HASH": TEST_PASSWORD_HASH,
    "ADMIN_API_TOKEN": "",
    "TRUST_CLOUDFLARE": "false",
    "UMAMI_DOMAIN": "",
    "UMAMI_ID": "",
    "CONTACT_EMAIL": "",
    "LOG_LEVEL": "info",
}
for _name, _value in TEST_ENV.items():
    os.environ.setdefault(_name, _value)

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402

BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 Safari/605.1.15"


def post(slug: str, **overrides: Any) -> dict[str, Any]:
    """A manifest post with sensible defaults."""
    return {
        "slug": slug,
        "url": f"/blog/{slug}/",
        "title": f"Title of {slug}",
        "dek": f"Dek of {slug}",
        "date": "2026-11-12",
        "updated": None,
        "tags": ["Numerics"],
        "readingMinutes": 5,
        "text": f"Body text of {slug}.",
        **overrides,
    }


def write_manifest(static_dir: Path, posts: list[dict[str, Any]]) -> Path:
    """Write content-manifest.json into the fake dist/ directory."""
    static_dir.mkdir(parents=True, exist_ok=True)
    path = static_dir / "content-manifest.json"
    path.write_text(
        json.dumps(
            {
                "generated_at": "2026-11-15T10:00:00Z",
                "site": "https://sagar-pal.dev",
                "posts": posts,
            }
        )
    )
    return path


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point every setting at tmp_path so tests never touch the real .data/ or api/.env values.

    Environment variables take precedence over api/.env, so setting all of them here
    makes a developer's .env irrelevant. Yields the test database path.
    """
    db_path = tmp_path / "data" / "site.db"
    for name, value in TEST_ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "dist"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    get_settings.cache_clear()
    yield db_path
    get_settings.cache_clear()


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A fake Astro build with a home page, a blog page, a 404 page and one asset."""
    dist = tmp_path / "dist"
    (dist / "blog").mkdir(parents=True)
    (dist / "_astro").mkdir()
    (dist / "index.html").write_text(
        "<!doctype html><html><head><title>Home</title>"
        "<script>document.documentElement.dataset.theme='night'</script>"
        '<script type="application/ld+json">{"@type":"Person"}</script>'
        '<script type="module" src="/_astro/a.js"></script>'
        "</head><body>home</body></html>"
    )
    (dist / "blog" / "index.html").write_text("<html><head></head><body>blog</body></html>")
    (dist / "404.html").write_text("<html><head></head><body>custom 404</body></html>")
    (dist / "_astro" / "a.js").write_text("console.log(1)")
    (dist / "favicon.ico").write_bytes(b"\x00\x00\x01\x00")
    write_manifest(dist, [post("alpha"), post("beta", date="2026-10-01")])
    return dist


@pytest.fixture
def client(static_dir: Path) -> Iterator[TestClient]:
    """A client for an app with migrations run and the two-post manifest loaded.

    The base URL is https so the Secure admin cookies are sent back.
    """
    with TestClient(
        create_app(), base_url="https://testserver", headers={"User-Agent": BROWSER_UA}
    ) as test_client:
        yield test_client
