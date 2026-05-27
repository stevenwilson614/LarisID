# Scraper follow-up: `total_sold` buckets

See also the extension copy: `../LarisID-extension/SCRAPER_NOTES.md` (same machine path as the Chrome extension repo).

## Problem

~4k+ listings have `total_sold` values like `100000`, `500000`, `700000` — Shopee **display bucket floors** (`100rb+`, etc.), not exact unit counts. When the bucket is unchanged between scrapes, raw deltas are zero unless reviews are used.

## Chart fixes (deployed)

- Client: `_ddIntervalUnitDelta`, proportional week split (no `7/days` inflation), peer RPC + category fallback
- DB: `listing_interval_unit_delta()` — migration `supabase/migrations/20260528140000_listing_trend_sold_helpers.sql`

## When the scraper runs again

1. Scrape **reviews** on every row.
2. Consider `sold_is_bucket` boolean or parsing rules documented in extension `SCRAPER_NOTES.md`.
3. Do not assume `total_sold` deltas are real sales for values ≥ 10_000 without review corroboration.
