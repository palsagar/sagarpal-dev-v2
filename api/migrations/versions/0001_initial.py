"""Initial schema: reading list, post stats, dedupe keys, search index (API.md §2).

Revision ID: 0001
Revises:
Create Date: 2026-11-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "reading_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("authors", sa.Text(), nullable=False, server_default=""),
        sa.Column("year", sa.Integer()),
        sa.Column("source", sa.Text()),
        sa.Column("url", sa.Text()),
        sa.Column("identifier", sa.Text()),
        sa.Column("cover_url", sa.Text()),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_on", sa.Date()),
        sa.Column("finished_on", sa.Date()),
        sa.Column("note", sa.Text()),
        sa.Column("verb", sa.Text()),
        sa.Column("published", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column(
            "created_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()
        ),
        sa.Column(
            "updated_at", sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()
        ),
        sa.Column("deleted_at", sa.DateTime()),
        sa.CheckConstraint("kind IN ('book','paper','article')", name="ck_reading_kind"),
        sa.CheckConstraint("status IN ('reading','finished','queued')", name="ck_reading_status"),
        sa.CheckConstraint("length(note) <= 280", name="ck_reading_note_length"),
    )
    op.create_index("ix_reading_status", "reading_items", ["status", "deleted_at", "published"])
    op.create_table(
        "post_stats",
        sa.Column("slug", sa.Text(), primary_key=True),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("useful", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "seen_keys",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    # Search index, rebuilt from the content manifest; never authoritative.
    op.execute(
        "CREATE VIRTUAL TABLE posts_fts USING fts5("
        "slug UNINDEXED, title, dek, tags, body, tokenize='porter unicode61')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP TABLE posts_fts")
    op.drop_table("seen_keys")
    op.drop_table("post_stats")
    op.drop_index("ix_reading_status", table_name="reading_items")
    op.drop_table("reading_items")
