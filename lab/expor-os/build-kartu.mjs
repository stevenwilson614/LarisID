#!/usr/bin/env node
/**
 * Merge corpus + Comtrade + Amazon + US rules + HTS + BOL into local kartu HTML.
 * Writes ONLY under lab/expor-os/kartu/. Never touches /expor/ or deploy scripts.
 *
 *   node lab/expor-os/build-kartu.mjs
 *   node lab/expor-os/build-kartu.mjs --only kopi-gayo
 *   node lab/expor-os/build-kartu.mjs --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, DATA, KARTU, loadCorpus, readJson, argList, hasFlag } from './lib/paths.mjs';
import { resolveUsRule } from './lib/resolve-rules.mjs';
import { landedUnit, scenarioHpp } from './lib/landed-cost.mjs';

await import(pathToFileURL(path.join(ROOT, 'js/amazon-fees.js')).href);
const A = globalThis.LARIS_AMZ;
if (!A) throw new Error('js/amazon-fees.js did not assign globalThis.LARIS_AMZ');

const { keywords, bySlug } = loadCorpus();
const pilots = readJson(path.join(DATA, 'pilots.json'));
const tradeDoc = readJson(path.join(ROOT, 'scripts/expor-trade.json'), { products: [] });
const amazonDoc = readJson(path.join(ROOT, 'scripts/expor-amazon.json'), { products: [] });
const rulesDoc = readJson(path.join(DATA, 'us-import-rules.json'));
const htsDuty = readJson(path.join(DATA, 'hts-duty.json'), { by_slug: {} });
const bolDoc = readJson(path.join(DATA, 'bol-importers.json'), { by_slug: {}, _meta: {} });
const censusDoc = readJson(path.join(DATA, 'census-aggregates.json'), { by_hs6: {}, _meta: {} });
const playbooks = readJson(path.join(DATA, 'playbooks.json'));
const siap = readJson(path.join(DATA, 'siap-akun.json'));
const landedDef = readJson(path.join(DATA, 'landed-defaults.json'));

const tradeBy = new Map((tradeDoc.products || []).map((p) => [p.slug, p]));
const amazonBy = new Map((amazonDoc.products || []).map((p) => [p.slug, p]));

const only = argList('--only');
const slugs = only.length
  ? only
  : hasFlag('--all')
    ? keywords.map((k) => k.slug)
    : pilots.slugs;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return A.fmtUsd(n);
}

function fmtIdr(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return A.fmtIdr(n);
}

function fmtPct(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return A.fmtPct(n);
}

function fmtUsdCompact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)} miliar`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)} juta`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)} ribu`;
  return fmtUsd(v);
}

function riskClass(r) {
  if (r === 'aman') return 'ok';
  if (r === 'tinggi') return 'stop';
  return 'warn';
}

function riskLabel(r) {
  return ({ aman: 'Aman-ish', izin_khusus: 'Izin khusus', tinggi: 'Tinggi', cek: 'Cek dulu' })[r] || r;
}

function defaultsFor(kw) {
  return landedDef.by_slug[kw.slug] || landedDef.by_kategori[kw.kategori] || {
    fba: 'large_mid', weight_lb: 1, freight: 'seaLcl', unit_kg: 1, unit_cbm: 0.002,
  };
}

function usDest(trade) {
  return (trade?.destinations || []).find((d) => d.iso === 'US' || d.code === 842) || null;
}

function pageCss() {
  return `
:root { --navy:#10312F; --teal:#0F766E; --bg:#F4F8F7; --td:#1A1A1A; --tm:#5B6B6A; --line:#D5E3E1; --card:#fff; --ok:#065F46; --warn:#92400E; --stop:#991B1B; --emas:#C9974B; }
* { box-sizing:border-box; }
body { margin:0; font:16px/1.55 "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--td); }
a { color:var(--teal); }
.wrap { max-width:760px; margin:0 auto; padding:28px 20px 64px; }
.lab { display:inline-block; font-size:.72rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; background:#10312F; color:#F6FAFA; padding:5px 10px; }
.cat-pill { font-size:.8rem; font-weight:700; color:var(--teal); margin:12px 0 0; }
h1 { font-size:1.85rem; line-height:1.2; margin:.4em 0 .3em; color:var(--navy); }
.lead, .disc { color:var(--tm); }
.disc { font-size:.88rem; }
.meta { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0 28px; }
.chip { font-size:.78rem; font-weight:600; padding:4px 10px; border:1px solid var(--line); background:#fff; }
.chip.ok { background:#ECFDF5; border-color:#A7F3D0; color:var(--ok); }
.chip.warn { background:#FFFBEB; border-color:#FDE68A; color:var(--warn); }
.chip.stop { background:#FEF2F2; border-color:#FECACA; color:var(--stop); }
.hs { font-family:ui-monospace,Menlo,monospace; font-size:.8rem; background:#E6F2F1; color:#0B5A54; padding:3px 8px; }
section { background:var(--card); border:1px solid var(--line); padding:22px 22px 18px; margin:0 0 16px; }
h2 { font-size:1.05rem; margin:0 0 10px; color:var(--navy); }
h3 { font-size:.92rem; margin:16px 0 6px; }
p { margin:0 0 10px; }
ul { margin:0; padding:0 0 0 1.15em; }
li { margin:0 0 6px; }
.bars { margin:12px 0 0; }
.bar { display:grid; grid-template-columns:120px 1fr 90px; gap:8px; align-items:center; margin:0 0 6px; font-size:.85rem; }
.bar i { display:block; height:8px; background:var(--teal); }
table { width:100%; border-collapse:collapse; font-size:.85rem; }
th, td { text-align:left; padding:6px 8px 6px 0; border-bottom:1px solid var(--line); vertical-align:top; }
.nums { font-variant-numeric:tabular-nums; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:12px 0; }
.stat b { display:block; font-size:1.05rem; }
.stat span { font-size:.75rem; color:var(--tm); }
form.lc { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:12px 0; }
form.lc label { font-size:.75rem; color:var(--tm); display:flex; flex-direction:column; gap:4px; }
input, select { font:inherit; padding:6px 8px; border:1px solid var(--line); background:#fff; }
.nav { display:flex; flex-wrap:wrap; gap:10px; margin:8px 0 22px; font-size:.9rem; }
footer { font-size:.8rem; color:var(--tm); margin-top:28px; }
.empty { background:#F6FAFA; border:1px dashed var(--line); padding:12px; font-size:.9rem; color:var(--tm); }
@media (max-width:540px) { .bar { grid-template-columns:1fr; } }
`.trim();
}

function layout({ title, body, extraJs = '' }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${pageCss()}</style>
</head>
<body>
<div class="wrap">
${body}
<footer>Lab offline LarisExpor OS — file lokal, tidak di-deploy ke larisid.com. Bukan nasihat hukum atau klasifikasi bea cukai.</footer>
</div>
${extraJs}
</body>
</html>
`;
}

function amazonSection(amz) {
  if (!amz) {
    return `<div class="empty">Belum ada sampel Amazon untuk kata kunci ini. Seed sekarang hanya meja jati, kursi rotan, dan minyak kelapa. Jalankan collectors/refresh-amazon-pilots.mjs setelah DataForSEO didanai — jangan mengarang harga. Amazon tidak punya field negara asal; omset selalu perkiraan.</div>`;
  }
  const omset = (row) => (row.price != null && row.bought_past_month != null)
    ? row.price * row.bought_past_month
    : null;
  const rows = (amz.top_asins || []).map((r) => `<tr>
    <td>${esc(r.title)}</td>
    <td class="nums">${fmtUsd(r.price)}</td>
    <td class="nums">${r.bought_past_month == null ? '—' : r.bought_past_month}+</td>
    <td class="nums">${omset(r) == null ? '—' : fmtUsd(omset(r))}</td>
  </tr>`).join('');
  return `
<p>Median harga <b>${fmtUsd(amz.price_median)}</b> · ${amz.listings_with_bought || 0}/${amz.results_count || 0} listing punya badge beli. Omset = harga × badge, selalu <b>perkiraan</b>. Amazon tidak punya field negara asal.</p>
<div class="grid">
  <div class="stat"><b>${fmtUsd(amz.price_min)}–${fmtUsd(amz.price_max)}</b><span>Rentang harga sampel</span></div>
  <div class="stat"><b>${amz.bought_median == null ? '—' : amz.bought_median + '+'}</b><span>Median badge / bulan</span></div>
  <div class="stat"><b>${amz.reviews_median ?? '—'}</b><span>Median ulasan</span></div>
</div>
<table><thead><tr><th>ASIN (bukan bukti buatan Indonesia)</th><th>Harga</th><th>Terjual/bln</th><th>Omset perkiraan</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

function tradeSection(trade) {
  if (!trade?.has_data) {
    return `<div class="empty">Comtrade tidak punya baris untuk kode ini pada tahun yang ditarik. Itu bukan bukti “tidak ada permintaan”.</div>`;
  }
  const us = usDest(trade);
  const bars = (trade.destinations || []).slice(0, 8).map((d) => {
    const w = Math.max(2, Math.round(d.share || 0));
    return `<div class="bar"><span>${esc(d.nama)}</span><i style="width:${w}%"></i><span class="nums">${fmtUsdCompact(d.value)} (${d.share}%)</span></div>`;
  }).join('');
  return `
<p>Ekspor Indonesia ${trade.year}, HS${trade.hs_level} <span class="hs">${esc(trade.hs_used)}</span>. Ini total negara, bukan satu penjual.</p>
<div class="grid">
  <div class="stat"><b>${fmtUsdCompact(trade.world_value)}</b><span>Nilai dunia</span></div>
  <div class="stat"><b>${trade.growth_pct == null ? '—' : trade.growth_pct + '%'}</b><span>Perubahan vs tahun sebelumnya</span></div>
  <div class="stat"><b>${us ? fmtUsdCompact(us.value) + ` (${us.share}%)` : '—'}</b><span>Ke Amerika Serikat</span></div>
</div>
<div class="bars">${bars}</div>
<p class="disc">${esc(trade.hs_desc_exact || trade.hs_desc || '')}</p>`;
}

function rulesSection(rule) {
  if (!rule) return `<div class="empty">Belum ada paket aturan US untuk kategori ini.</div>`;
  const flags = (rule.flags || []).map((f) => `<span class="chip">${esc(f)}</span>`).join('');
  const agencies = (rule.agencies || []).map((f) => `<span class="chip">${esc(f)}</span>`).join('');
  const sources = (rule.sources || []).map((u) => `<li><a href="${esc(u)}">${esc(u.replace(/^https?:\/\//, ''))}</a></li>`).join('');
  return `
<p><span class="chip ${riskClass(rule.risk)}">${esc(riskLabel(rule.risk))}</span></p>
<p>${esc(rule.notes_id)}</p>
<p>${agencies} ${flags}</p>
<p class="disc">Bukan nasihat hukum. Konfirmasi ke broker dan halaman resmi di bawah.</p>
<ul>${sources}</ul>`;
}

function importerSection(kw, trade) {
  const bolMeta = bolDoc._meta || {};
  const named = bolMeta.status === 'licensed_csv' ? (bolDoc.by_slug?.[kw.slug]?.importers || []) : [];
  const us = usDest(trade);
  const census = censusDoc.by_hs6?.[kw.hs];
  let namedHtml;
  if (bolMeta.status === 'sample') {
    namedHtml = `<div class="empty">File BOL tertanda sampel. Kartu ini tidak menampilkan nama importer fiktif.</div>`;
  } else if (!named.length) {
    namedHtml = `<div class="empty">Data langganan bill of lading belum diisi. Masukkan CSV berlisensi lewat <code>collectors/ingest-bol-csv.mjs</code>. Jangan mengarang nama importer.</div>`;
  } else {
    namedHtml = `<table><thead><tr><th>Importer</th><th>Kiriman</th><th>Terakhir</th><th>Asal sampel</th></tr></thead><tbody>${
      named.map((n) => `<tr><td>${esc(n.name)}</td><td class="nums">${n.shipment_count}</td><td>${esc(n.last_seen || '—')}</td><td>${esc((n.sample_origins || []).join(', ') || '—')}</td></tr>`).join('')
    }</tbody></table>
    <p class="disc">Dari CSV berlisensi (${esc(bolMeta.source_file || '')}). Bukan scrape.</p>`;
  }
  const aggBits = [];
  if (us) aggBits.push(`Comtrade: ekspor Indonesia ke AS ${fmtUsdCompact(us.value)} (${us.share}% dari dunia) pada ${trade.year}. Agregat, bukan nama perusahaan.`);
  if (census?.gen_val_yr != null) aggBits.push(`Census: impor AS dari Indonesia HS6 ${kw.hs} ≈ ${fmtUsdCompact(census.gen_val_yr)} (${census.year}). Agregat, bukan nama importer.`);
  else if (censusDoc._meta?.status !== 'census_api') aggBits.push('Census API belum diisi (butuh CENSUS_API_KEY).');
  return `${namedHtml}<p class="disc">${esc(aggBits.join(' '))}</p>`;
}

function playbookSection(kw) {
  const pb = playbooks.by_kategori?.[kw.kategori];
  if (!pb?.jalur?.length) return `<div class="empty">Belum ada playbook kategori.</div>`;
  return pb.jalur.map((j) => `<h3>${esc(j.nama)}</h3><p>${esc(j.notes)}</p>`).join('');
}

function checklistSection(kw, rule) {
  const idIzin = (kw.izin || []).map((x) => `<li>Indonesia: ${esc(x)}</li>`).join('');
  const akun = (siap.items || []).map((x) => `<li>${esc(x.title)} — ${esc(x.body)}</li>`).join('');
  const us = (rule?.checklist_us || []).map((x) => `<li>AS: ${esc(x)}</li>`).join('');
  return `
<h3>Dokumen produk (ID)</h3>
<ul>${idIzin || '<li>Tidak ada izin khusus di corpus (tetap cek INSW HS 8-digit).</li>'}
<li>Cek INSW: <a href="https://insw.go.id">insw.go.id</a> — duty corpus = ${esc(kw.duty)}, LARTAS = ${esc(kw.lartas)}</li></ul>
<h3>Masuk Amerika</h3>
<ul>${us || '<li>Lihat bagian boleh masuk.</li>'}</ul>
<h3>Akun jual (Siap Ekspor)</h3>
<ul>${akun}</ul>`;
}

function landedSection(kw, amz, duty) {
  const d = defaultsFor(kw);
  const catKey = A.catFor(kw.kategori);
  const price = amz?.price_median ?? null;
  const hppShare = landedDef._meta?.hpp_share_of_price ?? 0.4;
  const hpp = scenarioHpp(price, hppShare);
  const unit = (price != null && hpp != null)
    ? landedUnit({
      A, priceUsd: price, hppUsd: hpp, catKey, fbaBand: d.fba, weightLb: d.weight_lb,
      freightMode: d.freight, unitKg: d.unit_kg, unitCbm: d.unit_cbm, duty, unitsForDocs: 100,
    })
    : null;
  const dutyLine = duty?.htsno
    ? `HTS kandidat <span class="hs">${esc(duty.htsno)}</span> · general ${esc(duty.general_raw || '—')} · yakin ${esc(duty.confidence)} · ${esc(duty.note || '')}`
    : 'HTS belum di-fetch. Jalankan collectors/fetch-hts-duty.mjs.';
  const result = unit ? `
<div class="grid">
  <div class="stat"><b>${fmtUsd(unit.price)}</b><span>Harga jual skenario (median Amazon)</span></div>
  <div class="stat"><b>${fmtUsd(unit.hpp)}</b><span>HPP skenario (${Math.round(hppShare * 100)}% harga)</span></div>
  <div class="stat"><b>${fmtUsd(unit.freightPer)}</b><span>Ongkir+dok per unit (bukan quote)</span></div>
  <div class="stat"><b>${unit.dutyUsd == null ? 'cek HTS' : fmtUsd(unit.dutyUsd)}</b><span>Bea MFN (${esc(unit.dutyNote)})</span></div>
  <div class="stat"><b>${fmtUsd(unit.referral)}</b><span>Referral ${esc(unit.referralLabel)}</span></div>
  <div class="stat"><b>${fmtUsd(unit.fba)}</b><span>FBA + fuel</span></div>
  <div class="stat"><b>${unit.sisa == null ? '—' : fmtUsd(unit.sisa)}</b><span>Sisa skenario / unit</span></div>
  <div class="stat"><b>${fmtPct(unit.marginPct)}</b><span>Margin skenario</span></div>
</div>` : `<div class="empty">Tidak ada harga Amazon, jadi margin tidak dihitung. Bea dan ongkir tetap bisa diisi di form setelah fetch Amazon.</div>`;

  return `
<p>${dutyLine}</p>
<p class="disc">Skenario lab: HPP = ${Math.round(hppShare * 100)}% median harga (kalau ada), ongkir default ${esc(d.freight)}, FBA ${esc(d.fba)}. Ganti angkanya. Ini bukan landed cost resmi.</p>
${result}
<form class="lc" id="lc" data-cat="${esc(catKey)}" data-duty-kind="${esc(duty?.kind || '')}" data-duty-pct="${duty?.duty_pct ?? ''}" data-docs="${A.FREIGHT.docs.usdFlat}">
  <label>Harga jual USD <input name="price" type="number" step="0.01" value="${price ?? ''}"></label>
  <label>HPP USD <input name="hpp" type="number" step="0.01" value="${hpp ?? ''}"></label>
  <label>Kg / unit <input name="kg" type="number" step="0.01" value="${d.unit_kg}"></label>
  <label>CBM / unit <input name="cbm" type="number" step="0.0001" value="${d.unit_cbm}"></label>
  <label>Berat FBA (lb) <input name="lb" type="number" step="0.1" value="${d.weight_lb}"></label>
  <label>Mode kirim
    <select name="mode">
      <option value="air"${d.freight === 'air' ? ' selected' : ''}>Udara</option>
      <option value="seaLcl"${d.freight === 'seaLcl' ? ' selected' : ''}>Laut LCL</option>
      <option value="seaFcl20"${d.freight === 'seaFcl20' ? ' selected' : ''}>FCL 20ft (flat, abaikan CBM)</option>
    </select>
  </label>
  <label>FBA
    <select name="fba">${A.FBA.bands.map((b) => `<option value="${b.key}"${b.key === d.fba ? ' selected' : ''}>${esc(b.label)}</option>`).join('')}</select>
  </label>
</form>
<p id="lc-out" class="disc"></p>
<p class="disc">${esc(A.FREIGHT.note)} Kurs default ${A.FX.idrPerUsd.toLocaleString('id-ID')} — ${esc(A.FX.note)}</p>`;
}

function kartuJs() {
  const helper = `
(function () {
  var form = document.getElementById('lc');
  if (!form || !globalThis.LARIS_AMZ) return;
  var A = globalThis.LARIS_AMZ;
  var out = document.getElementById('lc-out');
  function num(name) { return Number(form[name].value) || 0; }
  function run() {
    var price = num('price'); var hpp = num('hpp');
    var cat = form.getAttribute('data-cat');
    var ref = A.referralFee(cat, price);
    var fba = A.fbaFee(form.fba.value, num('lb'));
    var mode = form.mode.value;
    var freight = mode === 'air' ? num('kg') * A.FREIGHT.air.usdPerKg
      : mode === 'seaFcl20' ? A.FREIGHT.seaFcl20.usdFlat / 100
      : num('cbm') * A.FREIGHT.seaLcl.usdPerCbm;
    var docsPer = A.FREIGHT.docs.usdFlat / 100;
    var freightPer = freight + docsPer;
    var kind = form.getAttribute('data-duty-kind');
    var pct = form.getAttribute('data-duty-pct');
    var customs = hpp + freightPer;
    var duty = (kind === 'simple' && pct !== '') ? customs * (Number(pct) / 100) : null;
    var sisa = duty == null ? null : price - hpp - freightPer - fba - ref.usd - duty;
    out.textContent = [
      'Referral ' + A.fmtUsd(ref.usd),
      'FBA ' + A.fmtUsd(fba),
      'Ongkir+dok/unit ' + A.fmtUsd(freightPer),
      'Bea ' + (duty == null ? 'cek HTS' : A.fmtUsd(duty)),
      'Sisa ' + (sisa == null ? '—' : A.fmtUsd(sisa) + ' (' + A.fmtIdr(sisa * A.FX.idrPerUsd) + ')')
    ].join(' · ');
  }
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  run();
})();`;
  return `<script src="../../../../js/amazon-fees.js"></script>\n<script>${helper}</script>`;
}

function buildPage(slug) {
  const kw = bySlug.get(slug);
  if (!kw) throw new Error(`unknown slug ${slug}`);
  const trade = tradeBy.get(slug);
  const amz = amazonBy.get(slug);
  const rule = resolveUsRule(rulesDoc, kw);
  const duty = htsDuty.by_slug?.[slug] || null;
  const body = `
<p class="lab">Lab offline · tidak di-deploy</p>
<p class="nav"><a href="../index.html">Semua kartu</a></p>
<p class="cat-pill">${esc(kw.kategori)} · ${esc(kw.wilayah)}</p>
<h1>${esc(kw.nama)}</h1>
<p class="lead">Kata kunci Amazon: “${esc(kw.kw)}”. Corpus HS6 <span class="hs">${esc(kw.hs)}</span>.</p>
<div class="meta">
  ${rule ? `<span class="chip ${riskClass(rule.risk)}">${esc(riskLabel(rule.risk))}</span>` : ''}
  <span class="chip">Duty ID: ${esc(kw.duty)}</span>
  <span class="chip">LARTAS: ${esc(kw.lartas)}</span>
</div>

<section>
  <h2>1. Permintaan</h2>
  <h3>Comtrade (ekspor Indonesia)</h3>
  ${tradeSection(trade)}
  <h3>Harga di Amazon US</h3>
  ${amazonSection(amz)}
</section>

<section>
  <h2>2. Boleh masuk AS?</h2>
  ${rulesSection(rule)}
</section>

<section>
  <h2>3. Landed cost (skenario)</h2>
  ${landedSection(kw, amz, duty)}
</section>

<section>
  <h2>4. Siapa sudah impor</h2>
  ${importerSection(kw, trade)}
</section>

<section>
  <h2>5. Jalur jual</h2>
  ${playbookSection(kw)}
</section>

<section>
  <h2>6. Checklist</h2>
  ${checklistSection(kw, rule)}
</section>
`;
  return layout({ title: `${kw.nama} — kartu ekspor lab`, body, extraJs: kartuJs() });
}

function hub() {
  const rows = slugs.map((slug) => {
    const kw = bySlug.get(slug);
    if (!kw) return '';
    const rule = resolveUsRule(rulesDoc, kw);
    const amz = amazonBy.get(slug);
    const duty = htsDuty.by_slug?.[slug];
    return `<tr>
      <td><a href="${esc(slug)}/index.html">${esc(kw.nama)}</a></td>
      <td>${esc(kw.kategori)}</td>
      <td>${rule ? `<span class="chip ${riskClass(rule.risk)}">${esc(riskLabel(rule.risk))}</span>` : '—'}</td>
      <td class="nums">${amz ? fmtUsd(amz.price_median) : '—'}</td>
      <td>${duty?.general_raw ? esc(duty.general_raw) : '—'}</td>
    </tr>`;
  }).join('');
  const body = `
<p class="lab">Lab offline · tidak di-deploy</p>
<h1>Kartu ekspor</h1>
<p class="lead">${slugs.length} produk. Buka file lokal ini; jangan copy ke <code>expor/</code> atau jalankan deploy-static.</p>
<table><thead><tr><th>Produk</th><th>Kategori</th><th>Masuk AS</th><th>Median Amazon</th><th>MFN</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  return layout({ title: 'Kartu ekspor lab', body });
}

fs.mkdirSync(KARTU, { recursive: true });
for (const slug of slugs) {
  if (!bySlug.has(slug)) {
    process.stderr.write(`skip unknown slug ${slug}\n`);
    continue;
  }
  const dir = path.join(KARTU, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildPage(slug));
  process.stdout.write(`wrote kartu/${slug}/index.html\n`);
}
fs.writeFileSync(path.join(KARTU, 'index.html'), hub());
process.stdout.write(`wrote kartu/index.html (${slugs.length})\n`);
