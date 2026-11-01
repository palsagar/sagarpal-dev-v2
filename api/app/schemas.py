"""Pydantic I/O models for the reading list (API.md §4, §5)."""

from datetime import date, datetime
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import NOTE_MAX, ReadingItem

Kind = Literal["book", "paper", "article"]
Status = Literal["reading", "finished", "queued"]

_MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)


class ReadingItemIn(BaseModel):
    """A new or edited reading item. Empty strings mean "not set"."""

    model_config = ConfigDict(str_strip_whitespace=True)

    kind: Kind
    title: str = Field(min_length=1, max_length=500)
    authors: str = Field(default="", max_length=500)
    year: int | None = Field(default=None, ge=0, le=3000)
    source: str | None = Field(default=None, max_length=300)
    url: str | None = Field(default=None, max_length=2000)
    identifier: str | None = Field(default=None, max_length=200)
    cover_url: str | None = Field(default=None, max_length=2000)
    status: Status
    started_on: date | None = None
    finished_on: date | None = None
    note: str | None = Field(default=None, max_length=NOTE_MAX)
    verb: str | None = Field(default=None, max_length=40)
    published: bool = True

    @field_validator(
        "year",
        "source",
        "url",
        "identifier",
        "cover_url",
        "started_on",
        "finished_on",
        "note",
        "verb",
        mode="before",
    )
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator("url", "cover_url")
    @classmethod
    def _http_only(cls, value: str | None) -> str | None:
        # The reading page renders these as links and images: no javascript: or data: URLs.
        if value is None:
            return None
        parts = urlsplit(value)
        if parts.scheme not in ("http", "https") or not parts.netloc:
            raise ValueError("must be an http(s) URL")
        return value


class ReadingItemPatch(BaseModel):
    """Partial update for the JSON admin API; merged into the item, then validated as a whole."""

    model_config = ConfigDict(extra="forbid")

    kind: Kind | None = None
    title: str | None = None
    authors: str | None = None
    year: int | None = None
    source: str | None = None
    url: str | None = None
    identifier: str | None = None
    cover_url: str | None = None
    status: Status | None = None
    started_on: date | None = None
    finished_on: date | None = None
    note: str | None = None
    verb: str | None = None
    published: bool | None = None


def reading_label(
    kind: str,
    status: str,
    verb: str | None,
    started_on: date | None,
    finished_on: date | None,
    created_at: datetime | None,
) -> str:
    """Display label, sentence case: "Book, started October 2026".

    ``verb`` overrides the status's default word ("started", "finished", "added").

    Examples
    --------
    .. code-block:: python

        reading_label("article", "finished", "reread", None, date(2026, 10, 3), None)
        # 'Article, reread October 2026'
    """
    default_verb, when = {
        "reading": ("started", started_on),
        "finished": ("finished", finished_on),
        "queued": ("added", created_at.date() if created_at else None),
    }[status]
    noun = kind.capitalize()
    if when is None:
        return noun
    return f"{noun}, {verb or default_verb} {_MONTHS[when.month - 1]} {when.year}"


class ReadingItemOut(BaseModel):
    """Public view of a reading item."""

    id: int
    kind: Kind
    title: str
    authors: str
    year: int | None
    source: str | None
    url: str | None
    identifier: str | None
    cover_url: str | None
    status: Status
    started_on: date | None
    finished_on: date | None
    note: str | None
    label: str

    @classmethod
    def from_item(cls, item: ReadingItem) -> Self:
        """Build from an ORM row, computing ``label``."""
        return cls.model_validate(
            {
                **{name: getattr(item, name) for name in cls.model_fields if name != "label"},
                "label": reading_label(
                    item.kind,
                    item.status,
                    item.verb,
                    item.started_on,
                    item.finished_on,
                    item.created_at,
                ),
            }
        )


class ReadingOut(BaseModel):
    items: list[ReadingItemOut]
    counts: dict[str, int]
