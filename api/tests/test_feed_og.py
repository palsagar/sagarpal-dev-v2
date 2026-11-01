import io
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.config import get_settings
from app.main import create_app
from app.services.og_image import DEFAULT_DEK, DEFAULT_TITLE, cached_card, title_font, wrap
from tests.conftest import post, write_manifest

ATOM = "{http://www.w3.org/2005/Atom}"


def _feed(client: TestClient) -> ET.Element:
    response = client.get("/feed.xml")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/rss+xml")
    assert response.headers["cache-control"] == "public, max-age=600"
    return ET.fromstring(response.content).find("channel")  # type: ignore[return-value]


def test_empty_feed_is_a_valid_channel(isolated_settings: Path) -> None:
    with TestClient(create_app()) as client:
        channel = _feed(client)
    assert channel.findtext("title") == "Sagar Pal — Writing"
    assert channel.findtext("link") == "http://testserver/"
    assert channel.findall("item") == []
    self_link = channel.find(f"{ATOM}link")
    assert self_link is not None
    assert self_link.get("href") == "http://testserver/feed.xml"
    assert self_link.get("rel") == "self"


def test_feed_lists_the_latest_20_newest_first_with_escaping(tmp_path: Path) -> None:
    posts = [post(f"p{i:02d}", date=f"2026-01-{i + 1:02d}") for i in range(25)]
    posts.append(post("amp", title="Fast & <small>", date="2026-02-01", tags=["GPU", "HPC"]))
    write_manifest(tmp_path / "dist", posts)
    with TestClient(create_app()) as client:
        channel = _feed(client)
    items = channel.findall("item")
    assert len(items) == 20
    first = items[0]
    assert first.findtext("title") == "Fast & <small>"
    assert first.findtext("link") == "http://testserver/blog/amp/"
    assert first.findtext("guid") == "http://testserver/blog/amp/"
    assert first.findtext("pubDate") == "Sun, 01 Feb 2026 00:00:00 +0000"
    assert first.findtext("description") == "Dek of amp"
    assert [c.text for c in first.findall("category")] == ["GPU", "HPC"]
    assert items[1].findtext("title") == "Title of p24"
    assert channel.findtext("lastBuildDate") == "Sun, 15 Nov 2026 10:00:00 +0000"


def _png_size(content: bytes) -> tuple[int, int]:
    return Image.open(io.BytesIO(content)).size


def test_default_card_is_a_cached_1200x630_png(client: TestClient) -> None:
    response = client.get("/og/default.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "public, max-age=86400"
    assert _png_size(response.content) == (1200, 630)
    cache = get_settings().data_dir / "og-cache"
    [cached] = list(cache.glob("default-*.png"))
    mtime = cached.stat().st_mtime_ns
    assert client.get("/og/default.png").content == response.content
    assert cached.stat().st_mtime_ns == mtime  # served from the cache, not redrawn


def test_post_cards_exist_only_for_published_posts(client: TestClient) -> None:
    assert _png_size(client.get("/og/alpha.png").content) == (1200, 630)
    assert client.get("/og/unknown.png").status_code == 404
    assert client.get("/og/alpha.jpg").status_code == 404


def test_a_changed_title_draws_a_new_card_and_removes_the_old_one(tmp_path: Path) -> None:
    cache = tmp_path / "og"
    first = cached_card(cache, "post-a", "One", "Dek")
    cached_card(cache, "post-a-b", "Other post", "Dek")  # a slug sharing the prefix
    second = cached_card(cache, "post-a", "Two", "Dek")
    assert first != second
    assert not first.exists()
    assert sorted(p.name.split("-")[1] for p in cache.glob("*.png")) == ["a", "a"]
    assert len(list(cache.glob("post-a-b-*.png"))) == 1


def test_long_titles_wrap_to_three_lines_with_an_ellipsis() -> None:
    font = title_font(52)
    lines, cut = wrap("word " * 200, font, 920, 3)
    assert cut and len(lines) == 3 and lines[-1].endswith("…")
    assert all(font.getlength(line) <= 920 for line in lines)
    lines, cut = wrap(DEFAULT_TITLE, font, 920, 3)
    assert lines == ["Sagar Pal"] and not cut
    lines, _ = wrap("x" * 400, font, 920, 3)  # one unbreakable word
    assert len(lines) == 1


def test_very_long_post_title_still_renders(tmp_path: Path) -> None:
    path = cached_card(tmp_path, "long", "A rather long title " * 12, DEFAULT_DEK * 3)
    assert Image.open(path).size == (1200, 630)


def test_og_cache_names_never_collide() -> None:
    from app.routers.og import _file_name

    assert _file_name("a.b") != _file_name("a_b")
    assert _file_name("a/b").count("/") == 0
