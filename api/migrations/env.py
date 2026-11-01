"""Alembic environment. The database URL comes from the app settings, not alembic.ini."""

from logging.config import fileConfig

from alembic import context

import app.models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import get_settings
from app.db import Base, create_db_engine

config = context.config

# The app runs migrations in-process with its own logging; only the CLI configures it here.
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    # The app passes its URL explicitly; the alembic CLI falls back to the settings.
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def _include_object(
    obj: object, name: str | None, type_: str, reflected: bool, compare_to: object
) -> bool:
    # posts_fts and its shadow tables are created by raw SQL, not by the ORM metadata.
    # Without this filter, autogenerate would propose dropping them.
    return not (type_ == "table" and name is not None and name.startswith("posts_fts"))


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a database connection."""
    context.configure(
        url=_database_url(),
        include_object=_include_object,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the database, with the app's PRAGMAs applied."""
    engine = create_db_engine(_database_url())
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                include_object=_include_object,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
