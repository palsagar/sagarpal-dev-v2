from pathlib import Path
from unittest.mock import MagicMock

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from app.config import API_DIR, get_settings
from app.db import assert_fts5, create_db_engine, run_migrations
from app.main import create_app


def _tables(db_path: Path) -> set[str]:
    engine = create_db_engine(f"sqlite:///{db_path}")
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_upgrade_head_on_empty_database(isolated_settings: Path) -> None:
    db_path = isolated_settings
    assert not db_path.exists()

    command.upgrade(Config(str(API_DIR / "alembic.ini")), "head")

    tables = _tables(db_path)
    assert {"reading_items", "post_stats", "seen_keys", "posts_fts", "alembic_version"} <= tables


def test_downgrade_to_base_removes_every_table(isolated_settings: Path) -> None:
    config = Config(str(API_DIR / "alembic.ini"))
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    assert _tables(isolated_settings) == {"alembic_version"}


def test_run_migrations_is_idempotent_and_uses_the_given_url(tmp_path: Path) -> None:
    db_path = tmp_path / "other" / "site.db"
    run_migrations(f"sqlite:///{db_path}", tmp_path / "other")
    run_migrations(f"sqlite:///{db_path}", tmp_path / "other")

    assert "reading_items" in _tables(db_path)
    assert (tmp_path / "other" / ".migrate.lock").exists()


def test_app_start_migrates_an_empty_database(isolated_settings: Path) -> None:
    with TestClient(create_app()) as client:
        assert client.get("/api/health").json()["posts"] == 0
    engine = create_db_engine(get_settings().database_url)
    try:
        with engine.connect() as conn:
            assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar() == "0001"
    finally:
        engine.dispose()


def test_reading_constraints_hold_in_the_database(isolated_settings: Path) -> None:
    run_migrations(get_settings().database_url, isolated_settings.parent)
    engine = create_db_engine(get_settings().database_url)
    try:
        with pytest.raises(Exception, match="CHECK constraint"), engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO reading_items (kind, title, status) VALUES ('film', 't', 'queued')"
                )
            )
    finally:
        engine.dispose()


def test_assert_fts5_accepts_this_build_and_rejects_one_without_it() -> None:
    engine = create_db_engine("sqlite://")
    assert_fts5(engine)  # does not raise

    fake = MagicMock()
    fake.connect.return_value.__enter__.return_value.exec_driver_sql.return_value = [
        ("THREADSAFE=1",)
    ]
    with pytest.raises(RuntimeError, match="FTS5"):
        assert_fts5(fake)
