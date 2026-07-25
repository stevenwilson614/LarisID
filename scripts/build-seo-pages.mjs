#!/usr/bin/env node
/**
 * Programmatic SEO page generator for LarisID.
 *
 * Builds genuinely data-rich market-overview pages under /riset/<slug>/ from REAL
 * Shopee listing data, plus a /riset/ hub and a regenerated sitemap.xml.
 *
 * Why this exists: per MISSION.md we do not ship thin doorway pages. Every page here
 * is backed by real prices, ratings, review counts and per-region seller data pulled
 * from the LarisID scraper DB. "Terjual" (units sold) is an ESTIMATE and is labelled
 * as such on every page.
 *
 * Inputs (both committed, both produced by SQL over the scraper DB — see docs/seo.md):
 *   scripts/seo-keywords.json  headline stats per keyword (median/range price, rating,
 *                              review total, estimated units). Append-only to keep order
 *                              stable; merge new pulls with scripts/merge-seo-keywords.mjs.
 *   scripts/seo-detail.json    per-keyword detail keyed by keyword string: top-8 products,
 *                              top-6 seller regions, 4 price buckets, store count, etc.,
 *                              all computed over ALL listings per keyword in one query.
 *
 * Per MISSION.md we do not ship thin doorway pages: every page is backed by real prices,
 * ratings and review counts. "Terjual" (units sold) is an ESTIMATE, labelled as such.
 *
 * Run after a scrape refresh:   node scripts/build-seo-pages.mjs
 * Scale up:                     re-run the keyword + detail SQL (docs/seo.md), merge, rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'riset');

const SITE = 'https://larisid.com';
const SNAPSHOT = '2026-06-19';
const SNAPSHOT_HUMAN = '19 Juni 2026';
// Publish date of the beginner-products guide + free calculators. Distinct from SNAPSHOT:
// SNAPSHOT is "when the Shopee data was scraped" and only belongs on data-driven pages
// (/riset/, /kota/). Using it as <lastmod> for pages authored later reports a change date
// BEFORE the page existed, which suppresses recrawl priority and contradicts the page's
// own Article schema. Give hand-authored pages their real publish date instead.
const CONTENT_2026_07 = '2026-07-24';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;

// Google Ads tag — lives on the /riset/ hub (parity with the committed hub; kept
// here so regenerating the hub does not strip conversion tracking). Leaf pages stay gtag-free.
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-862519971"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'AW-862519971');
</script>`;

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seo-keywords.json'), 'utf8'));
const KEYWORDS = data.keywords;
// Per-keyword detail (top products, regions, price buckets, store counts) precomputed
// in SQL over ALL listings per keyword — see scripts/seo-detail.json (regenerate via the
// detail query when refreshing data). Replaces the old curl-based _seo_raw cache.
const DETAIL = JSON.parse(fs.readFileSync(path.join(__dirname, 'seo-detail.json'), 'utf8'));

// ---------- helpers ----------
const idNum = new Intl.NumberFormat('id-ID');
const rp = (n) => 'Rp\u00a0' + idNum.format(Math.round(n || 0));
const num = (n) => idNum.format(Math.round(n || 0));

function slugify(s) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jsonText(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function titleCase(s) { return s.replace(/\b\w/g, (c) => c.toUpperCase()); }
function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '\u2026' : s; }
function kfmt(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace('.0', '') + ' jt';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'rb';
  return num(n);
}

/** Shape precomputed SQL detail (scripts/seo-detail.json) into what the page template
 *  expects. Detail is computed over ALL listings per keyword in the DB, so store counts,
 *  region shares and price buckets reflect the full market — not a fetched sample. */
