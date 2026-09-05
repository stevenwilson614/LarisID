# Peta Peluang — product map + synced list

Scatter of **listings** for the current product search. One dot =
`(item_id, shop_id)`. The list next to (desktop) or under (phone) the map
is the **same set**. Spec: `.cursor/plans/peta_peluang_map+list_layout_4bb51931.plan.md`.

## Where it lives

- Module: [`js/peta-peluang.js`](../js/peta-peluang.js) (`window.PetaPeluang`)
- CSS: [`styles/peta-peluang.css`](../styles/peta-peluang.css)
- SQL: [`supabase/migrations/20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql)
- Weekly backfill: `~/shopee_scraper/listing_weekly.sql` (`backfill_listing_weekly_estimates`)
- Hosts:
  - Cari Produk (`#dir-peta`) — `list: false`. The listing table under the map
    (`listingRowsHtml` in `js/gpt-app.js`) is the list. `onHighlight` /
    `onZoneFilter` keep map and rows in sync; row hover calls `hoverKey`.
  - Chat search / finder / recs (`.peta-host`) — `list: false` for the same
    reason (a second list would duplicate the table).
  - Compare-pick in the directory (`#dir-peta`) — same table with `pick:true`.
  - SPA Discover (`#disc-peta`) — `list: false` if that grid is already listings.
  - Bandingkan Pasar is **not** mounted here anymore. That module is chat-only
    (`handleBandingkanIntent`) — see [pasar-compare.md](./pasar-compare.md).

`PetaPeluang.skeleton(el, query)` paints chrome before `peta_batch` / listing fetch returns.

## Layout

Desktop (root ≥ 760px): map left (~52%), scrollable listing list right. Map sticky.
Phone / chat: map full width on top, list immediately under it (first 12 rows + “Lihat semua”; chat list scrolls at ~6 rows).

Default view is **Peluang only**. Jejak Waktu and Langit Laris sit behind **Lainnya**. Those modes keep their own encodings; a “← Peluang” chip returns.

## Axes

| | |
|---|---|
| X | Laku per minggu = `nowcast_velocity_daily * 7` (log scale). Fallback `total_sold / age * 7`, marked perkiraan. Tick labels: 1 · 10 · 100 · 1rb. |
| Y | Masih baru / sudah lama. **Drawn** by percentile rank of `yNew` in the rendered set (ties: more reviews / older age sit lower) so old listings do not stack on the floor. **Zone assignment** still uses the rule `reviews < 100` or `age < 180` plus `xUnits >= median`. |
| Size | `nowcast_omset_monthly` |
| Fill (Peluang) | Single hue MERAH. Pekat (α 0.85) = terukur (`nowcast_method` latest/blend). Pudar (α 0.3 + outline) = perkiraan. |
| Color (Jejak / Langit) | Momentum class from `mv_listing_momentum`. |

Iklan and momentum words live on the **list row**, not as extra rings/arrows on the default scatter.

Viability score is **not** a color. It is the Sidik Jari glyph on rows, cards, and the tooltip.

## Zones (relative to this search)

Boundary X = median weekly units of the rendered set. Assignment uses `isBaru` + `xUnits >= median`, not pixel position. Horizontal zone line is drawn only when both baru and lama exist (midpoint of their rank ranges).

The 2×2 legend sits **under** the canvas (not on it). Tap a zone to filter the list and fade other dots.

| Id | Label | Meaning |
|---|---|---|
| `baru_laku` | Baru tapi Laku | New and already selling |
| `pemain_lama` | Pemain Lama | Old and large |
| `baru_belum` | Baru, Belum Jalan | New, not selling yet |
| `mulai_sepi` | Mulai Sepi | Old and slow |

## List rows

Each row: image, name, toko, laku/minggu, omset/bulan, zone name, momentum word, `terukur`|`perkiraan`, `iklan` when `is_ad`, Sidik Jari. Sorted by laku/minggu desc.

- Hover / focus a dot → gold ring + name pill, matching row highlights and scrolls into view.
- Hover a row → same ring + pill.
- Tap a dot → sheet on the canvas.
- Tap a row → same select + open Deep Dive (`opts.onDotOpen`).

## Momentum

`units_cur` = avg `units_wk` over W0 and W0−7. `units_prev` = avg over W0−14 and W0−21.

- `belum` if fewer than 4 weeks, `units_prev < 15`, or no measured/estimated/nowcast week — list shows `…` while `peta_batch` is in flight, then `—`
- `naik` if pct ≥ 20, `turun` if pct ≤ −20, else `stabil`
- Arrow labelled terukur only when both windows are `source=measured`

## Modes

- **Peluang** — default scatter (position + size + terukur/perkiraan)
- **Jejak Waktu** — 8 WIB week frames from `mv_listing_week_positions`. Missing scrape weeks are `source=estimated` (perkiraan). Zone lines frozen from the latest frame.
- **Langit Laris** — same axes, dark canvas, token constellations (no embeddings)

## Honesty

See [listing-weekly.md](./listing-weekly.md). Never present a raw two-snapshot delta as minggu ini. Hollow/pudar dots and row tag `perkiraan` for estimated values. Do not revive `weekly_snapshots`.

## States

- Loading: `PetaPeluang.skeleton` — shimmer canvas + 6 row placeholders. Not a grey square.
- Thin data (< 8 usable points): list still renders; map pane says the peta needs 8 and the list can still be read.
- Empty: “Belum ada produk yang bisa dipetakan…”
- `peta_batch` missing (`sessionStorage.larisid_peta_batch_missing`): Jejak stays disabled; dots still draw.

## Refresh

After `refresh_listing_weekly()`:

```
SELECT backfill_listing_weekly_estimates(10);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_momentum;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_listing_week_positions;
```

`bash ~/shopee_scraper/refresh_listing_weekly.sh` runs those steps. First backfill can take several minutes.

Client RPC: `peta_batch(p_keys jsonb, p_weeks int default 8)` — max 200 keys.

## Host contract

```
PetaPeluang.mount(el, listings, {
  query, supabase, calcScore, onDotOpen,
  list: false,          // omit the sibling list (Discover / compare-pick)
  onHighlight,          // optional, for external cards when list:false
  onZoneFilter,         // optional, same
})
```

## Copy

Zone names and cara-masuk lines are everyday Bahasa. Confirm aloud with Afryian & Hendra before treating copy as final (`mentor-copy` in the plan).
