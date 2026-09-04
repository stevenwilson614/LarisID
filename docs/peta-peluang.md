# Peta Peluang — product map above search

Scatter of **listings** for the current product search. One dot =
`(item_id, shop_id)`. Spec: `.cursor/plans/peta_peluang_product_map_be17297b.plan.md`.

## Where it lives

- Module: [`js/peta-peluang.js`](../js/peta-peluang.js) (`window.PetaPeluang`)
- CSS: [`styles/peta-peluang.css`](../styles/peta-peluang.css)
- SQL: [`supabase/migrations/20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql)
- Weekly backfill: `~/shopee_scraper/listing_weekly.sql` (`backfill_listing_weekly_estimates`)
- Hosts: gpt-app directory (`#dir-peta`) + chat search; SPA Discover (`#disc-peta`) when Arm A loads

## Axes

| | |
|---|---|
| X | Laku per minggu = `nowcast_velocity_daily * 7` (log scale). Fallback `total_sold / age * 7`, marked perkiraan. |
| Y | Masih baru / sudah lama = `0.6 * f(reviews) + 0.4 * f(ageDays)`. Baru if `reviews < 100` or `age < 180` days. |
| Size | `nowcast_omset_monthly` |
| Color | Momentum class from `mv_listing_momentum` (two-week vs two-week windows) |
| Fill | Solid = terukur (`nowcast_method` latest/blend). Hollow = perkiraan. Dashed ring = `is_ad`. |

Viability score is **not** a color. It is the Sidik Jari glyph on cards and in the tooltip.

## Zones (relative to this search)

Boundary X = median weekly units of the rendered set. Assignment uses `isBaru` + `xUnits >= median`, not pixel position.

| Id | Label | Meaning |
|---|---|---|
| `baru_laku` | Baru tapi Laku | New and already selling |
| `pemain_lama` | Pemain Lama | Old and large |
| `baru_belum` | Baru, Belum Jalan | New, not selling yet |
| `mulai_sepi` | Mulai Sepi | Old and slow |

## Momentum

`units_cur` = avg `units_wk` over W0 and W0−7. `units_prev` = avg over W0−14 and W0−21.

- `belum` if fewer than 4 weeks, `units_prev < 15`, or no measured/estimated/nowcast week
- `naik` if pct ≥ 20, `turun` if pct ≤ −20, else `stabil`
- Arrow labelled terukur only when both windows are `source=measured`

## Modes

- **Peluang** — default scatter
- **Jejak Waktu** — 8 WIB week frames from `mv_listing_week_positions`. Missing scrape weeks are `source=estimated` (perkiraan). Zone lines frozen from the latest frame.
- **Langit Laris** — same axes, dark canvas, token constellations (no embeddings)

## Honesty

See [listing-weekly.md](./listing-weekly.md). Never present a raw two-snapshot delta as minggu ini. Hollow dots and tooltip `perkiraan` for estimated values. Do not revive `weekly_snapshots`.

## Refresh

After `refresh_listing_weekly()`:

```
SELECT backfill_listing_weekly_estimates(10);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_momentum;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_week_positions;
```

`bash ~/shopee_scraper/refresh_listing_weekly.sh` runs those steps. First backfill can take several minutes.

Client RPC: `peta_batch(p_keys jsonb, p_weeks int default 8)` — max 200 keys. If the RPC is missing the map stays grey and Jejak is hidden (`sessionStorage.larisid_peta_batch_missing`).

## Copy

Zone names and cara-masuk lines are everyday Bahasa. Confirm aloud with Afryian & Hendra before treating copy as final (`mentor-copy` in the plan).
