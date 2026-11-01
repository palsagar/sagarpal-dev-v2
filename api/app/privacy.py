"""Privacy-preserving visitor keys and bot filtering (API.md §4.1).

Raw IP addresses and user agents only ever exist in memory for the length of a
request. What is stored is an HMAC keyed by a secret that changes every UTC day,
so yesterday's keys cannot be linked to today's.
"""

import hashlib
import hmac
import ipaddress
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


# Cloudflare's published edge ranges (https://www.cloudflare.com/ips/, checked 1 Nov 2026).
# The list changes rarely; when it does, a request from a new range is treated as a
# direct visitor (its peer address is used), which is safe.
CLOUDFLARE_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "173.245.48.0/20",
        "103.21.244.0/22",
        "103.22.200.0/22",
        "103.31.4.0/22",
        "141.101.64.0/18",
        "108.162.192.0/18",
        "190.93.240.0/20",
        "188.114.96.0/20",
        "197.234.240.0/22",
        "198.41.128.0/17",
        "162.158.0.0/15",
        "104.16.0.0/13",
        "104.24.0.0/14",
        "172.64.0.0/13",
        "131.0.72.0/22",
        "2400:cb00::/32",
        "2606:4700::/32",
        "2803:f800::/32",
        "2405:b500::/32",
        "2405:8100::/32",
        "2a06:98c0::/29",
        "2c0f:f248::/32",
    )
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


def from_cloudflare(host: str) -> bool:
    """True when ``host`` is an address in one of Cloudflare's edge ranges.

    Examples
    --------
    .. code-block:: python

        from_cloudflare("104.16.0.1")  # True
        from_cloudflare("testclient")  # False: not an IP address
    """
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(address in network for network in CLOUDFLARE_NETWORKS)


def client_ip(request: Request, trust_cloudflare: bool) -> str:
    """Return the visitor's IP: ``CF-Connecting-IP`` when Cloudflare is trusted, else the peer.

    The header counts only when the peer itself is a Cloudflare edge address.
    Anyone who reaches the origin directly can send the header, so trusting it
    from any peer would let them pick their own IP and get around the login
    limit and the view dedupe. Behind Coolify's proxy, the peer is the address
    uvicorn's ``--proxy-headers`` took from ``X-Forwarded-For``; that needs
    ``FORWARDED_ALLOW_IPS`` set to the proxy's network (DEPLOYMENT.md).

    Examples
    --------
    .. code-block:: python

        client_ip(request, trust_cloudflare=True)
    """
    peer = request.client.host if request.client else ""
    if trust_cloudflare and from_cloudflare(peer):
        forwarded = request.headers.get("cf-connecting-ip", "").strip()
        if forwarded:
            return forwarded
    return peer
