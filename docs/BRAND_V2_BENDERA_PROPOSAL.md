# LarisID Brand v2 — "Bendera" (PROPOSAL)

> **Status: PROPOSAL — approved direction, not yet applied to the site.**
> Decided with Steven on 2026-06-12: full rebrand, defiant-vs-big-tools tone, raised-flag emblem.
> Until this is implemented, the live site still follows `~/Downloads/LARISID_BRAND_GUIDE.md` (v1).
> This document supersedes v1 once rollout begins. MISSION.md remains binding above both.

---

## 1. The idea

LarisID stops being "a free tool" and becomes **a movement of small sellers**: dari penjual,
untuk penjual. The product is the same; the identity changes from *polished SaaS that happens
to be free* to *a flag that small sellers raise together*.

### The story (internal narrative — informs all copy)

Indonesia is an archipelago. Commerce is a sea. The big players sail big ships with radar
rooms — analytics teams, paid data, capital. Small sellers sail blind and are told that's
normal, that real market research costs 300rb/month and is not for them.

LarisID is the shared radar. World-class product research, raised like a flag anyone can
sail under, free — not as a promo, but as the point. Every user is **kru**. Together they
are an **armada** of small boats.

This deliberately channels the feeling of the 2025 Jolly Roger moment (ordinary people
raising their own flag against giants) **without** copying the symbol or referencing
politics. See guardrails in §9.

### Movement vocabulary

| Term | Use |
|------|-----|
| **Bendera Laris** | The emblem. "Naikkan benderamu" = sign up / join / start |
| **Armada** | The community of LarisID sellers |
| **Kru** | A member; "satu kru" = fellow seller |
| **Kapal besar** | The unnamed adversary: big-capital players and 300rb/month gatekept tools |
| **Naik kelas** | What the movement is for: small sellers leveling up |

Pronoun shift: instructions still use "kamu"; movement moments use **"kita"**
("Kita? Gratis." not "Kamu gratis.").

---

## 2. Emblem — Bendera Laris

A fist raising a swallowtail pennant with an upward arrow.

- **Fist** = raised by hand, not flown by a corporation.
- **Swallowtail pennant** = a ship's flag — the armada story (and a legally/politically
  safe echo of the flag-raising moment; it is NOT a skull, NOT a pirate flag).
- **Up arrow** = naik kelas; doubles as a growth chart.

### Design law: the marker test
The Jolly Roger spread in 2025 because anyone could draw it. The emblem must always be
reproducible by hand with a marker in five seconds. **Never** add gradients, shading,
3D, mascot detailing, or thin lines that break at small sizes or in a stencil.

### Variants
1. **Full emblem** (fist + pole + flag): hero, posters, merch, stickers.
2. **Mark only** (pennant + arrow): favicon, app icon, avatar, rubber stamp, list bullets.

### Reference geometry (full emblem, viewBox 0 0 220 250)
```svg
<line x1="96" y1="26" x2="62" y2="205" stroke="#1B1814" stroke-width="10" stroke-linecap="round"/>
<path d="M96 30 L200 48 L170 72 L198 96 L83 94 Z" fill="#E2301C"/>
<path d="M141 84 L141 60" stroke="#F4EEE2" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="M124 72 L141 52 L158 72" stroke="#F4EEE2" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path d="M70 173 L152 235" stroke="#1B1814" stroke-width="28" stroke-linecap="round" fill="none"/>
<circle cx="68" cy="172" r="23" fill="#1B1814"/>
```

### Mark only (viewBox 0 0 140 90)
```svg
<path d="M8 10 L134 28 L102 50 L132 72 L8 68 Z" fill="#E2301C"/>
<path d="M62 60 L62 38" stroke="#F4EEE2" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="M49 49 L62 32 L75 49" stroke="#F4EEE2" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
```

Color rules: red flag + ink fist on Kertas; invert to Kertas flag on Tinta surfaces;
single-color stencil (all-Tinta or all-Kertas) always permitted.

---

## 3. Wordmark

`LARISID` set in **Anton**, all caps: "LARIS" in Tinta (Kertas on dark), "ID" always
Merah Laris. Mark-only pennant may sit to the left of the wordmark.

