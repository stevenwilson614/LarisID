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
    <p class="note">Kalkulator ini menghitung margin kotor. Biaya potongan Shopee (admin, gratis ongkir, dll.) belum termasuk — untuk itu pakai <a href="/kalkulator/biaya-shopee/">Kalkulator Biaya Shopee</a>. Penjelasan lengkap ada di panduan <a href="/panduan/cara-menghitung-margin-dan-hpp/">cara menghitung margin &amp; HPP</a>.</p>
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
      { q: 'Apakah kalkulator ini sudah termasuk biaya admin Shopee?', a: 'Belum. Kalkulator ini menghitung margin kotor (harga jual dikurangi HPP). Untuk menghitung potongan Shopee dan dana bersih yang kamu terima, gunakan <a href="/kalkulator/biaya-shopee/">Kalkulator Biaya Shopee</a>.' },
      { q: 'Berapa margin yang sehat untuk jualan online?', a: 'Tidak ada angka tunggal — tergantung kategori, volume, dan biaya iklan. Yang penting margin masih positif <strong>setelah</strong> semua biaya (HPP, potongan Shopee, iklan, retur). Produk laku bermargin tipis bisa bikin sibuk tapi tidak untung.' },
    ],
  },
  {
    slug: 'biaya-shopee',
    title: 'Kalkulator Biaya Admin Shopee 2026 (Gratis) | LarisID',
    desc: 'Hitung potongan biaya admin Shopee 2026 per kategori, program Gratis Ongkir XTRA, biaya proses pesanan, dan SPayLater — tahu persis berapa dana yang kamu terima.',
    h1: 'Kalkulator Biaya Admin Shopee 2026',
    cardNote: 'Hitung potongan admin, gratis ongkir & dana bersih diterima',
    lead: 'Berapa yang benar-benar kamu terima setelah dipotong Shopee? Masukkan harga jual, pilih kategori dan program yang aktif — kalkulator menghitung total potongan dan dana bersihmu.',
    body: `    <div class="calc">
      <div class="calc-field">
        <label for="s-harga">Harga jual per unit</label>
        <input type="number" id="s-harga" inputmode="numeric" min="0" placeholder="mis. 50000">
      </div>
      <div class="calc-field">
        <label for="s-kat">Kategori produk <span class="hint">(menentukan tarif biaya admin)</span></label>
        <select id="s-kat">
          <option value="10">Kategori A — Fashion, tas, sepatu, aksesoris, FMCG, makanan &amp; minuman, perlengkapan rumah, mainan (10%)</option>
          <option value="9.5">Kategori B — Skincare, kosmetik, elektronik tertentu, olahraga (9,5%)</option>
          <option value="6.75">Kategori C — Susu formula, suplemen, makanan bayi (6,75%)</option>
          <option value="5.25">Kategori D — Elektronik high-end: laptop, HP, tablet (5,25%)</option>
          <option value="4.25">Kategori E — Logam mulia, perhiasan, emas (4,25%)</option>
          <option value="2.5">Kategori Khusus — E-money, voucher, tiket (2,5%)</option>
          <option value="custom">Isi manual…</option>
        </select>
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
(function(){
  var f=function(n){return 'Rp '+Math.round(n).toLocaleString('id-ID');};
  var harga=document.getElementById('s-harga'),kat=document.getElementById('s-kat'),customWrap=document.getElementById('s-custom-wrap'),custom=document.getElementById('s-custom');
  var go=document.getElementById('s-go'),proc=document.getElementById('s-proc'),spl=document.getElementById('s-spl'),hpp=document.getElementById('s-hpp');
  var out=document.getElementById('s-out');
  var adminPct=document.getElementById('s-adminpct'),admin=document.getElementById('s-admin');
  var goRow=document.getElementById('s-go-row'),goVal=document.getElementById('s-goval');
  var procRow=document.getElementById('s-proc-row'),procVal=document.getElementById('s-procval');
  var splRow=document.getElementById('s-spl-row'),splVal=document.getElementById('s-splval');
  var totPct=document.getElementById('s-totpct'),tot=document.getElementById('s-tot');
  var net=document.getElementById('s-net'),profitRow=document.getElementById('s-profit-row'),profit=document.getElementById('s-profit'),marginBersih=document.getElementById('s-marginbersih');
  var PROC_FEE=1250, GO_PCT=5.5, SPL_PCT=2.5;
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
})();
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
