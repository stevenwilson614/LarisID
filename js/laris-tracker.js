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
 *   configured && has_history && moved -> deltas
 *   configured && has_history && !moved-> quiet        (keywords are simply flat)
 * The collecting/quiet distinction needs has_history from the RPC; without it
 * both look identical and every user with flat keywords is told "come back
 * tomorrow" forever.
 */
(function (global) {
  'use strict';

  var LS_KEY = '_ltk_ui_v1';          // cosmetic only — never user data
  var WATCHDOG_PAINT_MS = 2500;       // never leave the user on a spinner past this
  var WATCHDOG_ABORT_MS = 8000;       // never leave the user on a dead screen at all
  var SEED_TARGET = 3;                // pre-fill 3 of 5; the 2 empty slots are the hook
  var DEFAULT_DAYS = 7;
  var WIB_OFFSET_MIN = 7 * 60;        // Asia/Jakarta, no DST
  var SCRAPE_HOUR_WIB = 7;            // morning run lands ~07:00 WIB

  var host = null;
  var adapter = null;
  var opts = {};
  var mounted = false;
  var bound = false;

  var S = {
    screen: 'setup',
    configured: false,
    paused: false,
    resumed: false,
    keywords: [],
    stores: [],
    keywordLimit: 5,
    storeLimit: 3,
    windowDays: DEFAULT_DAYS,
    asOf: null,
    hasHistory: false,
    movers: [],
    fallback: [],
    baseline: [],
    categories: [],
    lastRefreshAt: 0,
  };

  // Uncommitted setup draft. Nothing here is persisted or sent until commit.
  var draft = { cat: null, pool: [], picked: [], stores: [], busy: false, errors: {} };

  var inflight = null;
  var timers = { paint: 0, abort: 0, storeSearch: 0 };

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

  function catIconHtml(cat, size) {
    var px = size || 40;
    var slug = String(cat || '').toLowerCase()
      .replace(/&/g, 'dan').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var letter = esc(String(cat || '?').charAt(0).toUpperCase());
    // Art exists for the 19 shipped slugs; category_map can hold more. Degrade to
    // a tinted letter rather than a blank tile in the primary entry point.
    return '<span class="ltk-cat-ico" style="width:' + px + 'px;height:' + px + 'px">' +
      '<img src="/images/onboarding/categories/' + attr(slug) + '.png" alt="" width="' + px + '" height="' + px + '" loading="lazy" ' +
      'onerror="this.parentNode.className=\'ltk-cat-ico ltk-cat-ico--letter\';' +
      'this.parentNode.style.width=\'' + px + 'px\';this.parentNode.style.height=\'' + px + 'px\';' +
      'this.parentNode.textContent=\'' + letter + '\';">' +
      '</span>';
  }
  function imgOr(src, cls) {
    if (!src) return '<div class="' + cls + '"></div>';
    return '<img class="' + cls + '" src="' + attr(src) + '" alt="" loading="lazy">';
  }

  /* ── shell ──────────────────────────────────────────────────────────── */

  function buildShell() {
    host.className = 'ltk-root' + (host.className.indexOf('ltk-root') >= 0 ? '' : '');
    host.setAttribute('data-site', opts.site || 'a');
    host.innerHTML =
      '<div data-ltk-strip></div>' +
      '<header class="ltk-head">' +
        '<div class="ltk-head-main">' +
          '<h2 class="ltk-title">Pantauan Harian</h2>' +
          '<p class="ltk-sub" data-ltk-sub></p>' +
        '</div>' +
        '<div class="ltk-head-actions" data-ltk-headact></div>' +
      '</header>' +
      '<div class="ltk-chipbar" data-ltk-chipbar></div>' +
      '<section class="ltk-screen" data-ltk-screen="setup"></section>' +
      '<section class="ltk-screen" data-ltk-screen="collecting"></section>' +
      '<section class="ltk-screen" data-ltk-screen="deltas"></section>' +
      '<section class="ltk-screen" data-ltk-screen="quiet"></section>' +
      '<section class="ltk-screen" data-ltk-screen="error"></section>';
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
      act.innerHTML = S.configured
        ? '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="setup">Ubah keyword</button>'
        : '';
    }
  }

  function renderChipbar() {
    var bar = $('[data-ltk-chipbar]');
    if (!bar) return;
    if (!S.configured || S.screen === 'setup') { bar.innerHTML = ''; return; }
    var h = '';
    S.keywords.forEach(function (k) {
      h += '<button type="button" class="ltk-chip" data-ltk-kw="' + attr(k.keyword) + '">' +
             catIconHtml(k.category, 18).replace('ltk-cat-ico', 'ltk-chip-ico') +
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

  function renderSetup() {
    var p = pane('setup');
    if (!p) return;
    var freeK = Math.max(0, S.keywordLimit - draft.picked.length);

    var cats = (S.categories || []).map(function (c) {
      return '<button type="button" class="ltk-cat' + (draft.cat === c ? ' is-active' : '') +
             '" data-ltk-cat="' + attr(c) + '">' + catIconHtml(c, 40) +
             '<span class="ltk-cat-lbl">' + esc(c) + '</span></button>';
    }).join('');

    var poolHtml = '';
    if (draft.cat) {
      var chips = draft.pool.length
        ? draft.pool.map(function (t) {
            var on = draft.picked.some(function (x) { return x.keyword === t.keyword; });
            var full = !on && freeK <= 0;
            return '<button type="button" class="ltk-pick' + (on ? ' is-picked' : '') + '"' +
                   (full ? ' disabled' : '') + ' data-ltk-pick="' + attr(t.keyword) + '">' +
                   esc(t.keyword) +
                   (t.n_sellers ? '<span class="ltk-pick-n">' + esc(t.n_sellers) + '</span>' : '') +
                   '</button>';
          }).join('')
        : '<span class="ltk-hint">Belum ada keyword populer di kategori ini.</span>';
      poolHtml =
        '<div class="ltk-pool">' +
          '<div class="ltk-pool-head">' +
            '<span class="ltk-pool-title">Keyword populer di <b>' + esc(draft.cat) + '</b></span>' +
            '<button type="button" class="ltk-link" data-ltk-act="cat-back">Ganti kategori</button>' +
          '</div>' +
          '<div class="ltk-pool-chips">' + chips + '</div>' +
          '<details class="ltk-custom">' +
            '<summary>Ketik keyword sendiri</summary>' +
            '<div class="ltk-custom-row">' +
              '<input type="text" class="ltk-input" data-ltk-kwinput maxlength="120" ' +
              'placeholder="mis. rak dinding kayu" autocomplete="off">' +
              '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="kw-add">Tambah</button>' +
            '</div>' +
            '<p class="ltk-hint">Keyword yang terlalu spesifik biasanya cuma dapat sedikit produk. ' +
            'Pilih dari daftar di atas kalau ragu.</p>' +
          '</details>' +
        '</div>';
    }

    var slots = '';
    draft.picked.forEach(function (k) {
      var err = draft.errors[k.keyword];
      slots += '<li class="ltk-slot ltk-slot--filled' + (err ? ' ltk-slot--err' : '') + '">' +
        catIconHtml(k.category, 26).replace('ltk-cat-ico', 'ltk-slot-ico') +
        '<span class="ltk-slot-body"><span class="ltk-slot-kw">' + esc(k.keyword) + '</span>' +
        '<span class="ltk-slot-meta">' + esc(err || k.meta || k.category || '') + '</span></span>' +
        '<button type="button" class="ltk-slot-x" data-ltk-rm="' + attr(k.keyword) + '" ' +
        'aria-label="Hapus ' + attr(k.keyword) + '">&times;</button></li>';
    });
    for (var i = 0; i < freeK; i++) {
      slots += '<li class="ltk-slot ltk-slot--empty" data-ltk-act="focus-pool">' +
        '<span class="ltk-slot-plus">+</span><span class="ltk-slot-body">' +
        '<span class="ltk-slot-kw">Slot kosong</span>' +
        '<span class="ltk-slot-meta">Tambah lagi biar pantauanmu lebih lengkap</span></span></li>';
    }

    var storeSlots = draft.stores.map(function (st) {
      return '<li class="ltk-slot ltk-slot--filled">' +
        '<span class="ltk-slot-body"><span class="ltk-slot-kw">' + esc(st.store_name) + '</span>' +
        '<span class="ltk-slot-meta">Toko</span></span>' +
        '<button type="button" class="ltk-slot-x" data-ltk-rmstore="' + attr(st.shop_id) + '" ' +
        'aria-label="Hapus toko">&times;</button></li>';
    }).join('');

    p.innerHTML =
      '<div class="ltk-setup">' +
        '<div class="ltk-setup-hero">' +
          '<h3>Pilih yang mau kamu pantau tiap pagi</h3>' +
          '<p>Ketuk satu kategori — kami isikan keyword yang paling ramai di sana. ' +
          'Kamu bisa ganti kapan saja.</p>' +
        '</div>' +
        '<div class="ltk-catgrid" data-ltk-cats>' + cats + '</div>' +
        poolHtml +
        '<div class="ltk-slotsec">' +
          '<div class="ltk-slotsec-head"><span>Keyword kamu</span>' +
          '<span class="ltk-count">' + draft.picked.length + ' / ' + S.keywordLimit + '</span></div>' +
          '<ul class="ltk-slots">' + slots + '</ul>' +
        '</div>' +
        '<div class="ltk-slotsec">' +
          '<div class="ltk-slotsec-head"><span>Toko yang dipantau <em>(opsional)</em></span>' +
          '<span class="ltk-count">' + draft.stores.length + ' / ' + S.storeLimit + '</span></div>' +
          '<div class="ltk-storefind">' +
            '<input type="text" class="ltk-input" data-ltk-storeinput ' +
            'placeholder="Cari nama toko" autocomplete="off"' +
            (draft.stores.length >= S.storeLimit ? ' disabled' : '') + '>' +
            '<div class="ltk-store-results" data-ltk-storeres style="display:none"></div>' +
          '</div>' +
          (storeSlots ? '<ul class="ltk-slots">' + storeSlots + '</ul>' : '') +
        '</div>' +
        '<div class="ltk-commit">' +
          '<button type="button" class="ltk-btn ltk-btn--primary" data-ltk-act="commit"' +
          (draft.picked.length === 0 || draft.busy ? ' disabled' : '') + '>' +
            (draft.busy ? 'Menyimpan...' : 'Mulai pantau ' + draft.picked.length + ' keyword') +
          '</button>' +
          '<p class="ltk-commit-note">Kami cek keyword kamu tiap pagi. ' +
          'Update pertama <b>' + esc(nextUpdateLabel()) + '</b>.</p>' +
        '</div>' +
      '</div>';
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

  /* ── deltas screen ──────────────────────────────────────────────────── */

  function winbarHtml() {
    return '<div class="ltk-winbar"><div class="ltk-winbtns" role="group" aria-label="Rentang waktu">' +
      [7, 14, 30].map(function (d) {
        return '<button type="button" class="ltk-winbtn' + (S.windowDays === d ? ' is-active' : '') +
               '" data-ltk-days="' + d + '">' + (d === 7 ? '7 hari terakhir' : d + ' hari') + '</button>';
      }).join('') + '</div>' +
      (S.asOf ? '<span class="ltk-asof">Data terakhir ' + esc(fmtDate(S.asOf)) + '</span>' : '') +
      '</div>';
  }
  function winnoteHtml() {
    return '<p class="ltk-winnote">Angka di bawah adalah <b>total ' + S.windowDays +
      ' hari terakhir</b>, bukan penjualan kemarin.</p>';
  }

  function renderDeltas() {
    var p = pane('deltas');
    if (!p) return;
    var rows = S.movers.map(function (m, i) {
      var srcChip = m.source === 'store'
        ? '<span class="ltk-src ltk-src--store">Toko</span>'
        : '<span class="ltk-src ltk-src--kw">' + esc(m.keyword || '') + '</span>';
      return '<li><button type="button" class="ltk-mover" data-ltk-open="' +
          attr(m.item_id) + '|' + attr(m.shop_id) + '">' +
        '<span class="ltk-mover-rank">' + (i + 1) + '</span>' +
        imgOr(m.image_url, 'ltk-mover-img') +
        '<span class="ltk-mover-main">' +
          '<span class="ltk-mover-name">' + esc(m.product_name || '—') + '</span>' +
          '<span class="ltk-mover-src">' + srcChip +
          (m.store_name ? '<span class="ltk-mover-store">' + esc(m.store_name) + '</span>' : '') +
          '</span></span>' +
        '<span class="ltk-mover-fig"><span class="ltk-mover-num">+' + esc(fmtUnits(m.sold_window)) +
          '<span class="ltk-mover-unit"> terjual</span></span></span>' +
        '</button></li>';
    }).join('');

    p.innerHTML = '<div class="ltk-deltas">' + winbarHtml() + winnoteHtml() +
      '<ul class="ltk-movers">' + rows + '</ul>' +
      '<p class="ltk-foot">Menampilkan ' + S.movers.length + ' produk yang paling bergerak dari keyword dan toko kamu. ' +
      '<button type="button" class="ltk-link" data-ltk-act="how">Bagaimana angka ini dihitung?</button></p>' +
      '</div>';
  }

  /* ── quiet screen ───────────────────────────────────────────────────── */

  function renderQuiet() {
    var p = pane('quiet');
    if (!p) return;
    var names = S.keywords.map(function (k) { return '<b>' + esc(k.keyword) + '</b>'; }).join(', ');
    p.innerHTML =
      '<div class="ltk-quiet">' + winbarHtml() +
        '<div class="ltk-quiet-msg">' +
          '<span class="ltk-quiet-ico" aria-hidden="true">' +
            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="1.8" stroke-linecap="round"><path d="M3 12h18"/></svg></span>' +
          '<div><h3>Keyword kamu stabil ' + S.windowDays + ' hari ini</h3>' +
          '<p>Tidak ada produk yang bergerak berarti di ' + names + '. ' +
          'Itu informasi juga — pasarnya lagi tenang.</p>' +
          (S.windowDays < 30 ? '<button type="button" class="ltk-link" data-ltk-days="30">Coba lihat 30 hari</button>' : '') +
          '</div>' +
        '</div>' +
        discoverHtml() +
      '</div>';
  }

  /* ── discover fall-through (shared by collecting + quiet) ───────────────
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
    var p = pane('deltas');
    if (!p) return;
    var rows = '';
    for (var i = 0; i < 5; i++) {
      rows += '<div class="ltk-skel-row"><div class="ltk-skel-img"></div>' +
        '<div class="ltk-skel-lines"><div class="ltk-skel-line w60"></div>' +
        '<div class="ltk-skel-line w35"></div></div></div>';
    }
    p.innerHTML = '<div class="ltk-deltas">' + winbarHtml() + '<div class="ltk-skel">' + rows + '</div></div>';
  }

  function renderError() {
    var p = pane('error');
    if (!p) return;
    p.innerHTML = '<div class="ltk-err"><p>Gagal memuat pantauan kamu. Datanya aman — coba muat ulang.</p>' +
      '<button type="button" class="ltk-btn ltk-btn--ghost" data-ltk-act="retry">Coba lagi</button></div>';
  }

  /* ── screen selection ───────────────────────────────────────────────── */

  function paint() {
    renderStrip();
    if (!S.configured) { renderSetup(); showScreen('setup'); return; }
    if (!S.hasHistory) { renderCollecting(); showScreen('collecting'); return; }
    if (S.movers.length) { renderDeltas(); showScreen('deltas'); return; }
    renderQuiet(); showScreen('quiet');
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

    // Never a dead screen: fall through to quiet + discovery.
    timers.abort = setTimeout(function () {
      if (settled || gen !== refresh._gen) return;
      settled = true; inflight = null;
      S.hasHistory = true; S.movers = [];
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
          S.paused = !!tr.paused && !S.resumed;
          S.configured = (S.keywords.length + S.stores.length) > 0;
        }
        if (!S.configured) return loadCategories().then(seedDraft);
        return callP('getDeltas', S.windowDays).then(function (d) {
          S.movers = (d && d.moved) || [];
          S.asOf = (d && d.as_of) || null;
          // Stopgap for clients cached before the RPC gained has_history: assume
          // history once the oldest keyword is >40h old (one scrape cycle).
          if (d && typeof d.has_history === 'boolean') S.hasHistory = d.has_history;
          else S.hasHistory = oldestKeywordAgeMs() > 40 * 3600 * 1000;
          // A resumed tracker has provably nothing in a 7-day window (pause is
          // 14 days), so route it to collecting rather than a bare "quiet".
          if (S.resumed) S.hasHistory = false;
          if (!S.hasHistory) return loadBaseline().then(loadFallback);
          if (!S.movers.length) return loadFallback();
          return null;
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
        warn('refresh failed', e);
        renderError(); showScreen('error');
        return S;
      });

    inflight = work;
    return work;
  }
  refresh._gen = 0;

  function oldestKeywordAgeMs() {
    var oldest = 0;
    S.keywords.forEach(function (k) {
      var t = Date.parse(k.created_at || '');
      if (t && (!oldest || t < oldest)) oldest = t;
    });
    return oldest ? (Date.now() - oldest) : 0;
  }

  /* ── commit ─────────────────────────────────────────────────────────── */

  function commit() {
    if (draft.busy || !draft.picked.length) return;
    if (call('requireAuth') === false) return;
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

    chain.then(function () {
      draft.busy = false;
      draft.picked = []; draft.stores = []; draft.cat = null; draft.pool = [];
      call('track', 'tracker_setup_commit', { site: opts.site });
      return refresh({ force: true });
    }).catch(function (e) {
      draft.busy = false; warn('commit failed', e);
      call('toast', 'Gagal menyimpan. Coba lagi.');
      renderSetup();
    });
  }

  /* ── events ─────────────────────────────────────────────────────────── */

  function pickCategory(cat) {
    draft.cat = cat; draft.pool = [];
    renderSetup();
    callP('getCategoryKeywords', cat, 24).then(function (list) {
      if (draft.cat !== cat) return;
      draft.pool = list || [];
      // One tap fills the remaining slots — the "never a blank field" guarantee
      // at its hardest case (fresh user, no history at all).
      if (!draft.picked.length) {
        draft.pool.slice(0, SEED_TARGET).forEach(function (t) {
          draft.picked.push({ keyword: t.keyword, category: t.category || cat, meta: t.n_sellers ? t.n_sellers + ' penjual' : '' });
        });
      }
      renderSetup();
    });
  }

  function togglePick(kw) {
    var i = -1;
    draft.picked.forEach(function (x, idx) { if (x.keyword === kw) i = idx; });
    if (i >= 0) { draft.picked.splice(i, 1); }
    else {
      if (draft.picked.length >= S.keywordLimit) return;
      var t = draft.pool.filter(function (x) { return x.keyword === kw; })[0] || {};
      draft.picked.push({ keyword: kw, category: t.category || draft.cat || '', meta: t.n_sellers ? t.n_sellers + ' penjual' : '' });
    }
    renderSetup();
  }

  function addCustomKeyword() {
    var el = $('[data-ltk-kwinput]');
    if (!el) return;
    var kw = String(el.value || '').trim();
    if (kw.length < 2) { call('toast', 'Keyword minimal 2 karakter.'); return; }
    if (draft.picked.length >= S.keywordLimit) { call('toast', 'Slot keyword sudah penuh.'); return; }
    if (draft.picked.some(function (x) { return x.keyword.toLowerCase() === kw.toLowerCase(); })) return;
    draft.picked.push({ keyword: kw, category: draft.cat || '' });
    el.value = '';
    renderSetup();
  }

  function searchStores(q) {
    var box = $('[data-ltk-storeres]');
    if (!box) return;
    if (!q || q.length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    callP('searchStores', q).then(function (rows) {
      if (!rows || !rows.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
      box.innerHTML = rows.slice(0, 8).map(function (r) {
        return '<button type="button" class="ltk-store-opt" data-ltk-pickstore="' + attr(r.shop_id) +
          '" data-ltk-storename="' + attr(r.store_name) + '">' + esc(r.store_name) +
          (r.n_products ? '<span class="ltk-store-opt-n">' + esc(r.n_products) + ' produk</span>' : '') +
          '</button>';
      }).join('');
      box.style.display = '';
    });
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
        if (r && r.ok) { call('toast', '"' + kw + '" ditambahkan ke pantauan.'); return refresh({ force: true }); }
        if (r && r.error === 'limit_reached') call('toast', 'Slot keyword sudah penuh.');
        else if (r && r.error === 'already_tracked') call('toast', 'Keyword ini sudah kamu pantau.');
      });
      return;
    }

    var open = t.closest && t.closest('[data-ltk-open]');
    if (open) {
      var parts = String(open.getAttribute('data-ltk-open')).split('|');
      var row = findRow(parts[0], parts[1]);
      call('openProduct', row || { item_id: parts[0], shop_id: parts[1] });
      return;
    }

    var days = t.closest && t.closest('[data-ltk-days]');
    if (days) {
      var d = parseInt(days.getAttribute('data-ltk-days'), 10) || DEFAULT_DAYS;
      lsWrite({ days: d });
      refresh({ days: d, force: true });
      return;
    }

    var cat = t.closest && t.closest('[data-ltk-cat]');
    if (cat) { pickCategory(cat.getAttribute('data-ltk-cat')); return; }

    var pick = t.closest && t.closest('[data-ltk-pick]');
    if (pick && !pick.disabled) { togglePick(pick.getAttribute('data-ltk-pick')); return; }

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
      case 'cat-back': draft.cat = null; draft.pool = []; renderSetup(); break;
      case 'kw-add': addCustomKeyword(); break;
      case 'focus-pool': {
        var el = $('[data-ltk-cats]');
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
      case 'commit': commit(); break;
      case 'retry': refresh({ force: true }); break;
      case 'strip-close': lsWrite({ resumedAckAt: Date.now() }); S.resumed = false; renderStrip(); break;
      case 'how': call('openHowCalculated'); break;
    }
  }

  function onInput(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.target.hasAttribute && e.target.hasAttribute('data-ltk-storeinput')) {
      var q = e.target.value;
      if (timers.storeSearch) clearTimeout(timers.storeSearch);
      timers.storeSearch = setTimeout(function () { searchStores(q); }, 280);
    }
  }
  function onKeydown(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-ltk-kwinput')) {
      e.preventDefault(); addCustomKeyword();
    }
  }

  function findRow(itemId, shopId) {
    var all = S.movers.concat(S.fallback);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].item_id) === String(itemId) && String(all[i].shop_id) === String(shopId)) return all[i];
    }
    return null;
  }

  /* ── public API ─────────────────────────────────────────────────────── */

  function getState() {
    return {
      screen: S.screen, configured: S.configured, paused: S.paused, resumed: S.resumed,
      keywords: S.keywords.slice(), stores: S.stores.slice(),
      keywordLimit: S.keywordLimit, storeLimit: S.storeLimit,
      freeSlots: Math.max(0, S.keywordLimit - S.keywords.length),
      windowDays: S.windowDays, asOf: S.asOf, hasHistory: S.hasHistory,
      movers: S.movers.slice(), fallback: S.fallback.slice(),
      lastRefreshAt: S.lastRefreshAt,
    };
  }

  function summary() {
    var top = S.movers[0] || null;
    return {
      configured: S.configured,
      keywordCount: S.keywords.length,
      storeCount: S.stores.length,
      freeSlots: Math.max(0, S.keywordLimit - S.keywords.length),
      paused: S.paused,
      moverCount: S.movers.length,
      windowDays: S.windowDays,
      asOf: S.asOf,
      hasHistory: S.hasHistory,
      nextUpdateLabel: nextUpdateLabel(),
      topMover: top ? {
        name: top.product_name, image_url: top.image_url,
        sold_window: top.sold_window, item_id: top.item_id, shop_id: top.shop_id,
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
    if (!s.topMover) {
      return '<div class="ltk-summary"><span class="ltk-summary-empty">' +
        'Keyword kamu stabil ' + s.windowDays + ' hari ini — tidak ada pergerakan berarti.</span></div>';
    }
    return '<div class="ltk-summary">' +
      '<div class="ltk-summary-line">Paling bergerak ' + s.windowDays + ' hari terakhir</div>' +
      '<div class="ltk-summary-top">' +
        imgOr(s.topMover.image_url, 'ltk-summary-img') +
        '<div class="ltk-summary-main"><div class="ltk-summary-name">' +
          esc(s.topMover.name || '—') + '</div></div>' +
        '<div class="ltk-summary-num">+' + esc(fmtUnits(s.topMover.sold_window)) + '</div>' +
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
        call('openProduct', findRow(p[0], p[1]) || { item_id: p[0], shop_id: p[1] });
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
    S.windowDays = lsRead().days || o.defaultDays || DEFAULT_DAYS;
    buildShell();
    if (!bound) {
      global.document.addEventListener('click', onClick, true);
      global.document.addEventListener('input', onInput, true);
      global.document.addEventListener('keydown', onKeydown, true);
      bound = true;
    }
    mounted = true;
    return true;
  }

  function open(o) {
    o = o || {};
    if (!mount(opts && opts.hostId ? opts : o)) return Promise.resolve(null);
    return refresh({ touch: o.touch !== false, force: true });
  }

  function close() { clearTimers(); refresh._gen++; inflight = null; }

  function destroy() {
    close();
    if (bound) {
      global.document.removeEventListener('click', onClick, true);
      global.document.removeEventListener('input', onInput, true);
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
    openSetup: function () {
      draft.picked = S.keywords.map(function (k) { return { keyword: k.keyword, category: k.category }; });
      loadCategories().then(function () { renderSetup(); showScreen('setup'); });
    },
    isConfigured: function () { return S.configured; },
    getState: getState,
    summary: summary,
    summaryCardHtml: summaryCardHtml,
    bindSummary: bindSummary,
    destroy: destroy,
    version: '1.0.0',
  };
})(typeof window !== 'undefined' ? window : this);
