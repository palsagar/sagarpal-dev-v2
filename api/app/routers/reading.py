"""Public reading list (API.md §4)."""

from fastapi import APIRouter, Response
from sqlalchemy import ColumnElement, Select, case, func, select

from app.deps import DbSession
from app.models import KINDS, ReadingItem
from app.schemas import Kind, ReadingItemOut, ReadingOut, Status

router = APIRouter(prefix="/api", tags=["reading"])

# reading, then finished, then queued; inside each, newest by that status's own date.
_STATUS_ORDER = case(
    (ReadingItem.status == "reading", 0), (ReadingItem.status == "finished", 1), else_=2
)
_STATUS_DATE = case(
    (ReadingItem.status == "reading", ReadingItem.started_on),
    (ReadingItem.status == "finished", ReadingItem.finished_on),
    else_=ReadingItem.created_at,
)


def visible() -> list[ColumnElement[bool]]:
    """Filters for items the public may see: published and not deleted."""
    return [ReadingItem.published.is_(True), ReadingItem.deleted_at.is_(None)]


def ordered(query: Select[ReadingItem]) -> Select[ReadingItem]:
    """Apply the display order of API.md §4 to a reading-item query."""
    return query.order_by(_STATUS_ORDER, _STATUS_DATE.desc().nulls_last(), ReadingItem.id.desc())


@router.get("/reading")
def reading(
    response: Response, session: DbSession, status: Status | None = None, kind: Kind | None = None
) -> ReadingOut:
    """Published items, optionally filtered; ``counts`` ignore ``kind`` so filters can show them."""
    response.headers["Cache-Control"] = "no-store"
    filters = visible()
    if status is not None:
        filters.append(ReadingItem.status == status)
    by_kind = dict(
        session.execute(
            select(ReadingItem.kind, func.count()).where(*filters).group_by(ReadingItem.kind)
        ).all()
    )
    if kind is not None:
        filters.append(ReadingItem.kind == kind)
    items = session.scalars(ordered(select(ReadingItem).where(*filters))).all()
    counts = {"all": sum(by_kind.values()), **{k: by_kind.get(k, 0) for k in KINDS}}
    return ReadingOut(items=[ReadingItemOut.from_item(item) for item in items], counts=counts)
