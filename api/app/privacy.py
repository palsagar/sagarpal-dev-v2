"""Privacy-preserving visitor keys and bot filtering (API.md §4.1).

Raw IP addresses and user agents only ever exist in memory for the length of a
request. What is stored is an HMAC keyed by a secret that changes every UTC day,
so yesterday's keys cannot be linked to today's.
"""

import hashlib
import hmac
import re
from datetime import UTC, date, datetime, time, timedelta

from starlette.requests import Request

# Conservative: well-known crawler words, HTTP libraries and headless browsers.
_BOT_UA = re.compile(
    r"bot|crawl|spider|slurp|archiver|facebookexternalhit|embedly|preview|"
    r"headless|phantomjs|lighthouse|pagespeed|curl|wget|python-requests|python-httpx|"
    r"aiohttp|go-http-client|java/|okhttp|libwww|scrapy|feedfetcher|monitor|uptime",
    re.IGNORECASE,
)


def daily_secret(hash_secret: bytes, day: date) -> bytes:
    """Return ``HMAC_SHA256(HASH_SECRET, YYYY-MM-DD)``.

    Examples
    --------
    .. code-block:: python

        daily_secret(b"k" * 32, date(2026, 11, 1))
    """
    return hmac.new(hash_secret, day.isoformat().encode(), hashlib.sha256).digest()


def visitor_key(secret: bytes, ip: str, user_agent: str, slug: str, action: str) -> str:
    """Return the hex dedupe key for one visitor, post and action on the secret's day.

    Examples
    --------
    .. code-block:: python

        visitor_key(daily_secret(b"k" * 32, today), "203.0.113.9", "Firefox", "post", "view")
    """
    message = f"{ip}|{user_agent}|{slug}|{action}".encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()


def key_expiry(now: datetime) -> datetime:
    """Return tomorrow 00:00 UTC plus one hour, as a naive UTC datetime (the DB stores UTC).

    Examples
    --------
    .. code-block:: python

        key_expiry(datetime(2026, 11, 1, 15, tzinfo=UTC))  # 2026-11-02 01:00
    """
    tomorrow = now.astimezone(UTC).date() + timedelta(days=1)
    return datetime.combine(tomorrow, time(1, 0))


def utc_now() -> datetime:
    """Current time in UTC (one place for freezegun to control)."""
    return datetime.now(UTC)


def is_bot(user_agent: str) -> bool:
    """True for an empty user agent or one that looks like a crawler or script.

    Examples
    --------
    .. code-block:: python

        is_bot("Googlebot/2.1")  # True
    """
    return not user_agent.strip() or bool(_BOT_UA.search(user_agent))


def client_ip(request: Request, trust_cloudflare: bool) -> str:
    """Return the visitor's IP: ``CF-Connecting-IP`` when Cloudflare is trusted, else the peer.

    Behind a proxy, uvicorn's ``--proxy-headers`` has already rewritten the peer
    address from ``X-Forwarded-For``.

    Examples
    --------
    .. code-block:: python

        client_ip(request, trust_cloudflare=True)
    """
    if trust_cloudflare:
        forwarded = request.headers.get("cf-connecting-ip", "").strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else ""
