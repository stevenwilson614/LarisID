// Shared changelog for both arms. Loaded by index.html (Site A) and
// gpt/index.html (Site B); the beta badge on each opens it.
//
// Newest first. Keep entries short and user-facing — what changed for the
// seller, not the implementation. Dates are ISO so they sort and format
// predictably; the UI renders them in Indonesian.
window.LARIS_CHANGELOG = [
  {
    date: '2026-08-01',
    title: 'Pantauan Harian — keyword kamu, dicek tiap pagi',
    items: [
      'Pilih sampai 5 keyword dan 3 toko yang mau kamu pantau. Kami scrape keyword kamu SETIAP PAGI, jadi tiap hari kamu bisa lihat produk mana yang bergerak.',
      'Setup cukup satu ketukan: pilih kategori, kami isikan keyword yang paling ramai di sana. Nggak perlu bingung mau ketik apa.',
      'Angka yang ditampilkan adalah total 7 hari terakhir, bukan penjualan kemarin — Shopee cuma menampilkan angka pasti di bawah 1.000 terjual, jadi rentang seminggu jauh lebih bisa dipercaya.',
      'Kalau kamu nggak buka selama 2 minggu, pantauan otomatis dijeda biar hemat. Keyword dan datamu tetap tersimpan, dan langsung jalan lagi begitu kamu buka.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Riset per pasar, bukan per listing',
    items: [
      'Cari produk sekarang menampilkan PASAR — satu kartu untuk satu pasar lengkap dengan jumlah penjual, omset per bulan, harga median, dan rentang harga. Bukan lagi 30 listing yang mirip semua.',
      'Kategori dirapikan total: 84 nama kategori acak dari data jadi 18 kategori bersih, dan sub-kategori kini dibuat otomatis dari produk yang benar-benar ada — tidak ada lagi sub-kategori kosong.',
      'Kota bisa diketik bebas. Kalau kotamu belum ada datanya, kami pakai kota terdekat dan bilang kota mana yang dipakai.',
      'Chat AI sekarang mengetik jawabannya langsung (streaming), bisa dihentikan, disalin, dan diminta ulang.',
      'AI ingat hal penting antar chat — misalnya modal kamu — jadi tidak perlu mengulang terus. Bisa dilihat dan dihapus di Preferensi.',
      'Klik Top Kompetitor tidak lagi bikin chat baru tiap kali; label PASAR / PRODUK menegaskan kamu sedang lihat apa.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'Perbaikan My Toko + jumlah penonton produk',
    items: [
      'Hubungkan Toko tidak lagi harus persis sama namanya — ketik sebagian nama toko dan pilih dari daftar, atau tempel link toko Shopee.',
      'Analisa link produk kini menampilkan pesan error yang jelas kalau linknya tidak terbaca, bukan kartu kosong.',
      'Kartu produk menampilkan berapa orang melihat produk itu tahun ini.',
    ],
  },
];
