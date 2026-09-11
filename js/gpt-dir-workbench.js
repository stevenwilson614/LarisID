/* Cari Produk workbench: Rangkuman, batched range filters, Tampilkan Kolom, Kartu/Tabel.
 * Default columns stay the current calm set. Extras start off.
 * Skor Mudah Masuk is display-only — never a hard filter. */
(function (global) {
  'use strict';

  var COLS_KEY = 'lid_dir_cols_v1';
  var VIEW_KEY = 'lid_dir_view_v1';
  var api = {};

  var EXTRAS = [
    { id: 'harga_asli', label: 'Harga asli + diskon' },
    { id: 'rating', label: 'Rating bintang' },
    { id: 'wishlist', label: 'Wishlist' },
    { id: 'kota', label: 'Kota / lokasi' },
    { id: 'iklan', label: 'Iklan' },
    { id: 'stok', label: 'Stok tersedia' },
    { id: 'rank', label: 'Peringkat pencarian' },
    { id: 'keyword', label: 'Keyword scrape' },
    { id: 'unit_wk', label: 'Unit minggu ini / lalu' },
    { id: 'skor', label: 'Skor Mudah Masuk' },
    { id: 'url', label: 'URL Shopee' },
    { id: 'honesty', label: 'Terukur / perkiraan' },
  ];

  var _on = Object.create(null);
  var _view = 'tabel';
  var _draft = null;
  var _wired = false;

  function esc(s) { return api.esc ? api.esc(s) : String(s == null ? '' : s); }
  function $(id) { return document.getElementById(id); }

  function loadLocal() {
    try {
      var raw = JSON.parse(localStorage.getItem(COLS_KEY) || '{}');
      EXTRAS.forEach(function (c) { _on[c.id] = !!raw[c.id]; });
    } catch (_) {
      EXTRAS.forEach(function (c) { _on[c.id] = false; });
    }
    try {
      var v = localStorage.getItem(VIEW_KEY);
      _view = v === 'kartu' ? 'kartu' : 'tabel';
    } catch (_) { _view = 'tabel'; }
  }

  function persistLocal() {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(_on)); } catch (_) {}
    try { localStorage.setItem(VIEW_KEY, _view); } catch (_) {}
  }

  async function persistRemote() {
    var sb = api.supabase && api.supabase();
    var user = api.user && api.user();
    if (!sb || !user) return;
    try {
      var cur = {};
      try {
        var row = await sb.from('user_profiles').select('ui_prefs').eq('user_id', user.id).maybeSingle();
        cur = (row && row.data && row.data.ui_prefs) || {};
      } catch (_) {}
      cur.dir_cols = _on;
      cur.dir_view = _view;
      await sb.from('user_profiles').update({ ui_prefs: cur }).eq('user_id', user.id);
    } catch (_) {}
  }

  async function hydrateRemote() {
    var sb = api.supabase && api.supabase();
    var user = api.user && api.user();
    if (!sb || !user) return;
    try {
      var { data } = await sb.from('user_profiles').select('ui_prefs').eq('user_id', user.id).maybeSingle();
      var prefs = data && data.ui_prefs;
      var changed = false;
      if (prefs && prefs.dir_cols && typeof prefs.dir_cols === 'object') {
        EXTRAS.forEach(function (c) {
          var next = !!prefs.dir_cols[c.id];
          if (_on[c.id] !== next) changed = true;
          _on[c.id] = next;
        });
        persistLocal();
      }
      if (prefs && (prefs.dir_view === 'kartu' || prefs.dir_view === 'tabel') && prefs.dir_view !== _view) {
        _view = prefs.dir_view;
        changed = true;
      }
      if (changed) {
        mount(true);
        if (api.onRepaint) api.onRepaint();
      }
    } catch (_) {}
  }

  function extrasOn() {
    return EXTRAS.filter(function (c) { return _on[c.id]; }).map(function (c) { return c.id; });
  }

  function extraOn(id) { return !!_on[id]; }

  function dash() { return '—'; }

  function extraCellHtml(p, id) {
    if (!_on[id]) return '';
    var fmtRp = api.fmtRp;
    var fmtSold = api.fmtSold;
    var orig = Number(p.original_price) || 0;
    var price = Number(p.price) || 0;
    var inner = dash();
    if (id === 'harga_asli') {
      if (orig > price && price > 0) {
        var pct = Math.round((1 - price / orig) * 100);
        inner = (fmtRp ? fmtRp(orig) : orig) + ' <span class="lrow-disc">−' + pct + '%</span>';
      } else if (orig > 0) inner = fmtRp ? fmtRp(orig) : String(orig);
    } else if (id === 'rating') {
      var r = Number(p.rating);
      inner = Number.isFinite(r) && r > 0 ? r.toFixed(1).replace('.', ',') : dash();
    } else if (id === 'wishlist') {
      var w = Number(p.wishlist);
      inner = w > 0 ? (fmtSold ? fmtSold(w) : String(w)) : '0';
    } else if (id === 'kota') {
      inner = p.location ? esc(p.location) : dash();
    } else if (id === 'iklan') {
      inner = Number(p.is_ad) === 1 ? 'Ya' : 'Tidak';
    } else if (id === 'stok') {
      inner = p.in_stock === true ? 'Ya' : (p.in_stock === false ? 'Tidak' : dash());
    } else if (id === 'rank') {
      var rk = Number(p.search_rank);
      inner = rk > 0 ? String(rk) : dash();
    } else if (id === 'keyword') {
      inner = p.keyword ? esc(p.keyword) : dash();
    } else if (id === 'unit_wk') {
      var t = p._petaTrend;
      if (!t || t.pending) inner = '…';
      else if (t.units_now_wk == null && t.units_prev_wk == null) inner = dash();
      else {
        var a = t.units_now_wk == null ? dash() : Math.round(t.units_now_wk);
        var b = t.units_prev_wk == null ? dash() : Math.round(t.units_prev_wk);
        inner = a + ' / ' + b;
      }
    } else if (id === 'skor') {
      var score = api.skorOf ? api.skorOf(p) : null;
      inner = score == null ? dash() : String(score);
    } else if (id === 'url') {
      if (p.url) {
        inner = '<a class="lrow-ext-url" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer" data-lrow-stop="1">Shopee</a>';
      }
    } else if (id === 'honesty') {
      var h = api.omsetHonesty ? api.omsetHonesty(p) : { label: 'perkiraan' };
      inner = esc(h.label);
    }
    var labels = {
      harga_asli: 'Harga asli', rating: 'Rating', wishlist: 'Wishlist', kota: 'Kota',
      iklan: 'Iklan', stok: 'Stok', rank: 'Peringkat', keyword: 'Keyword',
      unit_wk: 'Unit mgg', skor: 'Skor masuk', url: 'URL', honesty: 'Sumber',
    };
    return '<td class="lrow-num lrow-extra lrow-x-' + id + '"><span class="lrow-metric-lbl">'
      + esc(labels[id] || id) + '</span><span class="lrow-metric-val">' + inner + '</span></td>';
  }

  function extraCellsHtml(p) {
    return extrasOn().map(function (id) { return extraCellHtml(p, id); }).join('');
  }

  function extraHeadsHtml(thFn) {
    var map = {
      harga_asli: 'Harga asli', rating: 'Rating', wishlist: 'Wishlist', kota: 'Kota',
      iklan: 'Iklan', stok: 'Stok', rank: 'Peringkat', keyword: 'Keyword',
      unit_wk: 'Unit mgg', skor: 'Skor masuk', url: 'URL', honesty: 'Sumber',
    };
    return extrasOn().map(function (id) {
      return '<th class="lrow-extra lrow-x-' + id + '" scope="col">' + esc(map[id] || id) + '</th>';
    }).join('');
  }

  function median(nums) {
    var a = nums.filter(function (n) { return Number.isFinite(n); }).sort(function (x, y) { return x - y; });
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function rangkumanHtml(rows) {
    var list = rows || [];
    var n = list.length;
    if (!n) return '';
    var prices = list.map(function (p) { return Number(p.price); }).filter(function (x) { return x > 0; });
    var omsets = list.map(function (p) { return api.estOmsetBulan ? api.estOmsetBulan(p) : 0; }).filter(function (x) { return x > 0; });
    var ratings = list.map(function (p) { return Number(p.rating); }).filter(function (x) { return x > 0; });
    var shops = {};
    list.forEach(function (p) { if (p.shop_id != null) shops[p.shop_id] = 1; });
    var shopN = Object.keys(shops).length;
    var fmtRp = api.fmtRp;
    var fmtOmset = api.fmtOmset;
    var pLo = prices.length ? Math.min.apply(null, prices) : null;
    var pHi = prices.length ? Math.max.apply(null, prices) : null;
    var pMed = median(prices);
    var oMed = median(omsets);
    var rMed = median(ratings);
    function bit(k, v) {
      return '<div class="dir-sum-bit"><span class="dir-sum-k">' + k + '</span><span class="dir-sum-v">' + v + '</span></div>';
    }
    return '<div class="dir-rangkuman" id="dir-rangkuman">'
      + bit('Listing', String(n))
      + bit('Toko', String(shopN))
      + bit('Harga', pLo && pHi && fmtRp ? (fmtRp(pLo) + ' – ' + fmtRp(pHi)) : '—')
      + bit('Median harga', pMed && fmtRp ? fmtRp(pMed) : '—')
      + bit('Median omset/bln', oMed && fmtOmset ? fmtOmset(oMed) : '—')
      + bit('Rating', rMed ? rMed.toFixed(1).replace('.', ',') : '—')
      + '</div>';
  }

  function currentRange() {
    var st = api.getState && api.getState();
    return (st && st.dirRangeFilters) || emptyRange();
  }

  function emptyRange() {
    return { priceMin: null, priceMax: null, omsetMin: null, trendMin: null };
  }

  function honorBudget(range) {
    var out = Object.assign({}, emptyRange(), range || {});
    var bud = api.finderBudget && api.finderBudget();
    if (!bud) return out;
    if (out.priceMin == null && bud.min != null) out.priceMin = bud.min;
    if (out.priceMax == null && Number.isFinite(bud.max)) out.priceMax = bud.max;
    return out;
  }

  function numOrNull(el) {
    if (!el) return null;
    var n = Number(String(el.value || '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) && String(el.value).trim() !== '' ? n : null;
  }

  function rangePanelHtml() {
    var r = honorBudget(currentRange());
    function val(n) { return n == null ? '' : String(n); }
    return '<details class="dir-range" id="dir-range">'
      + '<summary>Filter rentang</summary>'
      + '<div class="dir-range-grid">'
      + '<label>Harga min<input type="number" inputmode="numeric" id="dir-rf-pmin" value="' + esc(val(r.priceMin)) + '"></label>'
      + '<label>Harga max<input type="number" inputmode="numeric" id="dir-rf-pmax" value="' + esc(val(r.priceMax)) + '"></label>'
      + '<label>Omset/bln min<input type="number" inputmode="numeric" id="dir-rf-omin" value="' + esc(val(r.omsetMin)) + '"></label>'
      + '<label>Tren % min<input type="number" inputmode="decimal" id="dir-rf-tmin" value="' + esc(val(r.trendMin)) + '"></label>'
      + '</div>'
      + '<div class="dir-range-acts">'
      + '<button type="button" class="btn-ghost" id="dir-rf-apply">Terapkan</button>'
      + '<button type="button" class="btn-ghost" id="dir-rf-reset">Reset</button>'
      + '</div></details>';
  }

  function colsPanelHtml() {
    var rows = EXTRAS.map(function (c) {
      return '<label class="dir-col-opt"><input type="checkbox" data-dir-col="' + c.id + '"'
        + (_on[c.id] ? ' checked' : '') + '> ' + esc(c.label) + '</label>';
    }).join('');
    return '<details class="dir-cols" id="dir-cols">'
      + '<summary>Tampilkan Kolom</summary>'
      + '<p class="dir-cols-note">Kolom default tetap tampil. Extra di bawah ini mulai mati.</p>'
      + '<div class="dir-cols-list">' + rows + '</div>'
      + '<div class="dir-range-acts">'
      + '<button type="button" class="btn-ghost" id="dir-cols-apply">Terapkan</button>'
      + '</div></details>';
  }

  function viewToggleHtml() {
    return '<div class="dir-view-toggle" role="group" aria-label="Tampilan">'
      + '<button type="button" class="dir-view-btn' + (_view === 'tabel' ? ' is-on' : '') + '" data-dir-view="tabel">Tabel</button>'
      + '<button type="button" class="dir-view-btn' + (_view === 'kartu' ? ' is-on' : '') + '" data-dir-view="kartu">Kartu</button>'
      + '</div>';
  }

  function saveCriteriaHtml() {
    var user = api.user && api.user();
    if (!user) return '';
    return '<button type="button" class="btn-ghost" id="dir-save-criteria">Simpan kriteria</button>';
  }

  function chromeHtml() {
    return '<div class="dir-workbench" id="dir-workbench">'
      + viewToggleHtml()
      + rangePanelHtml()
      + colsPanelHtml()
      + saveCriteriaHtml()
      + '</div>';
  }

  function applyViewClass(root) {
    var wrap = (root || document).querySelector('#dir-grid .lrow-wrap');
    if (!wrap) return;
    wrap.classList.toggle('is-cards', _view === 'kartu');
    wrap.classList.toggle('is-table', _view !== 'kartu');
  }

  function filterRows(rows) {
    var r = currentRange() || emptyRange();
    return (rows || []).filter(function (p) {
      var price = Number(p.price) || 0;
      var omset = api.estOmsetBulan ? api.estOmsetBulan(p) : 0;
      var trend = p._petaTrend && p._petaTrend.wkPct != null ? Number(p._petaTrend.wkPct) : null;
      if (r.priceMin != null && price < r.priceMin) return false;
      if (r.priceMax != null && price > r.priceMax) return false;
      if (r.omsetMin != null && omset < r.omsetMin) return false;
      if (r.trendMin != null && (trend == null || trend < r.trendMin)) return false;
      return true;
    });
  }

  function readDraftRange() {
    return {
      priceMin: numOrNull($('dir-rf-pmin')),
      priceMax: numOrNull($('dir-rf-pmax')),
      omsetMin: numOrNull($('dir-rf-omin')),
      trendMin: numOrNull($('dir-rf-tmin')),
    };
  }

  function wire() {
    if (_wired) return;
    _wired = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var viewBtn = t.closest('[data-dir-view]');
      if (viewBtn) {
        _view = viewBtn.getAttribute('data-dir-view') === 'kartu' ? 'kartu' : 'tabel';
        persistLocal();
        void persistRemote();
        if (api.onRepaint) api.onRepaint();
        return;
      }
      if (t.closest('#dir-rf-apply')) {
        var st = api.getState && api.getState();
        if (st) st.dirRangeFilters = readDraftRange();
        if (api.log) api.log('dir_filter', { ui: 'gpt', kind: 'range' });
        if (api.onRepaint) api.onRepaint();
        return;
      }
      if (t.closest('#dir-rf-reset')) {
        var st2 = api.getState && api.getState();
        if (st2) st2.dirRangeFilters = null;
        if (api.onRepaint) api.onRepaint();
        return;
      }
      if (t.closest('#dir-cols-apply')) {
        document.querySelectorAll('[data-dir-col]').forEach(function (inp) {
          _on[inp.getAttribute('data-dir-col')] = !!inp.checked;
        });
        persistLocal();
        void persistRemote();
        if (api.log) api.log('dir_cols', { ui: 'gpt', extras: extrasOn() });
        if (api.onRepaint) api.onRepaint();
        return;
      }
      if (t.closest('#dir-save-criteria')) {
        if (api.onSaveCriteria) api.onSaveCriteria();
      }
    });
  }

  function syncChrome() {
    document.querySelectorAll('[data-dir-view]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-dir-view') === _view);
    });
  }

  function mount(force) {
    loadLocal();
    var host = $('dir-workbench-host');
    if (!host) return;
    if (force || !host.querySelector('#dir-workbench')) {
      host.innerHTML = chromeHtml();
    } else {
      syncChrome();
    }
    wire();
  }

  function init(next) {
    api = next || {};
    loadLocal();
    void hydrateRemote();
    wire();
  }

  global.LarisDirWorkbench = {
    init: init,
    mount: mount,
    extrasOn: extrasOn,
    extraOn: extraOn,
    extraCellsHtml: extraCellsHtml,
    extraHeadsHtml: extraHeadsHtml,
    rangkumanHtml: rangkumanHtml,
    filterRows: filterRows,
    applyViewClass: applyViewClass,
    hydrate: hydrateRemote,
    viewMode: function () { return _view; },
    honorBudget: honorBudget,
  };
})(window);
