#!/usr/bin/env node
/**
 * Programmatic city-page generator for LarisID: /kota/<slug>/ + /kota/ hub.
 *
 * "Produk Paling Laris di <Kota>" pages for the top 100 seller cities in Java,
 * built from REAL scraped Shopee listing data (scripts/city-data.json, produced
 * by refresh_seo_city_data() in the DB + scripts/fetch-city-data.mjs).
 *
 * Why: 100% of attributed signups arrive via intent search (Google organic +
 * ChatGPT). These pages put each city's live market data where sellers in that
 * city are already searching. Per MISSION.md these are NOT thin doorway pages:
 * every page carries real prices, ratings, review counts, seller counts, and
 * top products for that specific city; "terjual" is an ESTIMATE and is
 * labelled as such everywhere.
 *
 * Sitemap: this script REPLACES only the /kota/ entries inside sitemap.xml and
 * leaves everything else untouched (build-seo-pages.mjs likewise carries /kota/
 * entries over when it rebuilds).
 *
 * Refresh flow after a scrape:
 *   select refresh_seo_city_data();   -- SQL, service role
 *   node scripts/fetch-city-data.mjs
 *   node scripts/build-city-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'kota');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;

const RAW = JSON.parse(fs.readFileSync(path.join(__dirname, 'city-data.json'), 'utf8'));
const SNAPSHOT = RAW.snapshot;
const SNAPSHOT_HUMAN = new Date(SNAPSHOT + 'T00:00:00Z').toLocaleDateString('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const WINDOW_DAYS = RAW.window_days || 45;

// Top 100 seller cities in Java (by distinct active Shopee shops in the scrape
// window), keyed by the exact Shopee location string. Non-Java cities in the
// data (Medan, Makassar, Denpasar, ...) are intentionally excluded — this set
// is the Java rollout; extend the map to add more islands later.
const PROVINCES = {
  'DKI Jakarta': ['Jakarta Barat', 'Jakarta Utara', 'Jakarta Pusat', 'Jakarta Timur', 'Jakarta Selatan'],
  'Banten': ['Kab. Tangerang', 'Tangerang', 'Tangerang Selatan', 'Kab. Serang', 'Serang', 'Cilegon'],
  'Jawa Barat': ['Kab. Bandung', 'Bandung', 'Kab. Bogor', 'Bekasi', 'Kab. Bekasi', 'Depok', 'Bogor',
    'Kab. Garut', 'Kab. Bandung Barat', 'Kab. Cirebon', 'Tasikmalaya', 'Cimahi', 'Kab. Tasikmalaya',
    'Kab. Karawang', 'Kab. Ciamis', 'Kab. Sukabumi', 'Cirebon', 'Kab. Sumedang', 'Kab. Cianjur',
    'Kab. Kuningan', 'Kab. Majalengka', 'Kab. Pangandaran', 'Kab. Purwakarta'],
  'Jawa Tengah': ['Semarang', 'Kab. Jepara', 'Surakarta (Solo)', 'Kab. Klaten', 'Kab. Kudus',
    'Kab. Pekalongan', 'Kab. Kebumen', 'Kab. Sukoharjo', 'Kab. Wonogiri', 'Kab. Pemalang', 'Kab. Tegal',
    'Kab. Cilacap', 'Kab. Banyumas', 'Kab. Purbalingga', 'Kab. Pati', 'Kab. Boyolali', 'Kab. Demak',
    'Kab. Magelang', 'Kab. Grobogan', 'Kab. Karanganyar', 'Kab. Sragen', 'Kab. Kendal', 'Kab. Wonosobo',
    'Kab. Semarang', 'Pekalongan', 'Kab. Blora', 'Kab. Purworejo', 'Salatiga', 'Tegal', 'Magelang',
    'Kab. Brebes', 'Kab. Temanggung'],
  'DI Yogyakarta': ['Kab. Sleman', 'Kab. Bantul', 'Yogyakarta', 'Kab. Gunung Kidul', 'Kab. Kulon Progo'],
  'Jawa Timur': ['Surabaya', 'Kab. Sidoarjo', 'Malang', 'Kab. Malang', 'Kab. Gresik', 'Kab. Mojokerto',
    'Kab. Tulungagung', 'Kab. Kediri', 'Kab. Jombang', 'Kab. Jember', 'Kab. Blitar', 'Kab. Pasuruan',
    'Kab. Lamongan', 'Kab. Banyuwangi', 'Kediri', 'Kab. Nganjuk', 'Kab. Bojonegoro', 'Kab. Probolinggo',
    'Kab. Ponorogo', 'Kab. Madiun', 'Pasuruan', 'Batu', 'Probolinggo', 'Kab. Lumajang', 'Mojokerto',
    'Kab. Tuban', 'Blitar', 'Kab. Trenggalek', 'Kab. Ngawi'],
};

// ---------- helpers ----------
const idNum = new Intl.NumberFormat('id-ID');
const rp = (n) => 'Rp ' + idNum.format(Math.round(n || 0));
const num = (n) => idNum.format(Math.round(n || 0));
function kfmt(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0', '') + ' jt';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'rb';
  return num(n);
}
function slugify(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function displayName(loc) { return loc.replace(/^Kab\.\s*/, 'Kabupaten '); }
function shortName(loc) { return loc.replace(/^Kab\.\s*/, '').replace(/\s*\(.*\)$/, ''); }