function getDetail(kw) {
  const raw = DETAIL[kw.keyword];
  if (!raw || !Array.isArray(raw.top) || !raw.top.length) return null;

  const top = raw.top.map((p) => ({
    name: truncate(p.name, 70),
    store: truncate(p.store, 28),
    price: p.price,
    rating: p.rating,
    reviews: p.reviews || 0,
    location: p.location || '\u2014',
  }));

  const soldTotal = Number(raw.soldTotal) || 0;
  const regions = (raw.regions || []).map((r) => ({
    loc: r.loc,
    share: soldTotal > 0 ? (Number(r.sold) || 0) / soldTotal : 0,
  }));

  // Bucket counts come from SQL; labels are derived from the keyword's median / p90.
  const edges = [0, kw.medPrice * 0.5, kw.medPrice, kw.p90Price, Infinity];
  const labels = [
    `< ${rp(edges[1])}`,
    `${rp(edges[1])}\u2013${rp(edges[2])}`,
    `${rp(edges[2])}\u2013${rp(edges[3])}`,
    `> ${rp(edges[3])}`,
  ];
  const counts = Array.isArray(raw.buckets) ? raw.buckets : [0, 0, 0, 0];
  const buckets = labels.map((l, i) => ({ label: l, count: counts[i] || 0 }));
  const bucketMax = Math.max(1, ...buckets.map((b) => b.count));

  return {
    top,
    regions,
    buckets,
    bucketMax,
    stores: raw.stores || 0,
    sampleItems: raw.sampleItems || 0,
    concentration: Number(raw.concentration) || 0,
  };
}

// ---------- page template ----------
function competitionWord(items) {
  if (items < 300) return { word: 'sedang', note: 'masih ada ruang untuk pemain baru yang punya sudut pembeda.' };
  if (items <= 500) return { word: 'ramai', note: 'butuh diferensiasi jelas (harga, bundling, foto, atau layanan) untuk menonjol.' };
  return { word: 'sangat ramai', note: 'pasar padat \u2014 menang lewat margin tipis saja berisiko; cari sudut unik.' };
}

function navHtml() {
  return `<nav class="site-nav">
    <a href="/riset/">Riset Pasar</a>
    <a href="/panduan/">Panduan</a>
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/perbandingan/">Perbandingan</a>
    <a href="/harga/">Harga</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

function pageHtml(kw, d, related) {
  const k = kw.keyword;
  const kTitle = titleCase(k);
  const slug = slugify(k);
  const url = `${SITE}/riset/${slug}/`;
  const comp = competitionWord(kw.n);

  const title = `${kTitle} di Shopee: Harga, Rating & Produk Terlaris (2026)`;
  const desc = `Data pasar ${k} di Shopee: harga median ${rp(kw.medPrice)} (rentang ${rp(kw.minPrice)}\u2013${rp(kw.p90Price)}), ${num(kw.n)} listing dari ${num(d.stores)} toko, rating rata-rata ${kw.rating}. Estimasi terjual ${kfmt(kw.estSold)}+ unit. Riset gratis di LarisID.`;

  const topRows = d.top.map((p) => `          <tr>
            <td><span class="prod-name">${esc(p.name)}</span><span class="note">${esc(p.store)} \u00b7 ${esc(p.location)}</span></td>
            <td>${rp(p.price)}</td>
            <td>${p.rating ? p.rating.toFixed(2) : '\u2014'}</td>
            <td>${num(p.reviews)}</td>
          </tr>`).join('\n');

  const regionRows = d.regions.map((r) => `        <div class="bar-row">
          <span class="bar-label">${esc(r.loc)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round(r.share * 100))}%"></span></span>
          <span class="bar-val">${Math.round(r.share * 100)}%</span>
        </div>`).join('\n');

  const bucketRows = d.buckets.map((b) => `        <div class="bar-row">
          <span class="bar-label">${esc(b.label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Math.round((b.count / d.bucketMax) * 100))}%"></span></span>
          <span class="bar-val">${b.count}</span>
        </div>`).join('\n');

  const relatedHtml = related.length ? `  <div class="card">
    <h2>Riset keyword lain di kategori ${esc(kw.category)}</h2>
    <div class="riset-grid">
