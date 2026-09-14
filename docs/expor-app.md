# LarisExpor app (`pasar=expor`)

Logged-in LarisExpor is the **same SPA** as home (`index.html` + `js/gpt-app.js`), not a second bundle. Adapter: [`js/expor-pasar.js`](../js/expor-pasar.js). Static SEO sister site stays at [`expor/`](../expor/) (`/expor/produk/` is the `/riset/` equivalent).

Read **[MISSION.md](../MISSION.md)** first. Do not invent Jungle Scout / Helium 10 / BSR unit models.

## Entry

The LarisID side tab (`.expor-tab`) and sidebar market switchers (“LarisExpor” / “LarisID Shopee”) are **hidden for now**. `/expor/` and `/?pasar=expor` still work. Restore via [`scripts/lib/expor-tab.mjs`](../scripts/lib/expor-tab.mjs) (`EXPOR_TAB_MARKUP`) plus `#btn-expor-pasar` / `#btn-shopee-pasar` / landing tab in `index.html`.

| Visitor | `/expor/` (hub) | `/?pasar=expor` |
|---|---|---|
| Logged out | SEO landing | SPA Cari Produk over Amazon |
| Signed in | Redirects to `/?pasar=expor` | Same |

`localStorage laris_pasar_v1` remembers the market. Clearing it (or visiting `/` after `setPasar('shopee')`) returns to Shopee Cari Produk.

Do **not** dump Amazon rows into Shopee Cari Produk.

## Omset (always perkiraan)

Amazon does not publish exact units sold. Shopee omset can be **terukur** (`nowcast_method` `latest`/`blend` — [listing-weekly.md](./listing-weekly.md)). That path does not exist on Amazon.

**Formula:** `omset/bulan (USD) = price_usd × bought_past_month`

- `bought_past_month` is Amazon’s own “N+ bought in past month” badge, stored as the integer floor (100+ → 100, 10K+ → 10000).
- Chip is always **perkiraan**. Never **terukur**.
- Blank (`—`) when Amazon hides the badge (common on furniture).
- Unit column is **Terjual/bln**, not lifetime terjual.
- `nowcast_method` on adapter rows is `amazon_badge`. Do not treat that as Shopee `latest`/`blend`.

DataForSEO `merchant/amazon/products` already returns `bought_past_month`. Ingest: [`scripts/fetch-dataforseo-amazon.mjs`](../scripts/fetch-dataforseo-amazon.mjs) then `node scripts/ingest-amazon-listings.mjs --apply`. Without credentials the fetch script **exits** — it must not invent prices.

Until the DataForSEO account is funded, `scripts/expor-amazon-listings.json` may be a dated Amazon.com US SERP seed (zip 10001, USD). The `_meta.honesty` line in that file is binding.

## Corpus honesty

Rows are **US listings for an Indonesian export keyword** (mapped in [`scripts/expor-keywords.json`](../scripts/expor-keywords.json)). Amazon has **no country-of-origin field**. Never label an ASIN as proven made-in-Indonesia.

## Schema (Contabo)

Apply with `bash scripts/apply-selfhost.sh` — never `supabase db push --linked`.

- `amazon_keywords` — slug, `kw_en`, `nama_id`, kategori, HS
- `amazon_listings` — `(asin, keyword)`, title, image, price_usd, rating, reviews, `bought_past_month`, flags, rank, `fetched_at`
- `amazon_listing_snapshots` — same grain over time (trend % later)
- RPCs: `amazon_search_keywords`, `amazon_listings_for_keywords`, `amazon_listings_home`, `amazon_listing_by_asin`

`omset_usd` in RPCs is `price_usd * bought_past_month` (nullable).

## UI mapping

Same `.lrow` table. Photo → `image_url`; harga → USD; omset → formula above; Terjual/bln → badge; review → review count; usia → `—` until Keepa/first-seen.

Hidden in v1: Trending Sekarang / spark, Favorit Aku, Bandingkan checkbox, Peta Peluang, Shopee kategori mega-menu, “Tanya seller lain”.

Chevron → Deep Dive **lite** (ASIN facts + link to [`/expor/kalkulator/margin-amazon/`](../expor/kalkulator/margin-amazon/) + Comtrade/syarat page). Not Shopee weekly velocity.

Laris AI v1: **LOOKUP only** against `amazon_listings`. `terlaris_minggu` / weekly / trending chips refuse with an honest “no weekly history” message.

## Out of v1

Shopee-only machinery stays Shopee-only: 3-scrape Trending Sekarang, `listing_weekly` next-week forecast, Favorit Aku daily PDP scrape, Peta Peluang scatter, Bandingkan Pasar scores, Keepa listing age / BSR history.

Weekly refresh of the 145-keyword corpus (depth ~20) is enough once DataForSEO is funded. Cost is under $1 per refresh at current DataForSEO Amazon SERP prices.
