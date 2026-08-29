# Toko baru: apa yang membedakan yang jalan dari yang mandek

Riset internal LarisID, disusun 29 Agustus 2026, untuk bahan ajar kohort.
Sumber: data scrape LarisID sendiri. Semua angka bisa dihitung ulang lewat
`pola_toko_baru()` dan `mv_new_shop_*` di database.

**Cara membaca dokumen ini:** setiap angka di sini adalah **pengamatan**, bukan
resep. Kami melihat apa yang dilakukan puluhan ribu listing toko baru dan apa
yang terjadi sesudahnya. Kami tidak menjalankan eksperimen, jadi kami tidak bisa
membuktikan sebab-akibat. Bagian "Batasan" di bawah bukan formalitas — ada dua
temuan di dokumen ini yang akan salah total kalau batasannya dilewat.

---

## Populasi yang dipelajari

| | |
|---|---|
| Listing yang dipelajari | **77.013** |
| Syarat | Lahir (listing_date) pada atau setelah 15 April 2026, di toko yang listing tertuanya baru terlihat pada 2026 |
| Sebaran hasil | 36.261 belum pernah terjual · 20.470 terjual 1–9 · 15.364 terjual 10–99 · 8.925 tembus 100+ |

Yang penting dari populasi ini: **kegagalan ikut terukur.** Hampir setengahnya
belum pernah terjual satu pun. Riset yang hanya melihat toko sukses akan
menyimpulkan bahwa semua yang dilakukan toko sukses adalah kunci sukses.

---

## Temuan 1 — Harga yang bergerak

Ini temuan terkuat di seluruh data.

Listing toko baru yang **harganya pernah berubah** tembus 100 unit kira-kira
**dua kali lebih sering** daripada listing yang harganya tidak pernah disentuh:

| Berapa kali kami amati | Harga tidak pernah berubah | Harga pernah berubah |
|---|---|---|
| 3 kali | 11,3% tembus 100 (n=5.198) | **25,3%** (n=1.519) |
| 4 kali | 14,4% (n=4.553) | **26,1%** (n=1.703) |
| 5 kali | 16,6% (n=1.453) | **32,6%** (n=942) |
| 6 kali | 19,3% (n=1.100) | **36,3%** (n=795) |

**Kenapa tabelnya dipecah per "berapa kali kami amati".** Listing yang laris
muncul lebih tinggi di hasil pencarian, jadi scraper kami lebih sering
melihatnya. Makin sering dilihat, makin besar peluang kami *kebetulan* menangkap
satu perubahan harga. Kalau semua listing dijadikan satu tabel, kami akan
"menemukan" bahwa listing laris sering ubah harga — padahal itu cuma akibat kami
lebih sering meliriknya.

Karena itu perbandingan hanya dilakukan **di dalam satu kolom frekuensi**. Dan
polanya tetap ada di setiap baris. Itu yang membuat temuan ini layak diajarkan.

**Yang boleh disimpulkan:** toko baru yang memperlakukan harga sebagai sesuatu
yang diuji dan disesuaikan berkinerja lebih baik daripada yang pasang harga
sekali lalu ditinggal.

**Yang TIDAK boleh disimpulkan:** "turunkan harga supaya laku." Kami tidak tahu
arah perubahannya menguntungkan atau tidak, dan kami sama sekali tidak tahu
modal penjualnya. **Menurunkan harga di bawah modal bukan strategi, itu kerugian
yang dijadwalkan.** Setiap saran harga di aplikasi wajib dipasangkan dengan cek
harga pokok.

---

## Temuan 2 — Panjang judul tidak membedakan apa pun

| Hasil | Rata-rata panjang judul |
|---|---|
| Belum pernah terjual | 93,5 karakter |
| Terjual 1–9 | 96,0 |
| Terjual 10–99 | 93,8 |
| Tembus 100+ | 90,8 |

Praktis rata. Kalau ada pola, arahnya malah sedikit terbalik dari nasihat umum
"judul panjang biar banyak keyword".

Temuan ini sengaja dimasukkan karena **temuan nol juga temuan.** Nasihat
"panjangkan judulmu" beredar luas, dan data kami tidak mendukungnya. Yang
membedakan bukan panjang judul, tapi **pilihan katanya** — dan itu berbeda per
pasar, bukan aturan umum. Alat `judul_menang` menghitungnya per pasar.

Contoh nyata di pasar "kacang telur": kata **"telor"** (ejaan sehari-hari) muncul
di 38,5% listing yang laku tapi cuma 5,3% listing yang sepi. **"1kg"** muncul di
24,2% listing laku dan 0% listing sepi. Tidak ada aturan umum yang bisa
menghasilkan dua kata itu — hanya pasarnya sendiri yang tahu.

---

