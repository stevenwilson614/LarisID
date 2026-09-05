/* Peta Peluang — listing scatter + synced product list.
 *
 * Audit (2026-09-05, live "kursi lipat camping"):
 * Unclear in 5s — map plotted listings while the pane beside it was pasar
 * cards (different set/grain). Dots stacked on the Y=0 edge. Three equal
 * mode chips, on-canvas zone labels, paragraph legend. Momentum colour was
 * noise (mostly grey) and clashed with brand MERAH. hidden=flex leak showed
 * the Jejak scrubber in Peluang.
 * Cut from default — momentum colour, ad rings, ▲/▼, pin markers, on-canvas
 * zone labels, 3 chips, sepi chip, LS_MODE.
 * Keep — log X (laku/minggu), Y (baru/lama), size=omset, terukur/perkiraan,
 * zone assignment, Jejak+Langit behind Lainnya, Sidik Jari, peta_batch.
 */
(function (w) {
  'use strict';

  var LS_COLLAPSE = 'larisid_peta_collapsed';
  var SS_BATCH = 'larisid_peta_batch_missing';
  var MIN_POINTS = 8;
  var PAD = { t: 22, r: 14, b: 34, l: 14 };
  var WIDE_PX = 760;
  var LIST_CAP = 12;
  var DOT = '#B5202A';
  var EMAS = '#C9974B';

  var ZONE = {
    baru_laku:   { id: 'baru_laku',   label: 'Baru tapi Laku',     cara: 'Masih baru, tapi udah laku. Kalau banyak titik di sini, pemula masih bisa masuk. Contek harga & fotonya.' },
    pemain_lama: { id: 'pemain_lama', label: 'Pemain Lama',        cara: 'Udah lama dan besar. Jangan lawan langsung, cari celah harga atau varian yang mereka nggak punya.' },
    baru_belum:  { id: 'baru_belum',  label: 'Baru, Belum Jalan',  cara: 'Baru masuk, belum laku. Bukan berarti gagal, cek dulu harga atau fotonya yang kalah.' },
    mulai_sepi:  { id: 'mulai_sepi',  label: 'Mulai Sepi',         cara: 'Udah lama tapi pelan. Pasarnya mungkin geser, lihat Jejak Waktu.' }
  };
  var ZONE_ORDER = ['baru_belum', 'baru_laku', 'mulai_sepi', 'pemain_lama'];
  var MOM_CLR = { naik: '#16A34A', stabil: '#64748B', turun: '#DC2626', belum: '#9CA3AF' };
  var ID_MON = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  var STOP = { dan:1, dengan:1, untuk:1, murah:1, cod:1, promo:1, terlaris:1, original:1, gratis:1, ongkir:1, bisa:1, ready:1, stok:1, pcs:1, set:1 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function keyOf(p) { return String(p.item_id) + '|' + String(p.shop_id); }
  function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
  function reduced() {
    try { return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (_) { return false; }
  }
  function isPhone() { return (w.innerWidth || 800) <= 640; }
  function finePointer() {
    try { return !!(w.matchMedia && w.matchMedia('(pointer:fine)').matches); }
    catch (_) { return false; }
  }
  function pctile(arr, p) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var i = clamp(Math.round((s.length - 1) * p), 0, s.length - 1);
    return s[i];
  }
  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function fmtRp(n) {
    n = Math.round(Number(n) || 0);
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.0', '') + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' jt';
    return 'Rp ' + n.toLocaleString('id-ID');
  }
  function fmtDay(d) {
    var dt = d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T00:00:00+07:00');
    if (isNaN(dt.getTime())) return String(d || '');
    return dt.getDate() + ' ' + ID_MON[dt.getMonth()];
  }
  function ageDays(listing, asOf) {
    var raw = listing.listing_date;
    if (!raw) return null;
    var t = new Date(raw).getTime();
    if (!Number.isFinite(t)) return null;
    var end = asOf ? new Date(asOf).getTime() : Date.now();
    return Math.max(0, Math.round((end - t) / 86400000));
  }
  function yNewFrom(reviews, age, asOfListing) {
    var rev = Number(reviews) || 0;
    var ad = age;
    if (ad == null && asOfListing) ad = ageDays(asOfListing);
    var revTerm = 1 - clamp(Math.log10(rev + 1) / Math.log10(1000), 0, 1);
    if (ad == null) return clamp(revTerm, 0, 1);
    var ageTerm = 1 - clamp(ad / 720, 0, 1);
    return clamp(0.6 * revTerm + 0.4 * ageTerm, 0, 1);
  }
  function isBaruRule(reviews, age) {
    return (Number(reviews) || 0) < 100 || (age != null && age < 180);
  }
  function zoneId(baru, ramai) {
    if (baru && ramai) return 'baru_laku';
    if (!baru && ramai) return 'pemain_lama';
    if (baru && !ramai) return 'baru_belum';
    return 'mulai_sepi';
  }
  function momWord(m, pending) {
    if (!m || m.momentum_class === 'belum') {
      if (pending === 'pending') return '…';
      return '—';
    }
    var pct = Math.round(Number(m.momentum_pct) || 0);
    var core = m.momentum_class === 'naik' ? ('naik +' + pct + '%')
      : m.momentum_class === 'turun' ? ('turun ' + pct + '%')
      : 'stabil';
    var terukur = m.cur_source === 'measured' && m.prev_source === 'measured';
    return terukur ? core : core + ' (perkiraan)';
  }
  function momMark(m) {
    if (!m || m.momentum_class === 'belum') return '';
    if (m.momentum_class === 'naik') return '▲ ';
    if (m.momentum_class === 'turun') return '▼ ';
    return '';
  }

  function calcLarisScore(listing, peers, kwTrendPct) {
    var rows = peers && peers.length > 5 ? peers : null;
    var baseScore;
    if (rows) {
      var soldArr = rows.map(function (r) { return r.total_sold || 0; }).sort(function (a, b) { return a - b; });
      var totalSold = soldArr.reduce(function (s, v) { return s + v; }, 0);
      var target05 = totalSold * 0.005;
      var p20Sold = soldArr[Math.floor(soldArr.length * 0.20)] || 0;
      var entryRatio = target05 > 0 ? p20Sold / target05 : 1;
      var entryScore = Math.max(0, Math.min(35, 35 * (2 - entryRatio) / 2));
      var revArr = rows.map(function (r) { return r.reviews || r.review_count || 0; }).sort(function (a, b) { return a - b; });
      var medRev = revArr[Math.floor(revArr.length * 0.5)] || 0;
      var reviewScore = Math.max(0, Math.min(30, 30 * (1 - medRev / 400)));
      var top10Sold = rows.slice().sort(function (a, b) { return (b.total_sold || 0) - (a.total_sold || 0); })
        .slice(0, 10).reduce(function (s, r) { return s + (r.total_sold || 0); }, 0);
      var top10Share = totalSold > 0 ? top10Sold / totalSold : 1;
      var concScore = Math.max(0, Math.min(20, 20 * (1 - (top10Share - 0.30) / 0.60)));
      var prices = rows.map(function (r) { return r.price || 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
      var medPrice = prices[Math.floor(prices.length * 0.5)] || 0;
      var priceScore = medPrice >= 20000 && medPrice <= 500000 ? 15
        : medPrice < 20000 ? Math.round(medPrice / 20000 * 15)
        : Math.max(0, Math.round(15 - (medPrice - 500000) / 500000 * 15));
      baseScore = entryScore + reviewScore + concScore + priceScore;
    } else {
      var sold = listing.total_sold || 0;
      var reviews = listing.reviews || listing.review_count || 0;
      var rating = listing.rating || 0;
      var price = listing.price || 0;
      var soldScore = sold < 100 ? Math.min(sold / 100, 1) * 25
        : sold <= 5000 ? 25 - (sold - 100) / 4900 * 10
        : Math.max(5, 15 - (sold - 5000) / 5000 * 5);
      var revScore = Math.max(0, 35 * (1 - reviews / 500));
      var ratingGap = Math.max(0, 20 * (1 - Math.max(0, rating - 3.5) / 1.5));
      var priceScore2 = price >= 25000 && price <= 400000 ? 20
        : price < 25000 ? Math.round(price / 25000 * 20)
        : Math.max(0, Math.round(20 - (price - 400000) / 400000 * 20));
      baseScore = soldScore + revScore + ratingGap + priceScore2;
    }
    var trendAdj = kwTrendPct != null ? Math.max(-10, Math.min(10, kwTrendPct * 0.33)) : 0;
    return Math.min(100, Math.max(0, Math.round(baseScore + trendAdj)));
  }

  function calcListingScore(listing, peers, listingTrendPct, kwTrendPct) {
    var rows = peers && peers.length > 5 ? peers : null;
    var larisScore = calcLarisScore(listing, rows, kwTrendPct);
    var kwScore = Math.round(larisScore * 0.30);
    var salesScore;
    if (rows) {
      var sortedSold = rows.map(function (r) { return r.total_sold || 0; }).sort(function (a, b) { return a - b; });
      var below = sortedSold.filter(function (v) { return v <= (listing.total_sold || 0); }).length;
      salesScore = Math.round((below / sortedSold.length) * 25);
    } else {
      var sold = listing.total_sold || 0;
      salesScore = Math.min(25, Math.round(Math.log10(Math.max(sold, 1)) / Math.log10(5000) * 25));
    }
    var sold2 = listing.total_sold || 0;
    var reviews = listing.reviews || listing.review_count || 0;
    var spR = sold2 / Math.max(reviews, 1);
    var effScore = Math.min(15, Math.round(spR / 40 * 15));
    var barScore = Math.max(0, Math.round((1 - Math.min(reviews / 300, 1)) * 10));
    var revScore = effScore + barScore;
    var monthly = (listing.price || 0) * sold2 / 12;
    var omsetScore = Math.min(20, Math.round(Math.log10(Math.max(monthly, 1)) / Math.log10(50000000) * 20));
    var trendPct = listingTrendPct != null ? listingTrendPct : kwTrendPct;
    var trendScore = trendPct != null ? Math.max(-10, Math.min(10, trendPct * 0.33)) : 0;
    var total = Math.min(100, Math.max(0, Math.round(kwScore + salesScore + revScore + omsetScore + trendScore)));
    return { total: total, kwScore: kwScore, salesScore: salesScore, revScore: revScore, omsetScore: omsetScore, trendScore: trendScore, larisScore: larisScore };
  }

  function sidikJariHtml(score) {
    if (!score) return '';
    var vals = [
      clamp((score.kwScore || 0) / 30, 0, 1),
      clamp((score.salesScore || 0) / 25, 0, 1),
      clamp((score.revScore || 0) / 25, 0, 1),
      clamp((score.omsetScore || 0) / 20, 0, 1),
      clamp(((score.trendScore || 0) + 10) / 20, 0, 1)
    ];
    var cx = 14, cy = 14, r = 11;
    var pts = vals.map(function (v, i) {
      var a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      return (cx + Math.cos(a) * r * v).toFixed(1) + ',' + (cy + Math.sin(a) * r * v).toFixed(1);
    }).join(' ');
    var hint = (score.kwScore / 30 >= 0.6 && score.salesScore / 25 <= 0.4)
      ? '<span class="peta-sidik-hint">bentuk pemula</span>' : '';
    var title = 'Pasar mudah · Penjualan · Ulasan · Omset · Tren';
    return '<span class="peta-sidik" title="' + esc(title) + '">'
      + '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">'
      + '<polygon points="' + pts + '" fill="none" stroke="#B5202A" stroke-width="1.4" stroke-linejoin="round"/>'
      + '</svg>' + hint + '</span>';
  }

  function petaPrepare(listings, batch) {
    var momMap = {};
    var posMap = {};
    (batch && batch.momentum || []).forEach(function (m) {
      momMap[m.item_id + '|' + m.shop_id] = m;
    });
    (batch && batch.positions || []).forEach(function (p) {
      var k = p.item_id + '|' + p.shop_id;
      if (!posMap[k]) posMap[k] = {};
      posMap[k][p.week_start] = p;
    });
    var points = [];
    (listings || []).forEach(function (listing) {
      var nv = num(listing.nowcast_velocity_daily);
      var xEstimated = false;
      var xUnits;
      if (nv != null && nv >= 0) xUnits = nv * 7;
      else {
        var ad = ageDays(listing);
        var sold = Number(listing.total_sold) || 0;
        if (!(sold > 0)) return;
        xUnits = sold / Math.max(ad || 1, 1) * 7;
        xEstimated = true;
      }
      if (xUnits == null || xUnits < 0) return;
      var reviews = Number(listing.reviews || listing.review_count) || 0;
      var ad2 = ageDays(listing);
      var yNew = yNewFrom(reviews, ad2, listing);
      var baru = isBaruRule(reviews, ad2);
      var omset = num(listing.nowcast_omset_monthly);
      var omsetEst = false;
      if (omset == null || omset < 0) {
        omset = (Number(listing.price) || 0) * xUnits * 4.3;
        omsetEst = true;
      }
      var method = listing.nowcast_method;
      var terukur = method === 'latest' || method === 'blend';
      var k = keyOf(listing);
      points.push({
        listing: listing, key: k, xUnits: xUnits, yNew: yNew, isBaru: baru,
        sizeOmset: omset, terukur: terukur && !xEstimated && !omsetEst,
        xEstimated: xEstimated, isAd: listing.is_ad === 1 || listing.is_ad === '1' || listing.is_ad === true,
        momentum: momMap[k] || { momentum_class: 'belum' },
        frames: posMap[k] || {},
        score: null
      });
    });
    return points;
  }

  function assignZones(points) {
    if (!points.length) return { medianX: 0, yCut: 0.5 };
    var xs = points.map(function (p) { return p.xUnits; });
    var medianX = median(xs);
    points.forEach(function (p) {
      p.ramai = p.xUnits >= medianX;
      p.zone = zoneId(p.isBaru, p.ramai);
    });
    return { medianX: medianX, yCut: 0.5 };
  }

  function rankY(points) {
    var ranked = points.slice().sort(function (a, b) {
      if (a.yNew !== b.yNew) return a.yNew - b.yNew;
      var ra = Number(a.listing.reviews || a.listing.review_count) || 0;
      var rb = Number(b.listing.reviews || b.listing.review_count) || 0;
      if (ra !== rb) return rb - ra;
      return (ageDays(b.listing) || 0) - (ageDays(a.listing) || 0);
    });
    var n = ranked.length;
    ranked.forEach(function (p, i) {
      p.yRank = n <= 1 ? 0.5 : i / (n - 1);
    });
    var baru = ranked.filter(function (p) { return p.isBaru; });
    var lama = ranked.filter(function (p) { return !p.isBaru; });
    var yCut = null;
    if (baru.length && lama.length) {
      var minBaru = Math.min.apply(null, baru.map(function (p) { return p.yRank; }));
      var maxLama = Math.max.apply(null, lama.map(function (p) { return p.yRank; }));
      yCut = (minBaru + maxLama) / 2;
    }
    return yCut;
  }

  function layoutPoints(points, wdt, hgt) {
    var p98 = pctile(points.map(function (p) { return p.xUnits; }), 0.98) || 1;
    var p95om = pctile(points.map(function (p) { return p.sizeOmset; }), 0.95) || 1;
    var phone = isPhone();
    var innerW = Math.max(40, wdt - PAD.l - PAD.r);
    var innerH = Math.max(40, hgt - PAD.t - PAD.b);
    var yCut = rankY(points);
    points.forEach(function (p) {
      var pinned = p.xUnits > p98;
      var xv = Math.log10((pinned ? p98 : p.xUnits) + 1) / Math.log10(p98 + 1);
      p.px = PAD.l + xv * innerW;
      p.py = PAD.t + (1 - (p.yRank != null ? p.yRank : p.yNew)) * innerH;
      p.pinned = pinned;
      var r = 4 + 12 * Math.sqrt((p.sizeOmset || 0) / p95om);
      p.r = clamp(r, phone ? 4 : 5, phone ? 14 : 18);
    });
    return { p98: p98, innerW: innerW, innerH: innerH, yCut: yCut };
  }

  function starGlyph(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 2;
      var ox = x + Math.cos(a) * r;
      var oy = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
      var b = a + Math.PI / 4;
      ctx.lineTo(x + Math.cos(b) * r * 0.38, y + Math.sin(b) * r * 0.38);
    }
    ctx.closePath();
  }

  function tokenizeName(name, query) {
    var qTok = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    var qSet = {};
    qTok.forEach(function (t) { qSet[t] = 1; });
    var raw = String(name || '').toLowerCase().replace(/[^a-z0-9\s]+/gi, ' ').split(/\s+/);
    var out = [];
    raw.forEach(function (t) {
      if (t.length < 3 || STOP[t] || qSet[t] || /^\d+$/.test(t)) return;
      out.push(t);
    });
    return out;
  }

  function buildConstellations(points, query) {
    var freq = {};
    var bigram = {};
    points.forEach(function (p) {
      var toks = tokenizeName(p.listing.product_name, query);
      var seen = {};
      toks.forEach(function (t, i) {
        if (!seen[t]) { freq[t] = (freq[t] || 0) + 1; seen[t] = 1; }
        if (i + 1 < toks.length) {
          var b = toks[i] + ' ' + toks[i + 1];
          if (!seen[b]) { bigram[b] = (bigram[b] || 0) + 1; seen[b] = 1; }
        }
      });
    });
    var n = points.length;
    var cands = [];
    Object.keys(bigram).forEach(function (k) {
      if (bigram[k] >= 3 && bigram[k] <= n * 0.6) cands.push({ t: k, f: bigram[k] + 0.5 });
    });
    Object.keys(freq).forEach(function (k) {
      if (freq[k] >= 3 && freq[k] <= n * 0.6) cands.push({ t: k, f: freq[k] });
    });
    cands.sort(function (a, b) { return b.f - a.f; });
    var groups = {};
    points.forEach(function (p) {
      var hay = (' ' + tokenizeName(p.listing.product_name, query).join(' ') + ' ');
      var hit = null;
      for (var i = 0; i < cands.length; i++) {
        var t = cands[i].t;
        if (hay.indexOf(' ' + t + ' ') >= 0 || (t.indexOf(' ') < 0 && hay.indexOf(t) >= 0)) {
          hit = t; break;
        }
      }
      p.group = hit || null;
      if (hit) {
        if (!groups[hit]) groups[hit] = [];
        groups[hit].push(p);
      }
    });
    var cons = Object.keys(groups)
      .filter(function (k) { return groups[k].length >= 3; })
      .sort(function (a, b) { return groups[b].length - groups[a].length; })
      .slice(0, 8)
      .map(function (k) { return { token: k, members: groups[k] }; });
    var keep = {};
    cons.forEach(function (c) { keep[c.token] = 1; });
    points.forEach(function (p) { if (p.group && !keep[p.group]) p.group = null; });
    return cons;
  }

  function mstEdges(members) {
    var edges = [];
    for (var i = 0; i < members.length; i++) {
      for (var j = i + 1; j < members.length; j++) {
        var dx = members[i].px - members[j].px, dy = members[i].py - members[j].py;
        edges.push({ a: i, b: j, d: dx * dx + dy * dy });
      }
    }
    edges.sort(function (a, b) { return a.d - b.d; });
    var parent = members.map(function (_, i) { return i; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    var out = [];
    edges.forEach(function (e) {
      var pa = find(e.a), pb = find(e.b);
      if (pa === pb) return;
      parent[pa] = pb;
      out.push(e);
    });
    return out;
  }

  function shellHtml(q, showList, langit, collapsed) {
    return '<div class="peta-root' + (langit ? ' is-langit' : '') + (collapsed ? ' is-collapsed' : '') + (showList ? '' : ' no-list') + '">'
      + '<div class="peta-head">'
      +   '<div class="peta-titles">'
      +     '<h3 class="peta-title">Peta Peluang' + (q ? ': ' + esc(q) : '') + '</h3>'
      +     '<p class="peta-sub" data-peta-sub></p>'
      +   '</div>'
      +   '<div class="peta-head-actions">'
      +     '<button type="button" class="peta-back" hidden data-peta-back>← Peluang</button>'
      +     '<details class="peta-lainnya" data-peta-lainnya>'
      +       '<summary>Lainnya</summary>'
      +       '<div class="peta-lainnya-menu">'
      +         '<button type="button" data-mode="jejak">Jejak Waktu</button>'
      +         '<button type="button" data-mode="langit">Langit Laris</button>'
      +       '</div>'
      +     '</details>'
      +     '<button type="button" class="peta-chevron" data-peta-collapse aria-label="Lipat peta">▾</button>'
      +   '</div>'
      + '</div>'
      + '<p class="peta-collapsed-line" data-peta-collapsed></p>'
      + '<div class="peta-body">'
      +   '<div class="peta-grid">'
      +     '<div class="peta-map">'
      +       '<div class="peta-canvas-wrap">'
      +         '<canvas class="peta-canvas"></canvas>'
      +         '<div class="peta-axis-baru">Masih baru ↑</div>'
      +         '<div class="peta-axis-lama">Sudah lama ↓</div>'
      +         '<div class="peta-axis-laku">Laku per minggu →</div>'
      +         '<div class="peta-thin" hidden data-peta-thin></div>'
      +         '<div class="peta-sheet" hidden></div>'
      +       '</div>'
      +       '<div class="peta-zones" data-peta-zones></div>'
      +       '<p class="peta-zone-cara" data-peta-cara hidden></p>'
      +       '<p class="peta-legend">Pekat = terukur · Pudar = perkiraan · Besar = omset/bulan</p>'
      +     '</div>'
      +     (showList
        ? ('<div class="peta-list">'
          +   '<div class="peta-list-head" data-peta-lhead></div>'
          +   '<div class="peta-rows" data-peta-rows></div>'
          +   '<button type="button" class="peta-more" hidden data-peta-more></button>'
          + '</div>')
        : '')
      +   '</div>'
      +   '<div class="peta-jejak-cap" hidden data-peta-jcap></div>'
      +   '<div class="peta-jejak-ctrl" hidden data-peta-jctrl>'
      +     '<button type="button" class="peta-play" data-peta-play>▶</button>'
      +     '<input type="range" min="0" max="7" value="7" data-peta-scrub>'
      +   '</div>'
      +   '<div class="peta-moves" hidden data-peta-moves></div>'
      +   '<button type="button" class="peta-fs-btn" hidden data-peta-fs>Buka layar penuh</button>'
      +   '<details class="peta-cara"><summary>Cara baca</summary>'
      +     '<ol>'
      +       '<li>Makin ke kanan, makin laku minggu ini. Pekat = terukur, pudar = perkiraan.</li>'
      +       '<li>Makin ke atas, makin baru. Daftar di samping (atau di bawah) adalah produk yang sama — ketuk zona untuk saring.</li>'
      +     '</ol>'
      +   '</details>'
      + '</div>'
      + '</div>';
  }

  function skeleton(el, query) {
    if (!el) return;
    var q = query || '';
    el.innerHTML =
      '<div class="peta-root is-skel">'
      + '<div class="peta-head"><div class="peta-titles">'
      +   '<h3 class="peta-title">Peta Peluang' + (q ? ': ' + esc(q) : '') + '</h3>'
      +   '<p class="peta-sub">Menghitung posisi produk…</p>'
      + '</div></div>'
      + '<div class="peta-body"><div class="peta-grid">'
      +   '<div class="peta-map"><div class="peta-canvas-wrap peta-shimmer"></div></div>'
      +   '<div class="peta-list"><div class="peta-rows">'
      +     '<div class="peta-row peta-shimmer"></div>'.repeat(6)
      +   '</div></div>'
      + '</div></div></div>';
  }

  function PetaController(el, listings, opts) {
    this.el = el;
    this.opts = opts || {};
    this.listings = listings || [];
    this.showList = this.opts.list !== false;
    this.batch = null;
    this.batchStatus = 'pending';
    this.points = [];
    this.mode = 'peluang';
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem(LS_COLLAPSE) === '1'; } catch (_) {}
    this.zoneFilter = null;
    this.hover = null;
    this.selected = null;
    this.sheet = null;
    this.frame = 0;
    this.playing = false;
    this.raf = 0;
    this.t0 = 0;
    this.listExpanded = false;
    this._ro = null;
    this._roRoot = null;
    this._io = null;
    this._inView = true;
    this._frozenZones = null;
    this._layout = null;
    this.renderShell();
    this.rebuild();
    this.fetchBatch();
  }

  PetaController.prototype.destroy = function () {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._ro) try { this._ro.disconnect(); } catch (_) {}
    if (this._roRoot) try { this._roRoot.disconnect(); } catch (_) {}
    if (this._io) try { this._io.disconnect(); } catch (_) {}
    this.el.innerHTML = '';
  };

  PetaController.prototype.update = function (listings) {
    this.listings = listings || [];
    this.selected = null;
    this.sheet = null;
    this.hover = null;
    this.listExpanded = false;
    this.rebuild();
    this.fetchBatch();
  };

  PetaController.prototype.setMode = function (mode) {
    if (mode === 'jejak' && !this.batch) return;
    this.mode = mode === 'jejak' || mode === 'langit' ? mode : 'peluang';
    this.playing = false;
    this.sheet = null;
    this.selected = null;
    this.renderShell();
    this.rebuild();
    this.draw();
    this.ensureRaf();
  };

  PetaController.prototype.renderShell = function () {
    var q = this.opts.query || '';
    this.el.innerHTML = shellHtml(q, this.showList, this.mode === 'langit', this.collapsed);
    this.root = this.el.querySelector('.peta-root');
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.bindUi();
    this.syncModeChrome();
    this.syncWide();
    var self = this;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self.draw(); });
      var wrap = this.el.querySelector('.peta-canvas-wrap');
      if (wrap) this._ro.observe(wrap);
      this._roRoot = new ResizeObserver(function () { self.syncWide(); });
      this._roRoot.observe(this.root);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver(function (ents) {
        self._inView = ents.some(function (e) { return e.isIntersecting; });
        if (self._inView && self.mode === 'langit') self.ensureRaf();
      }, { threshold: 0.05 });
      this._io.observe(this.el);
    }
  };

  PetaController.prototype.syncWide = function () {
    if (!this.root) return;
    var wdt = this.root.getBoundingClientRect().width;
    var wide = wdt >= WIDE_PX;
    if (this.root.classList.contains('is-wide') === wide) return;
    this.root.classList.toggle('is-wide', wide);
    this.renderList();
    this.draw();
  };

  PetaController.prototype.bindUi = function () {
    var self = this;
    var col = this.el.querySelector('[data-peta-collapse]');
    if (col) col.addEventListener('click', function () {
      self.collapsed = !self.collapsed;
      try { localStorage.setItem(LS_COLLAPSE, self.collapsed ? '1' : '0'); } catch (_) {}
      self.root.classList.toggle('is-collapsed', self.collapsed);
      col.textContent = self.collapsed ? '▸' : '▾';
    });
    var back = this.el.querySelector('[data-peta-back]');
    if (back) back.addEventListener('click', function () { self.setMode('peluang'); });
    this.el.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var menu = self.el.querySelector('[data-peta-lainnya]');
        if (menu) menu.open = false;
        self.setMode(btn.getAttribute('data-mode'));
      });
    });
    var zones = this.el.querySelector('[data-peta-zones]');
    if (zones) zones.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zone]');
      if (!btn) return;
      var id = btn.getAttribute('data-zone');
      self.zoneFilter = self.zoneFilter === id ? null : id;
      self.applyZoneFilter();
    });
    if (this.canvas) {
      this.canvas.addEventListener('click', function (e) { self.onPointer(e, true); });
      this.canvas.addEventListener('mousemove', function (e) {
        if (!finePointer()) return;
        self.onPointer(e, false);
      });
      this.canvas.addEventListener('mouseleave', function () {
        self.hover = null;
        self.syncRowHl();
        if (self.opts.onHighlight) self.opts.onHighlight(null);
        self.draw();
      });
    }
    var rows = this.el.querySelector('[data-peta-rows]');
    if (rows) {
      rows.addEventListener('click', function (e) {
        var row = e.target.closest('[data-k]');
        if (!row) return;
        self.selectKey(row.getAttribute('data-k'), true);
      });
      rows.addEventListener('mousemove', function (e) {
        if (!finePointer()) return;
        var row = e.target.closest('[data-k]');
        if (!row) return;
        var hit = self.pointByKey(row.getAttribute('data-k'));
        if (self.hover && hit && self.hover.key === hit.key) return;
        self.hover = hit;
        self.syncRowHl();
        if (self.opts.onHighlight) self.opts.onHighlight(hit ? hit.listing : null);
        self.draw();
      });
      rows.addEventListener('mouseleave', function () {
        self.hover = null;
        self.syncRowHl();
        if (self.opts.onHighlight) self.opts.onHighlight(null);
        self.draw();
      });
    }
    var more = this.el.querySelector('[data-peta-more]');
    if (more) more.addEventListener('click', function () {
      self.listExpanded = true;
      self.renderList();
    });
    var lhead = this.el.querySelector('[data-peta-lhead]');
    if (lhead) lhead.addEventListener('click', function (e) {
      if (!e.target.closest('[data-peta-clear]')) return;
      self.zoneFilter = null;
      self.applyZoneFilter();
    });
    var scrub = this.el.querySelector('[data-peta-scrub]');
    if (scrub) scrub.addEventListener('input', function () {
      self.playing = false;
      self.frame = Number(scrub.value) || 0;
      self.draw();
      self.updateJejakChrome();
    });
    var play = this.el.querySelector('[data-peta-play]');
    if (play) play.addEventListener('click', function () {
      if (isPhone()) return;
      self.playing = !self.playing;
      play.textContent = self.playing ? '❚❚' : '▶';
      if (self.playing) self.ensureRaf();
    });
    var fs = this.el.querySelector('[data-peta-fs]');
    if (fs) fs.addEventListener('click', function () { self.openFullscreen(); });
  };

  PetaController.prototype.syncModeChrome = function () {
    var jejak = this.mode === 'jejak';
    var langit = this.mode === 'langit';
    var back = this.el.querySelector('[data-peta-back]');
    var lain = this.el.querySelector('[data-peta-lainnya]');
    if (back) back.hidden = this.mode === 'peluang';
    if (lain) lain.hidden = this.mode !== 'peluang';
    var jctrl = this.el.querySelector('[data-peta-jctrl]');
    var jcap = this.el.querySelector('[data-peta-jcap]');
    var moves = this.el.querySelector('[data-peta-moves]');
    var fs = this.el.querySelector('[data-peta-fs]');
    if (jctrl) jctrl.hidden = !jejak;
    if (jcap) jcap.hidden = !jejak;
    if (moves) moves.hidden = !jejak;
    if (fs) fs.hidden = !langit;
    if (this.root) this.root.classList.toggle('is-langit', langit);
    var jejakBtn = this.el.querySelector('[data-mode="jejak"]');
    if (jejakBtn) {
      jejakBtn.disabled = !this.batch;
      jejakBtn.title = this.batch ? '' : 'Butuh riwayat mingguan';
    }
    var leg = this.el.querySelector('.peta-legend');
    if (leg) {
      if (langit) leg.textContent = 'Terang = laku per minggu · Berkelip = naik · Merah redup = turun · Garis = produk serupa';
      else if (jejak) leg.textContent = 'Jejak 8 minggu · Pekat = terukur · Pudar = perkiraan';
      else leg.textContent = 'Pekat = terukur · Pudar = perkiraan · Besar = omset/bulan';
    }
  };

  PetaController.prototype.visiblePoints = function () {
    var id = this.zoneFilter;
    if (!id) return this.points;
    if (id.indexOf('group:') === 0) {
      var tok = id.slice(6);
      return this.points.filter(function (p) { return p.group === tok; });
    }
    return this.points.filter(function (p) { return p.zone === id; });
  };

  PetaController.prototype.pointByKey = function (k) {
    for (var i = 0; i < this.points.length; i++) {
      if (this.points[i].key === k) return this.points[i];
    }
    return null;
  };

  PetaController.prototype.rebuild = function () {
    var prepared = petaPrepare(this.listings, this.batch);
    var calc = this.opts.calcScore;
    if (calc) {
      prepared.forEach(function (p) {
        try { p.score = calc(p.listing); } catch (_) { p.score = null; }
      });
    }
    var usable = prepared.filter(function (p) { return p.xUnits != null && p.xUnits >= 0; });
    usable.sort(function (a, b) { return b.xUnits - a.xUnits; });
    this.thin = usable.length > 0 && usable.length < MIN_POINTS;
    this.points = usable;
    this._zones = assignZones(usable);
    if (this.mode === 'jejak' && this.batch && this.batch.weeks) {
      this.frame = (this.batch.weeks.length || 8) - 1;
      var scr = this.el.querySelector('[data-peta-scrub]');
      if (scr) { scr.max = String(this.batch.weeks.length - 1); scr.value = String(this.frame); }
    }
    this.updateChrome();
    this.renderList();
    this.draw();
    this.ensureRaf();
  };

  PetaController.prototype.updateChrome = function () {
    var n = this.points.length;
    var scrapes = (this.batch && this.batch.scrapes) || [];
    var lastScrape = scrapes.length ? scrapes[scrapes.length - 1] : null;
    var counts = { baru_laku: 0, pemain_lama: 0, baru_belum: 0, mulai_sepi: 0 };
    this.points.forEach(function (p) { counts[p.zone] = (counts[p.zone] || 0) + 1; });
    var baruN = counts.baru_laku + counts.baru_belum;
    var sub = this.el.querySelector('[data-peta-sub]');
    if (sub) {
      var ageNote = n
        ? (baruN === 0 ? ' · Semua produk di sini sudah lama' : (baruN === n ? ' · Semua produk di sini masih baru' : ''))
        : '';
      sub.textContent = (n ? n + ' produk' : 'Belum ada produk') + ' · data '
        + (lastScrape ? fmtDay(lastScrape) : 'mingguan')
        + ', disetarakan ke 7 hari'
        + (this.mode === 'langit' ? ' · Mode eksplorasi' : '')
        + ageNote;
    }
    var col = this.el.querySelector('[data-peta-collapsed]');
    if (col) {
      col.textContent = 'Peta Peluang: ' + counts.baru_laku + ' baru tapi laku · '
        + counts.pemain_lama + ' pemain lama · '
        + (counts.baru_belum + counts.mulai_sepi) + ' lainnya';
    }
    var thin = this.el.querySelector('[data-peta-thin]');
    if (thin) {
      if (!n) {
        thin.hidden = false;
        thin.textContent = 'Belum ada produk yang bisa dipetakan untuk pencarian ini.';
      } else if (this.thin) {
        thin.hidden = false;
        thin.textContent = 'Peta butuh minimal 8 produk terukur — ini baru ' + n + '. Daftarnya tetap bisa dibaca.';
      } else {
        thin.hidden = true;
      }
    }
    this.renderZones(counts);
    this.syncModeChrome();
    this.applyZoneFilter(true);
    if (this.mode === 'jejak') this.updateJejakChrome();
  };

  PetaController.prototype.renderZones = function (counts) {
    var box = this.el.querySelector('[data-peta-zones]');
    if (!box) return;
    var self = this;
    box.innerHTML = ZONE_ORDER.map(function (id) {
      var z = ZONE[id];
      var on = self.zoneFilter === id ? ' is-on' : '';
      return '<button type="button" class="peta-zone' + on + '" data-zone="' + id + '">'
        + '<span class="peta-zone-name">' + esc(z.label) + '</span>'
        + '<span class="peta-zone-n">' + (counts[id] || 0) + '</span>'
        + '</button>';
    }).join('');
    var cara = this.el.querySelector('[data-peta-cara]');
    if (cara) {
      if (this.zoneFilter && ZONE[this.zoneFilter]) {
        cara.hidden = false;
        cara.textContent = ZONE[this.zoneFilter].cara;
      } else {
        cara.hidden = true;
        cara.textContent = '';
      }
    }
  };

  PetaController.prototype.applyZoneFilter = function (silent) {
    var counts = { baru_laku: 0, pemain_lama: 0, baru_belum: 0, mulai_sepi: 0 };
    this.points.forEach(function (p) { counts[p.zone] = (counts[p.zone] || 0) + 1; });
    this.renderZones(counts);
    if (!silent) {
      var id = this.zoneFilter;
      var list = null;
      if (id && id.indexOf('group:') === 0) {
        var tok = id.slice(6);
        list = this.points.filter(function (p) { return p.group === tok; }).map(function (p) { return p.listing; });
      } else if (id) {
        list = this.points.filter(function (p) { return p.zone === id; }).map(function (p) { return p.listing; });
      }
      if (this.opts.onZoneFilter) this.opts.onZoneFilter(id, list);
      this.renderList();
      this.draw();
    }
  };

  PetaController.prototype.renderList = function () {
    var box = this.el.querySelector('[data-peta-rows]');
    if (!box || !this.showList) return;
    var rows = this.visiblePoints();
    var wide = this.root && this.root.classList.contains('is-wide');
    var cap = (!wide && !this.listExpanded) ? LIST_CAP : rows.length;
    var shown = rows.slice(0, cap);
    var pending = this.batchStatus;
    box.innerHTML = shown.map(function (p) {
      var L = p.listing;
      var img = L.image_url || '';
      var name = L.product_name || L.keyword || 'Produk';
      var shop = L.store_name || '';
      var units = Math.round(p.xUnits).toLocaleString('id-ID');
      var z = ZONE[p.zone];
      var cls = (p.momentum && p.momentum.momentum_class) || 'belum';
      var mom = momMark(p.momentum) + momWord(p.momentum, pending);
      var sidik = p.score ? sidikJariHtml(p.score) : '';
      return '<button type="button" class="peta-row" data-k="' + esc(p.key) + '">'
        + (img
          ? '<img class="peta-row-img" src="' + esc(img) + '" alt="" loading="lazy" decoding="async" width="48" height="48">'
          : '<span class="peta-row-ph" aria-hidden="true"></span>')
        + '<span class="peta-row-body">'
        +   '<span class="peta-row-name">' + esc(name) + '</span>'
        +   (shop ? '<span class="peta-row-shop">' + esc(shop) + '</span>' : '')
        +   '<span class="peta-row-meta">~' + units + '/mgg · ' + esc(fmtRp(p.sizeOmset))
        +     (z ? ' · ' + esc(z.label) : '') + '</span>'
        +   '<span class="peta-row-tags">'
        +     '<span class="peta-mom peta-mom-' + esc(cls) + '">' + esc(mom) + '</span>'
        +     '<span class="peta-tag">' + (p.terukur ? 'terukur' : 'perkiraan') + '</span>'
        +     (p.isAd ? '<span class="peta-tag peta-tag-ad">iklan</span>' : '')
        +     (p.score ? '<span class="peta-row-sidik">' + sidik + '<span class="peta-row-score">' + p.score.total + '</span></span>' : '')
        +   '</span>'
        + '</span>'
        + '</button>';
    }).join('');
    var head = this.el.querySelector('[data-peta-lhead]');
    if (head) {
      var zlab = this.zoneFilter && ZONE[this.zoneFilter] ? ZONE[this.zoneFilter].label : '';
      head.innerHTML = '<span>' + rows.length + ' produk'
        + (zlab ? ' · ' + esc(zlab) : '') + '</span>'
        + (this.zoneFilter
          ? '<button type="button" class="peta-clear" data-peta-clear aria-label="Hapus filter zona">×</button>'
          : '');
    }
    var more = this.el.querySelector('[data-peta-more]');
    if (more) {
      if (!wide && !this.listExpanded && rows.length > LIST_CAP) {
        more.hidden = false;
        more.textContent = 'Lihat semua ' + rows.length + ' produk';
      } else {
        more.hidden = true;
      }
    }
    this.syncRowHl();
  };

  PetaController.prototype.syncRowHl = function () {
    var box = this.el.querySelector('[data-peta-rows]');
    if (!box) return;
    var hk = this.hover ? this.hover.key : '';
    var sk = this.selected ? this.selected.key : '';
    var scrolled = false;
    box.querySelectorAll('[data-k]').forEach(function (el) {
      var k = el.getAttribute('data-k');
      el.classList.toggle('is-hl', k === hk && k !== sk);
      el.classList.toggle('is-sel', k === sk);
      if (!scrolled && (k === sk || (!sk && k === hk))) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        scrolled = true;
      }
    });
  };

  PetaController.prototype.selectKey = function (k, open) {
    var hit = this.pointByKey(k);
    this.selected = hit;
    this.hover = hit;
    if (open && hit && this.opts.onDotOpen) {
      this.sheet = null;
      this.renderSheet();
      this.opts.onDotOpen(hit.listing);
    } else {
      this.sheet = hit;
      this.renderSheet();
    }
    this.syncRowHl();
    if (this.opts.onHighlight) this.opts.onHighlight(hit ? hit.listing : null);
    this.draw();
  };

  PetaController.prototype.sizeCanvas = function () {
    var wrap = this.el.querySelector('.peta-canvas-wrap');
    if (!wrap || !this.canvas) return { w: 0, h: 0 };
    var r = wrap.getBoundingClientRect();
    var dpr = Math.min(w.devicePixelRatio || 1, 2);
    var width = Math.max(1, Math.round(r.width));
    var height = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: width, h: height };
  };

  PetaController.prototype.activePoints = function () {
    if (this.mode !== 'jejak' || !this.batch || !this.batch.weeks) return this.points;
    var week = this.batch.weeks[this.frame];
    if (!this._frozenZones) this._frozenZones = { medianX: this._zones.medianX };
    return this.points.map(function (p) {
      var fr = p.frames[week];
      if (!fr) return null;
      var listing = p.listing;
      var age = ageDays(listing, week);
      return Object.assign({}, p, {
        xUnits: Number(fr.units_wk) || 0,
        yNew: yNewFrom(fr.reviews, age, listing),
        sizeOmset: (Number(fr.omset_wk) || 0) * 4.3,
        terukur: fr.source === 'measured',
        frameSource: fr.source
      });
    }).filter(Boolean);
  };

  PetaController.prototype.draw = function () {
    if (!this.canvas || !this.ctx) return;
    var sz = this.sizeCanvas();
    if (!sz.w) return;
    var ctx = this.ctx;
    ctx.clearRect(0, 0, sz.w, sz.h);
    if (!this.points.length || this.thin) return;
    var langit = this.mode === 'langit';
    var pts = this.mode === 'jejak' ? this.activePoints() : this.points;
    var medX = (this.mode === 'jejak' && this._frozenZones) ? this._frozenZones.medianX : this._zones.medianX;
    this._layout = layoutPoints(pts, sz.w, sz.h);
    this._layout.medX = medX;
    if (this.mode === 'jejak') this.drawTrails(ctx, sz, medX);
    this.drawGrid(ctx, sz, medX);
    if (langit) this.drawConstellations(ctx, pts);
    var dim = this.zoneFilter;
    var t = this.t0 || 0;
    pts.forEach(function (p) {
      var fade = false;
      if (dim && dim.indexOf('group:') === 0) fade = p.group !== dim.slice(6);
      else if (dim) fade = p.zone !== dim;
      this.drawDot(ctx, p, fade ? 0.25 : 1, langit, t);
    }, this);
    var focus = this.selected || this.hover;
    if (this.hover && this.selected && this.hover.key !== this.selected.key) {
      this.drawFocus(ctx, this.hover, sz, false);
    }
    if (focus) this.drawFocus(ctx, this.selected || this.hover, sz, !!this.selected);
  };

  PetaController.prototype.drawGrid = function (ctx, sz, medX) {
    var lay = this._layout;
    if (!lay) return;
    var p98 = lay.p98 || 1;
    var xMid = PAD.l + (Math.log10(medX + 1) / Math.log10(p98 + 1)) * lay.innerW;
    var yCut = lay.yCut;
    ctx.save();
    if (this.zoneFilter && ZONE[this.zoneFilter] && yCut != null) {
      var yMidZ = PAD.t + (1 - yCut) * lay.innerH;
      var z = this.zoneFilter;
      var x0 = z === 'baru_belum' || z === 'mulai_sepi' ? PAD.l : xMid;
      var x1 = z === 'baru_belum' || z === 'mulai_sepi' ? xMid : sz.w - PAD.r;
      var y0 = z === 'baru_belum' || z === 'baru_laku' ? PAD.t : yMidZ;
      var y1 = z === 'baru_belum' || z === 'baru_laku' ? yMidZ : sz.h - PAD.b;
      ctx.fillStyle = this.mode === 'langit' ? 'rgba(201,151,75,.08)' : 'rgba(201,151,75,.10)';
      ctx.fillRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    }
    ctx.strokeStyle = this.mode === 'langit' ? 'rgba(245,239,224,.12)' : 'rgba(26,26,26,.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xMid, PAD.t); ctx.lineTo(xMid, sz.h - PAD.b);
    if (yCut != null) {
      var yMid = PAD.t + (1 - yCut) * lay.innerH;
      ctx.moveTo(PAD.l, yMid); ctx.lineTo(sz.w - PAD.r, yMid);
    }
    ctx.stroke();
    ctx.restore();
    this.drawTicks(ctx, sz, p98, lay);
  };

  PetaController.prototype.drawTicks = function (ctx, sz, p98, lay) {
    var ticks = [1, 10, 100, 1000];
    ctx.save();
    ctx.fillStyle = this.mode === 'langit' ? 'rgba(245,239,224,.45)' : '#6B7280';
    ctx.font = '600 10px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ticks.forEach(function (t) {
      if (t > p98 * 1.15) return;
      var xv = Math.log10(t + 1) / Math.log10(p98 + 1);
      var x = PAD.l + xv * lay.innerW;
      var label = t >= 1000 ? (t / 1000) + 'rb' : String(t);
      ctx.fillText(label, x, sz.h - 10);
    });
    ctx.restore();
  };

  PetaController.prototype.drawDot = function (ctx, p, alpha, langit, t) {
    var cls = (p.momentum && p.momentum.momentum_class) || 'belum';
    var col = MOM_CLR[cls] || MOM_CLR.belum;
    var simple = this.mode === 'peluang';
    ctx.save();
    ctx.globalAlpha = alpha;
    if (langit) {
      var q = clamp(p.xUnits, 0, 1e9);
      var bright = 0.35 + 0.65 * clamp(Math.log10(q + 1) / 3, 0, 1);
      if (cls === 'naik' && !reduced()) bright += 0.2 * Math.sin((t / 2200) * Math.PI * 2 + (p.px || 0));
      ctx.globalAlpha = alpha * clamp(bright, 0.2, 1);
      if (cls === 'turun') {
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.r + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(220,38,38,' + (0.12 + (reduced() ? 0 : 0.06 * Math.sin(t / 1800))) + ')';
        ctx.fill();
      }
      starGlyph(ctx, p.px, p.py, p.r);
      if (p.terukur) { ctx.fillStyle = col; ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
      var ad = ageDays(p.listing);
      var med = this._zones.medianX;
      if (ad != null && ad < 90 && p.xUnits >= med) {
        ctx.beginPath();
        ctx.arc(p.px, p.py, p.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = EMAS;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    } else if (simple) {
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r, 0, Math.PI * 2);
      if (p.terukur) {
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = DOT;
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = DOT;
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = DOT;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r, 0, Math.PI * 2);
      if (p.terukur) { ctx.fillStyle = col; ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.fillStyle = 'transparent'; ctx.stroke(); }
    }
    ctx.restore();
  };

  PetaController.prototype.drawFocus = function (ctx, p, sz, selected) {
    if (!p || p.px == null) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.px, p.py, p.r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = EMAS;
    ctx.lineWidth = selected ? 3 : 2;
    ctx.stroke();
    var raw = String(p.listing.product_name || p.listing.keyword || '');
    var name = raw.length > 28 ? raw.slice(0, 27) + '…' : raw;
    if (!name) { ctx.restore(); return; }
    ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
    var tw = ctx.measureText(name).width;
    var pw = tw + 14;
    var ph = 20;
    var px = clamp(p.px - pw / 2, 4, sz.w - pw - 4);
    var py = p.py - p.r - 10 - ph;
    if (py < 4) py = p.py + p.r + 10;
    if (py + ph > sz.h - 4) py = clamp(p.py - p.r - 10 - ph, 4, sz.h - ph - 4);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(26,26,26,.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 8);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1A1A1A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, px + 7, py + ph / 2);
    ctx.restore();
  };

  PetaController.prototype.drawTrails = function (ctx, sz, medX) {
    if (!this.batch || !this.batch.weeks) return;
    var weeks = this.batch.weeks;
    var k = this.frame;
    var from = Math.max(0, k - 2);
    this.points.forEach(function (p) {
      var path = [];
      for (var i = from; i <= k; i++) {
        var fr = p.frames[weeks[i]];
        if (!fr) continue;
        path.push(Object.assign({}, p, {
          xUnits: Number(fr.units_wk) || 0,
          yNew: yNewFrom(fr.reviews, ageDays(p.listing, weeks[i]), p.listing),
          sizeOmset: p.sizeOmset
        }));
      }
      if (path.length < 2) return;
      layoutPoints(path, sz.w, sz.h);
      ctx.save();
      var col = MOM_CLR[(p.momentum && p.momentum.momentum_class) || 'belum'];
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      path.forEach(function (pt, idx) {
        ctx.globalAlpha = 0.15 + (idx / (path.length - 1)) * 0.45;
        if (idx === 0) ctx.moveTo(pt.px, pt.py); else ctx.lineTo(pt.px, pt.py);
      });
      ctx.stroke();
      ctx.restore();
    });
    if (isPhone() && !this.playing && k === weeks.length - 1) this.drawPhoneArrows(ctx, sz, medX);
  };

  PetaController.prototype.drawPhoneArrows = function (ctx, sz, medX) {
    var weeks = this.batch.weeks;
    var k = this.frame;
    var k0 = Math.max(0, k - 3);
    var ranked = this.points.map(function (p) {
      var a = p.frames[weeks[k0]], b = p.frames[weeks[k]];
      if (!a || !b) return null;
      return { p: p, d: Math.abs((Number(b.units_wk) || 0) - (Number(a.units_wk) || 0)) };
    }).filter(Boolean).sort(function (a, b) { return b.d - a.d; }).slice(0, 8);
    ranked.forEach(function (row) {
      var p = row.p;
      var a = Object.assign({}, p, { xUnits: Number(p.frames[weeks[k0]].units_wk) || 0, yNew: p.yNew });
      var b = Object.assign({}, p, { xUnits: Number(p.frames[weeks[k]].units_wk) || 0, yNew: p.yNew });
      layoutPoints([a, b], sz.w, sz.h);
      ctx.save();
      ctx.strokeStyle = MOM_CLR[(p.momentum && p.momentum.momentum_class) || 'belum'];
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
      ctx.restore();
    });
  };

  PetaController.prototype.drawConstellations = function (ctx, pts) {
    var cons = buildConstellations(pts, this.opts.query);
    this._cons = cons;
    ctx.save();
    ctx.strokeStyle = 'rgba(245,239,224,.25)';
    ctx.lineWidth = 1;
    cons.forEach(function (c) {
      mstEdges(c.members).forEach(function (e) {
        var a = c.members[e.a], b = c.members[e.b];
        ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
      });
      var cx = 0, cy = 0;
      c.members.forEach(function (m) { cx += m.px; cy += m.py; });
      cx /= c.members.length; cy /= c.members.length;
      ctx.fillStyle = 'rgba(245,239,224,.7)';
      ctx.font = '700 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.token, cx, cy - 8);
    });
    ctx.restore();
  };

  PetaController.prototype.hit = function (x, y) {
    var pts = this.mode === 'jejak' ? this.activePoints() : this.points;
    var best = null, bestD = 1e9;
    pts.forEach(function (p) {
      var dx = p.px - x, dy = p.py - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < p.r + 8 && d < bestD) { bestD = d; best = p; }
    });
    if (!best && this.mode === 'langit' && this._cons) {
      for (var i = 0; i < this._cons.length; i++) {
        var c = this._cons[i];
        var cx = 0, cy = 0;
        c.members.forEach(function (m) { cx += m.px; cy += m.py; });
        cx /= c.members.length; cy /= c.members.length;
        if (Math.abs(cx - x) < 40 && Math.abs(cy - 10 - y) < 16) {
          return { constellation: c };
        }
      }
    }
    return best;
  };

  PetaController.prototype.onPointer = function (e, click) {
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var hit = this.hit(x, y);
    if (hit && hit.constellation) {
      if (click) {
        this.zoneFilter = 'group:' + hit.constellation.token;
        this.applyZoneFilter();
      }
      return;
    }
    if (click) {
      this.selectKey(hit ? hit.key : null, false);
      if (!hit) {
        this.selected = null;
        this.sheet = null;
        this.renderSheet();
        this.syncRowHl();
        this.draw();
      }
      return;
    }
    this.hover = hit;
    this.syncRowHl();
    if (this.opts.onHighlight) this.opts.onHighlight(hit ? hit.listing : null);
    this.draw();
  };

  PetaController.prototype.renderSheet = function () {
    var box = this.el.querySelector('.peta-sheet');
    if (!box) return;
    var p = this.sheet;
    if (!p) { box.hidden = true; return; }
    var L = p.listing;
    var units = Math.round(p.xUnits);
    var tag = p.terukur ? 'terukur' : 'perkiraan';
    var ad = ageDays(L);
    var umur = ad != null ? (ad < 45 ? ad + ' hari' : Math.round(ad / 30) + ' bulan') : '—';
    var score = p.score;
    var z = ZONE[p.zone];
    box.hidden = false;
    box.innerHTML =
      '<button type="button" class="peta-sheet-x" data-close>×</button>'
      + '<p class="peta-sheet-name">' + esc((L.product_name || '').slice(0, 80)) + '</p>'
      + '<p class="peta-sheet-shop">' + esc(L.store_name || '') + '</p>'
      + '<div class="peta-sheet-rows">'
      + (z ? esc(z.label) + '<br>' : '')
      + 'Harga ' + fmtRp(L.price || 0) + '<br>'
      + '~' + units.toLocaleString('id-ID') + ' terjual/minggu (' + tag + ')<br>'
      + 'omset/bulan ' + fmtRp(p.sizeOmset) + '<br>'
      + 'umur ' + umur + ' · ' + (L.reviews || 0) + ' ulasan<br>'
      + 'iklan: ' + (p.isAd ? 'ya' : 'tidak') + '<br>'
      + 'momentum: ' + esc(momWord(p.momentum, this.batchStatus)) + '<br>'
      + (score ? ('skor ' + score.total + ' ' + sidikJariHtml(score)) : '')
      + '</div>'
      + '<button type="button" class="peta-sheet-btn" data-open>Buka produk</button>';
    var self = this;
    box.querySelector('[data-close]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      self.sheet = null;
      self.selected = null;
      box.hidden = true;
      self.syncRowHl();
      self.draw();
    });
    box.querySelector('[data-open]').addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (self.opts.onDotOpen) self.opts.onDotOpen(L);
    });
  };

  PetaController.prototype.updateJejakChrome = function () {
    if (!this.batch || !this.batch.weeks) return;
    var week = this.batch.weeks[this.frame];
    var pts = this.activePoints();
    var nM = pts.filter(function (p) { return p.frameSource === 'measured'; }).length;
    var cap = this.el.querySelector('[data-peta-jcap]');
    var scrapes = (this.batch.scrapes || []).map(fmtDay).join(', ');
    if (cap) {
      cap.hidden = false;
      cap.innerHTML = 'Minggu ' + fmtDay(week) + ' · ' + nM + ' dari ' + pts.length + ' titik terukur'
        + '<br>Scrape: ' + (scrapes || '—') + ' · minggu tanpa scrape = perkiraan';
    }
    var weeks = this.batch.weeks;
    var prev = this.frame > 0 ? weeks[this.frame - 1] : null;
    var rows = [];
    if (prev) {
      this.points.forEach(function (p) {
        var a = p.frames[prev], b = p.frames[week];
        if (!a || !b) return;
        var za = zoneId(isBaruRule(a.reviews, ageDays(p.listing, prev)), a.units_wk >= this._zones.medianX);
        var zb = zoneId(isBaruRule(b.reviews, ageDays(p.listing, week)), b.units_wk >= this._zones.medianX);
        if (za !== zb) {
          rows.push({ p: p, from: ZONE[za].label, to: ZONE[zb].label, u: Number(b.units_wk) || 0 });
        }
      }, this);
    }
    rows.sort(function (a, b) { return b.u - a.u; });
    rows = rows.slice(0, 8);
    var box = this.el.querySelector('[data-peta-moves]');
    if (!box) return;
    box.hidden = !rows.length;
    if (!rows.length) return;
    var self = this;
    box.innerHTML = '<h4>Yang pindah zona</h4>' + rows.map(function (r) {
      var name = esc((r.p.listing.product_name || '').slice(0, 42));
      return '<button type="button" class="peta-move" data-k="' + esc(r.p.key) + '">'
        + name + ': ' + esc(r.from) + ' → ' + esc(r.to) + ' (minggu ' + fmtDay(week) + ')</button>';
    }).join('');
    box.querySelectorAll('[data-k]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.selectKey(btn.getAttribute('data-k'), true);
      });
    });
  };

  PetaController.prototype.needsAnim = function () {
    if (reduced()) return false;
    if (this.mode === 'langit' && this._inView && this.points.some(function (p) {
      var c = p.momentum && p.momentum.momentum_class;
      return c === 'naik' || c === 'turun';
    })) return true;
    return this.mode === 'jejak' && this.playing && !isPhone();
  };

  PetaController.prototype.ensureRaf = function () {
    if (this.raf || !this.needsAnim()) return;
    var self = this;
    var tick = function (ts) {
      self.t0 = ts;
      if (self.mode === 'jejak' && self.playing) {
        if (!self._playLast) self._playLast = ts;
        if (ts - self._playLast > 700) {
          self._playLast = ts;
          var max = (self.batch && self.batch.weeks && self.batch.weeks.length) ? self.batch.weeks.length - 1 : 7;
          self.frame = self.frame >= max ? 0 : self.frame + 1;
          var scr = self.el.querySelector('[data-peta-scrub]');
          if (scr) scr.value = String(self.frame);
          self.updateJejakChrome();
        }
      }
      self.draw();
      if (self.needsAnim()) self.raf = requestAnimationFrame(tick);
      else self.raf = 0;
    };
    this.raf = requestAnimationFrame(tick);
  };

  PetaController.prototype.openFullscreen = function () {
    var overlay = document.createElement('div');
    overlay.className = 'peta-fs-overlay';
    overlay.innerHTML = '<button type="button" class="peta-sheet-btn" style="margin:12px;width:auto">Tutup</button>';
    var host = document.createElement('div');
    host.style.flex = '1';
    overlay.appendChild(host);
    document.body.appendChild(overlay);
    var ctl = new PetaController(host, this.listings, Object.assign({}, this.opts, { list: false }));
    ctl.batch = this.batch;
    ctl.batchStatus = this.batchStatus;
    ctl.setMode('langit');
    overlay.querySelector('button').addEventListener('click', function () {
      ctl.destroy();
      overlay.remove();
    });
  };

  PetaController.prototype.fetchBatch = function () {
    var self = this;
    var sb = this.opts.supabase;
    if (!sb || !this.listings.length) {
      this.batchStatus = 'missing';
      this.renderList();
      return;
    }
    if (sessionStorage.getItem(SS_BATCH) === '1') {
      this.batchStatus = 'missing';
      this.syncModeChrome();
      this.renderList();
      return;
    }
    this.batchStatus = 'pending';
    var keys = this.listings.slice(0, 200).map(function (p) {
      return { item_id: p.item_id, shop_id: p.shop_id };
    });
    var t = setTimeout(function () { fail(); }, 8000);
    function fail() {
      clearTimeout(t);
      try { sessionStorage.setItem(SS_BATCH, '1'); } catch (_) {}
      self.batch = null;
      self.batchStatus = 'missing';
      self.syncModeChrome();
      self.renderList();
    }
    sb.rpc('peta_batch', { p_keys: keys, p_weeks: 8 }).then(function (res) {
      clearTimeout(t);
      if (res.error) { fail(); return; }
      self.batch = res.data || null;
      self.batchStatus = self.batch ? 'ok' : 'missing';
      self.rebuild();
    }, fail);
  };

  function mount(containerEl, listings, opts) {
    if (!containerEl) return null;
    if (containerEl._petaCtl) {
      containerEl._petaCtl.opts = opts || containerEl._petaCtl.opts;
      containerEl._petaCtl.showList = (containerEl._petaCtl.opts.list !== false);
      containerEl._petaCtl.update(listings);
      return containerEl._petaCtl;
    }
    var ctl = new PetaController(containerEl, listings, opts || {});
    containerEl._petaCtl = ctl;
    return {
      update: function (list) { ctl.update(list); },
      setMode: function (m) { ctl.setMode(m); },
      destroy: function () { ctl.destroy(); containerEl._petaCtl = null; }
    };
  }

  w.PetaPeluang = {
    mount: mount,
    skeleton: skeleton,
    calcListingScore: calcListingScore,
    calcLarisScore: calcLarisScore,
    sidikJariHtml: sidikJariHtml,
    keyOf: keyOf
  };
})(window);
