#!/usr/bin/env python3
"""Cut page-title words from the source sheet into transparent PNGs."""
from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "titles-source.png"
OUT_DIR = Path(__file__).resolve().parent

BANDS = [
    ("discover", "dashboard", 54, 146),
    ("deep-dive", "alerts", 183, 282),
    ("mulai-berjualan", "my-toko", 325, 409),
    ("chrome-extension", None, 443, 535),
    ("kredit", None, 559, 645),
]


def _alpha_from_rgb(rgb: np.ndarray) -> np.ndarray:
    white = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 235) & (rgb[:, :, 2] > 235)
    return np.where(white, 0, 255).astype("uint8")


def _split_pair(nonwhite: np.ndarray, y0: int, y1: int) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int]]:
    sub = nonwhite[y0 : y1 + 1, :]
    col = sub.sum(axis=0)
    xs = np.where(col > 0)[0]
    left, right = int(xs[0]), int(xs[-1])
    best = None
    in_gap = False
    gap_start = 0
    for x in range(left, right + 1):
        if col[x] == 0 and not in_gap:
            gap_start = x
            in_gap = True
        elif col[x] > 0 and in_gap:
            gap_len = x - gap_start
            if best is None or gap_len > best[0]:
                best = (gap_len, gap_start, x - 1)
            in_gap = False
    if best is None:
        mid = (left + right) // 2
        return (left, y0, mid, y1), (mid + 1, y0, right, y1)
    _, gap_l, gap_r = best
    split = (gap_l + gap_r) // 2
    left_cols = np.where(col[: split + 1] > 0)[0]
    right_cols = np.where(col[split + 1 :] > 0)[0]
    return (
        (int(left_cols[0]), y0, int(left_cols[-1]), y1),
        (int(right_cols[0] + split + 1), y0, int(right_cols[-1] + split + 1), y1),
    )


def _bbox(nonwhite: np.ndarray, y0: int, y1: int) -> tuple[int, int, int, int]:
    sub = nonwhite[y0 : y1 + 1, :]
    ys, xs = np.where(sub)
    return int(xs.min()), y0, int(xs.max()), y1


def _save_crop(im: Image.Image, box: tuple[int, int, int, int], path: Path, pad: int = 6) -> None:
    l, t, r, b = box
    w, h = im.size
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(w - 1, r + pad)
    b = min(h - 1, b + pad)
    crop = im.crop((l, t, r + 1, b + 1))
    arr = np.array(crop.convert("RGB"))
    out = crop.copy()
    out.putalpha(Image.fromarray(_alpha_from_rgb(arr)))
    out.save(path)
    print("wrote", path, out.size)


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    rgb = np.array(im.convert("RGB"))
    bg = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 235) & (rgb[:, :, 2] > 235)
    nonwhite = ~bg
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for left_name, right_name, y0, y1 in BANDS:
        if right_name:
            left_box, right_box = _split_pair(nonwhite, y0, y1)
            _save_crop(im, left_box, OUT_DIR / f"{left_name}.png")
            _save_crop(im, right_box, OUT_DIR / f"{right_name}.png")
        else:
            _save_crop(im, _bbox(nonwhite, y0, y1), OUT_DIR / f"{left_name}.png")


if __name__ == "__main__":
    main()
