from collections.abc import Iterator
from pathlib import Path

import pytest

from app.config import get_settings


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    """Point every setting at tmp_path so tests never touch the real .data/ or api/.env values.

    Environment variables take precedence over api/.env, so setting all of them here
    makes a developer's .env irrelevant. Yields the test database path.
    """
    db_path = tmp_path / "data" / "site.db"
    monkeypatch.setenv("SITE_URL", "http://testserver")
    monkeypatch.setenv("STATIC_DIR", str(tmp_path / "dist"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("LOG_LEVEL", "info")
    get_settings.cache_clear()
    yield db_path
    get_settings.cache_clear()
