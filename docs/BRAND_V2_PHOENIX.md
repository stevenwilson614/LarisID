# LarisID Brand v2 — "Phoenix" (ACTIVE)

> **Status: ACTIVE — based on Steven's branding sheet (2026-06-12), paint-text alphabet added 2026-06-16.**
> Source of truth for visuals = Steven's branding sheet (phoenix logo, brush LARIS wordmark,
> four color schemes) plus the official paint-text alphabet. This doc translates those assets
> into web tokens and rules. Supersedes v1 (`~/Downloads/LARISID_BRAND_GUIDE.md`) and the
> earlier "Bendera" proposal (same strategy, different emblem). MISSION.md remains binding
> above everything.

---

## 1. Brand strategy (unchanged from the approved movement direction)

LarisID is **a movement of small sellers, not a SaaS product**: dari penjual, untuk penjual.
Small sellers rising — the phoenix — armed with the same data the big players pay for.

- **Adversary**: expensive gatekept research tools and the idea that data is only for
  yang punya modal. NEVER Shopee (we depend on their data), NEVER government/politics,
  never named companies' people. Defiant and confident, never bitter.
- **The Robinhood rule**: a movement brand dies the day the product betrays it. Gratis is
  identity, not promo — no paywalls, no ads dressed as data, no selling user data (MISSION).
- **No One Piece IP** — the phoenix channels "rising up" with an original symbol.
- Pronouns: instructions "kamu"; rallying copy "kita" ("Kompetitor bayar 300rb/bulan. Kita? Gratis.").

---

## 2. Logo system (from the sheet)

### 2.1 Mark

**Phoenix** — symmetrical rising bird, four upswept feathers per wing, crested head facing
right, three tail feathers. Symbol of small sellers rising (bangkit). Textured, slightly
distressed fill in primary (MERAH–EMAS) versions; solid fills in monochrome lockups.

### 2.2 Wordmark & tagline

| Element | Spec |
|---------|------|
| **Wordmark** | **LARIS** in paint-text brush caps (see §4). Visual wordmark drops "ID" per the sheet — product/domain/SEO name in copy stays **LarisID** (larisid.com) until Steven explicitly renames. Never reintroduce the two-tone "Laris\|ID" wordmark in new surfaces. |
| **Tagline** | **DARI PENJUAL, UNTUK PENJUAL** — gold (`--emas`), all caps, smaller handwritten-style sans. Usually under or beside the wordmark. |

### 2.3 Lockups — when to use which

| Lockup | Layout | Use when |
|--------|--------|----------|
| **Primary / stacked** | Bird above LARIS + tagline | Posters, hero sections, about pages, splash screens. Asset: `logo-primary.png`. |
| **Horizontal** | Bird left of LARIS + tagline | Nav bars, email headers, wide banners. Red on light: `logo-horizontal-red.png`. White on dark: `logo-horizontal-light.png`. |
| **Compact / stacked** | Tighter vertical spacing | Mobile headers, narrow columns, sticker formats. Crop from sheet. |
| **Long / banner** | Extra-wide horizontal | Website mastheads, conference backdrops, Twitter/X headers. Crop from sheet. |
| **Round / circle badge** | Logo inside circle | Avatars, stamps, merch, certificate seals. Cream, red, black, or gold fills per scheme. |
| **Icon / symbol only** | Phoenix mark alone | Favicons at small sizes, watermarks, loading spinners, app switcher. |
| **App icon / social** | Mark in rounded square | Favicon, JSON-LD logo, iOS/Android icon, social profile image. Asset: `appicon-red.png`. |
| **Monochrome** | Black or white mark + wordmark | Embossing, fax/low-color print, single-ink merchandise. |

### 2.4 Logo usage rules

**Do**
- Use cropped artwork from the sheet or `images/brand/` — never SVG recreations of the mark.
- Pick one color scheme per surface; MERAH–EMAS is default for product UI and marketing.
- Keep clear space around the lockup ≥ the height of one wing feather on all sides.
- Scale proportionally; never stretch, skew, or rotate the lockup.
- On photos/busy backgrounds, place the logo on a solid cream, black, or red panel.

**Don't**
- Change mark colors outside the four defined schemes (or monochrome).
- Add drop shadows, outlines, gradients, or glows not present in the sheet artwork.
- Place the red mark on red backgrounds without a cream/white panel.
- Substitute Plus Jakarta Sans or Protest Revolution for the LARIS wordmark in logo lockups.
- Crop into the bird's wings or letterforms when making new assets.

### 2.5 Web assets

Cropped from the **original sheet artwork** (Steven's decision: always use the real art,
never SVG recreations):

