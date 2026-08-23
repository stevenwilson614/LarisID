#!/usr/bin/env node
/**
 * Builds the /panduan/ (guides) section: evergreen, top-of-funnel educational articles
 * that rank for "cara ..." queries and are highly citable by AI. Each page ships
 * Article + FAQPage + BreadcrumbList JSON-LD, og/twitter tags, and author (E-E-A-T).
 *
 * Bodies are hand-written (honest, MISSION-aligned); this generator only wraps them
 * in consistent head/header/footer/schema. Run: node scripts/build-guides.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYTICS } from './lib/analytics-head.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'panduan');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;
const AUTHOR = 'Steven Wilson';

// Google Ads tag — lives on the section hub pages (parity with the committed
// hubs; injected here so regenerating the hub does not strip conversion tracking).
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

function nav(active) {
  const link = (href, label) => `<a href="${href}"${active === href ? ' class="active"' : ''}>${label}</a>`;
  return `<nav class="site-nav">
    <a href="/riset/">Riset Pasar</a>
    ${link('/panduan/', 'Panduan')}
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/perbandingan/">Perbandingan</a>
    <a href="/harga/">Harga</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

function articlePage(g) {
  const url = `${SITE}/panduan/${g.slug}/`;
  const faqLd = g.faqs?.length ? [{
    '@type': 'FAQPage',
    mainEntity: g.faqs.map((f) => ({ '@type': 'Question', name: jt(f.q), acceptedAnswer: { '@type': 'Answer', text: jt(f.a) } })),
  }] : [];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Panduan', item: `${SITE}/panduan/` },
          { '@type': 'ListItem', position: 3, name: g.h1, item: url },
        ],
      },
      g.howto ? {
        '@type': 'HowTo',
        name: jt(g.howto.name),
        description: jt(g.howto.description),
        inLanguage: 'id',
        step: g.howto.step.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: jt(s.name), text: jt(s.text) })),
      } : {
        '@type': 'Article',
        headline: jt(g.title),
        description: jt(g.desc),
        inLanguage: 'id',
        datePublished: g.datePublished,
        dateModified: g.dateModified,
        image: OG_IMAGE,
        mainEntityOfPage: url,
        author: { '@type': 'Person', name: AUTHOR, url: `${SITE}/tentang/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } },
      },
      ...faqLd,
    ],
  };
  const faqHtml = g.faqs?.length ? `  <div class="card">
    <h2>Pertanyaan umum</h2>
${g.faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${f.a}</p>
    </div>`).join('\n')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${ANALYTICS}
<title>${esc(g.title)}</title>
<meta name="description" content="${esc(g.desc)}">
<meta name="robots" content="index, follow">
<meta name="author" content="${esc(AUTHOR)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(g.title)}">
<meta property="og:description" content="${esc(g.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta property="article:author" content="${esc(AUTHOR)}">
<meta property="article:modified_time" content="${g.dateModified}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(g.title)}">
<meta name="twitter:description" content="${esc(g.desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/png" href="/images/brand/appicon-red.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.png" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav('/panduan/')}
</header>
<main>
  <p class="cat-pill">Panduan Seller</p>
  <h1>${esc(g.h1)}</h1>
  <p class="lead">${g.lead}</p>
  <p class="updated">Oleh ${esc(AUTHOR)} \u00b7 diperbarui ${g.updatedHuman} \u00b7 <a href="/cara-kerja/">metodologi data</a></p>

  <article>
${g.body}
    <div class="cta-row">
      <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
      <a class="btn-secondary" href="/riset/">Lihat data pasar Shopee</a>
      <a class="btn-secondary" href="/panduan/">Panduan lainnya</a>
    </div>
  </article>

${faqHtml}
</main>
<footer class="site-footer">
  \u00a9 2026 LarisID \u00b7
  <a href="/">Beranda</a>
  <a href="/panduan/">Panduan</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

function hubPage(guides) {
  const url = `${SITE}/panduan/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Panduan', item: url },
      ] },
      { '@type': 'CollectionPage', name: 'Panduan Riset & Bisnis Shopee \u2014 LarisID', url,
        description: jt('Panduan praktis dan jujur untuk seller Shopee Indonesia: riset produk, hitung margin, analisis kompetitor.') },
      { '@type': 'ItemList', itemListElement: guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/panduan/${g.slug}/`, name: jt(g.h1) })) },
    ],
  };
  const cards = guides.map((g) => `    <a class="riset-card" href="/panduan/${g.slug}/"><span class="rk">${esc(g.h1)}</span><span class="rm">${esc(g.cardNote)}</span></a>`).join('\n');
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${ANALYTICS}
<title>Panduan Riset &amp; Bisnis Marketplace untuk Seller Indonesia | LarisID</title>
<meta name="description" content="Panduan praktis &amp; jujur untuk seller Shopee, TikTok Shop, Tokopedia, Lazada &amp; Blibli: cara riset produk, menghitung margin/HPP, dan menganalisis kompetitor. Gratis dari LarisID.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="Panduan Riset & Bisnis Shopee \u2014 LarisID">
<meta property="og:description" content="Cara riset produk, hitung margin, dan analisis kompetitor di Shopee \u2014 panduan jujur untuk seller Indonesia.">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/png" href="/images/brand/appicon-red.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.png" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav('/panduan/')}
</header>
<main class="wide">
  <h1>Panduan Riset &amp; Bisnis Marketplace</h1>
  <p class="lead">Panduan praktis dan jujur untuk seller Indonesia di Shopee, TikTok Shop, Tokopedia, Lazada, dan Blibli \u2014 dari riset produk sampai hitung untung. Dipadukan dengan <a href="/riset/">data pasar nyata</a> supaya keputusanmu berbasis angka, bukan feeling.</p>
  <div class="riset-grid">
${cards}
  </div>
  <div class="cta-row">
    <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
    <a class="btn-secondary" href="/riset/">Lihat data pasar Shopee</a>
  </div>
</main>
<footer class="site-footer">
  \u00a9 2026 LarisID \u00b7
  <a href="/">Beranda</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/harga/">Harga</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

// ---------- guide content (hand-written) ----------
const GUIDES = [
  {
    slug: 'produk-terlaris-untuk-pemula-2026',
    title: 'Produk Terlaris untuk Pemula 2026: 8 Kategori + Bukti Data Shopee',
    desc: '8 kategori produk terlaris untuk pemula 2026 dengan bukti nyata dari listing Shopee — harga, rating, dan puluhan ribu ulasan. Plus cara memilih niche yang belum sesak.',
    h1: 'Produk Terlaris untuk Pemula 2026 (dengan Bukti Data)',
    cardNote: '8 kategori modal kecil + bukti ulasan nyata & cara masuk niche',
    lead: 'Produk terlaris untuk pemula bukan yang paling viral, tapi yang punya <strong>permintaan terbukti</strong> dan <strong>modal terjangkau</strong>. Berikut 8 kategori dengan bukti nyata dari listing Shopee — harga, rating, dan jumlah ulasan — plus cara memilih titik masuk yang belum sesak.',
    datePublished: '2026-07-24', dateModified: '2026-07-24', updatedHuman: '24 Juli 2026',
    body: `    <div class="summary-box">
      <p>Untuk pemula di 2026, kategori dengan permintaan paling <strong>terbukti</strong> di Shopee Indonesia adalah <strong>skincare, makanan hewan peliharaan, aksesoris fashion (jam tangan), aksesoris HP (kabel data), kerajinan/hobi, perlengkapan pesta, alat tulis sekolah, dan pertanian/berkebun</strong> — semuanya bermodal di bawah Rp 50.000 per unit, dengan produk teratas yang mengumpulkan puluhan sampai ratusan ribu ulasan nyata. Kuncinya: jangan meniru produk terlaris, tapi masuk ke <strong>niche yang lebih spesifik</strong> di dalam kategori itu.</p>
    </div>

    <p>Daftar "produk laris" yang beredar biasanya sekadar tebakan atau daftar barang viral yang pasarnya sudah penuh. Halaman ini berbeda: setiap kategori di bawah dipilih dari <strong>listing Shopee nyata</strong> dan disertai <strong>bukti permintaan</strong> yang bisa kamu cek sendiri — jumlah ulasan pada produk teratasnya.</p>

    <div class="disclaimer">
      <p><strong>Cara membaca data ini (penting).</strong> <strong>Harga, rating, dan jumlah ulasan</strong> di tabel adalah data <strong>nyata</strong> dari listing Shopee. Kolom <strong>estimasi omzet/bulan</strong> adalah <strong>estimasi LarisID</strong> (dihitung dari estimasi kecepatan penjualan × harga), <em>bukan data resmi Shopee</em> — angka "terjual" di Shopee sendiri adalah estimasi. Gunakan omzet estimasi untuk membaca skala pasar, bukan angka pasti. Metodologinya kami jelaskan terbuka di <a href="/cara-kerja/">cara kerja</a>.</p>
    </div>

    <h2>Cara kami memilih 8 kategori ini</h2>
    <p>Bukan berdasarkan feeling atau tren TikTok, tapi tiga syarat yang cocok untuk pemula:</p>
    <ul>
      <li><strong>Permintaan terbukti.</strong> Produk teratas di kategori ini punya <strong>puluhan ribu ulasan</strong>. Ulasan hanya muncul setelah pembelian nyata — ini bukti demand yang paling jujur, jauh lebih jujur daripada angka "terjual".</li>
      <li><strong>Modal terjangkau.</strong> Harga jual di bawah Rp 80.000 (sebagian besar di bawah Rp 50.000), jadi kamu bisa mulai dengan stok kecil untuk uji pasar.</li>
      <li><strong>Mudah dikirim &amp; tahan lama.</strong> Barang kecil, tidak mudah rusak, ongkir ringan — minim risiko untuk pemula.</li>
    </ul>

    <h2>8 kategori produk terlaris untuk pemula 2026</h2>
    <div class="compare-wrap">
    <table class="compare">
      <thead>
        <tr><th>Kategori</th><th>Contoh produk teratas (bukti)</th><th>Harga</th><th>Rating</th><th>Ulasan nyata</th><th>Estimasi omzet/bln*</th><th>Validasi niche</th></tr>
      </thead>
      <tbody>
        <tr><td>Skincare &amp; Kecantikan</td><td class="prod-name">The Originote Hyalucera Moisturizer Gel 50ml</td><td>Rp 42.000</td><td>4,89</td><td>810.254</td><td>±Rp 122 jt</td><td><a href="/riset/roller-wajah-es-batu-silikon/">roller wajah es batu</a></td></tr>
        <tr><td>Hewan Peliharaan</td><td class="prod-name">BOLT Makanan Kucing Kering (dry food)</td><td>Rp 21.000</td><td>4,93</td><td>182.213</td><td>±Rp 100 jt</td><td><a href="/riset/pasir-kucing-wangi-gumpal/">pasir kucing wangi</a></td></tr>
        <tr><td>Aksesoris Fashion</td><td class="prod-name">Jam Tangan Casual Wanita Analog</td><td>Rp 14.500</td><td>4,74</td><td>182.202</td><td>±Rp 36 jt</td><td><a href="/riset/jam-tangan-fashion-wanita/">jam tangan fashion wanita</a></td></tr>
        <tr><td>HP &amp; Gadget</td><td class="prod-name">AMINO Kabel Data 4A Fast Charging</td><td>Rp 17.900</td><td>4,87</td><td>135.597</td><td>±Rp 24 jt</td><td><a href="/riset/kabel-charger-3-in-1-fast-charging/">kabel charger 3-in-1</a></td></tr>
        <tr><td>Kerajinan &amp; Hobi</td><td class="prod-name">SKYE DYE Pewarna Kain / Tie Dye</td><td>Rp 18.599</td><td>4,81</td><td>129.492</td><td>±Rp 51 jt</td><td><a href="/riset/kuas-lukis-set/">kuas lukis set</a></td></tr>
        <tr><td>Pesta &amp; Dekorasi</td><td class="prod-name">Tirai Foil Backdrop Ulang Tahun</td><td>Rp 7.399</td><td>4,86</td><td>62.184</td><td>±Rp 17 jt</td><td><a href="/riset/bunga-palsu-dekorasi-rumah/">bunga palsu dekorasi</a></td></tr>
        <tr><td>Sekolah &amp; ATK</td><td class="prod-name">Sampul Buku Stiker PVC (10 lembar)</td><td>Rp 14.490</td><td>4,93</td><td>56.278</td><td>±Rp 23 jt</td><td><a href="/riset/cover-buku-transparan/">cover buku transparan</a></td></tr>
        <tr><td>Pertanian &amp; Berkebun</td><td class="prod-name">Pupuk NPK Mutiara 16-16-16 1Kg</td><td>Rp 37.500</td><td>4,90</td><td>53.498</td><td>±Rp 83 jt</td><td><a href="/riset/alat-siram-tanaman-kecil/">alat siram tanaman</a></td></tr>
      </tbody>
    </table>
    </div>
    <p class="muted">*Estimasi omzet/bulan adalah perkiraan LarisID dari satu listing teratas (estimasi kecepatan penjualan × harga), bukan data resmi Shopee. Harga, rating, dan jumlah ulasan adalah data listing nyata per Juli 2026.</p>

    <h2>Jangan tiru produk terlaris — masuk lewat niche-nya</h2>
    <p>The Originote punya 810 ribu ulasan; sebagai pemula kamu tidak akan menang head-to-head melawan brand sebesar itu. Angka-angka di atas fungsinya <strong>membuktikan kategorinya punya permintaan besar</strong> — bukan mengajak kamu jual barang yang sama. Strategi yang benar: pilih <strong>sub-niche yang lebih spesifik</strong> di dalam kategori yang sudah terbukti, tempat persaingannya belum sesak. Itu sebabnya kolom "validasi niche" mengarah ke halaman <a href="/riset/">riset pasar</a> untuk keyword yang lebih sempit — di sana kamu bisa lihat harga median, jumlah toko, dan estimasi penjualan sebelum keluar modal.</p>

    <h2>Produk laris ini tersebar di kota mana?</h2>
    <p>Permintaan Shopee tidak merata — penjual dan pembeli terkuat sering terkonsentrasi di kota tertentu. Contoh dari data di atas: penjual skincare teratas berbasis di <a href="/kota/kab-bogor/">Kab. Bogor</a>, makanan kucing di <a href="/kota/jakarta-selatan/">Jakarta Selatan</a>, jam tangan fashion di <a href="/kota/tangerang/">Tangerang</a>, dan kerajinan tie-dye di <a href="/kota/kab-bandung/">Kab. Bandung</a>. Kalau kamu ingin tahu <strong>produk apa yang paling laris di kotamu sendiri</strong>, LarisID punya halaman data penjual per kota untuk 100 kota/kabupaten di Pulau Jawa — mulai dari <a href="/kota/bandung/">Bandung</a>, <a href="/kota/surabaya/">Surabaya</a>, sampai <a href="/kota/bekasi/">Bekasi</a>. Lihat semuanya di <a href="/kota/">data produk terlaris per kota</a>.</p>

    <h2>Hitung untung sebelum kulakan</h2>
    <p>"Laris" tidak otomatis "untung". Sebelum ambil salah satu kategori di atas, pastikan marginnya sehat setelah dipotong biaya Shopee. Pakai dua alat gratis ini:</p>
    <ul>
      <li><strong><a href="/kalkulator/margin-hpp/">Kalkulator Margin &amp; HPP</a></strong> — masukkan modal dan harga jual, langsung tahu laba per unit, margin %, dan titik impas (BEP).</li>
      <li><strong><a href="/kalkulator/biaya-shopee/">Kalkulator Biaya Shopee</a></strong> — hitung potongan biaya admin/layanan Shopee supaya kamu tahu berapa yang benar-benar kamu terima.</li>
    </ul>
    <p>Kalau ingin memahami komponennya lebih dalam, baca <a href="/panduan/cara-menghitung-margin-dan-hpp/">cara menghitung margin &amp; HPP</a> dan <a href="/panduan/cara-riset-produk-shopee-untuk-pemula/">cara riset produk Shopee untuk pemula</a>.</p>`,
    faqs: [
      { q: 'Apa produk yang paling laris untuk pemula di 2026?', a: 'Kategori dengan permintaan paling terbukti untuk pemula bermodal kecil di 2026 adalah <strong>skincare, makanan hewan peliharaan, aksesoris fashion (jam tangan), aksesoris HP (kabel data), kerajinan/hobi, perlengkapan pesta, alat tulis sekolah, dan pertanian/berkebun</strong> — semuanya di bawah Rp 50.000 per unit dengan produk teratas beromzet puluhan ribu ulasan nyata. Bukti datanya ada di <a href="/riset/">halaman riset pasar</a>.' },
      { q: 'Berapa modal untuk mulai jualan produk-produk ini?', a: 'Sebagian besar kategori di atas punya harga jual di bawah Rp 50.000 per unit, jadi kamu bisa mulai dengan stok kecil untuk uji pasar. Hitung dulu HPP dan margin dengan <a href="/kalkulator/margin-hpp/">kalkulator margin</a> sebelum menentukan jumlah kulakan.' },
      { q: 'Apakah aman meniru produk terlaris seperti The Originote?', a: 'Tidak disarankan. Produk dengan ratusan ribu ulasan berarti sudah ada pemain sangat kuat dan perang harga. Gunakan angka itu sebagai bukti bahwa <strong>kategorinya</strong> punya permintaan, lalu masuk lewat sub-niche yang lebih spesifik dan belum sesak — validasi dulu di <a href="/riset/">riset pasar</a>.' },
      { q: 'Angka "terjual" dan omzet di sini dari mana?', a: 'Harga, rating, dan jumlah ulasan adalah data listing Shopee <strong>nyata</strong>. Estimasi omzet adalah perkiraan LarisID (estimasi kecepatan penjualan × harga), <strong>bukan data resmi Shopee</strong> — angka "terjual" Shopee sendiri pun estimasi. Kami jelaskan metodologinya di <a href="/cara-kerja/">cara kerja</a>.' },
    ],
  },
  {
    slug: 'cara-riset-produk-shopee-untuk-pemula',
    title: 'Cara Riset Produk Shopee untuk Pemula (Panduan 2026)',
    desc: 'Panduan langkah demi langkah riset produk Shopee untuk pemula: menilai permintaan, harga, margin, dan persaingan dengan data nyata sebelum keluar modal.',
    h1: 'Cara Riset Produk Shopee untuk Pemula',
    cardNote: '5 langkah menilai permintaan, harga & persaingan sebelum kulakan',
    lead: 'Kesalahan paling mahal seller pemula adalah kulakan dulu, riset belakangan. Ini cara membalikkannya \u2014 menilai pasar dengan data sebelum mengeluarkan modal.',
    datePublished: '2026-06-19', dateModified: '2026-06-19', updatedHuman: '19 Juni 2026',
    body: `    <p>Riset produk bukan soal menebak "lagi viral apa", tapi soal memastikan ada <strong>permintaan nyata</strong>, <strong>margin sehat</strong>, dan <strong>persaingan yang masih bisa kamu masuki</strong>. Berikut alurnya.</p>

    <h2>1. Tentukan kategori, bukan satu produk</h2>
    <p>Mulai dari kategori atau keyword yang kamu pahami (mis. perlengkapan dapur, fashion pria, perawatan bayi). Riset di level keyword memberi gambaran pasar yang lebih jujur daripada terpaku pada satu produk yang kebetulan terlihat ramai.</p>

    <h2>2. Ukur permintaan lewat ulasan, bukan cuma "terjual"</h2>
    <p>Angka "terjual" di marketplace adalah <strong>estimasi</strong>, bukan data resmi \u2014 jangan dijadikan patokan tunggal. Sinyal permintaan yang lebih jujur adalah <strong>jumlah ulasan</strong> pada produk teratas: ulasan hanya muncul setelah pembelian nyata. Kalau produk teratas punya puluhan ribu ulasan, permintaan jelas ada.</p>

    <h2>3. Cek rentang harga dan hitung margin</h2>
    <p>Lihat <strong>harga median</strong> dan rentang umum (terendah sampai persentil 90) di keyword itu. Harga median adalah titik aman untuk uji pasar. Lalu hitung margin: harga jual dikurangi HPP (modal, ongkir, packaging, biaya admin marketplace, iklan). Produk "laku" yang marginnya tipis bisa bikin kamu sibuk tapi tidak untung. Pelajari di <a href="/panduan/cara-menghitung-margin-dan-hpp/">cara menghitung margin &amp; HPP</a>.</p>

    <h2>4. Ukur seberapa ketat persaingan</h2>
    <p>Hitung berapa banyak toko yang sudah menjual barang serupa dan seberapa terkonsentrasi penjualannya. Kalau 8 produk teratas menguasai sebagian besar pasar, pendatang baru butuh pembeda kuat (kualitas, bundling, foto, layanan), bukan sekadar ikut harga. Lihat <a href="/panduan/analisis-kompetitor-shopee/">cara analisis kompetitor</a>.</p>

    <h2>5. Validasi dengan data, bukan asumsi</h2>
    <p>Sebelum memutuskan, buka <a href="/riset/">halaman riset pasar LarisID</a> untuk keyword incaranmu: harga median, rentang harga, jumlah listing &amp; toko, rating rata-rata, dan estimasi penjualan \u2014 semuanya dari listing Shopee nyata. Contoh: <a href="/riset/botol-minum-aesthetic-1-liter/">botol minum aesthetic 1 liter</a> atau <a href="/riset/mouse-wireless-silent-click/">mouse wireless silent click</a>.</p>

    <h2>Kesalahan umum yang menghabiskan modal</h2>
    <ul>
      <li><strong>Kejebak "viral".</strong> Saat sebuah produk viral, pasarnya sudah penuh dan harga sudah perang.</li>
      <li><strong>Cuma lihat "terjual".</strong> Itu estimasi; cek juga ulasan, rating, dan margin.</li>
      <li><strong>Ikut harga termurah.</strong> Termurah sering berarti margin negatif atau kualitas seadanya.</li>
      <li><strong>Tidak menghitung biaya tersembunyi.</strong> Admin marketplace, iklan, dan retur menggerus untung.</li>
    </ul>

    <h2>Checklist sebelum kulakan</h2>
    <ul>
      <li>Ada permintaan nyata? (ulasan banyak pada produk teratas)</li>
      <li>Margin di harga median masih sehat setelah semua biaya?</li>
      <li>Persaingan masih bisa dimasuki dengan pembeda yang kamu punya?</li>
      <li>Kamu paham siapa pembelinya dan kenapa mereka memilih produkmu?</li>
    </ul>`,
    faqs: [
      { q: 'Apakah angka "terjual" di Shopee bisa dipercaya?', a: 'Angka terjual adalah <strong>estimasi</strong>, bukan data resmi. Gunakan untuk membaca tren, bukan angka pasti. Sinyal yang lebih jujur adalah jumlah ulasan dan rating kompetitor.' },
      { q: 'Berapa modal minimal untuk mulai jualan di Shopee?', a: 'Tergantung kategori dan harga median produknya. Hitung dulu HPP per unit dan target stok awal kecil untuk uji pasar, lalu skalakan setelah ada bukti permintaan. Riset pasar gratis bisa kamu lakukan dulu tanpa modal di LarisID.' },
      { q: 'Produk dengan rating tinggi berarti pasti laku?', a: 'Tidak otomatis. Rating tinggi berarti ekspektasi pembeli juga tinggi dan biasanya sudah ada pemain kuat. Layak atau tidaknya tetap bergantung pada margin dan pembeda yang kamu tawarkan.' },
    ],
  },
  {
    slug: 'cara-menghitung-margin-dan-hpp',
    title: 'Cara Menghitung Margin & HPP Produk Shopee (dengan Contoh)',
    desc: 'Rumus dan contoh menghitung HPP dan margin produk Shopee \u2014 termasuk biaya admin marketplace, ongkir, packaging, dan iklan \u2014 agar "laku" berarti untung.',
    h1: 'Cara Menghitung Margin & HPP Produk',
    cardNote: 'Rumus + contoh: pastikan "laku" berarti untung, bukan sibuk',
    lead: '"Laku" tidak otomatis "untung". Banyak seller ramai orderan tapi rugi tipis karena lupa menghitung biaya tersembunyi. Ini cara menghitungnya dengan benar.',
    datePublished: '2026-06-19', dateModified: '2026-06-19', updatedHuman: '19 Juni 2026',
    body: `    <h2>Apa itu HPP?</h2>
    <p>HPP (Harga Pokok Penjualan) adalah <strong>total biaya untuk menyiapkan satu produk sampai ke tangan pembeli</strong>. Bukan cuma harga beli dari supplier. Komponennya:</p>
    <ul>
      <li><strong>Modal produk</strong> \u2014 harga beli dari supplier per unit.</li>
      <li><strong>Packaging</strong> \u2014 bubble wrap, kardus, label, lakban.</li>
      <li><strong>Ongkir ke gudang/kamu</strong> (jika ada), dibagi per unit.</li>
      <li><strong>Biaya admin marketplace</strong> \u2014 potongan Shopee (biaya layanan + admin + program gratis ongkir) bisa beberapa persen dari harga jual.</li>
      <li><strong>Iklan</strong> \u2014 jika pakai Shopee Ads, alokasikan biaya per unit terjual.</li>
      <li><strong>Retur &amp; rusak</strong> \u2014 cadangan untuk barang kembali atau cacat.</li>
    </ul>

    <h2>Rumus margin</h2>
    <p>Dua angka yang penting:</p>
    <ul>
      <li><strong>Laba kotor per unit</strong> = Harga jual \u2212 HPP</li>
      <li><strong>Margin (%)</strong> = (Laba kotor \u00f7 Harga jual) \u00d7 100</li>
    </ul>

    <h2>Contoh perhitungan</h2>
    <p>Misal kamu jual produk seharga <strong>Rp 50.000</strong>:</p>
    <ul>
      <li>Modal produk: Rp 25.000</li>
      <li>Packaging: Rp 2.000</li>
      <li>Biaya admin + layanan marketplace (\u00b18%): Rp 4.000</li>
      <li>Alokasi iklan: Rp 3.000</li>
      <li>Cadangan retur/rusak (\u00b12%): Rp 1.000</li>
    </ul>
    <p>HPP = 25.000 + 2.000 + 4.000 + 3.000 + 1.000 = <strong>Rp 35.000</strong>.<br>
    Laba kotor = 50.000 \u2212 35.000 = <strong>Rp 15.000</strong>. Margin = 15.000 \u00f7 50.000 = <strong>30%</strong>.</p>
    <p>Sekarang bayangkan kamu ikut "harga termurah" Rp 38.000 demi menang persaingan: laba kotor cuma Rp 3.000 (margin 8%) \u2014 sekali ada retur atau iklan boros, kamu rugi.</p>

    <h2>Berapa margin yang sehat?</h2>
    <p>Tidak ada angka ajaib, tapi banyak seller menargetkan margin kotor <strong>25\u201340%</strong> agar masih ada ruang untuk iklan, promo, dan retur. Margin di bawah 15% sangat rawan \u2014 satu gangguan kecil bisa membuat rugi.</p>

    <h2>Hubungkan dengan harga pasar</h2>
    <p>Sebelum menetapkan harga jual, cek <strong>harga median pasar</strong> untuk produkmu di <a href="/riset/">halaman riset LarisID</a>. Kalau HPP-mu membuat margin sehat hanya bisa dicapai di atas harga median, kamu perlu pembeda kuat atau supplier yang lebih murah. Jangan memaksakan masuk pasar yang marginnya sudah tertekan.</p>`,
    faqs: [
      { q: 'Apakah biaya admin Shopee termasuk dalam HPP?', a: 'Ya. Potongan marketplace (biaya admin, layanan, dan program gratis ongkir) memotong langsung dari harga jual, jadi wajib dimasukkan ke perhitungan HPP agar margin yang kamu lihat realistis.' },
      { q: 'Berapa margin minimal yang aman untuk jualan online?', a: 'Banyak seller menargetkan margin kotor 25\u201340%. Di bawah 15% sangat rawan karena iklan, promo, dan retur bisa dengan mudah menghapus untung.' },
      { q: 'Bagaimana cara tahu harga jual yang wajar?', a: 'Bandingkan dengan harga median pasar untuk keyword produkmu (tersedia gratis di halaman riset LarisID), lalu pastikan margin di harga itu masih sehat setelah semua biaya.' },
    ],
  },
  {
    slug: 'analisis-kompetitor-shopee',
    title: 'Cara Analisis Kompetitor di Shopee untuk Menemukan Celah Pasar',
    desc: 'Cara menganalisis kompetitor Shopee: membaca harga, rating, jumlah ulasan, konsentrasi pasar, dan menemukan celah yang bisa kamu masuki sebagai seller baru.',
    h1: 'Cara Analisis Kompetitor di Shopee',
    cardNote: 'Baca harga, rating & konsentrasi pasar untuk temukan celah',
    lead: 'Menganalisis kompetitor bukan soal meniru, tapi menemukan celah yang belum mereka isi. Ini cara membacanya dengan data.',
    datePublished: '2026-06-19', dateModified: '2026-06-19', updatedHuman: '19 Juni 2026',
    body: `    <h2>Kenapa analisis kompetitor penting</h2>
    <p>Pasar Shopee untuk produk populer biasanya sudah ramai. Tujuan analisis kompetitor adalah memahami <strong>seberapa kuat pemain lama</strong> dan <strong>di mana celah</strong> yang bisa kamu masuki \u2014 sebelum membuang modal melawan langsung raksasa.</p>

    <h2>Yang perlu kamu lihat dari kompetitor</h2>
    <ul>
      <li><strong>Harga &amp; rentangnya.</strong> Apakah pasar perang harga (rentang sempit di bawah) atau ada ruang premium (rentang lebar)?</li>
      <li><strong>Rating rata-rata.</strong> Rating tinggi = ekspektasi pembeli tinggi; kamu harus minimal setara.</li>
      <li><strong>Jumlah ulasan.</strong> Sinyal permintaan paling jujur; produk dengan ulasan menumpuk sudah punya momentum.</li>
      <li><strong>Foto &amp; deskripsi.</strong> Kualitas konten listing sering jadi pembeda termurah untuk menang.</li>
      <li><strong>Variasi &amp; bundling.</strong> Apakah mereka menawarkan ukuran/paket yang kamu bisa lakukan lebih baik?</li>
    </ul>

    <h2>Baca konsentrasi pasar</h2>
    <p>Perhatikan berapa porsi penjualan yang dikuasai segelintir produk teratas. Kalau <strong>8 produk teratas menguasai lebih dari setengah pasar</strong>, artinya pasar dikuasai sedikit pemain besar \u2014 pendatang baru butuh sudut pembeda yang sangat jelas. Kalau penjualan menyebar, peluang masuk lebih terbuka. LarisID menampilkan angka konsentrasi ini di tiap <a href="/riset/">halaman riset</a>.</p>

    <h2>Menemukan celah</h2>
    <ul>
      <li><strong>Celah kualitas/layanan.</strong> Kalau rating kompetitor banyak yang di bawah 4.7, ada ruang untuk yang bisa menjaga kualitas dan respon cepat.</li>
      <li><strong>Celah harga.</strong> Rentang harga lebar berarti ada segmen (murah atau premium) yang belum tergarap maksimal.</li>
      <li><strong>Celah konten.</strong> Foto buruk dan deskripsi seadanya pada kompetitor = peluang menang lewat listing yang lebih baik.</li>
      <li><strong>Celah geografis.</strong> Kalau penjual terbanyak ada di satu kota, kamu di kota lain bisa menang ongkir untuk pembeli sekitar.</li>
    </ul>

    <h2>Lakukan dengan data, bukan tebakan</h2>
    <p>Buka <a href="/riset/">halaman riset pasar LarisID</a> untuk keyword incaranmu: kamu akan lihat harga median, rentang, jumlah listing &amp; toko, rating rata-rata, produk paling banyak diulas, sebaran kota penjual, dan konsentrasi pasar \u2014 semua dari data nyata. Untuk analisis per produk (tren mingguan, Viability Score), gunakan Deep Dive di LarisID secara gratis.</p>`,
    faqs: [
      { q: 'Berapa kompetitor yang ideal dalam sebuah keyword?', a: 'Tidak ada angka pasti. Yang lebih penting adalah konsentrasi: pasar dengan banyak toko tapi penjualan menyebar lebih mudah dimasuki daripada pasar yang dikuasai segelintir produk teratas.' },
      { q: 'Bagaimana cara menang melawan kompetitor yang sudah besar?', a: 'Jarang menang dengan adu harga. Cari celah: kualitas dan layanan (kalau rating mereka rendah), konten listing yang lebih baik, bundling, atau keunggulan ongkir berdasarkan lokasi.' },
      { q: 'Apa metrik kompetitor yang paling jujur?', a: 'Jumlah ulasan dan rating rata-rata. Ulasan hanya muncul dari pembelian nyata, sementara angka "terjual" hanyalah estimasi.' },
    ],
  },
  {
    "slug": "produk-laris-shopee",
    "title": "Produk yang Laris di Shopee 2026: Cara Menemukannya dengan Data",
    "desc": "Cara menemukan produk yang laris di Shopee 2026 pakai data nyata — bukan sekadar ikut tren viral. Baca permintaan, margin, dan persaingan sebelum kulakan.",
    "h1": "Produk yang Laris di Shopee 2026: Cara Menemukannya",
    "cardNote": "Cara menemukan produk laris & untung dengan data — bukan ikut viral",
    "lead": "Setiap orang mencari \"daftar produk terlaris\". Masalahnya, begitu sebuah produk masuk daftar viral, pasarnya sudah penuh. Panduan ini soal cara <strong>menemukan sendiri</strong> produk yang laris <em>dan</em> masih menguntungkan — pakai data, bukan tebakan.",
    "datePublished": "2026-07-07",
    "dateModified": "2026-07-07",
    "updatedHuman": "7 Juli 2026",
    "body": "    <p>\"Produk apa yang lagi laris di Shopee?\" adalah pertanyaan yang salah kalau berhenti di situ. Produk yang laris untuk toko besar dengan budget iklan puluhan juta belum tentu laris — apalagi untung — untuk toko baru. Pertanyaan yang benar: <strong>di keyword mana ada permintaan nyata, margin masih sehat, dan persaingan masih bisa saya masuki?</strong></p>\n\n    <h2>Kenapa \"ikut yang viral\" hampir selalu telat</h2>\n    <p>Siklusnya selalu sama: sebuah produk mulai ramai → muncul di konten TikTok/daftar \"produk terlaris\" → ribuan seller ikut kulakan → harga perang → margin habis. Saat kamu membaca daftar itu, kamu masuk di titik paling tidak menguntungkan. Yang menang bukan yang ikut paling ramai, tapi yang menemukan permintaan <strong>sebelum</strong> semua orang.</p>\n\n    <h2>4 sinyal bahwa sebuah produk benar-benar laris</h2>\n    <h3>1. Ulasan banyak, bukan cuma \"terjual\" tinggi</h3>\n    <p>Angka \"terjual\" di Shopee adalah <strong>estimasi</strong>, bukan data resmi. Sinyal yang lebih jujur adalah <strong>jumlah ulasan</strong> pada produk-produk teratas — ulasan hanya muncul setelah ada pembelian nyata. Kalau produk teratas di sebuah keyword punya puluhan ribu ulasan, permintaan jelas ada dan konsisten.</p>\n    <h3>2. Permintaan tersebar, bukan cuma di 1–2 toko</h3>\n    <p>Kalau penjualan sebuah keyword hanya dikuasai satu-dua toko raksasa, itu bukan pasar yang mudah dimasuki — mereka sudah mengunci harga dan kepercayaan. Pasar yang sehat untuk pemain baru punya <strong>banyak toko yang sama-sama berhasil jualan</strong>.</p>\n    <h3>3. Margin masih sehat di harga median</h3>\n    <p>Produk boleh laris, tapi kalau harga median-nya sudah perang sampai margin tipis, \"laku\" cuma berarti sibuk tanpa untung. Hitung dulu HPP-mu (modal, ongkir, packaging, admin marketplace, iklan) terhadap harga median. Pelajari di <a href=\"/panduan/cara-menghitung-margin-dan-hpp/\">cara menghitung margin &amp; HPP</a>.</p>\n    <h3>4. Permintaan stabil, bukan lonjakan sesaat</h3>\n    <p>Produk musiman atau hype sesaat bisa terlihat laris minggu ini dan mati bulan depan. Permintaan yang bisa diandalkan adalah yang stabil dari waktu ke waktu — lebih membosankan, tapi lebih aman untuk stok dan modal.</p>\n\n    <h2>Kategori yang konsisten kuat di marketplace Indonesia</h2>\n    <p>Alih-alih daftar produk spesifik yang cepat basi, mulai dari kategori yang permintaannya terbukti tahan lama, lalu turunkan ke keyword spesifik:</p>\n    <ul>\n      <li><strong>Kebutuhan rumah tangga &amp; dapur</strong> — dibeli berulang, permintaan stabil sepanjang tahun.</li>\n      <li><strong>Fashion &amp; aksesoris sehari-hari</strong> — volume besar, tapi persaingan ketat; menang di foto, ukuran, dan niche.</li>\n      <li><strong>Perawatan diri &amp; kecantikan</strong> — margin bisa bagus; hati-hati kategori yang butuh izin BPOM.</li>\n      <li><strong>Perlengkapan bayi &amp; ibu</strong> — pembeli loyal dan tidak terlalu sensitif harga jika percaya kualitas.</li>\n      <li><strong>Aksesoris HP &amp; gadget kecil</strong> — pembelian impulsif, cocok untuk uji pasar modal kecil.</li>\n      <li><strong>Hobi &amp; perlengkapan olahraga</strong> — niche dengan pembeli yang paham nilai, persaingan harga lebih longgar.</li>\n    </ul>\n    <p>Kategori hanya titik awal. Yang menentukan tetap keyword spesifik di dalamnya — dan itu harus divalidasi dengan data.</p>\n\n    <h2>Cara memvalidasi dengan data (gratis)</h2>\n    <p>Setelah punya kandidat keyword, buka <a href=\"/riset/\">halaman riset pasar LarisID</a> dan cek angkanya: harga median, rentang harga, jumlah listing &amp; toko, rating rata-rata, dan estimasi penjualan — semuanya dari listing Shopee nyata, bukan tebakan. <a href=\"/\">Viability Score 0–100</a> merangkum seberapa mudah pasar itu dimasuki. Contoh halaman riset: <a href=\"/riset/botol-minum-aesthetic-1-liter/\">botol minum aesthetic 1 liter</a> atau <a href=\"/riset/tray-dapur-plastik-serbaguna/\">tray dapur plastik serbaguna</a>.</p>\n    <p>Alurnya lengkap ada di <a href=\"/panduan/cara-riset-produk-shopee-untuk-pemula/\">cara riset produk Shopee untuk pemula</a>.</p>\n\n    <h2>Kesalahan yang bikin modal habis</h2>\n    <ul>\n      <li><strong>Ikut daftar \"produk terlaris\" mentah-mentah.</strong> Saat kamu baca, pasarnya sudah penuh.</li>\n      <li><strong>Percaya angka \"terjual\" saja.</strong> Itu estimasi — silang-cek dengan ulasan dan rating.</li>\n      <li><strong>Mengejar harga termurah.</strong> Termurah sering berarti margin negatif atau kualitas seadanya.</li>\n      <li><strong>Lupa biaya tersembunyi.</strong> Admin marketplace, iklan, dan retur menggerus untung yang kelihatannya besar.</li>\n    </ul>",
    "faqs": [
      {
        "q": "Apa produk yang paling laris di Shopee sekarang?",
        "a": "Tidak ada satu daftar \"produk terlaris\" yang berlaku untuk semua seller. Yang laris untuk toko besar dengan modal iklan besar belum tentu menguntungkan untukmu. Yang perlu kamu cari adalah keyword dengan permintaan nyata, margin sehat di harga median, dan persaingan yang masih bisa dimasuki — ini bisa berbeda tiap kategori dan tiap bulan."
      },
      {
        "q": "Apakah ikut produk viral itu strategi yang bagus?",
        "a": "Biasanya tidak. Saat sebuah produk sudah viral, pasarnya sudah penuh, harga sudah perang, dan margin sudah tipis. Pendatang baru masuk di titik paling tidak menguntungkan. Lebih aman menemukan permintaan yang stabil sebelum ramai daripada ikut saat sudah puncak."
      },
      {
        "q": "Bagaimana cara tahu sebuah produk benar-benar laris, bukan cuma kelihatan ramai?",
        "a": "Cek jumlah ulasan pada produk teratas (ulasan hanya muncul setelah pembelian nyata), bukan hanya angka \"terjual\" yang merupakan estimasi. Lalu lihat berapa banyak toko yang berhasil menjual produk serupa — kalau hanya 1–2 toko yang menguasai, itu bukan pasar yang mudah dimasuki."
      }
    ]
  },
  {
    "slug": "ide-jualan-online-modal-kecil",
    "title": "Ide Jualan Online Modal Kecil untuk Pemula (2026)",
    "desc": "Ide jualan online modal kecil yang realistis untuk pemula: cara pilih produk berisiko rendah, uji pasar tanpa boros stok, dan validasi permintaan pakai data gratis.",
    "h1": "Ide Jualan Online Modal Kecil untuk Pemula",
    "cardNote": "Pilih produk berisiko rendah & uji pasar tanpa boros modal",
    "lead": "Modal kecil bukan halangan — asal dipakai untuk <strong>menguji pasar</strong>, bukan menebak. Panduan ini soal cara memilih produk berisiko rendah dan memvalidasi permintaan sebelum uang habis di stok yang tidak laku.",
    "datePublished": "2026-07-07",
    "dateModified": "2026-07-07",
    "updatedHuman": "7 Juli 2026",
    "body": "    <p>Kesalahan paling umum dengan modal kecil bukan \"salah pilih produk\", tapi <strong>menghabiskan seluruh modal untuk stok sebelum tahu barangnya laku</strong>. Dengan modal terbatas, tujuan pertamamu bukan untung besar — tapi mengumpulkan bukti dengan risiko sekecil mungkin.</p>\n\n    <h2>Prinsip modal kecil: uji dulu, skalakan kemudian</h2>\n    <p>Anggap modal awalmu sebagai \"biaya riset\", bukan \"biaya stok\". Belanjakan sedikit untuk membuktikan sebuah produk laku, baru gandakan setelah ada pesanan nyata. Ini membalik urutan yang biasa bikin pemula rugi: kulakan banyak → baru cari pembeli.</p>\n\n    <h2>Ciri produk yang cocok untuk modal kecil</h2>\n    <ul>\n      <li><strong>Ringan &amp; murah ongkir.</strong> Biaya kirim yang mahal memakan margin dan bikin calon pembeli mundur.</li>\n      <li><strong>Harga satuan terjangkau.</strong> Barang murah = pembelian impulsif, uji pasar lebih cepat dapat data.</li>\n      <li><strong>Tidak mudah rusak / tidak kedaluwarsa.</strong> Mengurangi risiko rugi kalau stok tidak langsung habis.</li>\n      <li><strong>Tidak butuh banyak varian.</strong> Ukuran/warna yang banyak mengunci modal di stok mati.</li>\n      <li><strong>Bukan kategori yang butuh izin khusus</strong> (mis. kosmetik/obat butuh BPOM) kecuali kamu sudah siap mengurusnya.</li>\n    </ul>\n\n    <h2>Kategori ide jualan modal kecil</h2>\n    <p>Gunakan ini sebagai titik awal, lalu validasi keyword spesifiknya dengan data:</p>\n    <ul>\n      <li><strong>Aksesoris HP &amp; gadget kecil</strong> — ringan, murah kirim, pembelian impulsif.</li>\n      <li><strong>Perlengkapan dapur &amp; rumah tangga kecil</strong> — permintaan stabil, dibeli berulang.</li>\n      <li><strong>Aksesoris fashion</strong> (jepit, kaus kaki, tas kecil) — modal per unit rendah.</li>\n      <li><strong>Alat tulis &amp; perlengkapan hobi</strong> — niche dengan pembeli yang loyal.</li>\n      <li><strong>Perlengkapan hewan peliharaan</strong> — pasar tumbuh, pembeli tidak terlalu sensitif harga.</li>\n      <li><strong>Produk digital</strong> (template, e-book, jasa desain) — nyaris tanpa modal stok, margin tinggi.</li>\n    </ul>\n\n    <h2>Dropship, pre-order, atau stok sendiri?</h2>\n    <p>Untuk modal kecil di awal, <strong>dropship atau pre-order</strong> lebih aman karena tidak mengunci uang di stok yang belum tentu laku. Konsekuensinya: margin lebih tipis dan kontrol kualitas/pengiriman lebih rendah. Begitu sebuah produk terbukti laku, beralih ke <strong>stok sendiri</strong> biasanya menaikkan margin dan kecepatan kirim. Perlakukan fase dropship sebagai uji pasar, bukan model akhir.</p>\n\n    <h2>Validasi sebelum keluar modal (gratis)</h2>\n    <p>Sebelum kulakan apa pun, buka <a href=\"/riset/\">halaman riset pasar LarisID</a> untuk keyword incaranmu dan cek: harga median, rentang harga, jumlah listing &amp; toko, rating rata-rata, dan estimasi penjualan — dari listing Shopee nyata. Tiga hal yang wajib kamu pastikan:</p>\n    <ol>\n      <li><strong>Ada permintaan?</strong> Lihat jumlah ulasan pada produk teratas — ulasan hanya muncul setelah pembelian nyata.</li>\n      <li><strong>Margin masih sehat?</strong> Hitung HPP terhadap harga median. Panduan: <a href=\"/panduan/cara-menghitung-margin-dan-hpp/\">cara menghitung margin &amp; HPP</a> dan <a href=\"/panduan/cara-menentukan-harga-jual-produk/\">cara menentukan harga jual</a>.</li>\n      <li><strong>Persaingan bisa dimasuki?</strong> Cek konsentrasi pasar: <a href=\"/panduan/analisis-kompetitor-shopee/\">analisis kompetitor</a>.</li>\n    </ol>\n    <p>Alur riset lengkap ada di <a href=\"/panduan/cara-riset-produk-shopee-untuk-pemula/\">cara riset produk Shopee untuk pemula</a>.</p>\n\n    <h2>Checklist modal kecil</h2>\n    <ul>\n      <li>Modal awal dipakai untuk uji pasar, bukan borong stok.</li>\n      <li>Produk ringan, murah kirim, tidak mudah rusak.</li>\n      <li>Permintaan sudah divalidasi dengan data, bukan asumsi.</li>\n      <li>Margin di harga median masih sehat setelah semua biaya.</li>\n      <li>Rencana skala-up jelas begitu ada bukti penjualan.</li>\n    </ul>",
    "faqs": [
      {
        "q": "Jualan online modal 100 ribu bisa apa?",
        "a": "Modal kecil paling aman dipakai untuk menguji pasar, bukan langsung stok banyak. Pilih produk ringan dan murah kirim (aksesoris, perlengkapan kecil), ambil stok awal sedikit atau pakai sistem pre-order/dropship untuk memvalidasi permintaan dulu, baru skalakan setelah ada bukti penjualan. Riset pasarnya sendiri bisa dilakukan gratis."
      },
      {
        "q": "Lebih baik dropship atau stok sendiri untuk pemula?",
        "a": "Untuk modal kecil, dropship atau pre-order lebih aman di awal karena tidak mengunci modal di stok yang belum tentu laku. Kekurangannya margin lebih tipis dan kontrol kualitas/pengiriman lebih rendah. Begitu sebuah produk terbukti laku, beralih ke stok sendiri biasanya menaikkan margin."
      },
      {
        "q": "Bagaimana cara memilih produk agar modal kecil tidak hangus?",
        "a": "Validasi permintaan sebelum kulakan: cek apakah ada permintaan nyata (jumlah ulasan pada produk teratas), apakah margin masih sehat di harga median, dan apakah persaingan masih bisa dimasuki. Mulai dari stok kecil untuk uji pasar, jangan langsung besar."
      }
    ]
  },
  {
    "slug": "cara-menentukan-harga-jual-produk",
    "title": "Cara Menentukan Harga Jual Produk (dengan Contoh Perhitungan)",
    "desc": "Cara menentukan harga jual produk online yang untung: rumus markup & margin, contoh perhitungan lengkap dengan biaya marketplace, dan cara cek harga median pasar.",
    "h1": "Cara Menentukan Harga Jual Produk",
    "cardNote": "Rumus markup vs margin + contoh hitungan sampai harga median",
    "lead": "Salah menentukan harga bikin dua hal buruk: terlalu murah dan rugi diam-diam, atau terlalu mahal dan tidak ada yang beli. Ini cara menetapkan harga jual yang <strong>untung sekaligus kompetitif</strong> — lengkap dengan contoh hitungan.",
    "datePublished": "2026-07-07",
    "dateModified": "2026-07-07",
    "updatedHuman": "7 Juli 2026",
    "body": "    <p>Menentukan harga bukan menebak \"kira-kira segini\". Ada tiga langkah: hitung HPP lengkap, tetapkan target margin, lalu selaraskan dengan harga median pasar. Kalau ketiganya tidak ketemu, itu sinyal produknya perlu ditekan biayanya atau ditambah nilainya — bukan dipaksa dijual rugi.</p>\n\n    <h2>Langkah 1 — Hitung HPP yang sebenarnya</h2>\n    <p>HPP (Harga Pokok Penjualan) bukan cuma modal barang. Yang sering lupa dihitung pemula: biaya admin marketplace, iklan, dan retur. Jumlahkan <strong>per unit</strong>:</p>\n    <ul>\n      <li>Modal barang / biaya produksi</li>\n      <li>Ongkir masuk (dari supplier ke kamu)</li>\n      <li>Packaging (kardus, bubble wrap, label)</li>\n      <li>Biaya admin &amp; layanan marketplace (persentase per transaksi)</li>\n      <li>Alokasi iklan per unit (budget iklan ÷ perkiraan unit terjual)</li>\n    </ul>\n    <p>Rincian lengkap: <a href=\"/panduan/cara-menghitung-margin-dan-hpp/\">cara menghitung margin &amp; HPP</a>.</p>\n\n    <h2>Langkah 2 — Markup vs margin (jangan tertukar)</h2>\n    <p>Ini kesalahan klasik. <strong>Markup</strong> dihitung dari HPP; <strong>margin</strong> dihitung dari harga jual. Markup 50% ≠ margin 50%.</p>\n    <ul>\n      <li><strong>Rumus markup:</strong> Harga jual = HPP × (1 + markup)</li>\n      <li><strong>Rumus dari target margin:</strong> Harga jual = HPP ÷ (1 − margin)</li>\n    </ul>\n    <p>Kalau kamu mau <strong>margin 30%</strong>, jangan kalikan HPP dengan 1,3 — itu markup 30% yang hanya menghasilkan margin ~23%. Pakai rumus margin: HPP ÷ (1 − 0,3).</p>\n\n    <h2>Contoh perhitungan</h2>\n    <p>Misal kamu jual botol minum. HPP per unit:</p>\n    <ul>\n      <li>Modal barang: Rp 18.000</li>\n      <li>Ongkir masuk (dialokasikan): Rp 1.500</li>\n      <li>Packaging: Rp 1.000</li>\n      <li>Admin marketplace (~5% dari harga jual, estimasi): Rp 1.500</li>\n      <li>Alokasi iklan: Rp 2.000</li>\n    </ul>\n    <p><strong>Total HPP ≈ Rp 24.000.</strong></p>\n    <p>Target margin 30% → Harga jual = 24.000 ÷ (1 − 0,3) = 24.000 ÷ 0,7 ≈ <strong>Rp 34.300</strong>. Bulatkan ke <strong>Rp 34.900</strong> (harga psikologis).</p>\n    <p>Untung per unit ≈ Rp 34.900 − Rp 24.000 = <strong>Rp 10.900</strong> (margin ~31%). Kalau harga median pasar untuk botol serupa ternyata Rp 29.000, harga kamu kemahalan — kamu harus menekan HPP (nego supplier, kurangi iklan) atau menambah nilai (bundling, kualitas, foto) agar layak di harga itu.</p>\n\n    <h2>Langkah 3 — Selaraskan dengan harga median pasar</h2>\n    <p>Harga hasil hitunganmu harus diuji melawan kenyataan pasar. Buka <a href=\"/riset/\">halaman riset pasar LarisID</a> untuk keyword produkmu dan lihat <strong>harga median</strong> serta rentang harga (terendah sampai persentil atas) dari listing Shopee nyata. Harga median adalah titik aman untuk uji pasar:</p>\n    <ul>\n      <li>Harga hitunganmu <strong>di sekitar median</strong> → aman, lanjut.</li>\n      <li>Harga hitunganmu <strong>jauh di atas median</strong> → tekan HPP atau tambah nilai; jangan paksa jual mahal tanpa pembeda.</li>\n      <li>Harga hitunganmu <strong>di bawah median tapi margin sehat</strong> → peluang bagus, tapi pastikan bukan karena kamu lupa suatu biaya.</li>\n    </ul>\n    <p>Contoh halaman riset: <a href=\"/riset/botol-minum-aesthetic-1-liter/\">botol minum aesthetic 1 liter</a>.</p>\n\n    <h2>Kenapa jangan asal ikut termurah</h2>\n    <p>Menjadi yang termurah adalah lomba yang tidak bisa kamu menangkan melawan pemain bermodal besar — mereka bisa menahan margin nol lebih lama. Perang harga menggerus untung semua orang. Lebih baik menargetkan sekitar median dengan <strong>pembeda yang jelas</strong>: foto yang lebih baik, bundling, kualitas, kecepatan kirim, atau layanan. Cara membaca posisi kompetitor: <a href=\"/panduan/analisis-kompetitor-shopee/\">analisis kompetitor Shopee</a>.</p>\n\n    <h2>Checklist sebelum pasang harga</h2>\n    <ul>\n      <li>HPP sudah termasuk admin marketplace, iklan, dan packaging?</li>\n      <li>Pakai rumus margin yang benar (bukan markup yang disamakan dengan margin)?</li>\n      <li>Harga sudah dibandingkan dengan harga median pasar nyata?</li>\n      <li>Kalau di atas median, ada pembeda yang membenarkan harga itu?</li>\n    </ul>",
    "faqs": [
      {
        "q": "Berapa markup yang wajar untuk jualan online?",
        "a": "Tidak ada satu angka yang benar untuk semua produk. Markup wajar bergantung pada kategori, biaya marketplace, dan harga median pasar. Yang penting bukan markup terbesar, tapi harga yang tetap kompetitif di harga median sambil menyisakan margin sehat setelah semua biaya (admin, ongkir, iklan, retur)."
      },
      {
        "q": "Apa bedanya markup dan margin?",
        "a": "Markup dihitung dari HPP (harga jual = HPP + persentase dari HPP), sedangkan margin dihitung dari harga jual (untung dibagi harga jual). Markup 50% tidak sama dengan margin 50%. Contoh: HPP Rp 10.000 dengan markup 50% menghasilkan harga Rp 15.000, tapi marginnya hanya sekitar 33%."
      },
      {
        "q": "Haruskah saya ikut harga termurah di marketplace?",
        "a": "Tidak. Harga termurah sering berarti margin negatif atau kualitas seadanya, dan memicu perang harga yang tidak bisa kamu menangkan melawan pemain bermodal besar. Lebih baik menargetkan sekitar harga median dengan pembeda yang jelas (foto, bundling, kualitas, layanan) daripada jadi yang termurah."
      }
    ],
    "howto": {
      "name": "Cara Menentukan Harga Jual Produk",
      "description": "Langkah menentukan harga jual produk online yang untung: hitung HPP lengkap, tetapkan target margin, dan sesuaikan dengan harga median pasar.",
      "step": [
        {
          "name": "Hitung HPP lengkap",
          "text": "Jumlahkan semua biaya per unit: modal barang, ongkir masuk, packaging, biaya admin marketplace, dan alokasi iklan."
        },
        {
          "name": "Tetapkan target margin",
          "text": "Tentukan margin yang kamu mau (mis. 30%), lalu hitung harga jual dari HPP menggunakan rumus margin."
        },
        {
          "name": "Bandingkan dengan harga median pasar",
          "text": "Cek harga median dan rentang harga di keyword produk itu. Kalau harga hasil hitungan jauh di atas median, cari cara menekan HPP atau tambah nilai, bukan asal ikut termurah."
        }
      ]
    }
  },
  {
    slug: 'cara-jualan-di-shopee-untuk-pemula',
    title: 'Cara Jualan di Shopee untuk Pemula: Panduan Lengkap dari Nol (2026)',
    desc: 'Cara jualan di Shopee untuk pemula dari nol: buka toko, pilih produk yang benar-benar dicari, bikin listing yang menjual, dan hitung untung sebelum kulakan — pakai data, bukan tebakan.',
    h1: 'Cara Jualan di Shopee untuk Pemula (dari Nol)',
    cardNote: 'Dari buka toko sampai produk pertama laku — langkah demi langkah',
    lead: 'Buka toko di Shopee itu gratis dan cuma butuh sekitar 10 menit. Yang menentukan toko kamu bertahan atau tidak bukan cara daftarnya, tapi <strong>keputusan sebelum kulakan</strong>. Ini panduan lengkap dari nol — dengan langkah yang bisa kamu mulai hari ini.',
    datePublished: '2026-07-19', dateModified: '2026-07-19', updatedHuman: '19 Juli 2026',
    howto: {
      name: 'Cara Jualan di Shopee untuk Pemula',
      description: 'Langkah memulai jualan di Shopee dari nol: buka toko, pilih produk berdasarkan permintaan nyata, hitung untung, bikin listing yang menjual, dan kelola pesanan.',
      step: [
        { name: 'Buka toko Shopee', text: 'Daftar akun Shopee, lengkapi profil toko, alamat, dan rekening pencairan. Gratis dan tidak perlu badan usaha untuk mulai.' },
        { name: 'Pilih produk dari permintaan nyata', text: 'Jangan mulai dari "lagi viral apa". Cek permintaan lewat jumlah ulasan produk teratas dan estimasi penjualan di keyword incaranmu, lalu pastikan persaingannya masih bisa dimasuki.' },
        { name: 'Hitung untung sebelum kulakan', text: 'Jumlahkan HPP: modal barang, ongkir masuk, packaging, biaya admin marketplace, dan iklan. Pastikan harga jual di kisaran harga median pasar masih menyisakan margin sehat.' },
        { name: 'Bikin listing yang menjual', text: 'Foto terang dengan latar bersih, judul memuat kata kunci yang dicari orang, deskripsi menjawab keraguan pembeli, dan harga wajar dibanding kompetitor.' },
        { name: 'Kelola pesanan dan kumpulkan ulasan', text: 'Balas chat cepat, kirim tepat waktu, dan minta ulasan dengan sopan. Ulasan awal adalah penghalang terbesar sebelum produk dipercaya pembeli baru.' },
      ],
    },
    body: `    <p>Banyak pemula terjebak mengurus hal yang salah lebih dulu: nama toko, logo, atau ikut-ikutan produk viral. Padahal yang paling menentukan adalah <strong>apakah produkmu benar-benar dicari</strong> dan <strong>apakah masih ada untung</strong> setelah semua biaya. Berikut alurnya dari nol.</p>

    <h2>1. Buka toko Shopee (gratis, ~10 menit)</h2>
    <p>Daftar akun, lengkapi profil toko, alamat pengambilan, dan rekening untuk pencairan dana. Kamu tidak butuh badan usaha atau modal besar untuk mulai. Bagian ini mudah — jangan habiskan energi di sini. Energi terbesarmu harus di langkah memilih produk.</p>

    <h2>2. Pilih produk dari permintaan nyata, bukan tebakan</h2>
    <p>Ini langkah yang paling sering dilewati dan paling mahal kalau salah. Jangan mulai dari "lagi viral apa" — saat sebuah produk viral, pasarnya sudah penuh dan harga sudah perang. Mulai dari kategori yang kamu pahami, lalu ukur permintaannya.</p>
    <p>Angka "terjual" di marketplace adalah <strong>estimasi</strong>, bukan data resmi — jangan dijadikan patokan tunggal. Sinyal yang lebih jujur adalah <strong>jumlah ulasan</strong> pada produk teratas, karena ulasan hanya muncul setelah pembelian nyata. Buka <a href="/riset/">halaman riset pasar LarisID</a> untuk keyword incaranmu: harga median, rentang harga, jumlah toko, rating, dan estimasi penjualan — semuanya dari listing Shopee nyata. Detail langkahnya ada di <a href="/panduan/cara-riset-produk-shopee-untuk-pemula/">cara riset produk Shopee untuk pemula</a>.</p>

    <h2>3. Hitung untung sebelum keluar modal</h2>
    <p>Produk yang "laku" belum tentu bikin untung. Hitung HPP lengkap: modal barang, ongkir masuk, packaging, biaya admin marketplace, dan alokasi iklan. Kalau harga jual di kisaran <strong>harga median pasar</strong> tidak menyisakan margin sehat, cari produk lain atau cara menekan biaya. Panduan lengkap: <a href="/panduan/cara-menghitung-margin-dan-hpp/">cara menghitung margin &amp; HPP</a> dan <a href="/panduan/cara-menentukan-harga-jual-produk/">cara menentukan harga jual</a>.</p>

    <h2>4. Bikin listing yang menjual</h2>
    <ul>
      <li><strong>Foto:</strong> terang, latar bersih, tunjukkan produk dari beberapa sisi. Foto pertama menentukan orang klik atau tidak.</li>
      <li><strong>Judul:</strong> masukkan kata kunci yang benar-benar diketik pembeli (mis. "botol minum aesthetic 1 liter"), bukan istilah internal.</li>
      <li><strong>Deskripsi:</strong> jawab keraguan pembeli — ukuran, bahan, garansi, estimasi pengiriman.</li>
      <li><strong>Harga:</strong> wajar dibanding kompetitor. Termurah bukan selalu menang; sering justru berarti margin negatif.</li>
    </ul>

    <h2>5. Kelola pesanan dan kumpulkan ulasan awal</h2>
    <p>Balas chat cepat, kirim tepat waktu, dan kemas rapi. Minta ulasan dengan sopan setelah barang sampai. <strong>Ulasan awal adalah penghalang terbesar</strong>: produk dengan sedikit ulasan sulit dipercaya pembeli baru, sementara produk pemenang biasanya sudah punya puluhan ulasan. Fokus melewati ~50 ulasan pertama dengan pelayanan yang bikin orang mau mengulas.</p>

    <h2>Kesalahan pemula yang paling menguras modal</h2>
    <ul>
      <li>Kulakan banyak sebelum uji pasar. Mulai stok kecil, validasi, baru skalakan.</li>
      <li>Ikut produk viral saat pasarnya sudah penuh dan harga sudah perang.</li>
      <li>Hanya melihat angka "terjual" (itu estimasi) tanpa cek ulasan, rating, dan margin.</li>
      <li>Tidak menghitung biaya tersembunyi: admin, iklan, retur.</li>
    </ul>

    <h2>Butuh ide produk dulu?</h2>
    <p>Kalau kamu belum tahu mau jual apa, mulai dari <a href="/panduan/ide-jualan-online-modal-kecil/">ide jualan online modal kecil</a> lalu validasi dengan <a href="/panduan/produk-laris-shopee/">cara menemukan produk laris</a>. Semua bisa kamu lakukan gratis sebelum keluar modal.</p>`,
    faqs: [
      { q: 'Apakah jualan di Shopee gratis?', a: 'Ya, membuka toko dan meng-upload produk gratis. Biaya baru muncul saat ada penjualan (biaya admin/komisi marketplace) atau jika kamu memasang iklan. Karena itu penting menghitung biaya-biaya ini sebelum menentukan harga.' },
      { q: 'Berapa modal minimal untuk mulai jualan di Shopee?', a: 'Tergantung produk. Kamu bisa mulai dengan stok kecil untuk uji pasar, atau tanpa stok lewat sistem reseller/dropship. Yang penting HPP per unit dan marginnya sudah kamu hitung sebelum kulakan. Riset pasarnya bisa kamu lakukan gratis dulu di LarisID.' },
      { q: 'Produk apa yang cocok untuk penjual pemula?', a: 'Produk dengan permintaan nyata (banyak ulasan pada produk teratas), margin sehat di harga median, dan persaingan yang masih bisa kamu masuki dengan pembeda. Hindari produk yang sedang viral karena pasarnya biasanya sudah penuh.' },
      { q: 'Berapa lama sampai ada penjualan pertama?', a: 'Bervariasi dan tidak ada jaminan — tergantung produk, listing, harga, dan pelayanan. Fokus pada hal yang bisa kamu kendalikan: pilih produk yang dicari, listing yang jelas, harga wajar, dan pelayanan yang menghasilkan ulasan awal.' },
    ],
  },
  {
    slug: 'cara-cari-supplier-dan-tempat-kulakan',
    title: 'Cara Cari Supplier & Tempat Kulakan Murah untuk Jualan Online (2026)',
    desc: 'Cara cari supplier dan tempat kulakan murah yang aman: bedakan tangan pertama vs reseller, cara cek harga wajar pakai data pasar, dan cara nego tanpa tertipu.',
    h1: 'Cara Cari Supplier & Tempat Kulakan Murah',
    cardNote: 'Tangan pertama vs reseller, cek harga wajar & cara nego aman',
    lead: 'Untung sebuah produk sering ditentukan di harga beli, bukan harga jual. Ini cara menemukan supplier atau tempat kulakan yang <strong>benar-benar murah dan aman</strong> — dan cara tahu harga kulakan itu wajar sebelum ambil stok.',
    datePublished: '2026-07-19', dateModified: '2026-07-19', updatedHuman: '19 Juli 2026',
    body: `    <p>Banyak seller sibuk menaikkan harga jual padahal untung sebenarnya lebih mudah didapat dari <strong>harga beli yang lebih rendah</strong>. Masalahnya, mencari supplier itu rawan: banyak "distributor" yang sebenarnya reseller, dan banyak harga "grosir" yang tidak benar-benar grosir. Berikut cara menyaringnya.</p>

    <h2>1. Bedakan tangan pertama vs reseller berlapis</h2>
    <p>Semakin panjang rantainya (pabrik → distributor → reseller → kamu), semakin tipis marginmu. Ciri tangan pertama: harga turun signifikan saat kuantitas naik, punya varian/stok yang dalam, dan bisa menunjukkan bukti produksi atau keagenan. Kalau harga "grosir" nyaris sama dengan harga eceran marketplace, itu tanda kamu sedang beli dari reseller.</p>

    <h2>2. Tahu dulu harga pasar sebelum nego</h2>
    <p>Nego tanpa data itu menebak. Sebelum menghubungi supplier, cek <strong>harga median dan rentang harga</strong> produk itu di <a href="/riset/">data pasar LarisID</a>. Kalau harga jual median di marketplace Rp 50.000, kamu tahu harga kulakan harus cukup di bawah itu supaya ada ruang untuk biaya admin, iklan, dan margin. Angka ini juga jadi patokan menilai apakah penawaran supplier benar-benar murah.</p>

    <h2>3. Tempat mencari supplier (dan risikonya)</h2>
    <ul>
      <li><strong>Marketplace grosir &amp; menu grosir di marketplace umum:</strong> paling mudah diakses; cek harga per tier kuantitas dan reputasi toko (ulasan, lama berjualan).</li>
      <li><strong>Sentra produksi / pasar induk:</strong> sering paling murah untuk kategori tertentu (fashion, makanan kering, kerajinan), tapi butuh usaha datang dan nego langsung.</li>
      <li><strong>Pameran dagang &amp; komunitas seller:</strong> jalan menemukan produsen langsung dan membangun relasi jangka panjang.</li>
      <li><strong>Supplier luar negeri:</strong> harga satuan bisa murah, tapi hitung ongkir, bea, waktu tunggu, dan risiko kualitas — semuanya masuk HPP.</li>
    </ul>

    <h2>4. Uji dulu sebelum ambil stok besar</h2>
    <p>Pesan sampel atau kuantitas kecil untuk mengecek kualitas, konsistensi, dan kecepatan kirim supplier. Supplier termurah tidak berguna kalau barangnya sering cacat atau telat — itu berujung retur dan rating buruk yang menggerus penjualanmu.</p>

    <h2>5. Hitung total HPP, bukan cuma harga barang</h2>
    <p>Harga kulakan hanyalah satu komponen. Tambahkan ongkir masuk, packaging, biaya admin marketplace, dan iklan untuk tahu untung sebenarnya. Pakai <a href="/panduan/cara-menghitung-margin-dan-hpp/">panduan margin &amp; HPP</a> supaya "murah" benar-benar berarti untung.</p>

    <h2>Tanda supplier yang perlu diwaspadai</h2>
    <ul>
      <li>Minta transfer penuh di muka tanpa rekening bisnis atau reputasi yang bisa dicek.</li>
      <li>Harga jauh di bawah pasar tanpa alasan jelas (bisa barang KW, stok lama, atau penipuan).</li>
      <li>Tidak mau kirim sampel atau tidak bisa menunjukkan stok nyata.</li>
    </ul>`,
    faqs: [
      { q: 'Bagaimana cara tahu harga kulakan sudah benar-benar murah?', a: 'Bandingkan dengan harga median pasar produk itu. Kalau harga jual median di marketplace jauh di atas harga kulakan plus semua biaya (admin, ongkir, iklan), berarti ada ruang margin yang sehat. Data harga median bisa kamu cek gratis di halaman riset pasar LarisID.' },
      { q: 'Lebih baik supplier lokal atau impor?', a: 'Tergantung total HPP dan risiko. Supplier lokal biasanya lebih cepat, mudah retur, dan modal tertahannya kecil. Impor bisa lebih murah per unit tapi tambahkan ongkir, bea, waktu tunggu, dan risiko kualitas ke dalam perhitungan sebelum memutuskan.' },
      { q: 'Bagaimana menghindari supplier tipu-tipu?', a: 'Mulai dari kuantitas kecil atau sampel, cek reputasi dan lama berjualan, hindari yang menolak menunjukkan stok nyata, dan waspadai harga yang jauh di bawah pasar tanpa alasan jelas.' },
    ],
  },
  {
    slug: 'dropship-shopee-cara-kerja-dan-risiko',
    title: 'Dropship Shopee: Cara Kerja, Modal, dan Risiko yang Jujur (2026)',
    desc: 'Dropship Shopee dijelaskan jujur: cara kerja, berapa modal sebenarnya, kenapa marginnya tipis, dan risiko stok/pengiriman — plus cara memvalidasi produk sebelum mulai.',
    h1: 'Dropship Shopee: Cara Kerja & Risiko (Penjelasan Jujur)',
    cardNote: 'Cara kerja, modal sebenarnya, margin & risiko — tanpa hype',
    lead: 'Dropship sering dijual sebagai "jualan tanpa modal, tanpa risiko". Kenyataannya lebih bernuansa. Ini penjelasan jujur soal cara kerjanya, di mana untungnya, dan risiko yang jarang disebut — supaya kamu masuk dengan mata terbuka.',
    datePublished: '2026-07-19', dateModified: '2026-07-19', updatedHuman: '19 Juli 2026',
    body: `    <p>Dropship adalah model di mana kamu menjual produk tanpa menyimpan stok: saat ada pesanan, supplier yang mengemas dan mengirim langsung ke pembeli atas nama tokomu. Menarik karena modal awalnya kecil — tapi "kecil modal" bukan berarti "tanpa risiko". Mari jujur soal keduanya.</p>

    <h2>Cara kerjanya (singkat)</h2>
    <ol>
      <li>Kamu pasang produk supplier di tokomu dengan harga jualmu.</li>
      <li>Pembeli memesan dan membayar ke tokomu.</li>
      <li>Kamu teruskan pesanan ke supplier dan bayar harga kulakan.</li>
      <li>Supplier mengirim langsung ke pembeli; selisih harga jadi marginmu.</li>
    </ol>

    <h2>Kelebihan yang nyata</h2>
    <ul>
      <li><strong>Modal awal kecil:</strong> tidak perlu beli stok di muka.</li>
      <li><strong>Risiko stok mati rendah:</strong> kamu tidak menanggung barang yang tidak laku.</li>
      <li><strong>Bisa uji banyak produk:</strong> cocok untuk memvalidasi permintaan sebelum berkomitmen ke stok sendiri.</li>
    </ul>

    <h2>Risiko yang jarang disebut</h2>
    <ul>
      <li><strong>Margin tipis.</strong> Karena kamu beli satuan (bukan grosir), selisihnya kecil. Setelah biaya admin marketplace dan iklan, untung bersih bisa sangat tipis.</li>
      <li><strong>Kamu menanggung reputasi, supplier mengendalikan mutu.</strong> Kalau supplier telat, salah kirim, atau kemasannya buruk, rating dan komplain jatuh ke tokomu.</li>
      <li><strong>Perang harga.</strong> Produk dropship yang sama dijual banyak orang, mudah saling banting harga.</li>
      <li><strong>Ketergantungan stok supplier.</strong> Kalau supplier kehabisan stok, kamu harus batalkan pesanan — penalti buat toko.</li>
    </ul>

    <h2>Kunci sukses: pilih produk seperti seller serius</h2>
    <p>Modal kecil bukan alasan untuk asal pilih produk. Justru karena marginnya tipis, pemilihan produk harus lebih tajam. Cari produk dengan <strong>permintaan nyata</strong> (banyak ulasan di produk teratas) tapi <strong>persaingan yang belum jenuh</strong>, dan pastikan selisih harga jual median dengan harga kulakan cukup untuk menutup biaya. Cek dulu di <a href="/riset/">data pasar LarisID</a> dan ikuti kerangkanya di <a href="/panduan/cara-riset-produk-shopee-untuk-pemula/">cara riset produk</a>.</p>

    <h2>Dropship vs stok sendiri</h2>
    <p>Banyak seller memakai dropship untuk <strong>menguji</strong> produk mana yang laku, lalu beralih ke <strong>stok sendiri</strong> (kulakan grosir) untuk produk pemenang agar marginnya jauh lebih sehat. Saat siap beralih, baca <a href="/panduan/cara-cari-supplier-dan-tempat-kulakan/">cara cari supplier &amp; tempat kulakan</a>.</p>

    <p>Intinya: dropship adalah alat uji pasar yang bagus dan pintu masuk berisiko-rendah, bukan mesin uang instan. Perlakukan seperti bisnis — hitung angkanya, jaga pelayanan — dan ia bisa jadi langkah pertama yang masuk akal.</p>`,
    faqs: [
      { q: 'Apakah dropship Shopee benar-benar tanpa modal?', a: 'Modal barangnya memang tidak dibayar di muka, tapi tetap ada biaya: iklan agar produkmu terlihat, dan waktu untuk riset serta melayani pembeli. "Tanpa modal" tidak berarti "tanpa usaha" atau "tanpa risiko".' },
      { q: 'Kenapa untung dropship sering tipis?', a: 'Karena kamu membeli satuan (bukan harga grosir), selisih dengan harga jual kecil. Setelah dipotong biaya admin marketplace dan iklan, margin bersihnya bisa sangat tipis. Karena itu pemilihan produk dan harga harus lebih cermat.' },
      { q: 'Lebih baik dropship atau stok sendiri?', a: 'Dropship bagus untuk menguji produk mana yang laku dengan risiko rendah. Setelah menemukan produk pemenang, beralih ke stok sendiri (kulakan grosir) biasanya memberi margin jauh lebih sehat. Banyak seller memakai keduanya secara bertahap.' },
    ],
  },
  {
    slug: 'cara-meningkatkan-penjualan-di-shopee',
    title: 'Cara Meningkatkan Penjualan di Shopee: 7 Cara Berbasis Data (2026)',
    desc: 'Cara meningkatkan penjualan di Shopee tanpa asal bakar iklan: perbaiki listing, harga, dan ulasan, lalu fokus ke produk yang memang naik — berdasarkan data, bukan tebakan.',
    h1: 'Cara Meningkatkan Penjualan di Shopee',
    cardNote: '7 cara menaikkan penjualan tanpa asal bakar iklan',
    lead: 'Kalau penjualan mandek, jawabannya jarang "iklan lebih banyak". Biasanya ada kebocoran di listing, harga, atau pilihan produk. Ini 7 cara menaikkan penjualan yang bisa kamu perbaiki dengan data — sebelum menambah anggaran iklan.',
    datePublished: '2026-07-19', dateModified: '2026-07-19', updatedHuman: '19 Juli 2026',
    body: `    <p>Menambah anggaran iklan di atas listing yang bocor cuma membuang uang lebih cepat. Perbaiki dulu fondasinya. Berikut tujuh cara yang berdampak, dari yang paling murah.</p>

    <h2>1. Perbaiki foto dan judul (klik dulu, baru beli)</h2>
    <p>Kalau orang tidak klik, tidak akan ada penjualan. Foto pertama yang terang dan jelas menaikkan rasio klik. Judul harus memuat <strong>kata kunci yang benar-benar diketik pembeli</strong> — lihat istilah apa yang dipakai di produk-produk teratas keyword-mu.</p>

    <h2>2. Sesuaikan harga dengan data pasar</h2>
    <p>Harga terlalu tinggi mematikan konversi; terlalu rendah membakar margin. Cek <strong>harga median dan rentang harga</strong> keyword-mu di <a href="/riset/">data pasar LarisID</a> dan posisikan harga secara sadar. Panduan: <a href="/panduan/cara-menentukan-harga-jual-produk/">cara menentukan harga jual</a>.</p>

    <h2>3. Kejar ulasan awal</h2>
    <p>Produk dengan sedikit ulasan sulit dipercaya. Ulasan hanya datang dari pembelian nyata, jadi maksimalkan setiap pesanan awal: kemasan rapi, pengiriman cepat, dan permintaan ulasan yang sopan. Melewati ~50 ulasan pertama sering jadi titik balik.</p>

    <h2>4. Tulis deskripsi yang menjawab keraguan</h2>
    <p>Setiap pertanyaan yang tak terjawab adalah calon pembeli yang pergi. Cantumkan ukuran, bahan, cara pakai, garansi, dan estimasi pengiriman. Deskripsi yang lengkap juga mengurangi komplain dan retur.</p>

    <h2>5. Pelajari kompetitor untuk temukan celah</h2>
    <p>Lihat apa yang sudah dilakukan pemain teratas — dan apa yang belum. Rating mereka rendah? Menang di layanan. Foto mereka seadanya? Menang di konten. Baca <a href="/panduan/analisis-kompetitor-shopee/">cara analisis kompetitor Shopee</a>.</p>

    <h2>6. Fokus ke produk yang memang sedang naik</h2>
    <p>Sebagian penjualan datang dari memilih arus yang benar. Produk yang <strong>sedang naik</strong> lebih mudah didorong daripada yang sudah jenuh. Gunakan sinyal tren dari data untuk menaruh energi di produk yang momentumnya sedang bagus — dan pertimbangkan menambah varian di sekitar produk pemenangmu.</p>

    <h2>7. Baru pasang iklan setelah fondasi benar</h2>
    <p>Iklan memperbesar apa pun yang sudah ada. Kalau listing dan harga sudah kuat, iklan mempercepat penjualan. Kalau belum, iklan hanya mempercepat kerugian. Mulai kecil, ukur, dan naikkan hanya pada produk yang sudah terbukti konversinya.</p>

    <h2>Catatan jujur</h2>
    <p>Tidak ada trik yang menjamin penjualan naik — pasar berubah dan keputusan akhir tetap di tanganmu. Yang bisa kamu kendalikan adalah kualitas listing, kewajaran harga, pelayanan, dan pemilihan produk berbasis data. Perbaiki itu dulu, konsisten, dan ukur hasilnya.</p>`,
    faqs: [
      { q: 'Kenapa produk saya tidak laku padahal sudah pasang iklan?', a: 'Iklan memperbesar listing yang sudah ada. Kalau foto, judul, harga, atau ulasan masih lemah, iklan hanya mendatangkan klik yang tidak berujung beli. Perbaiki dulu fondasinya, baru iklan akan terasa dampaknya.' },
      { q: 'Bagaimana cara menaikkan penjualan tanpa iklan?', a: 'Perbaiki foto dan judul agar orang mengklik, sesuaikan harga dengan data pasar, kejar ulasan awal lewat pelayanan yang baik, lengkapi deskripsi, dan fokus ke produk yang memang sedang naik. Semua ini tidak butuh anggaran iklan.' },
      { q: 'Apakah menurunkan harga selalu menaikkan penjualan?', a: 'Tidak. Harga terlalu rendah bisa menaikkan penjualan tapi menghapus margin, dan memicu perang harga. Lebih baik memposisikan harga di sekitar median pasar dengan pembeda yang jelas daripada jadi yang termurah.' },
    ],
  }
];

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
for (const g of GUIDES) {
  const dir = path.join(OUT, g.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), articlePage(g));
  console.log('wrote panduan/' + g.slug);
}
fs.writeFileSync(path.join(OUT, 'index.html'), hubPage(GUIDES));
console.log(`Done: ${GUIDES.length} guides + hub.`);
