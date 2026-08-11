/**
 * laris-tracker.js — custom keyword + store tracking, shared by Site A
 * (laris-app) and Site B (gpt-app).
 *
 * Same split as daily-spin-wheel.js: this module owns every pixel and all screen
 * state; the host supplies an adapter with data callbacks and app-local services.
 * It never touches _supabase, currentUser, or any other app global — Site B is
 * IIFE-scoped and could not expose them anyway, so the boundary is enforced by
 * the architecture rather than by discipline.
 *
 *   LarisTracker.mount({ hostId, site, defaultDays, adapter })
 *   LarisTracker.open({ touch })         // on view enter
 *   LarisTracker.close()                 // on view leave
 *   LarisTracker.refresh({ touch, days, force }) -> Promise<state>
 *   LarisTracker.openSetup()
 *   LarisTracker.getState() / .summary() / .isConfigured()
 *   LarisTracker.summaryCardHtml(o) / .bindSummary(root)
 *
 * SCREEN SELECTION is the load-bearing logic:
 *   !configured                        -> setup
 *   configured && !has_history         -> collecting   (scraper has never run for these keywords)
 *   configured && has_history          -> rollup       (the Robinhood table)
 * The collecting/rollup distinction needs has_history from the RPC; without it
 * both look identical and every user with flat keywords is told "come back
 * tomorrow" forever.
 *
 * TWO SCOPES, ONE TABLE: S.tab is 'keyword' or 'store'. Both render through
 * renderRollup() against get_tracker_rollup(days, scope) — the columns differ
 * but the layout, sorting and sparklines are shared.
 *
 * HONESTY RULE: a row whose window holds fewer than 2 snapshots gets "Baru"
 * instead of a percentage and no sparkline. Most tracked keywords are in that
 * state until the daily_custom scrape set has covered them for a week or two,
 * and inventing a trend line there would be inventing data.
 */
