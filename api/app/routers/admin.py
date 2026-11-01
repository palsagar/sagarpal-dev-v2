"""Admin (API.md §5): server-rendered pages under /admin, bearer JSON API under /api/admin."""

import hmac
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import FormData

from app.auth import CSRF_COOKIE, SESSION_COOKIE, AdminAuth, verify_password
from app.deps import AppContext, Ctx, DbSession
from app.models import KINDS, ReadingItem
from app.privacy import utc_now
from app.routers.reading import ordered
from app.schemas import ReadingItemIn, ReadingItemOut, ReadingItemPatch, reading_label
from app.services.lookup import lookup, make_client
from app.templating import templates

router = APIRouter(tags=["admin"])

PAGE_HEADERS = {"X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store"}
FORM_FIELDS = tuple(ReadingItemIn.model_fields)
GROUPS = (("reading", "Reading now"), ("finished", "Finished"), ("queued", "Up next"))


@dataclass
class Row:
    """One line of the admin list."""

    item: ReadingItem
    label: str


def get_http_client(ctx: Ctx) -> Iterator[httpx.Client]:
    """Dependency: HTTP client for metadata lookups (tests override it)."""
    with make_client(ctx.settings.contact_email) as client:
        yield client


HttpClient = Annotated[httpx.Client, Depends(get_http_client)]


def _auth(ctx: AppContext) -> AdminAuth:
    return AdminAuth(ctx.settings.session_secret.get_secret_value())


def _render(
    request: Request, ctx: AppContext, name: str, context: dict[str, Any], status: int = 200
) -> HTMLResponse:
    """Render an admin page with its CSRF token, robots and cache headers."""
    auth = _auth(ctx)
    token, is_new = auth.csrf_for(request.cookies.get(CSRF_COOKIE))
    response = templates.TemplateResponse(
        request, name, {**context, "csrf": token}, status_code=status, headers=PAGE_HEADERS
    )
    if is_new:
        auth.set_csrf(response, token)
    return response


def _redirect(url: str) -> RedirectResponse:
    return RedirectResponse(url, status_code=303, headers=PAGE_HEADERS)


def _signed_in(request: Request, ctx: AppContext) -> bool:
    return _auth(ctx).session_valid(request.cookies.get(SESSION_COOKIE))


# The form is read by these async dependencies, so the handlers can be plain `def`.
# FastAPI runs those in its thread pool: argon2, SQLite writes and lookups never block
# the single event loop that also serves the public site.
async def _csrf_form(request: Request, ctx: Ctx) -> FormData:
    """Dependency: the POSTed form; 403 without a valid CSRF token."""
    form = await request.form()
    field = form.get("csrf")
    if not _auth(ctx).csrf_valid(
        request.cookies.get(CSRF_COOKIE), field if isinstance(field, str) else None
    ):
        raise HTTPException(status_code=403, detail="Invalid form token. Reload the page.")
    return form


CsrfForm = Annotated[FormData, Depends(_csrf_form)]


def _admin_form(request: Request, ctx: Ctx, form: CsrfForm) -> FormData:
    """Dependency: the CSRF-checked form; 403 without a session."""
    if not _signed_in(request, ctx):
        raise HTTPException(status_code=403, detail="Signed out. Sign in again.")
    return form


AdminForm = Annotated[FormData, Depends(_admin_form)]


def _values(form: FormData) -> dict[str, str]:
    """Form strings for the item fields; the published checkbox becomes "1" or ""."""
    values = {name: str(form.get(name, "")) for name in FORM_FIELDS if name != "published"}
    values["published"] = "1" if form.get("published") else ""
    return values


def _item_values(item: ReadingItem) -> dict[str, str]:
    values = {}
    for name in FORM_FIELDS:
        value = getattr(item, name)
        values[name] = "" if value is None else str(value)
    values["published"] = "1" if item.published else ""
    return values


def _errors(exc: ValidationError) -> dict[str, str]:
    return {str(err["loc"][0]): err["msg"].removeprefix("Value error, ") for err in exc.errors()}


def _parse(values: dict[str, str]) -> ReadingItemIn:
    return ReadingItemIn.model_validate({**values, "published": bool(values["published"])})


def _get_item(session: Session, item_id: int) -> ReadingItem:
    item = session.get(ReadingItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="No such item")
    return item


