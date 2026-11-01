from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.deps import Ctx

router = APIRouter(prefix="/api", tags=["health"])


@router.api_route("/health", methods=["GET", "HEAD"])
def health(ctx: Ctx) -> JSONResponse:
    """Liveness plus a database round trip; 503 when the database does not answer."""
    headers = {"Cache-Control": "no-store"}
    try:
        with ctx.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "error"}, status_code=503, headers=headers)
    posts = len(ctx.manifest.current().posts)
    return JSONResponse({"status": "ok", "posts": posts}, headers=headers)
