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
  then held fallback [`20260906183000_listing_momentum_held.sql`](../supabase/migrations/20260906183000_listing_momentum_held.sql),
  then uncapped % [`20260929160000_listing_momentum_uncapped.sql`](../supabase/migrations/20260929160000_listing_momentum_uncapped.sql).
  The number on the card is [`20260929170000_chart_week_wow.sql`](../supabase/migrations/20260929170000_chart_week_wow.sql)
  (`listing_chart_wow`), not `momentum_pct`.
  (positions / Jejak still from [`20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql))
- Weekly backfill + revise: `~/shopee_scraper/listing_weekly.sql`
  (`backfill_listing_weekly_estimates`, then `revise_listing_weekly_measured`)
- Hosts:
  - Cari Produk (`#dir-trending-now`) — top 3 rank rows, then Urutkan, then
    Kartu (`.dir-card-grid`, default) or Tabel (`listingRowsHtml` with
    `actions: true`). Keyword chips filter both.
  - Chat search / finder / recs (`.trend-host`) — same strip + listing-row
    table chrome.
  - Bandingkan Pasar is **not** mounted here. Chat-only
    (`handleBandingkanIntent`) — see [pasar-compare.md](./pasar-compare.md).

`PetaPeluang.hydrateTrends(listings, { supabase, onTrend })` is the live path.
It marks `_petaTrend.pending`, calls `peta_batch` (max 200 keys), then attaches
`{ wkPct, unitsNowWk, unitsPrevWk, spanNow, spanPrev, at0, at1, at2, terukur,
held, belum, pending }` from `mv_listing_momentum`. It does not draw SVG.

The Cari Produk listing pool uses `listings_for_keywords` (LATERAL per-keyword
lookup — do not `btrim()` the `listings_deduped.keyword` column, and do not
`ORDER BY total_sold DESC NULLS LAST`: that misses
`listings_deduped_kw_sold_ontopic_idx` and times out anon's 3s cap). Home
opens with `listings_home` (top 15 terlaris keywords × 20 listings, one
round-trip). Prefetch at boot (`warmDirInstantPool` →
`resolveListingPool({ home: true })`) and paint from a 10-minute
sessionStorage snapshot so a second open is instant. Category browse fetches
40 `product_types_v` rows (not 1000) — only the top 15 keywords feed listings.

`renderDirectory` paints a memo/session snapshot immediately, then refreshes
from `resolveListingPool`. That resolve is memoized per home / category /
query, races DeepSeek `search_plan` at 700 ms (static EN/ID seed on miss, AI
plan cached in background), skips `product_type_quartiles` when matview
columns are on the view, and defers `countKeywordUnsold` until after first
paint.

Measured on api.larisid.com (2026-09-15, ~200 ms RTT): `listings_for_keywords`
15×20 with NULLS LAST timed out at 3.4s (anon 3s cap); matching the index
(`ORDER BY total_sold DESC`) is ~20 ms server-side. `listings_home` is the
same scan plus a 1.5 ms keyword pick. Fat `product_types_v` home (120 rows
with `images`) was 1.52 s / 190 KB — no longer on the home path.

## Ranking

`peta_batch` still receives up to 200 keys. The % on cards, rows, and
Trending Sekarang is **this WIB week vs the previous WIB week** from
`listing_chart_wow` — the same Monday buckets as the Tren Produk chart
(`product_daily_series`). It is not the 3-scrape rate in
`mv_listing_momentum`. That rate compares two scrape spans (often 12–22
days) and can still read as a boom from an earlier quiet window after the
chart's latest week has already turned down.

| Window | Formula |
|---|---|
| This week | Sum of the 7 days from this Monday. Days after the last scrape use `velocity_at` (same nowcast as the chart). |
| Last week | Sum of the 7 days of the previous Monday. Measured only when every day sits in a `listing_deltas` interval. |
| Weekly % | `(omset_now − omset_prev) / omset_prev × 100` when last week is measured and its omset is at least Rp 50.000. |

- `terukur` when both weeks are fully measured.
- perkiraan when last week is measured and this week still includes a nowcast day. Tooltip names both Mondays and both omset figures.
- `—` when last week is not a full measured week, or its omset is under Rp 50.000. Do not fall back to `momentum_pct`.
- Do not clamp the %. Do not read `listing_weekly` for this number.
- **Trending Sekarang** shows the top **3** by that % among rows with
  `unitsNowWk ≥ 20` and `unitsPrevWk ≥ 7`. Skip `—`. The current week may
  carry a perkiraan mark. Paling Trending uses the same floor.
- While `peta_batch` is in flight, show a 3-row skeleton (not a grey square).
  Do not invent a %. If the RPC is missing, the strip stays hidden and the
  table Trending column shows `—`.
- `hydrateTrends` only sticky-skips `peta_batch` in `sessionStorage` when the
  RPC is actually missing (schema cache / 42883), with a 5-minute TTL. Timeouts
  and transient errors retry on the next paint — a migration blip must not
  blank Trending Sekarang for the rest of the tab.

Never present a raw two-snapshot delta as “minggu ini”. The % is the chart's
last Monday week against the Monday before it. Days after the last scrape
are the same velocity nowcast the chart draws, and they are labeled
perkiraan. A listing with no measured previous week stays `—`.

## Cari Produk layout

1. Cat rail + heading / count
2. Trending Sekarang (place icon + rank mascot nestled together + photo + title/harga stack + omset + one % with tren spark + Deep Dive). Rank 1 is larger. Shared grid columns align across the top 3. Spark rise caps at 60° from the %; ranks 1/2/3 use unique stroke shapes; green fill meets a flat baseline so it reads as a graph. Minggu berjalan yang masih nowcast memakai tanda perkiraan.
3. Urutkan (`#dir-filters-range` — includes Paling Trending; default remains omset)
4. Keyword chips + listing table + pager + compare bar

Table chrome (`actions: true`): bandingkan checkbox, one weekly % with arrow,
Favorit bookmark (`trackProductFavorite` — product favorite on
`user_tracked_products`, not keyword Pantauan), chevron / product cell → Deep Dive.

Row click is Deep Dive. Checkboxes do not steal the row.

## Honesty

Tooltip names both Mondays and both weekly omset figures, the same points as
the last two marks on Tren Produk. When this week still has a nowcast day,
the % carries perkiraan. `—` when last week is not fully measured or its
omset is under Rp 50.000 — do not substitute `momentum_pct`. Do not revive
`weekly_snapshots`. `listing_weekly` does not feed this %.

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
SELECT * FROM revise_listing_weekly_measured(12);
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

`_petaTrend`: `{ wkPct, unitsNowWk, unitsPrevWk, spanNow, spanPrev, at0, at1, at2, terukur, held, belum, pending }`.

## Copy

Trending subtitle and % tooltips are everyday Bahasa. Confirm aloud with
Afryian & Hendra before treating new lines as final (`mentor-copy`).
