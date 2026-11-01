"""RSS 2.0 feed of published posts at /feed.xml (API.md §7)."""

from datetime import UTC, date, datetime, time
from email.utils import format_datetime

from fastapi import APIRouter, Response

from app.deps import Ctx
from app.templating import environment

router = APIRouter(tags=["feed"])

FEED_SIZE = 20


def rfc822(day: date) -> str:
    """Midnight UTC of ``day`` in RFC 822 form, as RSS wants.

    Examples
    --------
    .. code-block:: python

        rfc822(date(2026, 11, 12))  # 'Thu, 12 Nov 2026 00:00:00 +0000'
    """
    return format_datetime(datetime.combine(day, time(0), tzinfo=UTC))


@router.api_route("/feed.xml", methods=["GET", "HEAD"])
def feed(ctx: Ctx) -> Response:
    """The latest 20 posts, newest first."""
    manifest = ctx.manifest.current()
    site_url = ctx.settings.site_url
    posts = sorted(manifest.posts, key=lambda p: (p.date, p.slug), reverse=True)[:FEED_SIZE]
    items = [
        {
            "title": post.title,
            "link": f"{site_url}{post.url}",
            "pub_date": rfc822(post.date),
            "dek": post.dek,
            "tags": post.tags,
        }
        for post in posts
    ]
    generated = manifest.generated_at
    body = environment.get_template("feed.xml.j2").render(
        site_url=site_url,
        items=items,
        last_build=format_datetime(generated.astimezone(UTC)) if generated else None,
    )
    return Response(
        body,
        media_type="application/rss+xml; charset=utf-8",
        headers={"Cache-Control": "public, max-age=600"},
    )
