#!/usr/bin/env node
/**
 * Builds /data/ — the public corpus-coverage page.
 *
 * Why this page: it is the only page on the site whose subject is the dataset
 * itself, so it is the one page where a weekly refresh is honest (everything under
 * /perbandingan/ and /panduan/ is hand-written copy — a timer there would bump a
 * date string and nothing else). It is also the asset docs/seo.md flags as the
 * highest-ROI unbuilt one: a data study is the most back-linkable, most-cited
 * format, and nobody else holds this data.
 *
 * It doubles as the source for the landing stat strip, which had been hand-typed
 * and was understating the corpus by more than 2x.
 *
 * Input:  scripts/coverage.json (written by scripts/fetch-coverage.sh)
 * Output: data/index.html
 * Run:    node scripts/build-coverage-page.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYTICS } from './lib/analytics-head.mjs';
import { EXPOR_TAB } from './lib/expor-tab.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;

const C = JSON.parse(fs.readFileSync(path.join(__dirname, 'coverage.json'), 'utf8'));

// ---------- helpers ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

const idNum = new Intl.NumberFormat('id-ID');
const n = (v) => idNum.format(Number(v || 0));
/** Indonesian short scale for hero figures: 1115989 -> "1,12 juta". */
function big(v) {
  const x = Number(v || 0);
  if (x >= 1e9) return idNum.format(Math.round(x / 1e8) / 10) + ' miliar';
  if (x >= 1e6) return idNum.format(Math.round(x / 1e5) / 10) + ' juta';
  if (x >= 1e3) return idNum.format(Math.round(x / 1e2) / 10) + ' ribu';
  return idNum.format(x);
}
const pct = (part, whole) => {
  const w = Number(whole || 0);
  if (!w) return '0%';
  return idNum.format(Math.round((Number(part || 0) / w) * 1000) / 10) + '%';
};

const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function humanDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${ID_MONTHS[m - 1]} ${y}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

const SNAPSHOT = String(C.snapshot).slice(0, 10);
const SNAPSHOT_HUMAN = humanDate(SNAPSHOT);
const WINDOW_DAYS = daysBetween(C.first_scrape, SNAPSHOT);

// ---------- head / chrome (same shape as build-comparisons.mjs) ----------
function nav() {
  return `<nav class="site-nav">
    <a href="/riset/">Riset Pasar</a>
    <a href="/panduan/">Panduan</a>
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/perbandingan/">Perbandingan</a>
    <a href="/data/" class="active">Data</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

function head(title, desc, url, extraLd, modified) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${ANALYTICS}
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
<meta property="article:modified_time" content="${modified}">
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
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.webp" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav()}
</header>`;
}

const footer = `<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/cara-kerja/">Cara Kerja</a>
  <a href="/privacy/">Privasi</a>
</footer>
${EXPOR_TAB}
</body>
</html>
`;

// ---------- content ----------
const TITLE = `Data & Cakupan LarisID: ${big(C.products)} Produk Shopee yang Kami Pantau (${SNAPSHOT_HUMAN})`;
const DESC = jt(`Angka cakupan data LarisID per ${SNAPSHOT_HUMAN}: ${n(C.products)} produk,
  ${n(C.shops)} toko, ${n(C.corpus_active)} kata kunci Shopee yang disegarkan setiap ${C.sla_days} hari.
  Terbuka, bisa diperiksa, dan diperbarui mingguan.`);

