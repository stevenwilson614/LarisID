#!/usr/bin/env python3
"""Split the Trending Sekarang 1/2/3 place sheet into transparent WebPs.

Source is trophy + silver medal + bronze medal on black.
Only near-black pixels connected to the image edge become transparent.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "images/brand/generated/trend-place-source.jpg"
OUT_DIR = ROOT / "images/brand"
MAX_W = 200
WEBP_Q = 85
DARK = 22
FEATHER = 0.9
PAD = 8
# Gaps between the three icons (column occupancy of the source).
SPLITS = ((90, 380), (420, 620), (720, 920))


def edge_dark_mask(rgb: np.ndarray, dark: int) -> np.ndarray:
    h, w, _ = rgb.shape
    dark_px = (rgb.max(axis=2) <= dark)
    seen = np.zeros((h, w), dtype=bool)
    q = deque()

    def push(y, x):
        if 0 <= y < h and 0 <= x < w and dark_px[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)

    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            push(y + dy, x + dx)
    return seen


def knockout(im: Image.Image) -> Image.Image:
    rgb = np.array(im.convert("RGB"))
    bg = edge_dark_mask(rgb, DARK)
    alpha = np.where(bg, 0, 255).astype("uint8")
    amask = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(FEATHER))
    out = im.convert("RGBA")
    out.putalpha(amask)
    bbox = amask.getbbox()
    if not bbox:
        return out
    l, t, r, b = bbox
    w, h = out.size
    return out.crop((max(0, l - PAD), max(0, t - PAD), min(w, r + PAD), min(h, b + PAD)))


def resize_max_w(im: Image.Image, max_w: int) -> Image.Image:
    if im.width <= max_w:
        return im
    h = round(im.height * max_w / im.width)
    return im.resize((max_w, h), Image.Resampling.LANCZOS)


def save_webp(im: Image.Image, path: Path) -> None:
    im = resize_max_w(im, MAX_W)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=WEBP_Q, method=6)
    print(f"wrote {path.relative_to(ROOT)} {im.size}")


def main() -> None:
    full = Image.open(SRC)
    h = full.size[1]
    for i, (x0, x1) in enumerate(SPLITS, 1):
        cut = knockout(full.crop((x0, 0, x1, h)))
        save_webp(cut, OUT_DIR / f"trend-place-{i}.webp")


if __name__ == "__main__":
    main()
