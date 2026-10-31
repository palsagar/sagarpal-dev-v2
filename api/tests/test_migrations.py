from pathlib import Path

from alembic import command
from alembic.config import Config

from app.config import API_DIR


def test_upgrade_head_on_empty_database(isolated_settings: Path) -> None:
    db_path = isolated_settings
    assert not db_path.exists()

    command.upgrade(Config(str(API_DIR / "alembic.ini")), "head")

    assert db_path.is_file()
