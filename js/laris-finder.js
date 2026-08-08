/**
 * laris-finder.js — four-step "what should I sell?" finder for landing page.
 *
 * Mount contract: LarisFinder.mount({ hostId, site, adapter })
 * The module owns its pixels + state.  It reaches into the host page only
 * through the adapter, never via app globals.
 *
 * adapter = {
 *   esc(str) -> string,
 *   track(eventName, props),
 *   cities() -> string[],                 // for typeahead
 *   categories() -> Promise<string[]> | string[],  // async ok
 *   onSubmit({ city, category, budget, experience })
 * }
 *
 * CTA gates on city + category only — budget & experience are refinements,
 * not requirements.
 */
(function (global) {
  'use strict';

  var LS_KEY = '_lid_finder_v1';

  var host    = null;
  var adapter = null;
  var opts    = {};
  var mounted = false;
  var bound   = false;          // document-level listeners attached once

  /* ── state ────────────────────────────────────────────────────────── */
  var S = {
    city: '',
    category: '',
    budget: '',
    experience: '',
    _answeredSteps: {}          // tracks first-time funnel events
  };

  var categoriesCache = [];     // resolved list, may arrive asynchronously

  var budgetOpts = [
    { id: '<1jt',   label: '< Rp1 juta' },
    { id: '1-10jt', label: 'Rp1 - 10 juta' },
    { id: '>10jt',  label: '> Rp10 juta' }
  ];

  var expOpts = [
    { id: 'baru', label: 'Penjual baru' },
    { id: 'ada',  label: 'Sudah jualan' }
  ];

  /* ── suggestions state ──────────────────────────────────────────── */
  var sug = { query: '', open: false, activeIndex: -1, items: [] };
  var _cityBlurTimer = null;

  /* ── helpers ─────────────────────────────────────────────────────── */
  function esc(s) {
    if (adapter && typeof adapter.esc === 'function') return adapter.esc(s == null ? '' : s);
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                                      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $sel(id) { return host ? host.querySelector(id) : null; }

  /* ── persistence ────────────────────────────────────────────────── */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        city: S.city, category: S.category, budget: S.budget,
        experience: S.experience
      }));
    } catch (_) { /* private mode — cosmetic only */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          S.city       = obj.city       || '';
          S.category   = obj.category   || '';
          S.budget     = obj.budget     || '';
          S.experience = obj.experience || '';
          // Restoring never fires onSubmit.
        }
      }
    } catch (_) {}
  }

  /* ── funnel event (fires once per step) ─────────────────────────── */
  function stepFirst(step) {
    if (S._answeredSteps[step]) return;
    S._answeredSteps[step] = true;
    try { adapter.track('finder_step', { ui: opts.site, step: step }); } catch (_) {}
  }

  /* ── render ──────────────────────────────────────────────────────── */
  function buildShell() {
    host.classList.add('lfd-root');
    host.innerHTML =
      '<div class="lfd-card">' +
        /* 1 — kota */
        '<div class="lfd-step">' +
          '<div class="lfd-step-head"><span class="lfd-step-num">1</span>' +
            '<span class="lfd-step-label">Kota kamu</span></div>' +
          '<div class="lfd-city-wrap" id="lfd-city-wrap">' +
            '<input type="text" class="lfd-input" role="combobox" ' +
              'id="lfd-city-input" aria-expanded="false" ' +
              'aria-controls="lfd-city-list" aria-activedescendant="" ' +
              'autocomplete="off" ' +
              'placeholder="Mis. Jakarta, Bandung…">' +
            '<div class="lfd-suggestions" id="lfd-city-list" ' +
              'role="listbox" style="display:none;"></div>' +
          '</div>' +
        '</div>' +

        /* 2 — kategori */
        '<div class="lfd-step">' +
          '<div class="lfd-step-head"><span class="lfd-step-num">2</span>' +
            '<span class="lfd-step-label">Kategori</span></div>' +
          '<div class="lfd-pills" id="lfd-cat-pills" role="group" ' +
            'aria-label="Pilih kategori"></div>' +
        '</div>' +

        /* 3 — modal */
        '<div class="lfd-step">' +
          '<div class="lfd-step-head"><span class="lfd-step-num">3</span>' +
            '<span class="lfd-step-label">Modal</span></div>' +
          '<div class="lfd-pills" id="lfd-budget-pills" role="group" ' +
            'aria-label="Pilih budget"></div>' +
        '</div>' +

        /* 4 — pengalaman */
        '<div class="lfd-step">' +
          '<div class="lfd-step-head"><span class="lfd-step-num">4</span>' +
            '<span class="lfd-step-label">Pengalaman</span></div>' +
          '<div class="lfd-pills" id="lfd-exp-pills" role="group" ' +
            'aria-label="Pengalaman jualan"></div>' +
        '</div>' +

        '<button type="button" class="lfd-cta" id="lfd-cta" disabled>' +
          'Cari produk buat aku</button>' +
      '</div>';

    insertStaticPills();
  }

  /** Static pill groups (budget / experience) are re-built every render. */
  function insertStaticPills() {
    var b = $sel('#lfd-budget-pills');
    if (b) b.innerHTML = budgetOpts.map(function (o) {
      return '<button type="button" class="lfd-pill" data-value="' +
        esc(o.id) + '" aria-pressed="false">' + esc(o.label) + '</button>';
    }).join('');

    var e = $sel('#lfd-exp-pills');
    if (e) e.innerHTML = expOpts.map(function (o) {
      return '<button type="button" class="lfd-pill" data-value="' +
        esc(o.id) + '" aria-pressed="false">' + esc(o.label) + '</button>';
    }).join('');
  }

  /** Populate category pills from resolved list. Called after async load. */
  function renderCategories() {
    var container = $sel('#lfd-cat-pills');
    if (!container) return;
    container.innerHTML = '';

    categoriesCache.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lfd-pill';
      if (S.category === cat) btn.classList.add('lfd-pill--sel');
      btn.setAttribute('data-value', cat);
      btn.setAttribute('aria-pressed', S.category === cat ? 'true' : 'false');
      btn.textContent = esc(cat);
      container.appendChild(btn);
    });
  }

  /* ── UI sync ──────────────────────────────────────────────────────── */
  function syncUI() {
    syncPills('#lfd-budget-pills', S.budget);
    syncPills('#lfd-exp-pills',  S.experience);
    var cta = $sel('#lfd-cta');
    if (cta) cta.disabled = !(S.city && S.category);

    var inp = $sel('#lfd-city-input');
    if (inp) {
      if (inp.value !== S.city) inp.value = S.city;
      inp.setAttribute('aria-expanded', sug.open ? 'true' : 'false');
      var actId = (sug.open && sug.activeIndex >= 0 && sug.items[sug.activeIndex])
        ? 'lfd-sug-' + sug.activeIndex : '';
      inp.setAttribute('aria-activedescendant', actId);
    }
  }

  function syncPills(selector, value) {
    var cnt = $sel(selector);
    if (!cnt) return;
    Array.from(cnt.querySelectorAll('.lfd-pill')).forEach(function (b) {
      var on = b.getAttribute('data-value') === value;
      b.classList.toggle('lfd-pill--sel', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /* ── suggestion list ─────────────────────────────────────────────── */
  function renderSug() {
    var list = $sel('#lfd-city-list');
    if (!list) return;
    if (!sug.open) { list.style.display = 'none'; list.innerHTML = ''; return; }
    list.style.display = '';
    list.innerHTML = sug.items.map(function (item, i) {
      var cls = 'lfd-sug-item';
      if (i === sug.activeIndex) cls += ' lfd-sug-item--active';
      return '<div class="' + cls + '" role="option" id="lfd-sug-' + i +
        '" data-idx="' + i + '">' + esc(item) + '</div>';
    }).join('');
  }

  function handleCityInput(value) {
    sug.query = value;
    sug.activeIndex = -1;
    if (!value) { sug.open = false; sug.items = []; }
    else {
      var cities = adapter.cities ? adapter.cities() : [];
      var lo = value.toLowerCase();
      sug.items = cities.filter(function (c) {
        return c.toLowerCase().indexOf(lo) !== -1;
      }).slice(0, 8);
      sug.open = sug.items.length > 0;
    }
    renderSug();
    syncUI();
  }

  function pickCity(value) {
    S.city = value;
    stepFirst('city');
    save();
    sug.open = false; sug.items = [];
    var inp = $sel('#lfd-city-input');
    if (inp) inp.value = value;
    renderSug();
    syncUI();
    if (_cityBlurTimer) { clearTimeout(_cityBlurTimer); _cityBlurTimer = null; }
  }

  function closeSug() {
    if (!sug.open) return;
    sug.open = false; sug.items = [];
    renderSug();
    syncUI();
  }

  /* ── event handlers ───────────────────────────────────────────────── */
  function onClick(e) {
    if (!host || !host.contains(e.target)) return;

    var t = e.target;

    /* suggestion pick */
    var sugi = t.closest && t.closest('.lfd-sug-item');
    if (sugi) {
      var idx = parseInt(sugi.getAttribute('data-idx'), 10);
      if (!isNaN(idx) && sug.items[idx]) {
        pickCity(sug.items[idx]);
      } else {
        var inp = $sel('#lfd-city-input');
        pickCity(inp ? inp.value : '');
      }
      return;
    }

    /* pills */
    var pill = t.closest && t.closest('.lfd-pill');
    if (pill) {
      var val = pill.getAttribute('data-value');
      if (!val) return;
      var parent = pill.closest('[id]');
      if (parent.id === 'lfd-budget-pills') {
        S.budget = val; stepFirst('budget'); save(); syncUI();
      } else if (parent.id === 'lfd-exp-pills') {
        S.experience = val; stepFirst('experience'); save(); syncUI();
      } else if (parent.id === 'lfd-cat-pills') {
        S.category = val; stepFirst('category'); save(); syncUI();
      }
      return;
    }

    /* CTA */
    if (t.closest && t.closest('#lfd-cta')) {
      onSubmit();
    }
  }

  function onInput(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.target.id === 'lfd-city-input') {
      S.city = e.target.value;
      handleCityInput(S.city);
    }
  }

  function onKeyDown(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.target.id !== 'lfd-city-input') return;
    if (!sug.open) return;
    var len = sug.items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sug.activeIndex = (sug.activeIndex + 1) % len;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sug.activeIndex = (sug.activeIndex - 1 + len) % len;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sug.activeIndex >= 0) pickCity(sug.items[sug.activeIndex]);
      else {
        var inp = $sel('#lfd-city-input');
        pickCity(inp ? inp.value : '');
      }
      return;
    } else if (e.key === 'Escape') {
      closeSug();
      return;
    } else {
      return;
    }
    renderSug();
    syncUI();
  }

  function onCityBlur(e) {
    if (!host || !host.contains(e.target)) return;
    if (e.target.id !== 'lfd-city-input') return;
    if (_cityBlurTimer) clearTimeout(_cityBlurTimer);
    _cityBlurTimer = setTimeout(function () {
      closeSug();
      _cityBlurTimer = null;
    }, 180);
  }

  /* ── submit ───────────────────────────────────────────────────────── */
  function onSubmit() {
    if (!(S.city && S.category)) return;
    var ans = getAnswers();
    try {
      adapter.track('finder_search', {
        ui: opts.site, city: ans.city, category: ans.category,
        budget: ans.budget, experience: ans.experience
      });
    } catch (_) {}
    try { adapter.onSubmit(ans); } catch (_) {}
  }

  /* ── public API ────────────────────────────────────────────────────── */
  function getAnswers() {
    return {
      city: S.city,
      category: S.category,
      budget: S.budget,
      experience: S.experience
    };
  }

  function setAnswers(o, skipSubmit) {
    if (!o || typeof o !== 'object') return;
    if (o.city       != null) S.city       = String(o.city);
    if (o.category   != null) S.category   = String(o.category);
    if (o.budget     != null) S.budget     = String(o.budget);
    if (o.experience != null) S.experience = String(o.experience);
    save();
    // setAnswers must NOT fire onSubmit on its own — skipSubmit is implicit.
    if (skipSubmit === false) { /* noop — caller explicitly wants to trigger? */ }
    syncUI();
    renderCategories(); // re-sync pills for category
  }

  function isComplete() { return !!(S.city && S.category); }

  function reset() {
    S.city = ''; S.category = ''; S.budget = ''; S.experience = '';
    S._answeredSteps = {};
    save();
    if (host) {
      var inp = $sel('#lfd-city-input');
      if (inp) inp.value = '';
      closeSug();
    }
    syncUI();
  }

  function unmount() {
    if (host) host.innerHTML = '';
    host = null; mounted = false;
  }

  /* ── mount ─────────────────────────────────────────────────────────── */
  function mount(o) {
    o = o || {};
    opts = o;
    adapter = o.adapter || {};

    var el = global.document.getElementById(o.hostId || 'laris-finder-root');
    if (!el) return false;
    if (mounted && host === el) return true;

    host = el;

    /* restore saved answers (never auto-submit) */
    load();

    buildShell();

    /* load categories — may be async */
    categoriesCache = [];
    try {
      var cats = adapter.categories ? adapter.categories() : [];
      if (cats && typeof cats.then === 'function') {
        cats.then(function (res) {
          categoriesCache = Array.isArray(res) ? res : [];
          renderCategories();
          syncUI();
        }).catch(function () {
          categoriesCache = [];
          renderCategories();
          syncUI();
        });
      } else {
        categoriesCache = Array.isArray(cats) ? cats : [];
        renderCategories();
      }
    } catch (_) {
      categoriesCache = [];
      renderCategories();
    }

    /* bring UI into sync with loaded state */
    var inp = $sel('#lfd-city-input');
    if (inp) inp.value = S.city;
    syncUI();

    /* bind document-level listeners once */
    if (!bound) {
      global.document.addEventListener('click',   onClick,  true);
      global.document.addEventListener('input',   onInput,  true);
      global.document.addEventListener('keydown', onKeyDown, true);
      global.document.addEventListener('blur',    onCityBlur, true);
      bound = true;
    }

    mounted = true;
    return true;
  }

  /* ── export ────────────────────────────────────────────────────────── */
  global.LarisFinder = {
    mount:       mount,
    getAnswers:  getAnswers,
    setAnswers:  setAnswers,
    isComplete:  isComplete,
    reset:       reset,
    unmount:     unmount
  };

})(typeof window !== 'undefined' ? window : this);
