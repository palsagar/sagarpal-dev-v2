# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools>=4.60", "brotli>=1.1"]
# ///
"""Trim the Archivo variable font to the axis ranges the site uses.

Fontsource's Archivo carries width 62-125 % and weight 100-900 (90 KB for the
Latin subset). The design uses width 100-115 % and weight 400-720, so the
instancer keeps width 100-115 and weight 400-800 (headroom for bold). The Latin
file drops to about 56 KB. Glyphs inside those ranges are unchanged.

Inputs: the three Fontsource subsets in web/node_modules (run `npm ci` in web/
first; the version is pinned by web/package-lock.json).
Outputs: web/src/assets/fonts/archivo-{subset}-trimmed.woff2, declared in
web/src/styles/fonts.css. `tests/e2e/fonts.spec.ts` fails if the site uses a
width or weight outside these ranges; widen them here and rerun if it must.

Archivo is under the SIL Open Font License 1.1 with no Reserved Font Name, so
a modified copy may keep its name. The licence text ships next to the files.

Usage:
    uv run docs/redesign/scripts/trim_archivo.py
"""

import shutil
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "web/node_modules/@fontsource-variable/archivo"
OUT = ROOT / "web/src/assets/fonts"
LIMITS = {"wdth": (100, 115), "wght": (400, 800)}
SUBSETS = ("latin", "latin-ext", "vietnamese")


def main() -> None:
    """Write the trimmed woff2 files and the licence into web/src/assets/fonts.

    Examples
    --------
    .. code-block:: console

        $ uv run docs/redesign/scripts/trim_archivo.py
    """
    OUT.mkdir(parents=True, exist_ok=True)
    for subset in SUBSETS:
        # Pin the two axes to the used ranges; everything inside them is unchanged.
        source = SRC / f"files/archivo-{subset}-wdth-normal.woff2"
        font = instancer.instantiateVariableFont(TTFont(source), LIMITS)
        font.flavor = "woff2"
        target = OUT / f"archivo-{subset}-trimmed.woff2"
        font.save(target)
        print(f"{target.name}: {source.stat().st_size} -> {target.stat().st_size} bytes")
    shutil.copy(SRC / "LICENSE", OUT / "Archivo-OFL.txt")


if __name__ == "__main__":
    main()
