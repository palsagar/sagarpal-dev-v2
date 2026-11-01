"""Open Graph images: /og/default.png and /og/{slug}.png (API.md §4, §7)."""

import hashlib

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.deps import Ctx
from app.services.og_image import DEFAULT_DEK, DEFAULT_TITLE, cached_card

router = APIRouter(prefix="/og", tags=["og"])

HEADERS = {"Cache-Control": "public, max-age=86400"}


def _file_name(slug: str) -> str:
    # A hash of the slug: one safe path segment, and two slugs can never share a name.
    return "post-" + hashlib.sha256(slug.encode()).hexdigest()[:16]


@router.api_route("/{name}.png", methods=["GET", "HEAD"])
def og_image(name: str, ctx: Ctx) -> FileResponse:
    """The default card, or a post's card; 404 for slugs that are not published."""
    cache_dir = ctx.settings.data_dir / "og-cache"
    if name == "default":
        title, dek, file_name = DEFAULT_TITLE, DEFAULT_DEK, "default"
    else:
        post = ctx.manifest.get(name)
        if post is None:
            raise HTTPException(status_code=404, detail="Unknown post")
        title, dek, file_name = post.title, post.dek, _file_name(post.slug)
    # A plain `def` route runs in the thread pool, so a manifest reload or the first
    # drawing of a card (~100 ms) never blocks the event loop.
    path = cached_card(cache_dir, file_name, title, dek)
    return FileResponse(path, media_type="image/png", headers=HEADERS)
