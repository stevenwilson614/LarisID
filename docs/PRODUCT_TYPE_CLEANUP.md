# Product type cleanup (2026-08-14)

Off-topic Shopee ads were winning product-type covers (the bra on **lensa kamera hp clip**) because a type is just `btrim(keyword)` grouping and the cover is the top seller of that group. Independently, `listings_deduped` kept one row per `(item_id, shop_id)`, so 18% of items were attributed to whichever keyword happened to be scraped last.

This change:

1. Re-keys `listings_deduped` to one row per `(item_id, shop_id, keyword)`.
2. Stamps `is_offtopic` once on that matview (Rule A: `kw_hits = 0 AND (is_ad OR item_cat_spread >= 3)`).
3. Demotes `kw_hits = 0` rows out of the cover slot when the token test is reliable for that keyword (`rel_share >= 0.15`).
4. Filters `is_offtopic` at every `listings_deduped` peer/picker call site.

Applied on self-host `api.larisid.com` (migrations `20260814120000`–`20260814140000`) before the frontend deploy. `refresh_breakout_matviews()` ran in **9m 41s** with `statement_timeout` raised to 3600s.

## Headline checks

| Check | Result |
|---|---|
| `lensa kamera hp clip` cover | **Mipanda Lensa Kamera HP Apexel** (84,010 sold). Bra / CCTV / ANTBOX / OPPO phones are `is_offtopic = true` and excluded from cards, peers, and aggregates. |
| Off-topic-looking covers (`kw_hits = 0` on `rep_product_name`, `city='ALL'`) | **332 → 33** |
| Types at `city='ALL'` with `n_listings < 3` | **0** (none lost) |
| Types at `city='ALL'` | 4,009 kept, **0 lost**, 744 new (re-key completeness) |
| `product_history_coverage().products` | **660,933** (distinct item+shop, not the 863,116 keyword rows) |
| Covers changed among the original 4,009 | **1,708** — higher than the 299 measured on the old grain because defect #2’s re-key puts previously mis-attributed bestsellers back into their keywords |

`price_max` on `lensa kamera hp clip` is still Rp 9,750,000. That is no longer the OPPO phones; it is a **Sony A6400 lens kit** (`kw_hits = 1` from the word “lensa”, sponsored). Rule A cannot drop it. Same class of leftover as the ~33 English/Indonesian token misses.

## Per canonical category (`city='ALL'`)

Membership *rises* (re-key puts multi-keyword items in every keyword they were scraped under). “Covers changed” is vs `_pre_cleanup_types`.

| Canonical | Types before | Types now | Covers changed | Types with membership change | Net members |
|---|---:|---:|---:|---:|---:|
| Dapur | 258 | 270 | 114 | 255 | +12,050 |
| Elektronik & Listrik | 232 | 329 | 197 | 309 | +10,009 |
| Fashion | 507 | 646 | 358 | 627 | +28,321 |
| Hewan Peliharaan | 92 | 92 | 39 | 85 | +3,280 |
| Hobi, Kerajinan & Pesta | 260 | 335 | 219 | 313 | +12,827 |
| HP, Komputer & Gaming | 206 | 258 | 135 | 228 | +7,062 |
| Ibu, Bayi & Anak | 242 | 266 | 127 | 239 | +8,139 |
| Kamar Mandi | 63 | 63 | 25 | 62 | +4,602 |
| Kecantikan & Perawatan | 291 | 476 | 309 | 455 | +8,364 |
| Kesehatan | 124 | 127 | 49 | 110 | +4,982 |
| Lainnya | 41 | 41 | 22 | 36 | +925 |
| Makanan & Minuman | 113 | 152 | 68 | 117 | +2,006 |
| Motor & Mobil | 223 | 243 | 105 | 201 | +7,153 |
| Olahraga & Outdoor | 292 | 292 | 135 | 267 | +16,179 |
| Perlengkapan Ibadah | 50 | 50 | 20 | 49 | +2,207 |
| Rumah & Dekorasi | 374 | 374 | 183 | 357 | +22,406 |
| Sekolah, Kantor & Usaha | 215 | 233 | 92 | 206 | +6,023 |
| Sepatu, Tas & Aksesoris | 225 | 289 | 166 | 277 | +9,619 |
| Taman, Tanaman & Perkakas | 201 | 217 | 89 | 187 | +9,193 |

Offtopic rows on the new grain (price/sold gated like `mv_product_types`): **8,428 of 799,922** (~1.1%).

## Other examples

| Keyword | New cover |
|---|---|
| `lensa kamera hp clip` | Mipanda clip-on phone lens (was a bra) |
| `pupuk npk` | Pupuk NPK Mutiara (was La Roche Posay) |
| `alat pemeras jeruk manual` | Stainless juicer (was a bra) |
| `meteran jahit gulung` | Mini tape measure (was Indomie) |
| `helm full face murah` | Still wrong — see limitations |

## `mv_shops` vs `_pre_cleanup_shops`

Not zero differing rows. The distinct-on wrapper is **not** double-counting:

| | |
|---|---|
| Pre shops | 174,621 |
| Now | 183,129 |
| Lost shops | **0** |
| New shops | 8,508 |
| Byte-identical | 155,711 (89% of pre) |
| Same shop, numbers changed | 18,910 (median Δn_listings = **+1**) |

The old matview was a stale one-row-per-item snapshot. Rebuilding from current `listings` adds products scraped since the last refresh; those land on existing shops (+1 listing) or new shops. A double-count would have moved n_listings by ~1.3× across the board.

Snapshot tables `_pre_cleanup_shops` and `_pre_cleanup_types` are left on the DB for further eyeballing.

## Known limitations (not fixed)

- **`is_ad` only from 2026-07-01.** Pre-July injected ads carry `is_ad = 0`. Rule A misses them; Rule B still demotes `kw_hits = 0` covers when `rel_share >= 0.15`.
- **~33 remaining `kw_hits = 0` covers** are English-keyword / Indonesian-name false positives. Their covers are in fact correct.
- **Shared generic tokens go the other way.** `helm full face murah` demotes the bra (`kw_hits = 0`) but then picks Mama’s Choice “Face Care” (`kw_hits = 1` from “face”) over the actual helmet. Fixing that needs a synonym/translation layer, out of scope.
- **On-topic-looking ads remain.** The Sony A6400 kit under `lensa kamera hp clip` contains “lensa”, so it stays and inflates `price_max`.
- Product *types* are not mis-bucketed (`listings.category` is scraper-assigned per keyword). No change to `category_map` or the 18 canonical buckets.
