"""Metadata lookup by ISBN (Open Library), arXiv ID (arXiv API) or DOI (Crossref), API.md §5.

Every lookup is best effort: a timeout, an HTTP error or an unexpected payload
returns None, and the admin form stays editable.
"""

import logging
import re

# The stdlib parser is safe here: it never resolves external entities, and the bundled
# expat (>= 2.4.1) limits entity expansion ("billion laughs").
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass
from typing import Any
from urllib.parse import quote

import httpx

log = logging.getLogger(__name__)

TIMEOUT = 5.0
MAX_AUTHORS = 6
_ATOM = "{http://www.w3.org/2005/Atom}"

_ISBN = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")
_ARXIV_NEW = re.compile(r"^\d{4}\.\d{4,5}(?:v\d+)?$")
_ARXIV_OLD = re.compile(r"^[a-z-]+(?:\.[A-Z]{2})?/\d{7}(?:v\d+)?$")
_DOI = re.compile(r"^10\.\d{4,9}/\S+$")
_YEAR = re.compile(r"\b(\d{4})\b")


@dataclass
class LookupResult:
    """Fields to pre-fill in the admin form. Only non-empty values are applied."""

    kind: str
    identifier: str
    title: str = ""
    authors: str = ""
    year: int | None = None
    source: str = ""
    url: str = ""
    cover_url: str = ""

    def form_values(self) -> dict[str, str]:
        """Non-empty fields as form strings."""
        return {k: str(v) for k, v in asdict(self).items() if v not in ("", None)}


def make_client(contact_email: str | None) -> httpx.Client:
    """HTTP client with the 5 s timeout and a descriptive User-Agent (Crossref etiquette).

    Examples
    --------
    .. code-block:: python

        with make_client("me@example.org") as client:
            lookup("978-0262039246", client)
    """
    agent = "sagar-pal.dev reading list (+https://sagar-pal.dev"
    agent += f"; mailto:{contact_email})" if contact_email else ")"
    return httpx.Client(timeout=TIMEOUT, follow_redirects=True, headers={"User-Agent": agent})


def classify(identifier: str) -> tuple[str, str] | None:
    """Return ``(scheme, normalised id)`` for an ISBN, arXiv ID or DOI, else None.

    Examples
    --------
    .. code-block:: python

        classify("arXiv:2206.07697")  # ('arxiv', '2206.07697')
    """
    value = identifier.strip()
    doi = re.sub(r"^(?:https?://(?:dx\.)?doi\.org/|doi:)", "", value, flags=re.IGNORECASE)
    if _DOI.match(doi):
        return ("doi", doi)
    arxiv = re.sub(r"^(?:https?://arxiv\.org/abs/|arxiv:)", "", value, flags=re.IGNORECASE)
    if _ARXIV_NEW.match(arxiv) or _ARXIV_OLD.match(arxiv):
        return ("arxiv", arxiv)
    isbn = re.sub(r"[\s-]", "", value).upper()
    if _ISBN.match(isbn):
        return ("isbn", isbn)
    return None


def _family(name: str) -> str:
    parts = name.split()
    return parts[-1] if parts else ""


def _join_authors(names: list[str]) -> str:
    names = [n for n in names if n]
    shown = ", ".join(names[:MAX_AUTHORS])
    return shown + (" et al." if len(names) > MAX_AUTHORS else "")


def _year(value: object) -> int | None:
    match = _YEAR.search(str(value or ""))
    return int(match.group(1)) if match else None


def _open_library(isbn: str, client: httpx.Client) -> LookupResult:
    response = client.get(f"https://openlibrary.org/isbn/{isbn}.json")
    book: dict[str, Any] = response.raise_for_status().json()
    names = []
    for author in book.get("authors", [])[: MAX_AUTHORS + 1]:
        key = author.get("key", "")
        if re.fullmatch(r"/authors/OL\d+A", key):
            author_response = client.get(f"https://openlibrary.org{key}.json")
            if author_response.is_success:
                names.append(_family(author_response.json().get("name", "")))
    publishers = book.get("publishers") or [""]
    return LookupResult(
        kind="book",
        identifier=isbn,
        title=book.get("title", ""),
        authors=_join_authors(names),
        year=_year(book.get("publish_date")),
        source=publishers[0],
        url=f"https://openlibrary.org/isbn/{isbn}",
        cover_url=f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg",
    )


def _arxiv(arxiv_id: str, client: httpx.Client) -> LookupResult | None:
    response = client.get("https://export.arxiv.org/api/query", params={"id_list": arxiv_id})
    entry = ET.fromstring(response.raise_for_status().content).find(f"{_ATOM}entry")
    # An unknown ID yields no entry, or an entry whose id points at the errors page.
    if entry is None or "api/errors" in (entry.findtext(f"{_ATOM}id") or ""):
        return None
    title = " ".join((entry.findtext(f"{_ATOM}title") or "").split())
    names = [_family(a.findtext(f"{_ATOM}name") or "") for a in entry.findall(f"{_ATOM}author")]
    return LookupResult(
        kind="paper",
        identifier=arxiv_id,
        title=title,
        authors=_join_authors(names),
        year=_year(entry.findtext(f"{_ATOM}published")),
        source="arXiv",
        url=f"https://arxiv.org/abs/{arxiv_id}",
    )


def _crossref(doi: str, client: httpx.Client) -> LookupResult:
    response = client.get(f"https://api.crossref.org/works/{quote(doi, safe='/')}")
    work: dict[str, Any] = response.raise_for_status().json()["message"]
    names = [a.get("family") or a.get("name", "") for a in work.get("author", [])]
    parts = (work.get("issued") or {}).get("date-parts") or [[None]]
    container = work.get("container-title") or []
    paper_types = {"journal-article", "proceedings-article", "posted-content", "book-chapter"}
    return LookupResult(
        kind="paper" if work.get("type") in paper_types else "article",
        identifier=doi,
        title=" ".join((work.get("title") or [""])[0].split()),
        authors=_join_authors(names),
        year=_year(parts[0][0]),
        source=container[0] if container else work.get("publisher", ""),
        url=work.get("URL") or f"https://doi.org/{doi}",
    )


def lookup(identifier: str, client: httpx.Client) -> LookupResult | None:
    """Fetch metadata for an identifier; None when unknown or when the service fails.

    Examples
    --------
    .. code-block:: python

        with make_client(None) as client:
            result = lookup("10.1038/s41586-021-03819-2", client)
    """
    kind = classify(identifier)
    if kind is None:
        return None
    scheme, value = kind
    try:
        if scheme == "isbn":
            return _open_library(value, client)
        if scheme == "arxiv":
            return _arxiv(value, client)
        return _crossref(value, client)
    except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError, ET.ParseError) as exc:
        log.warning("lookup failed for %s: %s", scheme, type(exc).__name__)
        return None
