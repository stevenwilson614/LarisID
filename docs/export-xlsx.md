# Export produk ke XLSX/CSV

Shipped 2026-09-08; budgets split 2026-09-08 evening. Lets a signed-in user download
search results or a Deep Dive's weekly omset as a spreadsheet. Capped by daily budgets
whose real purpose is to measure demand before this becomes a paid feature.

## Public copy (SEO / llms / comparisons)

Use these sentences on public pages. Do **not** write “Belum ada”, “Rencana”, or
“LarisID has none” for Excel/CSV. Paid tools still win on **unlimited/bulk**.

- **Table cell (vs Datapinter / Tokpee / Shoptik):** `Ya — listing + riwayat omset (kuota harian)` vs their `Ya — massal / tanpa batas`.
- **Table cell (vs Kalodata):** `Ya — listing Shopee + riwayat omset (kuota harian)`. Kalodata’s export is TikTok GMV, not Shopee listings.
- **Short fact:** LarisID unduh Excel/CSV (.xlsx): hasil Cari Produk (sampai 90 baris listing/hari, omset/bulan) dan riwayat omset mingguan dari Deep Dive (4/8/12 minggu, kuota 12 minggu/hari). Kompetitor berbayar tetap unggul pada ekspor massal tanpa batas dan data listing Tokopedia.
- **Kalodata FAQ:** do not say “ekspor belum ada di LarisID”. Say Kalodata uniquely exports **real-time TikTok GMV**; LarisID exports Shopee listing + weekly omset.

## Two budgets

| Surface | Shape | Daily budget (WIB) | What you get |
|---|---|---|---|
| Cari Produk (`#dir-export`) | Snapshot only | **90 product rows** | Monthly omset per product (1 product = 1 row). No weekly option. |
| Deep Dive (icon next to Tren) | History | **12 weeks** shared | One product per download, choose 4 / 8 / 12 weeks. Budget is weeks total (3×4 or 1×12). Sheet: row 1 = product info, following rows = week omset only (no repeated name/toko). |

Modal copy at the top is the live remaining/limit:

- Cari Produk: `90/90 baris produk tersisa hari ini`
- Deep Dive: `12/12 minggu tersisa hari ini`

The Unduh button sits on the **list bar with Urutkan** — above product rows, below
Trending Sekarang. Deep Dive history is only on the trend-graph download icon (not a
tool pill).

## Cost rule

| Export | Cost |
|---|---|
| Snapshot product row | 1 toward the 90-row budget |
| History week (any `Sumber`) | 1 toward the 12-week budget |

History no longer rides the measured-row budget. Charging requested weeks keeps the
`12/12 minggu` line honest — perkiraan/proyeksi weeks still appear in the file with
their `Sumber` label, they just cost the same as terukur against the weeks cap.

History exports are still product-capped at **10** (`_export_history_cap()`); Deep Dive
always sends 1.

## Why `product_daily_series` and not `listing_weekly`

The file and the Deep Dive chart already share `product_daily_series`. Keep it
that way — never splice a second estimator into a third surface.

`listing_weekly` used to freeze a gap week the moment it was missed
(`backfill_listing_weekly_estimates` has `WHERE NOT EXISTS`) and invent weeks
from before a product was first seen. That is fixed as of 2026-09-08:
`revise_listing_weekly_measured()` upgrades fully-covered gap weeks from
`listing_deltas`, and pre-first-scrape weeks are labelled `prior`. Peta Peluang
/ Jejak Waktu read that table. The export still does not, so a later weekly
refresh cannot put the spreadsheet out of step with the chart.

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

- `supabase/migrations/20260909120000_export_row_budget.sql` — initial `export_rows`,
  `get_my_export_quota`, `_product_weeks_batch`, `daily_usage.export_rows_used`, `export_jobs`
- `supabase/migrations/20260909140000_export_weeks_budget.sql` — `export_weeks_used`,
  `_export_week_limit`, dual-budget `export_rows` / `get_my_export_quota`
- `js/gpt-app.js` — export section; `updateDirCount` shows `#dir-export` on `#dir-list-bar`;
  `ddTrendExportBtnHtml` next to Tren; `consumeProductDeepLink()`
- `index.html` — `#dir-list-bar` / `#dir-export`, `#export-modal`, `#export-more-modal`

## Returning-user notice

One-time skippable popup `#export-xlsx-notice` (`lid_export_xlsx_notice_v1`) for
returning signed-in users only — not new signups, not an onboarding gate. Same
pattern as `#product-rows-notice`. CTA opens Cari Produk. Event:
`export_xlsx_notice` (`shown` / `close` / `go_directory` / `backdrop` / `esc`).

## The events that are the actual point

`export_open`, `export_done` (carries **both** `rows_total` / `rows_charged` and
`weeks_charged` / `weeks_remaining_after`, plus `wanted_rows` on every export — that
distribution says whether 90 / 12 are right), `export_blocked`, `export_more_prompt`,
`export_more_response` (`ya`/`tidak`/`tutup`, three-way on purpose).
