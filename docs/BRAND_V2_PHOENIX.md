# LarisID Brand v2 — "Phoenix" (ACTIVE)

> **Status: ACTIVE — based on Steven's branding sheet (2026-06-12). Rollout pass 1 is live.**
> Source of truth for visuals = Steven's branding sheet (phoenix logo, brush LARIS wordmark,
> four color schemes). This doc translates that sheet into web tokens and rules.
> Supersedes v1 (`~/Downloads/LARISID_BRAND_GUIDE.md`) and the earlier "Bendera" proposal
> (same strategy, different emblem). MISSION.md remains binding above everything.

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

## 2. Logo system (from the sheet)

**Mark**: rising phoenix — symmetrical bird, four upswept feathers per wing, crested head
facing right, three tail feathers. Symbol of small sellers rising (bangkit).

**Wordmark**: "LARIS" in brush caps. The visual wordmark drops "ID" per the sheet —
but the product/domain/SEO name in copy stays **LarisID** (larisid.com) until Steven
explicitly renames. Never reintroduce the two-tone "Laris|ID" wordmark in new surfaces.

**Tagline**: "DARI PENJUAL, UNTUK PENJUAL" — gold, caps, usually under or beside the wordmark.

**Variations** (all defined on the sheet): horizontal lockup, compact/stacked, round/circle
badge, icon-only, app icon (rounded square), monochrome black/white, long banner lockup.

**Web assets — cropped from the ORIGINAL sheet artwork (Steven's decision: always use
the real art, never SVG recreations)**:
- `images/brand/branding-sheet.png` — the full source sheet (1536x1024). Crop new assets
  from here (cream bg removed via color-distance alpha; dark lockups via luminance alpha).
- `images/brand/logo-horizontal-red.png` — red bird + brush LARIS, transparent. For light surfaces.
- `images/brand/logo-horizontal-light.png` — white bird + LARIS + tagline, transparent. For dark surfaces.
- `images/brand/logo-primary.png` — big stacked lockup with tagline. Hero/posters/about.
- `images/brand/appicon-red.png` — red rounded square + gold bird. Favicon + JSON-LD logo.
- The old `favicon.svg` / `logo-mark.svg` recreations are DELETED — do not reintroduce them.

## 3. Color — four schemes, one primary

**Primary scheme: MERAH–EMAS (semangat & kekuatan).** Web tokens:

```css
--merah:      #B5202A;  /* primary red — CTAs, mark, key data (was #E8442A) */
--merah-dark: #8E191F;  /* hover/pressed (was #C23520) */
--merah-tint: #F9EAE4;  /* badge/callout backgrounds (was #FFF0ED) */
--emas:       #C9974B;  /* gold — tagline, accents, hero highlight (was #F5A623) */
--hitam:      #1A1A1A;  /* ink black — text, dark surfaces (REPLACES navy #1A1F3C) */
--krem:       #F5EFE0;  /* cream — page background (was #F7F6F3) */
```

**Alternate schemes** (sheet-defined, use intentionally, never mix within one surface):
- **HIJAU–EMAS** (pertumbuhan & harapan) — green `#1E6B3C`-family + gold. Reserved: growth/
  success storytelling, education content.
- **BIRU–EMAS** (kepercayaan & stabilitas) — navy `#27355C`-family + gold. Reserved: trust/
  methodology/data-integrity content.
- **HITAM–MERAH** (keberanian & perlawanan) — blacks/grays + red. The poster/manifesto/
  campaign mode.
- **Monochrome**: black or white mark+wordmark for stamps, embossing, low-color contexts.

**Unchanged (functional, locked)**: Viability Score colors — 75–100 `#1A7A46`/`#EAF7F0`,
55–74 `#B45309`/`#FFFBEB`, 0–54 `#C0392B`/`#FEF2F0`. Score range 0–100 and band copy locked.

## 4. Typography

| Role | Font | Rules |
|------|------|-------|
| Wordmark + brand moments (kickers, campaign headlines, stamps) | **Protest Revolution** (Google Fonts) — web stand-in for the sheet's brush lettering | Caps, sparingly — never body copy, never data, never long headlines |
| Everything else (headings, body, UI, data) | **Plus Jakarta Sans** 400–800 | Unchanged from v1 — Indonesian-designed (Tokotype). Sentence case, line-height 1.65–1.75 |

CSS: `--font-brand:'Protest Revolution','Plus Jakarta Sans',sans-serif;` in `:root`.

## 5. Voice, taglines, manifesto

Carried over from the approved movement direction:

| Line | Context |
|------|---------|
| "Riset Produk Shopee. 100% Gratis." | functional tagline — SEO, ads (kept from v1) |
| "Dari penjual, untuk penjual." | THE brand tagline (on the sheet, locked) |
| "Data bukan cuma milik yang punya modal." | posters, campaign |
| "Kompetitor bayar 300rb/bulan. Kita? Gratis." | comparison |
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
Indonesian sellers, no Western stock, no money clichés), and layout metrics (1200px,
radius 12/8, section padding 80/48) all carry over from v1 unchanged.

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

**Remaining (future passes):**
- Mini wordmarks inside landing-page mockup cards still read "LarisID" text-style.
- OG/social images, Chrome extension icons, email templates.
- `/manifesto` page (HITAM–MERAH mode).
- llms.txt / structured data wording if the display name ever changes from LarisID.
