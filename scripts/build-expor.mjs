#!/usr/bin/env node
/**
 * Builds /expor/ -- LarisExpor, the export-research sister section of LarisID.
 *
 * Emits, all static and indexable:
 *   expor/produk/<slug>/     one page per corpus product (the organic traffic engine)
 *   expor/produk/            hub, grouped by category
 *   expor/kalkulator/<slug>/ three export calculators + hub
 *   expor/siap-ekspor/       Amazon Global Selling readiness checklist for Indonesians
 *   expor/sitemap.xml        its OWN sitemap -- see the note below
 *
 * Run: node scripts/build-expor.mjs
 *
 * Modelled on scripts/build-tools.mjs (same esc/jt/nav/head shape, same JSON-LD @graph
 * pattern) and it imports ANALYTICS from ./lib/analytics-head.mjs, so every page gets
 * gtag + Clarity + the Cloudflare beacon and shows up in client_events / journey_paths().
 *
 * WHY A SEPARATE SITEMAP: scripts/build-seo-pages.mjs owns and fully regenerates the root
 * sitemap.xml ("this file owns the whole sitemap", line ~50). Anything written there by
 * this generator is silently destroyed on the next weekly SEO refresh. robots.txt carries
 * a second `Sitemap:` line instead; multiple directives are valid for Google and Bing.
 *
 * Fee numbers are NEVER retyped here: js/amazon-fees.js is imported and read from
 * globalThis, so generated copy cannot drift from the live calculators. That is the bug
 * build-tools.mjs has with js/marketplace-fees.js.
 *
 * The Amazon dataset is OPTIONAL. scripts/expor-amazon.json requires a funded DataForSEO
 * account; until it exists every page still builds and ships, carrying trade data and
 * export requirements and saying plainly that Amazon prices are not in yet. The section
 * lights up on the next build once the file appears. Never fabricate a placeholder price.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANALYTICS } from './lib/analytics-head.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'expor');
const SITE = 'https://larisid.com';
const BASE = `${SITE}/expor`;
const OG_IMAGE = `${SITE}/images/Banner.jpg`;
const AUTHOR = 'Steven Wilson';
const TODAY = new Date().toISOString().slice(0, 10);
let PRODUCT_COUNT = 0;

// ---------- shared text helpers ----------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function jt(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function slugSafe(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/** Indonesian decimal comma. */
function num(n, d = 1) {
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(d).replace('.', ',');
}
/** USD magnitude in Indonesian words: $915,8 juta / $2,94 miliar. */
function usdShort(v) {
  if (!Number.isFinite(v) || v <= 0) return '-';
  if (v >= 1e9) return `$${num(v / 1e9, 2)} miliar`;
  if (v >= 1e6) return `$${num(v / 1e6, 1)} juta`;
  if (v >= 1e3) return `$${num(v / 1e3, 0)} ribu`;
  return `$${num(v, 0)}`;
}
function kgShort(kg) {
  if (!Number.isFinite(kg) || kg <= 0) return '-';
  if (kg >= 1e6) return `${num(kg / 1e6, 1)} ribu ton`;
  if (kg >= 1e3) return `${num(kg / 1e3, 1)} ton`;
  return `${num(kg, 0)} kg`;
}

// ---------- shell ----------

function nav(active) {
  const on = (k) => (k === active ? ' class="active"' : '');
  return `<nav class="site-nav">
    <a href="/expor/"${on('home')}>Beranda Ekspor</a>
    <a href="/expor/produk/"${on('produk')}>Produk Ekspor</a>
    <a href="/expor/kalkulator/"${on('kalkulator')}>Kalkulator</a>
    <a href="/expor/siap-ekspor/"${on('siap')}>Siap Ekspor?</a>
    <a href="/" class="nav-cta">Jualan lokal? Ke LarisID</a>
  </nav>`;
}

/** The mirror of the side tab on LarisID pages -- one click back to the local side. */
const TAB_TO_LARIS = `<a class="expor-tab to-laris" href="/" title="Ke LarisID - riset pasar Shopee Indonesia">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
  LarisID
</a>`;

function head(o) {
  const url = o.url;
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${ANALYTICS}
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="robots" content="index, follow">
<meta name="author" content="${esc(AUTHOR)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisExpor">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/png" href="/images/brand/appicon-red.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
<link rel="stylesheet" href="/styles/expor.css">
${o.headExtra || ''}
<script type="application/ld+json">
${JSON.stringify(o.ld, null, 2)}
</script>
</head>
<body class="expor">
<header class="site-header">
  <a class="logo" href="/expor/">Laris<span>Expor</span></a>
  ${nav(o.active)}
</header>`;
}

const FOOTER = `<footer class="site-footer">
  &copy; 2026 LarisExpor &middot; bagian dari LarisID &middot;
  <a href="/expor/">Beranda Ekspor</a>
  <a href="/expor/produk/">Produk</a>
  <a href="/expor/kalkulator/">Kalkulator</a>
  <a href="/expor/siap-ekspor/">Siap Ekspor?</a>
  <a href="/">LarisID</a>
  <a href="/privacy/">Privasi</a>
</footer>
${TAB_TO_LARIS}
</body>
</html>
`;

function breadcrumb(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem', position: i + 1, name: t.name, item: t.url,
    })),
  };
}

// ---------- the interest probe: the actual validation instrument ----------

const PROBE_OPTIONS = [
  ['produk-harga', 'Cari produk & tahu harganya di luar negeri'],
  ['dokumen-izin', 'Dokumen, HS code & izin ekspor'],
  ['cari-buyer', 'Cari pembeli / importir'],
  ['ongkos-kirim', 'Hitung ongkos kirim & margin'],
  ['belum-tahu', 'Belum tahu harus mulai dari mana'],
];

function probeForm(context) {
  return `  <div class="probe" id="probe">
    <h3>Mau data ekspor yang lebih lengkap?</h3>
    <p class="probe-sub">LarisExpor masih tahap awal. Tinggalkan email dan satu jawaban &mdash; itu yang menentukan bagian mana yang kami bangun dulu.</p>
    <form id="probe-form" data-context="${esc(context)}">
      <label for="probe-email">Email</label>
      <input type="email" id="probe-email" name="email" required autocomplete="email" placeholder="nama@email.com">
      <label for="probe-need">Apa yang paling kamu butuhkan untuk mulai ekspor?</label>
      <select id="probe-need" name="need" required>
        <option value="">Pilih satu&hellip;</option>
${PROBE_OPTIONS.map(([v, l]) => `        <option value="${v}">${esc(l)}</option>`).join('\n')}
      </select>
      <label for="probe-note">Usaha kamu sekarang (opsional)</label>
      <textarea id="probe-note" name="note" maxlength="500" placeholder="Contoh: bikin tas rotan di Cirebon, sudah jualan di Shopee"></textarea>
      <button type="submit">Kirim</button>
      <p class="probe-msg" id="probe-msg" role="status" aria-live="polite"></p>
    </form>
  </div>`;
}

const PROBE_JS = `<script src="/js/laris-auth.js?v=20260914a" defer></script>
<script defer src="/js/expor-probe.js?v=20260914a"></script>`;

const HUB_JS = `<script src="/js/laris-auth.js?v=20260914a" defer></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  try {
    var host = location.hostname || '';
    var local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    var flag = false;
    try { flag = localStorage.getItem('laris_expor_lab') === '1'; } catch (_) {}
    var email = '';
    try {
      var u = window.LARIS_AUTH && LARIS_AUTH.user && LARIS_AUTH.user();
      email = String(u && u.email || '').toLowerCase();
    } catch (_) {}
    var staff = email === 'stevenwilson614@gmail.com';
    var signed = window.LARIS_AUTH && typeof LARIS_AUTH.isSignedIn === 'function' && LARIS_AUTH.isSignedIn();
    if ((local || flag || staff) && signed) location.replace('/?pasar=expor');
  } catch (_) {}
});
</script>
<script defer src="/js/expor-probe.js?v=20260914a"></script>`;

// ---------- product page ----------

function regChips(p) {
  const chips = [];
  if (p.duty === 'bebas') chips.push(['ok', 'Bea keluar', 'Bebas']);
  else if (p.duty === 'ada') chips.push(['stop', 'Bea keluar', 'Dikenakan']);
  else chips.push(['warn', 'Bea keluar', 'Perlu dicek']);

  if (p.lartas === 'tidak') chips.push(['ok', 'Lartas', 'Tidak dibatasi']);
  else if (p.lartas === 'ya') chips.push(['stop', 'Lartas', 'Dibatasi / dilarang']);
  else chips.push(['warn', 'Lartas', 'Perlu dicek']);

  for (const izin of p.izin || []) chips.push(['warn', 'Dokumen wajib', izin]);
  return `    <div class="reg-row">
