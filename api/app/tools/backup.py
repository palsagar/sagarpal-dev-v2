"""Copy the SQLite database to ``<data dir>/backups/site-YYYY-MM-DD.db`` and keep the newest 14.

Run nightly inside the container (a Coolify scheduled task, DEPLOYMENT.md) with
``python -m app.tools.backup``. SQLite's online backup API copies a consistent
snapshot while the site keeps running. Litestream sends every change off the
server; these local copies are the quick way back from a bad change, because
they are kept for two weeks.
"""

import sqlite3
import sys
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import make_url

from app.config import get_settings

KEEP = 14


def backup(database: Path, backups: Path, today: str, keep: int = KEEP) -> Path:
    """Write today's copy of ``database`` into ``backups`` and delete all but the newest ``keep``.

    A second run on the same day replaces that day's copy.

    Examples
    --------
    .. code-block:: python

        backup(Path("/data/site.db"), Path("/data/backups"), "2026-11-01")
    """
    backups.mkdir(parents=True, exist_ok=True)
    target = backups / f"site-{today}.db"
    partial = target.with_suffix(".db.partial")
    # Copy into a temporary name first, so a failed run never leaves a broken copy
    # under a real backup name.
    with closing(sqlite3.connect(database)) as source, closing(sqlite3.connect(partial)) as copy:
        source.backup(copy)
    partial.replace(target)

    # Names sort by date, so the oldest copies come first.
    for old in sorted(backups.glob("site-*.db"))[:-keep]:
        old.unlink()
    return target


def main() -> int:
    """Back up the configured database; exit status 1 when it does not exist.

    Examples
    --------
    .. code-block:: console

        $ python -m app.tools.backup
        /data/backups/site-2026-11-01.db
    """
    settings = get_settings()
    database = Path(make_url(settings.database_url).database or "")
    if not database.is_file():
        print(f"No database at {database}.", file=sys.stderr)
        return 1
    today = datetime.now(UTC).date().isoformat()
    print(backup(database, settings.data_dir / "backups", today))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
