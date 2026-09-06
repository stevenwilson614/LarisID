# Peta Peluang — trend math + Trending Sekarang

Live Cari Produk / chat listing hosts no longer mount the photo scatter.
`peta_batch` still attaches `_petaTrend` so we can rank **Trending Sekarang**
(top 3) and fill the table’s Trending column. The scatter (`PetaPeluang.mount`)
stays in the module for Jejak / Langit but is not painted on those pages.

One listing = `(item_id, shop_id)`.

## Where it lives

- Module: [`js/peta-peluang.js`](../js/peta-peluang.js) (`window.PetaPeluang`)
- CSS (scatter, unused on Cari Produk): [`styles/peta-peluang.css`](../styles/peta-peluang.css)
- SQL: [`supabase/migrations/20260906150000_listing_momentum_measured.sql`](../supabase/migrations/20260906150000_listing_momentum_measured.sql)
  (positions / Jejak still from [`20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql))
- Weekly backfill: `~/shopee_scraper/listing_weekly.sql` (`backfill_listing_weekly_estimates`)
- Hosts:
  - Cari Produk (`#dir-trending-now`) — top 3 rank rows, then Urutkan, then
    `listingRowsHtml` (`actions: true`). Keyword chips filter both.
  - Chat search / finder / recs (`.trend-host`) — same strip + table chrome.
  - Bandingkan Pasar is **not** mounted here. Chat-only
    (`handleBandingkanIntent`) — see [pasar-compare.md](./pasar-compare.md).

`PetaPeluang.hydrateTrends(listings, { supabase, onTrend })` is the live path.
It marks `_petaTrend.pending`, calls `peta_batch` (max 200 keys), then attaches
`{ wkPct, unitsNowWk, unitsPrevWk, spanNow, spanPrev, at0, at1, at2, terukur,
belum, pending }` from `mv_listing_momentum`. It does not draw SVG.

The Cari Produk listing pool uses `listings_for_keywords` (LATERAL per-keyword
lookup — do not `btrim()` the `listings_deduped.keyword` column). Home
keywords/listings are prefetched at boot.

## Ranking

`peta_batch` still receives up to 200 keys. Each listing gets `_petaTrend`
from `mv_listing_momentum` — three real scrapes of the same `(item_id, shop_id)`,
never peer / nowcast / forecast / `listing_weekly` frames.

| Window | Formula |
|---|---|
| Rate now | `(sold_S0 − sold_S1) / span_now` — S0 newest (≤21d), S1 ≤ S0−7d |
| Rate prev | `(sold_S1 − sold_S2) / span_prev` — S2 ≤ S1−7d |
| Weekly % | `(rate_now − rate_prev) / rate_prev × 100`, each span 7–28 days |

- `belum` if there is no S2, `rate_prev < 1` unit/day, `d_now + d_prev < 10`,
  or sold stayed flat while reviews rose by more than 5 (counter lag).
- Clamp `−100` … `+300`. Always `terukur` when a % is shown.
- **Trending Sekarang** shows the top **3** by weekly % desc among rows with
  `unitsNowWk ≥ 20` and `unitsPrevWk ≥ 7`. Skip `belum` / missing. If none
  qualify after hydrate, hide the strip. Paling Trending uses the same floor.
- While `peta_batch` is in flight, show a 3-row skeleton (not a grey square).
  Do not invent a %. If the RPC is missing, the strip stays hidden and the
  table Trending column shows `—`.
- `hydrateTrends` only sticky-skips `peta_batch` in `sessionStorage` when the
  RPC is actually missing (schema cache / 42883), with a 5-minute TTL. Timeouts
  and transient errors retry on the next paint — a migration blip must not
  blank Trending Sekarang for the rest of the tab.

Never present a raw two-snapshot delta as “minggu ini”. Scrapes land 12–17
days apart; both windows are span-normalised to a 7-day rate. Same-day
keyword slots collapse to the day’s peak sold, then a running max so a
counter rollback cannot mint a surge.

Do not fall back to peer / nowcast / forecast when a listing has no S2.

## Cari Produk layout

1. Cat rail + heading / count
2. Trending Sekarang (place icon + rank mascot nestled together + photo + title/harga stack + omset + one % with tren spark + Deep Dive). Rank 1 is larger. Shared grid columns align across the top 3. Spark rise caps at 60° from the %; ranks 1/2/3 use unique stroke shapes; green fill meets a flat baseline so it reads as a graph. No “perkiraan” label on this strip.
3. Urutkan (`#dir-filters-range` — includes Paling Trending; default remains omset)
4. Keyword chips + listing table + pager + compare bar

Table chrome (`actions: true`): bandingkan checkbox, one weekly % with arrow,
Favorit bookmark (`trackProductFavorite` — product favorite on
`user_tracked_products`, not keyword Pantauan), chevron / product cell → Deep Dive.

Row click is Deep Dive. Checkboxes do not steal the row.

## Honesty

Tooltip on % states the real windows (dates + span days) and that the number
is units sold, not omset: “~N/minggu (D1–D0) vs ~M/minggu (D2–D1). Terukur
dari 3 scrape.” `belum` copy: need 3 measurements ≥7 days apart, or previous
rate too small. Do not label perkiraan — if we cannot measure, show `—`.
Do not revive `weekly_snapshots`. `listing_weekly` stays Deep Dive / Jejak
only; it does not feed this %.

## Momentum class (same rows)

`naik` if pct ≥ 20, `turun` if pct ≤ −20, else `stabil`. Class `belum` is
hidden on live hosts (Trending column `—`). Scatter Jejak still reads
`momentum_class` from `peta_batch`.

## Scatter module (not mounted)

`PetaPeluang.mount` still implements Peluang / Jejak / Langit (top 20 photo
scatter, zones, sibling list). Do not remount it on `#dir-trending-now` or
`.trend-host`. Zone-filter / map hover sync are retired with the canvas.

## Refresh

`mv_listing_momentum` rebuilds inside `refresh_breakout_matviews()` (from
`listings`, not the velocity chain). Jejak frames still follow
`refresh_listing_weekly()`:

```
SELECT backfill_listing_weekly_estimates(10);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_week_positions;
```

`bash ~/shopee_scraper/refresh_listing_weekly.sh` still refreshes
`mv_listing_momentum` too (same unique index). First backfill can take
several minutes.

Client RPC: `peta_batch(p_keys jsonb, p_weeks int default 8)` — max 200 keys.

## Host contract

```
PetaPeluang.hydrateTrends(listings, {
  supabase,
  onTrend,   // listings now have _petaTrend (pending, then final)
})
```

`_petaTrend`: `{ wkPct, unitsNowWk, unitsPrevWk, spanNow, spanPrev, at0, at1, at2, terukur, belum, pending }`.

## Copy

Trending subtitle and % tooltips are everyday Bahasa. Confirm aloud with
Afryian & Hendra before treating new lines as final (`mentor-copy`).
