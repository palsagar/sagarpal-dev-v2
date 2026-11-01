"""ORM models (API.md §2). The FTS table `posts_fts` is created by the migration only."""

from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

KINDS = ("book", "paper", "article")
STATUSES = ("reading", "finished", "queued")
NOTE_MAX = 280


class ReadingItem(Base):
    """One book, paper or article on the reading list."""

    __tablename__ = "reading_items"
    __table_args__ = (
        CheckConstraint("kind IN ('book','paper','article')", name="ck_reading_kind"),
        CheckConstraint("status IN ('reading','finished','queued')", name="ck_reading_status"),
        CheckConstraint(f"length(note) <= {NOTE_MAX}", name="ck_reading_note_length"),
        Index("ix_reading_status", "status", "deleted_at", "published"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    authors: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    year: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(Text)
    identifier: Mapped[str | None] = mapped_column(Text)
    cover_url: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, nullable=False)
    started_on: Mapped[date | None] = mapped_column(Date)
    finished_on: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    verb: Mapped[str | None] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)


class PostStat(Base):
    """Aggregate counters for one post; no per-visitor rows are kept."""

    __tablename__ = "post_stats"

    slug: Mapped[str] = mapped_column(Text, primary_key=True)
    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    useful: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class SeenKey(Base):
    """A short-lived dedupe key: HMAC of visitor, slug and action for one UTC day."""

    __tablename__ = "seen_keys"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
