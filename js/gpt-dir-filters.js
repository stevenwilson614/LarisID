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

  /* --------------------------------------------------------------------------
   * renderControls(container, { onApply })
   *
   * Injects number inputs into an existing DOM element `container`.
   * - Idempotent: second call with the same container is a no‑op.
   * - Never throws when container is null/undefined.
   * - Debounces `input` events (350 ms) and calls `onApply(filters)` with the
   *   same filter shape used by `applyFilters`.
   * - Empty inputs are mapped to `null` (not 0) so constraints are truly absent.
   * -------------------------------------------------------------------------- */
  function renderControls(container, opts) {
    if (!container || !container.appendChild) return;
    // Already initialised?
    if (container.dataset.mounted === 'true') return;
    container.dataset.mounted = 'true';

    var onApply = (opts && typeof opts.onApply === 'function') ? opts.onApply : null;

    // ----- helper: create labelled number input -----
    function createNumberInput(labelText, placeholder) {
      var lbl = document.createElement('label');
      lbl.textContent = labelText;
      var inp = document.createElement('input');
      inp.type = 'number';
      if (placeholder !== undefined) inp.placeholder = placeholder;
      lbl.appendChild(inp);
      return { label: lbl, input: inp };
    }

    var hargaMin = createNumberInput('Harga min', '0');
    var hargaMax = createNumberInput('Harga max', '');
    var omsetMin = createNumberInput('Omset/bulan min', '');
    var omsetMax = createNumberInput('Omset/bulan max', '');
    var skorMin  = createNumberInput('Skor minimum', '0‑100');
    skorMin.input.setAttribute('min', '0');
    skorMin.input.setAttribute('max', '100');

    // Append all pieces to a fragment so we only trigger one reflow
    var fragment = document.createDocumentFragment();
    fragment.appendChild(hargaMin.label);
    fragment.appendChild(hargaMax.label);
    fragment.appendChild(omsetMin.label);
    fragment.appendChild(omsetMax.label);
    fragment.appendChild(skorMin.label);
    container.appendChild(fragment);

    // Keep references for reading later
    var inputs = {
      hargaMin: hargaMin.input,
      hargaMax: hargaMax.input,
      omsetMin: omsetMin.input,
      omsetMax: omsetMax.input,
      skorMin:  skorMin.input
    };

    container._dirInputs = inputs;   // non‑enumerable marker, safe for debugging

    // ----- read current values and build a filters object -----
    function readFilters() {
      function val(input) {
        var raw = input.value.trim();
        if (raw === '') return null;
        var num = Number(raw);
        return isNaN(num) ? null : num;
      }
      return {
        priceMin : val(inputs.hargaMin),
        priceMax : val(inputs.hargaMax),
        omsetMin : val(inputs.omsetMin),
        omsetMax : val(inputs.omsetMax),
        skorMin  : val(inputs.skorMin)
      };
    }

    function handleChange() {
      if (onApply) {
        onApply(readFilters());
      }
    }

    // ----- debounce 350 ms -----
    var debounceTimer = null;
    function debouncedHandle() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleChange, 350);
    }

    // Attach listener to each input once
    var allInputs = [inputs.hargaMin, inputs.hargaMax, inputs.omsetMin, inputs.omsetMax, inputs.skorMin];
    for (var i = 0; i < allInputs.length; ++i) {
      allInputs[i].addEventListener('input', debouncedHandle);
    }
  }

  // ----- export -----
  global.LarisGptDirFilters = {
    applyFilters: applyFilters,
    skorOf: skorOf,
    renderControls: renderControls
  };

})(window);
