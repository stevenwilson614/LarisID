# Favorit Aku

**Status:** live model as of 2026-09-06. Replaces keyword Pantauan as what a user tracks.

One favorite = one Shopee listing (`item_id` + `shop_id`) in `user_tracked_products`.

## Capacity

- Per user: **30** (`tracking_product_limit()`). Honesty copy: freshness limit, never an upsell.
- Global scraper: `tracked_pass.py` (~40s/item, ~200 distinct products). Admin KPI shows distinct favorites vs 200.
- Paused users (`user_tracker_state.paused_at`) are excluded from `v_tracked_products`.
- Idle decay (day 11 warn / day 14 pause) counts product favorites, not just keywords.

## Daily scrape

Writes to `user_tracked_products` → view `v_tracked_products` → `tracked_pass.py` in `daily_scrape.sh` (scraper repo). No scraper change needed to start.

PDP sold is a **bucket floor** (`10RB+`). Day-to-day units are review-based estimates. UI labels `terukur` only when the point came from a search-result row; otherwise `perkiraan`. No % until ≥ 2 real weeks on the list. New favorites show “Data harian mulai besok”.

## List card

Each favorite stays on the list (no click-to-detail). Photo / toko / harga / omset / one % sit beside a **3-month dated dual chart**: last 13 non-empty WIB weeks from the same `product_daily_series` → weekly bucket as Deep Dive Tren produk (not `listing_weekly`). Chart.js solid lines only — omset + units, independent Y-axes, tension `.35`, point radius 3, red omset fill, Rp ticks. Under that row, plain-text **updates this week** (omit the block if none):

- Title change (`listings.product_name` this WIB week vs last name before Monday) — listing title, not scrape-slot keyword
- Harga change (this week vs last `listing_weekly.price`; ignore under Rp 100 or 0.5%)
- Omset up a lot (WoW `omset_wk` ≥ 25%)

Actions: Pantau toko, Deep Dive (opens analysis, does not expand the card), Hapus.

## Notify

Account-level on `user_tracker_state`:

| Field | Values |
|---|---|
| `notify_channels` | `email`, `whatsapp` |
| `notify_cadence` | `on_update` (max one send/day when a trigger fires) or `weekly` (Monday 08:00 WIB, always sent) |

Triggers (`favorite_changes_for_user`): price change, sold-bucket step, rating drop ≥ 0.1, listing gone (no scrape in 3 days). Weekly rows come from `listing_weekly`.

WhatsApp only delivers when `FONNTE_DEVICE_READY=true` on the edge function. UI states the live channel honestly. Reconnecting Fonnte is a hard dependency for the WA promise.

## RPCs

- `add_tracked_product` / `remove_tracked_product` / `get_my_favorites`
- `set_tracker_notify_prefs(p_channels, p_wa_number, p_cadence)`
- `favorite_changes_for_user` / `favorite_weekly_for_user` (service_role)

Do not call `scrape_enrol_tracked` from the favorite add path.

## Toko

Per-favorite “Pantau toko ini” writes `user_tracked_stores`. Store charts still follow keyword scrapes (~2 minggu) — label that cadence.

Apply SQL: `bash scripts/apply-selfhost.sh supabase/migrations/20260906123000_favorit_aku.sql`
Deploy notify: `bash scripts/deploy-function-selfhost.sh tracker-change-notify`
Weekly cron: `bash scripts/schedule-tracker-favorite-weekly.sh` (Monday 01:00 UTC)

`v_tracked_products` is also defined in the scraper repo `scrape_queue.sql`.
Keep the paused-user filter in both places so a scraper re-apply does not
drop it.

Next-day smoke (after `tracked_pass`): favorited listing gets a
`search_rank = -100` row; the Favorit Aku card chart labels that point
perkiraan unless it also landed from a search-result scrape.