function densityWord(sellers) {
  if (sellers >= 1500) return { word: 'sangat ramai', note: 'kamu bersaing dengan ribuan toko lokal — menang lewat pembeda (foto, bundling, layanan), bukan perang harga.' };
  if (sellers >= 300) return { word: 'ramai', note: 'pasar lokalnya hidup; masih ada ruang kalau kamu masuk dengan sudut yang jelas.' };
  return { word: 'masih longgar', note: 'penjual aktifnya belum banyak — jadi pemain serius pertama di kategori kuat kotamu lebih mudah di sini.' };
}

function navHtml() {
  return `<nav class="site-nav">
    <a href="/kota/">Per Kota</a>
    <a href="/riset/">Riset Pasar</a>
    <a href="/panduan/">Panduan</a>
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

// ---------- city page ----------
function pageHtml(city, related) {
  const { loc, prov, d } = city;
  const name = displayName(loc);
  const short = shortName(loc);
  const slug = slugify(loc);
  const url = `${SITE}/kota/${slug}/`;
  const dens = densityWord(d.sellers);
  const cats = d.cats || [];
  const top = d.top || [];
  const catNames = cats.map((c) => c.cat).join(', ');

  const title = `Produk Paling Laris di ${name} — Data Shopee ${SNAPSHOT.slice(0, 4)} | LarisID`;
  const desc = `${num(d.sellers)} penjual Shopee aktif terpantau di ${name}: produk terlaris, harga median ${rp(d.medPrice)}, kategori terkuat (${catNames}). Data nyata untuk mulai jualan dari ${short}. Gratis.`;

  const topRows = top.map((p) => `          <tr>
            <td><span class="prod-name">${esc(p.name)}</span><span class="note">${esc(p.store)}${p.cat ? ' · ' + esc(p.cat) : ''}</span></td>
            <td>${rp(p.price)}</td>
            <td>${p.rating ? Number(p.rating).toFixed(2) : '—'}</td>
            <td>${num(p.reviews)}</td>
            <td>${kfmt(p.sold)}+</td>
          </tr>`).join('\n');

  const catMax = Math.max(1, ...cats.map((c) => c.n));
  const catRows = cats.map((c) => `        <div class="bar-row">
          <span class="bar-label">${esc(c.cat)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((c.n / catMax) * 100))}%"></span></span>
          <span class="bar-val">${num(c.n)} produk</span>
        </div>`).join('\n');

  const relatedHtml = related.length ? `  <div class="card">
    <h2>Kota lain di ${esc(prov)}</h2>
    <div class="riset-grid">
