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

# --- the original brush LARIS, for the two-wordmark animation ---------------
# The animation shows two different marks meeting, so LARIS keeps the brand's
# own brush lettering while RISE uses the new emblem.
ALPHABET = 'images/brand/paint-text-alphabet.png'
BRUSH_BOX = {'l': (239, 279, 330, 403), 'a': (57, 94, 154, 225),
             'r': (902, 273, 1003, 408), 'i': (934, 96, 998, 223),
             's': (51, 455, 167, 587)}
BRUSH_K = 1.38          # brush strokes carry less mass than the solid italic
BASELINE = 140          # sleek letter baseline, in artwork units
GAP = 10                # between brush letters
GAP_AR = -12            # brush A tucks under the emblem's R so it reads as one word
SLEEK_R_X = 332         # where the new RISE emblem begins

ab = np.asarray(Image.open(ALPHABET).convert('RGB')).astype(float)
ad = np.sqrt(((255 - ab) ** 2).sum(axis=2))
alab, _ = label(ad > 60)          # neighbouring letters overlap these boxes

def brush(key):
    x0, y0, x1, y1 = BRUSH_BOX[key]
    a = np.clip((ad[y0:y1 + 1, x0:x1 + 1] - 22) / 55.0, 0, 1)
    # Keep only this glyph's own strokes: K's tail sits a few px inside L's box.
    sub = alab[y0:y1 + 1, x0:x1 + 1]
    ids, counts = np.unique(sub[sub > 0], return_counts=True)
    a *= dilate(sub == ids[np.argmax(counts)], 2)
    rgba = np.dstack([np.full(a.shape + (3,), 255, np.uint8), (a * 255).astype(np.uint8)])
    path = f'{OUT}/brush-{key}.webp'
    Image.fromarray(rgba, 'RGBA').save(path, 'WEBP', lossless=True, quality=100)
    return round((x1 - x0 + 1) * BRUSH_K), round((y1 - y0 + 1) * BRUSH_K), path

print('\nbrush LARIS:')
dims = {k: brush(k) for k in 'laris'}
# A must land just left of the emblem's R; the rest follows leftwards, and the
# brush R I S run on underneath the emblem where they dissolve during the merge.
bx = {'a': SLEEK_R_X - GAP_AR - dims['a'][0]}
bx['l'] = bx['a'] - GAP - dims['l'][0]
bx['r'] = SLEEK_R_X
bx['i'] = bx['r'] + dims['r'][0] + GAP
bx['s'] = bx['i'] + dims['i'][0] + GAP
for k in 'laris':
    w, h, path = dims[k]
    geo['brush-' + k] = {'x': bx[k], 'y': BASELINE - h, 'w': w, 'h': h}
    print(f'  {k}: pos({bx[k]},{BASELINE - h}) {w}x{h}  {os.path.getsize(path)}B')

# Composition constants for the animation. Derived here so js/rise.js can never
# drift out of sync with the artwork: 'brush-r/i/s' dissolve during the merge, so
# they are excluded from the merged extents.
merged = {k: v for k, v in geo.items() if k not in ('l', 'a', 'brush-r', 'brush-i', 'brush-s')}
mx0 = min(v['x'] for v in merged.values()); mx1 = max(v['x'] + v['w'] for v in merged.values())
my0 = min(v['y'] for v in merged.values()); my1 = max(v['y'] + v['h'] for v in merged.values())
brush_all = {k: v for k, v in geo.items() if k.startswith('brush-')}
sleek_all = {k: v for k, v in geo.items() if k in ('r', 'i', 's', 'e', 'arrow')}
geo['_composition'] = {
    'cx': round((mx0 + mx1) / 2, 1), 'cy': round((my0 + my1) / 2, 1),
    'halfW': round((mx1 - mx0) / 2, 1), 'halfH': round((my1 - my0) / 2, 1),
    'brushRight': max(v['x'] + v['w'] for v in brush_all.values()),
    'sleekLeft': min(v['x'] for v in sleek_all.values()),
    'tallest': max(v['h'] for v in sleek_all.values() if v['w'] < 300),
    'widest': max(v['w'] for v in sleek_all.values() if v['w'] < 300),
}
c = geo['_composition']
c['minSep'] = round((c['brushRight'] - c['sleekLeft']) / 2 + 20)
open(f'{OUT}/geometry.json', 'w').write(json.dumps(geo, indent=1))
print('\ncomposition:', json.dumps(c))

# --- standalone RISE emblem for the header ---------------------------------
EMB = 'images/rise/brand'
os.makedirs(EMB, exist_ok=True)
ex0, ey0, ex1, ey1 = 965, 349, 1582, 577
ec = np.asarray(im.crop((ex0, ey0, ex1, ey1))).astype(float)
ed = np.sqrt(((ec - BG) ** 2).sum(axis=2))
ea = np.clip((ed - 30) / 60.0, 0, 1)
own = dilate(np.isin(lab[ey0:ey1, ex0:ex1],
                     [c[5] for c in word if c[0] >= 960]), 2)
ea *= own
print('\nRISE emblem:')
for name, rgb in (('rise-red', (0x9F, 0x18, 0x15)), ('rise-light', (0xF5, 0xEF, 0xE0))):
    rgba = np.dstack([np.full(ec.shape, rgb, np.uint8), (ea * 255).astype(np.uint8)])
    path = f'{EMB}/{name}.webp'
    Image.fromarray(rgba, 'RGBA').save(path, 'WEBP', quality=94, method=6)
    print(f'  {path}  {ex1-ex0}x{ey1-ey0}  {os.path.getsize(path)}B')
