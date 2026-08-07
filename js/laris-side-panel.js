/**
 * LarisSidePanel — A persistent right-hand product panel for the Deep Dive page.
 *
 * Three tabs: Kalkulator (profit calculator), Kompetitor (competitor table),
 * Serupa (similar products). This module owns every pixel and all state; it
 * receives data and services through an adapter object and never touches app
 * globals. The panel exists because the same features buried in a tab strip
 * measured 0% / 11% usage on this page, while the panel form factor measured
 * 31% / 45% usage on a sibling page.
 *
 * Host contract:
 *   LarisSidePanel.mount({ hostId, site, adapter })
 *   adapter.getProduct() → product | null
 *   adapter.getPeers() → array
 *   adapter.fetchPeers(keyword) → Promise<array>
 *   adapter.openProduct(product)
 *   adapter.esc(str) → string
 *   adapter.fmtRp(n), fmtRpShort(n), fmtSold(n)
 *   adapter.track(event, props)
 *   adapter.toast(msg)
 */
(function (global) {
  'use strict';

  var HOST_ID = '';
  var adapter = null;
  var site = 'a';
  var panelEl = null;
  var state = {
    open: false,
    mode: null,
    collapsed: false,
    width: 380,
    sheetPct: 0.62,
    product: null,
  };
  var token = 0;
  var mounted = false;
  var bound = false;
  var resizeState = null;
  var _mq = null;         // matchMedia for the desktop/mobile switch
  var _escHandler = null; // document keydown ref, so unmount can detach it
  var _pendingMeasure = false;

  var LS_KEY = '_lid_side_panel_v1';

  var TAB_LABELS = {
    kalkulator: 'Kalkulator',
    kompetitor: 'Kompetitor',
    serupa: 'Serupa',
  };

  /* ── utility wrappers ───────────────────────────────── */

  function esc(str) {
    return adapter && adapter.esc ? adapter.esc(str == null ? '' : str) : String(str == null ? '' : str).replace(/[&<>"']/g, '');
  }
  function fmtRp(n) {
    if (adapter && adapter.fmtRp) return adapter.fmtRp(n);
    return 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
  }
  function fmtRpShort(n) {
    if (adapter && adapter.fmtRpShort) return adapter.fmtRpShort(n);
    return fmtRp(n);
  }
  function fmtSold(n) {
    if (adapter && adapter.fmtSold) return adapter.fmtSold(n);
    return String(Math.round(n || 0));
  }
  function track(action) {
    if (adapter && adapter.track) {
      try { adapter.track('side_panel', { site: site, action: action, mode: state.mode }); } catch (_) {}
    }
  }
  function toast(msg) {
    if (adapter && adapter.toast) { try { adapter.toast(msg); } catch (_) {} }
  }

  /* ── persistence ─────────────────────────────────────── */

  function persist() {
    try {
      var o = {
        open: state.open,
        mode: state.mode,
        width: state.width,
        sheetPct: state.sheetPct,
        collapsed: state.collapsed,
      };
      window.localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (_) {}
  }

  function restore() {
    try {
      var raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (typeof o.open === 'boolean') state.open = o.open;
      if (o.mode) state.mode = o.mode;
      if (typeof o.width === 'number') state.width = Math.min(640, Math.max(320, o.width));
      if (typeof o.sheetPct === 'number') state.sheetPct = Math.min(0.95, Math.max(0.25, o.sheetPct));
      if (typeof o.collapsed === 'boolean') state.collapsed = o.collapsed;
    } catch (_) {}
  }

  /* ── helpers ──────────────────────────────────────────── */

  function productLabel(prod) {
    var words = (prod.product_name || 'Produk').split(' ').slice(0, 3);
    return words.join(' ');
  }

  /* ── compute sizes ────────────────────────────────────── */

  function setWidth(w) {
    state.width = Math.min(640, Math.max(320, w));
    if (panelEl) panelEl.style.setProperty('--lsp-w', state.width + 'px');
    persist();
  }

  function setSheetHeight(h) {
    var vh = window.innerHeight || 0;
    if (!vh || !panelEl || !isMobileMode()) return; // sheet height is mobile-only
    var pct = Math.min(0.95, Math.max(0.25, h / vh));
    state.sheetPct = pct;
    panelEl.style.height = Math.round(pct * vh) + 'px';
  }

  /* ── DOM creation ─────────────────────────────────────── */

  function buildDOM() {
    if (panelEl) return;
    var host = document.getElementById(HOST_ID);
    if (!host) {
      console.warn('LarisSidePanel: host element not found (' + HOST_ID + ')');
      return;
    }

    panelEl = document.createElement('div');
    panelEl.className = 'lsp-panel';
    panelEl.setAttribute('role', 'complementary');
    panelEl.setAttribute('aria-label', 'Panel alat');

    // left resize handle (desktop)
    var handle = document.createElement('div');
    handle.className = 'lsp-resize-handle';
    handle.setAttribute('aria-label', 'Seret untuk ubah lebar panel');
    panelEl.appendChild(handle);

    // top grab handle for mobile sheet
    var grab = document.createElement('div');
    grab.className = 'lsp-grab-handle';
    grab.setAttribute('aria-label', 'Seret untuk ubah tinggi panel atau ketuk untuk ciutkan');
    grab.innerHTML = '<span class="lsp-grab-dot"></span>';
    panelEl.appendChild(grab);

    // header: close + tabs
    var header = document.createElement('div');
    header.className = 'lsp-header';

    var tabRow = document.createElement('nav');
    tabRow.className = 'lsp-tabs';
    ['kalkulator', 'kompetitor', 'serupa'].forEach(function (m) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lsp-tab';
      btn.setAttribute('data-lsp-tab', m);
      btn.textContent = TAB_LABELS[m] || m;
      tabRow.appendChild(btn);
    });
    header.appendChild(tabRow);

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lsp-close';
    closeBtn.setAttribute('aria-label', 'Tutup panel');
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    header.appendChild(closeBtn);

    panelEl.appendChild(header);

    // body
    var body = document.createElement('div');
    body.className = 'lsp-body';
    panelEl.appendChild(body);

    host.appendChild(panelEl);

    // event delegation
    panelEl.addEventListener('click', onPanelClick);

    // resize: desktop
    handle.addEventListener('pointerdown', function (e) { startResize(e, 'w'); });
    // mobile sheet
    grab.addEventListener('pointerdown', function (e) { startResize(e, 'h'); });
    grab.addEventListener('pointerup', function (e) {
      if (Math.abs(e.clientY - (grab._startY || 0)) < 8) toggleCollapsed();
    });

    // close on esc — kept in a named ref so unmount can detach it
    _escHandler = function (e) {
      if (e.key === 'Escape' && state.open) {
        e.stopPropagation(); // don't let other handlers capture this
        closePanel(false);
      }
    };
    document.addEventListener('keydown', _escHandler);

    // Desktop/mobile switch. matchMedia rather than a resize listener reading
    // window.innerWidth: during early boot innerWidth can momentarily be 0, which
    // read as "<= 860" and locked the panel into bottom-sheet mode on desktop
    // until the user happened to resize. matchMedia has no such transient.
    if (window.matchMedia) {
      _mq = window.matchMedia('(max-width: 860px)');
      if (_mq.addEventListener) _mq.addEventListener('change', onResizeView);
      else if (_mq.addListener) _mq.addListener(onResizeView); // Safari < 14
    }
    onResizeView();

    bound = true;
  }

  // A viewport width of 0 means "not measured yet", not "very narrow". Both
  // innerWidth and matchMedia report narrow at that moment, which latched the
  // panel into bottom-sheet mode on desktop and left it there. Treat 0 as
  // unknown: stay on the desktop rail and re-check on the next frame.
  function onResizeView() {
    if (!panelEl) return;
    var w = document.documentElement.clientWidth || window.innerWidth || 0;
    if (w === 0) {
      panelEl.classList.remove('lsp-mobile');
      panelEl.classList.add('lsp-desktop');
      if (!_pendingMeasure) {
        _pendingMeasure = true;
        (global.requestAnimationFrame || function (f) { setTimeout(f, 32); })(function () {
          _pendingMeasure = false;
          onResizeView();
        });
      }
      return;
    }
    var isMobile = w <= 860;
    panelEl.classList.toggle('lsp-mobile', isMobile);
    panelEl.classList.toggle('lsp-desktop', !isMobile);
  }

  function toggleCollapsed() {
    state.collapsed = !state.collapsed;
    if (panelEl) panelEl.classList.toggle('lsp-collapsed', state.collapsed);
    persist();
  }

  /* ── event handlers ───────────────────────────────────── */

  function onPanelClick(e) {
    var t = e.target;

    // close button
    if (t.closest('.lsp-close')) {
      closePanel(false);
      return;
    }

    // tab switch
    var tab = t.closest('[data-lsp-tab]');
    if (tab) {
      var mode = tab.getAttribute('data-lsp-tab');
      switchMode(mode, true);
      return;
    }

    // competitor / serupa row/card click — delegate via data-lsp-open
    var opener = t.closest('[data-lsp-open]');
    if (opener) {
      var raw = opener.getAttribute('data-lsp-open');
      if (raw && adapter && adapter.openProduct) {
        var parts;
        try { parts = JSON.parse(raw); } catch (_) { return; }
        if (parts && parts.item_id) adapter.openProduct(parts);
      }
      return;
    }
  }

  /* ── opening / closing ────────────────────────────────── */

  function closePanel(fromRestore) {
    if (!panelEl) return;
    state.open = false;
    panelEl.classList.remove('lsp-open');
    document.body.classList.remove('lsp-open');
    updateSizeVars();
    persist();
    if (!fromRestore) track('close');
  }

  function openPanel(mode, opts) {
    opts = opts || {};
    if (!state.product) return; // require a product to open
    if (!panelEl) buildDOM();
    if (!panelEl) return;

    state.open = true;
    state.collapsed = false;
    panelEl.classList.remove('lsp-collapsed');
    panelEl.classList.add('lsp-open');
    document.body.classList.add('lsp-open');
    setWidth(state.width); // re-apply after open
    updateSizeVars();
    switchMode(mode || state.mode || 'kalkulator', false);
    persist();
    if (!opts.silent) track('open');
  }

  function switchMode(mode, user) {
    if (mode !== state.mode) {
      state.mode = mode;
      persist();
      if (user) track('switch');
    }
    renderActiveTab();
    if (panelEl) {
      var tabs = panelEl.querySelectorAll('[data-lsp-tab]');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('active', tabs[i].getAttribute('data-lsp-tab') === mode);
      }
    }
  }

  // Height is a MOBILE-only concern. On desktop the rail derives its height from
  // top/bottom in CSS; writing an inline height here overrode that, and because
  // window.innerHeight can be 0 before the viewport is measured it wrote
  // "height: 0px" and the rail rendered as an invisible sliver.
  function updateSizeVars() {
    if (!panelEl) return;
    panelEl.style.setProperty('--lsp-w', state.width + 'px');
    if (!isMobileMode()) { panelEl.style.height = ''; return; }
    if (state.collapsed) { panelEl.style.height = '96px'; return; }
    var vh = window.innerHeight || 0;
    if (!vh) return; // not measurable yet — leave the CSS default in place
    panelEl.style.height = Math.round(state.sheetPct * vh) + 'px';
  }

  function isMobileMode() {
    return !!(panelEl && panelEl.classList.contains('lsp-mobile'));
  }

  /* ── resize logic ─────────────────────────────────────── */

  function startResize(e, axis) {
    e.preventDefault();
    var startX = e.clientX, startY = e.clientY;
    var startW = state.width;
    var startH = panelEl ? panelEl.getBoundingClientRect().height : 0;
    if (axis === 'h') {
      var grabEl = panelEl.querySelector('.lsp-grab-handle');
      grabEl._startY = e.clientY;
    }

    function onMove(ev) {
      ev.preventDefault();
      if (axis === 'w') {
        var dx = ev.clientX - startX;
        var newW = startW - dx;
        setWidth(newW);
      } else {
        var dy = ev.clientY - startY;
        var newH = Math.max(96, startH - dy);
        panelEl.style.height = newH + 'px';
        // Guard the divide: a 0 viewport would store Infinity as the persisted
        // sheet fraction and the panel would come back full-screen forever.
        var vh = window.innerHeight || 0;
        if (vh) state.sheetPct = Math.min(0.95, Math.max(0.25, newH / vh));
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (axis === 'h') persist();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /* ── rendering helpers ─────────────────────────────────── */

  function renderActiveTab() {
    if (!panelEl || !state.open) return;
    var body = panelEl.querySelector('.lsp-body');
    if (!body) return;
    if (!state.mode) return;

    if (state.mode === 'kalkulator') {
      renderKalkulator(body);
    } else if (state.mode === 'kompetitor') {
      renderKompetitor(body);
    } else if (state.mode === 'serupa') {
      renderSerupa(body);
    }
  }

  /* ── KALKULATOR ─────────────────────────────────────────── */

  function renderKalkulator(body) {
    var prod = state.product || {};
    var price = typeof prod.price === 'number' ? prod.price : 0;
    // total_sold is Shopee's LIFETIME count, not a monthly rate, so it must never
    // be used directly here — and dividing it by an invented constant to fake a
    // monthly figure is worse, because the number looks sourced when it is not.
    // Use the app's real monthly estimate when the row carries one
    // (est_omset_monthly is rupiah/month, so divide by price to get units), and
    // otherwise leave a neutral round number the user is expected to overwrite.
    var unit_est = 100;
    if (typeof prod.est_omset_monthly === 'number' && prod.est_omset_monthly > 0 && price > 0) {
      unit_est = Math.max(1, Math.round(prod.est_omset_monthly / price));
    }

    body.innerHTML =
      '<div class="lsp-kalc">' +
        '<label class="lsp-kalc-row"><span class="lsp-kalc-lbl">Harga jual</span>' +
          '<div class="lsp-kalc-inputwrap"><span class="lsp-rp-prefix">Rp</span><input class="lsp-kalc-inp" id="lsp-kalc-price" type="number" min="0" value="' + (price || '') + '"></div></label>' +
        '<label class="lsp-kalc-row"><span class="lsp-kalc-lbl">Modal</span>' +
          '<div class="lsp-kalc-inputwrap"><span class="lsp-rp-prefix">Rp</span><input class="lsp-kalc-inp" id="lsp-kalc-cogs" type="number" min="0" value="0"></div></label>' +
        '<label class="lsp-kalc-row"><span class="lsp-kalc-lbl">Ongkir</span>' +
          '<div class="lsp-kalc-inputwrap"><span class="lsp-rp-prefix">Rp</span><input class="lsp-kalc-inp" id="lsp-kalc-ship" type="number" min="0" value="0"></div></label>' +
        '<label class="lsp-kalc-row"><span class="lsp-kalc-lbl">Terjual/bulan</span>' +
          '<input class="lsp-kalc-inp" id="lsp-kalc-units" type="number" min="0" value="' + unit_est + '"></label>' +
        '<div class="lsp-kalc-summary" id="lsp-kalc-results"><div class="lsp-kalc-item"><span>Biaya platform (8%)</span><span id="lsp-fee">—</span></div><div class="lsp-kalc-item"><span>Profit per unit</span><span id="lsp-profit-unit">—</span></div><div class="lsp-kalc-item"><span>Margin</span><span id="lsp-margin">—</span></div><div class="lsp-kalc-item"><span>Estimasi profit/bulan</span><span id="lsp-profit-mo">—</span></div></div>' +
        '<div class="lsp-kalc-warn" id="lsp-kalc-warn" style="display:none;">Rugi <span id="lsp-rugi">—</span> per unit</div>' +
      '</div>';

    body.querySelectorAll('.lsp-kalc-inp').forEach(function (inp) {
      inp.addEventListener('input', debounce(calcKalkulator, 120));
    });
    calcKalkulator();

    function debounce(fn, ms) {
      var timer;
      return function () { clearTimeout(timer); timer = setTimeout(fn, ms); };
    }
  }

  function calcKalkulator() {
    var price = parseFloat(document.getElementById('lsp-kalc-price')?.value) || 0;
    var cogs = parseFloat(document.getElementById('lsp-kalc-cogs')?.value) || 0;
    var ship = parseFloat(document.getElementById('lsp-kalc-ship')?.value) || 0;
    var units = parseInt(document.getElementById('lsp-kalc-units')?.value, 10) || 0;
    var fee = Math.round(price * 0.08);
    var profit = price - cogs - ship - fee;
    var margin = price ? ((profit / price) * 100) : 0;
    var monthly = profit * units;

    document.getElementById('lsp-fee').textContent = fmtRp(fee);
    var unitEl = document.getElementById('lsp-profit-unit');
    unitEl.textContent = fmtRp(profit);
    unitEl.style.color = profit < 0 ? '#DC2626' : '';
    document.getElementById('lsp-margin').textContent = (price ? margin.toFixed(1) : '0') + '%';
    document.getElementById('lsp-profit-mo').textContent = fmtRp(monthly);

    var warn = document.getElementById('lsp-kalc-warn');
    var rugi = document.getElementById('lsp-rugi');
    if (profit < 0) {
      warn.style.display = '';
      rugi.textContent = fmtRp(Math.abs(profit));
    } else {
      warn.style.display = 'none';
    }
  }

  /* ── KOMPETITOR ────────────────────────────────────────── */

  function renderKompetitor(body) {
    body.innerHTML = '<div class="lsp-comp-header"></div><div class="lsp-comp-list" id="lsp-comp-list"><span class="lsp-loading">Memuat…</span></div>';

    var peers = adapter && adapter.getPeers ? adapter.getPeers() : [];
    if (!peers.length) {
      var kw = state.product && state.product.keyword;
      if (kw && adapter && adapter.fetchPeers) {
        fetchAndRenderKomp(kw);
      } else {
        document.getElementById('lsp-comp-list').innerHTML = '<span class="lsp-empty">Belum ada data pembanding.</span>';
        renderKompSummary([]);
      }
    } else {
      renderKomp(peers);
    }
  }

  function fetchAndRenderKomp(keyword) {
    var t = ++token;
    document.getElementById('lsp-comp-list').innerHTML = '<span class="lsp-loading">Memuat…</span>';
    try {
      adapter.fetchPeers(keyword).then(function (rows) {
        if (token !== t || state.mode !== 'kompetitor') return;
        renderKomp(rows || []);
      }).catch(function () {
        if (token !== t || state.mode !== 'kompetitor') return;
        document.getElementById('lsp-comp-list').innerHTML = '<span class="lsp-empty">Gagal memuat data.</span>';
        renderKompSummary([]);
      });
    } catch (e) {
      document.getElementById('lsp-comp-list').innerHTML = '<span class="lsp-empty">Gagal memuat data.</span>';
      renderKompSummary([]);
    }
  }

  function renderKomp(rows) {
    var deduped = dedupe(rows);
    // remove current product
    if (state.product && state.product.item_id != null) {
      deduped = deduped.filter(function (p) { return String(p.item_id) !== String(state.product.item_id); });
    }
    deduped.sort(function (a, b) { return (b.total_sold || 0) - (a.total_sold || 0); });
    var top = deduped.slice(0, 20);

    renderKompSummary(top);

    var list = document.getElementById('lsp-comp-list');
    if (!list) return;
    if (!top.length) {
      list.innerHTML = '<span class="lsp-empty">Belum ada data pembanding.</span>';
      return;
    }

    var maxSold = Math.max.apply(null, top.map(function (r) { return r.total_sold || 0; })) || 1;
    list.innerHTML = top.map(function (r, i) {
      var bar = Math.round(((r.total_sold || 0) / maxSold) * 100);
      var safe = JSON.stringify({ item_id: r.item_id, shop_id: r.shop_id });
      return '<div class="lsp-comp-row" data-lsp-open=\'' + safe + '\'>' +
        '<span class="lsp-comp-rank">' + (i + 1) + '</span>' +
        (r.image_url ? '<img class="lsp-comp-img" src="' + esc(r.image_url) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="lsp-comp-img"></span>') +
        '<div class="lsp-comp-info"><div class="lsp-comp-name">' + esc(r.product_name || '—') + '</div><div class="lsp-comp-meta">' + esc(r.store_name || '') + '</div>' +
        '<div class="lsp-comp-stats"><span>' + fmtRp(r.price || 0) + '</span><span>' + fmtSold(r.total_sold || 0) + ' terjual</span></div>' +
        '<div class="lsp-comp-bar"><div class="lsp-comp-bar-fill" style="width:' + bar + '%"></div></div></div></div>';
    }).join('');
  }

  function renderKompSummary(rows) {
    var header = panelEl.querySelector('.lsp-comp-header');
    if (!header) return;
    var shops = {};
    var prices = [];
    rows.forEach(function (r) {
      if (r.shop_id) shops[r.shop_id] = 1;
      if (typeof r.price === 'number') prices.push(r.price);
    });
    var n = Object.keys(shops).length;
    var med = prices.length ? median(prices) : 0;
    header.innerHTML = '<span class="lsp-comp-summary">' + n + ' penjual' + (med ? ' · median Rp' + Math.round(med).toLocaleString('id-ID') : '') + '</span>';
  }

  function dedupe(rows) {
    var seen = {};
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i].item_id);
      if (seen[id]) continue;
      seen[id] = true;
      out.push(rows[i]);
    }
    return out;
  }

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  /* ── SERUPA ────────────────────────────────────────────── */

  function renderSerupa(body) {
    body.innerHTML = '<div class="lsp-serupa-grid" id="lsp-serupa-list"><span class="lsp-loading">Memuat…</span></div>';

    var peers = adapter && adapter.getPeers ? adapter.getPeers() : [];
    if (!peers.length) {
      var kw = state.product && state.product.keyword;
      if (kw && adapter && adapter.fetchPeers) {
        fetchAndRenderSerupa(kw);
      } else {
        document.getElementById('lsp-serupa-list').innerHTML = '<span class="lsp-empty">Belum ada data pembanding.</span>';
      }
    } else {
      renderSerupaCards(peers);
    }
  }

  function fetchAndRenderSerupa(keyword) {
    var t = ++token;
    document.getElementById('lsp-serupa-list').innerHTML = '<span class="lsp-loading">Memuat…</span>';
    try {
      adapter.fetchPeers(keyword).then(function (rows) {
        if (token !== t || state.mode !== 'serupa') return;
        renderSerupaCards(rows || []);
      }).catch(function () {
        if (token !== t || state.mode !== 'serupa') return;
        document.getElementById('lsp-serupa-list').innerHTML = '<span class="lsp-empty">Gagal memuat data.</span>';
      });
    } catch (e) {
      document.getElementById('lsp-serupa-list').innerHTML = '<span class="lsp-empty">Gagal memuat data.</span>';
    }
  }

  function renderSerupaCards(rows) {
    var deduped = dedupe(rows);
    var curCat = state.product && state.product.category ? state.product.category : '';
    if (curCat) {
      var sameCat = deduped.filter(function (p) { return p.category === curCat; });
      if (sameCat.length >= 4) deduped = sameCat;
    }
    if (state.product && state.product.item_id != null) {
      deduped = deduped.filter(function (p) { return String(p.item_id) !== String(state.product.item_id); });
    }
    deduped.sort(function (a, b) { return (b.total_sold || 0) - (a.total_sold || 0); });
    var top = deduped.slice(0, 24);

    var grid = document.getElementById('lsp-serupa-list');
    if (!grid) return;
    if (!top.length) {
      grid.innerHTML = '<span class="lsp-empty">Belum ada data pembanding.</span>';
      return;
    }

    grid.innerHTML = top.map(function (r) {
      var safe = JSON.stringify({ item_id: r.item_id, shop_id: r.shop_id });
      return '<div class="lsp-serupa-card" data-lsp-open=\'' + safe + '\'>' +
        (r.image_url ? '<img class="lsp-serupa-img" src="' + esc(r.image_url) + '" alt="" loading="lazy" onerror="this.remove()">' : '<span class="lsp-serupa-img"></span>') +
        '<div class="lsp-serupa-body"><div class="lsp-serupa-name">' + esc(r.product_name || '—') + '</div>' +
        '<div class="lsp-serupa-price">' + fmtRp(r.price || 0) + '</div>' +
        '<div class="lsp-serupa-sold">' + fmtSold(r.total_sold || 0) + ' terjual</div></div>' +
      '</div>';
    }).join('');
  }

  /* ── public API ────────────────────────────────────────── */

  global.LarisSidePanel = {
    mount: function (opts) {
      if (!opts || !opts.hostId) { console.warn('LarisSidePanel: missing hostId'); return false; }
      if (mounted && panelEl && panelEl.parentNode) {
        // already mounted — re-sync adapter
        if (opts.adapter) adapter = opts.adapter;
        if (opts.site) site = opts.site;
        return true;
      }
      HOST_ID = String(opts.hostId);
      if (opts.adapter) adapter = opts.adapter;
      if (opts.site) site = opts.site;
      restore();
      buildDOM();
      if (!panelEl) return false;
      if (state.open) {
        // re-open only if product exists
        var prod = adapter && adapter.getProduct ? adapter.getProduct() : null;
        if (prod) {
          state.product = prod;
          openPanel(state.mode, { silent: true });
        } else {
          state.open = false;
          persist();
        }
      }
      mounted = true;
      return true;
    },

    open: function (mode, opts) {
      if (!mounted) return;
      var prod = adapter && adapter.getProduct ? adapter.getProduct() : null;
      if (!prod) { toast('Pilih produk terlebih dahulu.'); return; }
      state.product = prod;
      openPanel(mode, opts || {});
    },

    close: function () {
      closePanel(false);
    },

    setProduct: function (prod) {
      state.product = prod || null;
      token++;
      if (state.open) {
        renderActiveTab();
      }
    },

    refresh: function () {
      if (state.open) renderActiveTab();
    },

    isOpen: function () { return state.open; },

    getMode: function () { return state.mode; },

    unmount: function () {
      if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.removeChild(panelEl);
      }
      // Detach the media listener and clear `bound`, otherwise a later mount()
      // rebuilds the DOM but skips bind() — leaving a panel whose tabs, close
      // button and drag handles do nothing.
      if (_mq) {
        if (_mq.removeEventListener) _mq.removeEventListener('change', onResizeView);
        else if (_mq.removeListener) _mq.removeListener(onResizeView);
        _mq = null;
      }
      if (_escHandler) { document.removeEventListener('keydown', _escHandler); _escHandler = null; }
      panelEl = null;
      mounted = false;
      bound = false;
      state.open = false;
      token++; // invalidate any in-flight fetch so it can't paint into a dead panel
      document.body.classList.remove('lsp-open');
    },
  };
})(window);
