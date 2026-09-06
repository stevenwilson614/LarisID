# Terlaris Minggu Ini — badge rules

The gold-glow "TERLARIS MINGGU INI" badge on market cards. Read this before
changing any threshold, the measurement window, or the tooltip copy.

## Why this exists separately from mv_trending

`mv_trending` already computes bucket-safe 7-day deltas, but it ends with
`order by d7 desc limit 500` across every category. That is fine for the global
Trending panel and useless for a per-category badge.

Measured against production on 2026-08-13 (anchor `2026-08-11`):

| Category | Keywords | With any `mv_trending` row |
|---|---|---|
| Olahraga & Outdoor | 292 | 24 (8%) |
| camping keywords specifically | 25 sampled | 2 |

A quiet category simply never reaches the global top 500, so it could never earn
a badge. `mv_keyword_weekly`
([migration](../supabase/migrations/20260813120000_mv_keyword_weekly.sql)) runs
the same `_lid_corr_sold_delta()` math grouped by keyword with no cap.

## The window is not a week, and we say so

Our scrape cadence is not weekly. Real snapshot dates at anchor 2026-08-11:

```
kursi lipat camping              2026-08-11, 2026-07-29, 2026-07-24
kompor portable camping outdoor  2026-08-11, 2026-07-29, 2026-07-24
lampu camping LED rechargeable   2026-08-10, 2026-07-06, 2026-06-29
```

The newest baseline at least 7 days old is typically **12-17 days** back, not 7.
Publishing that raw delta as "terjual minggu ini" would overstate a week by
roughly 2x — the fabricated-delta failure `AGENTS.md` and `MISSION.md` forbid.

So per listing we record the **actual measured span** and normalise:

```
wk_units = sum( corrected_delta * 7 / span_days )
```

Listings whose span falls outside **7-21 days** are dropped rather than
extrapolated. A 35-day gap says nothing trustworthy about this week.
`wk_span_days` (the median actual span) is published so the UI can state the
real window instead of implying a calendar week.

## The floor

A card can never be badged unless **all** of these hold. Constants live in
`js/gpt-app.js` (`TERLARIS_MIN_UNITS`, `TERLARIS_MIN_ITEMS`).

| Rule | Value | Why |
|---|---|---|
| `wk_units` | >= 25 | 7-day-equivalent units for the whole market. Stops a market with no weekly movement being crowned. |
| `wk_items` | >= 2 | At least two listings actually moved, so one Shopee display-bucket glitch cannot mint a badge. |
| `pct` | > 0 | Needs a real baseline; `wk_base < 50` yields "Baru" instead. |
| row exists | — | A keyword missing from `mv_keyword_weekly` means "never measured", which must never render as "0 sold". |

## The ranking

Relative to the **filtered set** — the current category chip, city filter,
search result, or composer answer. `markTerlarisMinggu()` sorts eligible rows by
`wk_units` desc (tie-break `pct` desc) and badges **exactly one** winner, then
pins that card to index 0. Everyone else keeps their incoming order (usually
omset).

The directory calls this on the full filtered list **before** pagination, so
page 1 always opens on the category winner. Chat grids go through
`marketCardsHtml()`, which does the same pin. A 60-card page used to badge the
top 2 and leave them in omset order — the real #1 often sat in slot 2.

A slow category legitimately shows zero badges. That is the honest outcome.

This badge is **not** the durable weekly snapshot in
[listing-weekly.md](./listing-weekly.md) (`listing_weekly` / `keyword_weekly`).
That table is the product-level this-week / next-week forecast. Do not merge
them, and do not revive `weekly_snapshots` (frozen 2026-06-08).

## The green line

