"""Per-app state and the FastAPI dependencies that hand it to routes."""

import hashlib
import hmac
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.manifest import ManifestStore
from app.privacy import client_ip, daily_secret, utc_now
from app.ratelimit import RateLimiter


@dataclass
class AppContext:
    """Everything a request needs, built once per app in ``create_app``.

    Examples
    --------
    .. code-block:: python

        ctx = request.app.state.ctx
        ctx.manifest.get("my-post")
    """

    settings: Settings
    engine: Engine
    sessions: sessionmaker[Session]
    manifest: ManifestStore
    stats_limit: RateLimiter = field(default_factory=lambda: RateLimiter(30, 60))
    search_limit: RateLimiter = field(default_factory=lambda: RateLimiter(60, 60))
    login_limit: RateLimiter = field(default_factory=lambda: RateLimiter(5, 15 * 60))
    last_purge: datetime | None = None

    def secret_for_today(self) -> bytes:
        """Today's (UTC) visitor HMAC key."""
        return daily_secret(self.settings.hash_secret.get_secret_value().encode(), utc_now().date())

    def hashed_ip(self, request: Request) -> str:
        """The visitor's IP, HMAC-ed with today's key: the rate-limit key."""
        ip = client_ip(request, self.settings.trust_cloudflare)
        return hmac.new(self.secret_for_today(), ip.encode(), hashlib.sha256).hexdigest()


def get_ctx(request: Request) -> AppContext:
    """Dependency: the app's context."""
    ctx: AppContext = request.app.state.ctx
    return ctx


Ctx = Annotated[AppContext, Depends(get_ctx)]


def get_session(ctx: Ctx) -> Iterator[Session]:
    """Dependency: one SQLAlchemy session per request."""
    with ctx.sessions() as session:
        yield session


DbSession = Annotated[Session, Depends(get_session)]


def enforce_limit(limiter: RateLimiter, key: str) -> None:
    """Raise 429 with ``Retry-After`` when ``key`` has used up its tokens."""
    if not limiter.allow(key):
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": str(limiter.retry_after(key))},
        )
