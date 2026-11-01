from datetime import date, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.models import ReadingItem
from app.schemas import ReadingItemIn, reading_label


def _add(client: TestClient, **fields: Any) -> int:
    values: dict[str, Any] = {"kind": "book", "title": "T", "status": "reading", **fields}
    with client.app.state.ctx.sessions() as session:  # type: ignore[attr-defined]
        item = ReadingItem(**values)
        session.add(item)
        session.commit()
        return item.id


def test_empty_list_has_zero_counts_and_no_store(client: TestClient) -> None:
    response = client.get("/api/reading")
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "items": [],
        "counts": {"all": 0, "book": 0, "paper": 0, "article": 0},
    }


def test_order_groups_by_status_then_each_status_date(client: TestClient) -> None:
    _add(client, title="old read", started_on=date(2026, 9, 1))
    _add(client, title="new read", started_on=date(2026, 10, 1))
    _add(client, title="undated read")
    _add(client, title="finished long ago", status="finished", finished_on=date(2025, 1, 1))
    _add(client, title="finished lately", status="finished", finished_on=date(2026, 8, 1))
    _add(client, title="queued first", status="queued", created_at=datetime(2026, 1, 1))
    _add(client, title="queued later", status="queued", created_at=datetime(2026, 2, 1))

    titles = [item["title"] for item in client.get("/api/reading").json()["items"]]
    assert titles == [
        "new read",
        "old read",
        "undated read",
        "finished lately",
        "finished long ago",
        "queued later",
        "queued first",
    ]


def test_hidden_and_deleted_items_are_not_public(client: TestClient) -> None:
    _add(client, title="shown")
    _add(client, title="hidden", published=False)
    _add(client, title="deleted", deleted_at=datetime(2026, 10, 1))
    data = client.get("/api/reading").json()
    assert [i["title"] for i in data["items"]] == ["shown"]
    assert data["counts"]["all"] == 1


def test_filters_and_counts(client: TestClient) -> None:
    _add(client, kind="book")
    _add(client, kind="paper")
    _add(client, kind="paper", status="finished")
    _add(client, kind="article", status="queued")

    papers = client.get("/api/reading", params={"kind": "paper"}).json()
    assert [i["kind"] for i in papers["items"]] == ["paper", "paper"]
    # counts ignore the kind filter, so the filter pills can show every count
    assert papers["counts"] == {"all": 4, "book": 1, "paper": 2, "article": 1}

    reading = client.get("/api/reading", params={"status": "reading"}).json()
    assert reading["counts"] == {"all": 2, "book": 1, "paper": 1, "article": 0}
    assert client.get("/api/reading", params={"status": "nope"}).status_code == 422


def test_items_have_the_public_fields_and_a_label(client: TestClient) -> None:
    _add(
        client,
        kind="article",
        title="The Bitter Lesson",
        status="finished",
        finished_on=date(2026, 10, 3),
        verb="reread",
        note="Still true.",
    )
    [item] = client.get("/api/reading").json()["items"]
    assert item["label"] == "Article, reread October 2026"
    assert set(item) == {
        "id",
        "kind",
        "title",
        "authors",
        "year",
        "source",
        "url",
        "identifier",
        "cover_url",
        "status",
        "started_on",
        "finished_on",
        "note",
        "label",
    }
    assert "published" not in item and "deleted_at" not in item


@pytest.mark.parametrize(
    ("args", "label"),
    [
        (("book", "reading", None, date(2026, 10, 2), None, None), "Book, started October 2026"),
        (
            ("paper", "finished", None, None, date(2026, 9, 9), None),
            "Paper, finished September 2026",
        ),
        (("paper", "queued", None, None, None, datetime(2026, 1, 5)), "Paper, added January 2026"),
        (("book", "reading", None, None, None, None), "Book"),
        (
            ("article", "finished", "reread", None, date(2026, 10, 3), None),
            "Article, reread October 2026",
        ),
    ],
)
def test_reading_label(args: tuple[Any, ...], label: str) -> None:
    assert reading_label(*args) == label


def test_input_validation() -> None:
    base = {"kind": "book", "title": "T", "status": "reading"}
    item = ReadingItemIn.model_validate({**base, "year": "", "url": " ", "note": "  why  "})
    assert item.year is None and item.url is None and item.note == "why"
    for bad in [
        {"url": "javascript:alert(1)"},
        {"cover_url": "data:image/png;base64,AAAA"},
        {"url": "https://"},
        {"note": "x" * 281},
        {"kind": "film"},
        {"title": "   "},
    ]:
        with pytest.raises(ValidationError):
            ReadingItemIn.model_validate({**base, **bad})
    assert ReadingItemIn.model_validate({**base, "url": "https://arxiv.org/abs/1"}).url
