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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'panduan');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;
const AUTHOR = 'Steven Wilson';

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
      {
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
<title>Panduan Riset & Bisnis Shopee untuk Seller Indonesia | LarisID</title>
<meta name="description" content="Panduan praktis & jujur untuk seller Shopee: cara riset produk, menghitung margin/HPP, dan menganalisis kompetitor. Gratis dari LarisID.">
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
  <h1>Panduan Riset & Bisnis Shopee</h1>
  <p class="lead">Panduan praktis dan jujur untuk seller Indonesia \u2014 dari riset produk sampai hitung untung. Dipadukan dengan <a href="/riset/">data pasar nyata</a> supaya keputusanmu berbasis angka, bukan feeling.</p>
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