const FAQS = [
  {
    q: 'Berapa banyak produk Shopee yang dipantau LarisID?',
    a: jt(`Per ${SNAPSHOT_HUMAN} kami memantau ${n(C.products)} produk dari ${n(C.shops)} toko,
      terkumpul dari ${n(C.listing_rows)} baris listing sejak ${humanDate(C.first_scrape)}.
      Angka ini kami perbarui mingguan di halaman ini.`),
  },
  {
    q: 'Seberapa sering datanya diperbarui?',
    a: jt(`Setiap kata kunci dijadwalkan disegarkan dalam ${C.sla_days} hari. Pada pengambilan
      terakhir, ${n(C.scraped_7d)} dari ${n(C.corpus_active)} kata kunci aktif tersegarkan dalam
      7 hari terakhir, dengan kata kunci paling lama tertinggal ${idNum.format(C.oldest_age_days)} hari.
      Jadi datanya bukan real-time, melainkan segar dalam hitungan hari.`),
  },
  {
    q: 'Apakah angka terjual di LarisID itu data asli dari Shopee?',
    a: jt(`Harga, rating, dan jumlah ulasan adalah nilai nyata yang kami ambil dari halaman Shopee.
      Angka terjual dan omset adalah ESTIMASI yang kami hitung, bukan angka resmi dari Shopee.
      Metodologinya kami jelaskan terbuka di halaman Cara Kerja.`),
  },
  {
    q: 'Apakah LarisID memantau seluruh Shopee?',
    a: jt(`Tidak, dan kami tidak akan mengklaim begitu. Kami memantau kumpulan
      ${n(C.corpus_active)} kata kunci pilihan yang relevan untuk penjual Indonesia, bukan seluruh
      katalog Shopee. Kalau kata kunci yang kamu cari belum ada, kamu bisa memintanya dan kata kunci
      itu masuk antrean scrape.`),
  },
  {
    q: 'Apakah data ini mencakup TikTok Shop atau Tokopedia?',
    a: jt(`Belum. Seluruh angka di halaman ini berasal dari listing Shopee Indonesia.
      Kalkulator biaya kami memang mencakup lima marketplace, tetapi data listing yang kami
      scrape saat ini hanya Shopee — kami sebut apa adanya supaya tidak menyesatkan.`),
  },
];

const dataset = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'LarisID', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Data & Cakupan', item: `${SITE}/data/` },
      ],
    },
    {
      '@type': 'Dataset',
      name: jt(`Cakupan data listing Shopee LarisID (${SNAPSHOT_HUMAN})`),
      description: jt(`Ringkasan cakupan korpus listing Shopee Indonesia yang dipantau LarisID:
        ${n(C.products)} produk, ${n(C.shops)} toko, ${n(C.listing_rows)} baris listing,
        ${n(C.corpus_active)} kata kunci aktif, ${n(C.categories)} kategori, ${n(C.locations)} lokasi penjual.`),
      url: `${SITE}/data/`,
      license: `${SITE}/privacy/`,
      isAccessibleForFree: true,
      creator: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
      datePublished: SNAPSHOT,
      dateModified: SNAPSHOT,
      temporalCoverage: `${String(C.first_scrape).slice(0, 10)}/${SNAPSHOT}`,
      spatialCoverage: { '@type': 'Place', name: 'Indonesia' },
      measurementTechnique: 'Scraping halaman hasil pencarian Shopee Indonesia per kata kunci',
      variableMeasured: [
        { '@type': 'PropertyValue', name: 'Produk dipantau', value: C.products },
        { '@type': 'PropertyValue', name: 'Toko dipantau', value: C.shops },
        { '@type': 'PropertyValue', name: 'Baris listing terkumpul', value: C.listing_rows },
        { '@type': 'PropertyValue', name: 'Kata kunci aktif', value: C.corpus_active },
        { '@type': 'PropertyValue', name: 'Kategori produk', value: C.categories },
        { '@type': 'PropertyValue', name: 'Lokasi penjual', value: C.locations },
        { '@type': 'PropertyValue', name: 'Produk dengan riwayat terukur', value: C.products_with_measured },
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: jt(f.q),
        acceptedAnswer: { '@type': 'Answer', text: jt(f.a) },
      })),
    },
  ],
};

const catMax = Math.max(...C.per_category.map((r) => Number(r.products)));
const catBars = C.per_category.map((r) => `  <div class="bar-row">
    <span class="bar-label">${esc(r.category)}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${Math.round((Number(r.products) / catMax) * 100)}%"></span></span>
    <span class="bar-val">${n(r.products)}</span>
  </div>`).join('\n');

