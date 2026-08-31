/**
 * laris-tracker.js — custom keyword + store tracking, shared by Site A
 * (laris-app) and Site B (gpt-app).
 *
 * Same split the daily-spin wheel used: this module owns every pixel and all screen
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
 * HONESTY RULE: stats and charts prefer keyword_daily_series / store_daily_series
 * (one de-overlapped day per calendar day, with forecast fill from the velocity
 * nowcast) so a keyword with two scrapes in 90 days still gets a real curve.
 * Raw scrape buckets from get_tracker_rollup are the fallback only. "Baru"
 * prints when even the dense series has no non-zero movement.
 */
(function (global) {
  'use strict';

  var LS_KEY = '_ltk_ui_v1';          // cosmetic only — never user data
  var WATCHDOG_PAINT_MS = 2500;       // never leave the user on a spinner past this
  var WATCHDOG_ABORT_MS = 8000;       // never leave the user on a dead screen at all
  var SEED_TARGET = 3;                // pre-fill 3 of 5; the 2 empty slots are the hook
  // ONE fixed window, no user control. Shopee scrape days are sparse and
  // irregular — 30 days can still land as few as 1-2 scrapes for a real,
  // active keyword (confirmed 2026-08-11: a 15-day gap between two scrapes
  // left only 2 points in a 30-day window, rendering as a flat straight line
  // with nothing to curve through). 60 days reliably surfaces enough real
  // history for a trend to read as a trend instead of two dots, and every
  // number on screen is quoted against it so nothing needs re-labelling when
  // a selector moves. S.windowDays exists only so summary() can report it.
  var DEFAULT_DAYS = 60;
  var WIB_OFFSET_MIN = 7 * 60;        // Asia/Jakarta, no DST
  var SCRAPE_HOUR_WIB = 7;            // morning run lands ~07:00 WIB
  var MIN_DAYS_FOR_TREND = 2;         // below this: "Baru", no sparkline, no %
  var TREND_HISTORY_WEEKS = 8;        // 8 WIB weeks (56d) + 1 forecast = the 60-day graph
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
    // Fallbacks only — get_my_tracking() is the authority and overwrites both.
    // Kept in step with public.tracking_keyword_limit() / tracking_store_limit()
    // so there is no flash of the old cap before the RPC lands. These are the
    // caps for every account — LarisID has no paid tier (MISSION.md, /harga/).
    keywordLimit: 40,
    storeLimit: 20,
    metrics: ['units', 'omset', 'sku', 'toko'],   // display selection
    allMetrics: ['units', 'omset', 'sku', 'toko', 'harga', 'rating'],
    notifyChannels: [],               // 'email' | 'whatsapp'; empty = no alerts
    notifyWa: '',                     // E.164, prefilled from the profile
    notifyAsked: false,               // has the user answered the question yet
    notifySaving: false,
    notifySaved: false,
    notifyMsg: '',
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
    // "Lihat Detail" screen — stats + chart + listing picker (Semua vs
    // one Shopee listing). Separate from the unused table-row expand recap.
    detailKey: null,                  // keyword/shop_id currently open, or null
    detailScope: 'keyword',           // scope the detail screen was opened from
    detailPeers: [],                  // top listings for this keyword/shop
    detailPeersLoading: false,
    detailMetric: 'omset',            // which chart the toggle row is showing
    detailListingKey: null,           // null = Semua; else item_id__shop_id
    detailListingSeries: {},          // cache of product_daily_series by listing key
    detailListingWeekly: {},          // listing_weekly rows by listing key
    detailListingLoading: false,
    detailViewRow: null,              // derived row currently driving stats/chart
  };

  // Uncommitted setup draft. Nothing here is persisted or sent until commit.
  // `sug` holds the live typeahead: which slot is open, the query, and results.
  var draft = {
    cat: null, picked: [], stores: [], busy: false, errors: {},
    step: 0,                 // 0 keyword · 1 metrik · 2 toko · 3 selesai
    metrics: [],             // display selection, seeded from S.metrics
    notifyChannels: [],      // seeded from S.notifyChannels, saved on commit
    notifyWa: '',
    notifyMsg: '',
    seed: null,              // {keyword, category, shop_id, store_name, item_id}
    seedShopSkus: null,      // SKU count for the seed shop, fetched lazily
    sug: { slot: -1, q: '', rows: [], busy: false, kind: 'keyword', fromHistory: false },
    // Toko step's "browse by category" list — separate from `cat` (the
    // keyword step's own category filter) since the two steps browse
    // independently.
    storeCat: null, storeCatRows: [], storeCatBusy: false,
    // Card-grid picker for the seeded (from a Deep Dive) keyword step — see
    // stepKeywordPickerHtml(). Only ever used when `seed` is set.
    pickerOpen: false, pickerQ: '', pickerRows: [], pickerBusy: false,
    // How many keyword slots the wizard is currently showing. The real cap
    // (S.keywordLimit) is 40 for everyone, and rendering 40 empty boxes at
    // a first-time seller is a wall, not an invitation. Start small and grow
    // on demand; the `X / limit` counter still shows the true ceiling.
    slotsShown: 0,
  };
  function resetDraft() {
    draft.cat = null; draft.picked = []; draft.stores = []; draft.busy = false;
    draft.errors = {}; draft.step = 0; draft.seed = null; draft.seedShopSkus = null;
    draft.metrics = (S.metrics || []).slice();
    draft.notifyChannels = (S.notifyChannels || []).slice();
    draft.notifyWa = S.notifyWa || '';
    draft.notifyMsg = '';
    draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'keyword', fromHistory: false };
    draft.storeCat = null; draft.storeCatRows = []; draft.storeCatBusy = false;
    draft.pickerOpen = false; draft.pickerQ = ''; draft.pickerRows = []; draft.pickerBusy = false;
    draft.slotsShown = 0;
    _pickedImgTried = {};
    _pickedImgBusy = false;
    _pickedImgGen++;
    _defaultSugCache = {};
  }

  var inflight = null;
  var timers = { paint: 0, abort: 0, storeSearch: 0, typeahead: 0, pickerSearch: 0 };
  var _defaultSugCache = {};

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
  // Compact currency ("Rp 8,5 jt" instead of "Rp 8.500.000") — used wherever
  // space is tight (stat boxes, cards). Falls back to a hand-rolled version
  // of the same host formatter if the adapter doesn't expose fmtRpShort.
  function fmtRpShort(n) {
    var v = call('fmtRpShort', n);
    if (v != null) return v;
    n = Number(n) || 0;
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.0', '') + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.0', '') + ' jt';
    if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3) + 'rb';
    return fmtRp(n);
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

  function wibTodayISO() {
    return new Date(Date.now() + WIB_OFFSET_MIN * 60000).toISOString().slice(0, 10);
  }
  function addDaysISO(iso, days) {
    return new Date(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') + days * 864e5)
      .toISOString().slice(0, 10);
  }
  function wibMondayISO(iso) {
    var parts = String(iso).slice(0, 10).split('-').map(Number);
    if (parts.length < 3 || !parts[0]) return String(iso).slice(0, 10);
    var utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    var dow = new Date(utc).getUTCDay();
    var offset = dow === 0 ? 6 : dow - 1;
    return new Date(utc - offset * 864e5).toISOString().slice(0, 10);
  }
  /** Every WIB week in the series through this week, oldest first.
      This week keeps the RPC's own forecast remainder (days after today that
      still sit in this Monday week) so the number is actual-to-date plus the
      same estimator the next-week point uses — not a 7/n blow-up of Monday
      alone. The 7/n scale is only a guard when the tail did not arrive.
      ONE bucketing, shared by the detail chart and the card's weekly stat. */
  function weeklyBuckets(daily) {
    var today = wibTodayISO();
    var thisMon = wibMondayISO(today);
    var thisEnd = addDaysISO(thisMon, 7);
    var byMon = {};
    (daily || []).forEach(function (p) {
      if (p.source === 'prior') return;
      var d = String(p.d || '').slice(0, 10);
      if (!d || d >= thisEnd) return;
      var mon = wibMondayISO(d);
      if (mon > thisMon) return;
      if (!byMon[mon]) {
        byMon[mon] = { d: mon, units: 0, omset: 0, avg_price: 0, n: 0, source: 'measured' };
      }
      byMon[mon].units += Number(p.units) || 0;
      byMon[mon].omset += Number(p.omset) || 0;
      if (p.avg_price) byMon[mon].avg_price = p.avg_price;
      byMon[mon].n += 1;
      if (p.source === 'forecast') byMon[mon].source = 'forecast';
    });
    if (byMon[thisMon] && byMon[thisMon].n > 0 && byMon[thisMon].n < 7) {
      var scale = 7 / byMon[thisMon].n;
      byMon[thisMon].units = Math.round(byMon[thisMon].units * scale);
      byMon[thisMon].omset = Math.round(byMon[thisMon].omset * scale);
      byMon[thisMon].source = 'forecast';
    }
    return Object.keys(byMon).sort().filter(function (mon) {
      return mon <= thisMon;
    }).map(function (mon) { return byMon[mon]; });
  }

  /** Last TREND_HISTORY_WEEKS weeks + 1 next-week perkiraan, for the charts. */
  function weeklyDetailSeries(daily) {
    var nextMon = addDaysISO(wibMondayISO(wibTodayISO()), 7);
    var pts = weeklyBuckets(daily).slice(-TREND_HISTORY_WEEKS);
    // Next week comes from THIS SAME series, never from keyword_weekly. That
    // table is a different estimator over a different population (per-listing
    // nowcast/peer fill across a 45-day keyword association vs. this keyword's
    // own scrape deltas), so splicing it on drew the forecast ~4x above the
    // measured weeks beside it. Deep Dive hit the same wall and reverted its
    // this-week overlay for the same reason; this is the other half of that.
    // The RPC already returns forecast days through current_date + 7, and
    // nextMon is always <= that, so futN >= 1 whenever there is any history.
    var futU = 0, futO = 0, futN = 0, lastP = 0;
    var nextEnd = addDaysISO(nextMon, 7);
    (daily || []).forEach(function (p) {
      var d = String(p.d || '').slice(0, 10);
      if (d >= nextMon && d < nextEnd) {
        futU += Number(p.units) || 0;
        futO += Number(p.omset) || 0;
        futN++;
        if (p.avg_price) lastP = p.avg_price;
      }
    });
    var next;
    if (futN > 0) {
      var sc = futN < 7 ? 7 / futN : 1;
      next = {
        d: nextMon,
        units: Math.round(futU * sc),
        omset: Math.round(futO * sc),
        avg_price: lastP,
        source: 'forecast',
      };
    } else {
      // Guard only — reachable only if the series carries no future days at all.
      var a = pts[pts.length - 1] || { units: 0, omset: 0 };
      var b = pts[pts.length - 2] || a;
      next = {
        d: nextMon,
        units: Math.round(((Number(a.units) || 0) + (Number(b.units) || 0)) / 2),
        omset: Math.round(((Number(a.omset) || 0) + (Number(b.omset) || 0)) / 2),
        avg_price: a.avg_price || 0,
        source: 'forecast',
      };
    }
    pts.push(next);
    return pts;
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
  function deltaHtml(cur, prev, enough) {
    if (!enough) return '<span class="ltk-d ltk-d--new">Baru</span>';
    var pct = pctChange(cur, prev);
    if (pct === null) return '<span class="ltk-d ltk-d--flat">—</span>';
    var r = Math.round(pct * 10) / 10;
    if (Math.abs(r) < 0.05) return '<span class="ltk-d ltk-d--flat">' + arrowSvg(0) + ' 0%</span>';
    // + is always green, - is always red, regardless of metric (Steven's
    // explicit call — a falling price used to render green as "good", but
    // that read as a mislabeled minus sign more than an economic judgment).
    var good = r > 0;
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
  // A row can show a trend once the dense series has real movement in it —
  // which is nearly always, since keyword_daily_series fills every day from
  // the velocity nowcast. The raw-bucket count is only the fallback for rows
  // whose series fetch failed or hasn't landed yet.
  function rowHasTrend(r) {
    if (r && r.dseries && r.dseries.length >= 2) return !!r.has_dense;
    return (Number(r.n_days) || 0) >= MIN_DAYS_FOR_TREND;
  }
  // Charts read the dense series when it's there, the raw buckets otherwise.
  // Dense series is fetched at 2× the window so prev/cur % share one array —
  // for the line we clip to that same 2× span so the right half is "now"
  // over the fixed 60-day window (the badge is week-over-week and needs no
  // second half).
  // `estimated` days (review-based bucket fill) are real signal — same as
  // measured — and must not be stripped like `prior`.
  function rowSeries(r) {
    var s = (r && r.dseries && r.dseries.length >= 2) ? r.dseries : ((r && r.series) || []);
    if (!(r && r.dseries && r.dseries.length >= 2 && r.window_days_effective)) return s;
    var win = Number(r.window_days_effective) || 0;
    if (win < 1) return s;
    var lastT = Date.parse(s[s.length - 1].d);
    if (isNaN(lastT)) return s;
    var todayT = Date.parse(wibTodayISO() + 'T12:00:00');
    if (!isNaN(todayT) && lastT > todayT) lastT = todayT;
    var cut = lastT - win * 86400000;   // the standard 60-day view
    var sliced = s.filter(function (p) {
      var t = Date.parse(p.d);
      return !isNaN(t) && t > cut && t <= lastT;
    });
    return sliced.length >= 2 ? sliced : s;
  }

  /* Real scrape dates — not array index — decide horizontal spacing, so two
     scrapes a week apart stretch out instead of sitting flush against two
     scraped a day apart. `series` can span any window (7 days or 90); this
     works the same either way since it maps calendar time, not point count.
     Returns null (caller draws nothing) if there's nothing to plot. */
  // Raw {t (epoch ms), v (metric value), d (date string), isCur} points,
  // sorted chronologically. `is_cur` (added when get_tracker_rollup widened
  // `series` to include the previous window too, see migration
  // 20260811160000) marks which points are "now" vs history; defaults true
  // for older cached rows that predate that column.
  function seriesPoints(series, metricKey) {
    var pts = (series || []).map(function (p) {
      return {
        t: Date.parse(p.d), v: Number(p[metricKey || 'omset']) || 0, d: p.d,
        isCur: p.is_cur !== false,
        // Dense-series days past the last real scrape are model output, not
        // measurement — the chart draws them dashed and labels them.
        forecast: p.source === 'forecast',
        estimated: p.source === 'estimated',
      };
    }).filter(function (p) { return !isNaN(p.t); });
    pts.sort(function (a, b) { return a.t - b.t; });
    return pts.length >= 2 ? pts : null;
  }

  // Normalize pad: number → equal inset, or {l,r,t,b}. Optional yMin/yMax let
  // the detail chart snap the scale to nice axis ticks (like Deep Dive Chart.js).
  function resolvePad(pad) {
    if (pad && typeof pad === 'object') {
      return {
        l: pad.l != null ? pad.l : (pad.x || 0),
        r: pad.r != null ? pad.r : (pad.x || 0),
        t: pad.t != null ? pad.t : (pad.y || 0),
        b: pad.b != null ? pad.b : (pad.y || 0),
      };
    }
    var n = Number(pad) || 0;
    return { l: n, r: n, t: n, b: n };
  }

  // Project real points onto a w×h canvas. x reflects real calendar time (not
  // point index); y is scaled to the point set's own min/max (or yMin/yMax).
  function projectXY(pts, w, h, pad, yMin, yMax) {
    var P = resolvePad(pad);
    var minT = pts[0].t, maxT = pts[0].t;
    pts.forEach(function (p) { if (p.t < minT) minT = p.t; if (p.t > maxT) maxT = p.t; });
    var spanT = (maxT - minT) || 1;
    var vals = pts.map(function (p) { return p.v; });
    var min = yMin != null ? yMin : Math.min.apply(null, vals);
    var max = yMax != null ? yMax : Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var plotW = Math.max(1, w - P.l - P.r);
    var plotH = Math.max(1, h - P.t - P.b);
    return pts.map(function (p) {
      return [
        P.l + ((p.t - minT) / spanT) * plotW,
        P.t + plotH - ((p.v - min) / span) * plotH,
      ];
    });
  }

  // Nice round ticks for the detail Y-axis (≈ Deep Dive Chart.js maxTicksLimit).
  function niceAxis(min, max, targetCount) {
    targetCount = targetCount || 5;
    if (!(isFinite(min) && isFinite(max))) { min = 0; max = 1; }
    if (min === max) {
      var bump = Math.abs(min) * 0.1 || 1;
      min -= bump;
      max += bump;
    }
    if (min > 0 && min / max > 0.6) {
      // Keep a bit of headroom below so a flat-high series isn't glued to the floor.
      min = min * 0.85;
    } else if (min > 0) {
      min = 0;
    }
    var span = max - min;
    var raw = span / Math.max(2, targetCount - 1);
    var mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    var norm = raw / mag;
    var step = norm >= 5 ? 5 * mag : norm >= 2 ? 2 * mag : mag;
    var niceMin = Math.floor(min / step) * step;
    var niceMax = Math.ceil(max / step) * step;
    if (niceMax === niceMin) niceMax = niceMin + step;
    var ticks = [];
    for (var v = niceMin; v <= niceMax + step * 1e-9; v += step) {
      ticks.push(Math.round(v * 1e6) / 1e6);
    }
    return { min: niceMin, max: niceMax, ticks: ticks };
  }

  // Axis labels match Deep Dive trend chart: jt / rb / plain units.
  function fmtChartTick(v, metricKey) {
    v = Number(v) || 0;
    if (metricKey === 'units') {
      return Math.abs(v) >= 1000
        ? Math.round(v).toLocaleString('id-ID')
        : String(Math.round(v));
    }
    var abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e6) return Math.round(v / 1e6) + 'jt';
    if (abs >= 1e3) return Math.round(v / 1e3) + 'rb';
    return String(Math.round(v));
  }

  function seriesXY(series, metricKey, w, h, pad) {
    var pts = seriesPoints(series, metricKey);
    return pts ? projectXY(pts, w, h, pad) : null;
  }

  // Smooth curve that passes through every real point (Catmull–Rom → cubic
  // Bézier). The old midpoint-quadratic shortcut looked nicer in isolation but
  // missed the weekly dots we draw on top, which read as a bug.
  function tracePath(ctx, xy) {
    var n = xy.length;
    if (n < 2) return;
    ctx.beginPath();
    ctx.moveTo(xy[0][0], xy[0][1]);
    if (n === 2) {
      ctx.lineTo(xy[1][0], xy[1][1]);
      return;
    }
    for (var i = 0; i < n - 1; i++) {
      var p0 = xy[i > 0 ? i - 1 : 0];
      var p1 = xy[i];
      var p2 = xy[i + 1];
      var p3 = xy[i + 2 < n ? i + 2 : n - 1];
      var cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      var cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      var cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      var cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
    }
  }

  /* Sparkline as raw canvas — the same choice the Deep Dive competitor table
     makes. Chart.js for a 60x22 line would be a 200KB dependency per row. */
  function drawSpark(cv, series, up, metricKey) {
    if (!cv || !cv.getContext) return;
    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 68, h = cv.clientHeight || 24;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var xy = seriesXY(series, metricKey, w, h, 3);
    if (!xy) return;
    tracePath(ctx, xy);
    ctx.strokeStyle = up ? '#16A34A' : '#DC2626';
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  // Spark color follows the 60-day window the line actually draws, not the
  // week-over-week badge — a rising two-month curve must not turn red just
  // because this week dipped.
  function seriesDirectionUp(series, metricKey) {
    var pts = seriesPoints(series, metricKey);
    if (!pts || pts.length < 2) return true;
    return pts[pts.length - 1].v >= pts[0].v;
  }
  function paintSparks() {
    if (!host) return;
    host.querySelectorAll('[data-ltk-spark]').forEach(function (cv) {
      var key = cv.getAttribute('data-ltk-spark');
      var row = (S.rollup.rows || []).filter(function (r) { return rowKey(r) === key; })[0];
      if (!row) return;
      var s = rowSeries(row);
      drawSpark(cv, s, seriesDirectionUp(s, 'omset'));
    });
  }

  // The 3 metrics every stat block can show a trend for. Compact currency
  // for omset/harga — the boxes are small, a full "Rp 62.000.000" doesn't fit.
  var STAT_METRICS = [
    { key: 'omset', label: 'Omset minggu ini', flow: true, fmt: function (r) { return fmtRpShort(r.omset || 0); } },
    { key: 'units', label: 'Unit minggu ini', flow: true, fmt: function (r) { return fmtUnits(r.units || 0); } },
    { key: 'avg_price', label: 'Harga', fmt: function (r) { return fmtRpShort(r.avg_price || 0); } },
  ];

  // Stat box: label, value, delta, and — when `cw` is non-zero — its own mini
  // trend line. Shared by the row card (cardHtml) and the Lihat Detail top row
  // (renderDetail). The card passes cw = 0: it draws the full weekly chart
  // beside these numbers, which makes a 60x20 sparkline per stat pure noise.
  // `rowKeyStr` lets paintMetricSparks resolve the row again at paint time
  // without storing per-canvas closures.
  function metricStatBlockHtml(rowKeyStr, m, r, trend, cw, ch) {
    // The week is still running, so the figure includes a modelled remainder
    // (or a 7/n guard if the forecast tail did not arrive).
    var partial = m.flow && r.week_partial
      ? ' title="Minggu berjalan — termasuk perkiraan sisa hari"'
      : '';
    return '<div class="ltk-mstat"' + partial + '>' +
      '<span class="ltk-mstat-lbl">' + esc(m.label) + '</span>' +
      '<span class="ltk-mstat-val">' + esc(m.fmt(r)) + '</span>' +
      deltaHtml(r[m.key], r[m.key + '_prev'], trend) +
      (trend && cw
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
      var row = key === '__detail__'
        ? S.detailViewRow
        : (S.rollup.rows || []).filter(function (r) { return rowKey(r) === key; })[0];
      if (!row) return;
      var s = rowSeries(row);
      var up = metricKey === 'avg_price'
        ? (Number(row[metricKey]) || 0) >= (Number(row[metricKey + '_prev']) || 0)
        : seriesDirectionUp(s, metricKey);
      drawSpark(cv, s, up, metricKey);
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
            '<img src="/images/brand/appicon-bird-48.png" alt="" width="20" height="20" loading="lazy">' +
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
    // Cards rendered while the pane was hidden had no width to size a canvas
    // from, so sweep again now that this screen is the visible one.
    if (name === 'rollup') { _layoutRetries = 0; scheduleSweep(0); }
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

  function renderChipbar() {
    var bar = $('[data-ltk-chipbar]');
    if (bar) bar.innerHTML = '';
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

  function kwNorm(s) {
    return String(s || '').trim().toLowerCase();
  }

  /** True when product_types_v / rollup already has this exact keyword. */
  function keywordKnownInCorpus(kw) {
    var n = kwNorm(kw);
    if (!n) return true;
    if ((S.baseline || []).some(function (b) { return kwNorm(b.keyword) === n; })) return true;
    var row = (S.rollup.rows || []).filter(function (r) { return kwNorm(r.keyword) === n; })[0];
    if (row && ((Number(row.n_days) || 0) > 0 || (Number(row.n_sellers) || 0) > 0 || row.has_dense)) {
      return true;
    }
    return false;
  }

  function sugHasExact(q, rows) {
    var n = kwNorm(q);
    return !!(n && (rows || []).some(function (r) { return kwNorm(r.keyword) === n; }));
  }

  /** CTA when the typed keyword is not in our scrape/corpus list yet. */
  function unknownKeywordCtaHtml(q, via) {
    var qSafe = String(q || '').trim();
    if (qSafe.length < 2) return '';
    var pickAttr = via === 'picker'
      ? ('data-ltk-picker-pick="' + attr(qSafe) + '" data-ltk-picker-cat="' + attr(draft.cat || '') + '"')
      : ('data-ltk-sugpick="' + attr(qSafe) + '" data-ltk-sugcat="' + attr(draft.cat || '') + '"');
    return '<div class="ltk-sug-unknown">' +
      '<p class="ltk-sug-unknown-title">Kami belum punya keyword &ldquo;' + esc(qSafe) + '&rdquo; di daftar scrape.</p>' +
      '<p class="ltk-sug-unknown-body">Mau kami track? Kami mulai scrape tiap pagi. Tren butuh minimal 2 hari data — update pertama <b>' +
        esc(nextUpdateLabel()) + '</b>.</p>' +
      '<button type="button" class="ltk-btn ltk-btn--primary ltk-sug-unknown-btn" ' + pickAttr +
        ' data-ltk-unknown="1">Ya, pantau keyword ini</button>' +
    '</div>';
  }

  function thinTrendNoteHtml(kw, isListing) {
    if (isListing) {
      return 'Listing ini belum punya cukup riwayat scrape (butuh minimal 2 kali) untuk menampilkan tren.';
    }
    if (kw && !keywordKnownInCorpus(kw)) {
      return 'Kami belum punya keyword &ldquo;' + esc(kw) + '&rdquo; di daftar scrape sebelumnya. ' +
        'Karena kamu memantau, kami mulai scrape tiap pagi — tren butuh minimal 2 hari data. Update pertama ' +
        esc(nextUpdateLabel()) + '.';
    }
    return 'Perlu minimal 2 hari data untuk menampilkan tren.';
  }

  function slotSuggestHtml(idx) {
    var sug = draft.sug;
    if (sug.slot !== idx) return '';
    if (sug.busy) return '<div class="ltk-sug"><div class="ltk-sug-note">Mencari…</div></div>';
    var browsing = !sug.q || !String(sug.q).trim();
    if (!sug.rows.length) {
      if (browsing) {
        return '<div class="ltk-sug"><div class="ltk-sug-note">' +
          ('Ketik keyword' + (draft.cat ? ' — difilter ke ' + esc(draft.cat) : '') + '.') +
          '</div></div>';
      }
      return '<div class="ltk-sug">' + unknownKeywordCtaHtml(sug.q, 'sug') + '</div>';
    }
    var hint = browsing
      ? '<div class="ltk-sug-hint">' +
          (sug.fromHistory ? 'Dari pencarian kamu' : 'Saran buat kamu') +
          ' — ketik untuk menyaring</div>'
      : '';
    var exact = browsing || sugHasExact(sug.q, sug.rows);
    return '<div class="ltk-sug ltk-sug--cards" role="listbox">' + hint +
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
      }).join('') + '</div>' +
      (!exact ? unknownKeywordCtaHtml(sug.q, 'sug') : '') +
      '</div>';
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
    bell:  '<path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M13.7 20a2 2 0 01-3.4 0"/>',
    mail:  '<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="M3 6l9 6.5L21 6"/>',
    wa:    '<path d="M3.5 20.5l1.3-4.4A8 8 0 1120 12a8 8 0 01-11.6 7.1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-1-.9 1a5.4 5.4 0 01-2-2l1-.9-1-2z"/>',
  };
  function svgIco(icon) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round">' + (PROMISE_ICONS[icon] || '') + '</svg>';
  }
  /* ── notification channels ────────────────────────────────────────────
     Asked once, per user (not per keyword) — the same placement as the
     metric picker, and stored alongside it on user_tracker_state.
     WhatsApp needs a number: a channel we cannot deliver on looks enabled
     and silently drops every message, which is worse than not offering it. */
  var NOTIFY_CHANNELS = [
    { key: 'email',    icon: 'mail', label: 'Email',    sub: 'Ringkasan ke inbox kamu' },
    { key: 'whatsapp', icon: 'wa',   label: 'WhatsApp', sub: 'Pesan singkat saat ada perubahan' },
  ];

  function notifyLogoHtml(key) {
    if (key === 'whatsapp') {
      return '<svg class="ltk-logo ltk-logo--wa" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26C2.158 6.443 6.593 2.01 12.045 2.01c2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>' +
        '</svg>';
    }
    return '<svg class="ltk-logo ltk-logo--mail" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect width="24" height="24" rx="6" fill="#2563EB"/>' +
      '<path fill="#fff" d="M5.2 7.4h13.6c.66 0 1.2.54 1.2 1.2v6.8c0 .66-.54 1.2-1.2 1.2H5.2c-.66 0-1.2-.54-1.2-1.2V8.6c0-.66.54-1.2 1.2-1.2zm.55 1.45v.28l6.25 3.95 6.25-3.95v-.28H5.75zm12.5 1.62-5.88 3.72a.7.7 0 01-.74 0L5.75 10.47V15.2h12.5V10.47z"/>' +
      '</svg>';
  }

  function notifyCardsHtml(channels, wa, o) {
    o = o || {};
    var cards = NOTIFY_CHANNELS.map(function (c) {
      var on = channels.indexOf(c.key) >= 0;
      return '<button type="button" class="ltk-mcard' + (on ? ' is-on' : '') + '" ' +
        'data-ltk-notifych="' + attr(c.key) + '" aria-pressed="' + on + '">' +
        '<span class="ltk-mcard-ico ltk-mcard-ico--logo">' + notifyLogoHtml(c.key) + '</span>' +
        '<span class="ltk-mcard-txt"><b>' + esc(c.label) + '</b><span>' + esc(c.sub) + '</span></span>' +
        '<span class="ltk-mcard-tick" aria-hidden="true">&#10003;</span>' +
        '</button>';
    }).join('');
    var waOn = channels.indexOf('whatsapp') >= 0;
    return '<div class="ltk-mgrid">' + cards + '</div>' +
      (waOn
        ? '<label class="ltk-notify-wa">' +
            '<span>' + notifyLogoHtml('whatsapp') + ' Nomor WhatsApp</span>' +
            '<input type="tel" inputmode="tel" placeholder="0812xxxxxxxx" ' +
              'data-ltk-notifywa value="' + attr(wa || '') + '">' +
          '</label>'
        : '') +
      (o.msg ? '<p class="ltk-tips ltk-tips--warn">' + esc(o.msg) + '</p>' : '');
  }

  // Rollup version: its own card at the foot of the page, saved explicitly.
  function notifyBlockHtml() {
    return '<div class="ltk-panel ltk-notify" data-ltk-notify>' +
        '<div class="ltk-stephead">' +
          '<h3>Mau dikabari lewat mana?</h3>' +
          '<p>Kami kabari kamu setiap ada perubahan berarti di pasar yang kamu pantau. ' +
          'Pilih satu atau dua-duanya — bisa diubah kapan saja.</p>' +
        '</div>' +
        notifyCardsHtml(S.notifyChannels || [], S.notifyWa, { msg: S.notifyMsg }) +
        '<button type="button" class="ltk-btn ltk-btn--primary ltk-notify-save" ' +
          'data-ltk-act="notify-save"' + (S.notifySaving ? ' disabled' : '') + '>' +
          (S.notifySaving ? 'Menyimpan…' : 'Simpan pilihan') +
        '</button>' +
        (S.notifySaved ? '<span class="ltk-notify-ok">Tersimpan</span>' : '') +
      '</div>';
  }

  function renderNotifyBlock() {
    // Re-render only this block, never the whole rollup: a full repaint would
    // steal focus from the phone field mid-typing.
    var el = host && host.querySelector('[data-ltk-notify]');
    if (!el) return;
    var tmp = global.document.createElement('div');
    tmp.innerHTML = notifyBlockHtml();
    if (tmp.firstChild) el.parentNode.replaceChild(tmp.firstChild, el);
  }

  function saveNotifyPrefs() {
    if (S.notifySaving) return;
    if (call('requireAuth') === false) return;
    S.notifySaving = true; S.notifyMsg = ''; S.notifySaved = false;
    renderNotifyBlock();
    callP('setNotifyPrefs', (S.notifyChannels || []).slice(), S.notifyWa || '')
      .then(function (r) {
        S.notifySaving = false;
        if (r && r.ok === false && r.error === 'wa_number_required') {
          S.notifyMsg = 'Masukkan nomor WhatsApp yang valid dulu.';
        } else {
          S.notifySaved = true;
          if (r && r.notify_wa_number) S.notifyWa = r.notify_wa_number;
          call('track', 'tracker_notify_prefs', {
            site: opts.site, channels: (S.notifyChannels || []).join(','),
          });
        }
        renderNotifyBlock();
      })
      .catch(function () {
        S.notifySaving = false;
        S.notifyMsg = 'Gagal menyimpan. Coba lagi.';
        renderNotifyBlock();
      });
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
    { key: 'units',  icon: 'cart',  label: 'Units Terjual',   sub: 'Jumlah unit terjual per minggu' },
    { key: 'omset',  icon: 'trend', label: 'Omset (Rp)',      sub: 'Total pendapatan per minggu' },
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
    var freeK = Math.max(0, kwSlotsShown() - draft.picked.length);
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
      slots += '<li class="ltk-slot ltk-slot--filled' + (err ? ' ltk-slot--err' : '') +
        (k.known === false ? ' ltk-slot--newkw' : '') + '">' +
        thumb +
        '<span class="ltk-slot-body"><span class="ltk-slot-kw">' + esc(k.keyword) +
          (seeded ? '<span class="ltk-seedtag">dari produk yang kamu buka</span>' : '') +
          (k.known === false ? '<span class="ltk-seedtag ltk-seedtag--new">belum di daftar scrape</span>' : '') +
          '</span>' +
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
          'placeholder="' + (open ? 'Ketik untuk menyaring…' : 'Ketik keyword — mis. rak dinding kayu') + '" autocomplete="off" ' +
          'aria-label="Cari keyword untuk slot ' + (idx + 1) + '"' +
          (open ? ' value="' + attr(draft.sug.q) + '"' : '') + '>' +
          slotSuggestHtml(idx) +
        '</div></li>';
    }

    return '<div class="ltk-stephead">' +
        '<h3>Apa yang mau kamu pantau?</h3>' +
        '<p>' + (draft.seed
          ? 'Kami sudah masukkan produk yang barusan kamu buka. Tambah lagi kalau mau — maksimal ' + S.keywordLimit + '.'
          : 'Klik + untuk pilih dari pencarian kamu, atau ketik keyword baru.') + '</p>' +
      '</div>' +
      '<div class="ltk-slotsec">' +
        '<div class="ltk-slotsec-head"><span>Keyword kamu</span>' + catSelect +
          '<span class="ltk-count">' + draft.picked.length + ' / ' + S.keywordLimit + '</span>' +
        '</div>' +
        '<ul class="ltk-slots">' + slots + '</ul>' +
        kwMoreSlotsHtml() +
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
    var shown = kwSlotsShown();
    for (var i = 0; i < shown; i++) {
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
        kwMoreSlotsHtml() +
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
    var exact = !draft.pickerQ || sugHasExact(draft.pickerQ, visible);
    var body = draft.pickerBusy
      ? '<p class="ltk-sug-note">Mencari…</p>'
      : (visible.length
          ? ('<div class="ltk-disc-grid">' + visible.map(pickerCardHtml).join('') + '</div>' +
              (!exact ? unknownKeywordCtaHtml(draft.pickerQ, 'picker') : ''))
          : (draft.pickerQ
              ? unknownKeywordCtaHtml(draft.pickerQ, 'picker')
              : '<p class="ltk-sug-note">Belum ada pasar untuk ditampilkan.</p>'));
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
    draft.pickerBusy = true;
    renderSetup();
    suggestFromHistory(cat, 24).then(function (pack) {
      if (!draft.pickerOpen || draft.pickerQ) return;
      draft.pickerBusy = false;
      draft.pickerRows = (pack && pack.rows) || [];
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
      if (!draft.pickerOpen || draft.pickerQ !== query) return; // closed or superseded
      draft.pickerBusy = false;
      draft.pickerRows = rows || [];
      renderSetup();
    });
  }

  function pickFromPicker(kw, cat, pickOpts) {
    pickOpts = pickOpts || {};
    var norm = String(kw || '').trim().toLowerCase();
    if (!norm || draft.picked.length >= S.keywordLimit) return;
    if (draft.picked.some(function (k) { return String(k.keyword).toLowerCase() === norm; })) return;
    var hit = (draft.pickerRows || []).filter(function (r) {
      return String(r.keyword || '').toLowerCase() === norm;
    })[0] || {};
    var known = pickOpts.known != null ? !!pickOpts.known : !!hit.keyword;
    draft.picked.push({
      keyword: String(kw).trim(),
      category: cat || hit.category || '',
      image_url: hit.rep_image_url || hit.image_url || hit.top_image || '',
      known: known,
      meta: known
        ? (hit.n_sellers ? (fmtUnits(hit.n_sellers) + ' penjual') : '')
        : 'Belum di daftar scrape — kami mulai track dari sekarang',
    });
    if (!known) {
      try { call('track', 'tracker_keyword_unknown_add', { site: opts.site, keyword: String(kw).trim(), via: 'picker' }); } catch (_) {}
    }
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
    var unknownKws = draft.picked.filter(function (k) { return k && k.known === false; });
    var unknownNote = unknownKws.length
      ? '<p class="ltk-promise-foot ltk-promise-foot--warn"><b>Catatan:</b> ' +
        (unknownKws.length === 1
          ? ('Keyword &ldquo;' + esc(unknownKws[0].keyword) + '&rdquo; belum ada di daftar scrape kami.')
          : (unknownKws.length + ' keyword belum ada di daftar scrape kami.')) +
        ' Kami mulai scrape tiap pagi karena kamu memantau — tren butuh minimal 2 hari data. Update pertama <b>' +
        esc(nextUpdateLabel()) + '</b>.</p>'
      : '';
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
      'sebelumnya. Update pertama <b>' + esc(nextUpdateLabel()) + '</b>.</p>' +
      unknownNote +
      '<div class="ltk-notify ltk-notify--wiz">' +
        '<div class="ltk-stephead">' +
          '<h3>Mau dikabari lewat mana?</h3>' +
          '<p>Setiap ada perubahan berarti, kami kabari kamu. Pilih satu, dua-duanya, ' +
          'atau lewati kalau mau cek sendiri.</p>' +
        '</div>' +
        notifyCardsHtml(draft.notifyChannels, draft.notifyWa, { msg: draft.notifyMsg }) +
      '</div>';
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

  // Keyword slots the wizard renders right now: never more than the real cap,
  // never fewer than one empty box past what is already picked, and at least
  // KW_SLOTS_MIN so the step does not look empty. Grows via the "tambah lagi"
  // control below.
  var KW_SLOTS_MIN = 6;
  var KW_SLOTS_STEP = 6;
  function kwSlotsShown() {
    return Math.min(
      S.keywordLimit,
      Math.max(KW_SLOTS_MIN, draft.picked.length + 1, draft.slotsShown || 0)
    );
  }
  function kwMoreSlotsHtml() {
    if (kwSlotsShown() >= S.keywordLimit) return '';
    return '<button type="button" class="ltk-addrow" data-ltk-more-slots="1">' +
      'Tambah slot lagi — kamu bisa pantau sampai ' + S.keywordLimit + '</button>';
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
    var knownNorm = {};
    (S.baseline || []).forEach(function (b) {
      if (b && b.keyword) knownNorm[kwNorm(b.keyword)] = 1;
    });
    var unknownKws = S.keywords.filter(function (k) { return k && !knownNorm[kwNorm(k.keyword)]; });
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

    var unknownBlock = unknownKws.length
      ? '<div class="ltk-collect-unknown">' +
          '<p class="ltk-collect-unknown-title">' +
            (unknownKws.length === n
              ? 'Keyword kamu belum ada di daftar scrape kami'
              : (unknownKws.length + ' keyword belum ada di daftar scrape kami')) +
          '</p>' +
          '<p class="ltk-collect-unknown-body">Itulah kenapa chart belum muncul. Kami mulai scrape tiap pagi karena kamu memantau — tren butuh minimal 2 hari data. Update pertama <b>' +
            esc(nextUpdateLabel()) + '</b>.</p>' +
          '<ul class="ltk-collect-unknown-list">' +
            unknownKws.map(function (k) {
              return '<li>&ldquo;' + esc(k.keyword) + '&rdquo;</li>';
            }).join('') +
          '</ul>' +
        '</div>'
      : '';

    var heroBody = unknownKws.length === n && n > 0
      ? ('Keyword yang kamu pantau belum ada di database scrape kami. Kami mulai kumpulkan data sejak kamu menambahkannya — update pertama <b>' +
          esc(nextUpdateLabel()) + '</b>.')
      : ('Kami mulai kumpulkan data untuk ' + n + ' keyword kamu. Update pertama masuk <b>' +
          esc(nextUpdateLabel()) + '</b>.');

    p.innerHTML =
      '<div class="ltk-collect">' +
        '<div class="ltk-collect-hero">' +
          '<span class="ltk-collect-ico" aria-hidden="true">' +
            '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1"/>' +
            '<path d="M7 17a5 5 0 0110 0"/><path d="M3 21h18"/></svg>' +
          '</span>' +
          '<div><h3>Pantauan kamu sudah aktif</h3>' +
          '<p>' + heroBody + '</p></div>' +
        '</div>' +
        unknownBlock +
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
        deltaHtml(r.avg_price, r.avg_price_prev, trend) + '</td>' +
      '<td class="ltk-num"><b>' + esc(fmtRating(r.avg_rating)) + '</b>' +
        deltaHtml(r.avg_rating, r.avg_rating_prev, trend) + '</td>' +
      '<td class="ltk-sparkcell">' +
        (trend
          ? '<canvas class="ltk-spark" data-ltk-spark="' + attr(key) + '" width="68" height="24"></canvas>'
          : '<span class="ltk-spark-empty" title="' +
            (isKw && !keywordKnownInCorpus(rowLabel(r))
              ? 'Belum di daftar scrape — menunggu data pertama'
              : 'Perlu minimal 2 hari data') +
            '">' +
            (isKw && !keywordKnownInCorpus(rowLabel(r)) ? 'Belum di scrape' : 'Belum ada tren') +
            '</span>') +
      '</td>';

    var expanded = S.openDetail === key;
    return '<tr class="ltk-row' + (expanded ? ' is-expanded' : '') + '" data-ltk-rowkey="' + attr(key) + '" ' +
      'aria-expanded="' + expanded + '" tabindex="0">' +
      '<th scope="row" class="ltk-rowhead">' +
        (isKw ? rowIconHtml(r) : storeAvatar(r)) +
        '<span class="ltk-rowhead-txt">' +
          '<span class="ltk-rowhead-name">' + esc(rowLabel(r)) + '</span>' +
          '<span class="ltk-rowhead-meta">' +
            (trend
              ? 'Aktif · ' + r.n_days + ' hari data'
              : (isKw && !keywordKnownInCorpus(rowLabel(r))
                  ? 'Belum di daftar scrape — menunggu data'
                  : 'Mengumpulkan data')) +
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
        (S.openRow === key ? rowMenuHtml(key, isKw, 'row') : '') +
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
      ['Unit minggu ini', fmtUnits(r.units || 0), deltaHtml(r.units, r.units_prev, trend)],
      ['Omset minggu ini', fmtRp(r.omset || 0), deltaHtml(r.omset, r.omset_prev, trend)],
      ['SKU Aktif', fmtUnits(r.n_listings || 0), deltaHtml(r.n_listings, r.n_listings_prev, trend)],
    ];
    if (isKw) fields.push(['Toko Aktif', fmtUnits(r.n_sellers || 0), deltaHtml(r.n_sellers, r.n_sellers_prev, trend)]);
    else fields.push(['Usia Toko', fmtAge(r.oldest_listing_date), '']);
    fields.push(['Rata-rata Harga', fmtRp(r.avg_price || 0), deltaHtml(r.avg_price, r.avg_price_prev, trend)]);
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

  /* ── Row card ────────────────────────────────────────────────────────────
     The only visible row surface (the table above it is display:none). Laid
     out like the Deep Dive hero row: who it is on top, then measured numbers
     on the left and one interactive weekly chart on the right, then the way
     into the full detail screen. Everything it draws comes from data
     loadDenseSeries() already fetched for the rollup — no extra round trips. */

  // One source for the kebab menu markup — rendered inline by rowHtml/cardHtml
  // and re-injected in place by syncOpenMenus() when the menu is toggled.
  function rowMenuHtml(key, isKw, variant) {
    return '<div class="ltk-menu' + (variant === 'card' ? ' ltk-menu--card' : '') + '" role="menu">' +
      '<button type="button" role="menuitem" data-ltk-act="setup">Ubah pantauan</button>' +
      (isKw ? '<button type="button" role="menuitem" data-ltk-dive="' + attr(key) + '">Buka Deep Dive</button>' : '') +
      '<button type="button" role="menuitem" class="ltk-menu-danger" data-ltk-drop="' + attr(key) + '">Hapus</button>' +
    '</div>';
  }

  // Hero numbers on the card: this WIB week vs last week for omset/units,
  // latest vs earlier level for price. The chart beside them is the same week.
  function cardStatsHtml(key, r, trend, isKw) {
    var skus = Number(r.n_listings) || 0;
    var foot = isKw
      ? fmtUnits(skus) + ' SKU aktif di ' + fmtUnits(r.n_sellers || 0) + ' toko'
      : fmtUnits(skus) + ' SKU aktif';
    return '<div class="ltk-card-stats">' +
      STAT_METRICS.map(function (m) {
        return metricStatBlockHtml(key, m, r, trend, 0, 0);
      }).join('') +
      (skus ? '<p class="ltk-card-stats-foot">' + esc(foot) + '</p>' : '') +
    '</div>';
  }

  // Canvas is mounted lazily (mountCardCharts) — the markup only reserves it.
  // Note the chart block sits OUTSIDE [data-ltk-lihatdetail]: scrubbing a week
  // must never navigate away from the list.
  function cardChartHtml(key, trend) {
    if (!trend) {
      return '<div class="ltk-card-chart ltk-card-chart--empty">' +
        '<p class="ltk-detail-peers-note">' + thinTrendNoteHtml(key, false) + '</p>' +
      '</div>';
    }
    return '<div class="ltk-card-chart">' +
      '<div class="ltk-cchart-head">' +
        '<span class="ltk-cchart-read">' +
          '<b class="ltk-cchart-om" data-ltk-cread="om">—</b><span>omset</span>' +
          '<b class="ltk-cchart-un" data-ltk-cread="un">—</b><span>unit</span>' +
        '</span>' +
        '<span class="ltk-chart-scrub-date" data-ltk-cread="date"></span>' +
      '</div>' +
      '<div class="ltk-detail-chart-canvaswrap">' +
        '<canvas class="ltk-card-chart-canvas" data-ltk-cardchart="' + attr(key) + '" ' +
          'width="600" height="200" aria-hidden="true"></canvas>' +
      '</div>' +
      '<div class="ltk-detail-chart-labels" data-ltk-chart-labels></div>' +
      '<div class="ltk-chart-legend">' +
        '<span class="ltk-chart-legend-item"><i class="ltk-lg-om"></i>Omset / minggu (Rp)</span>' +
        '<span class="ltk-chart-legend-item"><i class="ltk-lg-un"></i>Unit / minggu</span>' +
        '<span class="ltk-chart-legend-item"><i class="ltk-lg-fc"></i>Perkiraan</span>' +
      '</div>' +
    '</div>';
  }

  // Identity column (taller image + name + omset/harga/unit in one row) sits
  // left of a flexing chart with Lihat Detail pinned right; below the
  // @container breakpoint the same pieces stack.
  function cardHtml(r) {
    var key = rowKey(r);
    var trend = rowHasTrend(r);
    var isKw = S.tab !== 'store';
    // Who's selling it (product cards) or how long they've sold (store cards,
    // no store-of-store concept). Falls back to the toko-count when there's no
    // rep store name yet, never leaving the line blank.
    var line1 = isKw
      ? (r.store_name || (trend ? fmtUnits(r.n_sellers || 0) + ' toko aktif' : 'Mengumpulkan data'))
      : (r.oldest_listing_date ? 'Toko sejak ' + fmtAge(r.oldest_listing_date) : 'Mengumpulkan data');
    return '<article class="ltk-card">' +
      '<div class="ltk-card-kebabwrap">' +
        '<button type="button" class="ltk-kebab" data-ltk-menu="' + attr(key) + '" ' +
          'aria-label="Aksi untuk ' + attr(rowLabel(r)) + '" aria-expanded="' + (S.openRow === key) + '">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
          '<circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>' +
        '</button>' +
        (S.openRow === key ? rowMenuHtml(key, isKw, 'card') : '') +
      '</div>' +
      '<div class="ltk-card-row">' +
        '<div class="ltk-card-ident">' +
          '<div class="ltk-card-top" data-ltk-lihatdetail="' + attr(key) + '">' +
            (isKw ? rowIconHtml(r) : storeAvatar(r)) +
            '<div class="ltk-card-head">' +
              '<span class="ltk-card-name">' + esc(rowLabel(r)) + '</span>' +
              '<span class="ltk-card-meta">' + esc(line1) + '</span>' +
            '</div>' +
          '</div>' +
          cardStatsHtml(key, r, trend, isKw) +
        '</div>' +
        cardChartHtml(key, trend) +
        '<button type="button" class="ltk-card-detail-btn" data-ltk-lihatdetail="' + attr(key) + '">Lihat Detail' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>' +
        '</button>' +
      '</div>' +
    '</article>';
  }

  /* The keyword cap is 40, and mounting forty canvases in one paint is a jank
     machine — so the first EAGER_CHARTS rows mount immediately and the rest
     wait until their card is near the viewport.

     The lazy half is a throttled scroll sweep, not an IntersectionObserver:
     observer callbacks, rAF and even scroll events are all delivered off the
     rendering lifecycle, which a page that isn't painting can withhold
     indefinitely — and the failure mode there is a card stuck showing an empty
     chart box. The eager head means that starvation can never cost a normal
     account (a handful of tracked rows) anything at all. */
  var EAGER_CHARTS = 8;
  var _chartSweep = null;
  var _sweepTimer = 0;
  var _layoutRetries = 0;

  function mountCardChart(cv) {
    cv._ltkTried = true;
    var key = cv.getAttribute('data-ltk-cardchart');
    var row = findRollupRow(key);
    if (!row) return;
    var card = cv.closest ? cv.closest('.ltk-card') : null;
    if (!card) return;
    var dc = mountTrendChart(cv, {
      mode: 'dual',
      row: row,
      labelsEl: card.querySelector('[data-ltk-chart-labels]'),
      header: {
        omEl: card.querySelector('[data-ltk-cread="om"]'),
        unEl: card.querySelector('[data-ltk-cread="un"]'),
        dateEl: card.querySelector('[data-ltk-cread="date"]'),
      },
    });
    // rowHasTrend() can pass on raw scrape buckets while the weekly series
    // still has fewer than two plottable points. Say so rather than leaving a
    // blank canvas and a "—" readout sitting there.
    if (!dc) chartUnavailable(card.querySelector('.ltk-card-chart'));
  }

  function chartUnavailable(wrap) {
    if (!wrap) return;
    wrap.className = 'ltk-card-chart ltk-card-chart--empty';
    wrap.innerHTML = '<p class="ltk-detail-peers-note">Belum cukup riwayat mingguan untuk menggambar tren.</p>';
  }

  // setTimeout, not requestAnimationFrame: rAF is starved whenever the page
  // isn't producing frames (background tab, offscreen host), and a chart that
  // only mounts on the next frame would then never mount at all.
  function scheduleSweep(delay) {
    if (_sweepTimer) return;
    _sweepTimer = global.setTimeout(function () {
      _sweepTimer = 0;
      sweepCardCharts();
    }, delay || 16);
  }

  function sweepCardCharts() {
    var p = pane('rollup');
    var canvases = p ? p.querySelectorAll('[data-ltk-cardchart]') : [];
    var vh = global.innerHeight || 800;
    var pending = 0, unlaid = 0;
    canvases.forEach(function (cv, idx) {
      if (cv._ltkTried) return;
      // Zero width means the pane has not been laid out yet — the host renders
      // the view before showing it. Sizing a canvas off a 0px box leaves a
      // stretched, blurry chart, so defer and come back.
      if (!cv.clientWidth) { pending++; unlaid++; return; }
      var r = cv.getBoundingClientRect();
      if (idx < EAGER_CHARTS || (r.bottom > -400 && r.top < vh + 400)) mountCardChart(cv);
      else pending++;
    });
    // Bounded, because a rollup left hidden behind the detail screen would
    // otherwise retry forever.
    if (unlaid && _layoutRetries < 5) { _layoutRetries++; scheduleSweep(120); return; }
    if (!pending) detachChartSweep();
  }

  function attachChartSweep() {
    if (_chartSweep) return;
    _chartSweep = function () { scheduleSweep(16); };
    // Capture phase: in Site B the tracker sits inside the app's own scrolling
    // container, so the scroll event never reaches window in the bubble phase.
    global.addEventListener('scroll', _chartSweep, true);
    global.addEventListener('resize', _chartSweep);
  }

  function detachChartSweep() {
    if (_sweepTimer) { global.clearTimeout(_sweepTimer); _sweepTimer = 0; }
    if (!_chartSweep) return;
    global.removeEventListener('scroll', _chartSweep, true);
    global.removeEventListener('resize', _chartSweep);
    _chartSweep = null;
  }

  function mountCardCharts(root) {
    if (!root || !root.querySelectorAll('[data-ltk-cardchart]').length) {
      detachChartSweep();
      return;
    }
    // Every render replaces the canvases; drop the charts that went with the
    // old ones so the resize handler isn't walking detached nodes forever.
    _charts = _charts.filter(function (d) { return d.cv && d.cv.isConnected; });
    _layoutRetries = 0;
    attachChartSweep();
    sweepCardCharts();
  }

  /* Toggling a kebab used to re-render the whole rollup — which now means
     tearing down and re-mounting every chart on the screen. Patch the open
     menu in place instead. */
  function syncOpenMenus() {
    var p = pane('rollup');
    if (!p) return;
    var isKw = S.tab !== 'store';
    p.querySelectorAll('.ltk-menu').forEach(function (m) { m.remove(); });
    p.querySelectorAll('[data-ltk-menu]').forEach(function (btn) {
      var key = btn.getAttribute('data-ltk-menu');
      var open = key === S.openRow;
      btn.setAttribute('aria-expanded', String(open));
      if (!open) return;
      // The table above the cards is display:none — no point building a menu
      // nobody can reach into it.
      if (btn.closest && btn.closest('.ltk-tablewrap')) return;
      var card = btn.closest && btn.closest('.ltk-card');
      btn.insertAdjacentHTML('afterend', rowMenuHtml(key, isKw, card ? 'card' : 'row'));
    });
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
      '<th>Unit minggu ini</th><th>Omset minggu ini</th><th>SKU Aktif</th>' +
      (isKw ? '<th>Toko Aktif</th>' : '<th>Usia Toko</th>') +
      '<th>Rata-rata Harga</th><th>Rating</th><th>Tren</th><th></th></tr>';

    p.innerHTML =
      '<div class="ltk-rollup">' +
        '<div class="ltk-panel">' +
          '<div class="ltk-panel-head">' +
            '<div class="ltk-panel-title">Ringkasan ' + (isKw ? 'Produk' : 'Toko') +
              ' Dipantau <span class="ltk-count-pill">' + rows.length + '</span></div>' +
            '<label class="ltk-sr">Urutkan' +
              '<select class="ltk-select" data-ltk-sort>' +
              [['omset', 'Omset minggu ini'], ['units', 'Unit minggu ini'], ['sku', 'SKU Aktif']]
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
              '<span class="ltk-add-tile-head">Tambah ' + (isKw ? 'Produk' : 'Toko') + '</span>' +
              (free ? '<span class="ltk-add-tile-sub">' + free + ' slot kosong</span>' : '') +
            '</button>' +
          '</div>' +
          '<button type="button" class="ltk-addrow" data-ltk-act="setup">' +
            '<span aria-hidden="true">+</span> Tambah Pantauan Baru' +
            (free ? '<em>' + free + ' slot kosong</em>' : '') +
          '</button>' +
        '</div>' +
        notifyBlockHtml() +
      '</div>';

    paintSparks();
    paintMetricSparks();
    mountCardCharts(p);
  }

  /* ── "Lihat Detail" screen ─────────────────────────────────────────────
     Stat row + one chart, driven by either the keyword/store aggregate
     (Semua) or one listing's product_daily_series. Listings are fetched
     via the adapter so this module still never touches _supabase. */

  function findRollupRow(key) {
    var rows = (S.rollup && S.rollup.rows) || [];
    for (var i = 0; i < rows.length; i++) if (rowKey(rows[i]) === key) return rows[i];
    return null;
  }

  function listingPeerKey(r) {
    return String(r.item_id) + '__' + String(r.shop_id);
  }

  function findDetailPeer(key) {
    var rows = S.detailPeers || [];
    for (var i = 0; i < rows.length; i++) {
      if (listingPeerKey(rows[i]) === key) return rows[i];
    }
    return null;
  }

  // Attach this-week / prior-week units+omset from listing_weekly so the
  // Kompetitor-style picker can show numbers + WoW % (not lifetime share).
  // Missing this week stays empty — do not silently show last week as if it
  // were now (that mixed periods under a chart whose last point is this week).
  function attachWeeklyToPeers(peers, weeklyRows) {
    var thisMon = wibMondayISO(wibTodayISO());
    var prevMon = addDaysISO(thisMon, -7);
    var byKey = {};
    (weeklyRows || []).forEach(function (w) {
      var k = String(w.item_id) + '__' + String(w.shop_id);
      if (!byKey[k]) byKey[k] = {};
      byKey[k][String(w.week_start || '').slice(0, 10)] = w;
    });
    (peers || []).forEach(function (p) {
      var weeks = byKey[listingPeerKey(p)] || {};
      var cur = weeks[thisMon];
      var prev = weeks[prevMon];
      p._wk_units = cur != null ? Math.round(Number(cur.units_wk) || 0) : null;
      p._wk_omset = cur != null ? Math.round(Number(cur.omset_wk) || 0) : null;
      p._wk_units_prev = prev != null ? Math.round(Number(prev.units_wk) || 0) : null;
      p._wk_omset_prev = prev != null ? Math.round(Number(prev.omset_wk) || 0) : null;
    });
    return peers || [];
  }

  function loadDetailPeers(key, row) {
    var isKw = S.detailScope !== 'store';
    var fetchPeers = isKw
      ? callP('getKeywordTopListings', row.keyword)
      : callP('getStoreTopListings', row.shop_id);
    return fetchPeers.then(function (rows) {
      if (S.detailKey !== key) return;
      var peers = rows || [];
      if (!peers.length) {
        S.detailPeers = [];
        S.detailPeersLoading = false;
        renderDetail();
        return;
      }
      return callP('getListingsWeeklyBatch', peers).then(function (weekly) {
        if (S.detailKey !== key) return;
        var enriched = attachWeeklyToPeers(peers, weekly || []);
        enriched.sort(function (a, b) {
          var ao = a._wk_omset != null ? a._wk_omset : -1;
          var bo = b._wk_omset != null ? b._wk_omset : -1;
          if (bo !== ao) return bo - ao;
          return (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0);
        });
        S.detailPeers = enriched;
        S.detailPeersLoading = false;
        renderDetail();
      }, function () {
        if (S.detailKey !== key) return;
        S.detailPeers = peers;
        S.detailPeersLoading = false;
        renderDetail();
      });
    }, function () {
      if (S.detailKey !== key) return;
      S.detailPeers = [];
      S.detailPeersLoading = false;
      renderDetail();
    });
  }

  function buildListingViewRow(listing, seriesRows, weeklyRows) {
    var r = {
      keyword: listing.product_name || '',
      item_id: listing.item_id,
      shop_id: listing.shop_id,
      store_name: listing.store_name,
      product_name: listing.product_name,
      image_url: listing.image_url,
      dseries: normaliseSeries(seriesRows),
      weeklyRows: weeklyRows || [],
    };
    deriveFromSeries(r);
    return r;
  }

  function activeDetailRow(base) {
    if (!S.detailListingKey || S.detailListingLoading) return base;
    // undefined = not fetched yet; [] = fetched but no usable scrape history
    if (!Object.prototype.hasOwnProperty.call(S.detailListingSeries, S.detailListingKey)) return base;
    var series = S.detailListingSeries[S.detailListingKey];
    var listing = findDetailPeer(S.detailListingKey);
    if (!listing) return base;
    return buildListingViewRow(listing, series || [], S.detailListingWeekly[S.detailListingKey] || []);
  }

  function selectDetailListing(key) {
    S.detailListingKey = key || null;
    if (!S.detailListingKey) {
      S.detailListingLoading = false;
      renderDetail();
      return;
    }
    if (S.detailListingSeries[S.detailListingKey]) {
      S.detailListingLoading = false;
      renderDetail();
      return;
    }
    var listing = findDetailPeer(S.detailListingKey);
    if (!listing) {
      S.detailListingKey = null;
      S.detailListingLoading = false;
      renderDetail();
      return;
    }
    S.detailListingLoading = true;
    renderDetail();
    var want = S.detailListingKey;
    Promise.all([
      callP('getProductSeries', listing, seriesSpanDays()),
      callP('getListingWeekly', listing.item_id, listing.shop_id),
    ]).then(function (pair) {
      if (S.detailListingKey !== want) return;
      S.detailListingSeries[want] = pair[0] || [];
      S.detailListingWeekly[want] = pair[1] || [];
      S.detailListingLoading = false;
      renderDetail();
    }, function () {
      if (S.detailListingKey !== want) return;
      S.detailListingSeries[want] = [];
      S.detailListingWeekly[want] = [];
      S.detailListingLoading = false;
      renderDetail();
    });
  }

  function openDetailScreen(key) {
    var row = findRollupRow(key);
    if (!row) { call('toast', 'Data tidak ditemukan.'); return; }
    S.detailKey = key;
    S.detailScope = S.tab;
    S.detailPeers = [];
    S.detailPeersLoading = true;
    S.detailMetric = 'omset';
    S.detailListingKey = null;
    S.detailListingSeries = {};
    S.detailListingWeekly = {};
    S.detailListingLoading = false;
    S.detailViewRow = null;
    showScreen('detail');
    renderDetail();
    loadDetailPeers(key, row);
    call('track', 'tracker_detail_open', { site: opts.site, scope: S.detailScope, key: key });
  }

  function closeDetailScreen() {
    S.detailKey = null;
    S.detailListingKey = null;
    S.detailViewRow = null;
    showScreen('rollup');
    renderRollup();
  }

  /* ── Trend chart engine ─────────────────────────────────────────────────
     Raw canvas, two modes:

       'single'  one metric on one Y axis — the "Lihat Detail" screen's chart,
                 line coloured green/red by direction.
       'dual'    omset on the left axis (filled) + unit on the right, with a
                 dashed green Perkiraan tail — the Deep Dive "Tren Pasar /
                 Pasar" view, drawn once per rollup row.

     STATE IS PER CANVAS (`cv._ltkChart`), never a module singleton. The rollup
     screen mounts one of these per tracked row (up to 40), and a shared state
     object would make scrubbing one row repaint another row's crosshair.

     No charting lib: Chart.js for one line was already the wrong trade on the
     detail screen; for forty of them it isn't a trade at all.                */

  var CHART_C = {
    om: '#B5202A', omFill: 'rgba(181,32,42,.07)',
    un: '#2563EB',
    fc: '#16A34A',
    up: '#16A34A', upFill: 'rgba(22,163,74,.08)',
    down: '#DC2626', downFill: 'rgba(220,38,38,.08)',
  };

  // Every live chart, so a resize can redraw them at the new width — the canvas
  // is sized from clientWidth at mount, so it would otherwise stretch and blur.
  var _charts = [];
  var _chartResizeBound = false;

  function axisFor(pts) {
    var vals = pts.map(function (p) { return p.v; });
    return niceAxis(Math.min.apply(null, vals), Math.max.apply(null, vals), 5);
  }

  // Widest tick label, in characters — decides how much gutter the axis needs.
  function tickChars(axis, metricKey) {
    var n = 0;
    for (var i = 0; i < axis.ticks.length; i++) {
      n = Math.max(n, fmtChartTick(axis.ticks[i], metricKey).length);
    }
    return n;
  }

  function firstForecastIdx(pts) {
    for (var i = 0; i < pts.length; i++) if (pts[i].forecast) return i;
    return -1;
  }

  function paintChartFrame(dc, hi) {
    if (!dc) return;
    var ctx = dc.ctx, w = dc.w, h = dc.h, P = dc.pad;
    var plotL = P.l, plotR = w - P.r, plotT = P.t, plotB = h - P.b;
    var plotH = Math.max(1, plotB - plotT);
    ctx.clearRect(0, 0, w, h);

    // Grid + axis labels. The left axis owns the gridlines; a right-hand axis
    // (dual mode's unit scale) prints labels only — two grids at two scales
    // draw a lattice, which is what Chart.js's drawOnChartArea:false avoids.
    ctx.font = '600 10px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    dc.series.forEach(function (s) {
      var axis = s.axis;
      if (!axis || !axis.ticks || !axis.ticks.length) return;
      var spanY = (axis.max - axis.min) || 1;
      var left = s.side !== 'r';
      for (var ti = 0; ti < axis.ticks.length; ti++) {
        var tv = axis.ticks[ti];
        var gy = plotT + plotH - ((tv - axis.min) / spanY) * plotH;
        if (left) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(229,231,235,.95)';
          ctx.lineWidth = 1;
          ctx.moveTo(plotL, gy);
          ctx.lineTo(plotR, gy);
          ctx.stroke();
        }
        // Right-hand ticks take the series colour so it is obvious which line
        // they scale — the two axes carry different units.
        ctx.fillStyle = left ? '#9CA3AF' : s.color;
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText(fmtChartTick(tv, s.key), left ? plotL - 6 : plotR + 6, gy);
      }
    });

    var fc = dc.firstForecast;
    dc.series.forEach(function (s) {
      var xy = s.xy;
      ctx.save();
      ctx.beginPath();
      ctx.rect(plotL, plotT, plotR - plotL, plotB - plotT);
      ctx.clip();
      if (s.fill) {
        tracePath(ctx, xy);
        ctx.lineTo(xy[xy.length - 1][0], plotB);
        ctx.lineTo(xy[0][0], plotB);
        ctx.closePath();
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      // Measured stretch solid, forecast tail dashed, so a modelled number is
      // never presented with the same authority as a measured one.
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (fc > 0 && fc < xy.length) {
        tracePath(ctx, xy.slice(0, fc + 1));
        ctx.stroke();
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = s.dashColor || s.color;
        tracePath(ctx, xy.slice(fc));
        ctx.stroke();
        ctx.restore();
      } else {
        tracePath(ctx, xy);
        ctx.stroke();
      }
      ctx.restore();

      // Mark every weekly point — forecast points keep the same radius so the
      // dashed tail stays readable.
      for (var mi = 0; mi < xy.length; mi++) {
        ctx.beginPath();
        ctx.arc(xy[mi][0], xy[mi][1], 3, 0, Math.PI * 2);
        ctx.fillStyle = (fc >= 0 && mi >= fc && s.dashColor) ? s.dashColor : s.color;
        ctx.fill();
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    });

    // Crosshair — the scrubbed week, or the default readout week otherwise.
    var idx = hi != null ? hi : dc.defaultIdx;
    var lead = dc.series[0].xy[idx];
    if (!lead) return;
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(lead[0], plotT);
    ctx.lineTo(lead[0], plotB);
    ctx.strokeStyle = 'rgba(107,114,128,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
    dc.series.forEach(function (s) {
      var p = s.xy[idx];
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    });
  }

  function updateChartHeader(dc, idx) {
    var H = dc.header || {};
    if (dc.mode === 'dual') {
      var i = idx == null ? dc.defaultIdx : idx;
      var om = dc.byKey.omset ? dc.byKey.omset.pts[i] : null;
      var un = dc.byKey.units ? dc.byKey.units.pts[i] : null;
      var ref = om || un;
      if (!ref) return;
      if (H.omEl) H.omEl.textContent = fmtRpShort(om ? om.v : 0);
      if (H.unEl) H.unEl.textContent = fmtUnits(un ? un.v : 0);
      if (H.dateEl) {
        H.dateEl.innerHTML = esc(fmtDayShort(ref.d)) +
          (ref.forecast ? ' <em>(perkiraan)</em>' : '');
      }
      return;
    }
    if (!H.valEl) return;
    if (idx == null) {
      H.valEl.textContent = H.normalValueText;
      if (H.subEl) H.subEl.innerHTML = H.normalSubHtml;
      return;
    }
    var pt = dc.series[0].pts[idx];
    var fakeRow = {}; fakeRow[dc.series[0].key] = pt.v;
    H.valEl.textContent = dc.activeStat.fmt(fakeRow);
    if (H.subEl) {
      H.subEl.innerHTML = '<span class="ltk-chart-scrub-date">' +
        esc(fmtDayShort(pt.d)) + (pt.forecast ? ' <em>(perkiraan)</em>' : '') + '</span>';
    }
  }

  function nearestIndexForX(dc, px) {
    var xy = dc.series[0].xy, best = 0, bestDist = Infinity;
    for (var i = 0; i < xy.length; i++) {
      var d = Math.abs(xy[i][0] - px);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Pointer Events cover mouse + touch + pen with one listener set. Desktop
  // gets hover-to-scrub (no click needed, matches a stock chart); touch only
  // scrubs while actually dragging, so a normal page-scroll swipe isn't
  // hijacked. setPointerCapture keeps move events firing on the canvas even
  // if the finger drifts past its edge mid-drag.
  //
  // Handlers read `cv._ltkChart` at event time rather than closing over one
  // chart, so a resize re-mount does not need to rebind (and must not: the
  // listeners are attached once per canvas, guarded by _ltkScrubBound).
  function bindChartScrub(cv) {
    if (cv._ltkScrubBound) return;
    cv._ltkScrubBound = true;
    var dragging = false;
    function idxFromEvent(e) {
      var dc = cv._ltkChart;
      if (!dc) return null;
      var rect = cv.getBoundingClientRect();
      return nearestIndexForX(dc, e.clientX - rect.left);
    }
    function show(e) {
      var dc = cv._ltkChart;
      if (!dc) return;
      var idx = idxFromEvent(e);
      if (idx == null) return;
      paintChartFrame(dc, idx);
      updateChartHeader(dc, idx);
    }
    function reset() {
      var dc = cv._ltkChart;
      if (!dc) return;
      paintChartFrame(dc, null);
      updateChartHeader(dc, null);
    }
    cv.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      show(e);
    });
    cv.addEventListener('pointermove', function (e) {
      if (dragging || e.pointerType === 'mouse') show(e);
    });
    cv.addEventListener('pointerup', function () { dragging = false; reset(); });
    cv.addEventListener('pointercancel', function () { dragging = false; reset(); });
    cv.addEventListener('pointerleave', function () { if (!dragging) reset(); });
    // Belt to the placement's braces: the chart block is rendered outside
    // [data-ltk-lihatdetail] precisely so a scrub cannot read as "open this
    // row", and this keeps a stray bubble-phase host handler out of it too.
    cv.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  function bindChartResize() {
    if (_chartResizeBound) return;
    _chartResizeBound = true;
    var t = 0;
    global.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        _charts.slice().forEach(function (dc) {
          if (dc.cv && dc.cv.isConnected) mountTrendChart(dc.cv, dc.opts);
        });
      }, 180);
    });
  }

  function renderChartDateLabels(container, minT, maxT, w, pad, stepDays) {
    if (!container) return;
    var P = resolvePad(pad);
    var DAY = 86400000, STEP = (stepDays || 7) * DAY;
    var ticks = [];
    for (var t = minT; t < maxT; t += STEP) ticks.push(t);
    // The last tick is always maxT so the axis never ends mid-gap — drop the
    // regular tick right before it if that would crowd two labels together.
    if (ticks.length && (maxT - ticks[ticks.length - 1]) < STEP / 2) ticks.pop();
    ticks.push(maxT);
    var spanT = (maxT - minT) || 1;
    var plotW = Math.max(1, w - P.l - P.r);
    container.innerHTML = ticks.map(function (t, i) {
      var pct = ((P.l + ((t - minT) / spanT) * plotW) / w) * 100;
      var isLast = i === ticks.length - 1;
      var cls = i === 0 ? ' ltk-chart-tick--first' : (isLast ? ' ltk-chart-tick--last' : '');
      var label = fmtDayShort(new Date(t).toISOString());
      // Mirror Deep Dive's "next week ▶" cue on the forecast Monday.
      if (isLast) label += ' ▸';
      return '<span class="ltk-chart-tick' + cls + '" style="left:' + pct.toFixed(2) + '%">' +
        esc(label) + '</span>';
    }).join('');
  }

  /* Mount (or re-mount) a chart on `cv`.
       o.row        rollup row / listing view row — supplies dseries + weeklyRows
       o.mode       'dual' (omset + unit) | 'single'
       o.metricKey  single mode only
       o.activeStat single mode only — formats the scrub readout
       o.labelsEl   date-axis strip
       o.header     dual: {omEl, unEl, dateEl}
                    single: {valEl, subEl, normalValueText, normalSubHtml}
     Returns the chart state, or null when there is nothing plottable — the
     caller is expected to have rendered the "belum cukup data" note instead. */
  function mountTrendChart(cv, o) {
    if (!cv || !cv.getContext) return null;
    o = o || {};
    var row = o.row;
    if (!row) return null;
    var mode = o.mode === 'dual' ? 'dual' : 'single';
    var daily = (row.dseries && row.dseries.length >= 2) ? row.dseries : rowSeries(row);
    var weekly = weeklyDetailSeries(daily);
    var defs = mode === 'dual'
      ? [{ key: 'omset', side: 'l', color: CHART_C.om, fill: CHART_C.omFill, dashColor: CHART_C.fc },
         { key: 'units', side: 'r', color: CHART_C.un, fill: null, dashColor: CHART_C.fc }]
      : [{ key: o.metricKey || 'omset', side: 'l' }];

    var i;
    for (i = 0; i < defs.length; i++) {
      var pts = seriesPoints(weekly, defs[i].key);
      if (!pts) return null;
      defs[i].pts = pts;
      defs[i].axis = axisFor(pts);
    }

    // Left pad sized to the longest Y tick so labels never clip; the right pad
    // does the same for dual mode's unit axis. Top/bottom keep points clear of
    // the plot edge, like Deep Dive's Chart.js padding.
    var padL = Math.max(36, Math.min(56, tickChars(defs[0].axis, defs[0].key) * 7 + 10));
    var padR = defs[1]
      ? Math.max(30, Math.min(52, tickChars(defs[1].axis, defs[1].key) * 7 + 10))
      : 10;
    var pad = { l: padL, r: padR, t: 10, b: 8 };

    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 280, h = cv.clientHeight || 160;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    var byKey = {};
    for (i = 0; i < defs.length; i++) {
      defs[i].xy = projectXY(defs[i].pts, w, h, pad, defs[i].axis.min, defs[i].axis.max);
      byKey[defs[i].key] = defs[i];
    }
    if (mode === 'single') {
      var xy0 = defs[0].xy;
      var up = xy0[xy0.length - 1][1] <= xy0[0][1];   // smaller y = higher value
      defs[0].color = up ? CHART_C.up : CHART_C.down;
      defs[0].fill = up ? CHART_C.upFill : CHART_C.downFill;
      defs[0].dashColor = defs[0].color;
    }

    var lead = defs[0].pts;
    var fcIdx = firstForecastIdx(lead);
    // Default readout is THIS week, not the next-Monday point weeklyDetailSeries
    // always appends — a card's headline should be where the market is now.
    // When that week is modelled the readout says so, so nothing is overstated.
    var defIdx = Math.max(0, lead.length - 2);

    var dc = {
      cv: cv, ctx: ctx, w: w, h: h, pad: pad, mode: mode,
      series: defs, byKey: byKey,
      firstForecast: fcIdx,
      defaultIdx: defIdx,
      activeStat: o.activeStat,
      header: o.header || {},
      opts: o,
    };
    cv._ltkChart = dc;
    _charts = _charts.filter(function (d) {
      return d.cv !== cv && d.cv && d.cv.isConnected;
    });
    _charts.push(dc);

    paintChartFrame(dc, null);
    updateChartHeader(dc, null);
    cv.style.touchAction = 'none';
    bindChartScrub(cv);
    bindChartResize();
    // A narrow card can't fit a label per week without the last two colliding —
    // fortnightly ticks read cleanly at any width the card takes.
    renderChartDateLabels(o.labelsEl, lead[0].t, lead[lead.length - 1].t, w, pad,
      w < 380 ? 21 : (w < 560 ? 14 : 7));
    return dc;
  }

  // Scrollable listing picker styled like Deep Dive "Top Kompetitor", but
  // columns are weekly numbers + WoW % (tracker job) instead of lifetime share.
  function listingPickerHtml(isKw) {
    var rows = S.detailPeers || [];
    var n = rows.length;
    var allActive = !S.detailListingKey;
    if (S.detailPeersLoading && !n) {
      return '<p class="ltk-detail-peers-note">Memuat listing…</p>';
    }
    var h = '<div class="ltk-table-wrap"><table class="ltk-table ltk-komp-table">' +
      '<thead><tr>' +
        '<th>#</th><th>' + (isKw ? 'Toko' : 'Produk') + '</th>' +
        '<th>Omset / minggu</th><th>Review</th><th>Unit / minggu</th>' +
        '<th>Harga</th><th>Δ minggu lalu</th>' +
      '</tr></thead><tbody>';

    h += '<tr class="ltk-komp-row' + (allActive ? ' is-active' : '') +
      '" role="button" tabindex="0" data-ltk-listing="" aria-selected="' + allActive + '">' +
      '<td class="ltk-tr-rank">—</td>' +
      '<td><div class="ltk-tr-prod"><span class="ltk-comp-av">Σ</span>' +
        '<div class="ltk-tr-prod-name">Semua' +
          '<span class="ltk-tr-prod-sub">' +
            (n ? n + ' listing' : 'Agregat pasar') +
          '</span></div></div></td>' +
      '<td colspan="5" class="ltk-komp-all-note">Agregat keyword / toko — ketuk listing di bawah untuk fokus</td>' +
      '</tr>';

    rows.forEach(function (r, i) {
      var lk = listingPeerKey(r);
      var active = S.detailListingKey === lk;
      var name = isKw
        ? (r.store_name || ('Toko ' + r.shop_id) || 'Toko')
        : (r.product_name || '—');
      var sub = isKw ? (r.product_name || '') : (r.store_name || '');
      var av = r.image_url
        ? '<img src="' + attr(r.image_url) + '" alt="" loading="lazy">'
        : esc(String(name).charAt(0).toUpperCase() || 'T');
      var unitsWk = r._wk_units;
      var omsetWk = r._wk_omset;
      var hasWk = unitsWk != null || omsetWk != null;
      var deltaCell;
      if (!hasWk) {
        deltaCell = '<span class="ltk-d ltk-d--flat">—</span>';
      } else if (r._wk_units_prev == null || Number(r._wk_units_prev) === 0) {
        deltaCell = (unitsWk || 0) > 0
          ? '<span class="ltk-d ltk-d--new">Baru</span>'
          : '<span class="ltk-d ltk-d--flat">—</span>';
      } else {
        deltaCell = deltaHtml(unitsWk, r._wk_units_prev, true);
      }
      h += '<tr class="ltk-komp-row' + (active ? ' is-active' : '') +
        (i >= 5 ? ' ltk-komp-extra" hidden' : '"') +
        ' role="button" tabindex="0" data-ltk-listing="' + attr(lk) + '" aria-selected="' + active + '">' +
        '<td class="ltk-tr-rank">' + (i + 1) + '</td>' +
        '<td><div class="ltk-tr-prod"><span class="ltk-comp-av">' + av + '</span>' +
          '<div class="ltk-tr-prod-name">' + esc(String(name).slice(0, 28)) +
            (sub ? '<span class="ltk-tr-prod-sub">' + esc(String(sub).slice(0, 40)) + '</span>' : '') +
          '</div></div></td>' +
        '<td>' + (omsetWk != null && omsetWk > 0 ? esc(fmtRpShort(omsetWk)) : '—') + '</td>' +
        '<td>' + esc(fmtUnits(r.reviews || 0)) + '</td>' +
        '<td>' + (unitsWk != null ? esc(fmtUnits(unitsWk)) : '—') + '</td>' +
        '<td>' + (r.price ? esc(fmtRp(r.price)) : '—') + '</td>' +
        '<td>' + deltaCell + '</td>' +
        '</tr>';
    });

    h += '</tbody></table></div>';
    if (n > 5) {
      h += '<button type="button" class="ltk-btn ltk-btn--ghost ltk-komp-more" data-ltk-komp-more>' +
        'Lihat Semua ' + Math.min(30, n) + ' Listing</button>';
    }
    return h;
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
    var base = key ? findRollupRow(key) : null;
    if (!base) { p.innerHTML = ''; return; }
    var prevScroll = 0;
    var prevList = p.querySelector('.ltk-table-wrap');
    if (prevList) prevScroll = prevList.scrollTop;
    var loadingListing = !!(S.detailListingKey && S.detailListingLoading);
    var row = activeDetailRow(base);
    S.detailViewRow = row;
    var isKw = S.detailScope !== 'store';
    var trend = rowHasTrend(row);
    var metric = S.detailMetric || 'omset';
    var activeStat = STAT_METRICS.filter(function (m) { return m.key === metric; })[0] || STAT_METRICS[0];
    var nEst = (row.dseries || []).filter(function (p) { return p.source === 'estimated'; }).length;
    var chartBody = loadingListing
      ? '<p class="ltk-detail-peers-note">Memuat tren listing…</p>'
      : (trend
        ? '<div class="ltk-detail-chart-canvaswrap">' +
            '<canvas class="ltk-detail-chart" data-ltk-detailchart width="600" height="180"></canvas>' +
          '</div>' +
          '<div class="ltk-detail-chart-labels" data-ltk-chart-labels></div>' +
          '<div class="ltk-chart-legend">' +
            '<span class="ltk-chart-legend-item"><i class="ltk-chart-legend-solid"></i>Data terukur' +
              (nEst ? ' / estimasi ulasan' : '') + '</span>' +
            '<span class="ltk-chart-legend-item"><i class="ltk-chart-legend-dash"></i>Perkiraan (minggu ini jika belum terukur, + 1 minggu ke depan)</span>' +
          '</div>'
        : '<p class="ltk-detail-peers-note">' +
            thinTrendNoteHtml(isKw ? rowLabel(base) : null, !!S.detailListingKey) +
          '</p>');
    p.innerHTML =
      '<div class="ltk-detail">' +
        '<button type="button" class="ltk-detail-back" data-ltk-detail-back>' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
          'Kembali ke Pantauan</button>' +
        '<div class="ltk-detail-head">' +
          (isKw ? rowIconHtml(base) : storeAvatar(base)) +
          '<div class="ltk-detail-head-txt">' +
            '<h3 class="ltk-detail-name">' + esc(rowLabel(base)) + '</h3>' +
            '<p class="ltk-detail-meta">' +
              (isKw
                ? (rowHasTrend(base)
                    ? esc(fmtUnits(base.n_sellers || 0)) + ' toko aktif · ' + esc(fmtUnits(base.n_listings || 0)) + ' SKU aktif'
                    : (keywordKnownInCorpus(rowLabel(base))
                        ? 'Mengumpulkan data'
                        : 'Belum di daftar scrape — menunggu scrape pertama'))
                : (base.oldest_listing_date ? 'Dipantau sejak toko berjualan ' + esc(fmtAge(base.oldest_listing_date)) : 'Mengumpulkan data')) +
            '</p>' +
          '</div>' +
        '</div>' +
        '<div class="ltk-detail-stats">' +
          STAT_METRICS.map(function (m) {
            return metricStatBlockHtml('__detail__', m, row, trend, 90, 28);
          }).join('') +
        '</div>' +
        '<div class="ltk-detail-chart-wrap">' +
          '<div class="ltk-detail-chart-head">' +
            '<div class="ltk-chart-value">' +
              '<span class="ltk-chart-value-num" data-ltk-chart-valnum>' +
                (loadingListing ? '…' : esc(activeStat.fmt(row))) + '</span>' +
              '<span data-ltk-chart-valsub>' +
                (loadingListing ? '' : deltaHtml(row[metric], row[metric + '_prev'], trend)) + '</span>' +
            '</div>' +
            '<div class="ltk-chart-toggles" role="tablist" aria-label="Metrik tren">' +
              CHART_TOGGLES.map(function (t) {
                return '<button type="button" role="tab" class="ltk-chart-toggle' + (metric === t.key ? ' is-active' : '') +
                  '" aria-selected="' + (metric === t.key) + '" data-ltk-chartmetric="' + attr(t.key) + '">' +
                  esc(t.label) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          chartBody +
        '</div>' +
        '<div class="ltk-listings">' +
          '<div class="ltk-listings-title">Top Listing</div>' +
          listingPickerHtml(isKw) +
        '</div>' +
      '</div>';
    var nextList = p.querySelector('.ltk-table-wrap');
    if (nextList && prevScroll) nextList.scrollTop = prevScroll;
    // Scoped to this pane, not host-wide: the rollup screen is still in the DOM
    // (hidden) and every one of its cards carries a [data-ltk-chart-labels] of
    // its own, so a host-level $() would hand back the wrong element.
    var cv = p.querySelector('[data-ltk-detailchart]');
    if (cv && !loadingListing) {
      var dcd = mountTrendChart(cv, {
        mode: 'single',
        row: row,
        metricKey: metric,
        activeStat: activeStat,
        labelsEl: p.querySelector('[data-ltk-chart-labels]'),
        header: {
          valEl: p.querySelector('[data-ltk-chart-valnum]'),
          subEl: p.querySelector('[data-ltk-chart-valsub]'),
          normalValueText: activeStat.fmt(row),
          normalSubHtml: deltaHtml(row[metric], row[metric + '_prev'], trend),
        },
      });
      if (!dcd) {
        var wrap = p.querySelector('.ltk-detail-chart-canvaswrap');
        if (wrap) {
          wrap.outerHTML = '<p class="ltk-detail-peers-note">' +
            'Belum cukup riwayat mingguan untuk menggambar tren.</p>';
        }
      }
    }
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

  /* ── Dense daily series ──────────────────────────────────────────────────
     get_tracker_rollup returns the raw scrape buckets, which are sparse and
     — because consecutive buckets' spans can overlap — double-count when
     summed. keyword_daily_series/store_daily_series fix both server-side:
     one interval wins per day, and every remaining day is filled from the
     velocity nowcast, tagged 'measured' | 'forecast' | 'prior'.

     Every stat the tracker shows is then derived from that ONE array, so the
     headline number, the % badge and the line can never disagree — and a
     keyword with two scrapes in 90 days still gets a full, honest curve
     instead of "Baru". */

  // Fetch 2x the window so the previous period (what the % compares against)
  // comes from the same series. mv_shop_daily only holds 120 days, so the
  // store scope can't usefully ask for more than that.
  function seriesSpanDays() {
    var want = (Number(S.windowDays) || DEFAULT_DAYS) * 2;
    return S.tab === 'store' ? Math.min(want, 120) : Math.min(want, 180);
  }

  // Normalise onto the metric keys the charts already use (avg_price, not
  // price) so drawSpark/drawDetailChart need no special-casing.
  function normaliseSeries(rows) {
    var out = (rows || []).map(function (p) {
      return {
        d: p.d,
        units: Number(p.units) || 0,
        omset: Number(p.omset) || 0,
        avg_price: Number(p.price) || 0,
        source: p.source || 'prior',
      };
    }).filter(function (p) { return p.d; });
    // 'prior' only ever precedes the first real scrape, where the RPC holds
    // the long-run average flat. Plotting that stretch would draw a long
    // straight line that reads as "sales were steady then", which is not what
    // it means — start the chart at the first measurement instead.
    var firstReal = 0;
    while (firstReal < out.length && out[firstReal].source === 'prior') firstReal++;
    return (firstReal > 0 && out.length - firstReal >= 2) ? out.slice(firstReal) : out;
  }

  // Write this-week / last-week onto the row BEFORE any early return. An empty
  // or 1-point series (RPC timeout, adapter catch returning []) must zero the
  // rollup's 60-day totals so they cannot sit under "Omset minggu ini".
  function applyWeeklyStats(r, s) {
    var wk = weeklyBuckets(s);
    var curW = wk[wk.length - 1];
    var prevW = wk.length >= 2 ? wk[wk.length - 2] : null;
    r.omset = curW ? Math.round(curW.omset) : 0;
    r.units = curW ? Math.round(curW.units) : 0;
    r.omset_prev = prevW ? Math.round(prevW.omset) : 0;
    r.units_prev = prevW ? Math.round(prevW.units) : 0;
    r.week_start = curW ? curW.d : null;
    r.week_partial = !!(curW && curW.source === 'forecast');
  }

  // Omset and units on every surface are THIS WIB WEEK vs last week — the same
  // two buckets the chart draws as its final solid points, from the same
  // weeklyBuckets() call, so the headline and the line beside it cannot
  // disagree. They used to be `win`-day window totals, which read as a weekly
  // figure next to a weekly chart and were not one: because `win` collapses to
  // half the series span, a keyword with 36 days of history showed an 18-day
  // total under a selector that said 90, printing 1.1m beside a chart point of
  // 557j. Price stays a level, not a flow: latest average vs the earlier one.
  function deriveFromSeries(r) {
    var s = r.dseries || [];
    applyWeeklyStats(r, s);
    if (s.length < 2) return;

    var firstT = Date.parse(s[0].d);
    var lastT = Date.parse(s[s.length - 1].d);
    // Future forecast days (p_to = today+7) must not inflate the window maths.
    var todayT = Date.parse(wibTodayISO() + 'T12:00:00');
    if (!isNaN(todayT) && lastT > todayT) lastT = todayT;
    // `win` no longer drives any headline — it sizes the sparkline and the
    // "N hari data" meta only. Halved against the span so a short series still
    // yields a sane slice.
    var spanDays = Math.max(1, Math.round((lastT - firstT) / 86400000));
    var win = Math.min(Number(S.windowDays) || DEFAULT_DAYS, Math.floor(spanDays / 2));
    if (win < 1) return;
    r.window_days_effective = win;
    var cur0 = lastT - win * 86400000;
    var prev0 = cur0 - win * 86400000;
    var lastPrice = 0, prevPrice = 0;
    s.forEach(function (p) {
      var t = Date.parse(p.d);
      if (isNaN(t) || t > lastT) return;
      if (t > cur0) {
        if (p.avg_price) lastPrice = p.avg_price;
      } else if (t > prev0) {
        if (p.avg_price) prevPrice = p.avg_price;
      }
    });
    if (lastPrice) r.avg_price = lastPrice;
    if (prevPrice) r.avg_price_prev = prevPrice;
    // A series is only a real trend if something actually moved in it —
    // an all-zero curve is "no data", not "flat sales".
    r.has_dense = s.some(function (p) {
      var t = Date.parse(p.d);
      if (!isNaN(t) && t > lastT) return false;
      return (p.source === 'measured' || p.source === 'estimated' || !p.source)
        && (p.omset > 0 || p.units > 0);
    });
    r.n_forecast = s.filter(function (p) {
      if (p.source !== 'forecast') return false;
      var t = Date.parse(p.d);
      return !isNaN(t) && t <= lastT;
    }).length;
    // n_days drives the "Aktif · N hari data" meta — count measured/estimated
    // days in the effective window, not raw scrape buckets.
    var measuredInWin = 0;
    s.forEach(function (p) {
      var t = Date.parse(p.d);
      if (!isNaN(t) && t > cur0 && t <= lastT && (p.source === 'measured' || p.source === 'estimated')) measuredInWin++;
    });
    if (measuredInWin > 0) r.n_days = measuredInWin;
    else if (r.has_dense) r.n_days = Math.max(r.n_days || 0, win);
  }

  // Keep the strip totals in lockstep with the per-row numbers we just
  // overwrote from the dense series — otherwise the header can disagree
  // with every cell underneath it.
  function recomputeTotalsFromRows() {
    var rows = (S.rollup && S.rollup.rows) || [];
    if (!rows.length) return;
    var t = Object.assign({}, S.rollup.totals || {});
    var units = 0, omset = 0, unitsPrev = 0, omsetPrev = 0;
    var priceSum = 0, priceN = 0, pricePrevSum = 0, pricePrevN = 0;
    rows.forEach(function (r) {
      units += Number(r.units) || 0;
      omset += Number(r.omset) || 0;
      unitsPrev += Number(r.units_prev) || 0;
      omsetPrev += Number(r.omset_prev) || 0;
      if (Number(r.avg_price) > 0) { priceSum += Number(r.avg_price); priceN++; }
      if (Number(r.avg_price_prev) > 0) { pricePrevSum += Number(r.avg_price_prev); pricePrevN++; }
    });
    t.tracked = rows.length;
    t.units = Math.round(units);
    t.omset = Math.round(omset);
    t.units_prev = Math.round(unitsPrev);
    t.omset_prev = Math.round(omsetPrev);
    if (priceN) t.avg_price = Math.round(priceSum / priceN);
    if (pricePrevN) t.avg_price_prev = Math.round(pricePrevSum / pricePrevN);
    S.rollup.totals = t;
  }

  function loadDenseSeries() {
    var rows = (S.rollup && S.rollup.rows) || [];
    if (!rows.length) return Promise.resolve(null);
    var isKw = S.tab !== 'store';
    var days = seriesSpanDays();
    return Promise.all(rows.map(function (r) {
      var p = isKw
        ? callP('getKeywordSeries', r.keyword, days)
        : callP('getStoreSeries', r.shop_id, days);
      var w = isKw
        ? callP('getKeywordWeekly', r.keyword)
        : Promise.resolve(null);
      return Promise.all([p, w]).then(function (pair) {
        r.dseries = normaliseSeries(pair[0]);
        r.weeklyRows = pair[1] || [];
        deriveFromSeries(r);
      }).catch(function (e) {
        warn('dense series failed', e);
        applyWeeklyStats(r, []);
      });
    })).then(function () {
      recomputeTotalsFromRows();
      return null;
    });
  }

  function enrichRollupRows() {
    var base = S.tab === 'store'
      ? Promise.all([loadStoreLogos(), loadStoreAges()])
      : loadRowImages();
    return Promise.resolve(base).then(loadDenseSeries).then(function () { return null; });
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
          S.keywordLimit = tr.keyword_limit || 40;
          S.storeLimit = tr.store_limit || 20;
          if (tr.metrics && tr.metrics.length) S.metrics = tr.metrics;
          if (tr.all_metrics && tr.all_metrics.length) S.allMetrics = tr.all_metrics;
          S.notifyChannels = tr.notify_channels || [];
          // notify_wa_number falls back to the profile number server-side, so
          // a user who gave one at signup sees it prefilled rather than blank.
          S.notifyWa = tr.notify_wa_number || '';
          S.notifyAsked = !!tr.notify_asked;
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
          // Even when the raw scrape buckets are thin, the dense series can
          // usually still produce a real curve for these keywords — so try it
          // first and only fall through to the "collecting" screen (baseline
          // + other people's movers, which reads as unrelated noise next to
          // the product you just added) if it genuinely comes back empty.
          return enrichRollupRows().then(function () {
            var anyDense = (S.rollup.rows || []).some(function (r) { return r.has_dense; });
            if (anyDense) { S.hasHistory = true; return null; }
            if (!S.hasHistory) return loadBaseline().then(loadFallback);
            return null;
          });
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
    // Notification channels, same reasoning as metrics: a failure here must
    // not cost the user the keywords they just committed. An empty selection
    // is a real answer ("don't notify me"), so it is saved too.
    chain = chain.then(function () {
      var chans = (draft.notifyChannels || []).slice();
      if (chans.join('|') === (S.notifyChannels || []).join('|')
          && (draft.notifyWa || '') === (S.notifyWa || '')) return null;
      return callP('setNotifyPrefs', chans, draft.notifyWa || '').then(function (r) {
        if (r && r.ok === false) return null;   // wa_number_required — surfaced on the rollup
        S.notifyChannels = (r && r.notify_channels) || chans;
        if (r && r.notify_wa_number) S.notifyWa = r.notify_wa_number;
        S.notifyAsked = true;
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
    _defaultSugCache = {};
    if (draft.sug.kind === 'keyword' && draft.sug.slot >= 0) {
      if (draft.sug.q) runKeywordSuggest(draft.sug.q);
      else loadDefaultKeywordSuggest();
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

  function keywordRowKey(r) {
    return String(r && r.keyword || '').toLowerCase();
  }

  function rowMatchesCat(r, cat) {
    if (!cat) return true;
    var c = String(r.category_canonical || r.category || '');
    return !c || c === cat;
  }

  function filterPickedKeywordRows(rows) {
    return (rows || []).filter(function (r) {
      var k = keywordRowKey(r);
      if (!k) return false;
      return !draft.picked.some(function (x) {
        return String(x.keyword).toLowerCase() === k;
      });
    });
  }

  function mergeKeywordRows(base, extra, limit) {
    var out = (base || []).slice();
    var seen = {};
    out.forEach(function (r) { seen[keywordRowKey(r)] = 1; });
    (extra || []).forEach(function (r) {
      if (out.length >= limit) return;
      var k = keywordRowKey(r);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(r);
    });
    return out.slice(0, limit);
  }

  // Recents first, then related to the latest search, then onboarding /
  // category popular, then global popular — so "+" is never an empty field.
  function suggestFromHistory(cat, limit) {
    limit = limit || 8;
    var fromHistory = false;
    return callP('getRecentSearchKeywords', 12).then(function (recent) {
      recent = (recent || []).map(function (k) { return String(k || '').trim(); }).filter(Boolean);
      fromHistory = recent.length > 0;
      var start = Promise.resolve([]);
      if (recent.length) {
        start = callP('getKeywordBaseline', recent.slice(0, 16)).then(function (base) {
          var by = {};
          (base || []).forEach(function (r) {
            if (!r || !r.keyword) return;
            by[String(r.keyword).toLowerCase()] = {
              keyword: r.keyword,
              category: r.category || '',
              category_canonical: r.category_canonical || '',
              n_sellers: r.n_sellers,
              price_median: r.price_median,
              rep_image_url: r.top_image || r.rep_image_url || '',
              image_url: r.top_image || r.rep_image_url || '',
            };
          });
          var ordered = [];
          recent.forEach(function (kw) {
            var hit = by[kw.toLowerCase()];
            if (hit && rowMatchesCat(hit, cat)) ordered.push(hit);
          });
          return ordered;
        });
      }
      return start.then(function (rows) {
        if (rows.length >= limit || !recent[0]) return rows;
        return callP('searchKeywords', { q: recent[0], category: cat || null, limit: limit }).then(function (related) {
          return mergeKeywordRows(rows, related, limit);
        });
      });
    }).then(function (rows) {
      rows = rows || [];
      if (rows.length >= limit) return { rows: rows.slice(0, limit), fromHistory: fromHistory };
      return callP('getSeedCandidates').then(function (seed) {
        var cats = cat ? [cat] : ((seed && seed.categories) || []);
        return cats.slice(0, 3).reduce(function (p, c) {
          return p.then(function (acc) {
            if (acc.length >= limit) return acc;
            return callP('getCategoryKeywords', c, Math.max(8, limit)).then(function (list) {
              return mergeKeywordRows(acc, list, limit);
            });
          });
        }, Promise.resolve(rows));
      }).then(function (filled) {
        if (filled.length >= limit) return { rows: filled.slice(0, limit), fromHistory: fromHistory };
        return callP('getPopularKeywords', { category: cat || null, limit: limit + 8 }).then(function (pop) {
          if (pop && pop.length) return { rows: mergeKeywordRows(filled, pop, limit), fromHistory: fromHistory };
          var moreCats = cat ? [] : (S.categories || []).slice(0, 3);
          return moreCats.reduce(function (p, c) {
            return p.then(function (acc) {
              if (acc.length >= limit) return acc;
              return callP('getCategoryKeywords', c, 8).then(function (list) {
                return mergeKeywordRows(acc, list, limit);
              });
            });
          }, Promise.resolve(filled)).then(function (acc) {
            return { rows: acc.slice(0, limit), fromHistory: fromHistory };
          });
        });
      });
    }).catch(function () {
      return { rows: [], fromHistory: false };
    });
  }

  function loadDefaultKeywordSuggest() {
    draft.sug.q = '';
    draft.sug.fromHistory = false;
    draft.sug.busy = true;
    renderSetup();
    var slotAtStart = draft.sug.slot;
    var cat = draft.cat;
    var cacheKey = String(cat || '');
    if (_defaultSugCache[cacheKey]) {
      draft.sug.rows = filterPickedKeywordRows(_defaultSugCache[cacheKey].rows);
      draft.sug.fromHistory = !!_defaultSugCache[cacheKey].fromHistory;
      draft.sug.busy = false;
      renderSetup();
      return;
    }
    suggestFromHistory(cat, 8).then(function (pack) {
      if (draft.sug.slot !== slotAtStart || draft.sug.q) return;
      var rows = (pack && pack.rows) || [];
      _defaultSugCache[cacheKey] = { rows: rows, fromHistory: !!(pack && pack.fromHistory) };
      draft.sug.rows = filterPickedKeywordRows(rows);
      draft.sug.fromHistory = !!_defaultSugCache[cacheKey].fromHistory;
      draft.sug.busy = false;
      renderSetup();
    }).catch(function () {
      if (draft.sug.slot !== slotAtStart || draft.sug.q) return;
      draft.sug.rows = []; draft.sug.busy = false; draft.sug.fromHistory = false;
      renderSetup();
    });
  }

  function openKeywordSlot(slot) {
    if (draft.sug.kind === 'keyword' && draft.sug.slot === slot) return;
    draft.sug.kind = 'keyword';
    draft.sug.slot = slot;
    var el = host && host.querySelector('[data-ltk-slot="' + slot + '"]');
    var q = el ? String(el.value || '') : '';
    draft.sug.q = q;
    if (String(q).trim()) runKeywordSuggest(q);
    else loadDefaultKeywordSuggest();
  }

  function runKeywordSuggest(q) {
    var query = String(q || '').trim();
    draft.sug.q = query;
    draft.sug.fromHistory = false;
    if (!query) { loadDefaultKeywordSuggest(); return; }
    draft.sug.busy = true;
    renderSetup();
    var slotAtStart = draft.sug.slot;
    callP('searchKeywords', { q: query, category: draft.cat, limit: 8 }).then(function (rows) {
      // A slower response for an older query must not overwrite a newer one.
      if (draft.sug.slot !== slotAtStart || draft.sug.q !== query) return;
      draft.sug.rows = filterPickedKeywordRows(rows);
      draft.sug.busy = false;
      renderSetup();
    }).catch(function () {
      if (draft.sug.q !== query) return;
      draft.sug.rows = []; draft.sug.busy = false; renderSetup();
    });
  }

  function pickSuggestion(kw, cat, pickOpts) {
    pickOpts = pickOpts || {};
    var name = String(kw || '').trim();
    if (name.length < 2) { call('toast', 'Keyword minimal 2 karakter.'); return; }
    if (draft.picked.length >= S.keywordLimit) { call('toast', 'Slot keyword sudah penuh.'); return; }
    if (draft.picked.some(function (x) { return x.keyword.toLowerCase() === name.toLowerCase(); })) return;
    var hit = draft.sug.rows.filter(function (r) { return kwNorm(r.keyword) === kwNorm(name); })[0] || {};
    var known = pickOpts.known != null ? !!pickOpts.known : !!hit.keyword;
    draft.picked.push({
      keyword: name,
      category: cat || hit.category || draft.cat || '',
      image_url: hit.rep_image_url || hit.image_url || hit.top_image || '',
      known: known,
      meta: known
        ? (hit.n_sellers ? hit.n_sellers + ' penjual' : '')
        : 'Belum di daftar scrape — kami mulai track dari sekarang',
    });
    if (!known) {
      try { call('track', 'tracker_keyword_unknown_add', { site: opts.site, keyword: name }); } catch (_) {}
    }
    draft.sug = { slot: -1, q: '', rows: [], busy: false, kind: 'keyword', fromHistory: false };
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

  function typeaheadIsOpen() {
    return !!(draft.pickerOpen || draft.sug.slot !== -1);
  }

  function eventInsideTypeahead(t) {
    if (!t || !t.closest) return false;
    if (draft.pickerOpen && (t.closest('.ltk-picker-panel') || t.closest('[data-ltk-picker-open]'))) return true;
    if (draft.sug.kind === 'keyword' && draft.sug.slot >= 0) {
      // Any empty slot (including another "+") is still the add-product search.
      if (t.closest('.ltk-slot--type')) return true;
      // Category is a live filter on the open keyword typeahead — keep it open.
      if (t.closest('[data-ltk-catsel]') || t.closest('.ltk-catsel')) return true;
    }
    if (draft.sug.kind === 'store' && draft.sug.slot === -2 && t.closest('.ltk-storefind')) return true;
    return false;
  }

  // Same as Escape: drop the live keyword/toko/picker search without committing.
  function closeTypeahead() {
    if (!typeaheadIsOpen()) return false;
    if (timers.typeahead) { clearTimeout(timers.typeahead); timers.typeahead = 0; }
    if (timers.storeSearch) { clearTimeout(timers.storeSearch); timers.storeSearch = 0; }
    if (timers.pickerSearch) { clearTimeout(timers.pickerSearch); timers.pickerSearch = 0; }
    draft.pickerOpen = false;
    draft.pickerQ = '';
    draft.pickerRows = [];
    draft.pickerBusy = false;
    draft.sug = {
      slot: -1, q: '', rows: [], busy: false, fromHistory: false,
      kind: draft.sug.kind === 'store' ? 'store' : 'keyword'
    };
    if (S.screen === 'setup') renderSetup();
    return true;
  }

  function onClick(e) {
    var t = e.target;
    // Snapshot before closeTypeahead() re-renders — a detached node is no longer
    // host.contains(), but Lanjut / Tutup / etc. still need to fire.
    var insideHost = !!(host && host.contains(t));
    if (typeaheadIsOpen() && !eventInsideTypeahead(t)) closeTypeahead();
    if (!insideHost) return;

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

    var moreSlots = t.closest && t.closest('[data-ltk-more-slots]');
    if (moreSlots) {
      draft.slotsShown = Math.min(S.keywordLimit, kwSlotsShown() + KW_SLOTS_STEP);
      renderSetup();
      return;
    }

    var plusSlot = t.closest && t.closest('.ltk-slot--type');
    if (plusSlot && !(t.closest && t.closest('[data-ltk-sugpick]'))) {
      var plusInp = plusSlot.querySelector('[data-ltk-slot]');
      if (plusInp) {
        var plusIdx = parseInt(plusInp.getAttribute('data-ltk-slot'), 10);
        if (!isNaN(plusIdx)) {
          if (draft.sug.slot !== plusIdx) openKeywordSlot(plusIdx);
          else if (typeof plusInp.focus === 'function') plusInp.focus();
          return;
        }
      }
    }

    var sug = t.closest && t.closest('[data-ltk-sugpick]');
    if (sug) {
      pickSuggestion(
        sug.getAttribute('data-ltk-sugpick'),
        sug.getAttribute('data-ltk-sugcat'),
        { known: sug.getAttribute('data-ltk-unknown') !== '1' }
      );
      return;
    }

    var kebab = t.closest && t.closest('[data-ltk-menu]');
    if (kebab) {
      var mk = kebab.getAttribute('data-ltk-menu');
      S.openRow = (S.openRow === mk) ? null : mk;
      syncOpenMenus();
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

    var listingPick = t.closest && t.closest('[data-ltk-listing]');
    if (listingPick) {
      selectDetailListing(listingPick.getAttribute('data-ltk-listing') || null);
      return;
    }

    var kompMore = t.closest && t.closest('[data-ltk-komp-more]');
    if (kompMore) {
      var wrap = kompMore.closest('.ltk-listings');
      if (wrap) {
        wrap.querySelectorAll('.ltk-komp-extra').forEach(function (tr) { tr.hidden = false; });
      }
      kompMore.remove();
      return;
    }

    // Any other click inside the tracker closes an open row menu.
    if (S.openRow && !(t.closest && t.closest('.ltk-menu'))) {
      S.openRow = null;
      syncOpenMenus();
    }

    var pickerOpenBtn = t.closest && t.closest('[data-ltk-picker-open]');
    if (pickerOpenBtn) { openPicker(); return; }

    var pickerClose = t.closest && t.closest('[data-ltk-picker-close]');
    if (pickerClose) { closePicker(); return; }

    var pickerPick = t.closest && t.closest('[data-ltk-picker-pick]');
    if (pickerPick) {
      pickFromPicker(
        pickerPick.getAttribute('data-ltk-picker-pick'),
        pickerPick.getAttribute('data-ltk-picker-cat'),
        { known: pickerPick.getAttribute('data-ltk-unknown') !== '1' }
      );
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

    // Notification channel toggle. Lives on both the wizard's last step (into
    // `draft`, saved by commit) and the rollup footer (into `S`, saved by its
    // own button), so it writes to whichever is on screen.
    var nch = t.closest && t.closest('[data-ltk-notifych]');
    if (nch) {
      var ck = nch.getAttribute('data-ltk-notifych');
      var inWizard = S.screen === 'setup';
      var list = inWizard ? draft.notifyChannels : S.notifyChannels;
      var ci = list.indexOf(ck);
      if (ci >= 0) list.splice(ci, 1); else list.push(ck);
      if (inWizard) { draft.notifyMsg = ''; renderSetup(); }
      else { S.notifyMsg = ''; S.notifySaved = false; renderNotifyBlock(); }
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
        loadCategories().then(function () {
          renderSetup();
          showScreen('setup');
          if (draft.picked.length < S.keywordLimit) openKeywordSlot(draft.picked.length);
        });
        break;
      case 'commit': commit(); break;
      case 'notify-save': saveNotifyPrefs(); break;
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

  function onFocusIn(e) {
    if (!host || !host.contains(e.target)) return;
    var el = e.target;
    if (!el.hasAttribute || !el.hasAttribute('data-ltk-slot')) return;
    var slot = parseInt(el.getAttribute('data-ltk-slot'), 10);
    if (!isNaN(slot)) openKeywordSlot(slot);
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
    // No re-render here on purpose — repainting the block on every keystroke
    // would move the caret. The value is read back out on save.
    if (el.hasAttribute('data-ltk-notifywa')) {
      if (S.screen === 'setup') draft.notifyWa = el.value;
      else S.notifyWa = el.value;
      return;
    }
    if (el.hasAttribute('data-ltk-sort')) {
      S.sort = el.value;
      lsWrite({ sort: S.sort });
      renderRollup();
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
    if (e.key === 'Escape' && typeaheadIsOpen()) {
      e.preventDefault();
      closeTypeahead();
      return;
    }
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
      // Exact match in suggestions wins; otherwise typed text that's not in
      // corpus becomes an explicit "track new keyword" pick (not the top fuzzy hit).
      var typed = String(el.value || '').trim();
      var exact = draft.sug.rows.filter(function (r) {
        return kwNorm(r.keyword) === kwNorm(typed);
      })[0];
      if (exact) pickSuggestion(exact.keyword, exact.category, { known: true });
      else if (typed.length >= 2 && !sugHasExact(typed, draft.sug.rows)) {
        pickSuggestion(typed, draft.cat, { known: false });
      } else if (draft.sug.rows[0]) {
        pickSuggestion(draft.sug.rows[0].keyword, draft.sug.rows[0].category, { known: true });
      } else {
        pickSuggestion(typed, draft.cat, { known: false });
      }
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
      var unknownN = (S.keywords || []).filter(function (k) {
        return k && !keywordKnownInCorpus(k.keyword);
      }).length;
      if (unknownN && unknownN === s.keywordCount) {
        return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
          'Keyword kamu belum ada di daftar scrape kami — kami mulai track sejak kamu menambahkannya. Update pertama ' +
          esc(s.nextUpdateLabel) + '.</span></div>';
      }
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        'Mengumpulkan data untuk ' + s.keywordCount + ' keyword kamu. Update pertama ' +
        esc(s.nextUpdateLabel) + '.</span></div>';
    }
    if (!s.topRow) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        s.rowCount + ' keyword dipantau — belum cukup hari data untuk hitung tren.</span></div>';
    }
    return '<div class="ltk-summary">' +
      '<div class="ltk-summary-line">Omset minggu ini · ' +
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
    S.windowDays = DEFAULT_DAYS;   // fixed; ui.days is deliberately ignored
    S.sort = ui.sort || S.sort;
    S.tab = (o.tab === 'store' || ui.tab === 'store') ? 'store' : 'keyword';
    buildShell();
    if (!bound) {
      global.document.addEventListener('click', onClick, true);
      global.document.addEventListener('input', onInput, true);
      global.document.addEventListener('focusin', onFocusIn, true);
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
      global.document.removeEventListener('focusin', onFocusIn, true);
      global.document.removeEventListener('change', onInput, true);
      global.document.removeEventListener('keydown', onKeydown, true);
      bound = false;
    }
    detachChartSweep();
    _charts = [];
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
      loadCategories().then(function () {
        renderSetup();
        showScreen('setup');
        if (!draft.seed && draft.picked.length < S.keywordLimit) {
          openKeywordSlot(draft.picked.length);
        }
      });
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
