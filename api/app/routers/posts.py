"""Per-post views and "Useful" reactions (API.md §4, §4.1)."""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from app.deps import AppContext, Ctx, DbSession, enforce_limit
from app.models import PostStat, SeenKey
from app.privacy import client_ip, is_bot, key_expiry, utc_now, visitor_key

router = APIRouter(prefix="/api/posts", tags=["posts"])

NO_STORE = {"Cache-Control": "no-store"}
PURGE_EVERY = timedelta(hours=1)


class StatsOut(BaseModel):
    views: int
    useful: int
    reacted: bool


class UsefulOut(BaseModel):
    useful: int
    reacted: bool


def _require_post(ctx: AppContext, slug: str) -> None:
    # Only manifest slugs get rows, so nobody can create arbitrary ones.
    if ctx.manifest.get(slug) is None:
        raise HTTPException(status_code=404, detail="Unknown post")


def _key(ctx: AppContext, request: Request, slug: str, action: str) -> str:
    ip = client_ip(request, ctx.settings.trust_cloudflare)
    user_agent = request.headers.get("user-agent", "")
    return visitor_key(ctx.secret_for_today(), ip, user_agent, slug, action)


def _counts(session: Session, slug: str) -> PostStat:
    # populate_existing: the counters change through Core statements, not the ORM.
    row = session.get(PostStat, slug, populate_existing=True)
    return row or PostStat(slug=slug, views=0, useful=0)


def _purge_if_due(ctx: AppContext, session: Session, now: datetime) -> None:
    # Expired keys are deleted on writes, at most once an hour.
    if ctx.last_purge is not None and now - ctx.last_purge < PURGE_EVERY:
        return
    session.execute(delete(SeenKey).where(SeenKey.expires_at <= now.replace(tzinfo=None)))
    ctx.last_purge = now


def _record(ctx: AppContext, session: Session, request: Request, slug: str, action: str) -> None:
    """Count ``action`` for ``slug`` once per visitor per UTC day; bots are ignored."""
    if is_bot(request.headers.get("user-agent", "")):
        return
    now = utc_now()
    _purge_if_due(ctx, session, now)
    # RETURNING yields a row only when the key is new, i.e. the first time today.
    inserted = session.scalar(
        insert(SeenKey)
        .values(key=_key(ctx, request, slug, action), expires_at=key_expiry(now))
        .on_conflict_do_nothing()
        .returning(SeenKey.key)
    )
    if inserted is not None:
        column = PostStat.views if action == "view" else PostStat.useful
        session.execute(
            insert(PostStat)
            .values(slug=slug, views=int(action == "view"), useful=int(action == "useful"))
            .on_conflict_do_update(index_elements=[PostStat.slug], set_={column: column + 1})
        )
    session.commit()


@router.get("/{slug}/stats")
def stats(
    slug: str, request: Request, response: Response, ctx: Ctx, session: DbSession
) -> StatsOut:
    """Counts for one post, and whether this visitor already found it useful today."""
    _require_post(ctx, slug)
    response.headers.update(NO_STORE)
    row = _counts(session, slug)
    now = utc_now().replace(tzinfo=None)
    reacted = (
        session.scalar(
            select(SeenKey.key).where(
                SeenKey.key == _key(ctx, request, slug, "useful"), SeenKey.expires_at > now
            )
        )
        is not None
    )
    return StatsOut(views=row.views, useful=row.useful, reacted=reacted)


@router.post("/{slug}/view", status_code=204)
def view(slug: str, request: Request, ctx: Ctx, session: DbSession) -> Response:
    """Count a view (deduplicated per visitor and day)."""
    _require_post(ctx, slug)
    enforce_limit(ctx.stats_limit, ctx.hashed_ip(request))
    _record(ctx, session, request, slug, "view")
    return Response(status_code=204, headers=NO_STORE)


@router.post("/{slug}/useful")
def useful(
    slug: str, request: Request, response: Response, ctx: Ctx, session: DbSession
) -> UsefulOut:
    """Count a Useful reaction (one per visitor and day) and return the new total."""
    _require_post(ctx, slug)
    enforce_limit(ctx.stats_limit, ctx.hashed_ip(request))
    _record(ctx, session, request, slug, "useful")
    response.headers.update(NO_STORE)
    return UsefulOut(useful=_counts(session, slug).useful, reacted=True)
