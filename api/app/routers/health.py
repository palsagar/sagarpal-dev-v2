from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.deps import Ctx
from app.privacy import from_cloudflare

router = APIRouter(prefix="/api", tags=["health"])


@router.api_route("/health", methods=["GET", "HEAD"])
def health(ctx: Ctx, request: Request) -> JSONResponse:
    """Liveness plus a database round trip; 503 when the database does not answer.

    ``via_cloudflare`` says whether this request reached the app from a Cloudflare
    edge address. Through the public URL it must be true; false means
    ``FORWARDED_ALLOW_IPS`` does not match Coolify's proxy (DEPLOYMENT.md).
    """
    headers = {"Cache-Control": "no-store"}
    try:
        with ctx.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse({"status": "error"}, status_code=503, headers=headers)
    posts = len(ctx.manifest.current().posts)
    peer = request.client.host if request.client else ""
    body = {"status": "ok", "posts": posts, "via_cloudflare": from_cloudflare(peer)}
    return JSONResponse(body, headers=headers)
