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

// Google Ads tag — lives on the section hub pages (parity with the committed
// hubs; injected here so regenerating the hub does not strip conversion tracking).
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-862519971"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'AW-862519971');
</script>`;

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
${GTAG}
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
