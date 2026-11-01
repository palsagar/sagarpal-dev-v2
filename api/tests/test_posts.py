from datetime import UTC, datetime

from fastapi.testclient import TestClient
from freezegun import freeze_time
from sqlalchemy import func, select

from app.models import SeenKey

OTHER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/133.0"


def _stats(client: TestClient, slug: str = "alpha", **headers: str) -> dict[str, object]:
    response = client.get(f"/api/posts/{slug}/stats", headers=headers)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data: dict[str, object] = response.json()
    return data


def test_stats_start_at_zero_with_the_contract_shape(client: TestClient) -> None:
    assert _stats(client) == {"views": 0, "useful": 0, "reacted": False}


def test_unknown_slugs_get_404_and_create_no_rows(client: TestClient) -> None:
    for method, path in [
        ("GET", "/api/posts/nope/stats"),
        ("POST", "/api/posts/nope/view"),
        ("POST", "/api/posts/nope/useful"),
    ]:
        assert client.request(method, path).status_code == 404
    with client.app.state.ctx.sessions() as session:  # type: ignore[attr-defined]
        assert session.scalar(select(func.count()).select_from(SeenKey)) == 0


def test_a_view_counts_once_per_visitor_per_day(client: TestClient) -> None:
    for _ in range(3):
        response = client.post("/api/posts/alpha/view")
        assert response.status_code == 204
        assert response.content == b""
    assert _stats(client)["views"] == 1

    client.post("/api/posts/alpha/view", headers={"User-Agent": OTHER_UA})
    assert _stats(client)["views"] == 2
    assert _stats(client, "beta")["views"] == 0


def test_the_daily_salt_rotation_lets_a_visitor_count_again_tomorrow(client: TestClient) -> None:
    with freeze_time("2026-11-01 23:59:00", real_asyncio=True) as frozen:
        client.post("/api/posts/alpha/useful")
        client.post("/api/posts/alpha/useful")
        assert _stats(client) == {"views": 0, "useful": 1, "reacted": True}

        frozen.move_to("2026-11-02 00:00:30")
        assert _stats(client)["reacted"] is False
        assert client.post("/api/posts/alpha/useful").json() == {"useful": 2, "reacted": True}


def test_useful_returns_the_total_and_dedupes(client: TestClient) -> None:
    assert client.post("/api/posts/alpha/useful").json() == {"useful": 1, "reacted": True}
    assert client.post("/api/posts/alpha/useful").json() == {"useful": 1, "reacted": True}
    other = client.post("/api/posts/alpha/useful", headers={"User-Agent": OTHER_UA})
    assert other.json() == {"useful": 2, "reacted": True}
    assert other.headers["cache-control"] == "no-store"
    assert _stats(client) == {"views": 0, "useful": 2, "reacted": True}
    assert _stats(client, **{"User-Agent": "Mozilla/5.0 Something else"})["reacted"] is False


def test_bots_and_empty_user_agents_are_not_counted(client: TestClient) -> None:
    for ua in ["Googlebot/2.1", ""]:
        assert client.post("/api/posts/alpha/view", headers={"User-Agent": ua}).status_code == 204
        client.post("/api/posts/alpha/useful", headers={"User-Agent": ua})
    assert _stats(client)["views"] == 0
    assert _stats(client)["useful"] == 0


def test_cloudflare_ip_separates_visitors_only_when_trusted(client: TestClient) -> None:
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    for ip in ["203.0.113.1", "203.0.113.2"]:
        client.post("/api/posts/alpha/view", headers={"CF-Connecting-IP": ip})
    assert _stats(client)["views"] == 1  # header ignored: same peer, same UA

    ctx.settings.trust_cloudflare = True
    for ip in ["203.0.113.1", "203.0.113.2"]:
        client.post("/api/posts/alpha/view", headers={"CF-Connecting-IP": ip})
    assert _stats(client)["views"] == 3


def test_stats_posts_are_rate_limited_to_30_per_minute(client: TestClient) -> None:
    codes = [client.post("/api/posts/alpha/view").status_code for _ in range(31)]
    assert codes[:30] == [204] * 30
    assert codes[30] == 429
    limited = client.post("/api/posts/alpha/useful")
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1
    assert client.get("/api/posts/alpha/stats").status_code == 200  # reads are not limited


def test_expired_keys_are_purged_on_writes_at_most_hourly(client: TestClient) -> None:
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    with freeze_time("2026-11-01 10:00:00", real_asyncio=True) as frozen:
        client.post("/api/posts/alpha/view")
        frozen.move_to("2026-11-03 10:00:00")  # yesterday's key has expired
        ctx.last_purge = datetime(2026, 11, 3, 9, 30, tzinfo=UTC)  # purged half an hour ago
        client.post("/api/posts/beta/view")
        with ctx.sessions() as session:
            assert session.scalar(select(func.count()).select_from(SeenKey)) == 2

        frozen.move_to("2026-11-03 10:31:00")
        client.post("/api/posts/beta/useful")
        with ctx.sessions() as session:
            keys = session.scalar(select(func.count()).select_from(SeenKey))
        assert keys == 2  # the expired key is gone; beta view + beta useful remain


def test_slugs_are_matched_after_url_decoding(client: TestClient) -> None:
    # The front end sends encodeURIComponent(slug); a plain slug is unchanged by it.
    assert client.get("/api/posts/al%70ha/stats").status_code == 200
    assert client.get("/api/posts/alpha%2F..%2Fbeta/stats").status_code == 404