${chips.map(([c, k, v]) => `      <span class="reg-chip ${c}">${esc(k)}: <b>${esc(v)}</b></span>`).join('\n')}
    </div>`;
}

function destinationBars(t) {
  if (!t.destinations || !t.destinations.length) return '';
  const max = t.destinations[0].value || 1;
  const rows = t.destinations.map((d) => {
    const w = Math.max(1, Math.round(((d.value || 0) / max) * 100));
    return `      <div class="bar-row">
        <span class="bar-label">${esc(d.nama)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${w}%"></span></span>
        <span class="bar-val">${usdShort(d.value)}${d.share != null ? ` &middot; ${num(d.share, 1)}%` : ''}</span>
      </div>`;
  }).join('\n');
  const un = t.unallocated_share > 1
    ? `\n      <p class="unalloc">${num(t.unallocated_share, 1)}% (${usdShort(t.unallocated_value)}) tercatat tanpa negara tujuan yang jelas &mdash; pos residual seperti &ldquo;Areas, nes&rdquo;, <i>bunkers</i>, atau kawasan bebas. Kami tidak menghitungnya sebagai negara tujuan.</p>`
    : '';
  return `    <div class="dest-list">
${rows}
    </div>${un}`;
}

function tradeSection(p, t) {
  if (!t || !t.has_data) {
    return `  <div class="sec">
    <h2><span class="sec-n">1</span> Permintaan global</h2>
    <div class="card">
      <p>UN Comtrade belum mencatat ekspor Indonesia untuk kode HS ini, jadi kami tidak punya angka permintaan yang bisa dipertanggungjawabkan untuk ${esc(p.nama)}.</p>
      <p class="disclaimer">Tidak adanya data bukan berarti tidak ada permintaan &mdash; bisa jadi produknya masuk kode HS yang lebih luas, atau volumenya belum terlaporkan.</p>
    </div>
  </div>`;
  }

  const hsNote = t.hs_level < 6
    ? `Angka di bawah ini berlaku untuk kode HS ${t.hs_used} (${esc(t.hs_desc || '-')}) pada tingkat ${t.hs_level} digit, karena kode 6 digit untuk produk ini belum punya data ekspor terlapor. Cakupannya lebih luas dari satu produk.`
    : `Angka di bawah ini berlaku untuk seluruh ekspor Indonesia pada kode HS ${t.hs_used} (${esc(t.hs_desc || '-')}) &mdash; satu kode HS selalu mencakup lebih dari satu jenis produk dan lebih dari satu penjual.`;

  const top = t.destinations && t.destinations[0];
  const stats = [
    [usdShort(t.world_value), `Ekspor Indonesia ${t.year}`, `ke ${t.destinations_total} negara`],
    top ? [esc(top.nama), 'Pembeli terbesar', `${num(top.share, 1)}% dari total`] : null,
    t.usd_per_kg ? [`$${num(t.usd_per_kg, 2)}`, 'Harga ekspor rata-rata', 'per kg, nilai FOB'] : null,
    t.growth_pct != null ? [`${t.growth_pct > 0 ? '+' : ''}${num(t.growth_pct, 1)}%`, `Perubahan ${t.trend[0].year}&ndash;${t.year}`, 'nilai ekspor'] : null,
    t.world_net_kg ? [kgShort(t.world_net_kg), 'Volume', `diekspor ${t.year}`] : null,
  ].filter(Boolean);

  return `  <div class="sec">
    <h2><span class="sec-n">1</span> Permintaan global</h2>
    <p class="sec-lead">Berapa banyak dunia benar-benar membeli produk ini dari Indonesia, dan ke mana perginya.</p>
    <div class="card">
      <div class="stat-grid">
${stats.map(([n, l, s]) => `        <div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div>${s ? `<div class="stat-sub">${s}</div>` : ''}</div>`).join('\n')}
      </div>
${destinationBars(t)}
      <p class="src-line">Sumber: <a href="https://comtradeplus.un.org/" rel="nofollow noopener" target="_blank">UN Comtrade</a>, ekspor Indonesia ${t.year}. ${hsNote}</p>
    </div>
  </div>`;
}

function amazonOmset(x) {
  const price = Number(x && x.price);
  const bought = x && x.bought_past_month;
  if (!Number.isFinite(price) || bought == null || !Number.isFinite(Number(bought))) return null;
  return price * Number(bought);
}

function amazonSection(p, a) {
  if (!a) {
    return `  <div class="sec">
    <h2><span class="sec-n">2</span> Harga di Amazon</h2>
    <div class="card">
      <p>Sampel harga Amazon untuk ${esc(p.nama)} belum kami ambil, jadi belum ada angka yang bisa ditampilkan di sini.</p>
      <p class="disclaimer">Kami tidak menampilkan harga perkiraan. Kalau bagian ini yang kamu butuhkan, bilang lewat form di bawah &mdash; itu yang menentukan urutan pengerjaannya.</p>
    </div>
  </div>`;
  }
  const withBought = Number(a.listings_with_bought) || (a.top_asins || []).filter((x) => x.bought_past_month != null).length;
  const stats = [
    a.search_volume ? [Number(a.search_volume).toLocaleString('id-ID'), 'Pencarian / bulan', 'di Amazon US'] : null,
    a.price_median ? [`$${num(a.price_median, 2)}`, 'Harga tengah', a.price_min && a.price_max ? `kisaran $${num(a.price_min, 2)}&ndash;$${num(a.price_max, 2)}` : ''] : null,
    a.reviews_median != null ? [Number(a.reviews_median).toLocaleString('id-ID'), 'Median ulasan', 'indikator persaingan, bukan penjualan'] : null,
    withBought ? [String(withBought), 'Listing dengan badge terjual/bln', 'Amazon sering menyembunyikan badge'] : null,
    a.results_count ? [Number(a.results_count).toLocaleString('id-ID'), 'Produk bersaing', 'di hasil pencarian'] : null,
  ].filter(Boolean);

  const asins = (a.top_asins || []).length ? `      <div class="tbl-wrap">
        <table class="expor-tbl">
          <thead><tr><th>Produk teratas di Amazon</th><th>Harga</th><th>Terjual/bln</th><th>Omset/bln</th><th>Rating</th><th>Ulasan</th></tr></thead>
          <tbody>
${a.top_asins.slice(0, 5).map((x) => {
    const omset = amazonOmset(x);
    const bought = x.bought_past_month;
    const omsetTxt = omset != null
      ? ('$' + Math.round(omset).toLocaleString('id-ID') + ' <span class="muted">perkiraan</span>')
      : '—';
    return `            <tr><td>${esc(String(x.title || '').slice(0, 70))}</td><td class="num">${x.price ? '$' + num(x.price, 2) : '-'}</td><td class="num">${bought != null ? Number(bought).toLocaleString('id-ID') + '+' : '—'}</td><td class="num">${omsetTxt}</td><td class="num">${x.rating ? num(x.rating, 1) : '-'}</td><td class="num">${x.reviews != null ? Number(x.reviews).toLocaleString('id-ID') : '-'}</td></tr>`;
  }).join('\n')}
          </tbody>
        </table>
      </div>` : '';

  return `  <div class="sec">
    <h2><span class="sec-n">2</span> Harga di Amazon</h2>
    <p class="sec-lead">Harga jual dan tingkat persaingan untuk kata kunci &ldquo;${esc(p.kw)}&rdquo; di Amazon US.</p>
    <div class="card">
      <div class="stat-grid">
${stats.map(([n, l, s]) => `        <div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div>${s ? `<div class="stat-sub">${s}</div>` : ''}</div>`).join('\n')}
      </div>
${asins}
      <p class="src-line">Sumber: sampel Amazon US${a.fetched_at ? `, diambil ${esc(a.fetched_at)}` : ''}. Amazon tidak mempublikasikan unit terjual. Kolom terjual/bln memakai badge Amazon &ldquo;bought in past month&rdquo; (lantai kisaran, misalnya 100+ jadi 100). Omset/bulan = harga &times; badge itu, <b>selalu perkiraan</b>. Amazon tidak punya field negara asal &mdash; ini listing AS untuk kata kunci ekspor Indonesia, bukan bukti dibuat di Indonesia. Jumlah ulasan adalah indikator persaingan, bukan penjualan.</p>
    </div>
  </div>`;
}

function calcSection(p, a) {
  const cat = globalThis.LARIS_AMZ.catFor(p.kategori);
  const q = new URLSearchParams({ kat: cat });
  if (a && a.price_median) q.set('harga', String(a.price_median.toFixed(2)));
  const href = `/expor/kalkulator/margin-amazon/?${q.toString()}`;
  const ref = globalThis.LARIS_AMZ.REFERRAL[cat];
  const pct = ref.bands[ref.bands.length - 1].pct;
  return `  <div class="sec">
    <h2><span class="sec-n">3</span> Hitung untungmu</h2>
    <p class="sec-lead">Harga jual di Amazon bukan pendapatan. Komisi, FBA, dan ongkos kirim memotongnya lebih dalam dari dugaan banyak orang.</p>
    <div class="card">
      <p>${esc(p.nama)} masuk kategori Amazon <b>${esc(ref.label)}</b>, dengan komisi rujukan hingga <b>${num(pct, 0)}%</b>${ref.note ? ` &mdash; ${esc(ref.note)}` : ''}</p>
      <div class="cta-row">
        <a class="btn-primary" href="${href}">Hitung margin ekspor${a && a.price_median ? ' (harga terisi otomatis)' : ''}</a>
        <a class="btn-secondary" href="/expor/kalkulator/harga-jual-amazon/?kat=${cat}">Cari harga jual ideal</a>
        <a class="btn-secondary" href="/expor/kalkulator/biaya-kirim-ekspor/">Hitung ongkos kirim</a>
      </div>
    </div>
  </div>`;
}

function requirementSection(p, t) {
  const desc = (t && t.hs_desc_exact) || null;
  return `  <div class="sec">
    <h2><span class="sec-n">4</span> Syarat ekspor</h2>
    <p class="sec-lead">Kode HS menentukan bea, izin, dan dokumen yang diminta di pelabuhan.</p>
    <div class="card">
      <p><span class="hs-badge">HS ${esc(p.hs)}</span>${desc ? ` &mdash; ${esc(desc)}` : ''}</p>
${regChips(p)}
      <p class="disclaimer">Status di atas adalah titik awal hasil kurasi, <b>bukan nasihat hukum</b>. Ketentuan berubah dan berlaku pada kode HS 8 digit, bukan 6. Selalu konfirmasi di INSW sebelum mengirim barang.</p>
      <div class="cta-row">
        <a class="btn-secondary" href="https://insw.go.id/" rel="nofollow noopener" target="_blank">Cek HS ${esc(p.hs)} di INSW</a>
        <a class="btn-secondary" href="/expor/siap-ekspor/">Cek kesiapanmu jualan di Amazon</a>
      </div>
    </div>
  </div>`;
}

function relatedSection(p, siblings) {
  if (!siblings.length) return '';
  return `  <div class="card">
    <h2>Produk lain di ${esc(p.kategori)}</h2>
    <div class="riset-grid">
${siblings.slice(0, 6).map((s) => `      <a class="riset-card" href="/expor/produk/${s.slug}/"><span class="rk">${esc(s.nama)}</span><span class="rm">HS ${esc(s.hs)} &middot; ${esc(s.wilayah)}</span></a>`).join('\n')}
    </div>
  </div>`;
}

function produkPage(p, t, a, siblings) {
  const url = `${BASE}/produk/${p.slug}/`;
  const h1 = `Ekspor ${p.nama}`;
  const title = `Ekspor ${p.nama}: Permintaan Global, Harga & Syarat | LarisExpor`;

  const descBits = [`Data ekspor ${p.nama} dari Indonesia.`];
  if (t && t.has_data) {
    const top = t.destinations && t.destinations[0];
    descBits.push(`Indonesia mengekspor ${usdShort(t.world_value)} pada ${t.year} ke ${t.destinations_total} negara.`);
    if (top) descBits.push(`Pembeli terbesar: ${top.nama} (${num(top.share, 1)}%).`);
  }
  descBits.push(`Cek HS ${p.hs}, syarat ekspor, dan hitung marginnya. Gratis.`);
  const desc = jt(descBits.join(' ')).slice(0, 300);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url: `${BASE}/` },
        { name: 'Produk Ekspor', url: `${BASE}/produk/` },
        { name: h1, url },
      ]),
      {
        '@type': 'Article',
        headline: jt(title), description: jt(desc), url, inLanguage: 'id',
        datePublished: TODAY, dateModified: TODAY,
        author: { '@type': 'Person', name: AUTHOR },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } },
        about: { '@type': 'Thing', name: p.nama },
        isAccessibleForFree: true,
      },
      ...(t && t.has_data ? [{
        '@type': 'Dataset',
        name: jt(`Ekspor ${p.nama} dari Indonesia (HS ${t.hs_used}, ${t.year})`),
        description: jt(`Nilai ekspor Indonesia dan negara tujuan untuk kode HS ${t.hs_used}${t.hs_desc ? ` (${t.hs_desc})` : ''} tahun ${t.year}.`),
        url, inLanguage: 'id', isAccessibleForFree: true,
        creator: { '@type': 'Organization', name: 'UN Comtrade', url: 'https://comtradeplus.un.org/' },
        temporalCoverage: String(t.year),
      }] : []),
    ],
  };

  return `${head({ url, title, desc, ld, active: 'produk', headExtra: PROBE_JS })}
<main class="wide">
  <p class="cat-pill">${esc(p.kategori)}</p>
  <h1>${esc(h1)}</h1>
  <p class="lead">Dibuat atau disumber di ${esc(p.wilayah)}. Halaman ini menyatukan tiga hal yang biasanya terpisah: seberapa besar permintaan dunia, berapa harganya di luar, dan dokumen apa yang perlu kamu siapkan.</p>
  <p class="updated">Diperbarui ${TODAY} &middot; gratis &middot; <a href="/expor/">apa itu LarisExpor</a></p>

${tradeSection(p, t)}
${amazonSection(p, a)}
${calcSection(p, a)}
${requirementSection(p, t)}
${probeForm(`produk:${p.slug}`)}
${relatedSection(p, siblings)}
</main>
${FOOTER}`;
}

// ---------- product hub ----------

function produkHub(products, tradeBySlug) {
  const url = `${BASE}/produk/`;
  const cats = [];
  for (const p of products) {
    let c = cats.find((x) => x.name === p.kategori);
    if (!c) { c = { name: p.kategori, items: [] }; cats.push(c); }
    c.items.push(p);
  }

  const withData = products.filter((p) => tradeBySlug.get(p.slug)?.has_data);
  const totalValue = withData.reduce((a, p) => {
    const t = tradeBySlug.get(p.slug);
    return a + (t && t.hs_level === 6 ? t.world_value : 0);
  }, 0);

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url: `${BASE}/` },
        { name: 'Produk Ekspor', url },
      ]),
      { '@type': 'CollectionPage', name: 'Produk Ekspor Indonesia: Permintaan, Harga & Syarat', url, inLanguage: 'id',
        description: jt(`Data ekspor ${products.length} produk yang bisa dibuat atau disumber di Indonesia -- nilai ekspor, negara pembeli terbesar, kode HS, dan syarat ekspornya.`) },
      { '@type': 'ItemList', numberOfItems: products.length, itemListElement: products.map((p, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${BASE}/produk/${p.slug}/`, name: jt(p.nama),
      })) },
    ],
  };

  const sections = cats.map((c) => `  <div class="sec">
    <h2>${esc(c.name)} <span class="muted" style="font-weight:600;font-size:.85rem">${c.items.length} produk</span></h2>
    <div class="riset-grid">
${c.items.map((p) => {
    const t = tradeBySlug.get(p.slug);
    const sub = t && t.has_data
      ? `${usdShort(t.world_value)} &middot; ${esc(t.destinations[0]?.nama || '-')}`
      : `HS ${esc(p.hs)} &middot; ${esc(p.wilayah)}`;
    return `      <a class="riset-card" href="/expor/produk/${p.slug}/"><span class="rk">${esc(p.nama)}</span><span class="rm">${sub}</span></a>`;
  }).join('\n')}
    </div>
  </div>`).join('\n');

  return `${head({
    url, active: 'produk', ld,
    title: `${products.length} Produk Ekspor Indonesia: Permintaan Global, Harga & Syarat | LarisExpor`,
    desc: jt(`Data ekspor ${products.length} produk Indonesia dari UN Comtrade: nilai ekspor, negara pembeli terbesar, kode HS, bea keluar, dan syarat dokumennya. Gratis.`),
  })}
<main class="wide">
  <p class="cat-pill">Data Ekspor</p>
  <h1>Produk Ekspor Indonesia</h1>
  <p class="lead">${products.length} produk yang bisa kamu buat atau sumber di Indonesia, masing-masing dengan angka permintaan dunia yang nyata, kode HS, dan syarat ekspornya. ${withData.length} di antaranya punya data ekspor terlapor di UN Comtrade${totalValue > 0 ? `, bernilai total ${usdShort(totalValue)} per tahun pada kode HS 6 digit` : ''}.</p>
  <p class="updated">Diperbarui ${TODAY} &middot; sumber UN Comtrade &middot; gratis, tanpa login</p>
${sections}
${probeForm('hub:produk')}
</main>
${FOOTER}`;
}

