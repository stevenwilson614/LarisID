/**
 * laris-tracker.js — Favorit Aku (product favorites + optional toko).
 *
 * Host supplies an adapter. This module never touches _supabase / currentUser.
 *
 *   LarisTracker.mount({ hostId, site, adapter })
 *   LarisTracker.open({ touch })
 *   LarisTracker.openSetup({ seed })  // seed.item_id+shop_id → one-click add
 *   LarisTracker.summary() / .summaryCardHtml() / .bindSummary()
 */
(function (global) {
  'use strict';

  var LS_KEY = '_ltk_ui_v1';
  var WATCHDOG_MS = 8000;
  var MIN_WEEKS_FOR_PCT = 2;
  var TYPEAHEAD_MS = 280;
  var SCRAPE_HOUR_WIB = 7;
  var WIB_OFFSET_MIN = 7 * 60;
  var CHART_WEEKS = 13;
  var OMSET_SPIKE_PCT = 25;
  var MONS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul',
                    'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  var host = null;
  var adapter = null;
  var opts = {};
  var mounted = false;
  var bound = false;
  var inflight = null;
  var timers = { abort: 0, typeahead: 0, resize: 0 };
  var favCharts = [];

  var S = {
    screen: 'list',
    tab: 'product',
    configured: false,
    paused: false,
    products: [],
    stores: [],
    productLimit: 30,
    storeLimit: 20,
    notifyChannels: [],
    notifyWa: '',
    notifyAsked: false,
    notifyCadence: 'on_update',
    weeklyByKey: {},
    snapsByKey: {},
    addQ: '',
    addRows: [],
    addBusy: false,
    notifyMsg: '',
    emailOk: true,
    waReady: false,
    userEmail: '',
  };

  function esc(s) {
    if (adapter && typeof adapter.esc === 'function') return adapter.esc(s == null ? '' : s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function call(name, a, b) {
    try {
      if (adapter && typeof adapter[name] === 'function') return adapter[name].call(adapter, a, b);
    } catch (e) { warn(name + ' threw', e); }
    return undefined;
  }
  function callP(name, a, b) {
    try {
      if (!adapter || typeof adapter[name] !== 'function') return Promise.resolve(null);
      return Promise.resolve(adapter[name].call(adapter, a, b));
    } catch (e) { warn(name + ' threw', e); return Promise.resolve(null); }
  }
  function warn() {
    try { console.warn.apply(console, ['[LarisTracker]'].concat([].slice.call(arguments))); } catch (_) {}
  }
  function toast(msg) { call('toast', msg); }
  function fmtUnits(n) {
    var v = call('fmtUnits', n);
    return v == null ? String(Math.round(n || 0)) : v;
  }
  function fmtRp(n) {
    var v = call('fmtRp', n);
    return v == null ? 'Rp' + Math.round(n || 0) : v;
  }
  function fmtRpShort(n) {
    var v = call('fmtRpShort', n);
    if (v != null) return v;
    n = Number(n) || 0;
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.0', '') + ' jt';
    if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3) + 'rb';
    return fmtRp(n);
  }
  function $(sel) { return host ? host.querySelector(sel) : null; }

  function lsRead() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function lsWrite(patch) {
    try {
      var o = lsRead();
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) o[k] = patch[k];
      global.localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (_) {}
  }

  function wibNow() {
    var now = new Date();
    return new Date(now.getTime() + (WIB_OFFSET_MIN + now.getTimezoneOffset()) * 60000);
  }
  function nextUpdateLabel() {
    var w = wibNow();
    if (w.getHours() < SCRAPE_HOUR_WIB) return 'pagi ini';
    var t = new Date(w.getTime() + 86400000);
    var days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    var mons = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
                'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return 'besok pagi, ' + days[t.getDay()] + ' ' + t.getDate() + ' ' + mons[t.getMonth()];
  }

  function prodKey(p) {
    return (p && p.item_id != null && p.shop_id != null) ? (p.item_id + '|' + p.shop_id) : '';
  }

  function pctChange(cur, prev) {
    cur = Number(cur) || 0; prev = Number(prev) || 0;
    if (!prev) return null;
    return ((cur - prev) / prev) * 100;
  }

  function honestyLabel(source) {
    return source === 'measured' ? 'terukur' : 'perkiraan';
  }

  function weeklyFor(p) {
    return S.weeklyByKey[prodKey(p)] || [];
  }

  function wibTodayISO() {
    var w = wibNow();
    var m = String(w.getMonth() + 1);
    var d = String(w.getDate());
    if (m.length < 2) m = '0' + m;
    if (d.length < 2) d = '0' + d;
    return w.getFullYear() + '-' + m + '-' + d;
  }

  function wibMondayISO() {
    var w = wibNow();
    var dow = w.getDay();
    var off = dow === 0 ? 6 : dow - 1;
    var m = new Date(w.getFullYear(), w.getMonth(), w.getDate() - off);
    var mo = String(m.getMonth() + 1);
    var d = String(m.getDate());
    if (mo.length < 2) mo = '0' + mo;
    if (d.length < 2) d = '0' + d;
    return m.getFullYear() + '-' + mo + '-' + d;
  }

  function weekLabel(iso) {
    var ts = Date.parse(String(iso || '').slice(0, 10) + 'T00:00:00Z');
    if (!isNaN(ts)) {
      try {
        return new Date(ts).toLocaleDateString('id-ID', {
          day: 'numeric', month: 'short', timeZone: 'UTC',
        });
      } catch (_) { /* fall through */ }
    }
    var parts = String(iso || '').slice(0, 10).split('-');
    if (parts.length < 3) return '';
    var day = Number(parts[2]);
    var mon = Number(parts[1]) - 1;
    if (!day || mon < 0 || mon > 11) return '';
    return day + ' ' + MONS_SHORT[mon];
  }

  function rpTick(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'M';
    if (v >= 1e6) return Math.round(v / 1e6) + 'jt';
    if (v >= 1e3) return Math.round(v / 1e3) + 'rb';
    return v;
  }

  function normTitle(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function sortedWeeks(weeks) {
    return (weeks || []).filter(function (w) {
      var d = String(w.week_start || '').slice(0, 10);
      if (!d) return false;
      if (w.source === 'forecast') return false;
      return true;
    }).sort(function (a, b) {
      return String(a.week_start || '').localeCompare(String(b.week_start || ''));
    });
  }

  function weekPair(weeks) {
    var sorted = sortedWeeks(weeks);
    if (sorted.length < MIN_WEEKS_FOR_PCT) return null;
    return { prev: sorted[sorted.length - 2], cur: sorted[sorted.length - 1] };
  }

  function chartSeries(weeks) {
    var today = wibTodayISO();
    return sortedWeeks(weeks).filter(function (w) {
      var d = String(w.week_start || '').slice(0, 10);
      if (d > today) return false;
      if (w.source === 'prior') return false;
      var om = Number(w.omset_wk) || 0;
      var un = Number(w.units_wk) || 0;
      if (!om && !un && w.source !== 'measured') return false;
      return true;
    }).slice(-CHART_WEEKS);
  }

  function productTrend(p) {
    var pair = weekPair(weeklyFor(p));
    if (!pair) return { pct: null, enough: false, source: null };
    var bothMeasured = pair.cur.source === 'measured' && pair.prev.source === 'measured';
    return {
      pct: pctChange(pair.cur.omset_wk, pair.prev.omset_wk),
      enough: true,
      source: bothMeasured ? 'measured' : (pair.cur.source || 'estimated'),
      cur: pair.cur,
      prev: pair.prev,
    };
  }

  function deltaHtml(pct, enough) {
    if (!enough || pct == null || !isFinite(pct)) {
      return '<span class="ltk-delta is-flat">Baru</span>';
    }
    var up = pct >= 0;
    var cls = up ? 'is-up' : 'is-down';
    var arrow = up
      ? '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M6 2v8M3 5l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M6 10V2M3 7l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    return '<span class="ltk-delta ' + cls + '">' + arrow + Math.round(Math.abs(pct)) + '%</span>';
  }

  function imgOr(src, cls) {
    if (src) {
      return '<img class="' + cls + '" src="' + attr(src) + '" alt="" loading="lazy" decoding="async" width="56" height="56">';
    }
    return '<div class="' + cls + ' ltk-row-ico--letter" aria-hidden="true">P</div>';
  }

  function destroyCharts() {
    favCharts.forEach(function (c) { try { c.destroy(); } catch (_) {} });
    favCharts = [];
  }

  function yScaleFn(vals, top, height) {
    var min = 0;
    var max = Math.max.apply(null, vals.concat([0]));
    if (!isFinite(max) || max <= 0) max = 1;
    var span = max - min || 1;
    return function (v) { return top + height - ((Number(v) || 0) - min) / span * height; };
  }

  /** Canvas fallback when Chart.js is not available — same colors / points / fill. */
  function drawDualChartFallback(cv, weeks) {
    if (!cv || !cv.getContext) return;
    var rows = chartSeries(weeks);
    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 320;
    var h = cv.clientHeight || 180;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (rows.length < 2) return;

    var padL = 36, padR = 28, padT = 10, padB = 22;
    var plotW = Math.max(1, w - padL - padR);
    var plotH = Math.max(1, h - padT - padB);
    var times = rows.map(function (r) { return Date.parse(String(r.week_start).slice(0, 10)); });
    var minT = times[0], maxT = times[times.length - 1];
    var spanT = (maxT - minT) || 1;
    function xAt(t) { return padL + ((t - minT) / spanT) * plotW; }
    var omVals = rows.map(function (r) { return Number(r.omset_wk) || 0; });
    var unVals = rows.map(function (r) { return Number(r.units_wk) || 0; });
    var yOm = yScaleFn(omVals, padT, plotH);
    var yUn = yScaleFn(unVals, padT, plotH);

    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    ctx.lineWidth = 1;
    for (var g = 0; g < 4; g++) {
      var gy = padT + (plotH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(padL + plotW, gy);
      ctx.stroke();
    }

    var omPts = rows.map(function (r, i) {
      return { x: xAt(times[i]), y: yOm(omVals[i]), measured: r.source === 'measured' };
    });
    if (omPts.length) {
      ctx.beginPath();
      ctx.moveTo(omPts[0].x, padT + plotH);
      omPts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
      ctx.lineTo(omPts[omPts.length - 1].x, padT + plotH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(181,32,42,.06)';
      ctx.fill();
    }

    function strokeSeries(pts, color) {
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      for (var i = 1; i < pts.length; i++) {
        ctx.setLineDash(pts[i - 1].measured && pts[i].measured ? [] : [5, 5]);
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      pts.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
      });
    }
    strokeSeries(omPts, '#B5202A');
    strokeSeries(rows.map(function (r, i) {
      return { x: xAt(times[i]), y: yUn(unVals[i]), measured: r.source === 'measured' };
    }), '#2563EB');

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    var n = rows.length;
    var step = n <= 6 ? 1 : Math.ceil((n - 1) / 5);
    var shown = {};
    function tick(i, align) {
      if (shown[i]) return;
      shown[i] = 1;
      var label = weekLabel(rows[i].week_start);
      if (!label) return;
      ctx.textAlign = align || 'center';
      ctx.fillText(label, xAt(times[i]), h - padB + 6);
    }
    for (var i = 0; i < n; i += step) tick(i, i === 0 ? 'left' : 'center');
    tick(n - 1, 'right');

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(rpTick(Math.max.apply(null, omVals)), padL - 4, padT + 2);
    ctx.fillText('0', padL - 4, padT + plotH);
  }

  function makeFavChart(cv, weeks) {
    var rows = chartSeries(weeks);
    if (rows.length < 2 || typeof global.Chart === 'undefined') {
      drawDualChartFallback(cv, weeks);
      return;
    }
    if (typeof global.Chart.getChart === 'function') {
      var existing = global.Chart.getChart(cv);
      if (existing) { try { existing.destroy(); } catch (_) {} }
    }
    var sources = rows.map(function (r) { return r.source; });
    var labels = rows.map(function (r) { return weekLabel(r.week_start); });
    var omsets = rows.map(function (r) { return Number(r.omset_wk) || 0; });
    var units = rows.map(function (r) { return Number(r.units_wk) || 0; });
    function dashSeg(ctx) {
      var i = ctx.p0DataIndex;
      var a = sources[i];
      var b = sources[i + 1];
      return (a === 'measured' && b === 'measured') ? undefined : [5, 5];
    }
    var chart = new global.Chart(cv, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Omset / minggu (Rp)',
            data: omsets,
            yAxisID: 'y',
            borderColor: '#B5202A',
            backgroundColor: 'rgba(181,32,42,.06)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 4,
            spanGaps: true,
            segment: { borderDash: dashSeg },
          },
          {
            label: 'Unit / minggu',
            data: units,
            yAxisID: 'y1',
            borderColor: '#2563EB',
            backgroundColor: 'transparent',
            borderWidth: 2,
            fill: false,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 4,
            spanGaps: true,
            segment: { borderDash: dashSeg },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (c) {
                if (c.parsed.y == null) return '';
                if (c.dataset.yAxisID === 'y1') {
                  return 'Unit: ' + Math.round(c.parsed.y);
                }
                var short = call('fmtRpShort', c.parsed.y);
                return 'Omset: ' + (short != null ? short : fmtRpShort(c.parsed.y));
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 6,
              font: { size: 10 },
              color: '#9CA3AF',
            },
            grid: { display: false },
            border: { display: false },
          },
          y: {
            display: true,
            position: 'left',
            min: 0,
            ticks: {
              callback: rpTick,
              maxTicksLimit: 5,
              font: { size: 10 },
              color: '#9CA3AF',
            },
            grid: { color: 'rgba(0,0,0,.06)' },
            border: { display: false },
          },
          y1: {
            display: true,
            position: 'right',
            min: 0,
            ticks: {
              maxTicksLimit: 5,
              font: { size: 10 },
              color: '#9CA3AF',
            },
            grid: { drawOnChartArea: false },
            border: { display: false },
          },
        },
      },
    });
    favCharts.push(chart);
  }

  function paintCharts() {
    if (!host) return;
    var canvases = host.querySelectorAll('[data-ltk-chart]');
    if (!canvases.length) return;
    callP('ensureChart').then(function () {
      if (!host) return;
      destroyCharts();
      host.querySelectorAll('[data-ltk-chart]').forEach(function (cv) {
        var key = cv.getAttribute('data-ltk-chart');
        makeFavChart(cv, S.weeklyByKey[key] || []);
      });
    }).catch(function () {
      if (!host) return;
      destroyCharts();
      host.querySelectorAll('[data-ltk-chart]').forEach(function (cv) {
        var key = cv.getAttribute('data-ltk-chart');
        drawDualChartFallback(cv, S.weeklyByKey[key] || []);
      });
    });
  }

  function onResize() {
    if (timers.resize) clearTimeout(timers.resize);
    timers.resize = setTimeout(function () {
      if (favCharts.length) {
        favCharts.forEach(function (c) { try { c.resize(); } catch (_) {} });
      } else {
        paintCharts();
      }
    }, 120);
  }

  function productUpdates(p) {
    var lines = [];
    var monday = wibMondayISO();
    var snaps = (S.snapsByKey[prodKey(p)] || []).slice().sort(function (a, b) {
      return String(b.scraped_at || b.d || '').localeCompare(String(a.scraped_at || a.d || ''));
    });
    var latestThis = null, latestBefore = null;
    snaps.forEach(function (s) {
      if (s.d >= monday) {
        if (!latestThis) latestThis = s;
      } else if (!latestBefore) {
        latestBefore = s;
      }
    });
    if (latestThis && latestBefore && latestThis.product_name && latestBefore.product_name &&
        normTitle(latestThis.product_name) !== normTitle(latestBefore.product_name)) {
      lines.push('Judul berubah: "' + latestBefore.product_name + '" jadi "' + latestThis.product_name + '"');
    }
    var pair = weekPair(weeklyFor(p));
    if (pair) {
      var p0 = Number(pair.prev.price) || 0;
      var p1 = Number(pair.cur.price) || 0;
      if (p0 > 0 && p1 > 0 && Math.abs(p1 - p0) >= Math.max(100, p0 * 0.005)) {
        var dir = p1 > p0 ? 'naik' : 'turun';
        lines.push('Harga ' + dir + ' ' + fmtRp(p0) + ' jadi ' + fmtRp(p1));
      }
      var omPct = pctChange(pair.cur.omset_wk, pair.prev.omset_wk);
      if (omPct != null && isFinite(omPct) && omPct >= OMSET_SPIKE_PCT) {
        lines.push('Omset naik ' + Math.round(omPct) + '% minggu ini');
      }
    }
    return lines;
  }

  function updatesHtml(p) {
    var lines = productUpdates(p);
    if (!lines.length) return '';
    return '<div class="ltk-fav-updates">' +
      lines.map(function (t) { return '<p class="ltk-fav-update">' + esc(t) + '</p>'; }).join('') +
      '</div>';
  }

  /* ── shell ──────────────────────────────────────────────────────────── */

  function buildShell() {
    host.className = (host.className || '').indexOf('ltk-root') >= 0 ? host.className : 'ltk-root';
    host.setAttribute('data-site', opts.site || 'b');
    host.innerHTML =
      '<header class="ltk-head">' +
        '<div class="ltk-head-main">' +
          '<span class="ltk-head-ico ltk-head-ico--mascot" aria-hidden="true">' +
            '<img src="/images/brand/appicon-bird-48.png" alt="" width="20" height="20" loading="lazy">' +
          '</span>' +
          '<div><h2 class="ltk-title">Favorit Aku</h2>' +
          '<p class="ltk-sub" data-ltk-sub></p></div>' +
        '</div>' +
        '<div class="ltk-head-actions" data-ltk-headact></div>' +
      '</header>' +
      '<div class="ltk-scopetabs" role="tablist" aria-label="Jenis favorit" data-ltk-scopetabs></div>' +
      '<section class="ltk-screen" data-ltk-screen="list"></section>' +
      '<section class="ltk-screen" data-ltk-screen="error"></section>';
  }

  function showScreen(name) {
    if (!host) return;
    S.screen = name;
    host.querySelectorAll('.ltk-screen').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-ltk-screen') === name);
    });
    renderHead();
    renderScopeTabs();
  }

  function renderHead() {
    var sub = $('[data-ltk-sub]');
    var act = $('[data-ltk-headact]');
    if (sub) {
      if (!S.products.length) {
        sub.textContent = 'Simpan listing yang kamu incar. Kami scrape-nya tiap hari.';
      } else {
        sub.textContent = S.products.length + ' / ' + S.productLimit + ' produk · data harian';
      }
    }
    if (act) {
      act.innerHTML = S.products.length < S.productLimit
        ? '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-focus-add>Tambah</button>'
        : '<span class="ltk-hint">Batas ' + S.productLimit + ' tercapai — hapus satu dulu biar data tetap segar.</span>';
    }
  }

  function renderScopeTabs() {
    var bar = $('[data-ltk-scopetabs]');
    if (!bar) return;
    if (S.screen !== 'list') { bar.innerHTML = ''; return; }
    var tabs = [
      { id: 'product', label: 'Produk', n: S.products.length },
      { id: 'store', label: 'Toko', n: S.stores.length },
    ];
    bar.innerHTML = tabs.map(function (t) {
      return '<button type="button" role="tab" class="ltk-scopetab' + (S.tab === t.id ? ' is-active' : '') +
        '" aria-selected="' + (S.tab === t.id) + '" data-ltk-tab="' + t.id + '">' +
        esc(t.label) + (t.n ? '<span class="ltk-scopetab-n">' + t.n + '</span>' : '') + '</button>';
    }).join('');
  }

  function emptyHtml() {
    return '<div class="ltk-empty">' +
      '<p>Belum ada favorit. Bookmark produk di Cari Produk, atau cari di sini — satu klik selesai.</p>' +
      '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-open-dir>Buka Cari Produk</button>' +
    '</div>';
  }

  function addBoxHtml() {
    var rows = (S.addRows || []).map(function (p) {
      var on = isFavorited(p);
      return '<button type="button" class="ltk-add-row' + (on ? ' is-on' : '') + '" data-ltk-add-pick="' +
        attr(prodKey(p)) + '"' + (on ? ' disabled' : '') + '>' +
        imgOr(p.image_url, 'ltk-row-ico') +
        '<span class="ltk-add-txt"><b>' + esc(p.product_name || 'Produk') + '</b>' +
        '<i>' + esc(p.store_name || '') + (p.price ? ' · ' + fmtRp(p.price) : '') + '</i></span>' +
        (on ? '<span>Sudah</span>' : '<span>Simpan</span>') +
      '</button>';
    }).join('');
    return '<div class="ltk-add" id="ltk-add">' +
      '<label class="ltk-hint" for="ltk-add-q">Tambah produk</label>' +
      '<input class="ltk-input" id="ltk-add-q" type="search" placeholder="Ketik nama produk…" value="' +
        attr(S.addQ) + '" autocomplete="off">' +
      (S.addBusy ? '<p class="ltk-hint">Mencari…</p>' : '') +
      (rows ? '<div class="ltk-add-list">' + rows + '</div>' : (S.addQ.length >= 2 && !S.addBusy
        ? '<p class="ltk-hint">Tidak ketemu. Coba kata lain, atau buka Cari Produk.</p>' : '')) +
    '</div>';
  }

  function favCardHtml(p) {
    var key = prodKey(p);
    var weeks = weeklyFor(p);
    var trend = productTrend(p);
    var pair = weekPair(weeks);
    var omset = pair ? pair.cur.omset_wk : 0;
    var honesty = pair ? honestyLabel(trend.source) : '';
    var hasChart = chartSeries(weeks).length >= 2;
    var fresh = p.scraped_at && (Date.now() - Date.parse(p.scraped_at) < 2 * 86400000);
    var waitNote = (!weeks.length && !fresh)
      ? '<p class="ltk-hint">Data harian mulai ' + esc(nextUpdateLabel()) + '.</p>'
      : '';
    return '<article class="ltk-card ltk-fav-card">' +
      '<div class="ltk-card-row">' +
        '<div class="ltk-card-ident">' +
          '<div class="ltk-card-top">' +
            imgOr(p.image_url, 'ltk-row-ico') +
            '<div class="ltk-card-head">' +
              '<div class="ltk-card-name">' + esc(p.product_name || 'Produk') + '</div>' +
              '<div class="ltk-card-meta">' + esc(p.store_name || 'Toko') +
                (p.price ? ' · ' + fmtRp(p.price) : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ltk-card-stats">' +
            '<div class="ltk-mstat"><span class="ltk-mstat-lbl">Omset / minggu</span>' +
              '<span class="ltk-mstat-val">' + (omset ? fmtRpShort(omset) : '—') + '</span>' +
              (honesty ? '<span class="ltk-honesty">' + honesty + '</span>' : '') +
              deltaHtml(trend.pct, trend.enough) +
            '</div>' +
          '</div>' +
        '</div>' +
        (hasChart
          ? '<div class="ltk-card-chart">' +
              '<div class="ltk-chart-wrap">' +
                '<canvas class="ltk-card-chart-canvas" data-ltk-chart="' + attr(key) + '"></canvas>' +
              '</div>' +
              '<div class="ltk-chart-legend">' +
                '<span class="ltk-chart-leg-row"><span class="ltk-swatch" style="background:#B5202A"></span>Omset / minggu (Rp)</span>' +
                '<span class="ltk-chart-leg-row"><span class="ltk-swatch" style="background:#2563EB"></span>Unit / minggu</span>' +
              '</div>' +
            '</div>'
          : '') +
      '</div>' +
      updatesHtml(p) +
      waitNote +
      '<div class="ltk-fav-actions">' +
        '<label class="ltk-switch">' +
          '<input type="checkbox" data-ltk-toko="' + attr(key) + '"' + (p.store_tracked ? ' checked' : '') + '>' +
          '<span>Pantau toko ini</span>' +
        '</label>' +
        '<span class="ltk-fav-links">' +
          '<button type="button" class="ltk-link" data-ltk-dd="' + attr(key) + '">Deep Dive</button>' +
          '<button type="button" class="ltk-link" data-ltk-remove="' + attr(key) + '">Hapus</button>' +
        '</span>' +
      '</div>' +
    '</article>';
  }

  function storeCardHtml(s) {
    return '<article class="ltk-card">' +
      '<div class="ltk-card-name">' + esc(s.store_name || ('Toko ' + s.shop_id)) + '</div>' +
      '<p class="ltk-hint">Data toko mengikuti scrape keyword (~2 minggu), bukan harian.</p>' +
      '<button type="button" class="ltk-link" data-ltk-remove-store="' + attr(String(s.id || '')) + '">Hapus toko</button>' +
    '</article>';
  }

  function notifyStatusLine() {
    var ch = S.notifyChannels || [];
    var wantWa = ch.indexOf('whatsapp') >= 0;
    var wantEm = ch.indexOf('email') >= 0;
    if (wantWa && S.waReady) return 'WA aktif.';
    if (wantWa && !S.waReady && S.emailOk && wantEm) {
      return 'WA belum tersambung, kami kirim lewat email dulu.';
    }
    if (wantWa && !S.waReady && !S.emailOk) {
      return 'Belum ada saluran aktif — WA belum tersambung dan akun ini tidak punya email.';
    }
    if (wantEm && S.emailOk) return 'Email aktif' + (S.userEmail ? ' (' + S.userEmail + ')' : '') + '.';
    if (wantEm && !S.emailOk) return 'Belum ada saluran aktif.';
    if (!ch.length) return 'Belum memilih saluran — kami tidak mengirim kabar.';
    return '';
  }

  function notifyHtml() {
    var ch = S.notifyChannels || [];
    var onEm = ch.indexOf('email') >= 0;
    var onWa = ch.indexOf('whatsapp') >= 0;
    return '<div class="ltk-notify ltk-notify--wiz">' +
      '<p class="ltk-hint">Mau dikabari lewat mana?</p>' +
      '<div class="ltk-mgrid">' +
        '<button type="button" class="ltk-mcard' + (onEm ? ' is-on' : '') + '" data-ltk-ch="email">' +
          '<span class="ltk-mcard-title">Email</span>' +
          '<span class="ltk-mcard-sub">' + (S.emailOk ? esc(S.userEmail || 'Email akun') : 'Akun ini tidak punya email') + '</span>' +
        '</button>' +
        '<button type="button" class="ltk-mcard' + (onWa ? ' is-on' : '') + '" data-ltk-ch="whatsapp">' +
          '<span class="ltk-mcard-title">WhatsApp</span>' +
          '<span class="ltk-mcard-sub">' + (S.waReady ? 'Siap kirim' : 'Perangkat belum tersambung') + '</span>' +
        '</button>' +
      '</div>' +
      (onWa
        ? '<label class="ltk-notify-wa"><span>Nomor WhatsApp</span>' +
          '<input type="tel" id="ltk-wa" inputmode="tel" placeholder="0812xxxxxxxx" value="' + attr(S.notifyWa || '') + '">' +
          '</label>'
        : '') +
      '<div class="ltk-cadence" role="radiogroup" aria-label="Frekuensi">' +
        '<label class="ltk-cadence-opt"><input type="radio" name="ltk-cadence" value="on_update"' +
          (S.notifyCadence !== 'weekly' ? ' checked' : '') + '> Setiap ada perubahan</label>' +
        '<label class="ltk-cadence-opt"><input type="radio" name="ltk-cadence" value="weekly"' +
          (S.notifyCadence === 'weekly' ? ' checked' : '') + '> Sekali seminggu</label>' +
      '</div>' +
      '<p class="ltk-hint" data-ltk-ch-status>' + esc(notifyStatusLine()) + '</p>' +
      '<button type="button" class="ltk-btn ltk-btn--primary ltk-notify-save" data-ltk-save-notify>Simpan kabar</button>' +
      (S.notifyMsg ? '<p class="ltk-notify-ok">' + esc(S.notifyMsg) + '</p>' : '') +
    '</div>';
  }

  function renderList() {
    var pane = $('[data-ltk-screen="list"]');
    if (!pane) return;
    destroyCharts();
    if (S.tab === 'store') {
      pane.innerHTML =
        (S.stores.length ? S.stores.map(storeCardHtml).join('') : '<p class="ltk-hint">Belum ada toko. Nyalakan “Pantau toko ini” di kartu produk.</p>') +
        notifyHtml();
      return;
    }
    pane.innerHTML =
      addBoxHtml() +
      (S.products.length ? S.products.map(favCardHtml).join('') : emptyHtml()) +
      (S.products.length ? notifyHtml() : '');
    if (global.requestAnimationFrame) global.requestAnimationFrame(paintCharts);
    else paintCharts();
  }

  function renderError(msg) {
    var pane = $('[data-ltk-screen="error"]');
    if (!pane) return;
    pane.innerHTML = '<p class="ltk-hint">' + esc(msg || 'Gagal memuat Favorit Aku.') + '</p>' +
      '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-retry>Coba lagi</button>';
    showScreen('error');
  }

  function isFavorited(p) {
    var k = prodKey(p);
    return S.products.some(function (x) { return prodKey(x) === k; });
  }

  function findProduct(key) {
    return S.products.filter(function (p) { return prodKey(p) === key; })[0] || null;
  }

  function applyTracking(data) {
    if (!data) return;
    S.products = data.products || [];
    S.stores = data.stores || [];
    S.productLimit = data.product_limit || 30;
    S.storeLimit = data.store_limit || 20;
    S.paused = !!data.paused;
    S.notifyChannels = data.notify_channels || [];
    S.notifyWa = data.notify_wa_number || '';
    S.notifyAsked = !!data.notify_asked;
    S.notifyCadence = data.notify_cadence || 'on_update';
    S.configured = S.products.length > 0 || S.stores.length > 0;
    S.emailOk = call('hasRealEmail') !== false;
    S.waReady = !!call('waAlertsReady');
    S.userEmail = call('userEmail') || '';
    call('onStateChange', getState());
  }

  function loadWeekly() {
    if (!S.products.length) {
      S.weeklyByKey = {};
      S.snapsByKey = {};
      return Promise.resolve();
    }
    return Promise.all([
      callP('getListingsWeeklyBatch', S.products),
      callP('getFavoriteListingSnaps', S.products),
    ]).then(function (pair) {
      var map = {};
      (pair[0] || []).forEach(function (w) {
        var k = w.item_id + '|' + w.shop_id;
        (map[k] = map[k] || []).push(w);
      });
      S.weeklyByKey = map;
      var snaps = {};
      (pair[1] || []).forEach(function (r) {
        var k = r.item_id + '|' + r.shop_id;
        (snaps[k] = snaps[k] || []).push({
          d: String(r.scraped_at || '').slice(0, 10),
          product_name: r.product_name,
          price: r.price,
          scraped_at: r.scraped_at,
        });
      });
      S.snapsByKey = snaps;
    });
  }

  function refresh(o) {
    o = o || {};
    var gen = (refresh._gen = (refresh._gen || 0) + 1);
    if (timers.abort) clearTimeout(timers.abort);
    timers.abort = setTimeout(function () {
      if (gen === refresh._gen) renderError('Koneksi lambat. Coba lagi.');
    }, WATCHDOG_MS);
    if (o.touch) callP('touchViewed');
    return callP('getFavorites').then(function (data) {
      if (gen !== refresh._gen) return S;
      applyTracking(data);
      return loadWeekly();
    }).then(function () {
      if (gen !== refresh._gen) return S;
      if (timers.abort) { clearTimeout(timers.abort); timers.abort = 0; }
      renderList();
      showScreen('list');
      return getState();
    }).catch(function (e) {
      if (gen !== refresh._gen) return S;
      if (timers.abort) { clearTimeout(timers.abort); timers.abort = 0; }
      warn('refresh', e);
      renderError('Gagal memuat Favorit Aku.');
      return S;
    });
  }

  function productPayload(p) {
    return {
      p_item_id: p.item_id,
      p_shop_id: p.shop_id,
      p_keyword: p.keyword || '',
      p_product_name: p.product_name || '',
      p_image_url: p.image_url || '',
      p_price: p.price != null ? p.price : null,
      p_category: p.category || p.category_canonical || '',
      p_store_name: p.store_name || '',
      p_total_sold: p.total_sold != null ? p.total_sold : null,
    };
  }

  function addProduct(p) {
    if (!call('requireAuth')) {
      call('savePendingDraft', { seed: p });
      return Promise.resolve(false);
    }
    if (S.products.length >= S.productLimit && !isFavorited(p)) {
      toast('Favorit penuh (' + S.productLimit + '). Hapus satu dulu biar data tetap segar.');
      return Promise.resolve(false);
    }
    return callP('addProduct', p).then(function (d) {
      if (d && d.ok === false) {
        var msg = {
          limit_reached: 'Favorit penuh (' + (d.limit || S.productLimit) + '). Hapus satu dulu.',
          listing_required: 'Produk ini tidak bisa disimpan.',
        }[d.error] || 'Tidak bisa menambah favorit.';
        toast(msg);
        return false;
      }
      call('track', 'favorite_added', { item_id: p.item_id, shop_id: p.shop_id });
      toast('Tersimpan di Favorit Aku.');
      return refresh({ touch: true });
    }).then(function (ok) { return !!ok; }).catch(function () {
      toast('Gagal menyimpan favorit.');
      return false;
    });
  }

  function removeProduct(p) {
    return callP('removeProduct', p).then(function () {
      call('track', 'favorite_removed', { item_id: p.item_id, shop_id: p.shop_id });
      return refresh();
    }).catch(function () { toast('Gagal menghapus.'); });
  }

  function toggleToko(p, on) {
    if (on) {
      return callP('addStore', p.shop_id, p.store_name || '').then(function (d) {
        if (d && d.ok === false) {
          toast(d.error === 'limit_reached' ? 'Batas toko tercapai.' : 'Tidak bisa memantau toko.');
          return refresh();
        }
        toast('Toko masuk pantauan. Datanya ~2 minggu, bukan harian.');
        return refresh();
      });
    }
    var store = S.stores.filter(function (s) { return Number(s.shop_id) === Number(p.shop_id); })[0];
    if (!store) return refresh();
    return callP('removeStore', store.id).then(function () { return refresh(); });
  }

  function runSearch(q) {
    S.addQ = q;
    if (q.length < 2) { S.addRows = []; S.addBusy = false; renderList(); return; }
    S.addBusy = true;
    renderList();
    var input = $(' #ltk-add-q'.replace(' ', ''));
    callP('searchListings', q).then(function (rows) {
      S.addBusy = false;
      S.addRows = rows || [];
      renderList();
      var el = $('#ltk-add-q');
      if (el) { el.value = S.addQ; el.focus(); }
    }).catch(function () {
      S.addBusy = false;
      S.addRows = [];
      renderList();
    });
  }

  function saveNotify() {
    var channels = (S.notifyChannels || []).slice();
    var wa = ($('#ltk-wa') && $('#ltk-wa').value) || S.notifyWa || '';
    var cadEl = host.querySelector('input[name="ltk-cadence"]:checked');
    var cadence = cadEl ? cadEl.value : S.notifyCadence;
    return callP('setNotifyPrefs', { channels: channels, waNumber: wa, cadence: cadence }).then(function (d) {
      if (d && d.ok === false) {
        S.notifyMsg = d.error === 'wa_number_required' ? 'Isi nomor WhatsApp dulu.' : 'Gagal menyimpan.';
        renderList();
        return;
      }
      S.notifyMsg = 'Kabar disimpan.';
      S.notifyCadence = cadence;
      S.notifyWa = (d && d.notify_wa_number) || wa;
      S.notifyChannels = (d && d.notify_channels) || channels;
      renderList();
    }).catch(function () {
      S.notifyMsg = 'Gagal menyimpan.';
      renderList();
    });
  }

  function onClick(e) {
    if (!host || !host.contains(e.target)) return;
    var t = e.target;
    var retry = t.closest && t.closest('[data-ltk-retry]');
    if (retry) { refresh({ touch: true }); return; }
    var dir = t.closest && t.closest('[data-ltk-open-dir]');
    if (dir) { call('openDiscovery'); return; }
    var focusAdd = t.closest && t.closest('[data-ltk-focus-add]');
    if (focusAdd) {
      var inp = $('#ltk-add-q');
      if (inp) { inp.focus(); inp.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      return;
    }
    var tab = t.closest && t.closest('[data-ltk-tab]');
    if (tab) {
      S.tab = tab.getAttribute('data-ltk-tab') === 'store' ? 'store' : 'product';
      lsWrite({ tab: S.tab });
      renderList();
      renderScopeTabs();
      return;
    }
    var ch = t.closest && t.closest('[data-ltk-ch]');
    if (ch) {
      var key = ch.getAttribute('data-ltk-ch');
      var set = S.notifyChannels.slice();
      var i = set.indexOf(key);
      if (i >= 0) set.splice(i, 1); else set.push(key);
      S.notifyChannels = set;
      S.notifyMsg = '';
      renderList();
      return;
    }
    var save = t.closest && t.closest('[data-ltk-save-notify]');
    if (save) { saveNotify(); return; }
    var rem = t.closest && t.closest('[data-ltk-remove]');
    if (rem) {
      e.preventDefault(); e.stopPropagation();
      var rp = findProduct(rem.getAttribute('data-ltk-remove'));
      if (rp) removeProduct(rp);
      return;
    }
    var rs = t.closest && t.closest('[data-ltk-remove-store]');
    if (rs) {
      callP('removeStore', rs.getAttribute('data-ltk-remove-store')).then(function () { return refresh(); });
      return;
    }
    var pick = t.closest && t.closest('[data-ltk-add-pick]');
    if (pick) {
      var pk = pick.getAttribute('data-ltk-add-pick');
      var row = (S.addRows || []).filter(function (x) { return prodKey(x) === pk; })[0];
      if (row) addProduct(row);
      return;
    }
    var dd = t.closest && t.closest('[data-ltk-dd]');
    if (dd) {
      var dp = findProduct(dd.getAttribute('data-ltk-dd'));
      if (dp) call('openProduct', dp);
    }
  }

  function onChange(e) {
    if (!host || !host.contains(e.target)) return;
    var toko = e.target.closest && e.target.closest('[data-ltk-toko]');
    if (toko) {
      var p = findProduct(toko.getAttribute('data-ltk-toko'));
      if (p) toggleToko(p, !!toko.checked);
    }
  }

  function onInput(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.target.id === 'ltk-add-q') {
      var q = e.target.value || '';
      S.addQ = q;
      if (timers.typeahead) clearTimeout(timers.typeahead);
      timers.typeahead = setTimeout(function () { runSearch(q.trim()); }, TYPEAHEAD_MS);
    }
  }

  function bind() {
    if (bound) return;
    global.document.addEventListener('click', onClick, true);
    global.document.addEventListener('change', onChange, true);
    global.document.addEventListener('input', onInput, true);
    global.addEventListener('resize', onResize);
    bound = true;
  }

  function mount(o) {
    o = o || {};
    opts = o;
    adapter = o.adapter || {};
    host = global.document.getElementById(o.hostId || 'laris-tracker-root');
    if (!host) { warn('host missing'); return; }
    var saved = lsRead();
    if (saved.tab === 'store') S.tab = 'store';
    buildShell();
    bind();
    mounted = true;
  }

  function open(o) {
    o = o || {};
    if (!mounted) return Promise.resolve(null);
    return refresh({ touch: o.touch !== false });
  }

  function getState() {
    return {
      configured: S.configured,
      productCount: S.products.length,
      storeCount: S.stores.length,
      keywordCount: S.products.length,
      paused: S.paused,
      screen: S.screen,
    };
  }

  function summary() {
    var n = S.products.length;
    var best = null;
    S.products.forEach(function (p) {
      var t = productTrend(p);
      if (t.enough && t.pct != null && (!best || Math.abs(t.pct) > Math.abs(best.pct))) {
        best = { label: p.product_name, pct: t.pct, omset: (weekPair(weeklyFor(p)) || {}).cur };
      }
    });
    return {
      configured: S.configured,
      hasHistory: S.products.some(function (p) { return weeklyFor(p).length >= 2; }),
      keywordCount: n,
      productCount: n,
      storeCount: S.stores.length,
      nextUpdateLabel: nextUpdateLabel(),
      topRow: best,
    };
  }

  function summaryCardHtml() {
    var s = summary();
    if (!s.configured) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">Belum ada favorit.</span></div>';
    }
    if (!s.hasHistory) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        s.productCount + ' favorit. Data harian mulai ' + esc(s.nextUpdateLabel) + '.</span></div>';
    }
    if (!s.topRow) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        s.productCount + ' favorit dipantau tiap hari.</span></div>';
    }
    return '<div class="ltk-summary">' +
      '<div class="ltk-summary-line">Favorit Aku · ' + s.productCount + ' produk</div>' +
      '<div class="ltk-summary-top"><div class="ltk-summary-main"><div class="ltk-summary-name">' +
        esc(s.topRow.label) + '</div></div>' +
      '<div class="ltk-summary-num">' +
        (s.topRow.pct >= 0 ? '+' : '') + Math.round(s.topRow.pct) + '%</div></div></div>';
  }

  function bindSummary(root) {
    if (!root) return;
    root.querySelectorAll('[data-ltk-open]').forEach(function (el) {
      if (el.__ltkBound) return;
      el.__ltkBound = 1;
      el.addEventListener('click', function () { call('openTrackerView'); });
    });
  }

  function destroy() {
    if (timers.abort) clearTimeout(timers.abort);
    if (timers.typeahead) clearTimeout(timers.typeahead);
    if (timers.resize) clearTimeout(timers.resize);
    destroyCharts();
    if (bound) {
      global.document.removeEventListener('click', onClick, true);
      global.document.removeEventListener('change', onChange, true);
      global.document.removeEventListener('input', onInput, true);
      global.removeEventListener('resize', onResize);
      bound = false;
    }
    if (host) host.innerHTML = '';
    host = null; mounted = false;
  }

  global.LarisTracker = {
    mount: mount,
    open: open,
    close: function () { if (timers.abort) clearTimeout(timers.abort); },
    refresh: refresh,
    openSetup: function (o) {
      o = o || {};
      var seed = o.seed;
      if (seed && seed.item_id && seed.shop_id) {
        addProduct(seed).then(function () {
          renderList();
          showScreen('list');
        });
        return;
      }
      if (seed && seed.keyword) {
        callP('getKeywordTopListings', seed.keyword).then(function (rows) {
          var top = (rows || [])[0];
          if (top) return addProduct(Object.assign({}, seed, top));
          toast('Belum ada listing untuk keyword itu.');
        }).then(function () { renderList(); showScreen('list'); });
        return;
      }
      renderList();
      showScreen('list');
      var inp = $('#ltk-add-q');
      if (inp) inp.focus();
    },
    resumeDraft: function (o) {
      if (o && o.seed) this.openSetup(o);
      else { renderList(); showScreen('list'); }
    },
    setTab: function (tab) {
      S.tab = tab === 'store' ? 'store' : 'product';
      lsWrite({ tab: S.tab });
      renderList();
      renderScopeTabs();
    },
    isConfigured: function () { return S.configured; },
    getState: getState,
    summary: summary,
    summaryCardHtml: summaryCardHtml,
    bindSummary: bindSummary,
    destroy: destroy,
    version: '3.1.1',
  };
})(typeof window !== 'undefined' ? window : this);
