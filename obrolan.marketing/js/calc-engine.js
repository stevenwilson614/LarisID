/* Anton TikTok calculator — Set Pricing, Simulasi L/R, Strategi Pricing.
   Rates: obrolan.marketing/data/tiktok-kategori-fees.json (Mei 2026). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AntonCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CAP = 650000;

  function ratesFor(fees, row, toko, growth, pkp) {
    const platform = row ? (toko === 'mall' ? +row.mall || 0 : +row.m || 0) : 0;
    const dinamis = row ? +row.d || 0 : 0;
    let xbp = 0;
    if (growth) {
      const l1 = row && row.l1;
      const renamed = fees && fees.xbpRename && l1 && fees.xbpRename[l1];
      const key = renamed || l1;
      const table = (fees && fees.xbp) || {};
      xbp = key && table[key] != null ? +table[key] : (fees && fees.xbpFallback != null ? +fees.xbpFallback : 0.035);
    }
    const pajak = pkp ? 0.005 / 1.11 : 0.005;
    return { platform, dinamis, xbp, pajak };
  }

  function tidyLabel(s) {
    return String(s || '').replace(/\s+-\s*$/, '').trim();
  }

  function lookupFees(fees, label) {
    if (!fees || !fees.rows || !label) return null;
    const q = tidyLabel(label).toLowerCase();
    if (!q) return null;
    for (let i = 0; i < fees.rows.length; i++) {
      if (tidyLabel(fees.rows[i].label).toLowerCase() === q) return fees.rows[i];
    }
    return null;
  }

  function searchFees(fees, q, limit) {
    const s = String(q || '').trim().toLowerCase();
    const n = limit || 8;
    if (!fees || !fees.rows || s.length < 2) return [];
    const out = [];
    for (let i = 0; i < fees.rows.length; i++) {
      const r = fees.rows[i];
      const hay = (r.label + ' ' + r.l1).toLowerCase();
      if (hay.indexOf(s) !== -1) {
        out.push(r);
        if (out.length >= n) break;
      }
    }
    return out;
  }

  function feeBreakdown(harga, parts, cap) {
    const dinRate = parts.dinamis || 0;
    let dinRp = harga * dinRate;
    let capped = false;
    if (cap > 0 && dinRp > cap) {
      dinRp = cap;
      capped = true;
    }
    const specs = [
      ['platform', 'Komisi platform', parts.platform || 0, harga * (parts.platform || 0)],
      ['dinamis', 'Komisi dinamis', dinRate, dinRp],
      ['paylater', 'Paylater', parts.paylater || 0, harga * (parts.paylater || 0)],
      ['preorder', 'Pre-order', parts.preorder || 0, harga * (parts.preorder || 0)],
      ['pajak', 'Pajak UMKM', parts.pajak || 0, harga * (parts.pajak || 0)],
      ['xbp', 'Growth Xtra', parts.xbp || 0, harga * (parts.xbp || 0)],
      ['aff', 'Komisi iklan toko aff', parts.aff || 0, harga * (parts.aff || 0)],
      ['ads', 'Biaya ads', parts.ads || 0, harga * (parts.ads || 0)]
    ];
    const lines = specs.map((s) => ({ key: s[0], label: s[1], ratio: s[2], rp: s[3], capped: s[0] === 'dinamis' && capped }));
    const tiktokKeys = { platform: 1, dinamis: 1, paylater: 1, preorder: 1, pajak: 1 };
    let tiktokRp = 0;
    let marketingRp = 0;
    lines.forEach((l) => {
      if (tiktokKeys[l.key]) tiktokRp += l.rp;
      else marketingRp += l.rp;
    });
    const feeRp = tiktokRp + marketingRp;
    return {
      lines, capped, feeRp, tiktokRp, marketingRp,
      tiktokPct: harga ? tiktokRp / harga : 0,
      marketingPct: harga ? marketingRp / harga : 0,
      totalPct: harga ? feeRp / harga : 0
    };
  }

  function grossUp(net, parts, cap) {
    const din = parts.dinamis || 0;
    const rest = (parts.platform || 0) + (parts.paylater || 0) + (parts.preorder || 0) +
      (parts.pajak || 0) + (parts.xbp || 0) + (parts.aff || 0) + (parts.ads || 0);
    if (!(net > 0)) return { ok: false };
    if (rest + din >= 1 && !(cap > 0 && din > 0 && rest < 1)) return { ok: false, reason: 'potongan' };
    let harga = net / (1 - (rest + din));
    if (cap > 0 && harga * din > cap) {
      if (rest >= 1) return { ok: false, reason: 'potongan' };
      harga = (net + cap) / (1 - rest);
    }
    return { ok: true, harga };
  }

  function setPricing(input) {
    const cap = input.cap == null ? CAP : input.cap;
    const shared = {
      platform: input.platform || 0,
      dinamis: input.dinamis || 0,
      paylater: input.paylater || 0,
      preorder: input.preorder || 0,
      pajak: input.pajak || 0,
      xbp: input.xbp || 0,
      aff: input.aff || 0
    };
    const ideal = (function () {
      const modal = input.modal;
      const margin = input.margin;
      const proc = input.proc || 0;
      const log = input.log || 0;
      if (modal == null || margin == null || margin < 0 || margin >= 1) return { ok: false };
      const base = modal + proc + log;
      const net = base / (1 - margin);
      const parts = Object.assign({ ads: input.ads || 0 }, shared);
      const up = grossUp(net, parts, cap);
      if (!up.ok) return { ok: false, reason: up.reason };
      const fees = feeBreakdown(up.harga, parts, cap);
      return {
        ok: true, modal, proc, log, margin, base,
        marginRp: net * margin, net,
        harga: up.harga, coret: up.harga / 0.9, awal: up.harga / 0.5,
        roi: parts.ads > 0 ? 1 / parts.ads : null,
        fees
      };
    })();
    const now = (function () {
      const jual = input.jualNow;
      if (jual == null || jual <= 0) return { ok: false };
      const ads = input.roiNow > 0 ? 1 / input.roiNow : 0;
      const parts = Object.assign({ ads }, shared);
      const fees = feeBreakdown(jual, parts, cap);
      const net = jual - fees.feeRp;
      const proc = input.proc || 0;
      const log = input.logNow || 0;
      const modal = input.modal || 0;
      const marginRp = net - modal - proc - log;
      return {
        ok: true, jual, net, marginRp,
        margin: net !== 0 ? marginRp / net : null,
        ads, roi: input.roiNow > 0 ? input.roiNow : null,
        proc, log, modal, fees
      };
    })();
    return { ideal, now };
  }

  function simulasiLR(input) {
    const qty = input.qty;
    const jual = input.jual;
    const avg = input.avg > 0 ? input.avg : 0;
    if (qty == null || qty <= 0 || jual == null || jual <= 0 || !(avg > 0)) return { ok: false };
    const gmv = qty * jual;
    const modalBarang = (input.prod || 0) + (input.pack || 0) + (input.hppLain || 0);
    const hpp = modalBarang / jual;
    const orders = qty / avg;
    const cap = input.cap == null ? CAP : input.cap;
    const dinRate = input.dinamis || 0;
    const dinUnitRaw = jual * dinRate;
    const dinUnit = cap > 0 ? Math.min(dinUnitRaw, cap) : dinUnitRaw;
    const ads = input.roi > 0 ? 1 / input.roi : 0;
    const affRp = gmv * (input.aff || 0) * (input.affCover || 0);
    const iklanRp = gmv * (input.iklan || 0) * (input.iklanCover || 0);
    const lines = [
      { key: 'hpp', label: 'HPP', ratio: hpp, rp: gmv * hpp },
      { key: 'platform', label: 'Komisi platform', ratio: input.platform || 0, rp: gmv * (input.platform || 0) },
      { key: 'preorder', label: 'Pre-order', ratio: input.preorder || 0, rp: gmv * (input.preorder || 0) },
      { key: 'aff', label: 'Komisi affiliate', ratio: (input.aff || 0) * (input.affCover || 0), rp: affRp },
      { key: 'iklan', label: 'Komisi iklan toko', ratio: (input.iklan || 0) * (input.iklanCover || 0), rp: iklanRp },
      { key: 'dinamis', label: 'Komisi dinamis', ratio: dinUnit / jual, rp: dinUnit * qty, capped: cap > 0 && dinUnitRaw > cap },
      { key: 'xbp', label: 'Growth Xtra', ratio: input.xbp || 0, rp: gmv * (input.xbp || 0) },
      { key: 'proc', label: 'Pemrosesan order', ratio: (orders * (input.procFee || 0)) / gmv, rp: orders * (input.procFee || 0) },
      { key: 'log', label: 'Layanan logistik', ratio: (orders * (input.logFee || 0)) / gmv, rp: orders * (input.logFee || 0) },
      { key: 'ads', label: 'Biaya ads', ratio: ads, rp: gmv * ads },
      { key: 'host', label: 'Host', ratio: (input.host || 0) / gmv, rp: input.host || 0 },
      { key: 'kreator', label: 'Kreator', ratio: (input.kreator || 0) / gmv, rp: input.kreator || 0 },
      { key: 'admin', label: 'Packing / admin', ratio: (input.admin || 0) / gmv, rp: input.admin || 0 },
      { key: 'gaji', label: 'Gaji owner', ratio: (input.gaji || 0) / gmv, rp: input.gaji || 0 },
      { key: 'gagal', label: 'Gagal kirim', ratio: input.gagal || 0, rp: gmv * (input.gagal || 0) },
      { key: 'lain', label: 'Lain-lain', ratio: (input.lain || 0) / gmv, rp: input.lain || 0 },
      { key: 'pajak', label: 'Pajak UMKM', ratio: input.pajak || 0, rp: gmv * (input.pajak || 0) }
    ];
    const tot = lines.reduce((s, l) => s + l.rp, 0);
    const discGx = gmv * (input.discGx || 0);
    const discNon = gmv * (input.discNon || 0);
    const disc = discGx + discNon;
    const marginRp = gmv - tot + disc;
    return {
      ok: true, gmv, qty, jual, orders, hpp, modalBarang, tot, disc, discGx, discNon,
      marginRp, margin: marginRp / gmv, ads, lines
    };
  }

  function strategi(input) {
    const shared = input.shared || {};
    const cols = (input.columns || []).map((col) => {
      const omset = col.omset || 0;
      const parts = [
        ['Fee TikTok', shared.fee || 0],
        ['Komisi dinamis', shared.dinamis || 0],
        ['Cashback', shared.cashback || 0],
        ['Voucher xtra', shared.voucher || 0],
        ['Biaya ads', shared.ads || 0],
        ['HPP', col.hpp || 0],
        ['Host', col.host || 0],
        ['Kreator', col.kreator || 0],
        ['Packing / admin', col.pack || 0],
        ['Gaji owner', col.gaji || 0],
        ['Lain-lain', col.lain || 0],
        ['Pajak UMKM', shared.pajak || 0]
      ];
      const tot = parts.reduce((s, p) => s + omset * p[1], 0);
      const margin = omset - tot;
      return {
        name: col.name, omset, tot, margin,
        marginPct: omset ? margin / omset : 0,
        parts: parts.map((p) => ({ label: p[0], ratio: p[1], rp: omset * p[1] }))
      };
    });
    const omset = cols.reduce((s, c) => s + c.omset, 0);
    const adsRp = omset * (shared.ads || 0);
    return { cols, omset, adsRp, roas: adsRp > 0 ? omset / adsRp : null };
  }

  function hppHelper(prod, pack, lain, jual) {
    const total = (prod || 0) + (pack || 0) + (lain || 0);
    return {
      total,
      ofPrice: jual > 0 ? total / jual : null,
      productionOnly: jual > 0 ? (prod || 0) / jual : null
    };
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function fmtRp(n) {
    if (n == null || !isFinite(n)) return '—';
    const sign = n < 0 ? '−' : '';
    return sign + 'Rp' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  }
  function fmtPct(ratio) {
    if (ratio == null || !isFinite(ratio)) return '—';
    const v = Math.round(ratio * 1000) / 10;
    return v.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }
  function fmtPct2(ratio) {
    if (ratio == null || !isFinite(ratio)) return '—';
    const v = Math.round(ratio * 10000) / 100;
    return v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + '%';
  }
  function fmtNum(n, d) {
    if (n == null || !isFinite(n)) return '—';
    return n.toLocaleString('id-ID', { maximumFractionDigits: d == null ? 1 : d });
  }

  function field(id, label, hint, opts) {
    opts = opts || {};
    const cls = opts.plain ? '' : ' class="kuning"';
    const step = opts.step ? ' step="' + opts.step + '"' : '';
    const ph = opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : '';
    return '<div><label>' + label + (hint ? ' <span class="hint">' + hint + '</span>' : '') + '</label>' +
      '<input' + cls + ' id="' + id + '" type="number" min="0" inputmode="decimal"' + step + ph + '></div>';
  }

  function shellHtml() {
    const cols = [
      ['tr', 'Traffic puller'],
      ['po', 'Produk populer'],
      ['mg', 'Produk menguntungkan']
    ];
    const stratCards = cols.map((c) => {
      return '<div class="calc-strat-card" data-col="' + c[0] + '">' +
        '<h3>' + c[1] + '</h3>' +
        field('st-' + c[0] + '-omset', 'Omset (Rp)', 'kamu isi') +
        field('st-' + c[0] + '-hpp', 'HPP (%)', 'kamu isi', { step: '0.1' }) +
        '<div class="calc-hero" id="st-hero-' + c[0] + '"></div>' +
        '<details class="calc-fees"><summary>Biaya kolom ini</summary>' +
        '<div class="calc-row2">' +
          field('st-' + c[0] + '-host', 'Host (%)', '', { step: '0.1' }) +
          field('st-' + c[0] + '-pack', 'Packing (%)', '', { step: '0.1' }) +
        '</div><div class="calc-row2">' +
          field('st-' + c[0] + '-kreator', 'Kreator (%)', '', { step: '0.1' }) +
          field('st-' + c[0] + '-gaji', 'Gaji owner (%)', '', { step: '0.1' }) +
        '</div>' +
        field('st-' + c[0] + '-lain', 'Lain-lain (%)', '', { step: '0.1' }) +
        '</details></div>';
    }).join('');

    return '<div class="tool-native" id="calc-tool">' +
      '<h1>Kalkulator harga TikTok Shop</h1>' +
      '<p class="lead">Tarif komisi Mei 2026 — perkiraan, bukan laporan pajak. Isi yang kuning. Sisanya dihitung.</p>' +
      '<label>Kategori <span class="hint">kamu isi</span></label>' +
      '<div class="calc-kat">' +
        '<input class="kuning" id="calc-kat" type="text" autocomplete="off" placeholder="Cari gamis, sepatu, skincare…">' +
        '<div id="calc-kat-list" class="calc-suggest" hidden></div>' +
      '</div>' +
      '<div class="calc-row2">' +
        '<div><label>Tipe toko</label><select id="calc-toko">' +
          '<option value="marketplace">Marketplace</option><option value="mall">Mall</option></select></div>' +
        '<div class="calc-checks">' +
          '<label class="calc-check"><input type="checkbox" id="calc-gx" checked> Growth Xtra</label>' +
          '<label class="calc-check"><input type="checkbox" id="calc-pkp"> PKP</label>' +
        '</div>' +
      '</div>' +
      '<p class="calc-fee-note" id="calc-fee-note">Memuat tarif kategori…</p>' +
      '<div class="btns">' +
        '<button type="button" class="btn" data-act="calc-contoh">Pakai contoh</button>' +
        '<button type="button" class="btn secondary" data-act="calc-kosong">Kosongkan</button>' +
        '<button type="button" class="btn secondary" data-act="calc-pdf">Unduh PDF</button>' +
      '</div>' +
      '<div class="calc-tabs">' +
        '<button type="button" class="on" data-act="calc-tab" data-pane="set">Set harga</button>' +
        '<button type="button" data-act="calc-tab" data-pane="lr">Simulasi L/R</button>' +
        '<button type="button" data-act="calc-tab" data-pane="st">Strategi</button>' +
      '</div>' +

      '<section id="calc-pane-set">' +
        '<div class="calc-split">' +
          '<div>' +
            '<h2>Harga ideal</h2>' +
            '<p class="muted">Modal, proses, dan ongkir dibagi (1 − margin). Potongan TikTok dinaikkan di atas net itu.</p>' +
            '<div class="calc-row2">' +
              field('s-modal', 'Modal barang (Rp)', 'kamu isi', { placeholder: '82000' }) +
              field('s-margin', 'Margin kotor (%)', 'kamu isi', { step: '0.1', placeholder: '15' }) +
            '</div><div class="calc-row2">' +
              field('s-proc', 'Proses order (Rp)', 'kamu isi') +
              field('s-log', 'Ongkir / logistik (Rp)', 'kamu isi') +
            '</div>' +
            '<div class="calc-hero" id="calc-hero-ideal"></div>' +
            '<details class="calc-fees"><summary>Ubah potongan · <span id="s-fee-sum">—</span></summary>' +
              '<p class="muted">Platform, dinamis, dan Growth Xtra ikut kategori. Ubah yang kuning kalau toko kamu beda.</p>' +
              '<div class="calc-row2">' +
                field('s-aff', 'Komisi iklan toko aff (%)', '', { step: '0.1' }) +
                field('s-ads', 'Biaya ads (%)', '', { step: '0.1' }) +
              '</div><div class="calc-row2">' +
                field('s-pay', 'Paylater (%)', '', { step: '0.01' }) +
                field('s-pre', 'Pre-order (%)', '', { step: '0.1' }) +
              '</div>' +
              '<p class="muted">Paylater peluncuran 1,25%. Pre-order 3%. Kosongkan kalau tidak dipakai.</p>' +
            '</details>' +
            '<div class="calc-out" id="calc-out-ideal"></div>' +
          '</div>' +
          '<div>' +
            '<h2>Harga kamu sekarang</h2>' +
            '<p class="muted">Modal dan potongan % ikut kolom kiri. Ongkir dan ROI boleh beda.</p>' +
            field('n-jual', 'Harga jual (Rp)', 'kamu isi', { placeholder: '156492' }) +
            '<div class="calc-row2">' +
              field('n-roi', 'ROI ads', 'kamu isi', { step: '0.1' }) +
              field('n-log', 'Ongkir sekarang (Rp)', 'kamu isi') +
            '</div>' +
            '<div class="calc-hero" id="calc-hero-now"></div>' +
            '<div class="calc-out" id="calc-out-now"></div>' +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section id="calc-pane-lr" hidden>' +
        '<h2>Simulasi laba rugi bulanan</h2>' +
        '<p class="muted">GMV = qty × harga jual. Diskon komisi kamu isi sendiri — acuan tarif kategori ada di bawah.</p>' +
        '<div class="calc-row2">' +
          field('lr-qty', 'Qty terjual', 'kamu isi') +
          field('lr-avg', 'Rata-rata qty / pesanan', 'kamu isi', { step: '0.1' }) +
        '</div>' +
        field('lr-jual', 'Harga jual (Rp)', 'kamu isi') +
        '<p class="calc-net" id="lr-gmv">Isi qty dan harga jual.</p>' +
        '<div class="calc-row2">' +
          field('lr-prod', 'Modal produksi (Rp)', 'kamu isi') +
          field('lr-pack', 'Packaging (Rp)', 'kamu isi') +
        '</div>' +
        field('lr-hpp-lain', 'Lain-lain / unit (Rp)', 'kamu isi') +
        '<div class="calc-hero" id="calc-hero-lr"></div>' +
        '<details class="calc-fees"><summary>Marketing &amp; diskon</summary>' +
          '<div class="calc-row2">' +
            field('lr-aff', 'Komisi affiliate (%)', '', { step: '0.1' }) +
            field('lr-aff-cover', '% GMV lewat affiliate', '', { step: '0.1' }) +
          '</div><div class="calc-row2">' +
            field('lr-iklan', 'Komisi iklan toko (%)', '', { step: '0.1' }) +
            field('lr-iklan-cover', '% GMV lewat iklan toko', '', { step: '0.1' }) +
          '</div><div class="calc-row2">' +
            field('lr-roi', 'ROI ads', '', { step: '0.1' }) +
            field('lr-pre', 'Pre-order (%)', '', { step: '0.1' }) +
          '</div><div class="calc-row2">' +
            field('lr-disc-gx', 'Diskon ≥3% + Growth Xtra (%)', '', { step: '0.01' }) +
            field('lr-disc-non', 'Diskon ≥3% tanpa Growth Xtra (%)', '', { step: '0.01' }) +
          '</div>' +
          '<p class="muted" id="lr-disc-hint"></p>' +
        '</details>' +
        '<details class="calc-fees"><summary>Biaya tetap &amp; per pesanan</summary>' +
          '<div class="calc-row2">' +
            field('lr-proc', 'Proses / pesanan (Rp)', '') +
            field('lr-log', 'Logistik / pesanan (Rp)', '') +
          '</div><div class="calc-row2">' +
            field('lr-host', 'Host (Rp)', '') +
            field('lr-kreator', 'Kreator (Rp)', '') +
          '</div><div class="calc-row2">' +
            field('lr-admin', 'Packing / admin (Rp)', '') +
            field('lr-gaji', 'Gaji owner (Rp)', '') +
          '</div><div class="calc-row2">' +
            field('lr-lain', 'Lain-lain (Rp)', '') +
            field('lr-gagal', 'Gagal kirim (% GMV)', '', { step: '0.1' }) +
          '</div>' +
        '</details>' +
        '<div class="calc-out" id="calc-out-lr"></div>' +
      '</section>' +

      '<section id="calc-pane-st" hidden>' +
        '<h2>Strategi pricing</h2>' +
        '<p class="muted">Tiga peran produk. HPP traffic mengikuti modal produksi ÷ harga jual, seperti sheet Anton.</p>' +
        '<div class="calc-row2">' +
          field('st-prod', 'Modal produksi (Rp)', 'kamu isi') +
          field('st-pack', 'Packaging (Rp)', 'kamu isi') +
        '</div><div class="calc-row2">' +
          field('st-lain', 'Proses / lain (Rp)', 'kamu isi') +
          field('st-jual', 'Harga jual (Rp)', 'kamu isi') +
        '</div>' +
        '<p class="calc-net" id="st-hpp-note"></p>' +
        '<label class="calc-check"><input type="checkbox" id="st-link" checked> HPP traffic ikut modal produksi ÷ harga jual</label>' +
        '<div class="calc-strat">' + stratCards + '</div>' +
        '<p class="calc-net" id="st-roas"></p>' +
        '<details class="calc-fees"><summary>Potongan yang sama di tiga kolom</summary>' +
          '<div class="calc-row2">' +
            field('st-fee', 'Fee TikTok (%)', '', { step: '0.1' }) +
            field('st-din', 'Komisi dinamis (%)', '', { step: '0.1' }) +
          '</div><div class="calc-row2">' +
            field('st-cash', 'Cashback (%)', '', { step: '0.1' }) +
            field('st-voucher', 'Voucher xtra (%)', '', { step: '0.1' }) +
          '</div><div class="calc-row2">' +
            field('st-ads', 'Biaya ads (%)', '', { step: '0.1' }) +
            field('st-pajak', 'Pajak UMKM (%)', '', { step: '0.1' }) +
          '</div>' +
        '</details>' +
      '</section>' +
    '</div>';
  }

  const CONTOH = {
    kat: 'Busana Muslim Wanita - Gamis',
    toko: 'marketplace',
    'calc-gx': true,
    'calc-pkp': false,
    's-modal': 82000, 's-margin': 15, 's-proc': 1250, 's-log': 950,
    's-aff': 5, 's-ads': 10, 's-pay': 0, 's-pre': 0,
    'n-jual': 156492, 'n-roi': 10, 'n-log': 990,
    'lr-qty': 5000, 'lr-avg': 2, 'lr-jual': 22000,
    'lr-prod': 10000, 'lr-pack': 500, 'lr-hpp-lain': 0,
    'lr-aff': 10, 'lr-aff-cover': 20, 'lr-iklan': 5, 'lr-iklan-cover': 30,
    'lr-roi': 10, 'lr-pre': 0, 'lr-disc-gx': 4, 'lr-disc-non': 0,
    'lr-proc': 1250, 'lr-log': 950,
    'lr-host': 4700000, 'lr-kreator': 4700000, 'lr-admin': 4700000,
    'lr-gaji': 5000000, 'lr-lain': 500000, 'lr-gagal': 1,
    'st-prod': 35000, 'st-pack': 150, 'st-lain': 1250, 'st-jual': 55000,
    'st-link': true,
    'st-fee': 8, 'st-din': 5.5, 'st-cash': 0, 'st-voucher': 4.5, 'st-ads': 10, 'st-pajak': 0.5,
    'st-tr-omset': 100000000, 'st-tr-hpp': 63.6363636364, 'st-tr-host': 3, 'st-tr-pack': 2,
    'st-tr-kreator': 0, 'st-tr-gaji': 0, 'st-tr-lain': 0.5,
    'st-po-omset': 40000000, 'st-po-hpp': 60, 'st-po-host': 0, 'st-po-pack': 0,
    'st-po-kreator': 0, 'st-po-gaji': 0, 'st-po-lain': 0,
    'st-mg-omset': 30000000, 'st-mg-hpp': 50, 'st-mg-host': 0, 'st-mg-pack': 0,
    'st-mg-kreator': 0, 'st-mg-gaji': 0, 'st-mg-lain': 0
  };

  function attach(root, opts) {
    if (!root || root.dataset.calcBound === '1') return;
    root.dataset.calcBound = '1';
    const $ = (id) => root.querySelector('#' + id);
    let fees = null;
    let result = null;

    function num(id) {
      const el = $(id);
      if (!el || el.value === '' || el.value == null) return null;
      const n = +String(el.value).replace(',', '.');
      return isFinite(n) ? n : null;
    }
    function n0(id) { return num(id) || 0; }
    function ratio(id) {
      const n = num(id);
      return n == null ? 0 : n / 100;
    }
    function setVal(id, v) {
      const el = $(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    }

    function selectedRow() {
      return lookupFees(fees, $('calc-kat') && $('calc-kat').value);
    }
    function sharedRates() {
      const row = selectedRow();
      const toko = ($('calc-toko') && $('calc-toko').value) || 'marketplace';
      const growth = !!($('calc-gx') && $('calc-gx').checked);
      const pkp = !!($('calc-pkp') && $('calc-pkp').checked);
      return { row, toko, growth, pkp, rates: ratesFor(fees || {}, row, toko, growth, pkp) };
    }

    function lineHtml(items) {
      return items.map((it) => '<div class="line' + (it.hl ? ' hl' : '') + '"><span>' + esc(it.label) + '</span><strong>' +
        it.value + (it.sub ? ' <span class="muted">' + esc(it.sub) + '</span>' : '') + '</strong></div>').join('');
    }
    function heroHtml(el, tone, kicker, value, badge, note) {
      if (!el) return;
      el.className = 'calc-hero' + (tone ? ' ' + tone : '');
      el.innerHTML = '<div class="k">' + esc(kicker) + '</div><div class="v">' + value + '</div>' +
        (badge ? '<span class="calc-badge">' + esc(badge) + '</span>' : '') +
        (note ? '<p class="calc-hero-note">' + note + '</p>' : '');
    }
    function feeBits(feesObj) {
      return feesObj.lines.filter((l) => l.rp || l.ratio).map((l) => ({
        label: l.label,
        value: fmtRp(l.rp),
        sub: l.capped ? 'maks Rp650rb / item' : fmtPct2(l.ratio)
      }));
    }

    function renderFeeNote() {
      const note = $('calc-fee-note');
      if (!note) return;
      if (!fees) {
        note.textContent = 'Memuat tarif kategori…';
        return;
      }
      const s = sharedRates();
      if (!s.row) {
        note.textContent = 'Pilih kategori. Komisi platform dan dinamis terisi dari tarif Mei 2026.';
        return;
      }
      const toko = s.toko === 'mall' ? 'Mall' : 'Marketplace';
      note.textContent = s.row.label + ' · ' + toko + ' · platform ' + fmtPct2(s.rates.platform) +
        ' · dinamis ' + fmtPct2(s.rates.dinamis) +
        (s.growth ? ' · Growth Xtra ' + fmtPct2(s.rates.xbp) : ' · Growth Xtra mati') +
        ' · pajak ' + fmtPct2(s.rates.pajak) + (s.pkp ? ' (PKP)' : '');
    }

    function renderDiscHint() {
      const el = $('lr-disc-hint');
      if (!el) return;
      const row = selectedRow();
      if (!row || !row.disc) {
        el.textContent = 'Acuan diskon muncul setelah kategori dipilih. Contoh Anton memakai 4%.';
        return;
      }
      el.textContent = 'Acuan tarif kategori ini: ads ≥ 3% + Growth Xtra ' + fmtPct2(row.disc[4] || 0) +
        ', tanpa Growth Xtra ' + fmtPct2(row.disc[3] || 0) + '. Contoh sheet memakai 4% dan 0%.';
    }

    function render() {
      const s = sharedRates();
      renderFeeNote();
      renderDiscHint();
      const link = $('st-link') && $('st-link').checked;
      const helper = hppHelper(n0('st-prod'), n0('st-pack'), n0('st-lain'), num('st-jual'));
      if (link && helper.productionOnly != null) {
        const shown = Math.round(helper.productionOnly * 10000) / 100;
        if (document.activeElement !== $('st-tr-hpp')) setVal('st-tr-hpp', shown);
      }
      const hppNote = $('st-hpp-note');
      if (hppNote) {
        hppNote.innerHTML = helper.productionOnly == null
          ? 'Isi modal produksi dan harga jual untuk HPP traffic.'
          : 'Total modal barang <strong>' + fmtRp(helper.total) + '</strong> · HPP traffic <strong>' +
            fmtPct(helper.productionOnly) + '</strong> · HPP semua biaya <strong>' + fmtPct(helper.ofPrice) + '</strong>';
      }

      const missingKat = !!(fees && !s.row);
      const priced = setPricing({
        modal: num('s-modal'),
        margin: num('s-margin') == null ? null : num('s-margin') / 100,
        proc: n0('s-proc'),
        log: n0('s-log'),
        paylater: ratio('s-pay'),
        preorder: ratio('s-pre'),
        aff: ratio('s-aff'),
        ads: ratio('s-ads'),
        jualNow: num('n-jual'),
        roiNow: num('n-roi'),
        logNow: n0('n-log'),
        platform: s.rates.platform,
        dinamis: s.rates.dinamis,
        xbp: s.rates.xbp,
        pajak: s.rates.pajak
      });

      const idealEl = $('calc-hero-ideal');
      const idealOut = $('calc-out-ideal');
      const feeSum = $('s-fee-sum');
      if (missingKat) {
        heroHtml(idealEl, '', 'Harga jual', '—', '', 'Pilih kategori dulu. Komisi platform belum ikut.');
        if (idealOut) idealOut.innerHTML = '<div class="calc-empty">Cari kategori di atas. Tanpa itu angkanya belum jujur.</div>';
        if (feeSum) feeSum.textContent = '—';
      } else if (!priced.ideal.ok) {
        heroHtml(idealEl, '', 'Harga jual', '—', '', 'Isi modal dan margin.');
        if (idealOut) idealOut.innerHTML = '<div class="calc-empty">Dua kotak kuning dulu. Potongan bisa diubah di bawah.</div>';
        if (feeSum) feeSum.textContent = '—';
      } else {
        const d = priced.ideal;
        heroHtml(idealEl, '', 'Harga jual', fmtRp(d.harga), 'ROI ' + fmtNum(d.roi, 1),
          'Net ke kas ' + fmtRp(d.net) + ' · potongan ' + fmtPct2(d.fees.totalPct));
        if (feeSum) feeSum.textContent = fmtPct2(d.fees.totalPct);
        if (idealOut) {
          idealOut.innerHTML = lineHtml([
            { label: 'Modal + proses + ongkir', value: fmtRp(d.base) },
            { label: 'Margin kotor', value: fmtRp(d.marginRp), sub: fmtPct(d.margin) },
            { label: 'Net ke kas', value: fmtRp(d.net), hl: true }
          ].concat(feeBits(d.fees)).concat([
            { label: 'Total potongan TikTok', value: fmtPct(d.fees.tiktokPct), sub: fmtRp(d.fees.tiktokRp) },
            { label: 'Total biaya marketing', value: fmtPct(d.fees.marketingPct), sub: fmtRp(d.fees.marketingRp) },
            { label: 'Total biaya TikTok', value: fmtPct2(d.fees.totalPct), hl: true },
            { label: 'Harga coret', value: fmtRp(d.coret), sub: 'jual / 0,9' },
            { label: 'Harga awal', value: fmtRp(d.awal), sub: 'jual / 0,5' }
          ]));
        }
      }

      const nowEl = $('calc-hero-now');
      const nowOut = $('calc-out-now');
      if (missingKat) {
        heroHtml(nowEl, '', 'Margin', '—', '', 'Pilih kategori dulu.');
        if (nowOut) nowOut.innerHTML = '<div class="calc-empty">Margin ini butuh komisi kategori.</div>';
      } else if (!priced.now.ok) {
        heroHtml(nowEl, '', 'Margin', '—', '', 'Isi harga jual sekarang.');
        if (nowOut) nowOut.innerHTML = '<div class="calc-empty">Harga jual dulu. ROI 10 berarti ads 10%.</div>';
      } else {
        const d = priced.now;
        const tone = d.marginRp < 0 ? 'bad' : 'good';
        heroHtml(nowEl, tone, 'Uang yang kamu dapat', fmtRp(d.marginRp), fmtPct(d.margin) + ' margin',
          'Dari harga ' + fmtRp(d.jual) + ', net ke kas ' + fmtRp(d.net) + '.');
        if (nowOut) {
          nowOut.innerHTML = lineHtml([
            { label: 'Harga jual', value: fmtRp(d.jual) },
            { label: 'Net ke kas', value: fmtRp(d.net) },
            { label: 'Modal + proses + ongkir', value: fmtRp((d.modal || 0) + (d.proc || 0) + (d.log || 0)) }
          ].concat(feeBits(d.fees)).concat([
            { label: 'Ads dari ROI', value: fmtPct2(d.ads) },
            { label: 'Margin', value: fmtRp(d.marginRp), sub: fmtPct(d.margin), hl: true }
          ]));
        }
      }

      const sim = simulasiLR({
        qty: num('lr-qty'),
        avg: num('lr-avg'),
        jual: num('lr-jual'),
        prod: n0('lr-prod'),
        pack: n0('lr-pack'),
        hppLain: n0('lr-hpp-lain'),
        platform: s.rates.platform,
        dinamis: s.rates.dinamis,
        xbp: s.rates.xbp,
        pajak: s.rates.pajak,
        preorder: ratio('lr-pre'),
        aff: ratio('lr-aff'),
        affCover: ratio('lr-aff-cover'),
        iklan: ratio('lr-iklan'),
        iklanCover: ratio('lr-iklan-cover'),
        roi: num('lr-roi'),
        procFee: n0('lr-proc'),
        logFee: n0('lr-log'),
        host: n0('lr-host'),
        kreator: n0('lr-kreator'),
        admin: n0('lr-admin'),
        gaji: n0('lr-gaji'),
        lain: n0('lr-lain'),
        gagal: ratio('lr-gagal'),
        discGx: ratio('lr-disc-gx'),
        discNon: ratio('lr-disc-non')
      });
      const gmvEl = $('lr-gmv');
      const lrHero = $('calc-hero-lr');
      const lrOut = $('calc-out-lr');
      if (missingKat) {
        if (gmvEl) gmvEl.textContent = 'Pilih kategori dulu.';
        heroHtml(lrHero, '', 'Margin bulan ini', '—', '', 'Komisi platform belum ikut.');
        if (lrOut) lrOut.innerHTML = '<div class="calc-empty">Cari kategori di atas.</div>';
      } else if (!sim.ok) {
        if (gmvEl) gmvEl.textContent = 'Isi qty, rata-rata per pesanan, dan harga jual.';
        heroHtml(lrHero, '', 'Margin bulan ini', '—', '', 'Perkiraan. Bukan laporan pajak.');
        if (lrOut) lrOut.innerHTML = '<div class="calc-empty">Qty dan harga jual dulu.</div>';
      } else {
        if (gmvEl) gmvEl.innerHTML = 'GMV <strong>' + fmtRp(sim.gmv) + '</strong> · ' +
          fmtNum(sim.orders, 1) + ' pesanan · HPP ' + fmtPct(sim.hpp);
        const tone = sim.marginRp < 0 ? 'bad' : 'good';
        heroHtml(lrHero, tone, 'Margin bulan ini', fmtRp(sim.marginRp), fmtPct(sim.margin),
          sim.marginRp < 0 ? 'Total biaya di atas GMV, setelah diskon komisi.' : 'Sisa setelah semua biaya dan diskon komisi.');
        if (lrOut) {
          lrOut.innerHTML = lineHtml(sim.lines.filter((l) => Math.round(l.rp) !== 0).map((l) => ({
            label: l.label,
            value: fmtRp(l.rp),
            sub: l.capped ? 'maks Rp650rb / item' : fmtPct(l.ratio)
          })).concat([
            { label: 'Tot cost', value: fmtRp(sim.tot), sub: fmtPct(sim.tot / sim.gmv), hl: true },
            { label: 'Diskon komisi', value: fmtRp(sim.disc) },
            { label: 'Margin', value: fmtRp(sim.marginRp), sub: fmtPct(sim.margin), hl: true }
          ]));
        }
      }

      const strat = strategi({
        shared: {
          fee: ratio('st-fee'), dinamis: ratio('st-din'), cashback: ratio('st-cash'),
          voucher: ratio('st-voucher'), ads: ratio('st-ads'), pajak: ratio('st-pajak')
        },
        columns: [
          ['tr', 'Traffic puller'],
          ['po', 'Produk populer'],
          ['mg', 'Produk menguntungkan']
        ].map((c) => ({
          name: c[1],
          omset: n0('st-' + c[0] + '-omset'),
          hpp: (c[0] === 'tr' && link && helper.productionOnly != null) ? helper.productionOnly : ratio('st-' + c[0] + '-hpp'),
          host: ratio('st-' + c[0] + '-host'),
          pack: ratio('st-' + c[0] + '-pack'),
          kreator: ratio('st-' + c[0] + '-kreator'),
          gaji: ratio('st-' + c[0] + '-gaji'),
          lain: ratio('st-' + c[0] + '-lain')
        }))
      });
      strat.cols.forEach((col, i) => {
        const id = ['tr', 'po', 'mg'][i];
        const el = $('st-hero-' + id);
        if (!col.omset) {
          heroHtml(el, '', 'Margin', '—', '', 'Isi omset.');
          return;
        }
        heroHtml(el, col.margin < 0 ? 'bad' : 'good', 'Margin', fmtRp(col.margin), fmtPct(col.marginPct),
          'Tot cost ' + fmtRp(col.tot));
      });
      const roas = $('st-roas');
      if (roas) {
        roas.textContent = strat.roas == null
          ? 'ROAS muncul kalau biaya ads diisi.'
          : 'ROAS simulasi ' + fmtNum(strat.roas, 1) + ' · omset ' + fmtRp(strat.omset) + ' / ads ' + fmtRp(strat.adsRp);
      }

      result = { kat: ($('calc-kat') && $('calc-kat').value) || '', priced, sim, strat, rates: s.rates };
      root.__result = result;
    }

    function fillContoh() {
      Object.keys(CONTOH).forEach((k) => {
        if (k === 'kat') {
          if ($('calc-kat')) $('calc-kat').value = CONTOH.kat;
        } else if (k === 'toko') {
          if ($('calc-toko')) $('calc-toko').value = CONTOH.toko;
        } else setVal(k, CONTOH[k]);
      });
      hideSuggest();
      render();
    }
    function clearAll() {
      root.querySelectorAll('input').forEach((el) => {
        if (el.type === 'checkbox') return;
        el.value = '';
      });
      if ($('calc-gx')) $('calc-gx').checked = false;
      if ($('calc-pkp')) $('calc-pkp').checked = false;
      if ($('st-link')) $('st-link').checked = true;
      hideSuggest();
      render();
    }
    function hideSuggest() {
      const list = $('calc-kat-list');
      if (list) list.hidden = true;
    }
    function showSuggest() {
      const list = $('calc-kat-list');
      const input = $('calc-kat');
      if (!list || !input || !fees) return;
      const hits = searchFees(fees, input.value, 8);
      if (!hits.length) { list.hidden = true; return; }
      list.innerHTML = hits.map((r) => '<button type="button" data-kat="' + esc(r.label) + '">' + esc(r.label) + '</button>').join('');
      list.hidden = false;
    }

    function tab(pane) {
      ['set', 'lr', 'st'].forEach((id) => {
        const sec = $('calc-pane-' + id);
        if (sec) sec.hidden = id !== pane;
      });
      root.querySelectorAll('.calc-tabs button').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-pane') === pane);
      });
    }

    function printHtml() {
      const r = result;
      const when = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
      let body = '<h1>Kalkulator harga TikTok Shop</h1><p>' + esc(r && r.kat) + ' · ' + esc(when) + '</p>';
      if (r && r.priced && r.priced.ideal.ok) {
        const d = r.priced.ideal;
        body += '<h2>Harga ideal</h2><p>Harga jual <strong>' + fmtRp(d.harga) + '</strong> · net ' + fmtRp(d.net) +
          ' · coret ' + fmtRp(d.coret) + ' · awal ' + fmtRp(d.awal) + '</p>';
      }
      if (r && r.priced && r.priced.now.ok) {
        const d = r.priced.now;
        body += '<h2>Harga sekarang</h2><p>Margin <strong>' + fmtRp(d.marginRp) + '</strong> (' + fmtPct(d.margin) + ')</p>';
      }
      if (r && r.sim && r.sim.ok) {
        body += '<h2>Simulasi L/R</h2><p>GMV ' + fmtRp(r.sim.gmv) + ' · margin <strong>' + fmtRp(r.sim.marginRp) +
          '</strong> (' + fmtPct(r.sim.margin) + ')</p>';
      }
      if (r && r.strat) {
        body += '<h2>Strategi</h2>' + r.strat.cols.map((c) =>
          '<p>' + esc(c.name) + ': margin <strong>' + fmtRp(c.margin) + '</strong> (' + fmtPct(c.marginPct) + ')</p>'
        ).join('');
      }
      body += '<p>Perkiraan tarif Mei 2026. Bukan laporan pajak.</p>';
      return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kalkulator harga</title>' +
        '<style>body{font-family:system-ui,sans-serif;color:#111;padding:18px;max-width:640px}h1{font-size:18px}h2{font-size:14px;margin:16px 0 4px}</style></head><body>' +
        body + '</body></html>';
    }

    root.__calc = {
      contoh: fillContoh,
      kosong: clearAll,
      pdf() {
        try {
          const w = window.open('', 'harga-pdf');
          if (w) {
            w.document.open();
            w.document.write(printHtml());
            w.document.close();
            w.focus();
            setTimeout(() => { w.print(); }, 250);
            return;
          }
        } catch (err) { /* popup blocked */ }
        window.print();
      },
      tab
    };

    root.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'calc-kat') showSuggest();
      render();
    });
    root.addEventListener('change', render);
    root.addEventListener('mousedown', (e) => {
      const btn = e.target.closest('#calc-kat-list button');
      if (!btn) return;
      e.preventDefault();
      if ($('calc-kat')) $('calc-kat').value = btn.getAttribute('data-kat') || '';
      hideSuggest();
      render();
    });
    if ($('calc-kat')) {
      $('calc-kat').addEventListener('blur', () => setTimeout(hideSuggest, 160));
    }

    const url = (opts && opts.dataUrl) || './data/tiktok-kategori-fees.json';
    const loader = (AntonCalc._feeLoads = AntonCalc._feeLoads || {});
    const pending = loader[url] || (loader[url] = fetch(url).then((res) => {
      if (!res.ok) throw new Error('fees');
      return res.json();
    }));
    pending.then((data) => {
      if (data && data.rows && !data._labelsClean) {
        data.rows.forEach((r) => { r.label = tidyLabel(r.label); });
        data._labelsClean = true;
      }
      fees = data;
      fillContoh();
    }).catch(() => {
      const note = $('calc-fee-note');
      if (note) note.textContent = 'Tarif kategori gagal dimuat. Coba muat ulang.';
      fillContoh();
    });
  }

  return {
    ratesFor, lookupFees, searchFees, setPricing, simulasiLR, strategi, hppHelper,
    shellHtml, attach, CAP
  };
});
