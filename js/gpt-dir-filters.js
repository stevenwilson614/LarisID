(function (global) {
  'use strict';

  /* --------------------------------------------------------------------------
   * skorOf(row)
   *
   * Computes a 0‑100 aggregate score for a single row using only the fields
   * that are guaranteed to be present:
   *   n_sellers, sold_top3_share, omset_top15, breakout_rate,
   *   trend_delta_30d, niche_new_items
   *
   * The formula is designed to be easy to read and tune later.
   *
   * Rationale (see inline comments):
   *   - base              = 50                  // neutral starting point
   *   + omsetPoints       = min(25, omset / 20M)  // proven demand increases score
   *   + breakoutPoints    = clamp(breakout * 0.2, -5, 10)
   *   + trendPoints       = clamp(trend / 5,   -10, 15)
   *   + nichePoints       = bell‑curve around 20 new listings (0‑10)
   *   – sellerPenalty     = min(15, (nSellers – 15) * 0.5)   // too many sellers hurts
   *   – top3Penalty       = min(20, top3Share / 100 * 20)   // high concentration signals a closed market
   *
   * Final value is rounded and clamped to [0, 100].
   * -------------------------------------------------------------------------- */
  function skorOf(row) {
    const nSellers = Number(row.n_sellers) || 0;
    const omset    = Number(row.omset_top15) || 0;
    const breakout = Number(row.breakout_rate) || 0;
    const trend    = Number(row.trend_delta_30d) || 0;
    const niche    = Number(row.niche_new_items) || 0;
    const top3Share = Number(row.sold_top3_share) || 0;

    // Demand signal – capped so outlier markets don't completely swamp the score
    var omsetPoints = Math.min(25, omset / 20000000);   // 20M IDR → 1 point

    // Growth signals – positive values help, negative drag down, with limits
    var breakoutPoints = Math.min(10, Math.max(-5, breakout * 0.2));
    var trendPoints    = Math.min(15, Math.max(-10, trend / 5));

    // New‑listing churn: moderate amount is attractive, extreme values are risky
    var nichePoints = 0;
    if (niche >= 0) {
      var ideal = 20;                               // 20 recent new listings = perfect sweet spot
      var diff  = Math.abs(niche - ideal);
      nichePoints = Math.max(0, 10 - 0.5 * diff);   // 10 points at ideal, 0 when diff >=20
    }

    // Competition – each seller beyond 15 gradually eats into the score
    var sellerPenalty = 0;
    if (nSellers > 15) {
      sellerPenalty = Math.min(15, (nSellers - 15) * 0.5);
    }

    // Top‑3 concentration – the more the market is concentrated, the harder to break in
    //   (sold_top3_share is expected to be a 0‑100 percentage)
    var top3Penalty = Math.min(20, (top3Share / 100) * 20);

    var score = 50 + omsetPoints + breakoutPoints + trendPoints + nichePoints
                - sellerPenalty - top3Penalty;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  var PRICE_ABS_MAX = 500000;
  var OMSET_ABS_MAX = 500000000;

  /* --------------------------------------------------------------------------
   * applyFilters(rows, filters)
   *
   * Returns a new array containing only rows that satisfy every non‑null
   * constraint in `filters`.  Doesn't mutate the input array.
   *
   * filters shape: { priceMin, priceMax, omsetMin, omsetMax, skorMin }
   *   - priceMin/priceMax bound the `price_median` field.
   *     If `price_median` is absent we use the midpoint of `price_min` and
   *     `price_max`; otherwise the value is treated as 0.
   *   - omsetMin/omsetMax bound `omset_top15`.
   *   - skorMin bounds the value returned by `skorOf(row)`.
   *   - A null/undefined/empty‑string bound means “no constraint on that side”.
   * -------------------------------------------------------------------------- */
  function applyFilters(rows, filters) {
    if (!Array.isArray(rows)) return [];

    // Guard: normalise missing filters object to empty
    var f = filters || {};

    return rows.filter(function (row) {
      // ----- price -----
      var p = getPriceValue(row);
      if (f.priceMin != null && p < f.priceMin) return false;
      if (f.priceMax != null && p > f.priceMax) return false;

      // ----- omset -----
      var o = Number(row.omset_top15) || 0;
      if (f.omsetMin != null && o < f.omsetMin) return false;
      if (f.omsetMax != null && o > f.omsetMax) return false;

      // ----- skor -----
      if (f.skorMin != null) {
        if (skorOf(row) < f.skorMin) return false;
      }

      return true;
    });
  }

  /** Safe price extraction: price_median, else midpoint, else 0 */
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

  function catSummaryLabel(selected, allCount) {
    var n = (selected || []).length;
    if (!n || n >= allCount) return 'Semua kategori';
    if (n === 1) return selected[0];
    return selected[0] + ' +' + (n - 1) + ' lainnya';
  }

  function sectionSummary(label, valueText) {
    return (
      '<summary class="dir-acc-sum">' +
        '<span class="dir-acc-sum-main">' +
          '<span class="dir-acc-label">' + esc(label) + '</span>' +
          '<span class="dir-acc-value">' + esc(valueText) + '</span>' +
        '</span>' +
        '<svg class="dir-acc-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</summary>'
    );
  }

  /* --------------------------------------------------------------------------
   * renderControls(container, { onApply, categories, selectedCategories })
   *
   * Collapsible accordion filters:
   *   - Kategori: multi-select checkbox dropdown (collapsed by default)
   *   - Harga: dual range slider (min / max)
   *   - Omset/bulan: single minimum slider
   *   - Skor minimum: single slider
   *
   * Debounces apply (200 ms). Extreme slider positions map to null (= no bound).
   * -------------------------------------------------------------------------- */
  function renderControls(container, opts) {
    if (!container || !container.appendChild) return;
    if (container.dataset.mounted === 'true') {
      // Already built — refresh category checks / label if provided.
      if (opts && Array.isArray(opts.selectedCategories) && container._dirApi) {
        container._dirApi.setCategories(opts.selectedCategories);
      }
      return;
    }
    container.dataset.mounted = 'true';
    container.classList.add('dir-filter-panel');

    var onApply = (opts && typeof opts.onApply === 'function') ? opts.onApply : null;
    var allCats = (opts && Array.isArray(opts.categories)) ? opts.categories.slice() : [];
    var selected = (opts && Array.isArray(opts.selectedCategories))
      ? opts.selectedCategories.slice()
      : [];

    // ----- Kategori accordion + nested popup multiselect -----
    var catDetails = document.createElement('details');
    catDetails.className = 'dir-acc';
    catDetails.innerHTML = sectionSummary('Kategori', catSummaryLabel(selected, allCats.length));

    var catBody = document.createElement('div');
    catBody.className = 'dir-acc-body';

    var catPicker = document.createElement('div');
    catPicker.className = 'dir-cat-picker';
    catPicker.innerHTML =
      '<button type="button" class="dir-cat-trigger" aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="dir-cat-trigger-label">' + esc(catSummaryLabel(selected, allCats.length)) + '</span>' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="dir-cat-popup" role="listbox" aria-multiselectable="true" hidden>' +
        '<div class="dir-cat-popup-list"></div>' +
        '<button type="button" class="dir-cat-popup-done">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
          'Selesai' +
        '</button>' +
      '</div>';
    catBody.appendChild(catPicker);
    catDetails.appendChild(catBody);

    var catTrigger = catPicker.querySelector('.dir-cat-trigger');
    var catTriggerLabel = catPicker.querySelector('.dir-cat-trigger-label');
    var catPopup = catPicker.querySelector('.dir-cat-popup');
    var catList = catPicker.querySelector('.dir-cat-popup-list');
    var catDone = catPicker.querySelector('.dir-cat-popup-done');
    var catValueEl = catDetails.querySelector('.dir-acc-value');

    function syncCatLabels() {
      var text = catSummaryLabel(selected, allCats.length);
      if (catTriggerLabel) catTriggerLabel.textContent = text;
      if (catValueEl) catValueEl.textContent = text;
    }

    function rebuildCatList() {
      if (!catList) return;
      catList.innerHTML = allCats.map(function (c) {
        var on = selected.indexOf(c) >= 0;
        return (
          '<label class="dir-cat-opt">' +
            '<input type="checkbox" value="' + esc(c) + '"' + (on ? ' checked' : '') + '>' +
            '<span>' + esc(c) + '</span>' +
          '</label>'
        );
      }).join('');
      catList.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var set = {};
          selected.forEach(function (c) { set[c] = true; });
          if (cb.checked) set[cb.value] = true; else delete set[cb.value];
          selected = Object.keys(set);
          syncCatLabels();
          debouncedEmit();
        });
      });
    }
    rebuildCatList();

    function openCatPopup() {
      if (!catPopup || !catTrigger) return;
      catPopup.hidden = false;
      catPicker.classList.add('open');
      catTrigger.setAttribute('aria-expanded', 'true');
    }
    function closeCatPopup() {
      if (!catPopup || !catTrigger) return;
      catPopup.hidden = true;
      catPicker.classList.remove('open');
      catTrigger.setAttribute('aria-expanded', 'false');
    }
    catTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (catPopup.hidden) openCatPopup(); else closeCatPopup();
    });
    catDone.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeCatPopup();
    });
    document.addEventListener('click', function (e) {
      if (!catPopup.hidden && !catPicker.contains(e.target)) closeCatPopup();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !catPopup.hidden) closeCatPopup();
    });

    // ----- Harga dual slider -----
    var priceLo = 0;
    var priceHi = PRICE_ABS_MAX;
    var hargaDetails = document.createElement('details');
    hargaDetails.className = 'dir-acc';
    hargaDetails.innerHTML = sectionSummary('Harga', fmtRp(priceLo) + ' – ' + fmtRp(priceHi) + '+');
    var hargaBody = document.createElement('div');
    hargaBody.className = 'dir-acc-body';
    hargaBody.innerHTML =
      '<div class="dir-dual-range" id="dir-price-range">' +
        '<div class="dir-dual-track"></div>' +
        '<div class="dir-dual-fill" data-fill></div>' +
        '<input type="range" data-role="min" min="0" max="' + PRICE_ABS_MAX + '" step="5000" value="0">' +
        '<input type="range" data-role="max" min="0" max="' + PRICE_ABS_MAX + '" step="5000" value="' + PRICE_ABS_MAX + '">' +
      '</div>' +
      '<div class="dir-range-vals"><span data-min-lbl>' + esc(fmtRp(0)) + '</span><span data-max-lbl>' + esc(fmtRp(PRICE_ABS_MAX)) + '+</span></div>';
    hargaDetails.appendChild(hargaBody);
    var hargaValueEl = hargaDetails.querySelector('.dir-acc-value');
    var priceMinEl = hargaBody.querySelector('[data-role="min"]');
    var priceMaxEl = hargaBody.querySelector('[data-role="max"]');
    var priceFill = hargaBody.querySelector('[data-fill]');
    var priceMinLbl = hargaBody.querySelector('[data-min-lbl]');
    var priceMaxLbl = hargaBody.querySelector('[data-max-lbl]');

    function syncPriceUi() {
      var lo = Number(priceMinEl.value);
      var hi = Number(priceMaxEl.value);
      if (lo > hi) {
        // Keep thumbs from crossing — nudge the one the user didn't just move.
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
      if (hargaValueEl) {
        hargaValueEl.textContent = (lo <= 0 && hi >= max)
          ? 'Semua harga'
          : (fmtRp(lo) + ' – ' + (hi >= max ? fmtRp(hi) + '+' : fmtRp(hi)));
      }
    }
    priceMinEl.addEventListener('input', function () { syncPriceUi(); debouncedEmit(); });
    priceMaxEl.addEventListener('input', function () { syncPriceUi(); debouncedEmit(); });
    // Click-track to jump nearer thumb (mirrors Discover dual-range UX).
    hargaBody.querySelector('.dir-dual-range').addEventListener('pointerdown', function (e) {
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

    // ----- Omset min slider -----
    var omsetMin = 0;
    var omsetDetails = document.createElement('details');
    omsetDetails.className = 'dir-acc';
    omsetDetails.innerHTML = sectionSummary('Omset/bulan', 'Min ' + fmtRp(0));
    var omsetBody = document.createElement('div');
    omsetBody.className = 'dir-acc-body';
    omsetBody.innerHTML =
      '<div class="dir-single-range">' +
        '<input type="range" min="0" max="' + OMSET_ABS_MAX + '" step="5000000" value="0">' +
      '</div>' +
      '<div class="dir-range-vals"><span>Rp 0</span><span data-omset-lbl>Min Rp 0</span><span>Rp 500 jt+</span></div>';
    omsetDetails.appendChild(omsetBody);
    var omsetValueEl = omsetDetails.querySelector('.dir-acc-value');
    var omsetEl = omsetBody.querySelector('input[type=range]');
    var omsetLbl = omsetBody.querySelector('[data-omset-lbl]');
    function syncOmsetUi() {
      omsetMin = Number(omsetEl.value) || 0;
      var text = omsetMin <= 0 ? 'Semua omset' : ('Min ' + fmtRp(omsetMin));
      if (omsetLbl) omsetLbl.textContent = text;
      if (omsetValueEl) omsetValueEl.textContent = text;
    }
    omsetEl.addEventListener('input', function () { syncOmsetUi(); debouncedEmit(); });
    syncOmsetUi();

    // ----- Skor minimum slider -----
    var skorMin = 0;
    var skorDetails = document.createElement('details');
    skorDetails.className = 'dir-acc';
    skorDetails.innerHTML = sectionSummary('Skor minimum', '0');
    var skorBody = document.createElement('div');
    skorBody.className = 'dir-acc-body';
    skorBody.innerHTML =
      '<div class="dir-single-range">' +
        '<input type="range" min="0" max="100" step="5" value="0">' +
      '</div>' +
      '<div class="dir-range-vals"><span>0</span><span data-skor-lbl style="font-weight:700;color:var(--accent,#B5202A)">0</span><span>100</span></div>';
    skorDetails.appendChild(skorBody);
    var skorValueEl = skorDetails.querySelector('.dir-acc-value');
    var skorEl = skorBody.querySelector('input[type=range]');
    var skorLbl = skorBody.querySelector('[data-skor-lbl]');
    function syncSkorUi() {
      skorMin = Number(skorEl.value) || 0;
      if (skorLbl) skorLbl.textContent = String(skorMin);
      if (skorValueEl) skorValueEl.textContent = skorMin <= 0 ? 'Semua skor' : String(skorMin);
    }
    skorEl.addEventListener('input', function () { syncSkorUi(); debouncedEmit(); });
    syncSkorUi();

    container.appendChild(catDetails);
    container.appendChild(hargaDetails);
    container.appendChild(omsetDetails);
    container.appendChild(skorDetails);

    function readFilters() {
      // Extreme positions = no constraint, so default open state shows everything.
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
        categories: selected.slice()
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
      setCategories: function (cats) {
        selected = Array.isArray(cats) ? cats.slice() : [];
        rebuildCatList();
        syncCatLabels();
      },
      getFilters: readFilters
    };
  }

  // ----- export -----
  global.LarisGptDirFilters = {
    applyFilters: applyFilters,
    skorOf: skorOf,
    renderControls: renderControls
  };

})(window);
