#!/usr/bin/env python3
"""Remove white background; punch transparent holes in strap perforations."""
import sys
from collections import deque

from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else "images/story/watch-raw.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "images/story/watch.png"
TOL = int(sys.argv[3]) if len(sys.argv) > 3 else 32

im = Image.open(SRC).convert("RGB")
w, h = im.size
SENT = (1, 254, 2)

work = im.copy()
for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(work, corner, SENT, thresh=TOL)

arr = np.array(work)
bg = (arr[:, :, 0] < 10) & (arr[:, :, 1] > 245) & (arr[:, :, 2] < 10)
alpha = np.where(bg, 0, 255).astype("uint8")
rgb = np.array(im)


def flood_from_edges(mask: np.ndarray) -> np.ndarray:
    """Pixels in mask connected to any image border."""
    h2, w2 = mask.shape
    external = np.zeros_like(mask, dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for x in range(w2):
        for y in (0, h2 - 1):
            if mask[y, x] and not external[y, x]:
                external[y, x] = True
                q.append((y, x))
    for y in range(h2):
        for x in (0, w2 - 1):
            if mask[y, x] and not external[y, x]:
                external[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h2 and 0 <= nx < w2 and mask[ny, nx] and not external[ny, nx]:
                external[ny, nx] = True
                q.append((ny, nx))
    return external


def punch_interior_light(alpha_in: np.ndarray, light_thresh: int = 198) -> np.ndarray:
    """Turn enclosed near-white regions (strap holes) transparent."""
    a = alpha_in.copy()
    light = (rgb.mean(axis=2) >= light_thresh) & (a > 127)
    external = flood_from_edges(light)
    a[light & ~external] = 0
    return a


alpha = punch_interior_light(alpha)

amask = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.4))

out = im.convert("RGBA")
out.putalpha(amask)

bbox = amask.getbbox()
if bbox:
    pad = 14
    l, t, r, b = bbox
    out = out.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b + pad)))

out.save(OUT)
print("wrote", OUT, out.size)
