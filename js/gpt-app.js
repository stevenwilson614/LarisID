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
const PAGE_SIZE = 30;
const COMPOSER_EXAMPLES = [
  'Cari produk kayu dari Semarang',
  '3 produk yang cocok buat aku',
  'Produk yang lagi naik daun?',
  'Produk modal 500rb yang laris',
];
let _admSample = null; // admin sample view: { mode: 'user'|'new', label }
// Admin browsing the whole app in someone else's role:
// { role: 'mahasiswa'|'mentor', cohortId, cohortName, stand_in }.
// In memory only, like _admSample — a reload lands back on the real admin view.
let _viewAs = null;
let _onboardingBackup = null;
let _adminUsers = [];
let _adminStats = null;
let _adminKpis = null;
let _adminUserPage = 1;
let _adminPageSize = 10;
let _adminMapRange = 'all';
let _adminMapZoom = 1;
let _adminMapPan = { x: 0, y: 0 };
let _admDonutChart = null;
let _admTrendChart = null;
let _adminCatsExpanded = false;
let _adminUiBound = false;

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
    // Only visitors still carrying an experiment sticky get an arm. Post-merge
    // traffic is deliberately untagged (see boot()).
    let abVariant = '';
    let abVia = '';
    try {
      const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
      if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) {
        abVariant = ab.v;
        abVia = ab.via || 'random';
      }
    } catch (_) {}
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

// Win-back pass capture, mirroring arm A. The claim link is ?pass=<token>, but
// Google OAuth returns without the query string, so the token is parked in
// localStorage before any redirect and consumed after sign-in. Last link wins.
const LID_PASS_KEY = '_lid_pass_token_v1';
// Which SPECIFIC template variant drove this click, for per-campaign funnel
// stats -- separate from the "first touch wins" attribution store, which
// every winback recipient already has a value in from their original signup.
const LID_PASS_CAMPAIGN_KEY = '_lid_pass_campaign_v1';
(function _lidCapturePassToken() {
  try {
    const q = new URLSearchParams(location.search);
    const tok = q.get('pass');
    if (!tok) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tok)) return;
    localStorage.setItem(LID_PASS_KEY, tok);
    const camp = q.get('utm_campaign');
    if (camp) localStorage.setItem(LID_PASS_CAMPAIGN_KEY, camp);
    q.delete('pass');
    const qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  } catch (_) {}
})();

// Consume a win-back pass token after sign-in. Idempotent server-side.
async function _winbackMaybeClaim() {
  let token = null, campaign = null;
  try {
    token = localStorage.getItem(LID_PASS_KEY);
    campaign = localStorage.getItem(LID_PASS_CAMPAIGN_KEY);
  } catch (_) {}
  if (!token || !currentUser || !_supabase) return;
  try {
    const { data, error } = await _supabase.rpc('claim_comeback_pass', { p_token: token });
    if (error) return; // transient failure must not burn the token
    if (data && (data.ok || data.reason === 'wrong_user' || data.reason === 'invalid_token')) {
      try { localStorage.removeItem(LID_PASS_KEY); localStorage.removeItem(LID_PASS_CAMPAIGN_KEY); } catch (_) {}
    }
    if (!data || !data.ok) return;
    void refreshGptUsage();
    void logUserEvent('winback_claim', { ui: 'gpt', reason: data.reason, expires_at: data.expires_at || null, campaign });
  } catch (_) {}
}

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

/** How wide the keyword market is — shops / listings / monthly units. */
function ddMarketScope(product, peers) {
  const t = product?._ptype || null;
  const list = Array.isArray(peers) ? peers : [];
  const peerShops = new Set(list.map(p => String(p.shop_id || '')).filter(Boolean)).size;
  const nSellers = Number(t?.n_sellers) || peerShops || 0;
  const nListings = Number(t?.n_listings) || list.length || 0;
  let soldBln = 0;
  const wk = Number(t?.wk_units);
  if (wk > 0) {
    soldBln = Math.round(wk * 30 / 7);
  } else {
    const fromPeers = list.reduce((s, p) => {
      const v = Number(p.nowcast_velocity_daily) || Number(p.sold_per_day) || 0;
      return s + (v > 0 ? v * 30 : 0);
    }, 0);
    if (fromPeers > 0) soldBln = Math.round(fromPeers);
  }
  return { nSellers, nListings, soldBln, isPasar: false };
}

function ddMarketNoteHtml(product, peers) {
  const { nSellers, nListings, soldBln, isPasar } = ddMarketScope(product, peers);
  if (!(nSellers > 0)) return '';
  const nTxt = nSellers.toLocaleString('id-ID');
  const fromType = Number(product?._ptype?.n_sellers) > 0;
  const title = isPasar ? 'Ini adalah data tingkat pasar' : 'Konteks pasar keyword ini';
  const body = (isPasar && fromType)
    ? `Data ini merupakan gabungan dari ${nTxt} toko aktif yang menjual produk ini di Shopee.`
    : `Dari listing yang terpantau, ada ${nTxt} toko aktif yang menjual produk serupa di Shopee.`;
  const stats = [];
  stats.push({
    ico: 'store',
    val: nSellers.toLocaleString('id-ID'),
    lbl: 'Toko Aktif',
  });
  if (nListings > 0) {
    stats.push({
      ico: 'cart',
      val: nListings.toLocaleString('id-ID'),
      lbl: 'Total Listing',
    });
  }
  if (soldBln > 0) {
    stats.push({
      ico: 'bag',
      val: fmtIdCompact(soldBln),
      lbl: 'Total Terjual/bln',
      title: 'Perkiraan unit per bulan dari laju mingguan terukur (×30 hari).',
    });
  }
  return `<aside class="ddr-market-note" aria-label="${esc(title)}">
    <div class="ddr-market-note-head">
      <span class="ddr-market-note-ico" aria-hidden="true">${ico('flame', 16)}</span>
      <strong>${esc(title)}</strong>
    </div>
    <p>${esc(body)}</p>
    <div class="ddr-market-stats">
      ${stats.map(s => `<div class="ddr-market-stat"${s.title ? ` title="${esc(s.title)}"` : ''}>
        <span class="ddr-market-stat-ico" aria-hidden="true">${ico(s.ico, 15)}</span>
        <span class="ddr-market-stat-val">${esc(s.val)}</span>
        <span class="ddr-market-stat-lbl">${esc(s.lbl)}</span>
      </div>`).join('')}
    </div>
  </aside>`;
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

// ── client_events: the event stream that includes anonymous visitors ────────
// activity_events only ever held signed-in rows, because logUserEvent() below
// early-returns without a user. That made ~88% of a typical week invisible.
// Every event now ALSO goes to public.client_events through an anon-executable
// RPC (same pattern as log_deepdive_open), carrying the visitor id, the tab
// session id, and a monotonic seq so a visit is an ordered path.
//
// Batched on purpose: one request per event at 8x the volume is needless load.
// fetch(keepalive) rather than sendBeacon because PostgREST needs the apikey
// header and sendBeacon cannot set one.
const _CE_SEQ_KEY = '_lid_evt_seq';
const _CE_MAX_BATCH = 10;
const _CE_FLUSH_MS = 15000;
let _ceQueue = [];
let _ceTimer = null;

function _ceNextSeq() {
  try {
    const n = (parseInt(sessionStorage.getItem(_CE_SEQ_KEY) || '0', 10) || 0) + 1;
    sessionStorage.setItem(_CE_SEQ_KEY, String(n));
    return n;
  } catch (_) { return null; }
}

function _ceFlush(useKeepalive) {
  if (!_ceQueue.length) return;
  const events = _ceQueue.splice(0, 60);
  if (_ceTimer) { clearTimeout(_ceTimer); _ceTimer = null; }
  let vid = null, sid = null;
  try {
    vid = _lidVisitorId();
    sid = sessionStorage.getItem('_lid_sid') || null;
  } catch (_) {}
  if (!vid) return;
  // Anon key when signed out, user JWT when signed in — same reason as
  // logDeepDiveOpen: initSupabase() moves the session out of the SDK's store,
  // so auth.uid() would be null on a signed-in dive without this.
  const token = _authLoad()?.access_token || SUPA_KEY;
  try {
    fetch(`${SUPA_URL}/rest/v1/rpc/log_client_events`, {
      method: 'POST',
      keepalive: !!useKeepalive,
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_visitor_id: vid, p_session_id: sid, p_events: events }),
    }).then(() => {}, () => {});
  } catch (_) {}
}

(function installJsErrorCapture() {
  if (window.__lidJsErr) return;
  window.__lidJsErr = true;
  const seen = new Set();
  function report(kind, msg, extra) {
    const key = String(msg || '').slice(0, 180);
    if (!key || seen.has(key) || seen.size > 12) return;
    seen.add(key);
    logClientEvent('js_error', { kind, message: key, ...(extra || {}) });
  }
  window.addEventListener('error', (ev) => {
    report('onerror', ev.message || ev.error, { source: ev.filename, line: ev.lineno });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev.reason;
    report('unhandledrejection', reason && reason.message ? reason.message : reason);
  });
})();

function logClientEvent(eventType, props) {
  // Excluded to match logUserEvent: an admin previewing the site as someone else
  // is inspecting it, not using it. Covers student mode as well as sample mode.
  if (adminIsPreviewing()) return;
  try {
    _ceQueue.push({
      seq: _ceNextSeq(),
      event: String(eventType || '').slice(0, 64),
      props: props && typeof props === 'object' ? props : {},
    });
  } catch (_) { return; }
  if (_ceQueue.length >= _CE_MAX_BATCH) { _ceFlush(false); return; }
  if (!_ceTimer) _ceTimer = setTimeout(() => _ceFlush(false), _CE_FLUSH_MS);
}

// A visit that ends is a visit whose tail must still be recorded — pagehide and
// the hidden transition are the only reliable end-of-visit signals on mobile.
try {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _ceFlush(true);
  });
  window.addEventListener('pagehide', () => _ceFlush(true));
} catch (_) {}

async function logUserEvent(eventType, metadata) {
  if (adminIsPreviewing()) return;
  if (_funnelIsDup(eventType, metadata)) return;
  // Always, signed in or not. This is the line that ends the 88% blind spot.
  logClientEvent(eventType, _lidAbStamp(metadata));
  // activity_events keeps its exact previous contract so every existing admin
  // query, matview and dashboard is untouched: signed-in rows only.
  if (!_supabase || !currentUser) return;
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
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5c3.2 2.4 4.8 5.8 4.8 9.4L12 16.2 7.2 11.9c0-3.6 1.6-7 4.8-9.4z"/><circle cx="12" cy="9.3" r="1.7"/><path d="M7.2 11.9 4.7 14a1 1 0 0 0-.33.95l.5 2.6 2.6-1.35M16.8 11.9l2.5 2.1a1 1 0 0 1 .33.95l-.5 2.6-2.6-1.35"/><path d="M10 18.4c0 1.5.75 2.7 2 3.6 1.25-.9 2-2.1 2-3.6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.6.3 4 2.2 4 4.5"/></svg>',
  store: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.1 11.2a1.8 1.8 0 0 0 1.8 1.5h8.7a1.8 1.8 0 0 0 1.8-1.5L21.5 8H7"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1.1 12.2a1.6 1.6 0 0 1-1.6 1.5H8.7a1.6 1.6 0 0 1-1.6-1.5L6 8z"/><path d="M9 8V6.2A3 3 0 0 1 15 6.2V8"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 21s-7-5.4-7-11a7 7 0 1 1 14 0c0 5.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linejoin="round"><path d="M3 12V3h9l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1.5 1.2-1.5 2.1h-4c0-.9-.7-1.5-1.5-2.1A6 6 0 0 1 12 3z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  rocket: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.3 2"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5z"/><path d="M13.7 19a2 2 0 0 1-3.4 0"/></svg>',
  arrowUpRight: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>',
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

/** Record a deep-dive open. Every open, including anonymous ones and repeat
 *  opens of the same product — unlike logProductView there is no per-day
 *  dedupe, because the question this answers is "how often is the analysis
 *  used", not "how many people saw this listing".
 *
 *  Why not activity_events: logUserEvent() early-returns without a signed-in
 *  user, so it has never counted a single anonymous dive. Why not use_dive:
 *  that is a quota RPC that refuses past the daily cap, and viewing a product
 *  must never be walled. log_deepdive_open always inserts and always returns ok. */
function logDeepDiveOpen(product) {
  try {
    // No `!currentUser` guard — counting anonymous dives is the whole point.
    // _admSample IS excluded, matching logUserEvent: an admin previewing the
    // site as someone else is inspecting, not using it, and this account
    // already accounts for a large share of all deep-dive events.
    if (!product || adminIsPreviewing()) return;
    // initSupabase() deletes the SDK's sb-*-auth-token and keeps the session
    // in laris_auth_v1. _supabase.rpc() would then send the anon key, so
    // auth.uid() came back null even for a signed-in dive. Send that token
    // explicitly — anon key when signed out, user JWT when signed in.
    const token = _authLoad()?.access_token || SUPA_KEY;
    fetch(`${SUPA_URL}/rest/v1/rpc/log_deepdive_open`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_item_id:    product.item_id != null ? String(product.item_id) : null,
        p_shop_id:    product.shop_id != null ? String(product.shop_id) : null,
        p_keyword:    product.keyword || null,
        p_visitor_id: _lidVisitorId(),
        p_source:     'app',
      }),
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
  await hydrateProdTrendIn(scope);
}

const _prodDeltaMap = Object.create(null);
const PROD_DELTA_BATCH = 200;

function _prodNextDay(day) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function _prodLatestDeltaDay() {
  if (!_supabase) return null;
  try {
    const { data } = await _supabase.from('listing_deltas')
      .select('scraped_at').order('scraped_at', { ascending: false }).limit(1);
    return data?.[0]?.scraped_at ? String(data[0].scraped_at).slice(0, 10) : null;
  } catch (_) { return null; }
}

function prodListingTrendPct(p) {
  if (!p) return null;
  if (p.delta_7d != null && p.total_sold != null) {
    return trendGrowthPct(p, 'delta_7d');
  }
  const key = prodKey(p);
  const d = _prodDeltaMap[key];
  if (!d) return null;
  const prev = d.sold_prev;
  if (prev == null || prev === 0) return null;
  const delta = d.est;
  if (delta == null) return null;
  if (prev < 50 && delta > 0) return Infinity;
  return Math.round(delta / prev * 100);
}

function prodListingTrendTooltip(p) {
  const key = prodKey(p);
  const d = _prodDeltaMap[key];
  if (d?.sold_prev != null) {
    const span = d.prev_scraped_at && d.scraped_at
      ? `${Math.max(1, Math.round((Date.parse(d.scraped_at) - Date.parse(d.prev_scraped_at)) / 86400000))} hari terakhir`
      : 'rentang scrape terakhir';
    return `Persentase kenaikan terhadap ${Number(d.sold_prev).toLocaleString('id-ID')} unit `
      + `yang sudah terjual sebelumnya (${span}), bukan perbandingan dengan minggu lalu.`;
  }
  return 'Kenaikan penjualan periode ini dibanding total terjual sebelumnya, bukan vs minggu lalu.';
}

function cardWowPctHtml(pct, tooltip) {
  if (pct == null) return '';
  const tip = tooltip ? ` title="${esc(tooltip)}"` : '';
  if (pct === Infinity) {
    return `<span class="prod-card-wow"${tip}>Baru</span>`;
  }
  if (pct > 0) {
    return `<span class="prod-card-wow"${tip}>${ico('arrowUp', 10)} ${pct}% minggu ini</span>`;
  }
  if (pct < 0) {
    return `<span class="prod-card-wow prod-card-wow--down"${tip}>${ico('arrowDown', 10)} ${pct}% minggu ini</span>`;
  }
  return `<span class="prod-card-wow prod-card-wow--flat"${tip}>0% minggu ini</span>`;
}

function prodCardWowHtml(p) {
  const pct = prodListingTrendPct(p);
  const tip = pct != null && p.delta_7d == null ? prodListingTrendTooltip(p) : (
    'Kenaikan penjualan periode ini dibanding total terjual sebelumnya, bukan vs minggu lalu.'
  );
  return cardWowPctHtml(pct, tip);
}

async function hydrateProdTrendIn(scope) {
  if (!_supabase || !scope) return;
  const needFetch = [];
  const seen = new Set();
  scope.querySelectorAll('[data-prod-wow]').forEach(el => {
    const key = el.getAttribute('data-prod-wow');
    if (!key || seen.has(key)) return;
    seen.add(key);
    const cached = state.productByKey[key];
    if (cached && prodListingTrendPct(cached) != null) return;
    if (_prodDeltaMap[key]) return;
    const [item_id, shop_id] = key.split('|');
    if (item_id && shop_id) needFetch.push({ item_id, shop_id, key });
  });
  if (needFetch.length) {
    const day = await _prodLatestDeltaDay();
    if (day) {
      const ids = [...new Set(needFetch.map(p => p.item_id))];
      for (let i = 0; i < ids.length; i += PROD_DELTA_BATCH) {
        const chunk = ids.slice(i, i + PROD_DELTA_BATCH);
        try {
          const { data, error } = await _supabase.from('listing_deltas')
            .select('item_id,shop_id,sold_prev,estimated_sold_delta,prev_scraped_at,scraped_at')
            .in('item_id', chunk)
            .gte('scraped_at', `${day}T00:00:00`)
            .lt('scraped_at', `${_prodNextDay(day)}T00:00:00`);
          if (error || !data?.length) continue;
          for (const r of data) {
            const key = `${r.item_id}|${r.shop_id}`;
            _prodDeltaMap[key] = {
              est: r.estimated_sold_delta,
              sold_prev: r.sold_prev,
              scraped_at: r.scraped_at,
              prev_scraped_at: r.prev_scraped_at,
            };
          }
        } catch (_) {}
      }
    }
  }
  scope.querySelectorAll('[data-prod-wow]').forEach(el => {
    const key = el.getAttribute('data-prod-wow');
    const [item_id, shop_id] = key.split('|');
    const cached = state.productByKey[key] || { item_id, shop_id };
    el.innerHTML = prodCardWowHtml(cached);
  });
}

// ── Composer chip sets ───────────────────────────────────────────────────
const HOME_CHIPS = [
  { id: 'trending', label: 'Produk Trending', icon: 'flame', prompt: 'Produk apa yang lagi trending minggu ini?' },
  { id: 'terlaris_minggu', label: 'Terlaris Minggu Ini', icon: 'rocket', prompt: 'Apa yang terlaris minggu ini?' },
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
  { id: 'terlaris_minggu', label: 'Terlaris minggu ini', icon: 'rocket', prompt: 'Apa yang terlaris minggu ini?' },
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

// Resell vs create-your-own is genuinely category-agnostic strategic advice
// (unlike launch/konten, which get category-flavored copy above), so these
// two are appended once here rather than duplicated across every entry in
// DD_CHIPS_BY_CAT. Real products only (pasar rows get the string-substitution
// treatment below, which doesn't fit a "should I resell or make my own" framing).
const DD_PATH_CHIPS = [
  { id: 'path_resell', label: 'Tips jual ulang', icon: 'spark', prompt: 'Saya mau jual ulang (reseller) produk ini. Beri rekomendasi sourcing: cek supplier, target harga beli, spesifikasi penting, dan 2 tips menang vs kompetitor.' },
  { id: 'path_create', label: 'Tips bikin sendiri', icon: 'bulb', prompt: 'Saya mau bikin produk sendiri di niche ini. Beri rekomendasi: ide variasi belum digarap kompetitor, estimasi biaya & harga jual, dan diferensiasi.' },
];

function ddComposerChips(product) {
  const cat = normalizeDdChipCat(product);
  const base = (cat && DD_CHIPS_BY_CAT[cat]) ? DD_CHIPS_BY_CAT[cat] : DD_CHIPS;
  const pasar = !!product?._ptype;
  if (!pasar) return base.map((c) => ({ ...c })).concat(DD_PATH_CHIPS.map((c) => ({ ...c })));
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
      // via:'chip' keeps the seven intent chips on their purpose-built cards.
      // The same words TYPED go through the agent instead.
      void handleComposerSubmit(btn.getAttribute('data-prompt'), { via: 'chip' });
    });
  });
}

// ── Ask Laris (dedicated chat page) ───────────────────────────────────────
// Pre-prompt chips run a dedicated action rather than free text through the
// generic router: "kotaku"/"my city" needs the user's real onboarding city,
// which only startRecommendationChat resolves — a generic search for the
// literal words would silently drop the personalization.
async function askLarisRecommend(freeText) {
  const prevFreeText = state.onboarding.freeText;
  state.onboarding.freeText = freeText || '';
  try {
    await startRecommendationChat(false);
  } finally {
    state.onboarding.freeText = prevFreeText;
  }
}

const ASK_LARIS_PROMPTS = [
  { id: 'al_terlaris', label: 'Produk terlaris kotaku', run: () => askLarisRecommend('') },
  { id: 'al_modal', label: 'Modal 500rb, jualan apa?', run: () => askLarisRecommend('Modal 500rb, mau mulai jualan apa?') },
  { id: 'al_evaluasi', label: 'Apakah jualan sepatu bagus?', run: () => submitFromHome('Apakah jualan sepatu ide bagus?') },
];

function renderAskLarisChips() {
  const wrap = $('composer-chips');
  if (!wrap) return;
  wrap.hidden = false;
  wrap.innerHTML = ASK_LARIS_PROMPTS.map(c =>
    `<button type="button" class="chip" data-al-chip="${esc(c.id)}">${esc(c.label)}</button>`
  ).join('');
  wrap.querySelectorAll('[data-al-chip]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cfg = ASK_LARIS_PROMPTS.find(c => c.id === btn.getAttribute('data-al-chip'));
      if (!cfg) return;
      void logUserEvent('gpt_chip_click', { ui: 'gpt', chip: cfg.id, surface: 'ask_laris' });
      clarityEvt('gpt_chip_click', { chip: cfg.id });
      void cfg.run();
    });
  });
}

/** "Contoh pertanyaan lainnya" list on the home-landing Ask Laris teaser —
 * sourced from the same ASK_LARIS_PROMPTS the composer chips use, so the
 * marketing copy can't drift from what the product actually does. */
function renderHomeLandingExamples() {
  const wrap = $('hl-ai-examples-list');
  if (!wrap) return;
  wrap.innerHTML = ASK_LARIS_PROMPTS.map(c =>
    `<button type="button" class="hl-ai-example" data-hl-example="${esc(c.id)}">${esc(c.label)}</button>`
  ).join('');
  wrap.querySelectorAll('[data-hl-example]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cfg = ASK_LARIS_PROMPTS.find(c => c.id === btn.getAttribute('data-hl-example'));
      if (!cfg) return;
      void logUserEvent('gpt_chip_click', { ui: 'gpt', chip: cfg.id, surface: 'home_landing' });
      clarityEvt('gpt_chip_click', { chip: cfg.id });
      void cfg.run();
    });
  });
}

// Ask Laris AI landing demo (Bandung/fashion example) — real listings
// (item_id/shop_id/product_name/image_url/price/total_sold/rating/store_name
// all pulled from the live DB), hardcoded since this is a one-time scripted
// demo, not a live query — see initLandingAiDemo().
const LP_AI_DEMO_QUESTION = 'Saya tinggal di Bandung mau jual fashion';
const LP_AI_DEMO_ANSWER = 'Kebanyakan toko di kategori Fashion Wanita jual sekitar Rp6 juta/bulan. Berikut beberapa produk yang sedang laris:';
const LP_AI_DEMO_PRODUCTS = [
  { item_id: 23556740749, shop_id: 1076839816, product_name: 'KKTOP - Jaket Olahraga Anti UV Wanita Baju Olahraga UPF100+ Breathable Outdoor Cepat Kering (J001)', image_url: 'https://cf.shopee.co.id/file/id-11134207-822wp-mmr1603rhp1i19', price: 118423, total_sold: 200000, rating: 4.9, store_name: 'KKTOP Official Store', category: 'Fashion' },
  { item_id: 2869284259, shop_id: 92166242, product_name: 'KAOS SLIMFIT WANITA POLOS ONECK COTTON COMBED 30S - BAJU KAOS LENGAN PENDEK SLIM FIT', image_url: 'https://cf.shopee.co.id/file/id-11134207-7rbk8-m9l3qoheobh984', price: 32000, total_sold: 100000, rating: 4.91, store_name: 'PT NET PERSADA INDONESIA', category: 'Fashion' },
  { item_id: 22900976851, shop_id: 790124701, product_name: 'WiZi Jaket Airism Anti UV Baju Olahraga Wanita Airy Jaket Pelindung Matahari Wanita UPF50+ (MT02)', image_url: 'https://cf.shopee.co.id/file/id-11134207-7r991-lw822qdb7x9ac1', price: 108304, total_sold: 100000, rating: 4.93, store_name: 'Wizi Official Shop', category: 'Fashion' },
  { item_id: 798272479, shop_id: 39074473, product_name: 'Bajubaja Basic Tshirt A Perfect Fit 100% Cotton Combat 24s Lembut, Adem dan Nyerap Keringat', image_url: 'https://cf.shopee.co.id/file/id-11134207-7ra0k-mcagprzmta7271', price: 63899, total_sold: 90000, rating: 4.87, store_name: 'Bajubaja Official', category: 'Fashion' },
  { item_id: 13650047760, shop_id: 591177922, product_name: '[ GROSIR ] Kaos Polos Cotton Combed 24s Lengan Pendek / Pakaian Pria Oneck / Baju Pria / UNISEX / BASIC TEE / Atasan', image_url: 'https://cf.shopee.co.id/file/id-11134207-7r98o-lkm2oxux8e8l91', price: 34900, total_sold: 70000, rating: 4.85, store_name: 'KAOS POLOS ORLANDO', category: 'Fashion' },
  { item_id: 4240578095, shop_id: 34297519, product_name: 'Kaos Polos Atasan Pria Wanita Oblong Pendek Soft TC24s M-XXL Premium S M L XL 2XL 2L', image_url: 'https://cf.shopee.co.id/file/id-11134207-7rbka-m6tyq5qoahvt4e', price: 23000, total_sold: 70000, rating: 4.8, store_name: 'GudangKaosP0l0s', category: 'Fashion' },
];

let _lpAiDemoRan = false;
// Dedicated typewriter for the landing demo — _typeTextNode's cancel check
// (`gen !== _streamGen`) reads the app-wide streaming counter, which any
// real chat activity elsewhere bumps. Sharing it here meant an unrelated
// stream starting mid-sequence would silently truncate this scripted demo.
function _lpTypeText(node, fullText, cps) {
  return new Promise((resolve) => {
    const text = String(fullText || '');
    if (!node || !text) { resolve(); return; }
    let i = 0;
    const step = () => {
      const n = Math.min(3, text.length - i);
      i += n;
      node.textContent = text.slice(0, i);
      if (i >= text.length) { resolve(); return; }
      const lastCh = text[i - 1];
      const pause = /[.!?]/.test(lastCh) ? 6 : /[,;:]/.test(lastCh) ? 3 : 1;
      setTimeout(step, (1000 / cps) * n * pause);
    };
    step();
  });
}
function initLandingAiDemo() {
  const section = $('hl-ai-demo');
  const qEl = $('hl-ai-demo-q');
  const aEl = $('hl-ai-demo-a');
  const loadingEl = $('hl-ai-demo-loading');
  const cardsEl = $('hl-ai-demo-cards');
  const composerEl = $('hl-ai-demo-composer');
  const inputEl = $('hl-ai-demo-input');
  if (!section || !qEl || !aEl || !cardsEl || typeof IntersectionObserver !== 'function') return;

  // The composer is real from the moment it's visible in the DOM — wiring it
  // doesn't depend on the scripted sequence below having run yet.
  composerEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = (inputEl?.value || '').trim();
    if (!t) return;
    inputEl.value = '';
    void logUserEvent('gpt_landing_ai_demo_ask', { ui: 'gpt' });
    submitFromHome(t);
  });

  const io = new IntersectionObserver((entries) => {
    if (_lpAiDemoRan || !entries.some(e => e.isIntersecting)) return;
    _lpAiDemoRan = true;
    io.disconnect();
    void (async () => {
      await _lpTypeText(qEl, LP_AI_DEMO_QUESTION, 26);
      await _sleep(400);
      aEl.hidden = false;
      await _lpTypeText(aEl, LP_AI_DEMO_ANSWER, 40);
      // Beat before results land — long enough to actually read the answer,
      // not just a network-latency filler.
      if (loadingEl) loadingEl.hidden = false;
      await _sleep(1500);
      if (loadingEl) loadingEl.hidden = true;
      const products = LP_AI_DEMO_PRODUCTS.map(p => asListingProduct({
        ...p, nowcast_omset_monthly: Math.round((p.price * p.total_sold) / 6),
      }));
      cardsEl.hidden = false;
      cardsEl.innerHTML = `<div class="card-grid">${products.map((p, i) => productCardHtml(p, i)).join('')}</div>`;
      // productCardHtml renders <button>s — without binding they'd look
      // clickable and do nothing. These are real listings, so clicking one
      // opens its actual Deep Dive, same as anywhere else in the app.
      bindProductCards(cardsEl);
      void hydrateProdCardsIn(cardsEl);
      requestAnimationFrame(() => cardsEl.classList.add('is-shown'));
      if (composerEl) {
        composerEl.hidden = false;
        requestAnimationFrame(() => composerEl.classList.add('is-shown'));
      }
    })();
  }, { threshold: 0.35 });
  io.observe(section);
}

/** Sidebar "Ask Laris" entry — same landing as clicking the logo. */
function openAskLaris() {
  abortAssistantStream();
  renderHome();
}

// ── Chart.js lifecycle (multiple instances per deep dive) ────────────────
const _charts = new Map();
let _ddObserver = null;
function makeChart(canvasId, cfg) {
  const el = $(canvasId);
  if (!el || typeof Chart === 'undefined') return null;
  let prev = _charts.get(canvasId);
  if (!prev && typeof Chart.getChart === 'function') prev = Chart.getChart(el);
  if (prev) { try { prev.destroy(); } catch (_) {} }
  _charts.delete(canvasId);
  try {
    const c = new Chart(el, cfg);
    _charts.set(canvasId, c);
    return c;
  } catch (err) {
    console.error('[makeChart]', canvasId, err);
    return null;
  }
}
function ddResizeTrendChart() {
  const el = $('ddr-trend-canvas');
  if (!el || typeof Chart === 'undefined') return;
  const ch = _charts.get('ddr-trend-canvas') || Chart.getChart(el);
  try { ch?.resize(); } catch (_) {}
}
function destroyAllCharts() {
  closeDistChartLightbox();
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

// The DB's canonical taxonomy (public.category_map, 18 buckets — see
// supabase/migrations/20260728130000_category_canonical.sql) is coarser and
// named differently from NU_ONB_CATS above (an older, finer-grained list used
// only for onboarding prefs) — e.g. NU_ONB_CATS has 'Olahraga' as its own
// entry, the DB only ever has 'Olahraga & Outdoor'. Anything that filters
// product_types_v.category_canonical (like the Produk category rail) MUST
// use these exact strings, or the .eq() matches zero rows and silently falls
// back to an unfiltered global pool — that mismatch is what caused "clicked
// Olahraga, got Fashion" results. Hardcoded (not loaded from
// loadCanonicalCats()) so the rail can render instantly with no DB round
// trip; sort order mirrors category_map.sort_order.
const DIR_CANON_CATS = [
  'Rumah & Dekorasi', 'Dapur', 'Kamar Mandi', 'Fashion', 'Sepatu, Tas & Aksesoris',
  'Kecantikan & Perawatan', 'Kesehatan', 'Ibu, Bayi & Anak', 'Elektronik & Listrik',
  'HP, Komputer & Gaming', 'Motor & Mobil', 'Olahraga & Outdoor', 'Hewan Peliharaan',
  'Taman, Tanaman & Perkakas', 'Sekolah, Kantor & Usaha', 'Hobi, Kerajinan & Pesta',
  'Makanan & Minuman', 'Perlengkapan Ibadah',
];
const CANON_CAT_ICONS = {
  'Rumah & Dekorasi': CAT_CHIP_ICONS['Rumah'],
  'Dapur': CAT_CHIP_ICONS['Dapur'],
  'Kamar Mandi': CAT_CHIP_ICONS['Kamar Mandi'],
  'Fashion': CAT_CHIP_ICONS['Fashion'],
  'Sepatu, Tas & Aksesoris': '<path d="M6 8h12l1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  'Kecantikan & Perawatan': CAT_CHIP_ICONS['Kecantikan'],
  'Kesehatan': CAT_CHIP_ICONS['Kesehatan'],
  'Ibu, Bayi & Anak': CAT_CHIP_ICONS['Bayi & Anak'],
  'Elektronik & Listrik': CAT_CHIP_ICONS['Elektronik'],
  'HP, Komputer & Gaming': CAT_CHIP_ICONS['HP & Gadget'],
  'Motor & Mobil': CAT_CHIP_ICONS['Motor & Mobil'],
  'Olahraga & Outdoor': CAT_CHIP_ICONS['Olahraga'],
  'Hewan Peliharaan': CAT_CHIP_ICONS['Hewan Peliharaan'],
  'Taman, Tanaman & Perkakas': CAT_CHIP_ICONS['Tanaman'],
  'Sekolah, Kantor & Usaha': CAT_CHIP_ICONS['Alat Tulis'],
  'Hobi, Kerajinan & Pesta': CAT_CHIP_ICONS['Hobi & Kerajinan'],
  'Makanan & Minuman': '<path d="M3 8h14v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M7 3c0 1-1 1-1 2s1 1 1 2"/><path d="M11 3c0 1-1 1-1 2s1 1 1 2"/>',
  'Perlengkapan Ibadah': '<path d="M12 2l2 3h-4l2-3z"/><path d="M6 22V12a6 6 0 0 1 12 0v10"/><path d="M3 22h18"/><path d="M9 22v-5a3 3 0 0 1 6 0v5"/>',
};
const DIR_CAT_PHOTO = {
  'Rumah & Dekorasi': 'rumah-dekorasi',
  'Dapur': 'dapur',
  'Kamar Mandi': 'kamar-mandi',
  'Fashion': 'fashion',
  'Sepatu, Tas & Aksesoris': 'sepatu-tas-aksesoris',
  'Kecantikan & Perawatan': 'kecantikan-perawatan',
  'Kesehatan': 'kesehatan',
  'Ibu, Bayi & Anak': 'ibu-bayi-anak',
  'Elektronik & Listrik': 'elektronik-listrik',
  'HP, Komputer & Gaming': 'hp-komputer-gaming',
  'Motor & Mobil': 'motor-mobil',
  'Olahraga & Outdoor': 'olahraga-outdoor',
  'Hewan Peliharaan': 'hewan-peliharaan',
  'Taman, Tanaman & Perkakas': 'taman-tanaman-perkakas',
  'Sekolah, Kantor & Usaha': 'sekolah-kantor-usaha',
  'Hobi, Kerajinan & Pesta': 'hobi-kerajinan-pesta',
  'Makanan & Minuman': 'makanan-minuman',
  'Perlengkapan Ibadah': 'perlengkapan-ibadah',
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
const FINDER_PASAR_LIMIT = 60;
// NU_ONB_CATS (finder chips) → category_map canonical. Used when the live
// category_map fetch has not landed yet so Hobi & Kerajinan never queries
// product_types_v.category_canonical with the legacy string.
const NU_ONB_TO_CANON = {
  'Alat Tulis': 'Sekolah, Kantor & Usaha',
  'Bayi & Anak': 'Ibu, Bayi & Anak',
  'Dapur': 'Dapur',
  'Elektronik': 'Elektronik & Listrik',
  'Fashion': 'Fashion',
  'Hewan Peliharaan': 'Hewan Peliharaan',
  'Hobi & Kerajinan': 'Hobi, Kerajinan & Pesta',
  'HP & Gadget': 'HP, Komputer & Gaming',
  'Kamar Mandi': 'Kamar Mandi',
  'Keamanan': 'Elektronik & Listrik',
  'Kecantikan': 'Kecantikan & Perawatan',
  'Kesehatan': 'Kesehatan',
  'Motor & Mobil': 'Motor & Mobil',
  'Olahraga': 'Olahraga & Outdoor',
  'Outdoor & Camping': 'Olahraga & Outdoor',
  'Rumah': 'Rumah & Dekorasi',
  'Sepeda': 'Olahraga & Outdoor',
  'Taman': 'Taman, Tanaman & Perkakas',
  'Tanaman': 'Taman, Tanaman & Perkakas',
};
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
  categories: [FINDER_DEFAULT_CAT],
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
  pendingDeepdive: null, // { item_id, shop_id } clicked behind the login gate; opened after sign-in
  pendingCompare: null, // { products: [...] } (legacy { a, b }) behind login gate
  pendingFinder: null,  // landing finder answers given before signup; re-run after
  pendingTracker: null, // in-progress tracker wizard draft behind the login gate; resumed after sign-in
  pendingTrackKeyword: null, // one-tap "Kabari Kalau Berubah" caught by the signup gate; added after sign-in
  everOpenedDeepdive: false,
  lastDeepDiveKeyword: '',
  lastDeepDiveCategory: '',
  comparePick: null, // { source, selected[], chatId? } — directory pick mode, max 3 listings
  compareReturnChatId: null, // compare riwayat to reopen after a Deep Dive from it
  // Survives recommendation wipes so chat product cards can reopen Deep Dive.
  productByKey: Object.create(null),

  dirPage: 1,
  dirCats: [],     // multi-select category_canonical filter (empty = all)
  dirCities: [],   // multi-select city filter (empty = ALL / nasional)
  dirSearch: '',   // sticky Produk search query (filters the directory grid)
  dirNearby: false, // current dirTypes came from listing-title nearby lift
  dirSub: null,    // selected sub-group within a single selected category
  dirSort: 'omset',
  dirRangeFilters: null,
  dirRows: [],
  dirTypes: [],  // keyword chips for the current listing pool
  dirChipKw: '', // '' = Semua
  dirZoneKeys: null,
  dirPoolListings: [],
  dirUnsold: 0,
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
    if (raw.pendingTracker) state.pendingTracker = raw.pendingTracker;
    if (raw.pendingTrackKeyword) state.pendingTrackKeyword = raw.pendingTrackKeyword;
    if (raw.everOpenedDeepdive != null) state.everOpenedDeepdive = !!raw.everOpenedDeepdive;
    if (raw.lastDeepDiveKeyword) state.lastDeepDiveKeyword = String(raw.lastDeepDiveKeyword);
    if (raw.lastDeepDiveCategory) state.lastDeepDiveCategory = String(raw.lastDeepDiveCategory);
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
      pendingTracker: state.pendingTracker || null,
      pendingTrackKeyword: state.pendingTrackKeyword || null,
      everOpenedDeepdive: state.everOpenedDeepdive || false,
      lastDeepDiveKeyword: state.lastDeepDiveKeyword || '',
      lastDeepDiveCategory: state.lastDeepDiveCategory || '',
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
/** Compact Indonesian count for hero stats: 8900 → "8,9 rb", 2430 → "2.430". */
function fmtIdCompact(n, { fullBelow = 1000 } = {}) {
  n = Number(n) || 0;
  if (n < fullBelow) return Math.round(n).toLocaleString('id-ID');
  if (n >= 1e6) {
    const v = n / 1e6;
    return (v >= 10 ? v.toFixed(0) : v.toFixed(1).replace('.', ',')).replace(/,0$/, '') + ' jt';
  }
  const v = n / 1e3;
  const s = v >= 100 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',').replace(/,0$/, '');
  return s + ' rb';
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/**
 * Shopee serves the original upload at /file/<hash> — typically 1024x1024 and
 * 250-450KB (some over 1MB). Every grid card, table row and thumb strip we draw
 * is at most ~160 CSS px, so the `_tn.webp` variant (320px WebP, ~20KB) is the
 * right pixel size at 2x DPR and cuts a 60-card search grid from ~11MB to <1MB.
 * Only the full-bleed deep-dive carousel should keep the original.
 * Non-Shopee or already-suffixed URLs pass through untouched.
 */
function imgThumb(url) {
  const u = String(url || '');
  return /^https:\/\/cf\.shopee\.co\.id\/file\/[\w-]+$/.test(u) ? u + '_tn.webp' : u;
}

const GARUDA_LOAD_POSES = [
  { id: 'binocs', src: '/images/brand/mascot-load-binocs.webp', w: 496, h: 641 },
  { id: 'magnify', src: '/images/brand/mascot-load-magnify.webp', w: 483, h: 558 },
];

function garudaLoadingHtml(label) {
  const pose = GARUDA_LOAD_POSES[Math.random() < 0.5 ? 0 : 1];
  const text = label || 'Memuat…';
  return `<div class="gl-load gl-load--${pose.id}" role="status" aria-label="${esc(text)}">` +
    `<div class="gl-load-stage">` +
      `<div class="gl-load-breathe">` +
        `<img class="gl-load-img" src="${pose.src}" alt="" width="${pose.w}" height="${pose.h}" decoding="async">` +
        `<span class="gl-load-tool" aria-hidden="true"><img src="${pose.src}" alt="" width="${pose.w}" height="${pose.h}" decoding="async"></span>` +
        `<span class="gl-load-lid" aria-hidden="true"></span>` +
      `</div>` +
    `</div>` +
    `<p class="gl-load-label">${esc(text)}</p>` +
  `</div>`;
}

function preloadGarudaLoaders() {
  GARUDA_LOAD_POSES.forEach((p) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = p.src;
  });
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
  let table = null;  // { head: [...], rows: [[...]] } currently open
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join('<br>'))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  // Tables scroll inside their own container: a wide comparison must never make
  // the whole chat scroll sideways on mobile.
  const flushTable = () => {
    if (!table) return;
    const th = table.head.map(c => `<th>${inline(c)}</th>`).join('');
    const tb = table.rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
    out.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
    table = null;
  };
  const cells = (line) => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const rawLine = lines[li];
    const line = esc(rawLine.trim());
    // Tables: a header row followed by a |---|---| separator. Anything else
    // containing pipes stays ordinary text.
    if (!inFence && table && /^\|.*\|$/.test(line)) { table.rows.push(cells(line)); continue; }
    if (!inFence && !table && /^\|.*\|$/.test(line)) {
      const sep = esc((lines[li + 1] || '').trim());
      if (/^\|[\s:|-]+\|$/.test(sep) && sep.includes('-')) {
        flushPara(); flushList();
        table = { head: cells(line), rows: [] };
        li++;                       // consume the separator row
        continue;
      }
    }
    if (table) flushTable();
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
  flushPara(); flushList(); flushTable();
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
const GPT_DAILY_LIMIT = 10;
const USAGE_RING_C = 2 * Math.PI * 15; // r=15 → ~94.2
let _gptUsage = {
  used: 0,
  limit: GPT_DAILY_LIMIT,
  resetAt: null,
  unlimited: false,
};
let _usageTicker = null;

// While the Beta is on there is no daily search cap for signed-in accounts, so
// the usage ring renders the same ∞ admins already get. Mirrors
// public._beta_unlimited() in the database — flip BOTH to end the Beta.
// This lifts a USAGE CAP, nothing more. LarisID is free for everyone either
// way (see MISSION.md and /harga/) — there is no paid plan to unlock, and
// ending the Beta only restores the 10/day meter, it never starts charging.
// Signed-out visitors are deliberately excluded (see refreshGptUsage): the
// 10/day anon meter is the reason to register, and gpt_chats needs auth anyway.
const BETA_UNLIMITED = true;
function betaUnlimitedNow() { return BETA_UNLIMITED; }

function merdekaUnlimitedNow() {
  try { return !!(window.LarisMerdeka && window.LarisMerdeka.isUnlimited && window.LarisMerdeka.isUnlimited()); }
  catch (_) { return false; }
}

function merdekaEndsAt() {
  try {
    const d = window.LarisMerdeka && window.LarisMerdeka.endsAt && window.LarisMerdeka.endsAt();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  } catch (_) {}
  return null;
}

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
  // A win-back pass lifts the DIVE cap only. get_my_usage still reports
  // unlimited:true for pass holders, but gpt_new_chat keeps metering them, so
  // trusting that flag here would show an infinity pill the server then refuses.
  const onPass = !!data.pass_expires_at;
  if (onPass) _gptUsage.passUntil = data.pass_expires_at;
  if (data.merdeka) _gptUsage.merdeka = true;
  else if (data.merdeka === false) _gptUsage.merdeka = false;
  if (data.beta) _gptUsage.beta = true;
  else if (data.beta === false) _gptUsage.beta = false;
  if (data.unlimited && !onPass) {
    _gptUsage.unlimited = true;
  } else if (data.unlimited === false || onPass) {
    _gptUsage.unlimited = false;
  }
  if (data.used != null) _gptUsage.used = Math.max(0, Number(data.used) || 0);
  if (data.limit != null) _gptUsage.limit = Math.max(1, Number(data.limit) || GPT_DAILY_LIMIT);
  if (data.can_claim_feedback != null) _gptUsage.canClaimFeedback = data.can_claim_feedback;
  if (data.reset_at) {
    const t = data.reset_at instanceof Date ? data.reset_at : new Date(data.reset_at);
    if (!Number.isNaN(t.getTime())) _gptUsage.resetAt = t;
  }
  if (!_gptUsage.resetAt) _gptUsage.resetAt = wibMidnightReset();
  if (isPlatformAdmin()) _gptUsage.unlimited = true;
  renderGptUsage();
}

// gpt_new_chat returns used/limit but not can_claim_feedback, so seed that flag
// once from get_my_usage — otherwise a reload re-offers a feedback bonus the
// server will only reject as already claimed.
async function gptSeedUsageFlags() {
  if (!_supabase || !currentUser) return;
  try {
    const { data, error } = await _supabase.rpc('get_my_usage');
    if (!error && data) noteGptUsage(data);
  } catch (_) {}
}

// ── Journey stats parity with arm A ───────────────────────────────────────
// user_journey_stats was only ever written by the classic arm, so every arm B
// user reported deepdive_count 0 and any dashboard reading that column silently
// under-counted B to zero. Mirror arm A's journeySyncRemote() shape here.
let _gptJourney = { deepdiveCount: 0, firstDeepDiveAt: null, loaded: false };
let _gptDiveSeen = 0; // dives this session, for first_dive / second_dive steps
let _profileWa = undefined; // undefined = not loaded; '' = none

function resetGptJourney() {
  _gptJourney = { deepdiveCount: 0, firstDeepDiveAt: null, loaded: false };
  _gptDiveSeen = 0;
  _profileWa = undefined;
}

function userNeverDeepDived() {
  if (currentUser && _gptJourney.loaded) return (_gptJourney.deepdiveCount || 0) === 0;
  return !state.everOpenedDeepdive;
}

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

async function loadProfileWaNumber() {
  if (_profileWa !== undefined) return _profileWa;
  _profileWa = '';
  if (!_supabase || !currentUser) return '';
  try {
    const { data } = await _supabase.from('user_profiles')
      .select('wa_number, public_whatsapp')
      .eq('user_id', currentUser.id).maybeSingle();
    _profileWa = String(data?.wa_number || data?.public_whatsapp || '').trim();
  } catch (_) {}
  return _profileWa;
}

async function saveProfileWaNumber(wa) {
  const num = String(wa || '').trim();
  if (!num || !_supabase || !currentUser) return;
  _profileWa = num;
  try {
    await _supabase.from('user_profiles').upsert({
      user_id: currentUser.id,
      wa_number: num,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (_) {}
}

const _LID_WA_CAPTURE_SKIP_KEY = '_lid_wa_capture_skip_v1';
let _waCaptureThenOnboarding = false;

function _waNormalisePhone(raw) {
  const s = String(raw || '').replace(/[\s\-().]/g, '');
  if (/^\+62\d{8,13}$/.test(s)) return s;
  if (/^628\d{7,12}$/.test(s)) return '+' + s;
  if (/^08\d{7,12}$/.test(s)) return '+62' + s.slice(1);
  if (/^8\d{7,12}$/.test(s)) return '+62' + s;
  return null;
}

function _isGoogleUser(user) {
  const u = user || currentUser;
  if (!u) return false;
  if (/@wa\.larisid\.com$/i.test(String(u.email || ''))) return false;
  const provider = String(u.app_metadata?.provider || '').toLowerCase();
  if (provider === 'google') return true;
  const ids = u.identities;
  return Array.isArray(ids) && ids.some((i) => String(i.provider || '').toLowerCase() === 'google');
}

function _waCaptureSkipped(userId) {
  try { return !!(JSON.parse(localStorage.getItem(_LID_WA_CAPTURE_SKIP_KEY) || '{}')[userId]); } catch (_) { return false; }
}
function _waCaptureMarkSkip(userId) {
  try {
    const m = JSON.parse(localStorage.getItem(_LID_WA_CAPTURE_SKIP_KEY) || '{}');
    m[userId] = 1;
    localStorage.setItem(_LID_WA_CAPTURE_SKIP_KEY, JSON.stringify(m));
  } catch (_) {}
}

function openWaCapture() {
  const overlay = $('wa-capture');
  if (!overlay) return;
  const err = $('wa-capture-error');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
  const input = $('wa-capture-input');
  if (input) input.value = '';
  overlay.classList.add('open');
  setTimeout(() => input?.focus(), 80);
  void logUserEvent('wa_capture_shown', { ui: 'gpt' });
}

function closeWaCapture() {
  $('wa-capture')?.classList.remove('open');
}

function skipWaCapture() {
  try { sessionStorage.setItem(_LID_WA_CAPTURE_SKIP_KEY, '1'); } catch (_) {}
  closeWaCapture();
  void logUserEvent('wa_capture', { ui: 'gpt', action: 'later' });
  if (_waCaptureThenOnboarding) offerOnboardingAfterSignin();
  else scheduleProductRowsNotice({ fromRestore: false, isNewSignup: false });
}

function _waCaptureContinue() {
  if (_waCaptureThenOnboarding) offerOnboardingAfterSignin();
}

async function maybeOfferWaCapture(opts) {
  _waCaptureThenOnboarding = !!(opts && opts.thenOnboarding);
  if (adminIsPreviewing() || isPlatformAdminRaw()) {
    _waCaptureContinue();
    return;
  }
  if (!_isGoogleUser() || !currentUser) {
    _waCaptureContinue();
    return;
  }
  if (_waCaptureSkipped(currentUser.id)) {
    _waCaptureContinue();
    return;
  }
  const wa = await loadProfileWaNumber();
  if (wa) {
    _waCaptureContinue();
    return;
  }
  openWaCapture();
}

async function submitWaCapture() {
  const err = $('wa-capture-error');
  const btn = $('wa-capture-save');
  const phone = _waNormalisePhone($('wa-capture-input')?.value || '');
  const showErr = (msg) => { if (!err) return; err.textContent = msg; err.style.display = 'block'; };
  if (!phone) {
    showErr('Masukkan nomor WhatsApp yang valid. Contoh: 08123456789');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    await saveProfileWaNumber(phone);
    void logUserEvent('wa_capture_saved', { ui: 'gpt' });
    closeWaCapture();
    _waCaptureContinue();
  } catch (_) {
    showErr('Gagal menyimpan. Coba lagi.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Simpan nomor'; }
  }
}

function skipWaCapture() {
  if (currentUser) _waCaptureMarkSkip(currentUser.id);
  void logUserEvent('wa_capture_later', { ui: 'gpt' });
  closeWaCapture();
  _waCaptureContinue();
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
  // Feedback-for-bonus is the only relief offered here now; the prize wheel was
  // removed when the Beta lifted the cap it existed to soften.
  const fbBtn = document.getElementById('gpt-limit-feedback');
  if (fbBtn) fbBtn.style.display = _gptUsage.canClaimFeedback === false ? 'none' : '';
  const refHost = document.getElementById('gpt-limit-referral');
  if (refHost && window.GptReferral && _supabase) {
    refHost.style.display = '';
    window.GptReferral.mount(refHost, { supabase: _supabase });
  }
  document.getElementById('gpt-limit-modal')?.classList.add('open');
}

function gptLimitClose() { document.getElementById('gpt-limit-modal')?.classList.remove('open'); }

function gptOpenFeedbackForBonus() {
  _fbBonusPending = true;
  gptLimitClose();
  gptOpenFeedbackModal();
}

function gptOpenFeedbackModal() {
  const msg = document.getElementById('gpt-fb-message');
  if (msg) msg.value = '';
  const st = document.getElementById('gpt-fb-status');
  if (st) { st.textContent = ''; st.style.color = ''; }
  const btn = document.getElementById('gpt-fb-submit');
  if (btn) { btn.disabled = false; btn.textContent = 'Kirim ke Steven'; }
  document.getElementById('gpt-feedback-modal')?.classList.add('open');
}

function gptOpenFeedback() {
  _fbBonusPending = false;
  gptOpenFeedbackModal();
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
      // MUST be one of the feedback_type_check values:
      //   bug | feature | other | wrong_data | not_working | request_edit
      // This said 'product', which is not in that list, so EVERY Site B
      // feedback submission was rejected with 23514 and the user was shown
      // "Gagal mengirim". The arm is already identified by page:'gpt', so this
      // does not need its own type.
      type:       'other',
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
  } catch (err) {
    // Log the cause. `catch (_)` here is why a hard 23514 constraint violation
    // sat in production silently rejecting every message — the user saw a
    // generic retry prompt and we saw nothing at all.
    console.error('feedback submit failed:', err?.code || '', err?.message || err);
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
    // Beta is checked before merdeka: while it is on it is the reason almost
    // every account sees ∞, and it is the one the seller can act on.
    if (_gptUsage.beta || betaUnlimitedNow()) {
      title = 'Pencarian tanpa batas selama Beta';
      popTitle = title;
      popSub = 'Selama masa Beta jatah harian tidak dibatasi. LarisID gratis selamanya, tanpa paket berbayar.';
    } else if (_gptUsage.merdeka || merdekaUnlimitedNow()) {
      title = 'Deep Dive Search tanpa batas sampai 17 Agustus 23.59 WIB';
      popTitle = title;
      popSub = 'Jatah 10 per hari dilonggarkan untuk HUT RI ke-81. Tanya AI tidak pernah dibatasi.';
    } else {
      title = 'Akses tanpa batas';
      popTitle = title;
      popSub = 'Akun admin/leader tidak dibatasi jatah harian.';
    }
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

  if (!_usageTicker && !betaUnlimitedNow()) {
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
    pop.style.visibility = '';
  });
  if (!pill || !open) return;
  const wrap = pill.closest('[data-usage-wrap]') || pill.parentElement;
  const pop = wrap?.querySelector?.('[data-usage-pop]');
  if (!pop) return;
  const r = pill.getBoundingClientRect();
  const margin = 16;
  const gap = 10;
  const width = Math.min(240, window.innerWidth - margin * 2);
  let left = Math.round(r.right - width);
  left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

  // Measure after opening (hidden) so we can flip above/below without flashing.
  pop.classList.add('is-open');
  pop.style.position = 'fixed';
  pop.style.width = `${width}px`;
  pop.style.left = `${left}px`;
  pop.style.right = 'auto';
  pop.style.top = '0';
  pop.style.bottom = 'auto';
  pop.style.visibility = 'hidden';
  pop.style.zIndex = '80';

  const popH = Math.max(pop.offsetHeight || 72, 56);
  const spaceAbove = r.top - margin;
  const spaceBelow = window.innerHeight - r.bottom - margin;
  // Header ring sits near the top — prefer below when above won't fit.
  const placeBelow = spaceAbove < popH + gap
    ? true
    : spaceBelow < popH + gap
      ? false
      : spaceBelow >= spaceAbove;

  let top;
  if (placeBelow) {
    top = Math.round(r.bottom + gap);
  } else {
    top = Math.round(r.top - gap - popH);
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - popH - margin));
  pop.style.top = `${top}px`;
  pop.style.bottom = 'auto';
  pop.style.visibility = '';
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
  if (merdekaUnlimitedNow()) {
    noteGptUsage({
      used: 0,
      limit: GPT_DAILY_LIMIT,
      reset_at: merdekaEndsAt() || resetAt,
      unlimited: true,
      merdeka: true,
    });
    return;
  }
  if (!currentUser || !_supabase) {
    const used = getAnonSearches().count || 0;
    noteGptUsage({ used, limit: GPT_DAILY_LIMIT, reset_at: resetAt, unlimited: false, merdeka: false, beta: false });
    return;
  }
  // Beta sits AFTER the anon branch on purpose — unlike merdeka above, which
  // ran first and so lifted the cap for signed-out visitors too. Signed-out
  // users keep counting down from 10 and keep hitting the sign-in wall.
  // It also has to live here rather than only in get_my_usage: this function
  // runs from five call sites and would otherwise reset unlimited to false.
  if (betaUnlimitedNow()) {
    noteGptUsage({ used: 0, limit: GPT_DAILY_LIMIT, reset_at: resetAt, unlimited: true, merdeka: false, beta: true });
    return;
  }
  if (isPlatformAdmin()) {
    noteGptUsage({ used: 0, limit: GPT_DAILY_LIMIT, reset_at: resetAt, unlimited: true, merdeka: false, beta: false });
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
      merdeka: false,
    });
  } catch (_) {
    noteGptUsage({
      used: _gptUsage.used || 0,
      limit: GPT_DAILY_LIMIT,
      reset_at: resetAt,
      unlimited: false,
      merdeka: false,
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

// One-time notice: Cari Produk switched from pasar cards to listing rows.
// Returning / existing users only — not brand-new signups, not a blocking
// onboarding gate. Dismiss once; never re-show.
const PRODUCT_ROWS_NOTICE_KEY = 'lid_product_rows_notice_v1';
let _productRowsNoticeTimer = 0;

function productRowsNoticeSeen() {
  try { return localStorage.getItem(PRODUCT_ROWS_NOTICE_KEY) === '1'; } catch (_) { return true; }
}

function markProductRowsNoticeSeen() {
  try { localStorage.setItem(PRODUCT_ROWS_NOTICE_KEY, '1'); } catch (_) {}
}

function closeProductRowsNotice(action) {
  const overlay = $('product-rows-notice');
  if (!overlay) return;
  overlay.classList.remove('open');
  overlay.hidden = true;
  markProductRowsNoticeSeen();
  void logUserEvent('product_rows_notice', { ui: 'gpt', action: action || 'dismiss' });
}

function openProductRowsNotice() {
  if (productRowsNoticeSeen() || !currentUser) return;
  if (document.querySelector('.modal-overlay.open')) return;
  const overlay = $('product-rows-notice');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.classList.add('open');
  markProductRowsNoticeSeen();
  void logUserEvent('product_rows_notice', { ui: 'gpt', action: 'shown' });
  clarityEvt('product_rows_notice', { action: 'shown' });
}

function scheduleProductRowsNotice(opts = {}) {
  if (!currentUser || productRowsNoticeSeen()) return;
  // Brand-new accounts never saw pasar cards — skip the "we changed" copy.
  if (opts.isNewSignup || _lidIsNewSignup(currentUser)) return;
  const returning = !!(opts.fromRestore)
    || state.onboarding.step === 'done'
    || finderIsComplete()
    || ((_gptJourney.loaded ? _gptJourney.deepdiveCount : 0) > 0)
    || !!state.everOpenedDeepdive;
  if (!returning) return;

  clearTimeout(_productRowsNoticeTimer);
  const tryOpen = (attempt) => {
    _productRowsNoticeTimer = setTimeout(() => {
      if (!currentUser || productRowsNoticeSeen()) return;
      if (document.querySelector('.modal-overlay.open')) {
        if (attempt < 3) tryOpen(attempt + 1);
        return;
      }
      openProductRowsNotice();
    }, attempt === 0 ? 1400 : 2200);
  };
  tryOpen(0);
}

function formatIdDate(iso) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return String(iso || '');
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

// Living-mascot rig (js/laris-mascot.js). One switch kills every hook below,
// leaving the static Garuda renders exactly as they were.
const MASCOT_ALIVE = true;

// Browser History API integration. The app never pushed history entries for
// its own view switches, so native back had nothing in-app to land on and
// fell straight through to real browser history (exiting the site or
// landing on whatever page was open before LarisID). setView() now pushes
// one entry per view change; _navigatingFromHistory suppresses a re-push
// while a popstate handler is replaying a past entry. The URL itself is
// left untouched (state-only pushState) — this is a single-page app with no
// per-view routes, so there's nothing meaningful to put in the address bar.
let _navigatingFromHistory = false;
let _historyPrimed = false;

function setView(name, opts = {}) {
  const leaving = state.view;
  state.view = name;
  ['home', 'landing', 'chat', 'deepdive', 'directory', 'harga', 'faq', 'admin', 'tracker', 'community', 'cohort'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
    document.body.classList.toggle(`view-${v}`, v === name);
  });
  if (leaving === 'deepdive' && name !== 'deepdive') {
    dwellStop();
    destroyAllCharts();
    sddvCancel();
    // A product is only "in context" while its deep dive (or its chat) is
    // open — a stale deepdiveProduct must not hijack later searches into
    // the product-AI path.
    state.deepdiveProduct = null;
  }
  // The composer has nothing to say on the tracker either — it is a
  // configuration + data surface, not a place to ask a question. The chat
  // view is Ask Laris and keeps its own docked chat bar (see the
  // .composer-dock display rule) — everywhere else now hides the bar
  // entirely rather than just clearing its chips, so this list stops
  // mattering for those views, but chips are still irrelevant on them either way.
  if (name === 'home' || name === 'landing' || name === 'directory' || name === 'harga' || name === 'admin' || name === 'tracker' || name === 'community' || name === 'cohort') setComposerChips(null);
  ['btn-ask-laris', 'btn-produk', 'btn-harga', 'btn-faq', 'btn-tentang', 'btn-admin', 'btn-tracker', 'btn-community', 'btn-cohort'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('active',
      (id === 'btn-ask-laris' && (name === 'home' || name === 'chat')) ||
      (id === 'btn-produk' && name === 'directory') ||
      (id === 'btn-harga' && name === 'harga') ||
      (id === 'btn-faq' && name === 'faq') ||
      // Tentang shares the marketing landing with the logo.
      (id === 'btn-tentang' && name === 'landing') ||
      (id === 'btn-admin' && name === 'admin') ||
      (id === 'btn-tracker' && name === 'tracker') ||
      (id === 'btn-community' && name === 'community') ||
      (id === 'btn-cohort' && name === 'cohort'));
  });
  if (leaving === 'tracker' && name !== 'tracker' && window.LarisTracker) {
    try { window.LarisTracker.close(); } catch (_) {}
  }
  try { renderResultsBar(); } catch (_) {}
  closeSidebar();
  updateSideRailVisibility();
  updateProductPin();
  // Views are display:none until active, so a mascot rig cannot measure
  // itself until its view is shown. init() is idempotent; refresh() re-places
  // rigs that were built while their view was hidden.
  if (MASCOT_ALIVE && window.LarisMascot) {
    try { window.LarisMascot.init(); window.LarisMascot.refresh(); } catch (_) {}
  }
  // Fresh surface — always start at the top so populated content scrolls down.
  if (name !== leaving) {
    scrollPanelToTop();
    void logUserEvent('view_open', { ui: 'gpt', view: name });
  }
  if ((name !== leaving || !_historyPrimed || opts.forceHistory) && !_navigatingFromHistory) {
    const histState = { view: name, ...(opts.hist || {}) };
    // Deep dive needs the product back, not just the view name — carry enough
    // to look it up again via findProduct() on the way back in.
    if (name === 'deepdive' && state.deepdiveProduct && !histState.compare && histState.item_id == null) {
      histState.item_id = state.deepdiveProduct.item_id;
      histState.shop_id = state.deepdiveProduct.shop_id;
    }
    try {
      // The FIRST view boot() settles on replaces the entry rather than
      // stacking on top of it, so back from the entry screen exits the site
      // like it always did. Seeding a baseline before boot picked a view
      // instead left a phantom entry for state.view's 'chat' default, and
      // back from the landing dropped into an empty chat thread.
      if (_historyPrimed) history.pushState(histState, '', location.href);
      else history.replaceState(histState, '', location.href);
      _historyPrimed = true;
    } catch (_) {}
  }
}

const HISTORY_VIEWS = ['home', 'landing', 'chat', 'deepdive', 'directory', 'harga', 'faq', 'admin', 'tracker', 'community', 'cohort'];
// Old sessions may still have { view: 'tentang' } in history — map to landing.
const HISTORY_VIEW_ALIASES = { tentang: 'landing' };

window.addEventListener('popstate', (e) => {
  const st = e.state;
  if (!st) return;
  const view = HISTORY_VIEW_ALIASES[st.view] || st.view;
  if (!HISTORY_VIEWS.includes(view)) return;
  _navigatingFromHistory = true;
  try {
    if (st.compare) {
      const chat = state.chats.find(c => (c.id || c.localId) === st.chatId) || activeChat();
      if (chat) state.activeChatId = chat.id || chat.localId;
      const products = resolveCompareProducts(chat);
      if (products.length >= 2) void openProductCompare(products, { resume: true });
      else setView('directory');
    } else if (view === 'deepdive' && st.item_id != null) {
      if (st.fromCompare) state.compareReturnChatId = st.fromCompare;
      const found = findProduct(st.item_id, st.shop_id);
      if (found) void openDeepDive(found, st.fromCompare ? { fromCompare: true } : {});
      else setView('directory');
    } else if (view === 'landing') {
      renderLanding();
    } else {
      setView(view);
      if (view === 'home') updateHomeFinderVisibility();
      if (view === 'chat' && state.activeChatId && activeChat()) renderChatThread();
    }
  } finally {
    setTimeout(() => { _navigatingFromHistory = false; }, 0);
  }
});

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

/** The account's REAL platform role. Never masked — use this for the student-mode
 *  toggle itself, and for anything that must not be spoofed. */
function isPlatformAdminRaw() {
  const email = String(currentUser?.email || '').toLowerCase();
  return !!(currentUser && (_accessState.isAdmin || PLATFORM_ADMIN_EMAILS.includes(email)));
}

/** The role the UI renders. Student mode masks it, and that single lever is what
 *  turns the WHOLE screen into a student's: every admin gate in this file reads
 *  through here, so the admin nav, the unlimited quota and the "(Admin)" suffix
 *  all close at once instead of being hidden one by one. Server-side RLS is
 *  untouched — this is a view of the product, not a downgrade of the account. */
function isPlatformAdmin() {
  return !_viewAs && isPlatformAdminRaw();
}

/** True while an admin is looking at the product as somebody else. Analytics stay
 *  out of the funnel in BOTH modes: this account is already ~34% of all deep-dive
 *  events, and a browse-as-student session is inspection, not usage. */
function adminIsPreviewing() {
  return !!(_admSample || _viewAs);
}

// ── "Cari Supplier" validation probe — LAUNCH GATE (arm B) ────────────────────
// !! FLIP THIS TOGETHER WITH THE SAME CONST IN js/laris-app.js (arm A) !!
// Launching one arm but not the other silently breaks the probe: it halves the
// denominator for the click-through bar AND puts a feature in one A/B arm that
// the other lacks, confounding the arm comparison. Both files carry their own
// const on purpose — they ship with ?v= cache-busters, whereas the shared
// perf-loader.js does not, so a flag there could be served stale at launch.
// Success criteria + kill bar: see the matching block in js/laris-app.js.
const SUPPLIER_PROBE_PUBLIC = true;
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
  syncViewAsUi();
  // Signing in mid-session lands here rather than in boot, so the cohort home
  // is offered on that path too. Both are no-ops once _bootLandingView is spent.
  try { void refreshCohortNav().then(routeCohortHome, () => {}); } catch (_) {}
  const un = $('user-name');
  if (un && un.textContent) {
    setHeaderName(un.textContent.replace(/\s*\(Admin\)\s*$/, ''));
  }
}

let _accountHeadshotUrl = null;

function accountLabel(shortName) {
  const short = String(shortName || 'Akun').split(' ')[0] || 'Akun';
  return isPlatformAdmin() ? `${short} (Admin)` : short;
}

function setHeaderName(shortName) {
  const un = $('user-name');
  if (un) un.textContent = accountLabel(shortName);
}

function setHeaderAvatar(shortName) {
  const av = $('user-av');
  if (!av) return;
  const letter = (shortName || '?').charAt(0).toUpperCase();
  if (_accountHeadshotUrl) {
    av.innerHTML = `<img src="${esc(_accountHeadshotUrl)}" alt="">`;
    av.setAttribute('aria-hidden', 'true');
  } else {
    av.textContent = letter;
    av.removeAttribute('aria-hidden');
  }
}

async function refreshAccountHeadshot() {
  if (!currentUser || !_supabase) {
    _accountHeadshotUrl = null;
    return;
  }
  try {
    const { data, error } = await _supabase
      .from('user_profiles')
      .select('headshot_url, first_name, display_name')
      .eq('user_id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    _accountHeadshotUrl = data?.headshot_url || null;
    const name = data?.display_name || data?.first_name ||
      currentUser.user_metadata?.full_name || currentUser.email || 'Akun';
    const short = String(name).split(' ')[0] || 'Akun';
    setHeaderName(short);
    setHeaderAvatar(short);
  } catch (_) {
    // Keep letter fallback; profile photo is nice-to-have.
  }
}

function syncHargaVisitCta() {
  const cta = $('harga-daftar-cta');
  if (!cta) return;
  cta.hidden = !!currentUser;
}

function updateAccountUI() {
  syncViewAsUi();
  const authH = $('auth-header');
  const userH = $('user-header');
  if (currentUser) {
    if (authH) authH.hidden = true;
    if (userH) userH.hidden = false;
    const name = currentUser.user_metadata?.full_name || currentUser.email || 'Akun';
    const short = name.split(' ')[0] || 'Akun';
    setHeaderName(short);
    setHeaderAvatar(short);
    void refreshAccountHeadshot();
  } else {
    _accountHeadshotUrl = null;
    if (authH) authH.hidden = false;
    if (userH) userH.hidden = true;
  }
  const btn = $('btn-admin');
  if (btn) btn.style.display = isPlatformAdmin() ? '' : 'none';
  syncHargaVisitCta();
  try { void refreshCohortNav(); } catch (_) {}
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

function stashPendingDeepdive(product) {
  if (!product) return;
  const item_id = product.item_id ?? null;
  const shop_id = product.shop_id ?? null;
  if (item_id == null && shop_id == null) {
    state.pendingDeepdive = product;
  } else {
    state.pendingDeepdive = { item_id, shop_id };
  }
  saveLocalState();
}

async function hydratePendingDeepdive(pending) {
  if (!pending) return null;
  const item_id = pending.item_id;
  const shop_id = pending.shop_id;
  if (item_id != null && shop_id != null) {
    const resolved = await resolveProduct(item_id, shop_id);
    if (resolved) return resolved;
  }
  if (pending.product_name || pending.keyword) return asListingProduct(pending);
  return pending;
}

// ── Auth modal ───────────────────────────────────────────────────────────
function openAuthModal(mode, source) {
  _authMode = mode || 'signup';
  _gateSource = source || '';
  try {
    if (!currentUser && !state.pendingDeepdive && state.deepdiveProduct) {
      stashPendingDeepdive(state.deepdiveProduct);
    }
  } catch (_) {}
  // Carry landing answers across signup only when the user actually changed
  // them — defaults would otherwise resume Ask Laris instead of a deep dive.
  try {
    if (!currentUser && finderHasCustomAnswers()) {
      state.pendingFinder = { ...(_finder || {}) };
      saveLocalState();
    }
  } catch (_) {}
  try { sessionStorage.setItem(_LID_SIGNUP_CTA_KEY, source || 'gpt'); } catch (_) {}
  // These two used to fire together here, which made "cta_signup_click" mean
  // "the wall appeared" — the 16-23 Aug readout mis-read it as a click and
  // reported a CTA conversion rate that was really gate-shown -> signup.
  // gpt_gate_shown = the modal appeared, for any reason.
  // cta_signup_click = a person actually clicked a signup CTA, which is only
  // true when the modal was NOT opened by a gpt_gate_* wall.
  // NOTE: Clarity's "Signup funnel (CTA to signup)" is built on
  // cta_signup_click, so its numbers change meaning from this deploy on — the
  // series before and after this line are not comparable.
  const _gateIsWall = /^gpt_gate_/.test(_gateSource || '');
  clarityEvt('gpt_gate_shown', { source: _gateSource });
  void logUserEvent('gpt_gate_shown', { ui: 'gpt', source: _gateSource || '(none)', wall: _gateIsWall });
  if (!_gateIsWall) {
    clarityEvt('cta_signup_click', { source: _gateSource });
    void logUserEvent('cta_signup_click', { ui: 'gpt', source: _gateSource || '(none)' });
  }
  _authEmailOpen = false;
  _waResetSteps();
  renderAuthModal();
  $('auth-overlay')?.classList.add('open');
}
function closeAuthModal() {
  $('auth-overlay')?.classList.remove('open');
}
// Signup puts WhatsApp first and collapses email behind a link. Google stays
// visible as a secondary path. Login keeps email open so existing email
// accounts are not stranded. Reset is email-only, so the WhatsApp panel hides.
let _authEmailOpen = false;
function _applyAuthEmailCollapse(signup) {
  const reset = _authMode === 'reset';
  const block = $('auth-email-block');
  const toggle = $('auth-email-toggle');
  const sep = $('auth-sep');
  const sepWa = $('auth-sep-wa');
  const waPanel = $('auth-wa-panel');
  const collapsible = signup && !_authEmailOpen;
  if (block) block.style.display = collapsible ? 'none' : '';
  if (toggle) {
    toggle.style.display = signup && !_authEmailOpen ? '' : 'none';
    toggle.textContent = 'Pakai email saja';
  }
  if (waPanel) waPanel.style.display = reset ? 'none' : '';
  if (sepWa) sepWa.style.display = reset ? 'none' : '';
  if (sep) sep.style.display = reset ? 'none' : '';
}

function renderAuthModal() {
  const signup = _authMode === 'signup';
  const reset = _authMode === 'reset';
  const title = $('auth-title');
  const sub = $('auth-subtitle');
  const nameWrap = $('auth-name-wrap');
  const passWrap = $('auth-pass-wrap');
  const forgotWrap = $('auth-forgot-wrap');
  const googleBtn = $('auth-google-btn');
  const btn = $('auth-submit-btn');
  const toggle = $('auth-toggle-text');
  $('auth-overlay')?.classList.toggle('auth-is-signup', signup);
  $('auth-overlay')?.classList.toggle('auth-is-login', !signup && !reset);
  if (title) title.textContent = reset ? 'Reset Password' : signup ? 'Buat Akun Gratis' : 'Masuk ke LarisID';
  const mascot = $('auth-mascot');
  if (mascot) {
    mascot.style.display = signup ? 'block' : 'none';
    // Costs nothing until someone actually opens the signup modal.
    if (signup && !mascot.src && mascot.dataset.src) mascot.src = mascot.dataset.src;
  }
  if (sub) {
    const map = {
      gpt_gate_deepdive: 'Kamu sudah lihat 1 analisa gratis. Daftar gratis untuk buka analisa produk lain sepuasnya.',
      gpt_gate_ai: 'Login untuk tanya AI tentang produk (butuh sesi aman).',
      gpt_gate_directory: 'Login untuk lihat lebih banyak produk & filter kategori.',
      gpt_gate_history: 'Login untuk cari & simpan riwayat chat.',
      gpt_gate_track: 'Daftar gratis, lalu kami kabari kalau produk ini berubah.',
    };
    sub.textContent = reset
      ? 'Masukkan email kamu. Kami kirim link untuk mengatur password baru.'
      : map[_gateSource] || (signup ? 'Gratis. Selamanya. Paling gampang daftar pakai WhatsApp.' : 'Login untuk lanjut riset produk.');
  }
  if (nameWrap) nameWrap.style.display = signup ? '' : 'none';
  // Reset only needs the email field — no password, no Google button.
  if (passWrap) passWrap.style.display = reset ? 'none' : '';
  if (googleBtn) googleBtn.style.display = reset ? 'none' : '';
  if (forgotWrap) forgotWrap.style.display = _authMode === 'login' ? '' : 'none';
  if (btn) btn.textContent = reset ? 'Kirim Link Reset' : signup ? 'Daftar dengan Email' : 'Masuk';
  if (toggle) toggle.innerHTML = reset
    ? 'Ingat passwordmu? <a id="auth-toggle-link">Masuk</a>'
    : signup
      ? 'Sudah punya akun? <a id="auth-toggle-link">Masuk</a>'
      : 'Belum punya akun? <a id="auth-toggle-link">Daftar</a>';
  $('auth-toggle-link')?.addEventListener('click', () => {
    _authMode = signup ? 'login' : 'signup';
    renderAuthModal();
  });
  $('auth-forgot-link')?.addEventListener('click', () => {
    _authMode = 'reset';
    renderAuthModal();
  });
  _applyAuthEmailCollapse(signup);
  $('auth-email-toggle')?.addEventListener('click', () => {
    _authEmailOpen = true;
    void logUserEvent('auth_email_expand', { ui: 'gpt', source: _gateSource || '(none)' });
    _applyAuthEmailCollapse(signup);
    $('auth-email')?.focus();
  }, { once: true });
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
  if (map[msg]) return map[msg];
  const raw = String(msg || '');
  if (/InvalidWorker|entrypoint|worker boot/i.test(raw)) return 'Daftar gagal. Coba lagi.';
  return raw;
}

async function submitAuth() {
  const errEl = $('auth-error');
  const btn = $('auth-submit-btn');
  const email = $('auth-email')?.value.trim();
  const pass = $('auth-pass')?.value;
  const name = $('auth-name')?.value.trim();
  const hdrs = { apikey: SUPA_KEY, 'Content-Type': 'application/json' };
  const showErr = msg => { if (errEl) { errEl.style.color = '#c0392b'; errEl.textContent = _authErrMsg(msg); errEl.style.display = ''; } };
  const showOk = msg => { if (errEl) { errEl.style.color = '#1a7f45'; errEl.textContent = msg; errEl.style.display = ''; } };

  // Reset asks for the email only — GoTrue mails a #type=recovery link back to
  // the site root, which handleRecoveryHash() picks up on the next load.
  if (_authMode === 'reset') {
    if (!email) { showErr('Masukkan email kamu.'); return; }
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = '...';
    try {
      await fetch(`${SUPA_URL}/auth/v1/recover`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ email, redirect_to: _authRedirectTo() }),
      });
      // Always report success — revealing which emails exist would leak accounts.
      showOk('Link reset sudah dikirim! Cek email kamu.');
    } catch (_) {
      showErr('Gagal terhubung ke server. Coba lagi.');
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
    return;
  }

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

// Where GoTrue should send the user back to (OAuth return and recovery links).
// Derived from the directory this page is served from, so the same code is
// correct at /gpt/ (during the A/B) and at / (after the cutover), on prod and
// on localhost alike. Both paths are in the GoTrue redirect allowlist.
function _authRedirectTo() {
  const dir = location.pathname.replace(/[^/]*$/, '');
  return location.origin + (dir || '/');
}

async function signInWithProvider(provider) {
  if (!_supabase) return;
  try {
    if (_authMode === 'signup') sessionStorage.setItem(_LID_OAUTH_SIGNUP_INTENT_KEY, '1');
  } catch (_) {}
  const redirectTo = _authRedirectTo();
  const { error } = await _supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  if (error) {
    const errEl = $('auth-error');
    if (errEl) { errEl.textContent = 'Login dengan Google gagal. Coba lagi.'; errEl.style.display = ''; }
  }
}

// ── WhatsApp OTP (same send/verify functions as laris-app.js) ────────────
let _waPhone = '';
let _waResendTimer = null;

function _waClearResendTimer() {
  if (_waResendTimer) {
    clearInterval(_waResendTimer);
    _waResendTimer = null;
  }
}

function _waResetSteps() {
  _waClearResendTimer();
  const phoneStep = $('wa-step-phone');
  const otpStep = $('wa-step-otp');
  if (phoneStep) phoneStep.style.display = '';
  if (otpStep) otpStep.style.display = 'none';
  const we = $('wa-error');
  if (we) { we.textContent = ''; we.style.display = 'none'; }
  const oe = $('wa-otp-error');
  if (oe) { oe.textContent = ''; oe.style.display = 'none'; }
  const otp = $('wa-otp-input');
  if (otp) otp.value = '';
  const link = $('wa-resend-link');
  if (link) {
    link.classList.remove('is-wait');
    link.textContent = 'Kirim ulang kode';
  }
}

function _waErrText(res, data, fallback) {
  if (res && res.status === 429) {
    return (data && (data.error || data.message)) || 'Terlalu banyak permintaan. Coba lagi sebentar.';
  }
  return (data && (data.error || data.message)) || fallback;
}

async function sendWhatsappOtp(isResend) {
  const phoneEl = $('wa-phone-input');
  const errEl = $('wa-error');
  const otpErr = $('wa-otp-error');
  const btn = $('wa-send-btn');
  const rawPhone = (phoneEl?.value || '').trim() || _waPhone;
  const showErr = (el, msg) => { if (!el) return; el.textContent = msg; el.style.display = 'block'; };
  if (!rawPhone) {
    showErr(errEl, 'Masukkan nomor WhatsApp kamu.');
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (otpErr) otpErr.style.display = 'none';
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/send-whatsapp-otp`, {
      method: 'POST',
      headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: rawPhone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showErr(isResend && otpErr ? otpErr : errEl, _waErrText(res, data, 'Gagal mengirim OTP. Coba lagi.'));
      return;
    }
    _waPhone = data.phone || rawPhone;
    const phoneStep = $('wa-step-phone');
    const otpStep = $('wa-step-otp');
    if (phoneStep) phoneStep.style.display = 'none';
    if (otpStep) otpStep.style.display = '';
    const hint = $('wa-otp-hint');
    if (hint) hint.textContent = 'Kode OTP sudah dikirim ke WhatsApp ' + _waPhone + '. Masukkan 6 digit di bawah.';
    if (otpErr) { otpErr.textContent = ''; otpErr.style.display = 'none'; }
    setTimeout(() => $('wa-otp-input')?.focus(), 80);
    _waStartResendCooldown();
    void logUserEvent('auth_wa_otp_sent', { ui: 'gpt', resend: !!isResend, source: _gateSource || '(none)' });
  } catch (_) {
    showErr(isResend && otpErr ? otpErr : errEl, 'Gagal terhubung ke server. Coba lagi.');
  } finally {
    if (btn) { btn.textContent = 'Kirim kode WhatsApp'; btn.disabled = false; }
  }
}

function _waStartResendCooldown() {
  const link = $('wa-resend-link');
  if (!link) return;
  _waClearResendTimer();
  let secs = 60;
  link.classList.add('is-wait');
  link.textContent = 'Kirim ulang (' + secs + 's)';
  _waResendTimer = setInterval(() => {
    secs -= 1;
    if (secs <= 0) {
      _waClearResendTimer();
      link.classList.remove('is-wait');
      link.textContent = 'Kirim ulang kode';
    } else {
      link.textContent = 'Kirim ulang (' + secs + 's)';
    }
  }, 1000);
}

async function verifyWhatsappOtp() {
  const otpEl = $('wa-otp-input');
  const errEl = $('wa-otp-error');
  const btn = $('wa-verify-btn');
  const otp = (otpEl?.value || '').replace(/\s/g, '');
  if (!otp || !/^\d{6}$/.test(otp)) {
    if (errEl) { errEl.textContent = 'Masukkan 6 digit kode OTP.'; errEl.style.display = ''; }
    return;
  }
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.textContent = '...'; btn.disabled = true; }
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/verify-whatsapp-otp`, {
      method: 'POST',
      headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: _waPhone, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      if (errEl) { errEl.textContent = _waErrText(res, data, 'Verifikasi gagal. Periksa kode OTP kamu.'); errEl.style.display = ''; }
      return;
    }
    const session = data.session;
    if (!session || !session.access_token) {
      if (errEl) { errEl.textContent = 'Gagal membuat sesi. Coba lagi.'; errEl.style.display = ''; }
      return;
    }
    if (data.is_new_user) _lidFireSignupSuccess();
    _authSave(session);
    closeAuthModal();
    await _authOnSignIn(session);
  } catch (_) {
    if (errEl) { errEl.textContent = 'Gagal terhubung ke server. Coba lagi.'; errEl.style.display = ''; }
  } finally {
    if (btn) { btn.textContent = 'Verifikasi'; btn.disabled = false; }
  }
}

// Holds the recovery session (tokens) parsed from the email link until the
// user sets a new password.
let _recoverySession = null;

// On load: detect a Supabase recovery link (#access_token=...&type=recovery)
// and show the set-new-password screen. Returns true if a recovery flow started.
// The head scrubber already moved the hash into window.__larisAuthHash, and it
// deliberately does not set __larisOAuthReturning for recovery links.
function handleRecoveryHash() {
  const hash = window.__larisAuthHash || '';
  if (!hash || hash.indexOf('access_token') === -1) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  // Not a recovery link — leave the stash for consumeOAuthHash().
  if (params.get('type') !== 'recovery' || !accessToken) return false;
  _recoverySession = {
    access_token: accessToken,
    refresh_token: params.get('refresh_token') || '',
    expires_in: parseInt(params.get('expires_in') || '3600', 10),
  };
  window.__larisAuthHash = '';
  $('recovery-overlay')?.classList.add('open');
  setTimeout(() => { $('recovery-pass')?.focus(); }, 50);
  return true;
}

async function submitRecoveryPassword() {
  const errEl = $('recovery-error');
  const btn = $('recovery-submit-btn');
  const p1 = $('recovery-pass')?.value || '';
  const p2 = $('recovery-pass2')?.value || '';
  const showErr = msg => { if (errEl) { errEl.style.color = '#c0392b'; errEl.textContent = msg; errEl.style.display = ''; } };
  const showOk = msg => { if (errEl) { errEl.style.color = '#1a7f45'; errEl.textContent = msg; errEl.style.display = ''; } };

  if (!_recoverySession?.access_token) { showErr('Link reset sudah tidak berlaku. Minta link baru lewat "Lupa password?".'); return; }
  if (!p1 || !p2) { showErr('Isi password baru dua kali.'); return; }
  if (p1.length < 8) { showErr('Password minimal 8 karakter.'); return; }
  if (p1 !== p2) { showErr('Password nggak sama. Cek lagi ya.'); return; }

  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${_recoverySession.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p1 }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const raw = d.msg || d.message || d.error_description || d.error || '';
      if (/expired|invalid|jwt|token/i.test(raw)) throw new Error('Link reset sudah kedaluwarsa. Minta link baru lewat "Lupa password?".');
      throw new Error(_authErrMsg(raw) || 'Gagal mengganti password. Coba lagi.');
    }
    // Recovery succeeded — the token is a valid session, so sign the user in.
    const sess = _recoverySession;
    _recoverySession = null;
    _authSave(sess);
    showOk('Password berhasil diganti! Mengalihkan...');
    setTimeout(() => {
      $('recovery-overlay')?.classList.remove('open');
      void _authOnSignIn(_authLoad()).catch(() => {});
    }, 900);
  } catch (e) {
    showErr(e.message || 'Gagal mengganti password. Coba lagi.');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig || 'Simpan Password Baru'; }
  }
}

async function consumeOAuthHash() {
  const hash = window.__larisAuthHash || '';
  if (!hash || hash.indexOf('access_token') === -1) { window.__larisAuthHash = ''; _clearOAuthReturning(); return false; }
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  window.__larisAuthHash = '';
  // Recovery links are consumed by handleRecoveryHash() before this runs.
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

async function _authOnSignIn(session, opts) {
  currentUser = session.user || _decodeJwtUser(session.access_token);
  if (!currentUser) { _clearSessionRestoring(); return; }
  if (!(opts && opts.fromRestore)) {
    try { window.LarisMerdeka && window.LarisMerdeka.showPromo(true); } catch (_) {}
  }
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
      // Post-merge signups carry no arm — see boot(). Only an experiment-era
      // sticky sets one.
      try {
        const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
        if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) {
          attr.ab_variant = ab.v;
          if (ab.via) attr.ab_via = ab.via;
        }
      } catch (_) {}
      if (!attr.landing) attr.landing = '/';
      // Credit the referrer if this signup came in via ?ref=. Only meaningful
      // for a genuinely new signup (mirrors why this sits inside isNewSignup,
      // not on every sign-in) — best-effort, GptReferral.redeemPending never
      // rejects, so this never blocks the rest of the sign-in flow.
      if (window.GptReferral && attr.ref_code) {
        void window.GptReferral.redeemPending(_supabase, attr.ref_code);
      }
      try { localStorage.setItem('_lid_attr_v1', JSON.stringify(attr)); } catch (_) {}
      const src = attr.utm_source || (attr.ref_code && 'referral') || attr.referrer || '(direct)';
      _clarity('set', 'signup_source', String(src).slice(0, 120));
      if (attr.ab_variant) _clarity('set', 'ab_variant_at_signup', String(attr.ab_variant));
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
  resetGptJourney();
  void gptJourneyLoad();
  await loadCurrentAccess();
  void _winbackMaybeClaim();
  void refreshGptUsage();
  await persistOnboardingPrefs();
  await migrateLocalChatsToDb();
  saveLocalState();

  renderSidebarLocCard();

  // Continue where the login gate interrupted: open the product they clicked.
  const hadPending = !!(state.pendingDeepdive || state.pendingCompare || state.pendingTracker);
  if (state.pendingCompare) {
    const pending = state.pendingCompare;
    state.pendingCompare = null;
    state.pendingDeepdive = null;
    saveLocalState();
    const products = Array.isArray(pending.products)
      ? pending.products
      : [pending.a, pending.b].filter(Boolean);
    if (products.length >= 2) await openProductCompare(products, { resume: true, chatId: pending.chatId || null });
  } else if (state.pendingDeepdive) {
    const pending = state.pendingDeepdive;
    state.pendingDeepdive = null;
    saveLocalState();
    const p = await hydratePendingDeepdive(pending);
    if (p) await openDeepDive(p);
  } else if (state.pendingTracker) {
    const pt = state.pendingTracker;
    state.pendingTracker = null;
    saveLocalState();
    void openTrackerView(null, pt);
  }

  // A one-tap "Kabari Kalau Berubah" that hit the signup gate finishes itself
  // here, so the tap survives the Google round-trip 19 of 21 signups take.
  if (state.pendingTrackKeyword) {
    const ptk = state.pendingTrackKeyword;
    state.pendingTrackKeyword = null;
    saveLocalState();
    void quickTrackKeyword({ keyword: ptk.keyword, category: ptk.category });
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
  // Google users without a WhatsApp number get #wa-capture first (also
  // skippable). That is not onboarding and must not run on session restore.
  const needsOnboarding = !hadPending && !resumedFinder && state.onboarding.step !== 'done' && !finderIsComplete();
  if (needsOnboarding) {
    state.onboarding.promptedPostSignin = true;
    saveLocalState();
  }
  if (!hadPending && !resumedFinder && !(opts && opts.fromRestore)) {
    void maybeOfferWaCapture({ thenOnboarding: needsOnboarding });
  } else if (needsOnboarding) {
    offerOnboardingAfterSignin();
  }

  // Returning users: one-time "pasar → produk" notice (skippable, not onboarding).
  scheduleProductRowsNotice({
    fromRestore: !!(opts && opts.fromRestore),
    isNewSignup,
  });
}

/** Re-run the landing finder search the user set up before signing in. */
async function resumeFinderAfterSignin(pf) {
  try {
    if (pf.city) _finder.city = pf.city;
    if (Array.isArray(pf.categories) && pf.categories.length) _finder.categories = pf.categories.slice();
    else if (pf.category) _finder.categories = [pf.category];
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
      await _authOnSignIn(stored, { fromRestore: true }).catch(() => { _authClear(); _clearSessionRestoring(); });
    } else if (stored.refresh_token) {
      const s = await _authRefresh(stored.refresh_token);
      if (!s) { _authClear(); _clearSessionRestoring(); }
      else { _authSave(s); await _authOnSignIn(s, { fromRestore: true }).catch(() => { _authClear(); _clearSessionRestoring(); }); }
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
  // Seed can_claim_feedback once the session has actually landed.
  void gptSeedUsageFlags();
  // funnelNoteActiveDay() is NOT called here: at boot the session is still
  // restoring, so currentUser is null and the event was silently dropped.
  // It now runs from _authOnSignIn, mirroring arm A.
}

async function signOut() {
  try { if (_supabase) await _supabase.auth.signOut(); } catch (_) {}
  try { window.LarisMerdeka && window.LarisMerdeka.resetPromo(); } catch (_) {}
  _authClear();
  currentUser = null;
  resetGptJourney();
  updateAccountUI();
  showToast('Kamu sudah keluar.');
}

// ── Persist onboarding ───────────────────────────────────────────────────
async function persistOnboardingPrefs() {
  if (!currentUser || !_supabase || adminIsPreviewing()) return;
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

function resetChatThread() {
  const thread = $('chat-thread');
  if (thread) thread.innerHTML = '';
}

function beginFreshChat() {
  state.activeChatId = null;
  state.deepdiveProduct = null;
  resetChatThread();
  saveLocalState();
  renderChatList();
}

/** New local thread. Always wipes #chat-thread so leftover finder /
 *  recommendation cards cannot sit above the first turn. */
function startBlankLocalChat(title, context = {}) {
  resetChatThread();
  const chat = {
    localId: 'local_' + Date.now(),
    title: String(title || 'Chat').slice(0, 40),
    context,
    messages: [],
    created_at: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChatId = chat.localId;
  saveLocalState();
  renderChatList();
  return chat;
}

function ensureComposerChat(title) {
  return activeChat() || startBlankLocalChat(title);
}

function chatIsResultsThread(chat) {
  const kind = chat?.context?.kind;
  return kind === 'recommendation' || kind === 'finder'
    || kind === 'search' || kind === 'category_search';
}

function chatIsCompare(chat) {
  return chat?.context?.kind === 'compare';
}

function compareTitle(products) {
  const names = (products || []).map(p => (p.product_name || p.keyword || 'Produk').slice(0, 22));
  return `Bandingkan: ${names.join(' vs ')}`.slice(0, 60);
}

function resolveCompareProducts(chat) {
  const raw = chat?.context?.compareProducts;
  if (!Array.isArray(raw)) return [];
  return raw.map(p => asListingProduct(p)).filter(p => p?.item_id != null).slice(0, 3);
}

function compareChatKey(chat) {
  return chat ? (chat.id || chat.localId) : null;
}

async function persistCompareChat(chat) {
  saveLocalState();
  renderChatList();
  if (!currentUser || !chat?.id || !_supabase) return;
  try {
    await _supabase.from('gpt_chats').update({
      title: chat.title,
      context: {
        kind: 'compare',
        compareProducts: (chat.context?.compareProducts || []).map(productSnapshot).filter(Boolean),
      },
    }).eq('id', chat.id);
  } catch (_) {}
}

async function ensureCompareChat(products, opts = {}) {
  const snaps = products.map(productSnapshot).filter(Boolean);
  const title = compareTitle(products);
  const ctx = { kind: 'compare', compareProducts: snaps };
  rememberProducts(products);

  let chat = null;
  if (opts.chatId) {
    chat = state.chats.find(c => (c.id || c.localId) === opts.chatId) || null;
  }
  if (!chat && chatIsCompare(activeChat())) chat = activeChat();

  if (chat) {
    chat.context = { ...(chat.context || {}), ...ctx };
    chat.title = title;
    state.activeChatId = compareChatKey(chat);
    await persistCompareChat(chat);
    return chat;
  }

  if (currentUser && _supabase) {
    try {
      const { data } = await _supabase.rpc('gpt_new_chat', { p_title: title, p_context: ctx });
      if (data) noteGptUsage(data);
      if (data?.chat) {
        chat = {
          id: data.chat.id,
          title,
          context: { ...(data.chat.context || {}), ...ctx },
          messages: [],
          created_at: Date.now(),
        };
        state.chats.unshift(chat);
        state.activeChatId = chat.id;
        saveLocalState();
        renderChatList();
        return chat;
      }
    } catch (_) {}
  }
  return startBlankLocalChat(title, ctx);
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
    return /card-grid|prod-card|lrow|ans-panel|trending-card|ans-table|deepdive-card|gpt-kalc|agent-run/.test(htmlOrEl);
  }
  return !!htmlOrEl.querySelector?.(
    '.card-grid, .prod-card, .lrow, .lrow-wrap, .ans-panel, .trending-card, .ans-table-wrap, .gpt-kalc, .agent-run'
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
  if (MASCOT_ALIVE) { try { window.LarisMascot?.thinking(); } catch (_) {} }
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
  if (gen === _streamGen) {
    bubble.classList.remove('is-streaming');
    // Only the run that is still current gets the nod — a superseded stream
    // finishing late must not congratulate itself over the new answer.
    if (MASCOT_ALIVE) { try { window.LarisMascot?.success(); } catch (_) {} }
  }
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
    bindListingRows(thread);
    bindTypeCards(thread);
    bindDeepDiveCards(thread);
    bindTrackerCards(thread);
    bindTrendingCards(thread);
    bindGptKalc(thread);
    bindSearchSuggests(thread);
    updateThreadWide();
    // Product threads: land on the Deep Dive card. Search threads: top of results.
    const product = resolveChatProduct(chat);
    if (product) {
      const card = thread.querySelector(`[data-dd-card="${prodKey(product)}"]`);
      if (card) scrollToContentStart(card);
      else scrollPanelToTop();
    } else if (thread.querySelector('.card-grid, .prod-card, .lrow, .lrow-wrap, .ans-panel')) {
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
  // Home / landing composers are a new search, not a follow-up — never
  // resume whatever thread is still sitting in #chat-thread.
  beginFreshChat();
  setView('chat');
  void handleComposerSubmit(text);
}

function renderHome() {
  _offerActive = false;
  abortAssistantStream();
  beginFreshChat();
  setView('home');
  wireHomeFinder();
  updateHomeFinderVisibility();

  if (!renderHome._seen) {
    renderHome._seen = true;
    void logUserEvent('gpt_landing_view', { ui: 'gpt' });
    clarityEvt('gpt_landing_view', {});
  }
}

/** Marketing landing (view-landing) — reached via the logo (goHome) and
 * the sidebar Tentang button. Separate surface from Ask Laris
 * (renderHome/view-home): the sidebar "Ask Laris" entry and every other
 * renderHome() caller are untouched by this. */
function renderLanding() {
  setView('landing');
  renderHomeLandingExamples();

  if (!renderLanding._seen) {
    renderLanding._seen = true;
    void logUserEvent('gpt_marketing_landing_view', { ui: 'gpt' });
    clarityEvt('gpt_marketing_landing_view', {});
  }
}

function loadFinderState() {
  try {
    const cur = JSON.parse(localStorage.getItem(FINDER_STATE_KEY) || 'null');
    if (cur && typeof cur === 'object') {
      if (cur.city) _finder.city = cur.city;
      // Accept both shapes: `categories` (array, current) and the older
      // single `category` string, so a browser with a pre-existing saved
      // finder state doesn't lose its pick after this update ships.
      if (Array.isArray(cur.categories) && cur.categories.length) _finder.categories = cur.categories.slice();
      else if (cur.category) _finder.categories = [cur.category];
      if (cur.budget && FINDER_BUDGETS.some(b => b.id === cur.budget)) _finder.budget = cur.budget;
      if (cur.experience) _finder.experience = cur.experience;
    }
  } catch (_) {}
  // Prefer completed onboarding prefs when present
  const o = state.onboarding || {};
  if (o.city) _finder.city = o.city;
  if (o.categories?.length) _finder.categories = o.categories.slice();
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
  return !!(_finder && _finder.city && _finder.categories && _finder.categories.length && _finder.budget && _finder.experience);
}

/** True when the user changed at least one finder field from the built-in defaults. */
function finderHasCustomAnswers() {
  if (!finderIsComplete()) return false;
  const cats = Array.isArray(_finder.categories) ? _finder.categories : [];
  const city = String(_finder.city || '').trim();
  if (city && city !== FINDER_DEFAULT_CITY) return true;
  if (cats.length !== 1 || cats[0] !== FINDER_DEFAULT_CAT) return true;
  if (_finder.budget && _finder.budget !== '1jt_10jt') return true;
  if (_finder.experience && _finder.experience !== 'first_time') return true;
  return false;
}

function syncFinderToOnboarding() {
  if (!finderIsComplete()) return;
  const o = state.onboarding;
  o.city = _finder.city;
  o.categories = _finder.categories.slice();
  o.experience = _finder.experience;
  o.budget = _finder.budget;
  // Don't mark step 'done' here — that happens when they press Temukan
  // Produk or save prefs. Premature 'done' would hide the 4 questions on
  // Chat Baru after a single pill tap (defaults already fill all fields).
  saveLocalState();
}

/** The finder is a first-run affordance only. Once the user has completed
 * onboarding, sent a message, or opened a deep dive, the composer is the
 * primary entry point and the finder is hidden for good. */
function hasEngagedBeyondFinder() {
  // completed onboarding
  if (state.onboarding?.step === 'done') return true;
  // has ever sent a message
  if ((state.chats || []).some(c => c?.messages?.length > 0)) return true;
  // has ever opened a deep dive
  if (state.everOpenedDeepdive) return true;
  return false;
}

function shouldShowLandingFinder() {
  return !hasEngagedBeyondFinder();
}

function updateHomeFinderVisibility() {
  const show = shouldShowLandingFinder();
  document.body.classList.toggle('home-finder-done', !show);
  const finder = $('home-finder');
  if (finder) finder.hidden = !show;
  const atau = document.querySelector('#view-home .finder-atau');
  if (atau) atau.hidden = true;
  // The finder is a first-run affordance. Once the user has completed
  // onboarding, sent a message, or opened a deep dive, the composer
  // becomes the primary entry point — the finder stays hidden for good.
  // The Ask Laris Garuda only mounts once home-finder-done reveals it;
  // init/refresh here so the rig can measure a visible host.
  if (MASCOT_ALIVE && window.LarisMascot) {
    try { window.LarisMascot.init(); window.LarisMascot.refresh(); } catch (_) {}
  }
  void syncHomeRetentionCards();
}

async function syncHomeRetentionCards() {
  const host = $('home-retention');
  if (host) host.hidden = shouldShowLandingFinder();
  await syncHomeFirstDdCard();
  await syncHomeLangkahCard();
}

async function syncHomeFirstDdCard() {
  const card = $('home-first-dd');
  if (!card) return;
  if (!currentUser || shouldShowLandingFinder() || state.onboarding?.step !== 'done') {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  await gptJourneyLoad();
  if ((_gptJourney.deepdiveCount || 0) > 0) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  const city = state.onboarding.city || _finder.city || '';
  const cats = state.onboarding.categories || _finder.categories || [];
  if (!cats.length) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  card.hidden = false;
  card.innerHTML = `<p class="home-ret-kicker">Analisis pertama</p>
    <p class="home-ret-loading">Mencari pasar yang cocok…</p>`;
  try {
    const packed = await fetchCategoryPasarTypes(cats, city, { limit: 8, budgetId: _finder.budget || state.onboarding.budget });
    const best = sortTypeRows((packed.types || []).slice(), 'terlaris')[0];
    if (!best) {
      card.innerHTML = `<p class="home-ret-kicker">Analisis pertama</p>
        <p class="home-ret-sub">Belum ketemu pasar untuk ${esc(cats.join(', '))}. Coba tanya Ask Laris.</p>`;
      return;
    }
    registerTypes([best]);
    const title = typeTitle(best.keyword);
    const img = best.rep_image_url ? imgThumb(best.rep_image_url) : '';
    card.innerHTML = `
      <p class="home-ret-kicker">Analisis pertama</p>
      <div class="home-ret-row">
        ${img ? `<img class="home-ret-img" src="${esc(img)}" alt="" width="56" height="56">` : ''}
        <div class="home-ret-meta">
          <h2>${esc(title)}</h2>
          <p>${esc([city, cats[0]].filter(Boolean).join(' · '))}</p>
        </div>
      </div>
      <button type="button" class="home-ret-cta" data-first-dd>Lihat analisis lengkap</button>`;
    card.querySelector('[data-first-dd]')?.addEventListener('click', () => {
      void logUserEvent('home_first_dd_click', { ui: 'gpt', keyword: best.keyword });
      void openDeepDive(typeRepProduct(best));
    });
  } catch (_) {
    card.hidden = true;
    card.innerHTML = '';
  }
}

function langkahFallbackSteps(keyword, category) {
  const label = keyword || category || 'produk ini';
  return [
    `Cek HPP dan margin untuk ${label}`,
    'Siapkan 5 foto produk yang jelas',
    `Bandingkan harga 5 toko ${label}`,
    'Tanya satu supplier soal MOQ',
  ].slice(0, 4);
}

function parseLangkahSteps(text) {
  const raw = String(text || '');
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return (Array.isArray(arr) ? arr : [])
      .map(s => String(s || '').replace(/\s+/g, ' ').trim())
      .filter(s => s.length >= 4 && s.length <= 80)
      .slice(0, 4);
  } catch (_) {
    return [];
  }
}

function langkahMingguPrompt({ keyword, category, city, experience, lastSteps, lastDone }) {
  const prev = (lastSteps || []).map((s, i) => {
    const mark = lastDone && lastDone[i] ? 'selesai' : 'belum';
    return `- [${mark}] ${s}`;
  }).join('\n');
  return `Kamu menulis langkah mingguan untuk penjual Shopee Indonesia di LarisID.
Pengguna: penjual ${experience === 'existing' ? 'berpengalaman' : 'baru'}${city ? `, kota ${city}` : ''}.
Fokus: ${keyword || category || 'kategori yang mereka pilih'}.
${prev ? `Minggu lalu:\n${prev}\nBangun dari yang belum selesai. Jangan ulangi langkah yang sudah ditandai selesai, kecuali masih relevan.` : 'Ini minggu pertama mereka.'}

Tulis TEPAT 3 atau 4 langkah. Jawaban HANYA JSON array of strings, tanpa teks lain.
Aturan:
- Setiap langkah diawali kata kerja, maksimal 9 kata.
- Minimal SATU langkah yang bukan data (HPP, foto, buka toko, tanya supplier, kemasan).
- Jangan janji omset, "dijamin laku", atau angka yang kamu tidak ukur.
- Jangan suruh potong harga tanpa cek modal.
- Bahasa Indonesia, sapaan "kamu", konkret.`;
}

async function generateLangkahSteps({ keyword, category, city, lastSteps, lastDone }) {
  const fallback = langkahFallbackSteps(keyword, category);
  if (!(await _useAi('langkah_minggu'))) return fallback;
  try {
    const reply = await _mlsAIPost(
      langkahMingguPrompt({
        keyword, category, city,
        experience: state.onboarding?.experience || 'first_time',
        lastSteps, lastDone,
      }),
      [{ role: 'user', content: `Buat langkah minggu ini untuk ${keyword || category || 'produk saya'}.` }],
      { maxTokens: 400 },
    );
    const parsed = parseLangkahSteps(reply?.text || '');
    return parsed.length >= 3 ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function openDeepDiveForKeyword(keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) return;
  let t = _ptypeByKeyword.get(kw);
  if (!t) {
    try {
      const types = await typesForListings([{ keyword: kw }], state.onboarding?.city || '', 1);
      t = types[0];
    } catch (_) {}
  }
  if (!t) { showToast('Belum ada data untuk pasar itu.'); return; }
  void openDeepDive(typeRepProduct(t));
}

async function syncHomeLangkahCard() {
  const card = $('home-langkah');
  if (!card) return;
  const firstTime = (state.onboarding?.experience || 'first_time') === 'first_time';
  if (!currentUser || shouldShowLandingFinder() || state.onboarding?.step !== 'done' || !firstTime) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  card.hidden = false;
  card.innerHTML = `<p class="home-ret-kicker">Langkah minggu ini</p>
    <p class="home-ret-loading">Menyusun langkah…</p>`;
  try {
    const weekStart = mondayOfWeek();
    const weekStr = weekStart.toISOString().slice(0, 10);
    let row = null;
    try {
      const { data } = await _supabase.rpc('get_weekly_steps', { p_week_start: weekStr });
      if (data && data.ok !== false) row = data;
    } catch (_) {}
    const keyword = row?.keyword || state.lastDeepDiveKeyword || '';
    const category = row?.category || (state.onboarding.categories || [])[0] || state.lastDeepDiveCategory || '';
    const city = state.onboarding.city || '';
    let steps = Array.isArray(row?.steps) ? row.steps.map(String) : [];
    let done = Array.isArray(row?.done) ? row.done.map(Boolean) : [];
    if (steps.length < 3) {
      let lastSteps = [];
      let lastDone = [];
      try {
        const prev = new Date(weekStart);
        prev.setUTCDate(prev.getUTCDate() - 7);
        const { data: prevRow } = await _supabase.rpc('get_weekly_steps', { p_week_start: prev.toISOString().slice(0, 10) });
        if (prevRow?.steps) { lastSteps = prevRow.steps; lastDone = prevRow.done || []; }
      } catch (_) {}
      steps = await generateLangkahSteps({ keyword, category, city, lastSteps, lastDone });
      done = steps.map(() => false);
      try {
        await _supabase.rpc('save_weekly_steps', {
          p_week_start: weekStr,
          p_keyword: keyword || null,
          p_category: category || null,
          p_steps: steps,
          p_done: done,
        });
      } catch (_) {}
    }
    while (done.length < steps.length) done.push(false);
    const catBit = [category, city].filter(Boolean).join(' · ');
    card.innerHTML = `
      <p class="home-ret-kicker">Langkah minggu ini${catBit ? ` · ${esc(catBit)}` : ''}</p>
      <ul class="home-langkah-list">
        ${steps.map((s, i) => `<li>
          <label>
            <input type="checkbox" data-langkah-i="${i}" ${done[i] ? 'checked' : ''}>
            <span>${esc(s)}</span>
          </label>
        </li>`).join('')}
      </ul>
      ${keyword ? `<button type="button" class="home-ret-link" data-langkah-dd>Buka analisis ${esc(typeTitle(keyword))}</button>` : ''}`;
    void logUserEvent('langkah_view', { ui: 'gpt', keyword: keyword || '', category: category || '' });
    card.querySelectorAll('[data-langkah-i]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.getAttribute('data-langkah-i'));
        void _supabase.rpc('toggle_weekly_step', { p_week_start: weekStr, p_idx: idx, p_done: !!input.checked });
        void logUserEvent('langkah_check', { ui: 'gpt', idx, done: !!input.checked });
      });
    });
    card.querySelector('[data-langkah-dd]')?.addEventListener('click', () => {
      void logUserEvent('langkah_open_dd', { ui: 'gpt', keyword });
      void openDeepDiveForKeyword(keyword);
    });
  } catch (_) {
    card.hidden = true;
    card.innerHTML = '';
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

// ── Sticky results search/sort bar ──────────────────────────────────────────
// Deliberately NOT a chat input — it's the browse/search entry point that
// replaced the always-visible composer on every view except Ask Laris. Holds
// the most recently rendered market-card set so choosing a sort order can
// Deliberately directory-only. Finder results land in #chat-thread, which is
// also Ask Laris's thread — and Ask Laris keeps its own dedicated bottom
// composer, so a second search surface on the same view would be redundant
// with (and visually compete against) that composer. Produk/directory has no
// composer at all, so this bar is its sole search entry point (also covers
// the "search bar at the top" requirement for the Produk landing). No sort
// control here — the directory's own filter panel already owns Urutkan.
function resultsBarVisibleOn(view) {
  return view === 'directory';
}

function renderResultsBar() {
  const bar = $('results-bar');
  if (!bar) return;
  const show = resultsBarVisibleOn(state.view);
  bar.hidden = !show;
  if (!show) closeResultsBarMega();
}

function closeResultsBarMega() {
  const mega = $('results-bar-mega');
  const btn = $('results-bar-kategori');
  if (mega) {
    mega.classList.remove('is-open');
    mega.hidden = true;
  }
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

async function applyDirectoryCategory(cat, sub) {
  const nextCat = String(cat || '').trim();
  const nextSub = String(sub || '').trim() || null;
  state.dirCats = nextCat ? [nextCat] : [];
  state.dirSub = nextCat ? nextSub : null;
  state.dirSearch = '';
  state.dirPage = 1;
  // An explicit pick (rail, mega-menu, hero CTA) — not the onboarding
  // auto-filter below — so the hero should stay hidden after this one.
  state.dirCatsFromOnboarding = false;
  const searchInp = $('results-bar-input');
  if (searchInp) searchInp.value = '';
  const host = $('dir-filters-range');
  try { host?._dirApi?.setCategories?.(state.dirCats); } catch (_) {}
  closeResultsBarMega();
  if (state.view !== 'directory') {
    state.comparePick = null;
    updateDirCompareBanner();
    await openDirectory();
  } else {
    applyDirCatUi();
    updateDirHeading();
    await renderDirectory();
  }
  void logUserEvent('dir_filter', {
    ui: 'gpt',
    kind: nextSub ? 'mega_subgroup' : 'mega_category',
    value: nextSub ? `${nextCat} › ${nextSub}` : nextCat,
  });
}

// Typo-tolerant token matcher — ported from Site A (js/laris-app.js
// _dscLevenshtein/_dscTokenMatch/_dscNormStr), used as a smart-search fallback
// only when an exact/synonym match already came back empty.
function _rbNormStr(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').replace(/[^\w\s]/g, ' ');
}
function _rbLevenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j] + 1, prev + 1, row[j - 1] + 1);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}
function _rbTokenMatch(token, hay) {
  if (!token) return true;
  if (hay.includes(token)) return true;
  const words = hay.split(/\s+/).filter(w => w.length >= 3);
  return words.some(w => {
    if (w.includes(token) || token.includes(w)) return true;
    if (token.length >= 4 && w.length >= 4 && _rbLevenshtein(token, w) <= 1) return true;
    return false;
  });
}

// Lazily-built, cached pool of keywords for the fuzzy/typo fallback — built once
// on first miss (not on every keystroke) and reused after.
let _rbFuzzyPool = null;
let _rbFuzzyPoolPromise = null;
async function _rbFuzzyPoolGet() {
  if (_rbFuzzyPool) return _rbFuzzyPool;
  if (_rbFuzzyPoolPromise) return _rbFuzzyPoolPromise;
  if (!_supabase) return [];
  _rbFuzzyPoolPromise = _supabase.from('product_types_v')
    .select('keyword, category_canonical, category, omset_top15')
    .gte('n_listings', 3)
    .order('omset_top15', { ascending: false, nullsFirst: false })
    .limit(6000)
    .then(({ data }) => { _rbFuzzyPool = data || []; return _rbFuzzyPool; })
    .catch(() => { _rbFuzzyPool = []; return _rbFuzzyPool; });
  return _rbFuzzyPoolPromise;
}

// Fuzzy fallback: normalize + token-match `raw` against the cached keyword pool.
// Returns lean rows { keyword, category_canonical, category, omset_top15 }.
async function _rbFuzzyMatch(raw, limit = 12) {
  const pool = await _rbFuzzyPoolGet();
  if (!pool.length) return [];
  const qTokens = _rbNormStr(raw).split(/\s+/).filter(Boolean);
  if (!qTokens.length) return [];
  const collect = (pred) => {
    const hits = [];
    for (const row of pool) {
      const hay = _rbNormStr(row.keyword || '');
      if (!hay) continue;
      if (pred(hay)) hits.push(row);
      if (hits.length >= limit * 3) break;
    }
    return hits;
  };
  let hits = collect(hay => qTokens.every(t => _rbTokenMatch(t, hay)));
  // AND-all-tokens misses related types ("galang manik" when no keyword
  // contains both). Fall back to the rarest/longest token with the same
  // typo tolerance so `manik` still surfaces bead crafts.
  if (!hits.length && qTokens.length >= 2) {
    let bestTok = null;
    let bestCount = Infinity;
    for (const t of qTokens) {
      if (t.length < 4) continue;
      let n = 0;
      for (const row of pool) {
        const hay = _rbNormStr(row.keyword || '');
        if (hay && _rbTokenMatch(t, hay)) n++;
      }
      // Skip tokens that hit nothing — otherwise a missing word like
      // "penghitam" (0) beats "kasar" (1) and the fallback returns [].
      if (n === 0) continue;
      if (n < bestCount || (n === bestCount && t.length > (bestTok ? bestTok.length : 0))) {
        bestCount = n;
        bestTok = t;
      }
    }
    if (bestTok) hits = collect(hay => _rbTokenMatch(bestTok, hay));
  }
  return hits.slice(0, limit);
}

function wireResultsBar() {
  const bar = $('results-bar');
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = '1';

  const form = $('results-bar-form');
  const input = $('results-bar-input');
  const box = $('results-bar-suggestions');
  const katBtn = $('results-bar-kategori');
  const mega = $('results-bar-mega');
  const megaCats = $('results-bar-mega-cats');
  const megaSubs = $('results-bar-mega-subs');
  let suggIdx = -1;
  let suggGen = 0;
  let suggDebounce = null;
  let megaActiveCat = null;
  let megaGen = 0;

  const hideSuggestions = () => {
    if (!box) return;
    box.classList.remove('show');
    box.hidden = true;
    box.innerHTML = '';
    suggIdx = -1;
  };

  const wordPrefixScore = (name, q) => {
    const n = String(name || '').toLowerCase().trim();
    const ql = String(q || '').toLowerCase().trim();
    if (!n || !ql) return 0;
    if (n === ql) return 1000;
    if (n.startsWith(ql)) return 900;
    if (n.split(/\s+/).some(w => w.startsWith(ql))) return 700;
    return 0;
  };

  // Tokopedia-style: keep typed prefix light, bold the completion.
  const highlight = (name, q) => {
    const n = String(name || '');
    const lo = n.toLowerCase();
    const ql = String(q || '').toLowerCase().trim();
    if (!ql) return '<strong>' + esc(n) + '</strong>';
    let idx = lo.startsWith(ql) ? 0 : lo.indexOf(' ' + ql);
    if (idx > 0) idx += 1;
    if (idx < 0) return '<strong>' + esc(n) + '</strong>';
    const pre = n.slice(0, idx);
    const match = n.slice(idx, idx + ql.length);
    const rest = n.slice(idx + ql.length);
    return esc(pre) + esc(match) + (rest ? '<strong>' + esc(rest) + '</strong>' : '');
  };

  const suggIco =
    '<span class="results-bar-sugg-ico" aria-hidden="true">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
    '</span>';

  const renderSuggestions = (items, q) => {
    if (!box) return;
    suggIdx = -1;
    if (!items.length) { hideSuggestions(); return; }
    box.innerHTML = items.map(it =>
      `<button type="button" class="results-bar-sugg-item" role="option" data-sugg="${esc(it.name)}">` +
        suggIco +
        `<span class="results-bar-sugg-name">${highlight(it.name, q)}</span>` +
        (it.category ? `<span class="results-bar-sugg-cat">${esc(it.category)}</span>` : '') +
      `</button>`
    ).join('');
    box.hidden = false;
    box.classList.add('show');
    box.querySelectorAll('[data-sugg]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const qPick = btn.getAttribute('data-sugg') || '';
        if (input) input.value = qPick;
        hideSuggestions();
        if (qPick) void runResultsBarSearch(qPick);
      });
    });
  };

  const showSuggestions = async (q) => {
    const raw = String(q || '').trim();
    if (raw.length < 2) { hideSuggestions(); return; }
    if (!_supabase) return;
    closeResultsBarMega();
    const gen = ++suggGen;
    const tok = raw.split(/\s+/)[0].replace(/[%_,.()\\]/g, '').trim().slice(0, 40);
    if (!tok) return;
    try {
      const cities = state.dirCities || [];
      let qy = _supabase.from('product_types_v')
        .select('keyword, category_canonical, category, omset_top15')
        .gte('n_listings', 3)
        .or(`keyword.ilike.${tok}%,keyword.ilike.% ${tok}%`)
        .order('omset_top15', { ascending: false, nullsFirst: false })
        .limit(40);
      if (cities.length === 1) qy = qy.eq('city', cities[0]);
      else if (cities.length > 1) qy = qy.in('city', cities);
      else qy = qy.eq('city', 'ALL');
      const { data } = await qy;
      if (gen !== suggGen) return;
      const cur = String(input?.value || '').trim();
      if (cur.toLowerCase() !== raw.toLowerCase()) return;
      const seen = new Set();
      const items = [];
      for (const r of (data || [])) {
        const name = r.keyword;
        if (!name || seen.has(name)) continue;
        const score = wordPrefixScore(name, raw);
        if (score <= 0) continue;
        seen.add(name);
        items.push({
          name,
          category: r.category_canonical || r.category || '',
          score,
        });
        if (items.length >= 24) break;
      }
      // Smart fallback: exact-prefix pass found nothing — try EN/ID synonym
      // expansion (offline, instant via _staticPlan), then typo-tolerant fuzzy
      // matching against a cached keyword pool.
      if (!items.length) {
        try {
          const plan = _staticPlan(raw);
          const extraTerms = (plan?.queries || []).slice(0, 3);
          for (const term of extraTerms) {
            const t = String(term).replace(/[%_,.()\\]/g, '').trim().slice(0, 40);
            if (!t) continue;
            const { data: extraData } = await _supabase.from('product_types_v')
              .select('keyword, category_canonical, category, omset_top15')
              .gte('n_listings', 3)
              .ilike('keyword', `%${t}%`)
              .order('omset_top15', { ascending: false, nullsFirst: false })
              .limit(20);
            for (const r of (extraData || [])) {
              const name = r.keyword;
              if (!name || seen.has(name)) continue;
              seen.add(name);
              items.push({ name, category: r.category_canonical || r.category || '', score: 500 });
            }
            if (items.length >= 8) break;
          }
        } catch (_) {}
      }
      if (gen !== suggGen) return;
      if (!items.length) {
        const fuzzy = await _rbFuzzyMatch(raw, 8);
        if (gen !== suggGen) return;
        for (const r of fuzzy) {
          const name = r.keyword;
          if (!name || seen.has(name)) continue;
          seen.add(name);
          items.push({ name, category: r.category_canonical || r.category || '', score: 100 });
        }
      }
      items.sort((a, b) => (b.score - a.score) || (a.name.length - b.name.length));
      renderSuggestions(items.slice(0, 8), raw);
    } catch (_) {
      if (gen === suggGen) hideSuggestions();
    }
  };

  const renderMegaSubs = async (cat) => {
    if (!megaSubs) return;
    megaActiveCat = cat;
    const gen = ++megaGen;
    megaSubs.innerHTML = '<p class="results-bar-mega-empty">Memuat…</p>';
    const groups = await loadSubgroups(cat);
    if (gen !== megaGen || megaActiveCat !== cat) return;
    const head =
      `<div class="results-bar-mega-head">` +
        `<button type="button" class="results-bar-mega-title" data-mega-all="${esc(cat)}">${esc(cat)}</button>` +
        `<button type="button" class="results-bar-mega-all" data-mega-all="${esc(cat)}">Lihat semua</button>` +
      `</div>`;
    if (!groups.length) {
      megaSubs.innerHTML = head + '<p class="results-bar-mega-empty">Belum ada subkategori. Klik nama kategori untuk buka produk.</p>';
    } else {
      megaSubs.innerHTML = head +
        `<div class="results-bar-mega-grid">` +
          groups.map(g =>
            `<button type="button" class="results-bar-mega-sub" data-mega-sub="${esc(g)}" data-mega-cat="${esc(cat)}">${esc(g)}</button>`
          ).join('') +
        `</div>`;
    }
    megaSubs.querySelectorAll('[data-mega-all]').forEach(btn => {
      btn.addEventListener('click', () => {
        void applyDirectoryCategory(btn.getAttribute('data-mega-all') || cat, null);
      });
    });
    megaSubs.querySelectorAll('[data-mega-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        void applyDirectoryCategory(
          btn.getAttribute('data-mega-cat') || cat,
          btn.getAttribute('data-mega-sub') || null
        );
      });
    });
  };

  const openMega = async () => {
    if (!mega || !megaCats) return;
    hideSuggestions();
    const canon = await loadCanonicalCats();
    const cats = (canon.length ? canon : NU_ONB_CATS).slice();
    if (!cats.length) return;
    const active = megaActiveCat && cats.includes(megaActiveCat)
      ? megaActiveCat
      : ((state.dirCats && state.dirCats.length === 1 && cats.includes(state.dirCats[0]))
        ? state.dirCats[0]
        : cats[0]);
    megaCats.innerHTML = cats.map(c =>
      `<button type="button" class="results-bar-mega-cat${c === active ? ' is-active' : ''}" role="option" data-mega-cat="${esc(c)}">${esc(c)}</button>`
    ).join('');
    megaCats.querySelectorAll('[data-mega-cat]').forEach(btn => {
      const cat = btn.getAttribute('data-mega-cat') || '';
      btn.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) {
          megaCats.querySelectorAll('.results-bar-mega-cat').forEach(el => {
            el.classList.toggle('is-active', el === btn);
          });
          void renderMegaSubs(cat);
        }
      });
      btn.addEventListener('click', () => {
        megaCats.querySelectorAll('.results-bar-mega-cat').forEach(el => {
          el.classList.toggle('is-active', el === btn);
        });
        const canHover = window.matchMedia('(hover: hover)').matches;
        // Desktop: hover already shows subs; click selects the whole category.
        if (canHover) {
          void applyDirectoryCategory(cat, null);
          return;
        }
        // Touch: first tap previews subs; second tap on same cat opens products.
        if (megaActiveCat === cat) {
          void applyDirectoryCategory(cat, null);
          return;
        }
        void renderMegaSubs(cat);
      });
    });
    mega.hidden = false;
    mega.classList.add('is-open');
    katBtn?.setAttribute('aria-expanded', 'true');
    await renderMegaSubs(active);
  };

  katBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const open = katBtn.getAttribute('aria-expanded') === 'true';
    if (open) closeResultsBarMega();
    else void openMega();
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    hideSuggestions();
    closeResultsBarMega();
    const q = String(input?.value || '').trim();
    if (q) void runResultsBarSearch(q);
  });

  input?.addEventListener('input', () => {
    clearTimeout(suggDebounce);
    const v = String(input.value || '').trim();
    if (!v && state.dirSearch) {
      state.dirSearch = '';
      state.dirPage = 1;
      updateDirHeading();
      if (state.view === 'directory') void renderDirectory();
    }
    suggDebounce = setTimeout(() => void showSuggestions(input.value), 180);
  });
  input?.addEventListener('focus', () => {
    closeResultsBarMega();
    if (String(input.value || '').trim().length >= 2) void showSuggestions(input.value);
  });
  input?.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
  input?.addEventListener('keydown', (e) => {
    if (!box || box.hidden) {
      if (e.key === 'Escape') {
        hideSuggestions();
        closeResultsBarMega();
      }
      return;
    }
    const items = [...box.querySelectorAll('[data-sugg]')];
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggIdx = Math.min(items.length - 1, suggIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggIdx = Math.max(-1, suggIdx - 1);
    } else if (e.key === 'Enter' && suggIdx >= 0) {
      e.preventDefault();
      items[suggIdx].dispatchEvent(new MouseEvent('mousedown'));
      return;
    } else if (e.key === 'Escape') {
      hideSuggestions();
      return;
    } else {
      return;
    }
    items.forEach((el, i) => el.classList.toggle('active', i === suggIdx));
  });
  document.addEventListener('click', (e) => {
    if (!form?.contains(e.target)) hideSuggestions();
    if (!bar.contains(e.target)) closeResultsBarMega();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeResultsBarMega();
  });
}

/** Free-text search from the Produk sticky bar — stays on the directory grid. */
async function runResultsBarSearch(q) {
  const query = String(q || '').trim();
  // Last action wins: typing a search overrides any category/subgroup browse state.
  state.dirCats = [];
  state.dirSub = null;
  state.dirSearch = query;
  state.dirPage = 1;
  state.dirCatsFromOnboarding = false;
  closeResultsBarMega();
  if (state.view !== 'directory') {
    state.comparePick = null;
    updateDirCompareBanner();
    await openDirectory();
  } else {
    updateDirHeading();
    await renderDirectory();
  }
  void logUserEvent('search_query', {
    ui: 'gpt', how: 'results_bar', query,
    results_count: Array.isArray(state.dirTypes) ? state.dirTypes.length : null,
    nearby: !!state.dirNearby,
  });
  gptLogSearchHistory(query, 'results_bar');
  funnelStep('first_search', { source: 'results_bar' });
}

function finderBudgetCfg(id) {
  return FINDER_BUDGETS.find(b => b.id === id) || FINDER_BUDGETS[FINDER_BUDGETS.length - 1];
}

function finderCatTriggerLabel() {
  const cats = _finder.categories || [];
  if (!cats.length) return 'Pilih kategori';
  if (cats.length === 1) return cats[0];
  return `${cats[0]} +${cats.length - 1} lainnya`;
}

function syncFinderUi() {
  const citySel = $('finder-city');
  // Show what the user actually typed; _finder.city holds the resolved bucket.
  if (citySel) citySel.value = _finder.cityTyped || _finder.city || FINDER_DEFAULT_CITY;
  const trigLabel = $('finder-cat-trigger-label');
  if (trigLabel) trigLabel.textContent = finderCatTriggerLabel();
  document.querySelectorAll('#finder-cat-popup-list .finder-cat-opt input[type=checkbox]').forEach(cb => {
    cb.checked = (_finder.categories || []).includes(cb.value);
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

  // Multi-select category popup: a trigger button opens a checkbox list;
  // closes on click-away, Escape, or the Selesai button. _finder.categories
  // is the array of currently-checked values.
  const catPicker = $('finder-cat-picker');
  const catTrigger = $('finder-cat-trigger');
  const catPopup = $('finder-cat-popup');
  const catList = $('finder-cat-popup-list');
  const catDone = $('finder-cat-popup-done');
  if (catPicker && catTrigger && catPopup && !catPicker.dataset.ready) {
    catPicker.dataset.ready = '1';

    const openPopup = () => {
      catPopup.hidden = false;
      catPicker.classList.add('open');
      catTrigger.setAttribute('aria-expanded', 'true');
      void logUserEvent('gpt_finder_category_interaction', { ui: 'gpt', action: 'open' });
    };
    const closePopup = () => {
      catPopup.hidden = true;
      catPicker.classList.remove('open');
      catTrigger.setAttribute('aria-expanded', 'false');
    };

    if (catList) {
      catList.innerHTML = NU_ONB_CATS.map(c => `
        <label class="finder-cat-opt">
          <input type="checkbox" value="${esc(c)}">
          <span>${esc(c)}</span>
        </label>
      `).join('');
      catList.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const set = new Set(_finder.categories || []);
          if (cb.checked) set.add(cb.value); else set.delete(cb.value);
          // Never allow every category to be de-selected — fall back to the
          // default rather than leaving the finder in an unsearchable state.
          _finder.categories = set.size ? Array.from(set) : [FINDER_DEFAULT_CAT];
          if (!set.size) cb.checked = (cb.value === FINDER_DEFAULT_CAT);
          saveFinderState();
          syncFinderUi();
          void logUserEvent('gpt_finder_category_interaction', { ui: 'gpt', action: 'change', categories: _finder.categories.join(', ') });
        });
      });
    }

    catTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (catPopup.hidden) openPopup(); else closePopup();
    });
    catDone?.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });
    document.addEventListener('click', (e) => {
      if (!catPopup.hidden && !catPicker.contains(e.target)) closePopup();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !catPopup.hidden) closePopup();
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

function typeMedianInBudget(t, bud) {
  if (!bud) return true;
  const price = Number(t?.price_median) || 0;
  if (!(price > 0)) return false;
  if (bud.max != null && Number.isFinite(bud.max) && price > bud.max) return false;
  if (bud.min != null && price < bud.min) return false;
  return true;
}

function rankTypesByBudget(rows, bud) {
  if (!bud) return (rows || []).slice();
  const inBand = [];
  const near = [];
  for (const t of rows || []) {
    (typeMedianInBudget(t, bud) ? inBand : near).push(t);
  }
  return inBand.concat(near);
}

async function resolveCanonCats(rawCats) {
  await loadCanonicalCats();
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rawCats) ? rawCats : (rawCats ? [rawCats] : []);
  for (const c of list) {
    const canon = toCanonicalCat(c);
    if (canon && !seen.has(canon)) { seen.add(canon); out.push(canon); }
  }
  return out;
}

function knownCityBucket(city) {
  const c = String(city || '').trim();
  if (!c) return '';
  if (NU_ONB_LOCATIONS.includes(c)) return c;
  return resolveNearestCityBucket(c).bucket || '';
}

/**
 * Category browse: city markets first, then national fill in the same
 * canonical bucket(s). Budget is a soft rank (median in-band first), not a cut.
 */
async function fetchCategoryPasarTypes(rawCats, city, { limit = FINDER_PASAR_LIMIT, budgetId } = {}) {
  const canonCats = await resolveCanonCats(rawCats);
  if (!canonCats.length) return { local: [], national: [], types: [], canonCats: [], cityBucket: '' };
  const bucket = knownCityBucket(city);
  const fillLimit = Math.max(limit * 3, 200);
  const [localRaw, allRaw] = await Promise.all([
    bucket ? fetchProductTypes([bucket], canonCats, limit) : Promise.resolve([]),
    fetchProductTypes(['ALL'], canonCats, fillLimit),
  ]);
  const seen = new Set();
  const local = [];
  for (const t of localRaw || []) {
    if (!t?.keyword || seen.has(t.keyword)) continue;
    seen.add(t.keyword);
    local.push(t);
  }
  const national = [];
  for (const t of allRaw || []) {
    if (!t?.keyword || seen.has(t.keyword)) continue;
    seen.add(t.keyword);
    national.push(t);
  }
  const bud = budgetId ? finderBudgetCfg(budgetId) : null;
  const rankedLocal = rankTypesByBudget(local, bud);
  const rankedNational = rankTypesByBudget(national, bud);
  const types = rankedLocal.concat(rankedNational).slice(0, limit);
  const localKws = new Set(rankedLocal.map(t => t.keyword));
  const packed = {
    local: types.filter(t => localKws.has(t.keyword)),
    national: types.filter(t => !localKws.has(t.keyword)),
    types,
    canonCats,
    cityBucket: bucket,
  };
  registerTypes(types);
  return packed;
}

async function finderPasarBlock({ types, catLabel, city, bud }) {
  if (!types.length) {
    return { html: `<p>Belum ketemu produk yang cocok. Coba ganti kategori atau kota, atau ketik pencarian di bawah.</p>`, pool: null };
  }
  const budBit = bud?.label ? ` (modal ${esc(bud.label)})` : '';
  const listings = await fetchListingsForKeywords(types.map(t => t.keyword).filter(Boolean), 20, 300);
  const pool = {
    keywords: markTerlarisMinggu(types.slice()),
    listings: dedupeListings(listings),
    primaryKw: '',
    nearby: false,
    unsold: 0,
  };
  const lead = `<p>${pool.listings.length || types.length} produk untuk <strong>${esc(catLabel)}</strong>${city ? ` — minat di <strong>${esc(city)}</strong>` : ''}${budBit}. Klik baris untuk Deep Dive.</p>`;
  const petaId = 'peta-finder-' + Date.now();
  const html = `${lead}<div data-lrow-block>${listingBlockHtml(pool, { petaId, query: catLabel, chipKw: '', compact: true })}</div>`;
  return { html, pool };
}

async function collectFinderProducts({ city, categories, budgetId, limit = 60 }) {
  const locs = expandCityLocations(city);
  const cats = Array.isArray(categories) ? categories.filter(Boolean) : (categories ? [categories] : []);
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
    state.onboarding.categories = _finder.categories.slice();
    state.onboarding.experience = _finder.experience;
    state.onboarding.step = 'done';
    state.onboarding.completedAnon = !currentUser;
    saveLocalState();
    saveFinderState();
    syncDirectoryFromOnboarding();
    renderSidebarLocCard();
    updateHomeFinderVisibility();

    const bud = finderBudgetCfg(_finder.budget);
    const catLabel = _finder.categories.join(', ');

    setView('chat');
    // Finder answers are onboarding context, not durable chat history.
    beginFreshChat();
    const thread = $('chat-thread');
    if (thread) thread.innerHTML = '';
    // No more "Temukan produk: ..." echo bubble — the result count line below
    // is now the visible record of what was searched.
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk yang cocok…</p>`);

    let packed = await fetchCategoryPasarTypes(_finder.categories, _finder.city || '', {
      limit: FINDER_PASAR_LIMIT,
      budgetId: _finder.budget,
    });
    // Last resort: listing lift if the type query returned nothing (empty
    // canonical map / mv miss). typesForListings now fills from city ALL.
    if (!packed.types.length) {
      const rows = await collectFinderProducts({
        city: _finder.city,
        categories: _finder.categories,
        budgetId: _finder.budget,
        limit: FINDER_PASAR_LIMIT,
      });
      const lifted = await typesForListings(rows.map(asListingProduct), _finder.city || '', FINDER_PASAR_LIMIT);
      packed = { local: [], national: lifted, types: lifted, canonCats: packed.canonCats, cityBucket: packed.cityBucket };
    }
    const types = packed.types;
    registerTypes(types);
    state.recommendations = [];

    const packedHtml = await finderPasarBlock({
      types,
      catLabel,
      city: _finder.city,
      bud,
    });
    const html = packedHtml.html;
    await revealAssistant(loading, html, { instant: true });
    const block = $('chat-thread')?.querySelector('[data-lrow-block]');
    if (packedHtml.pool && block) {
      bindListingBlock(block, packedHtml.pool, { query: catLabel, compact: true });
      const peta = block.querySelector('.peta-host');
      if (peta && window.PetaPeluang) {
        PetaPeluang.skeleton(peta, catLabel);
        mountPeta(peta, catLabel, packedHtml.pool.listings.slice(0, 200), listingPetaExtra(block, packedHtml.pool.listings));
      }
    }
    scrollPanelToTop();
    void logUserEvent('gpt_finder_search', {
      ui: 'gpt',
      city: _finder.city,
      categories: catLabel,
      budget: _finder.budget,
      experience: _finder.experience,
      count: types.length,
    });
    clarityEvt('gpt_finder_search', { categories: catLabel });
    funnelStep('first_search', { source: 'finder' });

    // Payoff: open the single best Deep Dive for users who have never dived.
    // Signed-in: retry on every finder run until user_journey_stats says they
    // have. Anon: one free view (ANON_DD_KEY) — never surprise-interrupt an
    // anon who already spent it (that would pop the signup modal).
    const skipAuto = (reason) => {
      void logUserEvent('finder_auto_deepdive_skipped', { ui: 'gpt', reason });
    };
    const firstListing = packedHtml.pool?.listings?.length
      ? sortDirRows(packedHtml.pool.listings.slice(), 'omset')[0]
      : null;
    if (!firstListing) {
      skipAuto('no_listings');
    } else {
      let anonSeen = '';
      try { anonSeen = String(localStorage.getItem(ANON_DD_KEY) || '').trim(); } catch (_) {}
      if (!currentUser && anonSeen) {
        skipAuto('anon_seen');
      } else {
        if (currentUser) await gptJourneyLoad();
        const neverDived = !currentUser ? !anonSeen : (_gptJourney.deepdiveCount || 0) === 0;
        if (!neverDived) {
          skipAuto('already_once');
        } else {
          setTimeout(() => {
            if (state.view !== 'chat') { skipAuto('view_changed'); return; }
            void logUserEvent('finder_auto_deepdive', { ui: 'gpt', keyword: firstListing.keyword || '' });
            void openDeepDive(firstListing);
          }, 1400);
        }
      }
    }
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
  // City and minat stay on Discover / Ask Laris / the heading. Cari Produk
  // default home is unfiltered — copying onboarding cats into dirCats used to
  // select "Olahraga & Outdoor" (FINDER_DEFAULT_CAT maps there) and fetch
  // only that bucket under the hero. An explicit rail / mega / hero click
  // is what sets dirCats.
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
  if (o.categories.length) _finder.categories = o.categories.slice();
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
      const filtersHost = $('dir-filters-range');
      if (filtersHost?._dirApi) {
        filtersHost._dirApi.setCategories(state.dirCats || []);
      }
      void renderSubcats(primaryDirCat());
      updateDirHeading();
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

function closeProfileNudge() {
  $('profile-nudge')?.classList.remove('open');
  scheduleProductRowsNotice({ fromRestore: false, isNewSignup: false });
}

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
let _keywordFetchToken = 0;

function normalizeSideMode(mode) {
  if (mode === 'kompetitor' || mode === 'serupa' || mode === 'ai' || mode === 'keyword') return mode;
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
  if (m === 'keyword') return 'Keyword';
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

let _sheetSavedHeightPx = 0;

function _sheetVh() {
  return (window.visualViewport && window.visualViewport.height) || window.innerHeight || 1;
}

function _sheetPanelFocused() {
  const panel = $('calc-panel');
  if (!panel) return false;
  const active = document.activeElement;
  return !!(active && panel.contains(active) && active.matches?.('input, select, textarea'));
}

function _sheetKeyboardInset() {
  const vv = window.visualViewport;
  const layoutH = window.innerHeight || 0;
  if (!vv || !layoutH) return 0;
  return Math.max(0, Math.round(layoutH - vv.height - vv.offsetTop));
}

function _resetSheetKeyboardStyles() {
  _sheetSavedHeightPx = 0;
  const panel = $('calc-panel');
  if (panel) {
    panel.style.bottom = '';
    panel.style.height = '';
  }
  document.body.classList.remove('sheet-keyboard-open');
}

function _syncSheetForKeyboard() {
  if (!window.matchMedia('(max-width: 860px)').matches) return;
  if (!document.body.classList.contains('calc-open')) return;
  const panel = $('calc-panel');
  if (!panel || panel.classList.contains('sheet-collapsed')) return;

  const vv = window.visualViewport;
  const layoutH = window.innerHeight || 0;
  if (!vv || !layoutH) return;

  const kbInset = _sheetKeyboardInset();
  const keyboardOpen = kbInset > 60 || _sheetPanelFocused();

  if (!keyboardOpen) {
    if (document.body.classList.contains('sheet-keyboard-open')) {
      _resetSheetKeyboardStyles();
      if (!document.body.classList.contains('sheet-resizing')) {
        setSheetHeight(loadSidePrefs().sheetPct || 0.8);
      }
    }
    return;
  }

  if (!_sheetSavedHeightPx) {
    _sheetSavedHeightPx = panel.getBoundingClientRect().height
      || parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sheet-h'), 10)
      || Math.round(layoutH * (loadSidePrefs().sheetPct || 0.8));
  }

  const visibleH = vv.height;
  const targetH = Math.max(160, Math.min(_sheetSavedHeightPx, visibleH - 8));
  panel.style.bottom = kbInset + 'px';
  panel.style.height = targetH + 'px';
  document.documentElement.style.setProperty('--sheet-h', targetH + 'px');
  document.body.classList.add('sheet-keyboard-open');
}

function _scrollSheetInputIntoView(el) {
  const body = el?.closest?.('.calc-body');
  if (!body || !el) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const pad = 20;
      const bRect = body.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (eRect.bottom > bRect.bottom - pad) {
        body.scrollTop += eRect.bottom - bRect.bottom + pad;
      } else if (eRect.top < bRect.top + pad) {
        body.scrollTop -= bRect.top + pad - eRect.top;
      }
    });
  });
}

function setSheetHeight(pct) {
  // pct = fraction of visual viewport (0.15–~0.98). Default open is 0.80.
  // Height is painted in px so drag math and CSS stay on the same unit
  // (dvh vs innerHeight diverge on iOS chrome).
  const vh = _sheetVh();
  const maxPct = Math.min(0.98, Math.max(0.5, (vh - 8) / vh));
  const p = Math.max(0.15, Math.min(maxPct, Number(pct) || 0.8));
  document.documentElement.style.setProperty('--sheet-h', `${Math.round(p * vh)}px`);
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
  const keywordBody = $('side-body-keyword');
  if (aiBody) aiBody.hidden = _sideMode !== 'ai';
  if (kalcBody) kalcBody.hidden = _sideMode !== 'kalkulator';
  if (kompBody) kompBody.hidden = _sideMode !== 'kompetitor';
  if (serupaBody) serupaBody.hidden = _sideMode !== 'serupa';
  if (supBody) supBody.hidden = _sideMode !== 'supplier';
  if (keywordBody) keywordBody.hidden = _sideMode !== 'keyword';
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
      .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
      .gt('total_sold', 0)
      .ilike('keyword', kw)
      .eq('is_offtopic', false)
      .order('total_sold', { ascending: false })
      .limit(120);
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

function wireKompPanelBody(body, peers, product) {
  // _dd.history is keyword-scoped; only reuse it when the panel is on that keyword.
  const sameKw = _dd?.product?.keyword && product?.keyword
    && String(_dd.product.keyword).trim().toLowerCase() === String(product.keyword).trim().toLowerCase();
  wireKompClicks(body, peers, { history: sameKw ? _dd.history : null });
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

  const kw = product.keyword || '—';
  body.innerHTML = `
    <p class="side-komp-lead">Listing di keyword “${esc(kw)}” — klik untuk Deep Dive produk.</p>
    ${ddKompetitorTableHtml(peers || [], { moreId: 'side-komp-more', highlightKey: prodKey(product) })}
  `;
  wireKompPanelBody(body, peers || [], product);
}

async function fillKeywordContent(opts = {}) {
  const body = $('side-body-keyword');
  if (!body) return;
  const product = opts.product || resolveSideProduct();
  if (!product) {
    setSideContext('');
    body.innerHTML = '<p class="side-empty">Buka produk atau pasar dulu untuk lihat data keyword.</p>';
    return;
  }
  const label = (product._ptype ? typeTitle(product.keyword) : (product.product_name || product.keyword || '')).slice(0, 80);
  setSideContext(label);

  let peers = opts.peers || resolveSidePeers(product);
  if (!peers?.length) {
    const token = ++_keywordFetchToken;
    body.innerHTML = '<p class="side-empty">Memuat data keyword…</p>';
    peers = await fetchSidePeers(product);
    if (token !== _keywordFetchToken || _sideMode !== 'keyword') return;
  }

  const token = ++_keywordFetchToken;
  body.innerHTML = '<p class="side-empty">Memuat variasi keyword…</p>';
  // Prefer expanded keywords from raw listings (same products, every scrape
  // keyword they’ve appeared under) — not just the single deduped field.
  const samePeers = !!resolveSidePeers(product);
  let kwRows = (_dd?.kwRows?.length > 1 && samePeers)
    ? _dd.kwRows
    : await fetchPeerKeywordRows(peers || []);
  if (token !== _keywordFetchToken || _sideMode !== 'keyword') return;
  if (_dd && samePeers) _dd.kwRows = kwRows;

  const shown = kwRows.slice(0, 40);
  const kw = product.keyword || '—';
  body.innerHTML = `
    <p class="side-komp-lead">${shown.length} keyword dipakai di antara sampel listing pasar “${esc(kw)}”.</p>
    ${ddKeywordTableHtml(shown, (peers || []).length)}
  `;
  // ddKeywordTableHtml's sparklines need history data, which the deep dive's
  // own chart pass (drawn against #deepdive-root) never reaches — this panel
  // is a separate subtree, so draw them here from the same _dd.history cache.
  const history = _dd?.history || [];
  body.querySelectorAll('canvas[data-spark]').forEach(cv => {
    const kwName = (cv.getAttribute('data-spark') || '').toLowerCase();
    const s = ddWeeklySeries(history.filter(r => (r.keyword || '').trim().toLowerCase() === kwName));
    drawSpark(cv, s.map(w => w.units));
  });
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
    <p class="side-komp-lead">${items.length} produk serupa di keyword “${esc(kw)}” — urut terjual. Klik untuk Deep Dive produk.</p>
    ${listingRowsHtml(items, { compact: true, keepChat: true, highlightKey: prodKey(product) })}
  `;
  bindListingRows(body);
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
    ${(!product._ptype || product._fromListing) ? '<div class="side-ai-photo" id="side-ai-photo"></div>' : ''}
  `;

  // Photo analysis needs one concrete photo. A market opened from a type card
  // has none — it is an aggregate. A market opened by clicking a listing does:
  // the listing the user clicked (_fromListing), which is the one on screen.
  const photoHost = $('side-ai-photo');
  if (photoHost && window.GptPhotoAnalyze) {
    window.GptPhotoAnalyze.mount(photoHost, {
      getContext: () => ({ keyword: product.keyword || '', medianPrice: Number(product.price) || null }),
      callAi: (system, messages) => _mlsAIRaw(system, messages),
      spendQuota: () => _useAi('photo'),
    });
  }

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
  else if (_sideMode === 'keyword') void fillKeywordContent(opts);
  else fillCalcContent({ ...opts, force: true });
}

function openSidePanel(mode, opts = {}) {
  const panel = $('calc-panel');
  if (!panel || !$('side-body-kalc') || !$('side-body-komp') || !$('side-body-serupa') || !$('side-body-supplier') || !$('side-body-keyword')) return;
  const next = normalizeSideMode(mode);
  const wasOpen = document.body.classList.contains('calc-open');
  const switching = wasOpen && _sideMode !== next;

  document.body.classList.add('calc-open');
  panel.setAttribute('aria-hidden', 'false');
  setSideModeUi(next);
  // Mobile sheet: explicit opens always expand; boot restore honors last state.
  const sheetMode = window.matchMedia('(max-width: 860px)').matches;
  if (opts.via === 'restore' && sheetMode && loadSidePrefs().collapsed) {
    panel.classList.add('sheet-collapsed');
  } else {
    panel.classList.remove('sheet-collapsed');
    if (sheetMode) setSheetHeight(loadSidePrefs().sheetPct || 0.8);
  }

  if (next === 'ai') fillAiContent(opts);
  else if (next === 'kalkulator') fillCalcContent(opts);
  else if (next === 'serupa') void fillSerupaContent(opts);
  else if (next === 'supplier') void fillSupplierContent(opts);
  else if (next === 'keyword') void fillKeywordContent(opts);
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
function openKeywordPanel(opts = {}) { openSidePanel('keyword', opts); }

function closeCalcPanel() {
  _resetSheetKeyboardStyles();
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

  // Mobile bottom-sheet grab: pointer-drag to resize height; <10% viewport auto-collapses.
  // Tap (tiny movement) still toggles collapse.
  const grab = $('sheet-grab');
  if (grab) {
    const isSheet = () => window.matchMedia('(max-width: 860px)').matches;
    const setCollapsed = (on) => {
      $('calc-panel')?.classList.toggle('sheet-collapsed', on);
      saveSidePrefs({ collapsed: on });
    };
    if (prefs.sheetPct) setSheetHeight(prefs.sheetPct);
    else setSheetHeight(0.8);

    let drag = null; // { pointerId, startY, startH, moved, lastPct }
    const onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.pointerId || !isSheet()) return;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dy) > 4) drag.moved = true;
      const vh = _sheetVh();
      const nextH = drag.startH - dy; // drag up → taller
      const pct = nextH / vh;
      if (pct < 0.10) {
        setCollapsed(true);
        return;
      }
      setCollapsed(false);
      drag.lastPct = setSheetHeight(pct);
      if (e.cancelable) e.preventDefault();
    };
    const onPointerUp = (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const moved = drag.moved;
      const lastPct = drag.lastPct;
      const collapsed = $('calc-panel')?.classList.contains('sheet-collapsed');
      drag = null;
      document.body.classList.remove('sheet-resizing');
      try { grab.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!moved) {
        setCollapsed(!collapsed);
        return;
      }
      if (collapsed) return;
      if (lastPct != null) saveSidePrefs({ sheetPct: lastPct, collapsed: false });
      else {
        const pct = ($('calc-panel')?.getBoundingClientRect().height || 0) / _sheetVh();
        if (pct < 0.10) setCollapsed(true);
        else saveSidePrefs({ sheetPct: setSheetHeight(pct), collapsed: false });
      }
    };
    const onPointerDown = (e) => {
      if (!isSheet()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const panel = $('calc-panel');
      if (!panel) return;
      if (e.cancelable) e.preventDefault();
      try { grab.setPointerCapture(e.pointerId); } catch (_) {}
      const vh = _sheetVh();
      drag = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startH: panel.classList.contains('sheet-collapsed')
          ? Math.round(vh * (loadSidePrefs().sheetPct || 0.8))
          : panel.getBoundingClientRect().height,
        moved: false,
        lastPct: null,
      };
      document.body.classList.add('sheet-resizing');
    };
    grab.addEventListener('pointerdown', onPointerDown);
    grab.addEventListener('pointermove', onPointerMove);
    grab.addEventListener('pointerup', onPointerUp);
    grab.addEventListener('pointercancel', onPointerUp);

    const refreshSheetLayout = () => {
      if (!isSheet() || document.body.classList.contains('sheet-resizing')) return;
      if (!document.body.classList.contains('calc-open')) return;
      if ($('calc-panel')?.classList.contains('sheet-collapsed')) return;
      if (_sheetKeyboardInset() > 60 || _sheetPanelFocused()) {
        _syncSheetForKeyboard();
        return;
      }
      setSheetHeight(loadSidePrefs().sheetPct || 0.8);
    };
    window.visualViewport?.addEventListener('resize', refreshSheetLayout);
    window.visualViewport?.addEventListener('scroll', refreshSheetLayout);
  }

  const calcPanel = $('calc-panel');
  if (calcPanel) {
    calcPanel.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!t.matches?.('input, select, textarea')) return;
      const sync = () => {
        _syncSheetForKeyboard();
        _scrollSheetInputIntoView(t);
      };
      sync();
      // iOS keyboard animates in ~300ms — re-sync once it settles.
      setTimeout(sync, 320);
    });
    calcPanel.addEventListener('focusout', () => {
      setTimeout(() => {
        _syncSheetForKeyboard();
        const active = document.activeElement;
        if (calcPanel.contains(active) && active.matches?.('input, select, textarea')) {
          _scrollSheetInputIntoView(active);
        }
      }, 120);
    });
  }

  if (!wireCalcPanel._vvBound && window.visualViewport) {
    wireCalcPanel._vvBound = true;
    const onVvChange = () => {
      if (!document.body.classList.contains('calc-open')) return;
      if (_sheetKeyboardInset() > 60 || _sheetPanelFocused()) _syncSheetForKeyboard();
    };
    window.visualViewport.addEventListener('resize', onVvChange);
    window.visualViewport.addEventListener('scroll', onVvChange);
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

/** Listing rows carry raw scrape categories ("Sepeda", "Olahraga"); directory
 *  filters use canonical buckets ("Olahraga & Outdoor"). */
function listingMatchesDirCats(listingCat, cats) {
  if (!cats?.length) return true;
  const raw = String(listingCat || '').trim();
  const canon = toCanonicalCat(raw) || raw;
  return catMatches(canon, cats) || catMatches(raw, cats);
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

let _listingHasIsAd = true;
function listingCoreSelect() {
  const core = 'item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,url,keyword,category,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method';
  return _listingHasIsAd ? `${core},is_ad` : core;
}
function listingIsAdMissing(error) {
  if (!_listingHasIsAd || !error) return false;
  const s = `${error.code || ''} ${error.message || ''}`;
  if (!/42703/.test(s) && !/\bis_ad\b/.test(s)) return false;
  console.warn('[peta] is_ad missing — dashed ad rings disabled');
  _listingHasIsAd = false;
  return true;
}

function dedupeListings(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows || []) {
    if (r == null || r.item_id == null || r.shop_id == null) continue;
    const k = `${r.item_id}|${r.shop_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(asListingProduct(r));
  }
  return out;
}

function listingAgeDays(p) {
  if (p?.age_days != null && Number.isFinite(Number(p.age_days)) && Number(p.age_days) >= 0) {
    return Number(p.age_days);
  }
  if (!p?.listing_date) return null;
  const d = new Date(p.listing_date).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.max(0, Math.round((Date.now() - d) / 86400000));
}

function listingUsiaLabel(p) {
  const days = listingAgeDays(p);
  const title = 'Umur listing, bukan umur toko. Tanggal listing pertama yang kami lihat — batas bawah.';
  if (days == null) return { text: '—', title };
  if (days < 30) return { text: `${days} hr`, title };
  const mo = Math.round(days / 30);
  if (mo < 12) return { text: `${mo} bln`, title };
  const yr = mo / 12;
  const text = yr < 2 ? `${String(yr.toFixed(1)).replace('.', ',')} th` : `${Math.round(yr)} th`;
  return { text, title };
}

async function fetchListingsForKeyword(kw, limit = 120) {
  if (!_supabase || !kw) return [];
  const build = () => _supabase.from('listings_deduped')
    .select(listingCoreSelect())
    .gt('total_sold', 0)
    .eq('is_offtopic', false)
    .ilike('keyword', kw)
    .order('nowcast_omset_monthly', { ascending: false, nullsFirst: false })
    .limit(limit);
  try {
    let { data, error } = await build();
    if (listingIsAdMissing(error)) ({ data, error } = await build());
    if (error) throw error;
    return dedupeListings(data || []);
  } catch (_) {
    return [];
  }
}

let _listingsForKwRpc = true;
function listingsForKwRpcMissing(error) {
  if (!_listingsForKwRpc || !error) return false;
  const s = `${error.code || ''} ${error.message || ''} ${error.details || ''}`;
  if (!/42883|PGRST202|404|listings_for_keywords/.test(s)) return false;
  console.warn('[listings] listings_for_keywords missing — per-keyword fallback');
  _listingsForKwRpc = false;
  return true;
}

async function fetchListingsForKeywords(kws, perKw = 20, max = 300) {
  const keywords = [...new Set((kws || []).map(k => String(k || '').trim()).filter(Boolean))];
  if (!_supabase || !keywords.length) return [];
  if (keywords.length === 1) return (await fetchListingsForKeyword(keywords[0], Math.min(120, max))).slice(0, max);
  if (_listingsForKwRpc) {
    try {
      const { data, error } = await _supabase.rpc('listings_for_keywords', {
        p_keywords: keywords,
        p_per_kw: perKw,
        p_max: max,
      });
      if (listingsForKwRpcMissing(error)) { /* fall through */ }
      else if (error) throw error;
      else return dedupeListings(data || []).slice(0, max);
    } catch (e) {
      if (!listingsForKwRpcMissing(e)) console.warn('[listings_for_keywords]', e?.message || e);
    }
  }
  const take = keywords.slice(0, 6);
  const chunks = await Promise.all(take.map(kw => fetchListingsForKeyword(kw, perKw)));
  return dedupeListings(chunks.flat()).slice(0, max);
}

async function countKeywordUnsold(kw) {
  if (!_supabase || !kw) return 0;
  try {
    const { count } = await _supabase.from('listings_deduped')
      .select('item_id', { count: 'exact', head: true })
      .ilike('keyword', kw)
      .eq('is_offtopic', false)
      .eq('total_sold', 0);
    return count || 0;
  } catch (_) {
    return 0;
  }
}

async function resolveListingPool({ q, cats, sub, home } = {}) {
  const query = (q || '').trim();
  const out = { keywords: [], listings: [], primaryKw: '', nearby: false, unsold: 0 };
  if (query) {
    let types = await searchProductTypes(query, [], 24);
    if (!types.length) {
      types = await searchNearbyProductTypes(query, [], 24);
      out.nearby = !!types.length;
    }
    out.keywords = types.some(t => t._nearby) ? types : markTerlarisMinggu(types.slice());
    if (types.length) {
      out.primaryKw = types[0].keyword || '';
      const kws = types.map(t => t.keyword).filter(Boolean).slice(0, 15);
      if (kws.length === 1) {
        out.listings = await fetchListingsForKeyword(kws[0], 120);
      } else {
        const rest = kws.filter(k => k !== out.primaryKw);
        const [primary, extra] = await Promise.all([
          fetchListingsForKeyword(out.primaryKw, 120),
          fetchListingsForKeywords(rest, 20, 240),
        ]);
        out.listings = dedupeListings(primary.concat(extra));
      }
      out.unsold = await countKeywordUnsold(out.primaryKw);
    }
    if (!out.listings.length) {
      out.listings = (await searchListings(query, [], 80)).map(asListingProduct);
    }
  } else {
    let types = [];
    if (home) types = await loadDirHomePool();
    else {
      types = await fetchProductTypes([], cats || [], 1000, sub);
      if (!types.length && !sub) {
        types = await typesForListings(mergePool([], await fetchNaikDaunGlobal(200)), '', 60);
      }
    }
    types = sortTypeRows(types, 'sesuai', false);
    types = markTerlarisMinggu(types);
    out.keywords = types;
    out.primaryKw = '';
    out.listings = await fetchListingsForKeywords(
      types.slice(0, 15).map(t => t.keyword).filter(Boolean), 20, 300);
  }
  out.listings = dedupeListings(out.listings);
  rememberProducts(out.listings);
  registerTypes(out.keywords);
  return out;
}

function filterListingPool(listings, chipKw, zoneKeys) {
  let rows = listings || [];
  if (chipKw) rows = rows.filter(r => (r.keyword || '') === chipKw);
  if (zoneKeys && zoneKeys.size) rows = rows.filter(r => zoneKeys.has(prodKey(r)));
  return rows;
}

function keywordChipsHtml(types, activeKw, opts = {}) {
  const list = types || [];
  if (!list.length) return '';
  const showSemua = opts.showSemua !== false;
  const chips = [];
  if (showSemua) {
    chips.push(`<button type="button" class="lrow-chip${activeKw === '' ? ' is-on' : ''}" data-lrow-kw="">Semua</button>`);
  }
  list.slice(0, 16).forEach(t => {
    const kw = t.keyword || '';
    const on = activeKw === kw;
    const badge = t._terlaris
      ? `<span class="lrow-chip-badge" title="${esc(terlarisTooltip(t._terlaris))}">Terlaris</span>`
      : '';
    chips.push(`<button type="button" class="lrow-chip${on ? ' is-on' : ''}" data-lrow-kw="${esc(kw)}">${esc(kw)}${badge}</button>`);
  });
  return `<div class="lrow-chips" role="tablist">${chips.join('')}</div>`;
}

function petaScoreFor(listing, listings) {
  if (!window.PetaPeluang || typeof PetaPeluang.calcListingScore !== 'function') return null;
  const peers = (listings || []).filter(x => x.keyword && x.keyword === listing.keyword);
  return PetaPeluang.calcListingScore(listing, peers.length > 5 ? peers : listings);
}

async function fetchPetaListings(q, types) {
  if (!_supabase) return [];
  const kws = [...new Set((types || []).map(t => t.keyword).filter(Boolean))].slice(0, 24);
  const build = () => {
    let query = _supabase.from('listings_deduped')
      .select(listingCoreSelect())
      .gt('total_sold', 0)
      .eq('is_offtopic', false)
      .order('nowcast_omset_monthly', { ascending: false, nullsFirst: false })
      .limit(120);
    if (kws.length === 1) query = query.eq('keyword', kws[0]);
    else if (kws.length) query = query.in('keyword', kws);
    else if (q) query = query.ilike('product_name', `%${String(q).slice(0, 40)}%`);
    return query;
  };
  try {
    let { data, error } = await build();
    if (listingIsAdMissing(error)) ({ data, error } = await build());
    if (error) throw error;
    const seen = new Set();
    const out = [];
    for (const r of (data || [])) {
      const k = `${r.item_id}|${r.shop_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(asListingProduct(r));
    }
    return out;
  } catch (_) {
    try {
      return (await searchListings(q || (kws[0] || ''), [], 80)).map(asListingProduct);
    } catch (e) { return []; }
  }
}

function petaHostOpts(query, listings, extra) {
  return {
    query: query || '',
    supabase: _supabase,
    calcScore: (listing) => petaScoreFor(listing, listings),
    onDotOpen: (listing) => { void openDeepDive(listing); },
    ...(extra || {}),
  };
}

function mountPeta(hostEl, query, listings, extra) {
  if (!hostEl || !window.PetaPeluang) return;
  rememberProducts(listings || []);
  PetaPeluang.mount(hostEl, listings || [], petaHostOpts(query, listings || [], extra));
}

async function fetchListingsCityCat(locations, cats, limit = 80) {
  if (!_supabase || !locations.length) return [];
  try {
    let q = _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
      .in('location', locations)
      .eq('is_offtopic', false)
      .order('total_sold', { ascending: false })
      .limit(limit * 2);
    if (cats.length) q = q.in('category', cats);
    const { data, error } = await q;
    if (error) throw error;
    return mergePool([], data || []).map(asListingProduct);
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

// ── Instant Produk-page open: a small pre-warmed assortment so the default
// directory view never has to sit on a bare "Memuat…" state. Warmed once at
// boot() (fire-and-forget) so it's usually ready before the user ever opens
// Produk; renderDirectory() falls back to the old loading text if it isn't.
let _dirInstantPool = [];
let _dirInstantPoolPromise = null;
function warmDirInstantPool() {
  if (_dirInstantPool.length || _dirInstantPoolPromise) return _dirInstantPoolPromise;
  _dirInstantPoolPromise = (async () => {
    try {
      const pool = await fetchNaikDaunGlobal(60);
      const types = await typesForListings(pool, '', 12);
      if (types.length) _dirInstantPool = types;
    } catch (_) { /* falls back to the normal loading path */ }
  })();
  return _dirInstantPoolPromise;
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
    <td><div class="tr-prod">${r.image_url ? `<img src="${esc(imgThumb(r.image_url))}" alt="" loading="lazy" decoding="async">` : '<span class="ph"></span>'}<div><div class="tr-prod-name">${esc((r.product_name || '').slice(0, 60))}</div><div class="tr-prod-cat">${esc(r.category || '')}</div></div></div></td>
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
  // Before the category-discovery bail-out below: "apa yang terlaris di camping
  // minggu ini" is a category-level ask, so that early return would swallow it
  // and answer with a generic category showcase instead of the weekly winners.
  // Bare "terlaris" is deliberately NOT matched — that still means all-time.
  if (/terlaris.{0,24}(minggu|pekan) ini|(minggu|pekan) ini.{0,24}terlaris|paling laris.{0,24}(minggu|pekan)|terlaris (minggu|pekan)|(terlaris|best.?sell\w*|top.?sell\w*).{0,24}this week|this week.{0,24}(terlaris|best.?sell\w*|top.?sell\w*)/.test(lower)) {
    return 'terlaris_minggu';
  }
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
  // Market intents never belong inside a product Deep Dive thread or a
  // leftover finder/recommendation results page.
  let chat = activeChat();
  if (chat?.context?.product || chat?.context?.kind === 'product' || chatIsCompare(chat) || chatIsResultsThread(chat)) {
    beginFreshChat();
    chat = null;
  }
  chat = ensureComposerChat(text);
  appendBubble('user', `<p>${esc(text)}</p>`);
  pushMessage(chat, 'user', text);
  void logUserEvent('gpt_message_sent', { ui: 'gpt' });
  clarityEvt('gpt_message_sent', {});
  void logUserEvent('gpt_intent', { ui: 'gpt', intent });
  clarityEvt('gpt_intent', { intent });

  if (intent === 'trending') return handleTrendingIntent(chat);
  if (intent === 'terlaris_minggu') return handleTerlarisMingguIntent(chat, text);
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
    if (ndTypes.length) {
      const pool = await typesToListingPool(ndTypes);
      await revealListingPool(loading, chat,
        `<p>Data tren mingguan belum tersedia — ini produk dari pasar yang lagi naik daun:</p>`,
        pool, { text: 'Produk trending', kind: 'trending', types: ndTypes.map(t => t.keyword), query: 'naik daun' });
      bindTrendingCards();
      updateThreadWide();
      setComposerChips(TRENDING_CHIPS, 'trending');
      void logUserEvent('discover_view', { ui: 'gpt', kind: 'trending' });
      return;
    }
    html = `<p>Data tren belum tersedia. Coba lagi nanti.</p>`;
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

/**
 * Markets ranked by this week's sales, optionally inside one canonical bucket.
 *
 * Ordering and filtering happen server-side on purpose. Pulling the category
 * first and ranking client-side would re-create the mv_trending problem: a
 * quiet bucket's winners sit far below any global cut-off.
 */
async function fetchTerlarisMinggu(cat, limit = 9) {
  if (!_supabase || !_ptypeHasWeekly) return [];
  try {
    let q = _supabase.from('product_types_v')
      .select(ptypeCols())
      .eq('city', 'ALL')
      .gte('n_listings', 3)
      .gte('wk_units', TERLARIS_MIN_UNITS)
      .gte('wk_items', TERLARIS_MIN_ITEMS)
      .order('wk_units', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (cat) q = q.eq('category_canonical', cat);
    const { data, error } = await q;
    if (ptypeWeeklyMissing(error)) return [];
    if (error) throw error;
    // pct is the one part of the floor SQL cannot express (it needs wk_base).
    const rows = (data || []).filter(t => { const w = weeklyStats(t); return w && w.pct > 0; });
    await attachTypeQuartiles(rows);
    return rows;
  } catch (e) {
    console.warn('[terlarisMinggu]', e?.message || e);
    return [];
  }
}

async function handleTerlarisMingguIntent(chat, text) {
  if (!(await ensureSearchAllowed())) return;
  await loadCanonicalCats();
  // "camping" resolves to the raw bucket 'Outdoor & Camping', which is not a
  // category_canonical value — filtering on it matches zero rows.
  const cat = toCanonicalCat(detectCategoryFromText(String(text).toLowerCase()) || '');
  const inCat = cat ? ` di <strong>${esc(cat)}</strong>` : '';
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menghitung penjualan minggu ini${cat ? ` di ${esc(cat)}` : ''}…</p>`);
  const types = await fetchTerlarisMinggu(cat, 9);
  const gate = await ensureIntentChat(chat, `Terlaris minggu ini${cat ? ` — ${cat}` : ''}`, { kind: 'terlaris_minggu', cat });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }

  let html;
  let ndTypes = [];
  if (types.length) {
    const w = weeklyStats(types[0]);
    // Say what was actually measured. Our scrapes land ~12-17 days apart, so
    // claiming a clean Mon-Sun week here would be a fabricated delta.
    const window = w && w.spanDays > 0
      ? ` — dihitung dari perubahan terjual dalam ${w.spanDays} hari terakhir (sampai ${esc(fmtAnchorDate(w.anchor))}), disetarakan ke 7 hari`
      : '';
    registerTypes(types);
    const pool = await typesToListingPool(markTerlarisMinggu(types.slice()));
    await revealListingPool(loading, chat,
      `<p>Produk dari pasar dengan penjualan tertinggi minggu ini${inCat}${window}:</p>`,
      pool, { text: 'Terlaris minggu ini', kind: 'terlaris_minggu', cat, types: types.map(t => t.keyword), query: cat || 'terlaris minggu ini' });
    setComposerChips(TRENDING_CHIPS, 'trending');
    void logUserEvent('discover_view', { ui: 'gpt', kind: 'terlaris_minggu', cat: cat || '', count: types.length });
    return;
  } else {
    const nd = mergePool([], await fetchNaikDaunGlobal(60));
    ndTypes = await typesForListings(nd, '', 6);
    registerTypes(ndTypes);
    const why = cat
      ? `Belum ada pasar${inCat} yang penjualannya cukup terukur minggu ini — scrape terakhir untuk kategori ini belum punya dua titik data yang cukup rapat.`
      : 'Belum ada pasar dengan penjualan mingguan yang cukup terukur saat ini.';
    if (ndTypes.length) {
      const pool = await typesToListingPool(ndTypes);
      await revealListingPool(loading, chat,
        `<p>${why} Ini produk dari pasar yang lagi naik daun dalam rentang lebih panjang:</p>`,
        pool, { text: 'Terlaris minggu ini', kind: 'terlaris_minggu', cat, types: ndTypes.map(t => t.keyword), query: cat || 'naik daun' });
      setComposerChips(TRENDING_CHIPS, 'trending');
      void logUserEvent('discover_view', { ui: 'gpt', kind: 'terlaris_minggu', cat: cat || '', count: 0 });
      return;
    }
    html = `<p>${why}</p>`;
  }
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Terlaris minggu ini',
    kind: 'terlaris_minggu',
    cat,
    types: (types.length ? types : ndTypes).map(t => t.keyword),
  }, html);
  setComposerChips(TRENDING_CHIPS, 'trending');
  void logUserEvent('discover_view', { ui: 'gpt', kind: 'terlaris_minggu', cat: cat || '', count: types.length });
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
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
      .gte('price', 1000).lte('price', budget)
      .gt('total_sold', 100)
      .eq('is_offtopic', false)
      .order('total_sold', { ascending: false })
      .limit(60);
    rows = (data || []).map(asListingProduct);
  } catch (_) {}
  const gate = await ensureIntentChat(chat, `Modal ${fmtRp(budget)}`, { kind: 'modal', budget });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  const top = mergePool([], rows);
  rememberProducts(top);
  state.recommendations = [];
  if (top.length) {
    const types = await typesForListings(top, '', 8);
    const pool = { keywords: markTerlarisMinggu(types), listings: top, primaryKw: '', nearby: false, unsold: 0 };
    await revealListingPool(loading, chat,
      `<p>Produk dengan harga di bawah <strong>${fmtRp(budget)}</strong> — dari data Shopee LarisID:</p>`,
      pool, { text: 'Hasil modal', budget, level: 'listing', types: types.map(t => t.keyword), query: `modal ${budget}` });
    return;
  }
  const html = `<p>Belum ketemu produk laris di bawah ${fmtRp(budget)}. Coba angka lain.</p>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', { text: 'Hasil modal', budget, level: 'listing', types: [] }, html);
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
  const side = (label, s, rows) => s
    ? `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4>
       <p class="dd-sub" style="margin:0 0 10px">${s.n} listing terpantau · median harga ${fmtRp(s.median)} · total ${fmtSold(s.sold)} terjual</p>
       ${rows.length ? listingRowsHtml(rows.slice(0, 12), { compact: true }) : '<p class="dd-sub">Belum ada listing untuk keyword ini.</p>'}</div>`
    : `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4><p class="dd-sub">Tidak ketemu di data.</p></div>`;
  let verdict = '';
  if (sa && sb) {
    const win = sa.sold >= sb.sold ? parts[0] : parts[1];
    verdict = `<p style="margin-top:12px">Dari total penjualan yang terpantau, <strong>${esc(win)}</strong> lebih laris. Klik baris untuk analisis produk.</p>`;
  }
  rememberProducts([...(a || []), ...(b || [])]);
  const html = `<p>Perbandingan “<strong>${esc(parts[0])}</strong>” vs “<strong>${esc(parts[1])}</strong>” dari data Shopee LarisID:</p>${side(parts[0], sa, a)}${side(parts[1], sb, b)}${verdict}`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Bandingkan',
    a: parts[0],
    b: parts[1],
    level: 'listing',
    types: [],
  }, html);
  bindListingRows($('chat-thread'));
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
    { cat: 'Fashion', terms: ['fashion', 'pashion', 'fasion', 'baju', 'pakaian', 'kaos', 'celana', 'dress', 'dresses', 'hijab', 'sepatu', 'sandal', 'tas wanita', 'jaket'] },
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
  { cat: 'Hobi & Kerajinan', terms: ['hobi', 'hobby', 'kerajinan', 'craft', 'crafts'] },
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
  // Beads / bracelets — English + the galang→gelang typo must reach ID keywords
  beads: ['manik', 'gelang manik', 'manik-manik'],
  bead: ['manik', 'gelang manik'],
  bracelet: ['gelang', 'gelang manik'],
  manik: ['gelang manik', 'manik-manik'],
  gelang: ['bracelet'],
  galang: ['gelang'],
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
  'beads bracelet': ['gelang manik', 'manik', 'manik-manik', 'gelang', 'kalung manik'],
  'bead bracelet': ['gelang manik', 'manik', 'manik-manik', 'gelang', 'kalung manik'],
  'gelang manik': ['manik', 'manik-manik', 'gelang', 'kalung manik'],
  'galang manik': ['gelang manik', 'manik', 'gelang', 'kalung manik'],
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
  'Hobi & Kerajinan': ['hobi', 'hobby', 'kerajinan', 'craft', 'crafts'],
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

/**
 * "Is X a good idea to sell" style asks (Ask Laris' comparative-reasoning
 * prompt) — distinct from a plain category search/showcase ask: the user
 * wants a judgment ("shoes are overrun, women's could work"), not a grid of
 * cards. Caught only when paired with a resolved category (see call site).
 */
function isEvaluativeAsk(lower) {
  const s = String(lower || '');
  return /apakah.*(bagus|baik|worth|cocok|menguntungkan|prospek|laku|rame|ramai)/.test(s)
    || /(ide|prospek) (jual|jualan|bisnis|usaha)/.test(s)
    || /jualan .*(bagus|baik|worth it|prospek)/.test(s)
    || /(baiknya|sebaiknya|worth it).*jual/.test(s)
    || /jual.*(bagus (ga|gak|nggak|tidak)|worth it (ga|gak|nggak))\b/.test(s);
}

/**
 * "so what should I sell?" — an open ask for a DIRECTION, with no product and
 * no category named.
 *
 * It reads as a follow-up but it is not a refinement: whatever category the
 * thread was carrying is exactly what the user is asking us to reconsider. That
 * is why applyResearchFromText steps that category down to a hint here —
 * "aku di Bau-Bau, aku harus jual apa?" used to inherit Olahraga and search
 * that instead of the city.
 */
function isOpenSellAsk(lower) {
  const s = String(lower || '');
  if (/(produk|jualan|barang|usaha|bisnis)\s+apa\b/.test(s)) return true;
  if (/\b(jual|jualan|berjualan)\s+apa\b/.test(s)) return true;
  if (/apa yang (bagus|laris|laku|cocok|harus)(\s+(saya|aku|gue|gua))?(\s+(di)?jual)?/.test(s)) return true;
  if (/\b(harus|sebaiknya|mending|enaknya)\s+(saya|aku|gue|gua)?\s*jual(an)?\b/.test(s)) return true;
  if (/\bwhat\s+(should|can|could)\s+i\s+sell\b|\bwhat\s+to\s+sell\b/.test(s)) return true;
  return false;
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
  // National browse — city label comes from onboarding / heading, not a hard filter.
  state.dirCities = [];
  if (city) state.onboarding.city = city;
  state.dirPage = 1;
  state._dirDefaultsApplied = true;
  void logUserEvent('dir_open', { ui: 'gpt', via: 'topic_change', city });
  clarityEvt('dir_open', { via: 'topic_change' });
  await openDirectory();
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

/** Split multi-intent queries ("kemeja denim, jeans pria") into independent clauses. */
function _splitSearchIntents(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const parts = raw.split(/\s*(?:,|&|\bdan\b|\batau\b)\s*/i)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
    .filter(s => _searchTerms(s).length >= 1 || s.replace(/[^\p{L}\p{N}]+/gu, '').length >= 3)
    .slice(0, 4);
  if (parts.length < 2) return [raw];
  return parts;
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
// Namespaced per arm. This used to be '_lid_syn_cache_v1' on BOTH bundles, but
// the two send different system prompts, so cross-visiting users got the other
// site's plan served back for any repeated query. See the matching comment in
// js/laris-app.js.
const SYN_CACHE_KEY = '_lid_syn_cache_gpt_v2';

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
      + '"exclude":["lowercase words that would pull in UNRELATED products sharing a token, max 10"],'
      + '"brand":"the corrected/canonical spelling of a real product brand the shopper named or clearly '
      + 'meant (fix obvious typos, e.g. \'Valentina\'→\'Valentino\'), or null if no brand is named or implied"}. '
      + 'Rules: (1) Expand English product nouns into Indonesian seller keywords for THAT niche — '
      + 'e.g. "dresses" → "gaun","dress wanita","baju pesta","gaun pesta"; "tumbler" → "tumbler","botol minum"; '
      + '"serum" → "serum wajah","skincare serum". (2) Prefer specific product terms over broad category '
      + 'labels like "fashion","pakaian","kecantikan". (3) Never invent product names, brands, prices or '
      + 'descriptions — "brand" may only correct/normalize a name already present in the search text, never '
      + 'introduce one that isn\'t there.';
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
    const brand = String(parsed.brand || '').trim();
    return {
      queries: clean(parsed.queries, 8),
      exclude: clean(parsed.exclude, 10).map(s => s.toLowerCase()),
      brand: brand && brand.toLowerCase() !== 'null' ? brand : null,
    };
  } catch (_) { return null; }
}

// Combine static seed + DeepSeek plan, cached per normalized query. On AI failure
// return the static seed WITHOUT caching so a later search can still reach the model.
async function planSearch(text) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  const key = cleaned.toLowerCase();
  if (!key) return { queries: [], exclude: [], category: null, brand: null };
  const cached = _synCacheGet(key);
  if (cached) return cached;
  const seed = _staticPlan(cleaned);
  const ai = await _deepseekPlan(cleaned);
  if (!ai) return { ...seed, brand: null };
  const uniq = (arr, n) => Array.from(new Set(arr.filter(Boolean))).slice(0, n);
  const plan = {
    queries: uniq([...ai.queries, ...seed.queries], 10),
    exclude: uniq([...ai.exclude, ...seed.exclude], 12),
    category: seed.category,
    brand: ai.brand || null,
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
  const clauses = _splitSearchIntents(raw);
  if (clauses.length >= 2) {
    const per = Math.max(6, Math.ceil(limit / clauses.length) + 2);
    const results = await Promise.all(clauses.map(c => searchProductsForQuery(c, locations, per)));
    const seen = new Set();
    const products = [];
    for (const r of results) {
      for (const p of (r.products || [])) {
        const key = `${p.item_id || ''}|${p.shop_id || ''}|${p.product_name || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        products.push(p);
        if (products.length >= limit) break;
      }
      if (products.length >= limit) break;
    }
    if (products.length) {
      return { products, mode: 'ok', domain: null, terms: _searchTerms(raw), brand: null };
    }
    return {
      products: [],
      mode: 'clarify',
      domain: detectSearchDomain(raw.toLowerCase()),
      terms: _searchTerms(raw),
      brand: null,
    };
  }
  const cleaned = cleanDiscoveryQuery(raw) || raw;
  const lower = cleaned.toLowerCase();
  const terms = _searchTerms(cleaned);
  const domain = detectSearchDomain(lower);
  const phrase = lower;

  // Smart, multilingual query plan (curated craft map + DeepSeek, cached).
  // plan.brand is a corrected/canonical brand name DeepSeek recognized in the
  // text (e.g. "Valentina" -> "Valentino"), never an invented one — see the
  // "never invent" rule in _deepseekPlan's system prompt.
  const plan = await planSearch(cleaned);
  const planQueries = (plan.queries || []).filter(Boolean);
  const exclude = plan.exclude || [];
  const brand = plan.brand || null;
  const synonyms = _planSynonymTerms(terms, planQueries);
  const opts = { synonyms, exclude };

  // Fetch the original phrase + every planned query in PARALLEL, merge + dedupe.
  // The corrected brand (if any) runs as its own query too, right after the
  // raw phrase — a typo like "Valentina" often won't trigram-match anything,
  // but the corrected "Valentino" can find real listings the raw text misses.
  const pool = [];
  const seenQ = new Set();
  const runQ = async (q) => {
    const qq = _sanitizeSearchToken(q);
    if (!qq || seenQ.has(qq.toLowerCase())) return [];
    seenQ.add(qq.toLowerCase());
    return searchListings(qq, locations, Math.max(limit * 2, 40));
  };
  const queries = [cleaned, ...(brand ? [brand] : []), ...planQueries].slice(0, 9);
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
      return { products: [], mode: 'clarify', domain, terms, brand };
    }
  }

  // Last-resort rescue: typo-tolerant keyword match (same fuzzy pool used by
  // the Produk-page autosuggest) against the niche/type terms, dropping any
  // brand token that clearly didn't survive to a real listing.
  if (!ranked.length) {
    const fuzzyBase = brand ? cleaned.replace(new RegExp(_rbNormStr(brand), 'i'), ' ') : cleaned;
    const fuzzyHits = await _rbFuzzyMatch(fuzzyBase, 4);
    if (fuzzyHits.length) {
      const extra = await Promise.all(fuzzyHits.map(h => runQ(h.keyword)));
      for (const r of extra) mergePool(pool, r);
      ranked = filterRelevantHits(pool, terms, phrase, opts);
      if (!ranked.length) ranked = pool.slice(0, limit);
    }
  }

  if (ranked.length) {
    return { products: mergePool([], ranked).slice(0, limit), mode: 'ok', domain, terms, brand };
  }
  return { products: [], mode: 'clarify', domain, terms, brand };
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
  return `<p>${lead}</p>
    <p class="dd-sub">Kami catat pencarian ini untuk pertimbangan scrape berikutnya.</p>
    <p>${ask}</p>
    <div class="chips" style="margin-top:10px">${suggestions.map(s =>
      `<button type="button" class="chip" data-suggest-q="${esc(s.q)}">${esc(s.label)}</button>`
    ).join('')}</div>`;
}

// Best-effort telemetry for the true "belum ketemu" dead end — see
// supabase/migrations/20260811130000_uncovered_searches.sql. Never blocks or
// throws into the reply path; a missed log beats a broken search reply.
async function logUncoveredSearch(rawText, opts = {}) {
  if (!_supabase) return;
  const query_raw = String(rawText || '').trim().slice(0, 200);
  if (query_raw.length < 2) return;
  try {
    await _supabase.from('uncovered_searches').insert({
      query_raw,
      brand: opts.brand || null,
      category: opts.category || null,
      user_id: currentUser?.id || null,
    });
  } catch (_) { /* best-effort only */ }
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
  const qLabel = esc(opts.label || text);
  let lead;
  if (opts.nearby) {
    lead = en
      ? `No product for \u201c${qLabel}\u201d${placeLabel ? ` around <strong>${esc(placeLabel)}</strong>` : ''}. These nearby listings are similar:`
      : `Belum ketemu produk untuk \u201c${qLabel}\u201d${placeLabel ? ` di sekitar <strong>${esc(placeLabel)}</strong>` : ''}. Ini produk dari pasar terdekat:`;
  } else {
    lead = en
      ? `Products matching \u201c${qLabel}\u201d${placeLabel ? ` around <strong>${esc(placeLabel)}</strong>` : ''} \u2014 each row is one listing:`
      : `Produk yang cocok dengan \u201c${qLabel}\u201d${placeLabel ? ` di sekitar <strong>${esc(placeLabel)}</strong>` : ''} \u2014 tiap baris itu satu listing:`;
  }
  // When the query named a brand (DeepSeek-corrected) but none of the markets
  // we're about to show actually carry it, say so explicitly instead of
  // silently substituting the closest product type \u2014 this is the
  // brand-vs-type breakdown the "belum ketemu untuk brand X" reports asked for.
  let brandNote = '';
  if (opts.brand) {
    const bNorm = _rbNormStr(opts.brand);
    const brandSeen = types.some(t => _rbNormStr(`${t.keyword || ''} ${t.rep_product_name || ''}`).includes(bNorm));
    if (!brandSeen) {
      brandNote = en
        ? `<p>We don't have data for the brand <strong>${esc(opts.brand)}</strong> \u2014 showing the closest matching product type instead:</p>`
        : `<p>Brand <strong>${esc(opts.brand)}</strong> belum ada di data kami \u2014 menampilkan tipe produk yang paling mirip:</p>`;
    }
  }
  const petaId = 'peta-' + Date.now();
  const pool = await resolveListingPool({ q: opts.label || text });
  if (types.length && !pool.keywords.length) pool.keywords = types;
  const html = `${brandNote}<p>${lead}</p><div data-lrow-block>${listingBlockHtml(pool, {
    petaId, query: opts.label || text, chipKw: pool.primaryKw || '', compact: true,
  })}</div>`;
  if (loading) await revealAssistant(loading, html);
  else await appendAssistantStream(html);
  pushMessage(chat, 'assistant', {
    text: 'Hasil produk', q: text, level: 'listing', types: types.map(t => t.keyword),
  }, html);
  const block = document.querySelector(`[data-lrow-block] .peta-host#${CSS.escape(petaId)}`)?.closest('[data-lrow-block]')
    || $('chat-thread')?.querySelector('[data-lrow-block]:last-of-type');
  if (block) bindListingBlock(block, pool, { query: opts.label || text, compact: true });
  void (async () => {
    const host = document.getElementById(petaId);
    if (!host) return;
    if (window.PetaPeluang && typeof PetaPeluang.skeleton === 'function') {
      PetaPeluang.skeleton(host, opts.label || text);
    }
    const listings = pool.listings.length ? pool.listings : await fetchPetaListings(text, types);
    mountPeta(host, opts.label || text, listings.slice(0, 200), listingPetaExtra(block || host.parentElement, listings));
  })();
  void logUserEvent('discover_view', {
    ui: 'gpt', q: text, count: types.length, level: 'pasar', nearby: opts.nearby ? 1 : 0,
  });
  return true;
}

async function replyWithCategoryProducts(chat, text, cat) {
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk ${esc(cat)} dari data LarisID…</p>`);
  const place0 = parsePlaceFromQuery(text);
  if (isCategoryLevelAsk(text.toLowerCase(), cat)) {
    const packed = await fetchCategoryPasarTypes([cat], place0.city || state.onboarding.city || '', {
      limit: FINDER_PASAR_LIMIT,
    });
    if (packed.types.length && await replyWithPasarTypes(chat, text, packed.types, {
      loading, label: cat, placeLabel: place0.label || place0.city || '',
    })) return;
  } else {
    const q0 = cleanDiscoveryQuery(place0.cleaned || text) || (place0.cleaned || text);
    const typeHits = await searchProductTypes(q0, place0.city || '', 12);
    if (await replyWithPasarTypes(chat, text, typeHits, {
      loading, label: q0, placeLabel: place0.label || place0.city || '',
    })) return;
    const showcase = await fetchCategoryShowcase(cat, 24);
    const types = await typesForListings(showcase, place0.city || '', FINDER_PASAR_LIMIT);
    if (types.length && await replyWithPasarTypes(chat, text, types, {
      loading, label: cat, placeLabel: place0.label || place0.city || '',
    })) return;
  }

  const gate = await ensureIntentChat(chat, text.slice(0, 60), { kind: 'category_search', category: cat, q: text });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  state.recommendations = [];
  const html = `<p>Belum ketemu pasar di kategori <strong>${esc(cat)}</strong>. Coba kata kunci lain atau buka Cari Produk.</p>`;
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

  const recKws = [...new Set(out.map(p => p.keyword).filter(Boolean))];
  if (recKws.length && _supabase) {
    try {
      const { data } = await _supabase.from('mv_niche_breakout')
        .select('keyword,breakout_rate,new_items,breakouts')
        .in('keyword', recKws);
      const byKw = new Map((data || []).map(r => [r.keyword, r]));
      for (const p of out) p._niche = byKw.get(p.keyword) || null;
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
  // The velocity nowcast (product_velocity, joined into listings_deduped) comes
  // first: it blends every observation the product has, recency-weighted, and
  // decays toward its peer cohort as the product goes stale, so it does not
  // present a two-month-old measurement as today's rate. Populated for every
  // product, never NULL. `>= 0` not `> 0` — a genuine zero is ground truth for
  // a product that has never sold, and must not fall through to a guess.
  const nv = Number(p.nowcast_velocity_daily);
  if (Number.isFinite(nv) && nv >= 0 && p.nowcast_velocity_daily != null) {
    return Math.min(nv, DD_MAX_SOLD_PER_DAY);
  }
  // Day-of-scrape estimate (refresh_omset_estimates) when the nowcast is absent.
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
  // Nowcast first, for the same reason as soldPerDayEst.
  const no = Number(p.nowcast_omset_monthly);
  if (Number.isFinite(no) && no >= 0 && p.nowcast_omset_monthly != null) return no;
  // Prefer the stored monthly omset estimate when present (real delta or cohort).
  const eo = Number(p.est_omset_monthly);
  if (Number.isFinite(eo) && eo >= 0 && (p.est_omset_monthly != null)) return eo;
  const price = Number(p.price) || 0;
  const spd = soldPerDayEst(p);
  if (price > 0 && spd > 0) return Math.round(price * spd * 30);
  return 0;
}

/** Card omset is terukur only for latest/blend (docs/listing-weekly.md). Aggregates stay perkiraan. */
function omsetHonesty(p, opts) {
  if (opts && opts.aggregate) {
    return {
      label: 'perkiraan',
      tip: 'Angka agregat pasar (bukan satu listing). Perkiraan dari model kecepatan LarisID, bukan angka resmi Shopee.',
    };
  }
  const method = String(p && p.nowcast_method || '').toLowerCase();
  const terukur = method === 'latest' || method === 'blend';
  return {
    label: terukur ? 'terukur' : 'perkiraan',
    tip: terukur
      ? 'Laju penjualan baru diukur dari scrape terbaru, lalu dikalikan 30 hari. Bukan jaminan penjualanmu.'
      : 'Perkiraan dari model kecepatan LarisID — bukan angka resmi Shopee. Scrapes kami 12–17 hari sekali.',
  };
}

function omsetChipHtml(p, opts) {
  const h = omsetHonesty(p, opts);
  return `<span class="omset-chip omset-chip--${h.label}" title="${esc(h.tip)}">${h.label}</span>`;
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
    nowcast_velocity_daily: p.nowcast_velocity_daily,
    nowcast_omset_monthly: p.nowcast_omset_monthly,
    nowcast_confidence: p.nowcast_confidence,
    nowcast_method: p.nowcast_method,
    is_ad: p.is_ad,
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
  if (Array.isArray(chat.context?.compareProducts)) rememberProducts(chat.context.compareProducts);
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
  if (Array.isArray(chat?.context?.compareProducts)) {
    const hit = chat.context.compareProducts.find(match);
    if (hit) return hit;
  }
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
        .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
        .eq('item_id', item_id)
        .eq('shop_id', shop_id)
        .order('scraped_at', { ascending: false })
        .limit(1)
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

function productCardHtml(p, i, omsetRange, score) {
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
  const picking = !!(state.comparePick && state.view === 'directory');
  const picked = picking && (state.comparePick.selected || []).some(x => prodKey(x) === key);
  const tag = picking ? 'div' : 'button';
  const pickAttrs = picking
    ? ` role="button" tabindex="0" aria-pressed="${picked ? 'true' : 'false'}"`
    : ' type="button"';
  const check = picking
    ? `<span class="prod-card-check" aria-hidden="true">${ico('check', 12)}</span>`
    : '';
  const glyph = (score && window.PetaPeluang)
    ? `<div class="prod-card-sidik">${PetaPeluang.sidikJariHtml(score)}<span class="prod-stat-val" style="font-size:.68rem">${score.total}</span></div>`
    : '';
  return `<${tag} class="prod-card${picking ? ' prod-card--pick' : ''}${picked ? ' is-picked' : ''}" data-prod="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''}${pickAttrs} style="animation-delay:${i * 0.06}s">
    ${check}
    ${img ? `<img src="${esc(imgThumb(img))}" alt="" loading="lazy" decoding="async" width="320" height="320">` : '<div class="prod-card-ph"></div>'}
    <div class="prod-card-body">
      <div class="prod-card-name-row">
        <div class="prod-card-name">${esc(name)}</div>
        <span class="prod-card-views" hidden data-view-key="${esc(vk)}" title="Orang yang melihat produk ini di Laris tahun ini">${ico('eye', 11)}<span data-view-num>${viewers.toLocaleString('id-ID')}</span></span>
      </div>
      <div class="prod-card-stats prod-card-stats--slim">
        <div class="prod-stat">
          <span class="prod-stat-lbl">Omset/bulan</span>
          <span class="prod-stat-val">${omsetVal}</span>
          ${omsetChipHtml(p, { aggregate: lo > 0 && hi > 0 })}
          <span class="prod-card-wow-wrap" data-prod-wow="${esc(key)}">${prodCardWowHtml(p)}</span>
        </div>
        ${glyph}
      </div>
    </div>
  </${tag}>`;
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
  return list.map((p, i) => productCardHtml(p, i, range, petaScoreFor(p, list))).join('');
}

function fmtTrendPct(n) {
  const v = Math.round(Number(n) || 0);
  return (v > 0 ? '+' : '') + v + '%';
}

function listingTrendTitle(t) {
  if (!t || t.pending) return 'Menghitung kenaikan omset…';
  if (t.belum || t.wkPct == null) {
    return 'Belum cukup data mingguan (butuh 4 minggu, omset sebelumnya tidak terlalu kecil).';
  }
  return 'Kenaikan omset dari rata-rata 2 minggu terakhir vs 2 minggu sebelumnya, disetarakan ke 7 hari — bukan vs kalender minggu lalu. '
    + (t.terukur ? 'terukur' : 'perkiraan')
    + '. /bln = 4 minggu vs 4 minggu sebelumnya.';
}

function listingTrendInnerHtml(p) {
  const t = p && p._petaTrend;
  if (!t || t.pending) return '<span class="lrow-trend-pending">…</span>';
  if (t.belum || t.wkPct == null) return '—';
  const wkCls = t.wkPct > 0 ? 'is-up' : t.wkPct < 0 ? 'is-down' : 'is-flat';
  const mo = t.moPct == null ? '—' : fmtTrendPct(t.moPct);
  const moCls = t.moPct == null ? '' : (t.moPct > 0 ? 'is-up' : t.moPct < 0 ? 'is-down' : 'is-flat');
  return `<span class="lrow-trend-wk ${wkCls}">${fmtTrendPct(t.wkPct)} <small>/mgg</small></span>`
    + `<span class="lrow-trend-mo ${moCls}">${mo} <small>/bln</small></span>`;
}

function listingTrendCellHtml(p) {
  return `<td class="lrow-trend" title="${esc(listingTrendTitle(p && p._petaTrend))}">${listingTrendInnerHtml(p)}</td>`;
}

function listingRowHtml(p, opts = {}) {
  rememberProducts([p]);
  const key = prodKey(p);
  const name = p.product_name || p.keyword || 'Produk';
  const toko = p.store_name || '—';
  const img = p.image_url || '';
  const omset = estOmsetBulan(p);
  const usia = listingUsiaLabel(p);
  const reviews = Number(p.reviews) || 0;
  const sold = Number(p.total_sold) || 0;
  const price = Number(p.price) || 0;
  const snap = productSnapshot(p);
  const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
  const picking = !!opts.pick;
  const picked = picking && (state.comparePick?.selected || []).some(x => prodKey(x) === key);
  const hl = opts.highlightKey && opts.highlightKey === key;
  const cls = [
    'lrow',
    picking ? 'is-pickable' : '',
    picked ? 'is-picked' : '',
    hl ? 'is-sel' : '',
  ].filter(Boolean).join(' ');
  const check = picking
    ? `<td class="lrow-pick"><span class="lrow-check" aria-hidden="true">${ico('check', 12)}</span></td>`
    : '';
  // One thumb only — onerror swaps the <img> for a placeholder (do not leave a
  // hidden sibling: `.lrow-img { display:block }` overrides UA `[hidden]`).
  const thumb = img
    ? `<img class="lrow-img" src="${esc(imgThumb(img))}" alt="" loading="lazy" decoding="async" width="84" height="84" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'lrow-img lrow-img--ph'}))">`
    : '<div class="lrow-img lrow-img--ph"></div>';
  return `<tr class="${cls}" data-prod="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''} tabindex="0" role="button" aria-pressed="${picked ? 'true' : 'false'}">
    ${check}
    <td class="lrow-prod">${thumb}
      <div class="lrow-prod-txt">
        <div class="lrow-name">${esc(name)}</div>
        <div class="lrow-toko">${esc(toko)}</div>
        <div class="lrow-meta">${reviews ? fmtSold(reviews) + ' ulasan' : '0 ulasan'} · ${esc(usia.text)}</div>
      </div>
    </td>
    <td class="lrow-num">${price ? fmtRp(price) : '—'}</td>
    <td class="lrow-num">${omset ? fmtOmset(omset) : '—'}${omsetChipHtml(p)}</td>
    ${listingTrendCellHtml(p)}
    <td class="lrow-num">${sold ? fmtSold(sold) : '0'}</td>
    <td class="lrow-num lrow-wide">${reviews ? fmtSold(reviews) : '0'}</td>
    <td class="lrow-num lrow-wide" title="${esc(usia.title)}">${esc(usia.text)}</td>
  </tr>`;
}

function listingRowsHtml(list, opts = {}) {
  const rows = list || [];
  if (!rows.length) return '';
  const pick = !!opts.pick;
  const sort = opts.sort || '';
  const th = (key, label) => {
    const on = sort === key || (key === 'termurah' && (sort === 'termurah' || sort === 'termahal'));
    return `<th scope="col" data-lrow-sort="${key}" class="${on ? 'is-on' : ''}">${label}</th>`;
  };
  return `<div class="lrow-wrap${opts.compact ? ' lrow-wrap--compact' : ''}${pick ? ' lrow-wrap--pick' : ''}"${opts.keepChat ? ' data-lrow-keepchat="1"' : ''}>
    <table class="ddr-table lrow-table">
      <thead><tr>
        ${pick ? '<th class="lrow-pick"></th>' : ''}
        <th>Produk</th>
        ${th('termurah', 'Harga')}
        ${th('omset', 'Omset')}
        ${th('trending', 'Trending')}
        ${th('terlaris', 'Unit jual')}
        ${th('review', 'Review')}
        ${th('terbaru', 'Usia')}
      </tr></thead>
      <tbody>${rows.map(p => listingRowHtml(p, opts)).join('')}</tbody>
    </table>
  </div>`;
}

function listingUnsoldNote(n) {
  const c = Number(n) || 0;
  if (c <= 0) return '';
  return `<p class="dd-sub">${c.toLocaleString('id-ID')} listing belum terjual tidak ditampilkan.</p>`;
}

function prodKey(p) {
  return `${p?.item_id}|${p?.shop_id}`;
}

function bindProductCards(root) {
  (root || document).querySelectorAll('[data-prod]').forEach(btn => {
    if (btn.dataset.boundProd) return;
    btn.dataset.boundProd = '1';
    const onPick = () => {
      const key = btn.getAttribute('data-prod');
      const [item_id, shop_id] = key.split('|');
      void (async () => {
        const p = await resolveProduct(item_id, shop_id, btn);
        if (!p) {
          showToast('Produk tidak ditemukan — coba cari lagi');
          return;
        }
        if (state.comparePick && state.view === 'directory') {
          toggleComparePickProduct(p);
          return;
        }
        if (userNeverDeepDived()) {
          const surface = state.view === 'directory' ? 'dir' : 'chat';
          void logUserEvent('dir_first_click_deepdive', { ui: 'gpt', keyword: p.keyword || '', surface });
        }
        const keepChat = !!(btn.closest && btn.closest('[data-lrow-keepchat]'));
        void openDeepDive(p, keepChat ? { keepChat: true } : {});
      })();
    };
    btn.addEventListener('click', onPick);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPick();
      }
    });
  });
  (root || document).querySelectorAll('#btn-more-products').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        showToast('Mau cari apa? Ketik di kotak pencarian di bawah.');
      } catch (_) {}
      const input = document.getElementById('composer-input');
      if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
  bindSearchSuggests(root);
  void hydrateProdCardsIn(root);
}

function bindListingRows(root, extra = {}) {
  bindProductCards(root);
  (root || document).querySelectorAll('.lrow-wrap').forEach(w => {
    if (w.dataset.boundLrowSort) return;
    w.dataset.boundLrowSort = '1';
    w.addEventListener('click', (e) => {
      const th = e.target.closest?.('[data-lrow-sort]');
      if (!th || !w.contains(th) || !extra.onSort) return;
      e.preventDefault();
      e.stopPropagation();
      let mode = th.getAttribute('data-lrow-sort');
      if (mode === 'termurah' && (state.dirSort === 'termurah')) mode = 'termahal';
      extra.onSort(mode);
    });
    if (extra.onHover) {
      w.addEventListener('pointerover', (e) => {
        const tr = e.target.closest?.('[data-prod]');
        extra.onHover(tr ? tr.getAttribute('data-prod') : null);
      });
      w.addEventListener('pointerleave', () => extra.onHover(null));
    }
  });
}

function refreshLrowTrendCells(root, listings) {
  const map = new Map((listings || []).map(p => [prodKey(p), p]));
  (root || document).querySelectorAll('.lrow').forEach(tr => {
    const p = map.get(tr.getAttribute('data-prod'));
    const cell = tr.querySelector('.lrow-trend');
    if (!cell || !p) return;
    cell.title = listingTrendTitle(p._petaTrend);
    cell.innerHTML = listingTrendInnerHtml(p);
  });
}

function listingPetaExtra(tableRoot, listings) {
  return {
    list: false,
    onTrend: () => { refreshLrowTrendCells(tableRoot, listings); },
    onHighlight: (listing) => {
      if (!tableRoot) return;
      const key = listing ? prodKey(listing) : '';
      tableRoot.querySelectorAll('.lrow').forEach(tr => {
        const on = !!(key && tr.getAttribute('data-prod') === key);
        tr.classList.toggle('is-hl', on);
        if (on) tr.scrollIntoView({ block: 'nearest' });
      });
    },
    onZoneFilter: (_id, list) => {
      if (!tableRoot) return;
      const keys = list ? new Set(list.map(prodKey)) : null;
      tableRoot.querySelectorAll('.lrow').forEach(tr => {
        const k = tr.getAttribute('data-prod');
        tr.hidden = !!(keys && k && !keys.has(k));
      });
    },
  };
}

function bindListingBlock(root, pool, opts = {}) {
  const block = root?.querySelector?.('[data-lrow-block]') || root;
  if (!block || !pool) return;
  const paint = (chipKw) => {
    const host = block.querySelector('.lrow-host');
    const rows = sortDirRows(filterListingPool(pool.listings, chipKw, null), opts.sort || 'omset');
    if (host) {
      host.innerHTML = listingRowsHtml(rows, { compact: opts.compact !== false, sort: opts.sort || 'omset' })
        + listingUnsoldNote(chipKw ? 0 : pool.unsold);
    }
    block.querySelectorAll('.lrow-chip').forEach(b => {
      b.classList.toggle('is-on', (b.getAttribute('data-lrow-kw') || '') === chipKw);
    });
    bindListingRows(block, {
      onHover: (key) => {
        const peta = block.querySelector('.peta-host');
        peta?._petaCtl?.hoverKey?.(key);
      },
    });
    const peta = block.querySelector('.peta-host');
    if (peta) {
      let pts = pool.listings || [];
      if (chipKw) pts = pts.filter(r => (r.keyword || '') === chipKw);
      mountPeta(peta, opts.query || '', pts.slice(0, 200), listingPetaExtra(block, pool.listings));
    }
  };
  block.querySelectorAll('[data-lrow-kw]').forEach(btn => {
    if (btn.dataset.boundChip) return;
    btn.dataset.boundChip = '1';
    btn.addEventListener('click', () => paint(btn.getAttribute('data-lrow-kw') || ''));
  });
  bindListingRows(block, {
    onHover: (key) => {
      const peta = block.querySelector('.peta-host');
      peta?._petaCtl?.hoverKey?.(key);
    },
  });
}

async function typesToListingPool(types) {
  const list = types || [];
  const listings = await fetchListingsForKeywords(list.map(t => t.keyword).filter(Boolean), 20, 300);
  return {
    keywords: list.some(t => t._terlaris) ? list : markTerlarisMinggu(list.slice()),
    listings: dedupeListings(listings),
    primaryKw: '',
    nearby: false,
    unsold: 0,
  };
}

async function revealListingPool(loading, chat, leadHtml, pool, meta) {
  const petaId = 'peta-' + Date.now();
  const html = `${leadHtml}<div data-lrow-block>${listingBlockHtml(pool, {
    petaId, chipKw: pool.primaryKw || '', compact: true, query: meta.query || '',
  })}</div>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', meta, html);
  const block = document.getElementById(petaId)?.closest('[data-lrow-block]');
  if (block) {
    bindListingBlock(block, pool, { compact: true, query: meta.query || '' });
    const host = document.getElementById(petaId);
    if (host && window.PetaPeluang) {
      PetaPeluang.skeleton(host, meta.query || '');
      mountPeta(host, meta.query || '', (pool.listings || []).slice(0, 200), listingPetaExtra(block, pool.listings));
    }
  }
  return pool;
}

function listingBlockHtml(pool, opts = {}) {
  const chip = opts.chipKw != null ? opts.chipKw : (pool.primaryKw || '');
  let rows = filterListingPool(pool.listings, chip, null);
  rows = sortDirRows(rows, opts.sort || 'omset');
  const petaId = opts.petaId || '';
  const nearbyLead = pool.nearby && opts.query
    ? `<p class="dd-sub dir-nearby-lead">Belum ketemu produk untuk “<strong>${esc(opts.query)}</strong>”. Ini produk dari pasar terdekat:</p>`
    : '';
  return `${nearbyLead}${keywordChipsHtml(pool.keywords, chip, { showSemua: true })}
    ${petaId ? `<div class="peta-host" id="${esc(petaId)}"></div>` : ''}
    <div class="lrow-host">${listingRowsHtml(rows, { compact: opts.compact !== false, sort: opts.sort || 'omset' })}${listingUnsoldNote(pool.unsold)}</div>`;
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
      ${img ? `<img src="${esc(imgThumb(img))}" alt="" loading="lazy" decoding="async">` : '<span class="dd-chat-card-ph"></span>'}
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

const GPT_SEARCH_HISTORY_KEY = 'larisid_search_history_v1';
const GPT_SEARCH_HISTORY_MAX = 50;
let _gptLastLoggedSearch = '';

function gptLogSearchHistory(keyword, source) {
  const kw = String(keyword || '').trim().slice(0, 120);
  if (!kw) return;
  const norm = kw.toLowerCase();
  if (norm === _gptLastLoggedSearch) return;
  _gptLastLoggedSearch = norm;
  try {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(GPT_SEARCH_HISTORY_KEY) || '[]'); } catch (_) {}
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(e => !(e && String(e.keyword || '').toLowerCase() === norm));
    arr.unshift({ keyword: kw, item_id: null, source: source || 'search', created_at: new Date().toISOString() });
    if (arr.length > GPT_SEARCH_HISTORY_MAX) arr = arr.slice(0, GPT_SEARCH_HISTORY_MAX);
    localStorage.setItem(GPT_SEARCH_HISTORY_KEY, JSON.stringify(arr));
  } catch (_) {}
  if (_supabase && currentUser) {
    try {
      _supabase.from('user_search_history').insert({
        user_id: currentUser.id,
        keyword: kw,
        source: source || 'search',
      }).then(() => {}, () => {});
    } catch (_) {}
  }
}

async function gptRecentSearchKeywords(limit) {
  const out = [];
  const seen = new Set();
  const push = (kw) => {
    const k = String(kw || '').toLowerCase().trim();
    if (!k || k.length < 2 || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  try {
    const raw = localStorage.getItem(GPT_SEARCH_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) arr.forEach(e => push(e && e.keyword));
  } catch (_) {}
  if (_supabase && currentUser) {
    try {
      const { data } = await _supabase.from('user_search_history')
        .select('keyword,created_at')
        .eq('user_id', currentUser.id)
        .not('keyword', 'is', null)
        .order('created_at', { ascending: false })
        .limit(40);
      (data || []).forEach(r => push(r.keyword));
    } catch (_) {}
    try {
      const { data } = await _supabase.from('activity_events')
        .select('event_type,metadata,created_at')
        .eq('user_id', currentUser.id)
        .eq('event_type', 'search_query')
        .order('created_at', { ascending: false })
        .limit(40);
      (data || []).forEach(r => {
        const m = r.metadata || {};
        push(m.query || m.keyword || m.q);
      });
    } catch (_) {}
  }
  return out.slice(0, limit || 12);
}

/** Local YYYY-MM-DD for `n` days ago (negative n = days ahead). Series RPCs
 *  clamp p_to to current_date+7 so a 1-week forecast tail can be requested. */
function _isoDaysAgo(n) {
  const d = new Date(Date.now() - (Number(n) || 0) * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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
    // Called by commit() right before requireAuth blocks it — the login modal
    // (and the Google OAuth reload) is about to wipe the in-progress wizard,
    // so stash it the same way pendingFinder/pendingDeepdive/pendingCompare
    // already survive that round-trip. Restored in _authOnSignIn().
    savePendingDraft(snapshot) {
      state.pendingTracker = snapshot;
      saveLocalState();
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
    // Was previously wired to the kebab menu's "Buka Deep Dive" via
    // openDiscovery(), which ignored the passed key entirely and just opened
    // the generic product directory — never that specific product. Resolves
    // a representative listing for the keyword via product_types_v (the
    // same source the directory/search cards already use) and opens the
    // real Deep Dive for it.
    async openKeywordDeepDive(keyword) {
      if (!keyword || !_supabase) { try { openDirectory(); } catch (_) {} return; }
      try {
        const { data } = await _supabase.from('product_types_v')
          .select(ptypeCols()).eq('city', 'ALL').eq('keyword', keyword).limit(1);
        const t = data && data[0];
        if (t) { void openDeepDive(typeRepProduct(t)); return; }
      } catch (_) {}
      try { openDirectory(); } catch (_) {}
    },
    // Top listings for the detail picker (Semua vs one SKU). listings_deduped
    // is one row per (item_id, shop_id, keyword); offtopic ads are filtered.
    async getKeywordTopListings(keyword) {
      if (!keyword || !_supabase) return [];
      const cols = 'item_id,shop_id,store_name,product_name,image_url,price,total_sold,reviews';
      const kw = String(keyword).trim();
      try {
        let q = await _supabase.from('listings_deduped')
          .select(cols).eq('keyword', kw.toLowerCase())
          .eq('is_offtopic', false)
          .order('total_sold', { ascending: false }).limit(30);
        if ((!q.data || !q.data.length) && kw !== kw.toLowerCase()) {
          q = await _supabase.from('listings_deduped')
            .select(cols).eq('keyword', kw)
            .eq('is_offtopic', false)
            .order('total_sold', { ascending: false }).limit(30);
        }
        return q.data || [];
      } catch (_) { return []; }
    },
    async getStoreTopListings(shopId) {
      if (shopId == null || !_supabase) return [];
      try {
        const { data } = await _supabase.from('listings_deduped')
          .select('item_id,shop_id,store_name,product_name,image_url,price,total_sold,reviews')
          .eq('shop_id', shopId)
          .eq('is_offtopic', false)
          .order('total_sold', { ascending: false })
          .limit(60);
        return mergePool([], data || []);
      } catch (_) { return []; }
    },
    // Batch listing_weekly for the tracker Kompetitor-style table (this week +
    // prior weeks so the picker can show WoW %). item_id IN is enough; the
    // client matches (item_id, shop_id) pairs.
    async getListingsWeeklyBatch(listings) {
      if (!_supabase || !listings || !listings.length) return [];
      const ids = [...new Set(listings.map(l => l.item_id).filter(id => id != null))];
      if (!ids.length) return [];
      try {
        const since = new Date();
        since.setUTCDate(since.getUTCDate() - 28);
        const sinceISO = since.toISOString().slice(0, 10);
        const { data, error } = await _supabase.from('listing_weekly')
          .select('item_id,shop_id,week_start,units_wk,omset_wk,price,source')
          .in('item_id', ids)
          .gte('week_start', sinceISO)
          .order('week_start', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (_) { return []; }
    },
    /** Price + title moves among top competitors — tracker card pulse rows. */
    async getCompetitorPulse(scope, entityId) {
      if (!_supabase || !entityId) return null;
      const isKw = scope === 'keyword';
      const listings = isKw
        ? await this.getKeywordTopListings(entityId)
        : await this.getStoreTopListings(entityId);
      if (!listings.length) return null;

      const wibMon = (() => {
        const s = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const [y, m, day] = s.split('-').map(Number);
        const utc = Date.UTC(y, m - 1, day);
        const dow = new Date(utc).getUTCDay();
        const off = dow === 0 ? 6 : dow - 1;
        return new Date(utc - off * 864e5).toISOString().slice(0, 10);
      })();
      const prevMon = new Date(Date.parse(wibMon + 'T00:00:00Z') - 7 * 864e5)
        .toISOString().slice(0, 10);

      const weekly = await this.getListingsWeeklyBatch(listings);
      const priceShops = new Set();
      const priceListings = new Set();
      const byKey = {};
      (weekly || []).forEach(w => {
        const k = `${w.item_id}|${w.shop_id}`;
        if (!byKey[k]) byKey[k] = {};
        byKey[k][String(w.week_start || '').slice(0, 10)] = w;
      });
      Object.keys(byKey).forEach(k => {
        const cur = byKey[k][wibMon];
        const prev = byKey[k][prevMon];
        if (!cur || !prev) return;
        const p0 = Number(prev.price) || 0;
        const p1 = Number(cur.price) || 0;
        if (p0 <= 0 || p1 <= 0) return;
        if (Math.abs(p1 - p0) < Math.max(100, p0 * 0.005)) return;
        priceListings.add(k);
        priceShops.add(k.split('|')[1]);
      });

      const normTitle = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const titleChanges = new Set();
      try {
        const since = new Date(Date.now() - 60 * 864e5).toISOString();
        let q = _supabase.from('listings')
          .select('item_id,shop_id,product_name,scraped_at')
          .gte('scraped_at', since)
          .order('scraped_at', { ascending: false })
          .limit(2500);
        q = isKw
          ? q.eq('keyword', String(entityId).trim().toLowerCase())
          : q.eq('shop_id', Number(entityId));
        const { data: hist } = await q;
        const byItem = new Map();
        for (const r of (hist || [])) {
          const k = `${r.item_id}|${r.shop_id}`;
          if (!byItem.has(k)) byItem.set(k, []);
          const arr = byItem.get(k);
          const day = String(r.scraped_at || '').slice(0, 10);
          if (!day) continue;
          if (!arr.length || arr[arr.length - 1].day !== day) {
            arr.push({ day, name: normTitle(r.product_name) });
          }
        }
        byItem.forEach((snaps, k) => {
          if (snaps.length < 2) return;
          if (snaps[0].name && snaps[1].name && snaps[0].name !== snaps[1].name) {
            titleChanges.add(k);
          }
        });
      } catch (_) { /* title pulse is optional */ }

      return {
        priceShops: priceShops.size,
        priceListings: priceListings.size,
        titleChanges: titleChanges.size,
      };
    },
    // Prefer product_daily_series (server already folds review-based estimates
    // into daily units). Fall back to scrape snapshots with units_sold.
    async getProductSeries(listing, days) {
      if (!listing || listing.item_id == null || listing.shop_id == null || !_supabase) return [];
      const since = _isoDaysAgo(days);
      try {
        const { data, error } = await _supabase.rpc('product_daily_series', {
          p_item_id: listing.item_id,
          p_shop_id: listing.shop_id,
          p_from: since,
          p_to: _isoDaysAgo(-7),
        });
        if (!error && Array.isArray(data) && data.length >= 2) {
          const real = data.filter(p => p.source === 'measured' || p.source === 'estimated');
          if (real.some(p => Number(p.units) > 0)) return data;
        }
      } catch (_) { /* fall through */ }
      let rows = [];
      try {
        const { data, error } = await _supabase.rpc('product_trend_history', {
          p_item_id: listing.item_id,
          p_shop_id: listing.shop_id,
          p_limit: 80,
        });
        if (!error && data?.length) rows = data;
      } catch (_) { /* fall through */ }
      if (!rows.length) {
        try {
          const { data } = await _supabase.from('listings')
            .select('scraped_at,total_sold,price,reviews,units_sold,units_source')
            .eq('item_id', listing.item_id)
            .eq('shop_id', listing.shop_id)
            .gte('scraped_at', since + 'T00:00:00')
            .order('scraped_at', { ascending: true })
            .limit(80);
          rows = data || [];
        } catch (_) { return []; }
      }
      const byDay = new Map();
      for (const r of rows) {
        const d = String(r.scraped_at || '').slice(0, 10);
        if (!d || d < since) continue;
        byDay.set(d, r);
      }
      const daysAsc = [...byDay.keys()].sort();
      if (daysAsc.length < 2) return [];
      const out = [];
      for (let i = 0; i < daysAsc.length; i++) {
        const d = daysAsc[i];
        const cur = byDay.get(d);
        const prev = i > 0 ? byDay.get(daysAsc[i - 1]) : null;
        let units = 0;
        let src = 'measured';
        if (prev) {
          if (cur.units_sold != null) {
            units = Math.max(0, Number(cur.units_sold) || 0);
            src = cur.units_source === 'estimated' ? 'estimated' : 'measured';
          } else {
            const raw = Math.max(0, (Number(cur.total_sold) || 0) - (Number(prev.total_sold) || 0));
            const revDelta = Math.max(0, (Number(cur.reviews) || 0) - (Number(prev.reviews) || 0));
            const reviewEst = Math.round(revDelta * 3.2);
            if (raw === 0 && reviewEst > 0) { units = reviewEst; src = 'estimated'; }
            else if (raw > 0 && reviewEst > 0 && raw > reviewEst * 5) { units = reviewEst; src = 'estimated'; }
            else units = raw;
          }
        }
        const price = Number(cur.price) || 0;
        out.push({ d, units, omset: Math.round(units * price), price, source: src });
      }
      return out;
    },

    // Dense daily series for the tracker's charts and stat blocks.
    //
    // get_tracker_rollup only ever returns the raw scrape buckets, which are
    // sparse (a keyword can have 2 buckets in 90 days) and — because a
    // bucket's span can overlap the previous bucket's span — double-count
    // when summed, which is what made the headline Omset/Unit figures look
    // arbitrary. keyword_daily_series/store_daily_series resolve both: they
    // de-overlap (one interval wins per day) and fill every remaining day
    // from the velocity nowcast, tagging each day `measured` / `forecast` /
    // `prior` so the UI can stay honest about which is which. ~25-40ms each.
    async getKeywordSeries(keyword, days) {
      if (!keyword || !_supabase) return [];
      try {
        const { data, error } = await _supabase.rpc('keyword_daily_series', {
          p_keyword: String(keyword).trim().toLowerCase(),
          p_from: _isoDaysAgo(days), p_to: _isoDaysAgo(-7),
        });
        if (error) throw error;
        return data || [];
      } catch (_) { return []; }
    },
    async getStoreSeries(shopId, days) {
      if (shopId == null || !_supabase) return [];
      try {
        const { data, error } = await _supabase.rpc('store_daily_series', {
          p_shop_id: Number(shopId),
          p_from: _isoDaysAgo(days), p_to: _isoDaysAgo(-7),
        });
        if (error) throw error;
        return data || [];
      } catch (_) { return []; }
    },
    async getListingWeekly(itemId, shopId) {
      if (itemId == null || shopId == null || !_supabase) return [];
      try {
        const { data, error } = await _supabase.rpc('listing_weekly_for', {
          p_item_id: itemId, p_shop_id: shopId, p_weeks: 8,
        });
        if (error) throw error;
        return data || [];
      } catch (_) { return []; }
    },
    async getKeywordWeekly(keyword) {
      if (!keyword || !_supabase) return [];
      try {
        const { data, error } = await _supabase.rpc('keyword_weekly_for', {
          p_keyword: String(keyword).trim(), p_weeks: 8,
        });
        if (error) throw error;
        return data || [];
      } catch (_) { return []; }
    },
    openTrackerView() { openTrackerView(); },
    openHowCalculated() { setView('faq'); },

    getTracking()          { return rpc('get_my_tracking'); },
    // Reads mv_keyword_daily / mv_shop_daily, tiled from listing_deltas
    // (refresh_listing_deltas after each scrape day).
    getRollup(days, scope) { return rpc('get_tracker_rollup', { p_days: days, p_scope: scope || 'keyword' }); },
    touchViewed()          { return rpc('touch_tracker_viewed'); },
    // These two are the wizard's only commit routes, so retiring the Deep Dive
    // promo here covers the full-panel flow the same way quickTrackKeyword
    // covers the one-tap one. The RPCs report refusals as { ok: false } rather
    // than throwing, so a refused add must not count as a conversion.
    async addKeyword(kw, cat) {
      const d = await rpc('add_tracked_keyword', { p_keyword: kw, p_category: cat || '' });
      if (!d || d.ok !== false) ddtpRetire();
      return d;
    },
    async addStore(id, name) {
      const d = await rpc('add_tracked_store', { p_shop_id: id, p_store_name: name || '' });
      if (!d || d.ok !== false) ddtpRetire();
      return d;
    },
    getStoresByCategory(cat) { return rpc('find_shops_by_category', { p_category: cat, p_limit: 30 }); },
    removeKeyword(id)      { return rpc('remove_tracked_keyword', { p_id: id }); },
    setMetrics(list)       { return rpc('set_tracker_metrics', { p_metrics: list }); },
    // Returns { ok:false, error:'wa_number_required' } when whatsapp is picked
    // without a reachable number — the module surfaces that inline.
    setNotifyPrefs(channels, waNumber) {
      return rpc('set_tracker_notify_prefs', {
        p_channels: channels || [], p_wa_number: waNumber || null,
      });
    },
    async getStoreInfo(shopId) {
      if (!_supabase || shopId == null) return null;
      const { count } = await _supabase.from('listings_latest')
        .select('item_id', { count: 'exact', head: true }).eq('shop_id', shopId);
      const { data } = await _supabase.from('listings_latest')
        .select('store_name').eq('shop_id', shopId).limit(1);
      return { store_name: (data && data[0] && data[0].store_name) || '', n_products: count ?? null };
    },
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
    // fromTracked used to be seeded from user_tracked_products. That table has
    // been read-only since the 2026-08-10 cutover removed its write path, so it
    // could only ever suggest a pre-cutover user's stale products. Seeds now
    // come from onboarding categories alone.
    async getSeedCandidates() {
      const out = { fromTracked: [], categories: [] };
      if (!_supabase || !currentUser) return out;
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
        .select('keyword,category,category_canonical,n_sellers,price_median,n_listings,rep_image_url,total_sold_sum')
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
    async getRecentSearchKeywords(limit) {
      return gptRecentSearchKeywords(limit || 12);
    },
    async getPopularKeywords(o) {
      if (!_supabase) return [];
      const lim = (o && o.limit) || 12;
      let q = _supabase.from('product_types_v')
        .select('keyword,category,category_canonical,n_sellers,price_median,n_listings,rep_image_url,total_sold_sum')
        .eq('city', 'ALL')
        .gte('n_listings', 3)
        .order('omset_top15', { ascending: false, nullsFirst: false })
        .limit(lim);
      if (o && o.category) q = q.eq('category_canonical', o.category);
      const { data } = await q;
      return data || [];
    },
    async getKeywordBaseline(keywords) {
      if (!_supabase || !keywords || !keywords.length) return [];
      const { data } = await _supabase.from('product_types_v')
        .select('keyword,category,category_canonical,n_sellers,price_median,rep_product_name,rep_image_url,rep_store_name')
        .eq('city', 'ALL').in('keyword', keywords).limit(20);
      return (data || []).map(r => ({
        keyword: r.keyword, category: r.category || '', category_canonical: r.category_canonical || '',
        n_sellers: r.n_sellers, price_median: r.price_median,
        top_name: r.rep_product_name, top_image: r.rep_image_url, top_store: r.rep_store_name,
      }));
    },
    async getShopLogoCache(shopIds) {
      if (!_supabase || !shopIds || !shopIds.length) return [];
      const { data } = await _supabase.from('shop_logo_cache')
        .select('shop_id,logo_url,fetched_at')
        .in('shop_id', shopIds);
      return data || [];
    },
    async fetchShopLogo(shopId) {
      if (!_supabase || shopId == null) return null;
      const { data, error } = await _supabase.functions.invoke('get-shop-logo', {
        body: { shop_id: Number(shopId) },
      });
      if (error) throw error;
      return data;
    },
    async getStoreOldestListingDates(shopIds) {
      if (!_supabase || !shopIds || !shopIds.length) return {};
      const { data } = await _supabase.from('listings_deduped')
        .select('shop_id,listing_date')
        .in('shop_id', shopIds)
        .not('listing_date', 'is', null);
      const out = {};
      (data || []).forEach(r => {
        if (r.shop_id == null || !r.listing_date) return;
        const key = String(r.shop_id);
        if (!out[key] || r.listing_date < out[key]) out[key] = r.listing_date;
      });
      return out;
    },
  };
  return _trkAdapterB;
}

/** After the first Deep Dive, nudge the Pantauan nav icon.
 *
 *  Waits 3s, then pulses #btn-tracker until they click it. Click opens the
 *  tracker setup wizard seeded with that Deep Dive product so they can choose
 *  whether to track and which metrics (including units). Closing / saying no
 *  in the wizard is fine — we only stop the pulse; nothing is saved until they
 *  commit the wizard.
 */
const PANTAU_NUDGE_KEY = 'lid_pantau_nudge_v1';
let _pantauNudgeTimer = null;

function pantauNudgeLoad() {
  try { return JSON.parse(localStorage.getItem(PANTAU_NUDGE_KEY) || 'null') || { phase: 'none' }; }
  catch { return { phase: 'none' }; }
}

function pantauNudgeSave(st) {
  try { localStorage.setItem(PANTAU_NUDGE_KEY, JSON.stringify(st)); } catch (_) {}
}

function pantauNudgeSeedFromProduct(product) {
  const keyword = String(product?.keyword || '').trim();
  if (!keyword) return null;
  return {
    keyword,
    category: product.category || product.category_canonical || '',
    shop_id: product.shop_id ?? null,
    store_name: product.store_name || '',
    item_id: product.item_id ?? null,
    image_url: product.image_url || '',
  };
}

function pantauNudgeSetPulse(on) {
  const btn = document.getElementById('btn-tracker');
  if (btn) btn.classList.toggle('is-pantau-pulse', !!on);
}

function pantauNudgeClear() {
  if (_pantauNudgeTimer) { clearTimeout(_pantauNudgeTimer); _pantauNudgeTimer = null; }
  pantauNudgeSave({ phase: 'done' });
  pantauNudgeSetPulse(false);
}

function pantauNudgeStartPulse() {
  const st = pantauNudgeLoad();
  if (st.phase !== 'armed' && st.phase !== 'pulsing') return;
  pantauNudgeSave({ ...st, phase: 'pulsing' });
  pantauNudgeSetPulse(true);
  try { void logUserEvent('pantau_nudge_pulse', { ui: 'gpt', keyword: st.seed?.keyword || null }); } catch (_) {}
}

function schedulePantauNavPulse(product) {
  const st = pantauNudgeLoad();
  if (st.phase === 'done') return;
  if (st.phase === 'pulsing') { pantauNudgeSetPulse(true); return; }
  if (st.phase === 'armed') {
    // Timer already running from this session or a prior one — resume remaining wait.
    if (_pantauNudgeTimer) return;
    const waited = Date.now() - (st.armedAt || Date.now());
    const left = Math.max(0, 3000 - waited);
    _pantauNudgeTimer = setTimeout(() => { _pantauNudgeTimer = null; pantauNudgeStartPulse(); }, left);
    return;
  }
  const seed = pantauNudgeSeedFromProduct(product);
  if (!seed) return;
  pantauNudgeSave({ phase: 'armed', seed, armedAt: Date.now() });
  if (_pantauNudgeTimer) clearTimeout(_pantauNudgeTimer);
  _pantauNudgeTimer = setTimeout(() => { _pantauNudgeTimer = null; pantauNudgeStartPulse(); }, 3000);
}

function resumePantauNavPulse() {
  const st = pantauNudgeLoad();
  if (st.phase === 'pulsing') pantauNudgeSetPulse(true);
  else if (st.phase === 'armed') schedulePantauNavPulse(st.seed || {});
}

/** If a first-dive Pantauan nudge is active, stop pulsing and return its seed. */
function consumePantauNudgeSeed() {
  const st = pantauNudgeLoad();
  if (st.phase !== 'pulsing' && st.phase !== 'armed') return null;
  const seed = st.seed && st.seed.keyword ? st.seed : null;
  pantauNudgeClear();
  return seed;
}

/** Has this user tracked anything yet? get_my_tracking() is the authority.
 *  A `true` is cached for the page load; a `false` is re-asked so a keyword
 *  added in another tab hides the end-of-dive alert on the next dive. */
const DDTP_KEY = 'lid_ddtrack_promo_v1'; // leftover retire flag; no longer shown
let _ddtpHasTracked = null;

function ddtpRetire() {
  if (!currentUser) return;
  _ddtpHasTracked = true;
  try { localStorage.setItem(DDTP_KEY, JSON.stringify({ uid: currentUser.id, done: true })); } catch (_) {}
}

async function ddtpUserHasTracked() {
  if (_ddtpHasTracked === true) return true;
  if (!_supabase || !currentUser) return false;
  try {
    const { data, error } = await _supabase.rpc('get_my_tracking');
    if (error) throw error;
    const n = (data?.keywords?.length || 0) + (data?.stores?.length || 0);
    if (n > 0) { _ddtpHasTracked = true; return true; }
    _ddtpHasTracked = false;
    return false;
  } catch (_) {
    return false;
  }
}

/* ── First Deep Dive: Steven founder video ────────────────────────────────
 *  Once per browser (anon and signed-in share the same localStorage flag).
 *  Opens 2s after the first Deep Dive that has not already seen it. Non-
 *  skippable until `ended`; remaining time is the YouTube-ad countdown.
 *  Marked seen on open so a refresh mid-play never replays. */
const SDDV_KEY = 'lid_steven_dd_video_v1';
const SDDV_DELAY = 2000;
const SDDV_SRC = '/images/onboarding/steven-deepdive.mp4';
let _sddvTimer = null;
let _sddvEnded = false;
let _sddvBound = false;

function sddvIsSeen() {
  try { return localStorage.getItem(SDDV_KEY) === '1'; } catch { return false; }
}

function sddvMarkSeen() {
  try { localStorage.setItem(SDDV_KEY, '1'); } catch (_) {}
}

function sddvPrefetch() {
  const v = $('sddv-video');
  if (!v || v.getAttribute('src')) return;
  v.src = SDDV_SRC;
  v.preload = 'auto';
  try { v.load(); } catch (_) {}
}

/** Returns true if the video is pending or already open, so DDTP must wait. */
function scheduleStevenDdVideo() {
  if (_sddvTimer) { clearTimeout(_sddvTimer); _sddvTimer = null; }
  if ($('steven-dd-video')?.classList.contains('open')) return true;
  // Admins never get the mandatory founder video. It is a "wajib ditonton"
  // interstitial aimed at a first-time seller; on an admin account it just
  // blocks every Deep Dive opened while checking the product, and Steven does
  // not need to be introduced to himself. Returning false lets DDTP run now.
  // Raw role on purpose: student mode must not bring the interstitial back.
  if (isPlatformAdminRaw()) return false;
  if (sddvIsSeen()) return false;
  sddvPrefetch();
  _sddvTimer = setTimeout(() => {
    _sddvTimer = null;
    sddvFire();
  }, SDDV_DELAY);
  return true;
}

function sddvFire() {
  if (sddvIsSeen()) return;
  // Re-checked here, not only in the scheduler: sign-in can land between the
  // 2s schedule and the fire.
  if (isPlatformAdminRaw()) return;
  if (state.view !== 'deepdive') return;
  if (document.querySelector('.modal-overlay.open')) return;
  const overlay = $('steven-dd-video');
  const video = $('sddv-video');
  if (!overlay || !video) return;
  sddvPrefetch();
  sddvMarkSeen();
  _sddvEnded = false;
  sddvBind(video);
  overlay.classList.add('open');
  overlay.classList.remove('sddv-done');
  document.body.classList.add('sddv-open');
  sddvUpdateTimer(video);
  sddvTryPlay(video);
  void logUserEvent('steven_dd_video', { ui: 'gpt', action: 'show' });
  clarityEvt('steven_dd_video', { action: 'show' });
}

function sddvTryPlay(video) {
  video.muted = false;
  try { video.currentTime = 0; } catch (_) {}
  const p = video.play();
  if (p && typeof p.then === 'function') {
    p.then(() => sddvSetMutedUi(false)).catch(() => {
      video.muted = true;
      sddvSetMutedUi(true);
      video.play().catch(() => {});
    });
  }
}

function sddvSetMutedUi(muted) {
  const btn = $('sddv-unmute');
  if (!btn) return;
  btn.hidden = !muted;
}

function sddvFmtRemain(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return m + ':' + String(s % 60).padStart(2, '0');
}

function sddvUpdateTimer(video) {
  const el = $('sddv-timer');
  if (!el) return;
  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 36;
  el.textContent = sddvFmtRemain(dur - (video.currentTime || 0));
}

function sddvBind(video) {
  if (_sddvBound) return;
  _sddvBound = true;
  video.addEventListener('timeupdate', () => sddvUpdateTimer(video));
  video.addEventListener('loadedmetadata', () => sddvUpdateTimer(video));
  video.addEventListener('ended', sddvOnEnded);
}

function sddvOnEnded() {
  _sddvEnded = true;
  $('steven-dd-video')?.classList.add('sddv-done');
  const timer = $('sddv-timer');
  if (timer) timer.textContent = '0:00';
  void logUserEvent('steven_dd_video', { ui: 'gpt', action: 'complete' });
  clarityEvt('steven_dd_video', { action: 'complete' });
}

function sddvClose(reason) {
  if (!_sddvEnded) return;
  const overlay = $('steven-dd-video');
  if (!overlay || !overlay.classList.contains('open')) return;
  overlay.classList.remove('open', 'sddv-done');
  document.body.classList.remove('sddv-open');
  const video = $('sddv-video');
  if (video) { try { video.pause(); } catch (_) {} }
  void logUserEvent('steven_dd_video', { ui: 'gpt', action: reason || 'close' });
  clarityEvt('steven_dd_video', { action: reason || 'close' });
}

function sddvCancel() {
  if (_sddvTimer) { clearTimeout(_sddvTimer); _sddvTimer = null; }
  const overlay = $('steven-dd-video');
  const video = $('sddv-video');
  if (overlay?.classList.contains('open')) {
    overlay.classList.remove('open', 'sddv-done');
    document.body.classList.remove('sddv-open');
    if (video) { try { video.pause(); } catch (_) {} }
  }
}

/** One-tap keyword tracking straight from a Deep Dive.
 *
 *  The old path opened the setup wizard with the keyword pre-filled. Aksi
 *  Cepat was opened 72 times in the week of 16-23 Aug 2026 by 21 users and
 *  this button was clicked twice, by one person: the offer was a chore, and
 *  the tap led to more chores. This does the whole thing in one call and
 *  leaves "Atur" in the toast for anyone who wants the full panel.
 *
 *  add_tracked_keyword is exactly what the wizard's commit() calls, so nothing
 *  is skipped except the screens. Deliberately does NOT load laris-tracker.js.
 */
async function trackKeywordWithNotify(product, opts = {}) {
  const kw = String(product?.keyword || '').trim();
  if (!kw) { showToast('Produk ini belum punya keyword untuk dipantau'); return false; }
  if (!currentUser) {
    try { state.pendingTrackKeyword = { keyword: kw, category: product?.category || product?.category_canonical || '' }; saveLocalState(); } catch (_) {}
    openAuthModal('signup', 'gpt_gate_track');
    return false;
  }
  try {
    const res = await _supabase.rpc('add_tracked_keyword', {
      p_keyword: kw,
      p_category: product?.category || product?.category_canonical || '',
    });
    if (res?.error) throw res.error;
    const data = res?.data;
    if (data && data.ok === false) {
      const msg = {
        limit_reached:     'Daftar pantauan sudah penuh. Buka Pantauan untuk mengatur.',
        already_tracked:   `"${kw}" sudah kamu pantau.`,
        keyword_too_short: 'Keyword ini terlalu pendek untuk dipantau.',
      }[data.error] || 'Tidak bisa menambah pantauan sekarang.';
      showToast(msg);
      void logUserEvent('quick_track_refused', { ui: 'gpt', keyword: kw, reason: data.error || 'unknown' });
      return false;
    }
    void logUserEvent('quick_track_added', { ui: 'gpt', keyword: kw, via: opts.via || 'aksi_cepat' });

    let notifyOn = false;
    let wa = String(opts.wa || '').trim();
    let channel = opts.channel || '';
    try {
      const cur = await _supabase.rpc('get_my_tracking');
      const ch = cur?.data?.notify_channels;
      const neverSet = Array.isArray(ch) && ch.length === 0;
      if (neverSet || channel) {
        if (!wa) wa = await loadProfileWaNumber();
        if (!channel) channel = (WA_ALERTS_READY && wa) ? 'whatsapp' : 'email';
        if (channel === 'whatsapp' && !WA_ALERTS_READY) channel = 'email';
        if (channel === 'whatsapp' && !wa) {
          showToast('Isi nomor WhatsApp dulu.');
          return false;
        }
        if (channel === 'whatsapp') await saveProfileWaNumber(wa);
        const set = await _supabase.rpc('set_tracker_notify_prefs', {
          p_channels: [channel],
          p_wa_number: wa || null,
        });
        notifyOn = !set?.error && set?.data?.ok !== false;
        if (set?.data?.ok === false && set.data.error === 'wa_number_required') {
          showToast('Isi nomor WhatsApp dulu.');
          return false;
        }
        if (notifyOn) void logUserEvent('quick_track_notify_on', { ui: 'gpt', channel });
      }
    } catch (_) {}

    pantauNudgeClear();
    ddtpRetire();
    showToast(notifyOn
      ? (channel === 'whatsapp'
        ? `Siap — kami kabari di WhatsApp saat data scrape baru masuk (biasanya tiap ~2 minggu)`
        : `Siap — kami email kamu saat data scrape baru masuk (biasanya tiap ~2 minggu)`)
      : `Siap — "${kw}" masuk pantauan kamu`);
    return true;
  } catch (_) {
    showToast('Gagal menyimpan pantauan. Coba lagi.');
    return false;
  }
}

async function quickTrackKeyword(product) {
  return trackKeywordWithNotify(product, { via: 'aksi_cepat' });
}

// laris-tracker.js is no longer in the eager <script> list — it is the single
// largest bundle a normal visitor never touched. Everything that needs
// window.LarisTracker goes through here first.
let _trkLoadPromise = null;
function ensureTracker() {
  if (window.LarisTracker) return Promise.resolve(window.LarisTracker);
  if (!_trkLoadPromise) {
    // Its stylesheet left the critical path with it. Injected first so the
    // panel never paints unstyled once the module mounts.
    try {
      if (!document.getElementById('ltk-css')) {
        const l = document.createElement('link');
        l.id = 'ltk-css'; l.rel = 'stylesheet';
        l.href = '/styles/laris-tracker.css?v=20260901f';
        document.head.appendChild(l);
      }
    } catch (_) {}
    _trkLoadPromise = (typeof larisLoadScript === 'function'
      ? larisLoadScript('/js/laris-tracker.js?v=20260901f')
      : Promise.reject(new Error('no loader')))
      .then(() => window.LarisTracker || null)
      .catch(() => { _trkLoadPromise = null; return null; });
  }
  return _trkLoadPromise;
}

async function openTrackerView(seed, resumeDraft) {
  // First-dive Pantauan pulse: clicking the nav icon (or any tracker entry)
  // while the nudge is active opens the seeded setup wizard and stops the pulse.
  // Cancel/close in the wizard is fine — nothing is saved until they commit.
  if (!seed || !seed.keyword) {
    const nudged = consumePantauNudgeSeed();
    if (nudged) seed = nudged;
  } else {
    const st = pantauNudgeLoad();
    if (st.phase === 'pulsing' || st.phase === 'armed') pantauNudgeClear();
  }
  setView('tracker');
  // Parity with Site A trkOpen(): view_open fires from setView; this marks the
  // pantauan entry specifically so A/B tracker_tab rates stay comparable.
  try { void logUserEvent('tracker_tab', { tab: 'keyword', ui: 'gpt', seeded: !!(seed && seed.keyword) }); } catch (_) {}
  await ensureTracker();
  if (!window.LarisTracker) return;
  window.LarisTracker.mount({ hostId: 'laris-tracker-root', site: 'b', adapter: gptTrackerAdapter() });
  const p = window.LarisTracker.open({ touch: true });
  // Arriving from a Deep Dive: drop straight into the seeded wizard rather than
  // the rollup, which for a first-time user would be an empty table.
  if (seed && seed.keyword) {
    Promise.resolve(p).then(() => {
      try { window.LarisTracker.openSetup({ seed }); } catch (_) {}
    });
  } else if (resumeDraft) {
    // Restoring a wizard draft stashed before a login interrupt — same open()
    // race to wait out as the seed path above.
    Promise.resolve(p).then(() => {
      try { window.LarisTracker.resumeDraft(resumeDraft); } catch (_) {}
    });
  }
}

// Single entry point for "click a name/avatar anywhere" — clicking your own
// name opens the editable profile (GptProfile.viewPublic redirects there
// itself when targetUserId === currentUserId); clicking anyone else's opens
// the read-only public view (name/city/avatar/bio only — never contact info).
function openUserProfile(userId) {
  if (!currentUser) { openAuthModal('login', 'gpt_gate_profile'); return; }
  if (!userId || !window.GptProfile) return;
  window.GptProfile.viewPublic(userId, {
    supabase: _supabase,
    esc,
    toast: showToast,
    currentUserId: currentUser.id,
    userEmail: currentUser.email || '',
    onError: (err) => { try { console.warn('[profile]', err); } catch (_) {} },
    selfOpenOptions: {
      supabase: _supabase, userId: currentUser.id, userEmail: currentUser.email || '',
      esc, toast: showToast,
      onSignOut: () => { if (confirm('Keluar dari akun?')) void signOut(); },
      onProfileChanged: (row) => {
        _accountHeadshotUrl = row?.headshot_url || null;
        const name = row?.display_name || row?.first_name ||
          currentUser.user_metadata?.full_name || currentUser.email || 'Akun';
        const short = String(name).split(' ')[0] || 'Akun';
        setHeaderName(short);
        setHeaderAvatar(short);
      },
    },
  });
}

function mountLarisCohort() {
  if (!window.LarisCohort) return;
  window.LarisCohort.mount({
    getSupabase: () => _supabase,
    getUser: () => currentUser,
    esc,
    toast: showToast,
    isAdmin: isPlatformAdmin,
    openProfile: openUserProfile,
    // Rencana Jualan: the cohort module owns the tab and the form, the AI
    // machinery stays here. trackKeyword goes through the same RPC the tracker
    // wizard and quickTrackKeyword use, so enrolment in the daily scrape lane
    // (add_tracked_keyword -> scrape_enrol_tracked) applies to it too.
    runRencana: (input, opts) => runRencanaJualan(input, opts),
    trackKeyword: async (kw, cat) => {
      const res = await _supabase.rpc('add_tracked_keyword', { p_keyword: kw, p_category: cat || '' });
      if (res?.error) throw res.error;
      return res?.data;
    },
  });
}

/* ── Cohort home ──────────────────────────────────────────────────────────
 *
 * For a mahasiswa the cohort IS the product, so it is their landing surface.
 * This does not run inside boot's view choice: refreshCohortNav is deliberately
 * fire-and-forget there, and awaiting membership before first paint would cost
 * every visitor a round trip to answer a question that only matters to cohort
 * members. So boot paints home, and this replaces it once membership resolves —
 * but only if the user has not already navigated, or it would yank the screen
 * out from under them.
 */
let _bootLandingView = null;
let _bootCohortNav = null;

async function routeCohortHome() {
  if (!_bootLandingView || !currentUser) return;
  try {
    await _bootCohortNav;
    // Students only. A mentor or an admin is not a mahasiswa, and sending them
    // here every load would take the admin dashboard away from its owner.
    const mine = window.LarisCohort && window.LarisCohort.myStudentCohort();
    if (!mine) return;
    if (state.view !== _bootLandingView) return;
    _bootLandingView = null;
    openCohortView();
  } catch (_) {}
}

async function refreshCohortNav() {
  mountLarisCohort();
  const btn = $('btn-cohort');
  if (!window.LarisCohort) {
    if (btn) btn.style.display = 'none';
    return;
  }
  try {
    const show = await window.LarisCohort.initMembership();
    if (btn) btn.style.display = show ? '' : 'none';
  } catch (_) {
    if (btn) btn.style.display = 'none';
  }
}

function openCohortView() {
  if (!currentUser) { openAuthModal('login', 'gpt_gate_cohort'); return; }
  mountLarisCohort();
  setView('cohort');
  if (window.LarisCohort) void window.LarisCohort.open();
}

function openCommunityBoard() {
  if (!currentUser) { openAuthModal('login', 'gpt_gate_community'); return; }
  setView('community');
  const root = $('community-board-root');
  if (!root || !window.GptCommunityBoard) return;
  window.GptCommunityBoard.mount(root, {
    supabase: _supabase,
    esc,
    currentUserId: currentUser.id,
    isAdmin: isPlatformAdmin,
    toast: showToast,
    onError: (err) => { try { console.warn('[community-board]', err); } catch (_) {} },
    onOpenProfile: (userId) => { openUserProfile(userId); },
  });
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
  if (merdekaUnlimitedNow()) return true;
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
  // Recommendations are ranked on listings and shown as listing rows.
  const recs = await pickRecommendations(recLimit * 3);
  const recTypes = await typesForListings(recs, state.onboarding.city || '', recLimit);
  state.recommendations = [];
  rememberProducts(recs);
  const pool = recTypes.length
    ? { keywords: markTerlarisMinggu(recTypes.slice()), listings: recs, primaryKw: '', nearby: false, unsold: 0 }
    : null;
  const cards = pool
    ? `<div data-lrow-block>${listingBlockHtml(pool, { chipKw: '', compact: true })}</div>
       <button type="button" class="btn-ghost" id="btn-more-products">Cari yang lain?</button>`
    : `<p>Belum ketemu produk yang cocok. Coba Chat Baru atau buka <strong>Cari Produk</strong> di sidebar.</p>`;

  const html = `<p>${frame}</p><p>Ini <strong>${(pool?.listings || []).length || recs.length}</strong> produk dari data LarisID buat kamu cek:</p>${cards}`;
  const thread2 = $('chat-thread');
  if (thread2) thread2.innerHTML = '';
  const msg = await appendAssistantStream(html);
  pushMessage(chat, 'assistant', {
    text: `Rekomendasi ${(pool?.listings || recs).length} produk`,
    level: 'listing',
    types: recTypes.map(t => t.keyword),
  }, html);
  if (pool) {
    const block = $('chat-thread')?.querySelector('[data-lrow-block]');
    if (block) bindListingBlock(block, pool, { compact: true });
  }
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
  // Ask Laris' pre-prompt chips (or a leftover deep-dive chip set) must not
  // bleed into an unrelated resumed thread — the product/AI paths below set
  // their own chips as needed.
  setComposerChips(null);
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
    && chat.context?.city && (chat.context?.category || chat.context?.categories?.length)) {
    try {
      // chat.context.category(ies): old persisted chats saved a single string
      // under `category`; newer ones may carry `categories` (array). Accept
      // either so history from before the multi-select finder still rehydrates.
      const packed = await fetchCategoryPasarTypes(
        chat.context.categories || (chat.context.category ? [chat.context.category] : []),
        chat.context.city || '',
        { limit: FINDER_PASAR_LIMIT, budgetId: chat.context.budget || '1jt_10jt' },
      );
      const types = packed.types;
      registerTypes(types);
      state.recommendations = [];
      const bud = finderBudgetCfg(chat.context.budget || '1jt_10jt');
      const catLabel = (chat.context.categories || []).join(', ') || chat.context.category || '';
      const packedHtml = packed.types.length
        ? await finderPasarBlock({
            types,
            catLabel,
            city: chat.context.city,
            bud,
          })
        : { html: `<p>Riwayat ini tidak punya hasil tersimpan. Coba jalankan ulang pencarian dari pertanyaan awal.</p>`, pool: null };
      const html = packedHtml.html;
      setView('chat');
      const thread = $('chat-thread');
      if (thread) thread.innerHTML = '';
      appendBubble('assistant', html, { skipScroll: true });
      if (packedHtml.pool) {
        const block = $('chat-thread')?.querySelector('[data-lrow-block]');
        if (block) bindListingBlock(block, packedHtml.pool, { query: catLabel, compact: true });
      }
      updateProductPin();
      scrollPanelToTop();
      return;
    } catch (_) {}
  }

  if (chatIsCompare(chat)) {
    const products = resolveCompareProducts(chat);
    if (products.length >= 2) {
      await openProductCompare(products, { resume: true, chatId: compareChatKey(chat) });
      return;
    }
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
  try {
    const input = document.getElementById('composer-input');
    if (input) {
      input.placeholder = 'Ketik apa yang mau kamu cari…';
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('Ketik apa yang mau kamu cari…');
  } catch (_) {}
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
    mean: n ? Math.round(prices.reduce((a, b) => a + b, 0) / n) : 0,
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
  // Trailing week is usually mid-week (today). Scale to a 7-day rate so it
  // does not read as a crash; listing_weekly overlay replaces it when present.
  if (out.length && maxT - out[out.length - 1].ts < 6.5 * 864e5) {
    const last = out[out.length - 1];
    const days = Math.max(1, (maxT - last.ts) / 864e5);
    if (days < 7) {
      const scale = 7 / days;
      last.units = Math.round(last.units * scale);
      last.omset = Math.round(last.omset * scale);
      last.perkiraan = true;
    }
  }
  // Hide mid-April first-scrape baseline noise; chart starts Monday of week containing 27 Apr 2026 (WIB).
  const fromTs = mondayOfWeek(new Date(Date.UTC(2026, 3, 27, 4, 0, 0))).getTime();
  return out.filter(w => w.ts >= fromTs);
}

/* ── Server-backed weekly series ─────────────────────────────────────────────
   product_daily_series returns one honest point per day for the whole window:
   measured days from real deltas, days after the last scrape from the
   recency-weighted nowcast decaying toward the product's peer cohort, days
   before the first from the cohort prior. Bucketing that into weeks gives the
   same shape ddWeeklySeries produces, minus its two blind spots:

     * `if (d <= 0) continue` drops every zero-delta interval, so a product
       that stopped selling charts nothing rather than charting a flat zero;
     * nothing is emitted after the last scrape, so a product last seen three
       weeks ago has an empty recent chart no matter how much history it has.

   Returns null on any failure so the caller falls back to the client path.
   Rollback: set localStorage 'larisid_server_series' to '0'.                 */
async function ddServerWeeklySeries(product, days = 119, opts = {}) {
  try {
    if (localStorage.getItem('larisid_server_series') === '0') return null;
  } catch (_) { /* private mode: proceed */ }
  if (!_supabase || !product) return null;
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const iso = d => d.toISOString().slice(0, 10);
  // Reach past today so the series carries its own forecast tail. The next-week
  // point must come from THIS estimator, not from keyword_weekly — see the note
  // on ddNextWeekPoint. The RPCs clamp at current_date + 7 themselves.
  const toFc = iso(new Date(to.getTime() + 7 * 864e5));
  let rows;
  try {
    let r;
    if (opts.forceKeyword && product.keyword) {
      r = await _supabase.rpc('keyword_daily_series', {
        p_keyword: String(product.keyword).trim().toLowerCase(),
        p_from: iso(from),
        p_to: toFc,
      });
    } else if (product.item_id != null && product.shop_id != null) {
      r = await _supabase.rpc('product_daily_series', {
        p_item_id: product.item_id,
        p_shop_id: product.shop_id,
        p_from: iso(from),
        p_to: toFc,
      });
    } else {
      return null;
    }
    if (r.error || !Array.isArray(r.data) || !r.data.length) return null;
    rows = r.data;
  } catch (_) {
    return null;
  }
  const out = ddDailyRowsToWeeks(rows);
  return out.length ? out : null;
}

/** Bucket product/keyword/store daily series into Monday weeks.
 *  Skips `prior` (pre-scrape plateau). Partial weeks scale to a 7-day rate.
 *  A week carrying any modelled day is flagged `perkiraan` even when it is
 *  full — since the series now runs to today+7 the current week fills up with
 *  forecast days instead of coming back short, and `scale > 1` alone would
 *  quietly stop marking it. */
function ddDailyRowsToWeeks(rows) {
  if (!rows || !rows.length) return [];
  const weeks = new Map();
  for (const row of rows) {
    if (row.source === 'prior') continue;
    const dt = new Date(String(row.d) + 'T12:00:00');
    if (isNaN(dt)) continue;
    const ts = mondayOfWeek(dt).getTime();
    const w = weeks.get(ts) || { units: 0, omset: 0, days: 0, fc: false };
    w.units += Number(row.units) || 0;
    w.omset += Number(row.omset) || 0;
    w.days += 1;
    if (row.source === 'forecast') w.fc = true;
    weeks.set(ts, w);
  }
  const fromTs = mondayOfWeek(new Date(Date.UTC(2026, 3, 27, 4, 0, 0))).getTime();
  return [...weeks.entries()].sort((a, b) => a[0] - b[0])
    .filter(([ts]) => ts >= fromTs)
    .map(([ts, w]) => {
      const scale = w.days > 0 && w.days < 7 ? 7 / w.days : 1;
      return {
        ts,
        d: new Date(ts).toISOString().slice(0, 10),
        units: Math.round(w.units * scale),
        omset: Math.round(w.omset * scale),
        items: 1,
        perkiraan: scale > 1 || w.fc,
      };
    });
}

/** The next-Monday bucket from a series produced by ddDailyRowsToWeeks.
 *  ddLast6Weeks cuts everything past this Monday, so the forecast point is
 *  pulled from the full list — same estimator, same population, same units as
 *  the solid weeks. Reading it from keyword_weekly instead drew it ~4x high.
 *  Match on the week-start ISO, not a 12-hour epoch window — Monday 00:00 UTC
 *  and a local-midnight ts disagree by more than 12h at |offset| >= 13. */
function ddNextWeekPoint(weekly) {
  const nextMon = listingNextWeekStartISO();
  return (weekly || []).find(w =>
    (w.d || new Date(w.ts).toISOString().slice(0, 10)) === nextMon
  ) || null;
}

async function ddServerStoreWeeklySeries(shopId, days = 119) {
  try {
    if (localStorage.getItem('larisid_server_series') === '0') return null;
  } catch (_) { /* private mode: proceed */ }
  if (!_supabase || shopId == null) return null;
  const to = new Date();
  const from = new Date(to.getTime() - days * 864e5);
  const iso = d => d.toISOString().slice(0, 10);
  const toFc = iso(new Date(to.getTime() + 7 * 864e5));
  try {
    const r = await _supabase.rpc('store_daily_series', {
      p_shop_id: Number(shopId),
      p_from: iso(from),
      p_to: toFc,
    });
    if (r.error || !Array.isArray(r.data) || !r.data.length) return null;
    const out = ddDailyRowsToWeeks(r.data);
    return out.length ? out : null;
  } catch (_) {
    return null;
  }
}

/** WIB Monday of the calendar week containing `d`, as YYYY-MM-DD. */
function listingWeekStartISO(d = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const [y, m, day] = s.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, day);
  const dow = new Date(utc).getUTCDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(utc - offset * 864e5).toISOString().slice(0, 10);
}

function listingNextWeekStartISO(d = new Date()) {
  return new Date(Date.parse(listingWeekStartISO(d) + 'T00:00:00Z') + 7 * 864e5)
    .toISOString().slice(0, 10);
}

const DD_TREND_HISTORY_WEEKS = 6;

/** Last 6 scrape-backed weeks through this Monday. Empty calendar weeks are
 *  omitted so a 35-day scrape gap does not draw as a copied-average plateau. */
function ddLast6Weeks(weekly) {
  const thisMon = Date.parse(listingWeekStartISO() + 'T00:00:00Z');
  return (weekly || [])
    .filter(w => (Number(w.units) || 0) > 0 || (Number(w.omset) || 0) > 0)
    .filter(w => w.ts <= thisMon + 12 * 3600 * 1000)
    .sort((a, b) => a.ts - b.ts)
    .slice(-DD_TREND_HISTORY_WEEKS)
    .map(w => ({ ...w }));
}

/** WIB Monday key — aligns shop scrape weeks with product / server buckets. */
function ddWeekStartKey(ts) {
  return listingWeekStartISO(new Date(ts));
}

/** Per-shop trend cut: ddLast6Weeks first, else last non-empty scrape weeks
 *  (same pool competitor sparklines use when server series is thin). */
function ddShopWeeksForTrend(weekly) {
  const cut = ddLast6Weeks(weekly);
  if (cut.length) return cut;
  return (weekly || [])
    .filter(w => (Number(w.units) || 0) > 0 || (Number(w.omset) || 0) > 0)
    .sort((a, b) => a.ts - b.ts)
    .slice(-DD_TREND_HISTORY_WEEKS)
    .map(w => ({ ...w }));
}

// Deep Dive reads nothing from listing_weekly / keyword_weekly any more. The
// helpers that did (ddOverlayThisWeek, weeklyRowFor, fetchWeeklyRows,
// fetchWeeklySnapshot) are gone: that table is a per-listing nowcast/peer
// estimator over a different population than keyword_daily_series, and every
// point spliced from it landed several times above the weeks beside it.
// The tracker's competitor table still uses it, per listing, where it belongs.

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
  for (const p of peers || []) {
    const key = (p.keyword || '').trim().toLowerCase();
    if (!key) continue;
    const cur = byKw.get(key) || { kw: (p.keyword || '').trim(), n: 0, sold: 0 };
    cur.n++;
    cur.sold += Number(p.total_sold) || 0;
    byKw.set(key, cur);
  }
  return [...byKw.values()].sort((a, b) => b.sold - a.sold)
    .map(r => ({ ...r, comp: r.n >= 25 ? 'Tinggi' : r.n >= 10 ? 'Sedang' : 'Rendah' }));
}

/**
 * Expand keyword variety for the side panel.
 *
 * `listings_deduped` is one row per (item_id, shop_id, keyword) — offtopic ads
 * are filtered from peer samples — but a given product may still have been
 * scraped under related queries. Pull distinct (item_id, keyword) pairs from
 * raw `listings` so the Keyword panel lists every keyword those ~60 products
 * actually appear under.
 */
async function fetchPeerKeywordRows(peers) {
  const fallback = ddKeywordRows(peers);
  const ids = [...new Set((peers || []).map(p => p.item_id).filter(x => x != null))].slice(0, 80);
  if (!_supabase || ids.length < 2) return fallback;

  try {
    const pageSize = 1000;
    const maxRows = 4000;
    const rows = [];
    for (let from = 0; from < maxRows; from += pageSize) {
      const { data, error } = await _supabase.from('listings')
        .select('item_id, keyword, total_sold')
        .in('item_id', ids)
        .not('keyword', 'is', null)
        .order('scraped_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data?.length) break;
      rows.push(...data);
      if (data.length < pageSize) break;
    }
    if (!rows.length) return fallback;

    // One appearance per (item, keyword) — keep highest sold for that pair.
    const pair = new Map();
    for (const r of rows) {
      const kw = String(r.keyword || '').trim();
      if (!kw) continue;
      const key = `${r.item_id}|${kw.toLowerCase()}`;
      const sold = Number(r.total_sold) || 0;
      const prev = pair.get(key);
      if (!prev || sold > prev.sold) pair.set(key, { kw, sold });
    }

    const byKw = new Map();
    for (const { kw, sold } of pair.values()) {
      const k = kw.toLowerCase();
      const cur = byKw.get(k) || { kw, n: 0, sold: 0 };
      cur.n += 1;
      cur.sold += sold;
      byKw.set(k, cur);
    }

    const expanded = [...byKw.values()]
      .sort((a, b) => b.n - a.n || b.sold - a.sold)
      .map(r => ({
        ...r,
        comp: r.n >= 25 ? 'Tinggi' : r.n >= 10 ? 'Sedang' : 'Rendah',
      }));

    // Prefer the expanded set whenever it finds more than the deduped snapshot.
    return expanded.length > fallback.length ? expanded : (expanded.length ? expanded : fallback);
  } catch (_) {
    return fallback;
  }
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
        <img src="${esc(imgThumb(u))}" alt="" loading="lazy" decoding="async" draggable="false">
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
  const price = Number(product?.price) || 0;
  const sales = Math.round((soldPerDayEst(product) || 0) * 30);
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
    <button type="button" class="ddr-tool-pill" data-ddr-tool="keyword">Keyword</button>
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
  const items = order.map(o => {
    const f = PLATFORM_FEES[o.plat];
    return `<button type="button" class="ddr-mp-item" data-ddr-tool="biaya" title="Lihat rincian biaya ${esc(f.label)}">
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
  const cards = order.map(plat => {
    const f = PLATFORM_FEES[plat];
    const d = platformFeeDetail(plat, cat, vol);
    const rowsHtml = d.rows.map(r => `<div class="ddr-fee-row">
        <div class="ddr-fee-row-main"><div class="ddr-fee-row-name">${esc(r.name)}</div><div class="ddr-fee-row-where">${esc(r.where)}</div></div>
        <div class="ddr-fee-row-amt">${r.pct != null ? `<div class="ddr-fee-row-pct">${ecomFmtPct(r.pct)}</div>` : ''}${price > 0 ? `<div class="ddr-fee-row-rp">${ecomFmtRp(r.rpPer)}/produk</div>` : ''}</div>
      </div>`).join('');
    const noteHtml = d.note ? `<div class="ddr-fee-note">${esc(d.note)}</div>` : '';
    return `<div class="ddr-card ddr-fee-card">
      <div class="ddr-fee-card-head">
        <div class="ddr-mp-brand">${f.logo}<span class="ddr-mp-name">${esc(f.label)}</span></div>
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

/** Collapsed teaser for the full fee breakdown — the always-visible ddr-mp
 * strip above already gives an at-a-glance comparison; this stays collapsed
 * until clicked so the per-platform row detail doesn't dump onto every visit. */
function ddFeesCollapsedHtml() {
  return `<div class="ddr-fees-section" data-dd-sec="biaya">
    <button type="button" class="ddr-fees-reveal" id="ddr-fees-reveal-btn">
      <span>Lihat Rincian Biaya per Marketplace</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
  </div>`;
}

/** Swap the collapsed teaser for the real breakdown — idempotent (a second
 * call after reveal is a no-op) so both the pill click and the reveal
 * button's own click can call it safely. */
function revealDdrFees(product) {
  const el = document.querySelector('[data-dd-sec="biaya"].ddr-fees-section');
  if (!el || !document.getElementById('ddr-fees-reveal-btn')) return;
  el.outerHTML = ddFeesSectionHtml(product);
}

/* ── Hero row: pasar numbers (left) + the trend chart (right) ─────────────
   Replaced the five-tile strip. Three of those tiles were derived labels, not
   data — "Rekomendasi AI" was a threshold on the score and "Confidence" a
   hand-tuned heuristic. What is left is measured: market omset, market units,
   market average price. All three are keyword-level, matching the chart beside
   them and the Kompetitor / Pangsa cards below. */

function ddHeroNumsHtml(product, peers) {
  const list = peers || [];
  const n = list.length;
  const shopN = new Set(list.map(p => String(p.shop_id))).size;
  const omsetMo = estOmsetBulan(product);
  const units = Number(product?.total_sold) || 0;
  const harga = Number(product?.price) || 0;
  const reviews = Number(product?.reviews) || 0;
  const usia = listingUsiaLabel(product);
  const kw = product?.keyword || '';
  const honesty = omsetHonesty(product);
  const num = (lbl, val, sub) => `<div class="ddr-hero-num">
      <div class="lbl">${esc(lbl)}</div>
      <div class="val">${val}</div>
      <div class="sub">${esc(sub)}</div>
    </div>`;
  return `<div class="ddr-hero-nums">
    ${num('Harga', harga > 0 ? fmtRp(harga) : '—', 'Harga listing')}
    ${num('Omset / Bulan', omsetMo > 0 ? fmtOmsetHeroAmt(omsetMo) : '—', honesty.label)}
    ${num('Unit jual', units > 0 ? fmtSold(units) : '—', 'Total terjual (seumur hidup)')}
    ${num('Review', reviews > 0 ? fmtSold(reviews) : '0', 'Ulasan listing')}
    ${num('Usia', usia.text, 'Umur listing, bukan toko')}
    <p class="ddr-hero-foot">${n ? `Di keyword ${esc(kw)}: ${n} listing / ${shopN} toko` : kw ? `Di keyword ${esc(kw)}.` : ''}</p>
  </div>`;
}

function ddHeroChartHtml(hasTrend) {
  if (!hasTrend) {
    return `<div class="ddr-card ddr-hero-chart" data-dd-sec="tren">
      <h3>Tren Produk</h3>
      <p class="dd-sub">Belum cukup riwayat scrape untuk tren omset listing ini — butuh beberapa gelombang panel. Bagian lain tetap dari data asli.</p>
    </div>`;
  }
  return `<div class="ddr-card ddr-hero-chart" data-dd-sec="tren">
    <div class="ddr-trend-head">
      <h3>Tren Produk</h3>
      <div class="ddr-trend-toggles">
        <div class="ddr-seg" id="ddr-trend-view" role="group" aria-label="Pilih tampilan">
          <button type="button" class="ddr-seg-btn is-on" data-dd-view="produk">Produk</button>
          <button type="button" class="ddr-seg-btn" data-dd-view="top10">Top 10 Toko</button>
        </div>
      </div>
    </div>
    <div class="ddr-chart-wrap"><canvas id="ddr-trend-canvas"></canvas></div>
    <div class="chart-legend ddr-trend-legend" id="ddr-trend-legend"></div>
  </div>`;
}

function ddHeroRowHtml(product, stats, peers, hasTrend) {
  return `<div class="ddr-hero-row" data-dd-sec="quick_stats">
    ${ddHeroNumsHtml(product, peers)}
    ${ddHeroChartHtml(hasTrend)}
  </div>`;
}

function ddAksiCepatHtml(product) {
  // Cari Supplier is ALWAYS in the row. It used to be hidden entirely for
  // off-pilot products, which made the row's shape depend on which product you
  // opened — and silently removed the one control that measures demand for
  // sourcing. The click handler still tells the user when a category has no
  // suppliers yet; a visible button that explains itself beats a missing one.
  return `<div class="ddr-aksi" data-dd-sec="aksi_cepat" role="group" aria-label="Aksi cepat">
    <div class="ddr-aksi-label">Aksi Cepat</div>
    <div class="ddr-aksi-grid">
      <button type="button" class="ddr-aksi-btn primary" data-ddr-aksi="supplier">
        <span class="ddr-aksi-ico">${ico('truck', 18)}</span>
        <span class="ddr-aksi-txt">Cari Supplier</span>
      </button>
      <button type="button" class="ddr-aksi-btn" data-ddr-aksi="launch">
        <span class="ddr-aksi-ico">${ico('rocket', 18)}</span>
        <span class="ddr-aksi-txt">Buat Rencana Launch</span>
      </button>
      <button type="button" class="ddr-aksi-btn primary" data-ddr-aksi="track">
        <span class="ddr-aksi-ico">${ico('eye', 18)}</span>
        <span class="ddr-aksi-txt">Kabari Kalau Berubah</span>
      </button>
      <button type="button" class="ddr-aksi-btn" data-ddr-aksi="compare">
        <span class="ddr-aksi-ico">${ico('scale', 18)}</span>
        <span class="ddr-aksi-txt">Bandingkan</span>
      </button>
    </div>
  </div>`;
}

// Fonnte token is live but the device is disconnected (checked 2026-09-05).
// Do not offer WhatsApp until a /device call returns connected — otherwise we
// store a number and every alert silently drops.
const WA_ALERTS_READY = false;

function ddAlertCardHtml(product) {
  if (!currentUser) return '';
  const kw = String(product?.keyword || '').trim();
  if (!kw) return '';
  const email = String(currentUser.email || '');
  const waSignup = /@wa\.larisid\.com$/i.test(email);
  const emailOk = !!(email && !waSignup);
  const waBlock = WA_ALERTS_READY
    ? `<div class="ddr-alert-wa">
        <input type="tel" id="ddr-alert-wa" inputmode="tel" autocomplete="tel" placeholder="0812xxxxxxxx" aria-label="Nomor WhatsApp">
        <button type="button" class="ddr-alert-btn primary" data-dd-alert="whatsapp">WhatsApp</button>
      </div>`
    : '';
  return `<div class="ddr-alert" id="ddr-alert" data-dd-sec="alert_optin" hidden>
    <div class="ddr-alert-copy">
      <h3>Kabari saya kalau <em>${esc(typeTitle(kw))}</em> berubah</h3>
      <p>Kami kabari saat data scrape baru masuk (biasanya tiap ~2 minggu). Bukan setiap hari.</p>
    </div>
    <div class="ddr-alert-actions">
      ${emailOk ? `<button type="button" class="ddr-alert-btn primary" data-dd-alert="email">Email ke ${esc(email)}</button>` : ''}
      ${waBlock}
      <button type="button" class="ddr-alert-skip" data-dd-alert="dismiss">Nanti saja</button>
    </div>
  </div>`;
}

async function wireDdAlertCard(root, product) {
  const card = root?.querySelector?.('#ddr-alert');
  if (!card) return;
  if (!currentUser) { card.remove(); return; }
  if (await ddtpUserHasTracked()) { card.remove(); return; }
  card.hidden = false;
  void logUserEvent('dd_alert_card', { ui: 'gpt', action: 'shown', keyword: product?.keyword || '' });
  const wa = await loadProfileWaNumber();
  const input = card.querySelector('#ddr-alert-wa');
  if (input && wa) input.value = wa;
  card.querySelectorAll('[data-dd-alert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-dd-alert');
      if (action === 'dismiss') {
        card.remove();
        void logUserEvent('dd_alert_card', { ui: 'gpt', action: 'dismiss', keyword: product?.keyword || '' });
        return;
      }
      void submitDdAlert(product, action, card);
    });
  });
}

async function submitDdAlert(product, channel, card) {
  const kw = String(product?.keyword || '').trim();
  if (!kw) return;
  let wa = '';
  if (channel === 'whatsapp') {
    wa = String(card.querySelector('#ddr-alert-wa')?.value || '').trim();
    if (!wa) { showToast('Isi nomor WhatsApp dulu.'); return; }
  }
  const ok = await trackKeywordWithNotify(product, {
    channel,
    wa,
    via: 'dd_alert_card',
  });
  if (ok) {
    card.remove();
    void logUserEvent('dd_alert_card', { ui: 'gpt', action: channel, keyword: kw });
  }
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
          // A toast here was a dead end — it told the user no and gave them
          // nothing to do, and gave us no signal about whether they wanted one.
          supAskRequest(product);
          return;
        }
        runDdrTool('supplier', product, peers, 'aksi_cepat');
        return;
      }
      if (aksi === 'launch') {
        const chips = ddComposerChips(product);
        const launch = chips.find(c => c.id === 'launch') || DD_CHIPS.find(c => c.id === 'launch');
        const prompt = launch?.prompt || 'Buat rencana launch untuk produk ini';
        void logUserEvent('deepdive_section', { ui: 'gpt', section: 'launch_cta', via: 'aksi_cepat', keyword: product?.keyword || '' });
        // Answer in the AI side panel, not the main composer. The user is
        // reading the Deep Dive; sending them back to the chat thread throws
        // away the context they are standing in. sideAiSubmit renders into the
        // panel thread alongside the charts the plan refers to.
        openAiPanel({ product, peers, via: 'aksi_cepat' });
        void sideAiSubmit(prompt);
        return;
      }
      if (aksi === 'track') {
        void logUserEvent('deepdive_section', { ui: 'gpt', section: 'track_cta', via: 'aksi_cepat', keyword: product?.keyword || '' });
        void quickTrackKeyword(product);
        return;
      }
      if (aksi === 'compare') {
        void logUserEvent('deepdive_section', { ui: 'gpt', section: 'compare_cta', via: 'aksi_cepat', keyword: product?.keyword || '' });
        void startComparePick(product);
        return;
      }
    });
  });
}

const KOMP_LINK_ICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>';

/** Shopee shop page. `shop_id` is the same id Shopee puts in a listing URL
 *  (`…-i.<shop_id>.<item_id>`), so /shop/<shop_id> is that seller's storefront. */
function shopeeStoreUrl(shopId) {
  return `https://shopee.co.id/shop/${encodeURIComponent(String(shopId))}`;
}

function ddKompetitorTableHtml(peers, opts = {}) {
  const list = (peers || []).map(asListingProduct);
  if (!list.length) return '<p class="dd-sub">Kompetitor belum tersedia untuk keyword ini.</p>';
  const highlightKey = opts.highlightKey || (_dd?.product ? prodKey(_dd.product) : '');
  const initial = opts.initial == null ? 15 : opts.initial;
  const shown = opts.expanded ? list : list.slice(0, initial);
  const moreId = opts.moreId || 'ddr-komp-more';
  return listingRowsHtml(shown, { highlightKey, compact: !!opts.compact, keepChat: true })
    + (list.length > initial && !opts.expanded
      ? `<button type="button" class="ans-cta" id="${esc(moreId)}">Lihat semua ${list.length} listing</button>`
      : '');
}

/** 4-week omset sparkline per competitor row, cut from the keyword history.
 *  Without history (side panel on a different product) every canvas draws the
 *  flat grey baseline rather than sitting blank. */
function drawKompSparks(root, history) {
  const rows = history || [];
  root?.querySelectorAll('canvas[data-shop-spark]').forEach(cv => {
    const sid = cv.getAttribute('data-shop-spark') || '';
    const weeks = rows.length
      ? ddWeeklySeries(rows.filter(r => String(r.shop_id) === sid))
      : [];
    drawSpark(cv, weeks.slice(-4).map(w => w.omset), 88, 40);
  });
}

function wireKompClicks(root, peers, opts = {}) {
  if (!root) return;
  const more = root.querySelector('#ddr-komp-more, #side-komp-more');
  more?.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = more.closest('.ddr-card, #side-body-komp') || root;
    more.remove();
    const wrap = card.querySelector('.lrow-wrap');
    if (wrap) {
      wrap.outerHTML = listingRowsHtml((peers || []).map(asListingProduct), {
        highlightKey: _dd?.product ? prodKey(_dd.product) : '',
        keepChat: true,
      });
    }
    bindListingRows(card);
  });
  bindListingRows(root);
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
    <p class="ddr-caption">Dari sampel ${sampleN} produk — Listing = berapa dari produk itu yang pernah muncul di keyword ini (bukan volume pencarian Google/Shopee).</p>`;
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

function drawSpark(canvas, values, wPx = 52, hPx = 20) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width = wPx, h = canvas.height = hPx;
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
    if (!chart.options?._distImages) return;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;
    const r = Number(chart.options._distImgRadius) || 11;
    meta.data.forEach((point, i) => {
      const raw = chart.data.datasets[0].data[i];
      if (!raw || raw.x == null) return;
      const { x, y } = point.getProps(['x', 'y'], true);
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
        ctx.font = `bold ${Math.max(10, Math.round(r * 0.9))}px system-ui,sans-serif`;
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
  const canvasId = chart.canvas?.id || '';
  points.forEach((p, i) => {
    p._color = palette[i % palette.length];
    if (!p.image_url) return;
    // Reuse already-loaded Image objects when expanding the same points.
    if (p._img?.complete && p._img.naturalWidth) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (_charts.get(canvasId) === chart) chart.update('none');
      // Also refresh the other Dist chart if it shares these point objects.
      const otherId = canvasId === 'ddr-dist-canvas' ? 'ddr-dist-canvas-expanded' : 'ddr-dist-canvas';
      const other = _charts.get(otherId);
      if (other) other.update('none');
    };
    img.onerror = () => { p._img = null; };
    img.src = p.image_url;
    p._img = img;
  });
}

function ddDistChartConfig(distPoints, bandLo, bandHi, opts = {}) {
  const radius = Number(opts.imgRadius) || 11;
  const tickLimitX = opts.tickLimitX || 6;
  const tickLimitY = opts.tickLimitY || 5;
  return {
    type: 'scatter',
    data: {
      datasets: [{
        data: distPoints,
        pointRadius: 0,
        pointHoverRadius: radius + 2,
        hitRadius: radius + 4,
        backgroundColor: 'transparent',
      }],
    },
    options: {
      maintainAspectRatio: false,
      _band: [bandLo, bandHi],
      _distImages: true,
      _distImgRadius: radius,
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
        x: { ticks: { callback: v => v >= 1e6 ? (v / 1e6) + 'jt' : Math.round(v / 1e3) + 'rb', maxTicksLimit: tickLimitX } },
        y: { type: 'logarithmic', ticks: { callback: v => fmtSold(v), maxTicksLimit: tickLimitY } },
      },
    },
    plugins: [_ddBandPlugin, _ddDistImagePlugin],
  };
}

function closeDistChartLightbox() {
  const lb = $('dd-chart-lightbox');
  if (!lb || lb.hidden) return;
  lb.hidden = true;
  document.body.style.overflow = '';
  const prev = _charts.get('ddr-dist-canvas-expanded');
  if (prev) {
    try { prev.destroy(); } catch (_) {}
    _charts.delete('ddr-dist-canvas-expanded');
  }
}

async function openDistChartLightbox() {
  const payload = _dd?.distChart;
  const lb = $('dd-chart-lightbox');
  if (!lb || !payload?.points?.length) return;
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  await larisEnsureChart();
  const chart = makeChart('ddr-dist-canvas-expanded', ddDistChartConfig(
    payload.points,
    payload.bandLo,
    payload.bandHi,
    { imgRadius: 18, tickLimitX: 10, tickLimitY: 8 }
  ));
  ddPrimeDistImages(chart, payload.points);
  $('dd-chart-lightbox-close')?.focus?.();
  void logUserEvent('deepdive_section', { ui: 'gpt', section: 'distribusi_expand', via: 'click', keyword: _dd?.product?.keyword || '' });
}

function wireDistChartLightbox() {
  const lb = $('dd-chart-lightbox');
  if (!lb || lb.dataset.ready) return;
  lb.dataset.ready = '1';
  $('dd-chart-lightbox-close')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDistChartLightbox();
  });
  lb.addEventListener('click', (e) => {
    if (e.target === lb) closeDistChartLightbox();
  });
  $('dd-chart-lightbox-panel')?.addEventListener('click', (e) => e.stopPropagation());
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
    scrollDdrTo('.ddr-hscroll--graphs2') || scrollDdrTo('[data-dd-sec="tren"]');
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'analisa', via: via || 'click', keyword: p?.keyword || '' });
    return;
  }
  if (tool === 'biaya') {
    if (state.view !== 'deepdive') {
      if (p) void openDeepDive(p);
      return;
    }
    revealDdrFees(p);
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
  if (tool === 'keyword') {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'keyword_panel', via: via || 'click', keyword: p.keyword || '' });
    openKeywordPanel({ product: p, peers: peerList, via: via || 'deepdive' });
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
      stashPendingDeepdive(product);
      openAuthModal('signup', 'gpt_gate_deepdive');
      return;
    }
    // First free view (or same product again, or missing id) — allow through.
    if (id && !seen) {
      try { localStorage.setItem(ANON_DD_KEY, id); } catch (_) {}
    }
  }
  // Count the open. Placed here — past the anon gate, before any of the async
  // work below — because this is the earliest point at which the dive is
  // definitely happening, and every one of openDeepDive's callers funnels
  // through it. Deliberately NOT logUserEvent: that drops anonymous users, and
  // anon dives are real traffic (they get one free by design). The RPC never
  // refuses, so this can never wall a view.
  void logDeepDiveOpen(product);
  if (state.pendingDeepdive) { state.pendingDeepdive = null; saveLocalState(); }
  const isFirstDeepDive = !state.everOpenedDeepdive;
  if (!state.everOpenedDeepdive) { state.everOpenedDeepdive = true; }
  if (product?.keyword) state.lastDeepDiveKeyword = String(product.keyword);
  if (product?.category || product?.category_canonical) {
    state.lastDeepDiveCategory = String(product.category || product.category_canonical);
  }
  saveLocalState();
  if (isFirstDeepDive) schedulePantauNavPulse(product);
  scheduleStevenDdVideo();
  rememberProducts([product]);
  state.deepdiveProduct = product;
  if (!ddOpts.fromCompare) state.compareReturnChatId = null;
  else if (!state.compareReturnChatId) state.compareReturnChatId = compareChatKey(activeChat());
  setView('deepdive', ddOpts.fromCompare && state.compareReturnChatId ? {
    forceHistory: true,
    hist: {
      item_id: product.item_id,
      shop_id: product.shop_id,
      fromCompare: state.compareReturnChatId,
    },
  } : {});
  scrollPanelToTop();
  noteCategoryOpen(product.category);
  dwellStart(product.category);
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = garudaLoadingHtml('Memuat data Deep Dive…');
  scrollPanelToTop();

  product = { ...product, _fromListing: true };
  state.deepdiveProduct = product;

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
          .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
          .gt('total_sold', 0)
          .ilike('keyword', kw)
          .eq('is_offtopic', false)
          .order('total_sold', { ascending: false })
          .limit(120);
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
  const title = (kw || product.product_name || 'Produk').slice(0, 60);
  const baseCtx = {
    kind: 'product',
    keyword: kw,
    item_id: product.item_id,
    shop_id: product.shop_id,
    product,
    focus: {
      item_id: product.item_id,
      shop_id: product.shop_id,
      product_name: product.product_name,
      price: product.price,
      total_sold: product.total_sold,
    },
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
      focus: baseCtx.focus,
    };
    if (!ddOpts.keepChat) chat.title = title;
    saveLocalState();
    renderChatList();
  }

  void logUserEvent('deepdive_open', { ui: 'gpt', keyword: kw, item_id: product.item_id, shop_id: product.shop_id });
  clarityEvt('deepdive_open', { keyword: kw });
  void gptJourneyNoteDeepDive();
  funnelStep(_gptDiveSeen++ === 0 ? 'first_dive' : 'second_dive');

  const stats = ddStats(peers);
  // Listing omset only — keyword/market series used to be the hero chart.
  // Client path stays as fallback when product_daily_series is thin.
  const productHistory = (history || []).filter(r =>
    String(r.item_id) === String(product.item_id)
    && String(r.shop_id) === String(product.shop_id));
  const productWeekly = (await ddServerWeeklySeries(product, 119))
    || ddWeeklySeries(productHistory);
  const series = ddLast6Weeks(productWeekly);
  // Nothing on this chart comes from listing_weekly/keyword_weekly — that table
  // is a different estimator (nowcast/peer) over a different population, and it
  // drew a one-week spike wherever it was spliced in. Next-week forecast comes
  // off the same product series, via ddNextWeekPoint.
  const fcWeek = ddNextWeekPoint(productWeekly);
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

  const hasTrend = series.filter(w => (w.units || w.omset)).length >= 2;
  // Trend-chart state: this listing's weekly omset plus top-10 store lines.
  // Toggling re-reads this — nothing is refetched.
  const topShops = hasTrend ? await ddTopShopWeeklySeries(share, history) : [];
  _dd.trend = { series, fcWeek, topShops, view: 'produk' };
  const bandLo = stats.p25, bandHi = stats.p75;
  const segLeft = stats.max > stats.min ? Math.round((bandLo - stats.min) / (stats.max - stats.min) * 100) : 0;
  const segWidth = stats.max > stats.min ? Math.max(4, Math.round((bandHi - bandLo) / (stats.max - stats.min) * 100)) : 100;
  const agePct = k => age.total ? Math.round(age[k] / age.total * 100) : 0;
  const isDesktopDeepDive = window.innerWidth > 860;
  const kompCardHtml = `<div class="ddr-card" data-dd-sec="kompetitor" style="margin-bottom:12px">
      <div class="ddr-sec-head">
        <h3>Top Kompetitor</h3>
        <button type="button" class="ddr-panel-link" id="ddr-komp-panel">Lihat di panel</button>
      </div>
      ${ddKompetitorTableHtml(peers, { highlightKey: prodKey(product) })}
    </div>`;

  // Record this view (anon included) BEFORE reading the count back, so the
  // viewer sees a number that includes themselves.
  logProductView(product);
  let viewersYtd = 0;
  try {
    await fetchProductViewCountsYtd([product]);
    viewersYtd = viewersYtdCached(product.item_id, product.shop_id);
  } catch (_) {}

  root.innerHTML = `
    <div class="ddr-header" data-dd-sec="skor">
      <div class="ddr-media">
        <button type="button" class="ddr-back" id="ddr-back" aria-label="Kembali" title="Kembali">${ico('arrowLeft', 18)}</button>
        ${ddHeaderMediaHtml(product, peers)}
        <span class="ddr-views" hidden data-view-key="${esc(viewCountKey(product.item_id, product.shop_id))}" title="Orang yang melihat produk ini di Laris tahun ini">${ico('eye', 13)}<span class="ddr-views-num" data-view-num-self>${viewersYtd.toLocaleString('id-ID')}</span><span class="ddr-views-lbl">sedang melihat</span></span>
      </div>
      <div class="ddr-head-main">
        <div class="ddr-title-row">
          <span class="ddr-level ddr-level-produk" title="Angka di hero ini untuk satu listing penjual">PRODUK</span>
          <h1>${esc(product.product_name || kw || 'Produk')}</h1>
          <span class="badge ${scoreInfo.cls}">${scoreInfo.label}</span>
        </div>
        <p class="ddr-cat">${esc(ddKotaLabel(product, peers))}</p>
        ${ddMarketNoteHtml(product, peers)}
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
    ${ddHeroRowHtml(product, stats, peers, hasTrend)}
    ${isDesktopDeepDive ? kompCardHtml : ''}
    ${ddAksiCepatHtml(product)}
    ${ddAlertCardHtml(product)}
    <h2 class="ddr-konteks-head">Konteks pasar: ${esc(kw || 'keyword ini')}</h2>
    <div class="ddr-hscroll ddr-hscroll--graphs2">
      <div class="ddr-card" data-dd-sec="pangsa">
        <h3>Distribusi Pangsa Pasar</h3>
        ${share.shops.length >= 4 ? `
          <div class="ddr-chart-wrap sm"><canvas id="ddr-share-canvas"></canvas></div>
          <div class="chart-legend">
            <span class="row"><span class="swatch" style="background:#B5202A"></span>Top 3 Toko · ${Math.round(share.top3 / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#2563EB"></span>Peringkat 4–10 · ${Math.round(share.mid / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#93c5fd"></span>Peringkat 11–30 · ${Math.round(share.tail / share.total * 100)}%</span>
            <span class="row"><span class="swatch" style="background:#e5e7eb"></span>Lainnya · ${Math.round(share.rest / share.total * 100)}%</span>
          </div>`
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
          </div>`
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
        <div class="ddr-sec-head">
          <h3>Distribusi Harga</h3>
          ${stats.n >= 6 ? `<button type="button" class="ddr-expand-btn" id="ddr-dist-expand" title="Perbesar grafik" aria-label="Perbesar Distribusi Harga">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            Perbesar
          </button>` : ''}
        </div>
        ${stats.n >= 6 ? `
          <div class="ddr-chart-wrap sm"><canvas id="ddr-dist-canvas"></canvas></div>`
          : '<p class="dd-sub">Belum cukup listing untuk memetakan distribusi harga.</p>'}
      </div>
    </div>
    ${ddInsightSectionHtml(product, stats, share, series, scoreInfo, age, peers)}
    ${isDesktopDeepDive ? '' : kompCardHtml}
    ${ddFeesCollapsedHtml()}
    <div class="ddr-bottom-space" aria-hidden="true"></div>
  `;

  $('ddr-back')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void logUserEvent('deepdive_back', { ui: 'gpt', via: 'back_arrow', keyword: kw || '' });
    const compareId = state.compareReturnChatId;
    const compareChat = compareId
      ? state.chats.find(c => (c.id || c.localId) === compareId)
      : null;
    const compared = resolveCompareProducts(compareChat);
    if (compared.length >= 2) {
      state.activeChatId = compareId;
      void openProductCompare(compared, { resume: true, chatId: compareId });
      return;
    }
    void openDirectory();
  });
  $('ddr-fees-reveal-btn')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'biaya', via: 'click', keyword: kw || '' });
    revealDdrFees(product);
  });
  $('ddr-komp-panel')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'kompetitor_panel', via: 'click', keyword: kw || '' });
    openKompPanel({ product, peers, via: 'deepdive' });
  });
  wireKompClicks(root, peers, { history });
  wireDdrTrendToggles(root);
  bindDdrCarousel(root);
  wireDdrToolPills(root, product, peers);
  wireDdrAksiCepat(root, product, peers);
  void wireDdAlertCard(root, product);
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
  if (hasTrend) {
    ddRenderTrendChart();
    requestAnimationFrame(ddResizeTrendChart);
  }
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
    if (_dd) {
      _dd.distChart = { points: distPoints, bandLo, bandHi };
    }
    const distChart = makeChart('ddr-dist-canvas', ddDistChartConfig(distPoints, bandLo, bandHi, { imgRadius: 11 }));
    ddPrimeDistImages(distChart, distPoints);
    $('ddr-dist-expand')?.addEventListener('click', () => { void openDistChartLightbox(); });
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

/* ── Trend chart: Produk (listing omset) | Top 10 Toko ────────────
   State lives on `_dd.trend` so a toggle re-draws without refetching. */

const DD_SHOP_COLORS = [
  '#B5202A', '#2563EB', '#16A34A', '#D97706', '#7C3AED',
  '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5',
];

/** Per-shop weekly omset for the top 10 stores. Prefer store_daily_series
 *  (measured + nowcast/forecast) so a shop with one scrape interval still
 *  gets a multi-week line; fall back to keyword scrape history. */
async function ddTopShopWeeklySeries(share, history) {
  const shops = (share?.shops || []).slice(0, 10);
  const rows = history || [];
  const results = await Promise.all(shops.map(async (sh, i) => {
    const sid = sh?.sample?.shop_id != null ? String(sh.sample.shop_id) : '';
    if (!sid) return null;
    const server = await ddServerStoreWeeklySeries(sid);
    const fallback = rows.length
      ? ddWeeklySeries(rows.filter(r => String(r.shop_id) === sid))
      : [];
    const serverWeeks = ddShopWeeksForTrend(server || []);
    const fallbackWeeks = ddShopWeeksForTrend(fallback);
    let weeks = serverWeeks.length >= fallbackWeeks.length ? serverWeeks : fallbackWeeks;
    if (!weeks.length) weeks = serverWeeks.length ? serverWeeks : fallbackWeeks;
    if (!weeks.length) return null;
    return {
      shopId: sid,
      name: sh.name || 'Toko',
      img: sh.img || '',
      color: DD_SHOP_COLORS[i % DD_SHOP_COLORS.length],
      weeks,
    };
  }));
  return results.filter(Boolean);
}

const _ddRpTick = v => v >= 1e9 ? (v / 1e9).toFixed(1) + 'M'
  : v >= 1e6 ? Math.round(v / 1e6) + 'jt'
  : v >= 1e3 ? Math.round(v / 1e3) + 'rb'
  : v;

const _ddFmtWk = ts => new Date(ts).toLocaleDateString('id-ID', {
  day: 'numeric', month: 'short', timeZone: 'UTC',
});

const DD_BREAK_LO = 0.78;
const DD_BREAK_HI = 0.86;

function _ddPctile(sorted, p) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

/** Piecewise Y-axis when one toko is ≥2.5× the pack. Null = keep linear. */
function ddTop10Break(shops) {
  const maxima = (shops || []).map(sh =>
    Math.max(0, ...((sh.weeks || []).map(w => Number(w.omset) || 0)))
  ).filter(v => v > 0);
  if (maxima.length < 2) return null;
  const sorted = maxima.slice().sort((a, b) => a - b);
  const topMax = sorted[sorted.length - 1];
  const rest = sorted.slice(0, -1);
  const packMax = _ddPctile(rest, 0.75) || rest[rest.length - 1] || 0;
  if (!packMax || topMax < packMax * 2.5) return null;
  const breakLow = packMax * 1.15;
  const breakHigh = topMax * 0.92;
  const axisMax = topMax * 1.05;
  if (!(breakHigh > breakLow)) return null;
  return { breakLow, breakHigh, axisMax };
}

function ddBrokenMap(v, br) {
  if (v == null || !Number.isFinite(v)) return null;
  if (v <= br.breakLow) return (v / Math.max(br.breakLow, 1)) * DD_BREAK_LO;
  if (v >= br.breakHigh) {
    const span = Math.max(br.axisMax - br.breakHigh, 1);
    return DD_BREAK_HI + Math.min(1, Math.max(0, v - br.breakHigh) / span) * (1 - DD_BREAK_HI);
  }
  return null;
}

function ddBrokenUnmap(d, br) {
  if (d <= DD_BREAK_LO) return (d / DD_BREAK_LO) * br.breakLow;
  if (d >= DD_BREAK_HI) {
    return br.breakHigh + ((d - DD_BREAK_HI) / (1 - DD_BREAK_HI)) * (br.axisMax - br.breakHigh);
  }
  return null;
}

const ddBrokenAxisPlugin = {
  id: 'ddBrokenAxis',
  afterDraw(chart) {
    const br = chart.options?.plugins?.ddBrokenAxis || chart.options?._ddBreak;
    if (!br) return;
    const yScale = chart.scales?.y;
    if (!yScale) return;
    const yLo = yScale.getPixelForValue(DD_BREAK_LO);
    const yHi = yScale.getPixelForValue(DD_BREAK_HI);
    const top = Math.min(yLo, yHi);
    const bot = Math.max(yLo, yHi);
    const area = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(area.left, top, area.right - area.left, Math.max(2, bot - top));
    const mid = (top + bot) / 2;
    const x = yScale.left;
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 7, mid - 5);
    ctx.lineTo(x + 5, mid + 1);
    ctx.lineTo(x - 7, mid + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 1, mid - 7);
    ctx.lineTo(x + 11, mid - 1);
    ctx.lineTo(x - 1, mid + 5);
    ctx.stroke();
    ctx.restore();
  },
};

function ddTrendLegendHtml() {
  const t = _dd?.trend;
  if (!t) return '';
  if (t.view === 'top10') {
    const shops = t.topShops || [];
    if (!shops.length) {
      return '<span class="dd-sub">Belum cukup riwayat per toko untuk menggambar 10 garis.</span>';
    }
    const broken = !!ddTop10Break(shops);
    return `<div class="ddr-legend-shops">${shops.map((sh, i) => `
      <button type="button" class="ddr-legend-shop" data-shop-idx="${i}" aria-pressed="true" title="${esc(sh.name)}">
        <span class="comp-av">${sh.img
          ? `<img src="${esc(imgThumb(sh.img))}" alt="" loading="lazy" decoding="async">`
          : esc((sh.name || 'T').charAt(0).toUpperCase())}</span>
        <span class="nm">${esc((sh.name || 'Toko').slice(0, 18))}</span>
        <span class="dot" style="background:${sh.color}"></span>
      </button>`).join('')}</div>
      <span class="dd-sub ddr-legend-note">Perkiraan mengisi minggu tanpa scrape.${broken ? ' Skala terputus — toko outlier di pita atas.' : ''}</span>`;
  }
  return `<span class="row"><span class="swatch" style="background:#B5202A"></span>Omset / minggu (Rp)</span>
    <span class="row"><span class="swatch" style="background:#16A34A"></span>Perkiraan</span>`;
}

function ddTrendChartEmptyNote(show, text) {
  const wrap = document.getElementById('ddr-trend-canvas')?.closest('.ddr-chart-wrap');
  if (!wrap) return;
  let el = wrap.querySelector('.ddr-chart-empty');
  if (show) {
    if (!el) {
      el = document.createElement('p');
      el.className = 'ddr-chart-empty dd-sub';
      wrap.appendChild(el);
    }
    el.textContent = text || '';
    el.hidden = false;
  } else if (el) el.hidden = true;
}

// Weekly product omset: last 6 WIB weeks through today + 1 next-week perkiraan.
// Real series stays SHORTER than the labels — only Perkiraan touches the future
// Monday. Next-week point is the same product_daily_series grain (not ×30/7).
// last-2-weeks avg is fallback only.
function ddRenderTrendChart() {
  const t = _dd?.trend;
  if (typeof Chart === 'undefined' || !t) return;

  if (t.view === 'top10') {
    const shops = t.topShops || [];
    if (!shops.length) {
      ddTrendChartEmptyNote(true, 'Belum cukup riwayat per toko untuk menggambar 10 garis.');
      // Keep a chart instance alive — manual destroy() left the canvas unusable
      // for the next Produk redraw ("Canvas is already in use").
      makeChart('ddr-trend-canvas', {
        type: 'line',
        data: { labels: [''], datasets: [{ data: [null], borderWidth: 0, pointRadius: 0 }] },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: false }, y: { display: false } },
        },
      });
      return;
    }
    ddTrendChartEmptyNote(false);
    // Share the product chart's x-axis when we have it — shop scrape weeks
    // often land on a different epoch Monday than product_daily_series buckets.
    const pasarSeries = (t.series && t.series.length >= 2 ? t.series : null)
      || (_dd?.series && _dd.series.length >= 2 ? _dd.series : null);
    const tsAll = pasarSeries
      ? pasarSeries.map(w => w.ts)
      : [...new Set(shops.flatMap(sh => sh.weeks.map(w => w.ts)))].sort((a, b) => a - b);
    const hasPlottableOmset = shops.some(sh => {
      const by = new Map(sh.weeks.map(w => [ddWeekStartKey(w.ts), Number(w.omset) || 0]));
      return tsAll.some(ts => (by.get(ddWeekStartKey(ts)) || 0) > 0);
    });
    if (!hasPlottableOmset) {
      ddTrendChartEmptyNote(true, 'Belum cukup riwayat per toko untuk menggambar 10 garis.');
      makeChart('ddr-trend-canvas', {
        type: 'line',
        data: { labels: tsAll.map(_ddFmtWk), datasets: [{ data: tsAll.map(() => null), borderWidth: 0, pointRadius: 0 }] },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { display: true }, y: { display: true, min: 0 } },
        },
      });
      return;
    }
    let br = ddTop10Break(shops);
    if (br) {
      const hasPlottable = shops.some(sh => (sh.weeks || []).some(w => {
        const omset = Number(w.omset) || 0;
        return omset > 0 && ddBrokenMap(omset, br) != null;
      }));
      if (!hasPlottable) br = null;
    }
    const labels = tsAll.map(_ddFmtWk);
    makeChart('ddr-trend-canvas', {
      type: 'line',
      data: {
        labels,
        datasets: shops.map(sh => {
          const by = new Map(sh.weeks.map(w => [ddWeekStartKey(w.ts), w.omset]));
          const omsets = [];
          const data = tsAll.map(ts => {
            const key = ddWeekStartKey(ts);
            if (!by.has(key)) { omsets.push(null); return null; }
            const omset = by.get(key);
            omsets.push(omset);
            if (!br) return omset;
            return ddBrokenMap(omset, br);
          });
          return {
            label: sh.name,
            data,
            omsets,
            borderColor: sh.color, backgroundColor: sh.color,
            borderWidth: 2, tension: .35, pointRadius: 2, fill: false,
            spanGaps: !br,
            segment: br ? {
              borderColor: ctx => {
                const a = ctx.p0.parsed?.y ?? ctx.p0.raw;
                const b = ctx.p1.parsed?.y ?? ctx.p1.raw;
                if (a == null || b == null) return 'transparent';
                if (Math.min(a, b) <= DD_BREAK_LO && Math.max(a, b) >= DD_BREAK_HI) return 'transparent';
                return sh.color;
              },
            } : undefined,
          };
        }),
      },
      plugins: br ? [ddBrokenAxisPlugin] : [],
      options: {
        maintainAspectRatio: false,
        _ddBreak: br || null,
        plugins: {
          legend: { display: false },
          ddBrokenAxis: br || false,
          tooltip: {
            callbacks: {
              label: c => {
                const omsets = c.dataset.omsets;
                const raw = (omsets && c.dataIndex != null && omsets[c.dataIndex] != null)
                  ? omsets[c.dataIndex]
                  : c.parsed.y;
                if (raw == null) return '';
                return `${c.dataset.label}: ${fmtRpShort(raw)}`;
              },
            },
          },
        },
        scales: {
          x: { display: true, ticks: { maxTicksLimit: 8, maxRotation: 0 } },
          y: {
            min: 0,
            max: br ? 1 : undefined,
            ticks: {
              maxTicksLimit: 6,
              callback: function (v) {
                if (br) {
                  if (v > DD_BREAK_LO && v < DD_BREAK_HI) return '';
                  const real = ddBrokenUnmap(v, br);
                  if (real == null) return '';
                  return _ddRpTick(real);
                }
                return _ddRpTick(v);
              },
            },
            afterBuildTicks: br ? (axis) => {
              axis.ticks = [0, 0.26, 0.52, DD_BREAK_LO, DD_BREAK_HI, 0.93, 1]
                .map(value => ({ value }));
            } : undefined,
          },
        },
      },
    });
    return;
  }

  ddTrendChartEmptyNote(false);

  const series = (t.series && t.series.length >= 2 ? t.series : null)
    || (_dd?.series && _dd.series.length >= 2 ? _dd.series : null)
    || [];
  if (series.length < 2) return;
  const labels = series.map(w => _ddFmtWk(w.ts));
  labels.push(_ddFmtWk(Date.parse(listingNextWeekStartISO() + 'T00:00:00Z')) + ' ▶');
  const omsets = series.map(w => w.omset);
  const nW = series.length;
  const last2 = arr => Math.round((arr[arr.length - 1] + (arr[arr.length - 2] ?? arr[arr.length - 1])) / 2);
  // Same series as the solid line, so the dashed tail leaves it continuously.
  // last2() is the guard for the client-side fallback series, which has no
  // future weeks.
  const fc = t.fcWeek;
  const fOmsetW = new Array(labels.length).fill(null);
  fOmsetW[nW - 1] = omsets[nW - 1];
  fOmsetW[nW] = fc ? Math.round(Number(fc.omset) || 0) : last2(omsets);
  makeChart('ddr-trend-canvas', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Omset / minggu (Rp)',
          data: omsets,
          borderColor: '#B5202A',
          backgroundColor: 'rgba(181,32,42,.06)',
          borderWidth: 2, fill: true, tension: .35, pointRadius: 3,
          spanGaps: true,
        },
        {
          label: 'Perkiraan Omset',
          data: fOmsetW,
          borderColor: '#16A34A',
          borderDash: [5, 5], borderWidth: 2, tension: .35, pointRadius: 3,
          spanGaps: true,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            label: c => {
              if (c.parsed.y == null) return '';
              const isFc = (c.dataset.label || '').startsWith('Perkiraan');
              return `${isFc ? 'Perkiraan ' : ''}Omset: ${fmtRpShort(c.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        y: {
          display: true, position: 'left', min: 0,
          ticks: { callback: _ddRpTick, maxTicksLimit: 6 },
        },
      },
    },
  });
}

function wireDdrTrendToggles(root) {
  const card = root?.querySelector('[data-dd-sec="tren"]');
  if (!card) return;
  const legend = card.querySelector('#ddr-trend-legend');

  const paint = () => {
    const t = _dd?.trend;
    if (!t) return;
    card.querySelectorAll('[data-dd-view]').forEach(b => {
      b.classList.toggle('is-on', b.getAttribute('data-dd-view') === t.view);
    });
    if (legend) legend.innerHTML = ddTrendLegendHtml();
    ddRenderTrendChart();
    requestAnimationFrame(ddResizeTrendChart);
  };

  card.addEventListener('click', async (e) => {
    const btn = e.target.closest?.('[data-dd-view]');
    if (!btn || !card.contains(btn)) return;
    const t = _dd?.trend;
    if (!t) return;
    const v = btn.getAttribute('data-dd-view');
    if (!v || t.view === v) return;
    if (v === 'top10' && !t.topShops?.length && (_dd?.history?.length || _dd?.peers?.length)) {
      const share = ddShareData(_dd.peers || []);
      t.topShops = await ddTopShopWeeklySeries(share, _dd.history || []);
    }
    t.view = v;
    void logUserEvent('deepdive_section', {
      ui: 'gpt', section: 'tren_toggle', view: t.view,
    });
    paint();
  });

  legend?.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-shop-idx]');
    if (!b || !legend.contains(b)) return;
    const idx = Number(b.getAttribute('data-shop-idx'));
    const chart = _charts.get('ddr-trend-canvas');
    if (!chart || !Number.isFinite(idx)) return;
    const wasVisible = chart.isDatasetVisible(idx);
    chart.setDatasetVisibility(idx, !wasVisible);
    chart.update();
    b.setAttribute('aria-pressed', String(!wasVisible));
    b.classList.toggle('is-off', wasVisible);
  });

  // Chart.js may still be loading here (wiring runs before larisEnsureChart);
  // ddRenderTrendChart no-ops until it lands and openDeepDive draws it then.
  paint();
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

/**
 * AI is unlimited as of the 20260817120000 migration, so this is now only two
 * things: the login gate, and an analytics ping (the RPC still writes
 * daily_usage + usage_events). Deliberately FAILS OPEN — the old version
 * returned false on any transient RPC error, which silently killed the reply
 * with no message at all.
 */
async function _useAi(action) {
  if (!_supabase || !currentUser) { openAuthModal('signup', 'gpt_gate_ai'); return false; }
  try { await _supabase.rpc('use_ai', { p_action: action }); } catch (_) { /* analytics only */ }
  return true;
}

/**
 * Market-level Skor 0-100, delegated to the directory's own scorer so the
 * number the AI quotes is byte-identical to the one the UI shows. Load order is
 * safe: gpt-dir-filters.js and gpt-app.js are both `defer`, which executes in
 * document order.
 */
function _skorOf(row) {
  try { return window.LarisGptDirFilters?.skorOf?.(row) ?? null; } catch (_) { return null; }
}

/**
 * Shared capability contract for every AI surface (product chat, category
 * evaluation, market agent). Extracted so the three prompt builders cannot
 * drift apart on what the data does and does not contain.
 *
 * The load-bearing part is the 4-part pattern: before this existed the model
 * answered "which high-skor items are imported from China?" by telling the
 * user to go look at the Skor Produk themselves. There IS no origin column —
 * so the only good answer is a partial one, and the model has to be told
 * explicitly that reasoning past a missing field is required, not optional.
 */
function aiCapabilityContract() {
  return `
YANG DATA LARISID PUNYA:
- Per listing: nama produk, nama toko, harga, harga coret, total terjual, estimasi
  terjual, kategori, keyword/pasar, lokasi seller (WILAYAH INDONESIA saja), rating,
  jumlah ulasan, tanggal listing, wishlist, status iklan, peringkat pencarian,
  estimasi omset per bulan.
- Per pasar (product type): jumlah seller, jumlah listing, harga min/median/max,
  omset top-15 seller per bulan, pangsa 3 teratas, tren 30 hari, breakout_rate,
  jumlah produk baru, dan Skor Pasar 0-100.

YANG DATA LARISID TIDAK PUNYA — sebut jujur kalau ditanya, JANGAN mengarang:
- Negara asal / status impor / produsen. Tidak ada satu pun kolom asal barang.
- Modal, HPP, harga supplier, margin, dan profit sebenarnya.
- Ongkir, berat, dimensi.
- Stok real-time, retur, komplain, biaya iklan, ROAS, konversi.
- Demografi pembeli, status Shopee Mall / Star Seller, data per varian.
- Isi foto produk dan kontak supplier.

CARA MENJAWAB KALAU DATANYA CUMA SEBAGIAN (WAJIB, 4 bagian, urut):
1. JAWAB DULU dari data yang ADA — angka konkret, nama pasar/produk konkret.
   Jangan pernah membuka dengan "aku tidak punya data itu".
2. SATU KALIMAT saja menyebut field mana yang tidak ada. Contoh: "Kolom negara
   asal memang tidak ada di data kami."
3. LALU BERNALAR dari pengetahuan pasar umum, diberi label jelas ("dari pola pasar
   Shopee pada umumnya, bukan dari data kami"), dan hubungkan ke proksi yang MEMANG
   ada di data.
4. TUTUP dengan satu langkah konkret berikutnya yang bisa user lakukan.
Bagian 3 itu WAJIB, bukan opsional. Menolak bernalar karena datanya tidak lengkap
= jawaban gagal. Menyuruh user "cek sendiri" atau "cari sendiri" juga = jawaban gagal.

PROKSI "IMPOR" DI DATA INI (pakai ini, jangan mengaku buta):
- Lokasi seller di hub impor/grosir: Kab. Tangerang, Jakarta Barat, Jakarta Utara,
  Tangerang, Jakarta Pusat — konsentrasi importir/reseller terbesar di data.
- Harga jauh di bawah median pasar sementara total terjual tinggi.
- Judul menyebut "impor"/"import" (~1,1% dari 864 ribu listing) atau "china"/"cina"/
  "tiongkok" (~0,4%). Cakupannya kecil — perlakukan sebagai sinyal lemah, bukan sensus.
Selalu sebut ini PROKSI, bukan bukti asal barang.

SKOR (0-100):
- Skor Produk dihitung dari: peluang breakout (dari harga & breakout_rate niche),
  tingkat kompetisi (pangsa 3 teratas), total penjualan pasar, dan banyaknya
  pembanding. Naik kalau kompetisi rendah, peluang breakout tinggi, dan pasarnya
  cukup ramai.
- Skor Pasar dihitung dari: omset top-15, breakout_rate, tren 30 hari, jumlah produk
  baru (ideal sekitar 20), dikurangi penalti kalau seller lebih dari 15 dan kalau
  pangsa 3 teratas besar.
- Kalau user tanya "kenapa skornya segitu" atau "gimana biar lebih tinggi", jawab
  dari komponen di atas dengan angka pasarnya.`;
}

/**
 * Only included on surfaces that actually pass tools. The last two sentences are
 * the direct fix for the reported bug: the model used to answer market questions
 * by telling the user to go look at the Skor Produk and search around.
 */
function aiToolsInstruction() {
  return `
ALAT DATA: kamu punya alat untuk membaca data LarisID sendiri (cari_pasar,
pasar_kota, pasar_kategori, detail_pasar, cari_listing, filter_listing,
produk_dibuka, pemain_baru, pola_toko_baru, judul_menang).
- Kalau pertanyaan butuh data yang belum ada di prompt ini, PANGGIL ALAT dulu.
- JANGAN menyuruh user "cek sendiri", "cari sendiri", "lihat di halaman Produk",
  atau "buka Skor Produk" untuk sesuatu yang bisa kamu ambil sendiri lewat alat.
  Itu jawaban gagal.
- Boleh panggil beberapa alat sekaligus dalam satu putaran. Maksimal 3 putaran;
  sesudah itu jawab dengan data yang sudah terkumpul.
- filter_listing itu alat untuk MENGUJI dugaan (misal judul mengandung "impor",
  seller dari kota hub impor, listing baru lewat umur_hari_max, atau omset_min).
  Pakai untuk mengecek proksi DAN filter umur/omset yang user sebut, bukan menebak.
- listing_date dan omset_bln (plus omset_label terukur/perkiraan) ikut di hasil listing.
  Jangan bilang kolom tanggal listing tidak ada.
- Kalau alat mengembalikan nol baris, katakan terus terang dan coba sudut lain —
  jangan mengarang isinya.
- pasar_kota: begitu user menyebut kotanya, itu alat pertamamu — bukan kategori
  minatnya. Alat ini membaca apa yang benar-benar dikirim DARI kota itu.
  Aturannya mengikat: (a) catatan yang ikut di hasilnya WAJIB kamu sampaikan
  isinya kalau jumlah tokonya kecil — sebut angka tokonya, jangan menyulapnya
  jadi "pasar di kotamu"; (b) lokasi di data kami adalah lokasi PENJUAL, bukan
  pembeli, jadi jangan mengklaim tahu apa yang dibeli orang di sana; (c) nol
  toko berarti sapuan kami belum menjangkau kota itu, BUKAN bahwa tidak ada
  penjual di sana — katakan begitu, lalu lanjutkan dengan pasar nasional;
  (d) kategori_raw dari alat ini bukan kategori kanonik pasar_kategori —
  jangan disuapkan ke sana.

TIGA ALAT TOKO BARU (pemain_baru, pola_toko_baru, judul_menang) — aturan pakainya
mengikat, karena ketiganya gampang dibaca terlalu percaya diri:
- pemain_baru: kalau field level = "kategori", angkanya BUKAN dari pasar itu
  sendiri melainkan rata-rata kategorinya. Sebut itu di jawaban. Jangan pernah
  menyajikannya seolah-olah itu angka pasar tersebut.
- Umur toko adalah perkiraan MINIMUM (dihitung dari listing tertua yang kami
  scrape), bukan tanggal toko dibuka. Tulis "kira-kira", jangan tanggal pasti.
- pola_toko_baru: semua perbandingan di dalamnya sudah dikelompokkan per
  obs_bucket supaya adil. JANGAN menjumlahkan atau merata-ratakan lintas bucket.
- Harga yang bergerak BERKORELASI dengan hasil, bukan terbukti menyebabkannya.
  Kalau menyarankan ubah harga, selalu pasangkan dengan cek margin. Jangan
  pernah menyuruh user memotong harga tanpa tahu modalnya.
- Panjang judul TIDAK membedakan listing laris dan sepi di data kami. Jangan
  menyarankan judul panjang/pendek seolah-olah itu temuan data.
- judul_menang: itu selisih porsi kata, bukan resep. Sarankan sebagai "kata yang
  dipakai listing yang laku di pasar ini", bukan "pakai ini biar laku".
- Kami TIDAK punya deskripsi produk kompetitor dalam jumlah berarti. Kalau
  menyusun deskripsi, katakan sekali bahwa itu susunanmu dari pola judul dan
  konteks pasar, bukan contekan dari deskripsi toko lain.`;
}

/**
 * The visible plan.
 *
 * The run panel renders these steps as a checklist and ticks them off as the
 * tool rounds land, so the user watches the research happen instead of staring
 * at one pulsing line. The block is lifted out of the prose by _aiSplitPlan and
 * never printed as text — which is why the delimiters have to be exact.
 */
function aiPlanInstruction() {
  return `
RENCANA (WAJIB, paling awal, sebelum memanggil alat apa pun):
Tulis SATU blok persis seperti ini, tanpa kalimat pembuka:
<rencana>
1. Langkah pertama
2. Langkah kedua
3. Langkah ketiga
</rencana>
- 3 sampai 4 langkah. Setiap langkah maksimal 9 kata, kata kerja di depan.
- Langkah terakhir SELALU menyimpulkan/menjawab pertanyaan user.
- Sesudah blok itu langsung panggil alat pada putaran yang sama.
- Tulis blok <rencana> SEKALI saja per jawaban. Jangan mengulanginya.
- Di antara putaran alat, boleh satu kalimat pendek soal apa yang barusan
  ketemu dan apa yang diambil berikutnya.

TERLARIS MINGGU INI (kalau pertanyaannya soal produk atau pasar):
- Field terjual_minggu = unit terjual disetarakan per 7 hari; listing_gerak_minggu
  = berapa listing yang benar-benar bergerak. Kalau keduanya ada, TUTUP jawaban
  dengan menyebut satu pasar/produk yang paling laku minggu ini plus angkanya.
- terjual_minggu null artinya belum ada pasangan snapshot yang bisa dipakai —
  bilang belum terukur. JANGAN menulisnya sebagai "0 terjual".`;
}

/** Length rule shared by every AI surface. Short for lookups, full for judgment. */
function aiLengthRule(langLabel) {
  return `- Panjang jawaban mengikuti pertanyaan. Pertanyaan sederhana (harga, berapa, apa itu): 2-4 kalimat. Pertanyaan penilaian, perbandingan, "kenapa", atau yang datanya cuma sebagian: jawab lengkap dengan pola 4 bagian di atas — boleh 2-4 paragraf pendek atau bullet. Jangan memotong bagian 3 (penalaran) demi ringkas.
- Markdown ringan boleh: **tebal untuk angka/kesimpulan kunci**, bullet pendek (- item), heading ## kalau perlu. Tanpa emoji. Selalu tetap dalam ${langLabel}.`;
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
  // The Skor Produk the UI shows was never in this prompt. Asked "which items
  // have a high skor", the model had no skor at all and pointing back at the UI
  // was its only honest move. Recomputed here from the same peers via the same
  // ddScore() the report uses, so the number it quotes matches the report.
  const skorStats = n ? ddStats(rows) : null;
  const scoreInfo = skorStats ? ddScore(p, skorStats, niche) : null;
  const rp = (v) => `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;
  const skorBlock = scoreInfo ? `
SKOR PRODUK INI: ${scoreInfo.score}/100 — "${scoreInfo.label}". Komponennya:
- Peluang breakout: ${scoreInfo.odds.pct}% (${scoreInfo.odds.tier}; dihitung dari ${scoreInfo.odds.src})
- Kompetisi: ${skorStats.komp} (3 seller teratas menguasai ${Math.round(skorStats.top3Share * 100)}% penjualan)
- Harga pasar: median ${rp(skorStats.median)}, p25 ${rp(skorStats.p25)}, p75 ${rp(skorStats.p75)}
- Total terjual sepasar: ${(skorStats.totalSold || 0).toLocaleString('id-ID')} dari ${skorStats.n} pembanding
` : '';
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
- Jangan bilang kamu "melihat" produk — kamu membaca data.
${aiLengthRule(langLabel)}
${aiCapabilityContract()}
${aiToolsInstruction()}${aiPlanInstruction()}

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
${skorBlock}
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
    // listings_deduped, NOT listings: the raw table holds one row per scrape
    // snapshot per ad/organic slot, so a plain 80-row fetch returned ~29
    // distinct products repeated ~2.8x. Every share the prompt computes
    // (_gptBuildSpecStats, _gptPocketStats, TOP 10) was weighted by how often
    // an item happened to be scraped rather than by its place in the market.
    // is_offtopic is mandatory on every listings_deduped read.
    const { data } = await _supabase
      .from('listings_deduped')
      .select('product_name,store_name,price,total_sold,reviews,rating,location,item_id,shop_id,keyword')
      .eq('keyword', kw)
      .eq('is_offtopic', false)
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

// ── AI transport ─────────────────────────────────────────────────────────
// Both entry points resolve to the same block shape:
//   { text, thinking, toolUses: [{ id, name, input }], stopReason }
// Text-only callers read `.text`. Anything driving the tool loop needs
// toolUses + stopReason, which is why these are no longer plain strings.
const AI_MAX_TOKENS = 1200;         // simple lookups
const AI_MAX_TOKENS_DEEP = 3000;    // judgment answers / any turn with thinking

function _aiReply(text, extra = {}) {
  return { text: text || '', thinking: '', toolUses: [], stopReason: null, ...extra };
}

function _aiBody(system, messages, opts = {}, stream = false) {
  const body = {
    model: 'claude-haiku-4-5-20251001', // proxy rewrites this to deepseek-v4-pro
    max_tokens: opts.maxTokens || (opts.thinking ? AI_MAX_TOKENS_DEEP : AI_MAX_TOKENS),
    system,
    messages,
  };
  if (stream) body.stream = true;
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  if (opts.thinking) body.thinking = { type: 'enabled' };
  return body;
}

/**
 * Apply one Anthropic-style SSE event to the accumulating stream state.
 * Top-level and pure (state in, callbacks out) so it can be exercised against a
 * captured upstream stream without a browser.
 *
 * st: { full, thinking, stopReason, blocks }  — blocks is index -> block
 */
function _aiApplySseEvent(ev, st, cbs = {}) {
  const type = ev?.type;
  if (type === 'content_block_start') {
    const cb = ev.content_block || {};
    st.blocks[ev.index] = { type: cb.type, name: cb.name, id: cb.id, json: '' };
    if (cb.type === 'tool_use') cbs.onToolStart?.(cb.name, cb.id);
    return st;
  }
  if (type === 'content_block_delta') {
    const d = ev.delta || {};
    // Legacy shape (bare delta.text) kept as a fallback: a proxy that emits
    // undecorated deltas must keep working.
    if (d.type === 'text_delta' || (!d.type && d.text)) {
      const piece = d.text || '';
      if (piece) { st.full += piece; cbs.onText?.(piece, st.full); }
    } else if (d.type === 'thinking_delta') {
      const piece = d.thinking || '';
      if (piece) { st.thinking += piece; cbs.onThinking?.(piece, st.thinking); }
    } else if (d.type === 'input_json_delta') {
      const b = st.blocks[ev.index];
      if (b) b.json += d.partial_json || '';
    }
    // signature_delta is deliberately ignored: DeepSeek accepts the tool round
    // trip without the thinking block replayed, so we never need the signature.
    return st;
  }
  if (type === 'message_delta' && ev.delta?.stop_reason) st.stopReason = ev.delta.stop_reason;
  return st;
}

/** Collect finished tool_use blocks out of stream state. */
function _aiToolUsesFrom(blocks) {
  return Object.values(blocks)
    .filter(b => b.type === 'tool_use' && b.id)
    .map(b => {
      let input = {};
      // Never let a truncated/garbled arg blob throw into the reply path.
      try { input = b.json ? JSON.parse(b.json) : {}; } catch (_) { input = {}; }
      return { id: b.id, name: b.name, input };
    });
}

/** Non-streaming call. Also the fallback whenever streaming is unavailable. */
async function _mlsAIPost(system, messages, opts = {}) {
  const session = _supabase ? (await _supabase.auth.getSession()).data?.session : null;
  if (!session) return _aiReply('Login untuk pakai fitur AI.');
  let res;
  try {
    res = await fetch(`${SUPA_URL}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(_aiBody(system, messages, opts, false)),
      signal: opts.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') return _aiReply('');
    return _aiReply('AI sedang sibuk. Coba lagi sebentar.');
  }
  // Not a user cap any more (AI is unlimited) — a 429 here is the upstream
  // provider rate-limiting us, which the proxy forwards verbatim.
  if (res.status === 429) return _aiReply('AI sedang ramai. Coba lagi sebentar.');
  if (!res.ok) return _aiReply('AI sedang sibuk. Coba lagi sebentar.');
  const d = await res.json().catch(() => ({}));
  const blocks = Array.isArray(d?.content) ? d.content : [];
  const text = blocks.filter(b => b?.type === 'text').map(b => b.text || '').join('')
    || d?.text || d?.message || '';
  return {
    text,
    thinking: blocks.filter(b => b?.type === 'thinking').map(b => b.thinking || '').join(''),
    toolUses: blocks.filter(b => b?.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, input: b.input || {} })),
    stopReason: d?.stop_reason || null,
  };
}

/** Legacy string-returning shim — the photo analyzer takes a plain string. */
async function _mlsAIRaw(system, messages, opts = {}) {
  const r = await _mlsAIPost(system, messages, opts);
  return r.text || 'Tidak ada jawaban.';
}

/**
 * Streaming variant. onDelta(piece, full) fires as answer text arrives;
 * onThinking(piece, full) as reasoning arrives; onToolStart(name) when the model
 * begins requesting a tool. Falls back to the non-streaming call on any failure,
 * so a proxy or network that cannot stream still produces an answer.
 */
async function _mlsAIStream(system, messages, onDelta, signal, opts = {}) {
  const session = _supabase ? (await _supabase.auth.getSession()).data?.session : null;
  if (!session) return _aiReply('Login untuk pakai fitur AI.');
  const post = () => _mlsAIPost(system, messages, { ...opts, signal });
  let res;
  try {
    res = await fetch(`${SUPA_URL}/functions/v1/claude-proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(_aiBody(system, messages, opts, true)),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') return _aiReply('');
    return post();
  }
  if (res.status === 429) return _aiReply('AI sedang ramai. Coba lagi sebentar.');
  if (!res.ok || !res.body) return post();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const st = { full: '', thinking: '', stopReason: null, blocks: Object.create(null) };
  const handle = (ev) => _aiApplySseEvent(ev, st, {
    onText: onDelta,
    onThinking: opts.onThinking,
    onToolStart: opts.onToolStart,
  });

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
          try { handle(JSON.parse(raw)); } catch (_) { /* keep-alive or partial frame */ }
        }
      }
    }
  } catch (e) {
    if (e?.name !== 'AbortError' && !st.full) return post();
    // Aborted, or died after partial text: keep whatever already arrived.
  }

  return {
    text: st.full,
    thinking: st.thinking,
    toolUses: _aiToolUsesFrom(st.blocks),
    stopReason: st.stopReason,
  };
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

function _gptMem() {
  return (typeof window !== 'undefined' && window.LarisGptMemory) || {};
}

function applyResearchFromText(chat, text) {
  if (!chat) return;
  const mem = _gptMem();
  if (!chat.context) chat.context = {};
  const parsed = mem.parseResearchConstraints?.(text) || {};
  chat.context.research = mem.mergeResearchConstraints?.(chat.context.research, parsed) || parsed;
  if (parsed.category) {
    chat.context.categoryOverride = parsed.category;
    chat.context.categoryHint = null;
  } else if (isOpenSellAsk(String(text || '').toLowerCase())) {
    // An open "so what should I sell" REOPENS the direction — the category the
    // thread was carrying is the very thing the user is asking us to
    // reconsider. It steps down to a ranking hint instead of scoping the next
    // search, and the step-down is durable: the refinement that follows should
    // narrow whatever this turn finds, not snap back to the old category.
    const held = chat.context.research?.category || chat.context.categoryOverride || '';
    if (held) {
      chat.context.categoryHint = held;
      if (chat.context.research) delete chat.context.research.category;
      chat.context.categoryOverride = null;
    }
  }
  saveLocalState();
}

async function handleComposerSubmit(text, opts = {}) {
  text = (text || '').trim();
  if (!text) return;
  abortAssistantStream();

  const lower = text.toLowerCase();
  if (/tampilkan produk lain/.test(lower) || /^produk lain$/.test(lower) || /^rekomendasi baru$/.test(lower)) {
    await openMoreProductsDirectory();
    return;
  }

  const mem = _gptMem();
  const liveChat = activeChat();
  if (liveChat && mem.chatIsConversationalThread?.(liveChat)) {
    if (mem.isDeclineReply?.(lower) && liveChat.context?.pendingOffer) {
      liveChat.context.pendingOffer = null;
      saveLocalState();
      setView('chat');
      appendBubble('user', `<p>${esc(text)}</p>`);
      pushMessage(liveChat, 'user', text);
      const html = '<p>Oke — ketik produk atau kategori yang mau dicari.</p>';
      await appendAssistantStream(html);
      pushMessage(liveChat, 'assistant', { text: 'Oke' }, html);
      return;
    }
    if (mem.isAffirmativeReply?.(lower) || mem.isConstraintRefinement?.(lower)) {
      const sendText = mem.isAffirmativeReply?.(lower)
        ? mem.resolveAffirmativePrompt(text, liveChat.context?.pendingOffer)
        : text;
      applyResearchFromText(liveChat, text);
      void logUserEvent('gpt_intent', {
        ui: 'gpt', intent: 'followup',
        kind: mem.isAffirmativeReply?.(lower) ? 'affirm' : 'refine',
      });
      setView('chat');
      appendBubble('user', `<p>${esc(text)}</p>`);
      pushMessage(liveChat, 'user', text);
      const product = liveChat.context?.product || state.deepdiveProduct;
      if (product && liveChat.context?.kind === 'product') {
        await askProductAi(liveChat, product, sendText);
      } else {
        const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Melanjutkan…</p>`);
        await runMarketAgent(liveChat, sendText, loading);
      }
      return;
    }
  }

  const productCtx = state.deepdiveProduct || activeChat()?.context?.product || null;
  const inProductCtx = state.view === 'deepdive' || !!activeChat()?.context?.product || !!activeChat()?.context?.keyword;
  const inResultsThread = chatIsResultsThread(activeChat());

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

  // Topic change inside a product chat OR a results-only thread (finder /
  // recommendations): market-level / new-search asks leave that page so the
  // new query is its own chat, not a turn under leftover product cards.
  if (inProductCtx || inResultsThread) {
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
        await handleComposerSubmit(text, opts);
      }
      return;
    }
  }

  // Category showcase only for broad category asks (“cari fashion”, “skincare
  // trending”) — specific nouns (“dresses”) fall through to planned search.
  const catAsk = detectCategoryFromText(lower);

  // "Is [category] a good idea?" (Ask Laris' reasoning prompt) wants a
  // judgment call, not a card grid — intercept before the showcase branch.
  if (!inProductCtx && catAsk && isEvaluativeAsk(lower)) {
    if (inResultsThread) beginFreshChat();
    setView('chat');
    const chat = ensureComposerChat(text);
    appendBubble('user', `<p>${esc(text)}</p>`);
    pushMessage(chat, 'user', text);
    void logUserEvent('gpt_message_sent', { ui: 'gpt' });
    clarityEvt('gpt_message_sent', {});
    void logUserEvent('gpt_intent', { ui: 'gpt', intent: 'category_evaluate', category: catAsk });
    clarityEvt('gpt_intent', { intent: 'category_evaluate' });
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menganalisis pasar ${esc(catAsk)}…</p>`);
    await handleAskLarisEvaluate(chat, text, catAsk, loading);
    return;
  }

  // Market question with no product open. Sits AFTER the evaluate branch (which
  // owns "is X a good category?") and BEFORE the showcase branch.
  //
  // Typed free text runs through the agent so the work is visible — the plan,
  // the tool steps and the data behind the answer. A CLICKED chip keeps its
  // purpose-built card (profit calculator, A-vs-B panels, terlaris grid): those
  // are hand-built answers the agent cannot reproduce. Logged-out visitors keep
  // the old card path because runMarketAgent is behind a login gate.
  const analytical = isAnalyticalAsk(lower);
  const agentAll = AI_AGENT_ALL && !!currentUser && opts.via !== 'chip';
  if (AI_AGENT_ROUTER && !inProductCtx && (analytical || agentAll)) {
    if (inResultsThread) beginFreshChat();
    setView('chat');
    const chat = ensureComposerChat(text);
    appendBubble('user', `<p>${esc(text)}</p>`);
    pushMessage(chat, 'user', text);
    void logUserEvent('gpt_message_sent', { ui: 'gpt' });
    clarityEvt('gpt_message_sent', {});
    void logUserEvent('gpt_intent', {
      ui: 'gpt', intent: 'market_agent',
      via: analytical ? 'router' : 'router_all',
      analytical: analytical ? 1 : 0,
    });
    clarityEvt('gpt_intent', { intent: 'market_agent' });
    // Round one is almost always cari_pasar on exactly this text — start it now
    // rather than after the model's first turn.
    // Prefetched national, keyed national: cari_pasar's kota is optional and the
    // model usually omits it. A call that DOES name a city must not be served
    // country-wide rows, so it misses the cache and runs its own query.
    const pf = parsePlaceFromQuery(text);
    const cleaned = cleanDiscoveryQuery(pf.cleaned || text) || (pf.cleaned || text);
    aiPrefetchPasar(cleaned, '', [text, pf.cleaned || text]);
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menyusun rencana…</p>`);
    // What used to be a keyword search still spends a daily search; an
    // analytical question still does not.
    await runMarketAgent(chat, text, loading, { countsAsSearch: !analytical });
    return;
  }

  if (!inProductCtx && catAsk && isCategoryLevelAsk(lower, catAsk)
      && (isProductDiscoveryAsk(lower) || isBareProductQuery(lower))) {
    if (inResultsThread) beginFreshChat();
    setView('chat');
    const chat = ensureComposerChat(text);
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
    // `analytical` measures the cost of the hard veto in isAnalyticalAsk: a long
    // reasoning question that merely CONTAINS an intent keyword ("pasar mana
    // yang paling bagus buat modal 500rb dan gimana strateginya?") is claimed by
    // the card flow. That is deliberate for now — those flows work — but this
    // tells us how often it happens before anyone loosens the veto.
    void logUserEvent('gpt_intent', {
      ui: 'gpt', intent, via: 'chip', analytical: wantsDeepReasoning(lower) ? 1 : 0,
    });
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
    chat = startBlankLocalChat(text);
  }

  // Rebuild thread when leaving DD so the Deep Dive chat card is visible
  // before the new user turn (typing in the composer leaves DD without going
  // through any explicit "back" action).
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
      // Whole-category ask ("hobby", "fashion") must browse the canonical
      // bucket — ilike %hobby% on keyword never fills the catalog.
      const place1 = parsePlaceFromQuery(text);
      const packed = await fetchCategoryPasarTypes([catFallback], place1.city || state.onboarding.city || '', {
        limit: FINDER_PASAR_LIMIT,
      });
      if (packed.types.length && await replyWithPasarTypes(chat, text, packed.types, {
        loading, label: catFallback, placeLabel: place1.label || place1.city || '',
      })) return;

      const gate = await ensureIntentChat(chat, text.slice(0, 60), { kind: 'category_search', category: catFallback, q: text });
      if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
      state.recommendations = [];
      const html = `<p>Belum ketemu pasar di kategori <strong>${esc(catFallback)}</strong>. Coba kata kunci lain atau buka Cari Produk.</p>`;
      if (loading) await revealAssistant(loading, html);
      else await appendAssistantStream(html);
      pushMessage(chat, 'assistant', {
        text: 'Hasil kategori', q: text, category: catFallback, products: [],
      }, html);
      void logUserEvent('discover_view', { ui: 'gpt', q: text, category: catFallback, count: 0 });
      return;
    }
    const place = parsePlaceFromQuery(text);
    const cleaned = cleanDiscoveryQuery(place.cleaned || text) || (place.cleaned || text);
    const placeLabel = place.label || place.city || '';

    // PASAR FIRST: answer with the market, not one shop's listing.
    const types = await searchProductTypes(cleaned, place.city || '', 12);
    if (await replyWithPasarTypes(chat, text, types, { loading, label: cleaned, placeLabel })) return;

    // No market matched by name. Lift listing-title hits to nearby markets
    // (same helper as the Produk search bar). Do not run DeepSeek extras as
    // standalone keyword searches — that dumps adjacent pasar as if they matched.
    const widened = await searchNearbyProductTypes(cleaned, place.city || '', 12);
    if (widened.length && await replyWithPasarTypes(chat, text, widened, {
      loading, label: cleaned, placeLabel, nearby: true,
    })) return;

    // Dead-end rescue: both the pasar search and the listing-widening found
    // nothing, so this used to end at a clarification card. If the question was
    // analytical, let the agent try instead — nothing is being taken away from
    // a path that already failed.
    if (AI_AGENT_ROUTER && currentUser && isAnalyticalAsk(text.toLowerCase())) {
      void logUserEvent('gpt_intent', { ui: 'gpt', intent: 'market_agent', via: 'clarify_rescue', analytical: 1 });
      clarityEvt('gpt_intent', { intent: 'market_agent' });
      await runMarketAgent(chat, text, loading);
      return;
    }

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
    const domain = detectSearchDomain(cleaned.toLowerCase());
    const html = searchClarifyHtml(text, domain);
    void logUncoveredSearch(text, { category: domain?.id || null });
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
      domain: domain?.id || '',
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
  const reply = await streamAssistantReply(loading, system, history, {
    root,
    tools: AI_TOOLS,
    thinking: wantsDeepReasoning(text),
  });
  const replyText = _aiReplyText(reply);
  // Thinking is deliberately NOT persisted: chatHistoryForAi would replay it as
  // a visible assistant turn, and renderChatThread would show it on reload.
  // staticHtml() is the settled run panel with the trace already stripped.
  const runHtml = (typeof reply === 'object' && reply.run?.staticHtml?.()) || '';
  pushMessage(chat, 'assistant', { text: replyText },
    runHtml + (mdToHtml(replyText) || `<p>${esc(replyText)}</p>`));
  void logUserEvent('gpt_ai_reply', { ui: 'gpt', keyword: product.keyword, via: root ? 'side_panel' : 'composer' });
  clarityEvt('gpt_ai_reply', {});
  // Learn from what the user said, after the reply so it never delays it.
  extractFactsFromText(text).forEach(([k, v]) => { void rememberFact(k, v, 'chat'); });
}

/**
 * "Is [category] a good idea?" system prompt — fed real aggregate pasar stats
 * (seller counts, omset, breakout/trend) per sub-market in the category, the
 * same fields the directory range filters already compute a score from
 * (js/gpt-dir-filters.js skorOf), rather than a fresh live aggregation layer.
 */
function buildCategoryEvalSystemPrompt(category, types, question) {
  const rows = (types || []).slice(0, 15);
  const stats = rows.map((t, i) => {
    const omset = Math.round(Number(t.omset_top15) || 0).toLocaleString('id-ID');
    const trend = Number(t.trend_delta_30d) || 0;
    const skor = _skorOf(t);
    return `${i + 1}. ${t.keyword} — skor ${skor ?? '?'}/100, ${t.n_sellers ?? '?'} seller, omset top15/bln ~Rp${omset}, breakout_rate ${t.breakout_rate ?? '?'}%, tren 30hr ${trend >= 0 ? '+' : ''}${trend}%`;
  }).join('\n');
  const lang = detectReplyLanguage(question);
  const langLabel = replyLanguageLabel(lang);
  const voice = lang === 'en'
    ? 'Reply in clear English (informal professional "you").'
    : 'Jawab dalam Bahasa Indonesia informal ("kamu").';

  return `You are LarisID's product research assistant (Ask Laris). ${voice}
LANGUAGE: Write ONLY in ${langLabel}.
User is deciding whether "${category}" is a good category to sell in on Shopee.
PENTING:
- Jawab berdasarkan DATA PASAR di bawah — jangan mengarang angka.
- Kalau data menunjukkan banyak seller + omset tinggi merata, itu artinya kompetisi tinggi/jenuh, bukan otomatis "bagus". Sebutkan sub-pasar mana yang jenuh vs mana yang masih punya breakout_rate/tren naik tinggi dengan seller lebih sedikit (peluang lebih baik untuk pemula).
- Beri kesimpulan jujur dan spesifik: sub-kategori/niche mana yang lebih layak dicoba, dan mana yang sebaiknya dihindari karena terlalu ramai.
- Kalau data di bawah kosong atau terlalu tipis untuk disimpulkan, katakan itu terus terang — jangan menebak.
${aiLengthRule(langLabel)}
${aiCapabilityContract()}
${aiToolsInstruction()}${aiPlanInstruction()}

DATA PASAR — kategori "${category}" (${rows.length} sub-pasar):
${stats || 'Belum ada data pasar yang cukup untuk kategori ini.'}`;
}

/**
 * Market-level agent prompt. Deliberately carries NO pre-fetched market data —
 * fetching what it needs is the entire point, and guessing wrong up front is
 * what made the old path answer with a clarification card instead of an answer.
 */
function buildMarketAgentSystemPrompt(question, chat) {
  const lang = detectReplyLanguage(question);
  const langLabel = replyLanguageLabel(lang);
  const voice = lang === 'en'
    ? 'Reply in clear English (informal professional "you").'
    : 'Jawab dalam Bahasa Indonesia informal ("kamu").';
  const lower = String(question || '').toLowerCase();
  const city = state.onboarding?.city || '';
  const onboardCats = (state.onboarding?.categories || []).filter(Boolean).slice(0, 5);
  const research = chat?.context?.research || {};
  // A category named in THIS message scopes the search, and so does one the
  // thread is already carrying — but applyResearchFromText has already released
  // the thread's category into categoryHint if this turn was an open "so what
  // should I sell". That release is the fix: the interest was DEFINING the
  // search ("aku di Bau-Bau, jual apa?" -> searched Olahraga) when its only job
  // is to help rank whatever the question itself turns up.
  const askedCat = detectCategoryFromText(lower);
  const namedCat = askedCat || research.category || chat?.context?.categoryOverride || null;
  const hints = [...new Set([chat?.context?.categoryHint || '', ...onboardCats].filter(Boolean))];
  const lead = hints[0] || '';
  let who = '';
  if (namedCat) {
    who = `\nKONTEKS THREAD: kategori ${namedCat}. Cari HANYA di kategori ini. Jangan memfilter ke minat onboarding lain.`;
  } else {
    who = `\nKONTEKS USER — HINT, BUKAN FILTER:
- kota dari onboarding: ${city || 'belum disebut'}
- minat: ${hints.length ? hints.join(', ') : 'belum ada'}
ATURAN MINAT (mengikat):
- Minat itu untuk MENCOCOKKAN dan MENGURUTKAN apa yang kamu temukan, BUKAN untuk menentukan apa yang dicari. Jangan memanggil pasar_kategori hanya karena minat ini ada.
- Kalau user menyebut kota — kota mana pun, sekecil apa pun — panggil pasar_kota untuk kota itu DULU. Baru sesudah itu tandai mana temuan yang kebetulan cocok dengan minatnya. Kalau tidak ada yang cocok, laporkan apa yang benar-benar dijual dari sana; jangan menggantinya dengan minatnya.
- Kalau user tidak menyebut kota tapi kota di atas ada, boleh pakai pasar_kota untuk kota itu — tapi katakan sekali bahwa kamu memakai kota dari profilnya.
- Kalau tidak ada kota sama sekali dan kategori tetap tidak jelas, cari LINTAS kategori atau tanya SATU kali. Jangan diam-diam memilih ${lead || 'kategori minat'}.
- Kalau pada akhirnya kamu memakai minat itu sebagai penyaring, kalimat pertama jawaban HARUS: "Aku pakai minat ${lead || 'itu'}-mu — bilang kategori lain kalau mau diganti."`;
  }
  const thread = _gptMem().researchPromptBlock?.(research) || '';

  return `You are LarisID's product research assistant (LARISgpt). ${voice}
LANGUAGE: Write ONLY in ${langLabel}. If the user mixed languages, use the language that is most prevalent in their message.
User bertanya soal PASAR secara umum — belum membuka satu produk tertentu.
PENTING:
- Angka penjualan/harga/omset/skor HARUS dari alat data. Jangan mengarang statistik pasar.
- Mulai dengan memanggil alat. Jangan menjawab "aku butuh info lebih dulu" tanpa memanggil alat.
- Sebut nama pasar dan angkanya secara konkret, jangan generik.
- Banyak seller + omset tinggi merata artinya pasar jenuh, bukan otomatis "bagus".
- Jangan bilang kamu "melihat" produk — kamu membaca data.
- Jangan tulis daftar nama listing sebagai bullet. Hasil setiap alat sudah tampil sebagai tabel yang bisa diklik di panel langkah, dan kartu pasar muncul di bawah jawaban — itu yang diklik user. Tugasmu menyimpulkan, bukan mengetik ulang daftarnya.
- Omset listing dari alat: label "terukur" = diukur, "perkiraan" = estimasi. Jangan menyamakan keduanya.
- Follow-up pendek ("mau", "iya", "untuk fashion") mengacu ke pertanyaan/tawaran TERAKHIR di thread, bukan kata kunci produk baru.
- Putaran alat pertama harus membawa filter user (umur listing, omset min, kategori yang disebut). Jangan buang satu putaran untuk pasar_kategori dari minat onboarding.
- Kalau user menyebut kotanya, putaran pertama WAJIB memuat pasar_kota untuk kota itu.
${aiLengthRule(langLabel)}
${aiCapabilityContract()}
${aiToolsInstruction()}${aiPlanInstruction()}${who}${thread}`;
}

/**
 * A market-level question answered by the agent instead of a search card.
 *
 * An analytical question persists via ensureChatPersisted, which never walls —
 * reasoning over data must not burn one of the user's 3 daily product searches.
 * A question that WOULD have been a keyword search passes countsAsSearch and
 * goes through ensureIntentChat instead, so routing every prompt through the
 * agent does not quietly retire the gpt_new_chat cap.
 */
async function runMarketAgent(chat, text, loading, opts = {}) {
  if (!chat.context) chat.context = {};
  chat.context.kind = 'market_agent';
  chat.context.q = chat.context.q || text;
  applyResearchFromText(chat, text);
  const ctx = {
    kind: 'market_agent',
    q: chat.context.q,
    research: chat.context.research || null,
    categoryOverride: chat.context.categoryOverride || null,
    categoryHint: chat.context.categoryHint || null,
  };
  // A question that used to be a keyword search still spends one of the daily
  // searches. Analytical asks keep going through ensureChatPersisted, which
  // never walls — moving all searches onto this path must not quietly retire
  // the gpt_new_chat cap.
  if (opts.countsAsSearch) {
    if (!(await ensureSearchAllowed())) { loading?.remove?.(); return; }
    const gate = await ensureIntentChat(chat, text.slice(0, 60), ctx);
    if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  } else {
    await ensureChatPersisted(chat, text.slice(0, 60), ctx);
  }
  if (!(await _useAi('mls_chat'))) { loading?.remove?.(); return; }
  const system = buildMarketAgentSystemPrompt(text, chat) + memoryPromptBlock();
  const history = chatHistoryForAi(chat, text);
  const reply = await streamAssistantReply(loading, system, history, {
    tools: AI_TOOLS,
    thinking: true,   // first turn only — streamAssistantReply drops it after
  });
  await paintAgentMarketReply(chat, loading, reply);
  void logUserEvent('gpt_ai_reply', { ui: 'gpt', via: 'market_agent' });
  clarityEvt('gpt_ai_reply', {});
  extractFactsFromText(text).forEach(([k, v]) => { void rememberFact(k, v, 'chat'); });
}

/** Ask Laris' "should I sell X category" turn — category-level, not one product. */
async function handleAskLarisEvaluate(chat, text, category, loading) {
  if (!(await _useAi('mls_chat'))) { loading?.remove?.(); return; }
  applyResearchFromText(chat, text);
  if (category) {
    if (!chat.context) chat.context = {};
    chat.context.categoryOverride = category;
    chat.context.research = _gptMem().mergeResearchConstraints?.(chat.context.research, { category }) || { category };
  }
  // fetchCategoryPasarTypes, not fetchCategoryShowcase: the showcase path
  // filters listings_deduped.category (the 85 raw scrape strings) while this
  // routes through resolveCanonCats to category_canonical, which is the
  // vocabulary product_types_v actually uses.
  const packed = await fetchCategoryPasarTypes([category], '', { limit: 15 });
  const types = packed?.types || [];
  const system = buildCategoryEvalSystemPrompt(category, types, text) + memoryPromptBlock();
  const history = chatHistoryForAi(chat, text);
  const reply = await streamAssistantReply(loading, system, history, {
    tools: AI_TOOLS,
    thinking: true,   // this path is judgment by definition
  });
  await paintAgentMarketReply(chat, loading, reply, types);
  void logUserEvent('gpt_ai_reply', { ui: 'gpt', keyword: category, via: 'ask_laris_evaluate' });
  clarityEvt('gpt_ai_reply', {});
}

function _aiReplyText(reply) {
  return typeof reply === 'string' ? reply : String(reply?.text || '');
}

/* ── Rencana Jualan ─────────────────────────────────────────────────────────
 *
 * A cohort student names what they want to sell and gets a starting plan:
 * price band, titles, description, keywords, and the traits that separate new
 * shops that get somewhere from new shops that stall.
 *
 * The whole thing is the existing agent with a different system prompt and a
 * fixed opening move. It runs inside the cohort panel via the same
 * appendBubble({root}) + streamAssistantReply({root}) pair the Tanya AI side
 * panel uses, so the visible plan/step panel comes along for free.
 */

/**
 * The modal (cost per unit) is the reason this prompt exists in its own right
 * rather than as a chip on the market agent. Every pricing suggestion in the
 * new-shop data points downward, and a beginner told "new shops here sell at
 * Rp 21.000" with no cost anchor will price below their own cost and call it
 * research. When modal is known the prompt is required to refuse a price under
 * it; when it is not, it is required to ask rather than guess.
 */
function buildRencanaSystemPrompt(input) {
  const produk = String(input?.produk || '').trim();
  const kota = String(input?.kota || '').trim();
  const modal = Number(input?.modal) || 0;
  const rp = (v) => `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;

  const modalBlock = modal > 0
    ? `MODAL USER: ${rp(modal)} per unit (harga pokok, sudah dia sebut).
- Setiap harga yang kamu sarankan WAJIB di atas angka ini. Kalau harga pasar
  toko baru ternyata di bawah modalnya, KATAKAN TERUS TERANG bahwa di harga
  pasar sekarang dia rugi, dan bahas pilihannya (turunkan modal, ganti ukuran/
  kemasan, atau pilih pasar lain) — jangan tetap menyarankan harga rugi.`
    : `MODAL USER: belum disebut.
- Sebutkan sekali bahwa saran harga di bawah belum memperhitungkan modalnya,
  dan minta dia sebut harga pokok per unit supaya bisa dicek. Jangan mengarang
  angka modal.`;

  const kotaBlock = kota
    ? `KOTA USER: ${kota}. Kolom lokasi di data kami adalah lokasi PENJUAL, bukan
pembeli — jadi pakai ini untuk membahas ongkir dan di mana pesaing menumpuk,
JANGAN mengklaim tahu di mana pembelinya berada.`
    : `KOTA USER: belum disebut. Boleh tanya sekali di akhir kalau relevan.`;

  return `You are LARISgpt, pendamping riset untuk peserta kelas jualan LarisID.
Jawab dalam Bahasa Indonesia informal ("kamu"). Tanpa emoji.

TUGAS: user ini PENJUAL BARU yang mau mulai jual "${produk}". Susun rencana
awal yang bisa dia kerjakan minggu ini, seluruhnya dari data LarisID.

${kotaBlock}

${modalBlock}

URUTAN ALAT (ikuti, jangan dilewat):
1. cari_pasar dengan "${produk}" untuk menemukan pasar yang tepat.
2. pemain_baru pada pasar itu — ini inti jawabannya: harga toko baru vs toko lama.
3. judul_menang pada pasar yang sama — untuk judul dan keyword.
4. pola_toko_baru pada kategorinya — untuk bagian "apa yang membedakan".
Kalau salah satu kosong, bilang bagian mana yang tidak terukur; jangan diisi tebakan.

BENTUK JAWABAN — pakai heading persis ini, urut, tanpa tambahan:
## Pasar
Satu paragraf: pasar mana yang kamu pilih dan kenapa, dengan angkanya.
## Harga mulai
Rentang harga yang masuk akal untuk toko baru, dengan alasannya dari pemain_baru.
Sebut selisihnya terhadap toko lama. Sertakan cek modal sesuai aturan di atas.
## Judul
Tepat 3 opsi judul, satu baris masing-masing, memakai kata yang benar-benar
muncul di listing laris pasar ini (dari judul_menang).
## Deskripsi
Draf deskripsi 4-6 kalimat. Awali dengan satu kalimat jujur bahwa ini susunanmu
dari pola judul dan konteks pasar — kami tidak punya deskripsi toko lain.
## Keyword
6-10 keyword, dipisah koma, dari kata pembeda + variasi wajar.
## Yang membedakan toko baru yang berhasil
2-3 poin dari pola_toko_baru, dengan angkanya, DAN batasannya (korelasi, bukan sebab).
## Langkah minggu ini
3-4 langkah konkret yang bisa dia kerjakan dalam 7 hari.

ATURAN KEJUJURAN (mengikat):
- Jangan menjanjikan hasil. Tidak ada "dijamin laku", tidak ada proyeksi omset
  yang tidak keluar dari alat.
- Kalau pemain_baru mengembalikan level "kategori", katakan di bagian Harga
  bahwa angkanya rata-rata kategori karena pasar ini masih sepi toko baru.
- Umur toko itu perkiraan minimum, bukan tanggal berdiri.
- Jangan menyuruh potong harga tanpa cek modal.

${aiCapabilityContract()}
${aiToolsInstruction()}${aiPlanInstruction()}`;
}

/**
 * Run one Rencana Jualan turn into `root` (a container inside the cohort panel).
 *
 * Deliberately NOT routed through ensureIntentChat: this is a cohort exercise,
 * not a keyword search, so it must not consume the gpt_new_chat 3/day cap. It
 * still goes through _useAi(), which since the unlimited migration is a login
 * gate plus an analytics ping and fails open.
 */
async function runRencanaJualan(input, opts = {}) {
  const root = opts.root || null;
  const produk = String(input?.produk || '').trim();
  if (!produk) return null;
  if (!currentUser) { openAuthModal('login', 'gpt_gate_rencana'); return null; }
  if (!(await _useAi('rencana_jualan'))) return null;

  const loading = appendBubble(
    'assistant',
    `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menyusun rencana untuk "${esc(produk)}"…</p>`,
    root ? { root } : {},
  );

  // Same trick the market agent uses: fire the first query at routing time so
  // the opening cari_pasar is usually already resolved when the model asks.
  aiPrefetchPasar(produk, input?.kota || '', []);

  const system = buildRencanaSystemPrompt(input) + memoryPromptBlock();
  const ask = [`Saya mau mulai jual ${produk}.`,
    input?.kota ? `Saya di ${input.kota}.` : '',
    Number(input?.modal) > 0 ? `Modal saya Rp ${Math.round(input.modal).toLocaleString('id-ID')} per unit.` : '',
  ].filter(Boolean).join(' ');

  const reply = await streamAssistantReply(loading, system, [{ role: 'user', content: ask }], {
    root,
    tools: AI_TOOLS,
    thinking: true,
  });
  const text = _aiReplyText(reply);
  void logUserEvent('rencana_jualan_run', { ui: 'gpt', keyword: produk, kota: input?.kota || '' });
  clarityEvt('rencana_jualan_run', {});
  // The market the model actually settled on, so the follow-up track offer is
  // for that keyword and not the raw words the student typed.
  const pasar = (typeof reply === 'object' && reply.pasarKeys?.[0]) || produk;
  return { text, pasar, html: (typeof reply === 'object' && reply.run?.staticHtml?.()) || '' };
}

function pendingOfferChipsHtml(offer) {
  if (!offer?.prompt) return '';
  const yes = offer.yesLabel || 'Ya, lanjut';
  const no = offer.noLabel || 'Tidak, cari yang lain';
  return `<div class="chips" style="margin-top:10px">`
    + `<button type="button" class="chip" data-suggest-q="${esc(offer.prompt)}">${esc(yes)}</button>`
    + `<button type="button" class="chip" data-suggest-q="Tidak, cari yang lain">${esc(no)}</button>`
    + `</div>`;
}

async function resolvePasarTypes(keys) {
  const uniq = [...new Set((keys || []).filter(Boolean))].slice(0, 12);
  if (!uniq.length) return [];
  const have = uniq.map(k => _ptypeByKeyword.get(k)).filter(Boolean);
  if (have.length >= Math.min(3, uniq.length)) return have.slice(0, 8);
  try {
    return await typesForListings(uniq.map(k => ({ keyword: k })), '', 8);
  } catch (_) {
    return have.slice(0, 8);
  }
}

async function paintAgentMarketReply(chat, loading, replyObj, fallbackTypes) {
  const text = _aiReplyText(replyObj);
  const thinking = typeof replyObj === 'object' ? (replyObj.thinking || '') : '';
  const keys = typeof replyObj === 'object' ? (replyObj.pasarKeys || []) : [];
  let types = await resolvePasarTypes(keys);
  if (!types.length && fallbackTypes?.length) {
    registerTypes(fallbackTypes);
    types = fallbackTypes.slice(0, 8);
  }
  const offer = _gptMem().extractPendingOffer?.(text) || null;
  if (!chat.context) chat.context = {};
  chat.context.pendingOffer = offer;
  // Markets already drawn inside a tool step do not get a second card below the
  // answer — the run panel showed them being found.
  const run = (typeof replyObj === 'object' && replyObj.run) || null;
  const shownInRun = new Set();
  if (run?.el) {
    run.el.querySelectorAll('[data-ptype-kw]').forEach(el => {
      const kw = el.getAttribute('data-ptype-kw');
      if (kw) shownInRun.add(kw);
    });
  }
  const fresh = types.filter(t => !shownInRun.has(t.keyword));

  let tail = '';
  if (offer) tail += pendingOfferChipsHtml(offer);
  if (fresh.length) {
    const listings = await fetchListingsForKeywords(fresh.map(t => t.keyword), 12, 80);
    tail += listings.length
      ? listingRowsHtml(listings, { compact: true })
      : `<div class="card-grid">${marketCardsHtml(fresh)}</div>`;
  }

  const bubble = loading?.querySelector?.('.msg-bubble') || loading;
  // The run panel is live DOM built node by node — writing bubble.innerHTML here
  // would erase the whole visible plan. Only the answer region and the tail move.
  const answerEl = run?.answerEl || bubble;
  const answerHtml = _aiBubbleHtml(text, run ? '' : thinking);
  if (answerEl) answerEl.innerHTML = answerHtml + tail;
  else if (bubble) bubble.innerHTML = answerHtml + tail;
  bindTypeCards(loading);
  bindListingRows(loading);
  bindSearchSuggests(loading);
  void hydrateProdCardsIn();
  // Persisted copy: the settled run (no spinners, no reasoning trace) plus the
  // answer, so a reload replays what the user ended up looking at.
  const html = (run?.staticHtml?.() || '') + answerHtml + tail;
  pushMessage(chat, 'assistant', {
    text,
    q: chat.context?.q || '',
    types: types.map(t => t.keyword),
  }, html);
  saveLocalState();
}

// ── AI tools ─────────────────────────────────────────────────────────────
// The model can read LarisID's data itself instead of telling the user to go
// look it up. Every tool wraps a function that already exists and is already
// debugged — searchProductTypes alone carries EN->ID synonym expansion,
// multi-clause splitting, the word-prefix ILIKE that stops "gelang" matching
// "pergelangan", and a migration-skew fallback. Reimplementing any of that
// server-side would reintroduce every one of those bugs.
//
// The loop runs in the browser, so queries execute as the logged-in user under
// RLS and the model never authors SQL — tools are named functions with typed
// args.

const AI_TOOL_MAX_TURNS = 4;   // = 3 tool rounds, then a forced prose turn
// 8, not 6: in testing the model fanned out 6 detail_pasar calls in a single
// round, which exhausted a 6-budget and left it apologising about the limit.
const AI_TOOL_MAX_CALLS = 8;
const AI_TOOL_TIMEOUT_MS = 8000;

// Questions that deserve reasoning rather than a lookup. Extended thinking costs
// latency before the first token, so simple asks stay fast.
const AI_DEEP_MARKERS = /\b(kenapa|mengapa|why|bandingkan|banding|compare|mana yang|yang mana|which|sebaiknya|should i|worth|bedanya|beda|risiko|risk|strategi|strategy|untung|rugi|prospek|peluang|jelaskan|explain|analisa|analisis|analyze|skor|score|impor|import|paling bagus|terbaik|best)\b/i;

function wantsDeepReasoning(text) {
  const s = String(text || '').toLowerCase().trim();
  if (s.length < 25) return false;
  if (isEvaluativeAsk(s)) return true;
  if (AI_DEEP_MARKERS.test(s)) return true;
  if ((s.match(/\?/g) || []).length >= 2) return true;   // multi-part ask
  return s.length >= 60 && _searchTerms(s).length >= 5;
}

// Kill switch for the agent routing below. Flip to false to restore exactly the
// pre-agent behaviour (analytical questions go back to being keyword searches).
const AI_AGENT_ROUTER = true;

// Every typed prompt runs through the agent, so a bare "botol minum" gets the
// same visible plan-and-steps treatment as an analytical question instead of a
// silent card grid. Gated on currentUser at each call site: runMarketAgent goes
// through _useAi(), which is a login gate, and walling the composer for
// logged-out visitors would both cost signups and break MISSION.md's free tier.
const AI_AGENT_ALL = true;

// The agent's first round is nearly always cari_pasar on what the user typed.
// Firing that query the moment routing decides, instead of after the model's
// first turn, is what keeps a plain search from feeling slower than it was.
const AI_PREFETCH_TTL_MS = 60000;
const _aiPrefetch = new Map();

function aiPrefetchKey(query, kota) {
  return `${String(query || '').trim().toLowerCase()}|${String(kota || '').trim().toLowerCase()}`;
}

/**
 * `aliases` all point at ONE query. The router knows the cleaned form ("botol
 * minum"), but the model may call cari_pasar with the raw text it was given —
 * registering both keys against the same promise is what makes the cache
 * actually hit, without issuing a second query.
 */
function aiPrefetchPasar(query, kota, aliases = []) {
  const q = String(query || '').trim();
  if (!q) return;
  const keys = [q, ...aliases].map(k => aiPrefetchKey(k, kota));
  const fresh = _aiPrefetch.get(keys[0]);
  if (fresh && Date.now() - fresh.at < AI_PREFETCH_TTL_MS) return;
  // Never awaited and never rejects: a failed prefetch just means the tool pays
  // for its own query, exactly as before.
  const rows = searchProductTypes(q, kota || '', 12, { skipLog: true }).catch(() => null);
  const entry = { at: Date.now(), rows };
  new Set(keys).forEach(k => _aiPrefetch.set(k, entry));
  while (_aiPrefetch.size > 12) _aiPrefetch.delete(_aiPrefetch.keys().next().value);
}

/** Left in the map on purpose: a later round asking the same thing reuses it. */
async function aiPrefetchGet(query, kota) {
  const hit = _aiPrefetch.get(aiPrefetchKey(query, kota));
  if (!hit || Date.now() - hit.at > AI_PREFETCH_TTL_MS) return null;
  try { return await hit.rows; } catch (_) { return null; }
}

/**
 * A question that wants reasoning over the data, rather than a grid of cards.
 * The three vetoes come FIRST and are absolute — chips, bare product nouns and
 * "recommend me something" all have working non-AI paths that must keep
 * priority. Without them this would swallow the whole search experience.
 */
function isAnalyticalAsk(lower) {
  const s = String(lower || '');
  if (detectIntent(s)) return false;                                  // chips own these
  if (isBareProductQuery(s)) return false;                            // "dresses" is a search
  if (/tunjukkan|rekomendasi|jual apa|produk apa|cocok buat|mulai jual/.test(s)) return false;
  if (/^produk lain$|tampilkan produk lain|^rekomendasi baru$/.test(s)) return false;
  return wantsDeepReasoning(s);
}

/** Compact one product_types_v row for the model. ~55 tokens. */
function _aiPackType(t) {
  const num = (v) => (v == null || v === '' ? null : Number(v));
  return {
    pasar: t.keyword,
    kategori: t.category_canonical || t.category || null,
    skor: _skorOf(t),
    seller: num(t.n_sellers),
    listing: num(t.n_listings),
    harga_med: Math.round(num(t.price_median) || 0),
    harga_p25: t.price_p25 ? Math.round(t.price_p25) : null,
    harga_p75: t.price_p75 ? Math.round(t.price_p75) : null,
    omset_top15_jt: Math.round((num(t.omset_top15) || 0) / 1e6),
    tren_30h: num(t.trend_delta_30d) || 0,
    breakout_pct: num(t.breakout_rate),
    top3_share_pct: Math.round(num(t.sold_top3_share) || 0),
    produk_baru: num(t.niche_new_items),
    // Weekly movement drives the "terlaris minggu ini" verdict. Null (not zero)
    // when there is no usable snapshot pair — see weeklyStats().
    terjual_minggu: num(t.wk_units),
    listing_gerak_minggu: num(t.wk_items),
  };
}

function _aiPackListing(r) {
  const extra = _gptMem().packListingFields?.(r) || {};
  return {
    nama: (r.product_name || '').slice(0, 70),
    toko: r.store_name || null,
    harga: Math.round(Number(r.price) || 0),
    terjual: Number(r.total_sold) || 0,
    lokasi: r.location || null,
    rating: r.rating ?? null,
    ulasan: r.reviews ?? null,
    pasar: r.keyword || null,
    listing_date: extra.listing_date || r.listing_date || null,
    umur_hari: extra.umur_hari ?? null,
    omset_bln: extra.omset_bln ?? null,
    omset_label: extra.omset_label || null,
  };
}

/** Top-N histogram of a field — how the model reaches "sellers cluster in X". */
function _aiHistogram(rows, field, top = 8) {
  const counts = new Map();
  for (const r of rows || []) {
    const k = r[field];
    if (!k) continue;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, top)
    .map(([lokasi, n]) => ({ lokasi, n }));
}

const AI_TOOLS = [
  {
    name: 'cari_pasar',
    description: 'Cari PASAR (product type / keyword) di data LarisID dari teks bebas. Alat utama — hampir semua pertanyaan pasar mulai dari sini. Sudah termasuk ekspansi sinonim EN ke ID ("dresses" jadi "gaun"). Tiap baris membawa skor 0-100.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci produk, BUKAN kalimat pertanyaan. Contoh: "gaun pesta", "tumbler stainless".' },
        kota: { type: 'string', description: 'Kota seller (opsional). Kosongkan untuk nasional.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 12 },
      },
      required: ['query'],
    },
  },
  {
    name: 'pasar_kota',
    description: 'Apa yang BENAR-BENAR dijual toko di satu kota: pasar teratas, kategori, dan daftar tokonya, dihitung dari lokasi SELLER. Pakai SETIAP KALI user menyebut kotanya dan bertanya mau jual apa — mulai dari sini, bukan dari kategori minatnya. Hasilnya membawa `catatan` soal cakupan data yang WAJIB kamu sampaikan.',
    input_schema: {
      type: 'object',
      properties: {
        kota: { type: 'string', description: 'Nama kota/kabupaten apa adanya seperti ditulis user. Ejaan bebas: "bau bau", "Bau-Bau", "Kab. Bandung" sama saja.' },
        limit: { type: 'integer', minimum: 3, maximum: 25, default: 12 },
      },
      required: ['kota'],
    },
  },
  {
    name: 'pasar_kategori',
    // enum built from the constant, never a literal, so the two cannot drift
    description: 'Ambil daftar pasar dalam satu kategori kanonik. Pakai kalau user menyebut kategori luas (fashion, dapur, kecantikan) dan bukan produk spesifik. Diurut dari omset terbesar; skor 0-100 ikut di tiap baris.',
    input_schema: {
      type: 'object',
      properties: {
        kategori: { type: 'string', enum: DIR_CANON_CATS.slice() },
        kota: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 15 },
      },
      required: ['kategori'],
    },
  },
  {
    name: 'detail_pasar',
    description: 'Detail satu pasar: agregat lengkap, skor, 10 seller teratas, dan SEBARAN LOKASI SELLER. Pakai setelah cari_pasar untuk menjawab siapa yang menang, dari mana sellernya, berapa harganya.',
    input_schema: {
      type: 'object',
      properties: {
        pasar: { type: 'string', description: 'Nilai `pasar` persis seperti yang dikembalikan cari_pasar.' },
        kota: { type: 'string' },
      },
      required: ['pasar'],
    },
  },
  {
    name: 'cari_listing',
    description: 'Cari LISTING individual (satu produk dari satu toko). Pakai hanya kalau user menanyakan item/brand tertentu, bukan pasar. Hasil juga membawa pasar tempat listing itu berada.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        lokasi: { type: 'array', items: { type: 'string' }, description: 'Filter lokasi seller (kota/kabupaten Indonesia).' },
        limit: { type: 'integer', minimum: 1, maximum: 30, default: 15 },
      },
      required: ['query'],
    },
  },
  {
    name: 'filter_listing',
    description: 'Ambil listing dengan filter terstruktur. Pakai untuk MENGUJI HIPOTESIS dan untuk filter umur listing (umur_hari_max) / omset_min yang user sebut. Wajib isi minimal satu filter.',
    input_schema: {
      type: 'object',
      properties: {
        pasar: { type: 'string', description: 'Batasi ke satu keyword/pasar.' },
        judul_mengandung: {
          type: 'array', items: { type: 'string' }, maxItems: 4,
          description: 'Kata dalam nama produk (OR). Contoh: ["impor","import","china"].',
        },
        lokasi: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        harga_min: { type: 'integer' },
        harga_max: { type: 'integer' },
        min_terjual: { type: 'integer' },
        umur_hari_max: {
          type: 'integer', minimum: 1, maximum: 730,
          description: 'Listing tidak lebih tua dari N hari (dari listing_date). 3 bulan ≈ 90.',
        },
        omset_min: {
          type: 'integer',
          description: 'Omset per bulan minimal (nowcast_omset_monthly, rupiah). 300 juta = 300000000. Label terukur/perkiraan ikut di tiap baris.',
        },
        urut: { type: 'string', enum: ['terjual', 'termurah', 'termahal'], default: 'terjual' },
        limit: { type: 'integer', minimum: 1, maximum: 40, default: 25 },
      },
    },
  },
  {
    name: 'produk_dibuka',
    description: 'Data produk yang sedang dibuka user di Deep Dive, lengkap dengan Skor Produk /100 dan komponennya. Panggil kalau user bilang "ini", "produk ini", atau menanyakan skor.',
    input_schema: { type: 'object', properties: {} },
  },
  // ── Rencana Jualan trio ────────────────────────────────────────────────────
  // These three are RPCs, not PostgREST reads: each aggregates over millions of
  // rows. None of them touches auth.uid(), so the detached-session trap that
  // makes _supabase.rpc() send the anon key is irrelevant to them.
  {
    name: 'pemain_baru',
    description: 'Apa yang dilakukan TOKO BARU di satu pasar: harga mereka vs toko lama, berapa persen tembus 10 dan 100 unit, dan dari kota mana mereka. Alat utama untuk pertanyaan "saya baru mulai, harus jual di harga berapa". Selalu cek field `level`: kalau "kategori", angkanya rata-rata kategori karena pasar ini terlalu sepi toko baru — katakan itu ke user.',
    input_schema: {
      type: 'object',
      properties: {
        pasar: { type: 'string', description: 'Nilai `pasar` persis seperti yang dikembalikan cari_pasar.' },
        kota: { type: 'string', description: 'Kota user (opsional). Dipakai sebagai konteks, bukan filter.' },
      },
      required: ['pasar'],
    },
  },
  {
    name: 'pola_toko_baru',
    description: 'Studi lintas pasar: apa yang membedakan listing toko baru yang tembus 100 unit dari yang mandek, plus berapa hari 1 → 10 → 100 unit. Pakai untuk menjawab "apa yang bikin toko baru berhasil". WAJIB baca field `catatan` dan sampaikan batasannya — semua angka di sini korelasi, bukan sebab-akibat.',
    input_schema: {
      type: 'object',
      properties: {
        kategori: { type: 'string', enum: DIR_CANON_CATS.slice(), description: 'Kosongkan untuk gabungan semua kategori.' },
      },
    },
  },
  {
    name: 'judul_menang',
    description: 'Kata-kata yang membedakan JUDUL listing yang laku (>=10 terjual) dari yang sepi, di satu pasar. Pakai sebelum menyarankan judul, deskripsi, atau keyword — supaya sarannya dari pasar ini, bukan dari tebakan. Field `lift` = selisih porsi kata di listing laris dikurangi di listing sepi.',
    input_schema: {
      type: 'object',
      properties: {
        pasar: { type: 'string', description: 'Nilai `pasar` persis seperti yang dikembalikan cari_pasar.' },
        limit: { type: 'integer', minimum: 5, maximum: 30, default: 15 },
      },
      required: ['pasar'],
    },
  },
];

async function _aiToolCariPasar({ query, kota, limit }) {
  const want = Math.min(limit || 12, 20);
  // The prefetch always fetched 12; a larger ask has to go to the DB itself
  // rather than being quietly short-changed.
  const rows = (want <= 12 ? await aiPrefetchGet(query, kota) : null)
    || await searchProductTypes(String(query || ''), kota || '', want, { skipLog: true });
  if (!rows?.length) return { n: 0, pasar: [], hint: 'Tidak ketemu. Coba kata kunci produk yang lebih umum, atau pasar_kategori.' };
  registerTypes(rows);
  return {
    n: rows.length,
    pasar: rows.slice(0, 15).map(_aiPackType),
    __view: { kind: 'pasar', n: rows.length, rows: rows.slice(0, 8) },
  };
}

async function _aiToolPasarKategori({ kategori, kota, limit }) {
  // Routes through resolveCanonCats, so even a legacy/hallucinated category name
  // maps via NU_ONB_TO_CANON instead of silently returning zero rows.
  const packed = await fetchCategoryPasarTypes([kategori], kota || '', { limit: Math.min(limit || 15, 25) });
  const rows = packed?.types || [];
  if (!rows.length) return { n: 0, pasar: [], hint: 'Kategori tidak ketemu; coba cari_pasar dengan kata kunci produk.' };
  registerTypes(rows);
  return {
    n: rows.length,
    kota_bucket: packed.cityBucket || 'ALL',
    pasar: rows.slice(0, 15).map(_aiPackType),
    __view: { kind: 'pasar', n: rows.length, rows: rows.slice(0, 8) },
  };
}

/**
 * What a city's shops actually sell.
 *
 * The onboarding interest used to answer "aku di Bau-Bau, jual apa?" because
 * nothing here could read a city — the agent reached for the only filter it
 * had. This is the missing read, so the interest can go back to being a way to
 * rank what the city turns up rather than the thing that defines the search.
 *
 * The RPC returns the city's own numbers; the national product_types_v rows are
 * fetched here for the same keywords so each row carries a Skor and stays
 * clickable through the ordinary _ptypeByKeyword contract.
 */
async function _aiToolPasarKota({ kota, limit }) {
  const d = await _aiPlaybookRpc('pasar_kota', {
    p_kota: String(kota || ''),
    p_limit: Math.min(Math.max(limit || 12, 3), 25),
  });
  if (d.error) return d;
  const kws = (d.pasar || []).map(p => p.pasar).filter(Boolean);
  let types = [];
  if (kws.length && _supabase) {
    try {
      const { data } = await _supabase.from('product_types_v').select(ptypeCols())
        .in('keyword', kws).eq('city', 'ALL');
      types = data || [];
    } catch (_) { /* the city's own numbers stand without the national ones */ }
  }
  registerTypes(types);
  const byKw = new Map(types.map(t => [t.keyword, t]));
  const pasar = (d.pasar || []).map((p) => {
    const t = byKw.get(p.pasar);
    return t ? { ...p, nasional: _aiPackType(t) } : p;
  });
  return {
    ...d,
    pasar,
    __view: {
      kind: 'kota',
      kota: d.kota,
      kota_cocok: d.kota_cocok || [],
      n_toko: d.n_toko, n_item: d.n_item, n_pasar: d.n_pasar,
      rows: pasar.slice(0, 8),
      toko: (d.toko || []).slice(0, 5),
    },
  };
}

async function _aiToolDetailPasar({ pasar, kota }) {
  if (!_supabase || !pasar) return { error: 'pasar wajib diisi' };
  const fetchRow = async (city) => {
    // .limit(1), not .maybeSingle(): product_types_v has one row per (keyword,
    // city), so an unqualified single() can see more than one row.
    const { data } = await _supabase.from('product_types_v').select(ptypeCols())
      .eq('keyword', pasar).eq('city', city).limit(1);
    return data?.[0] || null;
  };
  let row = await fetchRow(knownCityBucket(kota) || 'ALL');
  if (!row && kota) row = await fetchRow('ALL');
  if (!row) return { error: 'pasar tidak ketemu', hint: 'Pakai nilai `pasar` persis dari cari_pasar.' };
  registerTypes([row]);
  try { await attachTypeQuartiles([row]); } catch (_) { /* quartiles are optional */ }
  const { data: rows } = await _supabase.from('listings_deduped')
    // item_id/shop_id/image_url/url are for the rendered step only — _aiPackListing
    // still strips them, so the model payload is unchanged.
    .select('item_id,shop_id,image_url,url,product_name,store_name,price,total_sold,reviews,rating,location,keyword,listing_date,nowcast_omset_monthly,nowcast_confidence,nowcast_method')
    .eq('keyword', pasar)
    .eq('is_offtopic', false)          // mandatory on every listings_deduped read
    .order('total_sold', { ascending: false })
    .limit(40);
  const list = rows || [];
  const lokasi = _aiHistogram(list, 'location');
  return {
    ..._aiPackType(row),
    top_seller: list.slice(0, 10).map(_aiPackListing),
    lokasi_seller: lokasi,
    n_sampel_lokasi: list.length,
    __view: { kind: 'detail', type: row, sellers: list.slice(0, 5), lokasi },
  };
}

async function _aiToolCariListing({ query, lokasi, limit }) {
  const hits = await searchListings(String(query || ''), Array.isArray(lokasi) ? lokasi : [], Math.min(limit || 15, 30));
  if (!hits?.length) return { n: 0, listing: [], pasar_terkait: [], hint: 'Tidak ketemu listing. Coba cari_pasar.' };
  // Lift back up to markets too: a single listing is never the whole answer.
  let types = [];
  try { types = await typesForListings(hits, '', 8); } catch (_) {}
  return {
    n: hits.length,
    listing: hits.slice(0, 15).map(_aiPackListing),
    pasar_terkait: types.map(_aiPackType),
    __view: { kind: 'listing', n: hits.length, rows: hits.slice(0, 8) },
  };
}

async function _aiToolFilterListing(a = {}) {
  if (!_supabase) return { error: 'db tidak siap' };
  const titles = Array.isArray(a.judul_mengandung) ? a.judul_mengandung.filter(Boolean).slice(0, 4) : [];
  const locs = Array.isArray(a.lokasi) ? a.lokasi.filter(Boolean).slice(0, 8) : [];
  const hasFilter = a.pasar || titles.length || locs.length
    || a.harga_min != null || a.harga_max != null || a.min_terjual != null
    || a.umur_hari_max != null || a.omset_min != null;
  // A bare call is a full scan of an 864k-row matview.
  if (!hasFilter) return { error: 'minimal satu filter wajib diisi' };

  let q = _supabase.from('listings_deduped')
    // item_id/shop_id/image_url/url feed the rendered step only; _aiPackListing
    // still strips them out of the model payload.
    .select('item_id,shop_id,image_url,url,product_name,store_name,price,total_sold,reviews,rating,location,keyword,listing_date,nowcast_omset_monthly,nowcast_confidence,nowcast_method')
    .eq('is_offtopic', false);
  if (a.pasar) q = q.eq('keyword', a.pasar);
  if (locs.length) q = q.in('location', locs);
  if (a.harga_min != null) q = q.gte('price', Number(a.harga_min) || 0);
  if (a.harga_max != null) q = q.lte('price', Number(a.harga_max) || 0);
  if (a.min_terjual != null) q = q.gte('total_sold', Number(a.min_terjual) || 0);
  if (a.omset_min != null) q = q.gte('nowcast_omset_monthly', Number(a.omset_min) || 0);
  if (a.umur_hari_max != null) {
    const days = Math.min(Math.max(Number(a.umur_hari_max) || 0, 1), 730);
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    q = q.gte('listing_date', since);
  }
  if (titles.length) {
    // _sanitizeSearchToken matters: a raw ',' or '.' breaks PostgREST .or().
    const ors = titles.map(t => `product_name.ilike.%${_sanitizeSearchToken(t)}%`).join(',');
    if (ors) q = q.or(ors);
  }
  const urut = a.urut || 'terjual';
  q = q.order(urut === 'terjual' ? 'total_sold' : 'price', { ascending: urut === 'termurah' })
    .limit(Math.min(a.limit || 25, 40));

  const { data, error } = await q;
  if (error) return { error: 'query gagal', detail: String(error.message || '').slice(0, 120) };
  const rows = data || [];
  if (!rows.length) return { n: 0, listing: [], hint: 'Nol baris cocok. Longgarkan filternya.' };
  const prices = rows.map(r => Number(r.price) || 0).filter(Boolean).sort((x, y) => x - y);
  const ringkasan = {
    harga_median: prices.length ? Math.round(prices[Math.floor(prices.length / 2)]) : 0,
    terjual_total: rows.reduce((s, r) => s + (Number(r.total_sold) || 0), 0),
    lokasi_teratas: _aiHistogram(rows, 'location'),
  };
  return {
    n: rows.length,
    ringkasan,
    listing: rows.slice(0, 25).map(_aiPackListing),
    __view: { kind: 'listing', n: rows.length, rows: rows.slice(0, 8), ringkasan },
  };
}

function _aiToolProdukDibuka() {
  if (!_dd?.product) return { error: 'tidak ada produk terbuka' };
  const { product, stats, niche } = _dd;
  const s = ddScore(product, stats, niche);
  const out = {
    produk: _aiPackListing(product),
    kategori: product.category || null,
    skor: s.score,
    label: s.label,
    breakout_pct: s.odds.pct,
    breakout_tier: s.odds.tier,
    breakout_sumber: s.odds.src,
    kompetisi: stats.komp,
    top3_share_pct: Math.round((stats.top3Share || 0) * 100),
    harga_median_pasar: Math.round(stats.median || 0),
    harga_p25: Math.round(stats.p25 || 0),
    harga_p75: Math.round(stats.p75 || 0),
    n_pembanding: stats.n,
  };
  return { ...out, __view: { kind: 'produk', data: out } };
}

/**
 * Shared RPC caller for the three playbook tools.
 *
 * These go through _supabase.rpc() rather than the explicit-token fetch used by
 * add_tracked_keyword and friends, and that is deliberate: none of them reads
 * auth.uid(), so the anon key the SDK sends is exactly the right credential.
 * They are granted to anon+authenticated on purpose — market analytics, no PII.
 */
async function _aiPlaybookRpc(fn, args) {
  if (!_supabase) return { error: 'db tidak siap' };
  const { data, error } = await _supabase.rpc(fn, args);
  if (error) return { error: 'query gagal', detail: String(error.message || '').slice(0, 120) };
  if (!data) return { error: 'tidak ada data' };
  return data;
}

async function _aiToolPemainBaru({ pasar, kota }) {
  if (!pasar) return { error: 'pasar wajib diisi' };
  const d = await _aiPlaybookRpc('pemain_baru_pasar', {
    p_keyword: String(pasar), p_kota: String(kota || ''),
  });
  if (d.error) return d;
  // level:'kategori' means the numbers are the category's, not this market's.
  // Surfacing it in __view too keeps the rendered step honest even if the model
  // forgets to repeat catatan_level in its prose.
  return { ...d, __view: { kind: 'pemain_baru', data: d } };
}

async function _aiToolPolaTokoBaru({ kategori }) {
  // resolveCanonCats, not the raw argument: a legacy or hallucinated category
  // name maps through NU_ONB_TO_CANON instead of silently matching zero rows.
  const canon = kategori ? ((await resolveCanonCats([kategori]))[0] || kategori) : null;
  const d = await _aiPlaybookRpc('pola_toko_baru', { p_kategori: canon });
  if (d.error) return d;
  return { ...d, __view: { kind: 'pola_baru', data: d } };
}

async function _aiToolJudulMenang({ pasar, limit }) {
  if (!pasar) return { error: 'pasar wajib diisi' };
  const d = await _aiPlaybookRpc('judul_menang', {
    p_keyword: String(pasar), p_limit: Math.min(Math.max(limit || 15, 5), 30),
  });
  if (d.error) return d;
  return { ...d, __view: { kind: 'judul', data: d } };
}

const AI_TOOL_IMPL = {
  cari_pasar: _aiToolCariPasar,
  pasar_kota: _aiToolPasarKota,
  pasar_kategori: _aiToolPasarKategori,
  detail_pasar: _aiToolDetailPasar,
  cari_listing: _aiToolCariListing,
  filter_listing: _aiToolFilterListing,
  produk_dibuka: _aiToolProdukDibuka,
  pemain_baru: _aiToolPemainBaru,
  pola_toko_baru: _aiToolPolaTokoBaru,
  judul_menang: _aiToolJudulMenang,
};

/** Run one tool with a hard timeout. Never rejects — the loop must survive. */
async function _aiRunTool(name, input) {
  const impl = AI_TOOL_IMPL[name];
  if (!impl) return { error: `tool tidak dikenal: ${name}` };
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(impl(input || {})),
      new Promise((res) => { timer = setTimeout(() => res({ error: 'timeout' }), AI_TOOL_TIMEOUT_MS); }),
    ]);
  } catch (e) {
    return { error: 'tool gagal', detail: String(e?.message || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

/** Trailing window of the current thread, as Anthropic-style turns. */
function chatHistoryForAi(chat, latestText) {
  const mem = _gptMem();
  const msgs = (chat?.messages || [])
    .filter(m => (m.role === 'user' || m.role === 'assistant'))
    .slice(-12)
    .map(m => {
      const t = mem.serializeMessageForAi
        ? mem.serializeMessageForAi(m.content)
        : (typeof m.content === 'string' ? m.content : (m.content?.text || ''));
      return t ? { role: m.role, content: String(t).slice(0, 4000) } : null;
    })
    .filter(Boolean);
  // pushMessage already appended the current user turn; don't send it twice.
  if (msgs.length && msgs[msgs.length - 1].role === 'user' && msgs[msgs.length - 1].content === latestText) {
    return msgs;
  }
  return [...msgs, { role: 'user', content: latestText }];
}

// ── Agent run: plan, visible steps, rendered tool results ────────────────
// Short label for the pill on a tool row, and the wording of a synthesized
// plan step when the model skipped its own <rencana> block.
const AI_TOOL_LABEL = {
  cari_pasar: 'Cari pasar',
  pasar_kota: 'Baca pasar di kotamu',
  pasar_kategori: 'Buka kategori',
  detail_pasar: 'Baca detail pasar',
  cari_listing: 'Cari listing',
  filter_listing: 'Saring listing',
  produk_dibuka: 'Baca produk yang dibuka',
  pemain_baru: 'Cek pemain baru di pasar',
  pola_toko_baru: 'Pelajari pola toko baru',
  judul_menang: 'Bandingkan judul yang laku',
};

/**
 * DeepSeek sometimes dumps its DSML tool-call serialization into the text /
 * thinking stream even though the same calls already arrived as structured
 * tool_use blocks (which we execute). Those tags must never reach the bubble —
 * they are the raw `<|DSML|tool_calls>…` blob the user circled under the plan.
 */
function _aiStripToolMarkup(text) {
  let s = String(text || '');
  // Closed block(s). Allow optional spaces around the pipes — some traces
  // render `<|DSML|…>` with gaps that a strict match would miss.
  s = s.replace(/<\|\s*DSML\s*\|\s*tool_calls\s*>[\s\S]*?<\/\|\s*DSML\s*\|\s*tool_calls\s*>/gi, '');
  // Half-streamed opener with no closer yet: drop from here to the end so the
  // tags never paint mid-flight (same idea as an open <rencana>).
  s = s.replace(/<\|\s*DSML\s*\|\s*tool_calls\s*>[\s\S]*$/gi, '');
  // Stray invoke / parameter tags left after a partial scrub.
  s = s.replace(/<\/?\|\s*DSML\s*\|[^>]*>/gi, '');
  return s.trim();
}

/**
 * Lift the model's <rencana> block out of a possibly half-streamed reply.
 *
 * The plan is not styled prose — it becomes the step list, so it has to leave
 * the answer text entirely or the raw tags print. This runs on every delta,
 * which is why `open` exists: it means the opening tag has arrived but the
 * closing one has not, and the caller shows a placeholder for that beat rather
 * than streaming "<rencana>" into the bubble. A second block (the model
 * occasionally restates it) is dropped from the prose but never replaces the
 * first, so the rendered steps cannot renumber mid-answer.
 */
function _aiSplitPlan(text) {
  let s = String(text || '');
  let plan = [];
  let open = false;
  for (let guard = 0; guard < 4; guard++) {
    const o = s.indexOf('<rencana>');
    if (o < 0) break;
    const c = s.indexOf('</rencana>', o);
    if (c < 0) { s = s.slice(0, o); open = true; break; }
    const found = _aiPlanLines(s.slice(o + 9, c));
    s = s.slice(0, o) + s.slice(c + 10);
    if (!plan.length) plan = found;
  }
  return { plan, rest: _aiStripToolMarkup(s), open };
}

function _aiPlanLines(body) {
  return String(body || '').split('\n')
    .map(l => l.replace(/^\s*\d{1,2}\s*[.)\-]\s*/, '').replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * The visible agent run.
 *
 * streamAssistantReply used to own one slot: paint() overwrote the whole bubble
 * every animation frame, so a status line was the most progress UI that could
 * survive, and anything the user could open (a details, a collapsed step) was
 * rebuilt and re-collapsed 60 times a second. This owns the bubble instead and
 * mutates its own nodes, leaving exactly one region — .agent-answer — for the
 * repaint. Everything else persists across the whole run.
 */
function createAgentRun(bubble, opts = {}) {
  const scroll = typeof opts.scroll === 'function' ? opts.scroll : () => {};
  const run = document.createElement('div');
  run.className = 'agent-run' + (opts.compact ? ' agent-run--compact' : '');
  run.setAttribute('data-agent-run', '1');
  const answer = document.createElement('div');
  answer.className = 'agent-answer';
  if (bubble) {
    bubble.innerHTML = '';
    bubble.appendChild(run);
    bubble.appendChild(answer);
  }

  let thinkEl = null;
  let thinkBody = null;
  let planEl = null;
  let steps = [];
  let cur = -1;
  const toolOuts = new Map();

  /** Did this step actually show something — a tool table, a note? */
  function stepHasOutput(st) {
    return !!(st && st.body && st.body.querySelector('.agent-tool, .agent-note'));
  }

  /**
   * A finished step that fetched data STAYS OPEN. Collapsing it the moment the
   * next step starts hides the listing/pasar tables, which are the evidence the
   * answer rests on — the panel exists to show the work, not to file it away.
   * A step that rendered nothing (typically the closing "simpulkan" beat) still
   * collapses, so the run does not grow empty rows.
   */
  function setState(i, s) {
    const st = steps[i];
    if (!st || st.li.getAttribute('data-state') === 'done') return;
    st.li.setAttribute('data-state', s);
    if (s !== 'done' || stepHasOutput(st)) st.li.setAttribute('data-open', '1');
    else st.li.removeAttribute('data-open');
  }

  function thinking(text) {
    const t = _aiStripToolMarkup(text);
    if (!t) return;
    if (!thinkEl) {
      thinkEl = document.createElement('details');
      thinkEl.className = 'ai-think agent-think';
      thinkEl.open = true;
      thinkEl.innerHTML = '<summary>Proses berpikir</summary><div></div>';
      thinkBody = thinkEl.querySelector('div');
      run.insertBefore(thinkEl, run.firstChild);
    }
    // textContent, not mdToHtml: a raw trace is not markdown we authored, and
    // it is replaced on every delta.
    thinkBody.textContent = t;
    thinkBody.scrollTop = thinkBody.scrollHeight;
    scroll();
  }

  function plan(list) {
    const items = (list || []).filter(Boolean);
    if (!items.length) return;
    if (planEl && steps.length === items.length) {
      items.forEach((t, i) => { steps[i].label.textContent = t; });
      return;
    }
    if (planEl) planEl.remove();
    steps = [];
    planEl = document.createElement('ol');
    planEl.className = 'agent-plan';
    items.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'agent-step';
      li.setAttribute('data-state', 'pending');
      li.innerHTML = '<button type="button" class="agent-step-head">'
        + `<span class="agent-step-mark"><i class="agent-step-spin"></i>${ico('check', 13)}</span>`
        + '<span class="agent-step-label"></span>'
        + `<span class="agent-step-count">${i + 1}/${items.length}</span>`
        + `<span class="agent-step-chev">${ico('chevron', 14)}</span>`
        + '</button><div class="agent-step-body"></div>';
      const label = li.querySelector('.agent-step-label');
      label.textContent = t;
      planEl.appendChild(li);
      steps.push({ li, label, body: li.querySelector('.agent-step-body') });
    });
    run.appendChild(planEl);
    // A tool block can start streaming before the plan has rendered. Those rows
    // land at run level; move them into the first step now that it exists.
    const orphans = run.querySelectorAll(':scope > .agent-tool, :scope > .agent-note');
    orphans.forEach(el => steps[0].body.appendChild(el));
    if (thinkEl) thinkEl.open = false;
    scroll();
  }

  /** Tool round k drives step k; the forced-prose turn drives the last one. */
  function beginStep(i) {
    if (!steps.length) return;
    const idx = Math.min(Math.max(Number(i) || 0, 0), steps.length - 1);
    for (let k = 0; k <= idx; k++) if (k !== idx) setState(k, 'done');
    if (cur >= 0 && cur !== idx) setState(cur, 'done');
    cur = idx;
    setState(idx, 'running');
    scroll();
  }

  function note(md) {
    const text = String(md || '').trim();
    if (!text) return;
    const host = (steps[cur] && steps[cur].body) || run;
    let el = host.querySelector(':scope > .agent-note');
    if (!el) {
      el = document.createElement('div');
      el.className = 'agent-note';
      host.insertBefore(el, host.firstChild);
    }
    el.innerHTML = mdToHtml(text) || `<p>${esc(text)}</p>`;
    scroll();
  }

  function toolStart(id, name) {
    const host = (steps[cur] && steps[cur].body) || run;
    const wrap = document.createElement('div');
    wrap.className = 'agent-tool';
    wrap.setAttribute('data-tool', name);
    wrap.innerHTML = `<span class="agent-tool-pill">${ico('search', 12)}`
      + `<span>${esc(AI_TOOL_LABEL[name] || name)}</span></span>`
      + '<div class="agent-tool-out"><span class="agent-tool-wait">Mengambil data…</span></div>';
    host.appendChild(wrap);
    if (id) toolOuts.set(id, wrap.querySelector('.agent-tool-out'));
    scroll();
  }

  function toolDone(id, name, view) {
    const out = toolOuts.get(id);
    if (!out) return;
    out.innerHTML = agentToolViewHtml(name, view);
    // Rows carry the same data-ptype / data-prod hooks the card grids use, so
    // the existing binders make the shown work clickable for free.
    bindTypeCards(out);
    bindProductCards(out);
    bindListingRows(out);
    scroll();
  }

  function finish() {
    steps.forEach((_, i) => setState(i, 'done'));
    run.setAttribute('data-done', '1');
  }

  /**
   * What gets persisted: the same run with every step settled, minus the
   * reasoning trace — thinking is never stored (chatHistoryForAi would replay
   * it as a visible assistant turn).
   */
  function staticHtml() {
    if (!steps.length && !run.querySelector('.agent-tool')) return '';
    const clone = run.cloneNode(true);
    clone.querySelectorAll('.agent-think').forEach(el => el.remove());
    clone.querySelectorAll('[data-open]').forEach(el => el.removeAttribute('data-open'));
    // Same rule as the live run: a replayed chat must show the same open tables
    // the user saw, not a stack of collapsed rows.
    clone.querySelectorAll('.agent-step').forEach((el) => {
      el.setAttribute('data-state', 'done');
      if (el.querySelector('.agent-step-body .agent-tool, .agent-step-body .agent-note')) {
        el.setAttribute('data-open', '1');
      }
    });
    clone.setAttribute('data-done', '1');
    return clone.outerHTML;
  }

  return {
    el: run, answerEl: answer, hasPlan: () => steps.length > 0,
    thinking, plan, beginStep, note, toolStart, toolDone, finish, staticHtml,
  };
}

// Delegated so a run restored from gpt_messages toggles too — persisted HTML
// carries no listeners.
document.addEventListener('click', (e) => {
  const head = e.target?.closest?.('.agent-step-head');
  if (!head) return;
  const li = head.closest('.agent-step');
  if (!li) return;
  if (li.hasAttribute('data-open')) li.removeAttribute('data-open');
  else li.setAttribute('data-open', '1');
});

/** Render one tool's result. Never throws — a bad shape degrades to a line. */
function agentToolViewHtml(name, view) {
  try {
    if (view && view.kind === 'pasar') return _agentPasarViewHtml(view);
    if (view && view.kind === 'kota') return _agentKotaViewHtml(view);
    if (view && view.kind === 'detail') return _agentDetailViewHtml(view);
    if (view && view.kind === 'listing') return _agentListingViewHtml(view);
    if (view && view.kind === 'produk') return _agentProdukViewHtml(view);
  } catch (_) { /* fall through to the empty line */ }
  const hint = (view && view.hint) || 'Tidak ada baris yang cocok.';
  return `<span class="agent-tool-empty">${esc(hint)}</span>`;
}

/** trend_delta_30d as a signed percentage with a direction class. */
function _agentTrendHtml(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '<span class="agent-flat">—</span>';
  const cls = n > 0 ? 'agent-up' : 'agent-down';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${Math.round(n)}%</span>`;
}

/** Rp value, or an em dash — a missing column must not read as "Rp 0". */
function _agentRp(v) {
  const n = Number(v);
  return n > 0 ? esc(fmtRpShort(n)) : '—';
}

function _agentNum(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? esc(fmtIdCompact(n)) : '—';
}

function _agentPasarViewHtml(view) {
  const rows = markTerlarisMinggu((view.rows || []).slice(0, 8));
  if (!rows.length) return `<span class="agent-tool-empty">${esc(view.hint || 'Tidak ada pasar yang cocok.')}</span>`;
  registerTypes(rows);
  const body = rows.map((t) => {
    const skor = _skorOf(t);
    // Not terlarisBadgeHtml(): that one is position:absolute and built to hang
    // off a card with position:relative, so in a table cell it escapes to the
    // top of the page. Same meaning, inline.
    const badge = t._terlaris
      ? `<span class="agent-tlr">${ico('rocket', 11)}<span>Terlaris minggu ini</span></span>`
      : '';
    return '<tr>'
      + `<td class="agent-c-name"><button type="button" class="agent-rowbtn" data-ptype="-1" data-ptype-kw="${esc(t.keyword)}">${esc(t.keyword)}</button>${badge}</td>`
      + `<td>${_agentRp(t.omset_top15)}${omsetChipHtml(t, { aggregate: true })}</td>`
      + `<td>${_agentTrendHtml(t.trend_delta_30d)}</td>`
      + `<td>${skor == null ? '—' : Math.round(skor)}</td>`
      + `<td>${_agentNum(t.n_sellers)}</td>`
      + '</tr>';
  }).join('');
  const cap = view.n && view.n > rows.length ? `<div class="agent-tool-more">${esc(fmtIdCompact(view.n))} pasar ditemukan, ${rows.length} teratas ditampilkan.</div>` : '';
  return '<div class="agent-tbl-wrap"><table class="agent-tbl">'
    + '<thead><tr><th>Pasar</th><th>Omset/bln</th><th>Tren 30h</th><th>Skor</th><th>Seller</th></tr></thead>'
    + `<tbody>${body}</tbody></table></div>${cap}`;
}

/**
 * pasar_kota's step: the CITY's own numbers, not the national ones.
 *
 * Deliberately not _agentPasarViewHtml with the national rows swapped in —
 * showing national omset under a "di kotamu" heading is exactly the confusion
 * the tool exists to end. Rows still carry data-ptype-kw, so the market opens
 * on click like any other.
 */
function _agentKotaViewHtml(view) {
  const rows = (view.rows || []).slice(0, 8);
  const where = (view.kota_cocok || []).filter(Boolean).join(', ') || view.kota || 'kota itu';
  if (!rows.length) {
    return `<span class="agent-tool-empty">Belum ada seller dari ${esc(where)} di data kami — sapuan kami nasional per kata kunci, jadi ini soal cakupan, bukan bukti pasarnya kosong.</span>`;
  }
  const body = rows.map((p) => '<tr>'
    + `<td class="agent-c-name"><button type="button" class="agent-rowbtn" data-ptype="-1" data-ptype-kw="${esc(p.pasar || '')}">${esc(p.pasar || '')}</button></td>`
    + `<td>${_agentNum(p.n_toko)}</td>`
    + `<td>${_agentNum(p.n_item)}</td>`
    + `<td>${_agentNum(p.terjual_total)}</td>`
    + `<td>${_agentRp(p.harga_median)}</td>`
    + '</tr>').join('');
  const shops = (view.toko || []).map(t => t && t.toko).filter(Boolean).slice(0, 5);
  const cap = `<div class="agent-tool-more">${esc(where)}: ${_agentNum(view.n_toko)} toko, ${_agentNum(view.n_item)} item, ${_agentNum(view.n_pasar)} pasar terekam.`
    + (shops.length ? ` Toko: ${esc(shops.join(', '))}.` : '')
    + '</div>';
  return '<div class="agent-tbl-wrap"><table class="agent-tbl">'
    + '<thead><tr><th>Pasar</th><th>Toko di sini</th><th>Item</th><th>Terjual</th><th>Harga med.</th></tr></thead>'
    + `<tbody>${body}</tbody></table></div>${cap}`;
}

function _agentListingRowHtml(r) {
  // Same data-prod / data-product contract as productCardHtml, so bindProductCards
  // and resolveProduct work on these rows without a second code path.
  const p = asListingProduct(r);
  rememberProducts([p]);
  const snap = productSnapshot(p);
  const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
  const img = imgThumb(p.image_url || '');
  const thumb = img
    ? `<img class="agent-thumb" src="${esc(img)}" alt="" loading="lazy" decoding="async" width="40" height="40">`
    : '<span class="agent-thumb agent-thumb--blank"></span>';
  const meta = [p.store_name, p.location].filter(Boolean).map(esc).join(' · ');
  return `<button type="button" class="agent-listing" data-prod="${esc(prodKey(p))}"`
    + `${encoded ? ` data-product="${encoded}"` : ''}>`
    + thumb
    + `<span class="agent-listing-main"><span class="agent-listing-name">${esc((p.product_name || '').slice(0, 80))}</span>`
    + `<span class="agent-listing-meta">${meta}</span></span>`
    + `<span class="agent-listing-num"><b>${esc(fmtRpShort(Number(p.price) || 0))}</b>`
    + `<span>${esc(fmtSold(Number(p.total_sold) || 0))} terjual</span></span></button>`;
}

function _agentListingViewHtml(view) {
  const rows = (view.rows || []).slice(0, 8).map(asListingProduct);
  if (!rows.length) return `<span class="agent-tool-empty">${esc(view.hint || 'Tidak ada listing yang cocok.')}</span>`;
  rememberProducts(rows);
  const r = view.ringkasan || null;
  const sum = r
    ? `<div class="agent-tool-sum">Median ${esc(fmtRpShort(r.harga_median))} · ${esc(fmtSold(r.terjual_total))} terjual total`
      + `${r.lokasi_teratas && r.lokasi_teratas[0] ? ` · terbanyak dari ${esc(r.lokasi_teratas[0].lokasi)}` : ''}</div>`
    : '';
  const cap = view.n && view.n > rows.length ? `<div class="agent-tool-more">${esc(fmtIdCompact(view.n))} listing cocok, ${rows.length} teratas ditampilkan.</div>` : '';
  return `${sum}${listingRowsHtml(rows, { compact: true })}${cap}`;
}

function _agentStatHtml(label, value) {
  return `<span class="agent-stat"><b>${value}</b><span>${esc(label)}</span></span>`;
}

function _agentDetailViewHtml(view) {
  const t = view.type || {};
  registerTypes([t]);
  const w = weeklyStats(t);
  const stats = [
    _agentStatHtml('Omset/bln', _agentRp(t.omset_top15) + omsetChipHtml(t, { aggregate: true })),
    _agentStatHtml('Harga median', _agentRp(t.price_median)),
    _agentStatHtml('Seller', _agentNum(t.n_sellers)),
    _agentStatHtml('Tren 30h', _agentTrendHtml(t.trend_delta_30d)),
    // weeklyStats returns null when there is no usable snapshot pair — that must
    // never render as "0 terjual minggu ini".
    ...(w ? [_agentStatHtml('Terjual/minggu', esc(fmtSold(w.units)))] : []),
  ].join('');
  const chips = (view.lokasi || []).slice(0, 6)
    .map(h => `<span class="agent-chip">${esc(h.lokasi)} <b>${esc(String(h.n))}</b></span>`).join('');
  const sellers = (view.sellers || []).slice(0, 5).map(_agentListingRowHtml).join('');
  return `<div class="agent-stats">${stats}</div>`
    + (chips ? `<div class="agent-chips-lbl">Lokasi seller</div><div class="agent-chips">${chips}</div>` : '')
    + (sellers ? `<div class="agent-chips-lbl">Top seller</div><div class="agent-listings">${sellers}</div>` : '');
}

function _agentProdukViewHtml(view) {
  const d = view.data || {};
  const stats = [
    _agentStatHtml('Skor Produk', esc(String(d.skor ?? '—'))),
    _agentStatHtml('Peluang breakout', d.breakout_pct == null ? '—' : `${Math.round(d.breakout_pct)}%`),
    _agentStatHtml('Kompetisi', esc(String(d.kompetisi ?? '—'))),
    _agentStatHtml('Harga median pasar', _agentRp(d.harga_median_pasar)),
    _agentStatHtml('Pembanding', _agentNum(d.n_pembanding)),
  ].join('');
  return `<div class="agent-stats">${stats}</div>`;
}

/**
 * Stream a reply into an existing bubble, with a working Stop button.
 *
 * When opts.tools is set this runs the agent loop: the model may ask for data,
 * we execute the tool in the browser (as the logged-in user, under RLS), hand
 * the result back, and let it continue. Capped at AI_TOOL_MAX_TURNS model turns
 * and AI_TOOL_MAX_CALLS executions; the last turn is forced to prose with
 * tool_choice none so the loop can never end without an answer.
 */
async function streamAssistantReply(loading, system, messages, opts = {}) {
  const bubble = loading?.querySelector?.('.msg-bubble') || loading;
  const root = opts.root || null;
  let acc = '';
  let thinkAcc = '';
  let painting = false;
  const scroll = () => { if (root) root.scrollTop = root.scrollHeight; else scrollChatToBottom(); };
  const run = createAgentRun(bubble, { scroll, compact: !!root });
  let planShown = false;
  let curTurn = 0;

  /**
   * One repaint, one target. The run view owns everything above .agent-answer
   * and mutates it by node, so a step the user opened stays open and a rendered
   * tool table is not rebuilt 60 times a second.
   */
  // Synchronous, because a tool_use block can start in the same tick as the
  // delta that closed the plan — waiting for the repaint's rAF would put the
  // first tool row outside the step list.
  const flushPlan = () => {
    if (planShown) return;
    const split = _aiSplitPlan(acc);
    if (!split.plan.length) return;
    planShown = true;
    run.plan(split.plan);
    run.beginStep(curTurn);
  };

  const paint = () => {
    if (painting || !run.answerEl) return;
    painting = true;
    requestAnimationFrame(() => {
      painting = false;
      flushPlan();
      const split = _aiSplitPlan(acc);
      // While the block is still streaming, show the beat rather than raw tags.
      run.answerEl.innerHTML = split.rest
        ? (mdToHtml(split.rest) || `<p>${esc(split.rest)}</p>`)
        : (split.open ? '<p class="agent-wait">Menyusun rencana…</p>' : '');
      scroll();
    });
  };

  _streamAbort = new AbortController();
  const signal = _streamAbort.signal;
  setComposerStopping(true);
  const pasarKeys = [];
  try {
    const useTools = Array.isArray(opts.tools) && opts.tools.length > 0;
    const turns = messages.slice();
    let calls = 0;

    for (let turn = 0; turn < (useTools ? AI_TOOL_MAX_TURNS : 1); turn++) {
      const lastTurn = turn === AI_TOOL_MAX_TURNS - 1 || calls >= AI_TOOL_MAX_CALLS;
      curTurn = turn;
      if (useTools) run.beginStep(turn);
      const stepOpts = {
        ...opts,
        thinking: !!(opts.thinking && turn === 0),
        onThinking: (_p, full) => { thinkAcc = full; run.thinking(full); },
        onToolStart: (name, id) => { flushPlan(); run.toolStart(id, name); },
        ...(useTools && lastTurn ? { toolChoice: { type: 'none' } } : {}),
      };

      const reply = await _mlsAIStream(system, turns, (_piece, full) => {
        acc = full;
        paint();
      }, signal, stepOpts);

      if (reply.text) acc = reply.text;
      if (reply.thinking) thinkAcc = reply.thinking;
      if (signal.aborted) break;

      const split = _aiSplitPlan(acc);
      const wants = useTools && !lastTurn ? (reply.toolUses || []) : [];

      // The model skipped its own <rencana>. Synthesize one from the calls it
      // actually made, so the run is never a blank panel.
      if (useTools && !planShown) {
        const steps = split.plan.length
          ? split.plan
          : (wants.length
            ? [...wants.map(t => AI_TOOL_LABEL[t.name] || t.name), 'Simpulkan jawaban']
            : []);
        if (steps.length) {
          planShown = true;
          run.plan(steps);
          run.beginStep(turn);
        }
      }
      if (!wants.length) break;

      // Prose that came alongside the tool calls is this round's narration.
      // acc clears here, not after the tools: a rAF still queued from the last
      // delta would otherwise repaint the answer with text we just moved.
      if (split.rest) run.note(split.rest);
      acc = '';
      if (run.answerEl) run.answerEl.innerHTML = '';

      // Replay the assistant turn, minus thinking: DeepSeek accepts the tool
      // round trip without it, so we never have to carry a block signature.
      const assistantBlocks = [];
      if (reply.text) assistantBlocks.push({ type: 'text', text: reply.text });
      for (const t of wants) assistantBlocks.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input });
      turns.push({ role: 'assistant', content: assistantBlocks });

      // Identical calls inside one turn are answered once.
      const seen = new Map();
      const results = await Promise.all(wants.map(async (t) => {
        if (calls >= AI_TOOL_MAX_CALLS) {
          const out = { error: 'tool_budget_exhausted', hint: 'Jawab dengan data yang sudah ada.' };
          run.toolDone(t.id, t.name, null);
          return { id: t.id, out };
        }
        calls++;
        const key = `${t.name}:${JSON.stringify(t.input || {})}`;
        if (!seen.has(key)) seen.set(key, _aiRunTool(t.name, t.input));
        const raw = await seen.get(key);
        // __view carries un-packed rows (images, item ids) for the rendered step
        // and must never reach the model — strip it before the tool_result.
        const { __view: view, ...out } = (raw && typeof raw === 'object') ? raw : {};
        run.toolDone(t.id, t.name, view || null);
        const mem = _gptMem();
        (mem.extractPasarKeysFromToolOut?.(out) || []).forEach((k) => {
          if (k && !pasarKeys.includes(k)) pasarKeys.push(k);
        });
        return { id: t.id, out };
      }));

      // An abort during a slow query must not fire another model call.
      if (signal.aborted) break;

      turns.push({
        role: 'user',
        content: results.map(r => ({
          type: 'tool_result',
          tool_use_id: r.id,
          content: JSON.stringify(r.out ?? {}),
        })),
      });
    }

    const final = _aiSplitPlan(acc);
    run.finish();
    if (run.answerEl) {
      run.answerEl.innerHTML = final.rest
        ? (mdToHtml(final.rest) || `<p>${esc(final.rest)}</p>`)
        : '';
    }
    scroll();
    // Callers persist and replay `text`, so the plan block must be gone from it.
    return { text: final.rest, thinking: thinkAcc, pasarKeys, run };
  } finally {
    setComposerStopping(false);
    _streamAbort = null;
  }
}

/**
 * Answer plus a collapsed reasoning disclosure. Raw thinking is never streamed
 * into the bubble — DeepSeek traces are long and often English, which an
 * Indonesian user reads as a bug — and it is never persisted (see the callers,
 * which push reply text only).
 */
function _aiBubbleHtml(text, thinking) {
  const cleanThink = _aiStripToolMarkup(thinking);
  const body = mdToHtml(text) || (text ? `<p>${esc(text)}</p>` : '');
  if (!cleanThink || !text) return body || `<p>${esc(text || '')}</p>`;
  return `<details class="ai-think"><summary>Proses berpikir</summary>`
    + `<div>${mdToHtml(cleanThink) || `<p>${esc(cleanThink)}</p>`}</div></details>${body}`;
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
  if (CANON_CATS.includes(c) || DIR_CANON_CATS.includes(c)) return c;
  return CAT_CANON_MAP[c] || NU_ONB_TO_CANON[c] || null;
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

// product_types_v only gained the wk_* columns in migration 20260813120000.
// PostgREST rejects the WHOLE query for one unknown column, so asking for them
// against a database that has not been migrated yet would blank the directory
// rather than just drop the badge. Stay optimistic, and if the first real query
// comes back with "column does not exist", fall back for the rest of the
// session. Static deploys and DB migrations do not land atomically here.
const PTYPE_WEEKLY_COLS = 'wk_units,wk_base,wk_items,wk_span_days,wk_anchor_at';
let _ptypeHasWeekly = true;

function ptypeCols() {
  return _ptypeHasWeekly ? `${PTYPE_COLS},${PTYPE_WEEKLY_COLS}` : PTYPE_COLS;
}

/** True once, for the error that means "this DB predates the weekly matview". */
function ptypeWeeklyMissing(error) {
  if (!_ptypeHasWeekly || !error) return false;
  const s = `${error.code || ''} ${error.message || ''}`;
  if (!/42703/.test(s) && !/wk_units|wk_base|wk_items|wk_span_days|wk_anchor_at/.test(s)) return false;
  console.warn('[ptype] weekly columns missing — Terlaris Minggu Ini disabled until the DB is migrated');
  _ptypeHasWeekly = false;
  return true;
}

async function fetchProductTypes(cities, cats, limit = 1000, sub = null) {
  if (!_supabase) return [];
  const cityList = Array.isArray(cities) ? cities.filter(Boolean) : (cities ? [cities] : []);
  const buckets = cityList.length ? cityList : ['ALL'];
  const catList = Array.isArray(cats) ? cats.filter(Boolean) : (cats ? [cats] : []);
  const catKey = catList.slice().sort().join(',');
  const cityKey = buckets.slice().sort().join(',');
  const key = `${cityKey}|${catKey}|${sub || ''}`;
  if (_ptypeCache[key]) return _ptypeCache[key];
  try {
    const build = () => {
      let q = _supabase.from('product_types_v')
        .select(ptypeCols())
        .gte('n_listings', 3)
        .order('omset_top15', { ascending: false, nullsFirst: false })
        .limit(buckets.length > 1 ? Math.min(limit * buckets.length, 3000) : limit);
      if (buckets.length === 1) q = q.eq('city', buckets[0]);
      else q = q.in('city', buckets);
      if (catList.length === 1) q = q.eq('category_canonical', catList[0]);
      else if (catList.length > 1) q = q.in('category_canonical', catList);
      if (sub && catList.length === 1) q = q.eq('subgroup', sub);
      return q;
    };
    let { data, error } = await build();
    // This is the query that settles _ptypeHasWeekly for every other caller.
    if (ptypeWeeklyMissing(error)) ({ data, error } = await build());
    if (error) throw error;
    let rows = data || [];
    // Multi-city OR: collapse to one card per keyword (keep largest market).
    if (buckets.length > 1) {
      const best = new Map();
      rows.forEach(r => {
        const k = r.keyword;
        if (!k) return;
        const prev = best.get(k);
        if (!prev || (Number(r.omset_top15) || 0) > (Number(prev.omset_top15) || 0)) best.set(k, r);
      });
      rows = Array.from(best.values())
        .sort((a, b) => (Number(b.omset_top15) || 0) - (Number(a.omset_top15) || 0))
        .slice(0, limit);
    }
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
async function searchProductTypes(text, cities, limit = 12, opts) {
  if (!_supabase) return [];
  const raw = String(text || '').trim();
  if (raw.length < 2) return [];
  if (!(opts && opts.skipLog)) gptLogSearchHistory(raw, 'ask_laris');
  const clauses = _splitSearchIntents(raw);
  if (clauses.length >= 2) {
    const per = Math.max(4, Math.ceil(limit / clauses.length) + 2);
    const groups = await Promise.all(clauses.map(c => searchProductTypes(c, cities, per, { skipLog: true })));
    const seen = new Set();
    const out = [];
    for (const rows of groups) {
      for (const r of rows || []) {
        if (!r?.keyword || seen.has(r.keyword)) continue;
        seen.add(r.keyword);
        out.push(r);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
  let terms = [raw];
  try {
    const plan = await planSearch(raw);
    const extra = (plan?.queries || []).filter(Boolean);
    const tokens = _searchTerms(raw);
    // Phrase + original tokens first so a long AI plan cannot drop
    // "penghitam" / "kasar". Extras fill the remaining slots. Tokens still
    // ILIKE on their own so "gelang manik" reaches `kalung manik`.
    terms = [...new Set([raw, ...tokens, ...extra])].slice(0, 8);
  } catch (_) {
    terms = [...new Set([raw, ..._searchTerms(raw)])].slice(0, 8);
  }

  const cityList = Array.isArray(cities) ? cities.filter(Boolean) : (cities ? [cities] : []);
  const buckets = cityList.length ? cityList : ['ALL'];
  const seen = new Set();
  const hits = [];
  const runs = await Promise.all(terms.map(async t => {
    try {
      const needle = _sanitizeSearchToken(t).slice(0, 40);
      if (!needle) return [];
      const build = () => {
        let q = _supabase.from('product_types_v')
          .select(ptypeCols())
          .gte('n_listings', 3);
        // Single tokens: word-prefix / space-prefix (same as autosuggest),
        // so "gelang" does not pull "pergelangan". Phrases stay substring.
        if (!needle.includes(' ')) {
          q = q.or(`keyword.ilike.${needle}%,keyword.ilike.% ${needle}%`);
        } else {
          q = q.ilike('keyword', `%${needle}%`);
        }
        q = q.order('omset_top15', { ascending: false, nullsFirst: false })
          .limit(limit * 2);
        if (buckets.length === 1) q = q.eq('city', buckets[0]);
        else q = q.in('city', buckets);
        return q;
      };
      let { data, error } = await build();
      if (ptypeWeeklyMissing(error)) ({ data } = await build());
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
  const kwHasTerm = (kw, term) => {
    const t = String(term || '').toLowerCase().trim();
    if (!t || t.length < 3) return false;
    if (t.includes(' ')) return kw === t || kw.includes(t);
    if (kw === t) return true;
    return kw.split(/[\s/-]+/).some(w => w === t);
  };
  const tokenOverlap = (kw, toks) => toks.filter(t => {
    if (kwHasTerm(kw, t)) return true;
    return (SEARCH_SYNONYMS[t] || []).some(s => kwHasTerm(kw, s));
  }).length;
  hits.forEach(h => {
    const kw = String(h.keyword || '').toLowerCase();
    let score = 0;
    if (kw === q) score += 100;
    terms.forEach(t => {
      const tl = String(t).toLowerCase();
      if (kw === tl) score += 90;
      else if (kwHasTerm(kw, tl) || (tl.includes(' ') && (kw.includes(tl) || tl.includes(kw)))) score += 45;
    });
    if (kw.includes(q)) score += 40;
    planTokens.forEach(t => { if (kwHasTerm(kw, t)) score += 12; });
    qTokens.forEach(t => { if (kwHasTerm(kw, t)) score += 10; });
    // Multi-token overlap so "gelang manik" / "kalung manik" beat generic "gelang".
    const overlap = tokenOverlap(kw, qTokens);
    score += overlap * 28;
    if (qTokens.length >= 2 && overlap >= 2) score += 50;
    score += Math.min(10, Math.log10(Number(h.omset_top15) || 1));
    h._score = score;
  });
  hits.sort((a, b) => b._score - a._score);
  let ranked = hits.filter(h => h._score >= 10).slice(0, limit);
  if (!ranked.length) {
    // Nothing matched even with synonym expansion — try the typo-tolerant
    // fuzzy fallback, then re-fetch full columns for whatever it found (the
    // fuzzy pool only carries a lean column subset).
    const fuzzy = await _rbFuzzyMatch(raw, limit);
    const fuzzyKws = fuzzy.map(r => r.keyword).filter(Boolean);
    if (fuzzyKws.length) {
      try {
        let fq = _supabase.from('product_types_v')
          .select(ptypeCols())
          .gte('n_listings', 3)
          .in('keyword', fuzzyKws);
        if (buckets.length === 1) fq = fq.eq('city', buckets[0]);
        else fq = fq.in('city', buckets);
        const { data: fullRows } = await fq;
        ranked = (fullRows || []).map(r => ({ ...r, _score: 50 }));
      } catch (_) {}
    }
  }
  if (ranked.length) await attachTypeQuartiles(ranked);
  return ranked;
}

/**
 * Nearby markets for a query that missed every scrape keyword.
 *
 * Search listing titles (not keywords), keep rows whose title overlaps the
 * original tokens, then lift host keywords that at least two such listings
 * share. Callers must label the result as nearby — these are not exact matches.
 * Does not run DeepSeek extras as standalone searches (that dumps adjacent
 * markets like "semir ban" as if they were the query).
 */
async function searchNearbyProductTypes(text, cities, limit = 12) {
  if (!_supabase) return [];
  const raw = String(text || '').trim();
  if (raw.length < 2) return [];
  const terms = _searchTerms(raw);
  if (!terms.length) return [];
  const bigrams = [];
  for (let i = 0; i < terms.length - 1; i++) bigrams.push(`${terms[i]} ${terms[i + 1]}`);
  const queries = [...new Set([raw, ...bigrams])].slice(0, 4);
  const pool = [];
  const groups = await Promise.all(queries.map(q => searchListings(q, [], 40)));
  groups.forEach(rows => mergePool(pool, rows));
  const need = Math.min(2, terms.length);
  const titleHits = pool.filter(p => {
    const hay = String(p.product_name || '').toLowerCase();
    if (!hay) return false;
    return terms.filter(t => hay.includes(t)).length >= need;
  });
  const byKw = new Map();
  titleHits.forEach(p => {
    const k = String(p.keyword || '').trim();
    if (!k) return;
    let g = byKw.get(k);
    if (!g) { g = { listings: [], sold: 0 }; byKw.set(k, g); }
    g.listings.push(p);
    g.sold += Number(p.total_sold) || 0;
  });
  const ranked = [...byKw.entries()]
    .filter(([, g]) => g.listings.length >= 2)
    .sort((a, b) => (b[1].listings.length - a[1].listings.length)
      || (b[1].sold - a[1].sold));
  if (!ranked.length) return [];
  const cityList = Array.isArray(cities) ? cities.filter(Boolean) : (cities ? [cities] : []);
  const cityKey = cityList.length === 1 ? cityList[0] : '';
  const types = await typesForListings(ranked.map(([, g]) => g.listings[0]), cityKey, limit);
  return (types || []).map(t => ({ ...t, _nearby: true }));
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

function typeKwTokens(kw) {
  return String(kw || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Split a market keyword so nearby cards stay distinguishable on a 3-col
 * phone grid. Titles are clamp-2 at ~11px, so "sepatu sneakers wanita
 * premium" and "...kekinian" both collapse to "Sepatu Sneakers…".
 *
 * Sibling-aware first: shared prefix of ≥2 tokens becomes the muted stem,
 * remainder is the bold line (Premium / Kekinian). Else 4+ token keywords
 * keep the last two words as the distinct line so a singleton still shows
 * the adjectives. Never invents labels — only words already in the keyword.
 */
function splitTypeTitle(keyword, siblingKeywords) {
  const tokens = typeKwTokens(keyword);
  if (!tokens.length) return { stem: null, distinct: null, title: typeTitle(keyword) };
  const family = (siblingKeywords || [])
    .map(typeKwTokens)
    .filter(t => t.length >= 2 && t[0] === tokens[0] && tokens[1] && t[1] === tokens[1]);
  if (family.length >= 2) {
    let i = 0;
    while (i < tokens.length && family.every(t => t[i] && t[i] === tokens[i])) i++;
    if (i >= 2 && i < tokens.length) {
      return {
        stem: typeTitle(tokens.slice(0, i).join(' ')),
        distinct: typeTitle(tokens.slice(i).join(' ')),
        title: typeTitle(keyword),
      };
    }
  }
  if (tokens.length >= 4) {
    return {
      stem: typeTitle(tokens.slice(0, -2).join(' ')),
      distinct: typeTitle(tokens.slice(-2).join(' ')),
      title: typeTitle(keyword),
    };
  }
  return { stem: null, distinct: null, title: typeTitle(keyword) };
}

function typeNameHtml(parts) {
  if (parts.stem && parts.distinct) {
    return `<div class="prod-card-name prod-card-name--split">`
      + `<span class="prod-card-stem">${esc(parts.stem)}</span>`
      + `<span class="prod-card-distinct">${esc(parts.distinct)}</span>`
      + `</div>`;
  }
  return `<div class="prod-card-name">${esc(parts.title)}</div>`;
}

/** Thumb vs full Shopee URLs are the same photo. */
function typeCoverKey(url) {
  return String(url || '').replace(/_tn\.webp$/i, '').split('?')[0];
}

function typeCoverCandidates(t) {
  const out = [];
  const push = u => { if (u && !out.includes(u)) out.push(u); };
  // Prefer the representative listing — images[] can include off-keyword scrapes.
  push(t && t.rep_image_url);
  ((t && t.images) || []).forEach(push);
  return out;
}

/**
 * First unused photo from this keyword's own covers. Mutates `usedImgs`.
 * collided=true means every candidate was already on this grid — keep the
 * honest top listing and let the caller overlay the distinct word.
 */
function pickTypeCover(t, usedImgs) {
  const candidates = typeCoverCandidates(t);
  const used = usedImgs || new Set();
  const unused = candidates.find(u => !used.has(typeCoverKey(u)));
  if (unused) {
    used.add(typeCoverKey(unused));
    return { url: unused, collided: false };
  }
  const chosen = candidates[0] || '';
  if (chosen) used.add(typeCoverKey(chosen));
  return { url: chosen, collided: !!chosen };
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
/**
 * The market a listing belongs to.
 *
 * Every dive is a pasar dive now (see openDeepDive), so this is what turns a
 * clicked listing into the market it sells in: the product_types_v row for its
 * keyword, city row first and the national row as fallback — typesForListings
 * already does both, plus the quartile attach and the session cache.
 *
 * Returns null when the keyword has no market row at all (fewer than 3
 * listings). That is the one case that still shows a listing-level report:
 * inventing a market out of a keyword we have not measured would be worse than
 * showing the little we do have.
 */
async function pasarTypeForProduct(product) {
  const kw = String(product?.keyword || '').trim();
  if (!kw) return null;
  const known = _ptypeByKeyword.get(kw);
  if (known) return known;
  try {
    const city = (state.dirCities && state.dirCities[0]) || 'ALL';
    const types = await typesForListings([{ keyword: kw }], city, 1);
    return types[0] || null;
  } catch (e) {
    console.warn('[pasarTypeForProduct]', e?.message || e);
    return null;
  }
}

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

// ── "Terlaris Minggu Ini" badge ────────────────────────────────────────────
// Floor a card must clear before it can ever be badged. Ranking is relative to
// whatever is on screen, so this only exists to stop a market with no weekly
// movement from being crowned. Re-tune with scripts/weekly-badge-calibrate.mjs
// and record the change in docs/terlaris-minggu.md.
const TERLARIS_MIN_UNITS = 25;   // 7-day-equivalent units for the whole market
const TERLARIS_MIN_ITEMS = 2;    // listings that actually moved, so one Shopee
                                 // display-bucket glitch cannot mint a badge

/**
 * Weekly reading for a market card, from mv_keyword_weekly via product_types_v.
 *
 * Returns null when there is no row for the keyword. That means "we never got a
 * usable snapshot pair", which must never render as "0 terjual minggu ini".
 */
function weeklyStats(t) {
  if (!t || t.wk_units == null) return null;
  const units = Number(t.wk_units) || 0;
  const base = Number(t.wk_base) || 0;
  return {
    units,
    base,
    // Same definition as trendGrowthPct(): growth against the cumulative
    // baseline, NOT against last week. The tooltip has to say so.
    pct: base >= 50 ? Math.round(units / base * 100) : (units > 0 ? Infinity : null),
    items: Number(t.wk_items) || 0,
    spanDays: Number(t.wk_span_days) || 0,
    anchor: t.wk_anchor_at || null,
  };
}

/**
 * Pick which of these cards get the badge, then pin the winner to the front.
 *
 * Relative to the set passed in (category, search, or composer answer), so
 * "terlaris minggu ini" always means "of what you are looking at". One winner
 * only — the mockup is a single hero, and a 60-card directory page would
 * otherwise leave the real #1 sitting in slot 2 behind a runner-up.
 *
 * Returns a new array: winner first, everyone else in their incoming order.
 * Call it on the full filtered list BEFORE pagination so page 1 leads with
 * the category winner rather than the weekly best of that omset slice.
 */
function markTerlarisMinggu(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  list.forEach(t => { t._terlaris = null; });
  const eligible = [];
  list.forEach(t => {
    const w = weeklyStats(t);
    if (!w) return;
    if (w.units < TERLARIS_MIN_UNITS || w.items < TERLARIS_MIN_ITEMS) return;
    if (!(w.pct > 0)) return; // null (no baseline) and 0 are both out
    eligible.push([t, w]);
  });
  if (!eligible.length) return list;
  const rank = w => (w.pct === Infinity ? Number.MAX_SAFE_INTEGER : w.pct);
  eligible.sort((a, b) => (b[1].units - a[1].units) || (rank(b[1]) - rank(a[1])));
  const [winner, stats] = eligible[0];
  winner._terlaris = stats;
  return [winner, ...list.filter(t => t !== winner)];
}

/**
 * Spell out exactly what the green percentage measured.
 *
 * Two things are easy to misread and both are stated: the window is not a
 * calendar week (our scrapes land ~12-17 days apart, so units are normalised to
 * a 7-day rate), and the percentage is growth over lifetime sales rather than
 * versus last week. MISSION.md forbids dressing either of those up.
 */
function terlarisTooltip(w) {
  const units = Math.round(w.units).toLocaleString('id-ID');
  const span = w.spanDays > 0 ? `${w.spanDays} hari terakhir` : 'rentang scrape terakhir';
  const base = w.base.toLocaleString('id-ID');
  return `Sekitar ${units} unit terjual per minggu — dihitung dari ${span} `
    + `(sampai ${fmtAnchorDate(w.anchor)}) lalu disetarakan ke 7 hari. `
    + `Persentase = kenaikan terhadap ${base} unit yang sudah terjual sebelumnya, `
    + 'bukan perbandingan dengan minggu lalu: jadwal scrape kami belum harian.';
}

function terlarisBadgeHtml() {
  return `<span class="tlr-badge">${ico('rocket', 12)}`
    + '<span class="tlr-badge-txt"><span>Terlaris</span><span>Minggu Ini</span></span></span>';
}

function homeMeledakBadgeHtml() {
  return `<span class="dir-home-badge dir-home-badge--meledak">${ico('flame', 11)} Meledak</span>`;
}

function homeWowHtml(w) {
  if (!w || w.pct == null) return '';
  const tip = ` title="${esc(terlarisTooltip(w))}"`;
  if (w.pct === Infinity) return `<span class="prod-card-wow"${tip}>Baru</span>`;
  return `<span class="prod-card-wow"${tip}>${ico('arrowUp', 10)} ${w.pct}%</span>`;
}

function terlarisWowHtml(w) {
  if (!w || w.pct == null) return '';
  return cardWowPctHtml(w.pct === Infinity ? Infinity : w.pct, terlarisTooltip(w));
}

function typeCardHtml(t, absIdx, animIdx, siblings, usedImgs, variant) {
  const parts = splitTypeTitle(t.keyword, siblings);
  const cover = pickTypeCover(t, usedImgs);
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
  const isTrend = variant === 'trend';
  const isMeledak = variant === 'meledak';
  const tlr = (isTrend || isMeledak) ? null : (t._terlaris || null);
  const wk = tlr || weeklyStats(t);
  const overlay = (cover.collided && parts.distinct)
    ? `<span class="prod-card-img-caption">${esc(parts.distinct)}</span>`
    : '';
  const imgBlock = cover.url
    ? `<div class="prod-card-img"><img src="${esc(imgThumb(cover.url))}" alt="" loading="lazy" decoding="async" width="320" height="320">${overlay}</div>`
    : '<div class="prod-card-ph"></div>';
  const extraClass = isTrend ? ' prod-card--terlaris'
    : isMeledak ? ' prod-card--home-meledak'
    : (tlr ? ' prod-card--terlaris' : '');
  const badge = isTrend ? terlarisBadgeHtml()
    : isMeledak ? homeMeledakBadgeHtml()
    : (tlr ? terlarisBadgeHtml() : '');
  const wow = wk ? ((isTrend || isMeledak) ? homeWowHtml(wk) : terlarisWowHtml(wk)) : '';
  const soldLine = ((isTrend || isMeledak) && wk)
    ? `<span class="prod-card-wk" title="${esc(terlarisTooltip(wk))}">~${Math.round(wk.units).toLocaleString('id-ID')} terjual</span>`
    : '';
  return `<button type="button" class="prod-card ptype-card${extraClass}" data-ptype="${absIdx}" data-ptype-kw="${esc(t.keyword || '')}" style="animation-delay:${(animIdx % 3) * 0.06}s">
    ${badge}
    ${imgBlock}
    <div class="prod-card-body">
      <div class="prod-card-name-row">
        ${typeNameHtml(parts)}
        ${viewsHtml}
      </div>
      <div class="prod-card-stats prod-card-stats--slim">
        <div class="prod-stat">
          <span class="prod-stat-lbl">Omset/bulan</span>
          <span class="prod-stat-val">${omsetVal}</span>
          ${omsetChipHtml(t, { aggregate: true })}
          ${wow}
          ${soldLine}
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
 * ordering. Keywords with no city-specific market row fall back to the
 * national (ALL) row rather than disappearing. Still no listing fallback —
 * individual products stay at the Kompetitor level.
 */
async function typesForListings(rows, city, limit = 12) {
  const kws = [];
  (rows || []).forEach(r => {
    const k = r?.keyword;
    if (k && !kws.includes(k)) kws.push(k);
  });
  if (!kws.length || !_supabase) return [];
  const cityKey = city || 'ALL';
  const missing = kws.filter(k => !_ptypeByKeyword.has(k));
  let fetched = [];
  if (missing.length) {
    try {
      const { data } = await _supabase.from('product_types_v')
        .select(ptypeCols())
        .eq('city', cityKey)
        .in('keyword', missing.slice(0, 80))
        .gte('n_listings', 3);
      fetched = data || [];
    } catch (e) { console.warn('[typesForListings]', e?.message || e); }
  }
  registerTypes(fetched);
  const stillMissing = kws.filter(k => !_ptypeByKeyword.has(k));
  if (stillMissing.length && cityKey !== 'ALL') {
    try {
      const { data } = await _supabase.from('product_types_v')
        .select(ptypeCols())
        .eq('city', 'ALL')
        .in('keyword', stillMissing.slice(0, 80))
        .gte('n_listings', 3);
      registerTypes(data || []);
    } catch (e) { console.warn('[typesForListings ALL]', e?.message || e); }
  }
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
  const list = types || [];
  // Nearby fallback is "pasar terdekat", not the query's weekly winner.
  const pinned = list.some(t => t._nearby) ? list : markTerlarisMinggu(list);
  const siblings = pinned.map(t => t.keyword);
  const usedImgs = new Set();
  return pinned.map((t, i) => typeCardHtml(t, i, i, siblings, usedImgs)).join('');
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
      if (userNeverDeepDived()) {
        void logUserEvent('dir_first_click_deepdive', { ui: 'gpt', keyword: t.keyword });
      }
      void logUserEvent('ptype_open', { ui: 'gpt', keyword: t.keyword, city: (state.dirCities && state.dirCities[0]) || 'ALL' });
      void openDeepDive(p);
    });
  });
}

function sortTypeRows(rows, mode, hasQuery) {
  const out = (rows || []).slice();
  if (mode === 'termurah') out.sort((a, b) => (Number(a.price_median) || 0) - (Number(b.price_median) || 0));
  else if (mode === 'termahal') out.sort((a, b) => (Number(b.price_median) || 0) - (Number(a.price_median) || 0));
  else if (mode === 'naik_daun') out.sort((a, b) => (Number(b.trend_delta_30d) || 0) - (Number(a.trend_delta_30d) || 0));
  else if (mode === 'terlaris_minggu') out.sort((a, b) => (Number(b.wk_units) || 0) - (Number(a.wk_units) || 0));
  else if (mode === 'meledak') {
    const rank = (t) => {
      const w = weeklyStats(t);
      if (!w || w.pct == null) return -1;
      return w.pct === Infinity ? Number.MAX_SAFE_INTEGER : w.pct;
    };
    out.sort((a, b) => (rank(b) - rank(a)) || ((Number(b.wk_units) || 0) - (Number(a.wk_units) || 0)));
  }
  else if (mode === 'sesuai' && hasQuery) return out; // already relevance-sorted by searchProductTypes()
  else out.sort((a, b) => (Number(b.omset_top15) || 0) - (Number(a.omset_top15) || 0)); // sesuai (no query) / terlaris fallback
  return out;
}

function sortDirRows(rows, mode) {
  const out = (rows || []).slice();
  const age = p => {
    const d = listingAgeDays(p);
    return d == null ? 1e12 : d;
  };
  if (mode === 'termurah') out.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  else if (mode === 'termahal') out.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  else if (mode === 'naik_daun') out.sort((a, b) => (Number(b.sold_per_day) || 0) - (Number(a.sold_per_day) || 0));
  else if (mode === 'review') out.sort((a, b) => (Number(b.reviews) || 0) - (Number(a.reviews) || 0));
  else if (mode === 'terbaru') out.sort((a, b) => age(a) - age(b));
  else if (mode === 'terlaris') out.sort((a, b) => (Number(b.total_sold) || 0) - (Number(a.total_sold) || 0));
  else if (mode === 'trending') {
    const pct = p => {
      const t = p && p._petaTrend;
      return (t && !t.belum && t.wkPct != null) ? t.wkPct : -1e12;
    };
    out.sort((a, b) => pct(b) - pct(a));
  }
  else out.sort((a, b) => (Number(estOmsetBulan(b)) || 0) - (Number(estOmsetBulan(a)) || 0)); // omset default
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
  const pick = state.comparePick;
  if (!pick) {
    banner.hidden = true;
    banner.innerHTML = '';
    updateDirCompareBar();
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <div class="dir-compare-inner">
      <div class="dir-compare-text">
        <strong>Mode bandingkan</strong>
        <span>Pilih hingga 3 produk, lalu ketuk Bandingkan. Ganti kategori atau cari untuk menambah.</span>
      </div>
      <button type="button" class="btn-ghost" id="dir-compare-cancel" style="margin:0">Batal</button>
    </div>`;
  $('dir-compare-cancel')?.addEventListener('click', () => cancelComparePick());
  updateDirCompareBar();
}

function updateDirCompareBar() {
  const bar = $('dir-compare-bar');
  const slots = $('dir-compare-bar-slots');
  const hint = $('dir-compare-bar-hint');
  const go = $('dir-compare-go');
  const pick = state.comparePick;
  document.body.classList.toggle('dir-compare-picking', !!pick);
  if (!bar) return;
  if (!pick) {
    bar.hidden = true;
    if (slots) slots.innerHTML = '';
    return;
  }
  bar.hidden = false;
  const selected = Array.isArray(pick.selected) ? pick.selected : [];
  if (slots) {
    let html = '';
    for (let i = 0; i < 3; i++) {
      const p = selected[i];
      if (p) {
        const img = p.image_url
          ? `<img src="${esc(imgThumb(p.image_url))}" alt="">`
          : '';
        html += `<div class="dir-cmp-slot">
          ${img}
          <button type="button" class="dir-cmp-slot-rm" data-cmp-rm="${esc(prodKey(p))}" title="Hapus" aria-label="Hapus dari perbandingan">×</button>
        </div>`;
      } else {
        html += `<div class="dir-cmp-slot"></div>`;
      }
    }
    slots.innerHTML = html;
    slots.querySelectorAll('[data-cmp-rm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.getAttribute('data-cmp-rm');
        const p = selected.find(x => prodKey(x) === key);
        if (p) toggleComparePickProduct(p);
      });
    });
  }
  if (hint) {
    if (selected.length === 0) hint.textContent = 'Pilih hingga 3 produk';
    else if (selected.length === 1) hint.textContent = '1 dipilih — tambah 1 lagi';
    else hint.textContent = `${selected.length} produk dipilih`;
  }
  if (go) {
    go.disabled = selected.length < 2;
    if (!go.dataset.boundCmpGo) {
      go.dataset.boundCmpGo = '1';
      go.addEventListener('click', () => {
        const list = state.comparePick?.selected || [];
        if (list.length < 2) return;
        void openProductCompare(list);
      });
    }
  }
}

function refreshComparePickCards() {
  const keys = new Set((state.comparePick?.selected || []).map(prodKey));
  document.querySelectorAll('[data-prod].is-pickable, .prod-card--pick').forEach(el => {
    const on = keys.has(el.getAttribute('data-prod'));
    el.classList.toggle('is-picked', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function toggleComparePickProduct(p) {
  const pick = state.comparePick;
  if (!pick || !p) return;
  if (!Array.isArray(pick.selected)) pick.selected = [];
  const i = pick.selected.findIndex(x => prodKey(x) === prodKey(p));
  if (i >= 0) {
    pick.selected.splice(i, 1);
  } else {
    if (pick.selected.length >= 3) {
      showToast('Maksimal 3 produk untuk dibandingkan');
      return;
    }
    pick.selected.push(p);
    rememberProducts([p]);
  }
  refreshComparePickCards();
  updateDirCompareBar();
}

function cancelComparePick() {
  const pick = state.comparePick;
  const src = pick?.source;
  const chatId = pick?.chatId;
  state.comparePick = null;
  updateDirCompareBanner();
  const chat = chatId ? state.chats.find(c => (c.id || c.localId) === chatId) : null;
  const compared = resolveCompareProducts(chat);
  if (compared.length >= 2) {
    state.activeChatId = chatId;
    void openProductCompare(compared, { resume: true, chatId });
    return;
  }
  if (src) void openDeepDive(src);
  else setView('directory');
}

async function startComparePick(source, selected, chatId) {
  const sel = Array.isArray(selected) && selected.length
    ? selected.slice(0, 3)
    : (source ? [source] : []);
  if (!sel.length) {
    showToast('Buka produk dulu untuk membandingkan');
    return;
  }
  const existingChatId = chatId
    || (chatIsCompare(activeChat()) ? compareChatKey(activeChat()) : null);
  state.comparePick = {
    source: source || sel[0],
    selected: sel,
    chatId: existingChatId,
  };
  state.dirPage = 1;
  const match = matchDirCatFromProduct(state.comparePick.source);
  if (match) state.dirCats = [toCanonicalCat(match) || match].filter(Boolean);
  void logUserEvent('gpt_compare_pick', { ui: 'gpt', keyword: state.comparePick.source?.keyword || '', item_id: state.comparePick.source?.item_id });
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
      .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category,listing_date,nowcast_velocity_daily,nowcast_omset_monthly,nowcast_confidence,nowcast_method,is_ad')
      .gt('total_sold', 0)
      .ilike('keyword', kw)
      .eq('is_offtopic', false)
      .order('total_sold', { ascending: false })
      .limit(120);
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

function compareCellWin(kind, values, i) {
  const nums = values.map(v => Number(v) || 0);
  const n = nums[i];
  if (kind === 'lower') {
    const positives = nums.filter(x => x > 0);
    if (!positives.length) return '';
    const best = Math.min(...positives);
    return n > 0 && n === best ? 'cmp-win' : '';
  }
  const best = Math.max(...nums);
  if (best <= 0) return '';
  return n === best ? 'cmp-win' : '';
}

function productCompareSideHtml(p, meta, label) {
  const score = meta?.score;
  return `
    <div class="cmp2-side">
      <div class="cmp2-label">${esc(label)}</div>
      ${p.image_url ? `<img class="cmp2-img" src="${esc(imgThumb(p.image_url))}" alt="" decoding="async">` : '<div class="cmp2-img ph"></div>'}
      <h3 class="cmp2-name">${esc(p.product_name || p.keyword || 'Produk')}</h3>
      <p class="cmp2-store dd-sub">${esc(p.store_name || '—')}</p>
      ${score ? `<div class="cmp2-score"><span class="badge ${score.cls}">${score.label}</span><strong>${score.score}</strong><span>/100</span></div>` : ''}
      <button type="button" class="btn-ghost cmp2-open" data-cmp-open="${esc(prodKey(p))}" style="margin:10px 0 0;width:100%">Lihat Deep Dive</button>
    </div>`;
}

function productCompareRowsHtml(products, metas) {
  const cell = (text, win) => `<div class="cmp2-cell ${win || ''}" role="cell">${esc(text)}</div>`;
  const row = (lbl, items, kind) => {
    const raws = items.map(it => it.raw);
    return `<div class="cmp2-row" role="row">
      <div class="cmp2-cell cmp2-metric" role="cell">${esc(lbl)}</div>
      ${items.map((it, i) => cell(it.text, kind ? compareCellWin(kind, raws, i) : '')).join('')}
    </div>`;
  };
  const rows = [
    row('Harga', products.map(p => ({ text: fmtRp(p.price), raw: p.price })), 'lower'),
    row('Terjual', products.map(p => ({ text: fmtSold(p.total_sold), raw: p.total_sold })), 'higher'),
    row('Est. omset / bulan', products.map(p => {
      const o = estOmsetBulan(p);
      return { text: o ? fmtOmset(o) : '—', raw: o };
    }), 'higher'),
    row('Rating', products.map(p => ({ text: p.rating != null ? String(p.rating) : '—', raw: p.rating })), 'higher'),
    row('Ulasan', products.map(p => ({ text: fmtSold(p.reviews || 0), raw: p.reviews })), 'higher'),
    row('Lokasi', products.map(p => ({ text: p.location || '—', raw: 0 }))),
    row('Keyword', products.map(p => ({ text: p.keyword || '—', raw: 0 }))),
    row('Kategori', products.map(p => ({ text: p.category || '—', raw: 0 }))),
    row('Skor peluang', products.map((p, i) => ({
      text: metas[i]?.score ? String(metas[i].score.score) : '—',
      raw: metas[i]?.score?.score,
    })), 'higher'),
    row('Kompetisi niche', products.map((p, i) => ({ text: metas[i]?.stats?.komp || '—', raw: 0 }))),
    row('Peer di keyword', products.map((p, i) => ({
      text: metas[i]?.stats?.n != null ? String(metas[i].stats.n) : '—',
      raw: metas[i]?.stats?.n,
    })), 'higher'),
  ];
  return `<div class="cmp2-table" role="table">${rows.join('')}</div>`;
}

function compareSideLabel(p, i, source) {
  if (source && prodKey(p) === prodKey(source)) return 'Produk saat ini';
  return `Produk ${i + 1}`;
}

async function openProductCompare(aOrList, b, maybeOpts) {
  const opts = Array.isArray(aOrList)
    ? ((b && typeof b === 'object' && b.item_id == null) ? b : {})
    : (maybeOpts || {});
  const products = (Array.isArray(aOrList) ? aOrList : [aOrList, b])
    .filter(p => p && p.item_id != null)
    .slice(0, 3);
  if (products.length < 2) return;
  if (!currentUser) {
    state.pendingCompare = { products, chatId: opts.chatId || state.comparePick?.chatId || null };
    saveLocalState();
    openAuthModal('signup', 'gpt_gate_compare');
    return;
  }
  if (state.pendingCompare) { state.pendingCompare = null; saveLocalState(); }
  const source = state.comparePick?.source || null;
  const pickChatId = opts.chatId || state.comparePick?.chatId || null;
  const chat = await ensureCompareChat(products, { resume: !!opts.resume, chatId: pickChatId });
  const chatId = compareChatKey(chat);
  state.compareReturnChatId = chatId;
  state.comparePick = null;
  updateDirCompareBanner();
  state.deepdiveProduct = products[0];
  setView('deepdive', {
    forceHistory: true,
    hist: { compare: true, chatId },
  });
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = `<p class="dd-sub">Menyiapkan perbandingan…</p>`;

  const metas = await Promise.all(products.map(p => fetchPeersForCompare(p)));

  void logUserEvent('gpt_product_compare', {
    ui: 'gpt',
    n: products.length,
    a_item: products[0]?.item_id,
    b_item: products[1]?.item_id,
    c_item: products[2]?.item_id || null,
    a_kw: products[0]?.keyword || '',
    b_kw: products[1]?.keyword || '',
  });
  clarityEvt('gpt_product_compare', { n: products.length });

  const scores = metas.map(m => Number(m?.score?.score) || 0);
  const best = Math.max(...scores);
  const winners = products.filter((_, i) => scores[i] === best && best > 0);
  let verdict = '';
  if (best > 0) {
    if (winners.length > 1) {
      verdict = products.length === 2
        ? 'Skor peluang keduanya mirip — lihat harga, terjual, dan kompetisi niche di tabel.'
        : 'Skor peluang beberapa produk mirip — lihat harga, terjual, dan kompetisi niche di tabel.';
    } else {
      const name = (winners[0].product_name || 'Produk ini').slice(0, 40);
      verdict = `Dari sinyal data (harga peer, kompetisi, velocity), <strong>${esc(name)}</strong> unggul tipis di skor peluang.`;
    }
  }

  const n = products.length;
  root.innerHTML = `
    <div class="dd-head" style="margin-bottom:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <button type="button" class="btn-ghost" id="cmp2-back" style="margin:0">Kembali</button>
      <button type="button" class="btn-ghost" id="cmp2-again" style="margin:0">Ubah produk</button>
    </div>
    <h2 class="dd-title" style="margin-bottom:4px">Perbandingan produk</h2>
    <p class="dd-sub" style="margin-bottom:16px">Angka dari data Shopee via LarisID — bukan tebakan AI. Tersimpan di riwayat — klik chat-nya untuk buka lagi.</p>
    <div class="cmp2-scroll" style="--cmp-n:${n}">
      <div class="cmp2-heads">
        ${products.map((p, i) => productCompareSideHtml(p, metas[i], compareSideLabel(p, i, source))).join('')}
      </div>
      ${productCompareRowsHtml(products, metas)}
    </div>
    ${verdict ? `<p class="cmp2-verdict">${verdict}</p>` : ''}
    <p class="ddr-caption" style="margin-top:14px">Skor peluang memakai peer keyword masing-masing produk (kompetisi top 3, volume pasar, velocity). Klik Deep Dive untuk analisis lengkap satu produk.</p>
  `;

  $('cmp2-back')?.addEventListener('click', () => {
    state.compareReturnChatId = null;
    void openDirectory();
  });
  $('cmp2-again')?.addEventListener('click', () => {
    void startComparePick(source || products[0], products, chatId);
  });
  root.querySelectorAll('[data-cmp-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-cmp-open');
      const p = products.find(x => prodKey(x) === key);
      if (!p) return;
      state.compareReturnChatId = chatId;
      void openDeepDive(p, { fromCompare: true });
    });
  });
  setComposerChips(ddComposerChips(products[0]), 'compare');
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

/** Single selected category for subgroup chips (hidden when 0 or 2+ cats). */
function primaryDirCat() {
  return (state.dirCats && state.dirCats.length === 1) ? state.dirCats[0] : null;
}

// Refresh subgroup chips for the active single category (hidden for multi/all).
function applyDirCatUi() {
  void renderSubcats(primaryDirCat());
}

// Always-visible category photo rail — client-side markup (DIR_CANON_CATS +
// CANON_CAT_ICONS + DIR_CAT_PHOTO), no network dependency, so it renders
// before any data fetch resolves. Click toggles that category as the sole
// directory filter.
function renderDirCatRail() {
  const rail = $('dir-cat-rail');
  if (!rail) return;
  const active = primaryDirCat();
  rail.innerHTML = DIR_CANON_CATS.map(cat => {
    const icon = CANON_CAT_ICONS[cat] || '';
    const slug = DIR_CAT_PHOTO[cat] || '';
    const sel = cat === active;
    const src = slug ? `/images/dir-cats/${slug}.webp` : '';
    return `<button type="button" class="dir-cat-pill${sel ? ' selected' : ''}" data-dir-cat="${esc(cat)}">
      <span class="dir-cat-pill-media">
        ${src ? `<img src="${src}" alt="" loading="lazy" />` : ''}
        <span class="dir-cat-pill-badge">
          <span class="dir-cat-pill-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
          <span class="dir-cat-pill-label">${esc(cat)}</span>
        </span>
      </span>
    </button>`;
  }).join('');
  rail.querySelectorAll('[data-dir-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.getAttribute('data-dir-cat');
      const already = cat === primaryDirCat();
      void applyDirectoryCategory(already ? '' : cat);
    });
  });
}

// Build the sub-group chip row for the selected category (hidden when the
// category has no sub-groups). Selecting one narrows the grid by keyword.
// Subgroup chips used to sit under the photo rail; the mega-menu still
// owns subgroup picks. Keep the host empty so it cannot flash back.
async function renderSubcats() {
  const wrap = $('dir-subcats');
  if (!wrap) return;
  wrap.hidden = true;
  wrap.innerHTML = '';
}

// Rebuild the Kota options from the active Provinsi (all cities when none).
/** Heading reflects active Produk search / category / user's home city. */
/** Small caption under #dir-heading: "Menampilkan {shown} dari {total} produk". */
function updateDirCount(total, shown, nearby) {
  const el = $('dir-count');
  if (!el) return;
  if (!total) { el.textContent = ''; return; }
  const unsold = Number(state.dirUnsold) || 0;
  const base = nearby
    ? `Menampilkan ${shown} dari ${total} produk terdekat`
    : `Menampilkan ${shown} dari ${total} produk`;
  el.textContent = unsold > 0
    ? `${base} · ${unsold.toLocaleString('id-ID')} listing belum terjual tidak ditampilkan`
    : base;
}

function updateDirHeading() {
  const h = $('dir-heading');
  if (!h) return;
  const q = (state.dirSearch || '').trim();
  const n = (state.dirRows || []).length;
  if (q) {
    h.textContent = `Hasil: ${q}${n ? ` · ${n} produk` : ''}`;
    return;
  }
  if (isDirHomeBrowse()) {
    const userCity = state.onboarding?.city || '';
    h.textContent = userCity ? `Yang Laku di ${userCity}` : 'Semua produk';
    return;
  }
  const cat = primaryDirCat();
  if (cat && state.dirSub) {
    h.textContent = `${cat} · ${state.dirSub}`;
    return;
  }
  if (cat) {
    h.textContent = cat;
    return;
  }
  const userCity = state.onboarding?.city || '';
  h.textContent = userCity ? `Yang Laku di ${userCity}` : 'Produk';
}

/* Default Cari Produk browse: no search, no explicit category/subgroup, not
 * compare-picking. Onboarding's auto-filter still counts — same gate the hero
 * has used since 96055c82, so the curated rows don't vanish on first login. */
function isDirHomeBrowse() {
  return !state.comparePick
    && !(state.dirSearch || '').trim()
    && !state.dirSub
    && (!(state.dirCats || []).length || state.dirCatsFromOnboarding);
}

/* Nav re-entry (Cari Produk tab) always lands on the default home. Deep Dive
 * back must NOT call this — it reopens the filtered/simple grid the user left. */
function resetDirectoryToHome() {
  state.dirCats = [];
  state.dirSub = null;
  state.dirSearch = '';
  state.dirPage = 1;
  state.dirSort = 'omset';
  state.dirChipKw = '';
  state.dirZoneKeys = null;
  state.dirCatsFromOnboarding = false;
  state.dirNearby = false;
  const searchInp = $('results-bar-input');
  if (searchInp) searchInp.value = '';
  const host = $('dir-filters-range');
  try { host?._dirApi?.setValue?.('omset'); } catch (_) {}
  try { host?._dirApi?.setCategories?.([]); } catch (_) {}
}

let _dirHomePool = null;
let _dirHomePoolPromise = null;
function loadDirHomePool() {
  if (_dirHomePool) return Promise.resolve(_dirHomePool);
  if (_dirHomePoolPromise) return _dirHomePoolPromise;
  _dirHomePoolPromise = fetchTerlarisMinggu(null, 80).then(rows => {
    _dirHomePool = rows || [];
    return _dirHomePool;
  }).catch(() => {
    _dirHomePoolPromise = null;
    return [];
  });
  return _dirHomePoolPromise;
}

function pickDirHomeRows(pool) {
  const list = Array.isArray(pool) ? pool : [];
  const trending = list.slice(0, 10);
  const trendKws = new Set(trending.map(t => t.keyword));
  const pctRank = (t) => {
    const w = weeklyStats(t);
    if (!w || w.pct == null) return -1;
    return w.pct === Infinity ? Number.MAX_SAFE_INTEGER : w.pct;
  };
  const byPct = list.slice().sort((a, b) =>
    (pctRank(b) - pctRank(a)) || ((Number(b.wk_units) || 0) - (Number(a.wk_units) || 0)));
  const meledak = [];
  const have = new Set();
  byPct.forEach(t => {
    if (meledak.length >= 3) return;
    if (trendKws.has(t.keyword)) return;
    meledak.push(t);
    have.add(t.keyword);
  });
  if (meledak.length < 3) {
    byPct.forEach(t => {
      if (meledak.length >= 3 || have.has(t.keyword)) return;
      meledak.push(t);
      have.add(t.keyword);
    });
  }
  return { trending, meledak };
}

function homeCardsHtml(rows, variant) {
  const list = rows || [];
  const siblings = list.map(t => t.keyword);
  const usedImgs = new Set();
  return list.map((t, i) => typeCardHtml(t, i, i, siblings, usedImgs, variant)).join('');
}

function applyDirHomeSort(mode) {
  state.dirSort = mode;
  state.dirPage = 1;
  state._dirSkipScroll = true;
  try { $('dir-filters-range')?._dirApi?.setValue?.(mode); } catch (_) {}
  void logUserEvent('dir_filter', { ui: 'gpt', kind: 'sort', value: mode, surface: 'dir_home' });
  void renderDirectory().then(() => {
    $('dir-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function syncDirHome() {
  const trend = $('dir-home-trending');
  const feat = $('dir-home-feature');
  if (trend) {
    trend.hidden = true;
    trend.innerHTML = '';
  }
  if (feat) feat.hidden = true;
}

/* Header carousel — default browse state only. Hidden the moment a search,
 * category or subgroup is active so results start at the top, and while
 * compare-picking (that flow needs the grid immediately). Rendered once by
 * js/gpt-dir-hero.js and only toggled after that, so autoplay position and
 * already-fetched thumbnails survive a filter round-trip. */
function syncDirHero() {
  const host = $('dir-hero');
  if (!host) return;
  const show = isDirHomeBrowse();
  host.hidden = !show;
  if (!show || !window.LarisGptDirHero) return;
  // Every navigation is handed back here rather than reimplemented in the
  // hero: applyDirectoryCategory already resets search/page, syncs the filter
  // host, closes the mega-menu and logs dir_filter.
  window.LarisGptDirHero.render(host, {
    supabase: _supabase,
    imgThumb,
    onCategory: (cat, sub) => { void applyDirectoryCategory(cat, sub); },
    // Deferred: the results-bar has a document-level outside-click closer, and
    // the hero CTA's own click is still bubbling — opening the mega-menu inline
    // would have it closed again by the same click.
    onKategoriMenu: () => { setTimeout(() => $('results-bar-kategori')?.click(), 0); },
    onTracker: () => { $('btn-tracker')?.click(); },
    onEvent: (name, meta) => { void logUserEvent(name, { ui: 'gpt', ...(meta || {}) }); },
  });
}

async function openDirectory() {
  setView('directory');
  _dirApplyDefaultsOnce();
  updateDirCompareBanner();
  // Always browse national aggregates (all cities). City UI was removed.
  state.dirCities = [];

  const filtersHost = $('dir-filters-range');
  if (filtersHost && window.LarisGptDirFilters) {
    window.LarisGptDirFilters.renderControls(filtersHost, {
      value: state.dirSort || 'omset',
      onSortChange: (v) => {
        state.dirSort = v;
        state.dirPage = 1;
        void logUserEvent('dir_filter', { ui: 'gpt', kind: 'sort', value: v });
        paintDirectoryTable({ remountPeta: false });
      },
    });
  }

  applyDirCatUi();
  updateDirHeading();

  const note = $('dir-note');
  if (note) {
    const tailored = !!(state.onboarding?.city || state.onboarding?.categories?.length);
    note.hidden = !tailored || !!state.comparePick;
  }

  // Keep the sticky search bar in sync with directory search state.
  const searchInp = $('results-bar-input');
  if (searchInp && state.dirSearch && searchInp.value !== state.dirSearch) {
    searchInp.value = state.dirSearch;
  }

  await renderDirectory();
}

let _dirRenderSeq = 0;

function dirPetaQuery() {
  const q = (state.dirSearch || '').trim();
  if (q) return q;
  const cat = primaryDirCat();
  if (cat) return cat;
  const city = state.onboarding?.city || '';
  return city ? `Yang Laku di ${city}` : '';
}

function dirPetaExtra() {
  return {
    list: false,
    onTrend: () => { paintDirectoryTable({ remountPeta: false }); },
    onHighlight: (listing) => {
      const grid = $('dir-grid');
      if (!grid) return;
      const key = listing ? prodKey(listing) : '';
      grid.querySelectorAll('.lrow').forEach(tr => {
        const on = !!(key && tr.getAttribute('data-prod') === key);
        tr.classList.toggle('is-hl', on);
        if (on) tr.scrollIntoView({ block: 'nearest' });
      });
    },
    onZoneFilter: (_id, list) => {
      state.dirZoneKeys = list ? new Set(list.map(prodKey)) : null;
      paintDirectoryTable({ remountPeta: false });
    },
  };
}

function mountDirPeta() {
  const host = $('dir-peta');
  if (!host || !window.PetaPeluang) return;
  const q = dirPetaQuery();
  const chip = state.dirChipKw || '';
  let pts = state.dirPoolListings || [];
  if (chip) pts = pts.filter(r => (r.keyword || '') === chip);
  pts = pts.slice(0, 200);
  if (pts.length < 2) {
    if (host._petaCtl) { host._petaCtl.destroy(); host._petaCtl = null; }
    host.innerHTML = '';
    host.hidden = true;
    return;
  }
  host.hidden = false;
  mountPeta(host, q, pts, dirPetaExtra());
}

function paintDirectoryTable(opts = {}) {
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  const chips = $('dir-chips');
  if (!grid) return;
  const picking = !!state.comparePick;
  const filtered = sortDirRows(
    filterListingPool(state.dirPoolListings, state.dirChipKw || '', state.dirZoneKeys),
    state.dirSort || 'omset',
  );
  state.dirRows = filtered;
  if (state.dirPage > 1 && !currentUser) {
    openAuthModal('signup', 'gpt_gate_directory');
    state.dirPage = 1;
  }
  const start = (state.dirPage - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const q = (state.dirSearch || '').trim();
  const emptyMsg = q
    ? `<p class="dd-sub">Belum ketemu produk untuk “<strong>${esc(q)}</strong>”. Coba kata kunci lain.</p>`
    : '<p class="dd-sub">Belum ketemu produk untuk filter ini.</p>';
  const nearbyLead = state.dirNearby
    ? `<p class="dd-sub dir-nearby-lead">Belum ketemu produk untuk “<strong>${esc(q)}</strong>”. Ini produk dari pasar terdekat:</p>`
    : '';
  if (chips) {
    const html = keywordChipsHtml(state.dirTypes, state.dirChipKw || '', { showSemua: true });
    chips.innerHTML = html;
    chips.hidden = !html;
    chips.querySelectorAll('[data-lrow-kw]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.dirChipKw = btn.getAttribute('data-lrow-kw') || '';
        state.dirPage = 1;
        state.dirZoneKeys = null;
        paintDirectoryTable({ remountPeta: true });
      });
    });
  }
  grid.innerHTML = slice.length
    ? nearbyLead + listingRowsHtml(slice, {
        pick: picking,
        highlightKey: picking ? '' : '',
        sort: state.dirSort || 'omset',
      }) + listingUnsoldNote(state.dirUnsold)
    : (nearbyLead + emptyMsg);
  bindListingRows(grid, {
    onSort: (mode) => {
      state.dirSort = mode;
      state.dirPage = 1;
      try { $('dir-filters-range')?._dirApi?.setValue?.(mode); } catch (_) {}
      paintDirectoryTable();
    },
    onHover: (key) => {
      const ctl = $('dir-peta')?._petaCtl;
      ctl?.hoverKey?.(key);
    },
  });
  if (picking) refreshComparePickCards();
  renderDirPager(pager, filtered.length);
  updateDirCount(filtered.length, slice.length, state.dirNearby);
  updateDirHeading();
  if (opts.remountPeta !== false) mountDirPeta();
}

async function renderDirectory() {
  syncDirHero();
  void syncDirHome();
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  if (!grid) return;
  renderDirCatRail();

  const cats = state.dirCats || [];
  const q = (state.dirSearch || '').trim();
  const sub = primaryDirCat() ? (state.dirSub || null) : null;
  const home = isDirHomeBrowse();
  const seq = ++_dirRenderSeq;

  grid.innerHTML = garudaLoadingHtml('Memuat…');
  const petaHost = $('dir-peta');
  if (petaHost && window.PetaPeluang && typeof PetaPeluang.skeleton === 'function') {
    petaHost.hidden = false;
    PetaPeluang.skeleton(petaHost, q || dirPetaQuery());
  }

  const pool = await resolveListingPool({ q, cats, sub, home });
  if (seq !== _dirRenderSeq) return;
  const stale = (state.dirSearch || '').trim() !== q
    || (state.dirCats || []).join('|') !== cats.join('|')
    || (primaryDirCat() ? (state.dirSub || null) : null) !== sub;
  if (stale) return;

  const scopeChanged = (state._dirPoolQ || '') !== q
    || (state._dirPoolCats || '') !== cats.join('|')
    || (state._dirPoolSub || null) !== sub;
  state._dirPoolQ = q;
  state._dirPoolCats = cats.join('|');
  state._dirPoolSub = sub;
  if (scopeChanged) {
    state.dirChipKw = q ? (pool.primaryKw || '') : '';
    state.dirZoneKeys = null;
    state.dirPage = 1;
  }

  state.dirTypes = pool.keywords;
  state.dirNearby = pool.nearby;
  state.dirPoolListings = pool.listings;
  state.dirUnsold = pool.unsold || 0;
  rememberProducts(pool.listings);

  if (state._dirSkipScroll) state._dirSkipScroll = false;
  else scrollPanelToTop();
  paintDirectoryTable({ remountPeta: true });
  if (q && !pool.listings.length) {
    void logUncoveredSearch(q, { category: detectSearchDomain(q.toLowerCase())?.id || null });
  }
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
  $('dir-prev')?.addEventListener('click', () => { state.dirPage--; paintDirectoryTable({ remountPeta: false }); });
  $('dir-next')?.addEventListener('click', () => {
    if (!currentUser && state.dirPage >= 1) {
      openAuthModal('signup', 'gpt_gate_directory');
      return;
    }
    state.dirPage++;
    paintDirectoryTable({ remountPeta: false });
  });
}

async function renderDirectoryListings() {
  return renderDirectory();
}

// The "Tampilan klasik" opt-out lived here until 2026-08-10. Site A is gone,
// so there is nothing to opt out to.

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
  const stripExit = $('sample-strip-exit');
  if (exitBtn) exitBtn.style.display = _admSample ? '' : 'none';
  if (strip) {
    if (_viewAs || _admSample) {
      strip.hidden = false;
      strip.classList.add('open');
      if (stripText) {
        stripText.textContent = _viewAs
          ? `${viewAsLabel(_viewAs.role)}${_viewAs.cohortName ? ' · ' + _viewAs.cohortName : ''} — ${
              _viewAs.role === 'mentor'
                ? 'seluruh tampilan seperti yang dilihat mentor'
                : 'seluruh tampilan seperti yang dilihat siswa'
            }${_viewAs.stand_in ? ' (kamu bukan ' + (_viewAs.role === 'mentor' ? 'mentor' : 'anggota') + ' kohort ini)' : ''}. Statistik tidak dicatat.`
          : _admSample.mode === 'new'
            ? 'Sample: user baru (onboarding tidak disimpan)'
            : `Sample: ${_admSample.label || 'user'}`;
      }
      if (stripExit) stripExit.textContent = _viewAs ? 'Keluar' : 'Keluar sample';
    } else {
      strip.hidden = true;
      strip.classList.remove('open');
    }
  }
  syncViewAsUi();
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

/* ── Lihat sebagai (mahasiswa / mentor) ───────────────────────────────────
 *
 * One control in the header. Whichever role is picked, isPlatformAdmin() reads
 * false, so the admin nav, the unlimited quota, the "(Admin)" suffix and every
 * other admin gate close together and the screen is that role's — not their
 * panel inside an admin shell. A mentor is not a platform admin either, which
 * is why mentor mode masks exactly the same way.
 *
 * The two roles resolve their cohort differently, because the honest answer
 * differs: a mahasiswa's is their real membership, a mentor's is the cohort
 * they actually lead. Where the account has neither, the mode stands in for one
 * so the panel is not empty — and the strip says so rather than letting the
 * screen imply a membership that is not there.
 *
 * The strip at the top of .main is the way back and is never gated on the mask.
 */
function viewAsLabel(role) {
  return role === 'mentor' ? 'Mode mentor' : 'Mode mahasiswa';
}

function syncViewAsUi() {
  const wrap = $('viewas');
  const btn = $('btn-viewas');
  if (!wrap || !btn) return;
  const allowed = isPlatformAdminRaw();
  wrap.hidden = !allowed;
  if (!allowed) { closeViewAsMenu(); return; }
  btn.classList.toggle('is-on', !!_viewAs);
  btn.setAttribute('aria-pressed', _viewAs ? 'true' : 'false');
  const lbl = $('btn-viewas-label');
  if (lbl) lbl.textContent = _viewAs ? viewAsLabel(_viewAs.role) : 'Lihat sebagai';
  btn.title = _viewAs
    ? 'Kembali ke tampilan admin'
    : 'Lihat seluruh aplikasi sebagai mahasiswa atau mentor';
  if (_viewAs) closeViewAsMenu();
}

function closeViewAsMenu() {
  const pop = $('viewas-pop');
  const btn = $('btn-viewas');
  if (pop) pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleViewAsMenu() {
  if (!isPlatformAdminRaw()) return;
  // Active is a plain toggle: one click back to admin. The menu only exists to
  // choose which role to enter.
  if (_viewAs) { void exitViewAs(); return; }
  const pop = $('viewas-pop');
  const btn = $('btn-viewas');
  if (!pop || !btn) return;
  const open = pop.hidden;
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

async function enterViewAs(role) {
  if (!isPlatformAdminRaw() || _viewAs) return;
  closeViewAsMenu();
  // Resolve candidates BEFORE the mask goes up: listCohorts() sees every cohort
  // only while isAdmin() is still true, and a moment later it will not.
  let list = [];
  let own = null;
  try {
    mountLarisCohort();
    if (window.LarisCohort) {
      await window.LarisCohort.initMembership();
      list = (await window.LarisCohort.listCohorts()) || [];
      own = window.LarisCohort.myStudentCohort();
    }
  } catch (_) {}

  _viewAs = { role, cohortId: null, cohortName: '', stand_in: false };
  applyViewAsChrome();
  setView('cohort');

  let picked = null;
  let standIn = false;
  try {
    // open() re-reads membership under the mask, so what comes back now is what
    // this account genuinely is rather than what an admin can see.
    await window.LarisCohort.open();
    if (role === 'mentor') {
      picked = window.LarisCohort.myMentorCohort();
      if (!picked) {
        // Prefer the cohort the account is at least a member of: an arbitrary
        // first cohort is usually the empty demo one, which reads as broken.
        picked = (own && list.find(c => c.id === own.id)) || list[0] || null;
        standIn = !!picked;
      }
      // One path for both: mentorAs also turns on the mentor-only shell, which a
      // genuine mentor needs just as much as a stand-in.
      if (picked) await window.LarisCohort.mentorAs(picked.id, picked);
    } else {
      picked = own;
      if (!picked) {
        picked = list[0] || null;
        standIn = !!picked;
        if (picked) await window.LarisCohort.previewAs(picked.id, picked);
      }
    }
  } catch (_) {}

  _viewAs.cohortId = picked ? picked.id : null;
  _viewAs.cohortName = picked ? picked.name : '';
  _viewAs.stand_in = standIn;
  renderAdminSampleBanner();
  void refreshCohortNav();
  showToast(picked
    ? `${viewAsLabel(role)}: ${picked.name}`
    : `${viewAsLabel(role)} — belum ada kohort untuk ditampilkan.`);
}

/** Everything the mask has to repaint by hand, in both directions. */
function applyViewAsChrome() {
  // The mentor rail replaces the seller tools, the chat history and the location
  // card. One body class drives all of it; see the .mentor-shell block.
  document.body.classList.toggle('mentor-shell', _viewAs?.role === 'mentor');
  renderAdminSampleBanner();
  updateAccountUI();
  const admBtn = $('btn-admin');
  if (admBtn) admBtn.style.display = isPlatformAdmin() ? '' : 'none';
  void refreshGptUsage();
}

async function exitViewAs() {
  if (!_viewAs) return;
  _viewAs = null;
  applyViewAsChrome();
  void refreshCohortNav();
  showToast('Kembali ke tampilan admin.');
  if (isPlatformAdmin()) openAdminView();
  else goHome();
}

function goHome(e) {
  if (e) e.preventDefault();
  closeSidebar();
  renderLanding();
}

function fmtAdminDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return '—'; }
}

function admFmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('id-ID');
}

function admDayKey(v) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function admLastDays(n) {
  const out = [];
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    out.push(admDayKey(new Date(now.getTime() - i * 864e5)));
  }
  return out;
}

function admSeriesFromDaily(rows, valueKey, days) {
  const map = {};
  (rows || []).forEach(r => {
    const k = admDayKey(r.day || r.date);
    map[k] = Number(r[valueKey] != null ? r[valueKey] : r.n) || 0;
  });
  return days.map(d => map[d] || 0);
}

function admSparkline(values, color) {
  const w = 140, h = 28;
  if (!values || !values.length) {
    return `<svg class="adm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"></svg>`;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="adm-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/></svg>`;
}

const ADM_CAT_COLORS = {
  'Olahraga': '#B5202A', 'Kecantikan': '#F472B6', 'Rumah': '#F97316',
  'Fashion': '#EAB308', 'Elektronik': '#22C55E', 'Dapur': '#FB923C',
  'Bayi & Anak': '#A78BFA', 'HP & Gadget': '#38BDF8', 'Kamar Mandi': '#2DD4BF',
  'Kesehatan': '#34D399', 'Motor & Mobil': '#64748B', 'Hewan Peliharaan': '#C084FC',
  'Hobi & Kerajinan': '#F59E0B', 'Keamanan': '#78716C', 'Outdoor & Camping': '#84CC16',
  'Sepeda': '#06B6D4', 'Taman': '#65A30D', 'Tanaman': '#16A34A', 'Alat Tulis': '#94A3B8',
};
const ADM_CAT_FALLBACK = ['#6366F1', '#EC4899', '#14B8A6', '#F43F5E', '#8B5CF6', '#0EA5E9'];
const ADM_LAINNYA = '#9CA3AF';
const ADM_AV_COLORS = ['#B5202A', '#EA580C', '#16A34A', '#2563EB', '#7C3AED', '#DB2777', '#0F766E'];

function admCatColor(name) {
  if (!name) return ADM_LAINNYA;
  if (ADM_CAT_COLORS[name]) return ADM_CAT_COLORS[name];
  let h = 0;
  const s = String(name);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ADM_CAT_FALLBACK[h % ADM_CAT_FALLBACK.length];
}

function admInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function admAvColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ADM_AV_COLORS[h % ADM_AV_COLORS.length];
}

function admSellerStatus(u) {
  const s = u && u.seller_status;
  if (s === 'first_time' || s === 'baru') return 'first_time';
  if (s === 'existing' || s === 'berpengalaman') return 'existing';
  return '';
}

function renderAdminKpis(users) {
  const days = admLastDays(14);
  const signupsTotal = (users || []).length;
  const signupDaily = days.map(d => (users || []).filter(u => u.created_at && admDayKey(u.created_at) === d).length);

  const s = _adminStats || {};
  const k = _adminKpis || {};
  const viewsTotal = s.landing_views_total;
  const viewsDaily = admSeriesFromDaily(s.landing_views_daily, 'views', days);

  // Archive: user_tracked_products lost its write path at the 2026-08-10
  // cutover and has been frozen since 2026-08-08. Kept for history; the live
  // tracking model is keywords + toko below.
  const trackedTotal = k.tracked_total != null
    ? k.tracked_total
    : (users || []).reduce((n, u) => n + (Number(u.tracked_count) || 0), 0);
  const trackedDaily = admSeriesFromDaily(k.tracked_daily, 'n', days);

  const keywordsTotal = k.keywords_total;
  const keywordsDaily = admSeriesFromDaily(k.keywords_daily, 'n', days);
  const storesTotal = k.stores_total;
  const storesDaily = admSeriesFromDaily(k.stores_daily, 'n', days);

  const divesTotal = k.deepdives_total != null
    ? k.deepdives_total
    : (users || []).reduce((n, u) => n + (Number(u.deepdive_count) || 0), 0);
  const divesDaily = admSeriesFromDaily(k.deepdives_daily, 'n', days);

  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const spark = (id, series, color) => { const el = $(id); if (el) el.innerHTML = admSparkline(series, color); };

  set('adm-kpi-signups', admFmtNum(signupsTotal));
  set('adm-kpi-signups-sub', 'Semua waktu');
  spark('adm-kpi-signups-spark', signupDaily, '#B5202A');

  set('adm-kpi-views', admFmtNum(viewsTotal));
  set('adm-kpi-views-sub', viewsTotal == null ? 'Data tampilan belum tersedia' : 'Semua waktu');
  spark('adm-kpi-views-spark', viewsDaily, '#EA580C');

  set('adm-kpi-keywords', admFmtNum(keywordsTotal));
  set('adm-kpi-keywords-sub', keywordsTotal == null ? 'Belum tersedia' : 'Semua waktu');
  spark('adm-kpi-keywords-spark', keywordsDaily, '#16A34A');

  set('adm-kpi-stores', admFmtNum(storesTotal));
  set('adm-kpi-stores-sub', storesTotal == null ? 'Belum tersedia' : 'Semua waktu');
  spark('adm-kpi-stores-spark', storesDaily, '#0891B2');

  set('adm-kpi-tracked', admFmtNum(trackedTotal));
  set('adm-kpi-tracked-sub', 'Beku sejak 10 Agu');
  spark('adm-kpi-tracked-spark', trackedDaily, '#9CA3AF');

  set('adm-kpi-dives', admFmtNum(divesTotal));
  set('adm-kpi-dives-sub', 'Semua waktu, termasuk anonim');
  spark('adm-kpi-dives-spark', divesDaily, '#7C3AED');
}

// ── Monthly trend: landing page views vs sign ups ────────────────────────────
// Both series come from admin_stats(): signups_monthly (auth.users) and
// landing_views_monthly (public.page_views), bucketed in Asia/Jakarta.
// page_views only started collecting real traffic on 2026-07-20; the rows
// before that are seed data with a hard gap through 19 Jul, so that stretch of
// the views line is drawn dashed and called out under the chart.
// Views are blue here rather than the orange of their KPI tile: against the
// brand red of sign ups, orange is the one pairing that collapses both at this
// line weight and under red-green colour blindness.
const ADM_PV_TRACKING_START = '2026-07';

function admMonthKey(v) {
  return String(v || '').slice(0, 7); // YYYY-MM from a date / timestamptz
}

/** Continuous YYYY-MM keys spanning both series, so gap months stay on the axis. */
function admMonthSpan(...series) {
  const keys = series
    .flat()
    .map(r => admMonthKey(r && r.month))
    .filter(k => /^\d{4}-\d{2}$/.test(k))
    .sort();
  if (!keys.length) return [];
  const out = [];
  let [y, m] = keys[0].split('-').map(Number);
  const [ye, me] = keys[keys.length - 1].split('-').map(Number);
  while (y < ye || (y === ye && m <= me)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

function admMonthLabel(key) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const [y, m] = String(key).split('-');
  return `${names[Number(m) - 1] || m} ${String(y).slice(2)}`;
}

function renderAdminTrend() {
  const stage = $('adm-trend-stage');
  const empty = $('adm-trend-empty');
  const note = $('adm-trend-note');
  if (!stage) return;

  const s = _adminStats || {};
  const signups = s.signups_monthly || [];
  const views = s.landing_views_monthly || [];
  const months = admMonthSpan(signups, views);

  if (!months.length) {
    stage.hidden = true;
    if (note) note.hidden = true;
    if (empty) empty.hidden = false;
    if (_admTrendChart) { try { _admTrendChart.destroy(); } catch (_) {} _admTrendChart = null; }
    return;
  }
  stage.hidden = false;
  if (empty) empty.hidden = true;

  const byMonth = (rows, key) => {
    const map = {};
    (rows || []).forEach(r => { map[admMonthKey(r.month)] = Number(r[key]) || 0; });
    return months.map(m => map[m] || 0);
  };
  const viewData = byMonth(views, 'views');
  const signupData = byMonth(signups, 'signups');

  // Index of the first month with trustworthy landing-view tracking.
  const firstReal = months.findIndex(m => m >= ADM_PV_TRACKING_START);
  const seedUntil = firstReal > 0 ? firstReal : 0;
  if (note) {
    if (seedUntil > 0) {
      note.hidden = false;
      note.textContent = 'Garis putus-putus: landing page views sebelum 20 Jul 2026 berasal dari data awal yang tidak lengkap — jangan dibandingkan langsung dengan bulan setelahnya.';
    } else {
      note.hidden = true;
    }
  }

  larisEnsureChart().then(() => {
    const canvas = $('adm-trend-canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    if (_admTrendChart) { try { _admTrendChart.destroy(); } catch (_) {} _admTrendChart = null; }
    _admTrendChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: months.map(admMonthLabel),
        datasets: [
          {
            label: 'Landing page views',
            data: viewData,
            yAxisID: 'yViews',
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37,99,235,.08)',
            pointBackgroundColor: '#2563EB',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: .3,
            fill: true,
            segment: {
              borderDash: ctx => (ctx.p0DataIndex < seedUntil ? [5, 4] : undefined),
            },
          },
          {
            label: 'Sign ups',
            data: signupData,
            yAxisID: 'ySignups',
            borderColor: '#B5202A',
            backgroundColor: 'rgba(181,32,42,.08)',
            pointBackgroundColor: '#B5202A',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: .3,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${admFmtNum(ctx.parsed.y)}`,
              afterLabel: ctx => (ctx.datasetIndex === 0 && ctx.dataIndex < seedUntil ? 'data awal, tidak lengkap' : undefined),
            },
          },
        },
        scales: {
          yViews: {
            type: 'linear', position: 'left', beginAtZero: true,
            title: { display: true, text: 'Landing page views', color: '#2563EB', font: { size: 10, weight: '600' } },
            ticks: { precision: 0, color: '#9CA3AF', font: { size: 10 } },
            grid: { color: 'rgba(0,0,0,.05)' },
          },
          ySignups: {
            type: 'linear', position: 'right', beginAtZero: true,
            title: { display: true, text: 'Sign ups', color: '#B5202A', font: { size: 10, weight: '600' } },
            ticks: { precision: 0, color: '#9CA3AF', font: { size: 10 } },
            grid: { drawOnChartArea: false },
          },
          x: {
            ticks: { color: '#9CA3AF', font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 },
            grid: { display: false },
          },
        },
      },
    });
  });
}

function admCategoryCounts(users) {
  const counts = {};
  (users || []).forEach(u => {
    (u.categories || []).forEach(c => {
      const name = String(c || '').trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + 1;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function admDonutSlices(ranked) {
  const total = ranked.reduce((n, [, v]) => n + v, 0) || 1;
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  const restN = rest.reduce((n, [, v]) => n + v, 0);
  const slices = top.map(([name, n]) => ({ name, n, pct: Math.round(n / total * 100), color: admCatColor(name) }));
  if (restN) slices.push({ name: 'Lainnya', n: restN, pct: Math.round(restN / total * 100), color: ADM_LAINNYA, rest });
  return { slices, total, ranked };
}

async function renderAdminCategories(users) {
  const legend = $('adm-cat-legend');
  const moreBtn = $('adm-cat-more');
  const ranked = admCategoryCounts(users);
  if (!legend) return;
  if (!ranked.length) {
    legend.innerHTML = '<span class="dd-sub">Belum ada kategori onboarding.</span>';
    if (moreBtn) moreBtn.hidden = true;
    if (_admDonutChart) { try { _admDonutChart.destroy(); } catch (_) {} _admDonutChart = null; }
    return;
  }
  const { slices } = admDonutSlices(ranked);
  const shown = _adminCatsExpanded ? ranked : slices;
  legend.innerHTML = shown.map(item => {
    const name = item.name || item[0];
    const n = item.n != null ? item.n : item[1];
    const total = ranked.reduce((s, [, v]) => s + v, 0) || 1;
    const pct = item.pct != null ? item.pct : Math.round(n / total * 100);
    const color = item.color || admCatColor(name);
    return `<div class="adm-leg-row"><span class="adm-leg-dot" style="background:${color}"></span><span class="adm-leg-name">${esc(name)}</span><span class="adm-leg-pct">${pct}%</span></div>`;
  }).join('');
  if (moreBtn) {
    moreBtn.hidden = ranked.length <= 5;
    moreBtn.textContent = _adminCatsExpanded ? 'Sembunyikan kategori ↑' : 'Lihat semua kategori →';
  }

  await larisEnsureChart();
  const canvas = $('adm-cat-canvas');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_admDonutChart) { try { _admDonutChart.destroy(); } catch (_) {} _admDonutChart = null; }
  _admDonutChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: slices.map(s => s.name),
      datasets: [{
        data: slices.map(s => s.n),
        backgroundColor: slices.map(s => s.color),
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.raw}` } } },
    },
  });
}

function admMapFill(n) {
  if (n >= 31) return '#7F1D1D';
  if (n >= 21) return '#B5202A';
  if (n >= 11) return '#EF4444';
  if (n >= 6) return '#F87171';
  return '#FECACA';
}

const ADM_MAP_VB = { w: 800, h: 306 };
const ADM_MAP_ZOOM_MIN = 1;
const ADM_MAP_ZOOM_MAX = 8;

function admMapClientToVb(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const w = rect.width || 1;
  const h = rect.height || 1;
  return {
    x: (clientX - rect.left) / w * ADM_MAP_VB.w,
    y: (clientY - rect.top) / h * ADM_MAP_VB.h,
  };
}

function admMapClampPan() {
  const k = _adminMapZoom;
  const minX = ADM_MAP_VB.w * (1 - k);
  const minY = ADM_MAP_VB.h * (1 - k);
  _adminMapPan.x = Math.min(0, Math.max(minX, _adminMapPan.x));
  _adminMapPan.y = Math.min(0, Math.max(minY, _adminMapPan.y));
}

function admMapApplyView() {
  const svg = $('adm-map-svg');
  if (!svg) return;
  const k = _adminMapZoom;
  const world = svg.querySelector('#adm-map-world');
  if (world) {
    world.setAttribute('transform', `translate(${_adminMapPan.x} ${_adminMapPan.y}) scale(${k})`);
  }
  svg.querySelectorAll('.adm-map-pin').forEach(g => {
    const x = Number(g.getAttribute('data-x')) || 0;
    const y = Number(g.getAttribute('data-y')) || 0;
    g.setAttribute('transform', `translate(${x} ${y}) scale(${1 / k})`);
  });
}

function admMapZoomAt(svg, clientX, clientY, nextK) {
  const k = _adminMapZoom;
  const k2 = Math.min(ADM_MAP_ZOOM_MAX, Math.max(ADM_MAP_ZOOM_MIN, nextK));
  if (k2 === k) return;
  const p = admMapClientToVb(svg, clientX, clientY);
  _adminMapPan.x = p.x - (p.x - _adminMapPan.x) * (k2 / k);
  _adminMapPan.y = p.y - (p.y - _adminMapPan.y) * (k2 / k);
  _adminMapZoom = k2;
  admMapClampPan();
  admMapApplyView();
}

function admBindMapPanZoom() {
  const stage = document.querySelector('#view-admin .adm-map-stage');
  const svg = $('adm-map-svg');
  if (!stage || !svg || stage.dataset.panZoomBound) return;
  stage.dataset.panZoomBound = '1';

  let dragging = false;
  let last = null;
  let pointers = new Map();
  let pinch = null;

  const pointerPos = (e) => ({ id: e.pointerId, x: e.clientX, y: e.clientY });

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    admMapZoomAt(svg, e.clientX, e.clientY, _adminMapZoom * factor);
  }, { passive: false });

  stage.addEventListener('dblclick', (e) => {
    e.preventDefault();
    admMapZoomAt(svg, e.clientX, e.clientY, _adminMapZoom * (e.shiftKey ? 1 / 1.6 : 1.6));
  });

  stage.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pointerPos(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: _adminMapZoom,
        pan: { x: _adminMapPan.x, y: _adminMapPan.y },
      };
      dragging = false;
      return;
    }
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    stage.classList.add('is-panning');
  });

  stage.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pointerPos(e));
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      _adminMapPan = { x: pinch.pan.x, y: pinch.pan.y };
      _adminMapZoom = pinch.zoom;
      admMapZoomAt(svg, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.zoom * (dist / pinch.dist));
      return;
    }
    if (!dragging || !last) return;
    const rect = svg.getBoundingClientRect();
    _adminMapPan.x += (e.clientX - last.x) / (rect.width || 1) * ADM_MAP_VB.w;
    _adminMapPan.y += (e.clientY - last.y) / (rect.height || 1) * ADM_MAP_VB.h;
    last = { x: e.clientX, y: e.clientY };
    admMapClampPan();
    admMapApplyView();
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      dragging = false;
      last = null;
      stage.classList.remove('is-panning');
    }
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('lostpointercapture', endPointer);
}

function renderAdminMap(users) {
  const svg = $('adm-map-svg');
  const map = window.LarisAdminMap;
  // Admin-only bundle, no longer in the eager <script> list. Fetch it once and
  // re-enter; every visitor used to pay for this on first load.
  if (!map) {
    if (svg && typeof larisLoadScript === 'function' && !_admMapLoading) {
      _admMapLoading = true;
      larisLoadScript('/js/admin-map.js?v=20260812a')
        .then(() => { _admMapLoading = false; renderAdminMap(users); },
              () => { _admMapLoading = false; });
    }
    return;
  }
  if (!svg) return;
  const cutoff = _adminMapRange === '30' ? Date.now() - 30 * 864e5 : 0;
  const counts = {};
  (users || []).forEach(u => {
    if (cutoff && (!u.created_at || new Date(u.created_at).getTime() < cutoff)) return;
    const raw = (u.region || u.city || '').trim();
    if (!raw) return;
    const canon = map.canonical(raw) || raw;
    counts[canon] = (counts[canon] || 0) + 1;
  });
  const pinned = Object.entries(counts)
    .map(([city, n]) => {
      const coords = map.CITY_COORDS[city];
      if (!coords) return null;
      const [x, y] = map.project(coords[0], coords[1]);
      return { city, n, x, y };
    })
    .filter(Boolean)
    .sort((a, b) => b.n - a.n);

  svg.setAttribute('viewBox', `0 0 ${ADM_MAP_VB.w} ${ADM_MAP_VB.h}`);

  const bubbles = pinned.map((p, i) => {
    const r = Math.max(7, Math.round(4 * Math.sqrt(p.n) + 4));
    const lw = Math.max(52, p.city.length * 5.2 + 22);
    const lx = p.x + r + 4 > ADM_MAP_VB.w - lw ? -(r + 4 + lw) : r + 4;
    const label = i < 8
      ? `<g>
          <rect x="${lx.toFixed(1)}" y="-9" width="${lw}" height="16" rx="4" fill="#fff" stroke="#E8E8E8"/>
          <text x="${(lx + 4).toFixed(1)}" y="2.5" font-size="9" font-weight="700" fill="#1A1A1A" font-family="Plus Jakarta Sans, system-ui, sans-serif">${esc(p.city)} ${p.n}</text>
        </g>`
      : '';
    return `<g class="adm-map-pin" data-x="${p.x.toFixed(1)}" data-y="${p.y.toFixed(1)}">
      <circle cx="0" cy="0" r="${r}" fill="${admMapFill(p.n)}" fill-opacity=".85" stroke="#B5202A" stroke-width="1">
        <title>${esc(p.city)}: ${p.n} pendaftar</title>
      </circle>
      ${label}
    </g>`;
  }).join('');

  svg.innerHTML = `<g id="adm-map-world">
    <path d="${map.OUTLINE}" fill="#EEF2F6" stroke="#D1D5DB" stroke-width="1" vector-effect="non-scaling-stroke"/>
    ${bubbles}
  </g>`;
  admMapApplyView();
}

function adminFilteredUsers() {
  const q = ($('adm-users-search')?.value || '').trim().toLowerCase();
  const tipe = $('adm-filter-tipe')?.value || 'all';
  const cat = $('adm-filter-cat')?.value || '';
  return (_adminUsers || []).filter(u => {
    if (tipe !== 'all' && admSellerStatus(u) !== tipe) return false;
    if (cat && !(u.categories || []).includes(cat)) return false;
    if (!q) return true;
    const hay = [u.display_name, u.email, u.region, u.city].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function admPagerPages(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  return [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
}

function renderAdminPager(filteredLen) {
  const info = $('adm-pager-info');
  const btns = $('adm-pager-btns');
  const pages = Math.max(1, Math.ceil(filteredLen / _adminPageSize));
  if (_adminUserPage > pages) _adminUserPage = pages;
  const start = filteredLen ? (_adminUserPage - 1) * _adminPageSize + 1 : 0;
  const end = Math.min(filteredLen, _adminUserPage * _adminPageSize);
  if (info) info.textContent = `Menampilkan ${start}–${end} dari ${filteredLen} pengguna`;
  if (!btns) return;
  const nums = admPagerPages(_adminUserPage, pages);
  let html = '';
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) html += '<span class="adm-page" style="pointer-events:none">…</span>';
    html += `<button type="button" class="adm-page${n === _adminUserPage ? ' active' : ''}" data-adm-page="${n}">${n}</button>`;
  });
  btns.innerHTML = html;
}

function renderAdminUsers() {
  const body = $('admin-users-body');
  if (!body) return;
  const rows = adminFilteredUsers();
  renderAdminPager(rows.length);
  const start = (_adminUserPage - 1) * _adminPageSize;
  const slice = rows.slice(start, start + _adminPageSize);
  if (!slice.length) {
    body.innerHTML = '<tr><td colspan="7" class="dd-sub">Tidak ada pengguna yang cocok.</td></tr>';
    return;
  }
  body.innerHTML = slice.map((u, i) => {
    const name = u.display_name || u.email || 'User';
    const loc = u.region || u.city || '—';
    const status = admSellerStatus(u);
    const tipe = status === 'first_time'
      ? '<span class="adm-pill baru">Baru</span>'
      : status === 'existing'
        ? '<span class="adm-pill experienced">Experienced</span>'
        : '<span class="adm-pill unknown">—</span>';
    const cats = (u.categories || []).slice(0, 2).map(c => {
      const color = admCatColor(c);
      return `<span class="adm-cat-pill" style="background:${color}22;color:${color}">${esc(c)}</span>`;
    }).join('') || '<span class="dd-sub">—</span>';
    const idx = start + i;
    return `<tr>
      <td><div class="adm-name"><span class="adm-av" style="background:${admAvColor(name)}">${esc(admInitials(name))}</span>${esc(name)}</div></td>
      <td class="adm-email">${esc(u.email || '')}</td>
      <td>${esc(loc)}</td>
      <td>${tipe}</td>
      <td><div class="adm-cat-pills">${cats}</div></td>
      <td class="dd-sub">${fmtAdminDate(u.created_at)}</td>
      <td class="adm-td-aksi">
        <button type="button" class="adm-dots" data-adm-menu="${idx}" aria-label="Aksi">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>
        </button>
        <div class="adm-menu" hidden>
          <button type="button" data-sample-idx="${idx}">Sample view</button>
          <button type="button" data-copy-email="${esc(u.email || '')}">Salin email</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function admFillCatFilter(users) {
  const sel = $('adm-filter-cat');
  if (!sel) return;
  const prev = sel.value;
  const cats = admCategoryCounts(users).map(([n]) => n);
  sel.innerHTML = '<option value="">Semua kategori</option>' +
    cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (cats.includes(prev)) sel.value = prev;
}

function adminExportUsers() {
  const rows = adminFilteredUsers();
  const header = ['Nama', 'Email', 'Lokasi', 'Tipe', 'Kategori', 'Bergabung'];
  const lines = [header.join(',')].concat(rows.map(u => {
    const tipe = admSellerStatus(u) === 'existing' ? 'Experienced' : admSellerStatus(u) === 'first_time' ? 'Baru' : '';
    const cells = [
      u.display_name || '',
      u.email || '',
      u.region || u.city || '',
      tipe,
      (u.categories || []).join('; '),
      u.created_at ? String(u.created_at).slice(0, 10) : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    return cells.join(',');
  }));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'laris-pengguna.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function adminCloseMenus(except) {
  document.querySelectorAll('#view-admin .adm-menu').forEach(el => {
    if (el !== except) el.hidden = true;
  });
}

function adminBindUi() {
  if (_adminUiBound) return;
  _adminUiBound = true;
  const root = $('view-admin');
  if (!root) return;
  $('adm-users-search')?.addEventListener('input', () => { _adminUserPage = 1; renderAdminUsers(); });
  $('adm-filter-tipe')?.addEventListener('change', () => { _adminUserPage = 1; renderAdminUsers(); });
  $('adm-filter-cat')?.addEventListener('change', () => { _adminUserPage = 1; renderAdminUsers(); });
  $('adm-users-filter-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const pop = $('adm-users-filter-pop');
    if (pop) pop.hidden = !pop.hidden;
  });
  $('adm-users-export')?.addEventListener('click', () => adminExportUsers());
  $('adm-page-size')?.addEventListener('change', e => {
    _adminPageSize = Number(e.target.value) || 10;
    _adminUserPage = 1;
    renderAdminUsers();
  });
  $('adm-map-range')?.addEventListener('change', e => {
    _adminMapRange = e.target.value === '30' ? '30' : 'all';
    renderAdminMap(_adminUsers);
  });
  admBindMapPanZoom();
  $('adm-cat-more')?.addEventListener('click', () => {
    _adminCatsExpanded = !_adminCatsExpanded;
    void renderAdminCategories(_adminUsers);
  });
  $('adm-pager-btns')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-adm-page]');
    if (!btn) return;
    _adminUserPage = Number(btn.getAttribute('data-adm-page')) || 1;
    renderAdminUsers();
  });
  root.addEventListener('click', e => {
    const dots = e.target.closest('[data-adm-menu]');
    if (dots) {
      e.stopPropagation();
      const menu = dots.parentElement?.querySelector('.adm-menu');
      const open = menu && menu.hidden;
      adminCloseMenus(menu);
      if (menu) menu.hidden = !open;
      return;
    }
    const sample = e.target.closest('[data-sample-idx]');
    if (sample) {
      const idx = Number(sample.getAttribute('data-sample-idx'));
      const row = adminFilteredUsers()[idx];
      if (row) adminSampleAsUser(row);
      return;
    }
    const copy = e.target.closest('[data-copy-email]');
    if (copy) {
      const email = copy.getAttribute('data-copy-email') || '';
      if (email && navigator.clipboard) {
        navigator.clipboard.writeText(email).then(() => showToast('Email disalin.')).catch(() => {});
      }
      adminCloseMenus();
    }
  });
  document.addEventListener('click', e => {
    if (!root.contains(e.target)) {
      adminCloseMenus();
      const pop = $('adm-users-filter-pop');
      if (pop) pop.hidden = true;
      return;
    }
    if (!e.target.closest('.adm-td-aksi')) adminCloseMenus();
    if (!e.target.closest('.adm-filter-wrap')) {
      const pop = $('adm-users-filter-pop');
      if (pop) pop.hidden = true;
    }
  });
}

async function loadAdminDirectory() {
  adminBindUi();
  if (!isPlatformAdmin() || !_supabase) {
    const body = $('admin-users-body');
    if (body) body.innerHTML = '<tr><td colspan="7" class="dd-sub">Login sebagai admin dulu.</td></tr>';
    return;
  }
  const body = $('admin-users-body');
  if (body) body.innerHTML = '<tr><td colspan="7" class="dd-sub">Memuat…</td></tr>';
  // rpc() returns a thenable builder, not a Promise — wrap so .catch works.
  const wrap = (p) => Promise.resolve(p).catch(e => ({ data: null, error: e }));
  try {
    const dirRes = await wrap(_supabase.rpc('admin_user_directory'));
    if (dirRes.error) throw dirRes.error;
    _adminUsers = Array.isArray(dirRes.data) ? dirRes.data : [];
    _adminUserPage = 1;
    renderAdminMap(_adminUsers);
    admFillCatFilter(_adminUsers);
    renderAdminUsers();
    renderAdminKpis(_adminUsers);
    void renderAdminCategories(_adminUsers);
    const [statsRes, kpiRes] = await Promise.all([
      wrap(_supabase.rpc('admin_stats')),
      wrap(_supabase.rpc('admin_dashboard_kpis')),
    ]);
    _adminStats = (!statsRes.error && statsRes.data) ? statsRes.data : null;
    _adminKpis = (!kpiRes.error && kpiRes.data) ? kpiRes.data : null;
    renderAdminKpis(_adminUsers);
    renderAdminTrend();
  } catch (e) {
    if (body) body.innerHTML = `<tr><td colspan="7" class="dd-sub">${esc(e.message || 'Gagal memuat.')}</td></tr>`;
  }
}

let _admMapLoading = false;
let _admWinbackLoading = false;

function gptMountWinback() {
  try {
    const el = $('adm-winback-card');
    if (!el) return;
    // Same story as admin-map: fetched on demand rather than by every visitor.
    if (!window.WinbackAdmin) {
      if (typeof larisLoadScript === 'function' && !_admWinbackLoading) {
        _admWinbackLoading = true;
        larisLoadScript('/js/winback-admin.js?v=20260808a')
          .then(() => { _admWinbackLoading = false; gptMountWinback(); },
                () => { _admWinbackLoading = false; });
      }
      return;
    }
    window.WinbackAdmin.mount(el, {
      supabase: _supabase,
      isAdmin: isPlatformAdmin,
      supaUrl: SUPA_URL,
      // B keeps its own session (_authLoad/_authSave, laris_auth_v1) rather
      // than the Supabase SDK's default key, which initSupabase() deletes on
      // boot — see the matching comment in js/winback-admin.js.
      getToken: () => _authLoad()?.access_token || null,
    });
  } catch (_) {}
}

function openAdminView() {
  if (!isPlatformAdmin()) {
    showToast('Admin only.');
    return;
  }
  setView('admin');
  void loadAdminDirectory();
  gptMountWinback();
  try { if (window.LarisCohort) void window.LarisCohort.renderOps(); } catch (_) {}
  void fillAdminCohortPreview();
}

/** Fill the dashboard's cohort picker. Hidden when the account leads no cohort,
 *  so a non-cohort admin does not get a dead control. */
async function fillAdminCohortPreview() {
  const wrap = $('adm-cohort-preview');
  const sel = $('adm-cohort-preview-select');
  if (!wrap || !sel) return;
  let list = [];
  try {
    mountLarisCohort();
    list = (window.LarisCohort && await window.LarisCohort.listCohorts()) || [];
  } catch (_) { list = []; }
  wrap.style.display = list.length ? '' : 'none';
  const keep = sel.value;
  sel.innerHTML = list.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  if (keep && list.some(c => c.id === keep)) sel.value = keep;
}

/** Jump from the dashboard into the cohort view already in student preview. */
async function openAdminCohortPreview() {
  if (!isPlatformAdmin()) return;
  const sel = $('adm-cohort-preview-select');
  const cid = sel && sel.value;
  if (!cid) { showToast('Belum ada kohort untuk dipratinjau.'); return; }
  mountLarisCohort();
  setView('cohort');
  try {
    await window.LarisCohort.previewAs(cid);
  } catch (e) {
    showToast((e && e.message) || 'Gagal membuka pratinjau.');
  }
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
  $('wa-capture-save')?.addEventListener('click', () => void submitWaCapture());
  $('wa-capture-later')?.addEventListener('click', skipWaCapture);
  $('wa-capture')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) skipWaCapture();
  });
  $('wa-capture-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void submitWaCapture(); }
  });

  $('product-rows-notice-go')?.addEventListener('click', () => {
    closeProductRowsNotice('go_directory');
    setView('directory');
  });
  $('product-rows-notice-close')?.addEventListener('click', () => {
    closeProductRowsNotice('close');
  });
  $('product-rows-notice')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeProductRowsNotice('backdrop');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('product-rows-notice')?.classList.contains('open')) {
      closeProductRowsNotice('esc');
      return;
    }
    if ($('steven-dd-video')?.classList.contains('open')) {
      if (_sddvEnded) sddvClose('esc');
    }
  });

  $('sddv-close')?.addEventListener('click', () => sddvClose('close'));
  $('sddv-unmute')?.addEventListener('click', () => {
    const video = $('sddv-video');
    if (!video) return;
    video.muted = false;
    sddvSetMutedUi(false);
    if (video.paused && !_sddvEnded) video.play().catch(() => {});
  });
  $('steven-dd-video')?.addEventListener('click', (e) => {
    if (e.target !== e.currentTarget) return;
    if (_sddvEnded) sddvClose('backdrop');
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
    if (e.key !== 'Escape') return;
    if (!$('dd-chart-lightbox')?.hidden) { e.preventDefault(); closeDistChartLightbox(); return; }
    if (!$('img-lightbox')?.hidden) { e.preventDefault(); closeLightbox(); }
  });
  wireDistChartLightbox();
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
  $('chat-search-input')?.addEventListener('input', () => renderChatList());
  $('chat-search-input')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeChatSearch(); }
  });
  $('chat-search-clear')?.addEventListener('click', () => closeChatSearch());
  $('btn-ask-laris')?.addEventListener('click', () => { openAskLaris(); });

  // ── Landing page (marketing, view-landing) CTA wiring — bound once here
  // since the buttons are static markup, not re-rendered per view switch.
  const hlGoToAskLaris = () => {
    openAskLaris();
    setTimeout(() => $('hero-input')?.focus(), 200);
  };
  document.querySelectorAll('[data-hl-start]').forEach(btn => {
    btn.addEventListener('click', () => {
      void logUserEvent('gpt_landing_cta_click', { ui: 'gpt', cta: 'start' });
      clarityEvt('gpt_landing_cta_click', { cta: 'start' });
      hlGoToAskLaris();
    });
  });
  document.querySelectorAll('[data-hl-howto]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('.hl-steps-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // ── Founder video lightbox (landing). The square on .hlfv-stage is only the
  // poster image; the 6 MB clip is attached on first open so it never costs a
  // landing page load. Native controls stay on — unlike the Deep Dive gate
  // (sddv*), this watch is voluntary and scrubbable.
  const HLFV_SRC = '/images/onboarding/steven-deepdive.mp4';
  const hlfvOpen = () => {
    const overlay = $('hl-founder-video');
    const video = $('hlfv-video');
    if (!overlay || !video) return;
    if (!video.getAttribute('src')) {
      video.src = HLFV_SRC;
      video.preload = 'auto';
    }
    overlay.classList.add('open');
    // Opened by a real click, so sound is allowed; fall back to muted if the
    // browser refuses anyway.
    video.muted = false;
    const played = video.play();
    if (played && typeof played.then === 'function') {
      played.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
    void logUserEvent('gpt_landing_founder_video', { ui: 'gpt', action: 'open' });
    clarityEvt('gpt_landing_founder_video', { action: 'open' });
  };
  const hlfvClose = () => {
    const overlay = $('hl-founder-video');
    if (!overlay?.classList.contains('open')) return;
    overlay.classList.remove('open');
    const video = $('hlfv-video');
    if (video) {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
    }
  };
  document.querySelectorAll('[data-hl-founder-video]').forEach(btn => {
    btn.addEventListener('click', hlfvOpen);
  });
  $('hlfv-close')?.addEventListener('click', hlfvClose);
  $('hl-founder-video')?.addEventListener('click', e => {
    if (e.target.id === 'hl-founder-video') hlfvClose();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') hlfvClose();
  });
  document.querySelectorAll('[data-hl-social]').forEach(el => {
    el.addEventListener('click', () => {
      const platform = el.getAttribute('data-hl-social');
      void logUserEvent('gpt_landing_social_click', { ui: 'gpt', platform });
      clarityEvt('gpt_landing_social_click', { platform });
    });
  });
  document.querySelectorAll('[data-hl-card]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.getAttribute('data-hl-card');
      void logUserEvent('gpt_landing_card_click', { ui: 'gpt', card });
      clarityEvt('gpt_landing_card_click', { card });
      if (card === 'produk') { $('btn-produk')?.click(); return; }
      if (card === 'tracker') { $('btn-tracker')?.click(); return; }
      if (card === 'supplier') { $('btn-supplier')?.click(); return; }
      hlGoToAskLaris(); // 'kompetitor' has no dedicated view yet — send them into Ask Laris
    });
  });

  $('btn-produk')?.addEventListener('click', () => {
    state.comparePick = null;
    state.compareReturnChatId = null;
    updateDirCompareBanner();
    // Leaving another view (or Deep Dive via the tab) → default home.
    // Deep Dive's back arrow skips this and keeps the prior browse state.
    resetDirectoryToHome();
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
  $('btn-cohort')?.addEventListener('click', () => { openCohortView(); });
  $('btn-community')?.addEventListener('click', () => { openCommunityBoard(); });
  $('btn-harga')?.addEventListener('click', () => setView('harga'));
  $('btn-faq')?.addEventListener('click', () => setView('faq'));
  $('btn-tentang')?.addEventListener('click', goHome);
  // The Beta badge was decoration; it now opens the changelog on both the
  // desktop sidebar and the mobile topbar.
  document.querySelectorAll('.brand-beta').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openChangelog(); });
  });
  $('changelog-close')?.addEventListener('click', () => closeChangelog());
  $('changelog-modal')?.addEventListener('click', e => { if (e.target.id === 'changelog-modal') closeChangelog(); });
  $('btn-admin')?.addEventListener('click', () => openAdminView());
  function openMentorRail(tab) {
    mountLarisCohort();
    if (state.view !== 'cohort') setView('cohort');
    else closeSidebar();
    window.LarisCohort?.mentorTab(tab);
  }
  $('btn-mentor-dash')?.addEventListener('click', () => openMentorRail('overview'));
  $('btn-mentor-siswa')?.addEventListener('click', () => openMentorRail('students'));
  $('btn-mentor-jadwal')?.addEventListener('click', () => openMentorRail('jadwal'));
  $('adm-cohort-preview-go')?.addEventListener('click', () => void openAdminCohortPreview());
  $('admin-sample-new')?.addEventListener('click', () => adminSampleNewUser());
  $('admin-sample-exit')?.addEventListener('click', () => adminExitSample());
  $('sample-strip-exit')?.addEventListener('click', () => {
    if (_viewAs) void exitViewAs();
    else adminExitSample();
  });
  $('btn-viewas')?.addEventListener('click', (e) => { e.stopPropagation(); toggleViewAsMenu(); });
  document.querySelectorAll('#viewas-pop .viewas-opt').forEach((b) => {
    b.addEventListener('click', () => void enterViewAs(b.dataset.role));
  });
  // A menu that only closes on its own trigger is a menu users get stuck in.
  document.addEventListener('click', (e) => {
    if (!$('viewas')?.contains(e.target)) closeViewAsMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewAsMenu(); });
  $('btn-login')?.addEventListener('click', () => openAuthModal('login', 'gpt_header_login'));
  $('btn-signup')?.addEventListener('click', () => openAuthModal('signup', 'gpt_header_signup'));
  $('harga-daftar-cta')?.addEventListener('click', (e) => {
    e.preventDefault();
    openAuthModal('signup', 'harga_cta');
  });
  $('btn-user')?.addEventListener('click', () => {
    if (!currentUser) return;
    if (window.GptProfile) {
      openUserProfile(currentUser.id);
    } else if (confirm('Keluar dari akun?')) {
      void signOut();
    }
  });
  $('auth-close')?.addEventListener('click', closeAuthModal);
  $('auth-overlay')?.addEventListener('click', e => { if (e.target === $('auth-overlay')) closeAuthModal(); });
  $('auth-submit-btn')?.addEventListener('click', () => void submitAuth());
  $('recovery-submit-btn')?.addEventListener('click', () => void submitRecoveryPassword());
  $('auth-google-btn')?.addEventListener('click', () => void signInWithProvider('google'));
  $('wa-send-btn')?.addEventListener('click', () => void sendWhatsappOtp());
  $('wa-verify-btn')?.addEventListener('click', () => void verifyWhatsappOtp());
  $('wa-resend-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (e.currentTarget.classList.contains('is-wait')) return;
    void sendWhatsappOtp(true);
  });
  $('wa-phone-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void sendWhatsappOtp(); }
  });
  $('wa-otp-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void verifyWhatsappOtp(); }
  });
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

  // Glance toward whichever composer the user is actually in.
  if (MASCOT_ALIVE) {
    [heroInput, $('composer-input')].forEach(input => {
      if (!input) return;
      const look = () => { try { window.LarisMascot?.typing(input); } catch (_) {} };
      input.addEventListener('focus', look);
      input.addEventListener('input', look);
      input.addEventListener('blur', () => {
        try { window.LarisMascot?.idle(); } catch (_) {}
      });
    });
  }

  $('home-prompts')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-home-prompt]');
    if (!btn) return;
    submitFromHome(btn.dataset.homePrompt);
  });

  $('btn-set-lokasi')?.addEventListener('click', () => {
    closeSidebar();
    openPrefsDrawer('sidebar');
  });

  wirePrefsDrawer();
  wireCalcPanel();
  wireUsagePill();
  wireResultsBar();

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
  // Merdeka decorations — self-gates to August WIB, no-ops the rest of the year.
  try { window.LarisMerdeka?.mount({ site: 'b', navSelector: '.main-top' }); } catch (_) {}
  // The A/B ended 2026-08-10 and this used to self-stamp arm B here. New
  // visitors now carry no _lid_ab_v1 at all, which is what keeps post-merge
  // rows distinguishable from experiment-era ones — do not reintroduce a
  // default arm anywhere.

  wireUi();
  resumePantauNavPulse();
  initLandingAiDemo();
  document.getElementById('gpt-limit-close')?.addEventListener('click', gptLimitClose);
  document.getElementById('gpt-limit-feedback')?.addEventListener('click', gptOpenFeedbackForBonus);
  document.getElementById('faq-feedback-cta')?.addEventListener('click', gptOpenFeedback);
  document.getElementById('msg-steven-fab')?.addEventListener('click', gptOpenFeedback);
  document.getElementById('gpt-limit-ext')?.addEventListener('click', gptLimitClose);
  document.getElementById('gpt-fb-submit')?.addEventListener('click', () => { void gptSubmitFeedback(); });
  document.getElementById('gpt-fb-close')?.addEventListener('click', gptFeedbackClose);
  _lidInitScrollDepth();
  updateAccountUI();
  renderGptUsage();

  if (typeof ensureSupabase === 'function') await ensureSupabase();
  await initSupabase();
  // Keep the promise: routeCohortHome needs the answer, and calling
  // refreshCohortNav a second time would just re-run the membership query.
  try { mountLarisCohort(); _bootCohortNav = refreshCohortNav(); } catch (_) {}
  // Fire-and-forget: warms the Produk page's instant-open assortment so it's
  // usually ready before the user ever clicks Produk (see warmDirInstantPool).
  void warmDirInstantPool();
  const idle = window.larisIdle || ((fn) => setTimeout(fn, 800));
  idle(preloadGarudaLoaders, 1500);
  // Recovery links must be claimed before consumeOAuthHash() clears the stash.
  try { handleRecoveryHash(); } catch (_) {}
  try { await consumeOAuthHash(); } catch (_) {}
  void refreshGptUsage();

  // Landing is the default surface; onboarding never auto-starts.
  // Don't overwrite a deep dive that _authOnSignIn just resumed.
  const pendingResume = !!(state.pendingDeepdive || state.pendingCompare || state.pendingTracker);
  const alreadyDeepdive = state.view === 'deepdive' && !!state.deepdiveProduct;
  if (!_offerActive && !pendingResume && !alreadyDeepdive) {
    if (state.activeChatId && activeChat()) {
      setView('chat');
      renderChatThread();
    } else {
      renderHome();
      // Only an untouched default landing may be replaced by the cohort home.
      _bootLandingView = state.view;
    }
  }
  renderChatList();
  renderSidebarLocCard();
  void routeCohortHome();
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
/** Last rows shown in the panel — includes generated search fallbacks. */
let _supRenderedRows = [];

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

/**
 * Honest discovery links when no curated shop matches the keyword.
 * Labeled as searches — not verified MOQ/price suppliers.
 */
function _supSearchFallbacks(keyword) {
  const raw = String(keyword == null ? '' : keyword).trim();
  if (!raw) return [];
  const q = encodeURIComponent(raw);
  const qGrosir = encodeURIComponent(raw + ' grosir');
  const qWeb = encodeURIComponent(raw + ' grosir supplier OR pabrik OR wholesale');
  return [
    {
      id: 'sup_search_alibaba',
      name: 'Alibaba — cari wholesale',
      tier: 'import',
      published: true,
      platform: 'alibaba',
      generated: true,
      logo: '/images/suppliers/alibaba.svg',
      url: `https://indonesian.alibaba.com/trade/search?fsb=y&IndexArea=product_en&SearchText=${q}`,
      city: 'Impor (China)',
      badges: ['Impor', 'Wholesale', 'Pencarian'],
      keywords: [raw],
    },
    {
      id: 'sup_search_shopee_grosir',
      name: 'Shopee — cari grosir',
      tier: 'grosir',
      published: true,
      platform: 'shopee',
      generated: true,
      logo: '/images/suppliers/shopee.svg',
      url: `https://shopee.co.id/search?keyword=${qGrosir}`,
      city: 'Indonesia',
      badges: ['Grosir', 'Pencarian'],
      keywords: [raw],
    },
    {
      id: 'sup_search_web_wholesale',
      name: 'Cari supplier grosir di web',
      tier: 'grosir',
      published: true,
      platform: 'web',
      generated: true,
      logo: '/images/suppliers/google.svg',
      url: `https://www.google.com/search?q=${qWeb}`,
      badges: ['Cari', 'Wholesale'],
      keywords: [raw],
    },
  ];
}

function _supLookup(id) {
  return _supRenderedRows.find(x => x.id === id)
    || (_supData?.suppliers || []).find(x => x.id === id)
    || null;
}

/** True when we can show curated shops and/or search fallbacks. */
function supplierRelevantFor(keyword, category) {
  if (_supNorm(keyword)) return true;
  if (_supNorm(category)) return true;
  return false;
}

/**
 * Match order: exact curated keyword -> search fallbacks -> category curated
 * -> category search -> browse-all. Never dump unrelated curated shops.
 */
function _supSelect() {
  const all = (_supData?.suppliers || []).filter(s => s.published);
  const kwRaw = String(_supFilterKeyword == null ? '' : _supFilterKeyword).trim();
  const kw = _supNorm(kwRaw);
  const catRaw = String(_supFilterCategory == null ? '' : _supFilterCategory).trim();
  const cat = _supNorm(catRaw);

  if (kw) {
    const hit = all.filter(s => (s.keywords || []).some(k => _supNorm(k) === kw));
    if (hit.length) return { rows: hit, mode: 'keyword' };
    return { rows: _supSearchFallbacks(kwRaw), mode: 'search' };
  }
  if (cat) {
    const catRows = all.filter(s =>
      (s.categories || []).some(c => _supNorm(c) === cat));
    if (catRows.length) return { rows: catRows, mode: 'category' };
    return { rows: _supSearchFallbacks(catRaw), mode: 'search' };
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
  return imgThumb(url);
}

/**
 * Real shop logo when we have one; otherwise an initials tile. `onerror` drops
 * the img so a dead CDN link never leaves a broken frame. Local brand tiles
 * under /images/suppliers/ use the same cover layout as Shopee portraits.
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
  const cta = s.generated ? 'Buka pencarian' : 'Buka toko';
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
         data-sup-id="${esc(s.id)}" data-sup-target="shop">${cta}</a>
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
    const req = e.target?.closest?.('[data-sup-req]');
    if (req) {
      const r = req.getAttribute('data-sup-req');
      if (r === 'tutup') { supRequestAnswer('tutup'); }
      else supRequestAnswer(r);   // 'ya' | 'tidak'
      return;
    }
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
  _supRenderedRows = rows.slice();

  if (!rows.length) {
    setSideContext('');
    body.innerHTML = `<p class="side-empty">Belum ada supplier untuk filter ini.</p>`;
    return;
  }

  const ctxLabel = (mode === 'keyword' || mode === 'search')
    ? (_supFilterKeyword || _supFilterCategory || '')
    : (mode === 'category' ? (_supFilterCategory || pilotLabel) : pilotLabel);
  setSideContext(ctxLabel);
  let lead;
  if (mode === 'keyword') {
    lead = `Supplier untuk “${esc(_supFilterKeyword)}”.`;
  } else if (mode === 'search') {
    const q = esc(_supFilterKeyword || _supFilterCategory || '');
    lead = `Belum ada toko terkurasi — ini pencarian grosir / wholesale untuk “${q}”.`;
  } else if (mode === 'category') {
    lead = `Toko terkurasi untuk ${esc(_supFilterCategory || pilotLabel)}.`;
  } else {
    lead = `Toko grosir &amp; konveksi terkurasi.`;
  }

  const sorted = rows.slice().sort((a, b) => {
    const t = _supTierRank(a.tier) - _supTierRank(b.tier);
    return t || (b.sold || 0) - (a.sold || 0);
  });
  const capped = (_supSource === 'deepdive' && !_supShowAll)
    ? sorted.slice(0, SUPPLIER_DEEPDIVE_LIMIT) : sorted;
  _supRenderedRows = sorted.slice();

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
  const s = _supLookup(id);
  _supLog('supplier_link_click', {
    supplier_id: id, supplier_name: s?.name || null, tier: s?.tier || null,
    generated: !!s?.generated,
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

/* ── "No supplier here — want us to find one?" ──────────────────────────────
   The demand probe for categories we have not onboarded suppliers into. Each
   answer is logged separately: `ya` is intent, `tidak` is a real no, and
   `tutup` is a dismiss — folding dismiss into no would overstate rejection and
   send us away from a category people actually want. */
let _supReqCtx = null;

function supAskRequest(product) {
  const kw = product?.keyword || null;
  const cat = product?.category || product?.category_canonical || null;
  _supReqCtx = { keyword: kw, category: cat, item_id: product?.item_id ?? null };
  _supLog('supplier_request_prompt', { keyword: kw, category: cat });
  // The supplier click delegation is normally installed by fillSupplierContent,
  // which never runs on this path — there is no supplier panel to fill. Without
  // this the modal's buttons would be inert.
  _supWireDelegation();
  const modal = $('sup-request-modal');
  if (!modal) { showToast('Belum ada supplier untuk kategori ini'); return; }
  // Never stack on top of another dialog (the anon signup gate can already be
  // showing). Degrade to a toast rather than burying the other modal.
  const other = document.querySelector('.modal-overlay.open');
  if (other && other !== modal) {
    showToast('Belum ada supplier untuk kategori ini');
    return;
  }
  const catEl = $('sup-req-cat');
  if (catEl) catEl.textContent = cat || 'ini';
  modal.classList.add('open');
}

function supRequestAnswer(answer) {
  _supLog('supplier_request_response', {
    answer,
    keyword: _supReqCtx?.keyword || null,
    category: _supReqCtx?.category || null,
    item_id: _supReqCtx?.item_id ?? null,
    logged_in: !!currentUser,
  });
  if (answer === 'ya') {
    showToast(currentUser
      ? 'Siap — kami kabari lewat email kalau suppliernya sudah ada.'
      : 'Siap, dicatat. Masuk dulu supaya kami bisa mengabari kamu.');
  }
  supCloseRequest();
}

function supCloseRequest() {
  _supReqCtx = null;
  $('sup-request-modal')?.classList.remove('open');
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
