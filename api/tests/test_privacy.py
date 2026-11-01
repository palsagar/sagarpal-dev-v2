from datetime import UTC, date, datetime

import pytest
from freezegun import freeze_time
from starlette.requests import Request

from app.privacy import (
    client_ip,
    daily_secret,
    from_cloudflare,
    is_bot,
    key_expiry,
    utc_now,
    visitor_key,
)
from app.ratelimit import RateLimiter
from tests.conftest import BROWSER_UA

SECRET = b"k" * 32


def _request(headers: dict[str, str], peer: str | None = "10.0.0.1") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 1234) if peer else None,
    }
    return Request(scope)


def test_daily_secret_rotates_at_midnight_utc() -> None:
    with freeze_time("2026-11-01 23:59:59"):
        before = daily_secret(SECRET, utc_now().date())
    with freeze_time("2026-11-02 00:00:00"):
        after = daily_secret(SECRET, utc_now().date())
    assert before != after
    assert daily_secret(SECRET, date(2026, 11, 1)) == before


def test_visitor_key_depends_on_every_part() -> None:
    secret = daily_secret(SECRET, date(2026, 11, 1))
    base = visitor_key(secret, "1.2.3.4", "UA", "post", "view")
    assert len(base) == 64
    assert base == visitor_key(secret, "1.2.3.4", "UA", "post", "view")
    others = {
        visitor_key(secret, "1.2.3.5", "UA", "post", "view"),
        visitor_key(secret, "1.2.3.4", "UA2", "post", "view"),
        visitor_key(secret, "1.2.3.4", "UA", "other", "view"),
        visitor_key(secret, "1.2.3.4", "UA", "post", "useful"),
        visitor_key(daily_secret(SECRET, date(2026, 11, 2)), "1.2.3.4", "UA", "post", "view"),
    }
    assert base not in others
    assert len(others) == 5
    # Nothing raw survives in the key.
    assert "1.2.3.4" not in base


def test_key_expiry_is_tomorrow_one_am_utc() -> None:
    assert key_expiry(datetime(2026, 11, 1, 15, 30, tzinfo=UTC)) == datetime(2026, 11, 2, 1, 0)
    assert key_expiry(datetime(2026, 12, 31, 23, 59, tzinfo=UTC)) == datetime(2027, 1, 1, 1, 0)


@pytest.mark.parametrize(
    "ua",
    [
        "",
        "   ",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "curl/8.7.1",
        "python-httpx/0.28.1",
        "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0",
        "facebookexternalhit/1.1",
    ],
)
def test_bots_and_empty_agents_are_detected(ua: str) -> None:
    assert is_bot(ua)


def test_browsers_are_not_bots() -> None:
    assert not is_bot(BROWSER_UA)
    assert not is_bot("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile")


def test_client_ip_trusts_cloudflare_only_when_told_to() -> None:
    request = _request({"CF-Connecting-IP": "203.0.113.7"}, peer="104.16.0.1")
    assert client_ip(request, trust_cloudflare=True) == "203.0.113.7"
    assert client_ip(request, trust_cloudflare=False) == "104.16.0.1"
    assert client_ip(_request({}, peer="104.16.0.1"), trust_cloudflare=True) == "104.16.0.1"
    assert client_ip(_request({}, peer=None), trust_cloudflare=False) == ""


def test_client_ip_ignores_the_header_from_a_peer_outside_cloudflare() -> None:
    # Someone who reaches the origin directly can send the header; it must not count.
    request = _request({"CF-Connecting-IP": "203.0.113.7"}, peer="198.51.100.4")
    assert client_ip(request, trust_cloudflare=True) == "198.51.100.4"
    assert client_ip(_request({"CF-Connecting-IP": "203.0.113.7"}, peer=None), True) == ""


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("104.16.0.1", True),
        ("172.71.255.254", True),
        ("2606:4700::6810:84e5", True),
        ("172.15.255.255", False),
        ("10.0.1.5", False),
        ("2001:db8::1", False),
        ("testclient", False),
        ("", False),
    ],
)
def test_from_cloudflare_matches_the_published_ranges(host: str, expected: bool) -> None:
    assert from_cloudflare(host) is expected


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_rate_limiter_allows_a_burst_then_refills() -> None:
    clock = FakeClock()
    limiter = RateLimiter(capacity=3, period=60, clock=clock)
    assert [limiter.allow("a") for _ in range(4)] == [True, True, True, False]
    assert limiter.allow("b")  # keys are independent
    assert limiter.retry_after("a") == 21  # one token takes 20 s; rounded up
    clock.now += 20
    assert limiter.allow("a")
    assert not limiter.allow("a")


def test_rate_limiter_drops_full_buckets_when_the_table_grows() -> None:
    clock = FakeClock()
    limiter = RateLimiter(capacity=1, period=10, clock=clock)
    limiter.MAX_KEYS = 3
    for key in "abc":
        limiter.allow(key)
    clock.now += 11  # a, b, c have refilled
    limiter.allow("d")
    assert set(limiter._buckets) == {"d"}


def test_rate_limiter_table_stays_bounded_during_a_wide_flood() -> None:
    clock = FakeClock()
    limiter = RateLimiter(capacity=5, period=900, clock=clock)
    limiter.MAX_KEYS = 10
    for i in range(50):
        clock.now += 0.01  # nothing refills: every bucket is still in use
        limiter.allow(f"ip{i}")
    assert len(limiter._buckets) <= 10
    assert "ip49" in limiter._buckets  # the newest visitors are kept
