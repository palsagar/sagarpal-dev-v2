"""App factory: lifespan (FTS5 check, migrations, manifest), routers, static site, middleware."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import RedirectResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import Settings, get_settings
from app.db import assert_fts5, create_db_engine, create_session_factory, run_migrations
from app.deps import AppContext
from app.log import RequestLog, configure_logging
from app.manifest import MANIFEST_NAME, ManifestStore
from app.routers import admin, feed, health, og, posts, reading, search
from app.static import (
    SecurityHeaders,
    SiteStatic,
    content_security_policy,
    inline_script_hashes,
    security_headers,
    umami_tag,
)
from app.templating import templates

log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the application. Nothing touches the database until the lifespan starts.

    Examples
    --------
    .. code-block:: python

        with TestClient(create_app()) as client:  # runs migrations, loads the manifest
            client.get("/api/health")
    """
    settings = settings or get_settings()
    engine = create_db_engine(settings.database_url)
    ctx = AppContext(
        settings=settings,
        engine=engine,
        sessions=create_session_factory(engine),
        manifest=ManifestStore(settings.static_dir / MANIFEST_NAME, engine),
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        assert_fts5(engine)
        await run_in_threadpool(run_migrations, settings.database_url, settings.data_dir)
        await run_in_threadpool(ctx.manifest.load)
        yield
        engine.dispose()

    # No /docs or /openapi.json on the public site.
    app = FastAPI(
        title="sagar-pal.dev API",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.ctx = ctx

    for module in (health, posts, search, reading, feed, og):
        app.include_router(module.router)
    app.include_router(admin.router)
    app.include_router(admin.api)

    @app.get("/admin/", include_in_schema=False)
    def admin_slash() -> RedirectResponse:
        # The static mount would answer this path with a 404 before FastAPI's slash redirect.
        return RedirectResponse("/admin", status_code=308)

    @app.exception_handler(StarletteHTTPException)
    async def admin_errors(request: Request, exc: StarletteHTTPException) -> Response:
        # Admin pages answer errors with a page, not JSON.
        if request.url.path.startswith("/admin"):
            titles = {403: "Not allowed", 404: "Not found"}
            return templates.TemplateResponse(
                request,
                "admin/error.html",
                {"title": titles.get(exc.status_code, "Error"), "detail": exc.detail},
                status_code=exc.status_code,
                headers={**(exc.headers or {}), **admin.PAGE_HEADERS},
            )
        return await http_exception_handler(request, exc)

    umami = (
        umami_tag(settings.umami_domain, settings.umami_id)
        if settings.umami_domain and settings.umami_id
        else None
    )
    hashes: list[str] = []
    if settings.static_dir.is_dir():
        hashes = inline_script_hashes(settings.static_dir)
        app.mount("/", SiteStatic(directory=settings.static_dir, umami=umami), name="static")
    else:
        log.warning("STATIC_DIR %s does not exist; serving the API only", settings.static_dir)

    csp = content_security_policy(hashes, settings.umami_domain if umami else None)
    app.add_middleware(SecurityHeaders, headers=security_headers(csp))
    app.add_middleware(RequestLog)
    return app


def _production_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    return create_app(settings)


app = _production_app()
