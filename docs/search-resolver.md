# Market search resolver

Cari Produk, Laris AI `cari_pasar`, and LOOKUP ask `resolve_market` instead of guessing from one shared token. A miss stays a miss. The old client matcher stays behind `?resolver=legacy` until **2026-11-09**, then it should be deleted in its own commit.

## Tiers

| Tier | Meaning | What the screen does |
|---|---|---|
| `exact` | The phrase is a keyword, or a phrase alias (`cross stitch` → kristik) | Listings for that keyword. A couple of siblings that share the rare token (`gelang manik` still shows `kalung manik`). No “nearby” lead. |
| `strong` | Every product word is a whole word of the keyword. `boot` does not hit `booth`. | Same as a keyword hit. Two or more markets become a chooser. |
| `brand` | A known brand, or a brand-first unknown token (`sorel boots`) | `listings_for_brand` puts titles that name the brand first. |
| `brand_missing` | The brand has zero titles (Sorel) | The product-noun markets (`sepatu boots wanita`), and the lead says the brand is not in the data. |
| `title` | The words appear together in listing titles, not as one keyword | Lead says the titles match. Omset on those rows is the market’s existing nowcast. |
| `nearby` | Only a related market, confidence capped at 0.4 | Lead says these are the nearest markets. Minta Produk opens. |
| `fresh` | Scraped in the last 48 hours, not in `product_types_v` yet | Harga and terjual only. Omset is `—` (“butuh 2 pengukuran”). Badge “Baru diukur hari ini”. |
| `none` | Nothing we can stand behind | Empty table, nearest markets as chooser cards, Minta Produk open. |

Spell-correct uses `market_vocab` (our own words), explicit aliases (`grepuk` → `geprek`), and a consonant skeleton. A token that is already a keyword is not rewritten (`birkenstok` stays, and is also a Birkenstock alias). Corrections require the same first three letters, so `sorel` does not become `solar` and `boot` does not become `booth`.

## Rebuild

After a corpus refresh, `refresh_breakout_matviews` calls `rebuild_market_search(false)` (keywords, index, brands — not the title-token scan).

```bash
# keywords + brands, a few seconds to a minute
ssh … "docker exec -i supabase-db psql -U postgres -d postgres -c 'select public.rebuild_market_search(false);'"
```

`rebuild_market_vocab(true)` adds title tokens from the top 80k sold listings. It is optional and slow. Seeds (`geprek`, brand names) survive a rebuild.

## Eval

`scripts/data/search-golden.json` is the gate. `scripts/data/search-golden-baseline.json` is the pre-resolver `search_listings` snapshot (2026-10-26), including the three dir-timing captures: ayam grepuk → 201 cat-food rows, sorel boots → 120 tents, birkenstok sandel → 155 generic sandals.

```bash
node scripts/search-eval.mjs          # hard cases must pass
node scripts/search-eval.mjs --all    # every row
```

Hard cases: `ayam grepuk` corrects to geprek and must not return cat food; `sorel boots` is brand Sorel, missing, boots markets, no tents; `birkenstok sandel` is brand Birkenstock with Birkenstock markets first.

## Express lane

`none` / a real miss can call `request_scrape_keywords`, which also inserts `express_scrape_jobs` when that table exists. The Mac worker is `express_worker.py` in the scraper repo. Copy is honest: “biasanya 2–5 menit” only when a heartbeat is under 90 seconds, otherwise “besok pagi”. A finished job is readable via `listings_fresh_for_keyword` before the next matview refresh. One scrape is not a monthly omset.

Cap: 60 successful express scrapes per rolling day, 3 new keyword requests per user per day. The launchd template is not loaded.

## Taxonomy

`market_index.kind` is `product | brand | shop | modifier | unknown`. `parent_keyword` is the broader product market. `product_types_v` exposes both. Home (`listings_home`) and `ringkasan_kategori` keep `product` and `unknown` only, so an unclassified market does not disappear and a shop keyword does not win Terlaris.

Admin → “Pasar yang belum diklasifikasi” writes `market_index_overrides` (`source=manual`), which the rebuild will not clobber.

```bash
node scripts/classify-market-index.mjs            # print candidates
node scripts/classify-market-index.mjs --apply --limit=20
```

Do not run `--apply` across the whole catalogue without meaning to spend the model budget.

Deep Dive peers and My Toko’s `match_titles_to_keywords` use `parent_keyword` when the hit is a brand or shop, or the keyword has fewer than 30 listings.

## pgvector

`vector` is in `pg_available_extensions` on this Contabo image and is **not** created. Nearby stays trigram plus the title scan. Turn the extension on only when something is going to write embeddings.

## Cadence check (2026-10-26)

`mv_keyword_weekly.wk_span_days` median is **22** (min 7, max 28). The queue SLA is 7 days; the pairs we have actually measured are still about three weeks apart. Keep telling sellers the scrape gap is 12–17 days until that median moves.

## Apply order

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261026220000_market_search_index.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261026221000_resolve_market.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261026222000_market_search_bridges.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261026223000_express_scrape.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261026224000_market_taxonomy.sql
# then rebuild_market_search(false) if the tables were empty
node scripts/search-eval.mjs
bash scripts/deploy-static.sh
```
