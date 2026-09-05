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

  var SORT_OPTIONS = [
    ['omset', 'Omset / bulan'],
    ['terlaris', 'Unit jual'],
    ['termahal', 'Harga tertinggi'],
    ['termurah', 'Harga terendah'],
    ['review', 'Review terbanyak'],
    ['terbaru', 'Paling baru'],
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --------------------------------------------------------------------------
   * renderControls(container, opts)
   *
   * A single Tokopedia-style "Urutkan" sort dropdown. Category selection lives
   * in the results-bar mega-menu / subcategory cards, not here — this used to
   * also render a Kategori/Harga/Omset/Skor filter panel; that's gone.
   *
   * opts: { value: string, onSortChange: (value:string) => void }
   * -------------------------------------------------------------------------- */
  function renderControls(container, opts) {
    if (!container || !container.appendChild) return;
    var onSortChange = (opts && typeof opts.onSortChange === 'function') ? opts.onSortChange : null;
    var current = (opts && opts.value) || 'omset';

    if (container.dataset.mounted === 'true') {
      if (container._dirApi) container._dirApi.setValue(current);
      return;
    }
    container.dataset.mounted = 'true';
    container.classList.add('dir-filter-host');

    var wrap = document.createElement('div');
    wrap.className = 'dir-sort-wrap';
    wrap.innerHTML =
      '<label class="dir-sort-label" for="dir-sort-select">Urutkan</label>' +
      '<select class="dir-sort-select" id="dir-sort-select">' +
      SORT_OPTIONS.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === current ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') +
      '</select>';
    container.appendChild(wrap);

    var select = wrap.querySelector('#dir-sort-select');
    select.addEventListener('change', function () {
      if (onSortChange) onSortChange(select.value);
    });

    container._dirApi = {
      setValue: function (v) { select.value = v || 'sesuai'; }
    };
  }

  global.LarisGptDirFilters = {
    skorOf: skorOf,
    renderControls: renderControls
  };

})(window);