${related.map((r) => `      <a class="riset-card" href="/riset/${slugify(r.keyword)}/"><span class="rk">${esc(titleCase(r.keyword))}</span><span class="rm">Median ${rp(r.medPrice)} \u00b7 ${num(r.n)} listing</span></a>`).join('\n')}
    </div>
  </div>` : '';

  // FAQ (honest, data-backed)
  const faqs = [
    {
      q: `Berapa harga umum ${k} di Shopee?`,
      a: `Harga median sekitar ${rp(kw.medPrice)}. Mayoritas penjualan terjadi di rentang ${rp(kw.minPrice)} sampai ${rp(kw.p90Price)} (persentil ke-90). Di bawah harga terendah biasanya margin sudah tidak sehat; di atas ${rp(kw.p90Price)} masuk segmen premium yang pembelinya lebih sedikit.`,
    },
    {
      q: `Seberapa ketat persaingan ${k}?`,
      a: `Kami memantau ${num(kw.n)} listing aktif dari sekitar ${num(d.stores)} toko, dengan rating rata-rata ${kw.rating}. Persaingannya tergolong ${comp.word} \u2014 ${comp.note} Karena rating rata-rata tinggi, pembeli mengharapkan kualitas dan ulasan yang solid.`,
    },
    {
      q: `Apakah ${k} masih layak dijual?`,
      a: `Permintaan jelas ada \u2014 estimasi total terjual ${kfmt(kw.estSold)}+ unit pada produk yang kami pantau. Tapi "laku" tidak otomatis "untung": cek margin di harga median ${rp(kw.medPrice)}, dan jangan ikut perang harga tanpa pembeda. Angka terjual adalah estimasi, bukan janji. Riset detail per produk bisa kamu lakukan gratis di LarisID.`,
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
          { '@type': 'ListItem', position: 2, name: 'Riset Pasar', item: `${SITE}/riset/` },
          { '@type': 'ListItem', position: 3, name: kTitle, item: url },
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
        name: jsonText(`Produk ${k} paling banyak diulas di Shopee`),
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: d.top.length,
        itemListElement: d.top.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: jsonText(p.name) })),
      },
      {
        '@type': 'Dataset',
        name: jsonText(`Data pasar ${k} di Shopee (${SNAPSHOT_HUMAN})`),
        description: jsonText(`Dataset riset pasar untuk "${k}" di Shopee Indonesia: harga median ${rp(kw.medPrice)} (rentang ${rp(kw.minPrice)}\u2013${rp(kw.p90Price)}), ${num(kw.n)} listing dari ${num(d.stores)} toko, rating rata-rata ${kw.rating}, dan estimasi penjualan. Angka harga, rating, dan ulasan adalah data nyata Shopee; "terjual" adalah estimasi.`),
        url,
        identifier: url,
        keywords: [k, kw.category, 'Shopee', 'riset produk', 'e-commerce Indonesia'],
        inLanguage: 'id',
        isAccessibleForFree: true,
        license: `${SITE}/cara-kerja/`,
        datePublished: SNAPSHOT,
        dateModified: SNAPSHOT,
        temporalCoverage: SNAPSHOT,
        creator: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        variableMeasured: [
          { '@type': 'PropertyValue', name: 'Harga median', value: Math.round(kw.medPrice), unitText: 'IDR' },
          { '@type': 'PropertyValue', name: 'Harga terendah', value: Math.round(kw.minPrice), unitText: 'IDR' },
          { '@type': 'PropertyValue', name: 'Harga persentil ke-90', value: Math.round(kw.p90Price), unitText: 'IDR' },
          { '@type': 'PropertyValue', name: 'Rating rata-rata', value: kw.rating, maxValue: 5 },
          { '@type': 'PropertyValue', name: 'Jumlah listing dipantau', value: kw.n },
          { '@type': 'PropertyValue', name: 'Jumlah toko', value: d.stores },
          { '@type': 'PropertyValue', name: 'Estimasi unit terjual', value: Math.round(kw.estSold), description: 'Estimasi, bukan angka resmi Shopee' },
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
<meta property="og:title" content="${esc(kTitle)} di Shopee \u2014 Data Harga & Penjualan">
<meta property="og:description" content="${esc(`Harga median ${rp(kw.medPrice)}, ${num(kw.n)} listing, rating ${kw.rating}. Riset pasar ${k} berbasis data nyata.`)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta property="article:modified_time" content="${SNAPSHOT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(kTitle)} di Shopee \u2014 Data Harga & Penjualan">
<meta name="twitter:description" content="${esc(`Harga median ${rp(kw.medPrice)}, ${num(kw.n)} listing, rating ${kw.rating}. Riset pasar ${k}.`)}">
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
  <p class="cat-pill">${esc(kw.category)} \u00b7 Riset Pasar Shopee</p>
  <h1>Riset Pasar: ${esc(kTitle)} di Shopee</h1>
  <p class="lead">Gambaran nyata pasar <strong>${esc(k)}</strong> di Shopee \u2014 harga, rating, jumlah ulasan, dan sebaran penjual \u2014 dari ${num(kw.n)} listing yang dipantau LarisID.</p>
  <p class="updated">Snapshot data: ${SNAPSHOT_HUMAN} \u00b7 <a href="/cara-kerja/">metodologi &amp; batasan data</a> \u00b7 <a href="/llms.txt">llms.txt</a></p>

  <div class="summary-box">
    <h2>Ringkasan untuk penjual (dan asisten AI)</h2>
    <p>Untuk <strong>${esc(k)}</strong> di Shopee: harga median <strong>${rp(kw.medPrice)}</strong>, mayoritas transaksi di rentang ${rp(kw.minPrice)}\u2013${rp(kw.p90Price)}, rating rata-rata <strong>${kw.rating}</strong>, dari ${num(d.stores)} toko. Estimasi total terjual <strong>${kfmt(kw.estSold)}+ unit</strong> pada produk yang dipantau. Persaingan tergolong <strong>${comp.word}</strong>.</p>
    <ul>
      <li><strong>Patokan harga:</strong> mulai dari harga median ${rp(kw.medPrice)}; cek margin sebelum ikut harga termurah ${rp(kw.minPrice)}.</li>
      <li><strong>Ekspektasi kualitas:</strong> rating rata-rata ${kw.rating} \u2014 pembeli menuntut ulasan dan kualitas baik.</li>
      <li><strong>Catatan:</strong> angka "terjual" adalah <em>estimasi</em>, bukan angka pasti. <a href="/cara-kerja/">Cara kami menghitungnya</a>.</li>
    </ul>
  </div>

  <article>
    <h2>Angka kunci pasar</h2>
    <div class="stat-grid">
      <div class="stat"><div class="stat-num">${num(kw.n)}</div><div class="stat-label">Listing dipantau</div></div>
      <div class="stat"><div class="stat-num">${rp(kw.medPrice)}</div><div class="stat-label">Harga median</div></div>
      <div class="stat"><div class="stat-num">${kw.rating}</div><div class="stat-label">Rating rata-rata</div></div>
      <div class="stat"><div class="stat-num">${num(d.stores)}</div><div class="stat-label">Jumlah toko</div></div>
      <div class="stat"><div class="stat-num">${kfmt(kw.estSold)}+</div><div class="stat-label">Estimasi terjual</div></div>
      <div class="stat"><div class="stat-num">${rp(kw.minPrice)}<span class="muted" style="font-size:.8rem"> \u2013 ${rp(kw.p90Price)}</span></div><div class="stat-label">Rentang harga umum</div></div>
    </div>
    <p class="disclaimer">Harga, rating, dan jumlah ulasan adalah data nyata dari Shopee. Jumlah terjual adalah estimasi berbasis ulasan/snapshot \u2014 lihat <a href="/cara-kerja/">metodologi</a>.</p>

    <h2>Produk paling banyak diulas</h2>
    <p>Diurutkan dari jumlah ulasan terbanyak (sinyal permintaan paling jujur yang tersedia publik).</p>
    <div class="compare-wrap">
      <table class="compare">
        <thead>
          <tr><th>Produk &amp; toko</th><th>Harga</th><th>Rating</th><th>Ulasan</th></tr>
        </thead>
        <tbody>
${topRows}
        </tbody>
      </table>
    </div>

    <h2>Sebaran harga</h2>
    <p>Berapa banyak listing di tiap kelompok harga \u2014 menunjukkan di mana "titik tengah" pasar.</p>
${bucketRows}

    <h2>Dari mana penjual terbanyak</h2>
    <p>Estimasi pangsa penjualan per kota/kabupaten (berdasarkan listing yang dipantau). Berguna untuk memperkirakan ongkir dan kecepatan kirim.</p>
${regionRows}

    <h2>Apa artinya buat kamu</h2>
    <ul>
      <li><strong>Persaingan ${comp.word}.</strong> ${esc(comp.note)}</li>
      <li><strong>Posisi harga.</strong> Harga median ${rp(kw.medPrice)} adalah titik aman untuk uji pasar. Termurah (${rp(kw.minPrice)}) sering berarti margin tipis atau kualitas seadanya; di atas ${rp(kw.p90Price)} pembelinya lebih selektif.</li>
      <li><strong>Konsentrasi.</strong> Sekitar ${Math.round(d.concentration * 100)}% estimasi penjualan (pada sampel) terkumpul di 8 produk teratas \u2014 ${d.concentration > 0.5 ? 'pasar dikuasai sedikit pemain besar, jadi butuh sudut pembeda yang kuat.' : 'penjualan cukup menyebar, peluang masuk masih terbuka.'}</li>
      <li><strong>Langkah berikut.</strong> Buka produk spesifik di LarisID untuk lihat tren penjualan mingguan, Viability Score, dan benchmark kompetitor \u2014 gratis.</li>
    </ul>

    <div class="cta-row">
      <a class="btn-primary" href="/">Riset ${esc(k)} gratis di LarisID</a>
      <a class="btn-secondary" href="/cara-kerja/">Cara kerja &amp; data</a>
      <a class="btn-secondary" href="/riset/">Keyword lain</a>
    </div>
  </article>

  <div class="card">
    <h2>Pertanyaan umum</h2>
${faqHtml}
  </div>

${relatedHtml}
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

function hubHtml(entries) {
  const url = `${SITE}/riset/`;
  // group by category
  const byCat = new Map();
  for (const e of entries) {
    if (!byCat.has(e.category)) byCat.set(e.category, []);
    byCat.get(e.category).push(e);
  }
  const cats = [...byCat.keys()].sort();
  const totalSold = entries.reduce((s, e) => s + e.estSold, 0);

  const sections = cats.map((cat) => {
    const items = byCat.get(cat).sort((a, b) => b.estSold - a.estSold);
    return `  <h2 class="cat-head">${esc(cat)}</h2>
  <div class="riset-grid">
