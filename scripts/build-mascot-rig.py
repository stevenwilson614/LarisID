#!/usr/bin/env python3
"""
Cut a flat mascot render into the layers js/laris-mascot.js animates.

The Garuda only exists as flat 2D renders, so "rigging" here means slicing each
render into a few overlay patches that can be nudged independently.

The trick that makes this seamless: every moving patch is a *feathered copy of
the region it already sits on*, drawn back at the exact same spot. Because the
pixels underneath are identical, offsetting a patch by 1-3px produces a soft
local swell with no hole to fill and no visible boundary. Only the iris is a
true cut-out, so it is the only thing that needs the background painted back in.

There is deliberately no full-size base layer: the page's existing <img> is the
base. It is the LCP element on the landing hero, and re-shipping it as a rig
layer would double the bytes for the largest image on the page. Instead a tiny
"sclera" patch blanks the drawn-on iris so the movable one can slide over it.

Usage:
    python3 scripts/build-mascot-rig.py            # build every pose
    python3 scripts/build-mascot-rig.py hero       # build one pose
    python3 scripts/build-mascot-rig.py --debug    # also write region overlays

Outputs images/brand/rig/<pose>-<layer>.webp and regenerates
js/laris-mascot-rigs.js, which js/laris-mascot.js reads its geometry from.
Do not hand-edit that file -- rerun this instead.
"""

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "images", "brand", "rig")

# Geometry is in source-image pixels. Ellipses are (cx, cy, rx, ry).
#
#   patches  - feathered copies, listed back-to-front
#   pivot    - rotation origin for the head group, in canvas space
#   eyes     - `outer` is the outside of the drawn dark rim. Only an eye with
#              `iris` set gets a sliding pupil; every eye gets a lid, because
#              blinking just one reads as a wink.
POSES = {
    "hero": {
        "src": "images/brand/mascot-hero.webp",
        "patches": [
            # origin = where the part hinges, so rotation looks anchored.
            {"name": "wing",  "ellipse": (900, 430, 95, 155), "feather": 40,
             "origin": (825, 555)},
            {"name": "torso", "ellipse": (575, 400, 130, 105), "feather": 40,
             "origin": (575, 505)},
            {"name": "head",  "ellipse": (665, 165, 205, 160), "feather": 45},
        ],
        "pivot": (650, 300),
        # Measured off the luminance profile, not eyeballed: the drawn iris
        # sits left of the eye's centre, and an ellipse that overhangs the
        # bright sclera on the right shows up as a dark crescent.
        "eyes": [
            {"id": "r", "outer": (655, 174, 35, 30), "iris": (655, 178, 21, 22)},
            # Far eye: small, and the beak crosses its lower right, so the lid
            # is clipped off the beak and it does not track.
            {"id": "l", "outer": (549, 192, 17, 18), "clip_beak": True},
        ],
    },
    # Ask Laris composer perch — full-body streetwear Garuda with glasses.
    # No wing patch (hands in pocket). Lids only: irises behind the frames
    # smear at the ~100px display size, so we skip iris travel.
    "ask": {
        "src": "images/brand/mascot-ask.webp",
        "patches": [
            {"name": "torso", "ellipse": (335, 470, 125, 110), "feather": 36,
             "origin": (335, 560)},
            {"name": "head",  "ellipse": (340, 200, 155, 140), "feather": 40},
        ],
        "pivot": (335, 320),
        "eyes": [
            {"id": "l", "outer": (300, 215, 26, 22)},
            {"id": "r", "outer": (375, 215, 26, 22)},
        ],
    },
}


