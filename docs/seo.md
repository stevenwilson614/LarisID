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
| `riset/` | **Programmatic SEO** — per-keyword Shopee market pages + hub (generated; see below) |
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
| **LarisID** | Rp 0 (100% gratis) | 20 free credits/mo + earn more free via extension; no subscription, no packs |

Tagline “kompetitor bayar 300rb/bulan” is accurate vs **Datapinter**, not Tokpee.

Do **not** trash competitors; state trade-offs. Current public model is **100% gratis** (matches
`llms.txt` + homepage schema): say so consistently. If pricing ever changes back to paid packs,
update `llms.txt`, homepage JSON-LD, `/harga/`, and this doc **together** — inconsistent prices
across pages confuse both search and AI.

## Messaging rules

- **Free tier (the whole product):** 20 credits/month, Finder, 7-day history, community, extension earn-credits
- **More depth** (historical data, more Deep Dive / AI) comes from **earning more free credits** (extension), not paying — never gate honesty or basic viability truth
- Avoid unverifiable social proof (e.g. fake member counts)

## Analytics (landing)

- Cloudflare Web Analytics: pageviews only
- Microsoft Clarity: `vykppujn5k` — heatmaps, recordings
- `openAuthModal('signup', source)` fires `clarity('event', 'cta_signup_click')` + `signup_cta_source`
- Scroll milestones 25/50/75/100% → `scroll_depth_*` events

Spec/history: `docs/landing-analytics.md`

## Programmatic SEO — `/riset/` (the growth multiplier)

Per-keyword market-overview pages built from **real Shopee listing data** in the scraper DB
(`bzmvlraziqevqdyotvgy`). Each page targets a long-tail buyer-intent query
(e.g. "botol minum aesthetic 1 liter") and shows median/range price, listing & store counts,
average rating, estimated units sold, top products by review count, price distribution, and
seller-region breakdown — plus an honest "what this means for you" read and FAQ.

**MISSION guardrails (do not violate):**
- Not thin doorway pages — every page is backed by real data and useful interpretation.
- `harga`/`rating`/`reviews` are **real**; **`terjual` (units sold) is an ESTIMATE** and must be
  labelled as such on every page (links to `/cara-kerja/`).
- No hype ("dijamin laku"), no fake scarcity. State competition honestly.

**Data inputs (both committed, both produced by SQL via the Supabase MCP — no curl needed):**
- `scripts/seo-keywords.json` — headline stats per keyword. **Append-only**: array index maps to
  page order; never reorder. Rating on appended rows is **review-weighted** avg (honest, ~4.x).
- `scripts/seo-detail.json` — per-keyword detail keyed by keyword string (top-8 products, top-6
  regions, 4 price buckets, store count, sold total, concentration). Computed over ALL listings.

**Pipeline (re-run after a scrape refresh):**
1. Pull expanded keyword aggregates (review-weighted rating, dedup latest row per item):
   ```sql
   WITH latest AS (SELECT DISTINCT ON (item_id) item_id, keyword, category, price, est_sold, rating, reviews
     FROM listings WHERE price>0 AND price<1e8 AND keyword IS NOT NULL AND category IS NOT NULL AND category<>''
     ORDER BY item_id, scraped_at DESC)
   SELECT json_agg(row_to_json(a)) FROM (
     SELECT keyword, mode() WITHIN GROUP (ORDER BY category) category, count(*)::int n,
       round(avg(price))::bigint "avgPrice", round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::bigint "medPrice",
       min(price)::bigint "minPrice", round(percentile_cont(0.9) WITHIN GROUP (ORDER BY price))::bigint "p90Price",
       sum(est_sold)::bigint "estSold", sum(reviews)::bigint reviews,
       round((sum(rating*reviews) FILTER (WHERE reviews>0 AND rating>0)/nullif(sum(reviews) FILTER (WHERE reviews>0 AND rating>0),0))::numeric,2)::float rating
     FROM latest WHERE array_length(regexp_split_to_array(btrim(keyword),'\s+'),1)>=3
     GROUP BY keyword HAVING count(*)>=100 AND sum(est_sold)>200000 ORDER BY sum(est_sold) DESC) a;
   ```
   Then `node scripts/merge-seo-keywords.mjs <pull.json>` (append-only merge into seo-keywords.json).
2. Pull per-keyword detail with the detail query (see git history / chat) → save to
   `scripts/seo-detail.json` (object keyed by keyword: stores, sampleItems, soldTotal,
   concentration, top[], regions[], buckets[]).
3. `node scripts/build-seo-pages.mjs` reads both JSON files offline and writes:
   - `riset/<slug>/index.html` — BreadcrumbList + FAQPage + ItemList + **Dataset** JSON-LD,
     per-page `og:image` + Twitter card + `article:modified_time`, related-keyword internal links.
   - `riset/index.html` (hub, grouped by category, CollectionPage JSON-LD)
   - regenerated `sitemap.xml` (static URLs + all `/riset/` pages, per-URL `lastmod`)
4. Bump `SNAPSHOT` / `SNAPSHOT_HUMAN` in `build-seo-pages.mjs` when refreshing.

Shared styles for these pages live in `styles/seo-pages.css` (stat grid, bars, riset cards).
Internal links: nav + footer on every static page and the landing point to `/riset/`.

