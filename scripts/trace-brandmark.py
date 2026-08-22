"""Trace images/brand/appicon-bird.png into the 24x24 SVG path used by the
sidebar "Tentang" icon in index.html.

    python3 scripts/trace-brandmark.py [grid_width] [rdp_epsilon]

Defaults reproduce what is checked in: 120 1.0.
"""
import os
import sys
from PIL import Image
import numpy as np

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'images', 'brand', 'appicon-bird.png')
GRID_W = int(sys.argv[1]) if len(sys.argv) > 1 else 150
EPS    = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9

im = Image.open(SRC).convert('RGBA')
bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
im = Image.alpha_composite(bg, im).convert('L')
a = np.asarray(im, dtype=np.float32)
mask = a < 190

ys, xs = np.nonzero(mask)
im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
w, h = im.size
gh = max(1, int(round(GRID_W * h / w)))
small = im.resize((GRID_W, gh), Image.LANCZOS)
g = (np.asarray(small, dtype=np.float32) < 190)
g = np.pad(g, 1)

# ── marching squares: collect edge-midpoint segments per cell ────────────────
H, W = g.shape
segs = []
T = lambda i, j: (i,       j + 0.5)
R = lambda i, j: (i + 0.5, j + 1.0)
B = lambda i, j: (i + 1.0, j + 0.5)
L = lambda i, j: (i + 0.5, j)
for i in range(H - 1):
    for j in range(W - 1):
        c = (g[i, j] << 3) | (g[i, j+1] << 2) | (g[i+1, j+1] << 1) | g[i+1, j]
        if c in (0, 15):
            continue
        if   c in (1, 14):  segs.append((L(i,j), B(i,j)))
        elif c in (2, 13):  segs.append((B(i,j), R(i,j)))
        elif c in (3, 12):  segs.append((L(i,j), R(i,j)))
        elif c in (4, 11):  segs.append((T(i,j), R(i,j)))
        elif c in (6, 9):   segs.append((T(i,j), B(i,j)))
        elif c in (7, 8):   segs.append((L(i,j), T(i,j)))
        elif c == 5:        segs += [(L(i,j), T(i,j)), (B(i,j), R(i,j))]
        elif c == 10:       segs += [(L(i,j), B(i,j)), (T(i,j), R(i,j))]

# ── link segments into closed loops ─────────────────────────────────────────
key = lambda p: (round(p[0], 4), round(p[1], 4))
adj = {}
for p, q in segs:
    adj.setdefault(key(p), []).append(key(q))
    adj.setdefault(key(q), []).append(key(p))

loops, seen_edge = [], set()
for start in list(adj):
    for first in adj[start]:
        if (start, first) in seen_edge:
            continue
        loop, prev, cur = [start], start, first
        seen_edge.add((start, first)); seen_edge.add((first, start))
        while cur != start:
            loop.append(cur)
            nxts = [n for n in adj[cur] if n != prev] or [prev]
            nxt = nxts[0]
            seen_edge.add((cur, nxt)); seen_edge.add((nxt, cur))
            prev, cur = cur, nxt
        if len(loop) > 6:
            loops.append(loop)

def area(loop):
    s = 0.0
    for k in range(len(loop)):
        (y1, x1), (y2, x2) = loop[k], loop[(k + 1) % len(loop)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2

loops = [lp for lp in loops if area(lp) >= 6]

# ── Ramer-Douglas-Peucker ───────────────────────────────────────────────────
def rdp(pts, eps):
    if len(pts) < 3:
        return pts
    (y0, x0), (y1, x1) = pts[0], pts[-1]
    dy, dx = y1 - y0, x1 - x0
    n = (dx * dx + dy * dy) ** .5
    best, bi = -1, 0
    for k in range(1, len(pts) - 1):
        y, x = pts[k]
        d = abs(dx * (y0 - y) - (x0 - x) * dy) / n if n else ((y - y0) ** 2 + (x - x0) ** 2) ** .5
        if d > best:
            best, bi = d, k
    if best > eps:
        return rdp(pts[:bi + 1], eps)[:-1] + rdp(pts[bi:], eps)
    return [pts[0], pts[-1]]

sys.setrecursionlimit(10000)
simple = []
for lp in loops:
    n = len(lp)
    s = rdp(lp[:n // 2 + 1], EPS)[:-1] + rdp(lp[n // 2:] + [lp[0]], EPS)[:-1]
    if len(s) >= 3:
        simple.append(s)

# ── fit into a 24x24 box ────────────────────────────────────────────────────
allpts = [p for s in simple for p in s]
miny = min(p[0] for p in allpts); maxy = max(p[0] for p in allpts)
minx = min(p[1] for p in allpts); maxx = max(p[1] for p in allpts)
span = max(maxx - minx, maxy - miny)
scale = 22.0 / span
ox = 12 - (minx + maxx) / 2 * scale
oy = 12 - (miny + maxy) / 2 * scale
def to24(p):
    return (round(p[1] * scale + ox, 2), round(p[0] * scale + oy, 2))

# ── emit, smoothing each loop through midpoints ─────────────────────────────
def fmt(v):
    s = ('%.2f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('', '-0') else s

out = []
for s in simple:
    P = [to24(p) for p in s]
    n = len(P)
    mid = lambda i: ((P[i][0] + P[(i+1) % n][0]) / 2, (P[i][1] + P[(i+1) % n][1]) / 2)
    d = ['M%s %s' % (fmt(mid(0)[0]), fmt(mid(0)[1]))]
    for i in range(1, n + 1):
        c, m = P[i % n], mid(i % n)
        d.append('Q%s %s %s %s' % (fmt(c[0]), fmt(c[1]), fmt(m[0]), fmt(m[1])))
    out.append(''.join(d) + 'Z')

path = ''.join(out)
print('loops=%d pts=%d chars=%d' % (len(simple), sum(len(s) for s in simple), len(path)), file=sys.stderr)
print(path)
