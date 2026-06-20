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
const UPDATED = '2026-06-19';
const UPDATED_HUMAN = '19 Juni 2026';

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
      ['Harga', 'Rp 0 \u2014 100% gratis (20 kredit/bulan + tambah gratis via ekstensi)', '~Rp 299.000/bulan (langganan)'],
      ['Model', 'Kredit, tanpa langganan wajib', 'Langganan bulanan'],
      ['Marketplace', 'Shopee (Indonesia)', 'Riset marketplace lengkap'],
      ['Viability Score', 'Ya (0\u2013100)', 'Skor/metric sendiri'],
      ['Deep Dive per produk', 'Ya (tren, kompetitor, keyword)', 'Ya'],
      ['AI kontekstual', 'Ya (terikat produk/keyword)', 'Bervariasi'],
      ['Cocok untuk', 'Pemula & seller hemat budget', 'Seller yang nyaman langganan all-in'],
    ],
    verdict: 'Kalau kamu baru mulai atau tidak ingin komitmen ~Rp 300rb/bulan, LarisID memberi riset mendalam tanpa biaya. Kalau kamu sudah skala besar dan ingin paket langganan all-in dengan cakupan marketplace luas, Datapinter layak dipertimbangkan.',
    faqs: [
      { q: 'Apakah LarisID alternatif Datapinter yang gratis?', a: 'Ya. LarisID menyediakan riset produk Shopee dengan Viability Score, Deep Dive, dan AI kontekstual secara 100% gratis (20 kredit/bulan, plus kredit tambahan gratis lewat ekstensi), tanpa langganan ~Rp 299.000/bulan seperti Datapinter.' },
      { q: 'Apa kelebihan Datapinter dibanding LarisID?', a: 'Datapinter menawarkan cakupan riset marketplace yang lebih luas dalam satu paket langganan, cocok untuk seller yang sudah nyaman membayar bulanan dan butuh fitur all-in.' },
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
      ['Harga', 'Rp 0 \u2014 100% gratis', '~Rp 50.000/bulan (paket tahunan)'],
      ['Bentuk', 'Platform web + ekstensi', 'Ekstensi Chrome'],
      ['Marketplace', 'Shopee (Indonesia)', 'Shopee + Tokopedia'],
      ['Kedalaman analisis', 'Deep Dive + Viability Score per produk', 'Riset cepat + ekspor Excel'],
      ['AI kontekstual', 'Ya', 'Tidak/terbatas'],
      ['Cocok untuk', 'Analisis mendalam satu produk', 'Riset ringan lintas marketplace + ekspor data'],
    ],
    verdict: 'Butuh ekstensi ringan untuk mengintip data sambil browsing Shopee/Tokopedia dan ekspor Excel? Tokpee praktis. Butuh analisis lebih dalam per produk (tren, Viability Score, AI) tanpa biaya? LarisID lebih cocok \u2014 dan keduanya bisa dipakai berdampingan.',
    faqs: [
      { q: 'Tokpee atau LarisID untuk pemula?', a: 'Untuk analisis mendalam satu produk (skor kelayakan, tren, AI) tanpa biaya, LarisID lebih cocok untuk pemula. Tokpee unggul untuk riset cepat lintas Shopee + Tokopedia dan ekspor Excel.' },
      { q: 'Apakah LarisID mendukung Tokopedia?', a: 'Saat ini LarisID fokus pada Shopee (Indonesia). Jika kebutuhan utamamu mencakup Tokopedia, Tokpee bisa melengkapi.' },
    ],
  },
  {
    slug: 'larisid-vs-shoptik',
    name: 'Shoptik',
    title: 'LarisID vs Shoptik: Perbandingan Alat Riset Produk Shopee (2026)',
    desc: 'Perbandingan LarisID vs Shoptik untuk riset produk Shopee: transparansi harga, fitur, dan kapan memilih masing-masing. Harga LarisID 100% gratis & transparan.',
    h1: 'LarisID vs Shoptik',
    lead: 'Shoptik adalah alat riset produk Shopee yang harganya tidak dipublikasikan transparan (sering promo). LarisID menempatkan transparansi dan akses gratis di depan.',
    rows: [
      ['Harga', 'Rp 0 \u2014 100% gratis & transparan di /harga/', 'Tidak dipublikasikan (sering promo)'],
      ['Transparansi', 'Penuh (model kredit jelas)', 'Terbatas'],
      ['Marketplace', 'Shopee (Indonesia)', 'Shopee'],
      ['Viability Score', 'Ya (0\u2013100)', 'Bervariasi'],
      ['Deep Dive + AI', 'Ya', 'Bervariasi'],
      ['Cocok untuk', 'Yang mau gratis & transparan', 'Yang sudah pakai ekosistem Shoptik'],
    ],
    verdict: 'Kalau kamu menghargai harga yang jelas di muka dan akses gratis bermakna, LarisID transparan apa adanya. Kalau kamu sudah terbiasa dengan Shoptik dan harga promonya cocok, lanjutkan dengan yang kamu nyaman.',
    faqs: [
      { q: 'Berapa harga Shoptik?', a: 'Shoptik tidak mempublikasikan harga secara transparan dan sering menampilkan promo diskon. Sebagai pembanding, LarisID 100% gratis dengan model kredit yang jelas di halaman harga.' },
      { q: 'Apakah LarisID benar-benar gratis?', a: 'Ya. 20 kredit gratis setiap bulan, akses Finder, histori 7 hari, dan komunitas \u2014 tanpa langganan atau biaya tersembunyi. Kredit tambahan bisa diperoleh gratis lewat ekstensi.' },
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
    <p class="disclaimer">Harga LarisID 100% gratis (lihat <a href="/harga/">/harga/</a>). Harga ${esc(c.name)} adalah perkiraan publik per ${UPDATED_HUMAN} dan bisa berubah \u2014 verifikasi di situs resmi mereka.</p>

    <h2>Putusannya</h2>
    <p>${esc(c.verdict)}</p>

    <h2>Kenapa banyak seller memilih LarisID</h2>
    <ul>
      <li><strong>Gratis bermakna.</strong> 20 kredit/bulan + kredit tambahan gratis lewat ekstensi, tanpa kartu kredit.</li>
      <li><strong>Data nyata.</strong> Harga, rating, dan ulasan dari listing Shopee asli; "terjual" ditandai sebagai estimasi.</li>
      <li><strong>Riset pasar terbuka.</strong> Lihat <a href="/riset/">ratusan halaman riset keyword</a> tanpa perlu daftar.</li>
      <li><strong>Jujur.</strong> Kami tidak menjanjikan "dijamin laku" \u2014 skor untuk mengurangi risiko, bukan menghapusnya.</li>
    </ul>

    <div class="cta-row">
      <a class="btn-primary" href="/">Coba LarisID gratis</a>
      <a class="btn-secondary" href="/perbandingan/alat-riset-produk-shopee-terbaik/">Lihat semua alat</a>
      <a class="btn-secondary" href="/harga/">Harga &amp; kredit</a>
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
    { name: 'LarisID', price: 'Rp 0 (100% gratis)', best: 'Pemula & seller hemat budget yang butuh riset mendalam', pro: 'Gratis bermakna, Viability Score, Deep Dive, AI kontekstual, data nyata', con: 'Fokus Shopee (belum Tokopedia)', href: '/' },
    { name: 'Datapinter', price: '~Rp 299.000/bulan', best: 'Seller skala besar yang ingin paket langganan all-in', pro: 'Cakupan riset marketplace luas', con: 'Langganan relatif mahal untuk pemula', href: '/perbandingan/larisid-vs-datapinter/' },
    { name: 'Tokpee', price: '~Rp 50.000/bulan (tahunan)', best: 'Riset cepat lintas Shopee + Tokopedia + ekspor Excel', pro: 'Ekstensi ringan, multi-marketplace, ekspor data', con: 'Analisis per produk kurang dalam', href: '/perbandingan/larisid-vs-tokpee/' },
    { name: 'Shoptik', price: 'Tidak dipublikasikan', best: 'Yang sudah memakai ekosistem Shoptik', pro: 'Fitur riset Shopee', con: 'Harga kurang transparan (sering promo)', href: '/perbandingan/larisid-vs-shoptik/' },
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
    <p class="disclaimer">Angka harga kompetitor bisa berubah \u2014 verifikasi di situs resmi masing-masing. Harga LarisID 100% gratis, detail di <a href="/harga/">/harga/</a>.</p>

    <div class="cta-row">
      <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
      <a class="btn-secondary" href="/riset/">Lihat data pasar Shopee</a>
    </div>
  </article>
</main>
${footer}`;
}

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
console.log('Done: comparison pages built.');
