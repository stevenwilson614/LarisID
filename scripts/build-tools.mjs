#!/usr/bin/env node
/**
 * Builds the /kalkulator/ (free tools) section: interactive, client-side calculators
 * that act as link-magnets and are highly citable. Each tool ships WebApplication +
 * FAQPage + BreadcrumbList JSON-LD, og/twitter tags, and honest, dated fee sources.
 *
 * Bodies (form UI + inline vanilla JS) are hand-written; this generator wraps them in
 * consistent head/header/footer/schema. Run: node scripts/build-tools.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'kalkulator');
const SITE = 'https://larisid.com';
const OG_IMAGE = `${SITE}/images/Banner.jpg`;
const AUTHOR = 'Steven Wilson';

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
    <a href="/kalkulator/" class="active">Kalkulator</a>
    <a href="/perbandingan/">Perbandingan</a>
    <a href="/harga/">Harga</a>
    <a href="/cara-kerja/">Cara Kerja</a>
    <a href="/" class="nav-cta">Mulai Gratis</a>
  </nav>`;
}

// Minimal, self-contained styling for the calculator forms (reuses seo-pages.css tokens).
const CALC_CSS = `<style>
  .calc{background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:22px;margin:18px 0;box-shadow:0 1px 2px rgba(16,24,40,.04)}
  .calc-field{margin:0 0 14px}
  .calc-field label{display:block;font-weight:600;font-size:.9rem;margin-bottom:6px;color:var(--navy,#0B1B3B)}
  .calc-field .hint{font-weight:400;color:#6B7280;font-size:.8rem}
  .calc-field input[type=number],.calc-field select{width:100%;box-sizing:border-box;padding:11px 12px;font-size:1rem;font-family:inherit;border:1px solid #D1D5DB;border-radius:9px;background:#fff}
  .calc-field input:focus,.calc-field select:focus{outline:2px solid #C81E1E;outline-offset:1px;border-color:#C81E1E}
  .calc-check{display:flex;align-items:flex-start;gap:9px;margin:0 0 10px;font-size:.92rem}
  .calc-check input{margin-top:3px}
  .calc-out{margin-top:6px;border-top:1px dashed #E5E7EB;padding-top:16px}
  .calc-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:.95rem;border-bottom:1px solid #F3F4F6}
  .calc-row span:last-child{font-weight:600;color:var(--navy,#0B1B3B);text-align:right;white-space:nowrap}
  .calc-row.neg span:last-child{color:#B91C1C}
  .calc-total{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-top:12px;padding:14px 16px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px}
  .calc-total .lbl{font-weight:700;color:var(--navy,#0B1B3B)}
  .calc-total .val{font-weight:800;font-size:1.4rem;color:#C81E1E;white-space:nowrap}
  .calc-total.good .val{color:#047857}
  .calc-total.good{background:#ECFDF5;border-color:#A7F3D0}
  .calc-sub{font-size:.82rem;color:#6B7280;margin-top:4px}
  /* .calc-row/.calc-check set display:flex, which outranks the [hidden]
     attribute's UA display:none — without this every "hidden" row stays
     on screen (that is why the SPayLater row never hid). */
  .calc-row[hidden],.calc-check[hidden],.calc-field[hidden],.calc-out[hidden],.calc-total[hidden]{display:none!important}
  .mp-pick{display:flex;gap:0;margin:0 0 16px;border:1px solid #E5E7EB;border-radius:12px;overflow-x:auto;background:#fff;scrollbar-width:none}
  .mp-pick::-webkit-scrollbar{display:none}
  .mp-btn{flex:1 0 auto;min-width:126px;display:flex;align-items:center;gap:8px;padding:11px 13px;background:#fff;border:0;border-right:1px solid #E5E7EB;font-family:inherit;text-align:left;cursor:pointer;transition:background .15s}
  .mp-btn:last-child{border-right:0}
  .mp-btn:hover{background:#F9FAFB}
  .mp-btn[aria-checked=true]{background:#F9FAFB;box-shadow:inset 0 -3px 0 #C81E1E}
  .mp-btn:focus-visible{outline:2px solid #C81E1E;outline-offset:-2px}
  .mp-btn svg{width:22px;height:22px;flex-shrink:0}
  .mp-nm{font-size:.82rem;font-weight:700;color:var(--navy,#0B1B3B);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
  .mp-pc{font-size:.86rem;font-weight:800;color:#374151;white-space:nowrap}
  .mp-btn[aria-checked=true] .mp-pc{color:#C81E1E}
  .cmp-wrap{overflow-x:auto;margin:18px 0}
  .cmp{width:100%;border-collapse:collapse;font-size:.9rem;min-width:460px}
  .cmp th,.cmp td{padding:9px 12px;border-bottom:1px solid #F3F4F6;text-align:right;white-space:nowrap}
  .cmp th:first-child,.cmp td:first-child{text-align:left}
  .cmp thead th{font-size:.78rem;text-transform:uppercase;letter-spacing:.03em;color:#6B7280;font-weight:700}
  .cmp tbody tr.best{background:#ECFDF5}
  .cmp tbody tr.best td:first-child::after{content:"termurah";margin-left:8px;font-size:.66rem;font-weight:800;color:#047857;text-transform:uppercase;letter-spacing:.03em}
  .cmp td.net{font-weight:800;color:var(--navy,#0B1B3B)}
</style>`;

function toolPage(t) {
  const url = `${SITE}/kalkulator/${t.slug}/`;
  const faqLd = t.faqs?.length ? [{
    '@type': 'FAQPage',
    mainEntity: t.faqs.map((f) => ({ '@type': 'Question', name: jt(f.q), acceptedAnswer: { '@type': 'Answer', text: jt(f.a) } })),
  }] : [];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Kalkulator', item: `${SITE}/kalkulator/` },
        { '@type': 'ListItem', position: 3, name: t.h1, item: url },
      ] },
      { '@type': 'WebApplication', name: jt(t.title), description: jt(t.desc), url,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'id',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
        publisher: { '@type': 'Organization', name: 'LarisID', url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/images/brand/appicon-red.png` } } },
      ...faqLd,
    ],
  };
  const faqHtml = t.faqs?.length ? `  <div class="card">
    <h2>Pertanyaan umum</h2>
${t.faqs.map((f) => `    <div class="faq-item">
      <p class="faq-q">${esc(f.q)}</p>
      <p class="faq-a">${f.a}</p>
    </div>`).join('\n')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(t.title)}</title>
<meta name="description" content="${esc(t.desc)}">
<meta name="robots" content="index, follow">
<meta name="author" content="${esc(AUTHOR)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(t.title)}">
<meta property="og:description" content="${esc(t.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="id_ID">
<meta property="og:site_name" content="LarisID">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(t.title)}">
<meta name="twitter:description" content="${esc(t.desc)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/png" href="/images/brand/appicon-red.png">
<link rel="alternate" href="${SITE}/llms.txt">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles/seo-pages.css">
${CALC_CSS}
${t.headExtra || ''}
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.webp" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav()}
</header>
<main>
  <p class="cat-pill">Kalkulator Gratis</p>
  <h1>${esc(t.h1)}</h1>
  <p class="lead">${t.lead}</p>
  <p class="updated">Oleh ${esc(AUTHOR)} · gratis · <a href="/cara-kerja/">metodologi data</a></p>

  <article>
${t.body}
    <div class="cta-row">
      <a class="btn-primary" href="/">Riset produk gratis di LarisID</a>
      <a class="btn-secondary" href="/kalkulator/">Kalkulator lainnya</a>
      <a class="btn-secondary" href="/panduan/produk-terlaris-untuk-pemula-2026/">Produk terlaris untuk pemula</a>
    </div>
  </article>

${faqHtml}
</main>
<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/panduan/">Panduan</a>
  <a href="/kalkulator/">Kalkulator</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

function hubPage(tools) {
  const url = `${SITE}/kalkulator/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Kalkulator', item: url },
      ] },
      { '@type': 'CollectionPage', name: 'Kalkulator Gratis untuk Seller Marketplace Indonesia — LarisID', url,
        description: jt('Kalkulator gratis untuk seller Shopee, TikTok Shop, Tokopedia, Lazada & Blibli: hitung margin & HPP, dan biaya admin per marketplace, langsung di browser.') },
      { '@type': 'ItemList', itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/kalkulator/${t.slug}/`, name: jt(t.h1) })) },
    ],
  };
  const cards = tools.map((t) => `    <a class="riset-card" href="/kalkulator/${t.slug}/"><span class="rk">${esc(t.h1)}</span><span class="rm">${esc(t.cardNote)}</span></a>`).join('\n');
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kalkulator Gratis Seller Shopee, TikTok Shop, Tokopedia, Lazada &amp; Blibli | LarisID</title>
<meta name="description" content="Kumpulan kalkulator gratis untuk seller Indonesia: hitung margin &amp; HPP dan biaya admin per marketplace — Shopee, TikTok Shop, Tokopedia, Lazada, Blibli. Langsung di browser, tanpa login.">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:title" content="Kalkulator Gratis untuk Seller Marketplace Indonesia — LarisID">
<meta property="og:description" content="Hitung margin, HPP, dan biaya admin Shopee, TikTok Shop, Tokopedia, Lazada &amp; Blibli gratis di browser.">
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
  <a class="logo" href="/"><img src="/images/brand/logo-horizontal-light.webp" alt="Laris" style="height:28px;width:auto;display:block;"></a>
  ${nav()}
</header>
<main class="wide">
  <h1>Kalkulator Gratis untuk Seller Marketplace Indonesia</h1>
  <p class="lead">Alat hitung cepat untuk seller Shopee, TikTok Shop, Tokopedia, Lazada, dan Blibli — pastikan "laku" berarti "untung". Jalan di browser, tanpa login. Padukan dengan <a href="/riset/">data pasar nyata</a> supaya keputusanmu berbasis angka.</p>
  <div class="riset-grid">
${cards}
  </div>
  <div class="cta-row">
    <a class="btn-primary" href="/">Mulai riset gratis di LarisID</a>
    <a class="btn-secondary" href="/panduan/">Baca panduan seller</a>
  </div>
</main>
<footer class="site-footer">
  © 2026 LarisID ·
  <a href="/">Beranda</a>
  <a href="/panduan/">Panduan</a>
  <a href="/riset/">Riset Pasar</a>
  <a href="/privacy/">Privasi</a>
</footer>
</body>
</html>
`;
}

// ---------- tools (hand-written bodies + inline JS) ----------
const TOOLS = [
  {
    slug: 'margin-hpp',
    title: 'Kalkulator Margin & HPP Produk Shopee (Gratis) | LarisID',
    desc: 'Hitung HPP, laba per unit, margin %, markup, dan titik impas (BEP) produk Shopee secara gratis. Pastikan jualanmu benar-benar untung, bukan cuma laku.',
    h1: 'Kalkulator Margin & HPP',
    cardNote: 'Hitung laba per unit, margin %, markup, dan BEP',
    lead: 'Masukkan modal (HPP) dan harga jual — langsung tahu laba per unit, margin, markup, dan berapa unit yang harus terjual untuk menutup biaya tetap (BEP).',
    body: `    <div class="calc">
      <div class="calc-field">
        <label for="m-hpp">HPP / modal per unit <span class="hint">(harga beli + packaging + ongkir masuk)</span></label>
        <input type="number" id="m-hpp" inputmode="numeric" min="0" placeholder="mis. 25000">
      </div>
      <div class="calc-field">
        <label for="m-harga">Harga jual per unit</label>
        <input type="number" id="m-harga" inputmode="numeric" min="0" placeholder="mis. 50000">
      </div>
      <div class="calc-field">
        <label for="m-fixed">Biaya tetap per bulan <span class="hint">(opsional — sewa, langganan, dll. untuk hitung BEP)</span></label>
        <input type="number" id="m-fixed" inputmode="numeric" min="0" placeholder="mis. 1000000">
      </div>
      <div class="calc-out" id="m-out" hidden>
        <div class="calc-row"><span>Laba kotor per unit</span><span id="m-laba">–</span></div>
        <div class="calc-row"><span>Markup (dari modal)</span><span id="m-markup">–</span></div>
        <div class="calc-row" id="m-bep-row" hidden><span>Titik impas (BEP)</span><span id="m-bep">–</span></div>
        <div class="calc-total good" id="m-margin-box"><span class="lbl">Margin</span><span class="val" id="m-margin">–</span></div>
        <p class="calc-sub" id="m-note"></p>
      </div>
    </div>

    <h2>Cara menghitung margin & HPP</h2>
    <p>HPP (Harga Pokok Penjualan) bukan cuma harga beli dari supplier, tapi <strong>total biaya menyiapkan satu produk sampai ke pembeli</strong>: modal barang, packaging, ongkir masuk, dan cadangan retur. Rumusnya:</p>
    <ul>
      <li><strong>Laba kotor per unit</strong> = Harga jual − HPP</li>
      <li><strong>Margin (%)</strong> = (Laba kotor ÷ Harga jual) × 100</li>
      <li><strong>Markup (%)</strong> = (Laba kotor ÷ HPP) × 100</li>
      <li><strong>BEP (unit)</strong> = Biaya tetap bulanan ÷ Laba kotor per unit</li>
    </ul>
    <p class="note">Kalkulator ini menghitung margin kotor. Potongan marketplace (admin, gratis ongkir, dll.) belum termasuk — untuk itu pakai <a href="/kalkulator/biaya-marketplace/">Kalkulator Biaya Marketplace</a>. Penjelasan lengkap ada di panduan <a href="/panduan/cara-menghitung-margin-dan-hpp/">cara menghitung margin &amp; HPP</a>.</p>
<script>
(function(){
  var f=function(n){return 'Rp '+Math.round(n).toLocaleString('id-ID');};
  var hpp=document.getElementById('m-hpp'),harga=document.getElementById('m-harga'),fixed=document.getElementById('m-fixed');
  var out=document.getElementById('m-out'),laba=document.getElementById('m-laba'),markup=document.getElementById('m-markup');
  var margin=document.getElementById('m-margin'),box=document.getElementById('m-margin-box'),bepRow=document.getElementById('m-bep-row'),bep=document.getElementById('m-bep'),note=document.getElementById('m-note');
  function calc(){
    var c=parseFloat(hpp.value)||0, p=parseFloat(harga.value)||0, fx=parseFloat(fixed.value)||0;
    if(p<=0){out.hidden=true;return;}
    out.hidden=false;
    var l=p-c, mg=l/p*100, mk=c>0?l/c*100:0;
    laba.textContent=f(l);
    markup.textContent=c>0?mk.toFixed(1)+'%':'–';
    margin.textContent=mg.toFixed(1)+'%';
    box.classList.toggle('good', l>=0); box.classList.toggle('calc-total', true);
    if(l<0){box.className='calc-total';note.textContent='Harga jual di bawah modal — kamu rugi Rp '+Math.abs(l).toLocaleString('id-ID')+' per unit.';}
    else{note.textContent='';}
    if(fx>0 && l>0){bepRow.hidden=false; var u=Math.ceil(fx/l); bep.textContent=u.toLocaleString('id-ID')+' unit/bln ('+f(u*p)+' omzet)';}
    else{bepRow.hidden=true;}
  }
  [hpp,harga,fixed].forEach(function(el){el.addEventListener('input',calc);});
})();
</script>`,
    faqs: [
      { q: 'Apa bedanya margin dan markup?', a: 'Margin dihitung dari <strong>harga jual</strong> ((laba ÷ harga jual) × 100), sedangkan markup dihitung dari <strong>modal</strong> ((laba ÷ HPP) × 100). Untuk harga dan laba yang sama, angka markup selalu lebih besar dari margin. Pembeli dan laporan biasanya bicara margin.' },
      { q: 'Apakah kalkulator ini sudah termasuk biaya admin Shopee?', a: 'Belum. Kalkulator ini menghitung margin kotor (harga jual dikurangi HPP). Untuk menghitung potongan marketplace dan dana bersih yang kamu terima, gunakan <a href="/kalkulator/biaya-marketplace/">Kalkulator Biaya Marketplace</a> (Shopee, TikTok Shop, Tokopedia, Lazada, Blibli).' },
      { q: 'Berapa margin yang sehat untuk jualan online?', a: 'Tidak ada angka tunggal — tergantung kategori, volume, dan biaya iklan. Yang penting margin masih positif <strong>setelah</strong> semua biaya (HPP, potongan Shopee, iklan, retur). Produk laku bermargin tipis bisa bikin sibuk tapi tidak untung.' },
    ],
  },
  {
    slug: 'biaya-marketplace',
    title: 'Kalkulator Biaya Admin Marketplace 2026 — Shopee, TikTok, Tokopedia, Lazada, Blibli | LarisID',
    desc: 'Bandingkan potongan biaya admin lima marketplace Indonesia per kategori produk. Pilih marketplace, pilih kategori, lihat dana bersih yang kamu terima — gratis, tanpa login.',
    h1: 'Kalkulator Biaya Admin Marketplace 2026',
    cardNote: 'Bandingkan potongan Shopee, TikTok Shop, Tokopedia, Lazada & Blibli',
    lead: 'Produk yang sama kena potongan berbeda di tiap marketplace — dan berbeda lagi per kategori. Pilih marketplace dan kategori produkmu, kalkulator mengisi tarifnya sendiri dan menunjukkan dana bersih yang benar-benar kamu terima.',
    headExtra: '<script src="/js/marketplace-fees.js?v=20260908a" defer></script>',
    body: `    <div class="calc">
      <div class="mp-pick" id="m-pick" role="radiogroup" aria-label="Pilih marketplace"></div>
      <div class="calc-field">
        <label for="m-harga">Harga jual per unit</label>
        <input type="number" id="m-harga" inputmode="numeric" min="0" value="50000" placeholder="mis. 50000">
      </div>
      <div class="calc-field">
        <label for="m-kat">Kategori produk <span class="hint">(menentukan tarif biaya admin)</span></label>
        <select id="m-kat"></select>
      </div>
      <div class="calc-field" id="m-manual-wrap" hidden>
        <label for="m-manual">Biaya admin manual (%)</label>
        <input type="number" id="m-manual" inputmode="decimal" min="0" max="100" step="0.1" value="8" placeholder="mis. 8">
      </div>
      <label class="calc-check" id="m-prog-wrap"><input type="checkbox" id="m-prog" checked><span>Ikut program <strong id="m-prog-name">Gratis Ongkir XTRA</strong> (<span id="m-prog-pct">5,5%</span>)</span></label>
      <label class="calc-check" id="m-flat-wrap"><input type="checkbox" id="m-flat" checked><span>Biaya proses pesanan (<span id="m-flat-rp">Rp 1.250</span> / pesanan)</span></label>
      <div class="calc-field" style="margin-top:14px">
        <label for="m-hpp">HPP / modal per unit <span class="hint">(opsional — untuk hitung laba bersih)</span></label>
        <input type="number" id="m-hpp" inputmode="numeric" min="0" placeholder="mis. 25000">
      </div>
      <div class="calc-out" id="m-out">
        <div class="calc-row neg"><span>Komisi kategori (<span id="m-commpct">–</span>)</span><span id="m-comm">–</span></div>
        <div class="calc-row neg" id="m-adm-row"><span>Biaya administrasi (<span id="m-admpct">–</span>)</span><span id="m-adm">–</span></div>
        <div class="calc-row neg" id="m-prog-row"><span>Program (<span id="m-progpct2">–</span>)</span><span id="m-progval">–</span></div>
        <div class="calc-row neg" id="m-flat-row"><span>Biaya proses pesanan</span><span id="m-flatval">–</span></div>
        <div class="calc-row neg"><span>Total potongan (<span id="m-totpct">–</span>)</span><span id="m-tot">–</span></div>
        <div class="calc-total good" id="m-net-box"><span class="lbl">Dana diterima</span><span class="val" id="m-net">–</span></div>
        <div class="calc-row" id="m-profit-row" hidden style="border-bottom:none;margin-top:8px"><span>Laba bersih per unit <span class="hint" id="m-marginbersih"></span></span><span id="m-profit">–</span></div>
        <p class="calc-sub" id="m-note"></p>
      </div>
    </div>

    <h2>Bandingkan semua marketplace</h2>
    <p>Potongan yang sama dihitung ulang untuk kelima platform pada harga dan kategori di atas. Kolom persen adalah <strong>komisi kategori + biaya administrasi</strong> — dasar yang bisa dibandingkan apple-to-apple; program gratis ongkir dihitung terpisah karena hanya Shopee yang menerbitkan tarif resminya.</p>
    <div class="cmp-wrap">
      <table class="cmp">
        <thead><tr><th>Marketplace</th><th>Biaya dasar</th><th>Potongan / unit</th><th>Dana diterima</th></tr></thead>
        <tbody id="m-cmp"></tbody>
      </table>
    </div>

    <div class="disclaimer">
      <p><strong>Sumber &amp; kaveat.</strong> Tarif mengacu pada struktur biaya yang berlaku per <strong id="m-updated">September 2026</strong> untuk <strong>penjual Non-Star / non-Mall</strong>: Shopee 2,5%–10% per kategori (Januari 2026), TikTok Shop &amp; Tokopedia 2,5%–10% dengan batas komisi Rp 650.000 per item (18 Mei 2026), Lazada dengan batas Rp 20.000 per produk (Februari 2026), dan Blibli 2%–8% mengikuti kontrak merchant. <strong>Tiap platform dapat mengubah tarif sewaktu-waktu dan besarannya berbeda menurut status toko.</strong> Cek halaman resmi tiap platform sebelum menetapkan harga — tautan sumber muncul di bawah hasil. Kalkulator ini alat bantu, bukan angka resmi.</p>
    </div>

    <h2>Kenapa potongan tiap marketplace berbeda</h2>
    <ul>
      <li><strong>Kategori menentukan tarif.</strong> Senter yang kamu jual masuk Elektronik, bukan Fashion — dan selisihnya nyata. Salah menebak kategori berarti salah menghitung margin.</li>
      <li><strong>Batas komisi (cap).</strong> Lazada membatasi komisi di Rp 20.000 per produk dan TikTok Shop / Tokopedia di Rp 650.000 per item. Untuk produk mahal, potongan efektifnya jauh di bawah persentase dasarnya.</li>
      <li><strong>Biaya per pesanan.</strong> Rp 1.250 flat terasa kecil di produk Rp 200rb, tapi jadi 2,5% di produk Rp 50rb.</li>
      <li><strong>Program gratis ongkir.</strong> Opsional, tapi hampir wajib untuk konversi. Di Shopee tarifnya sekitar 5,5%.</li>
    </ul>
    <p class="note">Jualan juga di TikTok Shop, Tokopedia, Lazada atau Blibli? Bandingkan potongan kelimanya di <a href="/kalkulator/biaya-marketplace/">Kalkulator Biaya Marketplace</a>. Setelah tahu dana bersih yang diterima, cek apakah masih untung setelah modal dengan <a href="/kalkulator/margin-hpp/">Kalkulator Margin &amp; HPP</a>, lalu validasi permintaan produknya di <a href="/riset/">riset pasar LarisID</a>.</p>
<script>
// Runs on DOMContentLoaded, not inline: /js/marketplace-fees.js is deferred, so
// it has not executed yet while this script tag is being parsed.
function initBiayaMarketplace(){
  var M = window.LARIS_MP;
  if (!M) {
    document.getElementById('m-out').innerHTML =
      '<p class="calc-sub">Tabel tarif gagal dimuat. Muat ulang halaman ini untuk memakai kalkulator.</p>';
    return;
  }
  var f = function(n){ return 'Rp ' + Math.round(n).toLocaleString('id-ID'); };
  var $ = function(id){ return document.getElementById(id); };
  var sel = 'shopee';

  var pick = $('m-pick'), kat = $('m-kat');
  pick.innerHTML = M.KEYS.map(function(k){
    return '<button type="button" class="mp-btn" role="radio" aria-checked="' + (k === sel) + '" tabindex="' + (k === sel ? 0 : -1) + '" data-mp="' + k + '">'
      + M.logo(k) + '<span class="mp-nm">' + M.FEES[k].label + '</span><span class="mp-pc" data-pc="' + k + '">–</span></button>';
  }).join('');
  kat.innerHTML = M.CANON_CATS.map(function(c){
    return '<option value="' + c + '"' + (c === 'Fashion' ? ' selected' : '') + '>' + c + '</option>';
  }).join('') + '<option value="__manual">Lainnya / isi manual…</option>';
  $('m-updated').textContent = M.UPDATED;

  function opts(){
    var manual = kat.value === '__manual';
    return {
      cat: manual ? '' : kat.value,
      o: { commManual: manual ? (parseFloat($('m-manual').value) || 0) : null, programOn: $('m-prog').checked },
      manual: manual,
    };
  }

  function calc(){
    var st = opts();
    $('m-manual-wrap').hidden = !st.manual;
    var price = parseFloat($('m-harga').value) || 0;
    var plat = M.FEES[sel];
    var r = M.feeRp(sel, st.cat, price, st.o);

    // Tiles compare the baseline (komisi + biaya admin) so the numbers mean
    // the same thing on every platform.
    M.KEYS.forEach(function(k){
      var b = M.rateFor(k, st.cat, { commManual: st.manual ? r.comm : null });
      var el = pick.querySelector('[data-pc="' + k + '"]');
      if (el) el.textContent = M.fmtPct(b.pctBase);
    });

    $('m-prog-wrap').hidden = !(plat.program > 0);
    $('m-prog-name').textContent = plat.programLabel || 'Program promo';
    $('m-prog-pct').textContent = M.fmtPct(plat.program || 0);
    $('m-flat-wrap').hidden = !(plat.flat > 0);
    $('m-flat-rp').textContent = f(plat.flat || 0);

    var flat = (plat.flat > 0 && $('m-flat').checked) ? plat.flat : 0;
    var capped = r.capRp != null && price * r.comm / 100 > r.capRp;
    $('m-commpct').textContent = capped ? 'maks ' + f(r.capRp) : M.fmtPct(r.comm);
    $('m-comm').textContent = '− ' + f(r.commRp);
    $('m-adm-row').hidden = !(r.admin > 0);
    $('m-admpct').textContent = M.fmtPct(r.admin);
    $('m-adm').textContent = '− ' + f(r.adminRp);
    $('m-prog-row').hidden = !(r.program > 0);
    $('m-progpct2').textContent = M.fmtPct(r.program);
    $('m-progval').textContent = '− ' + f(r.programRp);
    $('m-flat-row').hidden = !flat;
    $('m-flatval').textContent = '− ' + f(flat);

    var total = r.pctRp + flat;
    $('m-tot').textContent = '− ' + f(total);
    $('m-totpct').textContent = price > 0 ? (total / price * 100).toFixed(1).replace('.', ',') + '%' : '–';
    var received = price - total;
    $('m-net').textContent = f(received);
    var c = parseFloat($('m-hpp').value) || 0;
    if (c > 0 && price > 0) {
      $('m-profit-row').hidden = false;
      var pr = received - c;
      $('m-profit').textContent = f(pr);
      $('m-marginbersih').textContent = '(' + (pr / price * 100).toFixed(1).replace('.', ',') + '% margin bersih)';
      $('m-profit-row').style.color = pr < 0 ? '#B91C1C' : '';
    } else { $('m-profit-row').hidden = true; }
    $('m-note').innerHTML = (r.note ? r.note + ' ' : '')
      + 'Tarif per ' + M.UPDATED + ' · sumber: <a href="' + r.srcUrl + '" rel="nofollow noopener" target="_blank">' + r.src + '</a>';

    var rows = M.KEYS.map(function(k){
      var kf = M.feeRp(k, st.cat, price, { commManual: st.manual ? r.comm : null, programOn: false });
      var kflat = (M.FEES[k].flat > 0 && $('m-flat').checked) ? M.FEES[k].flat : 0;
      return { k: k, base: kf.pctBaseEffective, cut: kf.pctRp + kflat, net: price - (kf.pctRp + kflat) };
    }).sort(function(a, b){ return a.cut - b.cut; });
    $('m-cmp').innerHTML = rows.map(function(x, i){
      return '<tr class="' + (i === 0 && price > 0 ? 'best' : '') + '"><td>' + M.FEES[x.k].label + '</td>'
        + '<td>' + M.fmtPct(x.base) + '</td>'
        + '<td>' + (price > 0 ? '− ' + f(x.cut) : '–') + '</td>'
        + '<td class="net">' + (price > 0 ? f(x.net) : '–') + '</td></tr>';
    }).join('');
  }

  function select(k){
    sel = k;
    [].forEach.call(pick.querySelectorAll('[data-mp]'), function(b){
      var on = b.dataset.mp === k;
      b.setAttribute('aria-checked', on);
      b.tabIndex = on ? 0 : -1;
    });
    var p = M.FEES[k];
    $('m-prog').checked = !!p.programDefaultOn;
    calc();
  }

  [].forEach.call(pick.querySelectorAll('[data-mp]'), function(b){
    b.addEventListener('click', function(){ select(b.dataset.mp); });
    b.addEventListener('keydown', function(e){
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = M.KEYS.indexOf(b.dataset.mp);
      var n = M.KEYS[(i + (e.key === 'ArrowRight' ? 1 : M.KEYS.length - 1)) % M.KEYS.length];
      select(n);
      pick.querySelector('[data-mp="' + n + '"]').focus();
    });
  });
  ['m-harga','m-kat','m-manual','m-prog','m-flat','m-hpp'].forEach(function(id){
    $(id).addEventListener('input', calc);
    $(id).addEventListener('change', calc);
  });
  calc();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBiayaMarketplace);
else initBiayaMarketplace();
</script>`,
    faqs: [
      { q: 'Marketplace mana yang biaya adminnya paling murah?', a: 'Tergantung kategori dan harga produk, bukan platformnya saja. Untuk fashion, kelimanya berada di kisaran 8%–10%. Untuk elektronik high-end, Blibli dan Lazada biasanya paling rendah, dan batas komisi Lazada (Rp 20.000 per produk) membuat potongan efektifnya turun tajam pada produk mahal. Masukkan harga dan kategorimu di kalkulator — tabel perbandingan di atas menghitung kelimanya sekaligus.' },
      { q: 'Kenapa biaya admin berbeda per kategori?', a: 'Setiap marketplace mengelompokkan produk ke beberapa tingkat tarif. Shopee misalnya menaruh fashion, FMCG, makanan, dan perlengkapan rumah di kategori tertinggi (10%), sementara elektronik high-end 5,25% dan logam mulia 4,25%. Karena itu <strong>salah menebak kategori berarti salah menghitung margin</strong> — senter masuk Elektronik, bukan Fashion.' },
      { q: 'Apa itu batas komisi (cap) dan kenapa penting?', a: 'Beberapa platform membatasi komisi dalam Rupiah per item: Lazada Rp 20.000 per produk, dan TikTok Shop / Tokopedia Rp 650.000 per item sejak 18 Mei 2026. Untuk produk mahal, potongan yang benar-benar dipungut jauh di bawah persentase dasarnya — kalkulator ini sudah menerapkan batas tersebut.' },
      { q: 'Apakah angka kalkulator ini resmi?', a: 'Bukan. Ini perkiraan untuk penjual Non-Star / non-Mall berdasarkan tarif publik yang berlaku per September 2026, dan setiap angka bisa kamu ubah manual. Tarif berubah sewaktu-waktu dan berbeda menurut status toko. Blibli bahkan tidak menerbitkan tarif per kategori — komisinya mengikuti kontrak merchant. Selalu verifikasi di Seller Center masing-masing platform.' },
    ],
  },
  {
    slug: 'biaya-shopee',
    title: 'Kalkulator Biaya Admin Shopee 2026 (Gratis) | LarisID',
    desc: 'Hitung potongan biaya admin Shopee 2026 per kategori, program Gratis Ongkir XTRA, biaya proses pesanan, dan SPayLater — tahu persis berapa dana yang kamu terima.',
    h1: 'Kalkulator Biaya Admin Shopee 2026',
    cardNote: 'Hitung potongan admin, gratis ongkir & dana bersih diterima',
    lead: 'Berapa yang benar-benar kamu terima setelah dipotong Shopee? Masukkan harga jual, pilih kategori dan program yang aktif — kalkulator menghitung total potongan dan dana bersihmu.',
    headExtra: '<script src="/js/marketplace-fees.js?v=20260908a" defer></script>',
    body: `    <div class="calc">
      <div class="calc-field">
        <label for="s-harga">Harga jual per unit</label>
        <input type="number" id="s-harga" inputmode="numeric" min="0" placeholder="mis. 50000">
      </div>
      <div class="calc-field">
        <label for="s-kat">Kategori produk <span class="hint">(menentukan tarif biaya admin)</span></label>
        <select id="s-kat"></select>
      </div>
      <div class="calc-field" id="s-custom-wrap" hidden>
        <label for="s-custom">Biaya admin manual (%)</label>
        <input type="number" id="s-custom" inputmode="decimal" min="0" max="100" step="0.1" placeholder="mis. 8">
      </div>
      <label class="calc-check"><input type="checkbox" id="s-go" checked><span>Ikut program <strong>Gratis Ongkir XTRA</strong> (+5,5%)</span></label>
      <label class="calc-check"><input type="checkbox" id="s-proc" checked><span>Biaya proses pesanan (Rp 1.250 / pesanan)</span></label>
      <label class="calc-check"><input type="checkbox" id="s-spl"><span>Pembeli pakai <strong>SPayLater</strong> (+2,5%)</span></label>
      <div class="calc-field" style="margin-top:14px">
        <label for="s-hpp">HPP / modal per unit <span class="hint">(opsional — untuk hitung laba bersih)</span></label>
        <input type="number" id="s-hpp" inputmode="numeric" min="0" placeholder="mis. 25000">
      </div>
      <div class="calc-out" id="s-out" hidden>
        <div class="calc-row neg"><span>Biaya admin (<span id="s-adminpct">10</span>%)</span><span id="s-admin">–</span></div>
        <div class="calc-row neg" id="s-go-row"><span>Gratis Ongkir XTRA (5,5%)</span><span id="s-goval">–</span></div>
        <div class="calc-row neg" id="s-proc-row"><span>Biaya proses pesanan</span><span id="s-procval">–</span></div>
        <div class="calc-row neg" id="s-spl-row" hidden><span>SPayLater (2,5%)</span><span id="s-splval">–</span></div>
        <div class="calc-row neg"><span>Total potongan (<span id="s-totpct">–</span>)</span><span id="s-tot">–</span></div>
        <div class="calc-total good" id="s-net-box"><span class="lbl">Dana diterima</span><span class="val" id="s-net">–</span></div>
        <div class="calc-row" id="s-profit-row" hidden style="border-bottom:none;margin-top:8px"><span>Laba bersih per unit <span class="hint" id="s-marginbersih"></span></span><span id="s-profit">–</span></div>
      </div>
    </div>

    <div class="disclaimer">
      <p><strong>Sumber &amp; kaveat.</strong> Tarif di atas mengacu pada struktur biaya Shopee Indonesia yang berlaku sejak Januari 2026 (biaya admin 2,5%–10% per kategori, Gratis Ongkir XTRA ~5,5%, biaya proses pesanan Rp 1.250/pesanan, SPayLater ~2,5%). <strong>Shopee dapat mengubah tarif sewaktu-waktu dan besarannya bisa berbeda menurut status toko</strong> (Non-Star / Star / Star+ / Shopee Mall). Selalu cek angka terbaru di <a href="https://seller.shopee.co.id/edu/article/7187" rel="nofollow noopener" target="_blank">Pusat Edukasi Penjual Shopee</a> sebelum menetapkan harga. Kalkulator ini alat bantu, bukan angka resmi.</p>
    </div>

    <h2>Cara kerja potongan biaya Shopee</h2>
    <p>Total yang dipotong Shopee dari setiap pesanan biasanya terdiri dari:</p>
    <ul>
      <li><strong>Biaya administrasi</strong> — persentase dari harga jual, tergantung kategori produk (2,5%–10%).</li>
      <li><strong>Program Gratis Ongkir XTRA</strong> — sekitar 5,5% jika toko ikut program (opsional tapi mendongkrak konversi).</li>
      <li><strong>Biaya proses pesanan</strong> — Rp 1.250 flat per pesanan.</li>
      <li><strong>Biaya SPayLater</strong> — sekitar 2,5% jika pembeli bayar pakai SPayLater.</li>
    </ul>
    <p class="note">Setelah tahu dana bersih yang diterima, cek apakah masih untung setelah modal dengan <a href="/kalkulator/margin-hpp/">Kalkulator Margin &amp; HPP</a>, lalu validasi permintaan produknya di <a href="/riset/">riset pasar LarisID</a>.</p>
<script>
// Deferred /js/marketplace-fees.js has not run yet while this tag is parsed.
function initBiayaShopee(){
  var M=window.LARIS_MP;
  var f=function(n){return 'Rp '+Math.round(n).toLocaleString('id-ID');};
  var harga=document.getElementById('s-harga'),kat=document.getElementById('s-kat'),customWrap=document.getElementById('s-custom-wrap'),custom=document.getElementById('s-custom');
  if(!M){document.getElementById('s-out').innerHTML='<p class="calc-sub">Tabel tarif gagal dimuat. Muat ulang halaman ini untuk memakai kalkulator.</p>';document.getElementById('s-out').hidden=false;return;}
  // Tier labels are Shopee's own grouping; the percentages come from the shared
  // table so this page can never drift from the app's kalkulator.
  var TIERS=[
    ['A','Fashion, tas, sepatu, aksesoris, FMCG, makanan &amp; minuman, perlengkapan rumah, mainan'],
    ['B','Skincare, kosmetik, elektronik tertentu, olahraga'],
    ['C','Susu formula, suplemen, makanan bayi'],
    ['D','Elektronik high-end: laptop, HP, tablet'],
    ['E','Logam mulia, perhiasan, emas'],
  ];
  var SH=M.FEES.shopee;
  kat.innerHTML=TIERS.map(function(t){
    return '<option value="'+SH.comm[t[0]]+'">Kategori '+t[0]+' — '+t[1]+' ('+M.fmtPct(SH.comm[t[0]])+')</option>';
  }).join('')+'<option value="2.5">Kategori Khusus — E-money, voucher, tiket (2,5%)</option>'
    +'<option value="custom">Isi manual…</option>';
  var go=document.getElementById('s-go'),proc=document.getElementById('s-proc'),spl=document.getElementById('s-spl'),hpp=document.getElementById('s-hpp');
  var out=document.getElementById('s-out');
  var adminPct=document.getElementById('s-adminpct'),admin=document.getElementById('s-admin');
  var goRow=document.getElementById('s-go-row'),goVal=document.getElementById('s-goval');
  var procRow=document.getElementById('s-proc-row'),procVal=document.getElementById('s-procval');
  var splRow=document.getElementById('s-spl-row'),splVal=document.getElementById('s-splval');
  var totPct=document.getElementById('s-totpct'),tot=document.getElementById('s-tot');
  var net=document.getElementById('s-net'),profitRow=document.getElementById('s-profit-row'),profit=document.getElementById('s-profit'),marginBersih=document.getElementById('s-marginbersih');
  var PROC_FEE=SH.flat, GO_PCT=SH.program, SPL_PCT=2.5; // SPayLater is Shopee-only
  document.querySelector('label[for="s-go"], #s-go')?.closest('.calc-check')
    ?.querySelector('span')?.replaceChildren(
      Object.assign(document.createElement('span'),{innerHTML:'Ikut program <strong>'+SH.programLabel+'</strong> ('+M.fmtPct(GO_PCT)+')'}));
  document.getElementById('s-go-row').firstElementChild.textContent=SH.programLabel+' ('+M.fmtPct(GO_PCT)+')';
  function calc(){
    customWrap.hidden = kat.value!=='custom';
    var p=parseFloat(harga.value)||0;
    if(p<=0){out.hidden=true;return;}
    out.hidden=false;
    var ap = kat.value==='custom' ? (parseFloat(custom.value)||0) : parseFloat(kat.value);
    var adminFee=p*ap/100;
    adminPct.textContent=ap.toString().replace('.',',');
    admin.textContent='− '+f(adminFee);
    var goFee=go.checked?p*GO_PCT/100:0; goRow.hidden=!go.checked; goVal.textContent='− '+f(goFee);
    var procFee=proc.checked?PROC_FEE:0; procRow.hidden=!proc.checked; procVal.textContent='− '+f(procFee);
    var splFee=spl.checked?p*SPL_PCT/100:0; splRow.hidden=!spl.checked; splVal.textContent='− '+f(splFee);
    var total=adminFee+goFee+procFee+splFee;
    tot.textContent='− '+f(total);
    totPct.textContent=(total/p*100).toFixed(1).replace('.',',')+'%';
    var received=p-total;
    net.textContent=f(received);
    var c=parseFloat(hpp.value)||0;
    if(c>0){profitRow.hidden=false; var pr=received-c; profit.textContent=f(pr); marginBersih.textContent='('+(pr/p*100).toFixed(1).replace('.',',')+'% margin bersih)'; profitRow.style.color = pr<0?'#B91C1C':'';}
    else{profitRow.hidden=true;}
  }
  [harga,kat,custom,go,proc,spl,hpp].forEach(function(el){el.addEventListener('input',calc);el.addEventListener('change',calc);});
  calc();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBiayaShopee);
else initBiayaShopee();
</script>`,
    faqs: [
      { q: 'Berapa biaya admin Shopee 2026?', a: 'Sejak Januari 2026, biaya admin Shopee berkisar <strong>2,5% hingga 10%</strong> dari harga jual tergantung kategori: Kategori A (fashion, FMCG, makanan, perlengkapan rumah) 10%; skincare/kosmetik/elektronik tertentu ~9,5%; susu formula/suplemen ~6,75%; elektronik high-end 5,25%; logam mulia 4,25%; e-money/voucher/tiket 2,5%. Besaran bisa berbeda menurut status toko dan sewaktu-waktu berubah — cek Pusat Edukasi Penjual Shopee untuk angka terbaru.' },
      { q: 'Apa saja potongan selain biaya admin?', a: 'Selain biaya administrasi, umumnya ada <strong>biaya proses pesanan Rp 1.250 per pesanan</strong>, <strong>program Gratis Ongkir XTRA sekitar 5,5%</strong> (jika toko ikut), dan <strong>biaya SPayLater ~2,5%</strong> bila pembeli membayar dengan SPayLater. Total potongan tanpa SPayLater umumnya berkisar 11%–16% untuk Kategori A.' },
      { q: 'Apakah angka kalkulator ini resmi dari Shopee?', a: 'Bukan. Ini alat bantu berdasarkan tarif publik yang berlaku sejak awal 2026. Shopee dapat mengubah tarif dan besarannya bisa berbeda menurut status toko (Non-Star/Star/Star+/Shopee Mall). Selalu verifikasi di <a href="https://seller.shopee.co.id/edu/article/7187" rel="nofollow noopener" target="_blank">Pusat Edukasi Penjual Shopee</a>.' },
    ],
  },
];

fs.mkdirSync(OUT, { recursive: true });
for (const t of TOOLS) {
  const dir = path.join(OUT, t.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), toolPage(t));
  console.log('wrote kalkulator/' + t.slug);
}
fs.writeFileSync(path.join(OUT, 'index.html'), hubPage(TOOLS));
console.log('wrote kalkulator (hub)');
console.log('Done: ' + TOOLS.length + ' tools + hub.');
