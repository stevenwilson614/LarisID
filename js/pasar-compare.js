/* LarisID — Bandingkan Pasar (ranked board).
 *
 * One row per pasar (a product_types_v keyword, ~120 listings). Rows are
 * ordered by Skor Mudah Masuk so a new seller can see in a couple of seconds
 * which pasar is the easiest to start in, then read the four signal cells to
 * understand why. Hosts: Cari Produk home (under Trending Sekarang), a
 * category page and a search result (top 20). Spec: docs/pasar-compare.md.
 *
 * Inputs are the product_types_v rows the directory already fetched plus one
 * read of mv_new_seller_market (toko baru vs toko lama hit rates). No score is
 * terukur — every number here is a perkiraan and the footer says so.
 *
 * Skor Mudah Masuk (0-100, absolute so numbers compare across pages):
 *   tembok ulasan      30  median reviews of winners (sold >= 100), log 50..5000
 *   toko baru yang laku 30  % of new-shop listings that reached 10 units, 0..50%
 *   konsentrasi        15  top-3 shop share of units, 0..80%
 *   permintaan         15  weekly units, log 25..2000 (fallback omset_top15)
 *   tumbuh mingguan    +10 weekly units vs lifetime base, 0..10%
 */
(function (global) {
  'use strict';

  var MAX_ROWS = 20;
  var VISIBLE_ROWS = 10; // rows past this sit behind "Tampilkan semua"
  var petaClipUid = 0;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // 0 at lo, 1 at hi on a log scale.
  function logNorm(v, lo, hi) {
    if (v == null || v <= 0) return 0;
    var t = (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
    return clamp(t, 0, 1);
  }
  function fmtInt(n) {
    if (n == null) return '—';
    return Math.round(n).toLocaleString('id-ID');
  }
  function fmtCompact(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' jt';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' rb';
    return String(Math.round(n));
  }
  function fmtRp(n) {
    if (n == null) return '—';
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' jt';
    if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3) + ' rb';
    return 'Rp ' + Math.round(n);
  }
  function fmtPct(n, signed) {
    if (n == null) return '—';
    var r = Math.round(n);
    return (signed && r > 0 ? '+' : '') + r + '%';
  }
  // Same Shopee thumb suffix as gpt-app imgThumb — 40px rows and ~24px bubbles
  // do not need the 1024px original.
  function imgThumb(url) {
    var u = String(url || '');
    return /^https:\/\/cf\.shopee\.co\.id\/file\/[\w-]+$/.test(u) ? u + '_tn.webp' : u;
  }
  // First photo of the pasar: images[0] (highest-sold listing that survived
  // AI-reject / relevance filters), then the representative listing.
  function pasarImage(t) {
    if (!t) return '';
    var imgs = t.images;
    if (typeof imgs === 'string') {
      try { imgs = JSON.parse(imgs); } catch (_) { imgs = null; }
    }
    if (Array.isArray(imgs) && imgs[0]) return imgs[0];
    return t.rep_image_url || '';
  }
  function petaRadius(s) {
    // Floor high enough that a product photo is still readable as a bubble.
    return s.baruThin ? 11 : 10 + 12 * clamp((s.nbPct || 0) / 50, 0, 1);
  }

  /* ---------------------------------------------------------------- score */

  function weeklyPct(t) {
    var units = num(t.wk_units), base = num(t.wk_base);
    if (units == null) return null;
    if (base != null && base >= 50) return units / base * 100;
    return units > 0 ? null : 0;
  }

  function newShopOf(ns, kw) {
    var seg = ns && ns[kw];
    return seg && seg.toko_baru ? seg.toko_baru : null;
  }

  function scorePasar(t, ns) {
    var reviews = num(t.median_winner_reviews);
    var moat = reviews == null ? 15 : 30 * (1 - logNorm(reviews, 50, 5000));

    var nb = newShopOf(ns, t.keyword);
    var nbN = nb ? (num(nb.n_listings) || 0) : 0;
    var nbPct = nb ? num(nb.pct_reached_10) : null;
    var baruThin = !(nbN >= 5 && nbPct != null);
    var baru = baruThin ? 12 : 30 * clamp(nbPct / 50, 0, 1);

    var share = num(t.sold_top3_share);
    if (share != null && share > 1) share = share / 100; // defensive: fraction expected
    var kons = share == null ? 8 : 15 * (1 - clamp(share / 0.8, 0, 1));

    var units = num(t.wk_units);
    var omset = num(t.omset_top15);
    var demandEst = units == null;
    var demand = !demandEst
      ? 15 * logNorm(units, 25, 2000)
      : (omset != null ? 15 * logNorm(omset, 5e6, 5e8) : 5);

    var pct = weeklyPct(t);
    var tren = pct == null ? 0 : 10 * clamp(pct / 10, 0, 1);

    var total = Math.round(clamp(moat + baru + kons + demand + tren, 0, 100));
    return {
      total: total,
      parts: { moat: moat, baru: baru, kons: kons, demand: demand, tren: tren },
      reviews: reviews,
      units: units,
      omset: omset,
      demandEst: demandEst,
      share: share,
      pct: pct,
      nb: nb,
      nbN: nbN,
      nbPct: nbPct,
      baruThin: baruThin
    };
  }

  function verdictOf(total) {
    if (total >= 70) return { key: 'mudah', label: 'Mudah masuk' };
    if (total >= 45) return { key: 'sedang', label: 'Bisa, perlu strategi' };
    return { key: 'berat', label: 'Berat untuk pemula' };
  }

  // Tercile marker per metric: good / weak / neutral. `higherBetter` flips.
  function tercileMarks(rows, getter, higherBetter) {
    var vals = rows.map(function (r, i) { return { i: i, v: getter(r) }; })
      .filter(function (x) { return x.v != null; });
    var marks = rows.map(function () { return ''; });
    if (vals.length < 3) return marks;
    vals.sort(function (a, b) { return higherBetter ? b.v - a.v : a.v - b.v; });
    var k = Math.max(1, Math.floor(vals.length / 3));
    vals.slice(0, k).forEach(function (x) { marks[x.i] = 'is-good'; });
    vals.slice(vals.length - k).forEach(function (x) { if (!marks[x.i]) marks[x.i] = 'is-weak'; });
    return marks;
  }

  /* --------------------------------------------------------------- render */

  function cellHtml(label, value, sub, mark, title) {
    return '<span class="pc-cell ' + (mark || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      '<span class="pc-cell-l">' + esc(label) + '</span>' +
      '<span class="pc-cell-v">' + value + '</span>' +
      (sub ? '<span class="pc-cell-s">' + sub + '</span>' : '') +
    '</span>';
  }

  function rowHtml(r, idx, marks) {
    var s = r.score, t = r.type, v = verdictOf(s.total);
    var lakuVal = s.units != null ? '~' + fmtCompact(s.units) : (s.omset != null ? fmtRp(s.omset) : '—');
    var lakuSub = s.units != null ? 'per minggu' : (s.omset != null ? 'omset/bln top-15' : 'belum ada data');
    var reviewsVal = s.reviews != null ? fmtCompact(s.reviews) : '—';
    var reviewsSub = s.reviews != null ? 'ulasan pemenang' : 'belum ada pemenang';
    var baruVal = s.baruThin ? (s.nbN ? fmtPct(s.nbPct) : '—') : fmtPct(s.nbPct);
    var baruSub = s.nbN ? 'dari ' + fmtInt(s.nbN) + ' listing toko baru' + (s.baruThin ? ' · tipis' : '') : 'data tipis';
    var pm = num(t.price_median), p25 = num(t.price_p25), p75 = num(t.price_p75);
    var hargaVal = fmtRp(pm);
    var hargaSub = (p25 != null && p75 != null) ? fmtCompact(p25) + '–' + fmtCompact(p75) : 'median';
    var up = s.pct != null && Math.round(s.pct) > 0;
    var trenTxt = s.pct == null ? '' :
      '<span class="pc-tren ' + (up ? 'is-up' : 'is-flat') + '" title="Unit minggu ini dibanding total terjual sebelumnya (perkiraan)">' +
        (up ? '↗ ' : '→ ') + fmtPct(s.pct, true) + '</span>';
    var cat = t.category_canonical || t.category || '';
    var img = pasarImage(t);
    var thumb = img
      ? '<img class="pc-thumb" src="' + esc(imgThumb(img)) + '" alt="" loading="lazy" decoding="async" width="40" height="40">'
      : '<span class="pc-thumb pc-thumb--ph" aria-hidden="true"></span>';

    return '<li class="pc-row' + (idx === 0 ? ' is-lead' : '') + (idx >= VISIBLE_ROWS ? ' pc-row--more' : '') + '" data-pc-kw="' + esc(t.keyword) + '">' +
      '<button type="button" class="pc-row-btn" aria-label="Buka pasar ' + esc(t.keyword) + '">' +
        '<span class="pc-rank">' + (idx + 1) + '</span>' +
        '<span class="pc-name">' + thumb +
          '<span class="pc-name-text"><span class="pc-kw">' + esc(t.keyword) + '</span>' +
          (cat ? '<span class="pc-cat">' + esc(cat) + '</span>' : '') + '</span></span>' +
        '<span class="pc-score">' +
          '<span class="pc-score-n">' + s.total + '</span>' +
          '<span class="pc-bar" aria-hidden="true"><i style="width:' + s.total + '%"></i></span>' +
          '<span class="pc-verdict pc-verdict--' + v.key + '">' + v.label + '</span>' +
        '</span>' +
        '<span class="pc-cells">' +
          cellHtml('Laku', lakuVal + trenTxt, lakuSub, marks.laku[idx], 'Unit terjual per minggu, disetarakan ke 7 hari. Perkiraan.') +
          cellHtml('Tembok ulasan', reviewsVal, reviewsSub, marks.moat[idx], 'Median ulasan listing yang sudah terjual 100+. Makin rendah makin mudah bersaing.') +
          cellHtml('Toko baru laku', baruVal, baruSub, marks.baru[idx], 'Persen listing dari toko baru (≤180 hari) yang tembus 10 unit. Umur toko = batas bawah.') +
          cellHtml('Harga', hargaVal, hargaSub, '', 'Harga median; rentang P25–P75.') +
        '</span>' +
      '</button>' +
    '</li>';
  }

  function petaSvg(rows) {
    var pts = rows.filter(function (r) { return r.score.reviews != null && r.score.units != null && r.score.units > 0; });
    if (pts.length < 3) return '';
    var W = 640, H = 380, L = 54, R = 16, T = 22, B = 44;
    var xs = pts.map(function (r) { return r.score.reviews; });
    var ys = pts.map(function (r) { return r.score.units; });
    var xmin = Math.max(1, Math.min.apply(null, xs) / 1.6), xmax = Math.max.apply(null, xs) * 1.6;
    var ymin = Math.max(1, Math.min.apply(null, ys) / 1.6), ymax = Math.max.apply(null, ys) * 1.6;
    if (xmax / xmin < 4) { xmin = xmin / 2; xmax = xmax * 2; }
    if (ymax / ymin < 4) { ymin = ymin / 2; ymax = ymax * 2; }
    var X = function (v) { return L + (Math.log(v) - Math.log(xmin)) / (Math.log(xmax) - Math.log(xmin)) * (W - L - R); };
    var Y = function (v) { return H - B - (Math.log(v) - Math.log(ymin)) / (Math.log(ymax) - Math.log(ymin)) * (H - T - B); };
    var xmid = X(Math.sqrt(xmin * xmax)), ymid = Y(Math.sqrt(ymin * ymax));

    // 1-2-5 ticks on a log axis, thinned so labels never crowd.
    function ticks(lo, hi) {
      var out = [], p = Math.pow(10, Math.floor(Math.log10(lo)));
      var steps = [1, 2, 5];
      while (p <= hi) {
        for (var i = 0; i < steps.length; i++) {
          var v = p * steps[i];
          if (v >= lo && v <= hi) out.push(v);
        }
        p *= 10;
      }
      var decades = Math.log10(hi) - Math.log10(lo);
      if (decades > 2.2) out = out.filter(function (v) { return Math.abs(Math.log10(v) % 1) < 1e-9; });
      else if (decades > 1.2) out = out.filter(function (v) { var m = v / Math.pow(10, Math.floor(Math.log10(v))); return m === 1 || m === 5; });
      return out;
    }
    var html = '<svg class="pc-peta-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Peta pasar: laku per minggu terhadap tembok ulasan">';
    html += '<rect x="' + L + '" y="' + T + '" width="' + (xmid - L) + '" height="' + (ymid - T) + '" class="pc-peta-sweet"/>';
    html += '<line x1="' + xmid + '" x2="' + xmid + '" y1="' + T + '" y2="' + (H - B) + '" class="pc-peta-mid"/>';
    html += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + ymid + '" y2="' + ymid + '" class="pc-peta-mid"/>';
    html += '<text x="' + (L + 8) + '" y="' + (T + 14) + '" class="pc-peta-zone">Ramai, tembok rendah — cocok pemula</text>';
    html += '<text x="' + (W - R - 8) + '" y="' + (T + 14) + '" text-anchor="end" class="pc-peta-zone pc-peta-zone--dim">Ramai, tembok tinggi</text>';
    ticks(xmin, xmax).forEach(function (v) {
      html += '<text x="' + X(v) + '" y="' + (H - B + 16) + '" text-anchor="middle" class="pc-peta-tick">' + fmtCompact(v) + '</text>';
    });
    ticks(ymin, ymax).forEach(function (v) {
      html += '<text x="' + (L - 6) + '" y="' + (Y(v) + 3) + '" text-anchor="end" class="pc-peta-tick">' + fmtCompact(v) + '</text>';
    });
    html += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" class="pc-peta-axis"/>';
    html += '<line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (H - B) + '" class="pc-peta-axis"/>';
    html += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 8) + '" text-anchor="middle" class="pc-peta-label">Tembok ulasan (median ulasan pemenang) →</text>';
    html += '<text transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle" class="pc-peta-label">Laku / minggu →</text>';
    // Labels: always for the top 8 by score, on hover/focus for the rest so
    // clusters stay readable.
    var labelled = {};
    rows.slice(0, 8).forEach(function (r) { labelled[r.type.keyword] = 1; });
    // Greedy label placement: right, left, above, below — first slot that does
    // not overlap an already placed label wins. Approximate glyph width 5.6px.
    var placed = [];
    function overlaps(b) {
      return placed.some(function (p) { return b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y; });
    }
    function labelPos(cx, cy, rad, text) {
      var w = text.length * 5.6, h = 12;
      var cands = [
        { x: cx + rad + 4, y: cy + 4, anchor: 'start', box: { x: cx + rad + 4, y: cy - 6, w: w, h: h } },
        { x: cx - rad - 4, y: cy + 4, anchor: 'end', box: { x: cx - rad - 4 - w, y: cy - 6, w: w, h: h } },
        { x: cx, y: cy - rad - 5, anchor: 'middle', box: { x: cx - w / 2, y: cy - rad - 15, w: w, h: h } },
        { x: cx, y: cy + rad + 12, anchor: 'middle', box: { x: cx - w / 2, y: cy + rad + 2, w: w, h: h } }
      ];
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i];
        if (c.box.x < L || c.box.x + c.box.w > W - R) continue;
        if (!overlaps(c.box)) { placed.push(c.box); return c; }
      }
      placed.push(cands[0].box);
      return cands[0];
    }
    // Draw quiet dots first so labelled ones sit on top.
    var ordered = pts.slice().sort(function (a, b) { return (labelled[a.type.keyword] ? 1 : 0) - (labelled[b.type.keyword] ? 1 : 0); });
    var clipPrefix = 'pcclip' + (++petaClipUid);
    html += '<defs>';
    ordered.forEach(function (r, i) {
      var s = r.score;
      var rad = petaRadius(s);
      var cx = X(s.reviews), cy = Y(s.units);
      html += '<clipPath id="' + clipPrefix + '-' + i + '"><circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad.toFixed(1) + '"/></clipPath>';
    });
    html += '</defs>';
    ordered.forEach(function (r, i) {
      var s = r.score;
      var rad = petaRadius(s);
      var cx = X(s.reviews), cy = Y(s.units);
      var v = verdictOf(s.total).key;
      var isLabelled = !!labelled[r.type.keyword];
      var lp = isLabelled ? labelPos(cx, cy, rad, r.type.keyword) : { x: cx + rad + 4, y: cy + 4, anchor: 'start' };
      var img = pasarImage(r.type);
      html += '<g class="pc-peta-dot pc-peta-dot--' + v + (s.baruThin ? ' is-thin' : '') + (isLabelled ? '' : ' is-quiet') + (img ? ' has-img' : '') + '" data-pc-kw="' + esc(r.type.keyword) + '"' +
        (img ? ' data-pc-img="' + esc(imgThumb(img)) + '" data-pc-clip="' + clipPrefix + '-' + i + '"' : '') +
        ' tabindex="0" role="button">' +
        '<title>' + esc(r.type.keyword) + ' · skor ' + s.total + ' · toko baru laku ' + (s.baruThin ? 'data tipis' : fmtPct(s.nbPct)) + '</title>' +
        '<circle class="pc-peta-fill" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad.toFixed(1) + '"/>' +
        '<circle class="pc-peta-ring" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + rad.toFixed(1) + '"/>' +
        '<text x="' + lp.x.toFixed(1) + '" y="' + lp.y.toFixed(1) + '" text-anchor="' + lp.anchor + '">' + esc(r.type.keyword) + '</text>' +
      '</g>';
    });
    html += '</svg>';
    html += '<p class="pc-peta-legend">Foto = listing terlaris di pasar itu. Ukuran bulatan = persen toko baru yang laku. Bulatan bergaris = data toko baru tipis. Skala log.</p>';
    return html;
  }

  // HTML's innerHTML parser turns SVG <image> into HTML <img>, which does not
  // paint inside <svg>. Attach real SVG images after the markup is in the DOM.
  function hydratePetaImages(host) {
    var svg = host && host.querySelector('.pc-peta-svg');
    if (!svg) return;
    svg.querySelectorAll('.pc-peta-dot[data-pc-img]').forEach(function (g) {
      var url = g.getAttribute('data-pc-img');
      var fill = g.querySelector('.pc-peta-fill');
      if (!url || !fill) return;
      var cx = Number(fill.getAttribute('cx'));
      var cy = Number(fill.getAttribute('cy'));
      var rad = Number(fill.getAttribute('r'));
      if (!isFinite(cx) || !isFinite(cy) || !isFinite(rad)) return;
      var img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', url);
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      img.setAttribute('x', (cx - rad).toFixed(1));
      img.setAttribute('y', (cy - rad).toFixed(1));
      img.setAttribute('width', (rad * 2).toFixed(1));
      img.setAttribute('height', (rad * 2).toFixed(1));
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      var clip = g.getAttribute('data-pc-clip');
      if (clip) img.setAttribute('clip-path', 'url(#' + clip + ')');
      fill.after(img);
    });
  }

  function shellHtml(opts, bodyHtml, petaHtml, n) {
    var title = opts.title || 'Mana yang paling mudah dimulai?';
    var sub = opts.subtitle || ('Skor Mudah Masuk membandingkan ' + n + ' pasar: tembok ulasan, toko baru yang laku, konsentrasi, permintaan, dan pertumbuhan.');
    return '<div class="pc-head">' +
      '<div class="pc-titles"><h3 class="pc-title">' + esc(title) + '</h3><p class="pc-sub">' + esc(sub) + '</p></div>' +
      (petaHtml ? '<div class="pc-actions" role="tablist">' +
        '<button type="button" class="pc-tab is-on" data-pc-view="board" role="tab" aria-selected="true">Daftar</button>' +
        '<button type="button" class="pc-tab" data-pc-view="peta" role="tab" aria-selected="false">Peta</button>' +
      '</div>' : '') +
    '</div>' +
    '<div class="pc-colhead" aria-hidden="true">' +
      '<span></span><span>Pasar</span><span>Skor Mudah Masuk</span>' +
      '<span class="pc-colhead-cells"><span>Laku/mgg</span><span>Tembok ulasan</span><span>Toko baru laku</span><span>Harga</span></span>' +
    '</div>' +
    '<ol class="pc-rows" data-pc-board>' + bodyHtml + '</ol>' +
    (n > VISIBLE_ROWS ?
      '<button type="button" class="pc-more" data-pc-more>Tampilkan semua ' + n + ' pasar</button>' : '') +
    (petaHtml ? '<div class="pc-peta" data-pc-peta hidden>' + petaHtml + '</div>' : '') +
    '<p class="pc-foot">Semua angka <strong>perkiraan</strong>. Skor Mudah Masuk = tembok ulasan (30) + toko baru yang laku (30) + konsentrasi top-3 (15) + permintaan (15) + pertumbuhan mingguan (10). ' +
      'Umur toko dihitung dari listing tertua yang kami lihat, jadi batas bawah. Skor rendah berarti pasarnya butuh strategi, bukan berarti produknya jelek.</p>';
  }

  function skeletonHtml(title) {
    var rows = '';
    for (var i = 0; i < 5; i++) rows += '<li class="pc-row pc-row--sk"><span class="pc-sk pc-sk--rank"></span><span class="pc-sk-name"><span class="pc-sk pc-sk--thumb"></span><span class="pc-sk pc-sk--name"></span></span><span class="pc-sk pc-sk--bar"></span><span class="pc-sk pc-sk--cells"></span></li>';
    return '<div class="pc-head"><div class="pc-titles"><h3 class="pc-title">' + esc(title || 'Mana yang paling mudah dimulai?') + '</h3><p class="pc-sub">Menghitung skor tiap pasar…</p></div></div>' +
      '<ol class="pc-rows">' + rows + '</ol>';
  }

  /* ----------------------------------------------------------------- data */

  async function fetchNewShop(supabase, keywords) {
    if (!supabase || !keywords.length) return {};
    try {
      var res = await supabase.from('mv_new_seller_market')
        .select('keyword,segment,n_listings,n_shops,pct_reached_10,pct_reached_100,price_median')
        .in('keyword', keywords);
      if (res.error || !Array.isArray(res.data)) return {};
      var out = {};
      res.data.forEach(function (r) {
        if (!out[r.keyword]) out[r.keyword] = {};
        out[r.keyword][r.segment] = r;
      });
      return out;
    } catch (_) {
      return {};
    }
  }

  /* ---------------------------------------------------------------- mount */

  function ensureRoot(host) {
    host.classList.add('pc-root');
    return host;
  }

  function skeleton(host, title) {
    if (!host) return;
    ensureRoot(host);
    host.hidden = false;
    host.innerHTML = skeletonHtml(title);
  }

  async function mount(host, types, opts) {
    if (!host) return null;
    opts = opts || {};
    var list = (Array.isArray(types) ? types : []).filter(function (t) { return t && t.keyword; });
    // Dedupe by keyword, keep first (callers pass sorted lists).
    var seen = {};
    list = list.filter(function (t) { if (seen[t.keyword]) return false; seen[t.keyword] = 1; return true; });
    list = list.slice(0, opts.limit || MAX_ROWS);
    ensureRoot(host);

    if (list.length < 2) {
      host.innerHTML = '';
      host.hidden = true;
      return null;
    }
    host.hidden = false;
    var token = (host._pcToken = (host._pcToken || 0) + 1);
    if (!host.querySelector('[data-pc-board]')) host.innerHTML = skeletonHtml(opts.title);

    var ns = await fetchNewShop(opts.supabase, list.map(function (t) { return t.keyword; }));
    if (host._pcToken !== token) return null; // superseded

    var rows = list.map(function (t) { return { type: t, score: scorePasar(t, ns) }; });
    rows.sort(function (a, b) { return b.score.total - a.score.total || (b.score.units || 0) - (a.score.units || 0); });

    var marks = {
      laku: tercileMarks(rows, function (r) { return r.score.units; }, true),
      moat: tercileMarks(rows, function (r) { return r.score.reviews; }, false),
      baru: tercileMarks(rows, function (r) { return r.score.baruThin ? null : r.score.nbPct; }, true)
    };
    var body = rows.map(function (r, i) { return rowHtml(r, i, marks); }).join('');
    var peta = petaSvg(rows);
    host.classList.remove('is-expanded');
    host.innerHTML = shellHtml(opts, body, peta, rows.length);
    hydratePetaImages(host);

    var byKw = {};
    rows.forEach(function (r) { byKw[r.type.keyword] = r.type; });

    if (!host._pcBound) {
      host._pcBound = true;
      host.addEventListener('click', function (e) {
        var tab = e.target.closest('[data-pc-view]');
        if (tab) {
          var view = tab.getAttribute('data-pc-view');
          host.querySelectorAll('[data-pc-view]').forEach(function (b) {
            var on = b.getAttribute('data-pc-view') === view;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          var board = host.querySelector('[data-pc-board]');
          var petaEl = host.querySelector('[data-pc-peta]');
          if (board) board.hidden = view !== 'board';
          if (petaEl) petaEl.hidden = view !== 'peta';
          var colhead = host.querySelector('.pc-colhead');
          if (colhead) colhead.hidden = view !== 'board';
          var more = host.querySelector('[data-pc-more]');
          if (more) more.hidden = view !== 'board';
          if (host._pcOpts && host._pcOpts.onEvent) host._pcOpts.onEvent('pasar_compare_view', { view: view });
          return;
        }
        var moreBtn = e.target.closest('[data-pc-more]');
        if (moreBtn) {
          host.classList.add('is-expanded');
          moreBtn.remove();
          if (host._pcOpts && host._pcOpts.onEvent) host._pcOpts.onEvent('pasar_compare_expand', {});
          return;
        }
        var hit = e.target.closest('[data-pc-kw]');
        if (!hit) return;
        var t = host._pcByKw && host._pcByKw[hit.getAttribute('data-pc-kw')];
        if (!t) return;
        if (host._pcOpts && host._pcOpts.onEvent) host._pcOpts.onEvent('pasar_compare_open', { keyword: t.keyword });
        if (host._pcOpts && host._pcOpts.onOpen) host._pcOpts.onOpen(t);
      });
      host.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var dot = e.target.closest('.pc-peta-dot');
        if (!dot) return;
        e.preventDefault();
        dot.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    host._pcOpts = opts;
    host._pcByKw = byKw;
    return { rows: rows };
  }

  function clear(host) {
    if (!host) return;
    host._pcToken = (host._pcToken || 0) + 1;
    host.classList.remove('pc-root', 'is-expanded');
    host.innerHTML = '';
    host.hidden = true;
  }

  global.PasarCompare = {
    mount: mount,
    skeleton: skeleton,
    clear: clear,
    scorePasar: scorePasar,
    verdictOf: verdictOf,
    MAX_ROWS: MAX_ROWS
  };
})(window);
