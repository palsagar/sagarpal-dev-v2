"""Application settings, read from environment variables and api/.env."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = API_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=API_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    site_url: str = "http://localhost:4321"
    static_dir: Path = REPO_ROOT / "web" / "dist"
    database_url: str = f"sqlite:///{REPO_ROOT / '.data' / 'site.db'}"
    log_level: str = "info"


@lru_cache
def get_settings() -> Settings:
    return Settings()