${related.map((r) => `      <a class="riset-card" href="/kota/${slugify(r.loc)}/"><span class="rk">${esc(displayName(r.loc))}</span><span class="rm">${num(r.d.sellers)} penjual · median ${rp(r.d.medPrice)}</span></a>`).join('\n')}
    </div>
  </div>` : '';

  const faqs = [
    {
      q: `Produk apa yang paling laku dijual dari ${name}?`,
      a: `Dari ${num(d.items)} produk milik ${num(d.sellers)} toko ${short} yang kami pantau, kategori terkuat adalah ${catNames}. Produk teratasnya bisa kamu lihat di tabel halaman ini — lengkap dengan harga, rating, dan jumlah ulasan asli Shopee.`,
    },
    {
      q: `Berapa harga jual yang umum di ${short}?`,
      a: `Harga median produk yang dipantau di ${name} adalah ${rp(d.medPrice)}. Median artinya setengah produk dijual di bawah angka itu — patokan aman untuk uji pasar sebelum kulakan banyak.`,
    },
    {
      q: `Apakah data ini real-time?`,
      a: `Bukan. Ini snapshot data per ${SNAPSHOT_HUMAN} dari ${WINDOW_DAYS} hari scrape terakhir, dan diperbarui berkala. Harga, rating, dan ulasan adalah data listing nyata; angka "terjual" adalah estimasi, bukan angka resmi Shopee. Untuk data per produk yang lebih segar, cek langsung di aplikasi LarisID — gratis.`,
    },
  ];
  const faqHtml = faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${esc(f.a)}</p>
    </div>`).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Produk Laris per Kota', item: `${SITE}/kota/` },
          { '@type': 'ListItem', position: 3, name, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question', name: jsonText(f.q),
          acceptedAnswer: { '@type': 'Answer', text: jsonText(f.a) },
        })),
      },
      {
        '@type': 'ItemList',
        name: jsonText(`Produk paling laris dari penjual ${name} di Shopee`),
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: top.length,
        itemListElement: top.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: jsonText(p.name) })),
      },
      {
        '@type': 'Dataset',
        name: jsonText(`Data pasar penjual Shopee di ${name} (${SNAPSHOT_HUMAN})`),
        description: jsonText(`Produk terlaris, harga median, dan kategori terkuat dari ${num(d.sellers)} penjual Shopee aktif di ${name}, ${prov}. Harga, rating, dan ulasan adalah data nyata; "terjual" adalah estimasi.`),
        url,
        identifier: url,
        keywords: [short, prov, 'Shopee', 'produk laris', 'jualan online', 'e-commerce Indonesia'],
        inLanguage: 'id',
        isAccessibleForFree: true,
        license: `${SITE}/cara-kerja/`,
        datePublished: SNAPSHOT,
        dateModified: SNAPSHOT,
        spatialCoverage: { '@type': 'Place', name: `${name}, ${prov}, Indonesia` },
        creator: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Penjual aktif dipantau', value: d.sellers },
          { '@type': 'PropertyValue', name: 'Produk dipantau', value: d.items },
          { '@type': 'PropertyValue', name: 'Harga median', value: Math.round(d.medPrice), unitText: 'IDR' },
          { '@type': 'PropertyValue', name: 'Estimasi unit terjual (kumulatif)', value: Math.round(d.totalSold), description: 'Estimasi, bukan angka resmi Shopee' },
        ],
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(`Produk Paling Laris di ${name} — Data Shopee`)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta property="article:modified_time" content="${SNAPSHOT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(`Produk Paling Laris di ${name} — Data Shopee`)}">
<meta name="twitter:description" content="${esc(desc)}">
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
  ${navHtml()}
