#!/usr/bin/env node
/**
 * Builds /tren/<snapshot>/ from scripts/weekly-brief.json.
 *
 * The page date is the coverage snapshot (last day that cleared 10k scrape
 * rows), never "today". If that snapshot already has a brief on disk, this
 * exits 0 and writes nothing — a new date without a new snapshot is the
 * failure ci-static-checks.sh rejects.
 *
 * Growth % matches weeklyStats() in js/gpt-app.js: this window vs the previous
 * window, and only when the badge floors hold and wk_base >= 50. Units are
 * 7-day-equivalent estimates. See docs/terlaris-minggu.md.
 *
 * Run: node scripts/build-weekly-brief.mjs
 * Inputs: scripts/coverage.json, scripts/weekly-brief.json, scripts/seo-keywords.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANALYTICS } from './lib/analytics-head.mjs';
import { EXPOR_TAB } from './lib/expor-tab.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/og-banner.jpg`;
const OUT_DIR = path.join(ROOT, 'tren');
const MANIFEST = path.join(__dirname, 'tren-manifest.json');
const START = '<!-- tren-brief:start -->';
const END = '<!-- tren-brief:end -->';
const MIN_BASE = 50;
const MIN_UNITS = 25;
const MIN_ITEMS = 2;

const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function humanDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${ID_MONTHS[m - 1]} ${y}`;
}
const idNum = new Intl.NumberFormat('id-ID');
const num = (v) => idNum.format(Math.round(Number(v) || 0));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function momentumPct(row) {
  const units = Number(row.wk_units) || 0;
  const prev = row.wk_units_prev == null ? null : Number(row.wk_units_prev);
  const items = Number(row.wk_items) || 0;
  const itemsPrev = Number(row.wk_items_prev) || 0;
  const base = Number(row.wk_base) || 0;
  if (units < MIN_UNITS || items < MIN_ITEMS) return null;
  if (base < MIN_BASE) return null;
  if (prev == null || prev < MIN_UNITS || itemsPrev < MIN_ITEMS) return null;
  return Math.round((units - prev) / Math.max(prev, 1) * 100);
}

function pctLabel(pct) {
  if (pct == null) return '—';
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

function median(nums) {
  const s = nums.filter((n) => Number.isFinite(n)).slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function loadManifest() {
  try {
    const m = readJson(MANIFEST);
    return {
      latest: typeof m.latest === 'string' ? m.latest : '',
      briefs: Array.isArray(m.briefs) ? m.briefs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
    };
  } catch (_) {
    return { latest: '', briefs: [] };
  }
}

const coverage = readJson(path.join(__dirname, 'coverage.json'));
const snapshot = String(coverage.snapshot || '').slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
  console.error(`FAIL: coverage.snapshot is not a date (${coverage.snapshot})`);
  process.exit(1);
}

const manifest = loadManifest();
const liveBriefs = manifest.briefs.filter((d) => fs.existsSync(path.join(OUT_DIR, d, 'index.html')));
const manifestClean = manifest.latest === snapshot
  && liveBriefs.length === manifest.briefs.length
  && liveBriefs.includes(snapshot);
if (manifestClean) {
  console.log(`Brief already published for ${snapshot}. Nothing to write.`);
  process.exit(0);
}

const brief = readJson(path.join(__dirname, 'weekly-brief.json'));
const rows = Array.isArray(brief.rows) ? brief.rows : [];
if (!rows.length) {
  console.error('FAIL: weekly-brief.json has no rows');
  process.exit(1);
}

const published = new Set(
  readJson(path.join(__dirname, 'seo-keywords.json')).keywords.map((k) => k.keyword),
);

const spanDays = median(rows.map((r) => Number(r.wk_span_days)));
const anchorRaw = rows.find((r) => r.wk_anchor_at)?.wk_anchor_at || snapshot;
const anchor = String(anchorRaw).slice(0, 10);
const snapshotHuman = humanDate(snapshot);
const anchorHuman = humanDate(anchor);

function nav(active) {
  const item = (href, label) => `<a href="${href}"${active === href ? ' class="active"' : ''}>${label}</a>`;
  return `<nav class="site-nav">
    <a href="/riset/">Riset Pasar</a>
    <a href="/panduan/">Panduan</a>
    <a href="/kalkulator/">Kalkulator</a>
    <a href="/perbandingan/">Perbandingan</a>
    ${item('/tren/', 'Tren')}
    <a href="/data/">Data</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

function head(title, desc, url, ld, modified) {
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
<link rel="icon" type="image/png" href="/images/brand/appicon-bird.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.webp" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav(url.replace(SITE, ''))}
</header>`;
}

const footer = `<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/tren/">Tren</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/cara-kerja/">Cara Kerja</a>
  <a href="/privacy/">Privasi</a>
</footer>
${EXPOR_TAB}
</body>
</html>
`;

function rowCells(r) {
  const slug = slugify(r.keyword);
  const pct = momentumPct(r);
  const name = published.has(r.keyword)
    ? `<a href="/riset/${esc(slug)}/">${esc(r.keyword)}</a>`
    : esc(r.keyword);
  return { slug, pct, name };
}

const articleRows = rows.map((r) => {
  const c = rowCells(r);
  return `      <tr id="${esc(c.slug)}">
        <td>${c.name}</td>
        <td class="num">${num(r.wk_units)}</td>
        <td class="num">${num(r.wk_span_days)} hari</td>
        <td class="num">${esc(pctLabel(c.pct))}</td>
      </tr>`;
}).join('\n');

const title = `Unit mingguan tertinggi di Shopee (${snapshotHuman})`;
const desc = jt(`Perkiraan unit terjual per 7 hari untuk 20 kata kunci di database LarisID. Halaman ini mengikuti snapshot cakupan ${snapshotHuman}. Unit diukur sampai ${anchorHuman}, dari jendela sekitar ${spanDays} hari, lalu disetarakan ke 7 hari. Bukan angka resmi Shopee.`);
const url = `${SITE}/tren/${snapshot}/`;

const faqs = [
  {
    q: 'Apakah angka ini terjual dalam 7 hari kalender?',
    a: jt(`Bukan. Scrape kami berjarak sekitar ${spanDays} hari, bukan seminggu.
      Unit di tabel adalah perkiraan yang disetarakan ke 7 hari dari jendela yang benar-benar terukur,
      sampai ${anchorHuman}.`),
  },
  {
    q: 'Apa arti persentase di tabel?',
    a: jt(`Persentase membandingkan unit 7 hari pada rentang scrape ini dengan rentang sebelumnya,
      pada kumpulan listing yang sama. Kami menyembunyikannya kalau baseline terlalu kecil
      (di bawah 50 unit kumulatif) atau rentang sebelumnya belum cukup terukur.
      Ini bukan kenaikan terhadap total penjualan seumur hidup.`),
  },
  {
    q: 'Apakah ini data resmi Shopee?',
    a: jt(`Bukan. Unit terjual adalah estimasi dari listing publik yang kami scrape.
      Metodologinya ada di halaman Cara Kerja.`),
  },
];

const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      headline: title,
      datePublished: snapshot,
      dateModified: snapshot,
      inLanguage: 'id',
      author: { '@type': 'Organization', name: 'LarisID', url: SITE },
      mainEntityOfPage: url,
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

const article = `${head(title, desc, url, ld, snapshot)}
<main class="wide">
  <p class="muted"><a href="/tren/">Tren mingguan</a></p>
  <h1>${esc(title)}</h1>
  <p class="lead">Dua puluh kata kunci dengan perkiraan unit mingguan tertinggi. Tanggal halaman ini adalah snapshot cakupan ${snapshotHuman}. Unitnya diukur sampai ${anchorHuman}, dari jendela median ${spanDays} hari, lalu disetarakan ke 7 hari — bukan selisih mentah dua tanggal scrape.</p>
  <p class="updated">Snapshot cakupan: ${snapshotHuman} · jendela ukur sampai ${anchorHuman} · unit adalah perkiraan · <a href="/cara-kerja/">metodologi</a></p>

  <div class="compare-wrap">
    <table class="tren-table">
      <thead>
        <tr>
          <th>Kata kunci</th>
          <th class="num">Unit / 7 hari (perkiraan)</th>
          <th class="num">Jendela ukur</th>
          <th class="num">Vs rentang sebelumnya</th>
        </tr>
      </thead>
      <tbody>
${articleRows}
      </tbody>
    </table>
  </div>
  <p class="muted">Ini kata kunci di database kami, termasuk nama toko yang dipantau sebagai kata kunci, bukan daftar pencarian Google. Tautan membuka halaman riset yang sudah terbit. Persentase kosong (—) berarti baseline atau rentang sebelumnya belum cukup untuk dibandingkan. Satu listing yang meloncat tidak masuk tabel: tiap baris butuh minimal 25 unit setara-7-hari dari minimal 2 listing.</p>

  <h2>Pertanyaan yang sering muncul</h2>
${faqs.map((f) => `  <div class="faq-item">
    <div class="faq-q">${esc(f.q)}</div>
    <div class="faq-a">${esc(f.a)}</div>
  </div>`).join('\n')}

  <div class="cta-row">
    <a class="btn-primary" href="/">Riset kata kunci ini di LarisID</a>
    <a class="btn-secondary" href="/data/">Cakupan data</a>
  </div>
  <p class="disclaimer">Dibuat otomatis dari database LarisID pada ${snapshotHuman}. Bukan laporan resmi Shopee, dan bukan kenaikan omset.</p>
</main>
${footer}`;

const briefs = liveBriefs.includes(snapshot) ? liveBriefs : [...liveBriefs, snapshot];
const listed = briefs.slice().sort().reverse();

const hubItems = listed.map((d) => {
  const label = humanDate(d);
  const current = d === snapshot ? ' — catatan ini' : '';
  return `    <li><a href="/tren/${d}/">${esc(label)}</a>${current}</li>`;
}).join('\n');

const hubTitle = 'Tren mingguan Shopee — catatan data LarisID';
const hubDesc = 'Satu catatan per snapshot data LarisID: kata kunci dengan perkiraan unit mingguan tertinggi. Tanggalnya tanggal snapshot, bukan tanggal hari ini.';
const hubLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: hubTitle,
  dateModified: snapshot,
  inLanguage: 'id',
  url: `${SITE}/tren/`,
};
const hub = `${head(hubTitle, hubDesc, `${SITE}/tren/`, hubLd, snapshot)}
<main class="wide">
  <h1>Tren mingguan</h1>
  <p class="lead">Satu catatan tiap kali snapshot data kami bergerak. Tanggal di judul adalah hari scrape yang lolos ambang, bukan hari halaman ini dibuat ulang.</p>
  <p class="updated">Snapshot terbaru: ${snapshotHuman} · <a href="/cara-kerja/">metodologi</a></p>
  <ul>
${hubItems}
  </ul>
  <div class="cta-row">
    <a class="btn-primary" href="/tren/${snapshot}/">Baca catatan terbaru</a>
    <a class="btn-secondary" href="/riset/">Riset per kata kunci</a>
  </div>
</main>
${footer}`;

const top5 = rows.slice(0, 5).map((r) => {
  const c = rowCells(r);
  const pct = c.pct == null ? '' : ` <span class="hl-tren-note">(${esc(pctLabel(c.pct))} vs rentang sebelumnya)</span>`;
  return `                  <li><a href="/tren/${snapshot}/#${esc(c.slug)}">${esc(r.keyword)}</a> — sekitar ${num(r.wk_units)} unit/7 hari, perkiraan${pct}</li>`;
}).join('\n');

const homeBlock = `<section class="hl-tren" data-tren-brief="${snapshot}" aria-label="Pembaruan data mingguan">
                  <p class="hl-tren-kicker">Pembaruan data · ${esc(snapshotHuman)}</p>
                  <h2>Unit mingguan tertinggi</h2>
                  <ol>
${top5}
                  </ol>
                  <p class="hl-tren-more"><a href="/tren/${snapshot}/">Baca catatan snapshot ${esc(snapshotHuman)}</a></p>
                  <p class="hl-tren-note">Perkiraan, disetarakan ke 7 hari dari jendela sekitar ${spanDays} hari (sampai ${esc(anchorHuman)}). Bukan angka resmi Shopee.</p>
                </section>`;

const indexPath = path.join(ROOT, 'index.html');
const index = fs.readFileSync(indexPath, 'utf8');
const a = index.indexOf(START);
const b = index.indexOf(END);
if (a < 0 || b < a) {
  console.error('FAIL: index.html is missing tren-brief markers');
  process.exit(1);
}
const nextIndex = index.slice(0, a + START.length) + '\n                ' + homeBlock + '\n                ' + index.slice(b);

fs.mkdirSync(path.join(OUT_DIR, snapshot), { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, snapshot, 'index.html'), article);
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), hub);
fs.writeFileSync(MANIFEST, JSON.stringify({ latest: snapshot, briefs }, null, 2) + '\n');
fs.writeFileSync(indexPath, nextIndex);
upsertSitemap(listed, snapshot);

console.log(`Wrote tren/${snapshot}/ and hub. Homepage links snapshot ${snapshot}.`);

function upsertSitemap(dates, latest) {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(sitemapPath, 'utf8');
  xml = xml.replace(/  <url>\s*<loc>https:\/\/larisid\.com\/tren\/[^<]*<\/loc>[\s\S]*?<\/url>\n/g, '');
  const blocks = [
    urlBlock(`${SITE}/tren/`, latest),
    ...dates.map((d) => urlBlock(`${SITE}/tren/${d}/`, d)),
  ].join('\n');
  if (!xml.includes('</urlset>')) {
    console.error('FAIL: sitemap.xml has no urlset close');
    process.exit(1);
  }
  xml = xml.replace('</urlset>', `${blocks}\n</urlset>`);
  fs.writeFileSync(sitemapPath, xml);
}

function urlBlock(loc, mod) {
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${mod}</lastmod>
  </url>`;
}
