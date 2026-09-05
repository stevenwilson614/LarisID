# Peta Peluang — trending photo map + listing table

Scatter of **listings** for the current product search. One marker =
`(item_id, shop_id)`. Default Peluang plots the **top 20** by weekly
omset % change, with circular product photos. The listing table under
the map is the **full filtered set**, not the same 20 dots.

## Where it lives

- Module: [`js/peta-peluang.js`](../js/peta-peluang.js) (`window.PetaPeluang`)
- CSS: [`styles/peta-peluang.css`](../styles/peta-peluang.css)
- SQL: [`supabase/migrations/20260904120000_peta_peluang.sql`](../supabase/migrations/20260904120000_peta_peluang.sql)
- Weekly backfill: `~/shopee_scraper/listing_weekly.sql` (`backfill_listing_weekly_estimates`)
- Hosts:
  - Cari Produk (`#dir-peta`) — `list: false`. The listing table under the map
    (`listingRowsHtml` in `js/gpt-app.js`) is the list. `onHighlight` /
    `onZoneFilter` keep map and rows in sync; row hover calls `hoverKey`.
    `onTrend` repaints the Trending column after `peta_batch`.
  - Chat search / finder / recs (`.peta-host`) — `list: false` for the same
    reason (a second list would duplicate the table).
  - Compare-pick in the directory (`#dir-peta`) — same table with `pick:true`.
  - SPA Discover (`#disc-peta`) — `list: false` if that grid is already listings.
  - Bandingkan Pasar is **not** mounted here anymore. That module is chat-only
    (`handleBandingkanIntent`) — see [pasar-compare.md](./pasar-compare.md).

`PetaPeluang.skeleton(el, query)` paints chrome before `peta_batch` / listing fetch returns.

## Ranking (top 20)

`peta_batch` still receives up to 200 keys. After frames arrive, each listing
gets `_petaTrend` from the same 8-week `omset_wk` positions:

| Window | Formula |
|---|---|
| Weekly % | `(avg omset_wk of W0 + W0−7 − avg of W0−14 + W0−21) / prev` |
| Monthly % | sum of last 4 weeks vs previous 4 |

- Drop `belum`: fewer than 4 weeks in the recent window, previous weekly
  omset below Rp 50rb, or no `measured` / `estimated` / `nowcast` week.
- Clamp `−100` … `+300` (same as unit momentum).
- Plot the **top 20** by weekly % desc. Fewer than 20 qualifying → show only
  those. Below 8 → thin-data message; the table can still be read.
- While `peta_batch` is in flight, a provisional top 20 by monthly omset is
  drawn (volume fallback, no invented %). If the RPC is missing, stay on that
  fallback.

Never present a raw two-snapshot delta as “minggu ini”. Scrapes land 12–17
days apart; weeks are already span-normalised in `listing_weekly`.

## Layout

Desktop (root ≥ 760px): map left (~52%), scrollable listing list right when
`list:true`. Map sticky.
Phone / chat: map full width on top.

Default view is **Peluang only**. Jejak Waktu and Langit Laris sit behind
**Lainnya**. Those modes keep their unit / constellation encodings but only
animate the same top-20 set. A “← Peluang” chip returns.

## Axes (Peluang)

| | |
|---|---|
| X | Kenaikan omset/minggu (linear). Tick labels: −20% · 0 · +50% · +100%. Volume fallback (no batch) still uses log laku/minggu. |
| Y | Masih baru / sudah lama. **Drawn** by percentile rank of `yNew` in the rendered set (ties: more reviews / older age sit lower). **Zone assignment** uses `reviews < 100` or `age < 180` plus `omsetPct >= median` of the plotted 20. |
| Size | `nowcast_omset_monthly` — photo radius ~16–28px |
| Marker | Circular product photo (`image_url`, Shopee `_tn.webp` when possible). MERAH circle if the image is missing. Pekat ring = terukur (`nowcast_method` latest/blend). Pudar wash + thin outline = perkiraan. |
| Color (Jejak / Langit) | Momentum class from `mv_listing_momentum`. |

Iklan and momentum words live on the **list row**, not as extra rings/arrows on the default scatter.

Viability score is **not** a color. It is the Sidik Jari glyph on rows, cards, and the tooltip.

## Zones (relative to the plotted 20)

Boundary X = median weekly omset % of the rendered set (median weekly units
on the volume fallback). Assignment uses `isBaru` + `x >= median`, not pixel
position. Horizontal zone line is drawn only when both baru and lama exist.

The 2×2 legend sits **under** the canvas. Tap a zone to filter the table to
mapped keys in that zone and fade other markers.

| Id | Label | Meaning |
|---|---|---|
| `baru_laku` | Baru tapi Laku | New and rising |
| `pemain_lama` | Pemain Lama | Old and rising |
| `baru_belum` | Baru, Belum Jalan | New, not rising yet |
| `mulai_sepi` | Mulai Sepi | Old and slow |

## List rows (sibling list, when `list:true`)

Each row: image, name, toko, laku/minggu, omset/bulan, zone name, momentum word, `terukur`|`perkiraan`, `iklan` when `is_ad`, Sidik Jari.

The Cari Produk / chat table (`listingRowsHtml`) is separate: full result
set, with a **Trending** column (`+12% /mgg` · `+8% /bln`) from `_petaTrend`.

- Hover / focus a marker → gold ring + name pill, matching row highlights and scrolls into view.
- Hover a row → same ring + pill.
- Tap a marker → sheet on the canvas.
- Tap a row → same select + open Deep Dive (`opts.onDotOpen`).

## Momentum (units, Jejak / list tags)

`units_cur` = avg `units_wk` over W0 and W0−7. `units_prev` = avg over W0−14 and W0−21.

- `belum` if fewer than 4 weeks, `units_prev < 15`, or no measured/estimated/nowcast week — list shows `…` while `peta_batch` is in flight, then `—`
- `naik` if pct ≥ 20, `turun` if pct ≤ −20, else `stabil`
- Arrow labelled terukur only when both windows are `source=measured`

Omset % on the default map and the table Trending column is the parallel
calculation on `omset_wk`, not `units_wk`.

## Modes

- **Peluang** — top-20 photo scatter on weekly omset %
- **Jejak Waktu** — 8 WIB week frames from `mv_listing_week_positions` (units). Missing scrape weeks are `source=estimated` (perkiraan). Zone lines frozen from the latest frame.
- **Langit Laris** — units axes, dark canvas, token constellations (no embeddings)

## Honesty

See [listing-weekly.md](./listing-weekly.md). Never present a raw two-snapshot delta as minggu ini. Hollow/pudar markers and row tag `perkiraan` for estimated values. Do not revive `weekly_snapshots`.

## States

- Loading: `PetaPeluang.skeleton` — shimmer canvas + 6 row placeholders. Not a grey square.
- Thin data (< 8 usable points): table still renders; map pane says the peta needs 8 and the list can still be read.
- Empty: “Belum ada produk yang bisa dipetakan…”
- `peta_batch` missing (`sessionStorage.larisid_peta_batch_missing`): Jejak stays disabled; volume-fallback photos still draw.

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
  onTrend,              // optional; listings now have _petaTrend (do not remount the map)
})
```

`_petaTrend`: `{ wkPct, moPct, terukur, belum, pending }`.

## Copy

Zone names and cara-masuk lines are everyday Bahasa. Confirm aloud with Afryian & Hendra before treating copy as final (`mentor-copy` in the plan).