def ellipse_mask(size, ellipse, feather, scale=1.0):
    """Anti-aliased ellipse mask, blurred by `feather` to fade the edges out."""
    cx, cy, rx, ry = ellipse
    rx, ry = rx * scale, ry * scale
    # Supersample so the un-feathered edge is smooth even when feather is 0.
    ss = 4
    m = Image.new("L", (size[0] * ss, size[1] * ss), 0)
    ImageDraw.Draw(m).ellipse(
        [(cx - rx) * ss, (cy - ry) * ss, (cx + rx) * ss, (cy + ry) * ss], fill=255
    )
    m = m.resize(size, Image.LANCZOS)
    if feather:
        m = m.filter(ImageFilter.GaussianBlur(feather / 2.0))
    return m


def bbox_for(ellipse, feather, size, pad=4):
    cx, cy, rx, ry = ellipse
    grow = feather + pad
    x0 = max(0, int(cx - rx - grow))
    y0 = max(0, int(cy - ry - grow))
    x1 = min(size[0], int(cx + rx + grow) + 1)
    y1 = min(size[1], int(cy + ry + grow) + 1)
    return (x0, y0, x1, y1)


def radial_inpaint(img, ellipse, r0=1.20):
    """Rebuild the inside of an ellipse by smearing the ring just outside it
    inwards along each radius.

    A flat fill leaves a visible halo: the moving iris has a soft edge, and
    wherever that edge is semi-transparent the fill shows through and has to
    match the real sclera underneath -- including its shading gradient, which
    a single colour cannot. Sampling the actual surrounding pixels does.
    """
    import numpy as np

    cx, cy, rx, ry = ellipse
    W, H = img.size
    a = np.asarray(img).astype(np.uint8)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xs - cx) / rx
    dy = (ys - cy) / ry
    r = np.maximum(np.sqrt(dx * dx + dy * dy), 1e-6)
    k = np.maximum(1.0, r0 / r)            # inside r0 -> pull from the rim
    sx = np.clip(cx + (xs - cx) * k, 0, W - 1).astype(np.int32)
    sy = np.clip(cy + (ys - cy) * k, 0, H - 1).astype(np.int32)
    return Image.fromarray(a[sy, sx], "RGB").filter(
        ImageFilter.GaussianBlur(1.5))


def sample_feather_tone(img, outer):
    """Median cream tone in the annulus around the eye, for painting the lid.

    Skips the red brow markings and the dark eye outline so the lid matches the
    surrounding plumage rather than averaging to mud.
    """
    cx, cy, rx, ry = outer
    px = img.load()
    creams = []
    steps = 96
    for i in range(steps):
        import math

        a = (i / steps) * 2 * math.pi
        for k in (1.35, 1.6, 1.85):
            x = int(cx + math.cos(a) * rx * k)
            y = int(cy + math.sin(a) * ry * k)
            if not (0 <= x < img.width and 0 <= y < img.height):
                continue
            r, g, b = px[x, y][:3]
            if r > 175 and g > 155 and b > 135 and (r - b) < 60:
                creams.append((r, g, b))
    if not creams:
        return (232, 224, 212)
    creams.sort(key=lambda c: c[0] + c[1] + c[2])
    # Upper-middle of the range: the plain median drags in socket shadow and
    # comes out grey, which reads as a dead eye rather than a closed one.
    r, g, b = creams[int(len(creams) * 0.65)]
    return (min(255, int(r * 1.02)), int(g * 0.995), int(b * 0.96))


