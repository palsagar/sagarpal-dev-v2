"""Settings, health, logging and the password tool."""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import OperationalError

from app.auth import verify_password
from app.config import REPO_ROOT, Settings
from app.log import JsonFormatter, configure_logging
from app.tools import hash_password as tool
from tests.conftest import CLOUDFLARE_PEER, client_from


def test_health_reports_posts(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.json() == {"status": "ok", "posts": 2, "via_cloudflare": False}
    assert response.headers["cache-control"] == "no-store"


def test_health_says_when_the_request_came_through_cloudflare(client: TestClient) -> None:
    response = client_from(client, CLOUDFLARE_PEER).get("/api/health")
    assert response.json()["via_cloudflare"] is True


def test_health_is_503_when_the_database_fails(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken() -> None:
        raise OperationalError("SELECT 1", {}, Exception("disk I/O error"))

    monkeypatch.setattr(client.app.state.ctx.engine, "connect", broken)  # type: ignore[attr-defined]
    response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "error"}


def test_secrets_are_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("HASH_SECRET")
    with pytest.raises(ValidationError, match="hash_secret"):
        Settings(_env_file=None)
    monkeypatch.setenv("HASH_SECRET", "too short")
    with pytest.raises(ValidationError, match="at least 32"):
        Settings(_env_file=None)


def test_settings_normalise_values(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SITE_URL", "https://sagar-pal.dev/")
    monkeypatch.setenv("UMAMI_DOMAIN", "https://analytics.example/")
    monkeypatch.setenv("UMAMI_ID", "")
    monkeypatch.setenv("DATABASE_URL", "sqlite:////data/site.db")
    settings = Settings(_env_file=None)
    assert settings.site_url == "https://sagar-pal.dev"
    assert settings.umami_domain == "https://analytics.example"
    assert settings.umami_id is None
    assert settings.admin_api_token is None
    assert settings.data_dir == Path("/data")
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    assert Settings(_env_file=None).data_dir == REPO_ROOT / ".data"


def test_hash_password_tool(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    answers = iter(["s3cret", "s3cret"])
    monkeypatch.setattr("getpass.getpass", lambda _prompt: next(answers))
    assert tool.main() == 0
    printed = capsys.readouterr().out.strip()
    assert printed.startswith("$argon2id$")
    assert verify_password(printed, "s3cret")
    assert not verify_password(printed, "wrong")
    assert not verify_password("not a hash", "s3cret")

    answers = iter(["one", "two"])
    assert tool.main() == 1


def test_json_logs_carry_request_fields_only() -> None:
    record = logging.LogRecord("app.request", logging.INFO, __file__, 1, "request", None, None)
    record.method, record.path, record.status, record.ms = "GET", "/api/search", 200, 1.5
    entry = json.loads(JsonFormatter().format(record))
    assert entry["path"] == "/api/search"
    assert set(entry) == {"time", "level", "logger", "message", "method", "path", "status", "ms"}


def test_request_log_drops_query_strings_and_ips(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/api/search", params={"q": "secret words"})
    [record] = [r for r in caplog.records if r.name == "app.request"]
    line = JsonFormatter().format(record)
    assert json.loads(line)["path"] == "/api/search"
    assert "secret" not in line
    assert "testclient" not in line  # the TestClient's peer address


def test_request_log_skips_successful_health_checks(
    client: TestClient, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/api/health")
        assert not [r for r in caplog.records if r.name == "app.request"]

        def broken() -> None:
            raise OperationalError("SELECT 1", {}, Exception("disk I/O error"))

        monkeypatch.setattr(client.app.state.ctx.engine, "connect", broken)  # type: ignore[attr-defined]
        client.get("/api/health")
    [record] = [r for r in caplog.records if r.name == "app.request"]
    assert record.status == 503  # type: ignore[attr-defined]


def test_configure_logging_silences_the_access_log() -> None:
    root = logging.getLogger()
    saved_handlers, saved_level = root.handlers[:], root.level
    try:
        configure_logging("warning")
        assert logging.getLogger("uvicorn.access").disabled
        assert root.level == logging.WARNING
        assert isinstance(root.handlers[0].formatter, JsonFormatter)
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)
        logging.getLogger("uvicorn.access").disabled = False
