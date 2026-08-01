/* LARISgpt — chat-first A/B variant B. Standalone; does not load laris-app.js. */
(function () {
'use strict';

// ── Clarity ──────────────────────────────────────────────────────────────
function _clarity() {
  const w = window;
  if (!w.clarity) w.clarity = function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
  try { w.clarity.apply(w, arguments); } catch (_) {}
}

(function _lidClarityAbAssigned() {
  try {
    const raw = sessionStorage.getItem('_lid_ab_just_assigned');
    if (!raw) return;
    sessionStorage.removeItem('_lid_ab_just_assigned');
    const info = JSON.parse(raw) || {};
    _clarity('event', 'ab_assigned');
    if (info.v) _clarity('set', 'ab_variant', String(info.v));
    if (info.via) _clarity('set', 'ab_via', String(info.via));
  } catch (_) {}
})();

// ── Anonymous page-view logging ──────────────────────────────────────────
// Port of _lidVisitorId/_lidLogPageView from js/laris-app.js:133-167. Arm B was
// invisible in public.page_views because that logger only ships in laris-app.js,
// which /gpt/ never loads — so the admin landing-view cards counted arm A only.
// p_path is location.pathname, so rows land as '/gpt/' and the arms separate in
// admin_stats. The _lid_pv_sent guard cannot collide with arm A: the A/B redirect
// runs in index.html's head, before laris-app.js loads.
function _lidVisitorId() {
  try {
    let id = localStorage.getItem('_lid_vid');
    if (!id) {
      id = (window.crypto?.randomUUID?.() || ('v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)));
      localStorage.setItem('_lid_vid', id);
    }
    return id;
  } catch (_) { return null; }
}

function _lidLogPageView() {
  try {
    if (!_supabase) return;
    // Once per tab session.
    if (sessionStorage.getItem('_lid_pv_sent')) return;
    let sid = sessionStorage.getItem('_lid_sid');
    const isNewSession = !sid;
    if (!sid) {
      sid = (window.crypto?.randomUUID?.() || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)));
      sessionStorage.setItem('_lid_sid', sid);
    }
    const vid = _lidVisitorId();
    if (!vid) return;
    const q = new URLSearchParams(location.search);
    // Stamp the arm so landing counts can be sliced per variant and direct_gpt
    // visits excluded from the cohort. Reuses the same _lid_ab_v1 read that
    // tags activity_events, so page_views and events agree on the arm.
    const ab = _lidAbStamp({});
    _supabase.rpc('log_page_view', {
      p_visitor_id: vid,
      p_session_id: sid,
      p_path: location.pathname,
      p_referrer: (document.referrer || '(direct)').slice(0, 300),
      p_utm_source: q.get('utm_source') || '',
      p_is_new_session: isNewSession,
      p_ab_variant: ab.ab_variant || null,
      p_ab_via: ab.ab_via || null,
    }).then((res) => {
      // Require ok:true from log_page_view (jsonb). Void/204-with-no-row used to
      // look like success and permanently suppress retries via _lid_pv_sent.
      if (res?.error) return;
      const body = res?.data;
      if (!(body && typeof body === 'object' && body.ok === true)) return;
      try { sessionStorage.setItem('_lid_pv_sent', '1'); } catch (_) {}
    }, () => {});
  } catch (_) {}
}

// Scroll-depth milestones (25/50/75/100%) → Clarity, mirroring
// js/laris-app.js:24516-24537 so arm B is comparable to arm A. Fires once per load.
//
// Arm A's version listens on window and measures document.documentElement, which
// would be a silent no-op here: /gpt/ is a fixed-height app shell (documentElement
// scrollHeight === innerHeight) and the scrolling happens inside #panel. So bind to
// that container and fall back to the window only if it is missing.
//
// Two caveats when comparing arms. Arm A defers through larisClarityEvent's idle
// queue while _clarity here is synchronous, so sub-second timing differs. And depth
// on a chat surface means "how far down this thread", not "how far down a marketing
// page" — the two are not the same quantity even though they share an event name.
function _lidInitScrollDepth() {
  const fired = {};
  const marks = [25, 50, 75, 100];
  let scrollTick = 0;

  function measure(el) {
    if (el) {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return 0;
      return (el.scrollTop + el.clientHeight) / el.scrollHeight * 100;
    }
    const doc = document.documentElement;
    if (!doc.scrollHeight) return 0;
    return (window.scrollY + window.innerHeight) / doc.scrollHeight * 100;
  }

  function onScroll(el) {
    return function () {
      const now = Date.now();
      if (now - scrollTick < 200) return;
      scrollTick = now;
      const scrolled = measure(el);
      marks.forEach(function (m) {
        if (!fired[m] && scrolled >= m) {
          fired[m] = true;
          _clarity('event', 'scroll_depth_' + m);
          _clarity('set', 'max_scroll', String(m));
        }
      });
    };
  }

  const panel = document.getElementById('panel');
  if (panel) panel.addEventListener('scroll', onScroll(panel), { passive: true });
  else window.addEventListener('scroll', onScroll(null), { passive: true });
}

function _lidAbStamp(metadata) {
  const m = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  if (m.ab_variant) return m;
  try {
    const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
    if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) {
      m.ab_variant = ab.v;
      if (ab.via) m.ab_via = ab.via;
    }
  } catch (_) {}
  return m;
}

const _LID_SIGNUP_EVT_KEY = '_lid_signup_evt';
const _LID_OAUTH_SIGNUP_INTENT_KEY = '_lid_oauth_signup_intent';
const _LID_SIGNUP_CTA_KEY = '_lid_signup_cta_source';
const _LID_SIGNUP_DONE_KEY = '_lid_signup_done_v1';
const GPT_STATE_KEY = '_lid_gpt_state_v1';
const ANON_LIMIT_KEY = '_lid_gpt_anon_searches_v2';
const ANON_DD_KEY = '_lid_gpt_anon_deepdive_v2'; // first product an anon user viewed free
try { localStorage.removeItem('_lid_gpt_anon_searches_v1'); } catch (_) {}
try { localStorage.removeItem('_lid_gpt_anon_deepdive_v1'); } catch (_) {} // reset stale 1-free gate
const PAGE_SIZE = 60;
const COMPOSER_EXAMPLES = [
  'Cari produk kayu dari Semarang',
  '3 produk yang cocok buat aku',
  'Produk yang lagi naik daun?',
  'Produk modal 500rb yang laris',
];
let _admSample = null; // admin sample view: { mode: 'user'|'new', label }
let _onboardingBackup = null;
let _adminUsers = [];

function _lidIsNewSignup(user) {
  if (!user) return false;
  try { if (sessionStorage.getItem(_LID_OAUTH_SIGNUP_INTENT_KEY) === '1') return true; } catch (_) {}
  const created = user.created_at;
  const lastIn = user.last_sign_in_at;
  if (created && lastIn) {
    if (created === lastIn) return true;
    const cMs = Date.parse(created);
    const lMs = Date.parse(lastIn);
    if (!Number.isNaN(cMs) && !Number.isNaN(lMs) && Math.abs(lMs - cMs) < 120000) return true;
    if (!Number.isNaN(cMs) && Date.now() - cMs < 300000) return true;
  }
  return false;
}
function _lidSignupAlreadyRecorded(userId) {
  try { return !!(JSON.parse(localStorage.getItem(_LID_SIGNUP_DONE_KEY) || '{}')[userId]); } catch (_) { return false; }
}
function _lidMarkSignupRecorded(userId) {
  try {
    const m = JSON.parse(localStorage.getItem(_LID_SIGNUP_DONE_KEY) || '{}');
    m[userId] = 1;
    localStorage.setItem(_LID_SIGNUP_DONE_KEY, JSON.stringify(m));
  } catch (_) {}
}
function _lidFireSignupSuccess() {
  try {
    if (sessionStorage.getItem(_LID_SIGNUP_EVT_KEY)) return;
    sessionStorage.setItem(_LID_SIGNUP_EVT_KEY, '1');
    sessionStorage.removeItem(_LID_OAUTH_SIGNUP_INTENT_KEY);
    _clarity('event', 'signup_success');
    _clarity('set', 'signed_up', 'true');
    const ctaSrc = sessionStorage.getItem(_LID_SIGNUP_CTA_KEY);
    if (ctaSrc) _clarity('set', 'signup_cta_source', ctaSrc);
  } catch (_) {}
}

(function _lidCaptureAttribution() {
  try {
    const KEY = '_lid_attr_v1';
    if (localStorage.getItem(KEY)) return;
    const ref = document.referrer || '';
    if (/accounts\.google\.com/.test(ref)) return;
    const q = new URLSearchParams(location.search);
    let abVariant = 'B';
    let abVia = 'random';
    try {
      const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
      if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) {
        abVariant = ab.v;
        abVia = ab.via || 'random';
      } else {
        abVia = 'direct_gpt'; // sticky not set yet — boot will stamp via=direct_gpt
      }
    } catch (_) {
      abVia = 'direct_gpt';
    }
    localStorage.setItem(KEY, JSON.stringify({
      referrer: ref || '(direct)',
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
      ref_code: q.get('ref') || '',
      landing: location.pathname + location.search,
      ab_variant: abVariant,
      ab_via: abVia,
      ts: new Date().toISOString(),
    }));
  } catch (_) {}
})();

async function larisEnsureChart() {
  if (typeof Chart !== 'undefined') return;
  if (typeof ensureChartJs === 'function') await ensureChartJs();
}

// ── Supabase ─────────────────────────────────────────────────────────────
const SUPA_URL = 'https://api.larisid.com';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';

const _AUTH_SK = 'laris_auth_v1';
let _supabase = null;
let currentUser = null;
let _authMode = 'signup';
let _gateSource = '';
let _dd = null; // current deep dive: { product, peers, niche, stats, history, series }
const _ddCache = new Map(); // key -> { peers, niche, history }
const DD_CACHE_MAX = 8;

function ddCacheKey(product) {
  const id = product?.item_id ?? '';
  const shop = product?.shop_id ?? '';
  const kind = product?._ptype ? 'pasar' : 'produk';
  const kw = product?.keyword || '';
  return `${id}|${shop}|${kind}|${kw}`;
}
function ddCacheGet(key) {
  if (!_ddCache.has(key)) return null;
  const val = _ddCache.get(key);
  // LRU: re-insert at end
  _ddCache.delete(key);
  _ddCache.set(key, val);
  return val;
}
function ddCacheSet(key, val) {
  if (_ddCache.has(key)) _ddCache.delete(key);
  _ddCache.set(key, val);
  while (_ddCache.size > DD_CACHE_MAX) {
    const first = _ddCache.keys().next().value;
    _ddCache.delete(first);
  }
}
function ddKotaLabel(product, peers) {
  if (!product?._ptype) {
    return String(product?.location || '').trim() || '—';
  }
  const locCount = new Map();
  (peers || []).forEach((p) => {
    const l = String(p.location || '').trim();
    if (l) locCount.set(l, (locCount.get(l) || 0) + 1);
  });
  const top = [...locCount.entries()].sort((a, b) => b[1] - a[1])[0];
  return (top && top[0]) || String(product?.location || '').trim() || '—';
}

function _authSave(session) {
  try {
    localStorage.setItem(_AUTH_SK, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + (session.expires_in || 3600) * 1000,
      user: session.user,
    }));
    if (typeof gtag !== 'undefined') {
      gtag('event', 'conversion', {'send_to': 'AW-862519971/XEK0CKrjqtEcEKOFpJsD'});
    }
  } catch (_) {}
}
function _authClear() { try { localStorage.removeItem(_AUTH_SK); } catch (_) {} }
function _authLoad() { try { return JSON.parse(localStorage.getItem(_AUTH_SK) || 'null'); } catch (_) { return null; } }

async function _authRefresh(refreshToken) {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.access_token) return d;
  } catch (_) {}
  return null;
}

function _decodeJwtUser(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeURIComponent(escape(atob(part))));
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: payload.email || '',
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      role: payload.role || 'authenticated',
    };
  } catch (_) { return null; }
}

function _clearOAuthReturning() {
  window.__larisOAuthReturning = false;
  try { document.documentElement.classList.remove('oauth-returning'); } catch (_) {}
}
function _clearSessionRestoring() {
  try { document.documentElement.classList.remove('session-restoring'); } catch (_) {}
}

const _funnelDedup = new Map();
function _funnelIsDup(eventType, metadata) {
  try {
    const m = metadata && typeof metadata === 'object' ? metadata : {};
    const id = m.item_id != null ? `${m.item_id}__${m.shop_id}` : JSON.stringify(m);
    const key = `${eventType}|${id}`;
    const now = Date.now();
    const last = _funnelDedup.get(key);
    _funnelDedup.set(key, now);
    return last != null && (now - last) < 2000;
  } catch (_) { return false; }
}

async function logUserEvent(eventType, metadata) {
  if (!_supabase || !currentUser || _admSample) return;
  if (_funnelIsDup(eventType, metadata)) return;
  try {
    await _supabase.from('activity_events').insert({
      user_id: currentUser.id,
      event_type: eventType,
      metadata: _lidAbStamp(metadata),
    });
  } catch (_) {}
}

function clarityEvt(name, props) {
  try {
    _clarity('event', name);
    if (props) Object.keys(props).forEach(k => _clarity('set', k, String(props[k]).slice(0, 120)));
  } catch (_) {}
}

// ── Step-parity funnel ───────────────────────────────────────────────────────
// Identical event names to arm A (js/laris-app.js) so the two arms can be
// compared step by step — only `ui` differs. Post-signup steps only:
// activity_events RLS needs a self-owned row, so landing and signup are
// measured from page_views + signup_attribution instead.
const FUNNEL_STEPS = ['first_search', 'first_dive', 'second_dive', 'return'];

function funnelStep(step, extra) {
  try {
    if (!FUNNEL_STEPS.includes(step)) return;
    const key = `_lid_funnel_${step}`;
    if (sessionStorage.getItem(key)) return; // once per session per step
    sessionStorage.setItem(key, '1');
    void logUserEvent('funnel_step', { step, ui: 'gpt', ...(extra || {}) });
    _clarity('event', `funnel_${step}`);
  } catch (_) {}
}

const FUNNEL_LAST_DAY_KEY = '_lid_funnel_last_day';
function funnelNoteActiveDay() {
  try {
    // Only advance the marker once we actually have a user: logUserEvent drops
    // events when currentUser is null, and consuming the day would then lose
    // the `return` step permanently for that day.
    if (!currentUser) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const prev = localStorage.getItem(FUNNEL_LAST_DAY_KEY);
    if (prev && prev !== today) funnelStep('return', { prev_day: prev });
    localStorage.setItem(FUNNEL_LAST_DAY_KEY, today);
  } catch (_) {}
}

// ── Wire SVG icons (no emojis, ever) ─────────────────────────────────────
const ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-2.5-1.4-4.6-3-6.5-.6 1.2-1.4 2-2.5 2.5C13.9 9 13 5.5 9.5 2c.3 3-.5 4.6-2 6.5C6 10.4 5 12.3 5 15.5 5 19.2 7.6 22 12 22z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 21h8M6 7l-3 6a3.5 3.5 0 0 0 6 0L6 7zM18 7l-3 6a3.5 3.5 0 0 0 6 0l-3-6zM4 7h16"/></svg>',
  calc: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h.01"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.6.3 4 2.2 4 4.5"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s-7-5.4-7-11a7 7 0 1 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M3 12V3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1.5 1.2-1.5 2.1h-4c0-.9-.7-1.5-1.5-2.1A6 6 0 0 1 12 3z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
};
function ico(name, size = 16) {
  const svg = ICONS[name] || ICONS.spark;
  return svg.replace('<svg ', `<svg width="${size}" height="${size}" stroke="currentColor" `);
}

// ── Year-to-date unique Laris Deep Dive viewers ─────────────────────────
const _viewCountsYtdCache = new Map();

// Below this the badge stays hidden. A product sitting at "1 orang" reads as
// nobody wants it, when it usually just means nobody has opened it on Laris yet.
const VIEW_COUNT_MIN = 5;

function viewCountKey(itemId, shopId) {
  return `${itemId ?? ''}__${shopId ?? ''}`;
}

/** Record a product view — anonymous included, deduped per viewer/product/day
 *  server-side. This is what makes the eyeball reflect real traffic rather
 *  than only signed-in deep dives. */
const _viewLogged = new Set();
function logProductView(product) {
  try {
    if (!_supabase || !product) return;
    const item_id = product.item_id != null ? String(product.item_id) : '';
    const shop_id = product.shop_id != null ? String(product.shop_id) : '';
    if (!item_id || !shop_id) return;
    const k = viewCountKey(item_id, shop_id);
    if (_viewLogged.has(k)) return;   // once per page session; DB dedupes per day
    _viewLogged.add(k);
    const vid = _lidVisitorId();
    if (!vid) return;
    _supabase.rpc('log_product_view', {
      p_item_id: item_id, p_shop_id: shop_id, p_visitor_id: vid,
    }).then(() => {}, () => {});
  } catch (_) {}
}

function viewersYtdCached(itemId, shopId) {
  const k = viewCountKey(itemId, shopId);
  return _viewCountsYtdCache.has(k) ? (_viewCountsYtdCache.get(k) || 0) : 0;
}

async function fetchProductViewCountsYtd(pairs) {
  // Anon included on purpose: the RPC is SECURITY DEFINER and returns only
  // aggregate counts (no user ids), and most Site B traffic is logged out.
  // Gating it on currentUser meant anonymous visitors saw "0" on every card.
  if (!_supabase) return _viewCountsYtdCache;
  const list = [];
  const seen = new Set();
  (pairs || []).forEach(p => {
    const item_id = p?.item_id != null ? String(p.item_id) : '';
    const shop_id = p?.shop_id != null ? String(p.shop_id) : '';
    if (!item_id || !shop_id) return;
    const k = viewCountKey(item_id, shop_id);
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ item_id, shop_id });
  });
  if (!list.length) return _viewCountsYtdCache;
  list.forEach(({ item_id, shop_id }) => {
    const k = viewCountKey(item_id, shop_id);
    if (!_viewCountsYtdCache.has(k)) _viewCountsYtdCache.set(k, 0);
  });
  try {
    const { data, error } = await _supabase.rpc('product_view_counts_ytd', { pairs: list.slice(0, 200) });
    if (error) throw error;
    (data || []).forEach(row => {
      _viewCountsYtdCache.set(viewCountKey(row.item_id, row.shop_id), Number(row.viewers) || 0);
    });
  } catch (e) {
    console.warn('[viewCountsYtd]', e?.message || e);
  }
  return _viewCountsYtdCache;
}

function patchViewCountBadges(root) {
  (root || document).querySelectorAll('[data-view-key]').forEach(el => {
    const n = _viewCountsYtdCache.get(el.getAttribute('data-view-key')) ?? 0;
    // Hidden below VIEW_COUNT_MIN — a low count is noise, not a signal.
    const hideable = el.closest('.prod-card-views, .ddr-views') || el;
    if (hideable && hideable.classList?.contains) {
      if (Number(n) >= VIEW_COUNT_MIN) hideable.removeAttribute('hidden');
      else hideable.setAttribute('hidden', '');
    }
    const num = el.querySelector('[data-view-num], [data-view-num-self]');
    if (num) num.textContent = Number(n).toLocaleString('id-ID');
    else if (el.classList.contains('ddr-tile-views-val') || el.hasAttribute('data-view-num-self')) {
      el.textContent = Number(n).toLocaleString('id-ID');
    }
  });
}

async function hydrateProdCardsIn(root) {
  // No currentUser gate: view counts are public aggregates and most Site B
  // traffic is logged out (see fetchProductViewCountsYtd).
  const scope = root || document;
  const pairs = [];
  scope.querySelectorAll('[data-prod]').forEach(btn => {
    const [item_id, shop_id] = (btn.getAttribute('data-prod') || '').split('|');
    if (item_id && shop_id) pairs.push({ item_id, shop_id });
  });
  if (!pairs.length) return;
  await fetchProductViewCountsYtd(pairs);
  patchViewCountBadges(scope);
}

// ── Composer chip sets ───────────────────────────────────────────────────
const HOME_CHIPS = [
  { id: 'trending', label: 'Produk Trending', icon: 'flame', prompt: 'Produk apa yang lagi trending minggu ini?' },
  { id: 'bandingkan', label: 'Bandingkan Produk', icon: 'scale', prompt: 'Bandingkan 2 produk' },
  { id: 'profit', label: 'Hitung Profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
  { id: 'modal500', label: 'Modal Rp500rb', icon: 'wallet', prompt: 'Cari produk modal Rp500rb' },
  { id: 'lowcomp', label: 'Kompetisi Rendah', icon: 'target', prompt: 'Produk dengan kompetisi rendah' },
];
const HOME_PROMPT_CARDS = [
  { icon: 'search', t: 'Cari produk', d: 'Temukan peluang produk yang layak dijual', q: 'Cari produk dekorasi rumah yang laris' },
  { icon: 'scale', t: 'Bandingkan produk', d: 'Bandingkan 2 produk atau lebih', q: 'Bandingkan tumbler vs botol minum' },
  { icon: 'calc', t: 'Hitung profit', d: 'Estimasi keuntungan sebelum jualan', q: 'Hitung profit jual tumbler 500ml' },
  { icon: 'trendUp', t: 'Produk yang naik', d: 'Lihat produk yang sedang naik', q: 'Produk apa yang naik minggu ini?' },
  { icon: 'target', t: 'Cari niche', d: 'Temukan niche dengan kompetisi rendah', q: 'Produk dengan kompetisi rendah' },
  { icon: 'box', t: 'Modal terbatas', d: 'Cari produk sesuai modal kamu', q: 'Cari produk modal 500 ribu' },
];
const TRENDING_CHIPS = [
  { id: 'bandingkan', label: 'Bandingkan 2 produk', icon: 'scale', prompt: 'Bandingkan 2 produk' },
  { id: 'modal', label: 'Cari produk modal < 500rb', icon: 'wallet', prompt: 'Cari produk modal Rp500rb' },
  { id: 'lowcomp', label: 'Produk dengan kompetisi rendah', icon: 'target', prompt: 'Produk dengan kompetisi rendah' },
  { id: 'profit', label: 'Hitung estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
  { id: 'rencana', label: 'Buat rencana jualan', icon: 'spark', prompt: 'Buat rencana jualan' },
];
const DD_CHIPS = [
  { id: 'bandingkan', label: 'Bandingkan dengan produk lain', icon: 'scale', prompt: 'Bandingkan dengan produk lain yang mirip' },
  { id: 'launch', label: 'Buat rencana launch', icon: 'spark', prompt: 'Buat rencana launch untuk produk ini' },
  { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
  { id: 'konten', label: 'Ide konten produk', icon: 'bulb', prompt: 'Kasih ide konten untuk produk ini' },
];

/** Category-flavored Deep Dive chips (launch + konten). Shared ids for analytics. */
const DD_CHIPS_BY_CAT = {
  'Fashion': [
    { id: 'bandingkan', label: 'Bandingkan model mirip', icon: 'scale', prompt: 'Bandingkan dengan produk fashion lain yang mirip (harga, omset, kompetisi)' },
    { id: 'launch', label: 'Rencana launch fashion', icon: 'spark', prompt: 'Buat rencana launch fashion: ukuran, foto model, dan varian warna' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide Reels try-on', icon: 'bulb', prompt: 'Kasih ide konten fashion: Reels try-on dan size chart' },
  ],
  'Kecantikan': [
    { id: 'bandingkan', label: 'Bandingkan produk mirip', icon: 'scale', prompt: 'Bandingkan dengan produk kecantikan lain yang mirip' },
    { id: 'launch', label: 'Rencana launch beauty', icon: 'spark', prompt: 'Buat rencana launch kecantikan: klaim BPOM, before-after, dan paket' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide konten beauty', icon: 'bulb', prompt: 'Kasih ide konten kecantikan: tutorial pakai dan UGC' },
  ],
  'Elektronik': [
    { id: 'bandingkan', label: 'Bandingkan spek mirip', icon: 'scale', prompt: 'Bandingkan dengan produk elektronik lain yang mirip (spek, harga, garansi)' },
    { id: 'launch', label: 'Rencana launch gadget', icon: 'spark', prompt: 'Buat rencana launch elektronik: spek vs kompetitor dan garansi' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide unboxing', icon: 'bulb', prompt: 'Kasih ide konten elektronik: unboxing dan spek singkat' },
  ],
  'HP & Gadget': [
    { id: 'bandingkan', label: 'Bandingkan spek mirip', icon: 'scale', prompt: 'Bandingkan dengan gadget lain yang mirip (spek, harga, garansi)' },
    { id: 'launch', label: 'Rencana launch gadget', icon: 'spark', prompt: 'Buat rencana launch HP & gadget: spek vs kompetitor dan garansi' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide unboxing', icon: 'bulb', prompt: 'Kasih ide konten gadget: unboxing dan spek singkat' },
  ],
  'Dapur': [
    { id: 'bandingkan', label: 'Bandingkan produk mirip', icon: 'scale', prompt: 'Bandingkan dengan produk dapur lain yang mirip' },
    { id: 'launch', label: 'Rencana launch dapur', icon: 'spark', prompt: 'Buat rencana launch dapur: isi paket dan ongkir berat' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide demo masak', icon: 'bulb', prompt: 'Kasih ide konten dapur: demo masak singkat' },
  ],
  'Bayi & Anak': [
    { id: 'bandingkan', label: 'Bandingkan produk mirip', icon: 'scale', prompt: 'Bandingkan dengan produk bayi & anak lain yang mirip' },
    { id: 'launch', label: 'Rencana launch bayi', icon: 'spark', prompt: 'Buat rencana launch bayi & anak: keamanan dan usia pakai' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide testimoni ortu', icon: 'bulb', prompt: 'Kasih ide konten bayi & anak: testimoni orang tua' },
  ],
  'Kesehatan': [
    { id: 'bandingkan', label: 'Bandingkan produk mirip', icon: 'scale', prompt: 'Bandingkan dengan produk kesehatan lain yang mirip' },
    { id: 'launch', label: 'Rencana launch sehat', icon: 'spark', prompt: 'Buat rencana launch kesehatan: klaim hati-hati dan bundle (tanpa klaim medis berlebihan)' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide edukasi singkat', icon: 'bulb', prompt: 'Kasih ide konten kesehatan: edukasi singkat non-medis' },
  ],
  'Olahraga': [
    { id: 'bandingkan', label: 'Bandingkan produk mirip', icon: 'scale', prompt: 'Bandingkan dengan produk olahraga lain yang mirip' },
    { id: 'launch', label: 'Rencana launch sport', icon: 'spark', prompt: 'Buat rencana launch olahraga: size chart dan musim' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide workout clip', icon: 'bulb', prompt: 'Kasih ide konten olahraga: clip workout singkat' },
  ],
  'Motor & Mobil': [
    { id: 'bandingkan', label: 'Bandingkan sparepart mirip', icon: 'scale', prompt: 'Bandingkan dengan sparepart motor/mobil lain yang mirip' },
    { id: 'launch', label: 'Rencana launch otomotif', icon: 'spark', prompt: 'Buat rencana launch motor & mobil: kompatibilitas tipe kendaraan' },
    { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
    { id: 'konten', label: 'Ide pasang/pakai', icon: 'bulb', prompt: 'Kasih ide konten otomotif: clip pasang atau pakai' },
  ],
};

function normalizeDdChipCat(product) {
  const raw = String(
    product?.category_canonical
    || product?._ptype?.category_canonical
    || product?.category
    || product?._ptype?.category
    || ''
  ).trim();
  if (!raw) return null;
  if (DD_CHIPS_BY_CAT[raw]) return raw;
  const lower = raw.toLowerCase();
  for (const key of Object.keys(DD_CHIPS_BY_CAT)) {
    if (key.toLowerCase() === lower) return key;
    if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) return key;
  }
  // Soft aliases from scrapes / subgroups
  if (/fashion|pakaian|baju|sepatu|tas/.test(lower)) return 'Fashion';
  if (/cantik|skincare|makeup|kosmetik/.test(lower)) return 'Kecantikan';
  if (/elektronik|lampu|kabel/.test(lower)) return 'Elektronik';
  if (/hp|gadget|aksesoris hp/.test(lower)) return 'HP & Gadget';
  if (/dapur|masak|piring/.test(lower)) return 'Dapur';
  if (/bayi|anak|balita/.test(lower)) return 'Bayi & Anak';
  if (/kesehatan|suplemen|obat/.test(lower)) return 'Kesehatan';
  if (/olahraga|sport|fitness/.test(lower)) return 'Olahraga';
  if (/motor|mobil|otomotif/.test(lower)) return 'Motor & Mobil';
  return null;
}

function ddComposerChips(product) {
  const cat = normalizeDdChipCat(product);
  const base = (cat && DD_CHIPS_BY_CAT[cat]) ? DD_CHIPS_BY_CAT[cat] : DD_CHIPS;
  const pasar = !!product?._ptype;
  if (!pasar) return base.map((c) => ({ ...c }));
  return base.map((c) => {
    let { label, prompt } = c;
    prompt = prompt
      .replace(/untuk produk ini/gi, 'untuk pasar keyword ini')
      .replace(/produk ini/gi, 'pasar keyword ini');
    if (c.id === 'bandingkan') {
      prompt = 'Bandingkan dengan listing lain di pasar keyword ini yang mirip';
      label = label.replace(/produk/gi, 'pasar').replace(/model mirip/gi, 'pasar mirip');
      if (!/pasar|listing|mirip/i.test(label)) label = 'Bandingkan di pasar ini';
    } else if (c.id === 'launch' && !/pasar keyword/i.test(prompt)) {
      prompt = prompt.replace(/^Buat rencana launch/i, 'Buat rencana launch untuk pasar keyword ini —');
    } else if (c.id === 'konten' && !/pasar keyword/i.test(prompt)) {
      prompt = `${prompt} untuk pasar keyword ini`;
    }
    return { ...c, label, prompt };
  });
}

function setComposerChips(list, surface) {
  const wrap = $('composer-chips');
  if (!wrap) return;
  if (!list || !list.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  wrap.hidden = false;
  wrap.innerHTML = list.map(c =>
    `<button type="button" class="chip" data-cchip="${esc(c.id)}" data-prompt="${esc(c.prompt)}"><span class="chip-ico">${ico(c.icon, 15)}</span>${esc(c.label)}</button>`
  ).join('');
  wrap.querySelectorAll('[data-cchip]').forEach(btn => {
    btn.addEventListener('click', () => {
      void logUserEvent('gpt_chip_click', { ui: 'gpt', chip: btn.getAttribute('data-cchip'), surface: surface || state.view });
      clarityEvt('gpt_chip_click', { chip: btn.getAttribute('data-cchip') });
      void handleComposerSubmit(btn.getAttribute('data-prompt'));
    });
  });
}

// ── Chart.js lifecycle (multiple instances per deep dive) ────────────────
const _charts = new Map();
let _ddObserver = null;
function makeChart(canvasId, cfg) {
  const el = $(canvasId);
  if (!el || typeof Chart === 'undefined') return null;
  const prev = _charts.get(canvasId);
  if (prev) { try { prev.destroy(); } catch (_) {} }
  const c = new Chart(el, cfg);
  _charts.set(canvasId, c);
  return c;
}
function destroyAllCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  _charts.clear();
  if (_ddObserver) { try { _ddObserver.disconnect(); } catch (_) {} _ddObserver = null; }
  if (_pinIO) { try { _pinIO.disconnect(); } catch (_) {} _pinIO = null; }
  _pinHeaderVisible = true;
}

// ── Pinned product bar + image lightbox ──────────────────────────────────
let _pinIO = null;            // IntersectionObserver on the deep-dive header
let _pinHeaderVisible = true; // big .ddr-header currently on screen

function updateProductPin() {
  const pin = $('product-pin');
  if (!pin) return;
  let product = null;
  if (state.view === 'chat') {
    product = activeChat()?.context?.product || null;
  } else if (state.view === 'deepdive') {
    product = state.deepdiveProduct || _dd?.product || null;
    if (_pinHeaderVisible) product = null; // big header still on screen
  }
  const tools = $('product-pin-tools');
  if (!product) {
    pin.hidden = true;
    if (tools) tools.hidden = true;
    return;
  }
  const img = $('product-pin-img');
  const ph = $('product-pin-ph');
  if (product.image_url) { img.src = product.image_url; img.hidden = false; ph.hidden = true; }
  else { img.removeAttribute('src'); img.hidden = true; ph.hidden = false; }
  const title = product.product_name || product.keyword || 'Produk';
  const price = Number(product.price);
  const priceBit = Number.isFinite(price) && price > 0 ? fmtRp(price) : '';
  $('product-pin-name').textContent = priceBit ? `${title} · ${priceBit}` : title;
  const meta = $('product-pin-meta');
  if (meta) { meta.textContent = ''; meta.hidden = true; }
  if (tools) tools.hidden = false;
  pin.hidden = false;
}

function watchDeepDiveHeaderForPin(root) {
  if (_pinIO) { try { _pinIO.disconnect(); } catch (_) {} _pinIO = null; }
  _pinHeaderVisible = true;
  const hdr = root?.querySelector?.('.ddr-header');
  if (!hdr || !('IntersectionObserver' in window)) return;
  _pinIO = new IntersectionObserver((entries) => {
    _pinHeaderVisible = entries[0] ? entries[0].isIntersecting : true;
    updateProductPin();
  }, { root: $('panel'), threshold: 0.01 });
  _pinIO.observe(hdr);
}

function openLightbox(src, caption) {
  const lb = $('img-lightbox');
  if (!lb || !src) return;
  $('img-lightbox-img').src = src;
  $('img-lightbox-cap').textContent = caption || '';
  lb.hidden = false;
}

function closeLightbox() {
  const lb = $('img-lightbox');
  if (lb) lb.hidden = true;
}

// ── Onboarding lists (mirror A) ──────────────────────────────────────────
const NU_ONB_CATS = ['Alat Tulis','Bayi & Anak','Dapur','Elektronik','Fashion','Hewan Peliharaan',
  'Hobi & Kerajinan','HP & Gadget','Kamar Mandi','Keamanan','Kecantikan','Kesehatan',
  'Motor & Mobil','Olahraga','Outdoor & Camping','Rumah','Sepeda','Taman','Tanaman'];
const CAT_SLUG = {
  'Alat Tulis':'alat-tulis','Bayi & Anak':'bayi-anak','Dapur':'dapur','Elektronik':'elektronik',
  'Fashion':'fashion','Hewan Peliharaan':'hewan-peliharaan','Hobi & Kerajinan':'hobi-kerajinan',
  'HP & Gadget':'hp-gadget','Kamar Mandi':'kamar-mandi','Keamanan':'keamanan','Kecantikan':'kecantikan',
  'Kesehatan':'kesehatan','Motor & Mobil':'motor-mobil','Olahraga':'olahraga',
  'Outdoor & Camping':'outdoor-camping','Rumah':'rumah','Sepeda':'sepeda','Taman':'taman','Tanaman':'tanaman',
};
// Line icons for directory / prefs chips (match Site A Discover look).
const CAT_CHIP_ICONS = {
  'Alat Tulis': '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>',
  'Bayi & Anak': '<circle cx="12" cy="8" r="4"/><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M9 7.5c.8-1.5 3.2-1.5 4 0"/>',
  'Dapur': '<path d="M6 10h12v2a6 6 0 0 1-12 0v-2z"/><path d="M8 10V6M12 10V5M16 10V6"/><path d="M9 18h6"/><path d="M12 16v2"/>',
  'Elektronik': '<rect x="5" y="4" width="14" height="16" rx="2"/><circle cx="12" cy="16.5" r="1"/>',
  'Fashion': '<path d="M4 8l4-4h8l4 4-3 2v10H7V10L4 8z"/><path d="M9 4c0 1.7 1.3 3 3 3s3-1.3 3-3"/>',
  'Hewan Peliharaan': '<circle cx="11" cy="15" r="4.5"/><circle cx="6.5" cy="10" r="2"/><circle cx="15.5" cy="10" r="2"/><circle cx="9" cy="7.5" r="1.6"/><circle cx="13" cy="7.5" r="1.6"/>',
  'Hobi & Kerajinan': '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
  'HP & Gadget': '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  'Kamar Mandi': '<path d="M4 14h12a4 4 0 0 0 4-4V6"/><path d="M14 6V4M18 6V3M16 14v2M9 14v5M6 14v3"/><path d="M4 6h10"/>',
  'Keamanan': '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z"/>',
  'Kecantikan': '<path d="M10 3h4v4l2 2v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V9l2-2V3z"/><path d="M10 7h4"/>',
  'Kesehatan': '<path d="M12 21s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 19 11c0 5.5-7 10-7 10z"/><path d="M8.5 12h2l1.5-3 1.5 5 1.5-2H16"/>',
  'Motor & Mobil': '<path d="M4 15l2-6h12l2 6"/><path d="M3 15h18v3a1 1 0 0 1-1 1h-1.5"/><path d="M5.5 19H4a1 1 0 0 1-1-1v-3"/><circle cx="7.5" cy="18.5" r="1.5"/><circle cx="16.5" cy="18.5" r="1.5"/>',
  'Olahraga': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/><path d="M4 9.5L9.5 4M14.5 20L20 14.5M4 14.5L9.5 20M14.5 4L20 9.5"/>',
  'Outdoor & Camping': '<path d="M3 20L12 5l9 15H3z"/><path d="M12 20v-6"/>',
  'Rumah': '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z"/><path d="M10 21v-7h4v7"/>',
  'Sepeda': '<circle cx="6.5" cy="16.5" r="3.5"/><circle cx="17.5" cy="16.5" r="3.5"/><path d="M6.5 16.5L11 8h3l3.5 8.5M11 8l-2 8.5M14 8l2 4h4"/>',
  'Taman': '<path d="M12 21V11"/><path d="M12 11c-3-4-7-4-7-1s4 4 7 1z"/><path d="M12 11c3-4 7-4 7-1s-4 4-7 1z"/>',
  'Tanaman': '<path d="M12 21v-8"/><path d="M12 13c-4-1-6-4-5-7 4 0 6 3 5 7z"/><path d="M12 13c4-1 6-4 5-7-4 0-6 3-5 7z"/><path d="M8 21h8"/>',
};
function catChipIcon(name, size = 15) {
  const paths = CAT_CHIP_ICONS[name];
  if (!paths) return '';
  return `<svg class="chip-cat-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
// Sub-groups per category. `match` = lowercase substrings tested against
// (keyword + " " + product_name) via subgroupMatches(). Clusters derived from
// the real scrape keywords in listings_deduped. First directory chip is an
// implicit "Semua {cat}" (clears the sub-filter).
const CAT_SUBGROUPS = {
  'Alat Tulis': [
    { label: 'Pulpen & Pensil', match: ['pena','pulpen','pensil','stabilo','spidol','penghapus','gel'] },
    { label: 'Buku & Catatan', match: ['buku','catatan','notebook','bookmark','penanda'] },
    { label: 'Organizer & File', match: ['tempat pensil','organizer','holder','folder','map','file','clipboard','dokumen'] },
    { label: 'Papan Tulis', match: ['papan tulis','whiteboard','magnet'] },
    { label: 'Label & Stiker', match: ['stiker','label'] },
  ],
  'Bayi & Anak': [
    { label: 'Mainan Edukasi', match: ['mainan','edukasi','edukatif','puzzle','balok','montessori','kartu'] },
    { label: 'Perlengkapan Bayi', match: ['bayi','celemek','bak mandi','popok','botol'] },
    { label: 'Furniture & Belajar', match: ['meja belajar','kursi','rak'] },
    { label: 'Penyimpanan Mainan', match: ['organizer mainan','box mainan','keranjang mainan','rak mainan'] },
    { label: 'Aksesoris Anak', match: ['aksesoris rambut','sepatu anak','baju anak'] },
  ],
  'Dapur': [
    { label: 'Pisau & Alat Potong', match: ['pisau','gunting','talenan','parut','iris','kupas','potong','pengiris'] },
    { label: 'Peralatan Masak', match: ['kompor','panci','wajan','rice cooker','blender','toaster','kettle','pemanas','grill','oven','pemasak'] },
    { label: 'Penyimpanan', match: ['toples','wadah','container','tempat','rak','kotak','box','organizer','beras','kedap'] },
    { label: 'Baking & Kue', match: ['loyang','cetakan','cookies','kue','baking','spatula'] },
    { label: 'Aksesoris Dapur', match: ['lap','penjepit','filter','saring','sendok','garpu','pembuka','celemek','bumbu'] },
  ],
  'Elektronik': [
    { label: 'Charging & Power', match: ['power bank','charger','kabel','stop kontak','adaptor','usb'] },
    { label: 'Audio', match: ['earphone','headset','speaker','tws','bluetooth'] },
    { label: 'Cahaya & Lampu', match: ['lampu','senter','led','emergency'] },
    { label: 'Kipas & Udara', match: ['kipas','humidifier','diffuser'] },
    { label: 'Komputer & HP', match: ['mouse','keyboard','flashdisk','memory'] },
  ],
  'Fashion': [
    { label: 'Tas', match: ['tas','koper','dompet','pouch'] },
    { label: 'Baju Wanita', match: ['kaos wanita','celana wanita','baju wanita','dress','rok','blouse','wanita'] },
    { label: 'Baju Pria', match: ['celana pria','kaos pria','jaket','hoodie','pria','kemeja'] },
    { label: 'Sepatu & Sandal', match: ['sepatu','sandal','sneakers'] },
    { label: 'Aksesoris', match: ['gelang','topi','kacamata','sabuk','ikat pinggang','jam tangan','kalung'] },
  ],
  'Hewan Peliharaan': [
    { label: 'Makan & Minum', match: ['tempat makan','dispenser','mangkuk','minum','pakan','botol minum'] },
    { label: 'Grooming', match: ['sisir','grooming','gunting kuku','bulu'] },
    { label: 'Kandang & Tempat Tidur', match: ['kandang','rumah','tempat tidur','tas transport','tas'] },
    { label: 'Mainan', match: ['mainan','gigitan','bola'] },
    { label: 'Pasir & Kebersihan', match: ['pasir','litter'] },
  ],
  'Hobi & Kerajinan': [
    { label: 'Jahit', match: ['jahit','jarum','benang','mesin jahit'] },
    { label: 'Board Game & Puzzle', match: ['board game','puzzle','game','kartu'] },
    { label: 'Kerajinan', match: ['kerajinan','craft','lem','manik','rajut'] },
  ],
  'HP & Gadget': [
    { label: 'Holder & Stand', match: ['holder','stand','tripod','bracket','gorillapod'] },
    { label: 'Aksesoris Laptop', match: ['laptop','cooling','mouse','alas','pendingin'] },
    { label: 'Lighting & Selfie', match: ['ring light','selfie','cermin','led'] },
  ],
  'Kamar Mandi': [
    { label: 'Sabun & Sanitasi', match: ['sabun','shower gel','antiseptik','dispenser','cuci tangan'] },
    { label: 'Perlengkapan', match: ['gayung','ember','keset','tirai shower'] },
    { label: 'Penyimpanan', match: ['tempat sikat','tempat sabun','holder','rak'] },
    { label: 'Pembersih Toilet', match: ['sikat toilet','pembersih toilet','wc'] },
  ],
  'Keamanan': [
    { label: 'CCTV & Kamera', match: ['cctv','kamera'] },
    { label: 'Kunci & Gembok', match: ['kunci','gembok','smart lock','sidik jari'] },
    { label: 'Alarm & Sensor', match: ['alarm','sensor'] },
    { label: 'Pelacak GPS', match: ['gps','tracker','pelacak'] },
  ],
  'Kecantikan': [
    { label: 'Rambut', match: ['rambut','jepit','catok','scrunchie','headband','ikat rambut'] },
    { label: 'Perawatan Wajah', match: ['wajah','facial','komedo','steamer'] },
    { label: 'Kuku', match: ['kuku','gunting kuku'] },
    { label: 'Gigi', match: ['gigi','flosser','sikat gigi elektrik'] },
    { label: 'Makeup & Organizer', match: ['makeup','organizer','kosmetik'] },
  ],
  'Kesehatan': [
    { label: 'Alat Pijat', match: ['pijat','massage'] },
    { label: 'Timbangan & Ukur', match: ['timbangan','alat ukur','termometer','tensi'] },
    { label: 'Obat & Vitamin', match: ['obat','p3k','vitamin','pill'] },
    { label: 'Bantal & Postur', match: ['bantal','sandaran','punggung','postur'] },
  ],
  'Motor & Mobil': [
    { label: 'Aksesoris Interior', match: ['holder','parfum','tempat tisu','tempat sampah','gantungan','tisu'] },
    { label: 'Pembersih & Perawatan', match: ['pembersih','poles','vacuum','gel','slime','cuci'] },
    { label: 'Ban & Pompa', match: ['ban','pompa','kompresor'] },
    { label: 'Charger & Elektronik', match: ['charger','kamera mundur','usb'] },
    { label: 'Cover & Jas Hujan', match: ['cover','jas hujan','sarung tangan','sarung'] },
  ],
  'Olahraga': [
    { label: 'Yoga & Pilates', match: ['yoga','pilates','matras','blok','strap'] },
    { label: 'Fitness & Beban', match: ['dumbbell','fitness','resistance','roller','beban','skipping'] },
    { label: 'Tas Olahraga', match: ['tas'] },
    { label: 'Botol & Handuk', match: ['botol','handuk'] },
    { label: 'Pakaian', match: ['celana','sarung tangan','baju','training'] },
  ],
  'Outdoor & Camping': [
    { label: 'Masak & Kompor', match: ['kompor','gas','masak'] },
    { label: 'Lampu & Senter', match: ['lampu','senter','headlamp'] },
    { label: 'Cooler & Pendingin', match: ['cooler','cool box','kotak es','pendingin','tas pendingin'] },
    { label: 'Matras & Tikar', match: ['matras','tikar','alas'] },
    { label: 'Tenda & Ember', match: ['tenda','ember'] },
  ],
  'Rumah': [
    { label: 'Dekorasi', match: ['dekorasi','wall decor','bunga','lukisan','stiker','kanvas','hiasan'] },
    { label: 'Tirai & Jendela', match: ['tirai','gorden','jendela'] },
    { label: 'Pembersih', match: ['pembersih','sikat','pel','sapu'] },
    { label: 'Sampah', match: ['sampah','kantong plastik'] },
    { label: 'Penyimpanan & Rak', match: ['rak','gantungan','organizer','laci'] },
  ],
  'Sepeda': [
    { label: 'Tas & Holder', match: ['tas','holder','botol'] },
    { label: 'Lampu & Bel', match: ['lampu','bel','spion'] },
    { label: 'Kunci & Pompa', match: ['kunci','pompa'] },
  ],
  'Taman': [
    { label: 'Lampu Taman', match: ['lampu','solar','tenaga surya','hias'] },
    { label: 'Penyiraman', match: ['selang','nozzle','sprayer','semprot','siram'] },
    { label: 'Alat Berkebun', match: ['gunting','sekop','cabut','gulma','sarung tangan','berkebun'] },
    { label: 'Rak & Jaring', match: ['rak','jaring','label'] },
  ],
  'Tanaman': [
    { label: 'Pot & Wadah', match: ['pot','gantung','wadah'] },
    { label: 'Penyiraman', match: ['siram','spray','semprot','penyiram','timer'] },
    { label: 'Tanaman Hias', match: ['artificial','hiasan','tanaman'] },
  ],
};
const NU_ONB_LOCATIONS = [
  'Jakarta', 'Bekasi', 'Depok', 'Tangerang', 'Bogor', 'Bandung',
  'Semarang', 'Yogyakarta', 'Surabaya', 'Sidoarjo', 'Medan',
  'Makassar', 'Palembang', 'Denpasar',
];
// Directory Provinsi step: narrows the Kota select (flow: Provinsi → Kota →
// Kategori → Tipe Produk). Keys ordered west→east like the city list.
const PROVINCE_CITIES = {
  'DKI Jakarta': ['Jakarta'],
  'Banten': ['Tangerang'],
  'Jawa Barat': ['Bekasi', 'Depok', 'Bogor', 'Bandung'],
  'Jawa Tengah': ['Semarang'],
  'DI Yogyakarta': ['Yogyakarta'],
  'Jawa Timur': ['Surabaya', 'Sidoarjo'],
  'Sumatera Utara': ['Medan'],
  'Sumatera Selatan': ['Palembang'],
  'Sulawesi Selatan': ['Makassar'],
  'Bali': ['Denpasar'],
};

// Landing finder defaults / quick chips
const FINDER_DEFAULT_CITY = 'Bandung';
const FINDER_DEFAULT_CAT = 'Olahraga';
const FINDER_CAT_CHIPS = [
  { label: 'Olahraga', cat: 'Olahraga' },
  { label: 'Rumah', cat: 'Rumah' },
  { label: 'Kecantikan', cat: 'Kecantikan' },
  { label: 'Dapur', cat: 'Dapur' },
  { label: 'Bayi', cat: 'Bayi & Anak' },
];
const FINDER_BUDGETS = [
  { id: 'lt1jt', label: '<1jt', min: 0, max: 1000000 },
  { id: '1jt_10jt', label: '1jt – 10jt', min: 1000000, max: 10000000 },
  { id: '10jt_plus', label: '10jt+', min: 10000000, max: Infinity },
];
const FINDER_XP = [
  { id: 'first_time', label: 'Penjual baru' },
  { id: 'existing', label: 'Berpengalaman' },
];
const FINDER_STATE_KEY = '_lid_gpt_finder_v1';
let _finderGeoTried = false;
let _finder = {
  city: FINDER_DEFAULT_CITY,
  category: FINDER_DEFAULT_CAT,
  budget: '1jt_10jt',
  experience: 'first_time',
};

// ── App state ────────────────────────────────────────────────────────────
const state = {
  view: 'chat',
  onboarding: {
    // idle = not started (landing is the default surface; onboarding is
    // opt-in via the sidebar "Set lokasi" card or the one-time post-sign-in
    // prompt). Mid-flow steps: city | category | experience | notes. done = finished.
    step: 'idle',
    city: '',
    categories: [],
    experience: '', // first_time | existing
    pairingMode: '', // pairing | new
    pairingCategory: '',
    notes: '',
    freeText: '', // "produk kayu" — biases recommendations
    promptedPostSignin: false, // one-time post-sign-in onboarding offer shown
    completedAnon: false,      // finished onboarding while logged out (needs retro replay)
    learnedCategories: [],     // derived from browsing behavior (see affinity)
    dismissedLearned: [],      // learned categories the user removed — never re-add
  },
  // Behavioral affinity: { [category]: { s: seconds, n: opens, t: lastTs } }.
  // 14-day rolling window; feeds learnedCategories.
  affinity: Object.create(null),
  chats: [], // { id, title, context, messages[], localId? }
  activeChatId: null,
  recommendations: [],
  deepdiveProduct: null,
  pendingDeepdive: null, // product clicked behind the login gate; opened after sign-in
  pendingCompare: null, // { a, b } clicked behind login gate; opened after sign-in
  pendingFinder: null,  // landing finder answers given before signup; re-run after
  comparePick: null, // { source } — directory is in “pick a product to compare” mode
  // Survives recommendation wipes so chat product cards can reopen Deep Dive.
  productByKey: Object.create(null),

  dirPage: 1,
  dirCat: null,
  dirSub: null,  // selected sub-group {label, match} within dirCat
  dirProv: '',   // Provinsi filter — narrows the Kota select
  dirCity: '',   // ephemeral directory filter (not persisted)
  dirSort: 'terlaris',
  dirRows: [],
  dirTypes: [],  // product-type rows currently shown in the directory
  cityFilter: '',
  searchOpen: false,
};

function loadLocalState() {
  try {
    const raw = JSON.parse(localStorage.getItem(GPT_STATE_KEY) || 'null');
    if (!raw) return;
    if (raw.onboarding) Object.assign(state.onboarding, raw.onboarding);
    // Legacy: onboarding used to auto-start pre-login. Anyone stuck mid-flow
    // resumes from the landing instead ('idle'); only 'done' is preserved.
    if (state.onboarding.step !== 'done' && state.onboarding.step !== 'idle') state.onboarding.step = 'idle';
    if (Array.isArray(raw.chats)) state.chats = raw.chats;
    if (raw.activeChatId) state.activeChatId = raw.activeChatId;
    if (raw.pendingDeepdive) state.pendingDeepdive = raw.pendingDeepdive;
    if (raw.pendingCompare) state.pendingCompare = raw.pendingCompare;
    if (raw.pendingFinder) state.pendingFinder = raw.pendingFinder;
    if (raw.affinity && typeof raw.affinity === 'object') state.affinity = raw.affinity;
    if (!Array.isArray(state.onboarding.learnedCategories)) state.onboarding.learnedCategories = [];
    if (!Array.isArray(state.onboarding.dismissedLearned)) state.onboarding.dismissedLearned = [];
  } catch (_) {}
}
function saveLocalState() {
  try {
    localStorage.setItem(GPT_STATE_KEY, JSON.stringify({
      onboarding: state.onboarding,
      chats: state.chats,
      activeChatId: state.activeChatId,
      pendingDeepdive: state.pendingDeepdive || null,
      pendingCompare: state.pendingCompare || null,
      pendingFinder: state.pendingFinder || null,
      affinity: state.affinity || {},
      ts: Date.now(),
    }));
  } catch (_) {}
}

// ── Behavioral preference learning ───────────────────────────────────────
// Time spent + opens per category over a 14-day window. Categories the user
// keeps exploring (but did not pick in onboarding) become "learned interests":
// they get a smaller recommendation bonus and appear as removable chips in the
// prefs drawer. Explicit preferences are never overwritten.
const AFFINITY_WINDOW_MS = 14 * 864e5;
const LEARN_MIN_OPENS = 3;
const LEARN_MIN_SECONDS = 300;
let _dwell = null; // { cat, start }

function dwellStart(category) {
  dwellStop();
  const cat = (category || '').trim();
  if (!cat) return;
  _dwell = { cat, start: Date.now() };
}

function dwellStop() {
  if (!_dwell) return;
  const secs = Math.round((Date.now() - _dwell.start) / 1000);
  const cat = _dwell.cat;
  _dwell = null;
  if (secs < 3 || secs > 3600) return; // ignore blips and abandoned tabs
  const a = state.affinity[cat] || { s: 0, n: 0, t: 0 };
  a.s += secs;
  a.t = Date.now();
  state.affinity[cat] = a;
  recomputeLearnedCategories();
  saveLocalState();
  void logUserEvent('gpt_dwell', { ui: 'gpt', category: cat, seconds: secs });
}

function noteCategoryOpen(category) {
  const cat = (category || '').trim();
  if (!cat) return;
  const a = state.affinity[cat] || { s: 0, n: 0, t: 0 };
  a.n += 1;
  a.t = Date.now();
  state.affinity[cat] = a;
  recomputeLearnedCategories();
  saveLocalState();
}

function pruneAffinity() {
  const cut = Date.now() - AFFINITY_WINDOW_MS;
  for (const k of Object.keys(state.affinity || {})) {
    if (!state.affinity[k] || (state.affinity[k].t || 0) < cut) delete state.affinity[k];
  }
}

function recomputeLearnedCategories() {
  pruneAffinity();
  const o = state.onboarding;
  const explicit = new Set(o.categories || []);
  const dismissed = new Set(o.dismissedLearned || []);
  const learned = Object.entries(state.affinity || {})
    .filter(([cat, a]) => !explicit.has(cat) && !dismissed.has(cat)
      && ((a.n || 0) >= LEARN_MIN_OPENS || (a.s || 0) >= LEARN_MIN_SECONDS))
    .sort((x, y) => ((y[1].s || 0) + (y[1].n || 0) * 60) - ((x[1].s || 0) + (x[1].n || 0) * 60))
    .slice(0, 3)
    .map(([cat]) => cat);
  const prev = (o.learnedCategories || []).join('|');
  o.learnedCategories = learned;
  if (prev !== learned.join('|')) {
    void logUserEvent('gpt_learned_prefs', { ui: 'gpt', learned });
  }
}

function fmtRp(n) {
  n = Number(n) || 0;
  return 'Rp ' + Math.round(n).toLocaleString('id-ID');
}
function fmtSold(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'jt';
  if (n >= 1e3) return Math.round(n / 1e3) + 'rb';
  return String(n);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
// Minimal safe markdown → HTML for AI replies. Escapes everything first, then
// only re-introduces tags we generate ourselves (no raw HTML passthrough).
function mdToHtml(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').trim();
  if (!text) return '';
  const inline = (s) => s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Links: the label and href are already escaped by esc() upstream, so only
    // http(s) can get through — no javascript: or data: URLs.
    .replace(/\[([^\]\n]+)\]\((https?:&#x2F;&#x2F;[^)\s]+|https?:\/\/[^)\s]+)\)/g,
             (_m, label, href) => `<a href="${href.replace(/&#x2F;/g, '/')}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  const out = [];
  let inFence = false;
  let fence = [];
  let list = null;   // 'ul' | 'ol' currently open
  let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const rawLine of text.split('\n')) {
    const line = esc(rawLine.trim());
    // Fenced code blocks — emitted verbatim, never inline-formatted.
    if (/^```/.test(line)) {
      if (inFence) { out.push(`<pre><code>${fence.join('\n')}</code></pre>`); fence = []; inFence = false; }
      else { flushPara(); flushList(); inFence = true; }
      continue;
    }
    if (inFence) { fence.push(esc(rawLine)); continue; }
    if (!line) { flushPara(); flushList(); continue; }
    const h  = line.match(/^#{1,4}\s+(.*)$/);
    const ul = line.match(/^[-•*]\s+(.*)$/);
    const ol = line.match(/^\d{1,2}[.)]\s+(.*)$/);
    if (h)  { flushPara(); flushList(); out.push(`<h4>${inline(h[1])}</h4>`); continue; }
    if (ul) { flushPara(); if (list !== 'ul') { flushList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    if (ol) { flushPara(); if (list !== 'ol') { flushList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    flushList(); para.push(line);
  }
  if (inFence && fence.length) out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
  flushPara(); flushList();
  return out.join('');
}
function wibMidnightReset() {
  // Next midnight Asia/Jakarta = today's WIB date at 17:00 UTC (WIB = UTC+7).
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = day.split('-').map(Number);
  const reset = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  if (reset.getTime() <= Date.now()) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}
function formatCountdown(resetAt) {
  const ms = Math.max(0, (resetAt instanceof Date ? resetAt.getTime() : Date.parse(resetAt)) - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h} jam ${m} menit`;
  return `${m} menit`;
}
function formatCountdownShort(resetAt) {
  const ms = Math.max(0, (resetAt instanceof Date ? resetAt.getTime() : Date.parse(resetAt)) - Date.now());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h} jam`;
  return `${Math.max(1, m)} mnt`;
}

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 4200);
}

// ── Daily product/search limit (3 / WIB day) ─────────────────────────────
const GPT_DAILY_LIMIT = 3;
const USAGE_RING_C = 2 * Math.PI * 15; // r=15 → ~94.2
let _gptUsage = {
  used: 0,
  limit: GPT_DAILY_LIMIT,
  resetAt: null,
  unlimited: false,
};
let _usageTicker = null;

function anonSearchDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function getAnonSearches() {
  try {
    const o = JSON.parse(localStorage.getItem(ANON_LIMIT_KEY) || '{}');
    if (o.day !== anonSearchDay()) return { day: anonSearchDay(), count: 0 };
    return o;
  } catch (_) { return { day: anonSearchDay(), count: 0 }; }
}
function bumpAnonSearch() {
  const o = getAnonSearches();
  o.count = (o.count || 0) + 1;
  o.day = anonSearchDay();
  localStorage.setItem(ANON_LIMIT_KEY, JSON.stringify(o));
  noteGptUsage({ used: o.count, limit: GPT_DAILY_LIMIT, reset_at: wibMidnightReset() });
  return o.count;
}
function anonLimitHit() {
  return getAnonSearches().count >= GPT_DAILY_LIMIT;
}

function noteGptUsage(data) {
  if (!data || typeof data !== 'object') return;
  if (data.unlimited) {
    _gptUsage.unlimited = true;
  } else if (data.unlimited === false) {
    _gptUsage.unlimited = false;
  }
  if (data.used != null) _gptUsage.used = Math.max(0, Number(data.used) || 0);
  if (data.limit != null) _gptUsage.limit = Math.max(1, Number(data.limit) || GPT_DAILY_LIMIT);
  if (data.can_spin != null) _gptUsage.canSpin = data.can_spin;
  if (data.can_claim_feedback != null) _gptUsage.canClaimFeedback = data.can_claim_feedback;
  if (data.reset_at) {
    const t = data.reset_at instanceof Date ? data.reset_at : new Date(data.reset_at);
    if (!Number.isNaN(t.getTime())) _gptUsage.resetAt = t;
  }
  if (!_gptUsage.resetAt) _gptUsage.resetAt = wibMidnightReset();
  if (isPlatformAdmin()) _gptUsage.unlimited = true;
  renderGptUsage();
  spinMaybeOffer();
}

// ── Daily spin (prize wheel) ──────────────────────────────────────────────
// Offered after the 2nd search of the day, before the wall — research found the
// limit is the LAST thing several users ever saw, so meeting them once already
// blocked is too late. The bonus is shared with arm A: spin_daily_bonus() writes
// daily_usage.bonus_dives, which raises both the dive cap and _gpt_chat_limit().
let _spinOffered = false;
const _spinPreviewAwards = [0, 1, 2, 5];
function _spinPreviewPickAward() {
  return _spinPreviewAwards[Math.floor(Math.random() * _spinPreviewAwards.length)];
}

function spinShow() {
  const api = window.LarisDailySpin;
  if (!api || typeof api.open !== 'function') return;
  api.open({
    hostId: 'daily-spin-root',
    onSpin: async () => {
      if (!_supabase) throw new Error('no_supabase');
      const { data, error } = await _supabase.rpc('spin_daily_bonus');
      if (error) throw error;
      if (data && data.allowed === false) {
        // Privileged/unlimited users still need a way to preview wheel visuals.
        if (data.reason === 'unlimited' && (_gptUsage.unlimited || isPlatformAdmin())) {
          return { allowed: true, award: _spinPreviewPickAward(), preview: true };
        }
        noteGptUsage({ can_spin: false });
      }
      return data;
    },
    onAwarded: (data) => {
      if (data?.preview) {
        void logUserEvent('spin_preview', { ui: 'gpt', award: data.award, source: 'unlimited' });
        clarityEvt('spin_preview', { award: String(data.award) });
        return;
      }
      noteGptUsage({
        can_spin: false,
        limit: (_gptUsage.limit || GPT_DAILY_LIMIT) + (Number(data.award) || 0),
      });
      void logUserEvent('spin_awarded', { ui: 'gpt', award: data.award });
      clarityEvt('spin_awarded', { award: String(data.award) });
    },
    onCta: () => {
      try {
        const input = document.getElementById('composer-input');
        input?.focus?.();
      } catch (_) {}
    },
    onClose: () => {},
  });
  const root = document.getElementById('daily-spin-root');
  if (root) root.setAttribute('aria-hidden', 'false');
  void logUserEvent('spin_shown', { ui: 'gpt', used: _gptUsage.used });
  clarityEvt('spin_shown', {});
}

function spinClose() {
  try { window.LarisDailySpin?.close?.(); } catch (_) {}
  const root = document.getElementById('daily-spin-root');
  if (root) root.setAttribute('aria-hidden', 'true');
}

function spinMaybeOffer() {
  try {
    if (_spinOffered || !currentUser || _gptUsage.unlimited) return;
    if (_gptUsage.canSpin === false) return;
    if ((_gptUsage.used || 0) !== 2) return;
    _spinOffered = true;
    setTimeout(spinShow, 900);
  } catch (_) {}
}

// gpt_new_chat returns used/limit but not the earned-bonus flags, so seed them
// once from get_my_usage — otherwise a reload at used===2 re-offers a spin the
// server will only reject as already_spun.
async function gptSeedUsageFlags() {
  if (!_supabase || !currentUser) return;
  try {
    const { data, error } = await _supabase.rpc('get_my_usage');
    if (!error && data) noteGptUsage(data);
  } catch (_) {}
}

async function spinDo() {
  try { document.getElementById('dsw-hub')?.click(); } catch (_) {}
}

// ── Journey stats parity with arm A ───────────────────────────────────────
// user_journey_stats was only ever written by the classic arm, so every arm B
// user reported deepdive_count 0 and any dashboard reading that column silently
// under-counted B to zero. Mirror arm A's journeySyncRemote() shape here.
let _gptJourney = { deepdiveCount: 0, firstDeepDiveAt: null, loaded: false };
let _gptDiveSeen = 0; // dives this session, for first_dive / second_dive steps

async function gptJourneyLoad() {
  if (_gptJourney.loaded || !_supabase || !currentUser) return;
  _gptJourney.loaded = true;
  try {
    const { data } = await _supabase.from('user_journey_stats')
      .select('deepdive_count,first_deepdive_at').eq('user_id', currentUser.id).maybeSingle();
    if (data) {
      _gptJourney.deepdiveCount = data.deepdive_count || 0;
      _gptJourney.firstDeepDiveAt = data.first_deepdive_at || null;
    }
  } catch (_) {}
}

async function gptJourneyNoteDeepDive() {
  if (!_supabase || !currentUser) return;
  await gptJourneyLoad();
  const now = new Date().toISOString();
  _gptJourney.deepdiveCount += 1;
  if (!_gptJourney.firstDeepDiveAt) _gptJourney.firstDeepDiveAt = now;
  try {
    await _supabase.from('user_journey_stats').upsert({
      user_id: currentUser.id,
      deepdive_count: _gptJourney.deepdiveCount,
      first_deepdive_at: _gptJourney.firstDeepDiveAt,
      last_discover_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' });
  } catch (_) {}
}

// ── Daily wall + feedback bonus ───────────────────────────────────────────
// Arm A has offered feedback-for-+3 since the earn-extra-dives migration; arm B
// had no feedback path at all, so A could reach a higher effective daily ceiling
// than B. That is a confound on the very metric the A/B split measures, so the
// mechanics are mirrored here. claim_feedback_bonus() is the same RPC arm A
// calls — it re-checks ownership, same WIB day and a >=10 character message, so
// the client is only the trigger, never the authority.
let _fbBonusPending = false;
let _fbBusy = false;

// Single entry point for every "you are out of searches" site, so the wall is
// instrumented and offers the same relief no matter which path hit it.
function gptLimitHit(opts = {}) {
  clarityEvt('gpt_limit_hit', opts.anon ? { anon: '1' } : {});
  void logUserEvent('gpt_limit_hit', { ui: 'gpt', ...(opts.anon ? { anon: true } : {}) });
  if (opts.anon || !currentUser) return; // anon users get the toast + sign-in path
  const sub = document.getElementById('gpt-limit-sub');
  if (sub) {
    const reset = opts.resetAt || _gptUsage.resetAt || wibMidnightReset();
    sub.textContent = `Jatah baru tersedia dalam ${formatCountdown(reset)}.`;
  }
  const fbBtn = document.getElementById('gpt-limit-feedback');
  if (fbBtn) fbBtn.style.display = _gptUsage.canClaimFeedback === false ? 'none' : '';
  document.getElementById('gpt-limit-modal')?.classList.add('open');
}

function gptLimitClose() { document.getElementById('gpt-limit-modal')?.classList.remove('open'); }

function gptOpenFeedbackForBonus() {
  _fbBonusPending = true;
  gptLimitClose();
  const msg = document.getElementById('gpt-fb-message');
  if (msg) msg.value = '';
  const st = document.getElementById('gpt-fb-status');
  if (st) { st.textContent = ''; st.style.color = ''; }
  const btn = document.getElementById('gpt-fb-submit');
  if (btn) { btn.disabled = false; btn.textContent = 'Kirim ke Steven'; }
  document.getElementById('gpt-feedback-modal')?.classList.add('open');
}

function gptFeedbackClose() {
  document.getElementById('gpt-feedback-modal')?.classList.remove('open');
  _fbBonusPending = false;
}

async function gptSubmitFeedback() {
  if (_fbBusy || !_supabase) return;
  const msg = (document.getElementById('gpt-fb-message')?.value || '').trim();
  const st = document.getElementById('gpt-fb-status');
  const btn = document.getElementById('gpt-fb-submit');
  if (msg.length < 10) {
    if (st) { st.textContent = 'Tulis minimal 10 karakter ya.'; st.style.color = '#B5202A'; }
    return;
  }
  _fbBusy = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Mengirim...'; }
  if (st) { st.textContent = ''; st.style.color = ''; }
  try {
    const record = {
      user_id:    currentUser?.id    || null,
      user_email: currentUser?.email || null,
      type:       'product',
      message:    msg,
      page:       'gpt',
    };
    const { data: inserted, error } = await _supabase
      .from('feedback').insert(record).select('id').single();
    if (error) throw error;
    const recordWithId = { ...record, id: inserted?.id };
    // fire-and-forget, same as arm A
    _supabase.functions.invoke('notify-feedback',  { body: { record: recordWithId } })
      .then(({ error }) => { if (error) console.warn('notify-feedback:', error.message); });
    _supabase.functions.invoke('analyze-feedback', { body: { record: recordWithId } })
      .then(({ error }) => { if (error) console.warn('analyze-feedback:', error.message); });
    void logUserEvent('feedback_submitted', { ui: 'gpt', from_wall: _fbBonusPending });
    // Only promise the bonus if the grant actually landed — otherwise the user
    // is told they earned searches they did not get.
    let awarded = 0;
    if (_fbBonusPending && inserted?.id) {
      _fbBonusPending = false;
      awarded = await gptClaimFeedbackBonus(inserted.id);
    }
    if (st) {
      st.textContent = awarded
        ? `Terkirim! +${awarded} pencarian buat hari ini.`
        : 'Terkirim! Steven akan baca pesanmu.';
      st.style.color = '#16A34A';
    }
    if (btn) btn.textContent = 'Terkirim';
    setTimeout(gptFeedbackClose, 1800);
  } catch (_) {
    if (st) { st.textContent = 'Gagal mengirim. Coba lagi.'; st.style.color = '#B5202A'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Kirim ke Steven'; }
  } finally {
    _fbBusy = false;
  }
}

// Returns the number of searches actually granted (0 if the grant was refused).
async function gptClaimFeedbackBonus(feedbackId) {
  if (!_supabase || !feedbackId) return 0;
  try {
    const { data, error } = await _supabase.rpc('claim_feedback_bonus', { p_feedback_id: feedbackId });
    if (error) throw error;
    if (data && data.allowed) {
      // dive_limit is arm A's cap; arm B's own limit comes back on the next
      // gpt_new_chat, so bump the local view by the award rather than guessing.
      noteGptUsage({ limit: (_gptUsage.limit || GPT_DAILY_LIMIT) + data.award });
      _gptUsage.canClaimFeedback = false;
      showToast(`Dapat +${data.award} pencarian buat hari ini!`);
      void logUserEvent('feedback_bonus_awarded', { ui: 'gpt', award: data.award });
      clarityEvt('feedback_bonus_awarded', { award: String(data.award) });
      return data.award || 0;
    }
  } catch (_) {}
  return 0;
}

function renderGptUsage() {
  const pills = document.querySelectorAll('[data-usage-pill]');
  if (!pills.length) return;
  const unlimited = !!_gptUsage.unlimited || isPlatformAdmin();
  const limit = unlimited ? GPT_DAILY_LIMIT : (_gptUsage.limit || GPT_DAILY_LIMIT);
  const used = unlimited ? 0 : Math.min(limit, Math.max(0, _gptUsage.used || 0));
  const left = unlimited ? limit : Math.max(0, limit - used);
  const resetAt = _gptUsage.resetAt || wibMidnightReset();
  const resetLabel = formatCountdown(resetAt);

  let title;
  let popTitle;
  let popSub;
  let tone;
  let numText;
  let dashOffset;

  if (unlimited) {
    numText = '∞';
    title = 'Akses tanpa batas';
    popTitle = 'Akses tanpa batas';
    popSub = 'Akun admin/leader tidak dibatasi jatah harian.';
    tone = 'inf';
    dashOffset = 0;
  } else {
    numText = String(left);
    title = `${used}/${limit} produk · reset dalam ${resetLabel}`;
    popTitle = `${used} dari ${limit} produk hari ini`;
    popSub = left > 0
      ? `${left} tersisa. Batas harian reset dalam ${resetLabel}.`
      : `Batas tercapai. Reset dalam ${resetLabel}.`;
    tone = left <= 0 ? 'bad' : left === 1 ? 'warn' : 'ok';
    const remainingFrac = limit > 0 ? left / limit : 0;
    dashOffset = USAGE_RING_C * (1 - remainingFrac);
  }

  pills.forEach(pill => {
    pill.title = title;
    const scope = pill.closest('[data-usage-wrap]') || pill;
    const wrap = pill.querySelector('.usage-ring-wrap');
    const prog = pill.querySelector('.prog');
    const numEl = pill.querySelector('.usage-ring-num');
    const popTitleEl = scope.querySelector('.usage-pop-title');
    const popSubEl = scope.querySelector('.usage-pop-sub');
    if (numEl) numEl.textContent = numText;
    if (wrap) wrap.dataset.tone = tone;
    if (prog) {
      prog.setAttribute('stroke-dasharray', String(USAGE_RING_C));
      prog.setAttribute('stroke-dashoffset', String(dashOffset));
    }
    if (popTitleEl) popTitleEl.textContent = popTitle;
    if (popSubEl) popSubEl.textContent = popSub;
  });

  if (!_usageTicker) {
    _usageTicker = setInterval(() => {
      if (_gptUsage.resetAt && _gptUsage.resetAt.getTime() <= Date.now()) {
        void refreshGptUsage();
        return;
      }
      renderGptUsage();
    }, 60000);
  }
}

function setUsagePopOpen(pill, open) {
  document.querySelectorAll('[data-usage-pill]').forEach(p => {
    p.setAttribute('aria-expanded', p === pill && open ? 'true' : 'false');
  });
  document.querySelectorAll('[data-usage-pop]').forEach(pop => {
    pop.classList.remove('is-open');
    pop.style.top = '';
    pop.style.left = '';
    pop.style.right = '';
    pop.style.bottom = '';
  });
  if (!pill || !open) return;
  const wrap = pill.closest('[data-usage-wrap]') || pill.parentElement;
  const pop = wrap?.querySelector?.('[data-usage-pop]');
  if (!pop) return;
  const r = pill.getBoundingClientRect();
  const width = Math.min(240, window.innerWidth - 32);
  let left = Math.round(r.right - width);
  left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
  const bottom = Math.round(window.innerHeight - r.top + 10);
  pop.classList.add('is-open');
  pop.style.position = 'fixed';
  pop.style.width = `${width}px`;
  pop.style.left = `${left}px`;
  pop.style.right = 'auto';
  pop.style.bottom = `${bottom}px`;
  pop.style.top = 'auto';
  pop.style.zIndex = '80';
}

function wireUsagePill() {
  document.querySelectorAll('[data-usage-pill]').forEach(pill => {
    if (pill.dataset.ready) return;
    pill.dataset.ready = '1';
    pill.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const open = pill.getAttribute('aria-expanded') === 'true';
      setUsagePopOpen(pill, !open);
    });
  });
  if (!wireUsagePill._doc) {
    wireUsagePill._doc = true;
    document.addEventListener('click', (e) => {
      if (e.target?.closest?.('[data-usage-pill], [data-usage-pop]')) return;
      setUsagePopOpen(null, false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') setUsagePopOpen(null, false);
    });
  }
}

async function refreshGptUsage() {
  const resetAt = wibMidnightReset();
  if (!currentUser || !_supabase) {
    const used = getAnonSearches().count || 0;
    noteGptUsage({ used, limit: GPT_DAILY_LIMIT, reset_at: resetAt, unlimited: false });
    return;
  }
  if (isPlatformAdmin()) {
    noteGptUsage({ used: 0, limit: GPT_DAILY_LIMIT, reset_at: resetAt, unlimited: true });
    return;
  }
  try {
    const dayStart = new Date(resetAt.getTime() - 86400000);
    const { count, error } = await _supabase
      .from('gpt_chats')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .gte('created_at', dayStart.toISOString());
    if (error) throw error;
    noteGptUsage({
      used: count || 0,
      limit: GPT_DAILY_LIMIT,
      reset_at: resetAt,
      unlimited: false,
    });
  } catch (_) {
    noteGptUsage({
      used: _gptUsage.used || 0,
      limit: GPT_DAILY_LIMIT,
      reset_at: resetAt,
      unlimited: false,
    });
  }
}

// ── Views / UI shell ─────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }


// ── Changelog ────────────────────────────────────────────────────────────
function openChangelog() {
  const modal = $('changelog-modal');
  const body = $('changelog-body');
  if (!modal || !body) return;
  const log = Array.isArray(window.LARIS_CHANGELOG) ? window.LARIS_CHANGELOG : [];
  body.innerHTML = log.length
    ? log.map(e => `<div class="cl-entry">
        <div class="cl-date">${esc(formatIdDate(e.date))}</div>
        <div class="cl-title">${esc(e.title || '')}</div>
        <ul>${(e.items || []).map(i => {
          const text = typeof i === 'string' ? i : (i && i.text) || '';
          const tech = typeof i === 'string' ? '' : (i && i.tech) || '';
          return `<li>${esc(text)}${tech ? `<span class="cl-tech">${esc(tech)}</span>` : ''}</li>`;
        }).join('')}</ul>
      </div>`).join('')
    : '<p class="dd-sub">Belum ada catatan perubahan.</p>';
  modal.hidden = false;
  modal.classList.add('open');
  void logUserEvent('changelog_open', { ui: 'gpt' });
}

function closeChangelog() {
  const modal = $('changelog-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.hidden = true;
}

function formatIdDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return String(iso || '');
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

function setView(name) {
  const leaving = state.view;
  state.view = name;
  ['home', 'chat', 'deepdive', 'directory', 'harga', 'faq', 'tentang', 'admin', 'tracker'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
    document.body.classList.toggle(`view-${v}`, v === name);
  });
  if (leaving === 'deepdive' && name !== 'deepdive') {
    dwellStop();
    destroyAllCharts();
    // A product is only "in context" while its deep dive (or its chat) is
    // open — a stale deepdiveProduct must not hijack later searches into
    // the product-AI path.
    state.deepdiveProduct = null;
  }
  // The composer has nothing to say on the tracker either — it is a
  // configuration + data surface, not a place to ask a question.
  if (name === 'home' || name === 'directory' || name === 'harga' || name === 'admin' || name === 'tracker') setComposerChips(null);
  ['btn-produk', 'btn-harga', 'btn-admin', 'btn-tracker'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('active',
      (id === 'btn-produk' && name === 'directory') ||
      (id === 'btn-harga' && name === 'harga') ||
      (id === 'btn-admin' && name === 'admin') ||
      (id === 'btn-tracker' && name === 'tracker'));
  });
  if (leaving === 'tracker' && name !== 'tracker' && window.LarisTracker) {
    try { window.LarisTracker.close(); } catch (_) {}
  }
  closeSidebar();
  updateSideRailVisibility();
  updateProductPin();
  // Fresh surface — always start at the top so populated content scrolls down.
  if (name !== leaving) scrollPanelToTop();
}

function openSidebar() {
  $('sidebar')?.classList.add('open');
  $('sidebar-backdrop')?.classList.add('open');
}
function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sidebar-backdrop')?.classList.remove('open');
}

const PLATFORM_ADMIN_EMAILS = ['stevenwilson614@gmail.com'];
let _accessState = { loaded: false, isAdmin: false };

function isPlatformAdmin() {
  const email = String(currentUser?.email || '').toLowerCase();
  return !!(currentUser && (_accessState.isAdmin || PLATFORM_ADMIN_EMAILS.includes(email)));
}

// ── "Cari Supplier" validation probe — LAUNCH GATE (arm B) ────────────────────
// !! FLIP THIS TOGETHER WITH THE SAME CONST IN js/laris-app.js (arm A) !!
// Launching one arm but not the other silently breaks the probe: it halves the
// denominator for the click-through bar AND puts a feature in one A/B arm that
// the other lacks, confounding the arm comparison. Both files carry their own
// const on purpose — they ship with ?v= cache-busters, whereas the shared
// perf-loader.js does not, so a flag there could be served stale at launch.
// Success criteria + kill bar: see the matching block in js/laris-app.js.
const SUPPLIER_PROBE_PUBLIC = false;
function supplierProbeVisible() {
  return SUPPLIER_PROBE_PUBLIC || isPlatformAdmin();
}

async function loadCurrentAccess() {
  if (!_supabase || !currentUser) {
    _accessState = { loaded: false, isAdmin: false };
    return;
  }
  const email = String(currentUser.email || '').toLowerCase();
  let isAdmin = PLATFORM_ADMIN_EMAILS.includes(email);
  try {
    const { data, error } = await _supabase.rpc('current_app_role');
    if (!error && data === 'admin') isAdmin = true;
  } catch (_) {}
  _accessState = { loaded: true, isAdmin };
  const btn = $('btn-admin');
  if (btn) btn.style.display = isAdmin ? '' : 'none';
}

function updateAccountUI() {
  const authH = $('auth-header');
  const userH = $('user-header');
  if (currentUser) {
    if (authH) authH.hidden = true;
    if (userH) userH.hidden = false;
    const name = currentUser.user_metadata?.full_name || currentUser.email || 'Akun';
    const short = name.split(' ')[0] || 'Akun';
    const un = $('user-name');
    const av = $('user-av');
    if (un) un.textContent = short;
    if (av) av.textContent = short.charAt(0).toUpperCase();
  } else {
    if (authH) authH.hidden = false;
    if (userH) userH.hidden = true;
  }
  const btn = $('btn-admin');
  if (btn) btn.style.display = isPlatformAdmin() ? '' : 'none';
  try { supplierSyncNavVisibility(); } catch (_) {}
  renderChatList();
  renderAdminSampleBanner();
  void refreshGptUsage();
}

function chatMessageSearchText(m) {
  const c = m?.content;
  if (!c) return '';
  if (typeof c === 'string') return c;
  const bits = [c.text, c.q, c.term, c.a, c.b, c.keyword];
  if (Array.isArray(c.products)) {
    for (const p of c.products) bits.push(p?.product_name, p?.keyword);
  }
  return bits.filter(Boolean).join(' ');
}

function chatContentSearchText(chat) {
  const ctx = chat.context || {};
  const bits = [
    ctx.keyword,
    ctx.q,
    ctx.product?.product_name,
    ctx.product?.keyword,
    ctx.product?.store_name,
  ];
  if (Array.isArray(ctx.peers)) {
    for (const p of ctx.peers) bits.push(p?.product_name, p?.keyword);
  }
  for (const m of (chat.messages || [])) bits.push(chatMessageSearchText(m));
  return bits.filter(Boolean).join(' ');
}

/** Higher = better. Title matches outrank content; prefix/word-start beats substring. */
function scoreChatMatch(chat, q) {
  const qq = String(q || '').trim().toLowerCase();
  if (!qq) return 0;
  const title = String(chat.title || '').toLowerCase();
  if (title) {
    if (title === qq) return 1000;
    if (title.startsWith(qq)) return 900;
    if (title.split(/[\s\-_/]+/).some(w => w.startsWith(qq))) return 850;
    if (title.includes(qq)) return 800;
  }
  const hay = chatContentSearchText(chat).toLowerCase();
  if (!hay) return 0;
  if (hay.split(/[\s\-_/]+/).some(w => w.startsWith(qq))) return 400;
  if (hay.includes(qq)) return 300;
  return 0;
}

function filteredChatsForList() {
  const q = String($('chat-search-input')?.value || '').trim();
  const chats = state.chats.slice();
  if (!q) return chats.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  return chats
    .map(c => ({ c, score: scoreChatMatch(c, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.c.created_at || 0) - (a.c.created_at || 0))
    .map(x => x.c);
}

function openChatSearch() {
  if (!currentUser) { openAuthModal('signup', 'gpt_gate_history'); return; }
  const wrap = $('chat-search');
  const input = $('chat-search-input');
  wrap?.classList.add('open');
  input?.focus();
  input?.select();
}

function closeChatSearch() {
  const wrap = $('chat-search');
  const input = $('chat-search-input');
  wrap?.classList.remove('open');
  if (input) input.value = '';
  renderChatList();
}

function renderChatList() {
  const list = $('chat-list');
  if (!list) return;
  const q = String($('chat-search-input')?.value || '').trim();
  const chats = filteredChatsForList();
  if (!state.chats.length) {
    list.innerHTML = '<div class="chat-empty">Belum ada pencarian</div>';
    return;
  }
  if (!chats.length) {
    list.innerHTML = `<div class="chat-empty">${q ? 'Tidak ketemu chat itu.' : 'Belum ada pencarian'}</div>`;
    return;
  }
  list.innerHTML = chats.map(c => {
    const id = c.id || c.localId;
    const active = id === state.activeChatId ? ' active' : '';
    return `<div class="chat-row${active}" data-chat-row="${esc(id)}">
      <button type="button" class="chat-item" data-chat="${esc(id)}">${esc(c.title || 'Chat')}</button>
      <button type="button" class="chat-rename-btn" data-rename="${esc(id)}" title="Ubah nama" aria-label="Ubah nama chat">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
      </button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-chat]').forEach(btn => {
    btn.addEventListener('click', () => openChat(btn.getAttribute('data-chat')));
  });
  list.querySelectorAll('[data-rename]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      beginChatRename(btn.getAttribute('data-rename'));
    });
  });
}

function beginChatRename(id) {
  const chat = state.chats.find(c => (c.id || c.localId) === id);
  const row = document.querySelector(`[data-chat-row="${CSS.escape(id)}"]`);
  if (!chat || !row) return;
  const prev = chat.title || 'Chat';
  row.innerHTML = `<input class="chat-rename-input" type="text" maxlength="60" value="${esc(prev)}" aria-label="Nama chat">`;
  const input = row.querySelector('input');
  if (!input) return;
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) void commitChatRename(chat, input.value);
    else renderChatList();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

async function commitChatRename(chat, title) {
  const next = String(title || '').trim().slice(0, 60) || 'Chat';
  if (next === (chat.title || 'Chat')) { renderChatList(); return; }
  chat.title = next;
  saveLocalState();
  renderChatList();
  if (chat.id && currentUser && _supabase) {
    try {
      await _supabase.from('gpt_chats').update({ title: next }).eq('id', chat.id);
    } catch (_) {}
  }
  void logUserEvent('gpt_chat_rename', { ui: 'gpt', chat_id: chat.id || chat.localId || '' });
  clarityEvt('gpt_chat_rename', {});
}

// ── Auth modal ───────────────────────────────────────────────────────────
function openAuthModal(mode, source) {
  _authMode = mode || 'signup';
  _gateSource = source || '';
  // Carry the landing answers across the signup round trip (incl. the OAuth
  // page reload) so the user lands on their products, not back at the start.
  try {
    if (!currentUser && finderIsComplete()) {
      state.pendingFinder = { ...(_finder || {}) };
      saveLocalState();
    }
  } catch (_) {}
  try { sessionStorage.setItem(_LID_SIGNUP_CTA_KEY, source || 'gpt'); } catch (_) {}
  clarityEvt('gpt_gate_shown', { source: _gateSource });
  clarityEvt('cta_signup_click', { source: _gateSource });
  renderAuthModal();
  $('auth-overlay')?.classList.add('open');
}
function closeAuthModal() {
  $('auth-overlay')?.classList.remove('open');
}
function renderAuthModal() {
  const signup = _authMode === 'signup';
  const title = $('auth-title');
  const sub = $('auth-subtitle');
  const nameWrap = $('auth-name-wrap');
  const btn = $('auth-submit-btn');
  const toggle = $('auth-toggle-text');
  if (title) title.textContent = signup ? 'Buat Akun Gratis' : 'Masuk ke LarisID';
  if (sub) {
    const map = {
      gpt_gate_deepdive: 'Kamu sudah lihat 1 analisa gratis. Daftar gratis untuk buka analisa produk lain sepuasnya.',
      gpt_gate_ai: 'Login untuk tanya AI tentang produk (butuh sesi aman).',
      gpt_gate_directory: 'Login untuk lihat lebih banyak produk & filter kategori.',
      gpt_gate_history: 'Login untuk cari & simpan riwayat chat.',
    };
    sub.textContent = map[_gateSource] || (signup ? 'Gratis. Selamanya. Tidak pernah berbayar.' : 'Login untuk lanjut riset produk.');
  }
  if (nameWrap) nameWrap.style.display = signup ? '' : 'none';
  if (btn) btn.textContent = signup ? 'Daftar dengan Email' : 'Masuk';
  if (toggle) toggle.innerHTML = signup
    ? 'Sudah punya akun? <a id="auth-toggle-link">Masuk</a>'
    : 'Belum punya akun? <a id="auth-toggle-link">Daftar</a>';
  $('auth-toggle-link')?.addEventListener('click', () => {
    _authMode = signup ? 'login' : 'signup';
    renderAuthModal();
  });
  const err = $('auth-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
}

function _authErrMsg(msg) {
  const map = {
    'Invalid login credentials': 'Email atau password salah.',
    'Email not confirmed': 'Email belum dikonfirmasi. Cek inbox kamu.',
    'User already registered': 'Email sudah terdaftar. Coba login.',
    'Password should be at least 6 characters': 'Password minimal 6 karakter.',
  };
  return map[msg] || msg;
}

async function submitAuth() {
  const errEl = $('auth-error');
  const btn = $('auth-submit-btn');
  const email = $('auth-email')?.value.trim();
  const pass = $('auth-pass')?.value;
  const name = $('auth-name')?.value.trim();
  const hdrs = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
  const showErr = msg => { if (errEl) { errEl.style.color = '#c0392b'; errEl.textContent = _authErrMsg(msg); errEl.style.display = ''; } };
  if (!email || !pass) { showErr('Email dan password wajib diisi.'); return; }
  if (pass.length < 6) { showErr('Password minimal 6 karakter.'); return; }
  btn.disabled = true;
  try {
    if (_authMode === 'signup') {
      // Auto-confirm via edge function so non-Gmail addresses can register
      // without waiting on often-undelivered confirmation emails.
      const r = await fetch(`${SUPA_URL}/functions/v1/email-signup`, {
        method: 'POST',
        headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass, full_name: name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.access_token) {
        showErr(d.error || d.msg || d.error_description || 'Daftar gagal.');
        return;
      }
      if (d.is_new_user !== false) _lidFireSignupSuccess();
      _authSave(d);
      closeAuthModal();
      await _authOnSignIn(d);
      return;
    }
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({ email, password: pass }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) { showErr(d.msg || d.error_description || d.error || 'Login gagal.'); return; }
    _authSave(d);
    closeAuthModal();
    await _authOnSignIn(d);
  } catch (_) {
    showErr('Gagal terhubung ke server. Coba lagi.');
  } finally {
    btn.disabled = false;
  }
}

async function signInWithProvider(provider) {
  if (!_supabase) return;
  try {
    if (_authMode === 'signup') sessionStorage.setItem(_LID_OAUTH_SIGNUP_INTENT_KEY, '1');
  } catch (_) {}
  const redirectTo = location.origin.includes('localhost') || location.origin.includes('127.0.0.1')
    ? `${location.origin}/gpt/`
    : 'https://larisid.com/gpt/';
  const { error } = await _supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) {
    const errEl = $('auth-error');
    if (errEl) { errEl.textContent = 'Login dengan Google gagal. Coba lagi.'; errEl.style.display = ''; }
  }
}

async function consumeOAuthHash() {
  const hash = window.__larisAuthHash || '';
  if (!hash || hash.indexOf('access_token') === -1) { window.__larisAuthHash = ''; _clearOAuthReturning(); return false; }
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  window.__larisAuthHash = '';
  if (params.get('type') === 'recovery') { _clearOAuthReturning(); return false; }
  const access_token = params.get('access_token');
  if (!access_token) { _clearOAuthReturning(); return false; }
  const refresh_token = params.get('refresh_token') || '';
  const expires_in = parseInt(params.get('expires_in') || '3600', 10);
  try {
    let user = _decodeJwtUser(access_token);
    try {
      const r = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${access_token}` } });
      if (r.ok) user = await r.json();
    } catch (_) {}
    const sess = { access_token, refresh_token, expires_in, user };
    _authSave(sess);
    await _authOnSignIn(sess);
    return true;
  } finally {
    _clearOAuthReturning();
  }
}

async function _authOnSignIn(session) {
  currentUser = session.user || _decodeJwtUser(session.access_token);
  if (!currentUser) { _clearSessionRestoring(); return; }
  if (!session.user) { session.user = currentUser; _authSave(session); }

  let isNewSignup = false;
  try {
    _clarity('identify', currentUser.id, undefined, undefined, currentUser.email || undefined);
    isNewSignup = _lidIsNewSignup(currentUser) && !_lidSignupAlreadyRecorded(currentUser.id);
    if (isNewSignup) {
      _lidMarkSignupRecorded(currentUser.id);
      _lidFireSignupSuccess();
      let attr = null;
      try { attr = JSON.parse(localStorage.getItem('_lid_attr_v1') || 'null'); } catch (_) {}
      if (!attr) attr = {};
      try {
        const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
        if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) {
          attr.ab_variant = ab.v;
          if (ab.via) attr.ab_via = ab.via;
        } else if (!attr.ab_variant) {
          attr.ab_variant = 'B';
        }
      } catch (_) {
        if (!attr.ab_variant) attr.ab_variant = 'B';
      }
      if (!attr.landing) attr.landing = '/gpt/';
      try { localStorage.setItem('_lid_attr_v1', JSON.stringify(attr)); } catch (_) {}
      const src = attr.utm_source || (attr.ref_code && 'referral') || attr.referrer || '(direct)';
      _clarity('set', 'signup_source', String(src).slice(0, 120));
      _clarity('set', 'ab_variant_at_signup', String(attr.ab_variant || 'B'));
      if (attr.ab_via) _clarity('set', 'ab_via', String(attr.ab_via));
      setTimeout(() => { void logUserEvent('signup_attribution', attr); }, 2500);
      // Funnel parity with A: stages that happened while logged out (RLS
      // blocks anon writes) are replayed once the session can write. With
      // onboarding now post-sign-in, only anon-completed onboarding (via the
      // "Set lokasi" card before signup) still needs the retro replay —
      // post-login completions write directly and must not double count.
      setTimeout(() => {
        if (state.onboarding.step === 'done' && state.onboarding.completedAnon) {
          void logUserEvent('onboarding_complete', { ui: 'gpt', retro: true, region: state.onboarding.city, categories: state.onboarding.categories, seller_status: state.onboarding.experience });
        }
        if (state.chats.length || state.recommendations.length) {
          void logUserEvent('discover_view', { ui: 'gpt', retro: true });
        }
      }, 3000);
    }
  } catch (_) {}

  try {
    if (_supabase) {
      try {
        await _supabase.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      } catch (_) {}
      const isNewUser = isNewSignup || _lidIsNewSignup(currentUser);
      _supabase.from('user_sessions').insert({ user_id: currentUser.id, is_new_user: isNewUser }).then(() => {}, () => {});
    }
  } catch (_) {}

  _clearSessionRestoring();
  updateAccountUI();
  // Return-day funnel step. MUST be called from here, not from boot(): at boot
  // the session is still restoring asynchronously, so `currentUser` is usually
  // still null and the call was skipped — arm B recorded zero `return` steps
  // while arm A (which calls this from its own _authOnSignIn) recorded them.
  // Return rate is the pre-committed A/B decision metric, so the two arms have
  // to observe it identically.
  funnelNoteActiveDay();
  await loadCurrentAccess();
  void refreshGptUsage();
  await persistOnboardingPrefs();
  await migrateLocalChatsToDb();
  saveLocalState();

  renderSidebarLocCard();

  // Continue where the login gate interrupted: open the product they clicked.
  const hadPending = !!(state.pendingDeepdive || state.pendingCompare);
  if (state.pendingCompare) {
    const pair = state.pendingCompare;
    state.pendingCompare = null;
    state.pendingDeepdive = null;
    saveLocalState();
    void openProductCompare(pair.a, pair.b);
  } else if (state.pendingDeepdive) {
    const p = state.pendingDeepdive;
    state.pendingDeepdive = null;
    saveLocalState();
    void openDeepDive(p);
  }

  // Someone who answered the landing questions and then signed up should land
  // on the products those answers produce, not back at the start.
  void loadAiMemory();

  let resumedFinder = false;
  if (!hadPending && state.pendingFinder) {
    const pf = state.pendingFinder;
    state.pendingFinder = null;
    saveLocalState();
    resumedFinder = true;
    void resumeFinderAfterSignin(pf);
  }

  // Skippable post-sign-in profile nudge — re-offered on every sign-in until
  // preferences are complete. Never interrupts a pending deep dive or a
  // resumed finder search; the "Set lokasi" sidebar card is the anytime entry.
  // finderIsComplete() matters as well as step: the questions may have been
  // answered without the CTA ever being pressed.
  if (!hadPending && !resumedFinder && state.onboarding.step !== 'done' && !finderIsComplete()) {
    state.onboarding.promptedPostSignin = true;
    saveLocalState();
    offerOnboardingAfterSignin();
  }
}

/** Re-run the landing finder search the user set up before signing in. */
async function resumeFinderAfterSignin(pf) {
  try {
    if (pf.city) _finder.city = pf.city;
    if (pf.category) _finder.category = pf.category;
    if (pf.budget) _finder.budget = pf.budget;
    if (pf.experience) _finder.experience = pf.experience;
    saveFinderState();
    syncFinderUi();
    await runFinderSearch();
  } catch (_) {}
}

async function initSupabase() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach(k => localStorage.removeItem(k));
  } catch (_) {}
  if (typeof window.supabase !== 'undefined') {
    try {
      _supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY, { auth: { detectSessionInUrl: false } });
    } catch (e) { console.error('Supabase init failed', e); }
  }
  const stored = _authLoad();
  if (stored?.access_token) {
    const tokenFresh = stored.expires_at && stored.expires_at > Date.now() + 30000;
    if (tokenFresh) {
      await _authOnSignIn(stored).catch(() => { _authClear(); _clearSessionRestoring(); });
    } else if (stored.refresh_token) {
      const s = await _authRefresh(stored.refresh_token);
      if (!s) { _authClear(); _clearSessionRestoring(); }
      else { _authSave(s); await _authOnSignIn(s).catch(() => { _authClear(); _clearSessionRestoring(); }); }
    } else {
      _authClear();
      _clearSessionRestoring();
    }
  } else {
    _clearSessionRestoring();
  }
  if (_supabase) {
    _supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.access_token && !currentUser) {
        _authSave(session);
        void _authOnSignIn(session);
      }
    });
  }
  // Log this visit (anonymous-friendly) for the admin landing-view metrics.
  _lidLogPageView();
  // Seed can_spin / can_claim_feedback once the session has actually landed.
  void gptSeedUsageFlags();
  // funnelNoteActiveDay() is NOT called here: at boot the session is still
  // restoring, so currentUser is null and the event was silently dropped.
  // It now runs from _authOnSignIn, mirroring arm A.
}

async function signOut() {
  try { if (_supabase) await _supabase.auth.signOut(); } catch (_) {}
  _authClear();
  currentUser = null;
  updateAccountUI();
  showToast('Kamu sudah keluar.');
}

// ── Persist onboarding ───────────────────────────────────────────────────
async function persistOnboardingPrefs() {
  if (!currentUser || !_supabase || _admSample) return;
  const o = state.onboarding;
  if (!o.city && !o.categories.length) return;
  const bud = o.budget ? finderBudgetCfg(o.budget) : null;
  // Seed durable memory from what onboarding already knows, so the AI starts
  // out aware of city/category/experience/modal without being told again.
  try {
    if (o.city) void rememberFact('kota', o.city, 'onboarding');
    if (o.categories?.[0]) void rememberFact('kategori', o.categories[0], 'onboarding');
    if (o.experience) void rememberFact('pengalaman', o.experience === 'existing' ? 'berpengalaman' : 'penjual baru', 'onboarding');
    if (bud) void rememberFact('modal', bud.label, 'onboarding');
  } catch (_) {}
  try {
    await _supabase.from('user_onboarding_prefs').upsert({
      user_id: currentUser.id,
      region: o.city || null,
      categories: o.categories || [],
      seller_status: o.experience || null,
      // The finder asks for modal and the columns exist — they were simply
      // never written, so the answer was collected and thrown away.
      budget_min: bud ? bud.min : null,
      budget_max: bud && Number.isFinite(bud.max) ? bud.max : null,
      completed_at: o.step === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (_) {}
}

async function migrateLocalChatsToDb() {
  if (!currentUser || !_supabase) return;
  const locals = state.chats.filter(c => c.localId && !c.id);
  for (const chat of locals) {
    try {
      const { data } = await _supabase.rpc('gpt_new_chat', {
        p_title: chat.title || 'Chat',
        p_context: chat.context || {},
      });
      if (data) noteGptUsage(data);
      if (data && data.allowed === false) break;
      if (data?.chat?.id) {
        chat.id = data.chat.id;
        delete chat.localId;
        flushChatMessages(chat);
      }
    } catch (_) {}
  }
  // Also load remote chats
  try {
    const { data: remote } = await _supabase.from('gpt_chats')
      .select('id,title,context,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(40);
    if (remote?.length) {
      const byId = new Map(state.chats.filter(c => c.id).map(c => [c.id, c]));
      for (const r of remote) {
        if (!byId.has(r.id)) {
          state.chats.push({
            id: r.id,
            title: r.title,
            context: r.context || {},
            messages: [],
            created_at: Date.parse(r.created_at) || Date.now(),
          });
        }
      }
    }
  } catch (_) {}
  saveLocalState();
  renderChatList();
}

// ── Chat / onboarding UI ─────────────────────────────────────────────────
function activeChat() {
  return state.chats.find(c => (c.id || c.localId) === state.activeChatId) || null;
}

function sameProductRef(a, b) {
  if (!a || !b || a.item_id == null || b.item_id == null) return false;
  return String(a.item_id) === String(b.item_id) && String(a.shop_id) === String(b.shop_id);
}

/** True when this chat is dedicated to the given product Deep Dive. */
function chatIsForProduct(chat, product) {
  if (!chat || !product) return false;
  if (sameProductRef(chat.context?.product, product)) return true;
  if (chat.context?.kind === 'product'
    && String(chat.context.item_id) === String(product.item_id)
    && String(chat.context.shop_id) === String(product.shop_id)) return true;
  return false;
}

/** Prefer context.product; else recover from the latest Deep Dive message in the thread. */
function resolveChatProduct(chat) {
  if (!chat) return null;
  if (chat.context?.product?.item_id != null) return asListingProduct(chat.context.product);
  if (chat.context?.kind === 'product' && chat.context.item_id != null) {
    return asListingProduct({
      item_id: chat.context.item_id,
      shop_id: chat.context.shop_id,
      keyword: chat.context.keyword || '',
      product_name: chat.title || '',
    });
  }
  const msgs = chat.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m?.role !== 'assistant' || m.content?.kind !== 'deepdive') continue;
    const snap = m.content?.products?.[0];
    if (snap?.item_id != null) return asListingProduct(snap);
    if (m.content?.item_id != null) {
      return asListingProduct({
        item_id: m.content.item_id,
        shop_id: m.content.shop_id,
        product_name: chat.title || '',
      });
    }
  }
  return null;
}

function beginFreshChat() {
  state.activeChatId = null;
  state.deepdiveProduct = null;
  saveLocalState();
  renderChatList();
}

function scrollPanelToTop() {
  const panel = $('panel');
  if (!panel) return;
  requestAnimationFrame(() => { panel.scrollTop = 0; });
}

function scrollChatToBottom() {
  const panel = $('panel');
  if (!panel) return;
  requestAnimationFrame(() => {
    panel.scrollTop = panel.scrollHeight;
  });
}

/** Pin a message (or the panel) to the top so long result grids scroll downward. */
function scrollToContentStart(el) {
  const panel = $('panel');
  if (!panel) return;
  const target = el?.closest?.('.msg') || el;
  requestAnimationFrame(() => {
    if (!target || !panel.contains(target)) {
      panel.scrollTop = 0;
      return;
    }
    panel.scrollTop = Math.max(0, target.offsetTop - 8);
  });
}

function contentLooksLikeResults(htmlOrEl) {
  if (!htmlOrEl) return false;
  if (typeof htmlOrEl === 'string') {
    return /card-grid|prod-card|ans-panel|trending-card|ans-table|deepdive-card|gpt-kalc/.test(htmlOrEl);
  }
  return !!htmlOrEl.querySelector?.(
    '.card-grid, .prod-card, .ans-panel, .trending-card, .ans-table-wrap, .gpt-kalc'
  );
}

/** After content populates: results stay at the top; short replies stay pinned to the end. */
function scrollAfterPopulate(anchor, html) {
  if (contentLooksLikeResults(html) || contentLooksLikeResults(anchor)) {
    scrollToContentStart(anchor);
  } else {
    scrollChatToBottom();
  }
}

// opts.root lets a non-chat surface (the Tanya AI side panel) reuse the whole
// bubble + streaming pipeline instead of duplicating it.
function appendBubble(role, html, opts = {}) {
  const thread = opts.root || $('chat-thread');
  if (!thread) return null;
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-role">${role === 'user' ? 'Kamu' : 'LARISgpt'}</div><div class="msg-bubble">${html}</div>`;
  thread.appendChild(div);
  if (opts.root) {
    thread.scrollTop = thread.scrollHeight;
    return div;
  }
  if (!opts.skipScroll) {
    if (role === 'assistant' && contentLooksLikeResults(html)) scrollToContentStart(div);
    else scrollChatToBottom();
  }
  return div;
}

// ── Assistant type-out (ChatGPT / Cursor style) ───────────────────────────
let _streamGen = 0;

let _streamAbort = null;   // AbortController for a live network stream

function abortAssistantStream() {
  _streamGen += 1;
  // The type-out counter alone cannot stop a real token stream.
  try { _streamAbort?.abort(); } catch (_) {}
  _streamAbort = null;
  setComposerStopping(false);
}

/** Swap the send button to a stop button while a reply is streaming. */
function setComposerStopping(on) {
  const btn = $('composer-send');
  if (!btn) return;
  btn.classList.toggle('is-stopping', !!on);
  btn.setAttribute('aria-label', on ? 'Hentikan' : 'Kirim');
  btn.innerHTML = on
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function _bubbleOf(msgOrBubble) {
  if (!msgOrBubble) return null;
  return msgOrBubble.classList?.contains('msg-bubble')
    ? msgOrBubble
    : msgOrBubble.querySelector?.('.msg-bubble') || null;
}

function _isAtomicStreamBlock(el) {
  if (!el || el.nodeType !== 1) return false;
  return el.matches?.(
    '.card-grid, .ans-panel, .gpt-kalc, .trending-card, .product-card, table, thead, tbody, tr, button, .chips, .chip, img, canvas, svg, pre, code'
  );
}

async function _typeTextNode(textNode, fullText, gen, cps, scrollFn) {
  const text = String(fullText || '');
  if (!text) return;
  let i = 0;
  let sinceScroll = 0;
  const tickScroll = typeof scrollFn === 'function' ? scrollFn : scrollChatToBottom;
  while (i < text.length) {
    if (gen !== _streamGen) return;
    // Chunk a few chars; pause a beat after sentence punctuation.
    let n = 1;
    const ch = text[i];
    if (ch === ' ' || ch === '\n') n = 1;
    else if (/[.,;:!?…]/.test(ch)) n = 1;
    else n = Math.min(5, text.length - i);
    i += n;
    textNode.textContent = text.slice(0, i);
    sinceScroll += n;
    if (sinceScroll >= 28) {
      sinceScroll = 0;
      tickScroll();
    }
    const pause = /[.]/.test(text[i - 1]) ? 1.8
      : /[,;:!?]/.test(text[i - 1]) ? 1.3
      : 1;
    await _sleep((1000 / cps) * n * pause);
  }
}

async function _streamNode(parent, srcNode, gen, cps, scrollFn) {
  if (gen !== _streamGen) return;
  if (srcNode.nodeType === Node.TEXT_NODE) {
    const tn = document.createTextNode('');
    parent.appendChild(tn);
    await _typeTextNode(tn, srcNode.textContent, gen, cps, scrollFn);
    return;
  }
  if (srcNode.nodeType !== Node.ELEMENT_NODE) return;

  if (_isAtomicStreamBlock(srcNode)) {
    const clone = srcNode.cloneNode(true);
    clone.classList.add('stream-pop');
    parent.appendChild(clone);
    // Result blocks (product grids, etc.) stay pinned to the top of the message.
    if (contentLooksLikeResults(clone.outerHTML || '')) scrollFn?.();
    else scrollChatToBottom();
    await _sleep(60);
    return;
  }

  const el = srcNode.cloneNode(false);
  parent.appendChild(el);
  for (const child of [...srcNode.childNodes]) {
    if (gen !== _streamGen) return;
    await _streamNode(el, child, gen, cps, scrollFn);
  }
}

/** Type assistant HTML into a bubble like ChatGPT/Cursor. Historical loads use instant. */
async function streamHtmlInto(bubble, html, opts = {}) {
  if (!bubble) return;
  const instant = opts.instant
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isResults = contentLooksLikeResults(html);
  const keepTop = () => scrollToContentStart(bubble);
  if (instant) {
    bubble.classList.remove('is-streaming');
    bubble.innerHTML = html;
    if (!opts.skipScroll) scrollAfterPopulate(bubble, html);
    return;
  }
  const gen = ++_streamGen;
  const cps = Math.max(40, Math.min(160, Number(opts.cps) || 100));
  bubble.classList.add('is-streaming');
  bubble.innerHTML = '';
  const source = document.createElement('div');
  source.innerHTML = html;
  // For result payloads, pin to the message start while content grows — never chase the bottom.
  const scrollFn = isResults ? keepTop : scrollChatToBottom;
  if (isResults) keepTop();
  for (const child of [...source.childNodes]) {
    if (gen !== _streamGen) break;
    await _streamNode(bubble, child, gen, cps, scrollFn);
  }
  if (gen === _streamGen) bubble.classList.remove('is-streaming');
  if (!opts.skipScroll) scrollAfterPopulate(bubble, html);
}

async function revealAssistant(msgOrBubble, html, opts = {}) {
  const bubble = _bubbleOf(msgOrBubble);
  if (!bubble) return null;
  await streamHtmlInto(bubble, html, opts);
  return bubble;
}

async function appendAssistantStream(html, opts = {}) {
  const div = appendBubble('assistant', '', opts);
  await revealAssistant(div, html, opts);
  return div;
}

function renderChatThread() {
  const thread = $('chat-thread');
  if (!thread) return;
  thread.innerHTML = '';
  const chat = activeChat();
  seedProductsFromChat(chat);
  if (chat?.messages?.length) {
    for (const m of chat.messages) {
      if (m.role === 'user') appendBubble('user', `<p>${esc(m.content?.text || m.content || '')}</p>`, { skipScroll: true });
      else if (m.html) appendBubble('assistant', m.html, { skipScroll: true });
      else appendBubble('assistant', mdToHtml(m.content?.text || m.content || '') || '<p>—</p>', { skipScroll: true });
    }
    // Re-bind cards. bindTypeCards is needed for market cards stored in older
    // threads — without it a restored pasar grid renders but does not click.
    bindProductCards(thread);
    bindTypeCards(thread);
    bindDeepDiveCards(thread);
    bindTrackerCards(thread);
    bindTrendingCards(thread);
    bindGptKalc(thread);
    updateThreadWide();
    // Product threads: land on the Deep Dive card. Search threads: top of results.
    const product = resolveChatProduct(chat);
    if (product) {
      const card = thread.querySelector(`[data-dd-card="${prodKey(product)}"]`);
      if (card) scrollToContentStart(card);
      else scrollPanelToTop();
    } else if (thread.querySelector('.card-grid, .prod-card, .ans-panel')) {
      scrollPanelToTop();
    } else {
      scrollChatToBottom();
    }
    return;
  }
  updateThreadWide();
  appendBubble('assistant', `<p>Hai! Ketik nama produk atau kategori yang mau kamu riset — atau mulai Chat Baru untuk rekomendasi baru.</p>`);
}

// ── Landing (home) ───────────────────────────────────────────────────────
let _offerActive = false; // post-sign-in onboarding offer currently on screen

function submitFromHome(text) {
  setView('chat');
  void handleComposerSubmit(text);
}

// ── Rekomendasi Steven ────────────────────────────────────────────────────
// Weekly, shared-per-city picks of products new sellers are actually succeeding
// with, from mv_city_weekly_recs. Same list for everyone in a city — that is
// what makes it "Steven's pick" rather than a personalised feed.
let _stevenRecsCity = null;

async function renderStevenRecs() {
  const sec = document.getElementById('steven-recs');
  const grid = document.getElementById('steven-recs-grid');
  if (!sec || !grid || !_supabase) return;

  // CITY_LOCATIONS keys are the canonical buckets, matching city_location_map.
  const city = _finder.city && CITY_LOCATIONS[_finder.city] ? _finder.city : null;
  if (!city) { sec.style.display = 'none'; return; }
  if (_stevenRecsCity === city && grid.children.length) { sec.style.display = ''; return; }

  try {
    const { data } = await _supabase.from('mv_city_weekly_recs')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,age_days,sold_per_day,rn,week_start')
      .eq('city', city)
      .order('rn', { ascending: true })
      .limit(20);
    const rows = data || [];
    if (!rows.length) { sec.style.display = 'none'; return; }

    const types = await typesForListings(rows.map(asListingProduct), city, 9);
    if (!types.length) { sec.style.display = 'none'; return; }

    _stevenRecsCity = city;
    const title = document.getElementById('steven-recs-title');
    const sub = document.getElementById('steven-recs-sub');
    if (title) title.textContent = `Rekomendasi Steven · ${city}`;
    if (sub) {
      sub.textContent = `${types.length} pasar yang lagi jalan buat penjual baru di ${city} — dari listing baru (di bawah 4 bulan) yang sudah tembus 100+ terjual. Daftar ini ganti tiap minggu.`;
    }
    grid.innerHTML = marketCardsHtml(types);
    bindTypeCards(grid);
    sec.style.display = '';
    void logUserEvent('steven_recs_view', { ui: 'gpt', city, count: types.length, level: 'pasar' });
    clarityEvt('steven_recs_view', { city });
  } catch (_) {
    sec.style.display = 'none';
  }
}

function renderHome() {
  _offerActive = false;
  setView('home');
  state.activeChatId = null;
  saveLocalState();
  renderChatList();
  wireHomeFinder();
  updateHomeFinderVisibility();
  if (shouldShowLandingFinder()) void renderStevenRecs();
  else {
    const steven = $('steven-recs');
    if (steven) steven.style.display = 'none';
  }

  if (!renderHome._seen) {
    renderHome._seen = true;
    void logUserEvent('gpt_landing_view', { ui: 'gpt' });
    clarityEvt('gpt_landing_view', {});
  }
}

function loadFinderState() {
  try {
    const cur = JSON.parse(localStorage.getItem(FINDER_STATE_KEY) || 'null');
    if (cur && typeof cur === 'object') {
      if (cur.city) _finder.city = cur.city;
      if (cur.category) _finder.category = cur.category;
      if (cur.budget && FINDER_BUDGETS.some(b => b.id === cur.budget)) _finder.budget = cur.budget;
      if (cur.experience) _finder.experience = cur.experience;
    }
  } catch (_) {}
  // Prefer completed onboarding prefs when present
  const o = state.onboarding || {};
  if (o.city) _finder.city = o.city;
  if (o.categories?.[0]) _finder.category = o.categories[0];
  if (o.experience) _finder.experience = o.experience;
}

function saveFinderState() {
  try { localStorage.setItem(FINDER_STATE_KEY, JSON.stringify(_finder)); } catch (_) {}
  // Promote answers into onboarding as they are given, not only when the CTA is
  // pressed. Someone who answers all four questions and then clicks Daftar was
  // otherwise left at step 'idle' and got asked the same questions again after
  // signing in — the answers survived in _lid_gpt_finder_v1 but were never
  // read across.
  syncFinderToOnboarding();
}

/** True once every finder question has an answer. */
function finderIsComplete() {
  return !!(_finder && _finder.city && _finder.category && _finder.budget && _finder.experience);
}

function syncFinderToOnboarding() {
  if (!finderIsComplete()) return;
  const o = state.onboarding;
  o.city = _finder.city;
  o.categories = [_finder.category];
  o.experience = _finder.experience;
  o.budget = _finder.budget;
  // Don't mark step 'done' here — that happens when they press Temukan
  // Produk or save prefs. Premature 'done' would hide the 4 questions on
  // Chat Baru after a single pill tap (defaults already fill all fields).
  saveLocalState();
}

/** Show the 4 landing questions until the user has completed them once. */
function shouldShowLandingFinder() {
  return state.onboarding?.step !== 'done';
}

function updateHomeFinderVisibility() {
  const show = shouldShowLandingFinder();
  document.body.classList.toggle('home-finder-done', !show);
  const finder = $('home-finder');
  if (finder) finder.hidden = !show;
  const atau = document.querySelector('#view-home .finder-atau');
  if (atau) atau.hidden = !show;
  if (!show) {
    const steven = $('steven-recs');
    if (steven) steven.style.display = 'none';
  }
}

function resolveRegionFromGeo(city, regionName) {
  const c = String(city || '').trim();
  const r = String(regionName || '').trim();
  const norm = s => s.toLowerCase();
  const hay = [c, r].filter(Boolean).map(norm);
  const match = NU_ONB_LOCATIONS.find(loc => {
    const l = norm(loc);
    return hay.some(h => h === l || h.includes(l) || l.includes(h));
  });
  if (match) return { region: match, inList: true };
  if (c || r) return { region: c || r, inList: false };
  return null;
}

async function fetchRegionFromIp() {
  try {
    const res = await fetch('https://ipwho.is/?fields=success,city,region,country_code');
    const j = await res.json();
    if (!j || j.success === false) return null;
    // Same gate as arm A: country_code was requested but never read, so foreign
    // visitors got their city written into user_onboarding_prefs.region.
    if (j.country_code && j.country_code !== 'ID') return null;
    return resolveRegionFromGeo(j.city, j.region);
  } catch (_) {
    return null;
  }
}

function finderBudgetCfg(id) {
  return FINDER_BUDGETS.find(b => b.id === id) || FINDER_BUDGETS[FINDER_BUDGETS.length - 1];
}

function syncFinderUi() {
  const citySel = $('finder-city');
  const catSel = $('finder-cat');
  // Show what the user actually typed; _finder.city holds the resolved bucket.
  if (citySel) citySel.value = _finder.cityTyped || _finder.city || FINDER_DEFAULT_CITY;
  if (catSel) catSel.value = NU_ONB_CATS.includes(_finder.category) ? _finder.category : FINDER_DEFAULT_CAT;
  document.querySelectorAll('#finder-cat-pills .finder-pill').forEach(btn => {
    btn.classList.toggle('on', btn.getAttribute('data-cat') === _finder.category);
  });
  document.querySelectorAll('#finder-budget-pills .finder-pill').forEach(btn => {
    btn.classList.toggle('on', btn.getAttribute('data-budget') === _finder.budget);
  });
  document.querySelectorAll('#finder-xp-pills .finder-pill').forEach(btn => {
    btn.classList.toggle('on', btn.getAttribute('data-xp') === _finder.experience);
  });
}

function wireHomeFinder() {
  const root = $('home-finder');
  if (!root) return;
  loadFinderState();

  // City is a typeahead now: the old <select> offered 14 options, so anyone
  // outside those had no way to say where they are.
  const cityInp = $('finder-city');
  const cityList = $('finder-city-list');
  if (cityInp && !cityInp.dataset.ready) {
    cityInp.dataset.ready = '1';
    cityInp.value = _finder.city || '';
    let hi = -1;
    const close = () => { if (cityList) { cityList.hidden = true; cityList.innerHTML = ''; } hi = -1; cityInp.setAttribute('aria-expanded', 'false'); };
    const commit = (name) => {
      const picked = String(name || cityInp.value || '').trim();
      const res = resolveNearestCityBucket(picked);
      _finder.city = res.bucket || picked || FINDER_DEFAULT_CITY;
      _finder.cityTyped = picked;
      cityInp.value = picked;
      saveFinderState();
      renderCityNote(res);
      close();
    };
    const render = () => {
      if (!cityList) return;
      const items = suggestCities(cityInp.value, 8);
      if (!items.length) { close(); return; }
      cityList.innerHTML = items.map((c, i) =>
        `<button type="button" role="option" data-city="${esc(c)}"${i === hi ? ' class="active"' : ''}>${esc(c)}</button>`).join('');
      cityList.hidden = false;
      cityInp.setAttribute('aria-expanded', 'true');
    };
    cityInp.addEventListener('input', () => { hi = -1; render(); });
    cityInp.addEventListener('focus', render);
    cityInp.addEventListener('blur', () => setTimeout(() => { commit(); }, 150));
    cityInp.addEventListener('keydown', e => {
      const opts = cityList ? [...cityList.querySelectorAll('[data-city]')] : [];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!opts.length) return;
        hi = e.key === 'ArrowDown' ? Math.min(opts.length - 1, hi + 1) : Math.max(0, hi - 1);
        opts.forEach((o, i) => o.classList.toggle('active', i === hi));
      } else if (e.key === 'Enter') {
        if (hi >= 0 && opts[hi]) { e.preventDefault(); commit(opts[hi].getAttribute('data-city')); }
      } else if (e.key === 'Escape') { close(); }
    });
    cityList?.addEventListener('mousedown', e => {
      const b = e.target.closest?.('[data-city]');
      if (b) { e.preventDefault(); commit(b.getAttribute('data-city')); }
    });
  }

  function renderCityNote(res) {
    let note = $('finder-city-note');
    if (!note) {
      const wrap = cityInp?.closest('.finder-city-wrap');
      if (!wrap) return;
      note = document.createElement('div');
      note.id = 'finder-city-note';
      note.className = 'city-note';
      wrap.appendChild(note);
    }
    // Never pass another city's data off as local.
    if (!res || res.exact || !res.bucket) { note.textContent = ''; return; }
    const km = res.distanceKm ? ` (~${Math.round(res.distanceKm)} km)` : '';
    note.textContent = `Belum ada data untuk ${res.typed} — pakai kota terdekat: ${res.bucket}${km}.`;
  }

  const catSel = $('finder-cat');
  if (catSel && !catSel.dataset.ready) {
    catSel.dataset.ready = '1';
    catSel.innerHTML = NU_ONB_CATS.map(c =>
      `<option value="${esc(c)}">${esc(c)}</option>`
    ).join('');
    catSel.addEventListener('focus', () => {
      void logUserEvent('gpt_finder_category_interaction', { ui: 'gpt', action: 'focus' });
    });
    catSel.addEventListener('click', () => {
      void logUserEvent('gpt_finder_category_interaction', { ui: 'gpt', action: 'open' });
    });
    catSel.addEventListener('change', () => {
      _finder.category = catSel.value || FINDER_DEFAULT_CAT;
      saveFinderState();
      syncFinderUi();
      void logUserEvent('gpt_finder_category_interaction', { ui: 'gpt', action: 'change', category: _finder.category });
    });
  }

  const catPills = $('finder-cat-pills');
  if (catPills && !catPills.dataset.ready) {
    catPills.dataset.ready = '1';
    catPills.innerHTML = FINDER_CAT_CHIPS.map(c =>
      `<button type="button" class="finder-pill" data-cat="${esc(c.cat)}">${esc(c.label)}</button>`
    ).join('');
    catPills.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        _finder.category = btn.getAttribute('data-cat');
        saveFinderState();
        syncFinderUi();
      });
    });
  }

  const budPills = $('finder-budget-pills');
  if (budPills && !budPills.dataset.ready) {
    budPills.dataset.ready = '1';
    budPills.innerHTML = FINDER_BUDGETS.map(b =>
      `<button type="button" class="finder-pill" data-budget="${esc(b.id)}">${esc(b.label)}</button>`
    ).join('');
    budPills.querySelectorAll('[data-budget]').forEach(btn => {
      btn.addEventListener('click', () => {
        _finder.budget = btn.getAttribute('data-budget');
        saveFinderState();
        syncFinderUi();
      });
    });
  }

  const xpPills = $('finder-xp-pills');
  if (xpPills && !xpPills.dataset.ready) {
    xpPills.dataset.ready = '1';
    xpPills.innerHTML = FINDER_XP.map(x =>
      `<button type="button" class="finder-pill" data-xp="${esc(x.id)}">${esc(x.label)}</button>`
    ).join('');
    xpPills.querySelectorAll('[data-xp]').forEach(btn => {
      btn.addEventListener('click', () => {
        _finder.experience = btn.getAttribute('data-xp');
        saveFinderState();
        syncFinderUi();
      });
    });
  }

  const go = $('finder-go');
  if (go && !go.dataset.ready) {
    go.dataset.ready = '1';
    go.addEventListener('click', () => { void runFinderSearch(); });
  }

  syncFinderUi();
  void detectFinderCityFromIp();
}

async function detectFinderCityFromIp() {
  if (_finderGeoTried) return;
  _finderGeoTried = true;
  // Don't override a city the user already saved / set via onboarding
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(FINDER_STATE_KEY) || 'null'); } catch (_) { return null; }
  })();
  if (saved?.city || state.onboarding?.city) return;
  const resolved = await fetchRegionFromIp();
  if (!resolved?.region) {
    _finder.city = FINDER_DEFAULT_CITY;
    syncFinderUi();
    return;
  }
  _finder.city = resolved.inList ? resolved.region : FINDER_DEFAULT_CITY;
  saveFinderState();
  syncFinderUi();
}

function priceInBudget(p, bud) {
  const price = Number(p.price) || 0;
  if (!(price > 0)) return false;
  if (bud.max != null && Number.isFinite(bud.max) && price > bud.max) return false;
  if (bud.min != null && price < bud.min) return false;
  return true;
}

async function collectFinderProducts({ city, category, budgetId, limit = 60 }) {
  const locs = expandCityLocations(city);
  const cats = category ? [category] : [];
  const bud = finderBudgetCfg(budgetId);
  let pool = [];

  // Prefer rising products in city+cat, then city listings, then cat-only, then global.
  if (locs.length && cats.length) {
    mergePool(pool, await fetchNaikDaunCityCat(locs, cats, 120));
    mergePool(pool, await fetchListingsCityCat(locs, cats, 120));
  }
  let matched = pool.filter(p => priceInBudget(p, bud));
  if (matched.length < limit && cats.length) {
    mergePool(pool, await fetchNaikDaunByCat(cats, 200));
    matched = pool.filter(p => priceInBudget(p, bud));
  }
  if (matched.length < limit && locs.length) {
    mergePool(pool, await fetchListingsCityCat(locs, [], 120));
    matched = pool.filter(p => priceInBudget(p, bud));
  }
  // Broaden: drop budget, keep city+cat
  if (matched.length < limit) {
    matched = pool.slice();
  }
  // Broaden: category anywhere
  if (matched.length < limit && cats.length) {
    mergePool(pool, await fetchNaikDaunByCat(cats, 200));
    matched = pool.slice();
  }
  // Broaden: global rising
  if (matched.length < limit) {
    mergePool(pool, await fetchNaikDaunGlobal(200));
    matched = pool.slice();
  }
  // Prefer budget matches first, then fill with near-misses
  const inBand = [];
  const near = [];
  for (const p of matched) {
    (priceInBudget(p, bud) ? inBand : near).push(p);
  }
  return mergePool([], inBand.concat(near)).slice(0, limit);
}

async function runFinderSearch() {
  const go = $('finder-go');
  if (go) go.disabled = true;
  try {
    // Landing finder is the primary CTA — never wall it behind the anon daily
    // search cap. Free-text searches still use ensureSearchAllowed().

    // Persist into onboarding so directory / recs stay aligned
    state.onboarding.city = _finder.city;
    state.onboarding.categories = [_finder.category];
    state.onboarding.experience = _finder.experience;
    state.onboarding.step = 'done';
    state.onboarding.completedAnon = !currentUser;
    saveLocalState();
    saveFinderState();
    syncDirectoryFromOnboarding();
    renderSidebarLocCard();

    const bud = finderBudgetCfg(_finder.budget);
    const label = [
      _finder.city,
      _finder.category,
      bud.label,
      _finder.experience === 'existing' ? 'berpengalaman' : 'penjual baru',
    ].join(' · ');

    setView('chat');
    // Finder answers are onboarding context, not durable chat history.
    beginFreshChat();
    const thread = $('chat-thread');
    if (thread) thread.innerHTML = '';
    appendBubble('user', `<p>Temukan produk: ${esc(label)}</p>`);
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk yang cocok…</p>`);

    const rows = await collectFinderProducts({
      city: _finder.city,
      category: _finder.category,
      budgetId: _finder.budget,
      limit: 60,
    });
    const products = rows.map(asListingProduct);
    const types = await typesForListings(products, _finder.city || '', 12);
    state.recommendations = [];

    const html = types.length
      ? `<p>${types.length} pasar untuk <strong>${esc(_finder.category)}</strong> di sekitar <strong>${esc(_finder.city)}</strong> (modal ${esc(bud.label)}). Klik kartu untuk Deep Dive pasar.</p>
         <div class="card-grid">${marketCardsHtml(types)}</div>`
      : `<p>Belum ketemu pasar yang cocok. Coba ganti kategori atau kota, atau ketik pencarian di bawah.</p>`;
    await revealAssistant(loading, html, { instant: true });
    bindTypeCards($('chat-thread'));
    scrollPanelToTop();
    void logUserEvent('gpt_finder_search', {
      ui: 'gpt',
      city: _finder.city,
      category: _finder.category,
      budget: _finder.budget,
      experience: _finder.experience,
      count: products.length,
    });
    clarityEvt('gpt_finder_search', { category: _finder.category });
    funnelStep('first_search', { source: 'finder' });
  } finally {
    if (go) go.disabled = false;
  }
}

function renderSidebarLocCard() {
  const label = $('side-loc-label');
  const action = $('side-loc-action');
  if (!label) return;
  const o = state.onboarding;
  if (o.step === 'done' && (o.city || (o.categories || []).length)) {
    label.textContent = [o.city, (o.categories || [])[0]].filter(Boolean).join(' · ');
    if (action) action.textContent = 'Ubah lokasi & kategori';
  } else {
    label.textContent = 'Lokasi belum dipilih';
    if (action) action.textContent = 'Set lokasi';
  }
}

function syncDirectoryFromOnboarding() {
  const o = state.onboarding || {};
  if (o.step !== 'done') return;
  if (o.city) state.dirCity = o.city;
  if (o.categories?.length) state.dirCat = toCanonicalCat(o.categories[0]) || null;
}

// ── Lokasi & kategori side drawer (does not interrupt the open chat) ──────
let _prefsDraft = { city: '', categories: [], freeText: '', cityFilter: '', experience: '' };
let _prefsSource = '';

function openPrefsDrawer(source) {
  _prefsSource = source || 'sidebar';
  const o = state.onboarding || {};
  _prefsDraft = {
    city: o.city || '',
    categories: [...(o.categories || [])],
    freeText: o.freeText || '',
    cityFilter: '',
    experience: normalizeExperience(o.experience),
  };
  closeSidebar();
  const drawer = $('prefs-drawer');
  const backdrop = $('prefs-backdrop');
  if (!drawer || !backdrop) return;
  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add('open');
    backdrop.classList.add('open');
  });
  drawer.setAttribute('aria-hidden', 'false');
  const search = $('prefs-city-search');
  if (search) search.value = '';
  const free = $('prefs-free');
  if (free) free.value = _prefsDraft.freeText;
  renderPrefsCityChips();
  renderPrefsCatChips();
  renderPrefsExpChips();
  renderPrefsLearnedChips();
  clarityEvt('gpt_prefs_open', { source: _prefsSource });
  void logUserEvent('gpt_prefs_open', { ui: 'gpt', source: _prefsSource });
}

function renderPrefsExpChips() {
  const wrap = $('prefs-exp-chips');
  if (!wrap) return;
  wrap.querySelectorAll('[data-prefs-exp]').forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-prefs-exp') === _prefsDraft.experience);
  });
}

function renderPrefsLearnedChips() {
  const sec = $('prefs-learned-section');
  const wrap = $('prefs-learned-chips');
  if (!sec || !wrap) return;
  recomputeLearnedCategories();
  const learned = state.onboarding.learnedCategories || [];
  sec.hidden = !learned.length;
  wrap.innerHTML = learned.map(c =>
    `<button type="button" class="chip selected" data-prefs-learned="${esc(c)}" title="Hapus dari minat">${esc(c)} ×</button>`
  ).join('');
}

function closePrefsDrawer() {
  const drawer = $('prefs-drawer');
  const backdrop = $('prefs-backdrop');
  if (drawer) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { drawer.hidden = true; }, 280);
  }
  if (backdrop) {
    backdrop.classList.remove('open');
    setTimeout(() => { backdrop.hidden = true; }, 280);
  }
}

function renderPrefsCityChips() {
  const wrap = $('prefs-city-chips');
  if (!wrap) return;
  const q = (_prefsDraft.cityFilter || '').toLowerCase();
  const locs = NU_ONB_LOCATIONS.filter(l => !q || l.toLowerCase().includes(q));
  wrap.innerHTML = locs.map(l => {
    const sel = _prefsDraft.city === l ? ' selected' : '';
    return `<button type="button" class="chip${sel}" data-prefs-city="${esc(l)}">${esc(l)}</button>`;
  }).join('');
}

function renderPrefsCatChips() {
  const wrap = $('prefs-cat-chips');
  if (!wrap) return;
  const selected = new Set(_prefsDraft.categories);
  wrap.innerHTML = NU_ONB_CATS.map(c => {
    const slug = CAT_SLUG[c];
    const sel = selected.has(c) ? ' selected' : '';
    return `<button type="button" class="chip cat${sel}" data-prefs-cat="${esc(c)}"><img src="/images/onboarding/categories/${slug}.png" alt="" width="22" height="22">${esc(c)}</button>`;
  }).join('');
}

function normalizeExperience(v) {
  if (v === 'baru' || v === 'first_time') return 'first_time';
  if (v === 'berpengalaman' || v === 'existing') return 'existing';
  return v || '';
}

async function savePrefsDrawer() {
  const o = state.onboarding;
  const wasDone = o.step === 'done';
  const saveBtn = $('prefs-save');
  o.city = _prefsDraft.city || '';
  o.categories = [..._prefsDraft.categories];
  o.experience = normalizeExperience(_prefsDraft.experience);
  o.freeText = ($('prefs-free')?.value || _prefsDraft.freeText || '').trim();

  // First-time / post-sign-in path needs city + minat so we can show fitting products.
  const wantsProducts = !wasDone || _prefsSource === 'post_signin' || state.view === 'home';
  if (wantsProducts && (!o.city || !o.categories.length)) {
    showToast('Pilih kota dan minimal 1 kategori dulu.');
    return;
  }
  if (!o.city && !o.categories.length && !o.freeText) {
    showToast('Pilih kota atau kategori dulu.');
    return;
  }

  o.step = 'done';
  o.completedAnon = !currentUser;
  // Keep landing finder aligned with what they just saved.
  if (o.city) _finder.city = o.city;
  if (o.categories[0]) _finder.category = o.categories[0];
  if (o.experience) _finder.experience = o.experience;
  saveFinderState();
  saveLocalState();
  syncDirectoryFromOnboarding();
  state._dirDefaultsApplied = true;
  renderSidebarLocCard();
  updateHomeFinderVisibility();
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Menyimpan…'; }
  try {
    await persistOnboardingPrefs();
    closePrefsDrawer();
    showToast([o.city, o.categories[0]].filter(Boolean).join(' · ') || 'Preferensi disimpan');
    void logUserEvent('onboarding_complete', {
      ui: 'gpt',
      region: o.city,
      categories: o.categories,
      seller_status: o.experience,
      free_text: (o.freeText || '').slice(0, 80),
      source: _prefsSource,
      update: wasDone,
    });
    clarityEvt(wasDone ? 'gpt_prefs_update' : 'onboarding_complete', { ui: 'gpt' });

    if (wantsProducts) {
      // Leave the opening questions and show products that match city + minat.
      await startRecommendationChat(true);
      return;
    }

    if (state.view === 'directory') {
      const cats = $('dir-cats');
      if (cats) {
        cats.querySelectorAll('[data-dcat]').forEach(c => {
          const v = c.getAttribute('data-dcat') || '';
          c.classList.toggle('selected', (state.dirCat || '') === v);
        });
      }
      const citySel = $('dir-city');
      if (citySel) citySel.value = state.dirCity || '';
      await renderDirectory();
    }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Simpan'; }
  }
}

function startOnboarding(source) {
  // Side drawer — keeps the current chat / view intact.
  openPrefsDrawer(source || 'sidebar');
}

function offerOnboardingAfterSignin() {
  _offerActive = false;
  const overlay = $('profile-nudge');
  if (!overlay) { openPrefsDrawer('post_signin'); return; }
  overlay.classList.add('open');
  void logUserEvent('gpt_profile_nudge', { ui: 'gpt', action: 'shown' });
  clarityEvt('gpt_profile_nudge', { action: 'shown' });
}

function closeProfileNudge() { $('profile-nudge')?.classList.remove('open'); }

// Persist a single in-memory message to gpt_messages. Idempotent via the
// client-only `_saved` flag; only chat_id/role/content are sent to the DB.
async function persistMessage(chat, m) {
  if (!currentUser || !_supabase || !chat || !chat.id || !m || m._saved) return;
  try {
    const { error } = await _supabase.from('gpt_messages').insert({
      chat_id: chat.id,
      role: m.role,
      content: typeof m.content === 'object' ? m.content : { text: m.content },
    });
    if (error) { console.warn('[gpt] message persist failed:', error.message); return; }
    m._saved = true;
    saveLocalState();
  } catch (e) { console.warn('[gpt] message persist error:', e); }
}

// Backfill any messages pushed before the chat had a remote id. Call right
// after chat.id is assigned from gpt_new_chat.
function flushChatMessages(chat) {
  if (!chat || !chat.id) return;
  for (const m of (chat.messages || [])) { if (!m._saved) void persistMessage(chat, m); }
}

// Assign chat.id via gpt_new_chat when the user is under their daily cap, then
// backfill. On cap or error the chat stays local — deep dives / product chats
// must never be walled (MISSION). Returns true if the chat is (now) persisted.
async function ensureChatPersisted(chat, title, context) {
  if (!chat) return false;
  if (chat.id) { flushChatMessages(chat); return true; }
  if (!currentUser || !_supabase) return false;
  try {
    const { data, error } = await _supabase.rpc('gpt_new_chat', {
      p_title: String(title || chat.title || 'Chat').slice(0, 60),
      p_context: context || chat.context || {},
    });
    if (error) { console.warn('[gpt] gpt_new_chat failed:', error.message); return false; }
    if (data) noteGptUsage(data);
    if (data?.chat) {
      const wasActive = state.activeChatId === chat.localId;
      chat.id = data.chat.id;
      delete chat.localId;
      if (wasActive) state.activeChatId = chat.id;
      flushChatMessages(chat);
      saveLocalState();
      return true;
    }
  } catch (e) { console.warn('[gpt] ensureChatPersisted error:', e); }
  return false; // over cap or no data — stay local, never wall
}

function pushMessage(chat, role, content, html) {
  if (!chat.messages) chat.messages = [];
  const m = { role, content: typeof content === 'object' ? content : { text: content }, html, ts: Date.now() };
  chat.messages.push(m);
  saveLocalState();
  if (currentUser && chat.id && _supabase) void persistMessage(chat, m);
  return m;
}

function wirePrefsDrawer() {
  if (wirePrefsDrawer._ready) return;
  wirePrefsDrawer._ready = true;
  $('prefs-close')?.addEventListener('click', closePrefsDrawer);
  $('prefs-cancel')?.addEventListener('click', closePrefsDrawer);
  $('prefs-backdrop')?.addEventListener('click', closePrefsDrawer);
  $('prefs-save')?.addEventListener('click', () => void savePrefsDrawer());
  $('prefs-city-search')?.addEventListener('input', e => {
    _prefsDraft.cityFilter = e.target.value || '';
    renderPrefsCityChips();
  });
  $('prefs-free')?.addEventListener('input', e => {
    _prefsDraft.freeText = e.target.value || '';
  });
  $('prefs-drawer')?.addEventListener('click', e => {
    const cityBtn = e.target.closest?.('[data-prefs-city]');
    if (cityBtn) {
      _prefsDraft.city = cityBtn.getAttribute('data-prefs-city') || '';
      renderPrefsCityChips();
      return;
    }
    const catBtn = e.target.closest?.('[data-prefs-cat]');
    if (catBtn) {
      const c = catBtn.getAttribute('data-prefs-cat');
      const arr = _prefsDraft.categories;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      else arr.push(c);
      renderPrefsCatChips();
      return;
    }
    const expBtn = e.target.closest?.('[data-prefs-exp]');
    if (expBtn) {
      const v = expBtn.getAttribute('data-prefs-exp') || '';
      _prefsDraft.experience = _prefsDraft.experience === v ? '' : v;
      renderPrefsExpChips();
      return;
    }
    const learnedBtn = e.target.closest?.('[data-prefs-learned]');
    if (learnedBtn) {
      const c = learnedBtn.getAttribute('data-prefs-learned') || '';
      const o = state.onboarding;
      if (!o.dismissedLearned.includes(c)) o.dismissedLearned.push(c);
      recomputeLearnedCategories();
      saveLocalState();
      renderPrefsLearnedChips();
      void logUserEvent('gpt_learned_prefs', { ui: 'gpt', removed: c });
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('prefs-drawer')?.classList.contains('open')) {
      e.preventDefault();
      closePrefsDrawer();
    }
  });
}

// ── Side panel (Cursor-style): Kalkulator | Kompetitor | Serupa ─────────────
const SIDE_PREFS_KEY = 'gpt_side_panel_v1';
const CALC_PREFS_KEY_LEGACY = 'gpt_calc_panel_v1';
let _sideMode = 'kalkulator'; // 'kalkulator' | 'kompetitor' | 'serupa'
let _calcFilled = false;
let _calcProductKey = null; // item_id|shop_id of last calc prefill
let _kompFetchToken = 0;
let _serupaFetchToken = 0;

function normalizeSideMode(mode) {
  if (mode === 'kompetitor' || mode === 'serupa' || mode === 'ai') return mode;
  // 'supplier' is gated — never restore into it once the probe is switched off,
  // or a saved pref could strand a normal user on a blank panel.
  if (mode === 'supplier' && supplierProbeVisible()) return 'supplier';
  return 'kalkulator';
}

function sideModeLabel(mode) {
  const m = normalizeSideMode(mode);
  if (m === 'ai') return 'Tanya AI';
  if (m === 'kompetitor') return 'Kompetitor';
  if (m === 'serupa') return 'Produk serupa';
  if (m === 'supplier') return 'Cari Supplier';
  return 'Kalkulator profit';
}

function loadSidePrefs() {
  try {
    const cur = JSON.parse(localStorage.getItem(SIDE_PREFS_KEY) || 'null');
    if (cur && typeof cur === 'object') return cur;
  } catch (_) {}
  try {
    const legacy = JSON.parse(localStorage.getItem(CALC_PREFS_KEY_LEGACY) || '{}') || {};
    return { open: !!legacy.open, width: legacy.width, mode: 'kalkulator' };
  } catch (_) { return {}; }
}
function saveSidePrefs(patch) {
  try { localStorage.setItem(SIDE_PREFS_KEY, JSON.stringify({ ...loadSidePrefs(), ...patch })); }
  catch (_) {}
}

function setCalcWidth(px) {
  const min = 320;
  const max = Math.max(min, Math.min(window.innerWidth * 0.7, window.innerWidth - 360));
  const w = Math.round(Math.max(min, Math.min(px, max)));
  document.documentElement.style.setProperty('--calc-w', w + 'px');
  return w;
}

function setSheetHeight(pct) {
  // pct = fraction of viewport height (0.15–0.95). Default open is 0.80.
  const p = Math.max(0.15, Math.min(0.95, Number(pct) || 0.8));
  document.documentElement.style.setProperty('--sheet-h', `${Math.round(p * 1000) / 10}dvh`);
  return p;
}

function setSideModeUi(mode) {
  _sideMode = normalizeSideMode(mode);
  document.querySelectorAll('.side-tab').forEach(tab => {
    const on = tab.getAttribute('data-side-mode') === _sideMode;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const open = document.body.classList.contains('calc-open');
  $('ai-rail')?.setAttribute('aria-expanded', open && _sideMode === 'ai' ? 'true' : 'false');
  $('calc-rail')?.setAttribute('aria-expanded', open && _sideMode === 'kalkulator' ? 'true' : 'false');
  $('komp-rail')?.setAttribute('aria-expanded', open && _sideMode === 'kompetitor' ? 'true' : 'false');
  $('serupa-rail')?.setAttribute('aria-expanded', open && _sideMode === 'serupa' ? 'true' : 'false');
  const panel = $('calc-panel');
  if (panel) panel.setAttribute('aria-label', sideModeLabel(_sideMode));
  const aiBody = $('side-body-ai');
  const kalcBody = $('side-body-kalc');
  const kompBody = $('side-body-komp');
  const serupaBody = $('side-body-serupa');
  const supBody = $('side-body-supplier');
  if (aiBody) aiBody.hidden = _sideMode !== 'ai';
  if (kalcBody) kalcBody.hidden = _sideMode !== 'kalkulator';
  if (kompBody) kompBody.hidden = _sideMode !== 'kompetitor';
  if (serupaBody) serupaBody.hidden = _sideMode !== 'serupa';
  if (supBody) supBody.hidden = _sideMode !== 'supplier';
  const supTab = $('side-tab-supplier');
  if (supTab) supTab.hidden = !supplierProbeVisible();
}

function setSideContext(text) {
  const ctx = $('calc-context');
  if (!ctx) return;
  const name = (text || '').trim();
  if (name) { ctx.textContent = name; ctx.hidden = false; }
  else { ctx.textContent = ''; ctx.hidden = true; }
}

function resolveSideProduct() {
  // Prefer live Deep Dive → active product chat → last-rendered DD payload.
  if (state.deepdiveProduct) return state.deepdiveProduct;
  const chat = activeChat();
  if (chat?.context?.product) return chat.context.product;
  if (_dd?.product) return _dd.product;
  return null;
}

// The rail/panel exist only while a product is actually on screen (deep dive
// or a product chat) — not merely remembered from an earlier view.
function sideProductActive() {
  if (state.view === 'deepdive') return !!(state.deepdiveProduct || _dd?.product);
  if (state.view === 'chat') return !!activeChat()?.context?.product;
  return false;
}

function updateSideRailVisibility() {
  const active = sideProductActive();
  document.body.classList.toggle('has-side-product', active);
  if (!active && document.body.classList.contains('calc-open')) closeCalcPanel();
}

function sideProductKey(product) {
  if (!product) return null;
  const iid = product.item_id;
  const sid = product.shop_id;
  if (iid == null && sid == null) return null;
  return `${iid ?? ''}|${sid ?? ''}`;
}

function resolveSidePeers(product) {
  if (_dd?.peers?.length) {
    const same =
      String(_dd.product?.item_id) === String(product?.item_id)
      && String(_dd.product?.shop_id) === String(product?.shop_id);
    const sameKw = product?.keyword && _dd.product?.keyword === product.keyword;
    if (same || sameKw) return _dd.peers;
  }
  const cached = activeChat()?.context?.peers;
  if (cached?.length) return cached;
  return null;
}

async function fetchSidePeers(product) {
  const kw = product?.keyword || '';
  if (!_supabase || !kw) return [];
  try {
    const { data } = await _supabase.from('listings_deduped')
      .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date')
      .gt('total_sold', 0)
      .ilike('keyword', `%${kw.slice(0, 40)}%`)
      .order('total_sold', { ascending: false })
      .limit(60);
    return data || [];
  } catch (_) {
    return [];
  }
}

function fillCalcContent(opts = {}) {
  const body = $('side-body-kalc');
  if (!body) return;
  const product = opts.product || resolveSideProduct();
  if (!product) {
    setSideContext('');
    body.innerHTML = '<p class="side-empty">Buka produk dulu untuk pakai kalkulator.</p>';
    _calcFilled = false;
    _calcProductKey = null;
    return;
  }

  const priceRaw = opts.price != null ? Number(opts.price) : Number(product.price);
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? Math.round(priceRaw) : 0;
  const cogs = opts.cogs != null && Number(opts.cogs) > 0
    ? Math.round(Number(opts.cogs))
    : (price ? Math.round(price * 0.33) : 0);
  const nextKey = sideProductKey(product);
  const shouldRebuild = opts.force || opts.price != null || !_calcFilled || nextKey !== _calcProductKey;

  if (shouldRebuild) {
    body.innerHTML = gptKalcHtml({ price, cogs });
    _calcFilled = true;
    _calcProductKey = nextKey;
  }

  const name = (opts.name || product.product_name || product.keyword || '').trim().slice(0, 80);
  setSideContext(name);
  bindGptKalc(body);
}

function wireKompPanelBody(body, peers) {
  wireKompClicks(body, peers);
}

async function fillKompContent(opts = {}) {
  const body = $('side-body-komp');
  if (!body) return;
  const product = opts.product || resolveSideProduct();
  if (!product) {
    setSideContext('');
    body.innerHTML = '<p class="side-empty">Buka produk dulu untuk lihat kompetitor.</p>';
    return;
  }
  const label = (product.product_name || product.keyword || '').slice(0, 80);
  setSideContext(label);

  let peers = opts.peers || resolveSidePeers(product);
  if (!peers?.length) {
    const token = ++_kompFetchToken;
    body.innerHTML = '<p class="side-empty">Memuat kompetitor…</p>';
    peers = await fetchSidePeers(product);
    if (token !== _kompFetchToken || _sideMode !== 'kompetitor') return;
  }

  const share = ddShareData(peers || []);
  const kw = product.keyword || '—';
  body.innerHTML = `
    <p class="side-komp-lead">Toko kompetitor di keyword “${esc(kw)}” — urut estimasi omset.</p>
    ${ddKompetitorTableHtml(share, { moreId: 'side-komp-more' })}
  `;
  wireKompPanelBody(body, peers || []);
}

function similarPeersForProduct(product, peers) {
  const selfKey = sideProductKey(product);
  const cat = (product?.category || '').trim().toLowerCase();
  let list = (peers || [])
    .map(p => asListingProduct(p))
    .filter(p => sideProductKey(p) && sideProductKey(p) !== selfKey);
  if (cat) {
    const sameCat = list.filter(p => (p.category || '').trim().toLowerCase() === cat);
    if (sameCat.length >= 4) list = sameCat;
  }
  return list
    .sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0))
    .slice(0, 24);
}

async function fillSerupaContent(opts = {}) {
  const body = $('side-body-serupa');
  if (!body) return;
  const product = opts.product || resolveSideProduct();
  if (!product) {
    setSideContext('');
    body.innerHTML = '<p class="side-empty">Buka produk dulu untuk lihat item serupa.</p>';
    return;
  }
  const label = (product.product_name || product.keyword || '').slice(0, 80);
  setSideContext(label);

  let peers = opts.peers || resolveSidePeers(product);
  if (!peers?.length) {
    const token = ++_serupaFetchToken;
    body.innerHTML = '<p class="side-empty">Memuat produk serupa…</p>';
    peers = await fetchSidePeers(product);
    if (token !== _serupaFetchToken || _sideMode !== 'serupa') return;
  }

  const items = similarPeersForProduct(product, peers);
  const kw = product.keyword || '—';
  if (!items.length) {
    body.innerHTML = `
      <p class="side-komp-lead">Produk serupa di keyword “${esc(kw)}”.</p>
      <p class="side-empty">Belum ada listing serupa untuk keyword ini.</p>
    `;
    return;
  }
  body.innerHTML = `
    <p class="side-komp-lead">${items.length} produk serupa di keyword “${esc(kw)}” — urut terjual. Klik untuk Deep Dive.</p>
    <div class="card-grid side-serupa-grid">${productCardsHtml(items)}</div>
  `;
  bindProductCards(body);
}

/* ── Tanya AI side panel ───────────────────────────────────────────────────
   The AI used to live only in the docked composer, which on desktop competes
   with a very long scrolling Deep Dive report. Here it sits beside the report
   as a peer of Kalkulator / Kompetitor / Serupa.

   Everything shown is derived from `_dd` — the object openDeepDive() already
   builds ({ product, peers, niche, stats, history, series }) — so opening this
   panel costs no extra fetch. Answers go through askProductAi(), the SAME path
   the docked composer uses, so gpt_messages persistence and the daily use_ai
   cap behave identically no matter which composer the user typed into.
   ────────────────────────────────────────────────────────────────────────── */

/** First name only — "Halo Steven", not "Halo steven@gmail.com". */
function aiGreetingName() {
  const raw = String(currentUser?.user_metadata?.full_name || '').trim();
  if (raw) return raw.split(/\s+/)[0].slice(0, 24);
  return 'kamu';
}

function aiPanelSummaryHtml(product) {
  const stats = _dd?.stats || ddStats([]);
  const peers = _dd?.peers || [];
  const series = _dd?.series || [];
  const history = _dd?.history || [];
  const scoreInfo = ddScore(product, stats, _dd?.niche);
  const share = ddShareData(peers);
  const age = ddShopAgeBuckets(peers);
  const bullets = ddInsightBullets(product, stats, share, series, scoreInfo, age, peers);
  const kesimpulan = ddKesimpulanCopy(scoreInfo, stats);
  const list = bullets.length
    ? `<ul class="side-ai-bullets">${bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
    : '<p class="side-ai-empty-note">Belum cukup sinyal untuk ringkasan otomatis — tanya langsung di bawah.</p>';
  return `<div class="side-ai-summary">
    <div class="side-ai-summary-head">${ico('spark', 15)}<span>Ringkasan AI</span></div>
    ${list}
    <p class="side-ai-kesimpulan">${esc(kesimpulan)}</p>
  </div>`;
}

function fillAiContent(opts = {}) {
  const body = $('side-body-ai');
  if (!body) return;
  const product = opts.product || resolveSideProduct();
  if (!product) {
    setSideContext('');
    body.innerHTML = '<p class="side-empty">Buka produk atau pasar dulu untuk tanya AI tentang datanya.</p>';
    return;
  }
  const label = (product._ptype ? typeTitle(product.keyword) : (product.product_name || product.keyword || '')).slice(0, 80);
  setSideContext(label);

  // Re-rendering on every product switch would wipe an in-progress conversation.
  // Keep the thread when the panel is merely refreshed for the same product.
  const key = prodKey(product);
  if (body.dataset.aiKey === key && body.querySelector('#side-ai-thread')) return;
  body.dataset.aiKey = key;

  const chips = ddComposerChips(product).map(c =>
    `<button type="button" class="side-ai-chip" data-side-ai-prompt="${esc(c.prompt)}">${ico(c.icon || 'spark', 14)}<span>${esc(c.label)}</span></button>`
  ).join('');

  body.innerHTML = `
    <div class="side-ai-hello">
      <div class="side-ai-hello-ico">${ico('spark', 16)}</div>
      <div>
        <div class="side-ai-hello-title">Halo ${esc(aiGreetingName())}</div>
        <p>Saya sudah menganalisa ${product._ptype ? 'pasar' : 'produk'} ini dari data Shopee LarisID. Berikut ringkasannya.</p>
      </div>
    </div>
    ${aiPanelSummaryHtml(product)}
    <div class="side-ai-chips">${chips}</div>
    <div class="side-ai-thread" id="side-ai-thread"></div>
    <form class="side-ai-form" id="side-ai-form">
      <textarea id="side-ai-input" rows="1" placeholder="Tanyakan apa saja tentang ${product._ptype ? 'pasar' : 'produk'} ini…"></textarea>
      <button type="submit" class="side-ai-send" aria-label="Kirim">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </button>
    </form>
    <p class="side-ai-disclaimer">AI dapat membuat kesalahan. Angka di panel ini dari data scrape asli — verifikasi sebelum ambil keputusan.</p>
  `;

  body.querySelectorAll('[data-side-ai-prompt]').forEach(btn => {
    btn.addEventListener('click', () => {
      void sideAiSubmit(btn.getAttribute('data-side-ai-prompt'));
    });
  });
  const form = $('side-ai-form');
  const input = $('side-ai-input');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = String(input?.value || '').trim();
    if (!t) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    void sideAiSubmit(t);
  });
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form?.requestSubmit(); }
  });
}

/** Panel composer → the shared product-AI turn, rendered into the panel thread. */
async function sideAiSubmit(text) {
  const q = String(text || '').trim();
  if (!q) return;
  const product = resolveSideProduct();
  if (!product) return;
  if (!currentUser) { openAuthModal('login', 'gpt_gate_ai_panel'); return; }
  const root = $('side-ai-thread');
  if (!root) return;
  // Chips are one-shot prompts; hide them once a conversation starts so the
  // panel reads as a thread rather than a menu.
  $('side-body-ai')?.querySelector('.side-ai-chips')?.setAttribute('hidden', '');

  // In a Deep Dive openDeepDive() has already made the thread; this local
  // fallback only covers the rare panel-open-without-a-chat case.
  let chat = activeChat();
  if (!chat) {
    chat = {
      localId: 'local_' + Date.now(),
      title: (product.product_name || product.keyword || q).slice(0, 60),
      context: { kind: 'product', item_id: product.item_id, shop_id: product.shop_id, keyword: product.keyword },
      messages: [], created_at: Date.now(),
    };
    state.chats.unshift(chat);
    state.activeChatId = chat.localId;
    renderChatList();
  }
  appendBubble('user', `<p>${esc(q)}</p>`, { root });
  pushMessage(chat, 'user', q);
  void logUserEvent('gpt_message_sent', { ui: 'gpt', via: 'side_panel' });
  void logUserEvent('gpt_side_panel', { ui: 'gpt', action: 'ask', mode: 'ai', via: 'panel' });
  await askProductAi(chat, product, q, { root });
}

function refreshOpenSidePanel(opts = {}) {
  if (!document.body.classList.contains('calc-open')) return;
  if (_sideMode === 'ai') fillAiContent(opts);
  else if (_sideMode === 'kompetitor') void fillKompContent(opts);
  else if (_sideMode === 'serupa') void fillSerupaContent(opts);
  else if (_sideMode === 'supplier') void fillSupplierContent(opts);
  else fillCalcContent({ ...opts, force: true });
}

function openSidePanel(mode, opts = {}) {
  const panel = $('calc-panel');
  if (!panel || !$('side-body-kalc') || !$('side-body-komp') || !$('side-body-serupa') || !$('side-body-supplier')) return;
  const next = normalizeSideMode(mode);
  const wasOpen = document.body.classList.contains('calc-open');
  const switching = wasOpen && _sideMode !== next;

  document.body.classList.add('calc-open');
  panel.setAttribute('aria-hidden', 'false');
  setSideModeUi(next);
  // Mobile sheet: explicit opens always expand; boot restore honors last state.
  if (opts.via === 'restore' && window.innerWidth <= 860 && loadSidePrefs().collapsed) {
    panel.classList.add('sheet-collapsed');
  } else {
    panel.classList.remove('sheet-collapsed');
  }

  if (next === 'ai') fillAiContent(opts);
  else if (next === 'kalkulator') fillCalcContent(opts);
  else if (next === 'serupa') void fillSerupaContent(opts);
  else if (next === 'supplier') void fillSupplierContent(opts);
  else void fillKompContent(opts);

  saveSidePrefs({ open: true, dismissed: false, mode: next });
  if (opts.via !== 'restore' && (!wasOpen || switching)) {
    void logUserEvent('gpt_side_panel', {
      ui: 'gpt',
      action: wasOpen ? 'switch' : 'open',
      mode: next,
      via: opts.via || 'rail',
      has_product: !!(opts.price != null || opts.product || resolveSideProduct()),
    });
  }
}

function openAiPanel(opts = {}) { openSidePanel('ai', opts); }
function openCalcPanel(opts = {}) { openSidePanel('kalkulator', opts); }
function openKompPanel(opts = {}) { openSidePanel('kompetitor', opts); }
function openSerupaPanel(opts = {}) { openSidePanel('serupa', opts); }

function closeCalcPanel() {
  document.body.classList.remove('calc-open');
  $('calc-panel')?.setAttribute('aria-hidden', 'true');
  $('ai-rail')?.setAttribute('aria-expanded', 'false');
  $('calc-rail')?.setAttribute('aria-expanded', 'false');
  $('komp-rail')?.setAttribute('aria-expanded', 'false');
  $('serupa-rail')?.setAttribute('aria-expanded', 'false');
  // `dismissed` records an explicit close, which is what stops the Deep Dive
  // from re-opening the panel on every product. Re-opening it clears the flag.
  saveSidePrefs({ open: false, dismissed: true, mode: _sideMode });
}

function wireCalcPanel() {
  if (wireCalcPanel._ready) return;
  wireCalcPanel._ready = true;

  const prefs = loadSidePrefs();
  if (prefs.width) setCalcWidth(prefs.width);
  _sideMode = normalizeSideMode(prefs.mode);
  setSideModeUi(_sideMode);

  $('ai-rail')?.addEventListener('click', () => openAiPanel({ via: 'rail' }));
  $('calc-rail')?.addEventListener('click', () => openCalcPanel({ via: 'rail' }));
  $('komp-rail')?.addEventListener('click', () => openKompPanel({ via: 'rail' }));
  $('serupa-rail')?.addEventListener('click', () => openSerupaPanel({ via: 'rail' }));
  $('calc-close')?.addEventListener('click', closeCalcPanel);

  // Mobile bottom-sheet grab: drag to resize height; <10% viewport auto-collapses.
  // Tap (tiny movement) still toggles collapse. Swipe-down-when-collapsed closes.
  const grab = $('sheet-grab');
  if (grab) {
    const isSheet = () => window.innerWidth <= 860;
    const setCollapsed = (on) => {
      $('calc-panel')?.classList.toggle('sheet-collapsed', on);
      saveSidePrefs({ collapsed: on });
    };
    if (prefs.sheetPct) setSheetHeight(prefs.sheetPct);
    else setSheetHeight(0.8);

    let drag = null; // { startY, startH, moved }
    const clientY = (e) => (e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY);
    const onMove = (e) => {
      if (!drag || !isSheet()) return;
      const dy = clientY(e) - drag.startY;
      if (Math.abs(dy) > 4) drag.moved = true;
      const vh = window.innerHeight || 1;
      const nextH = drag.startH - dy; // drag up → taller
      const pct = nextH / vh;
      if (pct < 0.10) {
        setCollapsed(true);
        return;
      }
      setCollapsed(false);
      setSheetHeight(pct);
      if (e.cancelable) e.preventDefault();
    };
    const onUp = () => {
      if (!drag) return;
      const moved = drag.moved;
      const collapsed = $('calc-panel')?.classList.contains('sheet-collapsed');
      drag = null;
      document.body.classList.remove('sheet-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (!moved) {
        // Tap: toggle collapse
        setCollapsed(!collapsed);
        return;
      }
      if (collapsed) return;
      const panel = $('calc-panel');
      const h = panel?.getBoundingClientRect().height || 0;
      const pct = h / (window.innerHeight || 1);
      if (pct < 0.10) setCollapsed(true);
      else saveSidePrefs({ sheetPct: setSheetHeight(pct), collapsed: false });
    };
    const onDown = (e) => {
      if (!isSheet()) return;
      const panel = $('calc-panel');
      if (!panel) return;
      // If collapsed, a downward flick after expand-path still handled in onUp tap;
      // start measuring from current (collapsed) height so drag-up expands.
      drag = {
        startY: clientY(e),
        startH: panel.classList.contains('sheet-collapsed')
          ? Math.round(window.innerHeight * (loadSidePrefs().sheetPct || 0.8))
          : panel.getBoundingClientRect().height,
        moved: false,
      };
      document.body.classList.add('sheet-resizing');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    };
    grab.addEventListener('mousedown', onDown);
    grab.addEventListener('touchstart', onDown, { passive: true });
  }
  document.querySelectorAll('.side-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.getAttribute('data-side-mode');
      openSidePanel(mode, { via: 'tab' });
    });
  });

  const handle = $('calc-resize');
  if (handle) {
    let dragging = false, startX = 0, startW = 0;
    const clientX = (e) => (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const onMove = (e) => {
      if (!dragging) return;
      // Panel is on the right: dragging left (smaller clientX) widens it.
      setCalcWidth(startW + (startX - clientX(e)));
      if (e.cancelable) e.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove('calc-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--calc-w'), 10) || 420;
      saveSidePrefs({ width: cur });
    };
    const onDown = (e) => {
      if (window.innerWidth <= 860) return;
      dragging = true;
      startX = clientX(e);
      startW = $('calc-panel')?.getBoundingClientRect().width || 420;
      document.body.classList.add('calc-resizing');
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
      if (e.cancelable) e.preventDefault();
    };
    handle.addEventListener('mousedown', onDown);
    handle.addEventListener('touchstart', onDown, { passive: false });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('calc-open')) {
      e.preventDefault();
      closeCalcPanel();
    }
  });

  if (prefs.open && sideProductActive()) openSidePanel(_sideMode, { via: 'restore' });
}

// ── Recommendations (city + category first) ──────────────────────────────
// Exact Shopee location strings (same clusters as A’s YLK) so `.in('location', …)` hits.
// ── Indonesian cities (typeahead + nearest-city fallback) ────────────────
// The picker offered 14 cities and nothing else, so anyone outside them had no
// way to say where they are. This is a curated kota/kabupaten list with rough
// centroids; a city we have no data for resolves to the NEAREST city that does,
// and the UI says so rather than passing national data off as local.
const ID_CITIES = [
  ["Jakarta",-6.2088,106.8456], ["Jakarta Pusat",-6.1865,106.8343], ["Jakarta Barat",-6.1683,106.7588], ["Jakarta Selatan",-6.2615,106.8106],
  ["Jakarta Timur",-6.225,106.9004], ["Jakarta Utara",-6.1214,106.7741], ["Bekasi",-6.2383,106.9756], ["Depok",-6.4025,106.7942],
  ["Tangerang",-6.1783,106.6319], ["Tangerang Selatan",-6.2884,106.7179], ["Bogor",-6.595,106.8166], ["Cikarang",-6.2614,107.1526],
  ["Bandung",-6.9175,107.6191], ["Cimahi",-6.8722,107.5425], ["Sumedang",-6.839,107.921], ["Garut",-7.2144,107.907],
  ["Tasikmalaya",-7.3274,108.2207], ["Cirebon",-6.732,108.5523], ["Sukabumi",-6.9277,106.93], ["Cianjur",-6.8203,107.1425],
  ["Purwakarta",-6.5569,107.4431], ["Subang",-6.5713,107.759], ["Indramayu",-6.3373,108.3247], ["Karawang",-6.3227,107.3376],
  ["Cilegon",-6.0027,106.0113], ["Serang",-6.12,106.1503], ["Pandeglang",-6.3081,106.1064], ["Semarang",-6.9932,110.4203],
  ["Salatiga",-7.3305,110.5084], ["Kudus",-6.8048,110.8405], ["Pekalongan",-6.8886,109.6753], ["Tegal",-6.8694,109.1402],
  ["Magelang",-7.4797,110.2177], ["Surakarta",-7.5755,110.8243], ["Solo",-7.5755,110.8243], ["Klaten",-7.7059,110.6062],
  ["Boyolali",-7.5325,110.5951], ["Sukoharjo",-7.6819,110.836], ["Karanganyar",-7.5989,110.9508], ["Sragen",-7.4265,111.0206],
  ["Purwokerto",-7.4245,109.2394], ["Cilacap",-7.7266,109.0093], ["Kebumen",-7.669,109.6524], ["Purworejo",-7.7139,110.0093],
  ["Wonosobo",-7.3606,109.9003], ["Yogyakarta",-7.7956,110.3695], ["Sleman",-7.7169,110.355], ["Bantul",-7.888,110.3288],
  ["Kulon Progo",-7.8267,110.1644], ["Gunungkidul",-7.9656,110.6039], ["Surabaya",-7.2575,112.7521], ["Sidoarjo",-7.4478,112.7183],
  ["Gresik",-7.1561,112.6531], ["Mojokerto",-7.4664,112.4338], ["Pasuruan",-7.6453,112.9075], ["Probolinggo",-7.7543,113.2159],
  ["Malang",-7.9666,112.6326], ["Batu",-7.8672,112.5239], ["Kediri",-7.848,112.0178], ["Blitar",-8.0955,112.1609],
  ["Tulungagung",-8.0657,111.9026], ["Jember",-8.1724,113.7002], ["Banyuwangi",-8.2192,114.3691], ["Madiun",-7.6298,111.5239],
  ["Ngawi",-7.4033,111.4463], ["Bojonegoro",-7.1502,111.8817], ["Tuban",-6.8976,112.0649], ["Lamongan",-7.1204,112.4165],
  ["Jombang",-7.546,112.2331], ["Nganjuk",-7.605,111.9028], ["Banyumas",-7.5119,109.2946], ["Denpasar",-8.6705,115.2126],
  ["Badung",-8.582,115.178], ["Gianyar",-8.543,115.326], ["Tabanan",-8.538,115.125], ["Buleleng",-8.112,115.088],
  ["Singaraja",-8.112,115.088], ["Mataram",-8.5833,116.1167], ["Lombok",-8.65,116.3242], ["Bima",-8.46,118.7267],
  ["Kupang",-10.1772,123.607], ["Medan",3.5952,98.6722], ["Binjai",3.6001,98.4854], ["Deli Serdang",3.42,98.7],
  ["Pematangsiantar",2.9595,99.0687], ["Padang",-0.9471,100.4172], ["Bukittinggi",-0.3055,100.3691], ["Payakumbuh",-0.2298,100.633],
  ["Pekanbaru",0.5071,101.4478], ["Dumai",1.6667,101.45], ["Batam",1.0456,104.0305], ["Tanjungpinang",0.9186,104.4665],
  ["Palembang",-2.9761,104.7754], ["Prabumulih",-3.4333,104.2333], ["Jambi",-1.6101,103.6131], ["Bengkulu",-3.7928,102.2608],
  ["Bandar Lampung",-5.3971,105.2668], ["Metro",-5.1131,105.3068], ["Banda Aceh",5.5483,95.3238], ["Lhokseumawe",5.1801,97.1507],
  ["Langsa",4.4683,97.9683], ["Pontianak",-0.0263,109.3425], ["Singkawang",0.906,108.985], ["Banjarmasin",-3.3194,114.5908],
  ["Banjarbaru",-3.4572,114.8112], ["Balikpapan",-1.2379,116.8529], ["Samarinda",-0.5022,117.1536], ["Bontang",0.1327,117.49],
  ["Tarakan",3.3273,117.5914], ["Palangkaraya",-2.2096,113.9108], ["Makassar",-5.1477,119.4327], ["Gowa",-5.3167,119.75],
  ["Maros",-5.0089,119.5722], ["Parepare",-4.0135,119.6255], ["Palopo",-2.9925,120.197], ["Kendari",-3.9985,122.5129],
  ["Palu",-0.8917,119.8707], ["Gorontalo",0.5435,123.0568], ["Manado",1.4748,124.8421], ["Bitung",1.44,125.12],
  ["Tomohon",1.33,124.84], ["Ambon",-3.6954,128.1814], ["Ternate",0.79,127.3667], ["Sorong",-0.8762,131.2558],
  ["Manokwari",-0.8615,134.062], ["Jayapura",-2.533,140.718], ["Merauke",-8.4932,140.4018], ["Timika",-4.55,136.8833]
];

const _toRad = d => d * Math.PI / 180;
function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = _toRad(bLat - aLat), dLng = _toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(_toRad(aLat)) * Math.cos(_toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Strip "Kota "/"Kab. " prefixes so "Kab. Bandung" matches "Bandung". */
function normCityName(s) {
  return String(s || '').trim()
    .replace(/^(kota|kab\.?|kabupaten)\s+/i, '')
    .trim();
}

function findCityCoords(name) {
  const n = normCityName(name).toLowerCase();
  if (!n) return null;
  let hit = ID_CITIES.find(c => c[0].toLowerCase() === n);
  if (!hit) hit = ID_CITIES.find(c => c[0].toLowerCase().startsWith(n));
  if (!hit) hit = ID_CITIES.find(c => c[0].toLowerCase().includes(n));
  return hit ? { name: hit[0], lat: hit[1], lng: hit[2] } : null;
}

/**
 * Resolve any typed city to a bucket we actually hold data for.
 * Returns { bucket, typed, nearest, distanceKm, exact } — `exact` false means
 * the caller should tell the user whose data they are looking at.
 */
function resolveNearestCityBucket(typed) {
  const buckets = NU_ONB_LOCATIONS;
  const n = normCityName(typed);
  if (!n) return { bucket: '', typed: '', exact: true };
  const direct = buckets.find(b => b.toLowerCase() === n.toLowerCase());
  if (direct) return { bucket: direct, typed: n, nearest: direct, distanceKm: 0, exact: true };
  const alias = typeof REGION_ALIASES === 'object' && REGION_ALIASES
    ? REGION_ALIASES[n.toLowerCase()] : null;
  if (alias && buckets.includes(alias)) {
    return { bucket: alias, typed: n, nearest: alias, distanceKm: 0, exact: true };
  }
  const src = findCityCoords(n);
  if (!src) return { bucket: '', typed: n, exact: false };
  let best = null;
  buckets.forEach(b => {
    const c = findCityCoords(b);
    if (!c) return;
    const d = haversineKm(src.lat, src.lng, c.lat, c.lng);
    if (!best || d < best.distanceKm) best = { bucket: b, nearest: b, distanceKm: d };
  });
  if (!best) return { bucket: '', typed: n, exact: false };
  return { ...best, typed: n, exact: false };
}

/** Cities matching a typed prefix, for the autocomplete list. */
function suggestCities(q, limit = 8) {
  const n = normCityName(q).toLowerCase();
  if (!n) return ID_CITIES.slice(0, limit).map(c => c[0]);
  const starts = [], contains = [];
  for (const c of ID_CITIES) {
    const l = c[0].toLowerCase();
    if (l.startsWith(n)) starts.push(c[0]);
    else if (l.includes(n)) contains.push(c[0]);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

const CITY_LOCATIONS = {
  Jakarta: [
    'Jakarta Barat', 'Jakarta Timur', 'Jakarta Selatan', 'Jakarta Utara', 'Jakarta Pusat',
    'Kota Tangerang', 'Tangerang Selatan', 'Kab. Tangerang', 'Tangerang',
    'Kota Bekasi', 'Kab. Bekasi', 'Bekasi',
    'Kota Depok', 'Depok', 'Kota Bogor', 'Kab. Bogor', 'Bogor',
  ],
  Bekasi: ['Kota Bekasi', 'Kab. Bekasi', 'Bekasi', 'Jakarta Timur', 'Jakarta Utara', 'Cikarang'],
  Depok: ['Kota Depok', 'Depok', 'Jakarta Selatan', 'Bogor', 'Kota Bogor', 'Kab. Bogor'],
  Tangerang: ['Kota Tangerang', 'Tangerang Selatan', 'Kab. Tangerang', 'Tangerang', 'Jakarta Barat'],
  Bogor: ['Kota Bogor', 'Kab. Bogor', 'Bogor', 'Depok', 'Kota Depok'],
  Bandung: ['Bandung', 'Kota Bandung', 'Kab. Bandung', 'Kab. Bandung Barat', 'Cimahi', 'Kota Cimahi'],
  Semarang: ['Semarang', 'Kota Semarang', 'Kab. Semarang'],
  Yogyakarta: ['Yogyakarta', 'Kota Yogyakarta', 'Sleman', 'Kab. Sleman', 'Bantul', 'Kab. Bantul'],
  Surabaya: ['Surabaya', 'Sidoarjo', 'Kab. Sidoarjo', 'Gresik', 'Kab. Gresik'],
  Sidoarjo: ['Sidoarjo', 'Kab. Sidoarjo', 'Surabaya', 'Gresik', 'Kab. Gresik'],
  Medan: ['Medan', 'Kota Medan', 'Kab. Deli Serdang'],
  Makassar: ['Makassar', 'Kota Makassar'],
  Palembang: ['Palembang', 'Kota Palembang'],
  Denpasar: ['Denpasar', 'Kota Denpasar', 'Badung', 'Kab. Badung'],
};

function expandCityLocations(city) {
  if (!city) return [];
  return CITY_LOCATIONS[city] || [city];
}

// Province / English region → city buckets → exact Shopee location strings.
const REGION_ALIASES = {
  'jawa barat': { label: 'Jawa Barat', cities: ['Bekasi', 'Depok', 'Bogor', 'Bandung'] },
  'west java': { label: 'Jawa Barat', cities: ['Bekasi', 'Depok', 'Bogor', 'Bandung'] },
  'jawa tengah': { label: 'Jawa Tengah', cities: ['Semarang'] },
  'central java': { label: 'Jawa Tengah', cities: ['Semarang'] },
  'jawa timur': { label: 'Jawa Timur', cities: ['Surabaya', 'Sidoarjo'] },
  'east java': { label: 'Jawa Timur', cities: ['Surabaya', 'Sidoarjo'] },
  'di yogyakarta': { label: 'DI Yogyakarta', cities: ['Yogyakarta'] },
  'yogyakarta': { label: 'DI Yogyakarta', cities: ['Yogyakarta'] },
  'dki jakarta': { label: 'DKI Jakarta', cities: ['Jakarta'] },
  'sumatera utara': { label: 'Sumatera Utara', cities: ['Medan'] },
  'north sumatra': { label: 'Sumatera Utara', cities: ['Medan'] },
  'sumatera selatan': { label: 'Sumatera Selatan', cities: ['Palembang'] },
  'sulawesi selatan': { label: 'Sulawesi Selatan', cities: ['Makassar'] },
  'bali': { label: 'Bali', cities: ['Denpasar'] },
};

function expandRegionLocations(aliasKey) {
  const meta = REGION_ALIASES[aliasKey];
  if (!meta) return [];
  const out = [];
  const seen = new Set();
  for (const city of meta.cities) {
    for (const loc of expandCityLocations(city)) {
      const k = String(loc).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(loc);
    }
  }
  return out;
}

/** Rewrite English material words to catalog-friendly Indonesian terms. */
function normalizeMaterialQuery(text) {
  let t = String(text || '');
  const pairs = [
    [/\bwooden\b/gi, 'kayu'],
    [/\bwood\b/gi, 'kayu'],
    [/\bbamboo\b/gi, 'bambu'],
    [/\brattan\b/gi, 'rotan'],
    [/\bglass\b/gi, 'kaca'],
    [/\bplastic\b/gi, 'plastik'],
  ];
  for (const [re, rep] of pairs) t = t.replace(re, rep);
  return t.replace(/[^a-zA-Z0-9\u00C0-\u024F\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pull city OR province from free text (EN/ID), return locations for .in()
 * plus a cleaned search string (region phrases stripped, materials normalized).
 */
function parsePlaceFromQuery(text) {
  let working = String(text || '');
  const lower = working.toLowerCase();
  // Longer region aliases first
  const aliases = Object.keys(REGION_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const esc = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`\\b(?:di|dari|kota|daerah|sekitar|buatan|asal|made\\s+in|from|in)\\s+${esc}\\b|\\b${esc}\\b`, 'i');
    if (!re.test(lower)) continue;
    working = working.replace(re, ' ');
    working = working.replace(/\b(made\s+in|from|buatan|asal)\b/gi, ' ');
    const cleaned = normalizeMaterialQuery(
      working
        .replace(/\b(how about|what about|what if|bagaimana kalau|gimana kalau|alternatif|instead|rather than|a|an|the|product|produk|barang|please|maybe|mungkin|yang|dengan)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    return {
      label: REGION_ALIASES[alias].label,
      city: '',
      locations: expandRegionLocations(alias),
      cleaned: cleaned || normalizeMaterialQuery(text),
    };
  }
  // City via existing helpers
  const cityHit = cityMentionedIn(lower);
  if (cityHit) {
    const re = new RegExp(`\\b(?:di|dari|kota|daerah|sekitar|made\\s+in|from|in)\\s+(kota\\s+)?${cityHit.toLowerCase()}\\b|\\b${cityHit.toLowerCase()}\\b`, 'i');
    working = working.replace(re, ' ');
    const cleaned = normalizeMaterialQuery(
      working
        .replace(/\b(how about|what about|what if|bagaimana kalau|gimana kalau|alternatif|instead|a|an|the|product|produk|barang|please|maybe|mungkin)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    return {
      label: cityHit,
      city: cityHit,
      locations: expandCityLocations(cityHit),
      cleaned: cleaned || normalizeMaterialQuery(text),
    };
  }
  const legacy = parseCityFromQuery(text);
  if (legacy.city) {
    return {
      label: legacy.city,
      city: legacy.city,
      locations: expandCityLocations(legacy.city),
      cleaned: normalizeMaterialQuery(legacy.cleaned),
    };
  }
  return {
    label: '',
    city: '',
    locations: [],
    cleaned: normalizeMaterialQuery(text),
  };
}

/**
 * User is exploring an ALTERNATIVE product (material / region / "how about…"),
 * not asking a material Q about the open Deep Dive listing.
 */
function isAltProductAsk(lower) {
  const s = String(lower || '');
  if (/\b(how about|what about|what if|instead(?:\s+of)?|rather than|alternatif|bagaimana kalau|gimana kalau|kalau (?:jual|pakai|pake|bikin)|coba yang|mungkin yang|bagaimana dengan|gimana dengan)\b/.test(s)) {
    return true;
  }
  // "wood product from West Java" / "produk kayu dari Bandung" — new candidate, not "is THIS wood?"
  const asksOtherProduct = /\b(produk|product|barang|jualan)\b/.test(s)
    && !/\b(ini|this|that|bahannya|material(?:nya)?|terbuat|made of|is it)\b/.test(s);
  const hasMaterial = /\b(kayu|wood|wooden|bambu|bamboo|rotan|rattan|kaca|glass|plastik|plastic|stainless|besi)\b/.test(s);
  const hasPlace = !!cityMentionedIn(s)
    || Object.keys(REGION_ALIASES).some((a) => new RegExp(`\\b${a.replace(/\s+/g, '\\s+')}\\b`).test(s));
  if (asksOtherProduct && (hasMaterial || hasPlace)) return true;
  if (hasMaterial && hasPlace && !/\b(ini|this|bahannya|material(?:nya)?|terbuat|made of)\b/.test(s)) return true;
  return false;
}

function locMatches(loc, locations) {
  const l = String(loc || '').toLowerCase();
  if (!l || !locations.length) return false;
  return locations.some(h => l.includes(String(h).toLowerCase()) || String(h).toLowerCase().includes(l));
}

function catMatches(cat, cats) {
  const c = String(cat || '').toLowerCase().trim();
  if (!c || !cats?.length) return false;
  return cats.some(wanted => {
    const w = String(wanted).toLowerCase().trim();
    if (!w) return false;
    if (c === w) return true;
    if (c.includes(w) || w.includes(c)) return true;
    const w0 = w.split(/[\s&/]+/)[0];
    const c0 = c.split(/[\s&/]+/)[0];
    return w0 && c0 && (c0 === w0 || c.includes(w0));
  });
}

// True when a listing belongs to a category sub-group — matches its scrape
// keyword or product name against the sub-group's term list.
function subgroupMatches(row, terms) {
  if (!terms?.length) return true;
  const hay = ((row.keyword || '') + ' ' + (row.product_name || '')).toLowerCase();
  return terms.some(t => hay.includes(t));
}

function asListingProduct(r) {
  // Only keep a real period rate (naik_daun / trending / scrape delta) on
  // sold_per_day — it drives sorting, scoring and "sold/hari". Never invent one
  // from lifetime totals here. Omset gets a labelled *estimate* separately via
  // estOmsetBulan()/soldPerDayEst() so it can fill in for bucketed listings.
  const spd = Number(r.sold_per_day);
  return {
    ...r,
    sold_per_day: Number.isFinite(spd) && spd > 0 ? spd : null,
    age_days: r.age_days != null ? r.age_days : null,
  };
}

async function fetchListingsCityCat(locations, cats, limit = 80) {
  if (!_supabase || !locations.length) return [];
  try {
    let q = _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date')
      .in('location', locations)
      .order('total_sold', { ascending: false })
      .limit(limit);
    if (cats.length) q = q.in('category', cats);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(asListingProduct);
  } catch (_) { return []; }
}

async function fetchNaikDaunCityCat(locations, cats, limit = 80) {
  if (!_supabase) return [];
  try {
    let q = _supabase.from('mv_naik_daun')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,age_days,sold_per_day')
      .order('sold_per_day', { ascending: false })
      .limit(limit);
    if (locations.length) q = q.in('location', locations);
    if (cats.length) q = q.in('category', cats);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  } catch (_) { return []; }
}

async function fetchNaikDaunByCat(cats, limit = 120) {
  if (!_supabase || !cats.length) return [];
  try {
    const { data } = await _supabase.from('mv_naik_daun')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,age_days,sold_per_day')
      .in('category', cats)
      .order('sold_per_day', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (_) { return []; }
}

async function fetchNaikDaunGlobal(limit = 60) {
  if (!_supabase) return [];
  const { data } = await _supabase.from('mv_naik_daun')
    .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,age_days,sold_per_day')
    .order('sold_per_day', { ascending: false }).limit(limit);
  return data || [];
}

// ── Trending (mv_trending: real WoW sold deltas from listings history) ───
// listing_deltas is stale (pipeline stopped Jun 10) — mv_trending computes
// deltas straight from listings scrape snapshots, anchored to the last scrape.
let _trendingRows = null;
let _trendingAnchor = null;

async function fetchTrending() {
  if (_trendingRows) return _trendingRows;
  if (!_supabase) return [];
  try {
    const { data, error } = await _supabase.from('mv_trending')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,delta_7d,delta_prev_7d,delta_14d,delta_prev_14d,delta_30d,anchor_at')
      .order('delta_7d', { ascending: false })
      .limit(300);
    if (error) throw error;
    _trendingRows = data || [];
    _trendingAnchor = _trendingRows[0]?.anchor_at || null;
    return _trendingRows;
  } catch (_) { return []; }
}

function fmtAnchorDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  } catch (_) { return String(iso).slice(0, 10); }
}

const TREND_RANGES = {
  '7d':  { label: 'Minggu Ini',        delta: 'delta_7d'  },
  '14d': { label: '2 Minggu Terakhir', delta: 'delta_14d' },
  '30d': { label: '1 Bulan Terakhir',  delta: 'delta_30d' },
};

// Scrape cadence is too sparse for true prev-week comparisons (most items
// lack a snapshot in BOTH adjacent weeks), so "kenaikan" = growth of total
// sold within the period vs the cumulative baseline before it. Real and
// computable for every row; labeled as such in the card footnote.
function trendGrowthPct(row, deltaKey) {
  const d = Number(row[deltaKey]) || 0;
  if (d <= 0) return null;
  const base = (Number(row.total_sold) || 0) - d;
  if (base < 50) return Infinity; // essentially a brand-new listing → "Baru"
  return Math.round(d / base * 100);
}

function pctHtml(pct) {
  if (pct == null) return '<span class="pct-flat">—</span>';
  if (pct === Infinity) return '<span class="pct-up">Baru</span>';
  if (pct <= 0) return `<span class="pct-flat">${pct}%</span>`;
  return `<span class="pct-up">${ico('arrowUp', 11)} ${pct}%</span>`;
}

function computeTrendingView(rows, range) {
  const cfg = TREND_RANGES[range];
  const active = rows.filter(r => (Number(r[cfg.delta]) || 0) > 0);
  const items = active.slice()
    .sort((a, b) => (Number(b[cfg.delta]) || 0) - (Number(a[cfg.delta]) || 0))
    .slice(0, 20)
    .map(r => ({ ...r, _delta: Number(r[cfg.delta]) || 0, _pct: trendGrowthPct(r, cfg.delta) }));

  const catD = new Map(), catB = new Map();
  for (const r of active) {
    const c = (r.category || 'Lainnya').trim() || 'Lainnya';
    const d = Number(r[cfg.delta]) || 0;
    catD.set(c, (catD.get(c) || 0) + d);
    catB.set(c, (catB.get(c) || 0) + Math.max(0, (Number(r.total_sold) || 0) - d));
  }
  const cats = [...catD.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, d]) => {
    const base = catB.get(name) || 0;
    const pct = base >= 50 ? Math.round(d / base * 100) : (d > 0 ? Infinity : null);
    return { name, delta: d, pct };
  });
  const maxCat = Math.max(...cats.map(c => c.delta), 1);
  cats.forEach(c => { c.bar = Math.max(4, Math.round(c.delta / maxCat * 100)); });

  const pcts = items.map(i => i._pct).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  return {
    range, cfg, items, cats,
    tiles: {
      medPct: pcts.length ? pcts[Math.floor(pcts.length / 2)] : null,
      rising: active.length,
      catsMoving: catD.size,
      shops: new Set(active.map(r => String(r.shop_id))).size,
      units: active.reduce((s, r) => s + (Number(r[cfg.delta]) || 0), 0),
    },
  };
}

function trendingInsights(view) {
  const out = [];
  if (view.cats[0]) {
    const c2 = view.cats[1] ? ` dan ${view.cats[1].name.toLowerCase()}` : '';
    out.push(`Produk ${view.cats[0].name.toLowerCase()}${c2} mendominasi kenaikan penjualan periode ini.`);
  }
  const top = view.items[0];
  if (top) out.push(`${(top.product_name || '').slice(0, 48)} naik paling kencang: +${fmtSold(top._delta)} unit terjual.`);
  const prices = view.items.map(i => Number(i.price) || 0).filter(Boolean).sort((a, b) => a - b);
  if (prices.length >= 5) {
    const lo = prices[Math.floor(prices.length * 0.25)], hi = prices[Math.floor(prices.length * 0.75)];
    out.push(`Sebagian besar produk trending ada di rentang harga ${fmtRp(lo)} – ${fmtRp(hi)}.`);
  }
  return out;
}

function trendingRowHtml(r, i) {
  const key = `${esc(r.item_id)}|${esc(r.shop_id)}`;
  return `<tr data-titem="${key}" tabindex="0" role="button" aria-label="Lihat analisa ${(r.product_name || 'produk').slice(0, 40)}">
    <td class="tr-rank">${i + 1}</td>
    <td><div class="tr-prod">${r.image_url ? `<img src="${esc(r.image_url)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div><div class="tr-prod-name">${esc((r.product_name || '').slice(0, 60))}</div><div class="tr-prod-cat">${esc(r.category || '')}</div></div></div></td>
    <td>${pctHtml(r._pct)}</td>
    <td><span class="pct-up">${ico('arrowUp', 11)} ${fmtSold(r._delta)}</span></td>
    <td>${fmtRp(r.price)}</td>
    <td><button type="button" class="btn-outline" data-titem="${key}">Lihat Analisis</button></td>
  </tr>`;
}

function trendingBodyHtml(view, expanded) {
  const t = view.tiles;
  const shown = expanded ? view.items : view.items.slice(0, 5);
  const insights = trendingInsights(view);
  return `
    <div class="stat-tiles">
      <div class="stat-tile"><span class="stat-ico green">${ico('trendUp', 15)}</span><span class="stat-val">${t.medPct != null ? `+${t.medPct}%` : '—'}</span><span class="stat-lbl">Median kenaikan penjualan produk trending</span></div>
      <div class="stat-tile"><span class="stat-ico blue">${ico('arrowUp', 15)}</span><span class="stat-val">${t.rising.toLocaleString('id-ID')}</span><span class="stat-lbl">Produk dengan penjualan naik</span></div>
      <div class="stat-tile"><span class="stat-ico violet">${ico('box', 15)}</span><span class="stat-val">${t.catsMoving.toLocaleString('id-ID')}</span><span class="stat-lbl">Kategori ikut bergerak</span></div>
      <div class="stat-tile"><span class="stat-ico amber">${ico('store', 15)}</span><span class="stat-val">${t.shops.toLocaleString('id-ID')}</span><span class="stat-lbl">Toko aktif ikut menjual</span></div>
      <div class="stat-tile"><span class="stat-ico pink">${ico('users', 15)}</span><span class="stat-val">${fmtSold(t.units)}</span><span class="stat-lbl">Unit terjual periode ini (est.)</span></div>
    </div>
    <div class="ans-cols">
      <div class="ans-panel">
        <h4>Top ${shown.length} Produk Trending</h4>
        <div class="ans-table-wrap"><table class="tr-table">
          <thead><tr><th>#</th><th>Produk</th><th>Kenaikan Penjualan</th><th>Unit Terjual</th><th>Harga</th><th>Aksi</th></tr></thead>
          <tbody>${shown.map((r, i) => trendingRowHtml(r, i)).join('')}</tbody>
        </table></div>
        ${view.items.length > 5 && !expanded ? `<button type="button" class="ans-cta" data-expand-trending>Lihat Semua ${view.items.length} Produk Trending</button>` : ''}
      </div>
      <div>
        <div class="ans-panel">
          <h4>Kategori Paling Trending</h4>
          ${view.cats.map((c, i) => `<div class="cat-row"><span class="tr-rank">${i + 1}</span><span class="nm">${esc(c.name)}</span>${pctHtml(c.pct)}<div class="mini-track"><div class="mini-fill" style="width:${c.bar}%"></div></div></div>`).join('') || '<p class="dd-sub">Belum ada data kategori.</p>'}
        </div>
        <div class="insight-card">
          <h4>${ico('spark', 15)} Insight LarisID</h4>
          <ul>${insights.map(s => `<li>${ico('spark', 12)}<span>${esc(s)}</span></li>`).join('')}</ul>
        </div>
      </div>
    </div>
    <div class="ans-foot">Kenaikan = tambahan penjualan periode ini dibanding total penjualan sebelumnya · dihitung dari panel scrape LarisID</div>`;
}

function trendingCardHtml(view) {
  return `<div class="ans-card" data-trend-card data-range="${view.range}" data-expanded="0">
    <div class="ans-head">
      <span class="ans-head-ico">${ico('flame', 18)}</span>
      <div>
        <div class="ans-title">Produk Trending — ${esc(view.cfg.label)}</div>
        <div class="ans-sub">Data diambil dari Shopee Indonesia • Update: ${esc(fmtAnchorDate(_trendingAnchor))}</div>
      </div>
    </div>
    <div class="ans-tabs">${Object.entries(TREND_RANGES).map(([k, c]) => `<button type="button" class="ans-tab${k === view.range ? ' active' : ''}" data-trange="${k}">${esc(c.label)}</button>`).join('')}</div>
    <div data-trend-body>${trendingBodyHtml(view, false)}</div>
  </div>`;
}

function updateThreadWide() {
  document.body.classList.toggle('thread-wide', !!document.querySelector('#chat-thread .ans-card'));
}

function bindTrendingBody(card) {
  card.querySelector('[data-expand-trending]')?.addEventListener('click', () => {
    void card.__rerender(card.dataset.range, true);
  });
  const openTrendItem = async (key) => {
    if (!key) return;
    const [item_id, shop_id] = key.split('|');
    const rows = await fetchTrending();
    const r = rows.find(x => String(x.item_id) === String(item_id) && String(x.shop_id) === String(shop_id));
    if (!r) return;
    // Cap absurd raw matview deltas (bucket floor jumps) before using as period rate.
    // soldPerDayEst also derives this from delta_7d for card omset; set it here so
    // deep-dive tiles / sold-per-day labels see the same period rate.
    const d7 = Math.max(0, Number(r.delta_7d) || 0);
    const spd = d7 > 0 ? Math.min(d7 / 7, DD_MAX_SOLD_PER_DAY) : null;
    void openDeepDive(asListingProduct({ ...r, sold_per_day: spd }));
  };
  card.querySelectorAll('tr[data-titem]').forEach(tr => {
    tr.addEventListener('click', (e) => {
      // Button inside the row also has data-titem — either path opens the same item.
      const key = e.target.closest('[data-titem]')?.getAttribute('data-titem') || tr.getAttribute('data-titem');
      void openTrendItem(key);
    });
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void openTrendItem(tr.getAttribute('data-titem'));
      }
    });
  });
}

function bindTrendingCards(root) {
  (root || document).querySelectorAll('[data-trend-card]').forEach(card => {
    if (card.dataset.bound) return;
    card.dataset.bound = '1';
    card.__rerender = async (range, expanded) => {
      const rows = await fetchTrending();
      if (!rows.length) return;
      const view = computeTrendingView(rows, range);
      card.dataset.range = range;
      card.dataset.expanded = expanded ? '1' : '0';
      const title = card.querySelector('.ans-title');
      if (title) title.textContent = `Produk Trending — ${view.cfg.label}`;
      card.querySelectorAll('[data-trange]').forEach(b => b.classList.toggle('active', b.getAttribute('data-trange') === range));
      const body = card.querySelector('[data-trend-body]');
      if (body) { body.innerHTML = trendingBodyHtml(view, expanded); bindTrendingBody(card); }
    };
    card.querySelectorAll('[data-trange]').forEach(btn => {
      btn.addEventListener('click', () => {
        clarityEvt('gpt_trending_tab', { range: btn.getAttribute('data-trange') });
        void card.__rerender(btn.getAttribute('data-trange'), false);
      });
    });
    bindTrendingBody(card);
  });
}

// ── Intent routing (chips + free text → data-backed answers) ─────────────
function detectIntent(lower) {
  // Broad category discovery (“fashion trending”) should not be swallowed by
  // the global trending chip — specific nouns (“dresses”) still fall through.
  if (detectCategoryFromText(lower) && isProductDiscoveryAsk(lower)
      && isCategoryLevelAsk(lower, detectCategoryFromText(lower))) return null;
  if (/trending|naik daun|lagi (rame|ramai)|produk (yang )?(lagi )?naik|lagi naik/.test(lower)) return 'trending';
  if (/kompetisi rendah|persaingan rendah|belum banyak (penjual|saingan)|cari niche/.test(lower)) return 'lowcomp';
  if (/(hitung|estimasi|berapa).{0,24}(profit|untung|margin)|^profit\b/.test(lower)) return 'profit';
  if (/modal\s*(rp\.?\s*)?[\d]|modal (kecil|terbatas)/.test(lower)) return 'modal';
  if (/bandingkan|\bvs\b|dibanding/.test(lower)) return 'bandingkan';
  if (/rencana (jualan|launch)/.test(lower)) return 'rencana';
  return null;
}

// Same daily-limit rules as the search path: server RPC when signed in,
// anon localStorage bump otherwise. Pass skipAnonBump for free landing-finder runs.
async function ensureIntentChat(chat, title, context, opts = {}) {
  if (currentUser && _supabase && !chat.id) {
    const { data } = await _supabase.rpc('gpt_new_chat', { p_title: String(title).slice(0, 60), p_context: context });
    if (data) noteGptUsage(data);
    if (data?.allowed === false) return { ok: false, resetAt: data.reset_at };
    if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; flushChatMessages(chat); }
  } else if (!currentUser && !opts.skipAnonBump) {
    bumpAnonSearch();
  }
  return { ok: true };
}

function limitReply(loading, resetAt) {
  const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(resetAt || wibMidnightReset())}.`;
  if (loading) void revealAssistant(loading, `<p>${esc(msg)}</p>`, { instant: true });
  showToast(msg);
  gptLimitHit({ resetAt });
}

function extractMoney(text) {
  const out = [];
  const re = /([\d][\d.,]*)\s*(rb|ribu|k|jt|juta)?/g;
  let m;
  while ((m = re.exec(String(text).toLowerCase()))) {
    let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
    if (!isFinite(n) || n <= 0) continue;
    const u = m[2] || '';
    if (u === 'rb' || u === 'ribu' || u === 'k') n *= 1e3;
    else if (u === 'jt' || u === 'juta') n *= 1e6;
    out.push(Math.round(n));
  }
  return out;
}

function parseBudget(text) {
  const m = String(text).toLowerCase().match(/modal[^0-9]{0,12}([\d.,]+)\s*(rb|ribu|k|jt|juta)?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n) || n <= 0) return 0;
  const unit = m[2] || '';
  if (unit === 'rb' || unit === 'ribu' || unit === 'k') n *= 1e3;
  else if (unit === 'jt' || unit === 'juta') n *= 1e6;
  else if (n < 1000) n *= 1e3; // "modal 500" → 500rb
  return Math.round(n);
}

async function handleIntent(intent, text) {
  abortAssistantStream();
  setView('chat');
  // Market intents never belong inside a product Deep Dive thread.
  let chat = activeChat();
  if (chat?.context?.product || chat?.context?.kind === 'product') {
    beginFreshChat();
    chat = null;
  }
  if (!chat) {
    chat = { localId: 'local_' + Date.now(), title: text.slice(0, 40), context: {}, messages: [], created_at: Date.now() };
    state.chats.unshift(chat);
    state.activeChatId = chat.localId;
    renderChatList();
  }
  appendBubble('user', `<p>${esc(text)}</p>`);
  pushMessage(chat, 'user', text);
  void logUserEvent('gpt_message_sent', { ui: 'gpt' });
  clarityEvt('gpt_message_sent', {});
  void logUserEvent('gpt_intent', { ui: 'gpt', intent });
  clarityEvt('gpt_intent', { intent });

  if (intent === 'trending') return handleTrendingIntent(chat);
  if (intent === 'modal') return handleModalIntent(chat, text);
  if (intent === 'lowcomp') return handleLowcompIntent(chat);
  if (intent === 'profit') return handleProfitIntent(chat, text);
  if (intent === 'bandingkan') return handleBandingkanIntent(chat, text);
  if (intent === 'rencana') return handleRencanaIntent(chat);
}

async function handleTrendingIntent(chat) {
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menghitung tren dari data scrape…</p>`);
  const rows = await fetchTrending();
  const gate = await ensureIntentChat(chat, 'Produk Trending', { kind: 'trending' });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  let html;
  let ndTypes = [];
  if (!rows.length) {
    const nd = mergePool([], await fetchNaikDaunGlobal(60));
    ndTypes = await typesForListings(nd, '', 6);
    state.recommendations = [];
    html = ndTypes.length
      ? `<p>Data tren mingguan belum tersedia — ini pasar yang lagi naik daun dari data LarisID:</p><div class="card-grid">${marketCardsHtml(ndTypes)}</div>`
      : `<p>Data tren belum tersedia. Coba lagi nanti.</p>`;
  } else {
    const view = computeTrendingView(rows, '7d');
    html = `<p>Berikut produk yang sedang trending di Shopee berdasarkan peningkatan penjualan — dari data scrape LarisID, bukan tebakan AI.</p>${trendingCardHtml(view)}`;
  }
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Produk trending',
    kind: 'trending',
    types: ndTypes.map(t => t.keyword),
  }, html);
  bindTypeCards();
  bindTrendingCards();
  updateThreadWide();
  setComposerChips(TRENDING_CHIPS, 'trending');
  void logUserEvent('discover_view', { ui: 'gpt', kind: 'trending' });
  clarityEvt('gpt_trending_view', {});
}

async function handleModalIntent(chat, text) {
  const budget = parseBudget(text);
  if (!budget) {
    const html = `<p>Berapa modal kamu per unit? Contoh: <strong>“Cari produk modal 50rb”</strong> atau <strong>“produk modal 1jt”</strong>.</p>`;
    await appendAssistantStream(html);
    pushMessage(chat, 'assistant', { text: 'Tanya modal' }, html);
    return;
  }
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk laris di bawah ${fmtRp(budget)}…</p>`);
  let rows = [];
  try {
    const { data } = await _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date')
      .gte('price', 1000).lte('price', budget)
      .gt('total_sold', 100)
      .order('total_sold', { ascending: false })
      .limit(30);
    rows = (data || []).map(asListingProduct);
  } catch (_) {}
  const gate = await ensureIntentChat(chat, `Modal ${fmtRp(budget)}`, { kind: 'modal', budget });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  const top = mergePool([], rows);
  const types = await typesForListings(top, '', 6);
  state.recommendations = [];
  const html = types.length
    ? `<p>Pasar dengan harga di bawah <strong>${fmtRp(budget)}</strong> — dari data Shopee LarisID:</p><div class="card-grid">${marketCardsHtml(types)}</div>`
    : `<p>Belum ketemu pasar laris di bawah ${fmtRp(budget)}. Coba angka lain.</p>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', { text: 'Hasil modal', budget, level: 'pasar', types: types.map(t => t.keyword) }, html);
  bindTypeCards();
}

async function handleLowcompIntent(chat) {
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari niche kompetisi rendah…</p>`);
  let rows = [];
  try {
    const { data } = await _supabase.from('mv_niche_breakout')
      .select('keyword,new_items,breakouts,breakout_rate,median_winner_price')
      .gte('new_items', 15).lte('new_items', 60)
      .order('breakout_rate', { ascending: false })
      .limit(8);
    rows = data || [];
  } catch (_) {}
  const gate = await ensureIntentChat(chat, 'Kompetisi rendah', { kind: 'lowcomp' });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  const html = rows.length
    ? `<p>Niche dengan kompetisi relatif rendah tapi peluang tembus tinggi — dari data breakout LarisID:</p>
       <div class="ans-panel" style="margin-top:12px"><div class="ans-table-wrap"><table class="tr-table">
       <thead><tr><th>Keyword</th><th>Peluang tembus</th><th>Produk baru</th><th>Harga pemenang</th><th></th></tr></thead>
       <tbody>${rows.map(r => `<tr><td><strong>${esc(r.keyword)}</strong></td><td><span class="pct-up">${Math.round(Number(r.breakout_rate) || 0)}%</span></td><td>${r.new_items}</td><td>${r.median_winner_price ? fmtRp(r.median_winner_price) : '—'}</td><td><button type="button" class="btn-outline" data-kwsearch="${esc(r.keyword)}">Lihat produk</button></td></tr>`).join('')}</tbody>
       </table></div></div>`
    : `<p>Belum ada data niche. Coba lagi nanti.</p>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', { text: 'Niche kompetisi rendah', kind: 'lowcomp' }, html);
  loading.querySelectorAll('[data-kwsearch]').forEach(btn => {
    btn.addEventListener('click', () => void handleComposerSubmit(`Cari produk ${btn.getAttribute('data-kwsearch')}`));
  });
}

const MARKETPLACE_FEE = 0.08; // asumsi biaya marketplace, dilabel di UI

// ── Kalkulator profit (sama rumus Mulai Berjualan) ────────────────────────
const GPT_KALC_MPS = {
  shopee_fashion:     { label: 'Shopee Fashion',    comm: 0.10,   svc: 0.02, tax: 0.005, freeship: 1,   ship: 9000 },
  shopee_electronics: { label: 'Shopee Elektronik', comm: 0.095,  svc: 0.02, tax: 0.005, freeship: 0.5, ship: 12000 },
  shopee_fmcg:        { label: 'Shopee FMCG',       comm: 0.0675, svc: 0.02, tax: 0.005, freeship: 1,   ship: 8000 },
  tokopedia:          { label: 'Tokopedia',         comm: 0.02,   svc: 0.01, tax: 0.005, freeship: 0,   ship: 10000 },
  tiktok:             { label: 'TikTok Shop',       comm: 0.028,  svc: 0.01, tax: 0.005, freeship: 0.5, ship: 9000 },
};

function gptKalcCompute(inp) {
  const PROC_FEE = 1250;
  const pctSum = inp.comm + inp.svc + inp.tax + inp.ret;
  const commAmt = inp.price * inp.comm;
  const svcAmt = inp.price * inp.svc;
  const taxAmt = inp.price * inp.tax;
  const retAmt = inp.price * inp.ret;
  const shipCost = inp.shipping * inp.freeship;
  const fixedCost = inp.cogs + shipCost + inp.packing + inp.opex + inp.ads + PROC_FEE;
  const totalCost = fixedCost + commAmt + svcAmt + taxAmt + retAmt;
  const profit = inp.price - totalCost;
  const margin = inp.price > 0 ? (profit / inp.price * 100) : 0;
  return { ...inp, PROC_FEE, pctSum, commAmt, svcAmt, taxAmt, retAmt, shipCost, fixedCost, totalCost, profit, margin };
}

function gptKalcPriceForMargin(targetMarginPct, fixedCost, pctSum) {
  const denom = 1 - pctSum - targetMarginPct / 100;
  return denom > 0 ? fixedCost / denom : fixedCost;
}

function gptKalcBepPrice(fixedCost, pctSum) {
  return pctSum < 1 ? fixedCost / (1 - pctSum) : fixedCost;
}

function gptKalcDefaults(opts = {}) {
  const price = Math.round(Number(opts.price) || 0);
  const cogs = Math.round(Number(opts.cogs) || (price ? price * 0.33 : 0));
  const mp = GPT_KALC_MPS.shopee_fashion;
  return {
    price: price || 50000,
    cogs: cogs || 20000,
    shipping: mp.ship,
    packing: 2000,
    opex: 1000,
    ads: Math.max(750, Math.round((price || 50000) * 0.05)),
    adsOn: true,
    marketplace: 'shopee_fashion',
  };
}

function gptKalcHtml(opts = {}) {
  const d = gptKalcDefaults(opts);
  const mpOpts = Object.entries(GPT_KALC_MPS).map(([k, v]) =>
    `<option value="${esc(k)}"${k === d.marketplace ? ' selected' : ''}>${esc(v.label)}</option>`
  ).join('');
  return `
  <div class="gpt-kalc" data-kalc>
    <div class="gpt-kalc-head">
      <h4>Kalkulator Profit</h4>
      <p>Sesuaikan angka di bawah — biaya marketplace, packing, dan iklan ikut terhitung otomatis.</p>
    </div>
    <div class="gpt-kalc-grid">
      <div class="gpt-kalc-field">
        <label>Harga jual</label>
        <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="price" value="${d.price}"></div>
        <div class="hint">Harga yang kamu tetapkan</div>
      </div>
      <div class="gpt-kalc-field">
        <label>Modal produk</label>
        <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="cogs" value="${d.cogs}"></div>
        <div class="hint">≈ 33% harga jual (bisa diubah)</div>
      </div>
      <div class="gpt-kalc-field">
        <label>Marketplace</label>
        <select data-k="marketplace">${mpOpts}</select>
        <div class="hint">Biaya admin terisi otomatis</div>
      </div>
    </div>
    <div class="gpt-kalc-ads">
      <div class="meta"><strong>Biaya iklan</strong><span>Opsional — per pesanan</span></div>
      <label class="gpt-kalc-tog" title="Aktifkan biaya iklan"><input type="checkbox" data-k="adsOn"${d.adsOn ? ' checked' : ''}><i></i></label>
      <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="ads" value="${d.ads}"></div>
    </div>
    <div class="gpt-kalc-hero">
      <div>
        <div class="eyebrow">Uang yang kamu dapat</div>
        <div class="profit" data-out="profit">—</div>
        <span class="margin-pill" data-out="margin-pill">—</span>
        <p class="sent" data-out="sent">—</p>
      </div>
      <div class="gpt-kalc-bd">
        <div><span>Omset / pesanan</span><span data-out="omset">—</span></div>
        <div class="cost"><span>Total biaya</span><span data-out="cost">—</span></div>
        <div><span>Laba bersih</span><span data-out="profit2">—</span></div>
        <div><span>Margin</span><span data-out="margin">—</span></div>
      </div>
    </div>
    <div class="gpt-kalc-recs">
      <div class="gpt-kalc-rec bep"><div class="lbl">Break even</div><div class="sub">Tidak rugi, impas</div><div class="price" data-out="bep">—</div></div>
      <div class="gpt-kalc-rec good"><div class="lbl">Good profit</div><div class="sub">Keuntungan yang baik</div><div class="price" data-out="good">—</div></div>
      <div class="gpt-kalc-rec healthy"><div class="lbl">Healthy margin</div><div class="sub">Margin sehat</div><div class="price" data-out="healthy">—</div></div>
    </div>
    <button type="button" class="gpt-kalc-detail-tog" data-kalc-detail-tog>
      <span data-out="detail-title">Rincian biaya</span>
      <span data-out="detail-chev">▼ Lihat detail</span>
    </button>
    <div class="gpt-kalc-detail" data-kalc-detail>
      <div class="gpt-kalc-items" data-out="items"></div>
      <div class="gpt-kalc-detail-grid">
        <div class="gpt-kalc-field">
          <label>Ongkir (subsidi)</label>
          <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="shipping" value="${d.shipping}"></div>
        </div>
        <div class="gpt-kalc-field">
          <label>Packing</label>
          <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="packing" value="${d.packing}"></div>
        </div>
        <div class="gpt-kalc-field">
          <label>Operasional</label>
          <div class="gpt-kalc-rp"><span>Rp</span><input type="number" min="0" data-k="opex" value="${d.opex}"></div>
        </div>
      </div>
      <p class="gpt-kalc-note">Estimasi saja — biaya bisa berubah sesuai kebijakan platform. Belum termasuk pajak pribadi.</p>
    </div>
  </div>`;
}

function _gptKalcRead(root) {
  const num = (k) => parseFloat(root.querySelector(`[data-k="${k}"]`)?.value) || 0;
  const mpKey = root.querySelector('[data-k="marketplace"]')?.value || 'shopee_fashion';
  const mp = GPT_KALC_MPS[mpKey] || GPT_KALC_MPS.shopee_fashion;
  const adsOn = root.querySelector('[data-k="adsOn"]')?.checked !== false;
  return {
    price: num('price'),
    cogs: num('cogs'),
    shipping: num('shipping'),
    packing: num('packing'),
    opex: num('opex'),
    ads: adsOn ? num('ads') : 0,
    adsOn,
    mpKey,
    comm: mp.comm,
    svc: mp.svc,
    tax: mp.tax,
    freeship: mp.freeship,
    ret: 0.01,
  };
}

function gptKalcRefresh(root) {
  if (!root) return;
  const inp = _gptKalcRead(root);
  const r = gptKalcCompute(inp);
  const set = (k, v) => { const el = root.querySelector(`[data-out="${k}"]`); if (el) el.textContent = v; };
  const profitEl = root.querySelector('[data-out="profit"]');
  const pill = root.querySelector('[data-out="margin-pill"]');
  if (profitEl) {
    profitEl.textContent = fmtRp(r.profit);
    profitEl.classList.toggle('is-neg', r.profit < 0);
  }
  if (pill) {
    pill.textContent = `${r.margin.toFixed(1).replace('.', ',')}% margin`;
    pill.classList.toggle('is-neg', r.profit < 0);
  }
  set('sent', r.profit >= 0
    ? `Dari setiap penjualan, ${fmtRp(r.profit)} bersih masuk ke kantong kamu.`
    : `Estimasi rugi ${fmtRp(Math.abs(r.profit))} per pesanan — cek biaya atau naikkan harga.`);
  set('omset', fmtRp(r.price));
  set('cost', fmtRp(r.totalCost));
  set('profit2', fmtRp(r.profit));
  set('margin', `${r.margin.toFixed(1).replace('.', ',')}%`);
  set('bep', fmtRp(gptKalcBepPrice(r.fixedCost, r.pctSum)));
  set('good', fmtRp(gptKalcPriceForMargin(18, r.fixedCost, r.pctSum)));
  set('healthy', fmtRp(gptKalcPriceForMargin(28, r.fixedCost, r.pctSum)));

  const mp = GPT_KALC_MPS[inp.mpKey] || GPT_KALC_MPS.shopee_fashion;
  set('detail-title', `Rincian biaya di ${mp.label}`);
  const adminPct = ((r.comm + r.svc) * 100).toFixed(1).replace('.', ',');
  const items = [
    { lbl: `Admin & layanan (${adminPct}%)`, val: r.commAmt + r.svcAmt },
    { lbl: 'Gratis ongkir (subsidi)', val: r.shipCost },
    { lbl: 'Proses pesanan', val: r.PROC_FEE },
    { lbl: 'Pajak (PPh final)', val: r.taxAmt },
    { lbl: 'Return / refund', val: r.retAmt },
    { lbl: 'Packing & operasional', val: r.packing + r.opex },
  ];
  if (r.ads > 0) items.push({ lbl: 'Iklan', val: r.ads });
  const itemsEl = root.querySelector('[data-out="items"]');
  if (itemsEl) {
    itemsEl.innerHTML = items.filter(d => d.val > 0).map(d =>
      `<div class="gpt-kalc-item"><div class="lbl">${esc(d.lbl)}</div><div class="val">${fmtRp(d.val)}</div></div>`
    ).join('');
  }
  const adsInp = root.querySelector('[data-k="ads"]');
  if (adsInp) adsInp.disabled = !inp.adsOn;
}

function bindGptKalc(root) {
  (root || document).querySelectorAll('[data-kalc]').forEach(panel => {
    if (panel.dataset.bound === '1') {
      gptKalcRefresh(panel);
      return;
    }
    panel.dataset.bound = '1';
    const onMp = () => {
      const key = panel.querySelector('[data-k="marketplace"]')?.value || 'shopee_fashion';
      const mp = GPT_KALC_MPS[key] || GPT_KALC_MPS.shopee_fashion;
      const ship = panel.querySelector('[data-k="shipping"]');
      if (ship && !ship.dataset.touched) ship.value = String(mp.ship);
      gptKalcRefresh(panel);
    };
    panel.querySelectorAll('input, select').forEach(el => {
      el.addEventListener('input', () => {
        if (el.getAttribute('data-k') === 'shipping') el.dataset.touched = '1';
        if (el.getAttribute('data-k') === 'marketplace') onMp();
        else gptKalcRefresh(panel);
      });
      el.addEventListener('change', () => {
        if (el.getAttribute('data-k') === 'marketplace') onMp();
        else gptKalcRefresh(panel);
      });
    });
    panel.querySelector('[data-kalc-detail-tog]')?.addEventListener('click', () => {
      const body = panel.querySelector('[data-kalc-detail]');
      const chev = panel.querySelector('[data-out="detail-chev"]');
      if (!body) return;
      const open = body.classList.toggle('open');
      if (chev) chev.textContent = open ? '▲ Tutup' : '▼ Lihat detail';
    });
    gptKalcRefresh(panel);
  });
}

function profitTableHtml(rows) {
  return `<div class="ans-panel" style="margin-top:12px"><div class="ans-table-wrap"><table class="tr-table">
    <thead><tr><th>Modal / unit</th><th>Harga jual</th><th>Biaya marketplace ~8%</th><th>Profit / unit</th><th>Margin</th></tr></thead>
    <tbody>${rows.map(r => {
      const fee = Math.round(r.jual * MARKETPLACE_FEE);
      const profit = r.jual - fee - r.modal;
      const mg = r.jual ? Math.round(profit / r.jual * 100) : 0;
      return `<tr><td>${fmtRp(r.modal)}</td><td>${fmtRp(r.jual)}</td><td>${fmtRp(fee)}</td><td><strong style="color:${profit >= 0 ? 'var(--green)' : 'var(--accent)'}">${fmtRp(profit)}</strong></td><td>${mg}%</td></tr>`;
    }).join('')}</tbody>
  </table></div></div>
  <p class="dd-sub" style="margin-top:8px">Hitungan cepat: harga jual − biaya marketplace (asumsi 8%) − modal. Ongkir/packing belum termasuk — pakai kalkulator di bawah untuk angka yang lebih lengkap.</p>`;
}

async function handleProfitIntent(chat, text) {
  const product = state.deepdiveProduct || activeChat()?.context?.product;
  const nums = extractMoney(text).filter(n => n >= 500);
  let html;
  let kalcOpts = {};
  if (nums.length >= 2) {
    const [modal, jual] = nums[0] <= nums[1] ? [nums[0], nums[1]] : [nums[1], nums[0]];
    html = `<p>Estimasi profit per unit:</p>${profitTableHtml([{ modal, jual }])}`;
    kalcOpts = { price: jual, cogs: modal };
  } else if (product && Number(product.price) > 0) {
    const jual = Number(product.price);
    html = `<p>Skenario profit untuk <strong>${esc((product.product_name || '').slice(0, 48))}</strong> di harga jual ${fmtRp(jual)} — tiga asumsi modal (60/70/80% dari harga jual):</p>`
      + profitTableHtml([0.6, 0.7, 0.8].map(f => ({ modal: Math.round(jual * f), jual })));
    kalcOpts = { price: jual, cogs: Math.round(jual * 0.33) };
  } else {
    html = `<p>Isi kalkulator di bawah, atau sebutkan modal dan harga jual — contoh: <strong>“Hitung profit modal 20rb jual 35rb”</strong>.</p>`;
  }
  html += gptKalcHtml(kalcOpts);
  const msg = await appendAssistantStream(html);
  pushMessage(chat, 'assistant', { text: 'Estimasi profit' }, html);
  bindGptKalc(msg || document);
  void logUserEvent('gpt_profit_calc', { ui: 'gpt', has_product: !!product });
}

async function handleBandingkanIntent(chat, text) {
  const lower = String(text).toLowerCase();
  const product = state.deepdiveProduct || activeChat()?.context?.product;
  // “Bandingkan dengan produk lain” → pick from Produk directory (not keyword search).
  if (product && (/produk lain|yang mirip|mirip/.test(lower) || !/\bvs\.?\b/.test(lower))) {
    await startComparePick(product);
    return;
  }
  const cleaned = lower.replace(/bandingkan|dibandingkan|dibanding|dengan produk|dengan/g, ' ');
  const parts = cleaned.split(/\bvs\.?\b|\bdan\b|,|\batau\b/).map(s => _searchTerms(s).join(' ')).filter(Boolean).slice(0, 2);
  if (parts.length < 2) {
    if (product) {
      await startComparePick(product);
      return;
    }
    const html = `<p>Sebutkan dua produk yang mau dibandingkan — contoh: <strong>“Bandingkan tumbler vs botol minum”</strong> — atau buka Deep Dive dulu lalu ketuk <strong>Bandingkan dengan produk lain</strong>.</p>`;
    await appendAssistantStream(html);
    pushMessage(chat, 'assistant', { text: 'Tanya bandingkan' }, html);
    return;
  }
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Membandingkan dari data…</p>`);
  const [a, b] = await Promise.all([searchListings(parts[0], [], 20), searchListings(parts[1], [], 20)]);
  const gate = await ensureIntentChat(chat, `Bandingkan: ${parts[0]} vs ${parts[1]}`, { kind: 'bandingkan', a: parts[0], b: parts[1] });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  const summarize = rows => {
    if (!rows.length) return null;
    const sold = rows.reduce((s, r) => s + (Number(r.total_sold) || 0), 0);
    const prices = rows.map(r => Number(r.price) || 0).filter(Boolean).sort((x, y) => x - y);
    return { sold, median: prices.length ? prices[Math.floor(prices.length / 2)] : 0, n: rows.length, top: rows.slice(0, 3) };
  };
  const sa = summarize(a), sb = summarize(b);
  state.recommendations = [];
  // Each side of a compare is a market too — the numbers above the cards are
  // already keyword-level, so listing cards under them were mixing altitudes.
  const [ta, tb] = await Promise.all([
    typesForListings(sa?.top || [], '', 3),
    typesForListings(sb?.top || [], '', 3),
  ]);
  const side = (label, s, types) => s
    ? `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4>
       <p class="dd-sub" style="margin:0 0 10px">${s.n} listing terpantau · median harga ${fmtRp(s.median)} · total ${fmtSold(s.sold)} terjual</p>
       ${types.length ? `<div class="card-grid">${marketCardsHtml(types)}</div>` : '<p class="dd-sub">Belum ada pasar terpetakan untuk keyword ini.</p>'}</div>`
    : `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4><p class="dd-sub">Tidak ketemu di data.</p></div>`;
  let verdict = '';
  if (sa && sb) {
    const win = sa.sold >= sb.sold ? parts[0] : parts[1];
    verdict = `<p style="margin-top:12px">Dari total penjualan yang terpantau, <strong>${esc(win)}</strong> lebih laris. Klik pasar untuk analisis lengkap.</p>`;
  }
  const html = `<p>Perbandingan “<strong>${esc(parts[0])}</strong>” vs “<strong>${esc(parts[1])}</strong>” dari data Shopee LarisID:</p>${side(parts[0], sa, ta)}${side(parts[1], sb, tb)}${verdict}`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Bandingkan',
    a: parts[0],
    b: parts[1],
    level: 'pasar',
    types: [...ta, ...tb].map(t => t.keyword),
  }, html);
  bindTypeCards();
}

async function handleRencanaIntent(chat) {
  const html = `<p>Buka salah satu produk dulu (klik <strong>Lihat Analisis</strong>), lalu minta rencana jualan — aku susun dari data produknya.</p>`;
  await appendAssistantStream(html);
  pushMessage(chat, 'assistant', { text: 'Rencana perlu produk' }, html);
}

// ── Free-text search (composer + onboarding freeText bias) ──────────────
const SEARCH_STOPWORDS = new Set(['cari','carikan','tolong','coba','tunjukkan','tampilkan','produk','barang',
  'buat','untuk','dijual','jual','jualan','yang','dong','aku','saya','mau','bisa','lagi','dan','apa','the',
  'terlaris','laris','trending','kompetisi','rendah','persaingan','niche','bagus','laku',
  // English discovery fillers — keep nouns like "dresses" for search.
  'how','about','what','show','me','find','looking','for','any','some','please','a','an','with',
  'instead','rather','than','maybe','could','would','should','can','want','need','get','like']);

// Natural-language → LarisID category. Used so “cari skincare” / “fashion trending”
// hit the product tables instead of refusing inside a Deep Dive AI turn.
const CAT_ALIASES = [
  { cat: 'Kecantikan', terms: ['skincare', 'skin care', 'kecantikan', 'beauty', 'makeup', 'kosmetik', 'serum', 'moisturizer', 'facial', 'sunscreen'] },
  { cat: 'Fashion', terms: ['fashion', 'baju', 'pakaian', 'kaos', 'celana', 'dress', 'dresses', 'hijab', 'sepatu', 'sandal', 'tas wanita', 'jaket'] },
  { cat: 'Dapur', terms: ['dapur', 'kitchen', 'masak', 'memasak', 'peralatan dapur', 'peralatan masak', 'wadah makanan', 'penyimpanan makanan'] },
  { cat: 'Elektronik', terms: ['elektronik', 'gadget', 'charger', 'earphone', 'headset'] },
  { cat: 'HP & Gadget', terms: ['hp', 'handphone', 'smartphone', 'aksesoris hp'] },
  { cat: 'Bayi & Anak', terms: ['bayi', 'anak', 'balita', 'mainan anak', 'baby'] },
  { cat: 'Kesehatan', terms: ['kesehatan', 'herbal', 'obat', 'vitamin', 'suplemen'] },
  { cat: 'Olahraga', terms: ['olahraga', 'sport', 'fitness', 'gym', 'yoga'] },
  { cat: 'Rumah', terms: ['rumah', 'dekorasi', 'home decor', 'perabot', 'furniture'] },
  { cat: 'Alat Tulis', terms: ['alat tulis', 'pulpen', 'pensil', 'stationery', 'buku tulis'] },
  { cat: 'Outdoor & Camping', terms: ['outdoor', 'camping', 'tenda', 'cooler bag'] },
  { cat: 'Motor & Mobil', terms: ['motor', 'mobil', 'otomotif', 'aksesoris mobil'] },
  { cat: 'Hewan Peliharaan', terms: ['hewan', 'peliharaan', 'pakan', 'makanan kucing', 'makanan anjing', 'makanan hewan', 'pet food'] },
];

// Synonyms used to widen a miss before we give up and ask clarifying questions.
const SEARCH_SYNONYMS = {
  makanan: ['pakan', 'kuliner', 'camilan', 'wadah makanan', 'tempat makan', 'lunch box'],
  minuman: ['botol minum', 'tumbler', 'dispenser minum'],
  ayam: ['pakan ayam', 'unggas', 'tempat makan ayam'],
  snack: ['camilan', 'makanan ringan'],
  camilan: ['snack', 'makanan ringan'],
  kuliner: ['dapur', 'peralatan masak'],
  skincare: ['kecantikan', 'serum', 'moisturizer'],
  fashion: ['baju', 'pakaian'],
  dress: ['gaun', 'dresses', 'dress wanita', 'baju pesta', 'gaun pesta', 'maxi dress'],
  dresses: ['gaun', 'dress', 'dress wanita', 'baju pesta', 'gaun pesta', 'maxi dress'],
  gaun: ['dress', 'dresses', 'dress wanita', 'baju pesta', 'gaun pesta'],
  kayu: ['wood', 'wooden', 'bambu', 'bamboo', 'kerajinan kayu', 'furniture kayu'],
  wood: ['kayu', 'wooden', 'bambu', 'kerajinan kayu'],
  wooden: ['kayu', 'wood', 'bambu'],
  bambu: ['bamboo', 'kayu'],
  bamboo: ['bambu', 'kayu'],
  rotan: ['rattan'],
  rattan: ['rotan'],
  // Craft / embroidery — English queries must reach ID catalog keywords
  cross: ['kristik', 'kruistik', 'kruissteek', 'sulam', 'tusuk silang'],
  stitch: ['kristik', 'sulam', 'tusuk silang', 'kruissteek', 'strimin'],
  kristik: ['cross stitch', 'kruissteek', 'kruistik', 'sulam', 'tusuk silang', 'pola kristik', 'benang sulam', 'strimin'],
  kruistik: ['kristik', 'cross stitch', 'kruissteek', 'sulam'],
  kruissteek: ['kristik', 'cross stitch', 'sulam', 'strimin'],
  sulam: ['kristik', 'embroidery', 'cross stitch', 'benang sulam', 'bordir', 'tusuk silang'],
  bordir: ['sulam', 'embroidery', 'kristik'],
  embroidery: ['sulam', 'kristik', 'cross stitch', 'bordir', 'benang sulam'],
  strimin: ['kristik', 'kruissteek', 'kanvas kristik', 'cross stitch'],
  silang: ['tusuk silang', 'kristik', 'setik silang'],
  benang: ['benang sulam', 'benang dmc', 'benang rajut'],
  dmc: ['benang sulam', 'benang dmc', 'embroidery floss', 'cross stitch'],
};

// Multi-word phrase → craft cluster. Single-token expansion can't express
// "cross stitch" as a unit, so these run when the whole phrase appears.
const PHRASE_SYNONYMS = {
  'cross stitch': ['kristik', 'kruissteek', 'kruistik', 'sulam', 'benang sulam', 'pola kristik', 'tusuk silang', 'strimin', 'embroidery'],
  'crosstitch': ['kristik', 'kruissteek', 'sulam', 'tusuk silang', 'cross stitch'],
  'tusuk silang': ['kristik', 'kruissteek', 'cross stitch', 'setik silang', 'sulam'],
  'setik silang': ['kristik', 'tusuk silang', 'cross stitch', 'kruissteek'],
  'punch needle': ['tusuk jarum', 'sulam', 'embroidery', 'kristik'],
  'hand embroidery': ['sulam tangan', 'sulam', 'bordir', 'benang sulam'],
  'benang sulam': ['benang dmc', 'sulam', 'kristik', 'embroidery floss'],
  'pola kristik': ['kristik', 'pola sulam', 'kruissteek', 'cross stitch'],
  'kristick': ['kristik', 'cross stitch', 'kruissteek'],
  'sulaman': ['sulam', 'kristik', 'bordir', 'benang sulam'],
  'dress wanita': ['gaun', 'dress', 'dresses', 'baju pesta', 'maxi dress'],
  'baju pesta': ['gaun', 'gaun pesta', 'dress', 'dress wanita'],
  'gaun pesta': ['baju pesta', 'gaun', 'dress', 'dress wanita'],
  'maxi dress': ['gaun', 'dress', 'dress wanita', 'gaun panjang'],
};

// When the catalog has nothing like the ask, suggest the nearest sellable niches.
const SEARCH_DOMAIN_HINTS = [
  {
    id: 'food',
    test: (lower) => /(makanan|minuman|food|kuliner|camilan|snack|jajanan|catering|gorengan|bumbu|sambal|nasi\b|mie\b)/.test(lower),
    emptyLead: 'Di data LarisID belum ada produk makanan/minuman siap saji — kami fokus barang fisik yang biasa dijual ulang di Shopee.',
    prefer: (p) => {
      const cat = String(p.category || '').toLowerCase();
      const hay = `${p.product_name || ''} ${p.keyword || ''}`.toLowerCase();
      if (/dapur|hewan|baking|penyimpanan|kopi|outdoor/.test(cat)) return true;
      return /(pakan|tempat makan|wadah|toples|lunch|mangkok|panci|wajan|dapur|rice cooker|cooler|penyimpanan)/.test(hay);
    },
    suggestions: [
      { label: 'Peralatan dapur', q: 'Cari produk dapur' },
      { label: 'Wadah / penyimpanan makanan', q: 'Cari wadah penyimpanan makanan' },
      { label: 'Makanan hewan (pakan)', q: 'Cari pakan hewan' },
    ],
  },
  {
    id: 'service',
    test: (lower) => /(jasa|service|kursus|les\b|sewa\b|rental)/.test(lower),
    emptyLead: 'LarisID memetakan produk fisik di Shopee, bukan jasa.',
    prefer: () => false,
    suggestions: [
      { label: 'Lihat produk yang lagi naik daun', q: 'Produk apa yang lagi trending minggu ini?' },
      { label: 'Ide jualan modal kecil', q: 'Rekomendasi produk modal kecil' },
    ],
  },
];

function detectCategoryFromText(lower) {
  const s = String(lower || '').toLowerCase();
  for (const a of CAT_ALIASES) {
    if (a.terms.some(t => s.includes(t))) return a.cat;
  }
  for (const c of NU_ONB_CATS) {
    const cl = c.toLowerCase();
    if (s.includes(cl)) return c;
  }
  return null;
}

function isProductDiscoveryAsk(lower) {
  const s = String(lower || '');
  if (/(cari|carikan|tunjukkan|tampilkan|rekomendasi|terlaris|laris|trending|naik daun|kompetisi rendah|persaingan rendah|produk|jual|niche)\b/.test(s)) {
    return true;
  }
  // English discovery phrasing (“how about dresses”, “show me tumbler”, “find skincare”)
  if (/\b(how about|what about|what if|show me|looking for|find me|find|any|instead of|rather than)\b/.test(s)) {
    return true;
  }
  return false;
}

/** Strip discovery fillers so search uses nouns (“dresses”), not “how about dresses”. */
function cleanDiscoveryQuery(text) {
  let s = String(text || '').toLowerCase();
  s = s.replace(/\b(how about|what about|what if|show me|looking for|find me|instead of|rather than|cari(?:kan)?|tolong|please)\b/g, ' ');
  s = s.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = s.split(/\s+/).filter((w) => w && w.length >= 2 && !SEARCH_STOPWORDS.has(w));
  return parts.join(' ') || String(text || '').replace(/\s+/g, ' ').trim();
}

function isProductQaAsk(lower) {
  return /\b(ini|this|that|harga(?:nya)?|price|rating|review|ulasan|omset|omzet|profit|bagus(?:kah)?|worth|berapa|how much|is it|apakah|kenapa|mengapa|why|should i|bolehkah)\b/.test(String(lower || ''));
}

/**
 * Short product/category keyword ask without Indonesian discovery verbs —
 * e.g. “dresses”, “tumbler 500ml”. Not Q&A about the open listing.
 */
function isBareProductQuery(lower) {
  const s = String(lower || '').trim();
  if (!s || isProductQaAsk(s)) return false;
  if (detectIntent(s)) return false;
  if (/bandingkan|dibanding|\bvs\.?\b/.test(s)) return false;
  const cleaned = cleanDiscoveryQuery(s);
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 6) return false;
  const terms = _searchTerms(cleaned);
  return terms.length > 0;
}

/** Broad category labels only — not specific nouns that merely map into a category. */
const CAT_BROAD_ALIASES = {
  'Fashion': ['fashion', 'pakaian', 'baju'],
  'Kecantikan': ['kecantikan', 'beauty', 'skincare', 'kosmetik', 'makeup'],
  'Elektronik': ['elektronik', 'electronics'],
  'HP & Gadget': ['hp', 'gadget', 'handphone', 'smartphone'],
  'Dapur': ['dapur', 'kitchen'],
  'Bayi & Anak': ['bayi', 'anak', 'baby'],
  'Kesehatan': ['kesehatan', 'health'],
  'Olahraga': ['olahraga', 'sport', 'fitness'],
  'Rumah': ['rumah', 'home'],
  'Alat Tulis': ['alat tulis', 'stationery'],
  'Outdoor & Camping': ['outdoor', 'camping'],
  'Motor & Mobil': ['motor', 'mobil', 'otomotif'],
  'Hewan Peliharaan': ['hewan', 'peliharaan', 'pet'],
  'Hobi & Kerajinan': ['hobi', 'kerajinan'],
  'Kamar Mandi': ['kamar mandi'],
  'Keamanan': ['keamanan'],
  'Sepeda': ['sepeda'],
  'Taman': ['taman'],
  'Tanaman': ['tanaman'],
};
const CAT_LEVEL_ADJ = new Set(['terlaris', 'laris', 'trending', 'naik', 'daun', 'bagus', 'laku', 'rame', 'ramai', 'murah', 'baru']);

/**
 * True when the user asked for the whole category (e.g. “fashion”, “cari fashion
 * trending”), not a specific product noun that only aliases into that category
 * (“dresses”, “serum”, “tumbler”).
 */
function isCategoryLevelAsk(lower, cat) {
  if (!cat) return false;
  const cleaned = cleanDiscoveryQuery(lower);
  if (!cleaned) return true;
  const catLow = String(cat).toLowerCase();
  if (cleaned === catLow) return true;
  const broad = (CAT_BROAD_ALIASES[cat] || []).map((t) => t.toLowerCase());
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => broad.includes(t) || CAT_LEVEL_ADJ.has(t) || t === catLow);
}

function _searchTerms(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
}

// ── Topic-change routing (leave a product chat when the user changes subject) ──
function cityMentionedIn(lower) {
  for (const c of Object.keys(CITY_LOCATIONS)) {
    const re = new RegExp(`\\b(di|dari|kota|daerah|sekitar)\\s+(kota\\s+)?${c.toLowerCase()}\\b`);
    if (re.test(lower)) return c;
  }
  return null;
}

// Inside a product chat: detect asks that are really about the MARKET, not the
// open product — a city product-list ask, category discovery (“cari skincare”),
// a fresh “cari X” keyword search, or a generic "what should I sell".
function detectTopicChange(lower) {
  const listWords = /(produk|jualan|barang)\s+apa|apa yang (bagus|laris|laku|cocok)(\s+(di)?jual)?|rekomendasi (produk|jualan)|cari (produk|barang)|(produk|jualan|barang)\s+(yang\s+)?(bagus|laris|laku|lagi naik|naik daun|trending)/;
  const city = cityMentionedIn(lower);
  if (city && listWords.test(lower)) return { kind: 'city_list', city };
  if (!city && /^(produk|jualan|barang)\s+apa\b|rekomendasi (produk|jualan)|(produk|jualan)\s+(yang\s+)?lagi\s+(naik daun|trending|rame|ramai)/.test(lower)) {
    return { kind: 'list' };
  }
  const cat = detectCategoryFromText(lower);
  // Broad category showcase only (“fashion trending”) — not “dresses”.
  if (cat && isCategoryLevelAsk(lower, cat) && (isProductDiscoveryAsk(lower) || isBareProductQuery(lower))) {
    return { kind: 'category_list' };
  }
  // “Cari tumbler / carikan sepatu / show me tumbler…” — new product search.
  if (/^(cari|carikan|tunjukkan|tampilkan|show me|find|looking for)\b/.test(lower) && !/bandingkan|dibanding/.test(lower)) {
    return { kind: 'keyword_search' };
  }
  // Specific noun / “how about dresses” / bare keyword → planned DB search.
  if (isAltProductAsk(lower) || isBareProductQuery(lower) || (cat && !isCategoryLevelAsk(lower, cat))) {
    return { kind: 'alt_search' };
  }
  return null;
}

// "gimana dibanding kalau aku jual tas ransel" → "tas ransel"
function extractCompareTerm(lower) {
  const m = lower.match(/(?:dibanding(?:kan)?|bandingkan(?:\s+(?:dengan|sama|dgn))?|\bvs\.?)\s+(.{3,60})$/);
  if (!m) return '';
  let t = m[1];
  t = t.replace(/\b(kalau|jika|misal(nya)?|seandainya|aku|saya|gua|gue|mau|pengen|ingin|jual(an)?|berjualan|produk|barang|sebuah|sama|dengan|dgn|yang|itu|ini|gimana|bagaimana|lebih|bagus|untung)\b/g, ' ');
  t = t.replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : '';
}

async function openDirectoryForCity(city) {
  state.comparePick = null;
  updateDirCompareBanner();
  state.dirCity = city || '';
  state.dirPage = 1;
  state._dirDefaultsApplied = true; // routed city wins over onboarding defaults
  void logUserEvent('dir_open', { ui: 'gpt', via: 'topic_change', city });
  clarityEvt('dir_open', { via: 'topic_change' });
  await openDirectory();
  const citySel = $('dir-city');
  if (citySel) citySel.value = state.dirCity || '';
}

function parseCityFromQuery(text) {
  const names = [...new Set([...NU_ONB_LOCATIONS, ...Object.keys(CITY_LOCATIONS)])];
  for (const name of names) {
    const re = new RegExp(`\\bdari\\s+(kota\\s+)?${name}\\b`, 'i');
    if (re.test(text)) {
      return { city: name, cleaned: text.replace(re, ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { city: '', cleaned: text };
}

function _sanitizeSearchToken(q) {
  // PostgREST .or() treats , ( ) % as syntax — strip them from user input.
  return String(q || '').replace(/[,()%]/g, ' ').replace(/\s+/g, ' ').trim();
}

function expandSearchTerms(terms) {
  const out = [];
  const seen = new Set();
  for (const t of terms || []) {
    const k = String(t || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    for (const syn of (SEARCH_SYNONYMS[k] || [])) {
      const s = String(syn).toLowerCase();
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}

function detectSearchDomain(lower) {
  for (const d of SEARCH_DOMAIN_HINTS) {
    if (d.test(lower)) return d;
  }
  return null;
}

// opts: { synonyms: [expansion terms], exclude: [noise terms] }. Synonyms let a
// product reached via a translation ("kristik" for "cross stitch") count as relevant
// even when the original tokens are absent; exclude down-ranks token-collision junk.
function scoreSearchHit(row, terms, phrase = '', opts = {}) {
  const synonyms = opts.synonyms || [];
  const exclude = opts.exclude || [];
  const name = String(row.product_name || '').toLowerCase();
  const kw = String(row.keyword || '').toLowerCase();
  const cat = String(row.category || '').toLowerCase();
  const hay = `${name} ${kw}`;
  const baseNoise = /gantungan kunci|keychain|stiker dinding|casing hp|case hp|wallpaper|poster|crossbody|cross.?country|crosspalm|nbcross/.test(hay);
  const excludeHit = exclude.some(x => x && x.length >= 3 && !name.includes(phrase) && hay.includes(x));
  const noise = baseNoise || excludeHit;
  let matched = 0;
  let score = 0;
  for (const t of terms) {
    const inName = name.includes(t);
    const inKw = kw.includes(t);
    const inCat = cat.includes(t);
    if (inName || inKw || inCat) matched += 1;
    if (inName) score += 14;
    else if (inKw) score += 8;
    else if (inCat) score += 5;
  }
  const coverage = terms.length ? matched / terms.length : 0;
  score += coverage * 50;
  // Niche/synonym signals — a product fetched via an expansion term ("kristik",
  // "benang sulam") is relevant even without the original English tokens.
  let synMatched = 0;
  for (const s of synonyms) {
    if (!s || s.length < 3) continue;
    if (name.includes(s)) { synMatched += 1; score += 12; }
    else if (kw.includes(s)) { synMatched += 1; score += 9; }
    else if (cat.includes(s)) { score += 3; }
  }
  // Contiguous phrase in the title beats incidental single-token hits
  // ("cross stitch" embroidery >> "crossbody" bags / "stitch" markers).
  if (phrase && phrase.length >= 5) {
    if (name.includes(phrase)) score += 80;
    else if (kw.includes(phrase)) score += 40;
  }
  score += Math.log10((Number(row.total_sold) || 0) + 1) * 3;
  if (noise) score -= 60;
  return { score, matched, coverage, noise, synMatched };
}

function filterRelevantHits(hits, terms, phrase = '', opts = {}) {
  if (!hits.length) return [];
  const synonyms = opts.synonyms || [];
  if (!terms.length && !synonyms.length) return hits.slice();
  const scored = hits.map(h => ({ h, ...scoreSearchHit(h, terms, phrase, opts) }));
  const phraseHit = (x) => {
    if (!phrase || phrase.length < 5) return false;
    return String(x.h.product_name || '').toLowerCase().includes(phrase)
      || String(x.h.keyword || '').toLowerCase().includes(phrase);
  };
  const nonNoise = scored.filter(x => !x.noise);
  // Relevant = full original coverage, OR a niche synonym match, OR the contiguous phrase.
  let good = nonNoise.filter(x => x.coverage >= 1 || x.synMatched >= 1 || phraseHit(x));
  // Soften only if the strict pass found nothing.
  if (!good.length) {
    const minCov = terms.length >= 2 ? 0.5 : 1;
    good = nonNoise.filter(x => x.coverage >= minCov && x.matched >= 1);
  }
  if (!good.length && terms.length >= 2) {
    good = nonNoise.filter(x => x.matched >= 1 && String(x.h.product_name || '').toLowerCase().includes(terms[0]));
  }
  if (!good.length) {
    good = nonNoise.filter(x => x.matched >= 1 && x.score >= 12);
  }
  good.sort((a, b) => b.score - a.score || (Number(b.h.total_sold) || 0) - (Number(a.h.total_sold) || 0));
  return good.map(x => x.h);
}

/**
 * Product keyword search. Prefer the trigram-backed search_listings RPC —
 * raw listings_deduped `.or(ilike…)` hits the anon statement_timeout (~3s)
 * on multi-token queries like "cross stitch" and silently returns [].
 */
async function searchListings(q, locations = [], limit = 30) {
  if (!_supabase) return [];
  const clean = _sanitizeSearchToken(q);
  if (!clean) return [];
  const terms = _searchTerms(clean);
  const scoreTerms = terms.length ? terms : _searchTerms(clean);
  const phrase = clean.toLowerCase();
  const fetchLim = Math.max(limit * 4, 40);

  try {
    const { data, error } = await _supabase.rpc('search_listings', {
      q: clean,
      lim: fetchLim,
      off: 0,
      cats: null,
      price_min: null,
      price_max: null,
    });
    if (error) throw error;

    // RPC ranks across scrape history — collapse to one row per listing,
    // keeping RPC order (first sighting wins).
    const best = new Map();
    for (const r of (data || [])) {
      const key = `${r.item_id}_${r.shop_id}`;
      if (!best.has(key)) best.set(key, asListingProduct(r));
    }
    let rows = Array.from(best.values());
    if (locations.length) {
      const locFiltered = rows.filter(r => locMatches(r.location, locations));
      if (locFiltered.length) rows = locFiltered;
    }
    const relevant = filterRelevantHits(rows, scoreTerms, phrase);
    if (relevant.length) return relevant.slice(0, limit);
    if (scoreTerms.length <= 1) return rows.slice(0, limit);
    return [];
  } catch (_) { return []; }
}

// ── Smart query planning: static craft map + DeepSeek V4 Pro, cached ──────────
const SYN_CACHE_KEY = '_lid_syn_cache_v1';

function _synCacheGet(key) {
  try { const o = JSON.parse(localStorage.getItem(SYN_CACHE_KEY) || '{}'); return o[key] || null; }
  catch (_) { return null; }
}
function _synCacheSet(key, plan) {
  try {
    const o = JSON.parse(localStorage.getItem(SYN_CACHE_KEY) || '{}');
    o[key] = plan;
    const keys = Object.keys(o);
    if (keys.length > 300) delete o[keys[0]]; // bound the cache
    localStorage.setItem(SYN_CACHE_KEY, JSON.stringify(o));
  } catch (_) {}
}

// Instant, offline seed from the curated craft/commerce synonym maps.
function _staticPlan(cleaned) {
  const lower = cleaned.toLowerCase();
  const terms = _searchTerms(cleaned);
  const queries = [];
  const add = (q) => { const s = String(q || '').trim(); if (s && !queries.includes(s)) queries.push(s); };
  for (const ph of Object.keys(PHRASE_SYNONYMS)) {
    if (lower.includes(ph)) PHRASE_SYNONYMS[ph].forEach(add);
  }
  for (const t of terms) (SEARCH_SYNONYMS[t] || []).forEach(add);
  return { queries, exclude: [], category: null };
}

// DeepSeek V4 Pro query planner via the unauthenticated `search_plan` proxy route
// (works for anon + logged-in). Returns ONLY search terms — never product names.
async function _deepseekPlan(query) {
  try {
    const system = 'You are a product-search query planner for an Indonesian Shopee marketplace research tool. '
      + 'Given a shopper search text, reply with ONLY strict minified JSON, no prose: '
      + '{"queries":["short keywords for the SAME product niche — prefer specific Indonesian marketplace '
      + 'terms first, then English equivalents and common misspellings, max 8"],'
      + '"exclude":["lowercase words that would pull in UNRELATED products sharing a token, max 10"]}. '
      + 'Rules: (1) Expand English product nouns into Indonesian seller keywords for THAT niche — '
      + 'e.g. "dresses" → "gaun","dress wanita","baju pesta","gaun pesta"; "tumbler" → "tumbler","botol minum"; '
      + '"serum" → "serum wajah","skincare serum". (2) Prefer specific product terms over broad category '
      + 'labels like "fashion","pakaian","kecantikan". (3) Never invent product names, brands, prices or descriptions.';
    const res = await fetch(`${SUPA_URL}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: 'search_plan',
        model: 'deepseek-v4-pro',
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: `Search text: "${String(query).slice(0, 120)}"` }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = (blocks.find(b => b?.type === 'text') || blocks[0] || {}).text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const clean = (arr, n) => Array.isArray(arr)
      ? arr.map(s => String(s || '').trim()).filter(Boolean).slice(0, n) : [];
    return { queries: clean(parsed.queries, 8), exclude: clean(parsed.exclude, 10).map(s => s.toLowerCase()) };
  } catch (_) { return null; }
}

// Combine static seed + DeepSeek plan, cached per normalized query. On AI failure
// return the static seed WITHOUT caching so a later search can still reach the model.
async function planSearch(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  const key = cleaned.toLowerCase();
  if (!key) return { queries: [], exclude: [], category: null };
  const cached = _synCacheGet(key);
  if (cached) return cached;
  const seed = _staticPlan(cleaned);
  const ai = await _deepseekPlan(cleaned);
  if (!ai) return seed;
  const uniq = (arr, n) => Array.from(new Set(arr.filter(Boolean))).slice(0, n);
  const plan = {
    queries: uniq([...ai.queries, ...seed.queries], 10),
    exclude: uniq([...ai.exclude, ...seed.exclude], 12),
    category: seed.category,
  };
  _synCacheSet(key, plan);
  return plan;
}

// Expansion term set used for RANKING so synonym-fetched niche products survive.
function _planSynonymTerms(terms, planQueries) {
  const set = new Set();
  const add = (t) => { const s = String(t || '').toLowerCase().trim(); if (s.length >= 3 && !SEARCH_STOPWORDS.has(s)) set.add(s); };
  for (const q of planQueries) {
    const s = String(q || '').toLowerCase().trim();
    if (s.length >= 3) set.add(s);            // whole phrase, e.g. "benang sulam"
    for (const tok of _searchTerms(s)) add(tok);
  }
  for (const t of terms) set.delete(t);       // originals live in `terms`, not synonyms
  return Array.from(set);
}

/** Plan (DeepSeek + static) → broad parallel fetch → rank against expanded terms. */
async function searchProductsForQuery(text, locations = [], limit = 12) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  const cleaned = cleanDiscoveryQuery(raw) || raw;
  const lower = cleaned.toLowerCase();
  const terms = _searchTerms(cleaned);
  const domain = detectSearchDomain(lower);
  const phrase = lower;

  // Smart, multilingual query plan (curated craft map + DeepSeek, cached).
  const plan = await planSearch(cleaned);
  const planQueries = (plan.queries || []).filter(Boolean);
  const exclude = plan.exclude || [];
  const synonyms = _planSynonymTerms(terms, planQueries);
  const opts = { synonyms, exclude };

  // Fetch the original phrase + every planned query in PARALLEL, merge + dedupe.
  const pool = [];
  const seenQ = new Set();
  const runQ = async (q) => {
    const qq = _sanitizeSearchToken(q);
    if (!qq || seenQ.has(qq.toLowerCase())) return [];
    seenQ.add(qq.toLowerCase());
    return searchListings(qq, locations, Math.max(limit * 2, 40));
  };
  const queries = [cleaned, ...planQueries].slice(0, 9);
  const results = await Promise.all(queries.map(runQ));
  for (const r of results) mergePool(pool, r);

  let ranked = filterRelevantHits(pool, terms, phrase, opts);
  if (domain) {
    if (!ranked.some(p => domain.prefer(p))) {
      const extra = await Promise.all((domain.suggestions || []).slice(0, 3).map(sug => {
        const sq = _searchTerms(sug.q).join(' ') || sug.q;
        return runQ(String(sq).replace(/^cari\s+(produk\s+)?/i, ''));
      }));
      for (const r of extra) mergePool(pool, r);
    }
    const adjacent = pool.filter(p => {
      if (!domain.prefer(p)) return false;
      const hay = `${p.product_name || ''} ${p.keyword || ''} ${p.category || ''}`.toLowerCase();
      return synonyms.some(t => hay.includes(t)) || terms.some(t => hay.includes(t));
    });
    ranked = filterRelevantHits(adjacent, terms, phrase, opts);
    if (!ranked.length) ranked = adjacent.slice();
    if (!ranked.length) {
      return { products: [], mode: 'clarify', domain, terms };
    }
  }

  if (ranked.length) {
    return { products: mergePool([], ranked).slice(0, limit), mode: 'ok', domain, terms };
  }
  return { products: [], mode: 'clarify', domain, terms };
}

function searchClarifyHtml(text, domain) {
  const lead = domain?.emptyLead
    || `Belum ketemu produk yang mirip “${esc(text)}” di data LarisID.`;
  const suggestions = domain?.suggestions?.length
    ? domain.suggestions
    : [
      { label: 'Produk naik daun', q: 'Produk apa yang lagi trending minggu ini?' },
      { label: 'Ide jualan modal kecil', q: 'Rekomendasi produk modal kecil' },
    ];
  // Generic near-category nudge when we have a domain
  const ask = domain?.id === 'food'
    ? 'Maksud kamu yang mana?'
    : 'Coba salah satu arah ini, atau ketik kata kunci lain:';
  return `<p>${lead}</p><p>${ask}</p>
    <div class="chips" style="margin-top:10px">${suggestions.map(s =>
      `<button type="button" class="chip" data-suggest-q="${esc(s.q)}">${esc(s.label)}</button>`
    ).join('')}</div>`;
}

function bindSearchSuggests(root) {
  (root || document).querySelectorAll('[data-suggest-q]').forEach(btn => {
    if (btn.dataset.boundSuggest) return;
    btn.dataset.boundSuggest = '1';
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-suggest-q');
      if (q) void handleComposerSubmit(q);
    });
  });
}

/** Showcase products for a category ask (skincare, fashion trending, …). */
async function fetchCategoryShowcase(cat, limit = 12) {
  let pool = [];
  mergePool(pool, await fetchNaikDaunByCat([cat], Math.max(limit * 2, 40)));
  if (pool.length < limit) {
    // Fill from city-agnostic listings via keyword/category search on the cat name
    const extra = await searchListings(cat, [], Math.max(limit * 2, 40));
    mergePool(pool, extra.filter(p => catMatches(p.category, [cat])));
  }
  if (pool.length < limit) {
    mergePool(pool, await fetchNaikDaunGlobal(120));
    pool = pool.filter(p => catMatches(p.category, [cat])).concat(
      pool.filter(p => !catMatches(p.category, [cat]))
    );
  }
  // Prefer rising + sold
  pool.sort((a, b) => {
    const sa = (Number(a.sold_per_day) || 0) * 10 + Math.log10((Number(a.total_sold) || 0) + 1);
    const sb = (Number(b.sold_per_day) || 0) * 10 + Math.log10((Number(b.total_sold) || 0) + 1);
    return sb - sa;
  });
  return mergePool([], pool).slice(0, limit).map(asListingProduct);
}

/**
 * Render a pasar (market) answer. Shared by the category-showcase path and the
 * free-text search path so both surface markets rather than single listings.
 * Returns false when nothing matched, so callers can fall back.
 */
async function replyWithPasarTypes(chat, text, types, opts = {}) {
  if (!types || !types.length) return false;
  const loading = opts.loading || null;
  const gate = await ensureIntentChat(chat, text.slice(0, 60), { kind: 'pasar_search', q: text });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return true; }
  registerTypes(types);
  const placeLabel = opts.placeLabel || '';
  const en = detectReplyLanguage(text) === 'en';
  const lead = en
    ? `${types.length} market${types.length > 1 ? 's' : ''} matching \u201c${esc(opts.label || text)}\u201d${placeLabel ? ` around <strong>${esc(placeLabel)}</strong>` : ''} \u2014 each card is a whole market, not one listing:`
    : `${types.length} pasar yang cocok dengan \u201c${esc(opts.label || text)}\u201d${placeLabel ? ` di sekitar <strong>${esc(placeLabel)}</strong>` : ''} \u2014 tiap kartu itu satu pasar, bukan satu listing:`;
  const html = `<p>${lead}</p><div class="card-grid">${types.map((t, i) => typeCardHtml(t, i, i)).join('')}</div>`;
  if (loading) await revealAssistant(loading, html);
  else await appendAssistantStream(html);
  pushMessage(chat, 'assistant', {
    text: 'Hasil pasar', q: text, level: 'pasar', types: types.map(t => t.keyword),
  }, html);
  bindTypeCards();
  void hydrateProdCardsIn();
  void logUserEvent('discover_view', { ui: 'gpt', q: text, count: types.length, level: 'pasar' });
  return true;
}

async function replyWithCategoryProducts(chat, text, cat) {
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk ${esc(cat)} dari data LarisID…</p>`);
  // Pasar first — "tanaman artificial" should answer with the markets it
  // matches, not 12 near-identical listings from 12 different shops.
  const place0 = parsePlaceFromQuery(text);
  const q0 = cleanDiscoveryQuery(place0.cleaned || text) || (place0.cleaned || text);
  const typeHits = await searchProductTypes(q0, place0.city || '', 12);
  if (await replyWithPasarTypes(chat, text, typeHits, {
    loading, label: q0, placeLabel: place0.label || place0.city || '',
  })) return;
  // Nothing matched the query by name — answer with the markets behind this
  // category's top listings rather than the listings themselves.
  const showcase = await fetchCategoryShowcase(cat, 24);
  const types = await typesForListings(showcase, place0.city || '', 12);
  if (types.length && await replyWithPasarTypes(chat, text, types, {
    loading, label: cat, placeLabel: place0.label || place0.city || '',
  })) return;

  const gate = await ensureIntentChat(chat, text.slice(0, 60), { kind: 'category_search', category: cat, q: text });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  state.recommendations = [];
  const html = `<p>Belum ketemu pasar di kategori <strong>${esc(cat)}</strong>. Coba kata kunci lain atau buka Produk.</p>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Hasil kategori', q: text, category: cat, products: [],
  }, html);
  void logUserEvent('discover_view', { ui: 'gpt', q: text, category: cat, count: 0 });
  clarityEvt('gpt_category_search', { category: cat });
}

function scoreProduct(row, o, locations, ftTerms) {
  const cats = o.categories || [];
  const spd = Number(row.sold_per_day) || 0;
  const sold = Number(row.total_sold) || 0;
  let s = spd * 12 + Math.log10(sold + 1) * 8;

  if (ftTerms && ftTerms.length) {
    const hay = `${row.product_name || ''} ${row.keyword || ''}`.toLowerCase();
    if (ftTerms.some(t => hay.includes(t))) s += 150;
  }

  const inCat = catMatches(row.category, cats);
  const inCity = locMatches(row.location, locations);

  if (inCat && inCity) s += 250;
  else if (inCat) s += 120;
  else if (inCity) s += 50;

  // Learned interests (behavioral): smaller bonus than explicit picks.
  const learned = o.learnedCategories || [];
  if (!inCat && learned.length && catMatches(row.category, learned)) s += 70;

  if (o.city && String(row.location || '').toLowerCase().includes(String(o.city).toLowerCase())) s += 50;

  if (o.pairingMode === 'pairing' && o.pairingCategory) {
    if (catMatches(row.category, [o.pairingCategory])) s += 90;
  } else if (o.pairingMode === 'new' && inCat) {
    s += 25;
  }
  return s;
}

function mergePool(pool, rows) {
  const have = new Set(pool.map(r => `${r.item_id}_${r.shop_id}`));
  for (const r of rows || []) {
    const key = `${r.item_id}_${r.shop_id}`;
    if (have.has(key)) continue;
    pool.push(r);
    have.add(key);
  }
  return pool;
}

async function pickRecommendations(limit = 3) {
  const o = state.onboarding;
  const cats = (o.categories || []).slice();
  const locations = expandCityLocations(o.city);
  const want = Math.max(3, Math.min(24, Number(limit) || 3));
  let pool = [];
  let tier = 'empty';

  // Tier 0: explicit free-text interest ("produk kayu") — strongest signal
  const ftTerms = _searchTerms(o.freeText || '');
  if (ftTerms.length) {
    let ft = await searchListings(ftTerms.join(' '), locations, 60);
    if (!ft.length) ft = await searchListings(ftTerms[0], [], 40);
    mergePool(pool, ft);
    if (pool.length) tier = 'free_text';
  }

  // Tier 1: top sellers in seller’s metro + chosen categories (primary signal)
  if (locations.length && cats.length) {
    const cityCat = await fetchListingsCityCat(locations, cats, 100);
    const naikCityCat = await fetchNaikDaunCityCat(locations, cats, 60);
    pool = mergePool(mergePool([], naikCityCat), cityCat);
    if (pool.length) tier = 'city_category';
  }

  // Tier 2: rising products in category anywhere
  if (pool.length < want && cats.length) {
    const catOnly = await fetchNaikDaunByCat(cats, 120);
    mergePool(pool, catOnly);
    if (pool.length >= 3) tier = tier === 'empty' ? 'category' : tier;
  }

  // Tier 3: best sellers in city (any category) — still local competition signal
  if (pool.length < want && locations.length) {
    const cityOnly = await fetchListingsCityCat(locations, [], 80);
    mergePool(pool, cityOnly);
    if (cityOnly.length) tier = tier === 'empty' ? 'city' : tier;
  }

  // Tier 4: global rising fallback
  if (pool.length < want) {
    mergePool(pool, await fetchNaikDaunGlobal(60));
    if (tier === 'empty') tier = 'global';
  }

  const scored = pool.map(r => ({ r, s: scoreProduct(r, o, locations, ftTerms) })).sort((a, b) => b.s - a.s);
  const seen = new Set();
  const out = [];
  for (const { r } of scored) {
    const key = `${r.item_id}_${r.shop_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    r._recTier = tier;
    out.push(r);
    if (out.length >= want) break;
  }

  for (const p of out) {
    if (!p.keyword || !_supabase) continue;
    try {
      const { data } = await _supabase.from('mv_niche_breakout')
        .select('keyword,breakout_rate,new_items,breakouts')
        .eq('keyword', p.keyword).maybeSingle();
      p._niche = data || null;
    } catch (_) {}
  }
  return out;
}

function fmtOmset(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.0', '') + ' M/bln';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + ' jt/bln';
  if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3).toLocaleString('id-ID') + 'rb/bln';
  return fmtRp(n) + '/bln';
}

// Best daily sold-rate for an OMSET estimate: a real period rate if the row has
// one (naik_daun/trending/scrape delta), otherwise an estimate from listing age
// (sold-since-listing ÷ days-listed), capped by DD_MAX_SOLD_PER_DAY. This fills
// omset for listings_deduped rows that carry no real rate, without polluting the
// row's own sold_per_day (which feeds sorting/scoring/"sold/hari").
function soldPerDayEst(p) {
  // Prefer the stored scale-aware velocity (refresh_omset_estimates) when present.
  const ev = Number(p.est_velocity_daily);
  if (Number.isFinite(ev) && ev > 0) return Math.min(ev, DD_MAX_SOLD_PER_DAY);
  const spd = Number(p.sold_per_day);
  if (Number.isFinite(spd) && spd > 0) return Math.min(spd, DD_MAX_SOLD_PER_DAY);
  // mv_trending rows: period rate from 7d delta (same formula as deep-dive open).
  const d7 = Number(p.delta_7d);
  if (Number.isFinite(d7) && d7 > 0) return Math.min(d7 / 7, DD_MAX_SOLD_PER_DAY);
  let age = p.age_days != null ? Number(p.age_days) : null;
  if ((age == null || !(age > 0)) && p.listing_date) {
    const d = new Date(p.listing_date).getTime();
    if (Number.isFinite(d)) age = Math.max(1, Math.round((Date.now() - d) / 86400000));
  }
  const total = Number(p.total_sold);
  if (Number.isFinite(total) && total > 0 && age != null && age > 0) {
    return Math.min(total / age, DD_MAX_SOLD_PER_DAY);
  }
  return 0;
}

function estOmsetBulan(p) {
  // Prefer the stored monthly omset estimate when present (real delta or cohort).
  const eo = Number(p.est_omset_monthly);
  if (Number.isFinite(eo) && eo >= 0 && (p.est_omset_monthly != null)) return eo;
  const price = Number(p.price) || 0;
  const spd = soldPerDayEst(p);
  if (price > 0 && spd > 0) return Math.round(price * spd * 30);
  return 0;
}

function productSnapshot(p) {
  if (!p || p.item_id == null || p.shop_id == null) return null;
  return {
    item_id: p.item_id,
    shop_id: p.shop_id,
    product_name: p.product_name || null,
    store_name: p.store_name || null,
    price: p.price,
    total_sold: p.total_sold,
    reviews: p.reviews,
    rating: p.rating,
    location: p.location || null,
    image_url: p.image_url || null,
    keyword: p.keyword || null,
    category: p.category || null,
    url: p.url || null,
    sold_per_day: p.sold_per_day,
    age_days: p.age_days,
    listing_date: p.listing_date || null,
    delta_7d: p.delta_7d != null ? p.delta_7d : null,
  };
}

function rememberProducts(list) {
  for (const p of list || []) {
    const snap = productSnapshot(p);
    if (!snap) continue;
    state.productByKey[prodKey(snap)] = { ...(state.productByKey[prodKey(snap)] || {}), ...snap };
  }
}

function seedProductsFromChat(chat) {
  if (!chat) return;
  if (chat.context?.product) rememberProducts([chat.context.product]);
  if (Array.isArray(chat.context?.peers)) rememberProducts(chat.context.peers);
  for (const m of chat.messages || []) {
    if (Array.isArray(m.content?.products)) rememberProducts(m.content.products);
  }
}

function findProduct(item_id, shop_id) {
  const key = `${item_id}|${shop_id}`;
  const match = x => String(x?.item_id) === String(item_id) && String(x?.shop_id) === String(shop_id);
  const chat = activeChat();
  if (chat?.context?.product && match(chat.context.product)) return chat.context.product;
  const cached = state.productByKey[key];
  if (cached) return cached;
  const fromRec = state.recommendations.find(match);
  if (fromRec) return fromRec;
  const fromDir = state.dirRows.find(match);
  if (fromDir) return fromDir;
  if (Array.isArray(chat?.context?.peers)) {
    const peer = chat.context.peers.find(match);
    if (peer) return peer;
  }
  for (const m of chat?.messages || []) {
    const hit = (m.content?.products || []).find(match);
    if (hit) return hit;
  }
  return null;
}

async function resolveProduct(item_id, shop_id, btn) {
  const attr = btn?.getAttribute?.('data-product');
  if (attr) {
    try {
      const decoded = JSON.parse(decodeURIComponent(attr));
      if (decoded?.item_id != null) {
        rememberProducts([decoded]);
        return asListingProduct(decoded);
      }
    } catch (_) {}
  }
  const found = findProduct(item_id, shop_id);
  if (found) return asListingProduct(found);
  if (_supabase && item_id != null && shop_id != null) {
    try {
      const { data } = await _supabase.from('listings_deduped')
        .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date')
        .eq('item_id', item_id)
        .eq('shop_id', shop_id)
        .maybeSingle();
      if (data) {
        const prod = asListingProduct(data);
        rememberProducts([prod]);
        return prod;
      }
    } catch (_) {}
  }
  return null;
}

function productCardHtml(p, i, omsetRange) {
  rememberProducts([p]);
  const img = p.image_url || '';
  const name = p.product_name || p.keyword || 'Produk';
  const key = `${p.item_id}|${p.shop_id}`;
  const snap = productSnapshot(p);
  const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
  const omset = estOmsetBulan(p);
  const vk = viewCountKey(p.item_id, p.shop_id);
  const viewers = viewersYtdCached(p.item_id, p.shop_id);
  const lo = omsetRange?.p60 || 0;
  const hi = omsetRange?.p100 || 0;
  const omsetVal = (lo > 0 && hi > 0)
    ? `${fmtRpShort(lo)} – ${fmtRpShort(hi)}`
    : (omset ? fmtOmset(omset) : '—');
  return `<button type="button" class="prod-card" data-prod="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''} style="animation-delay:${i * 0.06}s">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<div class="prod-card-ph"></div>'}
    <div class="prod-card-body">
      <div class="prod-card-name-row">
        <div class="prod-card-name">${esc(name)}</div>
        <span class="prod-card-views" hidden data-view-key="${esc(vk)}" title="Orang yang melihat produk ini di Laris tahun ini">${ico('eye', 11)}<span data-view-num>${viewers.toLocaleString('id-ID')}</span></span>
      </div>
      <div class="prod-card-stats prod-card-stats--slim">
        <div class="prod-stat">
          <span class="prod-stat-lbl">Omset/bulan</span>
          <span class="prod-stat-val">${omsetVal}</span>
        </div>
      </div>
    </div>
  </button>`;
}

/** Render a product card grid; omset shown as peer P60–P100 when enough rows. */
function productCardsHtml(products) {
  const list = products || [];
  const omsets = list.map(estOmsetBulan).filter(n => n > 0).sort((a, b) => a - b);
  let range = null;
  if (omsets.length >= 4) {
    const p60 = omsets[Math.min(omsets.length - 1, Math.floor((omsets.length - 1) * 0.6))];
    const p100 = omsets[omsets.length - 1];
    range = { p60, p100 };
  }
  return list.map((p, i) => productCardHtml(p, i, range)).join('');
}

function prodKey(p) {
  return `${p?.item_id}|${p?.shop_id}`;
}

function bindProductCards(root) {
  (root || document).querySelectorAll('[data-prod]').forEach(btn => {
    if (btn.dataset.boundProd) return;
    btn.dataset.boundProd = '1';
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-prod');
      const [item_id, shop_id] = key.split('|');
      void (async () => {
        const p = await resolveProduct(item_id, shop_id, btn);
        if (!p) {
          showToast('Produk tidak ditemukan — coba cari lagi');
          return;
        }
        if (state.comparePick?.source) {
          const src = state.comparePick.source;
          if (prodKey(src) === prodKey(p)) {
            showToast('Pilih produk lain — bukan yang sedang dibuka');
            return;
          }
          state.comparePick = null;
          updateDirCompareBanner();
          void openProductCompare(src, p);
          return;
        }
        void openDeepDive(p);
      })();
    });
  });
  (root || document).querySelectorAll('#btn-more-products').forEach(btn => {
    btn.addEventListener('click', () => void openMoreProductsDirectory());
  });
  bindSearchSuggests(root);
  void hydrateProdCardsIn(root);
}

/** Compact Deep Dive summary kept in the chat thread so scrolling history still reaches it. */
function deepDiveChatCardHtml(product, scoreInfo, stats) {
  const snap = productSnapshot(product);
  const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
  const key = prodKey(product);
  const omset = estOmsetBulan(product);
  const img = product.image_url || '';
  const name = product.product_name || product.keyword || 'Produk';
  const komp = stats?.komp || '—';
  return `<div class="dd-chat-card" data-dd-card="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''}>
    <div class="dd-chat-card-top">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="dd-chat-card-ph"></span>'}
      <div class="dd-chat-card-main">
        <div class="dd-chat-card-eyebrow">Deep Dive</div>
        <div class="dd-chat-card-name">${esc(name)}</div>
        <div class="dd-chat-card-meta">
          <span class="badge ${esc(scoreInfo.cls)}">${esc(scoreInfo.label)}</span>
          <span>Skor ${scoreInfo.score}/100</span>
        </div>
      </div>
    </div>
    <div class="dd-chat-card-stats">
      <div><span class="lbl">Harga</span><span class="val">${fmtRp(product.price)}</span></div>
      <div><span class="lbl">Omset/bln</span><span class="val">${omset ? fmtOmset(omset) : '—'}</span></div>
      <div><span class="lbl">Kompetisi</span><span class="val">${esc(komp)}</span></div>
    </div>
    <button type="button" class="btn-primary dd-chat-open" data-dd-open="${esc(key)}">Lihat analisis lengkap →</button>
  </div>`;
}

function upsertDeepDiveChatMessage(chat, product, scoreInfo, stats) {
  if (!chat || !product || product.item_id == null || product.shop_id == null) return;
  rememberProducts([product]);
  const snap = productSnapshot(product);
  if (!snap) return;
  const card = deepDiveChatCardHtml(product, scoreInfo, stats);
  const html = `<p>Deep Dive untuk <strong>${esc(product.product_name || product.keyword || 'produk')}</strong> — ringkasan dari data LarisID:</p>${card}`;
  const content = {
    text: 'Deep Dive',
    kind: 'deepdive',
    item_id: product.item_id,
    shop_id: product.shop_id,
    products: [snap],
    score: scoreInfo?.score,
    html,
  };
  if (!chat.messages) chat.messages = [];
  const idx = chat.messages.findIndex(m =>
    m.role === 'assistant' &&
    m.content?.kind === 'deepdive' &&
    String(m.content?.item_id) === String(product.item_id) &&
    String(m.content?.shop_id) === String(product.shop_id)
  );
  const key = prodKey(product);
  if (idx >= 0) {
    chat.messages[idx] = { ...chat.messages[idx], content, html, ts: Date.now() };
    saveLocalState();
    return;
  }
  pushMessage(chat, 'assistant', content, html);
  // Keep the live thread in sync even while Deep Dive view is showing, so
  // leaving via composer (no full re-render) still has the card in history.
  const thread = $('chat-thread');
  const alreadyInDom = thread && [...thread.querySelectorAll('[data-dd-card]')]
    .some(el => el.getAttribute('data-dd-card') === key);
  if (thread && !alreadyInDom) {
    appendBubble('assistant', html, { skipScroll: true });
    bindDeepDiveCards(thread);
  }
}

/* ───────────────────────────────────────────────────────────────────────────
   Daily keyword/store tracking — Site B host for the shared LarisTracker.

   Two surfaces, same shape as Deep Dive: a full #view-tracker for interaction
   (a 5-slot editor plus store search does not fit in a chat bubble), and a
   summary card left in the thread so the surface stays part of the chat memory
   and has a re-entry point. Site B is IIFE-scoped, so everything the module
   needs arrives through this adapter — it can never reach in.
   ────────────────────────────────────────────────────────────────────────── */

let _trkAdapterB = null;

function gptTrackerAdapter() {
  if (_trkAdapterB) return _trkAdapterB;
  const rpc = async (name, params) => {
    if (!_supabase) return null;
    const { data, error } = await _supabase.rpc(name, params || {});
    if (error) throw error;
    return data;
  };
  _trkAdapterB = {
    esc,
    fmtRp,
    fmtRpShort,
    fmtUnits:   fmtSold,
    fmtDate:    formatIdDate,
    toast:      showToast,
    isAuthed() { return !!currentUser; },
    requireAuth() {
      if (currentUser) return true;
      try { openAuthModal('login', 'gpt_gate_tracker'); } catch (_) {}
      return false;
    },
    track(evt, props) { try { logUserEvent(evt, { ui: 'gpt', ...(props || {}) }); } catch (_) {} },
    onStateChange(st) {
      // Refresh the thread card whenever the tracker's shape changes, so the
      // bookmark in chat history never shows a stale keyword count.
      if (st && st.configured) upsertTrackerChatMessage(activeChat());
    },
    openProduct(row) {
      if (!row || !row.item_id) return;
      try { openDeepDive(row); } catch (_) { showToast('Gagal membuka produk'); }
    },
    openDiscovery() { try { openDirectory(); } catch (_) {} },
    openTrackerView() { openTrackerView(); },
    openHowCalculated() { setView('faq'); },

    getTracking()          { return rpc('get_my_tracking'); },
    // Reads mv_keyword_daily / mv_shop_daily, which aggregate `listings`
    // directly. get_tracker_deltas is kept only for clients cached before this
    // shipped — it reads listing_deltas, which the daily scrape never refreshes.
    getRollup(days, scope) { return rpc('get_tracker_rollup', { p_days: days, p_scope: scope || 'keyword' }); },
    getDeltas(days)        { return rpc('get_tracker_deltas', { p_days: days }); },
    touchViewed()          { return rpc('touch_tracker_viewed'); },
    addKeyword(kw, cat)    { return rpc('add_tracked_keyword', { p_keyword: kw, p_category: cat || '' }); },
    addStore(id, name)     { return rpc('add_tracked_store', { p_shop_id: id, p_store_name: name || '' }); },
    removeKeyword(id)      { return rpc('remove_tracked_keyword', { p_id: id }); },
    removeStore(id)        { return rpc('remove_tracked_store', { p_id: id }); },

    async getCategories() {
      try {
        const c = await loadCanonicalCats();
        if (c && c.length) return c;
      } catch (_) {}
      return CANON_CATS;
    },
    async getCategoryKeywords(cat, limit) {
      if (!_supabase) return [];
      const { data } = await _supabase.from('product_types_v')
        .select('keyword,category,n_sellers,price_median,total_sold_sum,rep_image_url')
        .eq('city', 'ALL').eq('category', cat).gte('n_listings', 3)
        .order('omset_top15', { ascending: false }).limit(limit || 24);
      return data || [];
    },
    async getSeedCandidates() {
      const out = { fromTracked: [], categories: [] };
      if (!_supabase || !currentUser) return out;
      try {
        const { data } = await _supabase.from('user_tracked_products')
          .select('keyword,category').eq('user_id', currentUser.id)
          .order('tracked_at', { ascending: false }).limit(20);
        (data || []).forEach(r => { if (r.keyword) out.fromTracked.push({ keyword: r.keyword, category: r.category || '' }); });
      } catch (_) {}
      try {
        const { data } = await _supabase.from('user_onboarding_prefs')
          .select('categories').eq('user_id', currentUser.id).maybeSingle();
        if (data && Array.isArray(data.categories)) out.categories = data.categories.filter(Boolean).slice(0, 4);
      } catch (_) {}
      return out;
    },
    // Typeahead over product types. Category is a filter, not a prerequisite —
    // an empty category searches everything.
    async searchKeywords(o) {
      const q = String(o?.q || '').trim();
      if (!_supabase || !q) return [];
      let sel = _supabase.from('product_types_v')
        .select('keyword,category,category_canonical,n_sellers,price_median,n_listings')
        .eq('city', 'ALL')
        .gte('n_listings', 3)
        .ilike('keyword', `%${q.slice(0, 40)}%`)
        .order('omset_top15', { ascending: false, nullsFirst: false })
        .limit(o?.limit || 8);
      if (o?.category) sel = sel.eq('category_canonical', o.category);
      const { data } = await sel;
      return data || [];
    },
    async searchStores(q) {
      if (!_supabase || !q) return [];
      // find_shops_by_name is trigram-ranked over the 130k-row mv_shops; the
      // old ilike scan of listings_latest returned 60 rows to dedupe client-side.
      const { data, error } = await _supabase.rpc('find_shops_by_name', { p_q: q, p_limit: 8 });
      if (error || !data) return [];
      return (data || []).map(r => ({
        shop_id: r.shop_id,
        store_name: r.store_name || `Toko ${r.shop_id}`,
        n_products: r.n_listings,
      }));
    },
    async getFallbackMovers(cats, n) {
      if (!_supabase) return [];
      let q = _supabase.from('mv_trending')
        .select('item_id,shop_id,product_name,image_url,price,keyword,category,delta_7d,store_name')
        .order('delta_7d', { ascending: false }).limit(n || 8);
      if (cats && cats.length) q = q.in('category', cats);
      const { data } = await q;
      return data || [];
    },
    async getKeywordBaseline(keywords) {
      if (!_supabase || !keywords || !keywords.length) return [];
      const { data } = await _supabase.from('product_types_v')
        .select('keyword,n_sellers,price_median,rep_product_name,rep_image_url')
        .eq('city', 'ALL').in('keyword', keywords).limit(20);
      return (data || []).map(r => ({
        keyword: r.keyword, n_sellers: r.n_sellers, price_median: r.price_median,
        top_name: r.rep_product_name, top_image: r.rep_image_url,
      }));
    },
  };
  return _trkAdapterB;
}

function openTrackerView() {
  setView('tracker');
  if (!window.LarisTracker) return;
  window.LarisTracker.mount({ hostId: 'laris-tracker-root', site: 'b', adapter: gptTrackerAdapter() });
  window.LarisTracker.open({ touch: true });
}

// Native .ans-card chrome wrapping the module's own summary body, so the card
// reads as part of the thread while the guts stay shared with Site A.
function trackerChatCardHtml() {
  if (!window.LarisTracker) return '';
  const s = window.LarisTracker.summary();
  const sub = s.configured
    ? `${s.keywordCount} keyword${s.storeCount ? ` · ${s.storeCount} toko` : ''}`
    : 'Belum diatur';
  return `<div class="ans-card ltk-summary-host" data-ltk-card="tracker">
    <div class="ans-head">
      <span class="ans-head-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
      <div><div class="ans-title">Pantauan Harian</div><div class="ans-sub">${esc(sub)}</div></div>
    </div>
    ${window.LarisTracker.summaryCardHtml()}
    <button type="button" class="ans-cta" data-ltk-open="tracker">Buka pantauan →</button>
  </div>`;
}

// Find-and-replace upsert, same as Deep Dive: repeat visits must leave ONE live
// card in the thread, not a stack of stale ones.
function upsertTrackerChatMessage(chat) {
  if (!chat || !window.LarisTracker) return;
  const card = trackerChatCardHtml();
  if (!card) return;
  const s = window.LarisTracker.summary();
  const html = `<p>Pantauan harian kamu:</p>${card}`;
  const content = { text: 'Pantauan Harian', kind: 'tracker', keywordCount: s.keywordCount, html };
  if (!chat.messages) chat.messages = [];
  const idx = chat.messages.findIndex(m => m.role === 'assistant' && m.content?.kind === 'tracker');
  if (idx >= 0) {
    chat.messages[idx] = { ...chat.messages[idx], content, html, ts: Date.now() };
    saveLocalState();
    return;
  }
  pushMessage(chat, 'assistant', content, html);
  const thread = $('chat-thread');
  if (thread && !thread.querySelector('[data-ltk-card="tracker"]')) {
    appendBubble('assistant', html, { skipScroll: true });
    bindTrackerCards(thread);
  }
}

function bindTrackerCards(root) {
  if (!root) return;
  root.querySelectorAll('[data-ltk-open="tracker"]').forEach(el => {
    if (el.__ltkBound) return;
    el.__ltkBound = 1;
    el.addEventListener('click', () => openTrackerView());
  });
}

function bindDeepDiveCards(root) {
  (root || document).querySelectorAll('[data-dd-open]').forEach(btn => {
    if (btn.dataset.boundDd) return;
    btn.dataset.boundDd = '1';
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-dd-open');
      const [item_id, shop_id] = (key || '').split('|');
      const card = btn.closest('[data-dd-card]');
      void (async () => {
        const p = await resolveProduct(item_id, shop_id, card);
        if (!p) {
          showToast('Produk tidak ditemukan — coba buka lagi dari rekomendasi');
          return;
        }
        void openDeepDive(p);
      })();
    });
  });
}

async function ensureSearchAllowed() {
  if (currentUser && _supabase) {
    // Limit enforced when creating chat via RPC
    return true;
  }
  if (anonLimitHit()) {
    const reset = wibMidnightReset();
    showToast(`Batas harian tercapai — reset dalam ${formatCountdown(reset)}`);
    gptLimitHit({ anon: true, resetAt: reset });
    return false;
  }
  return true;
}

async function startRecommendationChat(fromOnboarding) {
  abortAssistantStream();
  if (!(await ensureSearchAllowed())) return;

  let chat = null;
  const title = (state.onboarding.categories[0] || 'Rekomendasi') + (state.onboarding.city ? ` · ${state.onboarding.city}` : '');
  const context = {
    city: state.onboarding.city,
    categories: state.onboarding.categories,
    experience: state.onboarding.experience,
    pairingMode: state.onboarding.pairingMode,
    pairingCategory: state.onboarding.pairingCategory,
    notes: state.onboarding.notes,
    freeText: state.onboarding.freeText || '',
    kind: 'recommendation',
  };

  if (currentUser && _supabase) {
    const { data, error } = await _supabase.rpc('gpt_new_chat', { p_title: title, p_context: context });
    if (error) { showToast('Gagal membuat chat. Coba lagi.'); return; }
    if (data) noteGptUsage(data);
    if (data && data.allowed === false) {
      const resetAt = data.reset_at || wibMidnightReset();
      showToast(`Batas harian tercapai — reset dalam ${formatCountdown(resetAt)}`);
      gptLimitHit({ resetAt });
      return;
    }
    chat = {
      id: data.chat.id,
      title: data.chat.title,
      context,
      messages: [],
      created_at: Date.now(),
    };
    funnelStep('first_search', { source: 'recommendation' });
  } else {
    bumpAnonSearch();
    chat = {
      localId: 'local_' + Date.now(),
      title,
      context,
      messages: [],
      created_at: Date.now(),
    };
  }

  state.chats.unshift(chat);
  state.activeChatId = chat.id || chat.localId;
  saveLocalState();
  renderChatList();
  setView('chat');

  const thread = $('chat-thread');
  if (thread) thread.innerHTML = '';

  const catsLabel = (state.onboarding.categories || []).slice(0, 2).join(', ');
  const ft = (state.onboarding.freeText || '').trim();
  const frame = state.onboarding.pairingMode === 'pairing'
    ? `Berdasarkan data tren (naik daun) di kategori yang berdekatan dengan <strong>${esc(state.onboarding.pairingCategory || '')}</strong> — ini rekomendasi berbasis data, bukan tebakan AI.`
    : ft
      ? `Produk sesuai “<strong>${esc(ft)}</strong>”${state.onboarding.city ? ` dari seller sekitar <strong>${esc(state.onboarding.city)}</strong>` : ''} — dari data Shopee LarisID, bukan tebakan AI.`
      : `Produk terlaris${catsLabel ? ` di <strong>${esc(catsLabel)}</strong>` : ''}${state.onboarding.city ? ` dari seller sekitar <strong>${esc(state.onboarding.city)}</strong>` : ''} — dari data Shopee LarisID, bukan tebakan AI.`;

  appendBubble('assistant', `<p>${fromOnboarding ? 'Siap. ' : ''}${frame}</p><p style="opacity:.7;animation:pulseSoft 1.2s infinite">Memuat rekomendasi…</p>`);

  const recLimit = fromOnboarding ? 9 : 3;
  // Recommendations are ranked on listings but presented as markets — the user
  // is choosing what to sell, which is a market decision, not a listing one.
  const recs = await pickRecommendations(recLimit * 3);
  const recTypes = await typesForListings(recs, state.onboarding.city || '', recLimit);
  state.recommendations = [];

  const cards = recTypes.length
    ? `<div class="card-grid">${marketCardsHtml(recTypes)}</div>
       <button type="button" class="btn-ghost" id="btn-more-products">Tampilkan pasar lain</button>`
    : `<p>Belum ketemu pasar yang cocok. Coba Chat Baru atau buka <strong>Produk</strong> di sidebar.</p>`;

  const html = `<p>${frame}</p><p>Ini <strong>${recTypes.length || recLimit} pasar</strong> dari data LarisID buat kamu cek:</p>${cards}`;
  const thread2 = $('chat-thread');
  if (thread2) thread2.innerHTML = '';
  const msg = await appendAssistantStream(html);
  pushMessage(chat, 'assistant', {
    text: `Rekomendasi ${recTypes.length} pasar`,
    level: 'pasar',
    types: recTypes.map(t => t.keyword),
  }, html);
  bindTypeCards();
  scrollPanelToTop();

  void logUserEvent('discover_view', { ui: 'gpt', count: recTypes.length, level: 'pasar' });
  clarityEvt('discover_view', { ui: 'gpt' });
  clarityEvt('gpt_chat_new', {});
  void logUserEvent('gpt_chat_new', { ui: 'gpt' });
}

async function openChat(id) {
  abortAssistantStream();
  state.activeChatId = id;
  saveLocalState();
  renderChatList();
  const chat = activeChat();
  seedProductsFromChat(chat);
  if (chat && currentUser && chat.id && (!chat.messages || !chat.messages.length) && _supabase) {
    try {
      const { data } = await _supabase.from('gpt_messages')
        .select('role,content,created_at')
        .eq('chat_id', chat.id)
        .order('created_at');
      chat.messages = (data || []).map(m => ({
        role: m.role,
        content: m.content,
        html: m.content?.html || null,
      }));
      seedProductsFromChat(chat);
    } catch (_) {}
  }

  // Legacy finder chats (4-question flow) may exist without persisted messages.
  // Rehydrate from context so opening history never renders blank.
  if (chat && (!chat.messages || !chat.messages.length) && chat.context?.kind === 'finder'
    && chat.context?.city && chat.context?.category) {
    try {
      const rows = await collectFinderProducts({
        city: chat.context.city,
        category: chat.context.category,
        budgetId: chat.context.budget || '1jt_10jt',
        limit: 60,
      });
      const products = rows.map(asListingProduct);
      const types = await typesForListings(products, chat.context.city || '', 12);
      state.recommendations = [];
      const bud = finderBudgetCfg(chat.context.budget || '1jt_10jt');
      const html = types.length
        ? `<p>${types.length} pasar untuk <strong>${esc(chat.context.category)}</strong> di sekitar <strong>${esc(chat.context.city)}</strong> (modal ${esc(bud.label)}).</p>
           <div class="card-grid">${marketCardsHtml(types)}</div>`
        : `<p>Riwayat ini tidak punya hasil tersimpan. Coba jalankan ulang pencarian dari pertanyaan awal.</p>`;
      setView('chat');
      const thread = $('chat-thread');
      if (thread) thread.innerHTML = '';
      appendBubble('assistant', html, { skipScroll: true });
      bindTypeCards($('chat-thread'));
      updateProductPin();
      scrollPanelToTop();
      return;
    } catch (_) {}
  }

  // Product Deep Dive threads reopen on the analysis — chat scrolls are behind it.
  const product = resolveChatProduct(chat);
  if (product) {
    rememberProducts([product]);
    chat.context = {
      ...(chat.context || {}),
      kind: 'product',
      product,
      item_id: product.item_id,
      shop_id: product.shop_id,
      keyword: product.keyword || chat.context?.keyword || '',
    };
    saveLocalState();
    await openDeepDive(product);
    return;
  }

  setView('chat');
  renderChatThread();
  updateProductPin();
}

async function newChatFlow() {
  abortAssistantStream();
  // Chat Baru: 4 questions only if never completed; else empty + composer.
  renderHome();
}

// ── Deep dive ────────────────────────────────────────────────────────────
// A-parity formulas, ported from laris-app.js (calcBreakoutOdds ~15857,
// calcReviewWall ~15934) — same numbers as site A, monochrome presentation.
function calcBreakoutOdds(price, niche) {
  const p = price || 0;
  const priceOdds = p <= 0 ? 12
    : p < 10000  ? 27
    : p < 25000  ? 19
    : p < 50000  ? 14
    : p < 100000 ? 9
    : p < 250000 ? 6
    : 3;
  let pct = priceOdds, src = 'harga';
  if (niche && niche.breakout_rate != null && (niche.new_items || 0) >= 15) {
    pct = Math.round(priceOdds * 0.45 + Number(niche.breakout_rate) * 0.55);
    src = 'niche';
  }
  pct = Math.max(1, Math.min(60, pct));
  const tier = pct >= 20 ? 'Tinggi' : pct >= 10 ? 'Sedang' : 'Rendah';
  const hint = src === 'niche'
    ? `~${pct}% produk baru di niche ini tembus 100+ terjual`
    : (p > 0 ? `Berdasarkan harga — peluang ${tier.toLowerCase()} untuk pemula` : 'Menunggu data harga pasar');
  return { pct, tier, hint, src };
}

function calcReviewWall(reviews, niche) {
  const med = (niche && niche.median_winner_reviews != null && niche.median_winner_reviews > 0)
    ? Number(niche.median_winner_reviews) : 50;
  const r = reviews || 0;
  const pct = Math.min(100, Math.round(r / Math.max(med, 1) * 100));
  return { wall: med, reviews: r, pct, cleared: r >= med };
}

function ddStats(peers) {
  const prices = peers.map(p => Number(p.price) || 0).filter(Boolean).sort((a, b) => a - b);
  const n = prices.length;
  const pick = f => n ? prices[Math.min(n - 1, Math.floor(n * f))] : 0;
  const totalSold = peers.reduce((s, p) => s + (Number(p.total_sold) || 0), 0);
  const top3 = peers.slice(0, 3).reduce((s, p) => s + (Number(p.total_sold) || 0), 0);
  const top3Share = totalSold ? top3 / totalSold : 0;
  return {
    prices, n,
    median: n ? prices[Math.floor(n / 2)] : 0,
    p25: pick(0.25), p75: pick(0.75),
    p35: pick(0.35), p65: pick(0.65),
    min: n ? prices[0] : 0, max: n ? prices[n - 1] : 0,
    totalSold, top3Share,
    komp: top3Share > 0.6 ? 'Tinggi' : top3Share > 0.35 ? 'Sedang' : 'Rendah',
  };
}

// ── Deep-dive report builders (always-expanded analysis) ─────────────────
function fmtRpShort(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return 'Rp ' + (n / 1e9).toFixed(1).replace('.0', '') + ' M';
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.0', '') + ' jt';
  if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3) + 'rb';
  return fmtRp(n);
}

/** Omset hero: small Rp + tight amount (no space after Rp). */
function fmtOmsetHeroAmt(n) {
  n = Number(n) || 0;
  let amt = '0';
  if (n >= 1e9) amt = (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'M';
  else if (n >= 1e6) amt = (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, '') + 'jt';
  else if (n >= 1e3) amt = Math.round(n / 1e3) + 'rb';
  else amt = String(Math.round(n));
  return `<span class="rp">Rp</span><span class="amt">${amt}</span>`;
}

// Deterministic 0–100 score from real signals only.
function ddScore(product, stats, niche) {
  const odds = calcBreakoutOdds(Number(product.price) || 0, niche);
  let s = 35 * (odds.pct / 60);
  s += stats.komp === 'Rendah' ? 25 : stats.komp === 'Sedang' ? 15 : 6;
  s += Math.min(20, Math.log10((stats.totalSold || 0) + 1) * 3.4);
  s += Math.min(10, Number(product.sold_per_day) || 0);
  s += stats.n >= 20 ? 10 : stats.n >= 8 ? 6 : 2;
  s = Math.round(Math.max(5, Math.min(95, s)));
  const badge = s >= 70 ? { cls: 'badge-tinggi', label: 'Peluang Tinggi' }
    : s >= 45 ? { cls: 'badge-sedang', label: 'Peluang Sedang' }
    : { cls: 'badge-rendah', label: 'Peluang Rendah' };
  return { score: s, ...badge, odds };
}

// Weekly market series from real scrape snapshots: per item, only consecutive
// positive sold deltas are used — the first snapshot is a baseline (never
// lifetime total_sold as "sales"). Later intervals spread their delta as a
// daily rate onto Monday-anchored weeks overlapping [t0, t1].
//
// The *first* measured interval is attributed entirely to the ending scrape's
// week (weekOf(t1)), not spread back onto the baseline week. Otherwise the
// chart's first point lands on the initial panel week (e.g. 13 Apr) and looks
// like cumulative stock was period sales. Site A's analisa pasar skips that
// warmup interval entirely; we keep the delta but credit the observation week.
//
// April/May spikes also came from naive deltas on Shopee *display buckets*
// (10rb+, 100rb+, 1jt+, …) and scrape glitches — e.g. 200k → 7jt in 9 days.
// Those look like real sales but are UI tier jumps. Mirror Site A:
// sold_tier / est_sold / category review multipliers when the raw jump is absurd.
const DD_SOLD_BUCKETS = new Set([1, 2, 5, 10, 50, 100, 500, 1000, 2000, 3000, 5000, 7000, 8000, 9000]);
const DD_MAX_SOLD_PER_DAY = 500; // sustained panel rate; higher is almost always a bucket/glitch
const DD_REVIEW_TO_SOLD = 3.2;   // default when category unknown
const DD_CAT_MULT = {
  'Alat Tulis': 2.87, 'Bayi & Anak': 4.12, 'Dapur': 3.4, 'Elektronik': 2.9,
  'Fashion': 3.5, 'Hewan Peliharaan': 3.95, 'Hobi & Kerajinan': 2.48,
  'HP & Gadget': 2.9, 'Kamar Mandi': 3.3, 'Keamanan': 2.7, 'Kecantikan': 3.1,
  'Kesehatan': 2.38, 'Motor & Mobil': 2.6, 'Olahraga': 2.68,
  'Outdoor & Camping': 2.67, 'Rumah': 3.4, 'Sepeda': 2.58, 'Taman': 3.50,
  'Tanaman': 3.63, '__default__': DD_REVIEW_TO_SOLD,
};

function ddCatMult(category) {
  return DD_CAT_MULT[category] || DD_CAT_MULT.__default__;
}

function ddSoldIsBucket(sold, soldTier) {
  const s = Number(sold) || 0;
  if (soldTier != null && soldTier > 0 && soldTier === s) return true;
  if (s >= 10000) return true;
  return DD_SOLD_BUCKETS.has(s);
}

/** Correct one interval's unit delta so bucket/glitch jumps don't inflate weekly omset. */
function ddCorrectSoldDelta(prev, next, spanMs) {
  const s0 = Number(prev.total_sold) || 0;
  const s1 = Number(next.total_sold) || 0;
  const days = Math.max(spanMs / 864e5, 1 / 24);
  const rev0 = Number(prev.reviews) || 0;
  const rev1 = Number(next.reviews) || 0;
  const mult = ddCatMult(next.category || prev.category);
  const reviewEst = Math.max(0, Math.round((rev1 - rev0) * mult));
  const est0 = prev.est_sold != null ? Number(prev.est_sold) : null;
  const est1 = next.est_sold != null ? Number(next.est_sold) : null;
  const estDelta = (est0 != null && est1 != null && est1 > est0) ? (est1 - est0) : 0;
  const bucket0 = ddSoldIsBucket(s0, prev.sold_tier);
  const bucket1 = ddSoldIsBucket(s1, next.sold_tier);
  const raw = (bucket0 && bucket1 && s0 === s1) ? 0 : Math.max(0, s1 - s0);
  const tierJump = s0 > 0 && s1 / s0 >= 3 && raw >= 10000;
  const rate = raw > 0 ? raw / days : 0;

  // Same display bucket twice → no real sold change; prefer reviews, then est_sold.
  if (bucket0 && bucket1 && s0 === s1) return reviewEst || estDelta;

  // Crossing into / within 10rb+ display tiers: raw delta is a floor jump, not sales.
  if ((s0 < 10000 && s1 >= 10000) || (s0 >= 10000 && s1 >= 10000 && (bucket0 || bucket1))) {
    if (reviewEst > 0) return reviewEst;
    if (estDelta > 0) return estDelta;
    return raw > 0 ? Math.min(raw, Math.round(DD_MAX_SOLD_PER_DAY * days)) : 0;
  }

  if (raw <= 0) return reviewEst || estDelta;

  // Absurd rate or 3×+ jump vs previous reading.
  if (rate > DD_MAX_SOLD_PER_DAY || tierJump) {
    if (reviewEst > 0) return Math.min(raw, Math.max(reviewEst, Math.round(DD_MAX_SOLD_PER_DAY * days)));
    if (estDelta > 0) return Math.min(raw, estDelta);
    return Math.min(raw, Math.round(DD_MAX_SOLD_PER_DAY * days));
  }

  // Raw jump wildly above review-implied sales.
  if (reviewEst > 0 && raw > reviewEst * 5) return reviewEst;

  return raw;
}

/** Period sold/day for one product from its own corrected scrape intervals. */
function ddProductSoldPerDay(history, product) {
  if (!product?.item_id || !history?.length) return null;
  const rows = history
    .filter(r => String(r.item_id) === String(product.item_id)
      && String(r.shop_id) === String(product.shop_id))
    .slice()
    .sort((a, b) => Date.parse(a.scraped_at) - Date.parse(b.scraped_at));
  if (rows.length < 2) return null;
  let units = 0;
  const t0 = Date.parse(rows[0].scraped_at);
  const t1 = Date.parse(rows[rows.length - 1].scraped_at);
  if (!(t1 > t0)) return null;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const span = Date.parse(b.scraped_at) - Date.parse(a.scraped_at);
    if (span <= 0) continue;
    units += ddCorrectSoldDelta(
      { ...a, category: a.category || product.category },
      { ...b, category: b.category || product.category },
      span,
    );
  }
  if (units <= 0) return null;
  return units / Math.max(1, (t1 - t0) / 864e5);
}

function ddWeeklySeries(history) {
  const byItem = new Map();
  for (const r of history) {
    const k = `${r.item_id}_${r.shop_id}`;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(r);
  }
  const weekMs = 7 * 864e5;
  const weekOf = ts => mondayOfWeek(new Date(ts)).getTime();
  const weeks = new Map();
  let maxT = 0;
  for (const rows of byItem.values()) {
    rows.sort((a, b) => Date.parse(a.scraped_at) - Date.parse(b.scraped_at));
    // Lifetime counters only rise — clamp scrape glitches that drop mid-series.
    let maxSold = Number(rows[0]?.total_sold) || 0;
    let maxRev = Number(rows[0]?.reviews) || 0;
    const clean = rows.map((r, i) => {
      if (i === 0) return r;
      let s = Number(r.total_sold) || 0;
      let rv = Number(r.reviews) || 0;
      if (s < maxSold) s = maxSold; else maxSold = s;
      if (rv < maxRev) rv = maxRev; else maxRev = rv;
      return (s === Number(r.total_sold) && rv === Number(r.reviews))
        ? r
        : { ...r, total_sold: s, reviews: rv };
    });
    for (let i = 1; i < clean.length; i++) {
      const t0 = Date.parse(clean[i - 1].scraped_at), t1 = Date.parse(clean[i].scraped_at);
      if (!(t1 > t0)) continue;
      const d = ddCorrectSoldDelta(clean[i - 1], clean[i], t1 - t0);
      if (d <= 0) continue;
      maxT = Math.max(maxT, t1);
      const price = Number(clean[i].price) || 0;
      const addToWeek = (ts, u) => {
        if (u <= 0) return;
        const w = weeks.get(ts) || { units: 0, omset: 0, items: new Set() };
        w.units += u;
        w.omset += u * price;
        w.items.add(String(clean[i].item_id));
        weeks.set(ts, w);
      };
      // First interval: credit ending scrape week only (baseline week is observation-only).
      if (i === 1) {
        addToWeek(weekOf(t1), d);
        continue;
      }
      const rate = d / (t1 - t0);
      let cur = weekOf(t0);
      while (cur < t1) {
        const overlap = Math.min(t1, cur + weekMs) - Math.max(t0, cur);
        if (overlap > 0) addToWeek(cur, rate * overlap);
        cur += weekMs;
      }
    }
  }
  let out = [...weeks.entries()].sort((a, b) => a[0] - b[0])
    .map(([ts, w]) => ({ ts, units: Math.round(w.units), omset: Math.round(w.omset), items: w.items.size }));
  // Trailing week with <3.5 days of observation undercounts — drop it.
  // Keep a lone week (e.g. first-interval credited to ending scrape) so 2-scrape
  // series are not wiped when the second scrape falls early in its Monday week.
  if (out.length > 1 && maxT - out[out.length - 1].ts < 3.5 * 864e5) out = out.slice(0, -1);
  // Hide mid-April first-scrape baseline noise; chart starts Monday of week containing 27 Apr 2026 (WIB).
  const fromTs = mondayOfWeek(new Date(Date.UTC(2026, 3, 27, 4, 0, 0))).getTime();
  return out.filter(w => w.ts >= fromTs);
}

/** Roll weekly market points into calendar-month averages for chart display. */
function ddMonthlySeries(weekly) {
  const byMo = new Map();
  for (const w of weekly || []) {
    const d = new Date(w.ts);
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const cur = byMo.get(key) || { ts: key, units: 0, omset: 0, items: 0, n: 0 };
    cur.units += Number(w.units) || 0;
    cur.omset += Number(w.omset) || 0;
    cur.items = Math.max(cur.items, Number(w.items) || 0);
    cur.n += 1;
    byMo.set(key, cur);
  }
  return [...byMo.values()]
    .sort((a, b) => a.ts - b.ts)
    .map(m => ({
      ts: m.ts,
      // Average weekly rate within the month, scaled to a ~4.3-week month so
      // bars stay comparable when a month only has 1–2 observed weeks.
      units: Math.round((m.units / Math.max(1, m.n)) * Math.min(4.3, Math.max(1, m.n))),
      omset: Math.round((m.omset / Math.max(1, m.n)) * Math.min(4.3, Math.max(1, m.n))),
      items: m.items,
      weeks: m.n,
    }));
}

function ddShareData(peers) {
  const byShop = new Map();
  for (const p of peers) {
    const k = String(p.shop_id);
    const omset = (Number(p.total_sold) || 0) * (Number(p.price) || 0);
    const cur = byShop.get(k) || { name: p.store_name || 'Toko', img: p.image_url || '', omset: 0, sold: 0, sample: p };
    cur.omset += omset;
    cur.sold += Number(p.total_sold) || 0;
    if (!cur.img && p.image_url) cur.img = p.image_url;
    byShop.set(k, cur);
  }
  const shops = [...byShop.values()].sort((a, b) => b.omset - a.omset);
  const seg = (from, to) => shops.slice(from, to).reduce((s, x) => s + x.omset, 0);
  const total = seg(0, shops.length) || 1;
  shops.forEach(s => { s.share = Math.round(s.omset / total * 100); });
  return { shops, top3: seg(0, 3), mid: seg(3, 10), tail: seg(10, 30), rest: seg(30, shops.length), total };
}

// Shop age proxy: oldest listing_date seen per shop in the scraped panel.
function ddShopAgeBuckets(peers) {
  const oldest = new Map();
  for (const p of peers) {
    if (!p.listing_date) continue;
    const t = Date.parse(p.listing_date);
    if (!isFinite(t)) continue;
    const k = String(p.shop_id);
    if (!oldest.has(k) || t < oldest.get(k)) oldest.set(k, t);
  }
  const now = Date.now();
  const b = { young: 0, mid: 0, old: 0 };
  oldest.forEach(t => {
    const yrs = (now - t) / (365.25 * 864e5);
    if (yrs < 2) b.young++; else if (yrs < 5) b.mid++; else b.old++;
  });
  return { ...b, total: oldest.size };
}

function ddKeywordRows(peers) {
  const byKw = new Map();
  for (const p of peers) {
    const key = (p.keyword || '').trim().toLowerCase();
    if (!key) continue;
    const cur = byKw.get(key) || { kw: (p.keyword || '').trim(), n: 0, sold: 0 };
    cur.n++;
    cur.sold += Number(p.total_sold) || 0;
    byKw.set(key, cur);
  }
  return [...byKw.values()].sort((a, b) => b.sold - a.sold).slice(0, 6)
    .map(r => ({ ...r, comp: r.n >= 25 ? 'Tinggi' : r.n >= 10 ? 'Sedang' : 'Rendah' }));
}

/** Top photos for a Product Type Deep Dive — matview images, else peers by sold. */
/** Deep Dive gallery images: product photo first, then peer/type photos for swipe. */
function ddHeaderImageList(product, peers) {
  const list = [];
  const seen = new Set();
  const push = (u) => {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    list.push(s);
  };
  if (product?.image_url) push(product.image_url);
  (product?._ptype?.images || []).forEach(push);
  if (list.length < 8 && peers?.length) {
    [...peers]
      .sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0))
      .forEach((p) => { if (list.length < 8) push(p.image_url); });
  }
  return list.slice(0, 8);
}

/** Swipeable photo gallery (Tokopedia-style on mobile). Desktop keeps thumbs. */
function ddHeaderMediaHtml(product, peers) {
  const imgs = ddHeaderImageList(product, peers);
  if (!imgs.length) return '<span class="ph" aria-hidden="true"></span>';
  if (imgs.length === 1) {
    return `<div class="ddr-gallery ddr-gallery--single" aria-label="Foto produk">
      <div class="ddr-gallery-main">
        <div class="ddr-carousel-track" data-ddr-track>
          <div class="ddr-slide"><img src="${esc(imgs[0])}" alt="" draggable="false"></div>
        </div>
      </div>
    </div>`;
  }
  const srcsAttr = esc(JSON.stringify(imgs));
  return `<div class="ddr-gallery" data-ddr-carousel data-ddr-srcs="${srcsAttr}" role="region" aria-roledescription="carousel" aria-label="Foto produk (${imgs.length})">
    <div class="ddr-gallery-main">
      <div class="ddr-carousel-track" data-ddr-track>
        ${imgs.map((u) => `<div class="ddr-slide"><img src="${esc(u)}" alt="" loading="lazy" draggable="false"></div>`).join('')}
      </div>
      <div class="ddr-carousel-count"><span data-ddr-count>1</span>/${imgs.length}</div>
    </div>
    <div class="ddr-gallery-thumbs" role="tablist" aria-label="Pilih foto" style="grid-template-columns:repeat(${Math.min(imgs.length, 5)},1fr)">
      ${imgs.slice(0, 5).map((u, i) => `<button type="button" class="ddr-gallery-thumb${i === 0 ? ' on' : ''}" data-ddr-dot="${i}" data-ddr-src="${esc(u)}" aria-label="Foto ${i + 1}" aria-selected="${i === 0 ? 'true' : 'false'}">
        <img src="${esc(u)}" alt="" loading="lazy" draggable="false">
      </button>`).join('')}
    </div>
  </div>`;
}

function bindDdrCarousel(root) {
  const car = root?.querySelector?.('[data-ddr-carousel]');
  if (!car) return;
  const track = car.querySelector('[data-ddr-track]');
  const stage = car.querySelector('.ddr-gallery-main');
  const thumbs = [...car.querySelectorAll('[data-ddr-dot]')];
  let srcs = [];
  try { srcs = JSON.parse(car.getAttribute('data-ddr-srcs') || '[]'); } catch (_) { srcs = []; }
  if (!srcs.length) {
    srcs = thumbs.map((t) => t.getAttribute('data-ddr-src') || t.querySelector('img')?.getAttribute('src') || '').filter(Boolean);
  }
  const countEl = car.querySelector('[data-ddr-count]');
  if (!track || !stage || srcs.length < 2) return;
  let i = 0;
  let sx = 0;
  let dx = 0;
  let tracking = false;
  let width = stage.clientWidth || 1;

  const apply = (offsetPx, animate) => {
    track.classList.toggle('is-dragging', !animate);
    const pct = (-i * 100) + (width ? (offsetPx / width) * 100 : 0);
    track.style.transform = `translateX(${pct}%)`;
  };
  const show = (n, animate = true) => {
    i = ((n % srcs.length) + srcs.length) % srcs.length;
    dx = 0;
    apply(0, animate);
    thumbs.forEach((t, idx) => {
      const on = idx === i;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (countEl) countEl.textContent = String(i + 1);
  };
  show(0, false);

  thumbs.forEach((t) => t.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    show(Number(t.dataset.ddrDot) || 0, true);
  }));

  const onStart = (x) => {
    tracking = true;
    sx = x;
    dx = 0;
    width = stage.clientWidth || 1;
    track.classList.add('is-dragging');
  };
  const onMove = (x) => {
    if (!tracking) return;
    dx = x - sx;
    apply(dx, false);
  };
  const onEnd = () => {
    if (!tracking) return;
    tracking = false;
    const thresh = Math.max(40, width * 0.18);
    if (dx <= -thresh) show(i + 1, true);
    else if (dx >= thresh) show(i - 1, true);
    else show(i, true);
  };

  stage.addEventListener('touchstart', (e) => onStart(e.changedTouches?.[0]?.clientX || 0), { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    onMove(e.changedTouches?.[0]?.clientX || 0);
  }, { passive: true });
  stage.addEventListener('touchend', () => onEnd(), { passive: true });
  stage.addEventListener('touchcancel', () => onEnd(), { passive: true });

  stage.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    stage.setPointerCapture?.(e.pointerId);
    onStart(e.clientX);
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !tracking) return;
    onMove(e.clientX);
  });
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') return;
    onEnd();
  });
  stage.addEventListener('pointercancel', (e) => {
    if (e.pointerType === 'touch') return;
    onEnd();
  });
}

function peerOmsetStats(peers) {
  const omsets = (peers || []).map(estOmsetBulan).filter(n => n > 0).sort((a, b) => a - b);
  if (!omsets.length) return null;
  const mid = (arr) => {
    const i = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[i] : Math.round((arr[i - 1] + arr[i]) / 2);
  };
  const at = (p) => omsets[Math.min(omsets.length - 1, Math.max(0, Math.round((omsets.length - 1) * p)))];
  return { n: omsets.length, median: mid(omsets), p25: at(0.25), p75: at(0.75), min: omsets[0], max: omsets[omsets.length - 1] };
}

/** Shared omset band for hero (legacy) and quick-stat tile. */
function ddOmsetSummary(product, peers) {
  const t = product._ptype || null;
  const peerStats = peerOmsetStats(peers);
  let lo = 0;
  let hi = 0;
  let median = 0;
  let single = 0;

  if (t) {
    lo = Number(t.omset_p60) || 0;
    hi = Number(t.omset_p100) || 0;
    median = peerStats?.median || Number(t.omset_top15) || 0;
    if (!(lo > 0 && hi > 0) && peerStats && peerStats.n >= 4) {
      lo = peerStats.p25;
      hi = peerStats.p75;
      median = peerStats.median || median;
    } else if (lo > 0 && hi > 0) {
      if (!(median > 0)) median = Math.round((lo + hi) / 2);
    } else {
      single = Number(t.omset_top15) || median || 0;
    }
  } else {
    const own = estOmsetBulan(product);
    if (peerStats && peerStats.n >= 4) {
      lo = peerStats.p25;
      hi = peerStats.p75;
      median = peerStats.median;
    } else if (own) {
      single = own;
    }
  }
  if (lo > 0 && hi > 0 && !(median > 0)) median = Math.round((lo + hi) / 2);
  return { lo, hi, median, single };
}

function ddOmsetHeroHtml(product, peers) {
  const { lo, hi, median, single } = ddOmsetSummary(product, peers);
  let valHtml = '—';
  if (lo > 0 && hi > 0) {
    valHtml = `<span class="lo">${fmtOmsetHeroAmt(lo)}</span><span class="dash" aria-hidden="true"></span><span class="med">${fmtOmsetHeroAmt(median)}</span><span class="dash" aria-hidden="true"></span><span class="hi">${fmtOmsetHeroAmt(hi)}</span>`;
  } else if (single > 0) {
    valHtml = `<span class="med">${fmtOmsetHeroAmt(single)}</span>`;
  }
  return `<div class="ddr-omset-hero">
    <div class="lbl">Omset / Bulan</div>
    <div class="val">${valHtml}</div>
  </div>`;
}

// ── E-commerce platform fee estimates (mirrored from Site A) ───────────────
// Researched Juni 2025. Perkiraan untuk penjual non-Star/reguler dengan
// program gratis ongkir aktif — tarif berubah & bergantung kategori spesifik.
const ECOM_FEE_UPDATED = 'Juni 2025';
const FEE_TIER_BY_CAT = {
  'Fashion':'A','Elektronik':'A','Motor & Mobil':'A',
  'Kecantikan':'B','Kesehatan':'B','Rumah':'B','Dapur':'B','Bayi & Anak':'B',
  'Olahraga':'B','Kamar Mandi':'B',
  'Hobi & Kerajinan':'C','Alat Tulis':'C','Tanaman':'C','Taman':'C',
  'Outdoor & Camping':'C','Sepeda':'C','Hewan Peliharaan':'C','Keamanan':'C',
  'HP & Gadget':'D',
};
const ECOM_LOGO = {
  shopee:    `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0"><rect width="32" height="32" rx="8" fill="#EE4D2D"/><path d="M11.4 12.3a4.6 4.6 0 0 1 9.2 0" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.8 12h14.4l-1 11.2a1.6 1.6 0 0 1-1.6 1.45H11.4a1.6 1.6 0 0 1-1.6-1.45z" fill="#fff"/><path d="M16 15.8c-1.5 0-2.55.85-2.55 2.05 0 2.45 4.35 1.6 4.35 3.45 0 .85-.85 1.3-1.85 1.3-1 0-1.75-.4-2.2-1" fill="none" stroke="#EE4D2D" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  tiktok:    `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0"><rect width="32" height="32" rx="8" fill="#010101"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#25F4EE" transform="translate(-0.9,-0.6)"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#FE2C55" transform="translate(0.9,0.6)"/><path d="M19.3 7.4c.34 2.06 1.66 3.4 3.62 3.6v2.55c-1.18 0-2.36-.4-3.42-1.04v5.55a5.36 5.36 0 1 1-5.36-5.36c.3 0 .58.02.86.07v2.66a2.8 2.8 0 1 0 1.96 2.67V7.4z" fill="#fff"/></svg>`,
  tokopedia: `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0"><rect width="32" height="32" rx="8" fill="#42B549"/><circle cx="12.6" cy="14" r="3.9" fill="#fff"/><circle cx="19.4" cy="14" r="3.9" fill="#fff"/><circle cx="12.6" cy="14" r="1.7" fill="#42B549"/><circle cx="19.4" cy="14" r="1.7" fill="#42B549"/><path d="M14.3 19.4h3.4L16 21.6z" fill="#fff"/></svg>`,
  lazada:    `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0"><defs><linearGradient id="lzdg-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF0F64"/><stop offset=".55" stop-color="#FF6A00"/><stop offset="1" stop-color="#2A1A8A"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="#0E1466"/><path d="M16 23.5s-6.2-3.6-6.2-8.1A3.55 3.55 0 0 1 16 12.6a3.55 3.55 0 0 1 6.2 2.8c0 4.5-6.2 8.1-6.2 8.1z" fill="url(#lzdg-b)"/></svg>`,
  blibli:    `<svg viewBox="0 0 32 32" width="26" height="26" style="display:block;flex-shrink:0"><rect width="32" height="32" rx="8" fill="#0072BC"/><path d="M11.4 12.3a4.6 4.6 0 0 1 9.2 0" fill="none" stroke="#fff" stroke-width="1.5"/><path d="M8.8 12h14.4l-1 11.2a1.6 1.6 0 0 1-1.6 1.45H11.4a1.6 1.6 0 0 1-1.6-1.45z" fill="#fff"/><circle cx="16" cy="18.4" r="2.2" fill="#0072BC"/></svg>`,
};
const ECOM_ICON_TROPHY = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
const PLATFORM_FEES = {
  shopee:    { label:'Shopee',      logo:ECOM_LOGO.shopee,    comm:{A:10,  B:8.5, C:6.5, D:5,    E:2.5},  program:4.0, flat:1250, src:'seller.shopee.co.id' },
  tiktok:    { label:'TikTok Shop', logo:ECOM_LOGO.tiktok,    comm:{A:6,   B:5,   C:4,   D:3,    E:2.5},  program:2.0, flat:1250, src:'seller-id.tokopedia.com' },
  tokopedia: { label:'Tokopedia',   logo:ECOM_LOGO.tokopedia, comm:{A:8,   B:6.5, C:5,   D:4,    E:3.5},  program:2.5, flat:1250, src:'tokopedia.com/help' },
  lazada:    { label:'Lazada',      logo:ECOM_LOGO.lazada,    comm:{A:8.2, B:6,   C:4,   D:2.43, E:2.43}, program:4.0, admin:1.82, flat:1250, src:'sellercenter.lazada.co.id' },
  blibli:    { label:'Blibli',      logo:ECOM_LOGO.blibli,    comm:{A:8,   B:7,   C:6,   D:5,    E:2.5},  program:0,   flat:0, note:'Hanya komisi kategori (2–8%, tergantung kategori). Tanpa biaya program gratis ongkir atau biaya proses pesanan — biaya pengiriman terpisah.', src:'seller.blibli.com' },
};
function feeTierForCat(cat){ return FEE_TIER_BY_CAT[cat] || 'B'; }
function ecomFmtPct(n){ return (Math.round(n*10)/10).toFixed(1).replace('.', ',').replace(/,0$/, '') + '%'; }
function ecomFmtRp(v){
  v = Math.round(v || 0);
  if (v >= 1e9) return 'Rp ' + (v/1e9).toFixed(1).replace('.', ',') + 'M';
  if (v >= 1e6) return 'Rp ' + (v/1e6).toFixed(1).replace('.', ',') + 'jt';
  if (v >= 1e3) return 'Rp ' + Math.round(v/1e3) + 'rb';
  return 'Rp ' + v.toLocaleString('id-ID');
}
function ddFeeCategory(product) {
  return normalizeDdChipCat(product)
    || product?.category
    || product?.category_canonical
    || product?._ptype?.category_canonical
    || product?._ptype?.category
    || 'Umum';
}
function ddFeeVolume(product) {
  const t = product?._ptype || null;
  const price = t ? (Number(t.price_median) || 0) : (Number(product?.price) || 0);
  const spd = Number(product?.sold_per_day);
  const sales = Number.isFinite(spd) && spd > 0
    ? Math.round(spd * 30)
    : (Number(t?.avg_sold) || Number(product?.total_sold) || 0);
  return { price, sales, omset: sales * price };
}
function platformFeePerProduct(plat, cat, price){
  const f = PLATFORM_FEES[plat], t = feeTierForCat(cat);
  const pctOnly = +((f.comm[t]||0) + (f.program||0) + (f.admin||0)).toFixed(1);
  const flat = f.flat || 0;
  const pctRp = price > 0 ? price * pctOnly / 100 : 0;
  return { pctOnly, flat, pctRp, totalRp: pctRp + flat };
}
function platformFeeDetail(plat, cat, vol){
  const f = PLATFORM_FEES[plat], t = feeTierForCat(cat);
  const { price } = vol;
  const fee = platformFeePerProduct(plat, cat, price);
  const rows = [];
  if (f.admin)   rows.push({ name:'Biaya administrasi', where:'Biaya tetap platform tiap transaksi', pct:f.admin, rpPer: price*f.admin/100 });
  rows.push({ name:'Komisi / biaya kategori', where:'Potongan platform tiap produk terjual', pct:(f.comm[t]||0), rpPer: price*(f.comm[t]||0)/100 });
  if (f.program) rows.push({ name:'Program Gratis Ongkir & promo', where:'Subsidi ongkir / voucher untuk pembeli', pct:f.program, rpPer: price*f.program/100 });
  if (f.flat)    rows.push({ name:'Biaya proses pesanan', where:'Rp '+f.flat.toLocaleString('id-ID')+' / order (tetap, bukan %)', pct:null, rpPer: f.flat });
  return { rows, pctOnly: fee.pctOnly, totalRp: fee.totalRp, note:f.note };
}

function ddToolPillsHtml(product) {
  // Pills are re-rendered per product, so the supplier probe is gated by simply
  // omitting it rather than toggling display after the fact.
  const kw = product?.keyword || null;
  const cat = product?.category || product?.category_canonical || null;
  const supplier = (supplierProbeVisible() && supplierRelevantFor(kw, cat))
    ? '<button type="button" class="ddr-tool-pill" data-ddr-tool="supplier">Supplier</button>' : '';
  return `<div class="ddr-tool-pills" role="toolbar" aria-label="Alat Deep Dive">
    <button type="button" class="ddr-tool-pill ddr-tool-pill--ai" data-ddr-tool="ai">${ico('spark', 13)}<span>Tanya AI</span></button>
    <button type="button" class="ddr-tool-pill" data-ddr-tool="analisa">Analisa</button>
    <button type="button" class="ddr-tool-pill" data-ddr-tool="kalkulator">Kalkulator</button>
    <button type="button" class="ddr-tool-pill" data-ddr-tool="kompetitor">Kompetitor</button>
    <button type="button" class="ddr-tool-pill" data-ddr-tool="serupa">Serupa</button>
    <button type="button" class="ddr-tool-pill" data-ddr-tool="biaya">Biaya</button>
    ${supplier}
  </div>`;
}

function ddMarketplaceFeeForCategory(category) {
  const cat = FEE_TIER_BY_CAT[category] ? category : (FEE_TIER_BY_CAT[String(category || '').trim()] ? String(category).trim() : 'Umum');
  const fee = platformFeePerProduct('shopee', cat, 0);
  return { label: PLATFORM_FEES.shopee.label, pct: ecomFmtPct(fee.pctOnly) };
}

function ddFeeStripHtml(product) {
  const cat = ddFeeCategory(product);
  const { price } = ddFeeVolume(product);
  const order = Object.keys(PLATFORM_FEES)
    .map(plat => ({ plat, fee: platformFeePerProduct(plat, cat, price) }))
    .sort((a, b) => price > 0 ? a.fee.totalRp - b.fee.totalRp : a.fee.pctOnly - b.fee.pctOnly);
  const minVal = order.length ? (price > 0 ? order[0].fee.totalRp : order[0].fee.pctOnly) : 0;
  const items = order.map(o => {
    const f = PLATFORM_FEES[o.plat];
    const best = price > 0 ? o.fee.totalRp === minVal : o.fee.pctOnly === minVal;
    return `<button type="button" class="ddr-mp-item${best ? ' best' : ''}" data-ddr-tool="biaya" title="Lihat rincian biaya ${esc(f.label)}">
      <span class="ddr-mp-brand">${f.logo}<span class="ddr-mp-name">${esc(f.label)}</span></span>
      <span class="ddr-mp-pct">${ecomFmtPct(o.fee.pctOnly)}</span>
    </button>`;
  }).join('');
  return `<div class="ddr-mp" data-dd-sec="biaya_strip" aria-label="Perbandingan biaya marketplace">
    <div class="ddr-mp-strip">${items}</div>
  </div>`;
}

function ddFeesSectionHtml(product) {
  const cat = ddFeeCategory(product);
  const vol = ddFeeVolume(product);
  const { price } = vol;
  const order = Object.keys(PLATFORM_FEES).sort((a, b) => {
    const fa = platformFeePerProduct(a, cat, price), fb = platformFeePerProduct(b, cat, price);
    return price > 0 ? fa.totalRp - fb.totalRp : fa.pctOnly - fb.pctOnly;
  });
  const best = order[0];
  const cards = order.map(plat => {
    const f = PLATFORM_FEES[plat];
    const d = platformFeeDetail(plat, cat, vol);
    const rowsHtml = d.rows.map(r => `<div class="ddr-fee-row">
        <div class="ddr-fee-row-main"><div class="ddr-fee-row-name">${esc(r.name)}</div><div class="ddr-fee-row-where">${esc(r.where)}</div></div>
        <div class="ddr-fee-row-amt">${r.pct != null ? `<div class="ddr-fee-row-pct">${ecomFmtPct(r.pct)}</div>` : ''}${price > 0 ? `<div class="ddr-fee-row-rp">${ecomFmtRp(r.rpPer)}/produk</div>` : ''}</div>
      </div>`).join('');
    const noteHtml = d.note ? `<div class="ddr-fee-note">${esc(d.note)}</div>` : '';
    const badge = plat === best ? `<span class="ddr-mp-badge">${ECOM_ICON_TROPHY} Terbaik</span>` : '';
    return `<div class="ddr-card ddr-fee-card">
      <div class="ddr-fee-card-head">
        <div class="ddr-mp-brand">${f.logo}<span class="ddr-mp-name">${esc(f.label)}</span>${badge}</div>
        <div class="ddr-fee-card-total"><div class="ddr-fee-card-pct">${ecomFmtPct(d.pctOnly)}</div><div class="ddr-fee-card-sub">komisi + program</div></div>
      </div>
      ${rowsHtml}
      <div class="ddr-fee-total-row">
        <div class="ddr-fee-total-lbl">Total dibayar / produk</div>
        <div class="ddr-fee-total-amt"><div class="ddr-fee-total-val">${price > 0 ? ecomFmtRp(d.totalRp) : '—'}</div>${price > 0 ? `<div class="ddr-fee-row-rp">per unit terjual</div>` : ''}</div>
      </div>
      ${noteHtml}
      <div class="ddr-fee-src">Sumber: ${esc(f.src)}</div>
    </div>`;
  }).join('');
  const basis = price > 0 ? ` · berdasarkan harga produk ${ecomFmtRp(price)}` : '';
  return `<div class="ddr-fees-section" data-dd-sec="biaya">
    <div class="ddr-fees-intro">
      <div class="ddr-fees-title">Rincian Biaya per Marketplace</div>
      <div class="ddr-fees-sub">Kategori <b>${esc(cat)}</b>${basis}. Tiap baris menunjukkan ke mana biaya kamu mengalir.</div>
    </div>
    <div class="ddr-fees-grid">${cards}</div>
    <div class="ddr-fees-disclaimer">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>Belum termasuk <b>modal produk, ongkir, biaya iklan</b>, &amp; <b>PPh Final 0,5%</b> (pajak penghasilan UMKM, berlaku di semua platform). Biaya proses pesanan (Rp/order) ditampilkan terpisah agar tidak membesar jadi persentase di produk murah. Angka adalah <b>perkiraan per ${ECOM_FEE_UPDATED}</b> — tarif tiap platform berubah sewaktu-waktu &amp; bergantung tipe penjual, kategori spesifik, dan program yang diikuti. Selalu cek halaman resmi tiap platform untuk angka final.</div>
    </div>
  </div>`;
}

function ddAiRecLabel(scoreInfo) {
  const s = Number(scoreInfo?.score) || 0;
  if (s >= 70) return { title: 'Peluang Kuat', sub: 'Skor tinggi — layak diprioritaskan untuk uji jual' };
  if (s >= 45) return { title: 'Layak Diuji', sub: scoreInfo?.odds?.hint || 'Peluang sedang — uji dengan stok kecil dulu' };
  return { title: 'Berisiko', sub: scoreInfo?.odds?.hint || 'Skor rendah — cek kompetisi & harga sebelum masuk' };
}

function ddConfidencePct(product, peers, history) {
  const spd = Number(product?.sold_per_day);
  const hasSpd = Number.isFinite(spd) && spd > 0;
  const histN = (history || []).length;
  const peerN = (peers || []).length;
  const pct = Math.max(1, Math.min(99, Math.round(
    35 + Math.min(40, peerN) + (histN >= 2 ? 15 : 0) + (hasSpd ? 10 : 0)
  )));
  const label = pct >= 70 ? 'Tinggi' : pct >= 45 ? 'Sedang' : 'Rendah';
  return { pct, label };
}

function ddTilesHtml(product, stats, peers, series, scoreInfo, history) {
  const shopN = new Set((peers || []).map(p => String(p.shop_id))).size;
  const omset = ddOmsetSummary(product, peers);
  const omsetVal = omset.median > 0
    ? fmtRpShort(omset.median)
    : omset.single > 0 ? fmtRpShort(omset.single) : '—';
  const omsetSub = omset.median > 0
    ? 'Median pasar'
    : omset.single > 0 ? 'Estimasi listing ini' : 'Belum cukup data omset peer';
  const ai = ddAiRecLabel(scoreInfo || {});
  const conf = ddConfidencePct(product, peers, history);
  const priceLo = Number(stats.p35) || Number(stats.p25) || 0;
  const priceHi = Number(stats.p65) || Number(stats.p75) || 0;
  const priceVal = priceLo > 0 && priceHi > 0
    ? `${fmtRp(priceLo)} – ${fmtRp(priceHi)}`
    : '—';
  const priceSub = priceLo > 0 ? 'Zona masuk pasar aktif' : 'Belum cukup data harga';
  const kompVal = stats.komp
    ? `${esc(stats.komp)}${shopN ? ` (~${shopN} toko)` : ''}`
    : (shopN ? `~${shopN} toko` : '—');
  const kompSub = stats.komp === 'Rendah' ? 'Ruang masuk masih terbuka'
    : stats.komp === 'Tinggi' ? 'Pasar padat — bedakan listing'
    : 'Kompetisi menengah';
  return `<div class="ddr-hscroll ddr-hscroll--tiles" data-dd-sec="quick_stats">
    <div class="ddr-tile ddr-tile--ai"><span class="ico">${ico('spark', 14)}</span><div class="lbl">Rekomendasi AI</div><div class="val">${esc(ai.title)}</div><div class="sub">${esc(ai.sub)}</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--green-bg);color:var(--green)">${ico('wallet', 14)}</span><div class="lbl">Estimasi Omset / Bulan</div><div class="val">${omsetVal}</div><div class="sub">${esc(omsetSub)}</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--amber-bg);color:var(--amber)">${ico('users', 14)}</span><div class="lbl">Kompetisi</div><div class="val">${kompVal}</div><div class="sub">${esc(kompSub)}</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--violet-bg);color:var(--violet)">${ico('shield', 14)}</span><div class="lbl">Confidence</div><div class="val">${conf.pct}% ${esc(conf.label)}</div><div class="sub">Kekuatan sinyal dari peer &amp; riwayat scrape</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--blue-bg);color:var(--blue)">${ico('tag', 14)}</span><div class="lbl">Rekomendasi Harga</div><div class="val">${priceVal}</div><div class="sub">${esc(priceSub)}</div></div>
  </div>`;
}

function ddAksiCepatHtml(product) {
  const kw = product?.keyword || null;
  const cat = product?.category || product?.category_canonical || null;
  // Before launch: keep the button so we can toast "segera hadir" (demand signal).
  // After/during admin dogfood: only for products in the curated niche.
  const showSupplier = !supplierProbeVisible() || supplierRelevantFor(kw, cat);
  const supplierBtn = showSupplier ? `<button type="button" class="ddr-aksi-btn primary" data-ddr-aksi="supplier">
        <span class="ddr-aksi-ico">${ico('truck', 18)}</span>
        <span class="ddr-aksi-txt">Cari Supplier</span>
      </button>` : '';
  return `<div class="ddr-aksi" data-dd-sec="aksi_cepat" role="group" aria-label="Aksi cepat">
    <div class="ddr-aksi-label">Aksi Cepat</div>
    <div class="ddr-aksi-grid">
      ${supplierBtn}
      <button type="button" class="ddr-aksi-btn" data-ddr-aksi="launch">
        <span class="ddr-aksi-ico">${ico('rocket', 18)}</span>
        <span class="ddr-aksi-txt">Buat Rencana Launch</span>
      </button>
      <button type="button" class="ddr-aksi-btn" data-ddr-aksi="kompetitor">
        <span class="ddr-aksi-ico">${ico('target', 18)}</span>
        <span class="ddr-aksi-txt">Track Kompetitor</span>
      </button>
      <button type="button" class="ddr-aksi-btn" data-ddr-aksi="simpan">
        <span class="ddr-aksi-ico">${ico('bookmark', 18)}</span>
        <span class="ddr-aksi-txt">Simpan Produk</span>
      </button>
    </div>
  </div>`;
}

function ddInsightBullets(product, stats, share, series, scoreInfo, age, peers) {
  const bullets = [];
  const shopN = new Set((peers || []).map(p => String(p.shop_id))).size || share?.shops?.length || 0;
  if (stats.komp) {
    bullets.push(stats.komp === 'Rendah'
      ? `Kompetisi ${stats.komp.toLowerCase()} — masih ada ruang untuk listing baru.`
      : stats.komp === 'Tinggi'
        ? `Kompetisi tinggi (${shopN || 'banyak'} toko aktif) — bedakan foto, harga, atau bundling.`
        : `Kompetisi sedang dengan ~${shopN || 'beberapa'} toko di keyword ini.`);
  }
  if (stats.n >= 4 && stats.p35 && stats.p65) {
    bullets.push(`Zona harga masuk paling aktif: ${fmtRp(stats.p35)} – ${fmtRp(stats.p65)}.`);
  }
  const omset = ddOmsetSummary(product, peers);
  const omsetAmt = omset.median || omset.single || 0;
  if (omsetAmt > 0) bullets.push(`Estimasi omset pasar sekitar ${fmtRpShort(omsetAmt)} / bulan (median).`);
  else if (scoreInfo?.score) bullets.push(`Skor produk ${scoreInfo.score}/100 (${scoreInfo.label}).`);
  if (share?.total > 0) {
    const top3pct = Math.round(share.top3 / share.total * 100);
    bullets.push(top3pct <= 50
      ? `Top 3 toko menguasai ${top3pct}% omset — pangsa belum terkonsentrasi.`
      : `Top 3 toko menguasai ${top3pct}% omset — pasar cukup terkonsentrasi.`);
  }
  if (series?.length >= 2) {
    const a = series[0]?.omset || 0;
    const b = series[series.length - 1]?.omset || 0;
    if (a > 0 && b > 0) {
      const delta = Math.round((b - a) / a * 100);
      if (Math.abs(delta) >= 5) {
        bullets.push(delta > 0
          ? `Tren omset naik ~${delta}% sepanjang riwayat scrape yang tersedia.`
          : `Tren omset turun ~${Math.abs(delta)}% — cek ulang demand sebelum stok besar.`);
      }
    }
  }
  if (age?.total >= 4) {
    const youngMid = Math.round(((age.young + age.mid) / age.total) * 100);
    if (youngMid >= 50) bullets.push(`${youngMid}% toko berusia di bawah 5 tahun — pasar masih terbuka.`);
  }
  return bullets.slice(0, 4);
}

function ddKesimpulanCopy(scoreInfo, stats) {
  const s = Number(scoreInfo?.score) || 0;
  const label = scoreInfo?.label || 'Peluang Sedang';
  if (s >= 70) {
    return `Produk ini ${label.toLowerCase()} (skor ${s}/100). Kompetisi ${((stats.komp || 'sedang')).toLowerCase()} — cocok diprioritaskan untuk uji jual dengan stok terukur.`;
  }
  if (s >= 45) {
    return `Produk ini layak untuk diuji jual (skor ${s}/100). Mulai dengan stok kecil, masuk di zona harga aktif, dan pantau kompetitor top sebelum scale.`;
  }
  return `Produk ini berisiko (skor ${s}/100). Validasi demand & bedakan listing dulu — jangan masuk dengan stok besar sebelum sinyal lebih kuat.`;
}

function ddInsightSectionHtml(product, stats, share, series, scoreInfo, age, peers) {
  const bullets = ddInsightBullets(product, stats, share, series, scoreInfo, age, peers);
  const kesimpulan = ddKesimpulanCopy(scoreInfo, stats);
  const list = bullets.length
    ? `<ul class="ddr-insight-list">${bullets.map(b => `<li>${ico('check', 15)}<span>${esc(b)}</span></li>`).join('')}</ul>`
    : `<p class="dd-sub">Belum cukup sinyal untuk insight otomatis — cek chart &amp; kompetitor di bawah.</p>`;
  return `<div class="ddr-insight-row" data-dd-sec="insight">
    <div class="ddr-card ddr-insight-card">
      <h3>Insight Utama</h3>
      ${list}
    </div>
    <div class="ddr-card ddr-kesimpulan-card">
      <h3>Kesimpulan</h3>
      <div class="ddr-kesimpulan-box">
        <span class="ddr-kesimpulan-ico" aria-hidden="true">${ico('spark', 16)}</span>
        <p>${esc(kesimpulan)}</p>
      </div>
    </div>
  </div>`;
}

function wireDdrAksiCepat(root, product, peers) {
  root?.querySelectorAll?.('[data-ddr-aksi]')?.forEach((btn) => {
    if (btn.dataset.boundAksi) return;
    btn.dataset.boundAksi = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const aksi = btn.getAttribute('data-ddr-aksi');
      if (aksi === 'supplier') {
        if (!supplierProbeVisible() || !supplierRelevantFor(product?.keyword, product?.category || product?.category_canonical)) {
          showToast(supplierProbeVisible()
            ? 'Cari Supplier belum ada untuk kategori produk ini'
            : 'Cari Supplier segera hadir');
          return;
        }
        runDdrTool('supplier', product, peers, 'aksi_cepat');
        return;
      }
      if (aksi === 'kompetitor') {
        runDdrTool('kompetitor', product, peers, 'aksi_cepat');
        return;
      }
      if (aksi === 'launch') {
        const chips = ddComposerChips(product);
        const launch = chips.find(c => c.id === 'launch') || DD_CHIPS.find(c => c.id === 'launch');
        const prompt = launch?.prompt || 'Buat rencana launch untuk produk ini';
        void logUserEvent('deepdive_section', { ui: 'gpt', section: 'launch_cta', via: 'aksi_cepat', keyword: product?.keyword || '' });
        void handleComposerSubmit(prompt);
        return;
      }
      if (aksi === 'simpan') {
        void logUserEvent('deepdive_section', { ui: 'gpt', section: 'simpan_cta', via: 'aksi_cepat', keyword: product?.keyword || '' });
        if (window.LarisTracker?.openSetup) {
          try {
            setView('tracker');
            window.LarisTracker.openSetup();
            showToast('Tambahkan keyword produk ini di Pantauan');
            return;
          } catch (_) {}
        }
        showToast('Pantauan segera hadir');
      }
    });
  });
}

function ddKompetitorTableHtml(share, opts = {}) {
  if (!share.shops.length) return '<p class="dd-sub">Kompetitor belum tersedia untuk keyword ini.</p>';
  const moreId = opts.moreId || 'ddr-komp-more';
  const rows = share.shops.slice(0, 15).map((s, i) => {
    const sample = s.sample || {};
    const iid = sample.item_id;
    const sid = sample.shop_id;
    if (iid == null || sid == null) return '';
    const key = `${iid}|${sid}`;
    const snap = productSnapshot(asListingProduct(sample));
    const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
    const omsetMo = Math.round(s.sold / 6) * Math.round(s.omset / Math.max(1, s.sold)); // ≈ sold/6 × avg price
    // Whole row is clickable — users tap the tok name, not just the tiny "Lihat" button.
    return `<tr class="komp-click-row"${i >= 5 ? ' data-komp-extra hidden' : ''} data-kshop="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''} role="link" tabindex="0" aria-label="Buka Deep Dive ${esc((s.name || 'kompetitor').slice(0, 40))}">
      <td class="tr-rank">${i + 1}</td>
      <td><div class="tr-prod" style="min-width:140px"><span class="comp-av">${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy">` : esc((s.name || 'T').charAt(0).toUpperCase())}</span><div class="tr-prod-name">${esc((s.name || 'Toko').slice(0, 28))}</div></div></td>
      <td>${omsetMo ? fmtRpShort(omsetMo) : '—'}</td>
      <td>${s.share}%</td>
      <td><span class="komp-open-hint">Deep Dive →</span></td>
    </tr>`;
  }).join('');
  return `<div class="ddr-table-wrap"><table class="ddr-table ddr-komp-table">
    <thead><tr><th>#</th><th>Toko</th><th>Omset / Bln (est.)</th><th>Market Share</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${share.shops.length > 5 ? `<button type="button" class="ans-cta" id="${esc(moreId)}">Lihat Semua ${Math.min(15, share.shops.length)} Kompetitor</button>` : ''}`;
}

function openKompetitorDeepDive(el, peers) {
  const hit = el?.closest?.('[data-kshop]');
  if (!hit) return false;
  const encoded = hit.getAttribute('data-product');
  if (encoded) {
    try {
      const p = JSON.parse(decodeURIComponent(encoded));
      if (p?.item_id != null && p?.shop_id != null) {
        void openDeepDive(asListingProduct(p), { keepChat: true });
        return true;
      }
    } catch (_) {}
  }
  const [iid, sid] = (hit.getAttribute('data-kshop') || '').split('|');
  if (!iid || !sid) return false;
  const p = (peers || []).find(x => String(x.item_id) === iid && String(x.shop_id) === sid);
  if (!p) return false;
  void openDeepDive(asListingProduct(p), { keepChat: true });
  return true;
}

function wireKompClicks(root, peers) {
  if (!root) return;
  const more = root.querySelector('#ddr-komp-more, #side-komp-more');
  more?.addEventListener('click', (e) => {
    e.stopPropagation();
    root.querySelectorAll('[data-komp-extra]').forEach(tr => { tr.hidden = false; });
    more.remove();
  });
  root.querySelectorAll('.ddr-komp-table').forEach(table => {
    if (table.dataset.kompWired === '1') return;
    table.dataset.kompWired = '1';
    table.addEventListener('click', (e) => {
      const hit = e.target.closest?.('[data-kshop]');
      if (!hit || !table.contains(hit)) return;
      e.preventDefault();
      openKompetitorDeepDive(hit, peers);
    });
    table.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const hit = e.target.closest?.('tr[data-kshop]');
      if (!hit || !table.contains(hit)) return;
      e.preventDefault();
      openKompetitorDeepDive(hit, peers);
    });
  });
}

function ddKeywordTableHtml(kwRows, sampleN) {
  if (!kwRows.length) return '<p class="dd-sub">Belum ada variasi keyword terpantau.</p>';
  return `<div class="ddr-table-wrap"><table class="ddr-table">
    <thead><tr><th>Keyword</th><th>Listing</th><th>Terjual</th><th>Kompetisi</th><th>Tren</th></tr></thead>
    <tbody>${kwRows.map(r => `<tr>
      <td><strong>${esc(r.kw.slice(0, 32))}</strong></td>
      <td>${r.n}</td>
      <td>${fmtSold(r.sold)}</td>
      <td><span class="badge badge-comp-${r.comp.toLowerCase()}">${r.comp}</span></td>
      <td><canvas class="spark" data-spark="${esc(r.kw)}"></canvas></td>
    </tr>`).join('')}</tbody></table></div>
    <p class="ddr-caption">Dari sampel ${sampleN} listing teratas keyword ini — jumlah listing = tingkat kompetisi, bukan volume pencarian.</p>`;
}

function ddStrategyHtml(product, stats, niche, kwRows) {
  const steps = [];
  if (stats.n >= 4) steps.push(`Masuk di harga ${fmtRp(stats.p35)} – ${fmtRp(stats.p65)} untuk bersaing di zona pasar paling aktif.`);
  else steps.push(`Data harga peer masih tipis — pakai ${fmtRp(Number(product.price) || 0)} (harga produk acuan) sebagai patokan awal.`);
  steps.push('Fokus pada kualitas foto & variasi produk — itu pembeda utama di antara listing teratas.');
  const lowKws = kwRows.filter(k => k.comp !== 'Tinggi').slice(0, 2).map(k => k.kw);
  if (lowKws.length) steps.push(`Prioritaskan keyword dengan kompetisi lebih rendah: ${lowKws.join(', ')}.`);
  const wall = calcReviewWall(0, niche);
  steps.push(`Kejar ${Math.min(wall.wall, 50).toLocaleString('id-ID')} ulasan pertama secepatnya — dinding ulasan niche ini ±${wall.wall.toLocaleString('id-ID')}.`);
  steps.push('Pertimbangkan bundling 2–3 pcs untuk menaikkan nilai order rata-rata.');
  return `<ol class="ddr-steps">${steps.map((s, i) => `<li><span class="step-num">${i + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>`;
}

function drawSpark(canvas, values) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width = 52, h = canvas.height = 20;
  ctx.clearRect(0, 0, w, h);
  if (!values || values.length < 2) {
    ctx.strokeStyle = '#d4d4d4';
    ctx.beginPath(); ctx.moveTo(2, h / 2); ctx.lineTo(w - 2, h / 2); ctx.stroke();
    return;
  }
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = i / (values.length - 1) * (w - 2) + 1;
    const y = h - 2 - (v - min) / Math.max(1, max - min) * (h - 4);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = values[values.length - 1] >= values[0] ? '#16A34A' : '#B5202A';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

const _ddCenterTextPlugin = {
  id: 'ddCenterText',
  afterDraw(chart) {
    const txt = chart.options && chart.options._centerText;
    if (!txt) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const cx = (chartArea.left + chartArea.right) / 2;
    const cy = (chartArea.top + chartArea.bottom) / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#8e8e8e';
    ctx.fillText('Total omset', cx, cy - 9);
    ctx.font = '750 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#1f1f1f';
    ctx.fillText(txt, cx, cy + 8);
    ctx.restore();
  },
};

const _ddBandPlugin = {
  id: 'ddPriceBand',
  beforeDatasetsDraw(chart) {
    const b = chart.options && chart.options._band;
    if (!b) return;
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;
    const x1 = scales.x.getPixelForValue(b[0]);
    const x2 = scales.x.getPixelForValue(b[1]);
    ctx.save();
    ctx.fillStyle = 'rgba(181,32,42,.07)';
    ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
    ctx.restore();
  },
};

/** Site A parity: draw product thumbnails (or letter fallback) on Distribusi Harga points. */
const _ddDistImagePlugin = {
  id: 'ddDistImages',
  afterDatasetsDraw(chart) {
    if (chart.canvas?.id !== 'ddr-dist-canvas') return;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    meta.data.forEach((point, i) => {
      const raw = chart.data.datasets[0].data[i];
      if (!raw || raw.x == null) return;
      const { x, y } = point.getProps(['x', 'y'], true);
      const r = 11;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const img = raw._img;
      if (img?.complete && img.naturalWidth) {
        ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = raw._color || '#B5202A';
        ctx.fill();
        const letter = (raw.label || '?').trim().charAt(0).toUpperCase();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, x, y + 0.5);
      }
      ctx.restore();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    });
  },
};

function ddPrimeDistImages(chart, points) {
  if (!chart || !points?.length) return;
  const palette = ['#B5202A', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];
  points.forEach((p, i) => {
    p._color = palette[i % palette.length];
    if (!p.image_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (_charts.get('ddr-dist-canvas') === chart) chart.update('none');
    };
    img.onerror = () => { p._img = null; };
    img.src = p.image_url;
    p._img = img;
  });
}


function scrollDdrTo(sel) {
  const panel = $('panel');
  const target = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!panel || !target) return false;
  const top = target.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 12;
  panel.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  return true;
}

function runDdrTool(tool, product, peers, via) {
  const p = product || state.deepdiveProduct || activeChat()?.context?.product || null;
  const peerList = peers || _dd?.peers || [];
  if (!p && tool !== 'analisa' && tool !== 'biaya') return;
  if (tool === 'ai') {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'ai_panel', via: via || 'click', keyword: p?.keyword || '' });
    openAiPanel({ product: p, peers: peerList, via: via || 'deepdive' });
    return;
  }
  if (tool === 'analisa') {
    if (state.view !== 'deepdive') {
      if (p) void openDeepDive(p);
      return;
    }
    scrollDdrTo('.ddr-hscroll--graphs') || scrollDdrTo('[data-dd-sec="tren"]');
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'analisa', via: via || 'click', keyword: p?.keyword || '' });
    return;
  }
  if (tool === 'biaya') {
    if (state.view !== 'deepdive') {
      if (p) void openDeepDive(p);
      return;
    }
    scrollDdrTo('[data-dd-sec="biaya"]') || scrollDdrTo('.ddr-mp');
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'biaya', via: via || 'click', keyword: p?.keyword || '' });
    return;
  }
  const price = Number(p.price) || 0;
  if (tool === 'kalkulator') {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'profit_cta', via: via || 'click', keyword: p.keyword || '' });
    openCalcPanel({
      price,
      cogs: Math.round(price * 0.33),
      name: (p.product_name || p.keyword || '').slice(0, 80),
      via: via || 'deepdive',
    });
    return;
  }
  if (tool === 'kompetitor') {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'kompetitor_panel', via: via || 'click', keyword: p.keyword || '' });
    openKompPanel({ product: p, peers: peerList, via: via || 'deepdive' });
    return;
  }
  if (tool === 'serupa') {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'serupa_panel', via: via || 'click', keyword: p.keyword || '' });
    openSerupaPanel({ product: p, peers: peerList, via: via || 'deepdive' });
    return;
  }
  if (tool === 'supplier') {
    if (!supplierProbeVisible()) return;
    _supFilterKeyword  = p.keyword || null;
    _supFilterCategory = p.category || p.category_canonical || null;
    if (!supplierRelevantFor(_supFilterKeyword, _supFilterCategory)) {
      // Don't open a Fashion dump for an off-pilot product.
      return;
    }
    _supSource  = 'deepdive';
    _supShowAll = false;
    _supLog('supplier_cta_click', {
      ui: 'gpt', product_id: p.item_id || null,
      keyword: _supFilterKeyword, category: _supFilterCategory, source: 'deepdive',
    });
    openSidePanel('supplier', { product: p, via: via || 'deepdive' });
  }
}

function wireDdrToolPills(root, product, peers) {
  root?.querySelectorAll?.('[data-ddr-tool]')?.forEach((btn) => {
    if (btn.dataset.boundTool) return;
    btn.dataset.boundTool = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      runDdrTool(btn.getAttribute('data-ddr-tool'), product, peers, 'deepdive_pill');
    });
  });
}

async function openDeepDive(product, ddOpts = {}) {
  if (!currentUser) {
    // Anon users get ONE free deep dive. The first product they open is
    // remembered by item_id; re-opening that same product stays free, but a
    // second, different product triggers the (free) signup prompt.
    const id = String(product?.item_id ?? '').trim();
    let seen = '';
    try { seen = String(localStorage.getItem(ANON_DD_KEY) || '').trim(); } catch (_) {}
    if (id && seen && seen !== id) {
      // Remember the clicked product (survives the OAuth reload) so signup lands
      // the user on the deep dive they asked for, not back at the start.
      state.pendingDeepdive = product;
      saveLocalState();
      openAuthModal('signup', 'gpt_gate_deepdive');
      return;
    }
    // First free view (or same product again, or missing id) — allow through.
    if (id && !seen) {
      try { localStorage.setItem(ANON_DD_KEY, id); } catch (_) {}
    }
  }
  if (state.pendingDeepdive) { state.pendingDeepdive = null; saveLocalState(); }
  rememberProducts([product]);
  state.deepdiveProduct = product;
  setView('deepdive');
  scrollPanelToTop();
  noteCategoryOpen(product.category);
  dwellStart(product.category);
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = `<p class="dd-sub">Memuat data Deep Dive…</p>`;
  scrollPanelToTop();

  const kw = product.keyword || '';
  const cacheKey = ddCacheKey(product);
  const cached = ddCacheGet(cacheKey);
  let peers = [];
  let niche = product._niche || null;
  let history = [];

  if (cached) {
    peers = cached.peers || [];
    niche = cached.niche || niche;
    history = cached.history || [];
  } else {
    try {
      if (kw) {
        // listings_deduped: trgm-indexed, deduped, and carries listing_date
        // (shop-age proxy) since migration 20260717120000.
        const { data } = await _supabase.from('listings_deduped')
          .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date')
          .gt('total_sold', 0)
          .ilike('keyword', `%${kw.slice(0, 40)}%`)
          .order('total_sold', { ascending: false })
          .limit(60);
        peers = data || [];
      }
    } catch (_) {}

    try {
      if (kw && !niche) {
        const { data } = await _supabase.from('mv_niche_breakout')
          .select('keyword,new_items,breakouts,breakout_rate,median_new_sold,median_winner_price,median_winner_reviews')
          .eq('keyword', kw).maybeSingle();
        niche = data;
      }
    } catch (_) {}

    // Keyword scrape history → market weekly trend + sparklines.
    // Top-N peers by lifetime sold often appear in only 1–2 waves (bucket
    // leaders), so item_id IN (peers) + limit 1000 collapses Tren Omset to a
    // handful of early weeks even when the keyword has many later scrapes.
    try {
      // category/est_sold/sold_tier required for Site-A-parity delta correction
      const histCols = 'item_id,shop_id,keyword,category,price,total_sold,reviews,est_sold,sold_tier,scraped_at';
      if (kw) {
        const pageSize = 1000;
        const maxRows = 5000;
        const pages = [];
        for (let from = 0; from < maxRows; from += pageSize) {
          const { data, error } = await _supabase.from('listings')
            .select(histCols)
            .eq('keyword', kw)
            .order('scraped_at', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error || !data?.length) break;
          pages.push(...data);
          if (data.length < pageSize) break;
        }
        history = pages;
      }
      if (!history.length) {
        const ids = [...new Set([product.item_id, ...peers.map(p => p.item_id)])]
          .filter(x => x != null).slice(0, 30);
        if (ids.length) {
          const { data } = await _supabase.from('listings')
            .select(histCols)
            .in('item_id', ids)
            .order('scraped_at', { ascending: false })
            .limit(1000);
          history = (data || []).reverse();
        }
      }
    } catch (_) {}

    ddCacheSet(cacheKey, { peers, niche, history });
  }

  // Ensure pasar types carry omset P60–P100 even when opened without a prior directory attach.
  if (product._ptype && !(Number(product._ptype.omset_p60) > 0 && Number(product._ptype.omset_p100) > 0)) {
    try { await attachTypeQuartiles([product._ptype]); } catch (_) {}
  }

  // Prefer corrected scrape-interval rate for this product over invented lifetime/90.
  const scrapeSpd = ddProductSoldPerDay(history, product);
  if (scrapeSpd != null && scrapeSpd > 0) {
    product = { ...product, sold_per_day: scrapeSpd };
    state.deepdiveProduct = product;
  }

  // One product Deep Dive = one chat. Reuse only when this thread is already
  // for the same product; never append another Deep Dive onto a search thread
  // or a different product's chat.
  // ddOpts.keepChat: drilling from a market into one of its sellers stays in
  // the same thread. Without it, every Top Kompetitor click spawned a new chat
  // and the sidebar filled with near-identical threads for one investigation.
  let chat = activeChat();
  if (chat && !chatIsForProduct(chat, product) && !ddOpts.keepChat) {
    chat = null;
    state.activeChatId = null;
  }
  const title = (product._ptype ? typeTitle(kw) : (product.product_name || product.keyword || 'Produk')).slice(0, 60);
  const baseCtx = {
    kind: 'product',
    keyword: kw,
    item_id: product.item_id,
    shop_id: product.shop_id,
    product,
  };
  if (!chat) {
    if (currentUser && _supabase) {
      const { data } = await _supabase.rpc('gpt_new_chat', {
        p_title: title,
        p_context: { kind: 'product', keyword: kw, item_id: product.item_id, shop_id: product.shop_id },
      });
      if (data) noteGptUsage(data);
      if (data?.allowed === false) {
        // The daily cap is on NEW searches — viewing a product must never be
        // walled (MISSION: no trapping). Keep the session local, keep going.
        chat = { localId: 'local_' + Date.now(), title, context: { ...baseCtx }, messages: [], created_at: Date.now() };
        state.chats.unshift(chat);
        state.activeChatId = chat.localId;
      } else if (data?.chat) {
        chat = {
          id: data.chat.id,
          title,
          context: { ...(data.chat.context || {}), ...baseCtx },
          messages: [],
          created_at: Date.now(),
        };
        state.chats.unshift(chat);
        state.activeChatId = chat.id;
      }
    }
    if (!chat) {
      chat = { localId: 'local_' + Date.now(), title, context: { ...baseCtx }, messages: [], created_at: Date.now() };
      state.chats.unshift(chat);
      state.activeChatId = chat.localId;
    }
  }
  if (chat) {
    chat.context = {
      ...(chat.context || {}),
      ...baseCtx,
      peers: (peers || []).slice(0, 50).map(r => ({
        product_name: r.product_name,
        store_name: r.store_name,
        price: r.price,
        total_sold: r.total_sold,
        item_id: r.item_id,
        shop_id: r.shop_id,
      })),
    };
    // Drilling into one of a market's sellers must not rename the thread —
    // the conversation is still about the market, not that one listing.
    if (!ddOpts.keepChat) chat.title = title;
    saveLocalState();
    renderChatList();
  }

  void logUserEvent('deepdive_open', { ui: 'gpt', keyword: kw, item_id: product.item_id, shop_id: product.shop_id });
  clarityEvt('deepdive_open', { keyword: kw });
  void gptJourneyNoteDeepDive();
  funnelStep(_gptDiveSeen++ === 0 ? 'first_dive' : 'second_dive');

  const stats = ddStats(peers);
  const weekly = ddWeeklySeries(history);
  const series = ddMonthlySeries(weekly);
  const scoreInfo = ddScore(product, stats, niche);
  const share = ddShareData(peers);
  const age = ddShopAgeBuckets(peers);
  _dd = { product, peers, niche, stats, history, series };
  const sideOpts = {
    product,
    peers,
    price: Number(product.price) || 0,
    cogs: Math.round((Number(product.price) || 0) * 0.33) || undefined,
    name: (product.product_name || product.keyword || '').slice(0, 80),
  };
  // Live-refresh open side panel when switching products in Deep Dive.
  refreshOpenSidePanel(sideOpts);
  // Desktop: the AI belongs beside the report, not under it. Open it on arrival
  // unless the user has closed the panel themselves.
  //
  // The gate is `dismissed`, NOT loadSidePrefs().open — that returns
  // `open: false` for anyone with no stored prefs (the legacy-key fallback
  // fabricates it), so a fresh visitor would never see the panel at all.
  if (window.innerWidth > 860
      && !document.body.classList.contains('calc-open')
      && !loadSidePrefs().dismissed) {
    openAiPanel({ ...sideOpts, via: 'deepdive_auto' });
  }

  // Persist a Deep Dive entry in the chat thread so scrolling history always
  // reaches it (DD itself is a separate view, not part of the message list).
  if (chat) upsertDeepDiveChatMessage(chat, product, scoreInfo, stats);

  const lastScrape = history.length ? history[history.length - 1].scraped_at : null;
  const hasTrend = series.length >= 2;
  const bandLo = stats.p25, bandHi = stats.p75;
  const segLeft = stats.max > stats.min ? Math.round((bandLo - stats.min) / (stats.max - stats.min) * 100) : 0;
  const segWidth = stats.max > stats.min ? Math.max(4, Math.round((bandHi - bandLo) / (stats.max - stats.min) * 100)) : 100;
  const agePct = k => age.total ? Math.round(age[k] / age.total * 100) : 0;

  // Record this view (anon included) BEFORE reading the count back, so the
  // viewer sees a number that includes themselves.
  logProductView(product);
  let viewersYtd = 0;
  try {
    await fetchProductViewCountsYtd([product]);
    viewersYtd = viewersYtdCached(product.item_id, product.shop_id);
  } catch (_) {}

  root.innerHTML = `
    <div class="dd-head" style="margin-bottom:12px">
      <button type="button" class="btn-ghost" id="dd-back" style="margin:0">Kembali ke chat</button>
    </div>
    <div class="ddr-header" data-dd-sec="skor">
      <div class="ddr-media">
        ${ddHeaderMediaHtml(product, peers)}
        <span class="ddr-views" hidden data-view-key="${esc(viewCountKey(product.item_id, product.shop_id))}" title="Orang yang melihat produk ini di Laris tahun ini">${ico('eye', 13)}<span class="ddr-views-num" data-view-num-self>${viewersYtd.toLocaleString('id-ID')}</span><span class="ddr-views-lbl">sedang melihat</span></span>
      </div>
      <div class="ddr-head-main">
        <div class="ddr-title-row">
          <span class="ddr-level ${product._ptype ? 'ddr-level-pasar' : 'ddr-level-produk'}" title="${product._ptype ? 'Angka di halaman ini menggambarkan seluruh pasar' : 'Angka di halaman ini hanya untuk satu listing penjual'}">${product._ptype ? 'PASAR' : 'PRODUK'}</span>
          <h1>${esc(product._ptype ? typeTitle(kw) : (product.product_name || kw || 'Produk'))}</h1>
          <span class="badge ${scoreInfo.cls}">${scoreInfo.label}</span>
        </div>
        <p class="ddr-cat">${esc(ddKotaLabel(product, peers))}</p>
      </div>
      <div class="ddr-score-stack">
        <div class="ddr-score ${scoreInfo.cls}">
          <div class="lbl">Skor Produk</div>
          <div class="num">${scoreInfo.score}<span>/100</span></div>
          <span class="badge ${scoreInfo.cls}">${scoreInfo.label}</span>
        </div>
      </div>
    </div>
    ${ddToolPillsHtml(product)}
    ${ddFeeStripHtml(product)}
    ${ddTilesHtml(product, stats, peers, series, scoreInfo, history)}
    ${ddAksiCepatHtml(product)}
    <div class="ddr-hscroll ddr-hscroll--graphs">
      <div class="ddr-card" data-dd-sec="tren">
        <h3>Tren Omset &amp; Unit Terjual</h3>
        ${hasTrend
          ? `<div class="ddr-chart-wrap"><canvas id="ddr-trend-canvas"></canvas></div>
             <div class="chart-legend" style="flex-direction:row;gap:14px">
               <span class="row"><span class="swatch" style="background:#B5202A"></span>Omset / bln (Rp)</span>
               <span class="row"><span class="swatch" style="background:#2563EB"></span>Unit / bln</span>
               <span class="row"><span class="swatch" style="background:#16A34A"></span>Forecast</span>
             </div>`
          : `<p class="dd-sub">Belum cukup riwayat scrape untuk tren bulanan keyword ini — butuh beberapa gelombang panel. Bagian lain tetap dari data asli.</p>`}
        <p class="ddr-caption">Estimasi bulanan pasar keyword “${esc(kw || '—')}” (rata-rata minggu dalam setiap bulan, dari selisih scrape berurutan; snapshot pertama = baseline, bukan omset)${hasTrend ? ' · tampilan dari 27 Apr 2026' : ''} ${history.length ? `· ${new Set(history.map(r => String(r.item_id))).size} listing` : ''} · scrape terakhir ${esc(fmtAnchorDate(lastScrape))}.</p>
      </div>
      <div class="ddr-card" data-dd-sec="pangsa">
        <h3>Distribusi Pangsa Pasar</h3>
        ${share.shops.length >= 4 ? `
          <div class="ddr-chart-wrap sm"><canvas id="ddr-share-canvas"></canvas></div>
          <div class="chart-legend">
            <span class="row"><span class="swatch" style="background:#B5202A"></span>Top 3 Toko · ${Math.round(share.top3 / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#2563EB"></span>Peringkat 4–10 · ${Math.round(share.mid / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#93c5fd"></span>Peringkat 11–30 · ${Math.round(share.tail / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#e5e7eb"></span>Lainnya · ${Math.round(share.rest / share.total * 100)}%</span>
          </div>
          <p class="ddr-caption">${share.top3 / share.total <= 0.5 ? 'Pasar tidak didominasi satu toko — masih ada ruang untuk bersaing.' : 'Pasar cukup terkonsentrasi di toko-toko teratas.'}</p>`
          : '<p class="dd-sub">Belum cukup data toko untuk memetakan pangsa pasar.</p>'}
      </div>
      <div class="ddr-card" data-dd-sec="usia_toko">
        <h3>Usia Toko Kompetitor</h3>
        ${age.total >= 4 ? `
          <div class="ddr-chart-wrap" style="height:56px"><canvas id="ddr-age-canvas"></canvas></div>
          <div class="chart-legend">
            <span class="row"><span class="swatch" style="background:#2563EB"></span>0 – 2 th · ${agePct('young')}%</span>
            <span class="row"><span class="swatch" style="background:#93c5fd"></span>2 – 5 th · ${agePct('mid')}%</span>
            <span class="row"><span class="swatch" style="background:#dbeafe"></span>&gt; 5 th · ${agePct('old')}%</span>
          </div>
          <p class="ddr-caption">${agePct('young') + agePct('mid') >= 50 ? `${agePct('young') + agePct('mid')}% toko di keyword ini berusia di bawah 5 tahun — tanda pasar masih terbuka.` : 'Mayoritas toko sudah lama — pasar matang.'} Usia = proxy dari listing tertua yang terpantau.</p>`
          : '<p class="dd-sub">Belum cukup data tanggal listing untuk memetakan usia toko.</p>'}
      </div>
    </div>
    <div class="ddr-hscroll ddr-hscroll--price">
      <div class="ddr-card" data-dd-sec="harga">
        <h3>Rentang Harga Optimal</h3>
        ${stats.n >= 4 ? `
          <div class="range-big">${fmtRp(bandLo)} – ${fmtRp(bandHi)}</div>
          <div class="range-bar"><div class="range-seg" style="left:${segLeft}%;width:${segWidth}%"></div></div>
          <div class="range-ticks"><span>${fmtRpShort(stats.min)}</span><span>${fmtRpShort(stats.median)}</span><span>${fmtRpShort(stats.max)}</span></div>
          <div class="range-note">${ico('info', 13)}<span>Rentang harga dari ${stats.n} listing di keyword ini. Rekomendasi masuk pasar: ${fmtRp(stats.p35)} – ${fmtRp(stats.p65)}.</span></div>`
          : '<p class="dd-sub">Belum cukup data harga peer untuk keyword ini.</p>'}
      </div>
      <div class="ddr-card" data-dd-sec="distribusi">
        <h3>Distribusi Harga</h3>
        ${stats.n >= 6 ? `
          <div class="ddr-chart-wrap sm"><canvas id="ddr-dist-canvas"></canvas></div>
          <p class="ddr-caption">Setiap thumbnail = listing (harga × terjual). Zona merah muda = rentang ${fmtRpShort(bandLo)} – ${fmtRpShort(bandHi)} tempat sebagian besar penjualan terjadi.</p>`
          : '<p class="dd-sub">Belum cukup listing untuk memetakan distribusi harga.</p>'}
      </div>
    </div>
    ${ddInsightSectionHtml(product, stats, share, series, scoreInfo, age, peers)}
    <div class="ddr-card" data-dd-sec="kompetitor" style="margin-bottom:12px">
      <div class="ddr-sec-head">
        <h3>Top Kompetitor</h3>
        <button type="button" class="ddr-panel-link" id="ddr-komp-panel">Lihat di panel</button>
      </div>
      ${ddKompetitorTableHtml(share)}
    </div>
    ${ddFeesSectionHtml(product)}
    <div class="ddr-bottom-space" aria-hidden="true"></div>
  `;

  $('dd-back')?.addEventListener('click', () => {
    setView('chat');
    renderChatThread();
    const card = document.querySelector(`#chat-thread [data-dd-card="${prodKey(product)}"]`);
    if (card) scrollToContentStart(card);
    else scrollPanelToTop();
  });
  $('ddr-komp-panel')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'kompetitor_panel', via: 'click', keyword: kw || '' });
    openKompPanel({ product, peers, via: 'deepdive' });
  });
  wireKompClicks(root, peers);
  bindDdrCarousel(root);
  wireDdrToolPills(root, product, peers);
  wireDdrAksiCepat(root, product, peers);
  $('ddr-komp-more')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'kompetitor', via: 'click', keyword: kw || '' });
  });

  // Scroll telemetry — keeps the old deepdive_section funnel signal alive.
  const seenSecs = new Set();
  _ddObserver = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      const sec = en.target.getAttribute('data-dd-sec');
      if (!sec || seenSecs.has(sec)) return;
      seenSecs.add(sec);
      void logUserEvent('deepdive_section', { ui: 'gpt', section: sec, via: 'scroll', keyword: kw || '' });
      clarityEvt('deepdive_section', { section: sec });
    });
  }, { root: $('panel'), threshold: 0.35 });
  root.querySelectorAll('[data-dd-sec]').forEach(el => _ddObserver.observe(el));

  // Pinned bar appears once the big header scrolls out of view.
  watchDeepDiveHeaderForPin(root);
  updateProductPin();
  // Deep Dive HTML just populated — stay at the top (don't land mid-page).
  scrollPanelToTop();
  // Re-fetch YTD viewers shortly after deepdive_open lands so this user is counted.
  setTimeout(async () => {
    try {
      await fetchProductViewCountsYtd([product]);
      patchViewCountBadges(root);
    } catch (_) {}
  }, 1200);

  setComposerChips(ddComposerChips(product), 'deepdive');

  // Charts + sparklines (Chart.js lazy; sparklines are raw canvas).
  await larisEnsureChart();
  if (hasTrend) ddRenderTrendChart(series);
  if (share.shops.length >= 4) {
    makeChart('ddr-share-canvas', {
      type: 'doughnut',
      data: {
        labels: ['Top 3 Toko', 'Peringkat 4–10', 'Peringkat 11–30', 'Lainnya'],
        datasets: [{
          data: [share.top3, share.mid, share.tail, share.rest],
          backgroundColor: ['#B5202A', '#2563EB', '#93c5fd', '#e5e7eb'],
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        maintainAspectRatio: false, cutout: '68%',
        _centerText: fmtRpShort(share.total),
        plugins: { legend: { display: false } },
      },
      plugins: [_ddCenterTextPlugin],
    });
  }
  if (age.total >= 4) {
    makeChart('ddr-age-canvas', {
      type: 'bar',
      data: {
        labels: [''],
        datasets: [
          { label: '0–2 th', data: [age.young], backgroundColor: '#2563EB', borderRadius: 4 },
          { label: '2–5 th', data: [age.mid], backgroundColor: '#93c5fd', borderRadius: 4 },
          { label: '> 5 th', data: [age.old], backgroundColor: '#dbeafe', borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
      },
    });
  }
  if (stats.n >= 6) {
    const distPoints = peers
      .filter(p => (Number(p.price) || 0) > 0 && (Number(p.total_sold) || 0) > 0)
      .map(p => ({
        x: Number(p.price) || 0,
        y: Number(p.total_sold) || 0,
        label: p.store_name || p.product_name || '',
        image_url: p.image_url || null,
      }));
    const distChart = makeChart('ddr-dist-canvas', {
      type: 'scatter',
      data: {
        datasets: [{
          data: distPoints,
          // Invisible Chart.js points — thumbnails drawn by _ddDistImagePlugin.
          pointRadius: 0,
          pointHoverRadius: 12,
          hitRadius: 14,
          backgroundColor: 'transparent',
        }],
      },
      options: {
        maintainAspectRatio: false,
        _band: [bandLo, bandHi],
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = ctx.raw || {};
                return [
                  d.label || 'Listing',
                  `Harga: ${fmtRp(d.x)}`,
                  `Terjual: ${fmtSold(d.y)}`,
                ];
              },
            },
          },
        },
        scales: {
          x: { ticks: { callback: v => v >= 1e6 ? (v / 1e6) + 'jt' : Math.round(v / 1e3) + 'rb', maxTicksLimit: 6 } },
          y: { type: 'logarithmic', ticks: { callback: v => fmtSold(v), maxTicksLimit: 5 } },
        },
      },
      plugins: [_ddBandPlugin, _ddDistImagePlugin],
    });
    ddPrimeDistImages(distChart, distPoints);
  }
  root.querySelectorAll('canvas[data-spark]').forEach(cv => {
    const kwName = (cv.getAttribute('data-spark') || '').toLowerCase();
    const s = ddWeeklySeries(history.filter(r => (r.keyword || '').trim().toLowerCase() === kwName));
    drawSpark(cv, s.map(w => w.units));
  });
}

function mondayOfWeek(d = new Date()) {
  // Current Monday in WIB
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, day] = fmt.format(d).split('-').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, day, 4, 0, 0)); // midday-ish
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(utcGuess);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const offset = (map[wd] + 6) % 7; // days since Monday
  const mon = new Date(Date.UTC(y, m - 1, day - offset, 0, 0, 0));
  return mon;
}

// Monthly market trend from scrape history (weekly series rolled into months).
// Real series stays SHORTER than the labels — only Forecast touches the future
// month. Never draws a synthetic curve.
function ddRenderTrendChart(series) {
  if (typeof Chart === 'undefined' || series.length < 2) return;
  const fmtMo = ts => new Date(ts).toLocaleDateString('id-ID', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  const labels = series.map(w => fmtMo(w.ts));
  const last = new Date(series[series.length - 1].ts);
  labels.push(fmtMo(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1)));
  const omset = series.map(w => w.omset);
  const units = series.map(w => w.units);
  const last2 = arr => Math.round((arr[arr.length - 1] + (arr[arr.length - 2] ?? arr[arr.length - 1])) / 2);
  const forecast = Array(series.length - 1).fill(null).concat([omset[omset.length - 1], last2(omset)]);
  makeChart('ddr-trend-canvas', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Omset / bln (Rp)', data: omset, borderColor: '#B5202A', backgroundColor: 'rgba(181,32,42,.06)', borderWidth: 2, fill: true, tension: .35, yAxisID: 'y', pointRadius: 3 },
        { label: 'Unit / bln', data: units, borderColor: '#2563EB', borderWidth: 2, tension: .35, yAxisID: 'y2', pointRadius: 3 },
        { label: 'Forecast', data: forecast, borderColor: '#16A34A', borderDash: [5, 5], borderWidth: 2, tension: .35, yAxisID: 'y', pointRadius: 3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { position: 'left', ticks: { callback: v => v >= 1e9 ? (v / 1e9).toFixed(1) + 'M' : v >= 1e6 ? Math.round(v / 1e6) + 'jt' : v >= 1e3 ? Math.round(v / 1e3) + 'rb' : v, maxTicksLimit: 6 } },
        y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { maxTicksLimit: 5 } },
      },
    },
  });
}

// ── AI ask ───────────────────────────────────────────────────────────────
/** Pick reply language from the user's message. Mixed → most prevalent markers. */
function detectReplyLanguage(text) {
  const raw = String(text || '').toLowerCase();
  const tokens = raw.match(/[a-zà-ÿ]+/g) || [];
  const idWords = new Set([
    'yang', 'dan', 'untuk', 'dengan', 'apa', 'berapa', 'bagaimana', 'kenapa', 'mengapa',
    'ini', 'itu', 'harga', 'jual', 'jualan', 'produk', 'saya', 'aku', 'kah', 'tidak',
    'adalah', 'gimana', 'bisa', 'kalau', 'kalo', 'sama', 'dari', 'juga', 'sudah', 'udah',
    'belum', 'mau', 'akan', 'karena', 'jadi', 'lebih', 'kurang', 'banyak', 'sedikit',
    'bagus', 'laris', 'toko', 'penjual', 'kompetitor', 'omset', 'omzet', 'modal', 'untung',
    'apakah', 'dimana', 'di mana', 'kapan', 'siapa', 'kok', 'dong', 'sih', 'nya', 'lah',
    'pun', 'tapi', 'atau', 'nggak', 'gak', 'ga', 'aja', 'banget', 'nih', 'deh', 'buat',
    'punya', 'masih', 'harus', 'boleh', 'tolong', 'dong', 'nih', 'juga', 'sekali',
    'bagusan', 'lebih', 'cocok', 'layak', 'jualannya', 'penjualannya',
  ]);
  const enWords = new Set([
    'the', 'and', 'for', 'with', 'what', 'how', 'why', 'this', 'that', 'price', 'sell',
    'selling', 'product', 'products', 'my', 'is', 'are', 'can', 'if', 'same', 'from',
    'also', 'already', 'not', 'will', 'because', 'so', 'more', 'less', 'many', 'good',
    'shop', 'seller', 'competitor', 'profit', 'capital', 'when', 'where', 'who', 'which',
    'should', 'would', 'could', 'about', 'into', 'than', 'then', 'just', 'only', 'really',
    'please', 'thanks', 'hello', 'does', 'do', 'did', 'have', 'has', 'been', 'being',
    'their', 'there', 'these', 'those', 'your', 'you', 'me', 'we', 'our', 'of', 'to',
    'in', 'on', 'at', 'by', 'or', 'but', 'as', 'an', 'be', 'it', 'its', 'was', 'were',
    'best', 'better', 'worth', 'market', 'margin', 'cost', 'compare', 'versus', 'vs',
  ]);
  let id = 0, en = 0;
  for (const w of tokens) {
    if (idWords.has(w)) id += 1;
    if (enWords.has(w)) en += 1;
  }
  // Strong Indo particles even if sparse token list
  if (/\b(nggak|gak|gimana|berapa|dong|sih|banget|kah|lah|kok|udah|kalo)\b/.test(raw)) id += 2;
  // Strong English question openers
  if (/^(what|how|why|should|could|would|is|are|does|do|can|which|where|when)\b/.test(raw.trim())) en += 2;
  if (en > id) return 'en';
  if (id > en) return 'id';
  // Exact tie / no markers: prefer English if the message has no Indo particles
  // and looks like Latin English prose; otherwise Bahasa (default product locale).
  if (en === 0 && id === 0 && /\b[a-z]{3,}\b/.test(raw) && !/\b(yang|dan|untuk|dengan|apa|ini|itu)\b/.test(raw)) {
    const asciiLetters = (raw.match(/[a-z]/g) || []).length;
    if (asciiLetters >= 8) return 'en';
  }
  return 'id';
}

function replyLanguageLabel(code) {
  return code === 'en' ? 'English' : 'Bahasa Indonesia';
}

async function _useAi(action) {
  if (!_supabase || !currentUser) { openAuthModal('signup', 'gpt_gate_ai'); return false; }
  try {
    const { data, error } = await _supabase.rpc('use_ai', { p_action: action });
    if (error) throw error;
    if (data && data.allowed === false) {
      showToast(`Batas AI harian tercapai — reset dalam ${formatCountdown(wibMidnightReset())}`);
      return false;
    }
    return true;
  } catch (_) { return false; }
}

function buildProductSystemPrompt(p, question, peers) {
  const niche = p._niche || _dd?.niche;
  const rows = (peers || []).slice().sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0));
  const top10 = rows.slice(0, 10).map((r, i) =>
    `${i + 1}. ${(r.product_name || '').slice(0, 70)} — Rp ${Math.round(Number(r.price) || 0).toLocaleString('id-ID')}, terjual ${(Number(r.total_sold) || 0).toLocaleString('id-ID')}`
  ).join('\n');
  const nameSample = rows.slice(0, 40).map((r, i) =>
    `${i + 1}. ${(r.product_name || '').slice(0, 80)}`
  ).join('\n');
  const specStats = _gptBuildSpecStats(rows, question);
  const pocketStats = _gptPocketStats(rows);
  const n = rows.length;
  const lang = detectReplyLanguage(question);
  const langLabel = replyLanguageLabel(lang);
  const voice = lang === 'en'
    ? 'Reply in clear English (informal professional "you").'
    : 'Jawab dalam Bahasa Indonesia informal ("kamu").';

  return `You are LarisID's product research assistant (LARISgpt). ${voice}
LANGUAGE: Write ONLY in ${langLabel}. If the user mixed languages, use the language that is most prevalent in their message — never answer in Bahasa Indonesia when they primarily wrote in English.
PENTING:
- Angka penjualan/harga/rating HARUS dari data berikut. Jangan mengarang statistik pasar.
- Untuk pertanyaan desain/spesifikasi (kantong/pocket, bahan, warna, model, ukuran, fitur): WAJIB sift dari SAMPLE NAMA PRODUK + TOP PENJUAL di bawah. Hitung pola yang paling umum — terutama di listing terlaris. Jangan bilang "aku nggak punya info" kalau ada nama produk di bawah.
- Kalau STATISTIK SPESIFIKASI atau KANTONG ada, pakai angka itu dulu. Contoh: "Dari 40 listing sejenis, kebanyakan sebut 2 kantong; di top 10 terlaris yang menyebut jumlah, mayoritas 2–4 kantong."
- Jangan arahkan ke "tanya toko" sebagai jawaban utama kalau data pasar sudah bisa menjawab. Boleh sebut konfirmasi ke toko hanya sebagai catatan sekunder.
- Kalau user tanya cara buka/masuk link toko, link Shopee, kunjungi toko, atau "gimana masuk link toko": JELASKAN bahwa link toko & produk ada di Deep Dive produk ini — buka Deep Dive, lalu pakai tombol/link ke Shopee atau nama toko di halaman analisa. Jangan bilang kamu tidak bisa bantu, dan jangan suruh user "cari di LarisID" secara umum tanpa menyebut Deep Dive.
- Kalau user minta alternatif / produk lain / kategori lain (bahan lain, daerah lain, "how about…", "bagaimana kalau…", "dresses", "show me tumbler"): sistem UI seharusnya sudah mencari di database. JANGAN mengarang daftar produk. JANGAN bertanya apakah mereka sudah jadi penjual Shopee / onboarding. JANGAN bilang "one moment", "sebentar", "I'll look that up", atau "aku cari dulu" seolah pencarian masih jalan — itu membuat chat macet. Kalau pertanyaan masih tentang PRODUK YANG DILIHAT, jawab dari data di bawah. Kalau jelas minta produk lain dan belum ada hasil di UI, jawab singkat: sebutkan kata kunci produk/kategori yang ingin dicari (satu kalimat), tanpa janji pencarian palsu.
- Knowledge umum OK hanya sebagai pelengkap singkat, dan label jelas kalau bukan dari data.
- Jangan bilang kamu "melihat" produk — kamu membaca data.
- Keep answers short and direct. Simple questions: 2–5 plain sentences. Longer answers may use light markdown: **bold for key numbers/conclusions**, short bullet lists (- item), and ## headings only when needed. No emoji. Always stay in ${langLabel}.

DATA PRODUK YANG DILIHAT:
- Nama: ${p.product_name || '—'}
- Kategori: ${p.category || '—'}
- Keyword: ${p.keyword || '—'}
- Harga: ${p.price}
- Total terjual: ${p.total_sold}
- Sold/hari: ${p.sold_per_day}
- Ulasan: ${p.reviews}, rating: ${p.rating}
- Lokasi: ${p.location || '—'}
- Toko: ${p.store_name || '—'}
${niche ? `- Niche breakout_rate: ${niche.breakout_rate}%, new_items: ${niche.new_items}, breakouts: ${niche.breakouts}` : ''}

DATA PASAR — keyword "${p.keyword || '—'}" (${n} listing kompetitor/sejenis di LarisID):
${pocketStats}
${specStats}
${top10 ? `TOP 10 PENJUAL (urut terjual):\n${top10}` : 'Belum ada listing kompetitor.'}
${nameSample ? `\nSAMPLE NAMA PRODUK (sift spesifikasi dari sini):\n${nameSample}` : ''}

Kartu data di UI BUKAN output AI — jangan klaim begitu.`;
}

async function ensurePeerRowsForAi(product) {
  if (_dd?.peers?.length) {
    const same =
      String(_dd.product?.item_id) === String(product.item_id)
      && String(_dd.product?.shop_id) === String(product.shop_id);
    if (same || (_dd.product?.keyword && _dd.product.keyword === product.keyword)) {
      return _dd.peers;
    }
  }
  const cached = activeChat()?.context?.peers;
  if (cached?.length) return cached;
  const kw = product.keyword;
  if (!kw || !_supabase) return [];
  try {
    const { data } = await _supabase
      .from('listings')
      .select('product_name,store_name,price,total_sold,reviews,rating,location,item_id,shop_id,keyword')
      .eq('keyword', kw)
      .order('total_sold', { ascending: false })
      .limit(80);
    return data || [];
  } catch (_) {
    return [];
  }
}

function _gptAiMedian(arr) {
  const s = (arr || []).filter(n => n > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

const GPT_SPEC_GROUPS = [
  { label: 'plastik/plastic', terms: ['plastik', 'plastic', 'tritan', 'pp ', 'pet '] },
  { label: 'kaca/glass', terms: ['kaca', 'glass', 'borosilicate', 'tempered'] },
  { label: 'stainless', terms: ['stainless', '304', '316'] },
  { label: 'silikon/silicone', terms: ['silikon', 'silicone'] },
  { label: 'kayu/bamboo', terms: ['kayu', 'bamboo', 'bambu'] },
  { label: 'keramik', terms: ['keramik', 'ceramic', 'porcelain'] },
  { label: 'LED', terms: ['led ', 'lumen', ' watt'] },
  { label: 'rechargeable/USB', terms: ['recharge', 'usb', 'type-c', 'type c', 'cas '] },
  { label: 'cargo', terms: ['cargo'] },
  { label: 'training/jogger', terms: ['training', 'jogger', 'trackpant', 'track pant', 'celana olahraga'] },
  { label: 'loose/gombrong', terms: ['loose', 'gombrong', 'oversized', 'baggy'] },
  { label: 'slim/skinny', terms: ['slim', 'skinny', 'pensil'] },
  { label: 'katun/cotton', terms: ['katun', 'cotton', 'combed'] },
  { label: 'drifit/polyester', terms: ['drifit', 'dryfit', 'dri-fit', 'polyester', 'spandex'] },
];

function _gptBuildSpecStats(rows, question) {
  if (!rows?.length) return '';
  const total = rows.length;
  const qLower = String(question || '').toLowerCase();
  const groups = [];
  for (const g of GPT_SPEC_GROUPS) {
    const matched = rows.filter(r => g.terms.some(t => (r.product_name || '').toLowerCase().includes(t)));
    if (matched.length < 2) continue;
    const prices = matched.map(r => Number(r.price) || 0).filter(v => v > 0);
    const solds = matched.map(r => Number(r.total_sold) || 0).filter(v => v > 0);
    groups.push({
      ...g,
      matched,
      pct: Math.round(matched.length / total * 100),
      medPrice: _gptAiMedian(prices),
      medSold: _gptAiMedian(solds),
      qHit: g.terms.some(t => qLower.includes(t.trim())),
    });
  }
  if (!groups.length) return '';
  groups.sort((a, b) => {
    if (a.qHit !== b.qHit) return a.qHit ? -1 : 1;
    return b.matched.length - a.matched.length;
  });
  const lines = groups.slice(0, 8).map(g =>
    `${g.label}: ${g.pct}% listing (${g.matched.length}/${total}), median harga Rp ${Math.round(g.medPrice).toLocaleString('id-ID')}, median terjual ${Math.round(g.medSold).toLocaleString('id-ID')}`
  );
  return 'STATISTIK SPESIFIKASI (dari nama produk):\n' + lines.join('\n');
}

/** Mine pocket counts from competitor titles (kantong / pocket / saku). */
function _gptPocketStats(rows) {
  if (!rows?.length) return '';
  const byCount = new Map(); // n -> { listings, sold, topNames }
  let mentioned = 0;
  let cargoN = 0;
  let softN = 0;
  const top = rows.slice().sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0));
  for (const r of top) {
    const name = String(r.product_name || '').toLowerCase();
    const softHit = /kantong|pocket|saku|cargo/.test(name);
    if (softHit) softN += 1;
    if (/\bcargo\b/.test(name) && !/\bnon\s*cargo\b/.test(name)) cargoN += 1;
    let n = null;
    const m = name.match(/(\d+)\s*(?:kantong|pocket|saku)\b/)
      || name.match(/\b(?:kantong|pocket|saku)\s*(\d+)/)
      || name.match(/\b(\d+)\s*pkt\b/)
      || name.match(/\b(dua|tiga|empat|lima|enam)\s*(?:kantong|pocket|saku)\b/);
    if (m) {
      const word = { dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6 };
      n = word[m[1]] || parseInt(m[1], 10);
    }
    if (n == null || !Number.isFinite(n) || n < 1 || n > 20) continue;
    mentioned += 1;
    const slot = byCount.get(n) || { listings: 0, sold: 0, topNames: [] };
    slot.listings += 1;
    slot.sold += Number(r.total_sold) || 0;
    if (slot.topNames.length < 3) slot.topNames.push((r.product_name || '').slice(0, 55));
    byCount.set(n, slot);
  }
  if (!mentioned && !softN) return '';
  if (!mentioned) {
    return [
      `KANTONG/POCKET: ${softN}/${top.length} listing menyebut kantong/pocket/saku/cargo di nama, tapi jarang tulis jumlah angka.`,
      cargoN ? `${cargoN} listing bertipe cargo (biasanya multi-kantong) — bandingkan top names cargo vs training/jogger untuk tipikal.` : '',
      'Sift SAMPLE NAMA PRODUK + TOP 10: sebut model yang paling laris lalu estimasi tipikal berdasarkan model itu (tanpa mengarang angka penjualan).',
    ].filter(Boolean).join('\n');
  }
  const ranked = [...byCount.entries()]
    .map(([n, s]) => ({ n, ...s }))
    .sort((a, b) => b.listings - a.listings || b.sold - a.sold);
  const lines = ranked.map(r =>
    `${r.n} kantong: ${r.listings} listing (total terjual ${r.sold.toLocaleString('id-ID')})${r.topNames[0] ? ` — contoh: "${r.topNames[0]}"` : ''}`
  );
  const mode = ranked[0];
  const topMentioned = top.filter(r => {
    const name = String(r.product_name || '').toLowerCase();
    return /(\d+|dua|tiga|empat|lima|enam)\s*(?:kantong|pocket|saku)|(?:kantong|pocket|saku)\s*\d+/.test(name);
  }).slice(0, 15);
  const topModeMap = new Map();
  for (const r of topMentioned) {
    const name = String(r.product_name || '').toLowerCase();
    const m = name.match(/(\d+)\s*(?:kantong|pocket|saku)/)
      || name.match(/(?:kantong|pocket|saku)\s*(\d+)/)
      || name.match(/\b(dua|tiga|empat|lima|enam)\s*(?:kantong|pocket|saku)\b/);
    if (!m) continue;
    const word = { dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6 };
    const n = word[m[1]] || parseInt(m[1], 10);
    if (!n) continue;
    topModeMap.set(n, (topModeMap.get(n) || 0) + 1);
  }
  const topMode = [...topModeMap.entries()].sort((a, b) => b[1] - a[1])[0];
  return [
    `KANTONG/POCKET (diekstrak dari nama ${mentioned} listing):`,
    ...lines,
    mode ? `Paling sering disebut di pasar: ${mode.n} kantong (${mode.listings}/${mentioned} yang menyebut jumlah).` : '',
    topMode ? `Di listing terlaris yang menyebut jumlah: paling umum ${topMode[0]} kantong.` : '',
    cargoN ? `${cargoN}/${top.length} listing bertipe cargo.` : '',
  ].filter(Boolean).join('\n');
}

async function _mlsAIRaw(system, messages) {
  const session = _supabase ? (await _supabase.auth.getSession()).data?.session : null;
  if (!session) return 'Login untuk pakai fitur AI.';
  const res = await fetch(`${SUPA_URL}/functions/v1/claude-proxy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system, messages }),
  });
  if (res.status === 429) return 'Batas AI harian (server) tercapai. Coba lagi setelah reset tengah malam WIB.';
  if (!res.ok) return 'AI sedang sibuk. Coba lagi sebentar.';
  const d = await res.json().catch(() => ({}));
  return d?.content?.[0]?.text || d?.text || d?.message || 'Tidak ada jawaban.';
}

/**
 * Streaming variant. Calls onDelta(textChunk) as tokens arrive and resolves with
 * the full reply. Falls back to the non-streaming call on any failure, so a
 * proxy or network that cannot stream still produces an answer.
 */
async function _mlsAIStream(system, messages, onDelta, signal) {
  const session = _supabase ? (await _supabase.auth.getSession()).data?.session : null;
  if (!session) return 'Login untuk pakai fitur AI.';
  let res;
  try {
    res = await fetch(`${SUPA_URL}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, system, messages, stream: true }),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') return '';
    return _mlsAIRaw(system, messages);
  }
  if (res.status === 429) return 'Batas AI harian (server) tercapai. Coba lagi setelah reset tengah malam WIB.';
  if (!res.ok || !res.body) return _mlsAIRaw(system, messages);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; keep the trailing partial.
      const frames = buf.split('\n\n');
      buf = frames.pop() || '';
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const ev = JSON.parse(raw);
            const piece = ev?.delta?.text || (ev?.type === 'content_block_delta' ? ev?.delta?.text : '') || '';
            if (piece) { full += piece; onDelta?.(piece, full); }
          } catch (_) { /* keep-alive or partial frame */ }
        }
      }
    }
  } catch (e) {
    if (e?.name === 'AbortError') return full;
    if (!full) return _mlsAIRaw(system, messages);
  }
  return full || 'Tidak ada jawaban.';
}

// ── Cross-chat memory ────────────────────────────────────────────────────
// Durable facts the user has told us ("modal saya 500rb"), carried into the
// system prompt of every later chat. Visible and deletable in the prefs
// drawer — MISSION forbids silent profiling.
const MEMORY_LABELS = {
  modal: 'Modal', kota: 'Kota', kategori: 'Kategori',
  pengalaman: 'Pengalaman', target_margin: 'Target margin',
  platform: 'Platform', produk_fokus: 'Fokus produk',
};
let _aiMemory = [];

async function loadAiMemory() {
  if (!currentUser || !_supabase) { _aiMemory = []; return _aiMemory; }
  try {
    const { data } = await _supabase.from('user_ai_memory')
      .select('key,value,updated_at').order('updated_at', { ascending: false }).limit(20);
    _aiMemory = data || [];
  } catch (_) { _aiMemory = []; }
  return _aiMemory;
}

async function rememberFact(key, value, source = 'chat') {
  if (!currentUser || !_supabase) return;
  try {
    await _supabase.rpc('upsert_my_memory', { p_key: key, p_value: String(value), p_source: source });
    await loadAiMemory();
  } catch (_) {}
}

async function forgetFact(key) {
  if (!currentUser || !_supabase) return;
  try {
    await _supabase.rpc('forget_my_memory', { p_key: key });
    await loadAiMemory();
  } catch (_) {}
}

function memoryPromptBlock() {
  if (!_aiMemory.length) return '';
  const lines = _aiMemory
    .map(m => `- ${MEMORY_LABELS[m.key] || m.key}: ${m.value}`)
    .join('\n');
  return `\n\nMEMORI PENGGUNA (dari percakapan sebelumnya — pakai kalau relevan, jangan diulang kalau tidak ditanya):\n${lines}`;
}

/** Pull durable facts out of what the user just typed. Deliberately narrow:
 *  a few high-value patterns rather than an LLM extraction pass on every turn. */
function extractFactsFromText(text) {
  const out = [];
  const t = String(text || '').toLowerCase();
  // modal / budget: "modal 500rb", "budget 5 juta", "punya 2jt"
  const money = t.match(/(?:modal|budget|dana|uang|punya|ada)\s*(?:sekitar|kurang lebih|kira-kira)?\s*(?:rp\.?\s*)?([\d.,]+)\s*(rb|ribu|jt|juta|k|m|miliar)?/);
  if (money) {
    const num = parseFloat(money[1].replace(/\./g, '').replace(',', '.'));
    const unit = money[2] || '';
    if (Number.isFinite(num) && num > 0) {
      let rp = num;
      if (/rb|ribu|k/.test(unit)) rp = num * 1e3;
      else if (/jt|juta/.test(unit)) rp = num * 1e6;
      else if (/m|miliar/.test(unit)) rp = num * 1e9;
      if (rp >= 10000) out.push(['modal', 'Rp' + Math.round(rp).toLocaleString('id-ID')]);
    }
  }
  const margin = t.match(/(?:margin|untung|profit)\s*(?:minimal|target|sekitar)?\s*(\d{1,3})\s*%/);
  if (margin) out.push(['target_margin', `${margin[1]}%`]);
  return out;
}

async function handleComposerSubmit(text) {
  text = (text || '').trim();
  if (!text) return;
  abortAssistantStream();

  const lower = text.toLowerCase();
  if (/tampilkan produk lain/.test(lower) || /^produk lain$/.test(lower) || /^rekomendasi baru$/.test(lower)) {
    await openMoreProductsDirectory();
    return;
  }

  const productCtx = state.deepdiveProduct || activeChat()?.context?.product || null;
  const inProductCtx = state.view === 'deepdive' || !!activeChat()?.context?.product || !!activeChat()?.context?.keyword;

  // Product-context “bandingkan …”: if the message NAMES the other product
  // (“dibanding kalau jual tas ransel”), find it and open the compare
  // directly; otherwise fall back to the manual directory pick — unless the
  // user typed an explicit “A vs B” keyword compare.
  if (productCtx && /bandingkan|dibanding/.test(lower)) {
    const term = extractCompareTerm(lower);
    if (term) {
      const hits = await searchListings(term, [], 10);
      const other = hits && hits[0] ? asListingProduct(hits[0]) : null;
      if (other) {
        void logUserEvent('gpt_intent', { ui: 'gpt', intent: 'auto_compare', term });
        clarityEvt('gpt_intent', { intent: 'auto_compare' });
        await openProductCompare(productCtx, other);
        return;
      }
    }
    const explicitVs = /\bvs\.?\b/.test(lower) && !/produk lain|yang mirip/.test(lower);
    if (!explicitVs) {
      await startComparePick(productCtx);
      return;
    }
  }

  // Topic change inside a product chat: market-level / new-search asks leave
  // this Deep Dive thread so each product stays organized in its own chat.
  if (inProductCtx) {
    const route = detectTopicChange(lower);
    if (route) {
      void logUserEvent('gpt_intent', { ui: 'gpt', intent: 'topic_change', kind: route.kind, city: route.city || '' });
      clarityEvt('gpt_intent', { intent: 'topic_change' });
      beginFreshChat();
      if (route.kind === 'city_list') {
        await openDirectoryForCity(route.city);
        showToast(`Produk dari seller sekitar ${route.city}`);
      } else {
        setView('chat');
        await handleComposerSubmit(text);
      }
      return;
    }
  }

  // Category showcase only for broad category asks (“cari fashion”, “skincare
  // trending”) — specific nouns (“dresses”) fall through to planned search.
  const catAsk = detectCategoryFromText(lower);
  if (!inProductCtx && catAsk && isCategoryLevelAsk(lower, catAsk)
      && (isProductDiscoveryAsk(lower) || isBareProductQuery(lower))) {
    setView('chat');
    let chat = activeChat();
    if (!chat) {
      chat = { localId: 'local_' + Date.now(), title: text.slice(0, 40), context: {}, messages: [], created_at: Date.now() };
      state.chats.unshift(chat);
      state.activeChatId = chat.localId;
      renderChatList();
    }
    appendBubble('user', `<p>${esc(text)}</p>`);
    pushMessage(chat, 'user', text);
    void logUserEvent('gpt_message_sent', { ui: 'gpt' });
    clarityEvt('gpt_message_sent', {});
    void logUserEvent('gpt_intent', { ui: 'gpt', intent: 'category_search', category: catAsk });
    clarityEvt('gpt_intent', { intent: 'category_search' });
    await replyWithCategoryProducts(chat, text, catAsk);
    return;
  }

  // Data-backed intents (home/trending/DD chips + free text). In a product
  // conversation only profit is intercepted (it uses the product's own data);
  // everything else there goes to AI as before.
  // Bandingkan with explicit “A vs B” is also allowed in product context.
  const intent = detectIntent(lower);
  if (intent && (!inProductCtx || intent === 'profit' || intent === 'bandingkan')) {
    await handleIntent(intent, text);
    return;
  }

  // "Recommend me something" intent — only outside a product conversation.
  if (!inProductCtx && /tunjukkan|rekomendasi|jual apa|produk apa|cocok buat|mulai jual/.test(lower)) {
    clarityEvt('gpt_intent_rec', {});
    await startRecommendationChat(false);
    return;
  }

  // Free-text AI about product requires login
  if (inProductCtx) {
    if (!currentUser) {
      openAuthModal('signup', 'gpt_gate_ai');
      return;
    }
  }

  const leavingDeepdive = state.view === 'deepdive';
  setView('chat');
  let chat = activeChat();
  if (!chat) {
    // Treat as starting a search-oriented chat without consuming search if just AI on empty — create local thread
    chat = { localId: 'local_' + Date.now(), title: text.slice(0, 40), context: {}, messages: [], created_at: Date.now() };
    state.chats.unshift(chat);
    state.activeChatId = chat.localId;
    renderChatList();
  }

  // Rebuild thread when leaving DD so the Deep Dive chat card is visible
  // before the new user turn (composer leave does not call dd-back).
  if (leavingDeepdive) renderChatThread();

  appendBubble('user', `<p>${esc(text)}</p>`);
  pushMessage(chat, 'user', text);
  void logUserEvent('gpt_message_sent', { ui: 'gpt' });
  clarityEvt('gpt_message_sent', {});

  const product = chat.context?.product || (state.view === 'deepdive' ? state.deepdiveProduct : null);
  if (!product) {
    // No product context — try category showcase first, else keyword search
    if (!(await ensureSearchAllowed())) return;
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari di data…</p>`);
    const catFallback = detectCategoryFromText(text.toLowerCase());
    if (catFallback && isCategoryLevelAsk(text.toLowerCase(), catFallback)) {
      // Pasar first here too: this inline branch fires for queries that map to
      // a category ("tanaman artificial" -> Tanaman) and would otherwise show
      // 12 individual listings instead of the markets behind them.
      const place1 = parsePlaceFromQuery(text);
      const q1 = cleanDiscoveryQuery(place1.cleaned || text) || (place1.cleaned || text);
      const catTypes = await searchProductTypes(q1, place1.city || '', 12);
      if (await replyWithPasarTypes(chat, text, catTypes, {
        loading, label: q1, placeLabel: place1.label || place1.city || '',
      })) return;
      const showcase = await fetchCategoryShowcase(catFallback, 24);
      const showTypes = await typesForListings(showcase, place1.city || '', 12);
      if (showTypes.length && await replyWithPasarTypes(chat, text, showTypes, {
        loading, label: catFallback, placeLabel: place1.label || place1.city || '',
      })) return;

      const gate = await ensureIntentChat(chat, text.slice(0, 60), { kind: 'category_search', category: catFallback, q: text });
      if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
      state.recommendations = [];
      const html = `<p>Belum ketemu pasar di kategori <strong>${esc(catFallback)}</strong>. Coba kata kunci lain atau buka Produk.</p>`;
      if (loading) await revealAssistant(loading, html);
      else await appendAssistantStream(html);
      pushMessage(chat, 'assistant', {
        text: 'Hasil kategori', q: text, category: catFallback, products: [],
      }, html);
      void logUserEvent('discover_view', { ui: 'gpt', q: text, category: catFallback, count: 0 });
      return;
    }
    const place = parsePlaceFromQuery(text);
    const locations = place.locations || [];
    const cleaned = cleanDiscoveryQuery(place.cleaned || text) || (place.cleaned || text);
    const placeLabel = place.label || place.city || '';

    // PASAR FIRST: answer with the market, not one shop's listing.
    const types = await searchProductTypes(cleaned, place.city || '', 12);
    if (await replyWithPasarTypes(chat, text, types, { loading, label: cleaned, placeLabel })) return;

    // No market matched by name. Widen instead of dropping to listings: run the
    // listing search (which already applies the multilingual query plan) and
    // lift whatever it finds back up to the markets those listings belong to.
    // A single listing is never the answer to a top-level search — individual
    // products live one level down, in a market's Kompetitor table.
    const result = await searchProductsForQuery(cleaned, locations, 24);
    const widened = await typesForListings(result.products, place.city || '', 12);
    if (widened.length && await replyWithPasarTypes(chat, text, widened, {
      loading, label: cleaned, placeLabel,
    })) return;

    state.recommendations = [];
    if (currentUser && _supabase && !chat.id) {
      const { data } = await _supabase.rpc('gpt_new_chat', { p_title: text.slice(0, 60), p_context: { kind: 'search', q: text } });
      if (data) noteGptUsage(data);
      if (data?.allowed === false) {
        const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(data.reset_at || wibMidnightReset())}.`;
        if (loading) await revealAssistant(loading, `<p>${esc(msg)}</p>`, { instant: true });
        showToast(msg);
        gptLimitHit({ resetAt: data.reset_at });
        return;
      }
      if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; flushChatMessages(chat); }
      funnelStep('first_search', { source: 'text' });
    } else if (!currentUser) {
      bumpAnonSearch();
    }
    const html = searchClarifyHtml(text, result.domain);
    if (loading) await revealAssistant(loading, html);
    else await appendAssistantStream(html);
    pushMessage(chat, 'assistant', {
      text: 'Klarifikasi pencarian',
      q: text,
      products: [],
    }, html);
    bindSearchSuggests();
    void logUserEvent('discover_view', {
      ui: 'gpt',
      q: text,
      count: 0,
      clarify: 1,
      domain: result.domain?.id || '',
    });
    return;
  }

  await askProductAi(chat, product, text);
}

/**
 * One product-AI turn. Extracted so the docked composer and the Tanya AI side
 * panel share it verbatim — persistence (gpt_messages) and the daily use_ai cap
 * are the two things that must never diverge between the two entry points.
 *
 * opts.root: render the bubbles into that element instead of #chat-thread.
 */
async function askProductAi(chat, product, text, opts = {}) {
  const root = opts.root || null;
  // Persist the thread before the AI turn so both the question and the reply
  // are saved. Stays local (never walls) if the daily cap is already hit.
  await ensureChatPersisted(chat, (product.product_name || product.keyword || text).slice(0, 60), {
    kind: 'product', item_id: product.item_id, shop_id: product.shop_id, keyword: product.keyword,
  });
  if (!(await _useAi('mls_chat'))) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menjawab dari data produk…</p>`, root ? { root } : {});
  const peers = await ensurePeerRowsForAi(product);
  // System prompt now carries durable facts from earlier chats, so "modal saya
  // 500rb" said last week still shapes the answer.
  const system = buildProductSystemPrompt(product, text, peers) + memoryPromptBlock();
  // …and the turn carries the recent thread, so follow-ups make sense. Every
  // turn used to be a single message with no history at all.
  const history = chatHistoryForAi(chat, text);
  const reply = await streamAssistantReply(loading, system, history, { root });
  pushMessage(chat, 'assistant', { text: reply }, mdToHtml(reply) || `<p>${esc(reply)}</p>`);
  void logUserEvent('gpt_ai_reply', { ui: 'gpt', keyword: product.keyword, via: root ? 'side_panel' : 'composer' });
  clarityEvt('gpt_ai_reply', {});
  // Learn from what the user said, after the reply so it never delays it.
  extractFactsFromText(text).forEach(([k, v]) => { void rememberFact(k, v, 'chat'); });
}

/** Trailing window of the current thread, as Anthropic-style turns. */
function chatHistoryForAi(chat, latestText) {
  const msgs = (chat?.messages || [])
    .filter(m => (m.role === 'user' || m.role === 'assistant'))
    .slice(-12)
    .map(m => {
      const c = m.content;
      const t = typeof c === 'string' ? c : (c?.text || '');
      return t ? { role: m.role, content: String(t).slice(0, 4000) } : null;
    })
    .filter(Boolean);
  // pushMessage already appended the current user turn; don't send it twice.
  if (msgs.length && msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content === latestText) {
    return msgs;
  }
  return [...msgs, { role: 'user', content: latestText }];
}

/** Stream a reply into an existing bubble, with a working Stop button. */
async function streamAssistantReply(loading, system, messages, opts = {}) {
  const bubble = loading?.querySelector?.('.msg-bubble') || loading;
  const root = opts.root || null;
  let acc = '';
  let painting = false;
  const paint = () => {
    if (painting || !bubble) return;
    painting = true;
    requestAnimationFrame(() => {
      painting = false;
      bubble.innerHTML = mdToHtml(acc) || `<p>${esc(acc)}</p>`;
      if (root) root.scrollTop = root.scrollHeight;
      else scrollChatToBottom();
    });
  };
  _streamAbort = new AbortController();
  setComposerStopping(true);
  try {
    const reply = await _mlsAIStream(system, messages, (_piece, full) => {
      acc = full;
      paint();
    }, _streamAbort.signal);
    acc = reply || acc;
    if (bubble) bubble.innerHTML = mdToHtml(acc) || `<p>${esc(acc)}</p>`;
    return acc;
  } finally {
    setComposerStopping(false);
    _streamAbort = null;
  }
}

// ── Directory ────────────────────────────────────────────────────────────
// ── Canonical taxonomy (category_map / keyword_subgroup) ─────────────────
// The 19-category hardcoded list reached only 32.6% of product types: the DB
// carries 84 raw category strings (Fashion alone was split across nine) plus a
// large uncategorised bucket. category_map collapses them into canonical
// buckets and keyword_subgroup holds data-derived sub-groups, both rebuilt by
// refresh_breakout_matviews(). Loading them from the DB instead of hardcoding
// is what stops the taxonomy drifting between Site A, Site B and SQL again.
let CANON_CATS = [];
let CAT_CANON_MAP = Object.create(null); // raw category string -> canonical bucket
const _subgroupCache = Object.create(null);

async function loadCanonicalCats() {
  if (CANON_CATS.length) return CANON_CATS;
  try {
    const cached = JSON.parse(localStorage.getItem('_lid_canon_cats_v1') || 'null');
    if (cached?.ts && Date.now() - cached.ts < 864e5 && Array.isArray(cached.cats) && cached.cats.length) {
      CANON_CATS = cached.cats;
      if (cached.map) CAT_CANON_MAP = cached.map;
    }
  } catch (_) {}
  try {
    if (!_supabase) return CANON_CATS;
    const { data } = await _supabase.from('category_map')
      .select('raw_category,canonical,sort_order').order('sort_order', { ascending: true });
    const seen = new Set();
    const cats = [];
    const map = Object.create(null);
    (data || []).forEach(r => {
      if (!r.canonical) return;
      if (r.raw_category) map[r.raw_category] = r.canonical;
      if (!seen.has(r.canonical)) { seen.add(r.canonical); cats.push(r.canonical); }
    });
    if (cats.length) {
      CANON_CATS = cats;
      CAT_CANON_MAP = map;
      try { localStorage.setItem('_lid_canon_cats_v1', JSON.stringify({ ts: Date.now(), cats, map })); } catch (_) {}
    }
  } catch (_) {}
  return CANON_CATS;
}

/** Keywords belonging to one sub-group — used by the legacy listing grid,
 *  which filters listing rows rather than product-type rows. */
const _sgKeywordCache = Object.create(null);
async function subgroupKeywords(cat, sub) {
  if (!cat || !sub || !_supabase) return new Set();
  const key = `${cat}|${sub}`;
  if (_sgKeywordCache[key]) return _sgKeywordCache[key];
  try {
    const { data } = await _supabase.from('keyword_subgroup')
      .select('keyword').eq('canonical', cat).eq('subgroup', sub).limit(4000);
    const set = new Set((data || []).map(r => String(r.keyword || '').trim()).filter(Boolean));
    _sgKeywordCache[key] = set;
    return set;
  } catch (_) { return new Set(); }
}

/** Old/raw category name -> canonical bucket. Stored onboarding prefs and the
 *  finder chips still hold pre-taxonomy names like "Bayi & Anak". */
function toCanonicalCat(raw) {
  const c = String(raw || '').trim();
  if (!c) return null;
  if (CANON_CATS.includes(c)) return c;
  return CAT_CANON_MAP[c] || null;
}

/** Sub-groups that actually have products in this canonical bucket. */
async function loadSubgroups(cat) {
  if (!cat || !_supabase) return [];
  if (_subgroupCache[cat]) return _subgroupCache[cat];
  try {
    const { data } = await _supabase.from('keyword_subgroup')
      .select('subgroup').eq('canonical', cat).limit(4000);
    const counts = Object.create(null);
    (data || []).forEach(r => { if (r.subgroup) counts[r.subgroup] = (counts[r.subgroup] || 0) + 1; });
    // 'Lainnya' sorts last so real product groups lead.
    const groups = Object.keys(counts)
      .sort((a, b) => (a === 'Lainnya') - (b === 'Lainnya') || counts[b] - counts[a]);
    _subgroupCache[cat] = groups;
    return groups;
  } catch (_) { return []; }
}

// ── Product Types (product_types_v) ──────────────────────────────────────
// The directory shows one card per PRODUCT TYPE (= the scrape keyword, which
// the panel curated at exactly "one supplier could make this" granularity)
// instead of individual listings. Aggregates are precomputed server-side per
// (keyword, city bucket) — omset from top-15 sellers, price band, seller
// count, top-5 images — so the whole grid is one indexed query.
const _ptypeCache = Object.create(null);

const PTYPE_COLS = 'keyword,city,category,category_canonical,subgroup,n_listings,n_sellers,price_min,price_median,price_max,avg_sold,total_sold_sum,omset_top15,sold_top3_share,images,rep_item_id,rep_shop_id,rep_product_name,rep_store_name,rep_price,rep_total_sold,rep_reviews,rep_rating,rep_location,rep_image_url,rep_url,rep_listing_date,trend_delta_30d,breakout_rate,niche_new_items,median_winner_price,median_winner_reviews';

async function fetchProductTypes(city, cat, limit = 1000, sub = null) {
  if (!_supabase) return [];
  const bucket = city || 'ALL';
  const key = `${bucket}|${cat || ''}|${sub || ''}`;
  if (_ptypeCache[key]) return _ptypeCache[key];
  try {
    let q = _supabase.from('product_types_v')
      .select(PTYPE_COLS)
      .eq('city', bucket)
      .gte('n_listings', 3)
      .order('omset_top15', { ascending: false, nullsFirst: false })
      .limit(limit);
    // Canonical bucket + server-side subgroup: the old client-side keyword
    // substring test could not see the 67% of types whose raw category string
    // was not one of the 19 hardcoded chips.
    if (cat) q = q.eq('category_canonical', cat);
    if (sub) q = q.eq('subgroup', sub);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    await attachTypeQuartiles(rows);
    _ptypeCache[key] = rows;
    return rows;
  } catch (_) { return []; }
}

/**
 * Pasar-level search: resolve a query to PRODUCT TYPES (markets), not listings.
 *
 * Searching "tanaman artificial" used to return 30 near-identical listings from
 * 30 different shops. The market view answers the question people actually
 * have — how big is this, how many sellers, what price band — so it leads, and
 * the listing search stays as the fallback for long-tail / exact-item intent.
 *
 * Reuses planSearch() so the EN/ID synonym expansion built for listing search
 * applies here too ("cross stitch" -> kristik) rather than being duplicated.
 */
async function searchProductTypes(text, city, limit = 12) {
  if (!_supabase) return [];
  const raw = String(text || '').trim();
  if (raw.length < 3) return [];
  let terms = [raw];
  try {
    const plan = await planSearch(raw);
    const extra = (plan?.queries || []).filter(Boolean);
    terms = [...new Set([raw, ...extra])].slice(0, 6);
  } catch (_) {}

  const bucket = city || 'ALL';
  const seen = new Set();
  const hits = [];
  const runs = await Promise.all(terms.map(async t => {
    try {
      const { data } = await _supabase.from('product_types_v')
        .select(PTYPE_COLS)
        .eq('city', bucket)
        .gte('n_listings', 3)
        .ilike('keyword', `%${t.slice(0, 40)}%`)
        .order('omset_top15', { ascending: false, nullsFirst: false })
        .limit(limit * 2);
      return data || [];
    } catch (_) { return []; }
  }));
  runs.forEach(rows => rows.forEach(r => {
    if (!r?.keyword || seen.has(r.keyword)) return;
    seen.add(r.keyword);
    hits.push(r);
  }));

  // Rank by planned synonym match, then market size — so “dresses” ranks
  // “gaun” / “dress wanita” hits above unrelated fashion types.
  const q = raw.toLowerCase();
  const planTokens = [...new Set(
    terms.flatMap(t => String(t).toLowerCase().split(/\s+/).filter(x => x.length > 2))
  )];
  const qTokens = q.split(/\s+/).filter(t => t.length > 2);
  hits.forEach(h => {
    const kw = String(h.keyword || '').toLowerCase();
    let score = 0;
    if (kw === q) score += 100;
    terms.forEach(t => {
      const tl = String(t).toLowerCase();
      if (kw === tl) score += 90;
      else if (kw.includes(tl) || tl.includes(kw)) score += 45;
    });
    if (kw.includes(q)) score += 40;
    planTokens.forEach(t => { if (kw.includes(t)) score += 12; });
    qTokens.forEach(t => { if (kw.includes(t)) score += 10; });
    score += Math.min(10, Math.log10(Number(h.omset_top15) || 1));
    h._score = score;
  });
  hits.sort((a, b) => b._score - a._score);
  const ranked = hits.filter(h => h._score >= 10).slice(0, limit);
  if (ranked.length) await attachTypeQuartiles(ranked);
  return ranked;
}

/** Attach Q1/Q3 price band + omset P60–P100 from listings_deduped (RPC) onto type rows. */
async function attachTypeQuartiles(rows) {
  if (!_supabase || !rows?.length) return rows;
  const kws = [...new Set(rows.map(r => r.keyword).filter(Boolean))];
  if (!kws.length) return rows;
  try {
    const { data, error } = await _supabase.rpc('product_type_quartiles', { p_keywords: kws });
    if (error) throw error;
    const map = new Map((data || []).map(r => [r.keyword, r]));
    rows.forEach(r => {
      const q = map.get(r.keyword);
      if (!q) return;
      r.price_p25 = Number(q.price_p25) || null;
      r.price_p75 = Number(q.price_p75) || null;
      r.omset_p60 = Number(q.omset_p60) || null;
      r.omset_p100 = Number(q.omset_p100) || null;
    });
  } catch (e) {
    console.warn('[typeQuartiles]', e?.message || e);
  }
  return rows;
}

function typeTitle(kw) {
  return String(kw || '').replace(/\b\w/g, c => c.toUpperCase());
}

function typeNiche(t) {
  if (t.breakout_rate == null) return null;
  return {
    keyword: t.keyword,
    breakout_rate: t.breakout_rate,
    new_items: t.niche_new_items,
    median_winner_price: t.median_winner_price,
    median_winner_reviews: t.median_winner_reviews,
  };
}

// The type's top listing anchors the existing Deep Dive (which already
// computes peers/price band/share/trend at keyword level = the whole type).
function typeRepProduct(t) {
  const p = asListingProduct({
    item_id: t.rep_item_id, shop_id: t.rep_shop_id,
    product_name: t.rep_product_name, store_name: t.rep_store_name,
    price: t.rep_price, total_sold: t.rep_total_sold,
    reviews: t.rep_reviews, rating: t.rep_rating,
    location: t.rep_location, image_url: t.rep_image_url, url: t.rep_url,
    keyword: t.keyword, category: t.category, listing_date: t.rep_listing_date,
  });
  p._ptype = t;
  const niche = typeNiche(t);
  if (niche) p._niche = niche;
  return p;
}

function typeCardHtml(t, absIdx, animIdx) {
  const imgs = (t.images || []).filter(Boolean);
  const mainImg = imgs[0] || t.rep_image_url || '';
  const lo = Number(t.omset_p60) || 0;
  const hi = Number(t.omset_p100) || 0;
  const omsetVal = (lo > 0 && hi > 0)
    ? `${fmtRpShort(lo)} – ${fmtRpShort(hi)}`
    : (t.omset_top15 ? fmtOmset(t.omset_top15) : '—');
  const vk = (t.rep_item_id != null && t.rep_shop_id != null)
    ? viewCountKey(t.rep_item_id, t.rep_shop_id) : '';
  const viewers = vk ? viewersYtdCached(t.rep_item_id, t.rep_shop_id) : 0;
  const viewsHtml = vk
    ? `<span class="prod-card-views" hidden data-view-key="${esc(vk)}" title="Orang yang melihat produk ini di Laris tahun ini">${ico('eye', 11)}<span data-view-num>${viewers.toLocaleString('id-ID')}</span></span>`
    : '';
  return `<button type="button" class="prod-card ptype-card" data-ptype="${absIdx}" data-ptype-kw="${esc(t.keyword || '')}" style="animation-delay:${(animIdx % 3) * 0.06}s">
    ${mainImg ? `<img src="${esc(mainImg)}" alt="" loading="lazy">` : '<div class="prod-card-ph"></div>'}
    <div class="prod-card-body">
      <div class="prod-card-name-row">
        <div class="prod-card-name">${esc(typeTitle(t.keyword))}</div>
        ${viewsHtml}
      </div>
      <div class="prod-card-stats prod-card-stats--slim">
        <div class="prod-stat">
          <span class="prod-stat-lbl">Omset/bulan</span>
          <span class="prod-stat-val">${omsetVal}</span>
        </div>
      </div>
    </div>
  </button>`;
}

// Types rendered anywhere (directory grid OR a chat answer), keyed by keyword.
// Resolving by array index alone breaks as soon as another surface overwrites
// state.dirTypes — a chat card would then open a different product.
const _ptypeByKeyword = new Map();
function registerTypes(rows) {
  (rows || []).forEach(t => { if (t?.keyword) _ptypeByKeyword.set(t.keyword, t); });
}

/**
 * Listing rows -> the markets those listings belong to.
 *
 * Every top-level surface on B answers with markets now, and the ranking work
 * (naik daun, budget, daily recs, showcase) is all done on the listing side.
 * This lifts a ranked listing list to the market level while preserving that
 * ordering. Keywords with no market row are DROPPED rather than falling back to
 * a single listing — dropping is what keeps individual products at the
 * Kompetitor level, which is the whole point of the change.
 */
async function typesForListings(rows, city, limit = 12) {
  const kws = [];
  (rows || []).forEach(r => {
    const k = r?.keyword;
    if (k && !kws.includes(k)) kws.push(k);
  });
  if (!kws.length || !_supabase) return [];
  const missing = kws.filter(k => !_ptypeByKeyword.has(k));
  let fetched = [];
  if (missing.length) {
    try {
      const { data } = await _supabase.from('product_types_v')
        .select(PTYPE_COLS)
        .eq('city', city || 'ALL')
        .in('keyword', missing.slice(0, 80))
        .gte('n_listings', 3);
      fetched = data || [];
    } catch (e) { console.warn('[typesForListings]', e?.message || e); }
  }
  registerTypes(fetched);
  const out = [];
  kws.forEach(k => {
    const t = _ptypeByKeyword.get(k);
    if (t && out.length < limit && !out.includes(t)) out.push(t);
  });
  if (out.length) await attachTypeQuartiles(out);
  return out;
}

/** Market grid markup, so call sites read the same as the old productCardsHtml. */
function marketCardsHtml(types) {
  return (types || []).map((t, i) => typeCardHtml(t, i, i)).join('');
}

function bindTypeCards(root) {
  (root || document).querySelectorAll('[data-ptype]').forEach(btn => {
    if (btn.dataset.boundPtype) return;
    btn.dataset.boundPtype = '1';
    btn.addEventListener('click', () => {
      const kw = btn.getAttribute('data-ptype-kw');
      const t = (kw && _ptypeByKeyword.get(kw))
        || state.dirTypes[Number(btn.getAttribute('data-ptype'))];
      if (!t) return;
      const p = typeRepProduct(t);
      rememberProducts([p]);
      void logUserEvent('ptype_open', { ui: 'gpt', keyword: t.keyword, city: state.dirCity || 'ALL' });
      void openDeepDive(p);
    });
  });
}

function sortTypeRows(rows, mode) {
  const out = (rows || []).slice();
  if (mode === 'termurah') out.sort((a, b) => (Number(a.price_median) || 0) - (Number(b.price_median) || 0));
  else if (mode === 'termahal') out.sort((a, b) => (Number(b.price_median) || 0) - (Number(a.price_median) || 0));
  else if (mode === 'naik_daun') out.sort((a, b) => (Number(b.trend_delta_30d) || 0) - (Number(a.trend_delta_30d) || 0));
  else out.sort((a, b) => (Number(b.omset_top15) || 0) - (Number(a.omset_top15) || 0)); // terlaris
  return out;
}

function sortDirRows(rows, mode) {
  const out = (rows || []).slice();
  if (mode === 'termurah') out.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  else if (mode === 'termahal') out.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  else if (mode === 'naik_daun') out.sort((a, b) => (Number(b.sold_per_day) || 0) - (Number(a.sold_per_day) || 0));
  else out.sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0)); // terlaris
  return out;
}

function _dirApplyDefaultsOnce() {
  if (state._dirDefaultsApplied) return;
  state._dirDefaultsApplied = true;
  syncDirectoryFromOnboarding();
}

function matchDirCatFromProduct(product) {
  const cat = String(product?.category || '').toLowerCase();
  if (!cat) return null;
  return NU_ONB_CATS.find(c => {
    const cl = c.toLowerCase();
    return cat.includes(cl) || cl.includes(cat.slice(0, Math.min(8, cat.length)));
  }) || null;
}

function updateDirCompareBanner() {
  const banner = $('dir-compare-banner');
  if (!banner) return;
  const src = state.comparePick?.source;
  if (!src) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  const name = (src.product_name || src.keyword || 'produk ini').slice(0, 72);
  banner.hidden = false;
  banner.innerHTML = `
    <div class="dir-compare-inner">
      <div class="dir-compare-text">
        <strong>Mode bandingkan</strong>
        <span>Pilih produk di bawah untuk dibandingin dengan <em>${esc(name)}</em></span>
      </div>
      <button type="button" class="btn-ghost" id="dir-compare-cancel" style="margin:0">Batal</button>
    </div>`;
  $('dir-compare-cancel')?.addEventListener('click', () => cancelComparePick());
}

function cancelComparePick() {
  const src = state.comparePick?.source;
  state.comparePick = null;
  updateDirCompareBanner();
  if (src) void openDeepDive(src);
  else setView('chat');
}

async function startComparePick(source) {
  if (!source) {
    showToast('Buka produk dulu untuk membandingkan');
    return;
  }
  state.comparePick = { source };
  state.dirPage = 1;
  const match = matchDirCatFromProduct(source);
  if (match) state.dirCat = toCanonicalCat(match) || null;
  void logUserEvent('gpt_compare_pick', { ui: 'gpt', keyword: source.keyword || '', item_id: source.item_id });
  clarityEvt('gpt_compare_pick', {});
  await openDirectory();
  updateDirCompareBanner();
}

async function fetchPeersForCompare(product) {
  const kw = product?.keyword || '';
  let peers = [];
  let niche = product?._niche || null;
  if (!_supabase || !kw) return { peers, niche, stats: ddStats([]), score: ddScore(product || {}, ddStats([]), niche) };
  try {
    const { data } = await _supabase.from('listings_deduped')
      .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date')
      .gt('total_sold', 0)
      .ilike('keyword', `%${kw.slice(0, 40)}%`)
      .order('total_sold', { ascending: false })
      .limit(60);
    peers = data || [];
  } catch (_) {}
  try {
    if (!niche) {
      const { data } = await _supabase.from('mv_niche_breakout')
        .select('keyword,new_items,breakouts,breakout_rate,median_new_sold,median_winner_price,median_winner_reviews')
        .eq('keyword', kw).maybeSingle();
      niche = data;
    }
  } catch (_) {}
  const stats = ddStats(peers);
  return { peers, niche, stats, score: ddScore(product, stats, niche) };
}

function compareCellBetter(kind, va, vb) {
  const a = Number(va) || 0;
  const b = Number(vb) || 0;
  if (a === b) return '';
  if (kind === 'lower') return a < b ? 'cmp-win' : '';
  return a > b ? 'cmp-win' : '';
}

function productCompareSideHtml(p, meta, label) {
  const omset = estOmsetBulan(p);
  const score = meta?.score;
  return `
    <div class="cmp2-side">
      <div class="cmp2-label">${esc(label)}</div>
      ${p.image_url ? `<img class="cmp2-img" src="${esc(p.image_url)}" alt="">` : '<div class="cmp2-img ph"></div>'}
      <h3 class="cmp2-name">${esc(p.product_name || p.keyword || 'Produk')}</h3>
      <p class="cmp2-store dd-sub">${esc(p.store_name || '—')}</p>
      ${score ? `<div class="cmp2-score"><span class="badge ${score.cls}">${score.label}</span><strong>${score.score}</strong><span>/100</span></div>` : ''}
      <button type="button" class="btn-ghost cmp2-open" data-cmp-open="${esc(prodKey(p))}" style="margin:10px 0 0;width:100%">Lihat Deep Dive</button>
    </div>`;
}

function productCompareRowsHtml(a, b, metaA, metaB) {
  const rows = [
    { lbl: 'Harga', va: fmtRp(a.price), vb: fmtRp(b.price), ca: compareCellBetter('lower', a.price, b.price), cb: compareCellBetter('lower', b.price, a.price) },
    { lbl: 'Terjual', va: fmtSold(a.total_sold), vb: fmtSold(b.total_sold), ca: compareCellBetter('higher', a.total_sold, b.total_sold), cb: compareCellBetter('higher', b.total_sold, a.total_sold) },
    { lbl: 'Est. omset / bulan', va: estOmsetBulan(a) ? fmtOmset(estOmsetBulan(a)) : '—', vb: estOmsetBulan(b) ? fmtOmset(estOmsetBulan(b)) : '—', ca: compareCellBetter('higher', estOmsetBulan(a), estOmsetBulan(b)), cb: compareCellBetter('higher', estOmsetBulan(b), estOmsetBulan(a)) },
    { lbl: 'Rating', va: a.rating != null ? String(a.rating) : '—', vb: b.rating != null ? String(b.rating) : '—', ca: compareCellBetter('higher', a.rating, b.rating), cb: compareCellBetter('higher', b.rating, a.rating) },
    { lbl: 'Ulasan', va: fmtSold(a.reviews || 0), vb: fmtSold(b.reviews || 0), ca: compareCellBetter('higher', a.reviews, b.reviews), cb: compareCellBetter('higher', b.reviews, a.reviews) },
    { lbl: 'Lokasi', va: a.location || '—', vb: b.location || '—' },
    { lbl: 'Keyword', va: a.keyword || '—', vb: b.keyword || '—' },
    { lbl: 'Kategori', va: a.category || '—', vb: b.category || '—' },
    { lbl: 'Skor peluang', va: metaA?.score ? String(metaA.score.score) : '—', vb: metaB?.score ? String(metaB.score.score) : '—', ca: compareCellBetter('higher', metaA?.score?.score, metaB?.score?.score), cb: compareCellBetter('higher', metaB?.score?.score, metaA?.score?.score) },
    { lbl: 'Kompetisi niche', va: metaA?.stats?.komp || '—', vb: metaB?.stats?.komp || '—' },
    { lbl: 'Peer di keyword', va: metaA?.stats?.n != null ? String(metaA.stats.n) : '—', vb: metaB?.stats?.n != null ? String(metaB.stats.n) : '—' },
  ];
  return `<div class="cmp2-table" role="table">
    ${rows.map(r => `
      <div class="cmp2-row" role="row">
        <div class="cmp2-cell cmp2-metric" role="cell">${esc(r.lbl)}</div>
        <div class="cmp2-cell ${r.ca || ''}" role="cell">${esc(r.va)}</div>
        <div class="cmp2-cell ${r.cb || ''}" role="cell">${esc(r.vb)}</div>
      </div>`).join('')}
  </div>`;
}

async function openProductCompare(a, b) {
  if (!currentUser) {
    state.pendingCompare = { a, b };
    saveLocalState();
    openAuthModal('signup', 'gpt_gate_compare');
    return;
  }
  if (state.pendingCompare) { state.pendingCompare = null; saveLocalState(); }
  state.comparePick = null;
  updateDirCompareBanner();
  state.deepdiveProduct = a;
  setView('deepdive');
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = `<p class="dd-sub">Menyiapkan perbandingan…</p>`;

  const [metaA, metaB] = await Promise.all([fetchPeersForCompare(a), fetchPeersForCompare(b)]);

  let chat = activeChat();
  if (chat) {
    chat.context = { ...(chat.context || {}), product: a, keyword: a.keyword || chat.context?.keyword, compareWith: { item_id: b.item_id, shop_id: b.shop_id } };
    chat.title = `Bandingkan: ${(a.product_name || a.keyword || 'A').slice(0, 28)} vs ${(b.product_name || b.keyword || 'B').slice(0, 28)}`;
    saveLocalState();
    renderChatList();
  }

  void logUserEvent('gpt_product_compare', {
    ui: 'gpt',
    a_item: a.item_id, b_item: b.item_id,
    a_kw: a.keyword || '', b_kw: b.keyword || '',
  });
  clarityEvt('gpt_product_compare', {});

  const scoreA = metaA.score?.score || 0;
  const scoreB = metaB.score?.score || 0;
  let verdict = '';
  if (scoreA || scoreB) {
    if (scoreA === scoreB) verdict = 'Skor peluang keduanya mirip — lihat harga, terjual, dan kompetisi niche di tabel.';
    else if (scoreA > scoreB) verdict = `Dari sinyal data (harga peer, kompetisi, velocity), <strong>${esc((a.product_name || 'Produk kiri').slice(0, 40))}</strong> unggul tipis di skor peluang.`;
    else verdict = `Dari sinyal data (harga peer, kompetisi, velocity), <strong>${esc((b.product_name || 'Produk kanan').slice(0, 40))}</strong> unggul tipis di skor peluang.`;
  }

  root.innerHTML = `
    <div class="dd-head" style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <button type="button" class="btn-ghost" id="cmp2-back" style="margin:0">Kembali</button>
      <button type="button" class="btn-ghost" id="cmp2-again" style="margin:0">Bandingkan produk lain</button>
    </div>
    <h2 class="dd-title" style="margin-bottom:4px">Perbandingan produk</h2>
    <p class="dd-sub" style="margin-bottom:16px">Angka dari data Shopee via LarisID — bukan tebakan AI.</p>
    <div class="cmp2-heads">
      ${productCompareSideHtml(a, metaA, 'Produk saat ini')}
      ${productCompareSideHtml(b, metaB, 'Dipilih')}
    </div>
    ${productCompareRowsHtml(a, b, metaA, metaB)}
    ${verdict ? `<p class="cmp2-verdict">${verdict}</p>` : ''}
    <p class="ddr-caption" style="margin-top:14px">Skor peluang memakai peer keyword masing-masing produk (kompetisi top 3, volume pasar, velocity). Klik Deep Dive untuk analisis lengkap satu produk.</p>
  `;

  $('cmp2-back')?.addEventListener('click', () => {
    void openDeepDive(a);
  });
  $('cmp2-again')?.addEventListener('click', () => void startComparePick(a));
  root.querySelectorAll('[data-cmp-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-cmp-open');
      const p = prodKey(a) === key ? a : b;
      void openDeepDive(p);
    });
  });
  setComposerChips(ddComposerChips(a), 'compare');
}

async function openMoreProductsDirectory() {
  state.comparePick = null;
  updateDirCompareBanner();
  syncDirectoryFromOnboarding();
  state.dirPage = 1;
  void logUserEvent('dir_open', { ui: 'gpt', via: 'more_products' });
  clarityEvt('dir_open', { via: 'more_products' });
  await openDirectory();
}

// Sync the category bar to state: collapse it once a category is chosen (so the
// product grid shows without scrolling past 20 chips), highlight the active
// chip, and render that category's sub-groups.
function applyDirCatUi() {
  const catBar = $('dir-cat-bar');
  const cats = $('dir-cats');
  if (catBar) catBar.classList.toggle('collapsed', !!state.dirCat);
  if (cats) {
    cats.querySelectorAll('[data-dcat]').forEach(c => {
      if (c.classList.contains('chip-back')) return;
      const v = c.getAttribute('data-dcat') || '';
      c.classList.toggle('selected', (state.dirCat || '') === v);
    });
  }
  void renderSubcats(state.dirCat);
}

// Build the sub-group chip row for the selected category (hidden when the
// category has no sub-groups). Selecting one narrows the grid by keyword.
async function renderSubcats(cat) {
  const wrap = $('dir-subcats');
  if (!wrap) return;
  if (!cat) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  // Sub-groups come from keyword_subgroup, which only ever contains groups that
  // have products behind them — so a chip can no longer outlive its products.
  const groups = await loadSubgroups(cat);
  if (!groups.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
  wrap.hidden = false;
  const sel = state.dirSub || null;
  wrap.innerHTML =
    `<button type="button" class="chip${!sel ? ' selected' : ''}" data-dsub="">Semua ${esc(cat)}</button>` +
    groups.map(g => `<button type="button" class="chip${g === sel ? ' selected' : ''}" data-dsub="${esc(g)}">${esc(g)}</button>`).join('');
  wrap.querySelectorAll('[data-dsub]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dirSub = btn.getAttribute('data-dsub') || null;
      state.dirPage = 1;
      wrap.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
      void logUserEvent('dir_filter', { ui: 'gpt', kind: 'subgroup', value: state.dirSub || '' });
      void renderDirectory();
    });
  });
}

// Rebuild the Kota options from the active Provinsi (all cities when none).
function fillDirCityOptions() {
  const citySel = $('dir-city');
  if (!citySel) return;
  const cities = state.dirProv ? PROVINCE_CITIES[state.dirProv] || [] : NU_ONB_LOCATIONS;
  citySel.innerHTML = `<option value="">Semua kota</option>` +
    cities.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  citySel.value = state.dirCity || '';
}

async function openDirectory() {
  setView('directory');
  _dirApplyDefaultsOnce();
  updateDirCompareBanner();

  const cats = $('dir-cats');
  if (cats && !cats.dataset.ready) {
    cats.dataset.ready = '1';
    const canon = await loadCanonicalCats();
    cats.innerHTML =
      `<button type="button" class="chip chip-back" data-dcat="" aria-label="Kembali ke semua kategori">‹ Semua</button>` +
      `<button type="button" class="chip" data-dcat="">Semua</button>` +
      (canon.length ? canon : NU_ONB_CATS).map(c =>
        `<button type="button" class="chip chip-cat" data-dcat="${esc(c)}">${catChipIcon(c)}${esc(c)}</button>`
      ).join('');
    cats.querySelectorAll('[data-dcat]').forEach(btn => {
      btn.addEventListener('click', () => {
        // Category filter is free for anonymous (page 2+ / deep-dive stay gated).
        // Picking a category collapses the menu to reveal results right away.
        const cat = btn.getAttribute('data-dcat');
        state.dirCat = cat || null;
        state.dirSub = null;
        state.dirPage = 1;
        applyDirCatUi();
        void logUserEvent('dir_filter', { ui: 'gpt', kind: 'category', value: state.dirCat || '' });
        void renderDirectory();
      });
    });
  }
  applyDirCatUi();

  const provSel = $('dir-prov');
  if (provSel && !provSel.dataset.ready) {
    provSel.dataset.ready = '1';
    provSel.innerHTML = `<option value="">Semua provinsi</option>` +
      Object.keys(PROVINCE_CITIES).map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    provSel.addEventListener('change', () => {
      state.dirProv = provSel.value || '';
      const allowed = state.dirProv ? PROVINCE_CITIES[state.dirProv] || [] : NU_ONB_LOCATIONS;
      if (state.dirCity && !allowed.includes(state.dirCity)) state.dirCity = '';
      fillDirCityOptions();
      state.dirPage = 1;
      void logUserEvent('dir_filter', { ui: 'gpt', kind: 'province', value: state.dirProv });
      void renderDirectory();
    });
  }
  if (provSel) provSel.value = state.dirProv || '';

  const citySel = $('dir-city');
  if (citySel && !citySel.dataset.ready) {
    citySel.dataset.ready = '1';
    fillDirCityOptions();
    citySel.addEventListener('change', () => {
      state.dirCity = citySel.value || '';
      state.dirPage = 1;
      void logUserEvent('dir_filter', { ui: 'gpt', kind: 'city', value: state.dirCity });
      void renderDirectory();
    });
  } else {
    fillDirCityOptions();
  }
  if (citySel) citySel.value = state.dirCity || '';

  const sortSel = $('dir-sort');
  if (sortSel && !sortSel.dataset.ready) {
    sortSel.dataset.ready = '1';
    sortSel.addEventListener('change', () => {
      state.dirSort = sortSel.value || 'terlaris';
      state.dirPage = 1;
      void logUserEvent('dir_filter', { ui: 'gpt', kind: 'sort', value: state.dirSort });
      void renderDirectory();
    });
  }
  if (sortSel) sortSel.value = state.dirSort || 'terlaris';

  const note = $('dir-note');
  if (note) {
    const tailored = !!(state.onboarding?.city || state.onboarding?.categories?.length);
    note.hidden = !tailored || !!state.comparePick;
  }

  await renderDirectory();
}

async function renderDirectory() {
  // Compare-pick needs a specific LISTING (not a type) — keep the old grid there.
  if (state.comparePick) return renderDirectoryListings();
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  if (!grid) return;
  grid.innerHTML = '<p class="dd-sub">Memuat…</p>';

  const cat = state.dirCat || null;
  const city = state.dirCity || '';
  // Subgroup is filtered server-side against keyword_subgroup now, not by a
  // client-side keyword substring test.
  let types = await fetchProductTypes(city, cat, 1000, state.dirSub || null);
  // mv missing/empty (e.g. refresh failed): lift the listing pool back up to
  // markets rather than degrading to a listing grid. The directory is a
  // top-level surface, and single listings only belong under a market.
  if (!types.length && !state.dirSub) {
    const pool = city
      ? await fetchListingsCityCat(expandCityLocations(city), cat ? [cat] : [], 200)
      : mergePool([], await fetchNaikDaunGlobal(200));
    types = await typesForListings(pool, city, 60);
  }
  types = sortTypeRows(types, state.dirSort || 'terlaris');
  state.dirTypes = types;
  registerTypes(types);

  if (state.dirPage > 1 && !currentUser) {
    openAuthModal('signup', 'gpt_gate_directory');
    state.dirPage = 1;
  }
  const start = (state.dirPage - 1) * PAGE_SIZE;
  const slice = types.slice(start, start + PAGE_SIZE);
  grid.innerHTML = slice.map((t, i) => typeCardHtml(t, start + i, i)).join('')
    || '<p class="dd-sub">Tidak ada tipe produk untuk filter ini.</p>';
  bindTypeCards(grid);
  scrollPanelToTop();
  renderDirPager(pager, types.length);
}

// Shared pager for both directory modes (types + legacy listings).
function renderDirPager(pager, total) {
  if (!pager) return;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  pager.innerHTML = `
    <button type="button" class="btn-ghost" id="dir-prev" ${state.dirPage <= 1 ? 'disabled' : ''}>Sebelumnya</button>
    <span class="dd-sub">Halaman ${state.dirPage} / ${totalPages}</span>
    <button type="button" class="btn-ghost" id="dir-next" ${state.dirPage >= totalPages ? 'disabled' : ''}>Berikutnya</button>
  `;
  $('dir-prev')?.addEventListener('click', () => { state.dirPage--; void renderDirectory(); });
  $('dir-next')?.addEventListener('click', () => {
    if (!currentUser && state.dirPage >= 1) {
      openAuthModal('signup', 'gpt_gate_directory');
      return;
    }
    state.dirPage++;
    void renderDirectory();
  });
}

async function renderDirectoryListings() {
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  if (!grid) return;
  grid.innerHTML = '<p class="dd-sub">Memuat…</p>';

  const cat = state.dirCat || null;
  const city = state.dirCity || '';
  const poolLimit = state.dirSub ? 400 : 200;  // widen pool so narrow sub-groups still fill a page
  let rows = [];
  if (city) {
    const locs = expandCityLocations(city);
    rows = await fetchListingsCityCat(locs, cat ? [cat] : [], poolLimit);
  } else {
    rows = mergePool([], await fetchNaikDaunGlobal(poolLimit));
    if (cat) {
      const c = cat.toLowerCase();
      rows = rows.filter(r => catMatches(r.category, [cat]) || (r.category || '').toLowerCase().includes(c.slice(0, 5)));
    }
  }
  if (state.dirSub) {
    // Legacy fallback grid: dirSub is a subgroup NAME now, so resolve the
    // keywords in it rather than substring-testing the old match[] array.
    const kws = await subgroupKeywords(state.dirCat, state.dirSub);
    if (kws.size) rows = rows.filter(r => kws.has(String(r.keyword || '').trim()));
  }
  rows = sortDirRows(rows, state.dirSort || 'terlaris');
  state.dirRows = rows;
  rememberProducts(rows);

  if (state.dirPage > 1 && !currentUser) {
    openAuthModal('signup', 'gpt_gate_directory');
    state.dirPage = 1;
  }
  const start = (state.dirPage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  grid.innerHTML = productCardsHtml(slice) || '<p class="dd-sub">Tidak ada produk untuk filter ini.</p>';
  bindProductCards(grid);
  scrollPanelToTop();
  renderDirPager(pager, rows.length);
}

// ── Opt-out ──────────────────────────────────────────────────────────────
function optOutToClassic() {
  try {
    localStorage.setItem('_lid_ab_v1', JSON.stringify({ v: 'X', opt_out: 1, ts: Date.now() }));
  } catch (_) {}
  clarityEvt('gpt_optout', {});
  void logUserEvent('gpt_optout', { ui: 'gpt' });
  // Give the event inserts a beat before navigation cancels them.
  setTimeout(() => { location.href = '/'; }, 250);
}

// ── Admin (signups / locations / sample view) ────────────────────────────
function cloneOnboarding(o) {
  return {
    step: o.step,
    city: o.city,
    categories: (o.categories || []).slice(),
    experience: o.experience,
    pairingMode: o.pairingMode,
    pairingCategory: o.pairingCategory,
    notes: o.notes,
    freeText: o.freeText || '',
  };
}

function renderAdminSampleBanner() {
  const banner = $('admin-sample-banner');
  const exitBtn = $('admin-sample-exit');
  const strip = $('sample-strip');
  const stripText = $('sample-strip-text');
  if (exitBtn) exitBtn.style.display = _admSample ? '' : 'none';
  if (strip) {
    if (_admSample) {
      strip.hidden = false;
      strip.classList.add('open');
      if (stripText) {
        stripText.textContent = _admSample.mode === 'new'
          ? 'Sample: user baru (onboarding tidak disimpan)'
          : `Sample: ${_admSample.label || 'user'}`;
      }
    } else {
      strip.hidden = true;
      strip.classList.remove('open');
    }
  }
  if (!banner) return;
  if (!_admSample) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = _admSample.mode === 'new'
    ? 'Mode sample: user baru (onboarding tidak disimpan ke akunmu).'
    : `Mode sample: ${_admSample.label || 'user'} — rekomendasi mengikuti lokasi/kategori mereka.`;
}

function goHome(e) {
  if (e) e.preventDefault();
  closeSidebar();
  renderHome();
}

function fmtAdminDate(iso) {
  if (!iso) return '—';
  try { return String(iso).slice(0, 10); } catch (_) { return '—'; }
}

function renderAdminLocations(users) {
  const el = $('admin-locations');
  if (!el) return;
  const counts = {};
  let withLoc = 0;
  (users || []).forEach(u => {
    const loc = (u.region || u.city || '').trim();
    if (!loc) return;
    withLoc++;
    counts[loc] = (counts[loc] || 0) + 1;
  });
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    el.textContent = 'Belum ada data lokasi onboarding.';
    return;
  }
  const max = ranked[0][1] || 1;
  el.innerHTML = `<p class="dd-sub" style="margin-bottom:10px">${withLoc} dari ${users.length} punya lokasi</p>` +
    ranked.slice(0, 12).map(([city, n]) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="flex:0 0 110px;font-size:.78rem;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(city)}</span>
        <div style="flex:1;height:6px;background:#eee;border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.round(n / max * 100)}%;background:var(--ink)"></div>
        </div>
        <span style="font-size:.75rem;font-weight:700;min-width:24px;text-align:right">${n}</span>
      </div>`).join('');
}

function renderAdminStats(users) {
  const el = $('admin-stats');
  if (!el) return;
  const total = users.length;
  const withOnb = users.filter(u => u.onboarding_completed || (u.region || u.city)).length;
  const last7 = users.filter(u => {
    if (!u.created_at) return false;
    return Date.now() - Date.parse(u.created_at) < 7 * 864e5;
  }).length;
  el.innerHTML = `
    <div class="dd-metric"><div class="val">${total}</div><div class="lbl">Total signup</div></div>
    <div class="dd-metric"><div class="val">${last7}</div><div class="lbl">7 hari terakhir</div></div>
    <div class="dd-metric"><div class="val">${withOnb}</div><div class="lbl">Punya onboarding</div></div>`;
}

function renderAdminUsers(users) {
  const body = $('admin-users-body');
  if (!body) return;
  if (!users.length) {
    body.innerHTML = '<tr><td colspan="6" class="dd-sub">Belum ada user.</td></tr>';
    return;
  }
  body.innerHTML = users.slice(0, 80).map((u, i) => {
    const loc = u.region || u.city || '—';
    const cats = (u.categories || []).slice(0, 2).join(', ') || '—';
    const name = u.display_name || u.email || 'User';
    return `<tr>
      <td><strong>${esc(name)}</strong></td>
      <td class="dd-sub">${esc(u.email || '')}</td>
      <td>${esc(loc)}</td>
      <td class="dd-sub">${esc(cats)}</td>
      <td class="dd-sub">${fmtAdminDate(u.created_at)}</td>
      <td><button type="button" class="admin-sample-btn" data-sample-idx="${i}">Sample view</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('[data-sample-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-sample-idx'));
      const row = users[idx];
      if (row) adminSampleAsUser(row);
    });
  });
}

async function loadAdminDirectory() {
  if (!isPlatformAdmin() || !_supabase) {
    const body = $('admin-users-body');
    if (body) body.innerHTML = '<tr><td colspan="6" class="dd-sub">Login sebagai admin dulu.</td></tr>';
    return;
  }
  const body = $('admin-users-body');
  if (body) body.innerHTML = '<tr><td colspan="6" class="dd-sub">Memuat…</td></tr>';
  try {
    const { data, error } = await _supabase.rpc('admin_user_directory');
    if (error) throw error;
    _adminUsers = data || [];
    renderAdminStats(_adminUsers);
    renderAdminLocations(_adminUsers);
    renderAdminUsers(_adminUsers);
  } catch (e) {
    if (body) body.innerHTML = `<tr><td colspan="6" class="dd-sub">${esc(e.message || 'Gagal memuat.')}</td></tr>`;
  }
}

function openAdminView() {
  if (!isPlatformAdmin()) {
    showToast('Admin only.');
    return;
  }
  setView('admin');
  void loadAdminDirectory();
}

function adminSampleAsUser(row) {
  if (!isPlatformAdmin() || !row) return;
  if (!_onboardingBackup) _onboardingBackup = cloneOnboarding(state.onboarding);
  const region = (row.region || row.city || '').trim();
  // Map free-text region to onboarding city chip when possible
  const city = NU_ONB_LOCATIONS.find(c => region.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(region.toLowerCase()))
    || region
    || '';
  const cats = (row.categories || []).filter(c => NU_ONB_CATS.includes(c));
  state.onboarding = {
    step: 'done',
    city,
    categories: cats.length ? cats : (row.categories || []).slice(0, 3),
    experience: row.seller_status || 'first_time',
    pairingMode: '',
    pairingCategory: '',
    notes: '',
    freeText: '',
  };
  _admSample = {
    mode: 'user',
    label: row.display_name || row.email || 'user',
  };
  renderAdminSampleBanner();
  saveLocalState();
  showToast(`Sample: ${ _admSample.label }${city ? ` · ${city}` : ''}`);
  setView('chat');
  void startRecommendationChat(true);
}

function adminSampleNewUser() {
  if (!isPlatformAdmin()) return;
  if (!_onboardingBackup) _onboardingBackup = cloneOnboarding(state.onboarding);
  state.onboarding = {
    step: 'city',
    city: '',
    categories: [],
    experience: '',
    pairingMode: '',
    pairingCategory: '',
    notes: '',
    freeText: '',
  };
  state.activeChatId = null;
  _admSample = { mode: 'new', label: 'user baru' };
  renderAdminSampleBanner();
  saveLocalState();
  openPrefsDrawer('admin_sample');
  showToast('Sample sebagai user baru — onboarding tidak ditulis ke akunmu.');
}

function adminExitSample() {
  if (_onboardingBackup) {
    state.onboarding = cloneOnboarding(_onboardingBackup);
    _onboardingBackup = null;
  }
  _admSample = null;
  renderAdminSampleBanner();
  saveLocalState();
  showToast('Keluar dari mode sample.');
  if (isPlatformAdmin()) openAdminView();
  else goHome();
}

function startPlaceholderRotation() {
  const inputs = [$('composer-input'), $('hero-input')].filter(Boolean);
  if (!inputs.length) return;
  let i = 0;
  setInterval(() => {
    i = (i + 1) % COMPOSER_EXAMPLES.length;
    inputs.forEach((input) => {
      if (document.activeElement === input || input.value) return;
      input.placeholder = COMPOSER_EXAMPLES[i];
    });
  }, 5000);
}

// ── Wire DOM ─────────────────────────────────────────────────────────────
function wireUi() {
  startPlaceholderRotation();

  // Dwell tracking lifecycle: pause when the tab hides, resume in deep dive.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) dwellStop();
    else if (state.view === 'deepdive' && state.deepdiveProduct) dwellStart(state.deepdiveProduct.category);
  });
  window.addEventListener('pagehide', () => dwellStop());

  // Post-login profile nudge → prefs drawer (or dismiss until next sign-in).
  $('profile-nudge-go')?.addEventListener('click', () => {
    closeProfileNudge();
    void logUserEvent('gpt_profile_nudge', { ui: 'gpt', action: 'accept' });
    openPrefsDrawer('post_signin');
  });
  $('profile-nudge-later')?.addEventListener('click', () => {
    closeProfileNudge();
    void logUserEvent('gpt_profile_nudge', { ui: 'gpt', action: 'later' });
  });
  $('profile-nudge')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProfileNudge();
  });

  // Pinned product bar tools (Analisa / Kalkulator / Kompetitor / Serupa).
  $('product-pin-tools')?.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-pin-tool]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const tool = btn.getAttribute('data-pin-tool');
    const p = state.view === 'deepdive'
      ? (state.deepdiveProduct || _dd?.product)
      : (activeChat()?.context?.product || null);
    const peers = _dd?.peers || activeChat()?.context?.peers || [];
    runDdrTool(tool, p, peers, 'product_pin');
  });
  $('img-lightbox')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('img-lightbox')?.hidden) { e.preventDefault(); closeLightbox(); }
  });
  document.addEventListener('click', (e) => {
    const img = e.target?.closest?.('#product-pin-img, .ddr-header > img, [data-ddr-main], .dd-chat-card-top img, .ddr-gallery-main img, .ddr-slide img');
    if (!img || !img.getAttribute('src')) return;
    if (img.closest('.ddr-gallery-thumb')) return;
    const scope = img.closest('.product-pin, .ddr-header, .dd-chat-card');
    const cap = scope?.querySelector('.product-pin-name, h1, .dd-chat-card-name')?.textContent || '';
    e.preventDefault();
    e.stopPropagation();
    openLightbox(img.getAttribute('src'), cap);
  }, true);
  $('btn-menu')?.addEventListener('click', openSidebar);
  $('sidebar-backdrop')?.addEventListener('click', closeSidebar);
  $('btn-home')?.addEventListener('click', goHome);
  $('btn-home-mobile')?.addEventListener('click', goHome);
  $('btn-new-chat')?.addEventListener('click', () => void newChatFlow());
  $('btn-search-chats')?.addEventListener('click', () => openChatSearch());
  $('chat-search-input')?.addEventListener('input', () => renderChatList());
  $('chat-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeChatSearch(); }
  });
  $('chat-search-clear')?.addEventListener('click', () => closeChatSearch());
  $('btn-produk')?.addEventListener('click', () => {
    state.comparePick = null;
    updateDirCompareBanner();
    void openDirectory();
  });
  $('btn-tracker')?.addEventListener('click', () => { openTrackerView(); });
  // Intentional entry into the supplier probe (the Deep Dive pill is the
  // contextual one). Clears any product filter so this is the "browse" path.
  $('btn-supplier')?.addEventListener('click', () => {
    if (!supplierProbeVisible()) return;
    _supFilterKeyword = null;
    _supFilterCategory = null;
    _supSource = 'tab';
    _supShowAll = false;
    closeSidebar();
    openSidePanel('supplier', { via: 'sidebar' });
  });
  $('btn-harga')?.addEventListener('click', () => setView('harga'));
  $('btn-faq')?.addEventListener('click', () => { setView('faq'); void logUserEvent('view_open', { ui: 'gpt', view: 'faq' }); });
  $('btn-tentang')?.addEventListener('click', () => { setView('tentang'); void logUserEvent('view_open', { ui: 'gpt', view: 'tentang' }); });
  // The Beta badge was decoration; it now opens the changelog on both the
  // desktop sidebar and the mobile topbar.
  document.querySelectorAll('.brand-beta').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openChangelog(); });
  });
  $('changelog-close')?.addEventListener('click', () => closeChangelog());
  $('changelog-modal')?.addEventListener('click', e => { if (e.target.id === 'changelog-modal') closeChangelog(); });
  $('btn-admin')?.addEventListener('click', () => openAdminView());
  $('admin-refresh')?.addEventListener('click', () => void loadAdminDirectory());
  $('admin-sample-new')?.addEventListener('click', () => adminSampleNewUser());
  $('admin-sample-exit')?.addEventListener('click', () => adminExitSample());
  $('sample-strip-exit')?.addEventListener('click', () => adminExitSample());
  $('btn-login')?.addEventListener('click', () => openAuthModal('login', 'gpt_header_login'));
  $('btn-signup')?.addEventListener('click', () => openAuthModal('signup', 'gpt_header_signup'));
  $('btn-user')?.addEventListener('click', () => {
    if (currentUser && confirm('Keluar dari akun?')) void signOut();
  });
  $('btn-optout')?.addEventListener('click', optOutToClassic);
  $('auth-close')?.addEventListener('click', closeAuthModal);
  $('auth-overlay')?.addEventListener('click', e => { if (e.target === $('auth-overlay')) closeAuthModal(); });
  $('auth-submit-btn')?.addEventListener('click', () => void submitAuth());
  $('auth-google-btn')?.addEventListener('click', () => void signInWithProvider('google'));
  $('auth-toggle-link')?.addEventListener('click', () => {
    _authMode = _authMode === 'signup' ? 'login' : 'signup';
    renderAuthModal();
  });

  const form = $('composer-form');
  const input = $('composer-input');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    // While a reply is streaming the same button stops it.
    if (_streamAbort) { abortAssistantStream(); return; }
    const t = input.value;
    input.value = '';
    void handleComposerSubmit(t);
  });

  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form?.requestSubmit();
    }
  });

  const heroForm = $('hero-form');
  const heroInput = $('hero-input');
  heroForm?.addEventListener('submit', e => {
    e.preventDefault();
    const t = (heroInput?.value || '').trim();
    if (!t) return;
    heroInput.value = '';
    submitFromHome(t);
  });
  heroInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      heroForm?.requestSubmit();
    }
  });

  $('btn-set-lokasi')?.addEventListener('click', () => {
    closeSidebar();
    openPrefsDrawer('sidebar');
  });

  wirePrefsDrawer();
  wireCalcPanel();
  wireUsagePill();

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
      e.preventDefault();
      renderHome();
      $('hero-input')?.focus();
    }
  });
}

async function boot() {
  loadLocalState();
  recomputeLearnedCategories();
  // Sticky AB: direct /gpt/ visits (not via / split) are marked via=direct_gpt
  // so they can be excluded from the random 50/50 cohort in AB_TEST.sql.
  try {
    const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
    if (!ab || (ab.v !== 'A' && ab.v !== 'B' && ab.v !== 'X')) {
      localStorage.setItem('_lid_ab_v1', JSON.stringify({ v: 'B', ts: Date.now(), via: 'direct_gpt' }));
      _clarity('event', 'ab_assigned');
      _clarity('set', 'ab_variant', 'B');
      _clarity('set', 'ab_via', 'direct_gpt');
    }
  } catch (_) {}

  wireUi();
  document.getElementById('gpt-limit-close')?.addEventListener('click', gptLimitClose);
  document.getElementById('gpt-limit-feedback')?.addEventListener('click', gptOpenFeedbackForBonus);
  document.getElementById('gpt-limit-ext')?.addEventListener('click', gptLimitClose);
  document.getElementById('gpt-fb-submit')?.addEventListener('click', () => { void gptSubmitFeedback(); });
  document.getElementById('gpt-fb-close')?.addEventListener('click', gptFeedbackClose);
  _lidInitScrollDepth();
  updateAccountUI();
  renderGptUsage();

  if (typeof ensureSupabase === 'function') await ensureSupabase();
  await initSupabase();
  try { await consumeOAuthHash(); } catch (_) {}
  void refreshGptUsage();

  // Landing is the default surface; onboarding never auto-starts.
  if (!_offerActive) {
    if (state.activeChatId && activeChat()) {
      setView('chat');
      renderChatThread();
    } else {
      renderHome();
    }
  }
  renderChatList();
  renderSidebarLocCard();
}


// ════════════════════════════════════════════════════════════
//  CARI SUPPLIER — validation probe, arm B (side-panel mode)
//  Same seed JSON and same event names as arm A (js/laris-app.js) so the two
//  arms are directly comparable. Gate: SUPPLIER_PROBE_PUBLIC near isPlatformAdmin.
//  NOTE: this file is one big IIFE — nothing here is global, so card actions use
//  delegated data-* handlers (Site B convention), never inline onclick.
// ════════════════════════════════════════════════════════════

const SUPPLIER_DATA_URL = '/js/data/suppliers-curated.json';
const SUPPLIER_DEEPDIVE_LIMIT = 5;

let _supData        = null;
let _supLoadPromise = null;
let _supLoadError   = false;
let _supShowAll     = false;
let _supListeners   = false;
// Assigned by runDdrTool('supplier') and the btn-supplier handler above; this
// file is 'use strict', so they must be declared or those writes throw.
let _supFilterKeyword  = null;
let _supFilterCategory = null;
let _supSource      = 'tab';

function _supNum(n) {
  return Number.isFinite(n) ? Number(n).toLocaleString('id-ID') : null;
}

/** Mirrors arm A: activity_events (AB-stamped by logUserEvent) + Clarity. */
function _supLog(eventType, props) {
  const meta = { ui: 'gpt', ...(props || {}) };
  try { void logUserEvent(eventType, meta); } catch (_) {}
  try { clarityEvt(eventType); } catch (_) {}
}

function supLoadData() {
  if (_supData) return Promise.resolve(_supData);
  if (_supLoadPromise) return _supLoadPromise;
  _supLoadPromise = fetch(SUPPLIER_DATA_URL, { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      if (!j || !Array.isArray(j.suppliers)) throw new Error('bad shape');
      _supData = j; _supLoadError = false; return j;
    })
    .catch(err => { _supLoadError = true; _supLoadPromise = null; throw err; });
  return _supLoadPromise;
}

function _supNorm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

/** True when this product's keyword or category is in the curated pilot. */
function supplierRelevantFor(keyword, category) {
  const kw  = _supNorm(keyword);
  const cat = _supNorm(category);
  const pilotCats = (_supData?.pilot?.categories || ['Fashion']).map(_supNorm);
  if (kw && _supData) {
    const hit = (_supData.suppliers || []).some(s =>
      s.published && (s.keywords || []).some(k => _supNorm(k) === kw));
    if (hit) return true;
  }
  if (cat && pilotCats.includes(cat)) return true;
  return false;
}

/**
 * Match order: exact keyword -> pilot category -> browse-all.
 * Off-pilot products return ZERO rows — never dump unrelated suppliers.
 */
function _supSelect() {
  const all = (_supData?.suppliers || []).filter(s => s.published);
  const kw  = _supNorm(_supFilterKeyword);
  const cat = _supNorm(_supFilterCategory);
  const pilotCats = (_supData?.pilot?.categories || []).map(_supNorm);
  const catInPilot = !!(cat && pilotCats.includes(cat));

  if (kw) {
    const hit = all.filter(s => (s.keywords || []).some(k => _supNorm(k) === kw));
    if (hit.length) return { rows: hit, mode: 'keyword' };
    if (catInPilot) return { rows: all, mode: 'category' };
    if (cat || _supSource === 'deepdive') return { rows: [], mode: 'offpilot' };
  }
  if (cat) {
    if (catInPilot) return { rows: all, mode: 'category' };
    return { rows: [], mode: 'offpilot' };
  }
  return { rows: all, mode: 'all' };
}

function _supTierRank(t) { return ({ grosir: 0, pabrik: 0, konveksi: 0, import: 1 })[t] ?? 2; }

const SUP_LOGO_TINTS = ['#B5202A', '#8E191F', '#C9974B', '#1E6B3C', '#27355C'];

function _supInitials(name) {
  const words = String(name || '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return '?';
  // Numeric names ("1688 — harga pabrik") read better as digits than as "1H".
  if (/^\d+$/.test(words[0])) return words[0].slice(0, 2);
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

function _supTint(id) {
  const key = String(id || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 9973;
  return SUP_LOGO_TINTS[h % SUP_LOGO_TINTS.length];
}

/**
 * Shop logos are Shopee account portraits (`logo` in the seed). The bare CDN
 * file is ~40 KB; `_tn.webp` is the CDN thumbnail (~3 KB) for a 44px tile.
 */
function _supThumb(url) {
  const u = String(url || '');
  return /^https:\/\/cf\.shopee\.co\.id\/file\/[\w-]+$/.test(u) ? u + '_tn.webp' : u;
}

/**
 * Real shop logo when we have one; otherwise an initials tile. `onerror` drops
 * the img so a dead CDN link never leaves a broken frame.
 */
function _supLogoHtml(s) {
  const img = s.logo
    ? `<img class="sup-logo-img" src="${esc(_supThumb(s.logo))}" alt="" loading="lazy"
           decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<div class="sup-logo" style="background:${_supTint(s.id)}" aria-hidden="true">
      <span class="sup-logo-txt">${esc(_supInitials(s.name))}</span>${img}
    </div>`;
}

function _supCardHtml(s) {
  const badges = (s.badges || []).map(b => `<span class="sup-badge">${esc(b)}</span>`).join('');
  const bits = [];
  if (Number.isFinite(s.rating))  bits.push(`Rating ${esc(s.rating)}`);
  if (Number.isFinite(s.reviews)) bits.push(`${_supNum(s.reviews)} ulasan`);
  if (Number.isFinite(s.sold))    bits.push(`${_supNum(s.sold)} terjual`);
  if (s.city) bits.push(esc(s.city));
  const meta = bits.length ? `<div class="sup-meta">${bits.join(' &middot; ')}</div>` : '';
  const price = Number.isFinite(s.minPrice) ? `<div class="sup-price">Mulai Rp ${_supNum(s.minPrice)}</div>` : '';
  const sample = s.sampleUrl
    ? `<a class="sup-link-sec" href="${esc(s.sampleUrl)}" target="_blank" rel="noopener"
          data-sup-id="${esc(s.id)}" data-sup-target="sample">Lihat contoh produk</a>` : '';
  return `<div class="sup-card">
    <div class="sup-card-head">
      ${_supLogoHtml(s)}
      <div class="sup-card-headtxt">
        <div class="sup-name">${esc(s.name)}</div>
        <div class="sup-badges">${badges}</div>
      </div>
    </div>
    ${meta}${price}
    <div class="sup-card-actions">
      <a class="sup-btn" href="${esc(s.url)}" target="_blank" rel="noopener"
         data-sup-id="${esc(s.id)}" data-sup-target="shop">Buka toko</a>
      ${sample}
    </div>
  </div>`;
}

/** One delegated listener for the whole panel + survey modal. */
function _supWireDelegation() {
  if (_supListeners) return;
  _supListeners = true;
  document.addEventListener('click', (e) => {
    const link = e.target?.closest?.('[data-sup-id]');
    if (link) { supOpenLink(link.getAttribute('data-sup-id'), link.getAttribute('data-sup-target')); return; }
    const act = e.target?.closest?.('[data-sup-act]');
    if (!act) return;
    const a = act.getAttribute('data-sup-act');
    if (a === 'more')   { _supShowAll = true; void fillSupplierContent(); }
    else if (a === 'retry') { _supLoadError = false; _supLoadPromise = null; void fillSupplierContent(); }
    else if (a === 'close') supCloseSurvey();
    else supSurveyAnswer(a);   // 'ya' | 'belum' | 'tidak'
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) supMaybeShowSurvey(); });
  window.addEventListener('focus', supMaybeShowSurvey);
}

async function fillSupplierContent(opts = {}) {
  const body = $('side-body-supplier');
  if (!body) return;
  if (!supplierProbeVisible()) { body.innerHTML = ''; return; }
  _supWireDelegation();

  const product = opts.product || null;
  if (product) {
    _supFilterKeyword  = product.keyword || _supFilterKeyword;
    _supFilterCategory = product.category || product.category_canonical || _supFilterCategory;
  }

  if (!_supData && !_supLoadError) {
    body.innerHTML = '<p class="side-empty">Memuat supplier…</p>';
    try { await supLoadData(); } catch (_) { /* rendered as error below */ }
    if (_sideMode !== 'supplier') return;
  }

  if (_supLoadError) {
    setSideContext('');
    body.innerHTML = `<p class="side-empty">Gagal memuat daftar supplier.<br>
      <button type="button" class="sup-btn" style="margin-top:12px;" data-sup-act="retry">Coba lagi</button></p>`;
    return;
  }

  const { rows, mode } = _supSelect();
  const pilotLabel = _supData?.pilot?.label || 'kategori pilot';

  if (!rows.length) {
    setSideContext('');
    const off = mode === 'offpilot';
    body.innerHTML = off
      ? `<p class="side-empty">Belum ada supplier untuk produk ini.<br><br>
           Cari Supplier baru mengurasi <strong>${esc(pilotLabel)}</strong>.
           Kami tidak menampilkan supplier kategori lain supaya rekomendasinya tidak menyesatkan.</p>`
      : `<p class="side-empty">Belum ada supplier untuk filter ini.</p>`;
    return;
  }

  setSideContext(mode === 'keyword' ? (_supFilterKeyword || '') : pilotLabel);
  const lead = mode === 'keyword'
    ? `Supplier untuk “${esc(_supFilterKeyword)}”.`
    : `Toko grosir &amp; konveksi untuk ${esc(pilotLabel)}.`;

  const sorted = rows.slice().sort((a, b) => {
    const t = _supTierRank(a.tier) - _supTierRank(b.tier);
    return t || (b.sold || 0) - (a.sold || 0);
  });
  const capped = (_supSource === 'deepdive' && !_supShowAll)
    ? sorted.slice(0, SUPPLIER_DEEPDIVE_LIMIT) : sorted;

  let html = `<p class="side-komp-lead">${lead}</p>` + capped.map(_supCardHtml).join('');
  if (capped.length < sorted.length) {
    html += `<button type="button" class="sup-more" data-sup-act="more">Lihat semua ${sorted.length} supplier</button>`;
  }
  if (_supData?.sourceNote) html += `<div class="sup-source">${esc(_supData.sourceNote)}</div>`;
  body.innerHTML = html;

  _supLog('supplier_tab_open', {
    keyword: _supFilterKeyword || null,
    category: _supFilterCategory || null,
    source: _supSource,
  });
  supMaybeShowSurvey();
}

/** Sidebar entry visibility. Deep Dive pill gates itself in ddToolPillsHtml. */
function supplierSyncNavVisibility() {
  const on = supplierProbeVisible();
  const btn = $('btn-supplier');
  if (btn) btn.style.display = on ? '' : 'none';
  const tab = $('side-tab-supplier');
  if (tab) tab.hidden = !on;
  if (on) void supLoadData().catch(() => {});
}

function supOpenLink(id, which) {
  const s = (_supData?.suppliers || []).find(x => x.id === id);
  _supLog('supplier_link_click', {
    supplier_id: id, supplier_name: s?.name || null, tier: s?.tier || null,
    target: which || 'shop',
    keyword: _supFilterKeyword || null, category: _supFilterCategory || null,
    source: _supSource,
  });
  try {
    sessionStorage.setItem('_lid_sup_pending', JSON.stringify({
      id, name: s?.name || '', at: Date.now(),
      keyword: _supFilterKeyword || null, category: _supFilterCategory || null,
    }));
  } catch (_) {}
}

function _supSurveyDone() {
  try { return !!localStorage.getItem('larisid_sup_survey_v1'); } catch (_) { return false; }
}

function supMaybeShowSurvey() {
  if (_supSurveyDone()) return;
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem('_lid_sup_pending') || 'null'); } catch (_) {}
  if (!pending) return;
  if (Date.now() - (pending.at || 0) < 4000) return;
  const modal = $('sup-survey-modal');
  if (!modal || modal.classList.contains('open')) return;
  const nameEl = $('sup-survey-name');
  if (nameEl) nameEl.textContent = pending.name || 'Supplier';
  modal.classList.add('open');
}

function supSurveyAnswer(answer) {
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem('_lid_sup_pending') || 'null'); } catch (_) {}
  _supLog('supplier_survey_response', {
    answer, supplier_id: pending?.id || null,
    keyword: pending?.keyword || null, category: pending?.category || null,
  });
  try { localStorage.setItem('larisid_sup_survey_v1', String(Date.now())); } catch (_) {}
  supCloseSurvey();
}

function supCloseSurvey() {
  try { sessionStorage.removeItem('_lid_sup_pending'); } catch (_) {}
  $('sup-survey-modal')?.classList.remove('open');
}
boot();
})();
