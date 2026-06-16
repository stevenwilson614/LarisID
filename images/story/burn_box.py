#!/usr/bin/env python3
"""Burn the watch image onto the delivery box face so it looks printed on it.
Pass 'outline' to just draw the target quad (for calibrating corners)."""
import sys
from PIL import Image, ImageDraw
import numpy as np

deliv = Image.open('images/story/delivery.png').convert('RGBA')
W, H = deliv.size

# box face quad in fractions of (W,H): TL, TR, BR, BL
QF = [(0.4565, 0.6221), (0.5792, 0.6132), (0.5827, 0.6702), (0.4608, 0.6791)]
quad = [(int(x*W), int(y*H)) for (x, y) in QF]

if len(sys.argv) > 1 and sys.argv[1] == 'outline':
    im = deliv.convert('RGB'); d = ImageDraw.Draw(im)
    d.line(quad + [quad[0]], fill=(255, 0, 80), width=4)
    for i, p in enumerate(quad):
        d.ellipse([p[0]-6, p[1]-6, p[0]+6, p[1]+6], fill=(0, 220, 255))
        d.text((p[0]+8, p[1]-6), 'TL TR BR BL'.split()[i], fill=(255, 255, 0))
    im.save('images/story/_box_quad.png'); print('wrote _box_quad.png', quad); sys.exit()

def find_coeffs(target, source):
    m = []
    for t, s in zip(target, source):
        m.append([s[0], s[1], 1, 0, 0, 0, -t[0]*s[0], -t[0]*s[1]])
        m.append([0, 0, 0, s[0], s[1], 1, -t[1]*s[0], -t[1]*s[1]])
    A = np.array(m, dtype=float); B = np.array(target, dtype=float).reshape(8)
    return np.linalg.solve(A, B)

watch = Image.open('images/story/watch.png').convert('RGBA')
# quad size to derive aspect
qw = (abs(quad[1][0]-quad[0][0]) + abs(quad[2][0]-quad[3][0]))/2
qh = (abs(quad[3][1]-quad[0][1]) + abs(quad[2][1]-quad[1][1]))/2
asp = qw/qh
src_w = 1000; src_h = int(round(src_w/asp))
canvas = Image.new('RGBA', (src_w, src_h), (0, 0, 0, 0))
scale = min(src_w*0.95/watch.width, src_h*0.98/watch.height)
nw, nh = int(watch.width*scale), int(watch.height*scale)
canvas.alpha_composite(watch.resize((nw, nh), Image.LANCZOS), ((src_w-nw)//2, (src_h-nh)//2))

src_corners = [(0, 0), (src_w, 0), (src_w, src_h), (0, src_h)]
coeffs = find_coeffs(quad, src_corners)
warped = canvas.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC)

# burn-in: lower alpha so cardboard shows through (printed look)
wa = np.array(warped).astype(float)
wa[:, :, 3] *= 0.92
warped = Image.fromarray(wa.astype('uint8'))

out = deliv.copy()
out.alpha_composite(warped)
out.convert('RGB').save('images/story/delivery-printed.png')
print('wrote delivery-printed.png')