`↑ X%` is **momentum**: this window's 7-day-equivalent units versus the
previous window (`wk_units` / `wk_units_prev` from
[20260906150000](../supabase/migrations/20260906150000_listing_momentum_measured.sql)).
Both sides sum the same listing set — listings with three real scrapes that
cleared the `belum` floors **and** a fresh S0 (≤21d). Held/stale listing %
does not enter this rollup ([20260906183000](../supabase/migrations/20260906183000_listing_momentum_held.sql)).
Hidden when `wk_units_prev < 25` or
`wk_items_prev < 2` (keep the `~N terjual` line).

Do **not** go back to growth against lifetime sales (`wk_units / wk_base`).
That landed at 1–6% for every established market and did not tell anyone
what was trending. Do **not** simply rescale a percentage to look bigger.

`fetchTerlarisMinggu` over-fetches (~5× limit, capped at 400) by `wk_units`
then keeps `pct > 0` client-side. A tight SQL `LIMIT` on volume alone often
returns only cooling markets after the prev-window %, which emptied the Cari
Produk home pool (and Trending Sekarang with it).

The chat Produk Trending board (`trendGrowthPct()` / `computeTrendingView()`)
still uses `mv_trending` deltas vs cumulative baseline — a different surface.

## Tooltip

The green line carries a `title` built by `terlarisTooltip()`. It must keep
stating both caveats:

> Sekitar 4.687 unit terjual per minggu — dihitung dari 13 hari terakhir (sampai
> 11 Agu 2026) lalu disetarakan ke 7 hari. Persentase = dibanding ~3.210
> unit/minggu pada rentang sebelumnya (dua scrape sebelumnya).

## Composer routing

`detectIntent()` returns `terlaris_minggu` for "terlaris minggu ini", "paling
laris minggu ini", and the English "…this week" forms. It is checked **before**
the category-discovery bail-out, which would otherwise swallow a category-level
ask like "apa yang terlaris di camping minggu ini".

Bare `terlaris` deliberately does not match — that still means all-time best
sellers, and those answers render through `marketCardsHtml()` so the weekly
winner in the set still gets its badge.

`handleTerlarisMingguIntent()` resolves the category with `toCanonicalCat()`:
**camping is not a category**, it maps to `Olahraga & Outdoor`. Filtering
`category_canonical` on the raw string `Outdoor & Camping` matches zero rows.

Empty result gets an honest message plus the 30-day naik-daun list. Never pad
with markets that did not clear the floor.

## Re-tuning

```bash
node scripts/weekly-badge-calibrate.mjs
node scripts/weekly-badge-calibrate.mjs "Dapur" "Perlengkapan Ibadah"
```

Read-only; replicates the matview in JS so thresholds can be checked without
applying DDL. Re-run it after any scrape-cadence change — a shift in cadence is
what would silently kill or flood the badge. Coverage at 2026-08-13, of 40
keywords sampled per category: Olahraga & Outdoor 29 usable, Dapur 8,
Perlengkapan Ibadah 40.

2026-09-06 audit (before this change): the listing % was model-vs-model
(`nowcast`/`peer`/`forecast` compared to itself; median 0%). `_lid_corr_sold_delta`
capped every delta at 500/day, so a real 712→336/day mover read as +5144%.
The function now only clamps values that look like Shopee display buckets
(round thousands ≥ 1000, or a 10rb floor cross from a round value). The
green line and Cari Produk % both use 3-snapshot measured momentum.

`listing_deltas` / `product_velocity` last refreshed 2026-08-30 while scrapes
continued through 2026-09-02 — Phase 4/5b in the scraper `daily_scrape.sh` is
stale. Trending % no longer reads that chain; card omset / Deep Dive still do.

## Deploy ordering

`js/gpt-app.js` asks for the `wk_*` columns optimistically. PostgREST rejects the
whole query for one unknown column, so if the static site ships before the
migration lands, `ptypeWeeklyMissing()` catches the `42703` and drops back to the
pre-migration column list for the session — the directory keeps working and the
badge simply does not appear. Static deploys and DB migrations are not atomic
here, so keep that fallback.
