# Peta Peluang — trend math + Trending Sekarang

Live Cari Produk / chat listing hosts no longer mount the photo scatter.
`peta_batch` still attaches `_petaTrend` so we can rank **Trending Sekarang**
(top 3) and fill the table’s Trending column. The scatter (`PetaPeluang.mount`)
stays in the module for Jejak / Langit but is not painted on those pages.

One listing = `(item_id, shop_id)`.

## Where it lives

- Module: [`js/peta-peluang.js`](../js/peta-peluang.js) (`window.PetaPeluang`)
- CSS (scatter, unused on Cari Produk): [`styles/peta-peluang.css`](../styles/peta-peluang.css)
- SQL: [`supabase/migrations/20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql)
- Weekly backfill: `~/shopee_scraper/listing_weekly.sql` (`backfill_listing_weekly_estimates`)
- Hosts:
  - Cari Produk (`#dir-trending-now`) — top 3 rank rows, then Urutkan, then
    `listingRowsHtml` (`actions: true`). Keyword chips filter both.
  - Chat search / finder / recs (`.trend-host`) — same strip + table chrome.
  - Bandingkan Pasar is **not** mounted here. Chat-only
    (`handleBandingkanIntent`) — see [pasar-compare.md](./pasar-compare.md).

`PetaPeluang.hydrateTrends(listings, { supabase, onTrend })` is the live path.
It marks `_petaTrend.pending`, calls `peta_batch` (max 200 keys, 8 weeks), then
attaches `{ wkPct, moPct, terukur, belum, pending }`. It does not draw SVG.

The Cari Produk listing pool uses `listings_for_keywords` (LATERAL per-keyword
lookup — do not `btrim()` the `listings_deduped.keyword` column). Home
keywords/listings are prefetched at boot.

## Ranking

`peta_batch` still receives up to 200 keys. After frames arrive, each listing
gets `_petaTrend` from the same 8-week `omset_wk` positions:

| Window | Formula |
|---|---|
| Weekly % | `(avg omset_wk of W0 + W0−7 − avg of W0−14 + W0−21) / prev` |
| Monthly % | sum of last 4 weeks vs previous 4 |

- Drop `belum`: fewer than 4 weeks in the recent window, previous weekly
  omset below Rp 50rb, or no `measured` / `estimated` / `nowcast` week.
- Clamp `−100` … `+300` (same as unit momentum).
- **Trending Sekarang** shows the top **3** by weekly % desc. Skip `belum` /
  missing. If none qualify after hydrate, hide the strip.
- While `peta_batch` is in flight, show a 3-row skeleton (not a grey square).
  Do not invent a %. If the RPC is missing, the strip stays hidden and the
  table Trending column shows `—`.

Never present a raw two-snapshot delta as “minggu ini” or “30 hari terakhir”.
Scrapes land 12–17 days apart; weeks are already span-normalised in
`listing_weekly`.

## Cari Produk layout

1. Cat rail + heading / count
2. Trending Sekarang (mascot + photo + one % with arrow + Deep Dive)
3. Urutkan (`#dir-filters-range` — includes Paling Trending; default remains omset)
4. Keyword chips + listing table + pager + compare bar

Table chrome (`actions: true`): bandingkan checkbox, one weekly % with arrow,
Favorit bookmark (`trackKeywordWithNotify` — keyword Pantauan, not
`user_tracked_products`), chevron / product cell → Deep Dive.

Row click is Deep Dive. Checkboxes do not steal the row.

## Honesty

See [listing-weekly.md](./listing-weekly.md). Tooltip on %: 2-week omset average
vs previous 2 weeks, span-normalised — not vs calendar last week. Label
`perkiraan` unless both windows are `source=measured` (`terukur`). Do not
revive `weekly_snapshots`.

## Momentum (units, unused on live hosts)

`units_cur` = avg `units_wk` over W0 and W0−7. `units_prev` = avg over W0−14 and W0−21.

- `belum` if fewer than 4 weeks, `units_prev < 15`, or no measured/estimated/nowcast week
- `naik` if pct ≥ 20, `turun` if pct ≤ −20, else `stabil`

Omset % on Trending Sekarang and the table column is the parallel calculation
on `omset_wk`, not `units_wk`.

## Scatter module (not mounted)

`PetaPeluang.mount` still implements Peluang / Jejak / Langit (top 20 photo
scatter, zones, sibling list). Do not remount it on `#dir-trending-now` or
`.trend-host`. Zone-filter / map hover sync are retired with the canvas.

## Refresh

After `refresh_listing_weekly()`:

```
SELECT backfill_listing_weekly_estimates(10);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_momentum;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_week_positions;
```

`bash ~/shopee_scraper/refresh_listing_weekly.sh` runs those steps. First
backfill can take several minutes.

Client RPC: `peta_batch(p_keys jsonb, p_weeks int default 8)` — max 200 keys.

## Host contract

```
PetaPeluang.hydrateTrends(listings, {
  supabase,
  onTrend,   // listings now have _petaTrend (pending, then final)
})
```

`_petaTrend`: `{ wkPct, moPct, terukur, belum, pending }`.

## Copy

Trending subtitle and % tooltips are everyday Bahasa. Confirm aloud with
Afryian & Hendra before treating new lines as final (`mentor-copy`).
