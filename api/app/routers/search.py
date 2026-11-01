"""Full-text search over published posts (API.md §4): FTS5, bm25 ranking, highlighted snippets."""

import html
import re

from fastapi import APIRouter, Query, Request, Response
from pydantic import BaseModel
from sqlalchemy import text

from app.deps import Ctx, DbSession, enforce_limit

router = APIRouter(prefix="/api", tags=["search"])

MAX_LIMIT = 50
MAX_TERMS = 10
# Control characters cannot occur in the indexed text, so they mark matches safely
# until the snippet has been HTML-escaped.
_OPEN, _CLOSE = "\x02", "\x03"
_TERM = re.compile(r"\w+", re.UNICODE)

_QUERY = text(
    "SELECT slug, snippet(posts_fts, -1, char(2), char(3), '…', 16) AS snippet "
    "FROM posts_fts WHERE posts_fts MATCH :match "
    # Weights per column: slug (unindexed), title, dek, tags, body.
    "ORDER BY bm25(posts_fts, 0.0, 10.0, 5.0, 3.0, 1.0) LIMIT :limit"
)


class SearchResult(BaseModel):
    slug: str
    url: str
    title: str
    dek: str
    date: str
    snippet: str


class SearchOut(BaseModel):
    results: list[SearchResult]


def fts_query(q: str) -> str | None:
    """Turn free text into a safe FTS5 query: every word must match, the last as a prefix.

    Quoting each word means FTS5 operators typed by a visitor (``OR``, ``NEAR``,
    ``-``, ``:``) are treated as plain words, never as syntax.

    Examples
    --------
    .. code-block:: python

        fts_query("gray scott wg")  # '"gray" "scott" "wg"*'
    """
    terms = _TERM.findall(q)[:MAX_TERMS]
    if not terms:
        return None
    return " ".join(f'"{term}"' for term in terms) + "*"


def _mark(snippet: str) -> str:
    return html.escape(snippet).replace(_OPEN, "<mark>").replace(_CLOSE, "</mark>")


@router.get("/search")
def search(
    request: Request,
    response: Response,
    ctx: Ctx,
    session: DbSession,
    q: str = "",
    limit: int = Query(10, ge=1),
) -> SearchOut:
    """Search titles, deks, tags and body text; at most 50 results."""
    enforce_limit(ctx.search_limit, ctx.hashed_ip(request))
    response.headers["Cache-Control"] = "public, max-age=60"
    match = fts_query(q[:200])
    if match is None:
        return SearchOut(results=[])
    ctx.manifest.current()  # reload first when due, so the index matches the manifest
    rows = session.execute(_QUERY, {"match": match, "limit": min(limit, MAX_LIMIT)}).all()
    results = [
        SearchResult(
            slug=post.slug,
            url=post.url,
            title=post.title,
            dek=post.dek,
            date=post.date.isoformat(),
            snippet=_mark(snippet),
        )
        for slug, snippet in rows
        if (post := ctx.manifest.get(slug)) is not None
    ]
    return SearchOut(results=results)
