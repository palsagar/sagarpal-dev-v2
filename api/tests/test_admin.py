import re
from collections.abc import Callable, Iterator

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.auth import CSRF_COOKIE, SESSION_COOKIE
from app.routers.admin import get_http_client
from tests.conftest import TEST_PASSWORD

FIELDS = {
    "kind": "paper",
    "title": "MACE",
    "authors": "Batatia, Kovács",
    "year": "2022",
    "source": "NeurIPS",
    "url": "https://arxiv.org/abs/2206.07697",
    "identifier": "2206.07697",
    "cover_url": "",
    "status": "reading",
    "started_on": "2026-10-02",
    "finished_on": "",
    "note": "Equivariant message passing that works.",
    "verb": "",
    "published": "1",
}


def csrf(client: TestClient, path: str = "/admin") -> str:
    """Load an admin page and return the CSRF token from its form."""
    page = client.get(path)
    match = re.search(r'name="csrf" value="([^"]+)"', page.text)
    assert match, page.text
    return match.group(1)


def sign_in(client: TestClient) -> None:
    response = client.post(
        "/admin/login",
        data={"csrf": csrf(client), "password": TEST_PASSWORD},
        follow_redirects=False,
    )
    assert response.status_code == 303


def create(client: TestClient, **overrides: str) -> int:
    response = client.post(
        "/admin/items/new",
        data={**FIELDS, **overrides, "csrf": csrf(client)},
        follow_redirects=False,
    )
    assert response.status_code == 303, response.text
    return int(response.headers["location"].rsplit("-", 1)[1])


@pytest.fixture
def admin(client: TestClient) -> TestClient:
    sign_in(client)
    return client


def test_login_page_is_noindex_and_sets_a_strict_csrf_cookie(client: TestClient) -> None:
    response = client.get("/admin")
    assert response.status_code == 200
    assert "Sign in" in response.text
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
    assert response.headers["cache-control"] == "no-store"
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{CSRF_COOKIE}=")
    for attribute in ["HttpOnly", "Secure", "SameSite=strict", "Path=/admin"]:
        assert attribute.lower() in cookie.lower()


def test_trailing_slash_redirects_to_admin(client: TestClient) -> None:
    response = client.get("/admin/", follow_redirects=False)
    assert response.status_code == 308
    assert response.headers["location"] == "/admin"


def test_wrong_password_is_401_and_right_one_sets_the_session(client: TestClient) -> None:
    token = csrf(client)
    wrong = client.post("/admin/login", data={"csrf": token, "password": "nope"})
    assert wrong.status_code == 401
    assert "Wrong password." in wrong.text

    right = client.post(
        "/admin/login", data={"csrf": token, "password": TEST_PASSWORD}, follow_redirects=False
    )
    assert right.status_code == 303
    cookie = right.headers["set-cookie"]
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    for attribute in ["HttpOnly", "Secure", "SameSite=strict", "Path=/admin", "Max-Age=2592000"]:
        assert attribute.lower() in cookie.lower()
    assert "Reading list" in client.get("/admin").text


def test_posts_without_a_valid_csrf_token_are_refused(client: TestClient) -> None:
    token = csrf(client)
    for data in [{"password": TEST_PASSWORD}, {"csrf": "forged", "password": TEST_PASSWORD}]:
        response = client.post("/admin/login", data=data)
        assert response.status_code == 403
        assert "Invalid form token" in response.text
    # A token that does not match the cookie is refused too.
    client.cookies.delete(CSRF_COOKIE, path="/admin")
    assert client.post("/admin/login", data={"csrf": token, "password": "x"}).status_code == 403


def test_login_is_limited_to_5_attempts_per_15_minutes(client: TestClient) -> None:
    token = csrf(client)
    codes = [
        client.post("/admin/login", data={"csrf": token, "password": "nope"}).status_code
        for _ in range(6)
    ]
    assert codes == [401] * 5 + [429]
    last = client.post("/admin/login", data={"csrf": token, "password": TEST_PASSWORD})
    assert last.status_code == 429  # even the right password waits
    assert "Too many attempts" in last.text


def test_a_forged_session_cookie_is_not_signed_in(client: TestClient) -> None:
    client.cookies.set(SESSION_COOKIE, "admin", domain="testserver", path="/admin")
    assert "Sign in" in client.get("/admin").text
    assert client.get("/admin/items/new", follow_redirects=False).status_code == 303


