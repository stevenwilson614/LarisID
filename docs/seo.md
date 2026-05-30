# SEO & GEO (AI discoverability) — LarisID

*Context for humans and AI assistants working in this repo. Last updated: May 2026.*

## Goal

Rank for Indonesian **Shopee / e-commerce product research** queries and give AI models a **single, honest source of truth** about LarisID vs **Datapinter**, **Tokpee**, and **Shoptik** (mission, price, features).

## Site architecture (static GitHub Pages)

The public site is **not** a multi-route Astro app in production. It is assembled in CI from the repo root:

| Path | Role |
|------|------|
| `index.html` | SPA: landing + logged-in app (~27k lines). Landing HTML is in the initial document (crawlable). |
| `privacy/` | Privacy policy |
| `perbandingan/` | Competitor comparison (SEO + FAQPage schema) |
| `harga/` | Pricing & credit model |
| `tentang/` | Mission, team, principles |
| `cara-kerja/` | Data methodology, Viability Score, AI limits |
| `styles/seo-pages.css` | Shared CSS for static SEO pages |
| `llms.txt` | Plain-text fact sheet for AI crawlers |
| `sitemap.xml` | Submit in Google Search Console |
| `robots.txt` | Allows all; links sitemap + llms.txt |

Deploy: `.github/workflows/deploy-pages.yml` copies the paths above into `_site/` on push to `main`.

## Homepage SEO (`index.html` `<head>`)

- **Primary keywords:** riset produk shopee, riset produk e-commerce indonesia, alternatif datapinter
- **H1 (landing):** “Riset Produk Shopee dengan Data Nyata” (not generic brand-only H1)
- **JSON-LD:** `@graph` with `WebSite`, `SoftwareApplication`, `Organization`, `FAQPage`
- **Removed:** `SearchAction` (no on-site `?q=` search — was invalid schema)
- **Link:** `<link rel="alternate" href="https://larisid.com/llms.txt">`

Landing FAQ + JSON-LD include competitor questions. Footer/nav link to static SEO pages.

## Competitor positioning (use honestly — MISSION §3)

From `docs/pricing-research.md` (verify periodically):

| Tool | ~Price | Notes |
|------|--------|--------|
| **Datapinter** | ~Rp 299.000/mo | Closest feature-equivalent; subscription |
| **Tokpee** | ~Rp 50.000/mo (annual) | Chrome extension; Shopee + Tokopedia; narrower |
| **Shoptik** | Not published | Shopee research; promo-heavy |
| **LarisID** | Rp 0 + packs Rp 25k / Rp 40k | Credits, no mandatory subscription |

Tagline “kompetitor bayar 300rb/bulan” is accurate vs **Datapinter**, not Tokpee.

Do **not** trash competitors; state trade-offs. Do **not** claim “100% gratis selamanya” if paid packs exist — say “gratis untuk mulai” + credit depth.

## Messaging rules

- **Free tier:** 5 credits/month, Finder, 7-day history, community, extension earn-credits
- **Paid:** depth only (historical data, more Deep Dive / AI) — never gate honesty or basic viability truth
- Avoid unverifiable social proof (e.g. fake member counts)

## Analytics (landing)

- Cloudflare Web Analytics: pageviews only
- Microsoft Clarity: `vykppujn5k` — heatmaps, recordings
- `openAuthModal('signup', source)` fires `clarity('event', 'cta_signup_click')` + `signup_cta_source`
- Scroll milestones 25/50/75/100% → `scroll_depth_*` events

Spec/history: `docs/landing-analytics.md`

## When editing SEO

1. Update **both** the relevant static page and `llms.txt` if facts change (prices, credits, competitor public pricing).
2. Bump `lastmod` in `sitemap.xml` for changed URLs.
3. Keep `deploy-pages.yml` `cp` list in sync if adding new top-level static dirs.
4. Re-read `MISSION.md` before comparison copy.

## Related docs

- `docs/pricing-research.md` — competitor pricing research
- `docs/score-review.md` — Viability Score methodology notes
- `docs/landing-analytics.md` — Clarity event spec
- `docs/ai-chat-decision.md` — no standalone chatbot; product-scoped AI only

## Post-deploy checklist

1. Push to `main` → GitHub Pages deploy
2. Verify: `/perbandingan/`, `/harga/`, `/llms.txt`
3. Google Search Console → submit sitemap
4. Request indexing for `/perbandingan/`
