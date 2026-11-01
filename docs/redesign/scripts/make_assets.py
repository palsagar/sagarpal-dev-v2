#!/usr/bin/env python3
"""Regenerate the static imagery for the sagar-pal.dev redesign (Carina palette).

Everything here is a real solution of the Gray-Scott model, in Karl Sims's
normalisation (Du = 1.0, Dv = 0.5, dt = 1, 9-point Laplacian, periodic grid):

    du/dt = Du lap(u) - u v^2 + F (1 - u)
    dv/dt = Dv lap(v) + u v^2 - (F + k) v

Outputs (into --out, default ./out):
  field-hero-night.jpg / field-hero-day.jpg   hero poster (also the no-WebGL / reduced-motion fallback)
  fig-mitosis-night.jpg / fig-mitosis-day.jpg  example post figure (F=0.0367, k=0.0649)

Optional: --favicon DIR writes favicon.ico (16/32/48) and apple-touch-icon.png (180): a single
coral colony (F=0.0545, k=0.062) on the night ground.

Optional: --duotone IN.png OUT.jpg [--invert] recolours a screenshot (e.g. of FlowLab or
the Gray-Scott app) into the night palette, as used for the project thumbnails.

Usage:
  uv run --with numpy --with scipy --with pillow make_assets.py --out ../assets
  uv run --with numpy --with scipy --with pillow make_assets.py --favicon ../../../web/public
  uv run --with numpy --with scipy --with pillow make_assets.py --duotone shot.png project.jpg --invert
"""
import argparse
import os

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

# --- colormaps (keep in sync with docs/redesign/DESIGN.md "Field colormaps") -------------
NIGHT_FIELD = [(0.0, "#0A0E16"), (0.3, "#0C131E"), (0.42, "#11414D"), (0.57, "#2C9AA6"),
               (0.68, "#6FC0B6"), (0.80, "#E39A45"), (0.92, "#F7CC88"), (1.0, "#FFF4DE")]
DAY_FIELD = [(0.0, "#F3F4F6"), (0.40, "#E2EBEE"), (0.56, "#93C3CA"), (0.70, "#23707C"),
             (0.84, "#12404C"), (1.0, "#C9822F")]
NIGHT_DUOTONE = [(0.0, "#0A0E16"), (0.3, "#0E1C27"), (0.5, "#17505B"), (0.66, "#2C9AA6"),
                 (0.8, "#E39A45"), (0.93, "#F7CC88"), (1.0, "#FFF4DE")]
NIGHT_GROUND, DAY_GROUND = "#0A0E16", "#F3F4F6"


def lap(a):
    return (-a
            + 0.2 * (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1))
            + 0.05 * (np.roll(np.roll(a, 1, 0), 1, 1) + np.roll(np.roll(a, 1, 0), -1, 1)
                      + np.roll(np.roll(a, -1, 0), 1, 1) + np.roll(np.roll(a, -1, 0), -1, 1)))


def step(u, v, F, k, n):
    for _ in range(n):
        uvv = u * v * v
        u += lap(u) - uvv + F * (1 - u)
        v += 0.5 * lap(v) + uvv - (F + k) * v
    return u, v


def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def colorize(x, stops):
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.stack([hex2rgb(s[1]) for s in stops])
    out = np.empty(x.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(x, pos, cols[:, c])
    return np.clip(out, 0, 255).astype(np.uint8)


def norm(v, lo=0.0, hi=None):
    hi = np.percentile(v, 99.6) if hi is None else hi
    return np.clip((v - lo) / (hi - lo + 1e-9), 0, 1)


def bloom(img, sigma, amt):
    a = img.astype(np.float32)
    b = np.stack([gaussian_filter(a[..., c], sigma) for c in range(3)], -1)
    return np.clip(a + amt * b, 0, 255).astype(np.uint8)


def fbm(h, w, seed):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w))
    for sig, amp in [(60, 1.0), (30, 0.5), (14, 0.28), (6, 0.12)]:
        acc += amp * gaussian_filter(r.standard_normal((h, w)), sig, mode="wrap")
    return (acc - acc.min()) / (acc.max() - acc.min())


def tint(base, mask, hexcol, alpha):
    c = hex2rgb(hexcol)
    a = base.astype(np.float32)
    m = alpha * mask[..., None]
    return np.clip(a * (1 - m) + c * m, 0, 255).astype(np.uint8)


def hero_field(steps):
    """Coral colonies (F=0.0545, k=0.062) growing from six noisy discs."""
    h, w = 560, 440
    rng = np.random.default_rng(21)
    u = np.ones((h, w), np.float32)
    v = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w]
    for cy, cx, r in [(90, 330, 14), (250, 120, 10), (420, 300, 12), (520, 60, 8), (330, 400, 7), (160, 40, 6)]:
        m = ((yy - cy) ** 2 + (xx - cx) ** 2) < (r * (1 + 0.35 * rng.random((h, w)))) ** 2
        v[m], u[m] = 1.0, 0.5
    v += 0.03 * rng.random((h, w), dtype=np.float32)
    return step(u, v, 0.0545, 0.062, steps)[1]