(function (global) {
  'use strict';

  var LS_KEY = '_ltk_ui_v1';          // cosmetic only — never user data
  var WATCHDOG_PAINT_MS = 2500;       // never leave the user on a spinner past this
  var WATCHDOG_ABORT_MS = 8000;       // never leave the user on a dead screen at all
  var SEED_TARGET = 3;                // pre-fill 3 of 5; the 2 empty slots are the hook
  // Shopee scrape days are sparse and irregular — a 7‑day window routinely
  // contains zero scrapes for a perfectly active market, which would hide all
  // history. 30 days gives the UI a more representative view.
  var DEFAULT_DAYS = 30;
  var WIB_OFFSET_MIN = 7 * 60;        // Asia/Jakarta, no DST
  var SCRAPE_HOUR_WIB = 7;            // morning run lands ~07:00 WIB
  var MIN_DAYS_FOR_TREND = 2;         // below this: "Baru", no sparkline, no %
  var TYPEAHEAD_MS = 280;

  var host = null;
  var adapter = null;
  var opts = {};
  var mounted = false;
  var bound = false;

  var S = {
    screen: 'setup',
    tab: 'keyword',                   // 'keyword' | 'store'
    configured: false,
    paused: false,
    resumed: false,
    keywords: [],
    stores: [],
    keywordLimit: 5,
    storeLimit: 3,
    metrics: ['units', 'omset', 'sku', 'toko'],   // display selection
    allMetrics: ['units', 'omset', 'sku', 'toko', 'harga', 'rating'],
    windowDays: DEFAULT_DAYS,
    asOf: null,
    hasHistory: false,
    rollup: { rows: [], totals: {}, scope: 'keyword' },
    sort: 'omset',                    // omset | units | sku | toko | harga | nama
    baseline: [],
    fallback: [],                     // discover cards on the collecting screen
    categories: [],
    openRow: null,                    // keyword/shop_id whose kebab menu is open
    openDetail: null,                 // keyword/shop_id whose row is expanded (mobile-friendly recap)
    lastRefreshAt: 0,
    // "Lihat Detail" screen — a dedicated, simpler view (stats + chart +
    // change history + who's selling it) separate from the row-expand recap.
    detailKey: null,                  // keyword/shop_id currently open, or null
    detailScope: 'keyword',           // scope the detail screen was opened from
    detailPeers: [],                  // suppliers (product) or top products (store)
    detailPeersLoading: false,
    detailMetric: 'omset',            // which chart the toggle row is showing
  };

  // Uncommitted setup draft. Nothing here is persisted or sent until commit.
  // `sug` holds the live typeahead: which slot is open, the query, and results.
  var draft = {
    cat: null, picked: [], stores: [], busy: false, errors: {},
    step: 0,                 // 0 keyword · 1 metrik · 2 toko · 3 selesai
    metrics: [],             // display selection, seeded from S.metrics
    seed: null,              // {keyword, category, shop_id, store_name, item_id}
    seedShopSkus: null,      // SKU count for the seed shop, fetched lazily
    sug: { slot: -1, q: '', rows: [], busy: false, kind: 'keyword' },
    // Toko step's "browse by category" list — separate from `cat` (the
    // keyword step's own category filter) since the two steps browse
    // independently.
    storeCat: null, storeCatRows: [], storeCatBusy: false,
    // Card-grid picker for the seeded (from a Deep Dive) keyword step — see
    // stepKeywordPickerHtml(). Only ever used when `seed` is set.
    pickerOpen: false, pickerQ: '', pickerRows: [], pickerBusy: false,
  };
  function resetDraft() {
    draft.cat = null; draft.picked = []; draft.stores = []; draft.busy = false;
    draft.errors = {}; draft.step = 0; draft.seed = null; draft.seedShopSkus = null;
    draft.metrics = (S.metrics || []).slice();
    draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'keyword' };
    draft.storeCat = null; draft.storeCatRows = []; draft.storeCatBusy = false;
    draft.pickerOpen = false; draft.pickerQ = ''; draft.pickerRows = []; draft.pickerBusy = false;
    _pickedImgTried = {};
    _pickedImgBusy = false;
    _pickedImgGen++;
  }

  var inflight = null;
  var timers = { paint: 0, abort: 0, storeSearch: 0, typeahead: 0, pickerSearch: 0 };

  /* ── utils ──────────────────────────────────────────────────────────── */

  function esc(s) {
    if (adapter && typeof adapter.esc === 'function') return adapter.esc(s == null ? '' : s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function call(name, a, b) {
    try {
      if (adapter && typeof adapter[name] === 'function') return adapter[name](a, b);
    } catch (e) { warn(name + ' threw', e); }
    return undefined;
  }
  function callP(name, a, b) {
    try {
      if (!adapter || typeof adapter[name] !== 'function') return Promise.resolve(null);
      return Promise.resolve(adapter[name](a, b));
    } catch (e) { warn(name + ' threw', e); return Promise.resolve(null); }
  }
  function warn() {
    try { console.warn.apply(console, ['[LarisTracker]'].concat([].slice.call(arguments))); } catch (_) {}
  }
  function fmtUnits(n) {
    var v = call('fmtUnits', n);
    return v == null ? String(Math.round(n || 0)) : v;
  }
  function fmtRp(n) {
    var v = call('fmtRp', n);
    return v == null ? 'Rp' + Math.round(n || 0) : v;
  }
  function fmtDate(iso) {
    var v = call('fmtDate', iso);
    if (v != null) return v;
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (_) { return '—'; }
  }
  function $(sel) { return host ? host.querySelector(sel) : null; }
  function pane(name) { return $('[data-ltk-screen="' + name + '"]'); }

  function lsRead() {
    try { return JSON.parse(global.localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function lsWrite(patch) {
    try {
      var o = lsRead();
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) o[k] = patch[k];
      global.localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (_) { /* private mode — cosmetic state only, safe to lose */ }
  }

  /* ── "when does my first update land" ───────────────────────────────────
     Real computed date, not the word "besok". If the user opens this at 02:00
     WIB the answer is hours away, and saying "besok" would be wrong.          */

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

  // Art ships for 19 onboarding category slugs. Map the long tail of DB
  // category strings onto the nearest of those so the second fallback lands
  // on a real PNG instead of 404 → letter.
  var CAT_ICON_KNOWN = {
    'alat-tulis': 1, 'bayi-anak': 1, 'dapur': 1, 'elektronik': 1, 'fashion': 1,
    'hewan-peliharaan': 1, 'hobi-kerajinan': 1, 'hp-gadget': 1, 'kamar-mandi': 1,
    'keamanan': 1, 'kecantikan': 1, 'kesehatan': 1, 'motor-mobil': 1, 'olahraga': 1,
    'outdoor-camping': 1, 'rumah': 1, 'sepeda': 1, 'taman': 1, 'tanaman': 1,
  };
  var CAT_ICON_ALIAS = {
    'aksesoris-fashion': 'fashion', 'aksesoris-mobil': 'motor-mobil',
    'alat-musik': 'hobi-kerajinan', 'audio-dan-wearable': 'hp-gadget',
    'baking': 'dapur', 'batik-dan-tenun': 'fashion', 'body-care': 'kecantikan',
    'buku': 'alat-tulis', 'buku-dan-alat-tulis': 'alat-tulis',
    'dekorasi': 'rumah', 'elektronik-rumah-tangga': 'elektronik',
    'fashion-anak': 'fashion', 'fashion-muslim': 'fashion',
    'fashion-pria': 'fashion', 'fashion-pria-dan-wanita': 'fashion',
    'fashion-wanita': 'fashion', 'furniture': 'rumah',
    'gaming-dan-komputer': 'elektronik', 'grooming-pria': 'kecantikan',
    'hobi': 'hobi-kerajinan', 'ibu-dan-bayi': 'bayi-anak',
    'jahit': 'hobi-kerajinan', 'jam': 'fashion', 'jam-tangan': 'fashion',
    'kado-dan-hampers': 'rumah', 'kantor': 'alat-tulis',
    'kebersihan': 'kamar-mandi', 'kendaraan-listrik': 'motor-mobil',
    'kerajinan-dan-hobi': 'hobi-kerajinan', 'kesehatan-dan-herbal': 'kesehatan',
    'komputer': 'elektronik', 'konveksi-dan-kaos': 'fashion', 'kopi': 'dapur',
    'laundry': 'kamar-mandi', 'listrik-dan-elektrikal': 'elektronik',
    'mainan': 'bayi-anak', 'makanan-dan-minuman': 'dapur', 'makeup': 'kecantikan',
    'motor': 'motor-mobil', 'outdoor': 'outdoor-camping',
    'pakaian-dalam': 'fashion', 'pancing': 'olahraga', 'parfum': 'kecantikan',
    'penyimpanan-makanan': 'dapur', 'perhiasan': 'fashion',
    'perkakas': 'rumah', 'perlengkapan-ibadah': 'rumah',
    'perlengkapan-usaha': 'alat-tulis', 'pernikahan-dan-souvenir': 'rumah',
    'pertanian': 'taman', 'pertanian-dan-berkebun': 'taman',
    'pesta-dan-dekorasi': 'rumah', 'rambut': 'kecantikan',
    'sekolah-dan-atk': 'alat-tulis', 'sembako': 'dapur',
    'sepatu-dan-sandal': 'fashion', 'skincare': 'kecantikan',
    'skincare-dan-kecantikan': 'kecantikan', 'sparepart-mobil': 'motor-mobil',
    'sparepart-motor': 'motor-mobil', 'tanaman-hias': 'tanaman',
    'tas': 'fashion', 'tekstil-rumah': 'rumah', 'travel': 'outdoor-camping',
    'travel-dan-outdoor': 'outdoor-camping',
  };
  function catSlugify(cat) {
    return String(cat || '').toLowerCase()
      .replace(/&/g, 'dan').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function resolveCatSlug(cat) {
    var slug = catSlugify(cat);
    if (CAT_ICON_KNOWN[slug]) return slug;
    if (CAT_ICON_ALIAS[slug]) return CAT_ICON_ALIAS[slug];
    return slug;
  }
  // `cls` is the caller's own icon class. It MUST be passed rather than
  // string-replaced out of the result afterwards: the class name appears
  // twice (the span, and the onerror fallback), and String.replace with a
  // string pattern only swaps the first one — so callers that replaced it
  // kept a hardcoded 'ltk-cat-ico ltk-cat-ico--letter' in their fallback,
  // and `.ltk-cat-ico` has no CSS anywhere. The letter then rendered bare,
  // with no tile, background or centering. Hits any category whose art is
  // missing, which is 11 of the 18 canonical buckets (their slugs, e.g.
  // 'olahraga-dan-outdoor', match neither CAT_ICON_KNOWN nor CAT_ICON_ALIAS).
  function catIconHtml(cat, size, cls) {
    var px = size || 40;
    var klass = cls || 'ltk-cat-ico';
    var slug = resolveCatSlug(cat);
    var letter = esc(String(cat || '?').charAt(0).toUpperCase());
    // Art exists for the 19 shipped slugs; aliases cover the DB long-tail.
    // Degrade to a tinted letter rather than a blank tile.
    return '<span class="' + klass + '" style="width:' + px + 'px;height:' + px + 'px">' +
      '<img src="/images/onboarding/categories/' + attr(slug) + '.png" alt="" width="' + px + '" height="' + px + '" loading="lazy" ' +
      'onerror="this.parentNode.className=\'' + klass + ' ' + klass + '--letter\';' +
      'this.parentNode.style.width=\'' + px + 'px\';this.parentNode.style.height=\'' + px + 'px\';' +
      'this.parentNode.textContent=\'' + letter + '\';">' +
      '</span>';
  }
  function fmtAge(dateStr) {
    if (!dateStr) return '—';
    var diff = Date.now() - new Date(dateStr).getTime();
    var days = Math.floor(diff / 86400000);
    if (days < 0) return '—';
    if (days >= 365) {
      var y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
      return m ? (y + ' thn ' + m + ' bln') : (y + ' tahun');
    }
    if (days >= 30) return Math.floor(days / 30) + ' bulan';
    if (days >= 7) return Math.floor(days / 7) + ' minggu';
    return days + ' hari';
  }
  function fmtDayShort(d) {
    if (!d) return '';
    var dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
    if (isNaN(dt.getTime())) return String(d);
    var mons = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return dt.getDate() + ' ' + mons[dt.getMonth()];
  }
  function imgOr(src, cls) {
    if (!src) return '<div class="' + cls + '"></div>';
    return '<img class="' + cls + '" src="' + attr(src) + '" alt="" loading="lazy">';
  }

  /* ── delta presentation ──────────────────────────────────────────────────
     One place decides what a change looks like, so the stat strip and every
     table cell agree. `enough` is false when the window has too few snapshots
     to support a comparison — that prints "Baru", never 0% or a fake arrow. */

  function pctChange(cur, prev) {
    var c = Number(cur) || 0, p = Number(prev) || 0;
    if (!p) return null;                 // no baseline -> no percentage
    return ((c - p) / Math.abs(p)) * 100;
  }
  function deltaHtml(cur, prev, enough, opts) {
    opts = opts || {};
    if (!enough) return '<span class="ltk-d ltk-d--new">Baru</span>';
    var pct = pctChange(cur, prev);
    if (pct === null) return '<span class="ltk-d ltk-d--flat">—</span>';
    var r = Math.round(pct * 10) / 10;
    if (Math.abs(r) < 0.05) return '<span class="ltk-d ltk-d--flat">' + arrowSvg(0) + ' 0%</span>';
    // Lower is better for price: a falling average price is not a red flag.
    var good = opts.inverse ? r < 0 : r > 0;
    return '<span class="ltk-d ' + (good ? 'ltk-d--up' : 'ltk-d--down') + '">' +
      arrowSvg(r) + ' ' + Math.abs(r).toFixed(Math.abs(r) < 10 ? 1 : 0) + '%</span>';
  }
  function arrowSvg(v) {
    if (!v) return '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8"/></svg>';
    return v > 0
      ? '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5L6 2l3.5 3.5"/></svg>'
      : '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5L6 10l3.5-3.5"/></svg>';
  }
  function fmtRating(v) {
    var n = Number(v);
    return Number.isFinite(n) && n > 0 ? n.toFixed(1) : '—';
  }
  function rowKey(r) {
    return S.tab === 'store' ? String(r.shop_id) : String(r.keyword || '');
  }
  function rowLabel(r) {
    return S.tab === 'store' ? (r.store_name || ('Toko ' + r.shop_id)) : (r.keyword || '—');
  }
  function rowHasTrend(r) {
    return (Number(r.n_days) || 0) >= MIN_DAYS_FOR_TREND;
  }

  /* Sparkline as raw canvas — the same choice the Deep Dive competitor table
     makes. Chart.js for a 60x22 line would be a 200KB dependency per row. */
  function drawSpark(cv, series, up, metricKey) {
    if (!cv || !cv.getContext) return;
    var pts = (series || []).map(function (p) { return Number(p[metricKey || 'omset']) || 0; });
    if (pts.length < 2) return;
    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 68, h = cv.clientHeight || 24;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var span = (max - min) || 1;
    var pad = 3;
    ctx.beginPath();
    pts.forEach(function (v, i) {
      var x = pad + (i / (pts.length - 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / span) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = up ? '#16A34A' : '#DC2626';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  function paintSparks() {
    if (!host) return;
    host.querySelectorAll('[data-ltk-spark]').forEach(function (cv) {
      var key = cv.getAttribute('data-ltk-spark');
      var row = (S.rollup.rows || []).filter(function (r) { return rowKey(r) === key; })[0];
      if (!row) return;
      drawSpark(cv, row.series, (Number(row.omset) || 0) >= (Number(row.omset_prev) || 0));
    });
  }

  // The 3 metrics every stat block can show a trend for — omset/units up is
  // good (green), avg_price up is bad (red, mirrors deltaHtml's `inverse`).
  var STAT_METRICS = [
    { key: 'omset', label: 'Omset', fmt: function (r) { return fmtRp(r.omset || 0); }, inverse: false },
    { key: 'units', label: 'Unit', fmt: function (r) { return fmtUnits(r.units || 0); }, inverse: false },
    { key: 'avg_price', label: 'Harga', fmt: function (r) { return fmtRp(r.avg_price || 0); }, inverse: true },
  ];

  // Bordered stat box: label, value, delta, and its own mini trend line —
  // shared by the mobile card (cardHtml) and the Lihat Detail top row
  // (renderDetail), which differ only in canvas size. `rowKeyStr` lets
  // paintMetricSparks resolve the row again at paint time without storing
  // per-canvas closures.
  function metricStatBlockHtml(rowKeyStr, m, r, trend, cw, ch) {
    return '<div class="ltk-mstat">' +
      '<span class="ltk-mstat-lbl">' + esc(m.label) + '</span>' +
      '<span class="ltk-mstat-val">' + esc(m.fmt(r)) + '</span>' +
      deltaHtml(r[m.key], r[m.key + '_prev'], trend, { inverse: m.inverse }) +
      (trend
        ? '<canvas class="ltk-mstat-spark" data-ltk-mspark="' + attr(rowKeyStr) + '|' + attr(m.key) +
          '" width="' + cw + '" height="' + ch + '"></canvas>'
        : '') +
      '</div>';
  }

  function paintMetricSparks() {
    if (!host) return;
    host.querySelectorAll('[data-ltk-mspark]').forEach(function (cv) {
      var parts = cv.getAttribute('data-ltk-mspark').split('|');
      var key = parts[0], metricKey = parts[1];
      var row = (S.rollup.rows || []).filter(function (r) { return rowKey(r) === key; })[0];
      if (!row) return;
      var cur = Number(row[metricKey]) || 0, prev = Number(row[metricKey + '_prev']) || 0;
      var risen = cur >= prev;
      var favorable = metricKey === 'avg_price' ? !risen : risen;
      drawSpark(cv, row.series, favorable, metricKey);
    });
  }

  /* ── shell ──────────────────────────────────────────────────────────── */

  function buildShell() {
    host.className = 'ltk-root' + (host.className.indexOf('ltk-root') >= 0 ? '' : '');
    host.setAttribute('data-site', opts.site || 'a');
    host.innerHTML =
      '<div data-ltk-strip></div>' +
      '<header class="ltk-head">' +
        '<div class="ltk-head-main">' +
          '<span class="ltk-head-ico ltk-head-ico--mascot" aria-hidden="true">' +
            '<img src="/images/brand/appicon-bird.png" alt="" width="20" height="20" loading="lazy">' +
          '</span>' +
          '<div><h2 class="ltk-title">Pantauan</h2>' +
          '<p class="ltk-sub" data-ltk-sub></p></div>' +
        '</div>' +
        '<div class="ltk-head-actions" data-ltk-headact></div>' +
      '</header>' +
      '<div class="ltk-scopetabs" role="tablist" aria-label="Jenis pantauan" data-ltk-scopetabs></div>' +
      '<div class="ltk-chipbar" data-ltk-chipbar></div>' +
      '<section class="ltk-screen" data-ltk-screen="setup"></section>' +
      '<section class="ltk-screen" data-ltk-screen="collecting"></section>' +
      '<section class="ltk-screen" data-ltk-screen="rollup"></section>' +
      '<section class="ltk-screen" data-ltk-screen="detail"></section>' +
      '<section class="ltk-screen" data-ltk-screen="error"></section>';
  }

  function renderScopeTabs() {
    var bar = $('[data-ltk-scopetabs]');
    if (!bar) return;
    if (!S.configured || S.screen === 'setup' || S.screen === 'detail') { bar.innerHTML = ''; return; }
    var tabs = [
      { id: 'keyword', label: 'Produk', n: S.keywords.length },
      { id: 'store',   label: 'Toko',   n: S.stores.length },
    ];
    bar.innerHTML = tabs.map(function (t) {
      return '<button type="button" role="tab" class="ltk-scopetab' + (S.tab === t.id ? ' is-active' : '') +
        '" aria-selected="' + (S.tab === t.id) + '" data-ltk-tab="' + t.id + '">' +
        esc(t.label) + (t.n ? '<span class="ltk-scopetab-n">' + t.n + '</span>' : '') + '</button>';
    }).join('');
  }

  function showScreen(name) {
    // destroy() nulls the host; a promise chain that settles after teardown must
    // not throw. Every other DOM helper already guards, this was the one hole.
    if (!host) return;
    S.screen = name;
    var all = host.querySelectorAll('.ltk-screen');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.toggle('is-active', all[i].getAttribute('data-ltk-screen') === name);
    }
    renderHead();
    renderScopeTabs();
    renderChipbar();
  }

  function renderHead() {
    var sub = $('[data-ltk-sub]');
    var act = $('[data-ltk-headact]');
    if (sub) {
      var txt = '';
      if (!S.configured) {
        txt = 'Pilih keyword yang mau kami pantau tiap pagi untuk kamu.';
      } else if (S.screen === 'collecting') {
        txt = 'Update pertama masuk ' + nextUpdateLabel() + '.';
      } else {
        // The deltas/quiet screens already stamp as_of in their own window bar —
        // repeating it here just says the same date twice on one screen.
        var n = S.keywords.length, m = S.stores.length;
        txt = n + ' keyword' + (m ? ' dan ' + m + ' toko' : '') + ' dipantau tiap pagi.';
      }
      sub.textContent = txt;
    }
    if (act) {
      // The day-range picker now lives next to "Ringkasan ... Dipantau" in
      // renderRollup()'s panel head, not up here — it reads as part of that
      // summary, not a page-level setting.
      act.innerHTML = S.configured && S.screen !== 'setup'
        ? '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="setup">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/>' +
            '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
            'Pengaturan Pantauan</button>'
        : '';
    }
  }

  function winSelectHtml() {
    return '<label class="ltk-sr">Rentang waktu' +
      '<select class="ltk-select" data-ltk-winsel>' +
      [7, 30, 60, 90].map(function (d) {
        return '<option value="' + d + '"' + (S.windowDays === d ? ' selected' : '') + '>' +
          d + ' Hari Terakhir</option>';
      }).join('') + '</select></label>';
  }

  function renderChipbar() {
    var bar = $('[data-ltk-chipbar]');
    if (!bar) return;
    if (!S.configured || S.screen === 'setup' || S.screen === 'detail') { bar.innerHTML = ''; return; }
    var h = '';
    S.keywords.forEach(function (k) {
      h += '<button type="button" class="ltk-chip" data-ltk-kw="' + attr(k.keyword) + '">' +
             catIconHtml(k.category, 18, 'ltk-chip-ico') +
             '<span class="ltk-chip-lbl">' + esc(k.keyword) + '</span></button>';
    });
    S.stores.forEach(function (st) {
      h += '<button type="button" class="ltk-chip ltk-chip--store" data-ltk-store="' + attr(st.shop_id) + '">' +
             '<span class="ltk-chip-lbl">' + esc(st.store_name || ('Toko ' + st.shop_id)) + '</span></button>';
    });
    var free = Math.max(0, S.keywordLimit - S.keywords.length);
    if (free > 0) {
      // Quiet on purpose. A badge or a red dot turns a gentle pull into day-2 noise.
      h += '<button type="button" class="ltk-chip ltk-chip--add" data-ltk-act="setup">' +
             '+ ' + free + ' slot kosong</button>';
    }
    bar.innerHTML = h;
  }

  function renderStrip() {
    var el = $('[data-ltk-strip]');
    if (!el) return;
    var ack = lsRead().resumedAckAt || 0;
    var sameDay = ack && (Date.now() - ack) < 86400000;
    if (S.resumed && !sameDay) {
      el.innerHTML =
        '<div class="ltk-strip ltk-strip--resumed">' +
          '<span class="ltk-strip-ico" aria-hidden="true">&#10022;</span>' +
          '<div class="ltk-strip-body"><b>Selamat datang kembali — pantauan kamu jalan lagi.</b>' +
          '<span>Keyword kamu tidak hilang. Kami mulai kumpulkan lagi ' + esc(nextUpdateLabel()) + '.</span></div>' +
          '<button type="button" class="ltk-strip-x" data-ltk-act="strip-close" aria-label="Tutup">&times;</button>' +
        '</div>';
    } else if (S.paused) {
      el.innerHTML =
        '<div class="ltk-strip ltk-strip--warn">' +
          '<span class="ltk-strip-ico" aria-hidden="true">!</span>' +
          '<div class="ltk-strip-body"><b>Pantauan kamu sedang dijeda.</b>' +
          '<span>Muat ulang halaman untuk mengaktifkan lagi.</span></div>' +
        '</div>';
    } else {
      el.innerHTML = '';
    }
  }

  /* ── setup screen ───────────────────────────────────────────────────── */

  /* Setup is now search-first. The old 19-tile category grid was the primary
     control, which forced everyone through a taxonomy before they could name
     the thing they actually wanted to watch. Category is still here, demoted to
     an optional filter on the suggestions.

     Three slots arrive pre-filled from seedDraft(); the remaining slots are
     typeahead inputs, so typing one letter is enough to get somewhere. */

  function slotSuggestHtml(idx) {
    var sug = draft.sug;
    if (sug.slot !== idx) return '';
    if (sug.busy) return '<div class="ltk-sug"><div class="ltk-sug-note">Mencari…</div></div>';
    if (!sug.q || sug.q.length < 1) {
      return '<div class="ltk-sug"><div class="ltk-sug-note">Ketik minimal 1 huruf' +
        (draft.cat ? ' — difilter ke ' + esc(draft.cat) : '') + '.</div></div>';
    }
    if (!sug.rows.length) {
      return '<div class="ltk-sug"><div class="ltk-sug-note">Tidak ada yang cocok dengan "' +
        esc(sug.q) + '". Tekan Enter untuk pantau apa adanya.</div></div>';
    }
    return '<div class="ltk-sug ltk-sug--cards" role="listbox">' +
      '<div class="ltk-sug-grid">' + sug.rows.map(function (r) {
        var meta = [];
        if (r.n_sellers) meta.push(fmtUnits(r.n_sellers) + ' penjual');
        if (r.price_median) meta.push('median ' + fmtRp(r.price_median));
        return '<button type="button" class="ltk-sug-card" role="option" ' +
          'data-ltk-sugpick="' + attr(r.keyword) + '" data-ltk-sugcat="' + attr(r.category || '') + '">' +
          imgOr(r.rep_image_url || r.image_url || '', 'ltk-sug-card-img') +
          '<span class="ltk-sug-kw">' + esc(r.keyword) + '</span>' +
          (meta.length ? '<span class="ltk-sug-meta">' + esc(meta.join(' · ')) + '</span>' : '') +
          '</button>';
      }).join('') + '</div></div>';
  }

  function storeCatSelectHtml() {
    return '<label class="ltk-sr ltk-catsel">Kategori toko' +
      '<select class="ltk-select" data-ltk-storecatsel' +
        (draft.stores.length >= S.storeLimit ? ' disabled' : '') + '>' +
        '<option value="">Pilih kategori…</option>' +
        (S.categories || []).map(function (c) {
          return '<option value="' + attr(c) + '"' + (draft.storeCat === c ? ' selected' : '') + '>' +
            esc(c) + '</option>';
        }).join('') +
      '</select></label>';
  }

  function storeCatListHtml() {
    if (!draft.storeCat) return '';
    if (draft.storeCatBusy) return '<div class="ltk-sug ltk-sug--static"><div class="ltk-sug-note">Mencari toko…</div></div>';
    var already = {};
    draft.stores.forEach(function (s) { already[String(s.shop_id)] = true; });
    var rows = draft.storeCatRows.filter(function (r) { return !already[String(r.shop_id)]; });
    if (!rows.length) {
      return '<div class="ltk-sug ltk-sug--static"><div class="ltk-sug-note">' +
        'Belum ada toko yang cukup aktif di kategori "' + esc(draft.storeCat) + '".</div></div>';
    }
    return '<div class="ltk-sug ltk-sug--static" role="listbox">' + rows.map(function (r) {
      return '<button type="button" class="ltk-sug-opt" role="option" data-ltk-pickstore="' +
        attr(r.shop_id) + '" data-ltk-storename="' + attr(r.store_name) + '">' +
        '<span class="ltk-sug-kw">' + esc(r.store_name) + '</span>' +
        '<span class="ltk-sug-meta">' + esc(fmtUnits(r.total_sold || 0)) + ' terjual' +
        (r.n_listings ? ' · ' + esc(r.n_listings) + ' produk' : '') + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function storeSuggestHtml() {
    var sug = draft.sug;
    if (sug.kind !== 'store' || sug.slot !== -2) return '';
    if (sug.busy) return '<div class="ltk-sug"><div class="ltk-sug-note">Mencari toko…</div></div>';
    if (!sug.rows.length) {
      return sug.q
        ? '<div class="ltk-sug"><div class="ltk-sug-note">Toko "' + esc(sug.q) + '" tidak ketemu.</div></div>'
        : '';
    }
    return '<div class="ltk-sug" role="listbox">' + sug.rows.map(function (r) {
      return '<button type="button" class="ltk-sug-opt" role="option" data-ltk-pickstore="' +
        attr(r.shop_id) + '" data-ltk-storename="' + attr(r.store_name) + '">' +
        '<span class="ltk-sug-kw">' + esc(r.store_name) + '</span>' +
        (r.n_products ? '<span class="ltk-sug-meta">' + esc(r.n_products) + ' produk</span>' : '') +
        '</button>';
    }).join('') + '</div>';
  }

  var PROMISE_ICONS = {
    trend: '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
    cart:  '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12h11L21 7H6"/>',
    star:  '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0"/><path d="M16 5.5a3.2 3.2 0 010 5.6M18 20a6.4 6.4 0 00-2.2-4.8"/>',
    box:   '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tag:   '<path d="M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  };
  function svgIco(icon) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (PROMISE_ICONS[icon] || '') + '</svg>';
  }
  function promiseItem(icon, title, sub) {
    return '<li class="ltk-promise-item">' +
      '<span class="ltk-promise-ico">' + svgIco(icon) + '</span>' +
      '<span class="ltk-promise-txt"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></span>' +
      '</li>';
  }

  /* ── The metric catalogue ───────────────────────────────────────────────
     Keys map 1:1 onto columns get_tracker_rollup already returns, so choosing
     metrics is a display decision — every one of these is collected for every
     tracked keyword regardless. Ticking one later shows its full history
     immediately, which is why nothing here warns about "starting to collect". */
  var METRICS = [
    { key: 'units',  icon: 'cart',  label: 'Units Terjual',   sub: 'Jumlah unit terjual per hari' },
    { key: 'omset',  icon: 'trend', label: 'Omset (Rp)',      sub: 'Total pendapatan per hari' },
    { key: 'sku',    icon: 'box',   label: 'SKU / Produk',    sub: 'Jumlah SKU aktif' },
    { key: 'toko',   icon: 'users', label: 'Toko Aktif',      sub: 'Jumlah toko penjual' },
    { key: 'harga',  icon: 'tag',   label: 'Harga Rata-rata', sub: 'Rata-rata harga jual' },
    { key: 'rating', icon: 'star',  label: 'Rating & Ulasan', sub: 'Rata-rata rating & total ulasan' },
  ];
  function metricLabel(key) {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].key === key) return METRICS[i].label;
    return key;
  }

  /* ── Wizard ─────────────────────────────────────────────────────────────
     Most people arrive here from a Deep Dive by tapping "Pantau Produk Ini",
     so the first thing they should see is that product ALREADY in the list,
     not an empty form asking them to retype what they were just looking at.
     The steps exist to make the deal legible: what we watch, what you get
     back, and the optional store upsell — in that order, because "what data
     do I get" is the question a seller has before "do I also want the shop". */
  var STEPS = [
    { key: 'keyword', label: 'Produk',   sub: 'Apa yang dipantau' },
    { key: 'metrik',  label: 'Metrik',   sub: 'Data yang kamu mau' },
    { key: 'toko',    label: 'Toko',     sub: 'Opsional' },
    { key: 'selesai', label: 'Selesai',  sub: 'Aktif tiap pagi' },
  ];

  function stepperHtml() {
    return '<ol class="ltk-steps">' + STEPS.map(function (s, i) {
      var state = i < draft.step ? ' is-done' : (i === draft.step ? ' is-current' : '');
      return '<li class="ltk-step' + state + '">' +
        '<span class="ltk-step-n">' + (i < draft.step ? '&#10003;' : (i + 1)) + '</span>' +
        '<span class="ltk-step-txt"><b>' + esc(s.label) + '</b><span>' + esc(s.sub) + '</span></span>' +
        '</li>';
    }).join('') + '</ol>';
  }

  // Persistent right rail: what you will be getting, updating as they choose.
  function previewHtml() {
    var chips = draft.metrics.slice(0, 4).map(function (m) {
      return '<span class="ltk-pvchip">' + esc(metricLabel(m).split(' ')[0]) + '</span>';
    }).join('');
    var extra = draft.metrics.length > 4
      ? '<span class="ltk-pvchip ltk-pvchip--more">+' + (draft.metrics.length - 4) + '</span>' : '';

    var rows = draft.picked.map(function (k) {
      return '<li class="ltk-pvrow">' +
        catIconHtml(k.category, 30, 'ltk-pv-ico') +
        '<span class="ltk-pvname">' + esc(k.keyword) + '</span>' +
        '<span class="ltk-pvchips">' + chips + extra + '</span>' +
        '</li>';
    }).join('');

    var storeRows = draft.stores.map(function (st) {
      return '<li class="ltk-pvrow">' +
        '<span class="ltk-pv-ico ltk-pv-ico--letter">' +
        esc(String(st.store_name || 'T').charAt(0).toUpperCase()) + '</span>' +
        '<span class="ltk-pvname">' + esc(st.store_name) +
          (st.n_products ? '<em>' + esc(st.n_products) + ' SKU</em>' : '') + '</span>' +
        '<span class="ltk-pvchips">' + chips + extra + '</span>' +
        '</li>';
    }).join('');

    var body = (rows || storeRows)
      ? '<ul class="ltk-pvlist">' + rows + storeRows + '</ul>'
      : '<p class="ltk-pvempty">Belum ada yang dipilih. Tambahkan keyword di sebelah kiri.</p>';

    return '<aside class="ltk-preview">' +
      '<div class="ltk-pvhead">Preview pantauan kamu</div>' + body +
      '<p class="ltk-pvfoot">Dilacak setiap pagi &middot; update pertama <b>' +
        esc(nextUpdateLabel()) + '</b></p>' +
      '</aside>';
  }

  function stepKeywordHtml() {
    // Arriving from a Deep Dive's "Pantau Produk Ini" gets the card-grid
    // picker (the product you were just looking at, plus similar-category
    // pasar cards to fill the rest of the slots) instead of the plain
    // typeahead — a seller picking a first watchlist from a product they
    // already care about thinks in "products like this", not raw keyword text.
    // Editing an existing configuration (no seed) keeps the typeahead as-is.
    if (draft.seed) return stepKeywordPickerHtml();
    var freeK = Math.max(0, S.keywordLimit - draft.picked.length);
    var catSelect =
      '<label class="ltk-sr ltk-catsel">Kategori' +
        '<select class="ltk-select" data-ltk-catsel>' +
          '<option value="">Semua kategori</option>' +
          (S.categories || []).map(function (c) {
            return '<option value="' + attr(c) + '"' + (draft.cat === c ? ' selected' : '') + '>' +
              esc(c) + '</option>';
          }).join('') +
        '</select>' +
      '</label>';

    var slots = '';
    draft.picked.forEach(function (k) {
      var err = draft.errors[k.keyword];
      var seeded = draft.seed && String(draft.seed.keyword || '').toLowerCase() === String(k.keyword).toLowerCase();
      var thumb = k.image_url
        ? '<img class="ltk-slot-ico" src="' + attr(k.image_url) + '" alt="" loading="lazy" decoding="async" ' +
          'referrerpolicy="no-referrer" onerror="this.remove()">'
        : catIconHtml(k.category, 26, 'ltk-slot-ico');
      slots += '<li class="ltk-slot ltk-slot--filled' + (err ? ' ltk-slot--err' : '') + '">' +
        thumb +
        '<span class="ltk-slot-body"><span class="ltk-slot-kw">' + esc(k.keyword) +
          (seeded ? '<span class="ltk-seedtag">dari produk yang kamu buka</span>' : '') + '</span>' +
        '<span class="ltk-slot-meta">' + esc(err || k.meta || k.category || 'Dipantau tiap pagi') + '</span></span>' +
        '<button type="button" class="ltk-slot-x" data-ltk-rm="' + attr(k.keyword) + '" ' +
        'aria-label="Hapus ' + attr(k.keyword) + '">&times;</button></li>';
    });
    for (var i = 0; i < freeK; i++) {
      var idx = draft.picked.length + i;
      var open = draft.sug.kind === 'keyword' && draft.sug.slot === idx;
      slots += '<li class="ltk-slot ltk-slot--type' + (open ? ' is-open' : '') + '">' +
        '<span class="ltk-slot-plus" aria-hidden="true">+</span>' +
        '<div class="ltk-slot-typewrap">' +
          '<input type="text" class="ltk-input ltk-slot-input" data-ltk-slot="' + idx + '" ' +
          'placeholder="Ketik keyword — mis. rak dinding kayu" autocomplete="off" ' +
          'aria-label="Cari keyword untuk slot ' + (idx + 1) + '"' +
          (open ? ' value="' + attr(draft.sug.q) + '"' : '') + '>' +
          slotSuggestHtml(idx) +
        '</div></li>';
    }

    return '<div class="ltk-stephead">' +
        '<h3>Apa yang mau kamu pantau?</h3>' +
        '<p>' + (draft.seed
          ? 'Kami sudah masukkan produk yang barusan kamu buka. Tambah lagi kalau mau — maksimal ' + S.keywordLimit + '.'
          : 'Ketik keyword yang kamu incar — kami tunjukkan yang cocok beserta jumlah penjualnya.') + '</p>' +
      '</div>' +
      '<div class="ltk-slotsec">' +
        '<div class="ltk-slotsec-head"><span>Keyword kamu</span>' + catSelect +
          '<span class="ltk-count">' + draft.picked.length + ' / ' + S.keywordLimit + '</span>' +
        '</div>' +
        '<ul class="ltk-slots">' + slots + '</ul>' +
      '</div>' +
      '<p class="ltk-tips"><b>Tips:</b> keyword spesifik memberi hasil lebih akurat. ' +
      '"alat latihan tangan adjustable" lebih baik daripada "alat fitness".</p>';
  }

  /* ── Seeded keyword step: card grid + "+" similar-category picker ──────
     draft.picked[0] is always the seed product (openSetup unshifts it before
     this step ever renders). Slots 1..keywordLimit-1 are either an already
     picked pasar card or an outlined "+" placeholder; tapping any placeholder
     opens pickerPanelHtml() below the grid. */
  function pickSlotMediaHtml(k) {
    if (k && k.image_url) {
      var letter = esc(String((k.keyword || '?')).charAt(0).toUpperCase());
      var slug = resolveCatSlug(k.category || '');
      return '<span class="ltk-pick-slot-media" data-cat="' + attr(slug) + '" data-letter="' + attr(letter) + '">' +
        '<img src="' + attr(k.image_url) + '" alt="" loading="lazy" decoding="async" ' +
        'referrerpolicy="no-referrer" ' +
        'onerror="var p=this.parentNode;var s=p.getAttribute(\'data-cat\')||\'\';' +
        'var L=p.getAttribute(\'data-letter\')||\'?\';this.remove();' +
        'var i=document.createElement(\'img\');i.alt=\'\';i.loading=\'lazy\';' +
        'i.src=\'/images/onboarding/categories/\'+s+\'.png\';' +
        'i.onerror=function(){p.className=\'ltk-pick-slot-media ltk-pick-slot-media--letter\';p.textContent=L;};' +
        'p.appendChild(i);">' +
        '</span>';
    }
    return '<span class="ltk-pick-slot-media ltk-pick-slot-media--cat">' +
      catIconHtml(k && k.category, 56, 'ltk-pick-slot-ico') +
      '</span>';
  }

  function stepKeywordPickerHtml() {
    // Best-effort: fill in product photos for any picks still on the category
    // glyph (seed arrived without image_url, or baseline hasn't resolved yet).
    loadPickedImages();
    var slots = [];
    for (var i = 0; i < S.keywordLimit; i++) {
      var k = draft.picked[i];
      if (k) {
        var err = draft.errors[k.keyword];
        var isSeed = draft.seed &&
          String(k.keyword).toLowerCase() === String(draft.seed.keyword || '').toLowerCase();
        slots.push(
          '<div class="ltk-pick-slot ltk-pick-slot--filled' + (err ? ' ltk-slot--err' : '') + '">' +
            pickSlotMediaHtml(k) +
            '<span class="ltk-pick-slot-name">' + esc(k.keyword) + '</span>' +
            (isSeed ? '<span class="ltk-pick-slot-tag">Produk ini</span>' : '') +
            '<button type="button" class="ltk-pick-slot-x" data-ltk-rm="' + attr(k.keyword) + '" ' +
            'aria-label="Hapus ' + attr(k.keyword) + '">&times;</button>' +
          '</div>'
        );
      } else {
        slots.push(
          '<button type="button" class="ltk-pick-slot ltk-pick-slot--empty" data-ltk-picker-open="1" ' +
          'aria-label="Tambah pasar mirip">' +
            '<span class="ltk-pick-slot-plus" aria-hidden="true">+</span>' +
            '<span class="ltk-pick-slot-add-lbl">Tambah</span>' +
          '</button>'
        );
      }
    }
    return '<div class="ltk-stephead">' +
        '<h3>Apa yang mau kamu pantau?</h3>' +
        '<p>Kami sudah masukkan produk yang barusan kamu buka. Isi slot lain dengan pasar mirip — maksimal ' +
        S.keywordLimit + '.</p>' +
      '</div>' +
      '<div class="ltk-slotsec">' +
        '<div class="ltk-slotsec-head"><span>Pasar kamu</span>' +
          '<span class="ltk-count">' + draft.picked.length + ' / ' + S.keywordLimit + '</span>' +
        '</div>' +
        '<div class="ltk-pick-grid">' + slots.join('') + '</div>' +
      '</div>' +
      pickerPanelHtml();
  }

  function pickerCardHtml(r) {
    var metaParts = [];
    if (r.n_sellers) metaParts.push(fmtUnits(r.n_sellers) + ' penjual');
    if (r.total_sold_sum) metaParts.push(fmtUnits(r.total_sold_sum) + ' terjual');
    return '<button type="button" class="ltk-disc-card" data-ltk-picker-pick="' + attr(r.keyword) + '" ' +
      'data-ltk-picker-cat="' + attr(r.category || '') + '">' +
      imgOr(r.rep_image_url, '') +
      '<span class="ltk-disc-name">' + esc(r.keyword) + '</span>' +
      (metaParts.length ? '<span class="ltk-disc-meta">' + esc(metaParts.join(' · ')) + '</span>' : '') +
      '</button>';
  }

  function pickerPanelHtml() {
    if (!draft.pickerOpen) return '';
    var seedCat = (draft.seed && draft.seed.category) || '';
    var already = {};
    draft.picked.forEach(function (k) { already[String(k.keyword).toLowerCase()] = 1; });
    var visible = (draft.pickerRows || []).filter(function (r) {
      return !already[String(r.keyword).toLowerCase()];
    });
    var body = draft.pickerBusy
      ? '<p class="ltk-sug-note">Mencari…</p>'
      : (visible.length
          ? '<div class="ltk-disc-grid">' + visible.map(pickerCardHtml).join('') + '</div>'
          : '<p class="ltk-sug-note">' + (draft.pickerQ ? 'Tidak ketemu "' + esc(draft.pickerQ) + '".' : 'Belum ada pasar untuk ditampilkan.') + '</p>');
    return '<div class="ltk-picker-panel">' +
      '<div class="ltk-picker-head">' +
        '<input type="text" class="ltk-input" data-ltk-picker-input ' +
        'placeholder="Cari kategori atau produk lain…" autocomplete="off" ' +
        'aria-label="Cari pasar" value="' + attr(draft.pickerQ) + '">' +
        '<button type="button" class="ltk-picker-close" data-ltk-picker-close aria-label="Tutup">&times;</button>' +
      '</div>' +
      (seedCat && !draft.pickerQ
        ? '<p class="ltk-picker-hint">Mirip dengan kategori <b>' + esc(seedCat) + '</b></p>' : '') +
      body +
    '</div>';
  }

  function openPicker() {
    draft.pickerOpen = true;
    draft.pickerQ = '';
    renderSetup();
    loadPickerDefault();
  }

  function closePicker() {
    draft.pickerOpen = false;
    draft.pickerQ = '';
    draft.pickerRows = [];
    draft.pickerBusy = false;
    renderSetup();
  }

  function loadPickerDefault() {
    var cat = (draft.seed && draft.seed.category) || '';
    if (!cat) { draft.pickerRows = []; renderSetup(); return; }
    draft.pickerBusy = true;
    renderSetup();
    callP('getCategoryKeywords', cat, 24).then(function (rows) {
      if (draft.pickerQ) return; // a search started while this was in flight
      draft.pickerBusy = false;
      draft.pickerRows = rows || [];
      renderSetup();
    });
  }

  function runPickerSearch(q) {
    var query = String(q || '').trim();
    draft.pickerQ = query;
    if (!query) { loadPickerDefault(); return; }
    draft.pickerBusy = true;
    renderSetup();
    callP('searchKeywords', { q: query, limit: 24 }).then(function (rows) {
      if (draft.pickerQ !== query) return; // superseded by a newer keystroke
      draft.pickerBusy = false;
      draft.pickerRows = rows || [];
      renderSetup();
    });
  }

  function pickFromPicker(kw, cat) {
    var norm = String(kw || '').trim().toLowerCase();
    if (!norm || draft.picked.length >= S.keywordLimit) return;
    if (draft.picked.some(function (k) { return String(k.keyword).toLowerCase() === norm; })) return;
    var hit = (draft.pickerRows || []).filter(function (r) {
      return String(r.keyword || '').toLowerCase() === norm;
    })[0] || {};
    draft.picked.push({
      keyword: String(kw).trim(),
      category: cat || hit.category || '',
      image_url: hit.rep_image_url || hit.image_url || hit.top_image || '',
      meta: hit.n_sellers ? (fmtUnits(hit.n_sellers) + ' penjual') : '',
    });
    if (draft.picked.length >= S.keywordLimit) closePicker();
    else renderSetup();
  }

  function stepMetrikHtml() {
    var cards = METRICS.map(function (m) {
      var on = draft.metrics.indexOf(m.key) >= 0;
      return '<button type="button" class="ltk-mcard' + (on ? ' is-on' : '') + '" ' +
        'data-ltk-metric="' + attr(m.key) + '" aria-pressed="' + on + '">' +
        '<span class="ltk-mcard-ico">' + svgIco(m.icon) + '</span>' +
        '<span class="ltk-mcard-txt"><b>' + esc(m.label) + '</b><span>' + esc(m.sub) + '</span></span>' +
        '<span class="ltk-mcard-tick" aria-hidden="true">&#10003;</span>' +
        '</button>';
    }).join('');
    return '<div class="ltk-stephead">' +
        '<h3>Data apa yang kamu mau lihat?</h3>' +
        '<p>Kami mengukur semuanya tiap pagi — ini cuma memilih kolom mana yang tampil di tabel kamu. ' +
        'Bisa diubah kapan saja.</p>' +
      '</div>' +
      '<div class="ltk-mgrid">' + cards + '</div>' +
      (draft.metrics.length === 0
        ? '<p class="ltk-tips ltk-tips--warn">Pilih minimal satu metrik.</p>' : '');
  }

  function stepTokoHtml() {
    var seedShop = draft.seed && draft.seed.shop_id ? draft.seed : null;
    var already = seedShop && draft.stores.some(function (s) {
      return String(s.shop_id) === String(seedShop.shop_id); });

    // The upsell: they were just looking at this product, so its shop is the
    // single most likely store they care about. Show its size so "track this
    // shop" is a decision with a number behind it, not a blind yes.
    var offer = (seedShop && !already)
      ? '<div class="ltk-shopoffer">' +
          '<div class="ltk-shopoffer-main">' +
            '<span class="ltk-pv-ico ltk-pv-ico--letter">' +
              esc(String(seedShop.store_name || 'T').charAt(0).toUpperCase()) + '</span>' +
            '<div><b>' + esc(seedShop.store_name || 'Toko produk ini') + '</b>' +
            '<span>' + (draft.seedShopSkus == null
              ? 'Toko dari produk yang kamu buka'
              : esc(draft.seedShopSkus) + ' produk aktif di toko ini') + '</span></div>' +
          '</div>' +
          '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="add-seed-store">' +
            'Pantau toko ini</button>' +
        '</div>'
      : '';

    var storeSlots = draft.stores.map(function (st) {
      return '<li class="ltk-slot ltk-slot--filled">' +
        '<span class="ltk-pv-ico ltk-pv-ico--letter">' +
          esc(String(st.store_name || 'T').charAt(0).toUpperCase()) + '</span>' +
        '<span class="ltk-slot-body"><span class="ltk-slot-kw">' + esc(st.store_name) + '</span>' +
        '<span class="ltk-slot-meta">' + (st.n_products ? esc(st.n_products) + ' produk aktif' : 'Toko') +
        '</span></span>' +
        '<button type="button" class="ltk-slot-x" data-ltk-rmstore="' + attr(st.shop_id) + '" ' +
        'aria-label="Hapus toko">&times;</button></li>';
    }).join('');

    return '<div class="ltk-stephead">' +
        '<h3>Mau pantau toko juga? <em>(opsional)</em></h3>' +
        '<p>Pantau toko untuk lihat berapa SKU yang mereka jalankan, berapa yang laku, ' +
        'dan kapan mereka menambah produk baru. Boleh dilewati.</p>' +
      '</div>' + offer +
      '<div class="ltk-slotsec">' +
        '<div class="ltk-slotsec-head"><span>Toko yang dipantau</span>' +
        '<span class="ltk-count">' + draft.stores.length + ' / ' + S.storeLimit + '</span></div>' +
        '<div class="ltk-storefind">' +
          '<input type="text" class="ltk-input" data-ltk-storeinput ' +
          'placeholder="Cari nama toko" autocomplete="off"' +
          (draft.stores.length >= S.storeLimit ? ' disabled' : '') + '>' +
          storeSuggestHtml() +
        '</div>' +
        '<div class="ltk-storebycat">' +
          '<div class="ltk-storebycat-lbl">Atau pilih dari kategori</div>' +
          storeCatSelectHtml() + storeCatListHtml() +
        '</div>' +
        (storeSlots ? '<ul class="ltk-slots">' + storeSlots + '</ul>' : '') +
      '</div>';
  }

  function stepSelesaiHtml() {
    return '<div class="ltk-stephead">' +
        '<h3>Siap dipantau</h3>' +
        '<p>Mulai besok pagi kamu akan lihat apa yang berubah dari hari ke hari.</p>' +
      '</div>' +
      '<ul class="ltk-promise">' +
        draft.metrics.map(function (k) {
          for (var i = 0; i < METRICS.length; i++) {
            if (METRICS[i].key === k) return promiseItem(METRICS[i].icon, METRICS[i].label, METRICS[i].sub);
          }
          return '';
        }).join('') +
      '</ul>' +
      '<p class="ltk-promise-foot">Kami scrape keyword kamu tiap pagi dan bandingkan dengan hari ' +
      'sebelumnya. Update pertama <b>' + esc(nextUpdateLabel()) + '</b>.</p>';
  }

  function wizFootHtml() {
    var last = draft.step === STEPS.length - 1;
    var nothing = draft.picked.length === 0 && draft.stores.length === 0;
    var blocked = (draft.step === 0 && draft.picked.length === 0) ||
                  (draft.step === 1 && draft.metrics.length === 0);
    var nextLabel = draft.step === 0 ? 'Lanjut ke Metrik'
                  : draft.step === 1 ? 'Lanjut ke Toko (opsional)'
                  : 'Lanjut';
    return '<div class="ltk-wizfoot">' +
      (draft.step > 0
        ? '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="step-back">Kembali</button>'
        : '<span></span>') +
      (last
        ? '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="commit"' +
          (nothing || draft.busy ? ' disabled' : '') + '>' +
          (draft.busy ? 'Menyimpan...' : 'Aktifkan pantauan') + '</button>'
        : '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="step-next"' +
          (blocked ? ' disabled' : '') + '>' + nextLabel + ' &rarr;</button>') +
      '</div>';
  }

  function renderSetup() {
    var p = pane('setup');
    if (!p) return;
    var stepHtml = draft.step === 0 ? stepKeywordHtml()
                 : draft.step === 1 ? stepMetrikHtml()
                 : draft.step === 2 ? stepTokoHtml()
                 : stepSelesaiHtml();

    p.innerHTML =
      '<div class="ltk-setup">' +
        '<div class="ltk-setup-head">' + stepperHtml() +
          '<button type="button" class="ltk-setup-close" data-ltk-act="cancel-setup" aria-label="Tutup pengaturan pantauan" title="Tutup">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="ltk-wizard">' +
          '<div class="ltk-wizmain">' + stepHtml + wizFootHtml() + '</div>' +
          previewHtml() +
        '</div>' +
      '</div>';

    // Re-focus the slot the user was typing in — innerHTML replacement loses it.
    if (draft.step === 0 && draft.sug.kind === 'keyword' && draft.sug.slot >= 0) {
      var el = $('[data-ltk-slot="' + draft.sug.slot + '"]');
      if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} }
    }
    // Same problem for the picker's search input — every debounced keystroke
    // re-renders the whole step, which would otherwise kick focus out after
    // a single character.
    if (draft.step === 0 && draft.pickerOpen) {
      var pel = $('[data-ltk-picker-input]');
      if (pel) { pel.focus(); try { pel.setSelectionRange(pel.value.length, pel.value.length); } catch (_) {} }
    }
  }


  /* ── collecting screen ──────────────────────────────────────────────── */

  function renderCollecting() {
    var p = pane('collecting');
    if (!p) return;
    var n = S.keywords.length;
    var rows = (S.baseline || []).map(function (b) {
      return '<li class="ltk-baseline-row">' +
        imgOr(b.top_image, 'ltk-baseline-img') +
        '<div class="ltk-baseline-main">' +
          '<div class="ltk-baseline-kw">' + esc(b.keyword) + '</div>' +
          (b.top_name ? '<div class="ltk-baseline-top">Terlaris sekarang: ' + esc(b.top_name) + '</div>' : '') +
        '</div>' +
        '<div class="ltk-baseline-stats">' +
          (b.n_sellers ? '<span><b>' + esc(b.n_sellers) + '</b> penjual</span>' : '') +
          (b.price_median ? '<span>median <b>' + esc(fmtRp(b.price_median)) + '</b></span>' : '') +
        '</div></li>';
    }).join('');

    p.innerHTML =
      '<div class="ltk-collect">' +
        '<div class="ltk-collect-hero">' +
          '<span class="ltk-collect-ico" aria-hidden="true">' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/>' +
            '<path d="M7 17a5 5 0 0110 0"/><path d="M3 21h18"/></svg>' +
          '</span>' +
          '<div><h3>Pantauan kamu sudah aktif</h3>' +
          '<p>Kami mulai kumpulkan data untuk ' + n + ' keyword kamu. ' +
          'Update pertama masuk <b>' + esc(nextUpdateLabel()) + '</b>.</p></div>' +
        '</div>' +
        (rows ?
          '<div class="ltk-baseline">' +
            '<div class="ltk-baseline-head"><span>Kondisi keyword kamu hari ini</span>' +
            '<span class="ltk-baseline-note">Ini titik awalnya — besok kami tunjukkan apa yang berubah dari sini.</span></div>' +
            '<ul class="ltk-baseline-list">' + rows + '</ul>' +
          '</div>' : '') +
        discoverHtml() +
      '</div>';
  }

  /* ── rollup screen (the Robinhood table) ─────────────────────────────────
     One dense row per tracked keyword or shop: what it did this window, how
     that compares to the window before, and a sparkline. Everything the eye
     needs in one pass, which is the whole point of the layout.

     Rows with too little history print "Baru" rather than a fake percentage —
     see MIN_DAYS_FOR_TREND and the honesty rule at the top of this file.      */

  function sortedRows() {
    var rows = (S.rollup.rows || []).slice();
    var by = {
      omset: function (r) { return -(Number(r.omset) || 0); },
      units: function (r) { return -(Number(r.units) || 0); },
      sku:   function (r) { return -(Number(r.n_listings) || 0); },
      toko:  function (r) { return -(Number(r.n_sellers) || 0); },
      harga: function (r) { return -(Number(r.avg_price) || 0); },
    }[S.sort];
    if (S.sort === 'nama') {
      rows.sort(function (a, b) { return rowLabel(a).localeCompare(rowLabel(b), 'id'); });
    } else if (by) {
      rows.sort(function (a, b) { return by(a) - by(b); });
    }
    return rows;
  }

  function rowHtml(r) {
    var key = rowKey(r);
    var trend = rowHasTrend(r);
    var isKw = S.tab !== 'store';
    var cells =
      '<td class="ltk-num"><b>' + esc(fmtUnits(r.units || 0)) + '</b>' +
        deltaHtml(r.units, r.units_prev, trend) + '</td>' +
      '<td class="ltk-num"><b>' + esc(fmtRp(r.omset || 0)) + '</b>' +
        deltaHtml(r.omset, r.omset_prev, trend) + '</td>' +
      '<td class="ltk-num"><b>' + esc(fmtUnits(r.n_listings || 0)) + '</b>' +
        deltaHtml(r.n_listings, r.n_listings_prev, trend) + '</td>' +
      (isKw
        ? '<td class="ltk-num"><b>' + esc(fmtUnits(r.n_sellers || 0)) + '</b>' +
          deltaHtml(r.n_sellers, r.n_sellers_prev, trend) + '</td>'
        : '<td class="ltk-num"><b>' + esc(fmtAge(r.oldest_listing_date)) + '</b></td>') +
      '<td class="ltk-num"><b>' + esc(fmtRp(r.avg_price || 0)) + '</b>' +
        deltaHtml(r.avg_price, r.avg_price_prev, trend, { inverse: true }) + '</td>' +
      '<td class="ltk-num"><b>' + esc(fmtRating(r.avg_rating)) + '</b>' +
        deltaHtml(r.avg_rating, r.avg_rating_prev, trend) + '</td>' +
      '<td class="ltk-sparkcell">' +
        (trend
          ? '<canvas class="ltk-spark" data-ltk-spark="' + attr(key) + '" width="68" height="24"></canvas>'
          : '<span class="ltk-spark-empty" title="Perlu minimal 2 hari data">Belum ada tren</span>') +
      '</td>';

    var expanded = S.openDetail === key;
    return '<tr class="ltk-row' + (expanded ? ' is-expanded' : '') + '" data-ltk-rowkey="' + attr(key) + '" ' +
      'aria-expanded="' + expanded + '" tabindex="0">' +
      '<th scope="row" class="ltk-rowhead">' +
        (isKw ? rowIconHtml(r) : storeAvatar(r)) +
        '<span class="ltk-rowhead-txt">' +
          '<span class="ltk-rowhead-name">' + esc(rowLabel(r)) + '</span>' +
          '<span class="ltk-rowhead-meta">' +
            (trend ? 'Aktif · ' + r.n_days + ' hari data' : 'Mengumpulkan data') +
          '</span>' +
        '</span>' +
        '<svg class="ltk-rowhead-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</th>' + cells +
      '<td class="ltk-kebabcell">' +
        '<button type="button" class="ltk-kebab" data-ltk-menu="' + attr(key) + '" ' +
          'aria-label="Aksi untuk ' + attr(rowLabel(r)) + '" aria-expanded="' + (S.openRow === key) + '">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>' +
        '</button>' +
        (S.openRow === key
          ? '<div class="ltk-menu" role="menu">' +
              '<button type="button" role="menuitem" data-ltk-act="setup">Ubah pantauan</button>' +
              (isKw ? '<button type="button" role="menuitem" data-ltk-dive="' + attr(key) + '">Buka Deep Dive</button>' : '') +
              '<button type="button" role="menuitem" class="ltk-menu-danger" data-ltk-drop="' + attr(key) + '">Hapus</button>' +
            '</div>'
          : '') +
      '</td></tr>' +
      (expanded ? rowDetailHtml(r, isKw) : '');
  }

  // Day-over-day notable moves from the widened get_tracker_rollup series
  // (avg_price / n_listings / n_sellers). Cap so the expanded row stays short.
  function changeHistoryHtml(r, isKw) {
    var series = (r && r.series) || [];
    var lines = [];
    var i, prev, cur, day, pricePrev, priceCur, pct, dSku, dSell;
    for (i = 1; i < series.length; i++) {
      prev = series[i - 1];
      cur = series[i];
      day = fmtDayShort(cur.d);
      pricePrev = Number(prev.avg_price);
      priceCur = Number(cur.avg_price);
      if (Number.isFinite(pricePrev) && Number.isFinite(priceCur) && pricePrev > 0 && priceCur !== pricePrev) {
        pct = Math.round(((priceCur - pricePrev) / pricePrev) * 100);
        if (priceCur > pricePrev) {
          lines.push(day + ': Harga naik ke ' + fmtRp(priceCur) + ' (+' + pct + '%)');
        } else {
          lines.push(day + ': Harga turun ke ' + fmtRp(priceCur) + ' (' + pct + '%)');
        }
      }
      dSku = (Number(cur.n_listings) || 0) - (Number(prev.n_listings) || 0);
      if (dSku > 0) lines.push(day + ': ' + dSku + ' SKU baru masuk');
      else if (dSku < 0) lines.push(day + ': ' + Math.abs(dSku) + ' SKU keluar');
      if (isKw) {
        dSell = (Number(cur.n_sellers) || 0) - (Number(prev.n_sellers) || 0);
        if (dSell > 0) lines.push(day + ': ' + dSell + ' toko baru masuk');
        else if (dSell < 0) lines.push(day + ': ' + Math.abs(dSell) + ' toko keluar');
      }
    }
    lines = lines.slice(-6);
    var body = lines.length
      ? lines.map(function (ln) { return '<li>' + esc(ln) + '</li>'; }).join('')
      : '<li class="ltk-row-history-empty">Belum ada perubahan berarti di window ini</li>';
    return '<div class="ltk-row-history">' +
      '<div class="ltk-row-history-title">Riwayat Perubahan</div>' +
      '<ul class="ltk-row-history-list">' + body + '</ul></div>';
  }

  // Mobile-friendly recap of the same columns as the table — the table stays
  // horizontally scrollable at narrow widths (see the 720px responsive rule),
  // so tapping a row surfaces every stat stacked, without needing that scroll.
  function rowDetailHtml(r, isKw) {
    var trend = rowHasTrend(r);
    var fields = [
      ['Unit Terjual', fmtUnits(r.units || 0), deltaHtml(r.units, r.units_prev, trend)],
      ['Omset (Rp)', fmtRp(r.omset || 0), deltaHtml(r.omset, r.omset_prev, trend)],
      ['SKU Aktif', fmtUnits(r.n_listings || 0), deltaHtml(r.n_listings, r.n_listings_prev, trend)],
    ];
    if (isKw) fields.push(['Toko Aktif', fmtUnits(r.n_sellers || 0), deltaHtml(r.n_sellers, r.n_sellers_prev, trend)]);
    else fields.push(['Usia Toko', fmtAge(r.oldest_listing_date), '']);
    fields.push(['Rata-rata Harga', fmtRp(r.avg_price || 0), deltaHtml(r.avg_price, r.avg_price_prev, trend, { inverse: true })]);
    fields.push(['Rating', fmtRating(r.avg_rating), deltaHtml(r.avg_rating, r.avg_rating_prev, trend)]);
    // Matches the non-kebab columns: name + metrics + tren (toko Aktif / Usia swap 1:1).
    var colspan = 8;
    return '<tr class="ltk-row-detail"><td colspan="' + colspan + '"><div class="ltk-row-detail-grid">' +
      fields.map(function (f) {
        return '<div class="ltk-row-detail-item"><span class="ltk-row-detail-lbl">' + esc(f[0]) + '</span>' +
          '<span class="ltk-row-detail-val">' + esc(f[1]) + f[2] + '</span></div>';
      }).join('') +
    '</div>' + changeHistoryHtml(r, isKw) + '</td></tr>';
  }

  function storeAvatar(r) {
    var letter = esc(String(rowLabel(r) || 'T').charAt(0).toUpperCase());
    if (r && r.image_url) {
      return '<span class="ltk-row-ico" data-letter="' + attr(letter) + '">' +
        '<img src="' + attr(r.image_url) + '" alt="" loading="lazy" decoding="async" ' +
        'referrerpolicy="no-referrer" ' +
        'onerror="var p=this.parentNode;var L=p.getAttribute(\'data-letter\')||\'T\';' +
        'p.className=\'ltk-row-ico ltk-row-ico--letter\';p.textContent=L;">' +
        '</span>';
    }
    return '<span class="ltk-row-ico ltk-row-ico--letter">' + letter + '</span>';
  }

  // Real product photo where we have one (merged by loadRowImages), category
  // illustration otherwise. Falling back on error rather than leaving a broken /
  // blank box: a Shopee CDN URL can 404 long after we cached it.
  function rowIconHtml(r) {
    var cat = (r && r.category) || '';
    var slug = resolveCatSlug(cat);
    var letter = esc(String(cat || (r && r.keyword) || '?').charAt(0).toUpperCase());
    if (r && r.image_url) {
      return '<span class="ltk-row-ico" data-cat="' + attr(slug) + '" data-letter="' + attr(letter) + '">' +
        '<img src="' + attr(r.image_url) + '" alt="" loading="lazy" decoding="async" ' +
        'referrerpolicy="no-referrer" ' +
        'onerror="var p=this.parentNode;var s=p.getAttribute(\'data-cat\')||\'\';' +
        'var L=p.getAttribute(\'data-letter\')||\'?\';this.remove();' +
        'var i=document.createElement(\'img\');i.alt=\'\';i.width=81;i.height=81;' +
        'i.loading=\'lazy\';i.src=\'/images/onboarding/categories/\'+s+\'.png\';' +
        'i.onerror=function(){p.className=\'ltk-row-ico ltk-row-ico--letter\';p.textContent=L;};' +
        'p.appendChild(i);">' +
        '</span>';
    }
    return catIconHtml(cat, 81, 'ltk-row-ico');
  }

  // Mobile card — replaces the sideways-scrolling table below the 720px
  // breakpoint (see the CSS media query). Rendered alongside the table (not
  // instead of), same rows, so nothing here needs its own data fetch; CSS
  // shows exactly one of the two per viewport width.
  function cardHtml(r) {
    var key = rowKey(r);
    var trend = rowHasTrend(r);
    var isKw = S.tab !== 'store';
    // Line 1: who's selling it (product cards) or how long they've sold
    // (store cards, no store-of-store concept). Falls back to the toko-count
    // when we have no rep store name yet, never leaving the line blank.
    var line1 = isKw
      ? (r.store_name || (trend ? fmtUnits(r.n_sellers || 0) + ' toko aktif' : 'Mengumpulkan data'))
      : (r.oldest_listing_date ? 'Toko sejak ' + fmtAge(r.oldest_listing_date) : 'Mengumpulkan data');
    var line2 = 'SKU Aktif: ' + fmtUnits(r.n_listings || 0);
    return '<article class="ltk-card">' +
      '<div class="ltk-card-top" data-ltk-lihatdetail="' + attr(key) + '">' +
        (isKw ? rowIconHtml(r) : storeAvatar(r)) +
        '<div class="ltk-card-head">' +
          '<span class="ltk-card-name">' + esc(rowLabel(r)) + '</span>' +
          '<span class="ltk-card-meta">' + esc(line1) + '</span>' +
          '<span class="ltk-card-meta">' + esc(line2) + '</span>' +
        '</div>' +
        '<button type="button" class="ltk-kebab" data-ltk-menu="' + attr(key) + '" ' +
          'aria-label="Aksi untuk ' + attr(rowLabel(r)) + '" aria-expanded="' + (S.openRow === key) + '">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>' +
        '</button>' +
        (S.openRow === key
          ? '<div class="ltk-menu ltk-menu--card" role="menu">' +
              '<button type="button" role="menuitem" data-ltk-act="setup">Ubah pantauan</button>' +
              '<button type="button" role="menuitem" class="ltk-menu-danger" data-ltk-drop="' + attr(key) + '">Hapus</button>' +
            '</div>'
          : '') +
      '</div>' +
      '<div class="ltk-card-stats">' +
        STAT_METRICS.map(function (m) { return metricStatBlockHtml(key, m, r, trend, 60, 20); }).join('') +
      '</div>' +
      '<div class="ltk-card-foot">' +
        '<button type="button" class="ltk-card-detail-btn" data-ltk-lihatdetail="' + attr(key) + '">Lihat Detail' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>' +
        '</button>' +
      '</div>' +
    '</article>';
  }

  function renderRollup() {
    var p = pane('rollup');
    if (!p) return;
    var rows = sortedRows();
    var isKw = S.tab !== 'store';
    var limit = isKw ? S.keywordLimit : S.storeLimit;
    var free = Math.max(0, limit - rows.length);

    if (!rows.length) {
      p.innerHTML = '<div class="ltk-rollup">' +
        '<div class="ltk-empty">' +
          '<h3>Belum ada ' + (isKw ? 'produk' : 'toko') + ' yang dipantau</h3>' +
          '<p>Tambahkan sampai ' + limit + ' ' + (isKw ? 'produk' : 'toko') +
          ' — kami cek tiap pagi dan tunjukkan apa yang berubah.</p>' +
          '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="setup">' +
          'Tambah ' + (isKw ? 'Produk' : 'Toko') + '</button>' +
        '</div></div>';
      return;
    }

    var head = '<tr>' +
      '<th class="ltk-th-name">' + (isKw ? 'Produk' : 'Toko') + '</th>' +
      '<th>Unit Terjual</th><th>Omset (Rp)</th><th>SKU Aktif</th>' +
      (isKw ? '<th>Toko Aktif</th>' : '<th>Usia Toko</th>') +
      '<th>Rata-rata Harga</th><th>Rating</th><th>Tren</th><th></th></tr>';

    p.innerHTML =
      '<div class="ltk-rollup">' +
        '<div class="ltk-panel">' +
          '<div class="ltk-panel-head">' +
            '<div class="ltk-panel-title">Ringkasan ' + (isKw ? 'Produk' : 'Toko') +
              ' Dipantau <span class="ltk-count-pill">' + rows.length + '</span></div>' +
            '<div class="ltk-winsel">' + winSelectHtml() + '</div>' +
            '<label class="ltk-sr">Urutkan' +
              '<select class="ltk-select" data-ltk-sort>' +
              [['omset', 'Omset'], ['units', 'Unit Terjual'], ['sku', 'SKU Aktif']]
                .concat(isKw ? [['toko', 'Toko Aktif']] : [])
                .concat([['harga', 'Harga'], ['nama', 'Nama']])
                .map(function (o) {
                  return '<option value="' + o[0] + '"' + (S.sort === o[0] ? ' selected' : '') + '>' +
                    'Urutkan: ' + o[1] + '</option>';
                }).join('') +
              '</select></label>' +
          '</div>' +
          '<div class="ltk-tablewrap"><table class="ltk-table">' +
            '<thead>' + head + '</thead>' +
            '<tbody>' + rows.map(rowHtml).join('') + '</tbody>' +
          '</table></div>' +
          '<div class="ltk-cards">' + rows.map(cardHtml).join('') +
            '<button type="button" class="ltk-add-tile" data-ltk-act="setup">' +
              '<span class="ltk-add-tile-plus" aria-hidden="true">+</span>' +
              '<span class="ltk-add-tile-head">Tambah ' + (isKw ? 'Produk' : 'Toko') + ' untuk Dipantau</span>' +
              '<span class="ltk-add-tile-sub">' + (free ? free + ' slot kosong' : 'Kelola pantauan kamu') + '</span>' +
            '</button>' +
            '<button type="button" class="ltk-btn ltk-btn--primary ltk-add-tile-cta" data-ltk-act="setup">' +
              'Tambah ' + (isKw ? 'Produk' : 'Toko') +
            '</button>' +
          '</div>' +
          '<button type="button" class="ltk-addrow" data-ltk-act="setup">' +
            '<span aria-hidden="true">+</span> Tambah Pantauan Baru' +
            (free ? '<em>' + free + ' slot kosong</em>' : '') +
          '</button>' +
        '</div>' +
      '</div>';

    paintSparks();
    paintMetricSparks();
  }

  /* ── "Lihat Detail" screen ─────────────────────────────────────────────
     A dedicated, simpler view than Deep Dive: stat row + one chart + change
     history (all already computed for the rollup row, no extra fetch) plus
     who's selling it — the one piece that needs its own data, fetched via
     the adapter so this module still never touches _supabase directly. */

  function findRollupRow(key) {
    var rows = (S.rollup && S.rollup.rows) || [];
    for (var i = 0; i < rows.length; i++) if (rowKey(rows[i]) === key) return rows[i];
    return null;
  }

  function openDetailScreen(key) {
    var row = findRollupRow(key);
    if (!row) { call('toast', 'Data tidak ditemukan.'); return; }
    S.detailKey = key;
    S.detailScope = S.tab;
    S.detailPeers = [];
    S.detailPeersLoading = true;
    S.detailMetric = 'omset';
    showScreen('detail');
    renderDetail();
    var isKw = S.detailScope !== 'store';
    var fetchPeers = isKw
      ? callP('getKeywordTopListings', row.keyword)
      : callP('getStoreTopListings', row.shop_id);
    fetchPeers.then(function (rows) {
      if (S.detailKey !== key) return; // user already navigated away
      S.detailPeers = rows || [];
      S.detailPeersLoading = false;
      renderDetail();
    });
    call('track', 'tracker_detail_open', { site: opts.site, scope: S.detailScope, key: key });
  }

  function closeDetailScreen() {
    S.detailKey = null;
    showScreen('rollup');
    renderRollup();
  }

  // Bigger sibling of drawSpark for the detail screen's single-metric chart —
  // same raw-canvas approach (no charting lib for one line), plus min/max
  // labels so the line means something without hovering.
  function drawDetailChart(cv, series, metricKey) {
    if (!cv || !cv.getContext) return;
    var pts = (series || []).map(function (p) { return Number(p[metricKey || 'omset']) || 0; });
    if (pts.length < 2) return;
    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 280, h = cv.clientHeight || 120;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var min = Math.min.apply(null, pts), max = Math.max.apply(null, pts);
    var span = (max - min) || 1;
    var pad = 8;
    var up = pts[pts.length - 1] >= pts[0];
    var color = up ? '#16A34A' : '#DC2626';
    var xy = pts.map(function (v, i) {
      return [pad + (i / (pts.length - 1)) * (w - pad * 2), h - pad - ((v - min) / span) * (h - pad * 2)];
    });
    // Soft fill under the line
    ctx.beginPath();
    ctx.moveTo(xy[0][0], h - pad);
    xy.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    ctx.lineTo(xy[xy.length - 1][0], h - pad);
    ctx.closePath();
    ctx.fillStyle = up ? 'rgba(22,163,74,.08)' : 'rgba(220,38,38,.08)';
    ctx.fill();
    // Line
    ctx.beginPath();
    xy.forEach(function (p, i) { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Shared row-list for both scopes — mv_trending returns the same shape
  // (item_id, shop_id, store_name, product_name, image_url, price,
  // delta_7d, delta_prev_7d) either way, only the label swaps: the product
  // detail screen names the store selling each top listing (per Steven's
  // direction — "Performa per Toko" is really the top listings for this
  // keyword, labeled by store), the store detail screen names the product.
  function detailPeersHtml(isKw) {
    if (S.detailPeersLoading) return '<p class="ltk-detail-peers-note">Memuat…</p>';
    var rows = S.detailPeers || [];
    if (!rows.length) {
      return '<p class="ltk-detail-peers-note">' +
        (isKw ? 'Belum ada data toko untuk produk ini.' : 'Belum ada data produk untuk toko ini.') + '</p>';
    }
    return '<table class="ltk-detail-peers-table">' +
      '<thead><tr><th>' + (isKw ? 'Toko' : 'Produk') + '</th><th>Omset (Estimasi 30 Hari)</th><th>Perubahan</th></tr></thead>' +
      '<tbody>' + rows.map(function (r) {
        var label = isKw ? (r.store_name || ('Toko ' + r.shop_id)) : (r.product_name || '—');
        var enough = r.delta_prev_7d != null;
        var estOmset = Math.round((Number(r.price) || 0) * (Number(r.delta_7d) || 0) * 30 / 7);
        return '<tr>' +
          '<td class="ltk-detail-peers-row">' +
            imgOr(r.image_url || '', 'ltk-detail-peers-img') +
            '<span>' + esc(label) + '</span>' +
          '</td>' +
          '<td>' + esc(fmtRp(Math.max(0, estOmset))) + '</td>' +
          '<td>' + deltaHtml(r.delta_7d, r.delta_prev_7d, enough) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  }

  var CHART_TOGGLES = [
    { key: 'omset', label: 'Omset' },
    { key: 'units', label: 'Unit Terjual' },
    { key: 'avg_price', label: 'Harga' },
  ];

  function renderDetail() {
    var p = pane('detail');
    if (!p) return;
    var key = S.detailKey;
    var row = key ? findRollupRow(key) : null;
    if (!row) { p.innerHTML = ''; return; }
    var isKw = S.detailScope !== 'store';
    var trend = rowHasTrend(row);
    var metric = S.detailMetric || 'omset';
    p.innerHTML =
      '<div class="ltk-detail">' +
        '<button type="button" class="ltk-detail-back" data-ltk-detail-back>' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
          'Kembali ke Pantauan</button>' +
        '<div class="ltk-detail-head">' +
          (isKw ? rowIconHtml(row) : storeAvatar(row)) +
          '<div class="ltk-detail-head-txt">' +
            '<h3 class="ltk-detail-name">' + esc(rowLabel(row)) + '</h3>' +
            '<p class="ltk-detail-meta">' +
              (isKw
                ? (trend ? esc(fmtUnits(row.n_sellers || 0)) + ' toko aktif · ' + esc(fmtUnits(row.n_listings || 0)) + ' SKU aktif' : 'Mengumpulkan data')
                : (row.oldest_listing_date ? 'Dipantau sejak toko berjualan ' + esc(fmtAge(row.oldest_listing_date)) : 'Mengumpulkan data')) +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ltk-detail-stats">' +
          STAT_METRICS.map(function (m) { return metricStatBlockHtml(key, m, row, trend, 90, 28); }).join('') +
        '</div>' +
        '<div class="ltk-detail-chart-wrap">' +
          '<div class="ltk-detail-chart-head">' +
            '<div class="ltk-chart-toggles" role="tablist" aria-label="Metrik tren">' +
              CHART_TOGGLES.map(function (t) {
                return '<button type="button" role="tab" class="ltk-chart-toggle' + (metric === t.key ? ' is-active' : '') +
                  '" aria-selected="' + (metric === t.key) + '" data-ltk-chartmetric="' + attr(t.key) + '">' +
                  esc(t.label) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          (trend
            ? '<canvas class="ltk-detail-chart" data-ltk-detailchart width="600" height="160"></canvas>'
            : '<p class="ltk-detail-peers-note">Perlu minimal 2 hari data untuk menampilkan tren.</p>') +
        '</div>' +
        changeHistoryHtml(row, isKw) +
        '<div class="ltk-detail-peers">' +
          '<div class="ltk-detail-peers-title">' + (isKw ? 'Performa per Toko' : 'Produk Teratas') + '</div>' +
          detailPeersHtml(isKw) +
        '</div>' +
      '</div>';
    var cv = $('[data-ltk-detailchart]');
    if (cv) drawDetailChart(cv, row.series, metric);
    paintMetricSparks();
  }

  /* ── discover fall-through (used by the collecting screen) ───────────────
     Never render "no changes". The general scrape runs over 3,712 keywords
     regardless, so there is always something to show — but it must be labelled
     as not-their-data, and each card doubles as a slot-filling control.       */

  function discoverHtml() {
    if (!S.fallback || !S.fallback.length) return '';
    var cards = S.fallback.map(function (f) {
      return '<button type="button" class="ltk-disc-card" data-ltk-open="' +
          attr(f.item_id) + '|' + attr(f.shop_id) + '">' +
        imgOr(f.image_url, '') +
        '<span class="ltk-disc-name">' + esc(f.product_name || '—') + '</span>' +
        '<span class="ltk-disc-meta"><span class="ltk-disc-up">+' + esc(fmtUnits(f.delta_7d)) +
          '</span> 7 hari' + (f.category ? ' · ' + esc(f.category) : '') + '</span>' +
        (f.keyword ? '<span class="ltk-disc-add" data-ltk-addkw="' + attr(f.keyword) + '">+ Pantau keyword ini</span>' : '') +
        '</button>';
    }).join('');
    return '<div class="ltk-discover"><div class="ltk-discover-head">' +
      '<h4>Yang lagi bergerak di kategori kamu</h4>' +
      '<p>Dari scrape harian kami di seluruh Shopee — bukan dari keyword kamu.</p></div>' +
      '<div class="ltk-disc-grid">' + cards + '</div></div>';
  }

  function renderSkeleton() {
    var p = pane('rollup');
    if (!p) return;
    var rows = '';
    for (var i = 0; i < 5; i++) {
      rows += '<div class="ltk-skel-row"><div class="ltk-skel-img"></div>' +
        '<div class="ltk-skel-lines"><div class="ltk-skel-line w60"></div>' +
        '<div class="ltk-skel-line w35"></div></div></div>';
    }
    p.innerHTML = '<div class="ltk-rollup">' +
      '<div class="ltk-panel"><div class="ltk-skel">' + rows + '</div></div></div>';
  }

  // A logged-out visitor is NOT a failure. Site B shows the tracker button in
  // the sidebar before login, so anon users reach this surface routinely — and
  // every tracking RPC is authenticated-only (anon gets 42501 from PostgREST,
  // or 'not_authenticated' raised inside the function). Telling that user
  // "gagal memuat, datanya aman" is both wrong and alarming: nothing broke and
  // they have no data yet. Send them to sign-in instead.
  function isAuthError(e) {
    // Ask the host first. Parsing PostgREST codes is a fallback, not the
    // primary test: if the user simply isn't signed in, EVERY failure on this
    // surface is an auth failure regardless of the shape it arrives in, and
    // that verdict shouldn't depend on us anticipating the error format.
    if (call('isAuthed') === false) return true;
    if (!e) return false;
    var code = String(e.code || '');
    var msg = String((e && e.message) || e || '').toLowerCase();
    return code === '42501' || code === 'PGRST301' ||
           msg.indexOf('not_authenticated') >= 0 ||
           msg.indexOf('permission denied') >= 0 ||
           msg.indexOf('jwt') >= 0;
  }

  function renderError(e) {
    var p = pane('error');
    if (!p) return;
    if (isAuthError(e)) {
      p.innerHTML = '<div class="ltk-err">' +
        '<p>Masuk dulu untuk mulai memantau keyword kamu.<br>' +
        'Kami cek keyword pilihanmu tiap pagi dan tunjukkan apa yang bergerak.</p>' +
        '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="login">Masuk / Daftar gratis</button>' +
        '</div>';
      return;
    }
    p.innerHTML = '<div class="ltk-err"><p>Gagal memuat pantauan kamu. Datanya aman — coba muat ulang.</p>' +
      '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="retry">Coba lagi</button></div>';
  }

  /* ── screen selection ───────────────────────────────────────────────── */

  function paint() {
    renderStrip();
    if (!S.configured) { S.detailKey = null; renderSetup(); showScreen('setup'); return; }
    // The rollup table can stand on its own the moment there is any history —
    // rows without enough snapshots simply say so in place of a percentage.
    if (!S.hasHistory && !(S.rollup.rows || []).length) {
      S.detailKey = null; renderCollecting(); showScreen('collecting'); return;
    }
    renderRollup();
    // A refresh that lands while the user is reading a detail screen must not
    // yank them back to the list — repaint the detail in place with the fresh
    // row instead. Only bail out to the rollup if that row is gone (dropped,
    // or the scope changed underneath it).
    if (S.detailKey && S.detailScope === S.tab && findRollupRow(S.detailKey)) {
      renderDetail(); showScreen('detail'); return;
    }
    S.detailKey = null;
    showScreen('rollup');
  }

  /* ── data ───────────────────────────────────────────────────────────── */

  function loadCategories() {
    if (S.categories.length) return Promise.resolve(S.categories);
    return callP('getCategories').then(function (c) {
      S.categories = (c && c.length) ? c : [];
      return S.categories;
    });
  }

  function seedDraft() {
    if (draft.picked.length) return Promise.resolve();
    return callP('getSeedCandidates').then(function (seed) {
      var picked = [];
      var seen = {};
      function push(kw, cat) {
        var norm = String(kw || '').trim().toLowerCase();
        if (!norm || norm.length < 2 || seen[norm] || picked.length >= SEED_TARGET) return;
        seen[norm] = 1;
        picked.push({ keyword: String(kw).trim(), category: cat || '' });
      }
      (seed && seed.fromTracked || []).forEach(function (t) { push(t.keyword, t.category); });
      draft.picked = picked;
      var cats = (seed && seed.categories) || [];
      if (picked.length >= SEED_TARGET || !cats.length) return null;
      // One keyword per onboarding category, so the seeds aren't near-duplicates.
      return cats.slice(0, SEED_TARGET).reduce(function (chain, cat) {
        return chain.then(function () {
          if (draft.picked.length >= SEED_TARGET) return null;
          return callP('getCategoryKeywords', cat, 8).then(function (list) {
            var t = (list || []).find(function (x) { return !seen[String(x.keyword).toLowerCase()]; });
            if (t) push(t.keyword, t.category || cat);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      // Genuinely fresh user: no products, no onboarding prefs. Auto-open the
      // grid so the very first thing on screen is tappable, never a blank field.
      if (!draft.picked.length && !draft.cat) draft.cat = null;
    }).catch(function (e) { warn('seed failed', e); });
  }

  function loadFallback() {
    var cats = {};
    S.keywords.forEach(function (k) { if (k.category) cats[k.category] = 1; });
    return callP('getFallbackMovers', Object.keys(cats), 8).then(function (rows) {
      S.fallback = rows || [];
    }).catch(function () { S.fallback = []; });
  }

  function loadBaseline() {
    var kws = S.keywords.map(function (k) { return k.keyword; });
    if (!kws.length) { S.baseline = []; return Promise.resolve(); }
    return callP('getKeywordBaseline', kws).then(function (rows) {
      S.baseline = rows || [];
    }).catch(function () { S.baseline = []; });
  }

  // Real product photos for the seeded setup pick slots. Same source as rollup
  // row icons (product_types_v via getKeywordBaseline). Fetch each missing
  // keyword at most once so renderSetup doesn't spam the network.
  var _pickedImgGen = 0;
  var _pickedImgBusy = false;
  var _pickedImgTried = {};
  function loadPickedImages() {
    if (!draft.seed || _pickedImgBusy) return;
    var need = draft.picked.filter(function (k) {
      if (!k || !k.keyword || k.image_url) return false;
      return !_pickedImgTried[String(k.keyword).toLowerCase()];
    });
    if (!need.length) return;
    need.forEach(function (k) { _pickedImgTried[String(k.keyword).toLowerCase()] = 1; });
    _pickedImgBusy = true;
    var gen = ++_pickedImgGen;
    var kws = need.map(function (k) { return k.keyword; });
    callP('getKeywordBaseline', kws).then(function (list) {
      if (gen !== _pickedImgGen) return;
      var byKw = {};
      (list || []).forEach(function (b) {
        if (b && b.keyword && b.top_image) byKw[String(b.keyword).toLowerCase()] = b.top_image;
      });
      var changed = false;
      draft.picked.forEach(function (k) {
        if (!k || k.image_url) return;
        var img = byKw[String(k.keyword || '').toLowerCase()];
        if (img) { k.image_url = img; changed = true; }
      });
      if (changed && draft.step === 0 && draft.seed) renderSetup();
    }).catch(function () {}).then(function () {
      if (gen === _pickedImgGen) _pickedImgBusy = false;
    });
  }

  // Real product photos for the rollup rows.
  //
  // get_tracker_rollup aggregates numbers only — it has no image column. Rather
  // than widen that function, reuse getKeywordBaseline: it already reads
  // product_types_v and returns the representative product image, which is the
  // SAME picture the product cards show. A generic category illustration is
  // recognisable as a category; the actual product is recognisable as YOUR row.
  //
  // Best-effort and non-blocking: rows render with the category fallback if this
  // never resolves. Keyword scope only — stores use their own logo path.
  function loadRowImages() {
    if (S.tab !== 'keyword') return Promise.resolve(null);
    var rows = (S.rollup && S.rollup.rows) || [];
    if (!rows.length) return Promise.resolve(null);
    var kws = rows.map(function (r) { return r.keyword; }).filter(Boolean);
    if (!kws.length) return Promise.resolve(null);
    return callP('getKeywordBaseline', kws).then(function (list) {
      var byKw = {};
      (list || []).forEach(function (b) {
        if (b && b.keyword) byKw[String(b.keyword).toLowerCase()] = b;
      });
      rows.forEach(function (r) {
        var b = byKw[String(r.keyword || '').toLowerCase()];
        if (b && b.top_image) r.image_url = b.top_image;
        if (b && b.top_store) r.store_name = b.top_store;
      });
      return null;
    }).catch(function () { return null; });
  }

  var LOGO_FRESH_MS = 30 * 86400000;

  // Shop logos: cache table first, then get-shop-logo edge on miss/stale.
  // Bounded by storeLimit (small). Never blocks paint on failure.
  function loadStoreLogos() {
    if (S.tab !== 'store') return Promise.resolve(null);
    var rows = (S.rollup && S.rollup.rows) || [];
    if (!rows.length) return Promise.resolve(null);
    var ids = rows.map(function (r) { return r.shop_id; }).filter(function (id) {
      return id != null && id !== '';
    });
    if (!ids.length) return Promise.resolve(null);

    function applyUrl(shopId, url) {
      if (!url) return;
      rows.forEach(function (r) {
        if (String(r.shop_id) === String(shopId)) r.image_url = url;
      });
    }

    return callP('getShopLogoCache', ids).then(function (cached) {
      var byId = {};
      var now = Date.now();
      (cached || []).forEach(function (c) {
        if (!c || c.shop_id == null) return;
        byId[String(c.shop_id)] = c;
        var fetched = c.fetched_at ? new Date(c.fetched_at).getTime() : 0;
        if (c.logo_url && fetched && (now - fetched) < LOGO_FRESH_MS) {
          applyUrl(c.shop_id, c.logo_url);
        }
      });
      var need = ids.filter(function (id) {
        var hit = byId[String(id)];
        if (!hit || !hit.logo_url) return true;
        var fetched = hit.fetched_at ? new Date(hit.fetched_at).getTime() : 0;
        return !fetched || (Date.now() - fetched) >= LOGO_FRESH_MS;
      }).slice(0, 20);
      if (!need.length) return null;
      return Promise.all(need.map(function (id) {
        return callP('fetchShopLogo', id).then(function (res) {
          var url = res && (res.logo_url || res.image_url);
          if (url) applyUrl(id, url);
          return null;
        }).catch(function () { return null; });
      })).then(function () { return null; });
    }).catch(function () { return null; });
  }

  // Oldest listing_date per shop — same shop-age proxy Deep Dive uses.
  function loadStoreAges() {
    if (S.tab !== 'store') return Promise.resolve(null);
    var rows = (S.rollup && S.rollup.rows) || [];
    if (!rows.length) return Promise.resolve(null);
    var ids = rows.map(function (r) { return r.shop_id; }).filter(function (id) {
      return id != null && id !== '';
    });
    if (!ids.length) return Promise.resolve(null);
    return callP('getStoreOldestListingDates', ids).then(function (map) {
      var byId = map || {};
      rows.forEach(function (r) {
        var d = byId[String(r.shop_id)];
        if (d) r.oldest_listing_date = d;
      });
      return null;
    }).catch(function () { return null; });
  }

  function enrichRollupRows() {
    if (S.tab === 'store') {
      return Promise.all([loadStoreLogos(), loadStoreAges()]).then(function () { return null; });
    }
    return loadRowImages();
  }

  // How many products the seed shop actually runs. Fetched only when the Toko
  // step is reached, so a user who never gets there never pays for it.
  function maybeLoadSeedShop() {
    if (draft.step !== 2 || !draft.seed || !draft.seed.shop_id) return;
    if (draft.seedShopSkus != null) return;
    callP('getStoreInfo', draft.seed.shop_id).then(function (info) {
      if (!info) return;
      if (info.n_products != null) draft.seedShopSkus = info.n_products;
      if (info.store_name && !draft.seed.store_name) draft.seed.store_name = info.store_name;
      if (draft.step === 2) renderSetup();
    }).catch(function () {});
  }

  function clearTimers() {
    if (timers.paint) { clearTimeout(timers.paint); timers.paint = 0; }
    if (timers.abort) { clearTimeout(timers.abort); timers.abort = 0; }
  }

  function refresh(o) {
    o = o || {};
    if (o.days) S.windowDays = o.days;
    if (inflight && !o.force) return inflight;

    var gen = ++refresh._gen;
    var settled = false;
    clearTimers();

    // Never a spinner past 2.5s: paint whatever getTracking already gave us.
    timers.paint = setTimeout(function () {
      if (settled || gen !== refresh._gen) return;
      if (S.configured) { renderChipbar(); renderSkeleton(); showScreen('deltas'); }
    }, WATCHDOG_PAINT_MS);

    // Never a dead screen: fall through to whatever we already have.
    timers.abort = setTimeout(function () {
      if (settled || gen !== refresh._gen) return;
      settled = true; inflight = null;
      S.hasHistory = true;
      paint();
    }, WATCHDOG_ABORT_MS);

    var work = Promise.resolve()
      .then(function () { return o.touch ? callP('touchViewed') : null; })
      .then(function (t) { if (t && t.resumed) S.resumed = true; })
      .then(function () { return callP('getTracking'); })
      .then(function (tr) {
        if (tr) {
          S.keywords = tr.keywords || [];
          S.stores = tr.stores || [];
          S.keywordLimit = tr.keyword_limit || 5;
          S.storeLimit = tr.store_limit || 3;
          if (tr.metrics && tr.metrics.length) S.metrics = tr.metrics;
          if (tr.all_metrics && tr.all_metrics.length) S.allMetrics = tr.all_metrics;
          S.paused = !!tr.paused && !S.resumed;
          S.configured = (S.keywords.length + S.stores.length) > 0;
        }
        if (!S.configured) return loadCategories().then(seedDraft);
        // The active tab decides the scope, so switching tabs is a refetch
        // rather than a client-side filter — the two scopes aggregate from
        // different matviews and cannot be derived from one another.
        return callP('getRollup', S.windowDays, S.tab).then(function (d) {
          S.rollup = {
            rows: (d && d.rows) || [],
            totals: (d && d.totals) || {},
            scope: (d && d.scope) || S.tab,
          };
          S.asOf = (d && d.as_of) || null;
          // If the RPC doesn’t tell us whether there is history we assume yes —
          // a sparse scrape schedule means a 7‑day window may legitimately be
          // empty, but the market itself still has months of data.
          if (d && typeof d.has_history === 'boolean') S.hasHistory = d.has_history;
          else S.hasHistory = true;
          // A resumed tracker has provably nothing in a 7-day window (pause is
          // 14 days), so route it back to collecting.
          if (S.resumed) S.hasHistory = false;
          if (!S.hasHistory) return loadBaseline().then(loadFallback);
          return enrichRollupRows();
        });
      })
      .then(function () {
        if (gen !== refresh._gen) return S;
        settled = true; clearTimers(); inflight = null;
        S.lastRefreshAt = Date.now();
        paint();
        call('onStateChange', getState());
        return S;
      })
      .catch(function (e) {
        if (gen !== refresh._gen) return S;
        settled = true; clearTimers(); inflight = null;
        if (!isAuthError(e)) warn('refresh failed', e);
        renderError(e); showScreen('error');
        return S;
      });

    inflight = work;
    return work;
  }
  refresh._gen = 0;

  /* ── commit ─────────────────────────────────────────────────────────── */

  // Plain-JSON snapshot of the in-progress wizard picks — used to survive a
  // login interrupt (see commit()'s requireAuth branch below). Excludes
  // transient/UI-only fields (busy, errors, sug, seedShopSkus).
  function snapshotDraft() {
    return {
      cat: draft.cat, picked: draft.picked.slice(), stores: draft.stores.slice(),
      step: draft.step, metrics: draft.metrics.slice(), seed: draft.seed,
    };
  }

  function commit() {
    // Stores alone are a valid config now that Toko is its own tab.
    if (draft.busy || (!draft.picked.length && !draft.stores.length)) return;
    if (call('requireAuth') === false) {
      // The login modal is about to blow away this in-progress screen (and,
      // for the Google OAuth path, reload the page entirely) — hand the host
      // a snapshot so it can restore the wizard after sign-in completes,
      // instead of silently discarding everything the user just picked.
      call('savePendingDraft', snapshotDraft());
      return;
    }
    draft.busy = true; draft.errors = {}; renderSetup();

    // SEQUENTIAL, never Promise.all. The slot-limit trigger does select count(*)
    // in a BEFORE INSERT under read-committed, so concurrent inserts can both
    // read n=4 and both succeed. Awaiting each add sidesteps the race entirely.
    var chain = Promise.resolve();
    var stop = false;
    draft.picked.forEach(function (k) {
      chain = chain.then(function () {
        if (stop) return null;
        return callP('addKeyword', k.keyword, k.category).then(function (r) {
          if (!r || r.ok) return null;
          if (r.error === 'limit_reached') { stop = true; draft.errors[k.keyword] = 'Slot penuh (maks ' + (r.limit || S.keywordLimit) + ')'; }
          else if (r.error === 'keyword_too_short') draft.errors[k.keyword] = 'Keyword terlalu pendek';
          // already_tracked: skip silently, it is already what the user wanted
        });
      });
    });
    draft.stores.forEach(function (st) {
      chain = chain.then(function () { return callP('addStore', st.shop_id, st.store_name); });
    });
    // Metrics last: a failure here costs the user a column choice, not their
    // keywords, so it must not be able to abort the adds above.
    chain = chain.then(function () {
      var picked = draft.metrics.slice();
      if (!picked.length) return null;
      if (picked.join('|') === (S.metrics || []).join('|')) return null;  // unchanged
      return callP('setMetrics', picked).then(function (r) {
        if (r && r.metrics) S.metrics = r.metrics;
      }).catch(function () { /* keep the previous selection */ });
    });

    chain.then(function () {
      draft.busy = false;
      var savedMetrics = draft.metrics.slice();
      resetDraft();
      draft.metrics = savedMetrics;
      call('track', 'tracker_setup_commit', {
        site: opts.site, metrics: savedMetrics.join(','),
      });
      return refresh({ force: true });
    }).catch(function (e) {
      draft.busy = false; warn('commit failed', e);
      call('toast', 'Gagal menyimpan. Coba lagi.');
      renderSetup();
    });
  }

  /* ── events ─────────────────────────────────────────────────────────── */

  /* Category is a filter now, not a step: changing it only re-scopes whatever
     the open typeahead is showing. It must never silently fill the user's
     slots — that was the old grid's job and it made the picker feel decided-for. */
  function pickCategory(cat) {
    draft.cat = cat || null;
    if (draft.sug.kind === 'keyword' && draft.sug.slot >= 0 && draft.sug.q) {
      runKeywordSuggest(draft.sug.q);
    } else {
      renderSetup();
    }
  }

  // Toko step's "browse by category" — for a seller who doesn't know a shop's
  // exact name (the only other way in, via storeSuggestHtml's name search).
  function pickStoreCategory(cat) {
    draft.storeCat = cat || null;
    draft.storeCatRows = [];
    if (!draft.storeCat) { draft.storeCatBusy = false; renderSetup(); return; }
    draft.storeCatBusy = true;
    renderSetup();
    var catAtStart = draft.storeCat;
    callP('getStoresByCategory', draft.storeCat).then(function (rows) {
      if (draft.storeCat !== catAtStart) return; // superseded by a later pick
      draft.storeCatRows = rows || [];
      draft.storeCatBusy = false;
      renderSetup();
    });
  }

  function runKeywordSuggest(q) {
    var query = String(q || '').trim();
    draft.sug.q = query;
    if (!query) { draft.sug.rows = []; draft.sug.busy = false; renderSetup(); return; }
    draft.sug.busy = true;
    renderSetup();
    var slotAtStart = draft.sug.slot;
    callP('searchKeywords', { q: query, category: draft.cat, limit: 8 }).then(function (rows) {
      // A slower response for an older query must not overwrite a newer one.
      if (draft.sug.slot !== slotAtStart || draft.sug.q !== query) return;
      draft.sug.rows = (rows || []).filter(function (r) {
        return !draft.picked.some(function (x) {
          return String(x.keyword).toLowerCase() === String(r.keyword).toLowerCase();
        });
      });
      draft.sug.busy = false;
      renderSetup();
    }).catch(function () {
      if (draft.sug.q !== query) return;
      draft.sug.rows = []; draft.sug.busy = false; renderSetup();
    });
  }

  function pickSuggestion(kw, cat) {
    var name = String(kw || '').trim();
    if (name.length < 2) { call('toast', 'Keyword minimal 2 karakter.'); return; }
    if (draft.picked.length >= S.keywordLimit) { call('toast', 'Slot keyword sudah penuh.'); return; }
    if (draft.picked.some(function (x) { return x.keyword.toLowerCase() === name.toLowerCase(); })) return;
    var hit = draft.sug.rows.filter(function (r) { return r.keyword === name; })[0] || {};
    draft.picked.push({
      keyword: name,
      category: cat || hit.category || draft.cat || '',
      image_url: hit.rep_image_url || hit.image_url || hit.top_image || '',
      meta: hit.n_sellers ? hit.n_sellers + ' penjual' : '',
    });
    draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'keyword' };
    renderSetup();
  }

  function searchStores(q) {
    draft.sug = { slot: -2, q: String(q || ''), rows: draft.sug.rows, busy: true, kind: 'store' };
    if (!q || q.length < 2) {
      draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'store' };
      renderSetup();
      return;
    }
    renderSetup();
    var query = q;
    callP('searchStores', q).then(function (rows) {
      if (draft.sug.q !== query) return;
      draft.sug.rows = rows || [];
      draft.sug.busy = false;
      renderSetup();
      var el = $('[data-ltk-storeinput]');
      if (el) { el.value = query; el.focus(); }
    });
  }

  /* ── rollup interactions ─────────────────────────────────────────────── */

  function setTab(tab) {
    var next = (tab === 'store') ? 'store' : 'keyword';
    if (next === S.tab) return;
    S.tab = next;
    S.openRow = null;
    S.detailKey = null;   // the open detail belongs to the scope we just left
    lsWrite({ tab: next });
    call('track', 'tracker_tab', { site: opts.site, tab: next });
    renderScopeTabs();
    renderSkeleton();
    refresh({ force: true });
  }

  function dropRow(key) {
    if (call('requireAuth') === false) return;
    var isKw = S.tab !== 'store';
    var rec = isKw
      ? S.keywords.filter(function (k) { return String(k.keyword).toLowerCase() === String(key).toLowerCase(); })[0]
      : S.stores.filter(function (s) { return String(s.shop_id) === String(key); })[0];
    if (!rec || !rec.id) { call('toast', 'Tidak ketemu di daftar pantauan.'); return; }
    S.openRow = null;
    callP(isKw ? 'removeKeyword' : 'removeStore', rec.id).then(function () {
      call('toast', (isKw ? '"' + key + '"' : 'Toko') + ' dihapus dari pantauan.');
      return refresh({ force: true });
    }).catch(function () { call('toast', 'Gagal menghapus. Coba lagi.'); });
  }

  function onClick(e) {
    if (!host || !host.contains(e.target)) return;
    var t = e.target;

    var addkw = t.closest && t.closest('[data-ltk-addkw]');
    if (addkw) {
      // Fires before the card's own open handler — the fall-through card is both
      // a discovery surface and the slot-filling control.
      e.preventDefault(); e.stopPropagation();
      var kw = addkw.getAttribute('data-ltk-addkw');
      if (call('requireAuth') === false) return;
      callP('addKeyword', kw, '').then(function (r) {
        if (r && r.ok) {
          call('track', 'tracker_keyword_add', { site: opts.site, keyword: kw, via: 'fallback_card' });
          call('toast', '"' + kw + '" ditambahkan ke pantauan.');
          return refresh({ force: true });
        }
        if (r && r.error === 'limit_reached') call('toast', 'Slot keyword sudah penuh.');
        else if (r && r.error === 'already_tracked') call('toast', 'Keyword ini sudah kamu pantau.');
      });
      return;
    }

    var open = t.closest && t.closest('[data-ltk-open]');
    if (open) {
      var parts = String(open.getAttribute('data-ltk-open')).split('|');
      var hit = (S.fallback || []).filter(function (f) {
        return String(f.item_id) === parts[0] && String(f.shop_id) === parts[1];
      })[0];
      call('openProduct', hit || { item_id: parts[0], shop_id: parts[1] });
      return;
    }

    var days = t.closest && t.closest('[data-ltk-days]');
    if (days) {
      var d = parseInt(days.getAttribute('data-ltk-days'), 10) || DEFAULT_DAYS;
      lsWrite({ days: d });
      refresh({ days: d, force: true });
      return;
    }

    var tab = t.closest && t.closest('[data-ltk-tab]');
    if (tab) { setTab(tab.getAttribute('data-ltk-tab')); return; }

    var sug = t.closest && t.closest('[data-ltk-sugpick]');
    if (sug) {
      pickSuggestion(sug.getAttribute('data-ltk-sugpick'), sug.getAttribute('data-ltk-sugcat'));
      return;
    }

    var kebab = t.closest && t.closest('[data-ltk-menu]');
    if (kebab) {
      var mk = kebab.getAttribute('data-ltk-menu');
      S.openRow = (S.openRow === mk) ? null : mk;
      renderRollup();
      return;
    }

    var drop = t.closest && t.closest('[data-ltk-drop]');
    if (drop) { dropRow(drop.getAttribute('data-ltk-drop')); return; }

    var dive = t.closest && t.closest('[data-ltk-dive]');
    if (dive) {
      S.openRow = null;
      call('openKeywordDeepDive', dive.getAttribute('data-ltk-dive'));
      return;
    }

    // Row body click (not the kebab/menu, handled above — both return before
    // reaching here) toggles the mobile-friendly stacked recap.
    var rowEl = t.closest && t.closest('[data-ltk-rowkey]');
    if (rowEl) {
      var rk = rowEl.getAttribute('data-ltk-rowkey');
      S.openDetail = (S.openDetail === rk) ? null : rk;
      S.openRow = null;
      renderRollup();
      return;
    }

    var lihatdetail = t.closest && t.closest('[data-ltk-lihatdetail]');
    if (lihatdetail) {
      S.openRow = null;
      openDetailScreen(lihatdetail.getAttribute('data-ltk-lihatdetail'));
      return;
    }

    var detailBack = t.closest && t.closest('[data-ltk-detail-back]');
    if (detailBack) { closeDetailScreen(); return; }

    var chartMetric = t.closest && t.closest('[data-ltk-chartmetric]');
    if (chartMetric) {
      S.detailMetric = chartMetric.getAttribute('data-ltk-chartmetric');
      renderDetail();
      return;
    }

    // Any other click inside the tracker closes an open row menu.
    if (S.openRow && !(t.closest && t.closest('.ltk-menu'))) {
      S.openRow = null;
      renderRollup();
    }

    var pickerOpenBtn = t.closest && t.closest('[data-ltk-picker-open]');
    if (pickerOpenBtn) { openPicker(); return; }

    var pickerClose = t.closest && t.closest('[data-ltk-picker-close]');
    if (pickerClose) { closePicker(); return; }

    var pickerPick = t.closest && t.closest('[data-ltk-picker-pick]');
    if (pickerPick) {
      pickFromPicker(pickerPick.getAttribute('data-ltk-picker-pick'), pickerPick.getAttribute('data-ltk-picker-cat'));
      return;
    }

    var rm = t.closest && t.closest('[data-ltk-rm]');
    if (rm) {
      var k = rm.getAttribute('data-ltk-rm');
      draft.picked = draft.picked.filter(function (x) { return x.keyword !== k; });
      renderSetup();
      return;
    }

    var rms = t.closest && t.closest('[data-ltk-rmstore]');
    if (rms) {
      var sid = rms.getAttribute('data-ltk-rmstore');
      draft.stores = draft.stores.filter(function (x) { return String(x.shop_id) !== String(sid); });
      renderSetup();
      return;
    }

    var ps = t.closest && t.closest('[data-ltk-pickstore]');
    if (ps) {
      if (draft.stores.length < S.storeLimit) {
        draft.stores.push({ shop_id: ps.getAttribute('data-ltk-pickstore'),
                            store_name: ps.getAttribute('data-ltk-storename') });
      }
      renderSetup();
      return;
    }

    var mcard = t.closest && t.closest('[data-ltk-metric]');
    if (mcard) {
      var mk = mcard.getAttribute('data-ltk-metric');
      var mi = draft.metrics.indexOf(mk);
      if (mi >= 0) draft.metrics.splice(mi, 1); else draft.metrics.push(mk);
      renderSetup();
      return;
    }

    var chipKw = t.closest && t.closest('[data-ltk-kw]');
    if (chipKw) { call('openDiscovery', chipKw.getAttribute('data-ltk-kw')); return; }

    var act = t.closest && t.closest('[data-ltk-act]');
    if (!act) return;
    switch (act.getAttribute('data-ltk-act')) {
      case 'setup':
        draft.picked = S.keywords.map(function (k) { return { keyword: k.keyword, category: k.category }; });
        draft.stores = S.stores.map(function (s) { return { shop_id: s.shop_id, store_name: s.store_name }; });
        loadCategories().then(function () { renderSetup(); showScreen('setup'); });
        break;
      case 'commit': commit(); break;
      case 'cancel-setup':
        // Discard the draft, don't commit — get back to whatever screen
        // reflects what's actually saved (refresh() already knows: rollup if
        // configured, setup again if this was first-time (nowhere else to go)).
        resetDraft();
        refresh({ force: false });
        break;
      case 'retry': refresh({ force: true }); break;
      case 'step-next':
        if (draft.step < 3) { draft.step++; renderSetup(); maybeLoadSeedShop(); }
        break;
      case 'step-back':
        if (draft.step > 0) { draft.step--; renderSetup(); }
        break;
      case 'add-seed-store':
        if (draft.seed && draft.seed.shop_id && draft.stores.length < S.storeLimit) {
          draft.stores.push({
            shop_id: draft.seed.shop_id,
            store_name: draft.seed.store_name || ('Toko ' + draft.seed.shop_id),
            n_products: draft.seedShopSkus || null,
          });
          call('track', 'tracker_seed_store_added', { site: opts.site });
          renderSetup();
        }
        break;
      // requireAuth opens the host's own auth modal and returns false when
      // logged out; if it somehow returns true we already have a session, so
      // just reload the data.
      case 'login': if (call('requireAuth') === true) refresh({ force: true }); break;
      case 'strip-close': lsWrite({ resumedAckAt: Date.now() }); S.resumed = false; renderStrip(); break;
      case 'how': call('openHowCalculated'); break;
    }
  }

  function onInput(e) {
    if (!host || !host.contains(e.target)) return;
    var el = e.target;
    if (!el.hasAttribute) return;

    if (el.hasAttribute('data-ltk-storeinput')) {
      var q = el.value;
      if (timers.storeSearch) clearTimeout(timers.storeSearch);
      timers.storeSearch = setTimeout(function () { searchStores(q); }, TYPEAHEAD_MS);
      return;
    }
    if (el.hasAttribute('data-ltk-slot')) {
      var slot = parseInt(el.getAttribute('data-ltk-slot'), 10);
      var v = el.value;
      draft.sug.kind = 'keyword';
      draft.sug.slot = slot;
      draft.sug.q = v;              // keep in sync so the re-render restores it
      if (timers.typeahead) clearTimeout(timers.typeahead);
      timers.typeahead = setTimeout(function () { runKeywordSuggest(v); }, TYPEAHEAD_MS);
      return;
    }
    if (el.hasAttribute('data-ltk-sort')) {
      S.sort = el.value;
      lsWrite({ sort: S.sort });
      renderRollup();
      return;
    }
    if (el.hasAttribute('data-ltk-winsel')) {
      var d = parseInt(el.value, 10) || DEFAULT_DAYS;
      lsWrite({ days: d });
      renderSkeleton();
      refresh({ days: d, force: true });
      return;
    }
    if (el.hasAttribute('data-ltk-catsel')) {
      pickCategory(el.value || null);
      return;
    }
    if (el.hasAttribute('data-ltk-storecatsel')) {
      pickStoreCategory(el.value || null);
      return;
    }
    if (el.hasAttribute('data-ltk-picker-input')) {
      var pq = el.value;
      if (timers.pickerSearch) clearTimeout(timers.pickerSearch);
      timers.pickerSearch = setTimeout(function () { runPickerSearch(pq); }, TYPEAHEAD_MS);
    }
  }

  function onKeydown(e) {
    if (!host || !host.contains(e.target)) return;
    var el = e.target;
    if (el.hasAttribute && el.hasAttribute('data-ltk-rowkey') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      var rk = el.getAttribute('data-ltk-rowkey');
      S.openDetail = (S.openDetail === rk) ? null : rk;
      S.openRow = null;
      renderRollup();
      return;
    }
    if (!el.hasAttribute || !el.hasAttribute('data-ltk-slot')) return;
    if (e.key === 'Enter') {
      // Enter takes the top suggestion, or the raw text when nothing matched —
      // a long-tail keyword the panel has never scraped is still trackable.
      e.preventDefault();
      var top = draft.sug.rows[0];
      if (top) pickSuggestion(top.keyword, top.category);
      else pickSuggestion(el.value, draft.cat);
      return;
    }
    if (e.key === 'Escape') {
      draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'keyword' };
      renderSetup();
    }
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  function getState() {
    return {
      screen: S.screen, configured: S.configured, paused: S.paused, resumed: S.resumed,
      keywords: S.keywords.slice(), stores: S.stores.slice(),
      keywordLimit: S.keywordLimit, storeLimit: S.storeLimit,
      freeSlots: Math.max(0, S.keywordLimit - S.keywords.length),
      windowDays: S.windowDays, asOf: S.asOf, hasHistory: S.hasHistory,
      tab: S.tab, rows: (S.rollup.rows || []).slice(), totals: S.rollup.totals || {},
      fallback: S.fallback.slice(),
      lastRefreshAt: S.lastRefreshAt,
    };
  }

  function summary() {
    // Top row by omset change — the same thing the table sorts by, so the chat
    // card and the full page never disagree about what is "moving".
    var withTrend = (S.rollup.rows || []).filter(rowHasTrend);
    var top = withTrend.slice().sort(function (a, b) {
      return (pctChange(b.omset, b.omset_prev) || 0) - (pctChange(a.omset, a.omset_prev) || 0);
    })[0] || null;
    var t = S.rollup.totals || {};
    return {
      configured: S.configured,
      keywordCount: S.keywords.length,
      storeCount: S.stores.length,
      freeSlots: Math.max(0, S.keywordLimit - S.keywords.length),
      paused: S.paused,
      rowCount: (S.rollup.rows || []).length,
      windowDays: S.windowDays,
      asOf: S.asOf,
      hasHistory: S.hasHistory,
      totalOmset: Number(t.omset) || 0,
      totalUnits: Number(t.units) || 0,
      nextUpdateLabel: nextUpdateLabel(),
      topRow: top ? {
        label: rowLabel(top),
        omset: Number(top.omset) || 0,
        units: Number(top.units) || 0,
        pct: pctChange(top.omset, top.omset_prev),
      } : null,
    };
  }

  function summaryCardHtml() {
    var s = summary();
    if (!s.configured) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        'Belum ada keyword yang dipantau.</span></div>';
    }
    if (!s.hasHistory) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        'Mengumpulkan data untuk ' + s.keywordCount + ' keyword kamu. Update pertama ' +
        esc(s.nextUpdateLabel) + '.</span></div>';
    }
    if (!s.topRow) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        s.rowCount + ' keyword dipantau — belum cukup hari data untuk hitung tren.</span></div>';
    }
    return '<div class="ltk-summary">' +
      '<div class="ltk-summary-line">Omset ' + s.windowDays + ' hari terakhir · ' +
        esc(fmtRp(s.totalOmset)) + '</div>' +
      '<div class="ltk-summary-top">' +
        '<div class="ltk-summary-main"><div class="ltk-summary-name">' +
          esc(s.topRow.label) + '</div></div>' +
        '<div class="ltk-summary-num">' +
          (s.topRow.pct === null ? esc(fmtRp(s.topRow.omset))
            : (s.topRow.pct >= 0 ? '+' : '') + Math.round(s.topRow.pct) + '%') +
        '</div>' +
      '</div></div>';
  }

  function bindSummary(root) {
    if (!root) return;
    root.querySelectorAll('[data-ltk-open]').forEach(function (el) {
      if (el.__ltkBound) return;
      el.__ltkBound = 1;
      el.addEventListener('click', function () {
        var p = String(el.getAttribute('data-ltk-open')).split('|');
        if (p[0] === 'tracker') { call('openTrackerView'); return; }
        call('openProduct', { item_id: p[0], shop_id: p[1] });
      });
    });
  }

  function mount(o) {
    o = o || {};
    opts = o;
    adapter = o.adapter || {};
    var el = global.document.getElementById(o.hostId || 'laris-tracker-root');
    if (!el) { warn('host element not found: ' + (o.hostId || 'laris-tracker-root')); return false; }
    if (mounted && host === el) return true;
    host = el;
    var ui = lsRead();
    S.windowDays = ui.days || o.defaultDays || DEFAULT_DAYS;
    S.sort = ui.sort || S.sort;
    S.tab = (o.tab === 'store' || ui.tab === 'store') ? 'store' : 'keyword';
    buildShell();
    if (!bound) {
      global.document.addEventListener('click', onClick, true);
      global.document.addEventListener('input', onInput, true);
      // <select> fires `change` everywhere and `input` only in newer engines —
      // bind both so the window/sort/category pickers work on older Safari.
      global.document.addEventListener('change', onInput, true);
      global.document.addEventListener('keydown', onKeydown, true);
      bound = true;
    }
    mounted = true;
    return true;
  }

  function open(o) {
    o = o || {};
    if (!mount(opts && opts.hostId ? opts : o)) return Promise.resolve(null);
    if (o.tab) setTabQuiet(o.tab);
    // Entering the section always lands on the list, never on whatever detail
    // screen was open when the user last navigated away (paint() would
    // otherwise restore it).
    S.detailKey = null;
    return refresh({ touch: o.touch !== false, force: true });
  }

  /* Host-driven tab change (Site A's outer tab row). Unlike setTab() this does
     not refresh — open() is about to do that anyway. */
  function setTabQuiet(tab) {
    S.tab = (tab === 'store') ? 'store' : 'keyword';
    S.openRow = null;
    lsWrite({ tab: S.tab });
  }

  function close() { clearTimers(); refresh._gen++; inflight = null; }

  function destroy() {
    close();
    if (bound) {
      global.document.removeEventListener('click', onClick, true);
      global.document.removeEventListener('input', onInput, true);
      global.document.removeEventListener('change', onInput, true);
      global.document.removeEventListener('keydown', onKeydown, true);
      bound = false;
    }
    if (host) host.innerHTML = '';
    host = null; mounted = false;
  }

  global.LarisTracker = {
    mount: mount,
    open: open,
    close: close,
    refresh: refresh,
    // opts.seed = { keyword, category, shop_id, store_name, item_id }
    // Passed by the Deep Dive "Pantau Produk Ini" button so the wizard opens
    // with that product already in the list, and its shop offered at the Toko
    // step. Without a seed this is the plain "Ubah keyword" entry.
    openSetup: function (o) {
      o = o || {};
      resetDraft();
      draft.picked = S.keywords.map(function (k) { return { keyword: k.keyword, category: k.category }; });
      draft.stores = S.stores.map(function (s) { return { shop_id: s.shop_id, store_name: s.store_name }; });

      var seed = o.seed;
      if (seed && seed.keyword) {
        draft.seed = seed;
        var norm = String(seed.keyword).trim().toLowerCase();
        var dupe = draft.picked.some(function (k) {
          return String(k.keyword).trim().toLowerCase() === norm; });
        // Seed goes FIRST so it is the thing they see, and only if there is
        // room — silently dropping their existing list to make space would be
        // worse than not seeding.
        if (!dupe && draft.picked.length < S.keywordLimit) {
          draft.picked.unshift({
            keyword: String(seed.keyword).trim(),
            category: seed.category || '',
            image_url: seed.image_url || seed.rep_image_url || '',
          });
        }
        call('track', 'tracker_setup_seeded', { site: opts.site, keyword: seed.keyword });
      }
      loadCategories().then(function () { renderSetup(); showScreen('setup'); });
    },
    // Restores a wizard draft stashed by commit()'s requireAuth branch — the
    // host calls this after sign-in completes, from its own pendingTracker
    // round-trip (mirrors pendingFinder/pendingDeepdive/pendingCompare).
    resumeDraft: function (o) {
      if (!o) return;
      loadCategories().then(function () {
        draft.cat = o.cat || null;
        draft.picked = (o.picked || []).slice();
        draft.stores = (o.stores || []).slice();
        draft.step = typeof o.step === 'number' ? o.step : 0;
        draft.metrics = (o.metrics && o.metrics.length) ? o.metrics.slice() : (S.metrics || []).slice();
        draft.seed = o.seed || null;
        draft.busy = false; draft.errors = {};
        renderSetup();
        showScreen('setup');
      });
    },
    setTab: setTab,
    isConfigured: function () { return S.configured; },
    getState: getState,
    summary: summary,
    summaryCardHtml: summaryCardHtml,
    bindSummary: bindSummary,
    destroy: destroy,
    version: '2.0.0',
  };
})(typeof window !== 'undefined' ? window : this);