def _form_page(
    request: Request,
    ctx: AppContext,
    values: dict[str, str],
    item_id: int | None,
    errors: dict[str, str] | None = None,
    message: str = "",
    status: int = 200,
) -> HTMLResponse:
    context = {
        "values": values,
        "item_id": item_id,
        "errors": errors or {},
        "message": message,
        "kinds": KINDS,
        "statuses": GROUPS,
    }
    return _render(request, ctx, "admin/form.html", context, status)


# --- HTML pages -------------------------------------------------------------------------


@router.get("/admin", response_class=HTMLResponse)
def admin_home(request: Request, ctx: Ctx, session: DbSession) -> HTMLResponse:
    """The list of items grouped by status, or the login form."""
    if not _signed_in(request, ctx):
        return _render(request, ctx, "admin/login.html", {"error": ""})
    items = session.scalars(ordered(select(ReadingItem))).all()
    rows = [
        Row(
            item,
            reading_label(
                item.kind,
                item.status,
                item.verb,
                item.started_on,
                item.finished_on,
                item.created_at,
            ),
        )
        for item in items
    ]
    groups = [
        (title, [r for r in rows if r.item.status == status and not r.item.deleted_at])
        for status, title in GROUPS
    ]
    deleted = [r for r in rows if r.item.deleted_at]
    return _render(request, ctx, "admin/list.html", {"groups": groups, "deleted": deleted})


