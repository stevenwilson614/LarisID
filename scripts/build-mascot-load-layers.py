#!/usr/bin/env python3
"""Split the four-up Garuda loader sheet into transparent WebPs.

Source is one cream-backed row: binocs body, binocs tool, magnify body, magnify tool.
Cream connected to the image edge becomes transparent. White gloves/feathers stay
because they are not edge-connected beige.
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "images/brand/generated/mascot-load-layers-source.jpg"
OUT_DIR = ROOT / "images/brand"
MAX_W = 560
WEBP_Q = 82
FEATHER = 1.0
PAD = 10
# Crop filename labels under the figures (measured on the 1024x682 sheet).
FIG_TOP = 100
FIG_BOT = 540
CREAM = np.array([247, 243, 231], dtype=np.int16)
CREAM_DIST = 36
MIN_LUM = 220
MAX_SAT = 30
MIN_COMP = 8000

OUTS = (
    "mascot-load-binocs-body.webp",
    "mascot-load-binocs-tool.webp",
    "mascot-load-magnify-body.webp",
    "mascot-load-magnify-tool.webp",
)


def cream_edge_mask(rgb: np.ndarray) -> np.ndarray:
    a = rgb.astype(np.int16)
    dist = np.abs(a - CREAM).sum(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    lum = a.mean(axis=2)
    is_cream = (dist <= CREAM_DIST) & (lum >= MIN_LUM) & (sat <= MAX_SAT)
    h, w = is_cream.shape
    seen = np.zeros((h, w), dtype=bool)
    q = deque()

    def push(y, x):
        if 0 <= y < h and 0 <= x < w and is_cream[y, x] and not seen[y, x]:
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


def components(opaque: np.ndarray):
    h, w = opaque.shape
    visited = np.zeros((h, w), dtype=bool)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if not opaque[y0, x0] or visited[y0, x0]:
                continue
            q = deque([(y0, x0)])
            visited[y0, x0] = True
            ys, xs = [y0], [x0]
            while q:
                y, x = q.popleft()
                for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and opaque[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((ny, nx))
                        ys.append(ny)
                        xs.append(nx)
            if len(xs) >= MIN_COMP:
                comps.append({
                    "n": len(xs),
                    "x0": min(xs), "x1": max(xs),
                    "y0": min(ys), "y1": max(ys),
                    "cx": sum(xs) / len(xs),
                })
    comps.sort(key=lambda c: c["cx"])
    return comps


def crop_comp(rgba: np.ndarray, alpha: np.ndarray, c: dict) -> Image.Image:
    h, w = alpha.shape
    l = max(0, c["x0"] - PAD)
    t = max(0, c["y0"] - PAD)
    r = min(w, c["x1"] + 1 + PAD)
    b = min(h, c["y1"] + 1 + PAD)
    piece = rgba[t:b, l:r].copy()
    piece[:, :, 3] = alpha[t:b, l:r]
    return Image.fromarray(piece, "RGBA")


def resize_max_w(im: Image.Image, max_w: int) -> Image.Image:
    if im.width <= max_w:
        return im
    nh = round(im.height * max_w / im.width)
    return im.resize((max_w, nh), Image.Resampling.LANCZOS)


def main() -> None:
    full = Image.open(SRC).convert("RGB")
    band = full.crop((0, FIG_TOP, full.width, FIG_BOT))
    rgb = np.array(band)
    bg = cream_edge_mask(rgb)
    alpha = np.where(bg, 0, 255).astype("uint8")
    amask = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(FEATHER))
    alpha = np.array(amask)
    rgba = np.dstack([rgb, alpha])
    comps = components(alpha > 16)
    if len(comps) < 4:
        raise SystemExit(f"expected 4 figures, found {len(comps)}")
    comps = comps[:4]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for c, name in zip(comps, OUTS):
        im = resize_max_w(crop_comp(rgba, alpha, c), MAX_W)
        path = OUT_DIR / name
        im.save(path, "WEBP", quality=WEBP_Q, method=6)
        print(f"wrote {path.relative_to(ROOT)} {im.size} from x={c['x0']}-{c['x1']}")


if __name__ == "__main__":
    main()
