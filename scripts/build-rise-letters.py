"""Cut L, A, R, I, S, E and the rising arrow out of the LARISE artwork.

The italic letters interlock — several bounding boxes overlap a neighbour — so
each glyph is masked to its own connected components rather than rectangle-
cropped. Output is white ink + alpha so CSS can paint each letter cream or gold
from one asset, and the natural geometry is emitted as JSON so the animation can
reproduce the logo's exact kerning.
"""
import json
import os
from collections import deque
import numpy as np
from PIL import Image

SRC = 'images/brand/larise-source.png'
OUT = 'images/rise/letters'
PAD = 6
BG = np.array([241., 231., 213.])

# Letter x-windows measured off the artwork; the arrow is the one wide component.
WINDOWS = {'l': (633, 787), 'a': (782, 959), 'r': (971, 1146),
           'i': (1134, 1233), 's': (1202, 1379), 'e': (1345, 1517)}
WORD_X0, WORD_Y0 = 633, 355          # origin of the LARISE letter block

im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(float)
ink = np.sqrt(((a - BG) ** 2).sum(axis=2)) > 60
H, W = ink.shape


def label(mask):
    lab = np.zeros(mask.shape, np.int32)
    stats, nid = [], 0
    h, w = mask.shape
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or lab[sy, sx]:
                continue
            nid += 1
            q = deque([(sy, sx)]); lab[sy, sx] = nid
            x0 = x1 = sx; y0 = y1 = sy; n = 0
            while q:
                y, x = q.popleft(); n += 1
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
                for dy in (-1, 0, 1):
                    ny = y + dy
                    if ny < 0 or ny >= h: continue
                    for dx in (-1, 0, 1):
                        nx = x + dx
                        if 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = nid; q.append((ny, nx))
            stats.append((x0, y0, x1, y1, n, nid))
    return lab, stats


def dilate(m, r=2):
    out = m.copy()
    for _ in range(r):
        g = out.copy()
        g[1:, :] |= out[:-1, :]; g[:-1, :] |= out[1:, :]
        g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]
        out = g
    return out


lab, stats = label(ink)
word = [c for c in stats if c[0] >= 620 and c[4] > 300]      # drop the phoenix
arrow = max(word, key=lambda c: c[2] - c[0])                  # widest = the arrow
glyph_comps = {k: [] for k in WINDOWS}
for c in word:
    if c[5] == arrow[5]:
        continue
    best = max(WINDOWS, key=lambda k: min(c[2], WINDOWS[k][1]) - max(c[0], WINDOWS[k][0]))
    glyph_comps[best].append(c)

os.makedirs(OUT, exist_ok=True)
geo = {}


def emit(name, comps):
    x0 = min(c[0] for c in comps); y0 = min(c[1] for c in comps)
    x1 = max(c[2] for c in comps); y1 = max(c[3] for c in comps)
    box = (max(0, x0 - PAD), max(0, y0 - PAD), min(W, x1 + 1 + PAD), min(H, y1 + 1 + PAD))
    crop = np.asarray(im.crop(box)).astype(float)
    d = np.sqrt(((crop - BG) ** 2).sum(axis=2))
    alpha = np.clip((d - 30) / 60.0, 0, 1)
    own = dilate(np.isin(lab[box[1]:box[3], box[0]:box[2]], [c[5] for c in comps]), 2)
    alpha *= own
    rgba = np.dstack([np.full(crop.shape, 255, np.uint8), (alpha * 255).astype(np.uint8)])
    path = f'{OUT}/{name}.webp'
    Image.fromarray(rgba, 'RGBA').save(path, 'WEBP', lossless=True, quality=100)
    geo[name] = {'x': box[0] - WORD_X0, 'y': box[1] - WORD_Y0,
                 'w': box[2] - box[0], 'h': box[3] - box[1]}
    print(f'  {name}: pos({geo[name]["x"]},{geo[name]["y"]}) '
          f'{geo[name]["w"]}x{geo[name]["h"]}  {os.path.getsize(path)}B')


print('glyphs:')
for k in 'larise':
    emit(k, glyph_comps[k])
emit('arrow', [arrow])

open(f'{OUT}/geometry.json', 'w').write(json.dumps(geo, indent=1))
print('\ngeometry.json:', json.dumps(geo))
