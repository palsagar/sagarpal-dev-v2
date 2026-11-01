import logging
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy import Engine, text

from app.config import get_settings
from app.db import create_db_engine, run_migrations
from app.manifest import Manifest, ManifestStore
from tests.conftest import post, write_manifest


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def engine(isolated_settings: Path) -> Iterator[Engine]:
    run_migrations(get_settings().database_url, isolated_settings.parent)
    engine = create_db_engine(get_settings().database_url)
    yield engine
    engine.dispose()


def _indexed(engine: Engine) -> list[str]:
    with engine.connect() as conn:
        return sorted(row[0] for row in conn.execute(text("SELECT slug FROM posts_fts")))


def test_missing_file_means_no_posts(tmp_path: Path, engine: Engine) -> None:
    store = ManifestStore(tmp_path / "nope.json", engine)
    store.load()
    assert store.current().posts == []
    assert store.get("anything") is None


def test_load_validates_and_indexes(tmp_path: Path, engine: Engine) -> None:
    path = write_manifest(tmp_path, [post("alpha", readingMinutes=14, tags=["GPU", "HPC"])])
    store = ManifestStore(path, engine)
    store.load()

    alpha = store.get("alpha")
    assert alpha is not None
    assert alpha.reading_minutes == 14
    assert alpha.date.isoformat() == "2026-11-12"
    assert _indexed(engine) == ["alpha"]


def test_reload_happens_only_after_the_interval_and_on_change(
    tmp_path: Path, engine: Engine
) -> None:
    clock = FakeClock()
    path = write_manifest(tmp_path, [post("alpha")])
    store = ManifestStore(path, engine, check_interval=60, clock=clock)
    store.load()

    write_manifest(tmp_path, [post("alpha"), post("beta")])
    os.utime(path, ns=(10**18, 10**18))  # make sure the mtime differs
    clock.now += 30
    assert [p.slug for p in store.current().posts] == ["alpha"]  # too soon to look

    clock.now += 31
    assert [p.slug for p in store.current().posts] == ["alpha", "beta"]
    assert _indexed(engine) == ["alpha", "beta"]


def test_unchanged_file_is_not_reindexed(tmp_path: Path, engine: Engine) -> None:
    path = write_manifest(tmp_path, [post("alpha")])
    store = ManifestStore(path, engine)
    store.load()
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM posts_fts"))

    store.load()  # same mtime and size: nothing to do

    assert _indexed(engine) == []


def test_invalid_file_keeps_the_previous_manifest(
    tmp_path: Path, engine: Engine, caplog: pytest.LogCaptureFixture
) -> None:
    path = write_manifest(tmp_path, [post("alpha")])
    store = ManifestStore(path, engine)
    store.load()

    path.write_text('{"posts": [{"slug": "broken"}]}')
    with caplog.at_level(logging.ERROR):
        store.load()

    assert [p.slug for p in store.current().posts] == ["alpha"]
    assert _indexed(engine) == ["alpha"]
    assert "manifest invalid" in caplog.text


def test_removed_file_empties_the_index(tmp_path: Path, engine: Engine) -> None:
    path = write_manifest(tmp_path, [post("alpha")])
    store = ManifestStore(path, engine)
    store.load()
    path.unlink()
    store.load()
    assert store.current() == Manifest.empty()
    assert _indexed(engine) == []
