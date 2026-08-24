# Cari Produk header carousel — image drop

Everything below goes in **`images/dir-hero/`**. Nothing in the code needs to change when a
file lands: each slide loads its background as a CSS layer over a gradient, and each overlay
thumbnail falls back to a live photo or a cut-out if its file 404s.

Export PNG/JPG, then convert:

```bash
cd /Users/sow/LarisID-astro/images/dir-hero && for f in *.png *.jpg; do cwebp -q 82 "$f" -o "${f%.*}.webp" && rm "$f"; done
```

---

## Required — 3 slide backgrounds

**2400 × 800 px (3:1)**, rendered `object-fit: cover`. Put the subject in the **right 55%** and
keep the **left 45% visually calm** — the headline sits there.

### `slide-camping.webp`

> Cinematic wide photograph of a mountain campsite at golden hour. A dome tent glowing warm from
> within and a folding camping chair sit on a rocky clearing at the right side of the frame, with a
> small camp table, an enamel mug and a lit camping lantern beside them. Behind them, layered pine
> forest and distant mountain ridges catching low orange sun; soft haze between the layers. The left
> third of the frame falls into deep cool shadow with nothing but out-of-focus foreground rock and
> grass, leaving clean empty space. Shot on a 35mm lens, f/2.8, natural warm rim light, rich
> contrast, deep shadows, slightly desaturated greens. No people. Photorealistic, editorial
> outdoor-gear photography. No text, no lettering, no watermark, no logos, no brand names, no
> readable packaging. 3:1 ultra-wide aspect ratio.

### `slide-rumah.webp`

> Bright warm-toned lifestyle still life photograph in a sunlit modern Indonesian home. Soft peach
> and cream tones. Out-of-focus monstera and fern leaves push in from the left edge in the
> foreground; behind them a calm plaster wall in warm blush catches soft window light with gentle
> leaf shadows. On the right side, a styled shelf edge with a stack of folded linen, a ceramic vase
> and a coffee cup, all softly lit and slightly out of focus. The left half is almost empty — just
> wall, light and shadow. Airy, minimal, warm daylight, shallow depth of field, film-like grain. No
> people. No text, no lettering, no watermark, no logos, no brand names, no readable packaging.
> 3:1 ultra-wide aspect ratio.

### `slide-insight.webp` (optional — a CSS gradient ships in its place)

> Abstract dark technology background. Deep navy-to-near-black gradient, with a faint blueprint grid
> and soft violet and cyan light blooms drifting through the right half. Fine particles and thin
> glowing curves suggest data flow without forming any chart or number. Along the very bottom edge,
> a barely-visible silhouette row of everyday consumer product shapes dissolving into shadow. Very
> low contrast in the left half so light text reads cleanly. Cinematic, moody, high-end SaaS hero
> art. No text, no lettering, no numbers, no charts, no watermark, no logos, no UI elements.
> 3:1 ultra-wide aspect ratio.

---

## Optional — 8 overlay thumbnails

These override what already ships. Slide 1's circles currently show the **live top-selling camping
photos** from `product_types_v`; slide 2's tiles show the existing onboarding cut-outs. Generate
these only if you want art direction instead.

### Slide 1 circles — 512 × 512, transparent background

`out-kursi.webp` · `out-lentera.webp` · `out-tas.webp` · `out-kompor.webp`

> Studio product photograph of a {folding camping chair in dark grey fabric | rechargeable LED
> camping lantern in matte black | 40-litre hiking backpack in charcoal and orange | compact
> portable camping gas stove in stainless steel}, three-quarter view, centred, soft even studio
> lighting with a gentle contact shadow, cut out on a fully transparent background. Clean commercial
> e-commerce style. No text, no lettering, no watermark, no logos, no brand names.

### Slide 2 tiles — 640 × 720 (8:9 portrait)

`home-dapur.webp` · `home-kecantikan.webp` · `home-elektronik.webp` · `home-fashion.webp`

> Styled product still life of {a stainless drip coffee maker with a small potted plant | a group of
> skincare bottles and a jar with a single pink gerbera | over-ear headphones beside a phone | a
> folded stack of neutral menswear with a dark cap on top}, centred on a flat {sage green | soft
> blush | pale sky blue | warm sand} background, soft diffused studio light, gentle shadow, warm
> minimal e-commerce styling, shallow depth of field. No people. No text, no lettering, no
> watermark, no logos, no brand names, no readable packaging. 8:9 portrait aspect ratio.

---

## Where the code lives

| Piece | File |
|---|---|
| Slides, carousel, data | `js/gpt-dir-hero.js` |
| Container + all `.dir-hero` / `.dh-*` CSS | `index.html` |
| Show/hide + callbacks | `syncDirHero()` in `js/gpt-app.js` |
| Live aggregates | `public.dir_hero_stats()` — `supabase/migrations/20260824120000_dir_hero_stats.sql` |

Bump the `?v=` on the `gpt-dir-hero.js` script tag in `index.html` whenever that file changes.
