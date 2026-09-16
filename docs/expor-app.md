# LarisExpor app (`pasar=expor`)

Logged-in LarisExpor is the **same SPA** as home (`index.html` + `js/gpt-app.js`), not a second bundle and **not** the lab kartu HTML under [`lab/expor-os/kartu/`](../lab/expor-os/). Adapter: [`js/expor-pasar.js`](../js/expor-pasar.js). Static SEO sister site stays at [`expor/`](../expor/).

Read **[MISSION.md](../MISSION.md)** first. Do not invent Jungle Scout / Helium 10 / BSR unit models. Do not claim an ASIN is made in Indonesia.

## Gate (not public)

Amazon mode is **lab-only**. `pasar=expor` is on only if **localhost**, or **admin/leader** (`current_app_role`), or `localStorage.laris_expor_lab = 1`.

Turn it on locally:

```js
localStorage.setItem('laris_expor_lab', '1')
// then open /?pasar=expor
```

| Visitor | `/expor/` (hub) | `/?pasar=expor` |
|---|---|---|
| Public (not gated) | Stay on the SEO hub | Param stripped; stay on Shopee SPA |
| Gated + signed in | Redirect to `/?pasar=expor` | Amazon SPA twin |
| Gated + logged out | SEO hub | Amazon SPA if the URL still has the param (localhost / flag) |

`#btn-expor-pasar` / `#btn-shopee-pasar` show **only** when the gate is on (`body.expor-lab`). The public landing `.expor-tab` stays hidden. Do **not** unhide those for everyone. Do **not** `bash scripts/deploy-static.sh` for this. Do **not** edit live [`harga/index.html`](../harga/index.html), [`tentang/`](../tentang/index.html), or `llms.txt` until you graduate.

The URL is still the switch once gated: `/?pasar=expor` is Amazon, `/` is Shopee. Do not restore expor from `laris_pasar_v1` for ungated visitors.

Do **not** dump Amazon rows into Shopee Cari Produk.

## Same chrome, Amazon-aware copy

| Surface | Gated expor |
|---|---|
| **Cari Produk** | Same `.lrow` / mascots. USD harga. Omset perkiraan. Hide Trending / Peta / Shopee kategori until Amazon history exists. |
| **Laris AI** | LOOKUP against `amazon_listings`. Weekly / terlaris chips refuse honestly. |
| **Deep Dive** | ASIN facts + lab US-entry chips / HTS estimate (fetch `/lab/expor-os/data/*.json` over local HTTP). Link to Comtrade/syarat page. Not Shopee weekly velocity. |
| **Favorit Aku** | Bookmark ASINs in `localStorage.laris_expor_favs_v1` (`item_id` = ASIN, `shop_id` = `amazon`). Contabo `add_tracked_product` is bigint + Shopee `listing_required` — do not send ASINs there. **No** daily Amazon PDP scrape. Copy: “pantau harian Amazon belum ada”. |
| **Komunitas** | Same board. Copy only: “Tanya seller / eksportir lain”. No new table, no auto-post. |
| **Riwayat** | Threads tagged `pasar` in chat context / URL so Shopee and Amazon pools do not mix. |
| **Harga / FAQ / Tentang** | SPA sidebar views swap Jungle Scout / Helium 10 copy when gated expor is on. Public `/harga/` and `/tentang/` stay Shopee. |

Jungle Scout Starter list price (their help center, checked 16 September 2026): **US$ 49/month** or **US$ 348/year**. Helium 10 Platinum is cited from 2026 third-party lists (~US$ 129/month) with “cek helium10.com”. Concede they win on BSR/revenue models and Brand Analytics. LarisExpor is **Rp 0** with badge omset perkiraan only. Do not scrape Jungle Scout.

## Omset (always perkiraan)

Amazon does not publish exact units sold. Shopee omset can be **terukur** (`nowcast_method` `latest`/`blend` — [listing-weekly.md](./listing-weekly.md)). That path does not exist on Amazon.

