/* Peta Peluang — listing scatter above product search. No chart library. */
(function (w) {
  'use strict';

  var LS_COLLAPSE = 'larisid_peta_collapsed';
  var LS_MODE = 'larisid_peta_mode';
  var SS_BATCH = 'larisid_peta_batch_missing';
  var MIN_POINTS = 8;
  var MAX_DRAW = 80;
  var PAD = { t: 28, r: 18, b: 28, l: 36 };

  var ZONE = {
    baru_laku:   { id: 'baru_laku',   label: 'Baru tapi Laku',     cara: 'Masih baru, tapi udah laku. Kalau banyak titik di sini, pemula masih bisa masuk. Contek harga & fotonya.' },
    pemain_lama: { id: 'pemain_lama', label: 'Pemain Lama',        cara: 'Udah lama dan besar. Jangan lawan langsung, cari celah harga atau varian yang mereka nggak punya.' },
    baru_belum:  { id: 'baru_belum',  label: 'Baru, Belum Jalan',  cara: 'Baru masuk, belum laku. Bukan berarti gagal, cek dulu harga atau fotonya yang kalah.' },
    mulai_sepi:  { id: 'mulai_sepi',  label: 'Mulai Sepi',         cara: 'Udah lama tapi pelan. Pasarnya mungkin geser, lihat Jejak Waktu.' }
  };
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
  function momWord(m) {
    if (!m || m.momentum_class === 'belum') return 'belum cukup data';
    var pct = Math.round(Number(m.momentum_pct) || 0);
    var core = m.momentum_class === 'naik' ? ('naik +' + pct + '%')
      : m.momentum_class === 'turun' ? ('turun ' + pct + '%')
      : 'stabil';
    var terukur = m.cur_source === 'measured' && m.prev_source === 'measured';
    return terukur ? core : core + ' (perkiraan)';
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
    var baruYs = points.filter(function (p) { return p.isBaru; }).map(function (p) { return p.yNew; });
    var lamaYs = points.filter(function (p) { return !p.isBaru; }).map(function (p) { return p.yNew; });
    var yCut = 0.5;
    if (baruYs.length && lamaYs.length) {
      var minBaru = Math.min.apply(null, baruYs);
      var maxLama = Math.max.apply(null, lamaYs);
      yCut = (minBaru + maxLama) / 2;
    } else if (baruYs.length) yCut = Math.min.apply(null, baruYs);
    points.forEach(function (p) {
      p.ramai = p.xUnits >= medianX;
      p.zone = zoneId(p.isBaru, p.ramai);
    });
    return { medianX: medianX, yCut: yCut };
  }

  function layoutPoints(points, wdt, hgt, medianX) {
    var p98 = pctile(points.map(function (p) { return p.xUnits; }), 0.98) || 1;
    var p95om = pctile(points.map(function (p) { return p.sizeOmset; }), 0.95) || 1;
    var phone = isPhone();
    var innerW = Math.max(40, wdt - PAD.l - PAD.r);
    var innerH = Math.max(40, hgt - PAD.t - PAD.b);
    points.forEach(function (p) {
      var pinned = p.xUnits > p98;
      var xv = Math.log10((pinned ? p98 : p.xUnits) + 1) / Math.log10(p98 + 1);
      p.px = PAD.l + xv * innerW;
      p.py = PAD.t + (1 - p.yNew) * innerH;
      p.pinned = pinned;
      var r = 4 + 12 * Math.sqrt((p.sizeOmset || 0) / p95om);
      p.r = clamp(r, phone ? 4 : 5, phone ? 16 : 22);
    });
    return { p98: p98, innerW: innerW, innerH: innerH };
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

  function PetaController(el, listings, opts) {
    this.el = el;
    this.opts = opts || {};
    this.listings = listings || [];
    this.batch = null;
    this.points = [];
    this.hidden = [];
    this.mode = 'peluang';
    try { this.mode = localStorage.getItem(LS_MODE) || 'peluang'; } catch (_) {}
    if (this.mode !== 'jejak' && this.mode !== 'langit') this.mode = 'peluang';
    this.collapsed = false;
    try { this.collapsed = localStorage.getItem(LS_COLLAPSE) === '1'; } catch (_) {}
    this.zoneFilter = null;
    this.hover = null;
    this.sheet = null;
    this.frame = 0;
    this.playing = false;
    this.raf = 0;
    this.t0 = 0;
    this._ro = null;
    this._io = null;
    this._inView = true;
    this._frozenZones = null;
    this.renderShell();
    this.rebuild();
    this.fetchBatch();
  }

  PetaController.prototype.destroy = function () {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this._ro) try { this._ro.disconnect(); } catch (_) {}
    if (this._io) try { this._io.disconnect(); } catch (_) {}
    this.el.innerHTML = '';
  };

  PetaController.prototype.update = function (listings) {
    this.listings = listings || [];
    this.rebuild();
    this.fetchBatch();
  };

  PetaController.prototype.setMode = function (mode) {
    if (mode === 'jejak' && !this.batch) return;
    this.mode = mode;
    try { localStorage.setItem(LS_MODE, mode); } catch (_) {}
    this.playing = false;
    this.sheet = null;
    this.renderShell();
    this.rebuild();
    this.draw();
    this.ensureRaf();
  };

  PetaController.prototype.renderShell = function () {
    var q = this.opts.query || '';
    var n = this.listings.length;
    var langit = this.mode === 'langit';
    this.el.innerHTML =
      '<div class="peta-root' + (langit ? ' is-langit' : '') + (this.collapsed ? ' is-collapsed' : '') + '">'
      + '<div class="peta-head">'
      +   '<div class="peta-titles">'
      +     '<h3 class="peta-title">Peta Peluang' + (q ? ': ' + esc(q) : '') + '</h3>'
      +     '<p class="peta-sub" data-peta-sub></p>'
      +   '</div>'
      +   '<button type="button" class="peta-chevron" data-peta-collapse aria-label="Lipat peta">▾</button>'
      + '</div>'
      + '<p class="peta-collapsed-line" data-peta-collapsed></p>'
      + '<div class="peta-body">'
      +   '<div class="peta-chips">'
      +     '<button type="button" class="peta-chip" data-mode="peluang">Peluang</button>'
      +     '<button type="button" class="peta-chip" data-mode="jejak">Jejak Waktu</button>'
      +     '<button type="button" class="peta-chip" data-mode="langit">Langit</button>'
      +   '</div>'
      +   '<div class="peta-stage">'
      +     '<div class="peta-canvas-wrap">'
      +       '<canvas class="peta-canvas"></canvas>'
      +       '<div class="peta-axis-y">Masih baru ↑ · Sudah lama ↓</div>'
      +       '<div class="peta-axis-x">Sepi ← Laku per minggu → Ramai</div>'
      +       '<button type="button" class="peta-zone-lab peta-zone-tl" data-zone="baru_belum">Baru, Belum Jalan</button>'
      +       '<button type="button" class="peta-zone-lab peta-zone-tr" data-zone="baru_laku">Baru tapi Laku</button>'
      +       '<button type="button" class="peta-zone-lab peta-zone-bl" data-zone="mulai_sepi">Mulai Sepi</button>'
      +       '<button type="button" class="peta-zone-lab peta-zone-br" data-zone="pemain_lama">Pemain Lama</button>'
      +       '<div class="peta-sheet" hidden></div>'
      +     '</div>'
      +   '</div>'
      +   '<p class="peta-legend"></p>'
      +   '<p class="peta-summary" data-peta-summary></p>'
      +   '<button type="button" class="peta-sepi-chip" hidden data-peta-sepi></button>'
      +   '<div class="peta-jejak-cap" hidden data-peta-jcap></div>'
      +   '<div class="peta-jejak-ctrl" hidden data-peta-jctrl>'
      +     '<button type="button" class="peta-play" data-peta-play>▶</button>'
      +     '<input type="range" min="0" max="7" value="7" data-peta-scrub>'
      +   '</div>'
      +   '<div class="peta-moves" hidden data-peta-moves></div>'
      +   '<button type="button" class="peta-fs-btn" hidden data-peta-fs>Buka layar penuh</button>'
      +   '<details class="peta-cara"><summary>Cara baca</summary>'
      +     '<ol>'
      +       '<li>Makin ke kanan, makin laku minggu ini. Bulatan kosong = masih perkiraan.</li>'
      +       '<li>Makin ke atas, makin baru dan sedikit ulasan.</li>'
      +       '<li>Banyak titik di kanan-atas = pendatang bisa laku di sini. Kalau semua ngumpul di kanan-bawah, pasar dipegang pemain lama.</li>'
      +     '</ol>'
      +   '</details>'
      + '</div>'
      + '<div class="peta-empty" hidden></div>'
      + '</div>';
    this.root = this.el.querySelector('.peta-root');
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bindUi();
    this.syncChips();
    var self = this;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(function () { self.draw(); });
      this._ro.observe(this.el.querySelector('.peta-canvas-wrap'));
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this._io = new IntersectionObserver(function (ents) {
        self._inView = ents.some(function (e) { return e.isIntersecting; });
        if (self._inView && self.mode === 'langit') self.ensureRaf();
      }, { threshold: 0.05 });
      this._io.observe(this.el);
    }
  };

  PetaController.prototype.bindUi = function () {
    var self = this;
    this.el.querySelector('[data-peta-collapse]').addEventListener('click', function () {
      self.collapsed = !self.collapsed;
      try { localStorage.setItem(LS_COLLAPSE, self.collapsed ? '1' : '0'); } catch (_) {}
      self.root.classList.toggle('is-collapsed', self.collapsed);
      self.el.querySelector('[data-peta-collapse]').textContent = self.collapsed ? '▸' : '▾';
    });
    this.el.querySelectorAll('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.setMode(btn.getAttribute('data-mode')); });
    });
    this.el.querySelectorAll('[data-zone]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-zone');
        self.zoneFilter = self.zoneFilter === id ? null : id;
        self.applyZoneFilter();
      });
    });
    this.canvas.addEventListener('click', function (e) { self.onPointer(e, true); });
    this.canvas.addEventListener('mousemove', function (e) {
      if (!w.matchMedia || !w.matchMedia('(pointer:fine)').matches) return;
      self.onPointer(e, false);
    });
    this.canvas.addEventListener('mouseleave', function () {
      self.hover = null;
      if (self.opts.onHighlight) self.opts.onHighlight(null);
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
    var sepi = this.el.querySelector('[data-peta-sepi]');
    if (sepi) sepi.addEventListener('click', function () {
      if (self.opts.onZoneFilter) self.opts.onZoneFilter('sepi', self.hidden.map(function (p) { return p.listing; }));
    });
  };

  PetaController.prototype.syncChips = function () {
    var self = this;
    this.el.querySelectorAll('[data-mode]').forEach(function (btn) {
      var m = btn.getAttribute('data-mode');
      btn.classList.toggle('is-on', m === self.mode);
      if (m === 'jejak') {
        btn.disabled = !self.batch;
        btn.title = self.batch ? '' : 'Butuh riwayat mingguan';
      } else btn.disabled = false;
    });
    this.el.querySelector('[data-peta-jctrl]').hidden = this.mode !== 'jejak';
    this.el.querySelector('[data-peta-jcap]').hidden = this.mode !== 'jejak';
    this.el.querySelector('[data-peta-moves]').hidden = this.mode !== 'jejak';
    this.el.querySelector('[data-peta-fs]').hidden = this.mode !== 'langit';
    this.root.classList.toggle('is-langit', this.mode === 'langit');
    var leg = this.el.querySelector('.peta-legend');
    if (this.mode === 'langit') {
      leg.textContent = 'Mode eksplorasi · Terang = laku per minggu · Berkelip = naik · Merah redup = turun · Garis = produk serupa';
    } else {
      leg.textContent = 'Besar = omset/bulan · Penuh = terukur · Kosong = perkiraan · Hijau naik · Merah turun · Abu belum cukup data · Garis putus = pakai iklan';
    }
  };

  PetaController.prototype.rebuild = function () {
    var prepared = petaPrepare(this.listings, this.batch);
    var calc = this.opts.calcScore;
    if (calc) {
      prepared.forEach(function (p) {
        try { p.score = calc(p.listing); } catch (_) { p.score = null; }
      });
    }
    this._allPrepared = prepared;
    var usable = prepared.filter(function (p) { return p.xUnits != null && p.xUnits >= 0; });
    var empty = this.el.querySelector('.peta-empty');
    var body = this.el.querySelector('.peta-body');
    if (usable.length < MIN_POINTS) {
      if (body) body.hidden = true;
      empty.hidden = false;
      empty.textContent = 'Belum cukup data buat peta ini. Butuh minimal 8 produk yang penjualannya terukur. Coba kata kunci yang lebih umum, atau lihat daftar produk di bawah.';
      this.points = [];
      this.hidden = [];
      this.el.closest('.peta-dir-layout') && this.el.closest('.peta-dir-layout').classList.remove('has-peta');
      return;
    }
    empty.hidden = true;
    if (body) body.hidden = false;
    this.el.closest('.peta-dir-layout') && this.el.closest('.peta-dir-layout').classList.add('has-peta');
    this._zones = assignZones(usable);
    usable.sort(function (a, b) { return b.xUnits - a.xUnits; });
    this.hidden = usable.length > MAX_DRAW ? usable.slice(MAX_DRAW) : [];
    this.points = usable.slice(0, MAX_DRAW);
    if (this.mode === 'jejak' && this.batch && this.batch.weeks) {
      this.frame = (this.batch.weeks.length || 8) - 1;
      var scr = this.el.querySelector('[data-peta-scrub]');
      if (scr) { scr.max = String(this.batch.weeks.length - 1); scr.value = String(this.frame); }
    }
    this.updateChrome();
    this.draw();
    this.ensureRaf();
  };

  PetaController.prototype.updateChrome = function () {
    var n = this.points.length + this.hidden.length;
    var scrapes = (this.batch && this.batch.scrapes) || [];
    var lastScrape = scrapes.length ? scrapes[scrapes.length - 1] : null;
    var sub = this.el.querySelector('[data-peta-sub]');
    if (sub) {
      sub.textContent = n + ' produk · data ' + (lastScrape ? fmtDay(lastScrape) : 'mingguan')
        + ', disetarakan ke 7 hari'
        + (this.mode === 'langit' ? ' · Mode eksplorasi' : '');
    }
    var counts = { baru_laku: 0, pemain_lama: 0, baru_belum: 0, mulai_sepi: 0 };
    this.points.concat(this.hidden).forEach(function (p) { counts[p.zone] = (counts[p.zone] || 0) + 1; });
    var sum = this.el.querySelector('[data-peta-summary]');
    var ads = this.points.filter(function (p) { return p.isAd; }).length;
    var top10 = this.points.slice().sort(function (a, b) { return b.xUnits - a.xUnits; }).slice(0, 10);
    var adTop = top10.filter(function (p) { return p.isAd; }).length;
    if (sum) {
      sum.textContent = counts.baru_laku + ' dari ' + n + ' produk masih baru tapi sudah laku.'
        + (top10.length ? ' ' + adTop + ' dari ' + top10.length + ' terlaris pakai iklan.' : '');
    }
    var col = this.el.querySelector('[data-peta-collapsed]');
    if (col) {
      col.textContent = 'Peta Peluang: ' + counts.baru_laku + ' baru tapi laku · '
        + counts.pemain_lama + ' pemain lama · '
        + (counts.baru_belum + counts.mulai_sepi) + ' lainnya';
    }
    var sepi = this.el.querySelector('[data-peta-sepi]');
    if (sepi) {
      if (this.hidden.length) {
        sepi.hidden = false;
        sepi.textContent = '+' + this.hidden.length + ' produk sepi (di bawah median)';
      } else sepi.hidden = true;
    }
    this.syncChips();
    this.applyZoneFilter(true);
    if (this.mode === 'jejak') this.updateJejakChrome();
  };

  PetaController.prototype.applyZoneFilter = function (silent) {
    var self = this;
    this.el.querySelectorAll('[data-zone]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-zone') === self.zoneFilter);
    });
    if (silent) return;
    var id = this.zoneFilter;
    var list = null;
    if (id && id.indexOf('group:') === 0) {
      var tok = id.slice(6);
      list = this.points.filter(function (p) { return p.group === tok; }).map(function (p) { return p.listing; });
    } else if (id === 'sepi') {
      list = this.hidden.map(function (p) { return p.listing; });
    } else if (id) {
      list = this.points.concat(this.hidden).filter(function (p) { return p.zone === id; }).map(function (p) { return p.listing; });
    }
    if (this.opts.onZoneFilter) this.opts.onZoneFilter(id, list);
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
    var weeks = this.batch.weeks;
    var self = this;
    if (!this._frozenZones) this._frozenZones = { medianX: this._zones.medianX, yCut: this._zones.yCut };
    return this.points.map(function (p) {
      var fr = p.frames[week];
      if (!fr) return null;
      var listing = p.listing;
      var age = ageDays(listing, week);
      var y = yNewFrom(fr.reviews, age, listing);
      var x = Number(fr.units_wk) || 0;
      var c = Object.assign({}, p, {
        xUnits: x, yNew: y,
        sizeOmset: (Number(fr.omset_wk) || 0) * 4.3,
        terukur: fr.source === 'measured',
        frameSource: fr.source
      });
      return c;
    }).filter(Boolean);
  };

  PetaController.prototype.draw = function () {
    if (!this.canvas || !this.points.length) return;
    var sz = this.sizeCanvas();
    if (!sz.w) return;
    var ctx = this.ctx;
    var langit = this.mode === 'langit';
    ctx.clearRect(0, 0, sz.w, sz.h);
    var pts = this.mode === 'jejak' ? this.activePoints() : this.points;
    var medX = (this.mode === 'jejak' && this._frozenZones) ? this._frozenZones.medianX : this._zones.medianX;
    layoutPoints(pts, sz.w, sz.h, medX);
    if (this.mode === 'jejak') this.drawTrails(ctx, sz, medX);
    this.drawGrid(ctx, sz, medX);
    if (langit) this.drawConstellations(ctx, pts);
    var dim = this.zoneFilter;
    var t = this.t0 || 0;
    pts.forEach(function (p) {
      var fade = false;
      if (dim && dim.indexOf('group:') === 0) fade = p.group !== dim.slice(6);
      else if (dim) fade = p.zone !== dim;
      this.drawDot(ctx, p, fade ? 0.3 : 1, langit, t);
    }, this);
  };

  PetaController.prototype.drawGrid = function (ctx, sz, medX) {
    var p98 = pctile(this.points.map(function (p) { return p.xUnits; }), 0.98) || 1;
    var xMid = PAD.l + (Math.log10(medX + 1) / Math.log10(p98 + 1)) * Math.max(40, sz.w - PAD.l - PAD.r);
    var yCut = this._zones.yCut;
    var yMid = PAD.t + (1 - yCut) * Math.max(40, sz.h - PAD.t - PAD.b);
    ctx.save();
    ctx.strokeStyle = this.mode === 'langit' ? 'rgba(245,239,224,.12)' : 'rgba(26,26,26,.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xMid, PAD.t); ctx.lineTo(xMid, sz.h - PAD.b);
    ctx.moveTo(PAD.l, yMid); ctx.lineTo(sz.w - PAD.r, yMid);
    ctx.stroke();
    ctx.restore();
  };

  PetaController.prototype.drawDot = function (ctx, p, alpha, langit, t) {
    var cls = (p.momentum && p.momentum.momentum_class) || 'belum';
    var col = MOM_CLR[cls] || MOM_CLR.belum;
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
        ctx.strokeStyle = '#C9974B';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r, 0, Math.PI * 2);
      if (p.terukur) { ctx.fillStyle = col; ctx.fill(); }
      else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.fillStyle = 'transparent'; ctx.stroke(); }
      if (p.r >= 8 && (cls === 'naik' || cls === 'turun')) {
        ctx.fillStyle = col;
        ctx.font = '700 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cls === 'naik' ? '▲' : '▼', p.px, p.py - p.r - 2);
      }
    }
    if (p.isAd) {
      ctx.beginPath();
      ctx.arc(p.px, p.py, p.r + 3, 0, Math.PI * 2);
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.pinned) {
      ctx.fillStyle = col;
      ctx.font = '700 10px sans-serif';
      ctx.fillText('>', p.px + p.r + 2, p.py + 3);
    }
    ctx.restore();
  };

  PetaController.prototype.drawTrails = function (ctx, sz, medX) {
    if (!this.batch || !this.batch.weeks) return;
    var weeks = this.batch.weeks;
    var k = this.frame;
    var from = Math.max(0, k - 2);
    var self = this;
    this.points.forEach(function (p) {
      var path = [];
      for (var i = from; i <= k; i++) {
        var fr = p.frames[weeks[i]];
        if (!fr) continue;
        var clone = Object.assign({}, p, {
          xUnits: Number(fr.units_wk) || 0,
          yNew: yNewFrom(fr.reviews, ageDays(p.listing, weeks[i]), p.listing),
          sizeOmset: p.sizeOmset
        });
        path.push(clone);
      }
      if (path.length < 2) return;
      layoutPoints(path, sz.w, sz.h, medX);
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
      layoutPoints([a, b], sz.w, sz.h, medX);
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
      this.sheet = hit || null;
      this.renderSheet();
      return;
    }
    this.hover = hit;
    if (this.opts.onHighlight) this.opts.onHighlight(hit ? hit.listing : null);
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
    box.hidden = false;
    box.innerHTML =
      '<button type="button" class="peta-sheet-x" data-close>×</button>'
      + '<p class="peta-sheet-name">' + esc((L.product_name || '').slice(0, 80)) + '</p>'
      + '<p class="peta-sheet-shop">' + esc(L.store_name || '') + '</p>'
      + '<div class="peta-sheet-rows">'
      + 'Harga ' + fmtRp(L.price || 0) + '<br>'
      + '~' + units.toLocaleString('id-ID') + ' terjual/minggu (' + tag + ')<br>'
      + 'omset/bulan ' + fmtRp(p.sizeOmset) + '<br>'
      + 'umur ' + umur + ' · ' + (L.reviews || 0) + ' ulasan<br>'
      + 'iklan: ' + (p.isAd ? 'ya' : 'tidak') + '<br>'
      + 'momentum: ' + esc(momWord(p.momentum)) + '<br>'
      + (score ? ('skor ' + score.total + ' ' + sidikJariHtml(score)) : '')
      + '</div>'
      + '<button type="button" class="peta-sheet-btn" data-open>Buka produk</button>';
    var self = this;
    box.querySelector('[data-close]').addEventListener('click', function (ev) {
      ev.stopPropagation(); self.sheet = null; box.hidden = true;
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
    var tag = pts.length && (nM / pts.length) >= 0.5 ? 'terukur' : 'perkiraan';
    var cap = this.el.querySelector('[data-peta-jcap]');
    var scrapes = (this.batch.scrapes || []).map(fmtDay).join(', ');
    cap.hidden = false;
    cap.innerHTML = 'Minggu ' + fmtDay(week) + ' · ' + nM + ' dari ' + pts.length + ' titik terukur'
      + '<br>Scrape: ' + (scrapes || '—') + ' · minggu tanpa scrape = perkiraan';
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
        var hit = self.points.filter(function (p) { return p.key === btn.getAttribute('data-k'); })[0];
        if (hit && self.opts.onDotOpen) self.opts.onDotOpen(hit.listing);
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
    var ctl = new PetaController(host, this.listings, this.opts);
    ctl.batch = this.batch;
    ctl.setMode('langit');
    overlay.querySelector('button').addEventListener('click', function () {
      ctl.destroy();
      overlay.remove();
    });
  };

  PetaController.prototype.fetchBatch = function () {
    var self = this;
    var sb = this.opts.supabase;
    if (!sb || !this.listings.length) return;
    if (sessionStorage.getItem(SS_BATCH) === '1') {
      this.syncChips();
      return;
    }
    var keys = this.listings.slice(0, 200).map(function (p) {
      return { item_id: p.item_id, shop_id: p.shop_id };
    });
    var t = setTimeout(function () { fail(); }, 8000);
    function fail() {
      clearTimeout(t);
      try { sessionStorage.setItem(SS_BATCH, '1'); } catch (_) {}
      self.batch = null;
      self.syncChips();
    }
    sb.rpc('peta_batch', { p_keys: keys, p_weeks: 8 }).then(function (res) {
      clearTimeout(t);
      if (res.error) {
        var s = String(res.error.code || '') + ' ' + String(res.error.message || '');
        if (/42883|404|PGRST|does not exist|peta_batch/i.test(s)) fail();
        else fail();
        return;
      }
      self.batch = res.data || null;
      self.rebuild();
    }, fail);
  };

  function mount(containerEl, listings, opts) {
    if (!containerEl) return null;
    if (containerEl._petaCtl) {
      containerEl._petaCtl.opts = opts || containerEl._petaCtl.opts;
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
    calcListingScore: calcListingScore,
    calcLarisScore: calcLarisScore,
    sidikJariHtml: sidikJariHtml,
    keyOf: keyOf
  };
})(window);