## Temuan 3 — Berapa lama sampai 100 unit

Dihitung dari tanggal listing dibuat sampai pertama kali kami melihat angka
terjualnya menembus ambang.

| | Median |
|---|---|
| Sampai terjual pertama | 44,0 hari |
| Sampai 10 unit | 58,1 hari |
| Sampai 100 unit | 68,8 hari |
| **10% tercepat sampai 100 unit** | **29,1 hari** |

Dari 77.013 listing, **42.962 (56%) pernah terjual minimal satu**, 23.405 (30%)
tembus 10 unit, dan **8.640 (11,2%) tembus 100 unit.**

Per kategori, peluang tembus 100 unit paling tinggi di **Makanan & Minuman
(15,8%)**, **Hewan Peliharaan (15,4%)** dan **Kecantikan (14,5%)**; paling rendah
di **Kamar Mandi (5,7%)**, **Elektronik & Listrik (5,8%)** dan **Dapur (6,6%)**.

**Batasan yang wajib disampaikan ke peserta:** angka ini adalah **batas atas**.
Kami melihat jumlah terjual saat scrape berikutnya, bukan pada detik penjualan
terjadi, jadi tanggal tembusnya selalu tidak lebih awal dari yang sebenarnya.
Dan hanya listing yang lahir setelah 15 April 2026 yang dihitung — sebelum itu
kenaikannya terjadi saat kami belum mengamati, dan akan terbaca sebagai lonjakan
yang jauh lebih cepat daripada kenyataannya.

Cara pakai yang jujur: **"jangan berharap lebih cepat dari ini"**, bukan "segini
waktunya".

---

## Temuan 4 — Yang terlihat seperti temuan, tapi bukan

Di tabel sifat, listing yang **tembus 100+ justru paling jarang muncul sebagai
iklan** (17,4%), sementara yang **belum pernah terjual paling sering** (39,5%).

**Jangan pernah menyampaikan ini sebagai "iklan tidak berguna".** Yang kami catat
adalah apakah sebuah listing muncul di slot iklan pada hasil pencarian yang kami
scrape. Listing yang sudah kuat naik sendiri secara organik dan tidak perlu
membeli slot; listing yang tidak bisa naik organik membeli slot supaya terlihat.
Jadi arah panahnya kemungkinan besar terbalik dari yang terlihat: **bukan iklan
membuat gagal, tapi yang kesulitan naik organik yang beriklan.**

Ini contoh terbaik di dokumen ini tentang kenapa angka mentah butuh
interpretasi. Kalau dipasang di dashboard tanpa kalimat ini, kami akan menyuruh
peserta berhenti beriklan atas dasar yang salah.

---

## Batasan keseluruhan

1. **Umur toko adalah batas bawah.** Kami tidak punya tanggal toko dibuka. Yang
   kami punya adalah listing tertua milik toko itu *yang pernah kami scrape*.
   Toko bisa lebih tua dari itu. Selalu tulis "kira-kira", jangan tanggal pasti.
2. **Bias pengamatan itu nyata**, dan tabel di Temuan 1 dipecah persis untuk
   menetralkannya. Sifat baru apa pun yang mau ditambahkan ke riset ini harus
   lolos uji yang sama sebelum ditunjukkan ke peserta.
3. **Kami tidak punya lokasi pembeli.** Kolom lokasi adalah lokasi penjual. Semua
   pembahasan geografi hanya boleh soal ongkir dan di mana pesaing menumpuk.
4. **Kami belum punya deskripsi produk dalam jumlah berarti** (32 baris di
   `product_details`). Saran deskripsi di aplikasi adalah susunan dari pola judul
   dan konteks pasar, dan harus dinyatakan begitu — bukan contekan dari toko lain.
5. **Pasar kecil harus turun ke level kategori.** Di pasar seperti "kacang telur"
   hanya ada 18 listing toko baru; median dari 18 angka bukan fakta pasar.
   `pemain_baru_pasar()` otomatis pindah ke kategori dan menyebutkan bahwa ia
   melakukannya.

---

## Cara menghitung ulang

```sql
select jsonb_pretty(pola_toko_baru('Makanan & Minuman'));
select jsonb_pretty(pemain_baru_pasar('kacang telur', 'Bau-Bau'));
select jsonb_pretty(judul_menang('kacang telur', 15));
```

Matview sumbernya (`mv_new_shop_items`, `mv_new_shop_traits`,
`mv_new_shop_pricemove`, `mv_new_shop_speed`, `mv_new_seller_market`,
`mv_shop_cohort`) di-refresh tiap hari lewat `refresh_breakout_matviews()`
di rantai `daily_scrape.sh`, jadi angka di dokumen ini akan bergeser seiring
data bertambah. Tanggal di header adalah tanggal angka-angka ini diambil.
