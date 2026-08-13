# Listing weekly snapshot + next-week forecast

Durable weekly numbers per listing (and a keyword rollup), published from the
same velocity estimator the product cards already use. Read this before changing
omset-on-cards, the Deep Dive trend forecast, or the post-scrape refresh order.

Canonical SQL: `~/shopee_scraper/listing_weekly.sql`.
Read surface: [supabase/migrations/20260813140000_listing_weekly.sql](../supabase/migrations/20260813140000_listing_weekly.sql).

`weekly_snapshots` froze on 2026-06-08. **Do not revive it.** `js/laris-app.js`
already says so. `backfill_snapshots.py` / `fix_snapshots.py` are leftover
tools; `sync_laris_data.sh` no longer writes that table.

## Apply (Contabo, once)

Git push is not enough. The functions live on the self-host DB, not GitHub Pages.

```bash
cd ~/shopee_scraper
git pull
ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
    -o ConnectTimeout=20 root@84.247.147.205 \
    "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1" \
    < listing_weekly.sql
ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
    -o ConnectTimeout=20 root@84.247.147.205 \
    "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1" \
    < velocity_model.sql   # peer_only_male / last2_male columns; needed before --fit
ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
    -o ConnectTimeout=20 root@84.247.147.205 \
    "docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1" \
    < product_daily_series.sql   # p_to clamp = current_date + 7 (forecast tail)
bash refresh_listing_weekly.sh   # fill this week + next week
```

Do **not** use `supabase db push --linked` for this: the linked CLI project is
cloud `bzmvlraziqevqdyotvgy`; the app reads `https://api.larisid.com`. The
LarisID migration `20260813140000_listing_weekly.sql` is the same read surface
for the repo; applying `listing_weekly.sql` over SSH is what the site uses.

The static JS ships via GitHub Pages on push to `main`. Until the SQL above
lands, Deep Dive charts fall back to the old last-2-weeks average (still labelled
perkiraan).

## One estimator, three windows

`product_velocity` / `velocity_at()` is the only source of units/day.

| Surface | Formula | Label |
|---|---|---|
| Card omset/bulan | `price * v_hat(now) * 30` = `nowcast_omset_monthly`, fallback `est_omset_monthly` | terukur if `nowcast_method` is `latest`/`blend` with fresh obs; otherwise perkiraan |
| This week | `units_wk` = sum of 7 daily `velocity_at` evaluations (measured weeks: `v_latest * 7`) | `source=measured` → terukur; else perkiraan |
| Next week | same sum, one WIB week further | always perkiraan |

Primary seller-facing number stays **monthly (×30)**. Weekly (×7) is the trend
grain, always shown with its week label and terukur/perkiraan tag.

Never present a raw two-snapshot delta as "minggu ini". Scrapes land 12–17 days
apart; the rate is span-normalised first. Same rule as
[terlaris-minggu.md](./terlaris-minggu.md).

## Snapshot grain

`listing_weekly` PK `(item_id, shop_id, week_start)` — `week_start` is the WIB
Monday. Columns include `units_wk`, `omset_wk`, `source`
(`measured` \| `nowcast` \| `forecast` \| `peer` \| `zero`), `confidence`,
`peer_n`, and for measured weeks the audit pair `delta_units` + `span_days`.

`keyword_weekly` PK `(keyword, week_start)` is the sum over the keyword's
**distinct** `(item_id, shop_id)` set, so an ad slot and an organic slot of the
same listing are not double-counted. It is **not** `mv_keyword_weekly` (that
matview is only the Terlaris Minggu Ini badge).

## Update path

```
listings push
  → refresh_listing_deltas(day)
  → refresh_omset_estimates(day)
  → refresh_velocity (cohorts + products)
  → refresh_listing_weekly(day)     ← this file
  → refresh_breakout_matviews()
```

SSH/psql only (`refresh_listing_weekly.sh`). If any of those steps is skipped
the site goes stale — seen 2026-08-13, when Aug 10–13 listings had 0% omset
because the matview refresh did not run.

| Event | Current week | Next week | Past measured weeks |
|---|---|---|---|
| Scrape #1 (~92%, no history) | peer median × 7, `source=peer`, confidence low | same | — |
| Scrape #2+ (delta lands this WIB week) | overwrite to `measured`: `v_latest * 7`, store delta + span | recompute `forecast` | untouched |
| No scrape | `nowcast`, decaying toward (category, scale-band) peers | `forecast`, same decay | untouched |
| Lifetime sold = 0 | `zero` (0 units, never a peer prior) | `zero` | — |

Never `total_sold / 6` on 10k+ buckets. Never rewrite a measured week into a
forecast. On a day with no scrape, still run `refresh_listing_weekly.sh` so the
closed-form decay (`W(t') = W(t)·exp(−Δ/τ)`) revises this week and next week.

## Honesty

- `source=measured` → **terukur**, solid line, plain number.
- `nowcast` / `forecast` / `peer` → **perkiraan**, dashed/dimmed, with confidence.
  A week with no scrape shows a labelled estimate — never "0 terjual", and never
  an unlabelled number.
- UI sequence: last 6 WIB weeks through today (this week = nowcast, perkiraan
  unless `source=measured`) → next week (forecast, perkiraan). Chart labels
  are week starts (`10 Agu`), not calendar months (`Agu 26`).
- Deep Dive tren graphs (Ask Laris `#ddr-trend-canvas`, dashboard
  `#tren-main-chart` / `#ap-demand-chart` / `#dd-chart-trend`) plot weekly
  scrape-interval rates. They take the last 6 **non-empty** weeks (skipping
  `prior` peer-fill and empty Mondays) so a long scrape gap does not draw as a
  flat copied line. `listing_weekly` / `keyword_weekly` is **next week only**
  — overlaying it onto this week mixed two estimators and caused a spike.
  Partial this week is scaled `7/days`. Card omset stays monthly (`×30`).
- Tracker **detail** chart is the same 6+1 weekly grain. Tracker **badges**
  and sparklines stay on the selected 7/30/60/90 **daily** window so the %
  and the headline still share one series. `product_daily_series` /
  `keyword_daily_series` / `store_daily_series` clamp `p_to` at
  `current_date + 7` so the store tab can fill next week when there is no
  `store_weekly` table.

## What not to do

- Do not revive `weekly_snapshots`.
- Do not bring back `price * delta * 4` on cards (`js/laris-app.js` `_dscOmset`).
- Do not roll Deep Dive tren charts into calendar months (`Agu 26` was month+year).
- Do not scale weekly forecast points `×30/7` on the tren graph — that grain is weekly.
- Do not forecast keyword weeks from a keyword-level peer cohort — there isn't
  one; sum the listing rows.
