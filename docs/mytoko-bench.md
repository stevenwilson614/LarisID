# My Toko benchmark

Connected My Toko (wizard already finished) is the three-tab page in [`js/mytoko-bench.js`](../js/mytoko-bench.js), mounted from `renderSellerCenter` in [`js/gpt-alat-preview.js`](../js/gpt-alat-preview.js).

Tabs: **Ringkasan**, **Produk**, **Kompetitor**. There is no Peluang or Rekomendasi tab, and no upgrade prompt. After a Shopee link is submitted, the wizard steps are unchanged. Do not put a blocking popup on this page. The header is the shop portrait, the Shopee mark beside the shop name, and a settings icon. The portrait is the shop image, not a product photo. The icon opens a popup. **Hapus toko** asks for confirmation, then clears the connected shop and returns to the My Toko landing. **Sesuaikan omset** is a list of the shop, then each product: type the 30-day amount and press Enter. A typed amount is saved as **kamu isi** and does not replace a perkiraan. **Sembunyikan produk** is the next step in that popup. Ganti toko, Analisis ulang, and the extension link stay under Lainnya. Keyword chips are not on the tab row. The active keyword stays in the line **di kata kunci ini**.

Before a shop is connected, My Toko is the landing in `renderConnect`: the headline (paint-gradient **kompetitor**, same treatment as Ask Laris **jual**), the Shopee URL field under the hero, then a full Ringkasan-shaped demo card. No Kembali / Lewati / extension helper — those were wizard leftovers. The page uses `zoom: 0.85` like the connected bench. The demo is a drawing of **Kaos Polos Murah ID** on keyword `kaos polos oversize` with the same blocks as the live Ringkasan: posisi, peringkat penjualan + Top %, perbandingan, indeks spider, peringkat kompetitor, and tren. The typing chip sits near the upper half of the card. Animations run at half speed; the spider reshapes about every 4s while held. It is not a shop’s data, and the card does not offer Tokopedia. The loop pauses while the real field is in use, and it stays still when reduced motion is on.

## One keyword

Competitors are the other shops in **one** keyword scrape, not every keyword on the shop.

- Score each keyword by the sum of `nowcast_omset_monthly` on the shop’s own listings. If that sum is missing, use `total_sold`.
- Skip a keyword whose LarisID scrape has fewer than 5 other listings in the benchmark payload, then confirm the market has at least 5 other **shops**.
- If the next keyword is at least a quarter of the winner, choosing a listing from that keyword still switches the market. The label on Ringkasan is the keyword itself: **di kata kunci ini**.

`get_toko_market(p_shop_id, p_keyword, p_item_id)` reads that scrape once: search hits (`search_rank` set), latest 6-hour window, same cohort as `get_toko_benchmark`. It returns up to 100 shops, up to 80 listings for the charts, and weekly sums.

Apply with `bash scripts/apply-selfhost.sh supabase/migrations/20261103110000_get_toko_market.sql`. Never `supabase db push`.

## 30 hari

There is no 7-day or 90-day mode, and no window pill in the header.

- **Penjualan** for a shop is the sum of `nowcast_omset_monthly` on its listings in this scrape. For a product it is that listing’s nowcast. Always **perkiraan**. It is not the shop’s whole Shopee GMV.
- Missing nowcast is an input. Saving writes `user_toko_manual_omzet` for that user, shop, and item (`item_id` 0 is the shop). The cell says **kamu isi**. A typed number does not replace a nowcast and is not copied onto competitors.
- Rank and Top % use shops that have a perkiraan. Hidden below 5 shops. Top % is `ceil(100 * rank / n)`.
- **Jumlah produk**, rating, ulasan, and harga rata-rata are from the same scrape. The spider is your value ÷ the other shops’ average × 100. The gray circle is that 100. An axis with no data is dropped. A number above the average is green, except harga, where cheaper than average is green. The other way is red.

## Tren

Tren uses `listing_weekly`, last 6 week-starts. A line is drawn only when a listing has a second measured scrape (`source=measured` and `span_days >= 2`). A week that is not fully measured is dashed. Do not draw a daily line. Rules: [`listing-weekly.md`](./listing-weekly.md).

## List edits

- The Kompetitor map is the top 10 shops: jumlah produk across, penjualan up, both axes from zero. Your shop is included when it sits outside that ten. The list scrolls sideways. Kota, jumlah produk, rating, and omset versus your shop are their own columns. A small shop photo sits left of the name. Ranks 1, 2, and 3 are gold, silver, and bronze.
- **Sembunyikan** on a competitor writes `user_toko_hidden_shops`.
- **Tambah** searches shops we already have (`find_shops_by_name`) and writes `user_toko_added_shops`. A shop with no rows in this keyword stays on the list with penjualan “—”.
- **Sembunyikan** on a product writes `user_toko_hidden_items` and drops it from the dropdown and from your totals.

Rows are readable only by the signed-in user.

## Produk

One dropdown. The default is the highest 30-day perkiraan in the active keyword. Choosing a listing from another keyword switches the market.

Performa compares that listing with the keyword average for penjualan, harga, penilaian, and ulasan, one line each with an icon. There is no variasi row. The rank is “#n dari N” inside this scrape and fills the card. The selector shows that listing’s photo. Tren is that product’s weekly series. Peta harga is the top 10 listings by 30-day penjualan, price across and penjualan up, from zero. The selected product stays on the map when it is outside that ten. The peer table shows a photo and marks sold ranks 1, 2, and 3 in gold, silver, and bronze.

Pantau still opens the existing Kompetitor / Analisa panel.

## Do not ship

Video, vouchers, flash sales, “rutin promo”, affiliate, live GMV, a Shopee category rank, or a target price. If a keep/change line cannot be counted from price, judul, or rank in this scrape, omit it.