// ---------- calculators ----------

const CALC_CSS = `<style>
  .calc{background:#fff;border:1px solid var(--border);border-radius:14px;padding:22px;margin:18px 0}
  .calc-field{margin:0 0 14px}
  .calc-field label{display:block;font-weight:600;font-size:.88rem;margin-bottom:6px;color:var(--navy)}
  .calc-field .hint{font-weight:400;color:var(--tm);font-size:.78rem}
  .calc-field input,.calc-field select{width:100%;box-sizing:border-box;padding:11px 12px;font-size:1rem;font-family:inherit;border:1px solid #CBD5E1;border-radius:9px;background:#fff}
  .calc-field input:focus,.calc-field select:focus{outline:2px solid var(--orange);outline-offset:1px;border-color:var(--orange)}
  .calc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:0 14px}
  .calc-out{margin-top:6px;border-top:1px dashed var(--border);padding-top:16px}
  .calc-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:.92rem;border-bottom:1px solid #F1F5F4}
  .calc-row span:last-child{font-weight:600;color:var(--navy);text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .calc-row.neg span:last-child{color:#B91C1C}
  .calc-total{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-top:12px;padding:14px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px}
  .calc-total .lbl{font-weight:700;color:var(--navy)}
  .calc-total .val{font-weight:800;font-size:1.35rem;color:#B91C1C;white-space:nowrap}
  .calc-total.good{background:#ECFDF5;border-color:#A7F3D0}
  .calc-total.good .val{color:#047857}
  .calc-sub{font-size:.8rem;color:var(--tm);margin-top:6px}
  /* .calc-row sets display:flex, which outranks the [hidden] attribute's UA display:none.
     Without this every "hidden" row stays on screen -- the exact bug that kept the
     SPayLater row visible in the LarisID marketplace calculator. */
  .calc-row[hidden],.calc-field[hidden],.calc-total[hidden]{display:none!important}
</style>`;

