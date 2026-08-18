"""Compose LARISE horizontal lockups.

A: our phoenix + our brush LA (official paint-text alphabet) + RISE from the new art.
B: our phoenix + the complete LARISE wordmark from the new art.
Nothing is redrawn — every element is cropped from real artwork.
"""
import os
import numpy as np
from PIL import Image

ALPHA_SRC = 'images/brand/paint-text-alphabet.png'
NEW_ART = 'images/brand/larise-source.png'
BIRD = 'images/brand/appicon-bird.png'
OUT = 'images/rise/brand'
INK = (0x9F, 0x18, 0x15)
CREAM = (0xF5, 0xEF, 0xE0)

al = np.asarray(Image.open(ALPHA_SRC).convert('RGB')).astype(float)
LET = {'l': (239, 279, 330, 403), 'a': (57, 94, 154, 225)}

def brush(key, scale):
    x0, y0, x1, y1 = LET[key]
    c = al[y0:y1 + 1, x0:x1 + 1]
    d = np.sqrt(((255 - c) ** 2).sum(axis=2))
    a = np.clip((d - 22) / 55.0, 0, 1)
    im = Image.fromarray((a * 255).astype(np.uint8), 'L')
    im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
    return np.asarray(im).astype(float) / 255.0

na = np.asarray(Image.open(NEW_ART).convert('RGB')).astype(float)
NBG = np.array([241., 231., 213.])
BASE_SRC = 495                        # letter baseline in the new artwork

def art(x0, y0, x1, y1):
    c = na[y0:y1, x0:x1]
    d = np.sqrt(((c - NBG) ** 2).sum(axis=2))
    return np.clip((d - 30) / 60.0, 0, 1), BASE_SRC - y0

RISE, RISE_BASE = art(971, 350, 1580, 575)      # R .. arrowhead
FULL, FULL_BASE = art(633, 350, 1580, 575)      # L .. arrowhead

bird0 = Image.open(BIRD).convert('RGBA')
bb = np.where(np.asarray(bird0)[:, :, 3] > 8)
bird0 = bird0.crop((bb[1].min(), bb[0].min(), bb[1].max() + 1, bb[0].max() + 1))
bl = np.asarray(bird0)
bird_light = Image.fromarray(
    np.dstack([np.full(bl.shape[:2] + (3,), 255, np.uint8), bl[:, :, 3]]), 'RGBA')

def tint(a, rgb):
    h, w = a.shape
    return Image.fromarray(np.dstack([
        np.full((h, w, 3), rgb, np.uint8), (a * 255).astype(np.uint8)]), 'RGBA')

def lockup(path, ink, bird, parts, pad=26):
    """parts: list of (alpha, baseline_offset, gap_before)."""
    base = pad + max(p[1] for p in parts)
    below = max(p[0].shape[0] - p[1] for p in parts)
    bird_h = int(round(max(p[1] for p in parts) * 1.55))
    bw = int(round(bird.width * bird_h / bird.height))
    bird_r = bird.resize((bw, bird_h), Image.LANCZOS)
    gap_bird = int(round(bird_h * 0.26))

    W = pad + bw + gap_bird + sum(p[0].shape[1] + p[2] for p in parts) + pad
    H = base + below + pad
    cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cv.alpha_composite(bird_r, (pad, base - int(bird_h * 0.86)))
    x = pad + bw + gap_bird
    for a, b, gap in parts:
        x += gap
        cv.alpha_composite(tint(a, ink), (x, base - b))
        x += a.shape[1]
    # Ship WebP at a web-sized master: the nav renders ~140 CSS px, the CTA ~220,
    # so 900px covers 2x DPR everywhere with a fraction of the PNG weight.
    if cv.width > 900:
        cv = cv.resize((900, round(cv.height * 900 / cv.width)), Image.LANCZOS)
    cv.save(path, 'WEBP', quality=92, method=6)
    print(f'{path}  {cv.size}  {os.path.getsize(path)}B')

# Brush strokes carry far less visual mass than the solid italic, so the LA is
# set well above matching cap height or it reads as a separate word at nav size.
S = 1.38
L, A = brush('l', S), brush('a', S)
for ink, bird, suffix in [(INK, bird0, 'red'), (CREAM, bird_light, 'light')]:
    lockup(f'{OUT}/larise-{suffix}.webp', ink, bird,
           [(L, L.shape[0], 0), (A, A.shape[0], 8), (RISE, RISE_BASE, 4)])
    lockup(f'{OUT}/larise-alt-{suffix}.webp', ink, bird,
           [(FULL, FULL_BASE, 0)])
