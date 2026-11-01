"""Application settings, read from environment variables and api/.env (API.md §8)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import make_url

API_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = API_DIR.parent


class Settings(BaseSettings):
    """Runtime configuration.

    The secrets have no defaults: the app refuses to start without them, so a
    deployment can never run with a guessable key.

    Examples
    --------
    .. code-block:: python

        settings = Settings()  # reads the environment and api/.env
        settings.site_url
    """

    model_config = SettingsConfigDict(
        env_file=API_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    site_url: str = "http://localhost:4321"
    static_dir: Path = REPO_ROOT / "web" / "dist"
    database_url: str = f"sqlite:///{REPO_ROOT / '.data' / 'site.db'}"
    log_level: str = "info"

    hash_secret: SecretStr = Field(min_length=32)
    session_secret: SecretStr = Field(min_length=32)
    admin_password_hash: SecretStr = Field(min_length=1)
    admin_api_token: SecretStr | None = None

    trust_cloudflare: bool = False
    # true on staging: every response carries X-Robots-Tag so search engines skip the site.
    noindex: bool = False
    umami_domain: str | None = None
    umami_id: str | None = None
    # Contact address for the User-Agent of metadata lookups (Crossref etiquette).
    contact_email: str | None = None

    @field_validator("site_url", "umami_domain")
    @classmethod
    def _strip_trailing_slash(cls, value: str | None) -> str | None:
        return value.rstrip("/") if value else value

    @field_validator("umami_domain", "umami_id", "contact_email", "admin_api_token", mode="before")
    @classmethod
    def _empty_is_unset(cls, value: object) -> object:
        # Coolify and .env files often carry `NAME=` for "unset".
        return None if value == "" else value

    @property
    def data_dir(self) -> Path:
        """Directory that holds the SQLite file; the OG cache lives next to it."""
        database = make_url(self.database_url).database
        if not database or database == ":memory:":
            return REPO_ROOT / ".data"
        return Path(database).resolve().parent


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings, read once."""
    return Settings()