def mitosis_field(steps):
    h, w = 300, 640
    rng = np.random.default_rng(7)
    u = np.ones((h, w), np.float32)
    v = np.zeros((h, w), np.float32)
    for _ in range(40):
        r = rng.integers(4, 12)
        y, x = rng.integers(r, h - r), rng.integers(r, w - r)
        v[y - r:y + r, x - r:x + r], u[y - r:y + r, x - r:x + r] = 1.0, 0.5
    v += 0.02 * rng.random((h, w), dtype=np.float32)
    return step(u, v, 0.0367, 0.0649, steps)[1]


def favicon_field():
    """One coral colony (F=0.0545, k=0.062) grown from a noisy central disc, cropped tight."""
    n = 128
    rng = np.random.default_rng(5)
    u = np.ones((n, n), np.float32)
    v = np.zeros((n, n), np.float32)
    yy, xx = np.mgrid[0:n, 0:n]
    m = ((yy - n / 2) ** 2 + (xx - n / 2) ** 2) < (8 * (1 + 0.35 * rng.random((n, n)))) ** 2
    v[m], u[m] = 1.0, 0.5
    v += 0.02 * rng.random((n, n), dtype=np.float32)
    v = step(u, v, 0.0545, 0.062, 2500)[1]
    c = 12  # crop margin: the colony fills most of the tile
    return v[c:n - c, c:n - c]


def make_favicon(out):
    os.makedirs(out, exist_ok=True)
    img = Image.fromarray(bloom(colorize(norm(favicon_field()), NIGHT_FIELD), 2, 0.3))
    img.resize((180, 180), Image.LANCZOS).save(os.path.join(out, "apple-touch-icon.png"), optimize=True)
    img.resize((48, 48), Image.LANCZOS).save(os.path.join(out, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote", os.path.join(out, "favicon.ico"), "and apple-touch-icon.png")


def save(arr, path, size):
    Image.fromarray(arr).resize(size, Image.LANCZOS).convert("RGB").save(path, quality=88, optimize=True)
    print("wrote", path)


def make_all(out, quick):
    os.makedirs(out, exist_ok=True)
    v = hero_field(600 if quick else 4200)
    x = norm(v)
    h, w = v.shape
    gas1, gas2 = fbm(h, w, 1) ** 2.2, fbm(h, w, 2) ** 2.6
    m = np.clip(x * 1.6, 0, 1)[..., None]
    # night: faint nebular gas (teal + rust) under the pattern, then a soft bloom
    bg = np.zeros((h, w, 3), np.uint8) + hex2rgb(NIGHT_GROUND).astype(np.uint8)
    bg = tint(tint(bg, gas1, "#1F5966", 0.6), gas2, "#6A3416", 0.55)
    night = bloom((bg * (1 - m) + colorize(x, NIGHT_FIELD) * m).astype(np.uint8), 9, 0.32)
    save(night, os.path.join(out, "field-hero-night.jpg"), (1100, 1400))
    bgl = np.zeros((h, w, 3), np.uint8) + hex2rgb(DAY_GROUND).astype(np.uint8)
    bgl = tint(tint(bgl, gas1, "#BFD6DB", 0.5), gas2, "#EBCFB0", 0.45)
    day = (bgl * (1 - m) + colorize(x, DAY_FIELD) * m).astype(np.uint8)
    save(day, os.path.join(out, "field-hero-day.jpg"), (1100, 1400))

    v = mitosis_field(900 if quick else 9000)
    x = norm(v, lo=np.percentile(v, 1))
    save(bloom(colorize(x, NIGHT_FIELD), 6, 0.3), os.path.join(out, "fig-mitosis-night.jpg"), (1600, 750))
    save(colorize(x, DAY_FIELD), os.path.join(out, "fig-mitosis-day.jpg"), (1600, 750))


def duotone(src, dst, invert):
    a = np.asarray(Image.open(src).convert("L"), np.float32) / 255.0
    if invert:  # e.g. FlowLab: dark dye on a light background
        a = np.clip((1 - a - 0.08) / 0.9, 0, 1)
    img = bloom(colorize(a, NIGHT_DUOTONE), 5, 0.25)
    Image.fromarray(img).convert("RGB").save(dst, quality=88, optimize=True)
    print("wrote", dst)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="out")
    p.add_argument("--quick", action="store_true", help="few steps, for a smoke test")
    p.add_argument("--duotone", nargs=2, metavar=("IN", "OUT"))
    p.add_argument("--favicon", metavar="DIR")
    p.add_argument("--invert", action="store_true")
    a = p.parse_args()
    if a.favicon:
        make_favicon(a.favicon)
    elif a.duotone:
        duotone(a.duotone[0], a.duotone[1], a.invert)
    else:
        make_all(a.out, a.quick)
