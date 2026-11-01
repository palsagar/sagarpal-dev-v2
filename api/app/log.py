"""JSON-lines logging to stdout (API.md §10). Request logs never contain IPs, UAs or queries."""

import json
import logging
import sys
import time
from datetime import UTC, datetime

from starlette.types import ASGIApp, Message, Receive, Scope, Send


class JsonFormatter(logging.Formatter):
    """One JSON object per line: time, level, logger, message and any ``extra`` fields."""

    FIELDS = ("method", "path", "status", "ms")

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        for field in self.FIELDS:
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def configure_logging(level: str) -> None:
    """Send all logs to stdout as JSON and silence uvicorn's access log (it prints client IPs).

    Examples
    --------
    .. code-block:: python

        configure_logging("info")
    """
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error"):
        logger = logging.getLogger(name)
        logger.handlers[:] = []
        logger.propagate = True
    logging.getLogger("uvicorn.access").disabled = True
    # Alembic lists its plugins at info level on every start; keep the migration lines only.
    logging.getLogger("alembic.runtime.plugins").setLevel(logging.WARNING)


request_log = logging.getLogger("app.request")


class RequestLog:
    """ASGI middleware: log method, path (query dropped), status and duration.

    Successful health checks are not logged.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status = 500

        async def capture(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture)
        finally:
            # The container health check calls /api/health every 30 s; log it only when it fails.
            if scope["path"] != "/api/health" or status != 200:
                request_log.info(
                    "request",
                    extra={
                        "method": scope["method"],
                        "path": scope["path"],
                        "status": status,
                        "ms": round((time.perf_counter() - start) * 1000, 1),
                    },
                )