**Formula:** `omset/bulan (USD) = price_usd × bought_past_month`

- `bought_past_month` is Amazon’s own “N+ bought in past month” badge, stored as the integer floor (100+ → 100, 10K+ → 10000).
- Chip is always **perkiraan**. Never **terukur**.
- Blank (`—`) when Amazon hides the badge (common on furniture).
- Unit column is **Terjual/bln**, not lifetime terjual.
- `nowcast_method` on adapter rows is `amazon_badge`.

Until you fund a fetch, Cari looks empty except the seeded Contabo keywords (meja jati, kursi rotan, minyak kelapa).

## Corpus honesty

Rows are **US listings for an Indonesian export keyword** (mapped in [`scripts/expor-keywords.json`](../scripts/expor-keywords.json)). Amazon has **no country-of-origin field**. Never label an ASIN as proven made-in-Indonesia.

Named US importers stay lab-only (licensed BOL CSV). Not in the SPA.

## Collect Amazon data (DataForSEO, not a Chrome scrape)

Do **not** stand up a CDP Amazon scraper like the Shopee repo. Captcha, ToS, and we already have a billed SERP path that writes the files the SPA expects.

You need:

1. A **DataForSEO** account, funded (full 145 keywords × depth ~20 is under ~$1 per refresh).
2. Local env only (never commit): `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD`.
3. Run the 20 pilots first:

```bash
node lab/expor-os/collectors/refresh-amazon-pilots.mjs
# or:
DATAFORSEO_LOGIN=… DATAFORSEO_PASSWORD=… node scripts/fetch-dataforseo-amazon.mjs --only kursi-rotan,kopi-gayo
```

4. That writes [`scripts/expor-amazon.json`](../scripts/expor-amazon.json) + [`scripts/expor-amazon-listings.json`](../scripts/expor-amazon-listings.json). Omset is Amazon’s own `bought_past_month` badge floor. The script **exits** if credentials are missing; it will not invent prices.
5. When you are ready for the live API (still not public UI): `node scripts/ingest-amazon-listings.mjs --apply` onto Contabo. Skip this while you only want local files.
6. Optional later: Keepa for listing age / BSR **history** — not required for Cari v1, and never convert BSR into fake units.

## Schema (Contabo)

Apply with `bash scripts/apply-selfhost.sh` — never `supabase db push --linked`.

- `amazon_keywords` — slug, `kw_en`, `nama_id`, kategori, HS
- `amazon_listings` — `(asin, keyword)`, title, image, price_usd, rating, reviews, `bought_past_month`, flags, rank, `fetched_at`
- `amazon_listing_snapshots` — same grain over time (trend % later)
- RPCs: `amazon_search_keywords`, `amazon_listings_for_keywords`, `amazon_listings_home`, `amazon_listing_by_asin`

`omset_usd` in RPCs is `price_usd * bought_past_month` (nullable). No Contabo schema yet for the US/HTS OS card.

## Offline OS lab (not deployed)

[`lab/expor-os/`](../lab/expor-os/README.md) remains the data notebook (US rules, HTS, optional BOL). Lab builders write **only** under `lab/expor-os/`. They must not run `scripts/build-expor.mjs`, `scripts/ingest-amazon-listings.mjs --apply`, or `bash scripts/deploy-static.sh` unless asked. Do not copy `lab/expor-os/kartu/` into `expor/`.

## Out of v1 / until you graduate

- Unhiding market switchers for all users
- Changing public `/harga/`, `/perbandingan/`, `llms.txt`
- `bash scripts/deploy-static.sh` for this work
- Jungle Scout / Helium 10 scrapes or cloned BSR models
- Daily Amazon Favorit PDP scraper
- Alibaba-style buyer marketplace
- Shopee-only machinery: 3-scrape Trending Sekarang, `listing_weekly` forecast, Peta Peluang, Bandingkan Pasar scores
