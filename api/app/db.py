"""Database engine, PRAGMAs, declarative base and session factory (SQLite)."""

import fcntl
from pathlib import Path
from sqlite3 import Connection as SQLiteConnection
from typing import Any

from sqlalchemy import Engine, create_engine, event, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

SQLITE_PRAGMAS = (
    "PRAGMA journal_mode=WAL",
    "PRAGMA synchronous=NORMAL",
    "PRAGMA foreign_keys=ON",
    "PRAGMA busy_timeout=5000",
)


class Base(DeclarativeBase):
    pass


def _set_sqlite_pragmas(dbapi_connection: SQLiteConnection, _record: Any) -> None:
    cursor = dbapi_connection.cursor()
    try:
        for pragma in SQLITE_PRAGMAS:
            cursor.execute(pragma)
    finally:
        cursor.close()


def create_db_engine(database_url: str) -> Engine:
    """Create an engine; make the DB file's directory and set PRAGMAs on every connection."""
    url = make_url(database_url)
    if url.database and url.database != ":memory:":
        Path(url.database).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url)
    event.listen(engine, "connect", _set_sqlite_pragmas)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


def assert_fts5(engine: Engine) -> None:
    """Fail at start-up when this SQLite build lacks FTS5, which search needs.

    Examples
    --------
    .. code-block:: python

        assert_fts5(create_db_engine("sqlite://"))
    """
    with engine.connect() as conn:
        options = {row[0] for row in conn.exec_driver_sql("PRAGMA compile_options")}
    if "ENABLE_FTS5" not in options:
        raise RuntimeError("This SQLite build has no FTS5; search cannot work.")


def run_migrations(database_url: str, lock_dir: Path) -> None:
    """Run ``alembic upgrade head``, holding a file lock so two processes never race.

    Parameters
    ----------
    database_url
        SQLAlchemy URL of the database to migrate.
    lock_dir
        Directory for the ``.migrate.lock`` file (the data directory).

    Examples
    --------
    .. code-block:: python

        run_migrations("sqlite:////data/site.db", Path("/data"))
    """
    from alembic import command
    from alembic.config import Config

    from app.config import API_DIR

    config = Config(str(API_DIR / "alembic.ini"))
    # ConfigParser treats "%" as interpolation, so escape it.
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))
    config.attributes["configure_logger"] = False
    lock_dir.mkdir(parents=True, exist_ok=True)
    with open(lock_dir / ".migrate.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            command.upgrade(config, "head")
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