function toolPage(t) {
  const url = `${BASE}/kalkulator/${t.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url: `${BASE}/` },
        { name: 'Kalkulator', url: `${BASE}/kalkulator/` },
        { name: t.h1, url },
      ]),
      { '@type': 'WebApplication', name: jt(t.title), description: jt(t.desc), url,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'id',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` } },
      ...(t.faqs?.length ? [{
        '@type': 'FAQPage',
        mainEntity: t.faqs.map((f) => ({ '@type': 'Question', name: jt(f.q), acceptedAnswer: { '@type': 'Answer', text: jt(f.a) } })),
      }] : []),
    ],
  };
  const faqHtml = t.faqs?.length ? `  <div class="card">
    <h2>Pertanyaan umum</h2>
${t.faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${f.a}</p>
    </div>`).join('\n')}
  </div>` : '';

  return `${head({ url, title: t.title, desc: t.desc, ld, active: 'kalkulator', headExtra: CALC_CSS + PROBE_JS })}
<main>
  <p class="cat-pill">Kalkulator Ekspor Gratis</p>
  <h1>${esc(t.h1)}</h1>
  <p class="lead">${t.lead}</p>
  <p class="updated">Tarif per ${esc(globalThis.LARIS_AMZ.UPDATED)} &middot; gratis, jalan di browser &middot; tanpa login</p>

  <article>
${t.body}
    <div class="cta-row">
      <a class="btn-primary" href="/expor/produk/">Lihat data ${PRODUCT_COUNT} produk ekspor</a>
      <a class="btn-secondary" href="/expor/kalkulator/">Kalkulator lainnya</a>
      <a class="btn-secondary" href="/expor/siap-ekspor/">Syarat jualan di Amazon</a>
    </div>
  </article>
