"""Content manifest (API.md §3): load, validate, watch for changes, rebuild the search index."""

import datetime as dt
import logging
import threading
import time
from collections.abc import Callable
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import Engine, text

log = logging.getLogger(__name__)

MANIFEST_NAME = "content-manifest.json"


class ManifestPost(BaseModel):
    """One published post, as Astro writes it."""

    model_config = ConfigDict(populate_by_name=True)

    slug: str = Field(min_length=1)
    url: str
    title: str
    dek: str
    date: dt.date
    updated: dt.date | None = None
    tags: list[str] = []
    reading_minutes: int = Field(alias="readingMinutes", ge=0)
    text: str = ""


class Manifest(BaseModel):
    """The whole manifest. ``Manifest.empty()`` stands in when there is no file."""

    generated_at: dt.datetime | None = None
    site: str = ""
    posts: list[ManifestPost] = []

    @classmethod
    def empty(cls) -> "Manifest":
        """Return a manifest with no posts."""
        return cls()

    def by_slug(self) -> dict[str, ManifestPost]:
        """Map slug to post."""
        return {post.slug: post for post in self.posts}


def rebuild_search_index(engine: Engine, manifest: Manifest) -> None:
    """Replace every row of ``posts_fts`` with the manifest's posts, in one transaction.

    Examples
    --------
    .. code-block:: python

        rebuild_search_index(engine, Manifest.empty())  # leaves the index empty
    """
    rows = [
        {
            "slug": post.slug,
            "title": post.title,
            "dek": post.dek,
            "tags": " ".join(post.tags),
            "body": post.text,
        }
        for post in manifest.posts
    ]
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM posts_fts"))
        if rows:
            conn.execute(
                text(
                    "INSERT INTO posts_fts (slug, title, dek, tags, body) "
                    "VALUES (:slug, :title, :dek, :tags, :body)"
                ),
                rows,
            )


class ManifestStore:
    """Holds the current manifest and reloads it when the file changes.

    The file's mtime is checked at most once per ``check_interval`` seconds. A
    missing file means no posts. An invalid file is logged and the previous
    manifest is kept, so a bad deploy never empties search or RSS.

    Parameters
    ----------
    path
        Path to ``content-manifest.json``.
    engine
        Engine whose ``posts_fts`` table mirrors the manifest.
    check_interval
        Minimum seconds between two mtime checks.
    clock
        Monotonic clock, injectable for tests.

    Examples
    --------
    .. code-block:: python

        store = ManifestStore(Path("dist/content-manifest.json"), engine)
        store.load()
        store.current().posts
    """

    def __init__(
        self,
        path: Path,
        engine: Engine,
        check_interval: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.path = path
        self.engine = engine
        self.check_interval = check_interval
        self.clock = clock
        self._manifest = Manifest.empty()
        self._slugs: dict[str, ManifestPost] = {}
        self._loaded = False
        self._signature: tuple[int, int] | None = None
        self._checked_at: float | None = None
        self._lock = threading.Lock()

    def load(self) -> None:
        """Read the file now (if it changed since the last read) and rebuild the index."""
        with self._lock:
            self._checked_at = self.clock()
            signature = self._file_signature()
            if self._loaded and signature == self._signature:
                return
            if signature is None:
                manifest = Manifest.empty()
            else:
                try:
                    manifest = Manifest.model_validate_json(self.path.read_bytes())
                except (OSError, ValidationError) as exc:
                    log.error("manifest invalid, keeping the previous one: %s", exc)
                    self._signature = signature  # do not re-read the same broken file
                    self._loaded = True
                    return
            rebuild_search_index(self.engine, manifest)
            self._manifest = manifest
            self._slugs = manifest.by_slug()
            self._signature = signature
            self._loaded = True
            log.info("manifest loaded: %d posts", len(manifest.posts))

    def current(self) -> Manifest:
        """Return the manifest, reloading first when the check interval has passed."""
        checked_at = self._checked_at
        if checked_at is None or self.clock() - checked_at >= self.check_interval:
            self.load()
        return self._manifest

    def get(self, slug: str) -> ManifestPost | None:
        """Return the published post with this slug, or None."""
        self.current()
        return self._slugs.get(slug)

    def _file_signature(self) -> tuple[int, int] | None:
        # mtime and size together catch a file replaced within the same clock tick.
        try:
            stat = self.path.stat()
        except FileNotFoundError:
            return None
        return (stat.st_mtime_ns, stat.st_size)
