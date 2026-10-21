/**
 * Unflatten a weekly omset line.
 *
 * A flat positive run keeps its units and omset total, but the weeks take
 * this listing's own earlier shape when those weeks actually moved. Otherwise
 * they take the catalog pattern below (one scrape, or a line that never moved).
 * A series that already changes week to week is left alone. Zeros stay zero.
 *
 * Loaded before gpt-app.js. Node: scripts/test-omset-week-shape.mjs
 *
 * Calibrated 2026-10-21 from listing_weekly source=measured, omset > 0:
 *   607,977 varied adjacent pairs, median |Δ|/prev = 0.3743
 *     (p25 0.1251, p75 0.7714; 1,167,523 adjacent pairs overall).
 *   Last 4 measured weeks of 179,993 listings that were not flat, median
 *   of (week / mean), oldest → newest: 0.9315, 0.9562, 0.9878, 1.0058.
 *   That cross-section is only ~8% peak-to-peak because spikes land on
 *   different weeks. Renormalize to mean 1, then scale the deviations so
 *   peak-to-peak equals the 0.3743 median move. Recent week stays higher.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.LarisOmsetWeekShape = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATALOG_ABS_WOW = 0.3743;
  // Oldest → newest. Mean 1. Peak-to-peak 0.3743.
  const CATALOG_PATTERN = [0.8044, 0.9288, 1.0880, 1.1787];

  function median(values) {
    const s = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    if (!s.length) return 0;
    if (s.length % 2) return s[mid];
    return (s[mid - 1] + s[mid]) / 2;
  }

  function catalogWeights(n) {
    const src = CATALOG_PATTERN;
    const raw = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * (src.length - 1);
      const i0 = Math.floor(t);
      const i1 = Math.min(src.length - 1, i0 + 1);
      const f = t - i0;
      raw.push(src[i0] * (1 - f) + src[i1] * f);
    }
    const mean = raw.reduce((s, v) => s + v, 0) / n;
    let w = raw.map(v => v / mean);
    const lo = Math.min.apply(null, w);
    const hi = Math.max.apply(null, w);
    const ptp = hi - lo;
    if (!(ptp > 1e-12)) {
      w = [];
      for (let i = 0; i < n; i++) {
        const centered = n === 1 ? 0 : (i / (n - 1) - 0.5);
        w.push(1 + centered * CATALOG_ABS_WOW);
      }
    } else {
      const mid = (hi + lo) / 2;
      const scale = CATALOG_ABS_WOW / ptp;
      w = w.map(v => mid + (v - mid) * scale);
      const m2 = w.reduce((s, v) => s + v, 0) / n;
      w = w.map(v => v / m2);
    }
    return w;
  }

  /** Relative weights of length n from this listing's earlier positive weeks. */
  function historyWeights(values, n) {
    if (!values || values.length < 2 || n < 2) return null;
    const med = median(values);
    const cap = med * 3;
    const all = values.map(v => Math.min(v, cap));
    if (Math.max.apply(null, all) === Math.min.apply(null, all)) return null;
    let seq = null;
    if (all.length <= n) {
      seq = [];
      for (let i = 0; i < n; i++) seq.push(all[i % all.length]);
    } else {
      for (let end = all.length; end >= n; end--) {
        const window = all.slice(end - n, end);
        if (Math.max.apply(null, window) !== Math.min.apply(null, window)) {
          seq = window;
          break;
        }
      }
    }
    if (!seq) return null;
    const mean = seq.reduce((s, v) => s + v, 0) / seq.length;
    if (!(mean > 0)) return null;
    const w = seq.map(v => v / mean);
    if (Math.max.apply(null, w) - Math.min.apply(null, w) < 1e-12) return null;
    return w;
  }

  function breakTies(arr, weights) {
    const n = arr.length;
    let guard = n * n + 8;
    while (guard-- > 0) {
      let moved = false;
      for (let i = 1; i < n; i++) {
        if (arr[i] !== arr[i - 1]) continue;
        const laterHigher = (weights[i] || 0) >= (weights[i - 1] || 0);
        if (laterHigher && arr[i - 1] > 0) {
          arr[i - 1]--; arr[i]++; moved = true; continue;
        }
        if (!laterHigher && arr[i] > 0) {
          arr[i]--; arr[i - 1]++; moved = true; continue;
        }
        if (arr[i - 1] > 0) {
          arr[i - 1]--; arr[i]++; moved = true; continue;
        }
        if (arr[i] > 0) {
          arr[i]--; arr[i - 1]++; moved = true; continue;
        }
        let donor = -1;
        for (let j = 0; j < n; j++) {
          if (j !== i && j !== i - 1 && arr[j] > 0) { donor = j; break; }
        }
        if (donor >= 0) {
          arr[donor]--;
          if (laterHigher) arr[i]++;
          else arr[i - 1]++;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return arr;
  }

  function allocateInt(total, weights) {
    const n = weights.length;
    const tot = Math.round(Number(total) || 0);
    if (!n) return [];
    if (tot <= 0) return Array(n).fill(0);
    const sumW = weights.reduce((s, w) => s + w, 0) || n;
    const exact = weights.map(w => (tot * w) / sumW);
    const out = exact.map(x => Math.floor(Math.max(0, x)));
    let rem = tot - out.reduce((s, v) => s + v, 0);
    const order = exact.map((x, i) => ({ i, frac: x - Math.floor(Math.max(0, x)) }))
      .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
    let k = 0;
    while (rem > 0 && k < n * (rem + 2)) {
      out[order[k % n].i] += 1;
      rem -= 1;
      k += 1;
    }
    breakTies(out, weights);
    return out;
  }

  function flatRuns(om) {
    const runs = [];
    let i = 0;
    while (i < om.length) {
      if (!(om[i] > 0)) { i++; continue; }
      let j = i + 1;
      while (j < om.length && om[j] === om[i]) j++;
      if (j - i >= 2) runs.push([i, j]);
      i = j;
    }
    return runs;
  }

  /**
   * @param {Array<{omset?: number, units?: number, perkiraan?: boolean}>} weeks
   * @returns {Array} new week objects; input is not mutated
   */
  function shapeFlatWeeks(weeks) {
    if (!Array.isArray(weeks) || !weeks.length) return [];
    const out = weeks.map(w => ({
      ...w,
      omset: Math.round(Number(w && w.omset) || 0),
      units: Math.round(Number(w && w.units) || 0),
    }));
    if (out.length < 2) return out;
    const om = out.map(w => w.omset);
    const runs = flatRuns(om);
    for (let r = 0; r < runs.length; r++) {
      const s = runs[r][0];
      const e = runs[r][1];
      const n = e - s;
      const earlier = [];
      for (let k = 0; k < s; k++) if (om[k] > 0) earlier.push(om[k]);
      let weights = null;
      if (earlier.length >= 2 && Math.max.apply(null, earlier) !== Math.min.apply(null, earlier)) {
        weights = historyWeights(earlier, n);
      }
      if (!weights) weights = catalogWeights(n);
      const omTotal = om.slice(s, e).reduce((a, b) => a + b, 0);
      const unTotal = out.slice(s, e).reduce((a, w) => a + w.units, 0);
      const newOm = allocateInt(omTotal, weights);
      const newUn = allocateInt(unTotal, weights);
      for (let k = 0; k < n; k++) {
        const prevO = out[s + k].omset;
        const prevU = out[s + k].units;
        out[s + k].omset = newOm[k];
        out[s + k].units = newUn[k];
        if (newOm[k] !== prevO || newUn[k] !== prevU) out[s + k].perkiraan = true;
      }
    }
    return out;
  }

  return {
    CATALOG_ABS_WOW,
    CATALOG_PATTERN,
    catalogWeights,
    historyWeights,
    shapeFlatWeeks,
  };
});
