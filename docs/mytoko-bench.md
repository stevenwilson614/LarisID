# My Toko benchmark

Connected My Toko (wizard already finished) is a three-tab benchmark in [`js/mytoko-bench.js`](../js/mytoko-bench.js), mounted from `renderSellerCenter` in [`js/gpt-alat-preview.js`](../js/gpt-alat-preview.js).

Tabs: **Ringkasan**, **Produk**, **Kompetitor**. There is no Perbandingan or Strategi tab. The first-run wizard (paste shop → kabar → pilih kompetitor → analisis) is unchanged. Do not put a blocking popup on this page.

## Data

One authenticated RPC: `get_toko_benchmark(p_shop_id, p_extra_keywords)`.

- Own listings: latest row per item, cap 200, plus `product_velocity` nowcast.
- Markets: up to 25 keywords. Catalog keywords on the highest `total_sold` items come first; `p_extra_keywords` fills the rest (snapshot titles). Each market is that keyword’s latest search scrape (`search_rank` is set — a search hit, not a shop-page observation), kept in the same 6-hour window as `listings_fresh_for_keyword`, one row per item.
- Rivals: other shops in those scrapes, top 6 by how many of your keywords they overlap, then by `total_sold` of the overlapping listing. Name and location prefer `mv_shops`.

Apply with `bash scripts/apply-selfhost.sh supabase/migrations/20261102230000_get_toko_benchmark.sql`. Never `supabase db push`.

## Labels

- **Omzet** is `nowcast_omset_monthly` only, always **perkiraan**. Missing nowcast is “—”, not zero, and never `price × total_sold / 6`.
- **Terjual** on a listing is cumulative `total_sold`. Do not call it 30 hari.
- **Peringkat** is rank by `total_sold` inside that keyword scrape: “di kata kunci ini”. Not a Shopee category rank. The “#n dari N” line is shown only when that scrape has at least 5 peers. A thinner scrape stays **Belum ada pembanding**, with no rank beside it.
- **Listing tertua yang terlihat** is `min(listing_date)`. It is not the shop’s join date on Shopee. Hide it when we have no date.
- Rival omzet is the nowcast of the overlapping listings only, not the shop’s whole GMV. `n_listings` is how many listings we have seen, not their full catalog.

## Position

A listing is comparable only when that keyword scrape has at least 5 other listings (`peer_count >= 5`), a median price, and a rank for this item.

- **Lebih unggul** — rank in the top 30% (`rank <= ceil(0.3 × total_sellers)`) and price at or under median × 1.05.
- **Di bawah** — price at or over median × 1.15, or rank in the bottom half and price above the median.
- **Setara** — comparable, and neither of the above.
- **Belum ada pembanding** — no keyword, or fewer than 5 peers. These rows stay out of the posisi donut.
- **Belum ada peringkat** — 5 peers and a median, but this item is not in that scrape. The price gap can still show. The row stays out of the donut.

**Skor toko** shows only when at least 3 listings are comparable. It is the percent of those that are Lebih unggul or Setara. The page says it is from a LarisID scrape, not a Shopee score. Below 3, show the raw counts and no score.

“Sudah bagus” / “Bisa diubah” use the same tones as `buildInsights`: price within 5% of median, price above or below, judul missing keyword tokens, rank inside or outside the top 10 of that scrape. Store cards are counts, not one line per product. Do not invent a target price.

## Do not ship

Video usage, vouchers, flash sales, “rutin promo”, affiliate, or live GMV. We do not collect them. If a pola harga or ulasan cannot be counted from the rows, omit the card.

Pola harga counts each returned peer once, against your highest-`total_sold` listing in that keyword. It does not multiply the same shops by every listing you have there. The sentence is about the peers in the payload (up to 6 per keyword), not every seller in the scrape.
