// Shared changelog for both arms. Loaded by index.html (Site A) and
// gpt/index.html (Site B); the beta badge on each opens it.
//
// Newest first, one entry per ship day. Dates are ISO so they sort and format
// predictably; the UI renders them in Indonesian.
//
// Each item is { text, tech }:
//   text — what changed for the seller, in plain language. No jargon.
//   tech — the same change stated technically (what was actually built:
//          endpoints, jobs, queries, data model). Rendered smaller, below.
// A plain string is still accepted and renders with no tech line.
window.LARIS_CHANGELOG = [
  {
    date: '2026-08-21',
    title: 'LarisID tetap 100% gratis \u2014 paket berbayar dibatalkan',
    items: [
      {
        text: 'Pagi ini halaman Harga sempat menampilkan tiga paket berlangganan (Free, Laris Pro Rp149.000, Laris Business Rp399.000). Itu keliru dan sudah kami tarik di hari yang sama. LarisID gratis untuk semua pengguna dan akan tetap begitu \u2014 tidak ada paket berbayar, tidak ada fitur yang dikunci supaya kamu terpaksa bayar.',
        tech: 'Kartu paket di #view-harga dan /harga/ diganti hero \u201c100% GRATIS\u201d plus tabel perbandingan kompetitor; JSON-LD kembali ke satu Offer price 0; salinan harga di llms.txt, llms-full.txt, /perbandingan/, /cara-kerja/ dan template email win-back ikut dibersihkan. Tidak ada perubahan database \u2014 batas pemakaian memang sudah sama untuk semua akun.',
      },
      {
        text: 'Halaman Harga sekarang membandingkan LarisID dengan Tokpee, DataPinter, Kalodata, dan Shoptik \u2014 termasuk hal yang belum kami punya: ekspor Excel, data real-time, dan analitik kreator TikTok Shop.',
        tech: 'Tabel 9 baris fitur dengan harga yang dicek langsung di situs masing-masing pada 21 Agustus 2026 (Kalodata dari sumber pihak ketiga karena halaman harganya login-only). Kolom pertama sticky, tabel scroll horizontal di mobile.',
      },
      {
        text: 'Selama masa Beta, setiap akun yang sudah masuk bisa mencari tanpa batas harian. Tidak perlu kartu kredit.',
        tech: 'Helper _beta_unlimited() di Postgres masuk ke jalur privileged gpt_new_chat DAN policy RLS gpt_chats_insert_capped; get_my_usage mengembalikan unlimited:true + beta:true, jadi ring jatah menampilkan simbol tanpa batas. Pengunjung yang belum masuk tetap dibatasi 10/hari sebagai pendorong daftar.',
      },
      {
        text: 'Pantauan Harian naik dari 5 produk dan 3 toko menjadi 40 produk dan 20 toko.',
        tech: 'tracking_keyword_limit() 5 -> 40 dan tracking_store_limit() 3 -> 20; get_my_tracking dan trigger enforce_tracking_limits keduanya membaca fungsi itu, jadi payload API dan penjagaan tulis ikut naik bersamaan. Wizard menampilkan 6 slot dan bertambah sesuai permintaan, bukan 40 kotak kosong.',
      },
      {
        text: 'Roda hadiah harian dihapus. Dengan pencarian tanpa batas selama Beta, tidak ada lagi batas yang perlu ditebus.',
        tech: 'daily-spin-wheel.js/.css dihapus beserta seluruh call site di gpt-app.js; RPC spin_daily_bonus dan kolom daily_usage.spun_at sengaja dibiarkan agar data historis tetap utuh.',
      },
    ],
  },
  {
    date: '2026-07-31',
    title: 'Pantauan Harian, Cari Supplier, dan Deep Dive baru di kedua situs',
    items: [
      {
        text: 'Pilih sampai 5 keyword dan 3 toko yang mau kamu pantau. Kami scrape keyword kamu SETIAP PAGI, jadi tiap hari kamu bisa lihat produk mana yang bergerak.',
        tech: 'Tabel watchlist per user (keyword + shop, dibatasi 5/3) memberi makan job scrape harian; hasilnya di-diff terhadap snapshot kemarin untuk menghitung delta terjual per listing.',
      },
      {
        text: 'Setup cukup satu ketukan: pilih kategori, kami isikan keyword yang paling ramai di sana. Nggak perlu bingung mau ketik apa.',
        tech: 'Seeding keyword diambil dari agregat volume per kategori di listings, di-rank dan dipotong top-N, lalu di-prefill ke form onboarding.',
      },
      {
        text: 'Angka yang ditampilkan adalah total 7 hari terakhir, bukan penjualan kemarin — Shopee cuma menampilkan angka pasti di bawah 1.000 terjual, jadi rentang seminggu jauh lebih bisa dipercaya.',
        tech: 'Counter Shopee dibulatkan di atas 1k, jadi delta harian punya rasio noise-to-signal yang buruk; kami menjumlahkan rolling window 7 hari supaya error kuantisasi teramortisasi.',
      },
      {
        text: 'Kalau kamu nggak buka selama 2 minggu, pantauan otomatis dijeda biar hemat. Keyword dan datamu tetap tersimpan, dan langsung jalan lagi begitu kamu buka.',
        tech: 'Auto-pause berbasis last_seen_at > 14 hari mengeluarkan watchlist dari antrean scrape harian; state disimpan (soft pause), dan sesi berikutnya me-resume-nya.',
      },
      {
        text: 'Cari Supplier: dari satu produk, kamu bisa langsung lihat daftar toko yang menjual barang serupa — sekarang dengan foto toko biar gampang dipindai.',
        tech: 'Probe validasi permintaan, publik di kedua arm sejak 2026-08-09. Toko terkurasi tetap prioritas; kalau tidak ada match, UI menawarkan pencarian grosir/wholesale (Alibaba/Shopee/web) dengan flag generated=true pada supplier_link_click.',
      },
      {
        text: 'Deep Dive di LARISgpt sekarang tampil sama rapinya dengan versi utama — ringkasan di atas, biaya platform ikut dihitung.',
        tech: 'Layout Site B diselaraskan dengan Site A: pills metrik di bawah hero dan komponen platform-fee dipakai bersama, bukan dua implementasi terpisah.',
      },
      {
        text: 'Pencarian di halaman katalog tidak lagi macet saat data lagi banyak.',
        tech: 'Query katalog Site A yang timeout diperbaiki (range sargable pada scraped_at), plus penambalan lubang instrumentasi pada eksperimen A/B.',
      },
    ],
  },
  {
    date: '2026-07-30',
    title: 'Hadiah harian + perbaikan keandalan',
    items: [
      {
        text: 'Ada roda hadiah harian di kedua situs — satu putaran gratis tiap hari.',
        tech: 'Spin wheel dengan kuota per user per hari, hadiah ditentukan server-side; preview admin dipertahankan tanpa mengonsumsi kuota.',
      },
      {
        text: 'Kalau putaranmu ditolak, sekarang jelas alasannya, bukan cuma gagal diam-diam.',
        tech: 'Alasan penolakan dari RPC dipetakan ke pesan spesifik dan dipakai konsisten di kedua alur UI.',
      },
      {
        text: 'Pencarian, riwayat, gambar, dan kode OTP jadi lebih stabil.',
        tech: 'Perbaikan reliabilitas di jalur search, history, media loading, dan pengiriman OTP untuk Site A dan B.',
      },
    ],
  },
  {
    date: '2026-07-29',
    title: 'Riset per pasar, bukan per listing',
    items: [
      {
        text: 'Cari produk sekarang menampilkan PASAR — satu kartu untuk satu pasar lengkap dengan jumlah penjual, omset per bulan, harga median, dan rentang harga. Bukan lagi 30 listing yang mirip semua.',
        tech: 'Hasil di-agregasi jadi baris pasar (bukan listing) dengan count penjual, sum omset bulanan, serta median dan persentil harga.',
      },
      {
        text: 'Kategori dirapikan total: 84 nama kategori acak dari data jadi 18 kategori bersih, dan sub-kategori kini dibuat otomatis dari produk yang benar-benar ada — tidak ada lagi sub-kategori kosong.',
        tech: 'Taksonomi dinormalisasi 84 → 18 lewat mapping, dan sub-kategori diturunkan dari data aktual sehingga tidak ada node kosong.',
      },
      {
        text: 'Kota bisa diketik bebas. Kalau kotamu belum ada datanya, kami pakai kota terdekat dan bilang kota mana yang dipakai.',
        tech: 'Input kota bebas dengan fuzzy match ke kota berdata; fallback ke tetangga terdekat dan kota yang dipakai diungkap di UI.',
      },
      {
        text: 'Chat AI sekarang mengetik jawabannya langsung (streaming), bisa dihentikan, disalin, dan diminta ulang.',
        tech: 'Respons model di-stream token per token dengan kontrol abort, copy, dan regenerate.',
      },
      {
        text: 'AI ingat hal penting antar chat — misalnya modal kamu — jadi tidak perlu mengulang terus. Bisa dilihat dan dihapus di Preferensi.',
        tech: 'Memori per user yang persisten disuntikkan ke konteks prompt, dengan UI untuk inspeksi dan penghapusan.',
      },
      {
        text: 'Klik Top Kompetitor tidak lagi bikin chat baru tiap kali; label PASAR / PRODUK menegaskan kamu sedang lihat apa.',
        tech: 'Navigasi kompetitor memakai ulang thread aktif alih-alih membuat sesi baru; scope entitas dilabeli eksplisit.',
      },
    ],
  },
  {
    date: '2026-07-28',
    title: 'Perbaikan My Toko + jumlah penonton produk',
    items: [
      {
        text: 'Hubungkan Toko tidak lagi harus persis sama namanya — ketik sebagian nama toko dan pilih dari daftar, atau tempel link toko Shopee.',
        tech: 'Pencocokan toko diganti dari exact match ke pencarian prefix dengan pemilihan dari hasil, plus parser URL toko Shopee.',
      },
      {
        text: 'Analisa link produk kini menampilkan pesan error yang jelas kalau linknya tidak terbaca, bukan kartu kosong.',
        tech: 'Kegagalan parse URL dipropagasi sebagai error state di UI, bukan render kartu kosong.',
      },
      {
        text: 'Kartu produk menampilkan berapa orang melihat produk itu tahun ini.',
        tech: 'Jumlah view tahunan per listing di-surface di kartu produk.',
      },
    ],
  },
];