const html = `${head(TITLE, DESC, `${SITE}/data/`, dataset, SNAPSHOT)}
<main class="wrap">
  <h1>Data yang kami pantau</h1>
  <p class="lead">Hampir semua alat riset produk meminta kamu percaya pada angkanya tanpa pernah
  menunjukkan seberapa luas datanya. Halaman ini kebalikannya: inilah ukuran korpus LarisID apa
  adanya, termasuk bagian yang masih tipis. Angkanya dihasilkan langsung dari database dan
  diperbarui mingguan.</p>
  <p class="updated">Snapshot data: ${SNAPSHOT_HUMAN} · ${n(C.snapshot_rows)} baris terkumpul pada
  hari itu · <a href="/cara-kerja/">metodologi &amp; batasan data</a> · <a href="/llms.txt">llms.txt</a></p>

  <div class="stat-grid">
    <div class="stat"><div class="stat-num">${n(C.products)}</div><div class="stat-label">Produk dipantau</div><div class="stat-sub">produk unik, bukan baris data</div></div>
    <div class="stat"><div class="stat-num">${n(C.shops)}</div><div class="stat-label">Toko Shopee</div><div class="stat-sub">penjual berbeda yang terekam</div></div>
    <div class="stat"><div class="stat-num">${n(C.listing_rows)}</div><div class="stat-label">Baris listing</div><div class="stat-sub">sejak ${humanDate(C.first_scrape)}</div></div>
    <div class="stat"><div class="stat-num">${n(C.corpus_active)}</div><div class="stat-label">Kata kunci aktif</div><div class="stat-sub">disegarkan tiap ${C.sla_days} hari</div></div>
    <div class="stat"><div class="stat-num">${n(C.categories)}</div><div class="stat-label">Kategori produk</div><div class="stat-sub">${n(C.locations)} lokasi penjual</div></div>
    <div class="stat"><div class="stat-num">${WINDOW_DAYS} hari</div><div class="stat-label">Rentang data</div><div class="stat-sub">${humanDate(C.first_scrape)} – ${SNAPSHOT_HUMAN}</div></div>
  </div>

  <article>
    <h2>Seberapa segar datanya</h2>
    <p>Data kami bukan real-time, dan kami tidak pernah menyebutnya begitu. Setiap kata kunci punya
    target disegarkan dalam <strong>${C.sla_days} hari</strong>. Ini capaian pada snapshot terakhir:</p>
    <div class="summary-box">
      <ul>
        <li><strong>${n(C.scraped_7d)} dari ${n(C.corpus_active)}</strong> kata kunci aktif tersegarkan dalam 7 hari terakhir.</li>
        <li>Kata kunci yang paling lama tertinggal: <strong>${idNum.format(C.oldest_age_days)} hari</strong>.</li>
        <li>Kata kunci yang belum pernah tersentuh sama sekali: <strong>${n(C.never_scraped)}</strong>.</li>
        <li>Perkiraan waktu untuk menyelesaikan satu putaran penuh: <strong>${idNum.format(C.days_to_full_coverage)} hari</strong>.</li>
      </ul>
    </div>
    <p>Artinya kalau kamu membuka sebuah produk hari ini, angka harga dan ulasannya berumur paling
    lama sekitar seminggu — bukan sedetik, tapi juga bukan berbulan-bulan.</p>

    <h2>Kedalaman riwayat</h2>
    <p>Memantau satu produk sekali hanya memberi satu titik. Tren baru terbaca kalau produk yang sama
    terekam berulang kali. Dari ${n(C.products)} produk yang kami pantau:</p>
    <table class="compare">
      <tbody>
        <tr><td>Punya lebih dari satu titik riwayat</td><td>${n(C.products_with_history)} <span class="note">${pct(C.products_with_history, C.products)} dari seluruh produk</span></td></tr>
        <tr><td>Punya riwayat mingguan terukur</td><td>${n(C.products_with_measured)} <span class="note">${pct(C.products_with_measured, C.products)} — dipakai untuk grafik tren</span></td></tr>
        <tr><td>Punya estimasi omset bulanan</td><td>${n(C.products_with_omset)} <span class="note">${pct(C.products_with_omset, C.products)} — estimasi, bukan angka resmi Shopee</span></td></tr>
      </tbody>
    </table>

    <h2>Sebaran kategori</h2>
    <p>Dua belas kategori teratas menurut jumlah produk unik yang dipantau:</p>
${catBars}
    <p class="muted">Satu produk bisa muncul di lebih dari satu kategori, jadi angka di atas adalah
    sebaran, bukan pembagian yang saling terpisah.</p>

    <h2>Yang belum kami punya</h2>
    <p>Bagian ini sengaja kami tulis, karena alat riset yang hanya memamerkan kekuatannya tidak
    membantu kamu mengambil keputusan.</p>
    <ul>
      <li><strong>Terjual dan omset adalah estimasi.</strong> Harga, rating, dan jumlah ulasan
      adalah nilai nyata dari halaman Shopee. Angka terjual dan omset kami hitung sendiri — lihat
      <a href="/cara-kerja/">Cara Kerja</a> untuk metodenya dan batasannya.</li>
      <li><strong>Hanya Shopee.</strong> Seluruh angka di halaman ini berasal dari listing Shopee
      Indonesia. Kalkulator biaya kami mencakup lima marketplace, tetapi data listing yang kami
      scrape belum mencakup TikTok Shop, Tokopedia, Lazada, atau Blibli.</li>
      <li><strong>Bukan seluruh Shopee.</strong> Kami memantau ${n(C.corpus_active)} kata kunci
      pilihan, bukan seluruh katalog. Kalau kata kuncimu belum ada, kamu bisa memintanya di dalam
      aplikasi dan kata kunci itu akan masuk antrean.</li>
      <li><strong>Data varian masih baru.</strong> Baru ${n(C.detail_ok)} produk yang sudah melewati
      pass detail (varian, atribut, rincian ulasan). Angkanya masih kecil dan sedang bertambah.</li>
      <li><strong>Bukan real-time.</strong> Kalau kamu butuh angka per detik, tidak ada alat scrape
      mana pun yang bisa memberikannya secara jujur — termasuk kami.</li>
    </ul>

    <h2>Kenapa halaman ini ada</h2>
    <p>LarisID 100% gratis untuk semua orang, selamanya, jadi kami tidak punya paket berbayar untuk
    dijual dengan angka yang dibesar-besarkan. Yang kami punya hanya datanya. Menampilkannya terbuka
    — termasuk bagian yang tipis — adalah cara paling masuk akal untuk membuktikan bahwa angka di
    dalam aplikasi memang berasal dari sesuatu yang nyata.</p>
    <p>Mau langsung memakainya? <a href="/riset/">Halaman riset pasar per kata kunci</a> dibuka gratis
    tanpa login, atau <a href="/">mulai dari aplikasinya</a>.</p>
  </article>

  <h2>Pertanyaan yang sering muncul</h2>
${FAQS.map((f) => `  <div class="faq-item">
    <div class="faq-q">${esc(f.q)}</div>
    <div class="faq-a">${esc(f.a)}</div>
  </div>`).join('\n')}

  <div class="cta-row">
    <a class="btn-primary" href="/">Coba LarisID gratis</a>
    <a class="btn-secondary" href="/cara-kerja/">Baca metodologinya</a>
  </div>
  <p class="disclaimer">Angka di halaman ini dihasilkan otomatis dari database LarisID pada
  ${SNAPSHOT_HUMAN}. Terjual dan omset adalah estimasi, bukan data resmi Shopee.</p>
</main>
${footer}`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
console.log(`Wrote data/index.html (snapshot ${SNAPSHOT}, ${n(C.products)} produk, ${n(C.shops)} toko)`);