| File | Description |
|------|-------------|
| `images/brand/branding-sheet.png` | Full source sheet (1536×1024). Crop new assets from here. |
| `images/brand/paint-text-alphabet.png` | Official A–Z paint-text reference (see §4). |
| `images/brand/logo-horizontal-red.png` | Red bird + brush LARIS, transparent. Light surfaces. |
| `images/brand/logo-horizontal-light.png` | White bird + LARIS + tagline, transparent. Dark surfaces. |
| `images/brand/logo-primary.png` | Stacked lockup with tagline. Hero/posters/about. |
| `images/brand/logo-word-light.png` | Wordmark + tagline only (no bird). Tight spaces. |
| `images/brand/logo-icon-light.png` | White phoenix icon only. Dark UI chrome. |
| `images/brand/appicon-red.png` | Red rounded square + gold bird. Favicon + JSON-LD logo. |

The old `favicon.svg` / `logo-mark.svg` recreations are **deleted** — do not reintroduce them.

---

## 3. Color — four schemes, one primary

Use **one scheme per surface**. Do not mix palettes (e.g. red bird + green headline) on the
same page, card, or poster.

### 3.1 MERAH–EMAS — semangat & kekuatan (PRIMARY)

Default for product UI, landing page, nav, CTAs, and most marketing.

```css
--merah:      #B5202A;  /* primary red — CTAs, mark, key data */
--merah-dark: #8E191F;  /* hover/pressed */
--merah-tint: #F9EAE4;  /* badge/callout backgrounds */
--emas:       #C9974B;  /* gold — tagline, accents, hero highlight */
--hitam:      #1A1A1A;  /* ink black — text, dark surfaces */
--krem:       #F5EFE0;  /* cream — page background */
```

Mark: red-to-orange textured gradient. Wordmark: dark brownish-red. Tagline: gold.

### 3.2 HIJAU–EMAS — pertumbuhan & harapan

Reserved for growth/success storytelling, education content, onboarding wins, cohort
milestones.

```css
--hijau:      #1E6B3C;
--hijau-dark: #155229;
--hijau-tint: #E8F5EC;
--emas:       #C9974B;
--krem:       #F5EFE0;
--hitam:      #1A1A1A;
```

### 3.3 BIRU–EMAS — kepercayaan & stabilitas

Reserved for trust/methodology/data-integrity content, privacy policy, methodology pages,
"how we source data" explainers.

```css
--biru:       #27355C;
--biru-dark:  #1C2640;
--biru-tint:  #EEF1F7;
--emas:       #C9974B;
--putih:      #FFFFFF;
--hitam:      #1A1A1A;
```

### 3.4 HITAM–MERAH — keberanian & perlawanan

Campaign/manifesto/poster mode. High contrast, defiant tone. Pair with manifesto copy (§6).

```css
--hitam:      #1A1A1A;
--abu:        #343434;
--merah:      #B5202A;
--putih:      #FFFFFF;
```

### 3.5 Monochrome

Black or white mark + wordmark for stamps, embossing, single-ink print, fax, and
accessibility contexts where color is unavailable. Greyscale intermediate for photography
overlays.

### 3.6 Functional colors (locked, all schemes)

Viability Score colors — unchanged across brand versions:

| Band | Foreground | Background |
|------|------------|------------|
| 75–100 | `#1A7A46` | `#EAF7F0` |
| 55–74 | `#B45309` | `#FFFBEB` |
| 0–54 | `#C0392B` | `#FEF2F0` |

Score range 0–100 and band copy are locked.

---

## 4. Typography & paint text

### 4.1 Paint text (official brush lettering)

The **LARIS** wordmark uses a custom hand-painted brush style — thick dry-brush strokes,
ragged feathered edges, slight rightward slant, dark crimson fill with subtle internal
shading. This is the brand's display voice: raw, energetic, high-impact.

**Official alphabet**: `images/brand/paint-text-alphabet.png` — uppercase A–Z reference for
compositing campaign headlines, posters, and custom lockups. When building new paint-text
copy:

- Use **all caps** only.
- Compose from the alphabet artwork or crop letters from existing sheet lockups — do not
  fake the texture with CSS filters or generic grunge fonts.
- Keep paint text to **short phrases** (1–4 words): kickers, stamps, poster headlines,
  event titles. Never paragraphs, never data tables, never UI labels.
- Maintain consistent slant and stroke weight; do not flip or individually rotate letters.
- Default fill: dark red (`#8E191F`–`#B5202A` family) on cream, or white/gold on dark
  surfaces per the active color scheme.

**Letterform notes** (from the alphabet):

