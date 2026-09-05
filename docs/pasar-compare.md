# Bandingkan Pasar — ranked board in Cari Produk

One row per **pasar** (a `product_types_v` keyword, ~120 listings). Rows are
ordered by **Skor Mudah Masuk** so a new seller can see in a couple of seconds
which pasar is the easiest place to start, then read four signal cells to see
why. A `Peta` tab shows the same set as a demand-vs-moat quadrant.

This replaced the listing scatter (Peta Peluang) inside the **directory**. Peta
Peluang still runs in chat (`replyWithPasarTypes`) and compare-pick
(`renderDirectoryListings`) because those are listing-level surfaces — see
[peta-peluang.md](./peta-peluang.md).

## Where it lives

- Module: [`js/pasar-compare.js`](../js/pasar-compare.js) (`window.PasarCompare`)
- CSS: [`styles/pasar-compare.css`](../styles/pasar-compare.css)
- Wiring: `pasarCompareOpts` / `mountPasarCompare` / `clearPasarCompare` in
  [`js/gpt-app.js`](../js/gpt-app.js), called from `syncDirHome()` and the tail
  of `renderDirectory()`.

| Host | When | Set compared |
|---|---|---|
| `#dir-home-compare` (under Trending Sekarang) | directory home (`isDirHomeBrowse()`) | first 20 of `loadDirHomePool()` — the same trending pool the rail draws its 10 from |
| `#dir-peta` | category or subgroup selected | `types.slice(0, 20)` after `sortTypeRows` + `markTerlarisMinggu` (top 20 by the active sort) |
| `#dir-peta` | search (`state.dirSearch`) | first 20 search hits (incl. nearby fallback, labelled as such) |

Hidden when fewer than 2 pasars. Home board is cleared the moment a search /
category is active; the `#dir-peta` board is cleared on home. Two overlapping
`renderDirectory()` calls can race (home fetch of 1000 rows still in flight when
a search lands) — the tail compares `q` / `cats` / `sub` with live `state` and a
stale render does not touch the board.

Row click = `openDeepDive(typeRepProduct(t))`, the same as a type card. Events:
`ptype_open` (with `surface`), `pasar_compare_view`, `pasar_compare_expand`,
`pasar_compare_open`.

## Data

Inputs are the `product_types_v` rows the directory already fetched plus one
read of `mv_new_seller_market` (already `grant select … to anon, authenticated`):

| Cell | Column | Notes |
|---|---|---|
| Laku / minggu | `wk_units` (+ `wk_base` for the growth %) | span-normalised 7-day units from `mv_keyword_weekly`; fallback shows `omset_top15` as “omset/bln top-15” |
| Tembok ulasan | `median_winner_reviews` | median reviews of listings with `total_sold >= 100` (`mv_niche_breakout`) |
| Toko baru laku | `mv_new_seller_market` `segment='toko_baru'` → `pct_reached_10`, `n_listings` | share of new-shop (≤180 d) listings that reached 10 units. `n_listings < 5` = “tipis”, neutral score |
| Harga | `price_median`, `price_p25`, `price_p75` | quartiles come from `product_type_quartiles` via `attachTypeQuartiles` |
| (score only) Konsentrasi | `sold_top3_share` | **fraction 0–1** in the matview, not a percent |

Shop age is `min(listing_date)` over scraped listings — a lower bound, never a
shop-creation date ([riset-toko-baru.md](./riset-toko-baru.md) R1). The footer
says so.

## Skor Mudah Masuk (0–100)

Absolute, so a 79 on the home board means the same as a 79 under “sepatu”.

| Part | Max | Mapping |
|---|---|---|
| Tembok ulasan | 30 | `30 · (1 − logNorm(median_winner_reviews, 50, 5000))`; null → 15 |
| Toko baru yang laku | 30 | `30 · clamp(pct_reached_10 / 50)`; thin (n < 5) or missing → 12 |
| Konsentrasi top-3 | 15 | `15 · (1 − clamp(sold_top3_share / 0.8))`; null → 8 |
| Permintaan | 15 | `15 · logNorm(wk_units, 25, 2000)`; fallback `logNorm(omset_top15, 5jt, 500jt)` |
| Pertumbuhan mingguan | +10 | `10 · clamp(wk_units / wk_base · 100 / 10)` (needs `wk_base ≥ 50`) |

Verdict copy (describes the market, never the person — MISSION):
`≥ 70` **Mudah masuk** · `45–69` **Bisa, perlu strategi** · `< 45` **Berat untuk pemula**.

Tercile markers on the cells (green / amber left border) are relative to the set
on screen: best third / worst third for Laku (higher better), Tembok ulasan
(lower better), Toko baru laku (higher better). Harga has no direction.

Live spread on 2026-09-05: trending home 75–86 (that pool is by definition high
volume with thin moats), Dapur 50–83, “sepatu” 35–79.

## Peta tab

SVG, x = tembok ulasan (log), y = laku/minggu (log), radius = toko baru laku %
(dashed ring when thin), fill = verdict. Upper-left quadrant (below the
geometric-mean review moat, above the geometric-mean demand) is tinted and
labelled “Ramai, tembok rendah — cocok pemula”. Top 8 by score are always
labelled; the rest label on hover/focus. Labels use a greedy right/left/above/
below placement to avoid overlap. Needs ≥ 3 pasars with both reviews and units.

## Honesty

- Everything here is **perkiraan**; the footer states the formula and the
  shop-age caveat. Never add a `terukur` label to this board.
- A low score is “pasar ini butuh strategi”, not “produk ini jelek”. Do not add
  a hard filter on the score or hide rows under a threshold.
- Do not present `wk_units / wk_base` as “vs minggu lalu” — it is growth against
  the lifetime baseline ([terlaris-minggu.md](./terlaris-minggu.md)).

## Re-tuning

All constants live at the top of `scorePasar()` in `js/pasar-compare.js`.
Check the spread on home / a category / a search after a change and record the
new live spread above. Keep the weights summing to 100 (+10 growth) so the
footer sentence stays true.