def build_pose(name, cfg, debug=False):
    src_path = os.path.join(ROOT, cfg["src"])
    raw = Image.open(src_path)
    # Transparent sources (Ask Laris perch) are composited onto white so the
    # feathered patches match the hero pipeline. The page still serves the
    # RGBA original as the static <img>.
    if raw.mode == "RGBA":
        img = Image.new("RGB", raw.size, (255, 255, 255))
        img.paste(raw, mask=raw.split()[-1])
    else:
        img = raw.convert("RGB")
    W, H = img.size
    manifest = {
        "w": W, "h": H, "layers": {},
        # Head-group rotation origin, as a percentage of the canvas.
        "pivot": [round(cfg["pivot"][0] / W * 100, 2),
                  round(cfg["pivot"][1] / H * 100, 2)],
        "src": "/" + cfg["src"],
    }

    os.makedirs(OUT_DIR, exist_ok=True)

    def emit(layer, image, box, lossless=False):
        path = os.path.join(OUT_DIR, "%s-%s.webp" % (name, layer))
        if lossless:
            # The eye layers sit back on top of pixels they were cut from, so
            # a second lossy pass would show as a visible colour shift over
            # the iris. They are a couple of kB either way.
            image.save(path, "WEBP", lossless=True, method=6)
        else:
            image.save(path, "WEBP", quality=90, method=6)
        manifest["layers"][layer] = {
            "x": box[0], "y": box[1],
            "w": box[2] - box[0], "h": box[3] - box[1],
            "src": "/images/brand/rig/%s-%s.webp" % (name, layer),
        }
        return os.path.getsize(path)

    sizes = {}
    eyes = cfg["eyes"]

    # --- feathered motion patches -----------------------------------------
    for p in cfg["patches"]:
        box = bbox_for(p["ellipse"], p["feather"], (W, H))
        m = ellipse_mask((W, H), p["ellipse"], p["feather"])
        layer = img.copy().convert("RGBA")
        layer.putalpha(m)
        sizes[p["name"]] = emit(p["name"], layer.crop(box), box)
        cx, cy, _, _ = p["ellipse"]
        ox, oy = p.get("origin", (cx, cy))
        manifest["layers"][p["name"]]["origin"] = [
            round((ox - box[0]) / (box[2] - box[0]) * 100, 2),
            round((oy - box[1]) / (box[3] - box[1]) * 100, 2),
        ]

    manifest["eyes"] = []
    for e in eyes:
        eid, outer = e["id"], e["outer"]
        entry = {"id": eid}

        # --- iris: a real cut-out, so it can slide inside the sclera ------
        if e.get("iris"):
            iris = e["iris"]
            scl = sample_feather_tone(img, outer)

            # Blank out the iris that is painted into the page's own <img>,
            # so the movable one has clean sclera to slide across.
            sbox = bbox_for(iris, 8, (W, H), pad=2)
            fill = radial_inpaint(img, iris).convert("RGBA")
            fill.putalpha(ellipse_mask((W, H), iris, feather=6, scale=1.16))
            sizes["sclera" + eid] = emit(
                "sclera" + eid, fill.crop(sbox), sbox, lossless=True)
            entry["sclera"] = "sclera" + eid

            ibox = bbox_for(iris, 3, (W, H), pad=2)
            iris_layer = img.copy().convert("RGBA")
            iris_layer.putalpha(ellipse_mask((W, H), iris, feather=3))
            sizes["iris" + eid] = emit(
                "iris" + eid, iris_layer.crop(ibox), ibox, lossless=True)
            entry["iris"] = "iris" + eid
            # How far it may slide before colliding with the drawn rim.
            entry["travel"] = [round((outer[2] - iris[2]) * 0.55, 1),
                               round((outer[3] - iris[3]) * 0.55, 1)]

        # --- lid: synthesized, sits inside the drawn dark rim ------------
        # Sized well inside the rim so the rim still reads when the eye
        # shuts. Covering the rim too makes a pale blob, not a closed eye.
        scl = sample_feather_tone(img, outer)
        lcx, lcy, lrx, lry = outer
        lrx, lry = lrx * 0.80, lry * 0.80
        lbox = (int(lcx - lrx) - 2, int(lcy - lry) - 2,
                int(lcx + lrx) + 3, int(lcy + lry) + 3)
        lw, lh = lbox[2] - lbox[0], lbox[3] - lbox[1]
        lid_rgb = Image.new("RGB", (lw, lh), scl)
        d = ImageDraw.Draw(lid_rgb)
        # Lighter at the brow, deeper toward the lash line.
        for y in range(lh):
            k = 1.08 - 0.26 * (y / max(1, lh - 1))
            d.line([(0, y), (lw, y)],
                   fill=tuple(min(255, int(c * k)) for c in scl))
        lid_rgb = lid_rgb.filter(ImageFilter.GaussianBlur(1.0))
        # Lash line traced along the lid's own lower rim.
        d = ImageDraw.Draw(lid_rgb)
        d.arc([1, 1 - lh * 0.10, lw - 2, lh - 2], 12, 168,
              fill=(70, 44, 34), width=max(2, int(lh * 0.09)))

        lid_mask = ellipse_mask((W, H), (lcx, lcy, lrx, lry), feather=2)
        if e.get("clip_beak"):
            # The beak crosses this eye; painting a lid over it would smear
            # orange. Knock beak-coloured pixels out of the lid mask.
            import numpy as np
            a = np.asarray(img).astype(int)
            beak = ((a[..., 0] > 195) & (a[..., 1] > 110) &
                    (a[..., 2] < 140) & (a[..., 0] - a[..., 2] > 85))
            keep = Image.fromarray(
                ((~beak) * 255).astype("uint8"), "L"
            ).filter(ImageFilter.GaussianBlur(1.5))
            lid_mask = Image.composite(
                lid_mask, Image.new("L", (W, H), 0), keep)
        lid = lid_rgb.convert("RGBA")
        lid.putalpha(lid_mask.crop(lbox))
        sizes["lid" + eid] = emit("lid" + eid, lid, lbox)
        entry["lid"] = "lid" + eid
        manifest["eyes"].append(entry)

    if debug:
        dbg = img.copy()
        dd = ImageDraw.Draw(dbg)
        for p in cfg["patches"]:
            cx, cy, rx, ry = p["ellipse"]
            dd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                       outline=(0, 200, 255), width=4)
        for e in eyes:
            for key, col in (("outer", (255, 0, 255)), ("iris", (0, 255, 0))):
                if not e.get(key):
                    continue
                cx, cy, rx, ry = e[key]
                dd.ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                           outline=col, width=3)
        px, py = cfg["pivot"]
        dd.line([(px - 18, py), (px + 18, py)], fill=(255, 0, 0), width=4)
        dd.line([(px, py - 18), (px, py + 18)], fill=(255, 0, 0), width=4)
        dbg.save(os.path.join(OUT_DIR, "_debug-%s.png" % name))

    total = sum(sizes.values())
    print("  %s: %s" % (name, ", ".join(
        "%s %.1fkB" % (k, v / 1024.0) for k, v in sizes.items())),
        file=sys.stderr)
    print("  %s total %.1f kB (source %.1f kB)" % (
        name, total / 1024.0,
        os.path.getsize(src_path) / 1024.0), file=sys.stderr)
    return manifest


MANIFEST_JS = os.path.join(ROOT, "js", "laris-mascot-rigs.js")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    debug = "--debug" in sys.argv
    names = args or list(POSES)

    # Rebuilding a subset must not drop the poses it did not touch.
    out = {}
    if os.path.exists(MANIFEST_JS):
        txt = open(MANIFEST_JS).read()
        i, j = txt.find("{"), txt.rfind("}")
        if i != -1 and j > i:
            try:
                out = json.loads(txt[i:j + 1])
            except ValueError:
                out = {}

    for n in names:
        if n not in POSES:
            print("unknown pose: %s" % n, file=sys.stderr)
            return 1
        out[n] = build_pose(n, POSES[n], debug=debug)

    with open(MANIFEST_JS, "w") as f:
        f.write("/* Generated by scripts/build-mascot-rig.py -- do not edit. */\n")
        f.write("window.LARIS_MASCOT_RIGS = ")
        f.write(json.dumps(out, indent=2, sort_keys=True))
        f.write(";\n")
    print("wrote %s (%d pose%s)" % (
        os.path.relpath(MANIFEST_JS, ROOT), len(out),
        "" if len(out) == 1 else "s"), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