${faqHtml}
${probeForm(`kalkulator:${t.slug}`)}
</main>
<script src="/js/amazon-fees.js?v=20260914a"></script>
<script>
${t.js}
</script>
${FOOTER}`;
}

function toolHub(tools) {
  const url = `${BASE}/kalkulator/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url: `${BASE}/` },
        { name: 'Kalkulator', url },
      ]),
      { '@type': 'CollectionPage', name: 'Kalkulator Ekspor Gratis', url, inLanguage: 'id',
        description: jt('Kalkulator gratis untuk eksportir Indonesia: margin jualan di Amazon, harga jual ideal, dan ongkos kirim ekspor.') },
      { '@type': 'ItemList', itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${BASE}/kalkulator/${t.slug}/`, name: jt(t.h1) })) },
    ],
  };
  return `${head({
    url, active: 'kalkulator', ld,
    title: 'Kalkulator Ekspor Gratis: Margin Amazon, Harga Jual & Ongkos Kirim | LarisExpor',
    desc: 'Kalkulator gratis untuk eksportir Indonesia: hitung margin jualan di Amazon setelah komisi dan FBA, cari harga jual ideal dari HPP, dan estimasi ongkos kirim ekspor. Jalan di browser.',
  })}
<main class="wide">
  <p class="cat-pill">Kalkulator Gratis</p>
  <h1>Kalkulator Ekspor</h1>
  <p class="lead">Harga jual di Amazon bukan pendapatan. Komisi rujukan, biaya FBA, dan ongkos kirim memotongnya lebih dalam dari dugaan banyak orang &mdash; ketiga alat ini menunjukkan sisa untungmu dalam rupiah.</p>
  <div class="riset-grid">
${tools.map((t) => `    <a class="riset-card" href="/expor/kalkulator/${t.slug}/"><span class="rk">${esc(t.h1)}</span><span class="rm">${esc(t.cardNote)}</span></a>`).join('\n')}
  </div>
  <div class="cta-row">
    <a class="btn-primary" href="/expor/produk/">Lihat data produk ekspor</a>
    <a class="btn-secondary" href="/expor/siap-ekspor/">Cek kesiapan ekspormu</a>
  </div>
</main>
${FOOTER}`;
}

// ---------- calculator bodies (numbers always from LARIS_AMZ) ----------

function catOptions() {
  return Object.entries(globalThis.LARIS_AMZ.REFERRAL).map(([k, v]) =>
    `        <option value="${esc(k)}">${esc(v.label)}</option>`).join('\n');
}
function fbaOptions() {
  return globalThis.LARIS_AMZ.FBA.bands.map((b) =>
    `        <option value="${esc(b.key)}">${esc(b.label)}</option>`).join('\n');
}

function buildTools() {
  const A = globalThis.LARIS_AMZ;
  return [
    {
      slug: 'margin-amazon',
      title: 'Kalkulator Margin Amazon: Sisa Untung Setelah Komisi, FBA & Ongkir | LarisExpor',
      desc: 'Hitung sisa untung jualan di Amazon US setelah komisi rujukan, biaya FBA, dan ongkos kirim dari Indonesia. Tarif per ' + A.UPDATED + ', jalan di browser, gratis.',
      h1: 'Kalkulator Margin Amazon',
      cardNote: 'Harga jual dikurangi komisi, FBA, dan ongkir — sisa dalam rupiah',
      lead: 'Harga yang pembeli lihat di Amazon bukan yang masuk rekeningmu. Isi harga jual, kategori, dan modal — sisa untung tampil dalam dolar dan rupiah.',
      body: `    <div class="calc">
      <div class="calc-grid">
        <div class="calc-field">
          <label for="am-harga">Harga jual di Amazon (USD)</label>
          <input type="number" id="am-harga" inputmode="decimal" min="0" step="0.01" placeholder="mis. 24.99">
        </div>
        <div class="calc-field">
          <label for="am-kat">Kategori Amazon</label>
          <select id="am-kat">
${catOptions()}
          </select>
        </div>
        <div class="calc-field">
          <label for="am-fba">Ukuran FBA <span class="hint">tarif fulfilment per unit</span></label>
          <select id="am-fba">
${fbaOptions()}
          </select>
        </div>
        <div class="calc-field" id="am-berat-field" hidden>
          <label for="am-berat">Berat (lb) <span class="hint">untuk ukuran bulky / extra-large</span></label>
          <input type="number" id="am-berat" inputmode="decimal" min="0" step="0.1" value="5">
        </div>
        <div class="calc-field">
          <label for="am-kirim">Ongkos kirim per unit (USD) <span class="hint">titik awal, bukan quote</span></label>
          <input type="number" id="am-kirim" inputmode="decimal" min="0" step="0.01">
        </div>
        <div class="calc-field">
          <label for="am-hpp">HPP / modal per unit (Rp)</label>
          <input type="number" id="am-hpp" inputmode="numeric" min="0" placeholder="mis. 45000">
        </div>
        <div class="calc-field">
          <label for="am-fx">Kurs Rp per USD <span class="hint">${esc(A.FX.note)}</span></label>
          <input type="number" id="am-fx" inputmode="numeric" min="1">
        </div>
      </div>
      <div class="calc-out" id="am-out" hidden>
        <div class="calc-row"><span>Komisi rujukan Amazon</span><span id="am-ref">–</span></div>
        <div class="calc-row"><span>Biaya FBA (termasuk surcharge 3,5%)</span><span id="am-fba-out">–</span></div>
        <div class="calc-row"><span>Ongkos kirim per unit</span><span id="am-kirim-out">–</span></div>
        <div class="calc-row"><span>HPP dalam USD</span><span id="am-hpp-out">–</span></div>
        <div class="calc-row"><span>Margin dari harga jual</span><span id="am-mg">–</span></div>
        <div class="calc-total" id="am-net-box"><span class="lbl">Sisa untung per unit</span><span class="val" id="am-net">–</span></div>
        <p class="calc-sub" id="am-note"></p>
      </div>
    </div>
    <p class="disclaimer">Tarif rujukan dari <a href="${esc(A.REFERRAL_SRC_URL)}" rel="nofollow noopener" target="_blank">${esc(A.REFERRAL_SRC)}</a>. ${esc(A.FBA.note)} ${esc(A.FREIGHT.note)}</p>`,
      js: `(function(){
  var A = window.LARIS_AMZ; if (!A) return;
  var q = new URLSearchParams(location.search);
  var kat = document.getElementById('am-kat');
  var harga = document.getElementById('am-harga');
  var fba = document.getElementById('am-fba');
  var berat = document.getElementById('am-berat');
  var beratField = document.getElementById('am-berat-field');
  var kirim = document.getElementById('am-kirim');
  var hpp = document.getElementById('am-hpp');
  var fx = document.getElementById('am-fx');
  var out = document.getElementById('am-out');
  var note = document.getElementById('am-note');
  var wantKat = q.get('kat');
  if (wantKat && A.REFERRAL[wantKat]) kat.value = wantKat;
  if (q.get('harga')) harga.value = q.get('harga');
  fba.value = 'large_mid';
  fx.value = A.FX.idrPerUsd;
  kirim.value = '3.50';
  function band() {
    var k = fba.value, b = null;
    for (var i = 0; i < A.FBA.bands.length; i++) if (A.FBA.bands[i].key === k) b = A.FBA.bands[i];
    return b;
  }
  function needsWeight() { beratField.hidden = !(band() && band().perLb); }
  function calc() {
    var price = parseFloat(harga.value) || 0;
    var rate = parseFloat(fx.value) || A.FX.idrPerUsd;
    var hppIdr = parseFloat(hpp.value) || 0;
    var freight = parseFloat(kirim.value) || 0;
    if (price <= 0) { out.hidden = true; return; }
    out.hidden = false;
    var ref = A.referralFee(kat.value, price);
    var fbaUsd = A.fbaFee(fba.value, parseFloat(berat.value) || 0);
    var hppUsd = rate > 0 ? hppIdr / rate : 0;
    var net = price - ref.usd - fbaUsd - freight - hppUsd;
    document.getElementById('am-ref').textContent = A.fmtUsd(ref.usd) + ' (' + A.fmtPct(ref.pctEffective) + ')';
    document.getElementById('am-fba-out').textContent = A.fmtUsd(fbaUsd);
    document.getElementById('am-kirim-out').textContent = A.fmtUsd(freight);
    document.getElementById('am-hpp-out').textContent = A.fmtUsd(hppUsd);
    document.getElementById('am-mg').textContent = A.fmtPct(price > 0 ? net / price * 100 : 0);
    document.getElementById('am-net').textContent = A.fmtUsd(net) + ' · ' + A.fmtIdr(net * rate);
    document.getElementById('am-net-box').classList.toggle('good', net >= 0);
    var cat = A.REFERRAL[kat.value] || A.REFERRAL.other;
    note.textContent = (cat.note ? cat.note + ' ' : '') + A.FREIGHT.note;
  }
  [kat, harga, fba, berat, kirim, hpp, fx].forEach(function (el) {
    el.addEventListener('input', function () { needsWeight(); calc(); });
    el.addEventListener('change', function () { needsWeight(); calc(); });
  });
  needsWeight(); calc();
})();`,
      faqs: [
        { q: 'Kenapa sisa untung bisa minus padahal harga jual kelihatan tinggi?', a: 'Komisi rujukan Amazon 8–20% (kebanyakan kategori 15%), plus FBA, plus ongkir dari Indonesia, plus modal. Tiga potongan itu sering lebih dalam dari dugaan. Itulah alasan kalkulator ini ada.' },
        { q: 'Apakah ongkos kirim di sini harga resmi?', a: `Bukan. ${esc(A.FREIGHT.note)}` },
        { q: 'Dari mana tarif komisi dan FBA?', a: `Komisi rujukan: <a href="${esc(A.REFERRAL_SRC_URL)}" rel="nofollow noopener" target="_blank">${esc(A.REFERRAL_SRC)}</a>. FBA: ${esc(A.FBA.src)}, termasuk surcharge bahan bakar 3,5% tahun 2026.` },
      ],
    },
    {
      slug: 'harga-jual-amazon',
      title: 'Kalkulator Harga Jual Amazon: Dari HPP ke Harga yang Masih Untung | LarisExpor',
      desc: 'Cari harga jual Amazon US yang masih menyisakan margin setelah komisi, FBA, dan ongkir dari Indonesia. Gratis, jalan di browser.',
      h1: 'Kalkulator Harga Jual Amazon',
      cardNote: 'Dari HPP, cari harga jual yang masih menyisakan margin',
      lead: 'Isi modal dan margin yang kamu mau. Kami mundur dari biaya Amazon untuk mencari harga jual terendah yang masih menyisakan angka itu.',
      body: `    <div class="calc">
      <div class="calc-grid">
        <div class="calc-field">
          <label for="hj-hpp">HPP / modal per unit (Rp)</label>
          <input type="number" id="hj-hpp" inputmode="numeric" min="0" placeholder="mis. 45000">
        </div>
        <div class="calc-field">
          <label for="hj-mg">Margin yang diinginkan (%) <span class="hint">dari harga jual, setelah semua biaya</span></label>
          <input type="number" id="hj-mg" inputmode="decimal" min="0" max="80" step="0.5" value="20">
        </div>
        <div class="calc-field">
          <label for="hj-kat">Kategori Amazon</label>
          <select id="hj-kat">
${catOptions()}
          </select>
        </div>
        <div class="calc-field">
          <label for="hj-fba">Ukuran FBA</label>
          <select id="hj-fba">
${fbaOptions()}
          </select>
        </div>
        <div class="calc-field" id="hj-berat-field" hidden>
          <label for="hj-berat">Berat (lb)</label>
          <input type="number" id="hj-berat" inputmode="decimal" min="0" step="0.1" value="5">
        </div>
        <div class="calc-field">
          <label for="hj-kirim">Ongkos kirim per unit (USD)</label>
          <input type="number" id="hj-kirim" inputmode="decimal" min="0" step="0.01">
        </div>
        <div class="calc-field">
          <label for="hj-fx">Kurs Rp per USD</label>
          <input type="number" id="hj-fx" inputmode="numeric" min="1">
        </div>
      </div>
      <div class="calc-out" id="hj-out" hidden>
        <div class="calc-row"><span>HPP dalam USD</span><span id="hj-hpp-out">–</span></div>
        <div class="calc-row"><span>Komisi rujukan pada harga itu</span><span id="hj-ref">–</span></div>
        <div class="calc-row"><span>FBA + ongkir</span><span id="hj-fixed">–</span></div>
        <div class="calc-total good" id="hj-box"><span class="lbl">Harga jual minimum</span><span class="val" id="hj-price">–</span></div>
        <p class="calc-sub" id="hj-note"></p>
      </div>
    </div>
    <p class="disclaimer">${esc(A.FREIGHT.note)} Tarif komisi berubah di ambang harga tertentu (Grocery $15, Apparel $20, Beauty $10) — naikkan harga melewati ambang itu bisa menurunkan sisa untung.</p>`,
      js: `(function(){
  var A = window.LARIS_AMZ; if (!A) return;
  var q = new URLSearchParams(location.search);
  var kat = document.getElementById('hj-kat');
  var hpp = document.getElementById('hj-hpp');
  var mg = document.getElementById('hj-mg');
  var fba = document.getElementById('hj-fba');
  var berat = document.getElementById('hj-berat');
  var beratField = document.getElementById('hj-berat-field');
  var kirim = document.getElementById('hj-kirim');
  var fx = document.getElementById('hj-fx');
  var out = document.getElementById('hj-out');
  var wantKat = q.get('kat');
  if (wantKat && A.REFERRAL[wantKat]) kat.value = wantKat;
  fba.value = 'large_mid';
  fx.value = A.FX.idrPerUsd;
  kirim.value = '3.50';
  function band() {
    var k = fba.value, b = null;
    for (var i = 0; i < A.FBA.bands.length; i++) if (A.FBA.bands[i].key === k) b = A.FBA.bands[i];
    return b;
  }
  function needsWeight() { beratField.hidden = !(band() && band().perLb); }
  function calc() {
    var rate = parseFloat(fx.value) || A.FX.idrPerUsd;
    var hppUsd = rate > 0 ? (parseFloat(hpp.value) || 0) / rate : 0;
    var freight = parseFloat(kirim.value) || 0;
    var fbaUsd = A.fbaFee(fba.value, parseFloat(berat.value) || 0);
    var want = (parseFloat(mg.value) || 0) / 100;
    var costs = hppUsd + freight + fbaUsd;
    if (costs <= 0) { out.hidden = true; return; }
    if (want >= 0.85) { out.hidden = false; document.getElementById('hj-note').textContent = 'Margin sebesar itu hampir tidak muat setelah komisi Amazon.'; return; }
    var price = costs / Math.max(0.08, 1 - 0.15 - want);
    for (var i = 0; i < 30; i++) {
      var ref = A.referralFee(kat.value, price);
      var next = (ref.usd + costs) / Math.max(0.08, 1 - want);
      if (Math.abs(next - price) < 0.005) { price = next; break; }
      price = next;
    }
    var ref2 = A.referralFee(kat.value, price);
    var net = price - ref2.usd - costs;
    out.hidden = false;
    document.getElementById('hj-hpp-out').textContent = A.fmtUsd(hppUsd);
    document.getElementById('hj-ref').textContent = A.fmtUsd(ref2.usd) + ' (' + A.fmtPct(ref2.pctEffective) + ')';
    document.getElementById('hj-fixed').textContent = A.fmtUsd(fbaUsd + freight);
    document.getElementById('hj-price').textContent = A.fmtUsd(price) + ' · ' + A.fmtIdr(price * rate);
    document.getElementById('hj-note').textContent = 'Pada harga itu sisa kira-kira ' + A.fmtUsd(net) + ' per unit (' + A.fmtPct(price > 0 ? net / price * 100 : 0) + '). Bandingkan dengan harga yang benar-benar ada di Amazon sebelum memutuskan.';
  }
  [kat, hpp, mg, fba, berat, kirim, fx].forEach(function (el) {
    el.addEventListener('input', function () { needsWeight(); calc(); });
    el.addEventListener('change', function () { needsWeight(); calc(); });
  });
  needsWeight(); calc();
})();`,
      faqs: [
        { q: 'Kenapa harga minimum bisa jauh di atas modal?', a: 'Karena komisi dihitung dari harga jual, bukan dari modal. Untuk menyisakan 20% setelah komisi 15% dan FBA, harga harus menutup semua itu sekaligus — bukan hanya HPP.' },
        { q: 'Apakah ini harga yang harus saya pasang?', a: 'Ini lantai, bukan rekomendasi. Kalau harga Amazon untuk kata kunci yang sama sudah jauh di bawah lantai ini, marginnya tidak masuk — itu sinyal untuk ganti produk atau saluran, bukan untuk memaksa harga.' },
      ],
    },
    {
      slug: 'biaya-kirim-ekspor',
      title: 'Kalkulator Ongkos Kirim Ekspor dari Indonesia (Udara, LCL, FCL) | LarisExpor',
      desc: 'Estimasi ongkos kirim ekspor dari Indonesia ke luar negeri: udara, laut LCL, dan FCL 20ft. Angka adalah titik awal, bukan quote forwarder. Gratis.',
      h1: 'Kalkulator Ongkos Kirim Ekspor',
      cardNote: 'Udara, laut LCL, dan FCL — titik awal, bukan quote',
      lead: 'Pilih moda, isi berat atau volume. Hasilnya perkiraan biaya sampai pelabuhan/bandara tujuan, plus dokumen. Minta quote ke forwarder sebelum memutuskan.',
      body: `    <div class="calc">
      <div class="calc-grid">
        <div class="calc-field">
          <label for="bk-mode">Moda kirim</label>
          <select id="bk-mode">
            <option value="air">${esc(A.FREIGHT.air.label)} — ${esc(A.FREIGHT.air.range)}</option>
            <option value="seaLcl">${esc(A.FREIGHT.seaLcl.label)} — ${esc(A.FREIGHT.seaLcl.range)}</option>
            <option value="seaFcl20">${esc(A.FREIGHT.seaFcl20.label)} — ${esc(A.FREIGHT.seaFcl20.range)}</option>
          </select>
        </div>
        <div class="calc-field" id="bk-kg-field">
          <label for="bk-kg">Berat aktual (kg)</label>
          <input type="number" id="bk-kg" inputmode="decimal" min="0" step="0.1" placeholder="mis. 12">
        </div>
        <div class="calc-field" id="bk-dim-field">
          <label>Dimensi per kolis (cm) <span class="hint">${esc(A.FREIGHT.volumetricNote)}</span></label>
          <div class="calc-grid">
            <input type="number" id="bk-l" inputmode="decimal" min="0" placeholder="P">
            <input type="number" id="bk-w" inputmode="decimal" min="0" placeholder="L">
            <input type="number" id="bk-h" inputmode="decimal" min="0" placeholder="T">
          </div>
        </div>
        <div class="calc-field" id="bk-cbm-field" hidden>
          <label for="bk-cbm">Volume (CBM)</label>
          <input type="number" id="bk-cbm" inputmode="decimal" min="0" step="0.01" placeholder="mis. 1.2">
        </div>
        <div class="calc-field">
          <label for="bk-rate">Tarif yang kamu pakai <span class="hint" id="bk-rate-hint"></span></label>
          <input type="number" id="bk-rate" inputmode="decimal" min="0" step="0.01">
        </div>
        <div class="calc-field">
          <label for="bk-docs">Dokumen &amp; bea cukai ekspor (USD) <span class="hint">${esc(A.FREIGHT.docs.range)}</span></label>
          <input type="number" id="bk-docs" inputmode="decimal" min="0" step="1">
        </div>
        <div class="calc-field">
          <label for="bk-units">Jumlah unit dalam kiriman <span class="hint">opsional, untuk biaya per unit</span></label>
          <input type="number" id="bk-units" inputmode="numeric" min="1" step="1" placeholder="mis. 200">
        </div>
        <div class="calc-field">
          <label for="bk-fx">Kurs Rp per USD</label>
          <input type="number" id="bk-fx" inputmode="numeric" min="1">
        </div>
      </div>
      <div class="calc-out" id="bk-out" hidden>
        <div class="calc-row"><span>Freight</span><span id="bk-freight">–</span></div>
        <div class="calc-row"><span>Dokumen &amp; cukai</span><span id="bk-docs-out">–</span></div>
        <div class="calc-row" id="bk-unit-row" hidden><span>Per unit</span><span id="bk-unit">–</span></div>
        <div class="calc-total" id="bk-box"><span class="lbl">Estimasi total</span><span class="val" id="bk-total">–</span></div>
        <p class="calc-sub" id="bk-note"></p>
      </div>
    </div>
    <p class="disclaimer">${esc(A.FREIGHT.note)}</p>`,
      js: `(function(){
  var A = window.LARIS_AMZ; if (!A) return;
  var mode = document.getElementById('bk-mode');
  var kg = document.getElementById('bk-kg');
  var L = document.getElementById('bk-l');
  var W = document.getElementById('bk-w');
  var H = document.getElementById('bk-h');
  var cbm = document.getElementById('bk-cbm');
  var rate = document.getElementById('bk-rate');
  var docs = document.getElementById('bk-docs');
  var units = document.getElementById('bk-units');
  var fx = document.getElementById('bk-fx');
  var out = document.getElementById('bk-out');
  var kgField = document.getElementById('bk-kg-field');
  var dimField = document.getElementById('bk-dim-field');
  var cbmField = document.getElementById('bk-cbm-field');
  var rateHint = document.getElementById('bk-rate-hint');
  fx.value = A.FX.idrPerUsd;
  docs.value = A.FREIGHT.docs.usdFlat;
  function syncMode() {
    var m = mode.value;
    kgField.hidden = m !== 'air';
    dimField.hidden = m !== 'air';
    cbmField.hidden = m !== 'seaLcl';
    if (m === 'air') { rate.value = A.FREIGHT.air.usdPerKg; rateHint.textContent = 'USD/kg, kisaran ' + A.FREIGHT.air.range; }
    else if (m === 'seaLcl') { rate.value = A.FREIGHT.seaLcl.usdPerCbm; rateHint.textContent = 'USD/CBM, kisaran ' + A.FREIGHT.seaLcl.range; }
    else { rate.value = A.FREIGHT.seaFcl20.usdFlat; rateHint.textContent = 'USD per kontainer, kisaran ' + A.FREIGHT.seaFcl20.range; }
  }
  function calc() {
    var m = mode.value;
    var r = parseFloat(rate.value);
    var d = parseFloat(docs.value); if (!isFinite(d)) d = A.FREIGHT.docs.usdFlat;
    var idr = parseFloat(fx.value) || A.FX.idrPerUsd;
    var freight = 0, detail = '';
    if (m === 'air') {
      var ch = A.chargeableKg(parseFloat(kg.value) || 0, parseFloat(L.value) || 0, parseFloat(W.value) || 0, parseFloat(H.value) || 0);
      freight = ch * (isFinite(r) ? r : A.FREIGHT.air.usdPerKg);
      detail = 'Berat tertagih ' + ch.toFixed(2) + ' kg (yang lebih besar antara aktual dan volumetrik P×L×T/6000).';
    } else if (m === 'seaLcl') {
      var v = parseFloat(cbm.value) || 0;
      freight = v * (isFinite(r) ? r : A.FREIGHT.seaLcl.usdPerCbm);
      detail = v > 0 ? (v.toFixed(2) + ' CBM.') : 'Isi volume CBM.';
    } else {
      freight = isFinite(r) ? r : A.FREIGHT.seaFcl20.usdFlat;
      detail = 'Flat per kontainer 20ft, belum termasuk trucking ke pelabuhan.';
    }
    var total = freight + d;
    if (total <= 0 && m === 'air' && !(parseFloat(kg.value) > 0)) { out.hidden = true; return; }
    out.hidden = false;
    document.getElementById('bk-freight').textContent = A.fmtUsd(freight);
    document.getElementById('bk-docs-out').textContent = A.fmtUsd(d);
    document.getElementById('bk-total').textContent = A.fmtUsd(total) + ' · ' + A.fmtIdr(total * idr);
    var u = parseFloat(units.value) || 0;
    var row = document.getElementById('bk-unit-row');
    if (u > 0) { row.hidden = false; document.getElementById('bk-unit').textContent = A.fmtUsd(total / u) + ' · ' + A.fmtIdr((total / u) * idr); }
    else row.hidden = true;
    document.getElementById('bk-note').textContent = detail + ' ' + A.FREIGHT.note;
  }
  mode.addEventListener('change', function () { syncMode(); calc(); });
  [kg, L, W, H, cbm, rate, docs, units, fx].forEach(function (el) {
    el.addEventListener('input', calc);
  });
  syncMode(); calc();
})();`,
      faqs: [
        { q: 'Apa bedanya berat aktual dan berat volumetrik?', a: esc(A.FREIGHT.volumetricNote) },
        { q: 'Kenapa bukan harga resmi?', a: esc(A.FREIGHT.note) },
      ],
    },
  ];
}

// ---------- siap-ekspor ----------

function siapPage() {
  const url = `${BASE}/siap-ekspor/`;
  const items = [
    ['KTP dan NPWP atas nama yang sama', 'Penghasilan dari Amazon tetap kena pajak di Indonesia. Nama di KTP, NPWP, dan akun Seller Central harus konsisten, atau pencairan bisa ditahan.'],
    ['NIB jika kamu jualan sebagai usaha', 'Kalau akun Amazon memakai nama badan usaha, NIB harus atas nama yang sama. Jualan sebagai individu cukup KTP + NPWP.'],
    ['Payout lewat Wise, Payoneer, atau Revolut', 'Rekening bank di Amerika <b>tidak lagi wajib</b>. Yang wajib: nama di penyedia payout identik dengan nama di Seller Central dan rekening penerima di Indonesia.'],
    ['Nama harus identik di tiga tempat', 'Seller Central, penyedia payout, dan rekening bank/e-wallet penerima. Perbedaan spasi, gelar, atau singkatan adalah alasan paling umum dana tertahan berhari-hari.'],
    ['Simpan disbursement report setiap pencairan', 'Bank Indonesia sering menanyakan kenapa USD masuk. Laporan pencairan Amazon adalah bukti yang mereka minta. Unduh dan simpan.'],
    ['Produk tidak termasuk barang terlarang Amazon', 'Makanan, kosmetik, dan suplemen punya syarat tambahan (label bahasa Inggris, uji lab, FDA untuk sebagian). Cek kategori sebelum kirim stok.'],
  ];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url: `${BASE}/` },
        { name: 'Siap Ekspor?', url },
      ]),
      {
        '@type': 'Article',
        headline: 'Siap jualan di Amazon dari Indonesia?',
        description: jt('Daftar periksa untuk UMKM Indonesia yang mau jualan di Amazon: KTP, NPWP, NIB, payout, dan aturan nama yang sering menahan dana.'),
        url, inLanguage: 'id', datePublished: TODAY, dateModified: TODAY,
        author: { '@type': 'Person', name: AUTHOR },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
        isAccessibleForFree: true,
      },
    ],
  };
  return `${head({
    url, active: 'siap', ld, headExtra: PROBE_JS,
    title: 'Siap Jualan di Amazon dari Indonesia? Daftar Periksa UMKM | LarisExpor',
    desc: 'Syarat nyata untuk UMKM Indonesia yang mau jualan di Amazon: KTP + NPWP, NIB, payout Wise/Payoneer, dan aturan nama yang paling sering menahan dana. Gratis.',
  })}
<main>
  <p class="cat-pill">Persiapan Akun</p>
  <h1>Siap jualan di Amazon dari Indonesia?</h1>
  <p class="lead">Bukan kursus ekspor. Ini daftar yang benar-benar ditanya saat akun di-review dan saat USD pertama masuk ke rekening Indonesia.</p>
  <p class="updated">Diperbarui ${TODAY} &middot; bukan nasihat hukum atau pajak</p>
  <div class="card">
    <ol class="check-list">
${items.map((it, i) => `      <li><span class="check-n">${i + 1}</span><div><strong>${it[0]}</strong><p>${it[1]}</p></div></li>`).join('\n')}
    </ol>
  </div>
  <div class="cta-row">
    <a class="btn-primary" href="/expor/produk/">Lihat data ${PRODUCT_COUNT} produk ekspor</a>
    <a class="btn-secondary" href="/expor/kalkulator/margin-amazon/">Hitung sisa untung di Amazon</a>
  </div>
${probeForm('siap-ekspor')}
</main>
${FOOTER}`;
}

// ---------- home + gated explorer ----------

function explorerRows(products, tradeBySlug) {
  return products.map((p) => {
    const t = tradeBySlug.get(p.slug);
    const val = t && t.has_data ? t.world_value : -1;
    const dest = t && t.has_data && t.destinations[0] ? t.destinations[0].nama : '';
    const valTxt = t && t.has_data ? usdShort(t.world_value) : '–';
    return `        <tr data-q="${esc((p.nama + ' ' + p.kategori + ' ' + p.kw + ' ' + p.hs).toLowerCase())}">
          <td data-sort="${esc(p.nama)}"><a href="/expor/produk/${p.slug}/">${esc(p.nama)}</a></td>
          <td data-sort="${esc(p.kategori)}">${esc(p.kategori)}</td>
          <td class="num" data-sort="${val}">${valTxt}</td>
          <td data-sort="${esc(dest)}">${esc(dest || '–')}</td>
          <td class="num" data-sort="${esc(p.hs)}">${esc(p.hs)}</td>
          <td data-sort="${esc(p.wilayah)}">${esc(p.wilayah)}</td>
        </tr>`;
  }).join('\n');
}

const EXPLORER_JS = `<script>
(function () {
  var A = window.LARIS_AUTH;
  var gate = document.getElementById('expor-gate');
  var explorer = document.getElementById('expor-explorer');
  function show(on) {
    if (gate) gate.hidden = !!on;
    if (explorer) explorer.hidden = !on;
  }
  function bind() {
    var form = document.getElementById('gate-form');
    if (!form || !A) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = document.getElementById('gate-err');
      var btn = form.querySelector('button');
      btn.disabled = true; err.textContent = '';
      A.signIn(document.getElementById('gate-email').value, document.getElementById('gate-pass').value)
        .then(function (r) {
          if (r.ok) show(true);
          else { err.textContent = r.error || 'Login gagal.'; btn.disabled = false; }
        });
    });
  }
  bind();
  if (A && A.peek()) show(true);
  else if (A) A.getSession().then(function (s) { show(!!s); });
  else show(false);

  var tbl = document.getElementById('expor-tbl');
  if (!tbl) return;
  var filter = document.getElementById('expor-filter');
  if (filter) filter.addEventListener('input', function () {
    var q = filter.value.toLowerCase().trim();
    [].forEach.call(tbl.tBodies[0].rows, function (tr) {
      tr.hidden = q && (tr.getAttribute('data-q') || '').indexOf(q) < 0;
    });
  });
  [].forEach.call(tbl.tHead.rows[0].cells, function (th, idx) {
    th.setAttribute('aria-sort', 'none');
    th.addEventListener('click', function () {
      var dir = th.getAttribute('aria-sort') === 'ascending' ? 'desc' : 'asc';
      [].forEach.call(tbl.tHead.rows[0].cells, function (c) { c.setAttribute('aria-sort', 'none'); });
      th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
      var rows = [].slice.call(tbl.tBodies[0].rows);
      rows.sort(function (a, b) {
        var av = a.cells[idx].getAttribute('data-sort') || '';
        var bv = b.cells[idx].getAttribute('data-sort') || '';
        var an = Number(av), bn = Number(bv);
        var cmp = (av !== '' && isFinite(an) && isFinite(bn)) ? an - bn : String(av).localeCompare(String(bv), 'id');
        return dir === 'asc' ? cmp : -cmp;
      });
      rows.forEach(function (r) { tbl.tBodies[0].appendChild(r); });
    });
  });
})();
</script>`;

function homePage(products, tradeBySlug) {
  const url = `${BASE}/`;
  const withData = products.filter((p) => tradeBySlug.get(p.slug)?.has_data);
  const featured = [...withData]
    .filter((p) => (tradeBySlug.get(p.slug)?.hs_level || 0) === 6)
    .sort((a, b) => (tradeBySlug.get(b.slug).world_value || 0) - (tradeBySlug.get(a.slug).world_value || 0))
    .slice(0, 6);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      breadcrumb([
        { name: 'LarisID', url: `${SITE}/` },
        { name: 'LarisExpor', url },
      ]),
      {
        '@type': 'WebSite', name: 'LarisExpor', url, inLanguage: 'id',
        description: jt('Riset ekspor untuk UMKM Indonesia: permintaan global UN Comtrade, syarat HS, dan kalkulator margin Amazon. Bagian dari LarisID.'),
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/` },
      },
    ],
  };
  return `${head({
    url, active: 'home', ld, headExtra: HUB_JS,
    title: 'LarisExpor: Permintaan Global, Harga Amazon & Syarat Ekspor UMKM Indonesia',
    desc: `Data ekspor ${products.length} produk Indonesia dari UN Comtrade — negara pembeli, kode HS, syarat ekspor, dan kalkulator margin Amazon. Gratis. Bagian dari LarisID.`,
  })}
<main class="wide">
  <p class="cat-pill">Sister site LarisID</p>
  <h1>Riset ekspor untuk yang sudah jualan di dalam negeri</h1>
  <p class="lead">LarisID menjawab apa yang laku di Shopee. LarisExpor menjawab pertanyaan berikutnya: negara mana yang sudah membeli produk seperti milikmu, berapa harganya di luar, dan apa yang tersisa setelah biaya Amazon dan ongkir.</p>
  <p class="updated">${products.length} produk &middot; ${withData.length} punya data UN Comtrade &middot; harga Amazon dari sampel listing US (omset badge selalu perkiraan)</p>

  <div class="sec">
    <h2>Produk dengan permintaan dunia yang nyata</h2>
    <p class="sec-lead">Enam contoh dari kode HS 6 digit. Bukan estimasi penjualan — nilai ekspor Indonesia yang tercatat.</p>
    <div class="riset-grid">
${featured.map((p) => {
    const t = tradeBySlug.get(p.slug);
    const top = t.destinations[0];
    return `      <a class="riset-card" href="/expor/produk/${p.slug}/"><span class="rk">${esc(p.nama)}</span><span class="rm">${usdShort(t.world_value)} &middot; ${esc(top ? top.nama : '–')}</span></a>`;
  }).join('\n')}
    </div>
    <div class="cta-row">
      <a class="btn-primary" href="/expor/produk/">Lihat semua ${products.length} produk</a>
      <a class="btn-secondary" href="/expor/kalkulator/">Kalkulator ekspor</a>
      <a class="btn-secondary" href="/expor/siap-ekspor/">Siap ekspor?</a>
    </div>
  </div>

${probeForm('home')}

  <div class="sec">
    <h2>Tabel ${products.length} produk</h2>
    <p class="sec-lead">Urutkan nilai ekspor, negara pembeli, atau kategori. Sesi LarisID yang sama membuka tabel ini — tidak perlu daftar ulang.</p>
    <div class="gate" id="expor-gate">
      <h3>Masuk untuk membuka tabel lengkap</h3>
      <p>Pakai akun LarisID yang sama. Halaman produk, kalkulator, dan syarat ekspor tetap terbuka tanpa login.</p>
      <form id="gate-form">
        <label for="gate-email">Email</label>
        <input type="email" id="gate-email" required autocomplete="email">
        <label for="gate-pass">Kata sandi</label>
        <input type="password" id="gate-pass" required autocomplete="current-password">
        <button type="submit">Masuk</button>
        <p class="gate-err" id="gate-err" role="status"></p>
      </form>
      <p class="gate-alt"><a href="/">Daftar atau masuk dengan Google di LarisID</a> — sesinya berlaku di sini.</p>
    </div>
    <div id="expor-explorer" hidden>
      <div class="filter-row">
        <input type="search" id="expor-filter" placeholder="Cari nama, kategori, atau HS…" autocomplete="off">
      </div>
      <div class="tbl-wrap">
        <table class="expor-tbl" id="expor-tbl">
          <thead><tr><th>Produk</th><th>Kategori</th><th>Ekspor</th><th>Pembeli terbesar</th><th>HS</th><th>Wilayah</th></tr></thead>
          <tbody>
${explorerRows(products, tradeBySlug)}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</main>
${EXPLORER_JS}
${FOOTER}`;
}