// ---------- landing stat strip ----------
// The four tiles in index.html's .hl-stats were hand-typed and drifted badly (526K+
// products against a real 1.1M). Rewrite them from the same JSON that built this page
// so the landing can never again claim a number the data does not support.
// Targeted attribute replacement, not a template: index.html is a ~9.4k-line file that
// other sessions edit concurrently, so this must touch only these four text nodes.
function landingNum(v) {
  const x = Number(v || 0);
  if (x >= 1e6) return idNum.format(Math.round(x / 1e5) / 10) + ' jt+';
  if (x >= 1e4) return Math.floor(x / 1e3) + 'K+';
  return idNum.format(x);
}
const TILES = {
  products: landingNum(C.products),
  shops: landingNum(C.shops),
  keywords: n(C.corpus_active),
  categories: n(C.categories),
};

const indexPath = path.join(ROOT, 'index.html');
let index = fs.readFileSync(indexPath, 'utf8');
const before = index;
const missing = [];
for (const [key, val] of Object.entries(TILES)) {
  const re = new RegExp(`(<div class="hl-stat-num" data-coverage="${key}">)[^<]*(</div>)`);
  if (!re.test(index)) { missing.push(key); continue; }
  index = index.replace(re, `$1${esc(val)}$2`);
}
if (missing.length) {
  // Fail loudly: a silently-skipped tile is how the old numbers went stale in the
  // first place. Someone reworking the hero must re-add the data-coverage attribute.
  console.error(`FAIL: no data-coverage tile found for: ${missing.join(', ')}`);
  console.error('Add data-coverage="<key>" to the .hl-stat-num div in index.html.');
  process.exit(1);
}
if (index !== before) {
  fs.writeFileSync(indexPath, index);
  console.log(`Updated landing stats: ${Object.entries(TILES).map(([k, v]) => `${k}=${v}`).join(' ')}`);
} else {
  console.log('Landing stats already current.');
}
