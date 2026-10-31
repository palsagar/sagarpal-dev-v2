"""Database engine, PRAGMAs, declarative base and session factory (SQLite)."""

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
