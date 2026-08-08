(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * skorOf(row) — 0‑100 aggregate score for a product-type row.
   * -------------------------------------------------------------------------- */
  function skorOf(row) {
    const nSellers = Number(row.n_sellers) || 0;
    const omset    = Number(row.omset_top15) || 0;
    const breakout = Number(row.breakout_rate) || 0;
    const trend    = Number(row.trend_delta_30d) || 0;
    const niche    = Number(row.niche_new_items) || 0;
    const top3Share = Number(row.sold_top3_share) || 0;

    var omsetPoints = Math.min(25, omset / 20000000);
    var breakoutPoints = Math.min(10, Math.max(-5, breakout * 0.2));
    var trendPoints    = Math.min(15, Math.max(-10, trend / 5));

    var nichePoints = 0;
    if (niche >= 0) {
      var ideal = 20;
      var diff  = Math.abs(niche - ideal);
      nichePoints = Math.max(0, 10 - 0.5 * diff);
    }

    var sellerPenalty = 0;
    if (nSellers > 15) {
      sellerPenalty = Math.min(15, (nSellers - 15) * 0.5);
    }

    var top3Penalty = Math.min(20, (top3Share / 100) * 20);

    var score = 50 + omsetPoints + breakoutPoints + trendPoints + nichePoints
                - sellerPenalty - top3Penalty;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  var PRICE_ABS_MAX = 500000;
  var OMSET_ABS_MAX = 500000000;

  function applyFilters(rows, filters) {
    if (!Array.isArray(rows)) return [];
    var f = filters || {};

    return rows.filter(function (row) {
      var p = getPriceValue(row);
      if (f.priceMin != null && p < f.priceMin) return false;
      if (f.priceMax != null && p > f.priceMax) return false;

      var o = Number(row.omset_top15) || 0;
      if (f.omsetMin != null && o < f.omsetMin) return false;
      if (f.omsetMax != null && o > f.omsetMax) return false;

      if (f.skorMin != null) {
        if (skorOf(row) < f.skorMin) return false;
      }

      return true;
    });
  }

  function getPriceValue(row) {
    var m = row.price_median;
    if (m !== undefined && m !== null && !isNaN(Number(m))) {
      return Number(m);
    }
    var lo = Number(row.price_min) || 0;
    var hi = Number(row.price_max) || 0;
    return (lo + hi) / 2;
  }

  function fmtRp(v) {
    var n = Number(v) || 0;
    if (n >= 1000000) return 'Rp ' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1) + ' jt';
    if (n >= 1000) return 'Rp ' + Math.round(n / 1000) + ' rb';
    return 'Rp ' + Math.round(n);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function multiSummary(selected, allCount, emptyLabel, singularSuffix) {
    var n = (selected || []).length;
    if (!n || n >= allCount) return emptyLabel;
    if (n === 1) return selected[0] + (singularSuffix || '');
    return selected[0] + ' +' + (n - 1) + ' lainnya';
  }

  /** Build a checkbox multi-select dropdown. Returns { el, get, set, sync }. */
  function buildMultiSelect(opts) {
    var all = (opts.options || []).slice();
    var selected = (opts.selected || []).slice();
    var emptyLabel = opts.emptyLabel || 'Semua';
    var onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    var wrap = document.createElement('div');
    wrap.className = 'dir-ms';
    wrap.innerHTML =
      '<button type="button" class="dir-ms-trigger" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="dir-ms-label">' + esc(multiSummary(selected, all.length, emptyLabel)) + '</span>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="dir-ms-popup" role="listbox" aria-multiselectable="true" hidden>' +
        '<div class="dir-ms-list"></div>' +
        '<button type="button" class="dir-ms-done">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
          'Selesai' +
        '</button>' +
      '</div>';

    var trigger = wrap.querySelector('.dir-ms-trigger');
    var labelEl = wrap.querySelector('.dir-ms-label');
    var popup = wrap.querySelector('.dir-ms-popup');
    var list = wrap.querySelector('.dir-ms-list');
    var done = wrap.querySelector('.dir-ms-done');

    function syncLabel() {
      if (labelEl) labelEl.textContent = multiSummary(selected, all.length, emptyLabel);
    }

    function rebuild() {
      if (!list) return;
      list.innerHTML = all.map(function (c) {
        var on = selected.indexOf(c) >= 0;
        return (
          '<label class="dir-ms-opt">' +
            '<input type="checkbox" value="' + esc(c) + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + esc(c) + '</span>' +
          '</label>'
        );
      }).join('');
      list.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var set = {};
          selected.forEach(function (c) { set[c] = true; });
          if (cb.checked) set[cb.value] = true; else delete set[cb.value];
          selected = Object.keys(set);
          syncLabel();
          if (onChange) onChange(selected.slice());
        });
      });
      syncLabel();
    }
    rebuild();

    function openPopup() {
      popup.hidden = false;
      wrap.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function closePopup() {
      popup.hidden = true;
      wrap.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (popup.hidden) openPopup(); else closePopup();
    });
    done.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closePopup();
    });
    document.addEventListener('click', function (e) {
      if (!popup.hidden && !wrap.contains(e.target)) closePopup();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !popup.hidden) closePopup();
    });

    return {
      el: wrap,
      get: function () { return selected.slice(); },
      set: function (vals) {
        selected = Array.isArray(vals) ? vals.slice() : [];
        rebuild();
      },
      setOptions: function (optsList, vals) {
        all = Array.isArray(optsList) ? optsList.slice() : [];
        if (Array.isArray(vals)) selected = vals.slice();
        rebuild();
      }
    };
  }

  /* --------------------------------------------------------------------------
   * renderControls(container, opts)
   *
   * One small-arrow collapsible panel containing:
   *   Kota (multi), Kategori (multi), Harga dual slider, Omset min, Skor min.
   * -------------------------------------------------------------------------- */
  function renderControls(container, opts) {
    if (!container || !container.appendChild) return;
    if (container.dataset.mounted === 'true') {
      if (container._dirApi && opts) {
        if (Array.isArray(opts.selectedCategories)) container._dirApi.setCategories(opts.selectedCategories);
        if (Array.isArray(opts.selectedCities)) container._dirApi.setCities(opts.selectedCities);
      }
      return;
    }
    container.dataset.mounted = 'true';
    container.classList.add('dir-filter-host');

    var onApply = (opts && typeof opts.onApply === 'function') ? opts.onApply : null;
    var allCats = (opts && Array.isArray(opts.categories)) ? opts.categories.slice() : [];
    var allCities = (opts && Array.isArray(opts.cities)) ? opts.cities.slice() : [];
    var selectedCats = (opts && Array.isArray(opts.selectedCategories)) ? opts.selectedCategories.slice() : [];
    var selectedCities = (opts && Array.isArray(opts.selectedCities)) ? opts.selectedCities.slice() : [];

    var outer = document.createElement('details');
    outer.className = 'dir-filters-shell';
    outer.innerHTML =
      '<summary class="dir-filters-sum">' +
        '<span class="dir-filters-sum-txt">Filter</span>' +
        '<svg class="dir-filters-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</summary>';

    var body = document.createElement('div');
    body.className = 'dir-filters-body';

    // ----- Kota -----
    var cityBlock = document.createElement('div');
    cityBlock.className = 'dir-fg';
    cityBlock.innerHTML = '<div class="dir-fg-label">Kota</div>';
    var cityMs = buildMultiSelect({
      options: allCities,
      selected: selectedCities,
      emptyLabel: 'Semua kota',
      onChange: function () { debouncedEmit(); }
    });
    cityBlock.appendChild(cityMs.el);
    body.appendChild(cityBlock);

    // ----- Kategori -----
    var catBlock = document.createElement('div');
    catBlock.className = 'dir-fg';
    catBlock.innerHTML = '<div class="dir-fg-label">Kategori</div>';
    var catMs = buildMultiSelect({
      options: allCats,
      selected: selectedCats,
      emptyLabel: 'Semua kategori',
      onChange: function () { debouncedEmit(); }
    });
    catBlock.appendChild(catMs.el);
    body.appendChild(catBlock);

    // ----- Harga dual -----
    var priceLo = 0;
    var priceHi = PRICE_ABS_MAX;
    var hargaBlock = document.createElement('div');
    hargaBlock.className = 'dir-fg';
    hargaBlock.innerHTML =
      '<div class="dir-fg-label">Harga</div>' +
      '<div class="dir-dual-range">' +
        '<div class="dir-dual-track"></div>' +
        '<div class="dir-dual-fill" data-fill></div>' +
        '<input type="range" data-role="min" min="0" max="' + PRICE_ABS_MAX + '" step="5000" value="0">' +
        '<input type="range" data-role="max" min="0" max="' + PRICE_ABS_MAX + '" step="5000" value="' + PRICE_ABS_MAX + '">' +
      '</div>' +
      '<div class="dir-range-vals"><span data-min-lbl>' + esc(fmtRp(0)) + '</span><span data-max-lbl>' + esc(fmtRp(PRICE_ABS_MAX)) + '+</span></div>';
    body.appendChild(hargaBlock);
    var priceMinEl = hargaBlock.querySelector('[data-role="min"]');
    var priceMaxEl = hargaBlock.querySelector('[data-role="max"]');
    var priceFill = hargaBlock.querySelector('[data-fill]');
    var priceMinLbl = hargaBlock.querySelector('[data-min-lbl]');
    var priceMaxLbl = hargaBlock.querySelector('[data-max-lbl]');

    function syncPriceUi() {
      var lo = Number(priceMinEl.value);
      var hi = Number(priceMaxEl.value);
      if (lo > hi) {
        if (priceMinEl === document.activeElement) { hi = lo; priceMaxEl.value = hi; }
        else { lo = hi; priceMinEl.value = lo; }
      }
      priceLo = lo;
      priceHi = hi;
      var max = PRICE_ABS_MAX;
      var left = (lo / max) * 100;
      var right = (hi / max) * 100;
      if (priceFill) {
        priceFill.style.left = left + '%';
        priceFill.style.width = Math.max(0, right - left) + '%';
      }
      if (priceMinLbl) priceMinLbl.textContent = fmtRp(lo);
      if (priceMaxLbl) priceMaxLbl.textContent = hi >= max ? fmtRp(hi) + '+' : fmtRp(hi);
    }
    priceMinEl.addEventListener('input', function () { syncPriceUi(); debouncedEmit(); });
    priceMaxEl.addEventListener('input', function () { syncPriceUi(); debouncedEmit(); });
    hargaBlock.querySelector('.dir-dual-range').addEventListener('pointerdown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      var rect = e.currentTarget.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      var val = Math.round((pct * PRICE_ABS_MAX) / 5000) * 5000;
      var mid = (Number(priceMinEl.value) + Number(priceMaxEl.value)) / 2;
      if (val <= mid) priceMinEl.value = val; else priceMaxEl.value = val;
      syncPriceUi();
      debouncedEmit();
    });
    syncPriceUi();

    // ----- Omset min -----
    var omsetMin = 0;
    var omsetBlock = document.createElement('div');
    omsetBlock.className = 'dir-fg';
    omsetBlock.innerHTML =
      '<div class="dir-fg-label">Omset/bulan (min)</div>' +
      '<div class="dir-single-range"><input type="range" min="0" max="' + OMSET_ABS_MAX + '" step="5000000" value="0"></div>' +
      '<div class="dir-range-vals"><span>Rp 0</span><span data-omset-lbl>Min Rp 0</span><span>Rp 500 jt+</span></div>';
    body.appendChild(omsetBlock);
    var omsetEl = omsetBlock.querySelector('input[type=range]');
    var omsetLbl = omsetBlock.querySelector('[data-omset-lbl]');
    function syncOmsetUi() {
      omsetMin = Number(omsetEl.value) || 0;
      if (omsetLbl) omsetLbl.textContent = omsetMin <= 0 ? 'Semua omset' : ('Min ' + fmtRp(omsetMin));
    }
    omsetEl.addEventListener('input', function () { syncOmsetUi(); debouncedEmit(); });
    syncOmsetUi();

    // ----- Skor min -----
    var skorMin = 0;
    var skorBlock = document.createElement('div');
    skorBlock.className = 'dir-fg';
    skorBlock.innerHTML =
      '<div class="dir-fg-label">Skor minimum</div>' +
      '<div class="dir-single-range"><input type="range" min="0" max="100" step="5" value="0"></div>' +
      '<div class="dir-range-vals"><span>0</span><span data-skor-lbl style="font-weight:700;color:var(--accent,#B5202A)">0</span><span>100</span></div>';
    body.appendChild(skorBlock);
    var skorEl = skorBlock.querySelector('input[type=range]');
    var skorLbl = skorBlock.querySelector('[data-skor-lbl]');
    function syncSkorUi() {
      skorMin = Number(skorEl.value) || 0;
      if (skorLbl) skorLbl.textContent = String(skorMin);
    }
    skorEl.addEventListener('input', function () { syncSkorUi(); debouncedEmit(); });
    syncSkorUi();

    outer.appendChild(body);
    container.appendChild(outer);

    function readFilters() {
      var pMin = priceLo <= 0 ? null : priceLo;
      var pMax = priceHi >= PRICE_ABS_MAX ? null : priceHi;
      var oMin = omsetMin <= 0 ? null : omsetMin;
      var sMin = skorMin <= 0 ? null : skorMin;
      return {
        priceMin: pMin,
        priceMax: pMax,
        omsetMin: oMin,
        omsetMax: null,
        skorMin: sMin,
        categories: catMs.get(),
        cities: cityMs.get()
      };
    }

    function emit() {
      if (onApply) onApply(readFilters());
    }

    var debounceTimer = null;
    function debouncedEmit() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(emit, 200);
    }

    container._dirApi = {
      setCategories: function (cats) { catMs.set(cats); },
      setCities: function (cities) { cityMs.set(cities); },
      getFilters: readFilters
    };
  }

  global.LarisGptDirFilters = {
    applyFilters: applyFilters,
    skorOf: skorOf,
    renderControls: renderControls
  };

})(window);