function sitemapXml(products, tools) {
  const urls = [
    { loc: `${BASE}/`, pri: '0.9' },
    { loc: `${BASE}/produk/`, pri: '0.8' },
    { loc: `${BASE}/kalkulator/`, pri: '0.7' },
    { loc: `${BASE}/siap-ekspor/`, pri: '0.7' },
    ...tools.map((t) => ({ loc: `${BASE}/kalkulator/${t.slug}/`, pri: '0.6' })),
    ...products.map((p) => ({ loc: `${BASE}/produk/${p.slug}/`, pri: '0.6' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${TODAY}</lastmod><changefreq>weekly</changefreq><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`;
}

function write(file, html) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

async function main() {
  await import(pathToFileURL(path.join(ROOT, 'js/amazon-fees.js')).href);
  if (!globalThis.LARIS_AMZ) throw new Error('js/amazon-fees.js did not assign globalThis.LARIS_AMZ');

  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'expor-keywords.json'), 'utf8'));
  const products = corpus.keywords;
  if (!products.length) throw new Error('expor-keywords.json has no products');
  PRODUCT_COUNT = products.length;

  const tradePath = path.join(__dirname, 'expor-trade.json');
  const trade = fs.existsSync(tradePath)
    ? JSON.parse(fs.readFileSync(tradePath, 'utf8'))
    : { products: [] };
  const tradeBySlug = new Map((trade.products || []).map((t) => [t.slug, t]));

  const amzPath = path.join(__dirname, 'expor-amazon.json');
  const amazon = fs.existsSync(amzPath)
    ? JSON.parse(fs.readFileSync(amzPath, 'utf8'))
    : { products: [] };
  const amazonBySlug = new Map((amazon.products || amazon.keywords || []).map((a) => [a.slug, a]));

  const tools = buildTools();

  fs.rmSync(OUT, { recursive: true, force: true });
  write(path.join(OUT, 'index.html'), homePage(products, tradeBySlug));
  write(path.join(OUT, 'produk', 'index.html'), produkHub(products, tradeBySlug));
  for (const p of products) {
    const siblings = products.filter((x) => x.kategori === p.kategori && x.slug !== p.slug);
    write(path.join(OUT, 'produk', p.slug, 'index.html'), produkPage(p, tradeBySlug.get(p.slug), amazonBySlug.get(p.slug), siblings));
  }
  write(path.join(OUT, 'kalkulator', 'index.html'), toolHub(tools));
  for (const t of tools) {
    write(path.join(OUT, 'kalkulator', t.slug, 'index.html'), toolPage(t));
  }
  write(path.join(OUT, 'siap-ekspor', 'index.html'), siapPage());
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), sitemapXml(products, tools));

  const nAmz = amazonBySlug.size;
  process.stderr.write(`LarisExpor: ${products.length} produk, ${[...tradeBySlug.values()].filter((t) => t.has_data).length} with Comtrade, ${nAmz} with Amazon prices\n-> ${path.relative(ROOT, OUT)}\n`);
}

main().catch((e) => { process.stderr.write(`FATAL: ${e.stack || e.message}\n`); process.exit(1); });

