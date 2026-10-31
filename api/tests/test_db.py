from pathlib import Path

from sqlalchemy import text

from app.db import create_db_engine, create_session_factory


def test_new_connection_has_pragmas_and_parent_dir_is_created(tmp_path: Path) -> None:
    db_path = tmp_path / "nested" / "dir" / "site.db"
    assert not db_path.parent.exists()

    engine = create_db_engine(f"sqlite:///{db_path}")
    try:
        assert db_path.parent.is_dir()
        with engine.connect() as conn:
            assert conn.execute(text("PRAGMA journal_mode")).scalar() == "wal"
            assert conn.execute(text("PRAGMA synchronous")).scalar() == 1  # NORMAL
            assert conn.execute(text("PRAGMA foreign_keys")).scalar() == 1
            assert conn.execute(text("PRAGMA busy_timeout")).scalar() == 5000
    finally:
        engine.dispose()


def test_session_factory_uses_engine(tmp_path: Path) -> None:
    engine = create_db_engine(f"sqlite:///{tmp_path / 'site.db'}")
    try:
        with create_session_factory(engine)() as session:
            assert session.execute(text("SELECT 1")).scalar() == 1
    finally:
        engine.dispose()
