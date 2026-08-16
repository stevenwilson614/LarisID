/**
 * Laris Merdeka — self‑contained Independence‑Day decoration module.
 *
 * - Site A: bunting pennants, dismissable “Dirgahayu RI ke‑81” ribbon,
 *   and a small flag accent next to the logo.
 * - Site B: ribbon only (no bunting string, no logo flag, no header banner).
 * - 2026 HUT RI promo modal: Deep Dive Search unlimited 16–17 Agustus.
 * - All iconography is hand‑drawn inline SVG (no emoji, no text “×”).
 * - Date‑gated to August only, using Asia/Jakarta time (INTL, not local).
 * - Styling lives in styles/laris‑merdeka.css (everything prefixed .mdk‑).
 * - This file has no dependencies, runs as a classic IIFE, and never
 *   touches any app globals.
 */
(function (global) {
  'use strict';

  var RED = '#B5202A';
  var WHITE = '#FFFFFF';
  var LS_KEY = '_lid_mdk_v1';
  var LS_PROMO = '_lid_mdk_promo_2026';
  // Minggu 16 Agu 08:00 WIB through Selasa 18 Agu 00:00 WIB (exclusive)
  var UNLIMITED_START_MS = Date.parse('2026-08-16T01:00:00.000Z');
  var UNLIMITED_END_MS = Date.parse('2026-08-17T17:00:00.000Z');
  // Show the announcement from Sabtu 15 Agu 00:00 WIB through the window.
  var PROMO_SHOW_START_MS = Date.parse('2026-08-14T17:00:00.000Z');

  var state = {
    mounted: false,
    site: 'a',
    navEl: null,
    buntingEl: null,
    ribbonEl: null,
    flagEl: null,
    promoEl: null,
    resizeTimer: 0,
  };

  /* ── Time helpers (all WIB) ──────────────────────────────────────── */

  function getWibDate() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function wibMonth() {
    return getWibDate().substring(5, 7);
  }

  function wibDay() {
    return parseInt(getWibDate().substring(8, 10), 10);
  }

  function isAugust() {
    return wibMonth() === '08';
  }

  function isSwayDay() {
    if (!isAugust()) return false;
    var d = wibDay();
    return d >= 16 && d <= 18;
  }

  function isUnlimitedWindow() {
    var t = Date.now();
    return t >= UNLIMITED_START_MS && t < UNLIMITED_END_MS;
  }

  function isPromoShowWindow() {
    var t = Date.now();
    return t >= PROMO_SHOW_START_MS && t < UNLIMITED_END_MS;
  }

  /* ── localStorage (wrapped – safe in private mode) ──────────────── */

  function lsRead() {
    try {
      return localStorage.getItem(LS_KEY);
    } catch (e) {
      return null;
    }
  }
  function lsWrite(val) {
    try {
      localStorage.setItem(LS_KEY, val);
    } catch (e) {}
  }

  /* ── DOM helpers ────────────────────────────────────────────────── */

  // Site A's landing puts the wordmark in .lp-nav-logo; Site B uses .brand-lockup
  // inside header.main-top. Match on class rather than alt text — A writes
  // alt="Laris" and B writes alt="LARIS", and that difference has no meaning.
  function findLogo() {
    return document.querySelector(
      '.lp-nav-logo img, .dash-topbar img.brand-lockup, .main-top img.brand-lockup'
    );
  }

  function updateBuntingTop(buntingEl, navEl) {
    var top = navEl ? navEl.offsetHeight : 0;
    buntingEl.style.setProperty('--mdk-top', top + 'px');
  }

  /* ── build / destroy ────────────────────────────────────────────── */

  function insertBunting(navEl) {
    var el = document.createElement('div');
    el.className = 'mdk-bunting' + (isSwayDay() ? ' mdk-bunting--sway' : '');
    el.setAttribute('aria-hidden', 'true');
    updateBuntingTop(el, navEl);
    return el;
  }

  // Dismissal is keyed to the MONTH, not the day. Storing the day meant a user
  // who closed the ribbon on the 7th got it again on the 8th, every day of
  // August — the opposite of "dismiss once".
  function insertRibbon(insertAfterEl) {
    var thisMonth = getWibDate().substring(0, 7); // YYYY-MM
    if (lsRead() === thisMonth) return null;

    var el = document.createElement('div');
    el.className = 'mdk-ribbon';
    el.setAttribute('role', 'status');

    el.innerHTML =
      '<div class="mdk-ribbon-body">' +
        '<span class="mdk-ribbon-main">Dirgahayu Republik Indonesia ke-81</span>' +
        '<span class="mdk-ribbon-sub">' +
          (isUnlimitedWindow()
            ? 'Deep Dive Search tanpa batas sampai Senin, 17 Agustus 23.59 WIB.'
            : isPromoShowWindow()
              ? 'Minggu–Senin: Deep Dive Search tanpa batas, 16 Agu 08.00 sampai 17 Agu 23.59 WIB.'
              : 'Merdeka! Selamat berjualan, kamu.') +
        '</span>' +
      '</div>' +
      '<button type="button" class="mdk-ribbon-close" aria-label="Tutup">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>';

    el.querySelector('.mdk-ribbon-close').addEventListener('click', function (e) {
      e.stopPropagation();
      lsWrite(thisMonth);
      el.remove();
      state.ribbonEl = null;
    });

    insertAfterEl.insertAdjacentElement('afterend', el);
    return el;
  }

  function insertFlag() {
    var logoImg = findLogo();
    if (!logoImg) return null;

    var span = document.createElement('span');
    span.className = 'mdk-flag';
    span.setAttribute('aria-hidden', 'true');
    // The white half needs a hairline or it disappears entirely against the
    // white topbar — the flag would read as a lone red rectangle.
    span.innerHTML =
      '<svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">' +
        '<rect x="0.4" y="0.4" width="15.2" height="5.6" fill="' + RED + '"/>' +
        '<rect x="0.4" y="6" width="15.2" height="5.6" fill="' + WHITE + '"/>' +
        '<rect x="0.4" y="0.4" width="15.2" height="11.2" fill="none" stroke="#D8D2C6" stroke-width="0.8"/>' +
      '</svg>';

    logoImg.insertAdjacentElement('afterend', span);
    return span;
  }

  /* ── HUT RI promo modal (Deep Dive Search unlimited) ─────────── */

  function insertPromoModal() {
    if (!isPromoShowWindow()) return null;
    if (lsReadPromo()) return null;
    if (document.getElementById('mdk-promo')) return null;

    var wrap = document.createElement('div');
    wrap.id = 'mdk-promo';
    wrap.className = 'mdk-promo';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'mdk-promo-title');

    wrap.innerHTML =
      '<div class="mdk-promo-card">' +
        '<button type="button" class="mdk-promo-close" aria-label="Tutup">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
          'stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>' +
        '<div class="mdk-promo-bunting" aria-hidden="true"></div>' +
        '<img class="mdk-promo-logo" src="/images/brand/logo-horizontal-red.png" width="132" height="36" alt="Laris">' +
        '<p class="mdk-promo-kicker">Semangat</p>' +
        '<h2 id="mdk-promo-title" class="mdk-promo-title">KEMERDEKAAN!</h2>' +
        '<p class="mdk-promo-lead">Rayakan HUT RI ke-81 bersama Laris. Jelajahi peluang produk sebanyak-banyaknya.</p>' +
        '<img class="mdk-promo-mascot" src="/images/brand/mascot-merdeka.webp" width="220" height="330" alt="" decoding="async">' +
        '<div class="mdk-promo-offer">' +
          '<p class="mdk-promo-when">Mulai <strong>Minggu, 16 Agustus 08.00</strong> WIB sampai ' +
            '<strong>Senin, 17 Agustus 23.59</strong> WIB</p>' +
          '<p class="mdk-promo-badge"><span class="mdk-promo-inf">∞</span> TANPA BATAS</p>' +
          '<p class="mdk-promo-feat">Deep Dive Search <strong>unlimited</strong></p>' +
        '</div>' +
        '<p class="mdk-promo-foot">Manfaatkan momen ini untuk menemukan produk yang tepat. Setelah Senin malam, jatah 10 per hari kembali seperti biasa.</p>' +
        '<button type="button" class="mdk-promo-cta">Siap, cari produk terbaik!</button>' +
      '</div>';

    function dismiss() {
      try { localStorage.setItem(LS_PROMO, '1'); } catch (e) {}
      wrap.remove();
      state.promoEl = null;
      document.removeEventListener('keydown', onKey);
    }

    function onCta() {
      dismiss();
      var input = document.getElementById('composer-input');
      if (input) {
        try { input.focus(); } catch (e) {}
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') dismiss();
    }

    wrap.querySelector('.mdk-promo-close').addEventListener('click', dismiss);
    wrap.querySelector('.mdk-promo-cta').addEventListener('click', onCta);
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) dismiss();
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(wrap);
    return wrap;
  }

  function lsReadPromo() {
    try { return localStorage.getItem(LS_PROMO); } catch (e) { return null; }
  }

  function resetPromoDismiss() {
    try { localStorage.removeItem(LS_PROMO); } catch (e) {}
  }

  function showPromo(force) {
    if (force) resetPromoDismiss();
    if (state.promoEl && document.getElementById('mdk-promo')) return state.promoEl;
    try { state.promoEl = insertPromoModal(); } catch (e) { return null; }
    return state.promoEl;
  }

  /* ── resize handling ─────────────────────────────────────────────── */

  function onResize() {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(function () {
      if (state.buntingEl) updateBuntingTop(state.buntingEl, state.navEl);
    }, 150);
  }

  /* ── public API ──────────────────────────────────────────────────── */

  function mount(options) {
    if (!isAugust()) return false;
    if (state.mounted) return true;

    options = options || {};
    var site = options.site === 'b' ? 'b' : 'a';
    var navSelector = options.navSelector;
    var navEl = navSelector ? document.querySelector(navSelector) : null;

    state.site = site;
    state.navEl = navEl;

    var insertAnchor = null;

    // Site B: no pennant string under the header. Site A keeps the bunting.
    if (site !== 'b') {
      var bunting = insertBunting(navEl);
      state.buntingEl = bunting;
      if (navEl) {
        navEl.insertAdjacentElement('afterend', bunting);
      } else {
        document.body.insertAdjacentElement('afterbegin', bunting);
      }
      insertAnchor = bunting;
    } else if (navEl) {
      insertAnchor = navEl;
    }

    if (insertAnchor) {
      state.ribbonEl = insertRibbon(insertAnchor);
    }

    // Site B: no logo flag accent. Site A keeps it next to the wordmark.
    if (site !== 'b') {
      state.flagEl = insertFlag();
    }

    try { state.promoEl = insertPromoModal(); } catch (e) {}

    if (state.buntingEl) {
      window.addEventListener('resize', onResize);
    }

    state.mounted = true;
    return true;
  }

  function unmount() {
    if (state.buntingEl) {
      state.buntingEl.remove();
      state.buntingEl = null;
    }
    if (state.ribbonEl) {
      state.ribbonEl.remove();
      state.ribbonEl = null;
    }
    if (state.flagEl) {
      state.flagEl.remove();
      state.flagEl = null;
    }
    if (state.promoEl) {
      state.promoEl.remove();
      state.promoEl = null;
    }
    window.removeEventListener('resize', onResize);
    state.navEl = null;
    state.site = 'a';
    state.mounted = false;
  }

  function isActive() {
    return isAugust();
  }

  global.LarisMerdeka = {
    mount: mount,
    unmount: unmount,
    isActive: isActive,
    isUnlimited: isUnlimitedWindow,
    showPromo: showPromo,
    resetPromo: resetPromoDismiss,
    endsAt: function () { return new Date(UNLIMITED_END_MS); },
  };
})(typeof window !== 'undefined' ? window : this);
