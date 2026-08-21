#!/usr/bin/env node
/**
 * Builds dedicated comparison pages under /perbandingan/:
 *   - one "LarisID vs <competitor>" page per competitor (targets "X vs Y" / "alternatif X" queries)
 *   - a "best tools" listicle ("Alat Riset Produk Shopee Terbaik")
 *
 * These are the query shapes people (and AI) use most when choosing a tool, and listicles /
 * comparison tables are AI's favourite format to quote. Content is honest per MISSION.md:
 * state trade-offs, do not trash competitors, prices are public estimates (verify periodically).
 *
 * Run: node scripts/build-comparisons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'perbandingan');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;
const UPDATED = '2026-08-21';
const UPDATED_HUMAN = '21 Agustus 2026';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function nav() {
  return `<nav class="site-nav">
    <a href="/riset/">Riset Pasar</a>
    <a href="/panduan/">Panduan</a>
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/perbandingan/" class="active">Perbandingan</a>
    <a href="/harga/">Harga</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

function head(title, desc, url, extraLd) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta property="article:modified_time" content="${UPDATED}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/png" href="/images/brand/appicon-red.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
<script type="application/ld+json">
${JSON.stringify(extraLd, null, 2)}
</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.png" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav()}
</header>`;
}

const footer = `<footer class="site-footer">
  \u00a9 2026 LarisID \u00b7
  <a href="/">Beranda</a>
  <a href="/perbandingan/">Perbandingan</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;

const COMPETITORS = [
  {
    slug: 'larisid-vs-datapinter',
    name: 'Datapinter',
    title: 'LarisID vs Datapinter: Perbandingan Jujur Alat Riset Shopee (2026)',
    desc: 'Perbandingan LarisID vs Datapinter untuk riset produk Shopee: harga, fitur, model langganan vs gratis, dan kapan sebaiknya memilih masing-masing.',
    h1: 'LarisID vs Datapinter',
    lead: 'Datapinter adalah pesaing terdekat LarisID secara fitur. Bedanya paling tajam ada di model harga. Ini perbandingan jujurnya.',
    rows: [
      ['Harga', 'Rp 0 \u2014 100% gratis, selamanya, tanpa paket berbayar (10 pencarian baru/hari; tanpa batas selama Beta)', 'Rp 99.000\u2013Rp 2.999.000/bulan (paket Dasar Rp 299.000/bulan); Rp 82.500\u2013Rp 2.499.200/bulan bila ditagih tahunan'],
      ['Model', 'Gratis seluruhnya \u2014 tidak ada paket berbayar', 'Langganan bulanan; ada paket gratis dengan data terbatas'],
      ['Marketplace', 'Shopee, TikTok Shop, Tokopedia, Lazada & Blibli', 'Riset marketplace lengkap'],
      ['Viability Score', 'Ya (0\u2013100)', 'Skor/metric sendiri'],
      ['Deep Dive per produk', 'Ya (tren, kompetitor, keyword)', 'Ya'],
      ['AI kontekstual', 'Ya (terikat produk/keyword)', 'Bervariasi'],
      ['Ekspor data ke Excel', 'Belum ada', 'Ya \u2014 sesuai kuota unduhan paket'],
      ['Data listing', 'Shopee (diperbarui harian)', 'Shopee + Tokopedia'],
      ['Cocok untuk', 'Pemula & seller hemat budget', 'Seller yang butuh ekspor massal & cakupan Tokopedia'],
    ],
    verdict: 'Kalau kamu baru mulai atau tidak ingin komitmen bulanan, LarisID memberi riset mendalam tanpa biaya sama sekali \u2014 gratis selamanya, bukan trial. Kalau kamu butuh ekspor data massal, data listing Tokopedia, atau paket langganan all-in untuk skala besar, Datapinter memang lebih lengkap dan layak dibayar.',
    faqs: [
      { q: 'Apakah LarisID alternatif Datapinter yang gratis?', a: 'Ya. LarisID menyediakan riset produk Shopee dengan skor kelayakan, Deep Dive, dan AI kontekstual \u2014 100% gratis untuk semua pengguna, selamanya, tanpa paket berbayar dan tanpa kartu kredit. Datapinter paket Dasar-nya Rp 299.000/bulan. Yang belum ada di LarisID: ekspor data ke Excel dan data listing Tokopedia.' },
      { q: 'Apa kelebihan Datapinter dibanding LarisID?', a: 'Datapinter punya ekspor data ke Excel sesuai kuota, data listing Tokopedia, dan cakupan riset marketplace yang lebih luas dalam satu paket langganan \u2014 tiga hal yang belum dimiliki LarisID. Cocok untuk seller yang sudah nyaman membayar bulanan dan butuh fitur all-in.' },
    ],
  },
  {
    slug: 'larisid-vs-tokpee',
    name: 'Tokpee',
    title: 'LarisID vs Tokpee: Mana Alat Riset Shopee yang Lebih Cocok? (2026)',
    desc: 'Perbandingan LarisID vs Tokpee: platform web dengan Viability Score & Deep Dive vs ekstensi Chrome ringan untuk Shopee + Tokopedia. Harga dan kecocokan dibahas jujur.',
    h1: 'LarisID vs Tokpee',
    lead: 'Tokpee adalah ekstensi Chrome ringan untuk riset cepat di Shopee dan Tokopedia. LarisID adalah platform web yang lebih dalam per produk. Keduanya punya tempat.',
    rows: [
      ['Harga', 'Rp 0 \u2014 100% gratis, selamanya, tanpa paket berbayar', 'Rp 113.999/bulan, atau Rp 455.999/tahun (\u2248Rp 37.999/bulan); tidak ada paket gratis permanen'],
      ['Bentuk', 'Platform web + ekstensi', 'Ekstensi Chrome'],
      ['Marketplace', 'Shopee, TikTok Shop, Tokopedia, Lazada & Blibli', 'Shopee + Tokopedia'],
      ['Kedalaman analisis', 'Deep Dive + skor kelayakan per produk', 'Riset cepat + ekspor Excel'],
      ['Ekspor data ke Excel', 'Belum ada', 'Ya'],
      ['Data listing', 'Shopee (diperbarui harian)', 'Shopee + Tokopedia, klaim real-time'],
      ['Kalkulator komisi & margin', 'Ya \u2014 5 marketplace, tarif per kategori', 'Tidak/terbatas'],
      ['AI kontekstual', 'Ya', 'Tidak/terbatas'],
      ['Cocok untuk', 'Analisis mendalam satu produk lintas marketplace', 'Riset ringan + ekspor data'],
    ],
    verdict: 'Butuh ekstensi ringan untuk mengintip data sambil browsing dan ekspor Excel? Tokpee praktis. Butuh analisis lebih dalam per produk (tren, Viability Score, AI) plus hitungan komisi di lima marketplace tanpa biaya? LarisID lebih cocok \u2014 dan keduanya bisa dipakai berdampingan.',
    faqs: [
      { q: 'Tokpee atau LarisID untuk pemula?', a: 'Untuk analisis mendalam satu produk (skor kelayakan, tren, AI) tanpa biaya, LarisID lebih cocok untuk pemula. Tokpee unggul untuk riset cepat sambil browsing dan ekspor Excel.' },
      { q: 'Marketplace apa saja yang didukung LarisID?', a: 'LarisID dipakai seller di Shopee, TikTok Shop, Tokopedia, Lazada, dan Blibli \u2014 termasuk kalkulator komisi dan margin dengan tarif per kategori untuk kelima marketplace tersebut.' },
    ],
  },
  {
    slug: 'larisid-vs-shoptik',
    name: 'Shoptik',
    title: 'LarisID vs Shoptik: Perbandingan Alat Riset Produk Shopee (2026)',
    desc: 'Perbandingan LarisID vs Shoptik untuk riset produk Shopee: harga, fitur, dan kapan memilih masing-masing. LarisID 100% gratis; Shoptik Rp 537.000/tahun.',
    h1: 'LarisID vs Shoptik',
    lead: 'Shoptik adalah alat riset produk Shopee berbentuk ekstensi browser, dijual tahunan dengan promo diskon yang praktis selalu aktif. LarisID gratis sepenuhnya. Ini perbandingan jujurnya, termasuk di mana Shoptik lebih unggul.',
    rows: [
      ['Harga', 'Rp 0 \u2014 100% gratis, selamanya, tanpa paket berbayar', 'Rp 537.000/tahun (\u2248Rp 44.750/bulan) \u2014 promo 50% dari Rp 994.000; tidak ada paket gratis'],
      ['Transparansi', 'Penuh \u2014 batas harian tercantum di /harga/', 'Harga tercantum, tapi selalu dalam bingkai promo berbatas waktu'],
      ['Marketplace', 'Shopee, TikTok Shop, Tokopedia, Lazada & Blibli (kalkulator komisi); data listing dari Shopee', 'Shopee Indonesia & Malaysia'],
      ['Skor kelayakan produk', 'Ya (0\u2013100)', 'Tidak'],
      ['Deep Dive + AI', 'Ya', 'Tidak'],
      ['Ekspor data ke Excel', 'Belum ada', 'Ya \u2014 tanpa batas'],
      ['Cocok untuk', 'Yang mau gratis, dengan skor & AI', 'Yang butuh ekspor data massal & pasar Malaysia'],
    ],
    verdict: 'Kalau kamu ingin riset produk tanpa mengeluarkan uang sama sekali, LarisID gratis selamanya \u2014 lengkap dengan skor kelayakan dan AI yang tidak dimiliki Shoptik. Kalau kebutuhan utamamu mengunduh data produk dalam jumlah besar atau riset pasar Shopee Malaysia, Shoptik memang lebih cocok dan LarisID belum bisa menggantikannya.',
    faqs: [
      { q: 'Berapa harga Shoptik?', a: 'Per 21 Agustus 2026 Shoptik dijual Rp 537.000/tahun (sekitar Rp 44.750/bulan) sebagai promo 50% dari harga tercantum Rp 994.000 \u2014 promo itu tampak selalu aktif. Tidak ada paket gratis. Sebagai pembanding, LarisID Rp 0 selamanya dengan batas hariannya tercantum penuh di /harga/. Verifikasi harga terbaru di situs resmi Shoptik.' },
      { q: 'Apakah LarisID benar-benar gratis?', a: 'Ya \u2014 100% gratis untuk semua pengguna, selamanya, tanpa paket berbayar dan tanpa kartu kredit. Yang ada hanya jatah harian untuk menahan biaya server: 10 pencarian produk baru per hari (sekali buka = akses penuh produk itu selama 7 hari), reset tiap tengah malam WIB, dan tidak dibatasi sama sekali selama masa Beta.' },
    ],
  },
  {
    slug: 'larisid-vs-kalodata',
    name: 'Kalodata',
    title: 'LarisID vs Kalodata: Perbandingan Jujur untuk Seller TikTok Shop (2026)',
    desc: 'Perbandingan LarisID vs Kalodata: riset produk 100% gratis untuk Shopee, TikTok Shop, Tokopedia, Lazada & Blibli vs analitik GMV TikTok Shop berlangganan ~$45,90-99,90/bulan. Kapan pilih masing-masing.',
    h1: 'LarisID vs Kalodata',
    lead: 'Kalodata adalah alat analitik TikTok Shop paling banyak dipakai \u2014 dan paling mahal. LarisID 100% gratis dan membantumu memilih produk serta menghitung margin di lima marketplace. Keduanya menjawab pertanyaan yang berbeda; ini perbandingan jujurnya.',
    rows: [
      ['Harga', 'Rp 0 \u2014 100% gratis, selamanya, tanpa paket berbayar', '~$45,90/bulan (Starter) sampai ~$99,90/bulan (Professional) bila ditagih tahunan \u2014 ~$49,99 dan ~$109,99 bila bulanan; sekitar Rp 734.000-1.600.000'],
      ['Paket gratis', 'Ya \u2014 seluruh produk, permanen, tanpa kartu kredit', 'Tidak ada paket gratis permanen (hanya trial terbatas)'],
      ['Marketplace', 'Shopee, TikTok Shop, Tokopedia, Lazada & Blibli', 'TikTok Shop'],
      ['Pertanyaan yang dijawab', 'Produk apa yang layak dijual, di harga berapa, seberapa ketat pesaingnya', 'Berapa GMV sebuah toko/produk/kreator di TikTok Shop'],
      ['Analitik kreator, video & live', 'Tidak', 'Ya \u2014 ini keunggulan utama Kalodata'],
      ['Kalkulator komisi & margin', 'Ya \u2014 5 marketplace, tarif komisi per kategori', 'Tidak'],
      ['Skor kelayakan produk', 'Ya (0-100)', 'Tidak \u2014 fokus pada metrik GMV mentah'],
      ['Ekspor data', 'Belum ada', 'Ya'],
      ['Kesegaran data', 'Diperbarui harian', 'Real-time'],
      ['Bahasa & antarmuka', 'Bahasa Indonesia, berbasis chat, ramah pemula', 'Dashboard analis, ditagih dalam USD'],
      ['Cocok untuk', 'Seller yang sedang memilih produk dan menghitung untung', 'Seller & agency TikTok Shop yang butuh data GMV dan kreator'],
    ],
    verdict: 'Kalau pertanyaanmu "produk apa yang sebaiknya saya jual, dan apakah masih untung setelah komisi?", LarisID menjawabnya gratis \u2014 untuk Shopee, TikTok Shop, Tokopedia, Lazada, maupun Blibli. Kalau pertanyaanmu "kreator dan video mana yang menghasilkan GMV terbesar di TikTok Shop?", itu wilayah Kalodata dan tidak ada gunanya berpura-pura sebaliknya. Banyak seller memakai LarisID untuk memilih produk dan menghitung margin, lalu menambah Kalodata kalau sudah serius menggarap jalur kreator.',
    faqs: [
      { q: 'Apakah ada alternatif Kalodata yang gratis?', a: 'Tergantung kebutuhanmu. Untuk memilih produk yang layak dijual dan menghitung margin setelah komisi TikTok Shop, LarisID melakukannya 100% gratis, selamanya, tanpa paket berbayar. Untuk analitik GMV per toko, kreator, dan video di TikTok Shop, belum ada pengganti gratis yang setara dengan Kalodata.' },
      { q: 'Apa kelebihan Kalodata dibanding LarisID?', a: 'Kalodata punya data GMV TikTok Shop yang tidak dimiliki LarisID: omzet per toko dan per produk di TikTok Shop, performa kreator afiliasi, serta pembedahan video dan live. Datanya juga real-time dan bisa diekspor, dua hal yang belum ada di LarisID. Kalau strategimu bertumpu pada kreator dan konten TikTok, Kalodata adalah alat yang tepat.' },
      { q: 'Apakah LarisID bisa dipakai untuk jualan di TikTok Shop?', a: 'Ya. LarisID membantumu memilih produk berdasarkan permintaan nyata dan menghitung untung dengan kalkulator komisi yang mencakup TikTok Shop, Shopee, Tokopedia, Lazada, dan Blibli \u2014 tarif per kategori, jadi kamu tahu sisa dana bersih sebelum kulakan.' },
      { q: 'Berapa harga Kalodata per bulan?', a: 'Perkiraan publik per 21 Agustus 2026: paket Starter sekitar $45,90/bulan dan Professional sekitar $99,90/bulan bila ditagih tahunan (sekitar $49,99 dan $109,99 bila bulanan), kira-kira Rp 734.000 dan Rp 1.600.000 pada kurs Rp 16.000/USD. Tidak ada paket gratis permanen. Halaman harga Kalodata tidak bisa diakses publik, jadi angka ini berasal dari sumber pihak ketiga \u2014 verifikasi di situs resmi Kalodata.' },
    ],
  },
];

function compTable(rows) {
  return `    <div class="compare-wrap">
      <table class="compare">
        <thead>
          <tr><th>Aspek</th><th>LarisID</th><th>{NAME}</th></tr>
        </thead>
        <tbody>
${rows.map((r) => `          <tr><td><strong>${esc(r[0])}</strong></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>`;
}

function competitorPage(c) {
  const url = `${SITE}/perbandingan/${c.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Perbandingan', item: `${SITE}/perbandingan/` },
        { '@type': 'ListItem', position: 3, name: c.h1, item: url },
      ] },
      { '@type': 'Article', headline: jt(c.title), description: jt(c.desc), inLanguage: 'id',
        datePublished: UPDATED, dateModified: UPDATED, image: OG_IMAGE, mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } } },
      { '@type': 'FAQPage', mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: jt(f.q), acceptedAnswer: { '@type': 'Answer', text: jt(f.a) } })) },
    ],
  };
  return `${head(c.title, c.desc, url, ld)}
<main>
  <p class="cat-pill">Perbandingan</p>
  <h1>${esc(c.h1)}</h1>
  <p class="lead">${esc(c.lead)}</p>
  <p class="updated">Diperbarui ${UPDATED_HUMAN} \u00b7 harga kompetitor adalah perkiraan publik, verifikasi langsung \u00b7 <a href="/cara-kerja/">metodologi</a></p>
  <article>
    <h2>Perbandingan singkat</h2>
${compTable(c.rows).replace('{NAME}', esc(c.name))}
    <p class="disclaimer">LarisID 100% gratis \u2014 detail jatah harian di <a href="/harga/">/harga/</a>. Harga ${esc(c.name)} adalah data publik yang kami cek pada ${UPDATED_HUMAN} dan bisa berubah \u2014 verifikasi di situs resmi mereka.</p>

    <h2>Putusannya</h2>
    <p>${esc(c.verdict)}</p>

    <h2>Kenapa banyak seller memilih LarisID</h2>
    <ul>
      <li><strong>Gratis bermakna.</strong> 100% gratis untuk semua pengguna, selamanya \u2014 tidak ada paket berbayar dan tidak perlu kartu kredit. Yang ada hanya jatah 10 pencarian baru/hari, dan itu pun tidak dibatasi selama Beta.</li>
      <li><strong>Data nyata.</strong> Harga, rating, dan ulasan dari listing asli; "terjual" ditandai sebagai estimasi.</li>
      <li><strong>Lima marketplace.</strong> Kalkulator komisi &amp; margin untuk Shopee, TikTok Shop, Tokopedia, Lazada, dan Blibli dengan tarif per kategori.</li>
      <li><strong>Riset pasar terbuka.</strong> Lihat <a href="/riset/">ratusan halaman riset keyword</a> tanpa perlu daftar.</li>
      <li><strong>Jujur.</strong> Kami tidak menjanjikan "dijamin laku" \u2014 skor untuk mengurangi risiko, bukan menghapusnya.</li>
    </ul>

    <div class="cta-row">
      <a class="btn-primary" href="/">Coba LarisID gratis</a>
      <a class="btn-secondary" href="/perbandingan/alat-riset-produk-shopee-terbaik/">Lihat semua alat</a>
      <a class="btn-secondary" href="/harga/">Harga &amp; batas harian</a>
    </div>
  </article>

  <div class="card">
    <h2>Pertanyaan umum</h2>
${c.faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${esc(f.a)}</p>
    </div>`).join('\n')}
  </div>
</main>
${footer}`;
}

function listiclePage() {
  const slug = 'alat-riset-produk-shopee-terbaik';
  const url = `${SITE}/perbandingan/${slug}/`;
  const title = 'Alat Riset Produk Shopee Terbaik 2026 (Perbandingan Jujur)';
  const desc = 'Daftar dan perbandingan alat riset produk Shopee terbaik 2026: LarisID, Datapinter, Tokpee, Shoptik \u2014 harga, kelebihan, kekurangan, dan untuk siapa.';
  const tools = [
    { name: 'LarisID', price: 'Rp 0 \u2014 100% gratis, selamanya', best: 'Pemula & seller hemat budget yang butuh riset mendalam', pro: 'Gratis seluruhnya tanpa paket berbayar, skor kelayakan, Deep Dive, AI kontekstual, kalkulator komisi 5 marketplace, data nyata', con: 'Belum bisa ekspor data ke Excel; data diperbarui harian (bukan real-time); belum punya analitik kreator & video TikTok Shop', href: '/' },
    { name: 'Datapinter', price: 'Rp 99.000\u2013Rp 2.999.000/bulan (Dasar Rp 299.000/bulan)', best: 'Seller yang butuh ekspor data & cakupan Tokopedia', pro: 'Cakupan riset marketplace luas, ekspor data, ada paket gratis terbatas', con: 'Langganan relatif mahal untuk pemula', href: '/perbandingan/larisid-vs-datapinter/' },
    { name: 'Tokpee', price: 'Rp 113.999/bulan, atau Rp 455.999/tahun (\u2248Rp 37.999/bulan)', best: 'Riset cepat lintas Shopee + Tokopedia + ekspor Excel', pro: 'Ekstensi ringan, multi-marketplace, ekspor data', con: 'Analisis per produk kurang dalam; tidak ada paket gratis permanen', href: '/perbandingan/larisid-vs-tokpee/' },
    { name: 'Shoptik', price: 'Rp 537.000/tahun (\u2248Rp 44.750/bulan), promo 50% dari Rp 994.000', best: 'Yang butuh ekspor data massal & pasar Shopee Malaysia', pro: 'Riset Shopee Indonesia & Malaysia, unduh data tanpa batas', con: 'Tidak ada paket gratis; tanpa skor kelayakan atau AI; harga selalu dibingkai promo', href: '/perbandingan/larisid-vs-shoptik/' },
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Perbandingan', item: `${SITE}/perbandingan/` },
        { '@type': 'ListItem', position: 3, name: 'Alat Riset Produk Shopee Terbaik', item: url },
      ] },
      { '@type': 'Article', headline: jt(title), description: jt(desc), inLanguage: 'id',
        datePublished: UPDATED, dateModified: UPDATED, image: OG_IMAGE, mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } } },
      { '@type': 'ItemList', name: jt('Alat Riset Produk Shopee Terbaik 2026'),
        itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name })) },
    ],
  };
  const cards = tools.map((t, i) => `    <div class="summary-box">
      <h2>${i + 1}. ${esc(t.name)} <span class="note">\u2014 ${esc(t.price)}</span></h2>
      <ul>
        <li><strong>Paling cocok untuk:</strong> ${esc(t.best)}</li>
        <li><strong>Kelebihan:</strong> ${esc(t.pro)}</li>
        <li><strong>Kekurangan:</strong> ${esc(t.con)}</li>
        <li><a href="${t.href}">${t.name === 'LarisID' ? 'Coba gratis' : 'Baca perbandingan lengkap'} \u2192</a></li>
      </ul>
    </div>`).join('\n');
  return `${head(title, desc, url, ld)}
<main>
  <p class="cat-pill">Perbandingan</p>
  <h1>Alat Riset Produk Shopee Terbaik 2026</h1>
  <p class="lead">Memilih alat riset produk Shopee yang tepat menghemat modal dan waktu. Ini perbandingan jujur empat pilihan populer \u2014 lengkap dengan untuk siapa masing-masing paling cocok.</p>
  <p class="updated">Diperbarui ${UPDATED_HUMAN} \u00b7 harga kompetitor adalah perkiraan publik, verifikasi langsung \u00b7 <a href="/cara-kerja/">metodologi</a></p>
  <article>
    <p>Disclosure: kami tim LarisID, jadi kami punya kepentingan \u2014 tapi kami berusaha jujur tentang kapan alat lain lebih cocok. Harga kompetitor adalah perkiraan publik per ${UPDATED_HUMAN}.</p>
${cards}

    <h2>Ringkasan</h2>
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th>Alat</th><th>Harga</th><th>Paling cocok untuk</th></tr></thead>
        <tbody>
${tools.map((t) => `          <tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.price)}</td><td>${esc(t.best)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>
    <p class="disclaimer">Angka harga kompetitor dicek pada ${UPDATED_HUMAN} dan bisa berubah \u2014 verifikasi di situs resmi masing-masing. LarisID 100% gratis; detail jatah harian di <a href="/harga/">/harga/</a>.</p>

    <h2>Kalau jualanmu di TikTok Shop</h2>
    <p>Empat alat di atas fokus pada riset produk Shopee. Untuk analitik <strong>TikTok Shop</strong> \u2014 GMV per toko dan produk, performa kreator afiliasi, data video dan live \u2014 pemain terbesarnya adalah <strong>Kalodata</strong> (~$49,99\u2013109,99/bulan, tanpa paket gratis). LarisID sendiri mencakup pemilihan produk dan kalkulator komisi untuk TikTok Shop secara gratis, tapi tidak menyediakan data kreator. Rinciannya di <a href="/perbandingan/larisid-vs-kalodata/">LarisID vs Kalodata</a> dan <a href="/perbandingan/alternatif-kalodata-gratis/">alternatif Kalodata gratis</a>.</p>

    <div class="cta-row">
      <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
      <a class="btn-secondary" href="/riset/">Lihat data pasar Shopee</a>
    </div>
  </article>
</main>
${footer}`;
}

// ---------- angle pages (high-intent query shapes, no head-to-head competitor) ----------
function anglePage(p) {
  const url = `${SITE}/perbandingan/${p.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Perbandingan', item: `${SITE}/perbandingan/` },
        { '@type': 'ListItem', position: 3, name: p.h1, item: url },
      ] },
      { '@type': 'Article', headline: jt(p.title), description: jt(p.desc), inLanguage: 'id',
        datePublished: UPDATED, dateModified: UPDATED, image: OG_IMAGE, mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } } },
      { '@type': 'FAQPage', mainEntity: p.faqs.map((f) => ({ '@type': 'Question', name: jt(f.q), acceptedAnswer: { '@type': 'Answer', text: jt(f.a) } })) },
    ],
  };
  return `${head(p.title, p.desc, url, ld)}
<main>
  <p class="cat-pill">Perbandingan</p>
  <h1>${esc(p.h1)}</h1>
  <p class="lead">${esc(p.lead)}</p>
  <p class="updated">Diperbarui ${UPDATED_HUMAN} · harga alat lain adalah perkiraan publik, verifikasi langsung · <a href="/cara-kerja/">metodologi</a></p>
  <article>
${p.body}
    <div class="cta-row">
      <a class="btn-primary" href="/">Coba LarisID gratis</a>
      <a class="btn-secondary" href="/riset/">Lihat data pasar Shopee</a>
      <a class="btn-secondary" href="/perbandingan/alat-riset-produk-shopee-terbaik/">Semua alat riset</a>
    </div>
  </article>

  <div class="card">
    <h2>Pertanyaan umum</h2>
${p.faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${esc(f.a)}</p>
    </div>`).join('\n')}
  </div>
</main>
${footer}`;
}

const ANGLE_PAGES = [
  {
    slug: 'aplikasi-cek-produk-terlaris-shopee',
    title: 'Aplikasi Cek Produk Terlaris di Shopee (Gratis, 2026)',
    desc: 'Cara dan aplikasi cek produk terlaris di Shopee secara gratis: baca sinyal penjualan yang jujur (ulasan, rentang harga, jumlah toko) — bukan cuma angka "terjual" yang cuma estimasi.',
    h1: 'Aplikasi Cek Produk Terlaris di Shopee',
    lead: 'Mau tahu produk apa yang benar-benar laris di Shopee? Ini cara mengeceknya dengan data — dan alat gratis untuk melakukannya tanpa langganan.',
    body: `    <p>Banyak orang mencari "aplikasi cek produk terlaris Shopee" lalu berpatokan pada angka <strong>terjual</strong>. Masalahnya, angka terjual di marketplace adalah <strong>estimasi</strong>, bukan data resmi — gampang menyesatkan kalau dipakai sendirian. Alat yang baik menunjukkan beberapa sinyal sekaligus, bukan satu angka.</p>

    <h2>Sinyal yang benar-benar menunjukkan produk laris</h2>
    <ul>
      <li><strong>Jumlah ulasan pada produk teratas.</strong> Ulasan hanya muncul dari pembelian nyata, jadi ini sinyal permintaan paling jujur.</li>
      <li><strong>Rentang &amp; harga median.</strong> Menunjukkan di titik harga mana transaksi benar-benar terjadi.</li>
      <li><strong>Jumlah toko/penjual.</strong> Banyak toko = permintaan ada, tapi persaingan juga ketat.</li>
      <li><strong>Estimasi terjual.</strong> Berguna untuk membaca tren, tapi ingat: ini estimasi, bukan angka pasti.</li>
    </ul>

    <h2>Cara cek produk terlaris (gratis, tanpa aplikasi berbayar)</h2>
    <p>Buka <a href="/riset/">halaman riset pasar LarisID</a> untuk keyword yang kamu incar — ratusan halaman keyword produk populer dengan harga median, jumlah listing dan toko, rating, estimasi penjualan, produk paling banyak diulas, dan sebaran kota penjual. Semua dari listing Shopee nyata, gratis, tanpa perlu login. Untuk analisis satu produk lebih dalam, buka Deep Dive di aplikasinya.</p>

    <h2>Kenapa tidak cuma mengandalkan angka "terjual"</h2>
    <p>Shopee membulatkan angka terjual, dan alat pihak ketiga hanya bisa mengestimasi dari data publik. Produk dengan "terjual" tinggi tapi ulasan sedikit patut dicurigai. Karena itu LarisID selalu menandai "terjual" sebagai estimasi dan mendorong kamu membaca ulasan + margin sebelum kulakan. Lihat <a href="/cara-kerja/">metodologi data</a>.</p>

    <h2>Alat cek produk terlaris Shopee</h2>
    <p>Ada beberapa pilihan berbayar (Datapinter mulai Rp 99.000/bulan, Tokpee Rp 113.999/bulan, Shoptik Rp 537.000/tahun). <strong>LarisID</strong> menyediakan pengecekan produk terlaris — skor kelayakan, Deep Dive, data harga &amp; ulasan nyata — <strong>100% gratis, selamanya</strong>. Yang belum ada di LarisID: ekspor Excel dan data real-time. Bandingkan semuanya di <a href="/perbandingan/alat-riset-produk-shopee-terbaik/">alat riset produk Shopee terbaik</a>.</p>`,
    faqs: [
      { q: 'Apa aplikasi cek produk terlaris Shopee yang gratis?', a: 'LarisID (larisid.com) memungkinkan kamu mengecek produk terlaris Shopee — harga, ulasan, jumlah toko, dan estimasi penjualan. 100% gratis untuk semua pengguna, selamanya, tanpa kartu kredit dan tanpa paket berbayar. Halaman riset pasarnya bahkan bisa diakses tanpa login.' },
      { q: 'Apakah angka terjual di Shopee akurat?', a: 'Harga, rating, dan jumlah ulasan adalah data nyata. Angka "terjual" adalah estimasi dari data publik, bukan data resmi Shopee, jadi pakai sebagai sinyal tren — bukan angka pasti — dan silangkan dengan jumlah ulasan.' },
      { q: 'Bagaimana cara tahu produk laris tanpa aplikasi berbayar?', a: 'Cek jumlah ulasan produk teratas, harga median, dan jumlah toko di keyword incaranmu. Halaman riset pasar gratis LarisID menampilkan semuanya dari listing Shopee nyata tanpa perlu berlangganan.' },
    ],
  },
  {
    slug: 'riset-produk-shopee-gratis-vs-berbayar',
    title: 'Riset Produk Shopee: Gratis vs Berbayar — Mana yang Kamu Butuh? (2026)',
    desc: 'Riset produk Shopee gratis vs berbayar: apa yang dicakup alat gratis, kapan langganan berbayar sepadan, dan cara riset produk Shopee gratis tanpa kartu kredit.',
    h1: 'Riset Produk Shopee: Gratis vs Berbayar',
    lead: 'Perlu bayar langganan untuk riset produk Shopee? Sering kali tidak. Ini yang bisa kamu dapat gratis, kapan berbayar benar-benar sepadan, dan cara mulai tanpa biaya.',
    body: `    <p>Riset produk yang baik adalah soal membaca <strong>permintaan, harga, dan persaingan</strong> sebelum keluar modal. Kabar baiknya: hampir semua yang dibutuhkan seller pemula bisa didapat gratis. Berikut perbandingan jujurnya.</p>

    <h2>Apa yang dicakup alat riset GRATIS</h2>
    <ul>
      <li>Harga median &amp; rentang harga per keyword.</li>
      <li>Estimasi penjualan dan jumlah ulasan (sinyal permintaan).</li>
      <li>Jumlah listing dan toko (sinyal persaingan).</li>
      <li>Skor kelayakan dan analisis per produk (Deep Dive).</li>
      <li>Sebaran kota penjual dan produk paling banyak diulas.</li>
    </ul>
    <p>Semua ini tersedia gratis di <a href="/riset/">LarisID</a> — tanpa kartu kredit.</p>

    <h2>Kapan alat BERBAYAR sepadan</h2>
    <ul>
      <li>Kamu butuh cakupan lintas marketplace (mis. Shopee + Tokopedia sekaligus).</li>
      <li>Ekspor data massal ke Excel untuk analisis sendiri.</li>
      <li>Volume riset sangat besar setiap hari sebagai bagian dari tim.</li>
    </ul>
    <p>Untuk kebutuhan ini, Datapinter (paket Dasar Rp 299.000/bulan) atau Tokpee (Rp 113.999/bulan) bisa cocok. Lihat <a href="/perbandingan/larisid-vs-datapinter/">LarisID vs Datapinter</a> dan <a href="/perbandingan/larisid-vs-tokpee/">LarisID vs Tokpee</a>.</p>

    <h2>Cara riset produk Shopee gratis (langkah singkat)</h2>
    <ol>
      <li>Pilih kategori/keyword yang kamu pahami.</li>
      <li>Buka <a href="/riset/">halaman riset keyword</a>: cek harga median, ulasan produk teratas, jumlah toko.</li>
      <li>Hitung margin di harga median (lihat <a href="/panduan/cara-menghitung-margin-dan-hpp/">panduan margin</a>).</li>
      <li>Pastikan persaingan masih bisa dimasuki dengan pembeda yang kamu punya.</li>
    </ol>

    <h2>Putusannya</h2>
    <p>Untuk mayoritas seller pemula dan UMKM, alat <strong>gratis sudah cukup</strong> untuk memutuskan produk dengan percaya diri. Naik ke berbayar hanya kalau kamu butuh multi-marketplace atau ekspor massal. LarisID sengaja membuat tier gratisnya bermakna — "terjual" tetap ditandai sebagai estimasi, tanpa janji "dijamin laku".</p>`,
    faqs: [
      { q: 'Apakah ada riset produk Shopee gratis?', a: 'Ya. LarisID menyediakan riset produk Shopee gratis: harga median, estimasi penjualan, jumlah ulasan dan toko, skor kelayakan, serta analisis per produk. 100% gratis untuk semua pengguna, selamanya — tanpa paket berbayar dan tanpa kartu kredit.' },
      { q: 'Apa bedanya alat riset gratis dan berbayar?', a: 'Alat gratis seperti LarisID sudah mencakup harga, permintaan, persaingan, dan skor kelayakan untuk Shopee. Alat berbayar biasanya menambah cakupan lintas marketplace, ekspor Excel massal, atau volume tim — berguna kalau itu memang kebutuhanmu.' },
      { q: 'Kapan saya perlu alat riset berbayar?', a: 'Kalau kamu butuh data Tokopedia sekaligus, ekspor data massal, atau riset volume sangat besar setiap hari. Untuk memutuskan satu-dua produk sebelum kulakan, alat gratis umumnya sudah cukup.' },
    ],
  },
  {
    slug: 'alternatif-datapinter-gratis',
    title: 'Alternatif Datapinter Gratis untuk Riset Produk Shopee (2026)',
    desc: 'Cari alternatif Datapinter yang gratis? LarisID menawarkan riset produk Shopee sebanding — data listing, tren, kompetitor, skor kelayakan — 100% gratis, tanpa langganan Rp 299.000/bulan.',
    h1: 'Alternatif Datapinter Gratis',
    lead: 'Datapinter alat riset yang solid, tapi paket Dasar-nya Rp 299.000/bulan berat untuk pemula. Ini alternatif yang 100% gratis dan mencakup kebutuhan riset produk Shopee yang sama — plus di mana Datapinter tetap lebih unggul, secara jujur.',
    body: `    <p>Datapinter adalah salah satu alat riset marketplace paling lengkap di Indonesia. Paketnya Rp 99.000&ndash;Rp 2.999.000/bulan bila ditagih bulanan, dengan paket Dasar di <strong>Rp 299.000/bulan</strong> (mereka juga punya paket gratis dengan data terbatas). Kalau kamu pemula atau seller hemat budget, kabar baiknya: sebagian besar yang kamu butuhkan untuk riset produk Shopee bisa didapat gratis sepenuhnya.</p>

    <h2>Alternatif gratis: LarisID</h2>
    <p><a href="/">LarisID</a> menyediakan riset produk Shopee — data listing nyata, tren, analisis kompetitor, skor kelayakan, dan AI kontekstual — <strong>100% gratis, selamanya</strong>, dengan jatah 10 pencarian baru/hari (tidak dibatasi selama masa Beta). Halaman <a href="/riset/">riset pasar per keyword</a> bahkan terbuka tanpa login.</p>

    <h2>Perbandingan singkat</h2>
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th>Aspek</th><th>LarisID</th><th>Datapinter</th></tr></thead>
        <tbody>
          <tr><td>Harga</td><td><strong>Rp 0 — 100% gratis, selamanya</strong></td><td>Rp 99.000&ndash;Rp 2.999.000/bulan (Dasar Rp 299.000/bulan)</td></tr>
          <tr><td>Data listing Shopee nyata</td><td>Ya</td><td>Ya</td></tr>
          <tr><td>Skor kelayakan &amp; Deep Dive</td><td>Ya</td><td>Sebagian</td></tr>
          <tr><td>AI kontekstual</td><td>Ya</td><td>Terbatas</td></tr>
          <tr><td>Cakupan marketplace</td><td>Shopee, TikTok Shop, Tokopedia, Lazada &amp; Blibli</td><td>Lebih luas</td></tr>
        </tbody>
      </table>
    </div>
    <p class="disclaimer">Harga Datapinter adalah perkiraan publik per ${UPDATED_HUMAN} dan bisa berubah — verifikasi di situs resmi mereka.</p>

    <h2>Kapan Datapinter tetap lebih cocok</h2>
    <p>Kalau kamu sudah nyaman membayar langganan dan butuh paket riset marketplace all-in dengan cakupan lebih luas, Datapinter masuk akal. Untuk sebagian besar pemula yang ingin memutuskan produk tanpa komitmen bulanan &mdash; entah jualannya di Shopee, TikTok Shop, Tokopedia, Lazada, atau Blibli &mdash; alternatif gratis sudah cukup.</p>

    <h2>Baca lebih lanjut</h2>
    <p>Perbandingan fitur-ke-fitur lengkap ada di <a href="/perbandingan/larisid-vs-datapinter/">LarisID vs Datapinter</a>, dan daftar semua opsi di <a href="/perbandingan/alat-riset-produk-shopee-terbaik/">alat riset produk Shopee terbaik</a>.</p>`,
    faqs: [
      { q: 'Apa alternatif Datapinter yang gratis?', a: 'LarisID. Ia menyediakan riset produk Shopee yang sebanding — data listing nyata, tren, analisis kompetitor, dan skor kelayakan — 100% gratis untuk semua pengguna dan selamanya, dibanding paket Dasar Datapinter Rp 299.000/bulan. Yang belum ada di LarisID: ekspor data ke Excel dan data listing Tokopedia.' },
      { q: 'Apakah alternatif gratis sebagus Datapinter?', a: 'Untuk riset produk Shopee (harga, permintaan, persaingan, kelayakan), LarisID mencakup kebutuhan inti secara gratis. Datapinter tetap unggul jika kamu butuh cakupan marketplace yang lebih luas dari Shopee dan paket langganan all-in.' },
      { q: 'Kenapa LarisID gratis sementara Datapinter berbayar?', a: 'LarisID menjalankan misi akses untuk semua seller: tier gratis yang bermakna dengan batas harian yang jujur, bukan jebakan berbayar. "Terjual" tetap ditandai sebagai estimasi dan tidak ada janji "dijamin laku".' },
    ],
  },
  {
    slug: 'alternatif-kalodata-gratis',
    title: 'Alternatif Kalodata Gratis untuk Riset Produk TikTok Shop (2026)',
    desc: 'Cari alternatif Kalodata yang gratis? Ini yang bisa dan tidak bisa digantikan tanpa biaya — LarisID gratis untuk memilih produk dan menghitung margin TikTok Shop, plus kapan Kalodata tetap sepadan.',
    h1: 'Alternatif Kalodata Gratis',
    lead: 'Kalodata berlangganan sekitar $49,99-109,99 per bulan (kira-kira Rp 800.000-1.760.000) dan tidak punya paket gratis. Sebelum membayar, pahami dulu bagian mana yang benar-benar bisa kamu gantikan gratis — dan bagian mana yang tidak.',
    body: `    <p>Kalodata adalah alat analitik <strong>TikTok Shop</strong> dengan pangsa pasar terbesar: omzet (GMV) per toko dan per produk, performa kreator afiliasi, serta pembedahan video dan live. Paket Starter sekitar <strong>$49,99/bulan</strong> dan Professional sekitar <strong>$109,99/bulan</strong>, tanpa paket gratis permanen.</p>

    <p>Jawaban jujurnya: <strong>tidak semua bagian Kalodata punya pengganti gratis.</strong> Mari pisahkan dua kebutuhan yang sering tercampur.</p>

    <h2>Yang BISA kamu dapat gratis</h2>
    <p>Kalau yang kamu butuhkan adalah <em>memutuskan produk apa yang layak dijual dan apakah masih untung</em>, itu bisa gratis sepenuhnya di <a href="/">LarisID</a>:</p>
    <ul>
      <li><strong>Permintaan produk nyata</strong> — harga median, rentang harga, jumlah ulasan dan toko pesaing per keyword.</li>
      <li><strong>Skor kelayakan 0-100</strong> dan analisa mendalam per produk (tren, kompetitor, keyword).</li>
      <li><strong>Kalkulator komisi &amp; margin untuk 5 marketplace</strong> — Shopee, TikTok Shop, Tokopedia, Lazada, Blibli — dengan tarif komisi per kategori, jadi kamu tahu dana bersih yang diterima sebelum kulakan.</li>
      <li><strong>Ratusan halaman <a href="/riset/">riset pasar per keyword</a></strong>, terbuka tanpa login.</li>
    </ul>
    <p>Semuanya tersedia 100% gratis, selamanya — tanpa paket berbayar dan tanpa kartu kredit.</p>

    <h2>Yang TIDAK ada gantinya gratis</h2>
    <ul>
      <li><strong>GMV per toko dan produk di TikTok Shop.</strong> Angka omzet TikTok Shop per toko tidak tersedia gratis di mana pun.</li>
      <li><strong>Performa kreator afiliasi.</strong> Kreator mana yang menjual paling banyak, dengan komisi berapa.</li>
      <li><strong>Analitik video &amp; live.</strong> Video atau sesi live mana yang menghasilkan penjualan.</li>
    </ul>
    <p>Kalau strategimu bertumpu pada jalur kreator dan konten TikTok, <strong>Kalodata memang sepadan</strong> dan tidak ada alat gratis yang menyamainya. Kami lebih memilih mengatakannya terus terang daripada menjual harapan.</p>

    <h2>Perbandingan singkat</h2>
    <div class="compare-wrap">
      <table class="compare">
        <thead><tr><th>Kebutuhan</th><th>LarisID (gratis)</th><th>Kalodata (berbayar)</th></tr></thead>
        <tbody>
          <tr><td>Memilih produk yang layak dijual</td><td class="yes">Ya</td><td>Sebagian</td></tr>
          <tr><td>Hitung margin setelah komisi TikTok Shop</td><td class="yes">Ya</td><td>Tidak</td></tr>
          <tr><td>Skor kelayakan produk</td><td class="yes">Ya (0-100)</td><td>Tidak</td></tr>
          <tr><td>GMV toko &amp; produk TikTok Shop</td><td>Tidak</td><td class="yes">Ya</td></tr>
          <tr><td>Data kreator, video &amp; live</td><td>Tidak</td><td class="yes">Ya</td></tr>
          <tr><td>Harga</td><td><strong>Rp 0</strong></td><td>~$49,99-109,99/bulan</td></tr>
        </tbody>
      </table>
    </div>
    <p class="disclaimer">Harga Kalodata adalah perkiraan publik per ${UPDATED_HUMAN}, ditagih dalam USD dan bisa berubah — verifikasi di situs resmi mereka.</p>

    <h2>Cara mulai gratis hari ini</h2>
    <ol>
      <li>Buka <a href="/">LarisID</a> dan tulis rencana jualanmu dengan bahasa biasa.</li>
      <li>Bandingkan kandidat produk lewat harga median, jumlah ulasan, dan jumlah pesaing.</li>
      <li>Hitung untungnya di kalkulator komisi untuk marketplace yang kamu pakai.</li>
      <li>Kalau nanti kamu serius menggarap kreator TikTok, baru pertimbangkan Kalodata.</li>
    </ol>

    <h2>Baca lebih lanjut</h2>
    <p>Perbandingan fitur-ke-fitur lengkap ada di <a href="/perbandingan/larisid-vs-kalodata/">LarisID vs Kalodata</a>.</p>`,
    faqs: [
      { q: 'Apa alternatif Kalodata yang gratis?', a: 'Untuk memilih produk yang layak dijual dan menghitung margin setelah komisi TikTok Shop, LarisID melakukannya 100% gratis, selamanya, tanpa paket berbayar. Untuk data GMV toko, kreator, dan video TikTok Shop, belum ada alternatif gratis yang setara dengan Kalodata.' },
      { q: 'Apakah Kalodata punya versi gratis?', a: 'Tidak ada paket gratis permanen — hanya trial terbatas. Paket berbayarnya diperkirakan mulai sekitar $49,99/bulan untuk Starter dan $109,99/bulan untuk Professional. Verifikasi harga terbaru di situs resmi Kalodata.' },
      { q: 'Apakah saya tetap butuh Kalodata kalau sudah pakai LarisID?', a: 'Kalau kamu menjual lewat kreator afiliasi dan konten TikTok, ya — Kalodata memberi data GMV dan kreator yang tidak dimiliki LarisID. Kalau kamu masih pada tahap memilih produk dan memastikan margin, LarisID gratis sudah menutup kebutuhan itu.' },
    ],
  },
];

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
for (const c of COMPETITORS) {
  const dir = path.join(OUT, c.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), competitorPage(c));
  console.log('wrote perbandingan/' + c.slug);
}
const listSlug = 'alat-riset-produk-shopee-terbaik';
fs.mkdirSync(path.join(OUT, listSlug), { recursive: true });
fs.writeFileSync(path.join(OUT, listSlug, 'index.html'), listiclePage());
console.log('wrote perbandingan/' + listSlug);
for (const p of ANGLE_PAGES) {
  fs.mkdirSync(path.join(OUT, p.slug), { recursive: true });
  fs.writeFileSync(path.join(OUT, p.slug, 'index.html'), anglePage(p));
  console.log('wrote perbandingan/' + p.slug);
}
console.log('Done: comparison pages built.');
