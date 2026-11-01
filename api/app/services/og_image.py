"""1200×630 Open Graph cards drawn with Pillow (API.md §7)."""

import hashlib
import io
import re
import tempfile
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

APP_DIR = Path(__file__).resolve().parent.parent
FONT_SANS = APP_DIR / "fonts" / "Archivo-Variable.ttf"
FONT_SERIF = APP_DIR / "fonts" / "SourceSerif4-Variable.ttf"
BACKGROUND = APP_DIR / "assets" / "field-hero-night.jpg"

# Bump when the drawing changes, so cached cards are redrawn.
RENDER_VERSION = "1"
SHADE = 0.55  # opacity of the black layer under the text
WIDTH, HEIGHT = 1200, 630
MARGIN = 80
TEXT_WIDTH = 920
INK = (238, 234, 226)  # --ink (night)
INK_2 = (196, 200, 208)  # a little lighter than --ink-2, for contrast on the field
AMBER = (242, 166, 74)  # #F2A64A

DEFAULT_TITLE = "Sagar Pal"
DEFAULT_DEK = (
    "I work at the intersection of scientific computing, AI for science "
    "and high-performance ML systems."
)

FontType = ImageFont.FreeTypeFont


@lru_cache(maxsize=8)
def _font(path: Path, size: int, axes: tuple[int, int]) -> FontType:
    font = ImageFont.truetype(str(path), size)
    font.set_variation_by_axes(list(axes))
    return font


def title_font(size: int) -> FontType:
    """Archivo at weight 640, normal width (axes: weight, width)."""
    return _font(FONT_SANS, size, (640, 100))


def dek_font(size: int = 28) -> FontType:
    """Source Serif 4 at weight 400 (axes: weight, optical size)."""
    return _font(FONT_SERIF, size, (400, min(size, 60)))


def wrap(text: str, font: FontType, width: int, max_lines: int) -> tuple[list[str], bool]:
    """Greedy word wrap; returns the lines and whether text was cut (last line gets "…").

    Examples
    --------
    .. code-block:: python

        lines, cut = wrap("A long title", title_font(64), 920, 3)
    """
    lines: list[str] = []
    for word in text.split():
        candidate = f"{lines[-1]} {word}" if lines else word
        if lines and font.getlength(candidate) <= width:
            lines[-1] = candidate
        else:
            lines.append(word)
    if len(lines) <= max_lines:
        return lines, False
    kept = lines[:max_lines]
    last = kept[-1]
    while last and font.getlength(last + "…") > width:
        last = last.rsplit(" ", 1)[0] if " " in last else last[:-1]
    kept[-1] = last + "…"
    return kept, True


def _background() -> Image.Image:
    # Cover-crop the portrait field image to 1200×630, then darken under the text.
    image = Image.open(BACKGROUND).convert("RGB")
    scale = max(WIDTH / image.width, HEIGHT / image.height)
    image = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS
    )
    left = (image.width - WIDTH) // 2
    top = (image.height - HEIGHT) // 2
    image = image.crop((left, top, left + WIDTH, top + HEIGHT))
    # Black at SHADE over the text column, fading out towards the right edge. API.md asks
    # for 30 %; at that level the serif dek is hard to read over the bright corals.
    shade = Image.new("L", (WIDTH, HEIGHT), 0)
    fade_start, fade_end = MARGIN + TEXT_WIDTH - 200, WIDTH
    for x in range(WIDTH):
        if x < fade_start:
            alpha = SHADE
        else:
            alpha = SHADE * max(0.0, 1 - (x - fade_start) / (fade_end - fade_start))
        shade.paste(round(alpha * 255), (x, 0, x + 1, HEIGHT))
    return Image.composite(Image.new("RGB", image.size, (0, 0, 0)), image, shade)


def render_card(title: str, dek: str) -> bytes:
    """Draw a card and return PNG bytes.

    The title is Archivo 64px on at most 3 lines; when it needs more, it shrinks
    to 52px, and is cut with "…" only if it still does not fit. The dek is
    Source Serif 28px on at most 2 lines. "sagar-pal.dev" sits bottom-left in amber.

    Examples
    --------
    .. code-block:: python

        png = render_card("Gray–Scott in WGSL", "Reaction–diffusion on the GPU.")
    """
    image = _background()
    draw = ImageDraw.Draw(image)
    size = 64
    lines, cut = wrap(title, title_font(size), TEXT_WIDTH, 3)
    if cut:
        size = 52
        lines, _ = wrap(title, title_font(size), TEXT_WIDTH, 3)
    font = title_font(size)
    y = 120
    line_height = round(size * 1.12)
    for line in lines:
        draw.text((MARGIN, y), line, font=font, fill=INK)
        y += line_height
    y += 28
    serif = dek_font()
    dek_lines, _ = wrap(dek, serif, TEXT_WIDTH, 2)
    for line in dek_lines:
        draw.text((MARGIN, y), line, font=serif, fill=INK_2)
        y += 40
    draw.text((MARGIN, HEIGHT - 72), "sagar-pal.dev", font=title_font(28), fill=AMBER, anchor="ls")
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def card_hash(title: str, dek: str) -> str:
    """Short content hash for the cache file name; changes with the text or the drawing."""
    digest = hashlib.sha256(f"{RENDER_VERSION}\0{title}\0{dek}".encode()).hexdigest()
    return digest[:16]


def cached_card(cache_dir: Path, name: str, title: str, dek: str) -> Path:
    """Return the PNG path for this card, drawing it first when no cached copy exists.

    Older cards for the same name are removed. The file is written to a temporary
    name and renamed, so a reader never sees half a PNG.

    Examples
    --------
    .. code-block:: python

        path = cached_card(Path("/data/og-cache"), "default", DEFAULT_TITLE, DEFAULT_DEK)
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{name}-{card_hash(title, dek)}.png"
    if path.is_file():
        return path
    with tempfile.NamedTemporaryFile(dir=cache_dir, suffix=".tmp", delete=False) as tmp:
        tmp.write(render_card(title, dek))
    Path(tmp.name).replace(path)
    stale = re.compile(rf"{re.escape(name)}-[0-9a-f]{{16}}\.png")
    for old in cache_dir.iterdir():
        if old != path and stale.fullmatch(old.name):
            old.unlink(missing_ok=True)
    return path
