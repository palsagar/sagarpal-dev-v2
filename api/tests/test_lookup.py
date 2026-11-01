import httpx
import pytest

from app.services.lookup import classify, lookup, make_client


def _client(routes: dict[str, httpx.Response]) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        key = f"{request.url.host}{request.url.path}"
        return routes.get(key, httpx.Response(404))

    return httpx.Client(transport=httpx.MockTransport(handler))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("978-0-262-03924-6", ("isbn", "9780262039246")),
        ("026203924X", ("isbn", "026203924X")),
        ("arXiv:2206.07697", ("arxiv", "2206.07697")),
        ("https://arxiv.org/abs/2206.07697v2", ("arxiv", "2206.07697v2")),
        ("hep-th/9901001", ("arxiv", "hep-th/9901001")),
        ("10.1038/s41586-021-03819-2", ("doi", "10.1038/s41586-021-03819-2")),
        ("https://doi.org/10.1103/PhysRevLett.1", ("doi", "10.1103/PhysRevLett.1")),
        ("doi:10.1000/xyz", ("doi", "10.1000/xyz")),
        ("not an id", None),
        ("12345", None),
    ],
)
def test_classify(raw: str, expected: tuple[str, str] | None) -> None:
    assert classify(raw) == expected


def test_open_library_book_with_authors_and_cover() -> None:
    client = _client(
        {
            "openlibrary.org/isbn/9780262039246.json": httpx.Response(
                200,
                json={
                    "title": "Reinforcement Learning",
                    "publishers": ["MIT Press"],
                    "publish_date": "Nov 13, 2018",
                    "authors": [{"key": "/authors/OL1A"}, {"key": "/authors/OL2A"}],
                },
            ),
            "openlibrary.org/authors/OL1A.json": httpx.Response(
                200, json={"name": "Richard S. Sutton"}
            ),
            "openlibrary.org/authors/OL2A.json": httpx.Response(500),
        }
    )
    result = lookup("978-0-262-03924-6", client)
    assert result is not None
    assert result.form_values() == {
        "kind": "book",
        "identifier": "9780262039246",
        "title": "Reinforcement Learning",
        "authors": "Sutton",
        "year": "2018",
        "source": "MIT Press",
        "url": "https://openlibrary.org/isbn/9780262039246",
        "cover_url": "https://covers.openlibrary.org/b/isbn/9780262039246-L.jpg",
    }


def test_arxiv_unknown_id_is_none() -> None:
    error_feed = (
        '<feed xmlns="http://www.w3.org/2005/Atom"><entry>'
        "<id>http://arxiv.org/api/errors#incorrect_id</id><title>Error</title></entry></feed>"
    )
    client = _client({"export.arxiv.org/api/query": httpx.Response(200, text=error_feed)})
    assert lookup("2206.99999", client) is None
    empty = '<feed xmlns="http://www.w3.org/2005/Atom"></feed>'
    client = _client({"export.arxiv.org/api/query": httpx.Response(200, text=empty)})
    assert lookup("2206.99999", client) is None
    client = _client({"export.arxiv.org/api/query": httpx.Response(200, text="<not xml")})
    assert lookup("2206.99999", client) is None


def test_crossref_paper_with_many_authors() -> None:
    authors = [{"given": "A", "family": f"Author{i}"} for i in range(8)]
    client = _client(
        {
            "api.crossref.org/works/10.1038/s41586-021-03819-2": httpx.Response(
                200,
                json={
                    "message": {
                        "type": "journal-article",
                        "title": ["Highly accurate protein structure prediction"],
                        "author": authors,
                        "issued": {"date-parts": [[2021, 7, 15]]},
                        "container-title": ["Nature"],
                        "URL": "https://doi.org/10.1038/s41586-021-03819-2",
                    }
                },
            )
        }
    )
    result = lookup("10.1038/s41586-021-03819-2", client)
    assert result is not None
    assert result.kind == "paper"
    assert result.year == 2021
    assert result.source == "Nature"
    assert result.authors == "Author0, Author1, Author2, Author3, Author4, Author5 et al."


def test_crossref_other_types_are_articles_and_fall_back_to_the_publisher() -> None:
    message = {"type": "report", "title": ["A report"], "publisher": "Some Lab"}
    client = _client(
        {"api.crossref.org/works/10.1000/xyz": httpx.Response(200, json={"message": message})}
    )
    result = lookup("10.1000/xyz", client)
    assert result is not None
    assert (result.kind, result.source, result.url) == (
        "article",
        "Some Lab",
        "https://doi.org/10.1000/xyz",
    )


@pytest.mark.parametrize(
    "response",
    [httpx.Response(404), httpx.Response(200, text="not json"), httpx.Response(200, json={})],
)
def test_service_failures_return_none(response: httpx.Response) -> None:
    client = _client({"api.crossref.org/works/10.1000/xyz": response})
    assert lookup("10.1000/xyz", client) is None


def test_unrecognised_identifiers_make_no_request() -> None:
    def fail(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    with httpx.Client(transport=httpx.MockTransport(fail)) as client:
        assert lookup("hello", client) is None


def test_user_agent_names_the_site_and_the_optional_contact() -> None:
    with make_client(None) as client:
        assert client.headers["user-agent"] == "sagar-pal.dev reading list (+https://sagar-pal.dev)"
        assert client.timeout.connect == 5.0
    with make_client("me@example.org") as client:
        assert "mailto:me@example.org" in client.headers["user-agent"]


def test_dois_are_percent_encoded_in_the_crossref_url() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        lookup("10.1002/(SICI)1097-4636(199706)35:4<1::AID>3.0.CO;2-#", client)
    assert seen[0].endswith(
        "/works/10.1002/%28SICI%291097-4636%28199706%2935%3A4%3C1%3A%3AAID%3E3.0.CO%3B2-%23"
    )