</header>
<main class="wide">
  <p class="cat-pill">${esc(prov)} · Produk Laris per Kota</p>
  <h1>Produk Paling Laris di ${esc(name)}</h1>
  <p class="lead">Apa yang benar-benar laku dijual penjual <strong>${esc(short)}</strong> di Shopee — dari ${num(d.items)} produk milik ${num(d.sellers)} toko aktif yang dipantau LarisID dalam ${WINDOW_DAYS} hari terakhir.</p>
  <p class="updated">Snapshot data: ${SNAPSHOT_HUMAN} · <a href="/cara-kerja/">metodologi &amp; batasan data</a> · <a href="/llms.txt">llms.txt</a></p>

  <div class="summary-box">
    <h2>Ringkasan untuk penjual (dan asisten AI)</h2>
    <p>Di <strong>${esc(name)}</strong> kami memantau <strong>${num(d.sellers)} penjual Shopee aktif</strong> dengan ${num(d.items)} produk. Harga median <strong>${rp(d.medPrice)}</strong>; kategori terkuat: <strong>${esc(catNames)}</strong>. Estimasi total terjual (kumulatif) <strong>${kfmt(d.totalSold)}+ unit</strong>. Kepadatan penjual lokal tergolong <strong>${dens.word}</strong>.</p>
    <ul>
      <li><strong>Buat yang mau mulai dari ${esc(short)}:</strong> pembeli sering memfilter berdasarkan lokasi pengiriman — jualan dari kota sendiri berarti ongkir lebih murah dan estimasi tiba lebih cepat untuk pasar sekitarmu.</li>
      <li><strong>Catatan:</strong> angka "terjual" adalah <em>estimasi</em>, bukan angka pasti. <a href="/cara-kerja/">Cara kami menghitungnya</a>.</li>
    </ul>
  </div>

  <article>
    <h2>Angka kunci penjual ${esc(short)}</h2>
    <div class="stat-grid">
      <div class="stat"><div class="stat-num">${num(d.sellers)}</div><div class="stat-label">Penjual aktif dipantau</div></div>
      <div class="stat"><div class="stat-num">${num(d.items)}</div><div class="stat-label">Produk dipantau</div></div>
      <div class="stat"><div class="stat-num">${rp(d.medPrice)}</div><div class="stat-label">Harga median</div></div>
      <div class="stat"><div class="stat-num">${kfmt(d.totalSold)}+</div><div class="stat-label">Estimasi terjual (kumulatif)</div></div>
    </div>
    <p class="disclaimer">Harga, rating, dan jumlah ulasan adalah data nyata dari Shopee. Jumlah terjual adalah estimasi berbasis snapshot — lihat <a href="/cara-kerja/">metodologi</a>.</p>

    <h2>Produk terlaris dari penjual ${esc(short)}</h2>
    <p>Diurutkan dari estimasi terjual kumulatif terbanyak pada produk yang dipantau.</p>
    <div class="compare-wrap">
      <table class="compare">
        <thead>
          <tr><th>Produk &amp; toko</th><th>Harga</th><th>Rating</th><th>Ulasan</th><th>Terjual (est.)</th></tr>
        </thead>
        <tbody>
${topRows}
        </tbody>
      </table>
    </div>

    <h2>Kategori terkuat di ${esc(short)}</h2>
    <p>Kategori dengan produk terbanyak dari penjual ${esc(short)} yang dipantau — sinyal keunggulan lokal (supplier, bahan baku, atau komunitas produsen di sekitarmu).</p>
${catRows}

    <h2>Apa artinya buat kamu</h2>
    <ul>
      <li><strong>Kepadatan penjual ${dens.word}.</strong> ${esc(dens.note)}</li>
      <li><strong>Keunggulan lokasi.</strong> Jualan dari ${esc(short)} berarti kamu menang ongkir dan kecepatan kirim untuk pembeli sekitarmu — filter "dikirim dari" adalah senjata gratis.</li>
      <li><strong>Ikut arus atau ambil celah.</strong> Kategori kuat kotamu (${esc(catNames)}) biasanya berarti akses supplier lokal lebih mudah; kategori yang belum ramai bisa jadi celah kalau permintaan nasionalnya ada.</li>
      <li><strong>Mau jual di mana.</strong> Keunggulan ongkir dari ${esc(short)} berlaku di semua marketplace — Shopee, TikTok Shop, Tokopedia, Lazada, maupun Blibli. Komisinya berbeda-beda per kategori, jadi hitung dana bersihmu dulu di <a href="/kalkulator/">kalkulator gratis LarisID</a>.</li>
      <li><strong>Langkah berikut.</strong> Buka produk spesifik di LarisID untuk lihat tren penjualan, Viability Score, dan benchmark kompetitor — gratis.</li>
    </ul>

    <div class="cta-row">
      <a class="btn-primary" href="/?utm_source=kota&amp;utm_campaign=${slug}">Riset produk dari ${esc(short)} gratis di LarisID</a>
      <a class="btn-secondary" href="/cara-kerja/">Cara kerja &amp; data</a>
      <a class="btn-secondary" href="/kota/">Kota lain</a>
    </div>
  </article>

  <div class="card">
    <h2>Pertanyaan umum</h2>
${faqHtml}
  </div>

${relatedHtml}
</main>
<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/kota/">Per Kota</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