Current batch: **432 keywords** (filters: ≥100 distinct items, category present, est_sold > 200k,
≥3-word keyword) — the full qualifying set as of the June 2026 snapshot. Re-run the queries as the
scrape DB grows to add more.

## GEO / AEO additions (shipped June 2026)

To increase organic traffic **and** citations from AI answer engines (ChatGPT, Perplexity,
Gemini, Google AI Overviews):

- **Dataset schema** on all 432 `/riset/` pages — the pages are genuine datasets; this is the
  format AI/Google Dataset Search preferentially cite.
- **Freshness signals** — `dateModified` / `article:modified_time` + visible snapshot date; per-URL
  `lastmod` in sitemap.
- **Per-page `og:image` + Twitter cards** on riset/guide/comparison pages (currently the shared
  `images/Banner.jpg`; see "dynamic OG cards" below to upgrade).
- **`/panduan/` guides** (`scripts/build-guides.mjs`) — Article + FAQPage + author (E-E-A-T).
- **Dedicated comparison pages + listicle** (`scripts/build-comparisons.mjs`) — "X vs Y" and
  "best tools" are the highest-intent, most-quoted query shapes.
- **Entity signals** — homepage `Organization` has `founder` (Person), `contactPoint`, `knowsAbout`.
- **AI crawlers** — `robots.txt` explicitly allows GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot,
  Google-Extended, Applebot-Extended, CCBot, etc. Plus `llms.txt` + expanded `llms-full.txt`.

## Manual / off-platform tasks (high ROI, need a human)

These move the needle most for AI recommendations but can't be done from the repo:

1. **Create real entity profiles, then add them to `Organization.sameAs`** in `index.html`
   (currently omitted to avoid inventing URLs): LinkedIn company page, Crunchbase, Product Hunt
   profile, X/Instagram/TikTok. Knowledge-graph presence is what makes LLMs "know" the brand.
2. **Wikidata item** for LarisID — feeds the knowledge graphs LLMs train on.
3. **List on G2 / Capterra / SaaSHub** — these are AI's go-to sources for "best [tool]" answers.
4. **Digital PR / data study** — publish "Laporan Tren Produk Shopee 2026" from scraper data; it's
   the most back-linkable, most-cited asset type and nobody else has the data.
5. **Submit sitemap** in Google Search Console + Bing Webmaster after deploy.

## Core Web Vitals plan

`index.html` is a ~34k-line SPA; the landing's LCP/JS payload is the main risk (static SEO pages
are already light). Priorities when optimizing:

- Defer/lazy-load the logged-in app bundle so the landing paints without it (biggest win).
- Ensure the LCP hero image/text is in the initial HTML (it is) and not blocked by fonts — consider
  `font-display: swap` (already via Google Fonts `&display=swap`) and preloading the hero image.
- Audit with PageSpeed Insights / Lighthouse on the live homepage; target LCP < 2.5s, INP < 200ms,
  CLS < 0.1. The `/riset/`, `/panduan/`, `/perbandingan/` static pages should already pass.

## AI-referral tracking

Measure GEO wins so effort is data-driven. In analytics (Clarity / Cloudflare), segment referrers:
`chat.openai.com`, `chatgpt.com`, `perplexity.ai`, `gemini.google.com`, `copilot.microsoft.com`,
`bing.com` (Copilot). Watch for these as `document.referrer` on landing; rising AI referrals =
the schema/llms/entity work is paying off.

## Dynamic OG cards (future upgrade)

Per-page OG images currently fall back to `images/Banner.jpg`. To generate a unique data card per
riset page (keyword + median price + rating), add a build step using `satori` + `resvg` (SVG→PNG)
in `build-seo-pages.mjs` writing `riset/<slug>/og.png`, then point `og:image` at it.

## When editing SEO

1. Update **all** of: relevant static page, `llms.txt`, AND `llms-full.txt` if facts change
   (prices, credits, competitor public pricing, page counts).
2. Bump `lastmod` in `sitemap.xml` for changed URLs (the builder does this for generated pages).
3. Keep `deploy-pages.yml` `cp` list in sync if adding new top-level static dirs/files
   (already includes `riset panduan` dirs and `llms-full.txt`).
4. Re-read `MISSION.md` before comparison copy. Never invent competitor prices or `sameAs` URLs.
5. Generators: `build-seo-pages.mjs` (riset + sitemap), `build-guides.mjs` (/panduan/),
   `build-comparisons.mjs` (/perbandingan/ subpages). Sitemap is owned by `build-seo-pages.mjs` —
   add new static URLs to its `staticUrls` array.

## Related docs

- `docs/pricing-research.md` — competitor pricing research
- `docs/score-review.md` — Viability Score methodology notes
- `docs/landing-analytics.md` — Clarity event spec
- `docs/ai-chat-decision.md` — no standalone chatbot; product-scoped AI only

## Post-deploy checklist

1. Push to `main` → GitHub Pages deploy (IndexNow ping fires automatically for all sitemap URLs)
2. Verify: `/riset/`, `/panduan/`, `/perbandingan/alat-riset-produk-shopee-terbaik/`,
   `/llms.txt`, `/llms-full.txt`
3. Google Search Console → submit `sitemap.xml` (now 447 URLs)
4. Bing Webmaster → confirm sitemap; spot-check a few `/riset/` pages in URL Inspection
5. Request indexing for the new `/panduan/` and `/perbandingan/` hub pages