Replaces the v1 two-weight Plus Jakarta Sans wordmark. Keep: never split the words,
never recolor "ID" to anything but red, no effects, no distortion.

---

## 4. Color — "Tinta & Kardus" palette

Protest poster + packing-room materials. Ink on paper, cardboard, packing tape —
the actual materials of a small seller's life.

```css
--laris-merah:   #E2301C;  /* Merah Laris — CTAs, the flag, key numbers. Evolved from v1 #E8442A: redder, more defiant */
--laris-tinta:   #1B1814;  /* Ink black — text, posters, dark surfaces. REPLACES navy #1A1F3C */
--laris-kertas:  #F4EEE2;  /* Warm paper — page background. Replaces #F7F6F3 (warmer, zine-like) */
--laris-kardus:  #E0D2B8;  /* Kraft cardboard — secondary surfaces, panels */
--laris-selotip: #F2B705;  /* Tape yellow — badges, highlights. Evolved from gold #F5A623 */
--laris-merah-dark: #B82414; /* hover for red buttons */
--laris-muted:   #5C5446;  /* secondary text on paper */
--laris-border:  #D8CCB4;  /* borders on paper/kardus */
```

- Page background is always Kertas, never pure white.
- Merah is the only primary CTA color.
- Navy is retired everywhere. Never blue/purple/teal (unchanged from v1).
- **Viability Score color coding is UNCHANGED** (function over brand):
  75–100 `#1A7A46`/`#EAF7F0`, 55–74 `#B45309`/`#FFFBEB`, 0–54 `#C0392B`/`#FEF2F0`.
- Charts: remap v1 dashboard ramp navy→Tinta, gold→Selotip, orange→Merah. Same ordering logic.

---

## 5. Typography

| Role | Font | Rules |
|------|------|-------|
| Display / hero / posters / wordmark | **Anton** (Google Fonts, single weight) | ALWAYS ALL CAPS, line-height 1.05–1.25, tight. Red or Selotip for the one emphasized phrase only |
| Body, UI, data, forms | **Plus Jakarta Sans** 400/600/700/800 | KEPT from v1 — designed in Indonesia by Tokotype. Tell that story: "bahkan font kami buatan lokal" |

Anton is for shouting; never set body copy, helper text, or data in it.
Body rules from v1 stand: sentence case, no all-caps body, line-height 1.65–1.75.

---

## 6. Voice

v1 voice ("fellow seller who did the research for you") stays the base. v2 sharpens it
with movement framing:

- **The adversary is a thing, not a person**: paywalled tools, gatekept data,
  "harga riset 300rb/bulan". We punch at prices and gatekeeping, never at people,
  never at named companies' employees, never at Shopee, never at government (§9).
- **Kita over kamu** in rallying copy. "Kompetitor bayar 300rb/bulan. Kita? Gratis."
- **Gratis is identity, not promo.** "Gratis, titik. Bukan trial."
- Honesty rules from MISSION.md unchanged: show risk, no hype, no fake scarcity,
  no shaming beginners.

### Taglines
| Line | Context |
|------|---------|
| "Riset Produk Shopee. 100% Gratis." | KEPT — functional tagline, SEO, ads |
| "Dari penjual, untuk penjual." | Movement tagline — about page, footer, merch |
| "Data bukan cuma milik yang punya modal." | Hero headline, posters |
| "Naikkan benderamu." | Signup CTA, join-the-armada moments |
| "Kompetitor bayar 300rb/bulan. Kita? Gratis." | Comparison (evolved from v1 "kamu") |
| "Satu armada, sejuta perahu kecil." | Community, social, milestone posts |
| "Kapal besar punya radar. Sekarang kita juga." | Feature explainers |
| "Tahu produk mana yang laris sebelum modal keluar." | KEPT — educational content |

