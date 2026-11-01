import sqlite3
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.tools import backup as tool


def _make_db(path: Path, value: str) -> None:
    with closing(sqlite3.connect(path)) as db:
        db.execute("CREATE TABLE IF NOT EXISTS t (v TEXT)")
        db.execute("DELETE FROM t")
        db.execute("INSERT INTO t VALUES (?)", (value,))
        db.commit()


def _read(path: Path) -> str:
    with closing(sqlite3.connect(path)) as db:
        value: str = db.execute("SELECT v FROM t").fetchone()[0]
    return value


def test_backup_copies_the_database_and_keeps_the_newest(tmp_path: Path) -> None:
    database = tmp_path / "site.db"
    backups = tmp_path / "backups"
    _make_db(database, "first")
    for day in range(1, 5):
        tool.backup(database, backups, f"2026-11-0{day}", keep=3)
    names = sorted(p.name for p in backups.iterdir())
    assert names == ["site-2026-11-02.db", "site-2026-11-03.db", "site-2026-11-04.db"]

    _make_db(database, "second")
    target = tool.backup(database, backups, "2026-11-04", keep=3)  # same day: replaced
    assert _read(target) == "second"
    assert len(list(backups.iterdir())) == 3


def test_main_backs_up_the_configured_database(
    client: TestClient, isolated_settings: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    # The client fixture has run the migrations, so the database exists.
    assert tool.main() == 0
    written = Path(capsys.readouterr().out.strip())
    assert written.parent == isolated_settings.parent / "backups"
    with closing(sqlite3.connect(written)) as db:
        assert db.execute("SELECT count(*) FROM reading_items").fetchone() == (0,)


def test_main_fails_without_a_database(capsys: pytest.CaptureFixture[str]) -> None:
    assert tool.main() == 1
    assert "No database" in capsys.readouterr().err
