# My Toko benchmark

Connected My Toko (wizard already finished) is the three-tab page in [`js/mytoko-bench.js`](../js/mytoko-bench.js), mounted from `renderSellerCenter` in [`js/gpt-alat-preview.js`](../js/gpt-alat-preview.js).

Tabs: **Ringkasan**, **Produk**, **Kompetitor**. There is no Peluang or Rekomendasi tab, and no upgrade prompt. The first-run wizard is unchanged. Do not put a blocking popup on this page. Pengaturan holds ganti toko, hapus toko, sembunyikan produk, Analisis ulang, and the extension link.

## One keyword

Competitors are the other shops in **one** keyword scrape, not every keyword on the shop.

- Score each keyword by the sum of `nowcast_omset_monthly` on the shop’s own listings. If that sum is missing, use `total_sold`.
- Skip a keyword whose LarisID scrape has fewer than 5 other listings in the benchmark payload, then confirm the market has at least 5 other **shops**.
- If the next keyword is at least a quarter of the winner, it appears as a chip. The label is the keyword itself: **di kata kunci ini**.

`get_toko_market(p_shop_id, p_keyword, p_item_id)` reads that scrape once: search hits (`search_rank` set), latest 6-hour window, same cohort as `get_toko_benchmark`. It returns up to 100 shops, up to 80 listings for the charts, and weekly sums.

Apply with `bash scripts/apply-selfhost.sh supabase/migrations/20261103110000_get_toko_market.sql`. Never `supabase db push`.

## 30 hari

The header pill is **30 hari**. There is no 7-day or 90-day mode.

- **Penjualan** for a shop is the sum of `nowcast_omset_monthly` on its listings in this scrape. For a product it is that listing’s nowcast. Always **perkiraan**. It is not the shop’s whole Shopee GMV.
- Missing nowcast is an input. Saving writes `user_toko_manual_omzet` for that user, shop, and item (`item_id` 0 is the shop). The cell says **kamu isi**. A typed number does not replace a nowcast and is not copied onto competitors.
- Rank and Top % use shops that have a perkiraan. Hidden below 5 shops. Top % is `ceil(100 * rank / n)`.
- **Jumlah produk**, rating, ulasan, and harga rata-rata are from the same scrape. The spider is your value ÷ the other shops’ average × 100. The gray ring is 100. An axis with no data is dropped.

## Tren

Tren uses `listing_weekly`, last 6 week-starts. A line is drawn only when a listing has a second measured scrape (`source=measured` and `span_days >= 2`). A week that is not fully measured is dashed. Do not draw a daily line. Rules: [`listing-weekly.md`](./listing-weekly.md).

## List edits

- **Sembunyikan** on a competitor writes `user_toko_hidden_shops`.
- **Tambah** searches shops we already have (`find_shops_by_name`) and writes `user_toko_added_shops`. A shop with no rows in this keyword stays on the list with penjualan “—”.
- **Sembunyikan** on a product writes `user_toko_hidden_items` and drops it from the dropdown and from your totals.

Rows are readable only by the signed-in user.

## Produk

One dropdown. The default is the highest 30-day perkiraan in the active keyword. Choosing a listing from another keyword switches the market.

Performa compares that listing with the keyword average for penjualan, harga, penilaian, and ulasan. There is no variasi row. The rank is “#n dari N” inside this scrape. Bars are only the peer penjualan values the query returned.

Pantau still opens the existing Kompetitor / Analisa panel.

## Do not ship

Video, vouchers, flash sales, “rutin promo”, affiliate, live GMV, a Shopee category rank, or a target price. If a keep/change line cannot be counted from price, judul, or rank in this scrape, omit it.
