/**
 * Two-level category picker: main chips + per-category sub‑groups.
 * Collapses so a 20‑chip bar never pushes the product grid below the fold.
 *
 * mount({ hostId, site, adapter })
 *   adapter.esc(str)                  → safe HTML string
 *   adapter.track(event, props)       // analytics, may be no‑op
 *   adapter.loadCategories()          → Promise<string[]> (canonical order)
 *   adapter.loadSubgroups(cat)        → Promise<string[]> (may be [])
 *   adapter.onChange({category,subgroup,kind})  // only user‑initiated
 */
(function (global) {
  'use strict';

  let host = null;
  let opts = {};
  let bound = false;

  // Internal state — the single source of truth.
  let cats = [];
  let subs = [];                   // sub‑groups for the *currently‑active* category
  let subCache = Object.create(null); // category → sub‑groups, cached forever
  let selCat = null;               // chosen top‑level category, or null
  let selSub = null;               // chosen sub‑group, or null
  let gen = 0;                     // monotonically‑increasing async guard token

  /* keep these so we can wipe them on unmount */
  let catsBar = null;              // <div> holding main chips
  let subsBar = null;              // <div> holding sub‑group chips

  // ---------- helpers --------------------------------------------------------

  function esc(str) {
    return opts.adapter && typeof opts.adapter.esc === 'function'
      ? opts.adapter.esc(str == null ? '' : str)
      : String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function track(name, props) {
    try { if (opts.adapter && typeof opts.adapter.track === 'function') opts.adapter.track(name, props); } catch (_) {}
  }

  // chip element builder — always <button type="button">
  function chip(label, cls, dataAttrs) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls || 'lcp-chip';
    btn.textContent = label;
    if (dataAttrs) Object.keys(dataAttrs).forEach(k => btn.setAttribute(k, String(dataAttrs[k])));
    return btn;
  }

  // ---------- rendering -----------------------------------------------------

  function renderCats() {
    if (!catsBar) return;
    catsBar.innerHTML = '';
    if (!cats.length) return;

    // "‹ Semua" chip — only shown when collapsed
    const back = chip('\u2039 Semua', 'lcp-chip lcp-chip-back');
    back.setAttribute('data-lcp-action', 'back');
    catsBar.appendChild(back);

    let chosenEl = null;
    cats.forEach(c => {
      const el = chip(esc(c), 'lcp-chip', { 'data-lcp-cat': c });
      if (c === selCat) chosenEl = el;
      catsBar.appendChild(el);
    });
    catsBar.classList.toggle('lcp-collapsed', !!selCat);
    if (chosenEl) chosenEl.classList.add('selected');
  }

  function renderSubs() {
    if (!subsBar) return;
    subsBar.innerHTML = '';
    if (!selCat) { subsBar.style.display = 'none'; return; }
    if (!subs.length) { subsBar.style.display = 'none'; return; }

    subsBar.style.display = 'flex';

    // "Semua <Category>" chip — selects no sub‑group
    const allChip = chip('Semua ' + esc(selCat), 'lcp-chip', { 'data-lcp-sub': '' });
    subsBar.appendChild(allChip);
    if (!selSub) allChip.classList.add('selected');

    subs.forEach(s => {
      const el = chip(esc(s), 'lcp-chip', { 'data-lcp-sub': s });
      if (s === selSub) el.classList.add('selected');
      subsBar.appendChild(el);
    });
  }

  // full re‑render after state change
  function paint() {
    renderCats();
    renderSubs();
  }

  // ---------- data loading --------------------------------------------------

  async function loadCats() {
    if (!opts.adapter || typeof opts.adapter.loadCategories !== 'function') { cats = []; paint(); return; }
    try {
      cats = await opts.adapter.loadCategories();
    } catch (_) {
      cats = [];
    }
    if (!Array.isArray(cats)) cats = [];
    paint();
  }

  async function loadSubs(category) {
    if (!category) { subs = []; paint(); return; }
    if (subCache[category] !== undefined) { subs = subCache[category]; paint(); return; }
    subs = []; paint(); // placeholder while loading
    const snap = ++gen;
    const p  = (opts.adapter && typeof opts.adapter.loadSubgroups === 'function')
      ? Promise.resolve(opts.adapter.loadSubgroups(category)).catch(() => [])
      : Promise.resolve([]);
    const list = await p;
    if (!Array.isArray(list)) { if (gen === snap && selCat === category) { subCache[category] = []; subs = []; paint(); } return; }
    subCache[category] = list;
    if (gen === snap && selCat === category) { subs = list; paint(); }
  }

  // ---------- actions -------------------------------------------------------

  function pickCat(cat) {
    if (cat === selCat) return;
    selCat = cat;
    selSub = null;                // reset sub‑group
    paint();
    track('dir_filter', { ui: opts.site || 'a', kind: 'category', value: cat || '' });
    if (opts.adapter && typeof opts.adapter.onChange === 'function') {
      opts.adapter.onChange({ category: cat, subgroup: null, kind: 'category' });
    }
    loadSubs(cat);
  }

  function pickSub(sub) {
    if (sub === selSub) return;
    selSub = sub || null;
    paint();
    track('dir_filter', { ui: opts.site || 'a', kind: 'subgroup', value: sub || '' });
    if (opts.adapter && typeof opts.adapter.onChange === 'function') {
      opts.adapter.onChange({ category: selCat, subgroup: selSub, kind: 'subgroup' });
    }
  }

  function clearAll() {
    selCat = null;
    selSub = null;
    paint();
    track('dir_filter', { ui: opts.site || 'a', kind: 'clear', value: '' });
    if (opts.adapter && typeof opts.adapter.onChange === 'function') {
      opts.adapter.onChange({ category: null, subgroup: null, kind: 'clear' });
    }
  }

  // ---------- event delegation ----------------------------------------------

  function onCatsClick(e) {
    const t = e.target.closest && e.target.closest('[data-lcp-cat],[data-lcp-action]');
    if (!t) return;
    if (t.hasAttribute('data-lcp-action') && t.getAttribute('data-lcp-action') === 'back') {
      clearAll(); return;
    }
    const cat = t.getAttribute('data-lcp-cat');
    if (cat) pickCat(cat);
  }

  function onSubsClick(e) {
    const t = e.target.closest && e.target.closest('[data-lcp-sub]');
    if (!t) return;
    const sub = t.getAttribute('data-lcp-sub');
    pickSub(sub);
  }

  // ---------- public API ----------------------------------------------------

  function mount(o) {
    o = o || {};
    const el = global.document.getElementById(o.hostId || '');
    if (!el) { console.warn('[LarisCatPicker] host not found:', o.hostId); return false; }
    if (host === el) return true;   // idempotent
    host = el;
    opts = o;
    gen = 0;
    selCat = null;
    selSub = null;
    subCache = Object.create(null);
    cats = [];
    subs = [];

    host.className += (host.className ? ' ' : '') + 'lcp-root';
    host.innerHTML =
      '<div class="lcp-cats-row" data-lcp-cats-row></div>' +
      '<div class="lcp-subs-row" data-lcp-subs-row style="display:none"></div>';

    catsBar = host.querySelector('[data-lcp-cats-row]');
    subsBar = host.querySelector('[data-lcp-subs-row]');

    if (!bound) {
      global.document.addEventListener('click', function (e) {
        if (!host || !host.contains(e.target)) return;
        if (catsBar && catsBar.contains(e.target)) onCatsClick(e);
        else if (subsBar && subsBar.contains(e.target)) onSubsClick(e);
      });
      bound = true;
    }

    loadCats();
    return true;
  }

  function setCategory(cat) {
    selCat = cat || null;
    selSub = null;
    subs = cat && subCache[cat] !== undefined ? subCache[cat] : [];
    paint();
    if (cat) loadSubs(cat);
  }

  function setSubgroup(sub) {
    selSub = sub || null;
    paint();
  }

  function getSelection() {
    return { category: selCat, subgroup: selSub };
  }

  function refresh() { paint(); }

  function unmount() {
    if (host) {
      catsBar = null;
      subsBar = null;
      host.innerHTML = '';
    }
    host = null;
    selCat = null;
    selSub = null;
    cats = [];
    subs = [];
    subCache = Object.create(null);
    gen++;
  }

  // prevent polluting global scope with non‑standard unloads
  global.LarisCatPicker = { mount, setCategory, setSubgroup, getSelection, refresh, unmount };
})(typeof window !== 'undefined' ? window : this);