def test_pages_and_writes_need_a_session(client: TestClient) -> None:
    for path in ["/admin/items/new", "/admin/items/1", "/admin/items/1/purge"]:
        assert client.get(path, follow_redirects=False).headers["location"] == "/admin"
    token = csrf(client)
    for path in ["/admin/items/new", "/admin/items/1", "/admin/items/1/delete", "/admin/lookup"]:
        response = client.post(path, data={**FIELDS, "csrf": token})
        assert response.status_code == 403
        assert "Signed out" in response.text


def test_create_shows_on_the_public_api(admin: TestClient) -> None:
    item_id = create(admin)
    [item] = admin.get("/api/reading").json()["items"]
    assert item["id"] == item_id
    assert item["title"] == "MACE"
    assert item["year"] == 2022
    assert item["label"] == "Paper, started October 2026"
    page = admin.get("/admin").text
    assert f'id="item-{item_id}"' in page
    assert "Batatia, Kovács" in page


def test_unpublished_items_stay_private(admin: TestClient) -> None:
    create(admin, published="")
    assert admin.get("/api/reading").json()["items"] == []
    assert "Hidden" in admin.get("/admin").text


def test_invalid_input_redisplays_the_form_with_errors(admin: TestClient) -> None:
    response = admin.post(
        "/admin/items/new",
        data={**FIELDS, "url": "javascript:alert(1)", "title": "", "csrf": csrf(admin)},
    )
    assert response.status_code == 422
    assert "Some fields need fixing." in response.text
    assert 'id="url-error"' in response.text
    assert "must be an http(s) URL" in response.text
    assert 'aria-invalid="true"' in response.text
    assert 'value="Batatia, Kovács"' in response.text  # what was typed is kept
    assert admin.get("/api/reading").json()["items"] == []


def test_input_is_escaped_in_pages(admin: TestClient) -> None:
    create(admin, title='<img src=x onerror="alert(1)">')
    page = admin.get("/admin").text
    assert "<img src=x" not in page
    assert "&lt;img src=x" in page