| Letter | Distinctive trait |
|--------|-------------------|
| A | Crossbar extends slightly past the right leg |
| R | Open loop at top; diagonal leg kicks right |
| S | Aggressive curve; sharp tapered ends |
| O, Q | Thick irregular circles; Q has short bottom-right stroke |
| W, M | Wide; sharp jagged peaks |

### 4.2 Web fonts

| Role | Font | Rules |
|------|------|-------|
| Wordmark stand-in + brand moments | **Protest Revolution** (Google Fonts) | Web approximation only — never in logo lockups. Caps, sparingly. |
| Everything else | **Plus Jakarta Sans** 400–800 | Headings, body, UI, data. Indonesian-designed (Tokotype). Sentence case, line-height 1.65–1.75. |
| Tagline stand-in | Plus Jakarta Sans 600, tracked caps | When sheet artwork tagline cannot be used inline. Color: `--emas`. |

CSS: `--font-brand:'Protest Revolution','Plus Jakarta Sans',sans-serif;` in `:root`.

**Hierarchy on web**: Plus Jakarta Sans for all readable content. Protest Revolution or
paint-text artwork for decorative kickers only. Tagline on marketing surfaces should use
sheet artwork or gold PJS caps — not Protest Revolution.

---

## 5. Voice, taglines, manifesto

| Line | Context |
|------|---------|
| "Riset Produk Shopee. Gratis Selama Beta." | functional tagline — SEO, ads (v1 said "100% Gratis"; retired Aug 2026 when the three-tier pricing shipped) |
| "Dari penjual, untuk penjual." | THE brand tagline (on the sheet, locked) |
| "Data bukan cuma milik yang punya modal." | posters, campaign |
| "Kompetitor bayar 300rb/bulan. Kita? Setengahnya — dan gratis selama Beta." | comparison |
| "Tahu produk mana yang laris sebelum modal keluar." | educational (kept from v1) |

Manifesto (canonical, for a future /manifesto page and campaign posters — pair with
HITAM–MERAH scheme):

> MEREKA BILANG RISET PASAR ITU MAHAL.
> MEREKA KUNCI DATA DI BALIK PAYWALL.
> KAMI BILANG: TIDAK.
>
> Setiap penjual berhak tahu apa yang laris — sebelum modal keluar.
> LarisID gratis. Bukan promo, bukan trial. Gratis, titik.
> Ini bukan produk korporat. Dari penjual, untuk penjual.

Trust pillars, CTA verb rules (Mulai/Coba/Temukan/Lihat/Cek), imagery rules (real
Indonesian sellers, no Western stock, no money clichés), and layout metrics (1200px max
width, radius 12/8, section padding 80/48) all carry over from v1 unchanged.

---

## 6. Implementation log

**Applied 2026-06-12 (pass 1, index.html + subpages):**
- Global color swap (case-insensitive, incl. rgba variants and gradient ends):
  `#E8442A→#B5202A`, `#C23520→#8E191F`, `#FFF0ED→#F9EAE4`, `#1A1F3C→#1A1A1A`,
  `#F7F6F3→#F5EFE0`, `#F5A623→#C9974B`, `#2d3561→#343434`, `#12172a→#111111`,
  plus `privacy/index.html` and `harga/index.html`.
- Protest Revolution added to Google Fonts import; `--font-brand` token added.
- Wordmark replaced in 4 places (landing nav, app navbar, footer, dashboard sidebar):
  inline phoenix SVG + brush "LARIS" (+ BETA chip back in PJS).
- `images/favicon.svg` replaced with phoenix app-icon; `images/logo-mark.svg` added.
- Hero: gold brush kicker "DARI PENJUAL, UNTUK PENJUAL" above H1; H1 accent switched to gold.
- Verified: inline JS `node --check` clean, JSON-LD valid, no console errors, screenshot OK.

**Applied 2026-06-12 (pass 2):** original sheet art cropped into `images/brand/`; all 4
index.html lockups + all 5 subpage headers swapped to the real artwork; favicon + JSON-LD
logo now `appicon-red.png`; `styles/seo-pages.css` recolored (was missed in pass 1);
SVG recreations deleted.

**Updated 2026-06-16 (docs):**
- Added official paint-text alphabet asset and §4.1 lettering rules.
- Expanded lockup table, logo do/don't, and full alternate-scheme CSS tokens.
- README + AGENTS now point here as the canonical brand guide.

**Remaining (future passes):**
- Mini wordmarks inside landing-page mockup cards still read "LarisID" text-style.
- OG/social images, Chrome extension icons, email templates.
- `/manifesto` page (HITAM–MERAH mode).
- llms.txt / structured data wording if the display name ever changes from LarisID.
