# Export produk ke XLSX/CSV

Shipped 2026-09-08. Lets a signed-in user download search results as a spreadsheet,
optionally with weekly history. Capped by a daily row budget whose real purpose is to
measure demand before this becomes a paid feature.

## The cost rule

**Only measured rows cost.** 90 rows per user per WIB day.

| Row | Cost |
|---|---|
| Snapshot row (1 per product) | 1 |
| History week, `Sumber = terukur` | 1 |
| History week, `Sumber = perkiraan` | 0 |
| History week, `Sumber = proyeksi` | 0 |

Verified example: `item 57355613815 / shop 1474463822` returns 13 weekly rows and charges
**4** (1 snapshot + 3 measured weeks). Only ~19% of a 12-week window is measured across a
typical selection, so the budget stretches much further than 90/13 suggests.

History exports are additionally capped at **10 products** (`_export_history_cap()`),
because free rows mean the budget no longer bounds the payload or the query time.

## Why `product_daily_series` and not `listing_weekly`

`listing_weekly` writes a gap week at the moment it is missed and **never revises it** —
`backfill_listing_weekly_estimates` has `WHERE NOT EXISTS`. For a product scraped
2026-07-27 then 2026-08-29:

| Source | Aug 3/10/17 weeks |
|---|---|
| `listing_deltas` (truth) | 337 units over 33.1 days, `exact`/`high` → **10.18/day** |
| `product_daily_series` | 10.17/day, `measured` ✅ |
| `listing_weekly` | `peer`/`low` ≈72/wk and `estimated`/`low` 69.3/wk ❌ |

`listing_weekly` also backfills weeks before a product was first seen. **This is a live bug
affecting Peta Peluang and Jejak Waktu, which read that table** — not fixed here.

Building the export on `product_daily_series` also keeps the file and the deep-dive chart in
agreement. Never splice a second estimator into a third surface.

## Traps

- **`_beta_unlimited()` must never be called from the export functions.** It is hardcoded
  `select true` and would kill the budget on arrival. Only `_usage_is_privileged()` bypasses.
- **`revoke ... from public` does not remove `anon` on this box.** `ALTER DEFAULT PRIVILEGES`
  grants EXECUTE on every new function directly to `anon`/`authenticated`/`service_role`
  (`pg_default_acl`). Every function must `revoke ... from public, anon` explicitly. Without
  it, `has_function_privilege('anon','export_rows',...)` comes back **true**.
- **`create or replace function` preserves the ACL.** If you replace these, grant
  `authenticated` only — never cargo-cult `anon, authenticated` from `listings_for_keywords`.
- **`_product_weeks_batch` is deliberately ungranted.** Granting it bypasses the budget.
- The quota is a **product gate, not a security boundary**: `anon` can already `select` from
  `listings_deduped` and `listing_weekly` through PostgREST directly.

## Columns we deliberately do not ship

| DataPinter has | Why we don't |
|---|---|
| Brand | 34 real values in 1.23M rows (99.997% "No Brand"); not in the matview |
| Comments | 100% NULL |
| Stock Count / Stock Value | raw `listings.stock` is documented junk; we ship `Stok tersedia` only |
| Total Revenue | `price × total_sold` fabricates history — price drifts, `total_sold` is bucketed |
| Average monthly revenue/sales | we have one estimator; shipping it twice under two names is deceptive |

## SheetJS

Vendored at `js/vendor/xlsx.mini.min.js`, **0.20.3**, sha256
`0cb353f830d7288385492c83d277b058ddeac664ca51cf1393aa1fd3e2b70939`, from
`cdn.sheetjs.com` (not on npm). Lazy-loaded via `window.ensureXlsx()` in `js/perf-loader.js`,
and awaited **before** the metered RPC so a load failure cannot burn budget.

Community edition's writer does **not** emit freeze panes (Pro only) — verified in both the
mini and full builds. The header row is not frozen; the autofilter is set explicitly on the
row-2 header range so sorting still works under the merged brand row.

## Files

- `supabase/migrations/20260909120000_export_row_budget.sql` — `export_rows`,
  `get_my_export_quota`, `_product_weeks_batch`, `daily_usage.export_rows_used`, `export_jobs`
- `js/gpt-app.js` — export section near the supplier probe; `updateDirCount` shows the button;
  `ddToolPillsHtml` / `runDdrTool` add the deep-dive `Unduh` pill; `consumeProductDeepLink()`
- `index.html` — `#dir-export`, `#export-modal`, `#export-more-modal`

## The events that are the actual point

`export_open`, `export_done` (carries **both** `rows_total` and `rows_charged`, plus
`wanted_rows` on every export — that distribution says whether 90 is right), `export_blocked`,
`export_more_prompt`, `export_more_response` (`ya`/`tidak`/`tutup`, three-way on purpose).