def test_edit_updates_the_item(admin: TestClient) -> None:
    item_id = create(admin)
    form = admin.get(f"/admin/items/{item_id}")
    assert 'value="MACE"' in form.text
    response = admin.post(
        f"/admin/items/{item_id}",
        data={
            **FIELDS,
            "status": "finished",
            "finished_on": "2026-10-20",
            "verb": "reread",
            "csrf": csrf(admin),
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    [item] = admin.get("/api/reading").json()["items"]
    assert item["status"] == "finished"
    assert item["label"] == "Paper, reread October 2026"

    bad = admin.post(f"/admin/items/{item_id}", data={**FIELDS, "year": "abc", "csrf": csrf(admin)})
    assert bad.status_code == 422


def test_unknown_items_are_404_pages(admin: TestClient) -> None:
    response = admin.get("/admin/items/999")
    assert response.status_code == 404
    assert "Not found" in response.text
    assert response.headers["x-robots-tag"] == "noindex, nofollow"


def test_delete_restore_and_purge(admin: TestClient) -> None:
    item_id = create(admin)
    token = csrf(admin)
    admin.post(f"/admin/items/{item_id}/delete", data={"csrf": token})
    assert admin.get("/api/reading").json()["items"] == []
    assert 'id="deleted"' in admin.get("/admin").text

    admin.post(f"/admin/items/{item_id}/restore", data={"csrf": token})
    assert len(admin.get("/api/reading").json()["items"]) == 1

    confirm = admin.get(f"/admin/items/{item_id}/purge")
    assert "This cannot be undone." in confirm.text
    admin.post(f"/admin/items/{item_id}/purge", data={"csrf": token})
    assert admin.get(f"/admin/items/{item_id}").status_code == 404


def test_logout_clears_the_session(admin: TestClient) -> None:
    response = admin.post("/admin/logout", data={"csrf": csrf(admin)}, follow_redirects=False)
    assert response.status_code == 303
    assert f"{SESSION_COOKIE}=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert "Sign in" in admin.get("/admin").text


# --- metadata lookup ---------------------------------------------------------------------


@pytest.fixture
def mock_lookup(admin: TestClient) -> Iterator[Callable[[httpx.MockTransport], None]]:
    def install(transport: httpx.MockTransport) -> None:
        def client() -> Iterator[httpx.Client]:
            with httpx.Client(transport=transport) as c:
                yield c

        admin.app.dependency_overrides[get_http_client] = client  # type: ignore[attr-defined]

    yield install
    admin.app.dependency_overrides.clear()  # type: ignore[attr-defined]


ARXIV_ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
<id>http://arxiv.org/abs/2206.07697v2</id><published>2022-06-15T00:00:00Z</published>
<title>MACE: Higher Order Equivariant
  Message Passing</title><author><name>Ilyes Batatia</name></author>
<author><name>Dávid Péter Kovács</name></author></entry></feed>"""


def test_fetch_details_fills_empty_fields_and_keeps_typed_ones(
    admin: TestClient, mock_lookup: Callable[[httpx.MockTransport], None]
) -> None:
    mock_lookup(httpx.MockTransport(lambda request: httpx.Response(200, text=ARXIV_ATOM)))
    data = {k: "" for k in FIELDS} | {
        "kind": "book",
        "status": "queued",
        "identifier": "arXiv:2206.07697",
        "note": "typed by hand",
        "csrf": csrf(admin),
        "item_id": "",
    }
    response = admin.post("/admin/lookup", data=data)
    assert response.status_code == 200
    page = response.text
    assert "Details fetched." in page
    assert 'value="MACE: Higher Order Equivariant Message Passing"' in page
    assert 'value="Batatia, Kovács"' in page
    assert 'value="2022"' in page
    assert '<option value="paper" selected>' in page
    assert "typed by hand" in page
    assert 'action="/admin/items/new"' in page


def test_fetch_details_failure_keeps_the_form(
    admin: TestClient, mock_lookup: Callable[[httpx.MockTransport], None]
) -> None:
    item_id = create(admin)

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("slow", request=request)

    mock_lookup(httpx.MockTransport(timeout))
    data = {**FIELDS, "identifier": "10.1000/xyz", "csrf": csrf(admin), "item_id": str(item_id)}
    page = admin.post("/admin/lookup", data=data).text
    assert "No details found" in page
    assert 'value="MACE"' in page
    assert f'action="/admin/items/{item_id}"' in page


# --- JSON API ----------------------------------------------------------------------------

ITEM = {"kind": "book", "title": "Physical Hydrodynamics", "status": "queued"}


@pytest.fixture
def api(client: TestClient) -> TestClient:
    client.app.state.ctx.settings.admin_api_token = SecretStr("t" * 40)  # type: ignore[attr-defined]
    client.headers["Authorization"] = "Bearer " + "t" * 40
    return client


def test_json_api_is_off_without_a_token(client: TestClient) -> None:
    response = client.post("/api/admin/reading", json=ITEM, headers={"Authorization": "Bearer "})
    assert response.status_code == 404


def test_json_api_needs_the_bearer_token(api: TestClient) -> None:
    for header in ["Bearer wrong", "Basic " + "t" * 40, ""]:
        response = api.post("/api/admin/reading", json=ITEM, headers={"Authorization": header})
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


def test_json_api_create_patch_delete(api: TestClient) -> None:
    created = api.post("/api/admin/reading", json=ITEM)
    assert created.status_code == 201
    item_id = created.json()["id"]
    assert created.json()["label"].startswith("Book, added ")

    patched = api.patch(
        f"/api/admin/reading/{item_id}",
        json={"status": "reading", "started_on": "2026-10-01", "authors": "Guyon"},
    )
    assert patched.status_code == 200
    assert patched.json()["label"] == "Book, started October 2026"
    assert patched.json()["title"] == "Physical Hydrodynamics"

    assert api.patch(f"/api/admin/reading/{item_id}", json={"url": "ftp://x"}).status_code == 422
    assert api.patch(f"/api/admin/reading/{item_id}", json={"bogus": 1}).status_code == 422
    assert api.post("/api/admin/reading", json={**ITEM, "kind": "film"}).status_code == 422

    assert api.delete(f"/api/admin/reading/{item_id}").status_code == 204
    assert api.get("/api/reading").json()["items"] == []
    assert api.patch(f"/api/admin/reading/{item_id}", json={"title": "x"}).status_code == 404
    assert api.delete(f"/api/admin/reading/{item_id}").status_code == 404


def test_admin_error_pages_keep_the_exception_headers(client: TestClient) -> None:
    response = client.put("/admin/items/1")
    assert response.status_code == 405
    # The catch-all static mount answers wrong methods; what matters is that Allow survives.
    assert response.headers["allow"]
    assert response.headers["x-robots-tag"] == "noindex, nofollow"
