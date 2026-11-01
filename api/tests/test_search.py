import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.routers.search import fts_query
from tests.conftest import BROWSER_UA, post, write_manifest


@pytest.fixture
def search_client(tmp_path: Path) -> TestClient:
    write_manifest(
        tmp_path / "dist",
        [
            post(
                "laplace",
                title="The discrete Laplacian",
                dek="Stencils.",
                text="Finite differences.",
            ),
            post(
                "mpi",
                title="Scaling MPI",
                dek="Halo exchange.",
                text="We discuss the Laplacian once, then <script>alert(1)</script> & more.",
                tags=["HPC"],
            ),
            post(
                "gpu", title="Shaders", dek="WGSL.", text="Equivariance on the GPU.", tags=["GPU"]
            ),
        ],
    )
    return TestClient(create_app(), headers={"User-Agent": BROWSER_UA})


def _slugs(client: TestClient, q: str, **params: int) -> list[str]:
    response = client.get("/api/search", params={"q": q, **params})
    assert response.status_code == 200
    return [r["slug"] for r in response.json()["results"]]


def test_title_matches_rank_above_body_matches(search_client: TestClient) -> None:
    with search_client as client:
        assert _slugs(client, "laplacian") == ["laplace", "mpi"]


def test_results_carry_the_api_fields_and_escaped_snippets(search_client: TestClient) -> None:
    with search_client as client:
        response = client.get("/api/search", params={"q": "alert"})
        assert response.headers["cache-control"] == "public, max-age=60"
        [result] = response.json()["results"]
        assert set(result) == {"slug", "url", "title", "dek", "date", "snippet"}
        assert result["url"] == "/blog/mpi/"
        assert result["date"] == "2026-11-12"
        assert "<mark>alert</mark>" in result["snippet"]
        assert "<script>" not in result["snippet"]
        assert "&lt;script&gt;" in result["snippet"]


def test_last_word_matches_as_a_prefix_and_porter_stems(search_client: TestClient) -> None:
    with search_client as client:
        assert _slugs(client, "equivar") == ["gpu"]
        assert _slugs(client, "scale") == ["mpi"]  # porter: scaling -> scale
        assert _slugs(client, "hpc") == ["mpi"]  # tags are indexed


@pytest.mark.parametrize(
    "q", ['"', "OR", "NEAR(", "-", "a:b", "*", "AND NOT", "laplacian OR", "'; DROP TABLE x; --"]
)
def test_fts_syntax_typed_by_visitors_never_errors(search_client: TestClient, q: str) -> None:
    with search_client as client:
        assert client.get("/api/search", params={"q": q}).status_code == 200


def test_empty_query_returns_no_results(search_client: TestClient) -> None:
    with search_client as client:
        assert client.get("/api/search").json() == {"results": []}
        assert client.get("/api/search", params={"q": "  !!  "}).json() == {"results": []}


def test_limit_defaults_to_10_accepts_50_and_is_capped(search_client: TestClient) -> None:
    with search_client as client:
        assert len(_slugs(client, "laplacian", limit=1)) == 1
        assert client.get("/api/search", params={"q": "x", "limit": 50}).status_code == 200
        assert client.get("/api/search", params={"q": "x", "limit": 5000}).status_code == 200
        assert client.get("/api/search", params={"q": "x", "limit": 0}).status_code == 422


def test_search_follows_a_manifest_change(search_client: TestClient, tmp_path: Path) -> None:
    with search_client as client:
        assert _slugs(client, "brand") == []
        path = write_manifest(tmp_path / "dist", [post("new", title="Brand new post")])
        os.utime(path, ns=(10**18, 10**18))
        store = client.app.state.ctx.manifest  # type: ignore[attr-defined]
        store._checked_at = None  # the minute has passed
        assert _slugs(client, "brand") == ["new"]
        assert _slugs(client, "laplacian") == []


def test_search_is_rate_limited_to_60_per_minute(search_client: TestClient) -> None:
    with search_client as client:
        codes = [client.get("/api/search", params={"q": "x"}).status_code for _ in range(61)]
        assert codes[-1] == 429
        assert set(codes[:60]) == {200}


def test_fts_query_quotes_every_term() -> None:
    assert fts_query("gray scott wg") == '"gray" "scott" "wg"*'
    assert fts_query('a"b') == '"a" "b"*'
    assert fts_query("") is None
    assert fts_query(" ".join(["w"] * 30)) == " ".join(['"w"'] * 10) + "*"