${items.map((e) => `    <a class="riset-card" href="/riset/${slugify(e.keyword)}/"><span class="rk">${esc(titleCase(e.keyword))}</span><span class="rm">Median ${rp(e.medPrice)} \u00b7 ${num(e.n)} listing \u00b7 rating ${e.rating}</span></a>`).join('\n')}
  </div>`;
  }).join('\n');

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Riset Pasar', item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        name: 'Riset Pasar Produk Shopee \u2014 LarisID',
        description: jsonText(`Halaman riset pasar berbasis data nyata untuk ${entries.length} keyword produk populer di Shopee Indonesia.`),
        url,
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="id">
<head>
${GTAG}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Riset Pasar Produk Shopee \u2014 Harga, Penjualan &amp; Tren | LarisID</title>
<meta name="description" content="Riset pasar gratis berbasis data nyata untuk ${entries.length} keyword produk terlaris di Shopee: harga median, jumlah listing, rating, dan estimasi penjualan. Dari LarisID.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="Riset Pasar Produk Shopee \u2014 LarisID">
<meta property="og:description" content="Data harga, penjualan, dan persaingan untuk ${entries.length} keyword produk populer di Shopee Indonesia.">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Riset Pasar Produk Shopee \u2014 LarisID">
<meta name="twitter:description" content="Data harga, penjualan, dan persaingan untuk ${entries.length} keyword produk Shopee.">
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
  <h1>Riset Pasar Produk Shopee</h1>
  <p class="lead">Data harga, rating, dan penjualan nyata untuk ${entries.length} keyword produk populer di Shopee Indonesia. Gratis \u2014 supaya kamu riset dulu sebelum kulakan.</p>
  <p class="updated">Snapshot data: ${SNAPSHOT_HUMAN} \u00b7 estimasi total ${kfmt(totalSold)}+ unit terjual pada produk yang dipantau \u00b7 <a href="/cara-kerja/">metodologi</a></p>

  <div class="summary-box">
    <h2>Buat apa halaman ini?</h2>
    <p>Sebelum modal untuk stok, lihat dulu: berapa harga wajar, seberapa ramai persaingan, dan dari mana penjual lain mengirim. Tiap halaman dibangun dari listing Shopee nyata \u2014 bukan tebakan. Angka "terjual" adalah estimasi dan kami menandainya dengan jujur.</p>
  </div>

${sections}

  <div class="cta-row">
    <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
    <a class="btn-secondary" href="/cara-kerja/">Cara kerja &amp; data</a>
  </div>
</main>
<footer class="site-footer">
  \u00a9 2026 LarisID \u00b7
  <a href="/">Beranda</a>
  <a href="/perbandingan/">Perbandingan</a>
  <a href="/harga/">Harga</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

function buildSitemap(entries) {
  // Carry over the /kota/ entries owned by build-city-pages.mjs so a riset
  // rebuild never drops the city pages from the sitemap.
  let kotaBlocks = '';
  try {
    const cur = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    kotaBlocks = (cur.match(/  <url>\s*<loc>[^<]*\/kota\/[^<]*<\/loc>[\s\S]*?<\/url>/g) || []).join('\n');
  } catch (_) {}
  const staticUrls = [
    { loc: `${SITE}/`, freq: 'weekly', pri: '1.0', mod: '2026-05-30' },
    { loc: `${SITE}/riset/`, freq: 'weekly', pri: '0.9', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/`, freq: 'monthly', pri: '0.8', mod: CONTENT_2026_07 },
    { loc: `${SITE}/panduan/produk-terlaris-untuk-pemula-2026/`, freq: 'monthly', pri: '0.8', mod: CONTENT_2026_07 },
    { loc: `${SITE}/panduan/cara-riset-produk-shopee-untuk-pemula/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/cara-menghitung-margin-dan-hpp/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/analisis-kompetitor-shopee/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/produk-laris-shopee/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/ide-jualan-online-modal-kecil/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/cara-menentukan-harga-jual-produk/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/cara-jualan-di-shopee-untuk-pemula/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/cara-cari-supplier-dan-tempat-kulakan/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/dropship-shopee-cara-kerja-dan-risiko/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/panduan/cara-meningkatkan-penjualan-di-shopee/`, freq: 'monthly', pri: '0.7', mod: SNAPSHOT },
    { loc: `${SITE}/kalkulator/`, freq: 'monthly', pri: '0.8', mod: CONTENT_2026_07 },
    { loc: `${SITE}/kalkulator/margin-hpp/`, freq: 'monthly', pri: '0.75', mod: CONTENT_2026_07 },
    { loc: `${SITE}/kalkulator/biaya-shopee/`, freq: 'monthly', pri: '0.75', mod: CONTENT_2026_07 },
    { loc: `${SITE}/perbandingan/`, freq: 'monthly', pri: '0.9', mod: '2026-05-30' },
    { loc: `${SITE}/perbandingan/alat-riset-produk-shopee-terbaik/`, freq: 'monthly', pri: '0.8', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/larisid-vs-datapinter/`, freq: 'monthly', pri: '0.8', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/larisid-vs-tokpee/`, freq: 'monthly', pri: '0.75', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/larisid-vs-shoptik/`, freq: 'monthly', pri: '0.75', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/aplikasi-cek-produk-terlaris-shopee/`, freq: 'monthly', pri: '0.8', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/riset-produk-shopee-gratis-vs-berbayar/`, freq: 'monthly', pri: '0.8', mod: SNAPSHOT },
    { loc: `${SITE}/perbandingan/alternatif-datapinter-gratis/`, freq: 'monthly', pri: '0.8', mod: SNAPSHOT },
    { loc: `${SITE}/harga/`, freq: 'monthly', pri: '0.85', mod: '2026-05-30' },
    { loc: `${SITE}/tentang/`, freq: 'monthly', pri: '0.8', mod: '2026-05-30' },
    { loc: `${SITE}/cara-kerja/`, freq: 'monthly', pri: '0.8', mod: '2026-05-30' },
    { loc: `${SITE}/privacy/`, freq: 'yearly', pri: '0.3', mod: '2026-05-25' },
  ];
  const all = [
    ...staticUrls,
    ...entries.map((e) => ({ loc: `${SITE}/riset/${slugify(e.keyword)}/`, freq: 'weekly', pri: '0.7', mod: SNAPSHOT })),
  ];
  const body = all.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
    <lastmod>${u.mod}</lastmod>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}${kotaBlocks ? '\n' + kotaBlocks : ''}
</urlset>
`;
}

// ---------- run ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const built = [];
  let i = 0;
  for (const kw of KEYWORDS) {
    i++;
    process.stdout.write(`[${i}/${KEYWORDS.length}] ${kw.keyword} ... `);
    const d = getDetail(kw);
    if (!d) { console.log('SKIP (no detail in seo-detail.json)'); continue; }
    const related = KEYWORDS
      .filter((o) => o.category === kw.category && o.keyword !== kw.keyword)
      .sort((a, b) => b.estSold - a.estSold)
      .slice(0, 6);
    const slug = slugify(kw.keyword);
    const dir = path.join(OUT_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), pageHtml(kw, d, related));
    built.push(kw);
    console.log(`ok (${d.sampleItems} items, ${d.stores} stores)`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hubHtml(built));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), buildSitemap(built));
  console.log(`\nDone: ${built.length} pages + hub + sitemap (${built.length + 7} URLs).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
