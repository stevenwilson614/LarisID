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
    ['trending', 'Paling Trending'],
    ['terlaris', 'Unit jual'],
    ['termahal', 'Harga tertinggi'],
    ['termurah', 'Harga terendah'],
    ['review', 'Review terbanyak'],
    ['terbaru', 'Paling baru'],
  ];
  var SESUAI_OPTION = ['sesuai', 'Paling sesuai'];

  function sortOptionList(showSesuai) {
    return (showSesuai ? [SESUAI_OPTION] : []).concat(SORT_OPTIONS);
  }

  var FLAME = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-2.5-1.4-4.6-3-6.5-.6 1.2-1.4 2-2.5 2.5C13.9 9 13 5.5 9.5 2c.3 3-.5 4.6-2 6.5C6 10.4 5 12.3 5 15.5 5 19.2 7.6 22 12 22z"/></svg>';

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
   * opts: { value: string, onSortChange: (value:string) => void, showSesuai?: boolean }
   * -------------------------------------------------------------------------- */
  function renderControls(container, opts) {
    if (!container || !container.appendChild) return;
    var onSortChange = (opts && typeof opts.onSortChange === 'function') ? opts.onSortChange : null;
    var current = (opts && opts.value) || 'omset';
    var showSesuai = !!(opts && opts.showSesuai);

    if (container.dataset.mounted === 'true') {
      if (container._dirApi) {
        container._dirApi.setShowSesuai(showSesuai);
        container._dirApi.setValue(current);
      }
      return;
    }
    container.dataset.mounted = 'true';
    container.classList.add('dir-filter-host');

    var wrap = document.createElement('div');
    wrap.className = 'dir-sort-wrap';
    wrap.innerHTML =
      '<label class="dir-sort-label" for="dir-sort-select">Urutkan</label>' +
      '<div class="dir-sort-pill">' +
        '<span class="dir-sort-flame" data-dir-sort-flame hidden>' + FLAME + '</span>' +
        '<select class="dir-sort-select" id="dir-sort-select"></select>' +
      '</div>';
    container.appendChild(wrap);

    var select = wrap.querySelector('#dir-sort-select');
    var flame = wrap.querySelector('[data-dir-sort-flame]');
    function syncFlame(v) {
      if (flame) flame.hidden = v !== 'trending';
      wrap.classList.toggle('is-trending', v === 'trending');
    }
    function fillOptions(v) {
      var cur = v || 'omset';
      if (!showSesuai && cur === 'sesuai') cur = 'omset';
      select.innerHTML = sortOptionList(showSesuai).map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === cur ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('');
      select.value = cur;
      syncFlame(cur);
      return cur;
    }
    fillOptions(current);
    select.addEventListener('change', function () {
      syncFlame(select.value);
      if (onSortChange) onSortChange(select.value);
    });

    container._dirApi = {
      setValue: function (v) {
        var next = v || 'omset';
        if (!showSesuai && next === 'sesuai') next = 'omset';
        if (![].some.call(select.options, function (o) { return o.value === next; })) {
          fillOptions(next);
        } else {
          select.value = next;
          syncFlame(next);
        }
      },
      setShowSesuai: function (on) {
        showSesuai = !!on;
        fillOptions(select.value);
      }
    };
  }

  global.LarisGptDirFilters = {
    skorOf: skorOf,
    renderControls: renderControls
  };

})(window);