### Manifesto (canonical copy — use verbatim)
> MEREKA BILANG RISET PASAR ITU MAHAL.
> MEREKA KUNCI DATA DI BALIK PAYWALL.
> KAMI BILANG: TIDAK.
>
> Laut ini bukan punya kapal besar saja. Setiap penjual berhak tahu apa yang laris —
> sebelum modal keluar. LarisID gratis. Bukan promo, bukan trial. Gratis, titik.
> Ini bukan produk korporat. Ini bendera kita, dari penjual untuk penjual.
>
> SATU ARMADA. SEJUTA PERAHU KECIL.

Gets its own page (`/manifesto`), linked from nav. The manifesto IS the marketing.

---

## 7. Graphic language

- **Stamp**: bordered, slightly rotated "100% GRATIS" rubber-stamp chips (3px red border,
  Anton, rotate 4–8deg). The v2 replacement for v1's badge chips.
- **Tape**: Selotip-yellow strips (slight rotation) as highlight bars and badge backgrounds.
- **Bunting**: pennant-string dividers (Merah/Tinta/Selotip triangles) — Agustusan street
  energy, ties to the flag emblem.
- **Stencil texture**: flat shapes only; rough edges acceptable, gradients never.
- **Icons**: wire/outline SVG only, ~2px stroke. NEVER emojis (standing rule).
- **Photography**: unchanged from v1 — real Indonesian sellers, garages, warung, bubble
  wrap, ongkir labels. Flash-photo zine framing fits v2 even better.

---

## 8. What stays from v1 (unchanged)

- MISSION.md — binding, above this document.
- "100% Gratis" + "Tanpa Daftar · Langsung Pakai" value props on every entry point.
- The 6 trust pillars (verifiable data, real numbers, methodology transparency,
  zero-friction first experience, local social proof, human face).
- Viability Score: 0–100 range, color coding, band copy, 70-threshold cosmetic only.
- Plus Jakarta Sans for body/UI.
- CTA verbs: Mulai, Coba, Temukan, Lihat, Cek — never "Klik di sini". Add: Naikkan.
- Max width 1200px, card radius 12px, button radius 8px, section padding 80/48.

---

## 9. Guardrails (red lines — read with MISSION.md)

1. **Never use One Piece IP**: no Jolly Roger, no skull-and-crossbones, no straw hat,
   no character names, no "nakama". We echo the *feeling* with original symbols only.
2. **Never anti-government**: no protest-event references, no political figures, no
   "korupsi" framing, no 2025-movement slogans. The adversary is expensive gatekept
   tooling, full stop. (Context: officials threatened criminal charges over the 2025
   flags — this is real risk, not paranoia.)
3. **Never target Shopee**: LarisID depends on Shopee data. Shopee is the sea we all
   sail, never the kapal besar.
4. **Never betray the flag** (the Robinhood lesson: "democratize finance" branding made
   their GameStop trading halt catastrophic). A movement brand makes every future
   compromise more expensive. Concretely: no paywalls ever (already in MISSION),
   no ads dressed as data, no selling user data. If monetization ever returns, it must
   be openly discussed with the armada first.
5. **Defiant, never bitter**: tone is confident and grinning, not angry. We are winning,
   not whining. No shaming sellers who use paid tools.

---

## 10. Rollout checklist (when implementation is approved)

1. Fonts: add Anton to the Google Fonts import; keep PJS weights.
2. CSS variables: introduce v2 palette tokens; map old → new
   (`#1A1F3C`→`#1B1814`, `#E8442A`→`#E2301C`, `#F7F6F3`→`#F4EEE2`, `#F5A623`→`#F2B705`).
3. Wordmark component + favicon swap (mark-only pennant).
4. Hero: Kertas background (light hero replaces navy hero), Anton headline
   "DATA BUKAN CUMA MILIK YANG PUNYA MODAL.", tape badge, red CTA "Naikkan Benderamu".
5. `/manifesto` page; link in nav and footer.
6. Signup flow copy: joining = "naik bendera"; welcome email/screen greets "satu kru".
7. Dashboard chart colors remapped (§4); Viability Score visuals untouched.
8. Social templates: ink/paper/red, one fact per frame (v1 rule kept).
9. Update structured data / llms.txt / OG images last, after visual QA.

Each step: commit + push (standing rule), verify on GitHub Pages.