@router.post("/admin/login", response_class=HTMLResponse)
def login(request: Request, ctx: Ctx, form: CsrfForm) -> Response:
    """Check the password (5 attempts per 15 minutes per visitor) and start a session."""
    key = ctx.hashed_ip(request)
    if not ctx.login_limit.allow(key):
        minutes = -(-ctx.login_limit.retry_after(key) // 60)
        error = f"Too many attempts. Try again in {minutes} min."
        return _render(request, ctx, "admin/login.html", {"error": error}, 429)
    password = str(form.get("password", ""))
    if not verify_password(ctx.settings.admin_password_hash.get_secret_value(), password):
        return _render(request, ctx, "admin/login.html", {"error": "Wrong password."}, 401)
    response = _redirect("/admin")
    _auth(ctx).set_session(response)
    return response


@router.post("/admin/logout")
def logout(ctx: Ctx, _form: CsrfForm) -> Response:
    """End the session."""
    response = _redirect("/admin")
    _auth(ctx).clear_session(response)
    return response


@router.get("/admin/items/new", response_class=HTMLResponse)
def new_item_page(request: Request, ctx: Ctx) -> Response:
    """Empty form for a new item."""
    if not _signed_in(request, ctx):
        return _redirect("/admin")
    blank = dict.fromkeys(FORM_FIELDS, "") | {"kind": "book", "status": "reading", "published": "1"}
    return _form_page(request, ctx, blank, None)


@router.get("/admin/items/{item_id}", response_class=HTMLResponse)
def edit_item_page(request: Request, item_id: int, ctx: Ctx, session: DbSession) -> Response:
    """Form for an existing item."""
    if not _signed_in(request, ctx):
        return _redirect("/admin")
    return _form_page(request, ctx, _item_values(_get_item(session, item_id)), item_id)


@router.post("/admin/items/new", response_class=HTMLResponse)
def create_item(request: Request, ctx: Ctx, session: DbSession, form: AdminForm) -> Response:
    """Create an item from the form, or show the form again with its errors."""
    values = _values(form)
    try:
        data = _parse(values)
    except ValidationError as exc:
        return _form_page(request, ctx, values, None, _errors(exc), status=422)
    item = ReadingItem(**data.model_dump())
    session.add(item)
    session.commit()
    return _redirect(f"/admin#item-{item.id}")


@router.post("/admin/items/{item_id}", response_class=HTMLResponse)
def update_item(
    request: Request, item_id: int, ctx: Ctx, session: DbSession, form: AdminForm
) -> Response:
    """Save an edited item."""
    values = _values(form)
    item = _get_item(session, item_id)
    try:
        data = _parse(values)
    except ValidationError as exc:
        return _form_page(request, ctx, values, item_id, _errors(exc), status=422)
    for name, value in data.model_dump().items():
        setattr(item, name, value)
    session.commit()
    return _redirect(f"/admin#item-{item_id}")


@router.post("/admin/lookup", response_class=HTMLResponse)
def lookup_item(request: Request, ctx: Ctx, client: HttpClient, form: AdminForm) -> Response:
    """Fill empty fields from Open Library, arXiv or Crossref; the form stays editable."""
    values = _values(form)
    raw_id = str(form.get("item_id", ""))
    item_id = int(raw_id) if raw_id.isdigit() else None
    found = lookup(values["identifier"], client) if values["identifier"].strip() else None
    if found is None:
        message = "No details found for that identifier. Fill the fields by hand."
        return _form_page(request, ctx, values, item_id, message=message)
    fetched = found.form_values()
    # The kind follows the identifier; other fields are only filled where empty.
    values["kind"] = fetched.pop("kind")
    for name, value in fetched.items():
        if not values.get(name, "").strip():
            values[name] = value
    return _form_page(
        request, ctx, values, item_id, message="Details fetched. Check them, then save."
    )


@router.post("/admin/items/{item_id}/delete")
def delete_item(item_id: int, session: DbSession, _form: AdminForm) -> Response:
    """Soft delete: hide the item and move it to the Deleted group."""
    _get_item(session, item_id).deleted_at = utc_now().replace(tzinfo=None)
    session.commit()
    return _redirect("/admin#deleted")


@router.post("/admin/items/{item_id}/restore")
def restore_item(item_id: int, session: DbSession, _form: AdminForm) -> Response:
    """Undo a soft delete."""
    _get_item(session, item_id).deleted_at = None
    session.commit()
    return _redirect(f"/admin#item-{item_id}")


@router.get("/admin/items/{item_id}/purge", response_class=HTMLResponse)
def purge_page(request: Request, item_id: int, ctx: Ctx, session: DbSession) -> Response:
    """Ask for confirmation before a permanent delete."""
    if not _signed_in(request, ctx):
        return _redirect("/admin")
    return _render(request, ctx, "admin/purge.html", {"item": _get_item(session, item_id)})


@router.post("/admin/items/{item_id}/purge")
def purge_item(item_id: int, session: DbSession, _form: AdminForm) -> Response:
    """Delete the row for good."""
    session.delete(_get_item(session, item_id))
    session.commit()
    return _redirect("/admin")


# --- JSON API (bearer token) -------------------------------------------------------------


def require_token(ctx: Ctx, authorization: Annotated[str, Header()] = "") -> None:
    """404 when ADMIN_API_TOKEN is unset; 401 unless the bearer token matches."""
    token = ctx.settings.admin_api_token
    if token is None:
        raise HTTPException(status_code=404, detail="Not Found")
    scheme, _, given = authorization.partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        given.strip().encode(), token.get_secret_value().encode()
    ):
        raise HTTPException(
            status_code=401, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"}
        )


api = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_token)])


def _live_item(session: Session, item_id: int) -> ReadingItem:
    item = session.get(ReadingItem, item_id)
    if item is None or item.deleted_at is not None:
        raise HTTPException(status_code=404, detail="No such item")
    return item


@api.post("/reading", status_code=201)
def api_create(data: ReadingItemIn, session: DbSession) -> ReadingItemOut:
    """Create an item."""
    item = ReadingItem(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return ReadingItemOut.from_item(item)


@api.patch("/reading/{item_id}")
def api_update(item_id: int, patch: ReadingItemPatch, session: DbSession) -> ReadingItemOut:
    """Change some fields; the merged item is validated like a new one."""
    item = _live_item(session, item_id)
    current = {name: getattr(item, name) for name in FORM_FIELDS}
    try:
        data = ReadingItemIn.model_validate(current | patch.model_dump(exclude_unset=True))
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_url=False, include_context=False, include_input=False),
        ) from exc
    for name, value in data.model_dump().items():
        setattr(item, name, value)
    session.commit()
    session.refresh(item)
    return ReadingItemOut.from_item(item)


@api.delete("/reading/{item_id}", status_code=204)
def api_delete(item_id: int, session: DbSession) -> Response:
    """Soft delete."""
    _live_item(session, item_id).deleted_at = utc_now().replace(tzinfo=None)
    session.commit()
    return Response(status_code=204)