// ---------- hub ----------
function hubHtml(cities) {
  const url = `${SITE}/kota/`;
  const totalSellers = cities.reduce((s, c) => s + c.d.sellers, 0);

  const sections = Object.keys(PROVINCES).map((prov) => {
    const items = cities.filter((c) => c.prov === prov).sort((a, b) => b.d.sellers - a.d.sellers);
    if (!items.length) return '';
    return `  <h2 class="cat-head">${esc(prov)}</h2>
  <div class="riset-grid">
${items.map((c) => `    <a class="riset-card" href="/kota/${slugify(c.loc)}/"><span class="rk">${esc(displayName(c.loc))}</span><span class="rm">${num(c.d.sellers)} penjual · median ${rp(c.d.medPrice)}</span></a>`).join('\n')}
  </div>`;
  }).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Produk Laris per Kota', item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        name: 'Produk Paling Laris per Kota — LarisID',
        description: jsonText(`Data produk terlaris penjual Shopee untuk ${cities.length} kota dan kabupaten di Pulau Jawa, dari ${num(totalSellers)} penjual aktif yang dipantau.`),
        url,
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Produk Paling Laris per Kota di Jawa — Data Penjual Shopee | LarisID</title>
<meta name="description" content="Produk terlaris, harga median, dan kategori terkuat penjual Shopee di ${cities.length} kota dan kabupaten di Pulau Jawa — dari ${num(totalSellers)} penjual aktif yang dipantau LarisID. Gratis.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="Produk Paling Laris per Kota — LarisID">
<meta property="og:description" content="Apa yang laku dijual di kotamu? Data nyata penjual Shopee untuk ${cities.length} kota di Jawa.">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Produk Paling Laris per Kota — LarisID">
<meta name="twitter:description" content="Data produk terlaris penjual Shopee untuk ${cities.length} kota di Pulau Jawa.">
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
  ${navHtml()}
</header>
<main class="wide">
  <h1>Produk Paling Laris per Kota</h1>
  <p class="lead">Apa yang benar-benar laku dijual penjual Shopee di kotamu — data nyata dari ${num(totalSellers)} penjual aktif di ${cities.length} kota dan kabupaten di Pulau Jawa. Pakai untuk memilih produk, mau kamu jual di Shopee, TikTok Shop, Tokopedia, Lazada, maupun Blibli.</p>
  <p class="updated">Snapshot data: ${SNAPSHOT_HUMAN} · <a href="/cara-kerja/">metodologi</a></p>

  <div class="summary-box">
    <h2>Buat apa halaman ini?</h2>
    <p>Jualan dari kota sendiri itu keunggulan: ongkir lebih murah, kirim lebih cepat, dan supplier lebih dekat. Halaman per kota menunjukkan produk apa yang terbukti laku dijual penjual di daerahmu — bukan tebakan. Angka "terjual" adalah estimasi dan kami menandainya dengan jujur.</p>
  </div>

${sections}

  <div class="cta-row">
    <a class="btn-primary" href="/?utm_source=kota&amp;utm_campaign=hub">Mulai riset gratis di LarisID</a>
    <a class="btn-secondary" href="/cara-kerja/">Cara kerja &amp; data</a>
  </div>
</main>
<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/harga/">Harga</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

// ---------- sitemap (merge: replace only /kota/ entries) ----------
function mergeSitemap(cities) {
  const file = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');
  // Drop existing /kota/ url blocks.
  xml = xml.replace(/  <url>\s*<loc>[^<]*\/kota\/[^<]*<\/loc>[\s\S]*?<\/url>\n?/g, '');
  const entries = [
    { loc: `${SITE}/kota/`, freq: 'weekly', pri: '0.9' },
    ...cities.map((c) => ({ loc: `${SITE}/kota/${slugify(c.loc)}/`, freq: 'weekly', pri: '0.7' })),
  ];
  const block = entries.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
    <lastmod>${SNAPSHOT}</lastmod>
  </url>`).join('\n');
  xml = xml.replace('</urlset>', block + '\n</urlset>');
  fs.writeFileSync(file, xml);
  return entries.length;
}

// ---------- run ----------
function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cities = [];
  for (const [prov, locs] of Object.entries(PROVINCES)) {
    for (const loc of locs) {
      const d = RAW.cities[loc];
      if (!d || !Array.isArray(d.top) || !d.top.length) {
        console.warn(`SKIP ${loc} (no data in city-data.json — re-run fetch after refresh_seo_city_data)`);
        continue;
      }
      cities.push({ loc, prov, d });
    }
  }

  for (const city of cities) {
    const related = cities
      .filter((c) => c.prov === city.prov && c.loc !== city.loc)
      .sort((a, b) => b.d.sellers - a.d.sellers)
      .slice(0, 6);
    const dir = path.join(OUT_DIR, slugify(city.loc));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(city, related));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hubHtml(cities));
  const n = mergeSitemap(cities);
  console.log(`Done: ${cities.length} city pages + hub; sitemap now carries ${n} /kota/ URLs.`);
}

main();
