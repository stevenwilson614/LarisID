/* LARISgpt — chat-first A/B variant B. Standalone; does not load laris-app.js. */
(function () {
'use strict';

// ── Clarity ──────────────────────────────────────────────────────────────
function _clarity() {
  const w = window;
  if (!w.clarity) w.clarity = function () { (w.clarity.q = w.clarity.q || []).push(arguments); };
  try { w.clarity.apply(w, arguments); } catch (_) {}
}

const _LID_SIGNUP_EVT_KEY = '_lid_signup_evt';
const _LID_OAUTH_SIGNUP_INTENT_KEY = '_lid_oauth_signup_intent';
const _LID_SIGNUP_CTA_KEY = '_lid_signup_cta_source';
const _LID_SIGNUP_DONE_KEY = '_lid_signup_done_v1';
const GPT_STATE_KEY = '_lid_gpt_state_v1';
const ANON_LIMIT_KEY = '_lid_gpt_anon_searches_v1';
const PAGE_SIZE = 60;
const COMPOSER_EXAMPLES = [
  'Cari produk kayu buat dijual dari Semarang',
  'Tunjukkan 3 produk yang cocok buat aku jual',
  'Produk apa yang lagi naik daun?',
  'Tanya tentang produk… atau ketik pencarian baru',
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
    try {
      const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
      if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) abVariant = ab.v;
    } catch (_) {}
    localStorage.setItem(KEY, JSON.stringify({
      referrer: ref || '(direct)',
      utm_source: q.get('utm_source') || '',
      utm_medium: q.get('utm_medium') || '',
      utm_campaign: q.get('utm_campaign') || '',
      ref_code: q.get('ref') || '',
      landing: location.pathname + location.search,
      ab_variant: abVariant,
      ts: new Date().toISOString(),
    }));
  } catch (_) {}
})();

async function larisEnsureChart() {
  if (typeof Chart !== 'undefined') return;
  if (typeof ensureChartJs === 'function') await ensureChartJs();
}

// ── Supabase ─────────────────────────────────────────────────────────────
const SUPA_URL = 'https://bzmvlraziqevqdyotvgy.supabase.co';
const SUPA_KEY = 'sb_publishable_KDSWIJJLckser1e1hk7bbA_yMChRPog';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bXZscmF6aXFldnFkeW90dmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDU1MjUsImV4cCI6MjA4OTk4MTUyNX0.nppVtaxoT4z4slUOTvZo5stmP26bb5qoJXkswHVw9EE';

const _AUTH_SK = 'laris_auth_v1';
let _supabase = null;
let currentUser = null;
let _authMode = 'signup';
let _gateSource = '';
let _dd = null; // current deep dive: { product, peers, niche, stats, history, series }

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
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
  } catch (_) {}
}

function clarityEvt(name, props) {
  try {
    _clarity('event', name);
    if (props) Object.keys(props).forEach(k => _clarity('set', k, String(props[k]).slice(0, 120)));
  } catch (_) {}
}

// ── Wire SVG icons (no emojis, ever) ─────────────────────────────────────
const ICONS = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-2.5-1.4-4.6-3-6.5-.6 1.2-1.4 2-2.5 2.5C13.9 9 13 5.5 9.5 2c.3 3-.5 4.6-2 6.5C6 10.4 5 12.3 5 15.5 5 19.2 7.6 22 12 22z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M8 21h8M6 7l-3 6a3.5 3.5 0 0 0 6 0L6 7zM18 7l-3 6a3.5 3.5 0 0 0 6 0l-3-6zM4 7h16"/></svg>',
  calc: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01"/></svg>',
  truck: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
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
};
function ico(name, size = 16) {
  const svg = ICONS[name] || ICONS.spark;
  return svg.replace('<svg ', `<svg width="${size}" height="${size}" stroke="currentColor" `);
}

// ── Composer chip sets ───────────────────────────────────────────────────
const HOME_CHIPS = [
  { id: 'trending', label: 'Produk Trending', icon: 'flame', prompt: 'Produk apa yang lagi trending minggu ini?' },
  { id: 'bandingkan', label: 'Bandingkan Produk', icon: 'scale', prompt: 'Bandingkan 2 produk' },
  { id: 'profit', label: 'Hitung Profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
  { id: 'supplier', label: 'Cari Supplier', icon: 'truck', prompt: 'Cari supplier termurah' },
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
  { id: 'supplier', label: 'Cari supplier termurah', icon: 'truck', prompt: 'Cari supplier termurah' },
  { id: 'launch', label: 'Buat rencana launch', icon: 'spark', prompt: 'Buat rencana launch untuk produk ini' },
  { id: 'profit', label: 'Estimasi profit', icon: 'calc', prompt: 'Hitung estimasi profit' },
  { id: 'konten', label: 'Ide konten produk', icon: 'bulb', prompt: 'Kasih ide konten untuk produk ini' },
];

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
const NU_ONB_LOCATIONS = [
  'Jakarta', 'Bekasi', 'Depok', 'Tangerang', 'Bogor', 'Bandung',
  'Semarang', 'Yogyakarta', 'Surabaya', 'Sidoarjo', 'Medan',
  'Makassar', 'Palembang', 'Denpasar',
];

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
  },
  chats: [], // { id, title, context, messages[], localId? }
  activeChatId: null,
  recommendations: [],
  deepdiveProduct: null,
  pendingDeepdive: null, // product clicked behind the login gate; opened after sign-in

  dirPage: 1,
  dirCat: null,
  dirCity: '',   // ephemeral directory filter (not persisted)
  dirSort: 'terlaris',
  dirRows: [],
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
  } catch (_) {}
}
function saveLocalState() {
  try {
    localStorage.setItem(GPT_STATE_KEY, JSON.stringify({
      onboarding: state.onboarding,
      chats: state.chats,
      activeChatId: state.activeChatId,
      pendingDeepdive: state.pendingDeepdive || null,
      ts: Date.now(),
    }));
  } catch (_) {}
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

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('show'), 4200);
}

// ── Anon daily search soft-limit ─────────────────────────────────────────
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
  return o.count;
}
function anonLimitHit() {
  return getAnonSearches().count >= 3;
}

// ── Views / UI shell ─────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setView(name) {
  const leaving = state.view;
  state.view = name;
  ['home', 'chat', 'deepdive', 'directory', 'harga', 'admin'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
    document.body.classList.toggle(`view-${v}`, v === name);
  });
  if (leaving === 'deepdive' && name !== 'deepdive') {
    destroyAllCharts();
    // A product is only "in context" while its deep dive (or its chat) is
    // open — a stale deepdiveProduct must not hijack later searches into
    // the product-AI path.
    state.deepdiveProduct = null;
  }
  if (name === 'home' || name === 'directory' || name === 'harga' || name === 'admin') setComposerChips(null);
  ['btn-produk', 'btn-harga', 'btn-admin'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('active',
      (id === 'btn-produk' && name === 'directory') ||
      (id === 'btn-harga' && name === 'harga') ||
      (id === 'btn-admin' && name === 'admin'));
  });
  closeSidebar();
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
  renderChatList();
  renderAdminSampleBanner();
}

function renderChatList() {
  const list = $('chat-list');
  if (!list) return;
  const chats = state.chats.slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  if (!chats.length) {
    list.innerHTML = '<div class="chat-empty">Belum ada pencarian</div>';
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
      gpt_gate_deepdive: 'Login untuk membuka Deep Dive produk.',
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
  btn.disabled = true;
  try {
    if (_authMode === 'signup') {
      const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ email, password: pass, data: { full_name: name } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error_code || d.error || d.code) { showErr(d.msg || d.error_description || d.error || 'Daftar gagal.'); return; }
      if (Array.isArray(d.identities) && d.identities.length === 0) { showErr('Email sudah terdaftar. Coba login.'); return; }
      _lidFireSignupSuccess();
      if (d.access_token) { _authSave(d); closeAuthModal(); await _authOnSignIn(d); return; }
      showErr('Cek email kamu untuk konfirmasi akun!');
      errEl.style.color = 'var(--hijau, #1E6B3C)';
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
        if (ab && (ab.v === 'A' || ab.v === 'B' || ab.v === 'X')) attr.ab_variant = ab.v;
        else if (!attr.ab_variant) attr.ab_variant = 'B';
      } catch (_) {
        if (!attr.ab_variant) attr.ab_variant = 'B';
      }
      if (!attr.landing) attr.landing = '/gpt/';
      try { localStorage.setItem('_lid_attr_v1', JSON.stringify(attr)); } catch (_) {}
      const src = attr.utm_source || (attr.ref_code && 'referral') || attr.referrer || '(direct)';
      _clarity('set', 'signup_source', String(src).slice(0, 120));
      _clarity('set', 'ab_variant_at_signup', String(attr.ab_variant || 'B'));
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
      _supabase.from('user_sessions').insert({ user_id: currentUser.id, is_new_user: isNewUser }).then(() => {});
    }
  } catch (_) {}

  _clearSessionRestoring();
  updateAccountUI();
  await loadCurrentAccess();
  await persistOnboardingPrefs();
  await migrateLocalChatsToDb();
  saveLocalState();

  renderSidebarLocCard();

  // Continue where the login gate interrupted: open the product they clicked.
  const hadPending = !!state.pendingDeepdive;
  if (state.pendingDeepdive) {
    const p = state.pendingDeepdive;
    state.pendingDeepdive = null;
    saveLocalState();
    void openDeepDive(p);
  }

  // One-time, skippable post-sign-in onboarding offer (decided with Steven:
  // location/kategori now live AFTER sign-in). Never interrupts a pending
  // deep dive; the "Set lokasi" sidebar card remains the anytime entry.
  if (!hadPending && state.onboarding.step !== 'done' && !state.onboarding.promptedPostSignin) {
    state.onboarding.promptedPostSignin = true;
    saveLocalState();
    offerOnboardingAfterSignin();
  }
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
  try {
    await _supabase.from('user_onboarding_prefs').upsert({
      user_id: currentUser.id,
      region: o.city || null,
      categories: o.categories || [],
      seller_status: o.experience || null,
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
      if (data && data.allowed === false) break;
      if (data?.chat?.id) {
        chat.id = data.chat.id;
        delete chat.localId;
        for (const m of (chat.messages || [])) {
          await _supabase.from('gpt_messages').insert({
            chat_id: chat.id,
            role: m.role,
            content: typeof m.content === 'object' ? m.content : { text: m.content },
          });
        }
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

function scrollChatToBottom() {
  const panel = $('panel');
  if (!panel) return;
  requestAnimationFrame(() => {
    panel.scrollTop = panel.scrollHeight;
  });
}

function appendBubble(role, html, opts = {}) {
  const thread = $('chat-thread');
  if (!thread) return null;
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `<div class="msg-role">${role === 'user' ? 'Kamu' : 'LARISgpt'}</div><div class="msg-bubble">${html}</div>`;
  thread.appendChild(div);
  if (!opts.skipScroll) scrollChatToBottom();
  return div;
}

function renderChatThread() {
  const thread = $('chat-thread');
  if (!thread) return;
  thread.innerHTML = '';
  const chat = activeChat();
  if (chat?.messages?.length) {
    for (const m of chat.messages) {
      if (m.role === 'user') appendBubble('user', `<p>${esc(m.content?.text || m.content || '')}</p>`, { skipScroll: true });
      else if (m.html) appendBubble('assistant', m.html, { skipScroll: true });
      else appendBubble('assistant', `<p>${esc(m.content?.text || m.content || '')}</p>`, { skipScroll: true });
    }
    // Re-bind cards
    bindProductCards(thread);
    bindTrendingCards(thread);
    updateThreadWide();
    scrollChatToBottom();
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

function renderHome() {
  _offerActive = false;
  setView('home');
  state.activeChatId = null;
  saveLocalState();
  renderChatList();

  const chipsWrap = $('home-chips');
  if (chipsWrap && !chipsWrap.dataset.ready) {
    chipsWrap.dataset.ready = '1';
    chipsWrap.innerHTML = HOME_CHIPS.map(c =>
      `<button type="button" class="chip" data-hchip="${esc(c.id)}" data-prompt="${esc(c.prompt)}"><span class="chip-ico">${ico(c.icon, 15)}</span>${esc(c.label)}</button>`
    ).join('');
    chipsWrap.querySelectorAll('[data-hchip]').forEach(btn => {
      btn.addEventListener('click', () => {
        void logUserEvent('gpt_chip_click', { ui: 'gpt', chip: btn.getAttribute('data-hchip'), surface: 'home' });
        clarityEvt('gpt_chip_click', { chip: btn.getAttribute('data-hchip') });
        submitFromHome(btn.getAttribute('data-prompt'));
      });
    });
  }

  const grid = $('prompt-grid');
  if (grid && !grid.dataset.ready) {
    grid.dataset.ready = '1';
    grid.innerHTML = HOME_PROMPT_CARDS.map(c => `
      <button type="button" class="prompt-card" data-prompt="${esc(c.q)}">
        <span class="pc-ico">${ico(c.icon, 26)}</span>
        <span class="t">${esc(c.t)}</span>
        <span class="d">${esc(c.d)}</span>
        <span class="prompt-quote">“${esc(c.q)}”</span>
      </button>`).join('');
    grid.querySelectorAll('.prompt-card').forEach(btn => {
      btn.addEventListener('click', () => {
        void logUserEvent('gpt_chip_click', { ui: 'gpt', chip: 'prompt_card', surface: 'home' });
        clarityEvt('gpt_chip_click', { chip: 'prompt_card' });
        submitFromHome(btn.getAttribute('data-prompt'));
      });
    });
  }

  if (!renderHome._seen) {
    renderHome._seen = true;
    void logUserEvent('gpt_landing_view', { ui: 'gpt' });
    clarityEvt('gpt_landing_view', {});
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

function startOnboarding(source) {
  _offerActive = false;
  const o = state.onboarding;
  if (o.step === 'idle' || o.step === 'done') o.step = 'city';
  saveLocalState();
  setView('chat');
  state.activeChatId = null;
  renderChatList();
  clarityEvt('gpt_onboarding_start', { source: source || '' });
  renderOnboardingStep();
}

function offerOnboardingAfterSignin() {
  _offerActive = true;
  setView('chat');
  state.activeChatId = null;
  renderChatList();
  const thread = $('chat-thread');
  if (thread) thread.innerHTML = '';
  updateThreadWide();
  appendBubble('assistant', `
    <p>Mau atur <strong>lokasi &amp; kategori</strong> dulu biar rekomendasinya lebih pas? Bisa dilewati kok.</p>
    <button type="button" class="btn-primary" id="onb-offer-yes">Atur sekarang</button>
    <button type="button" class="btn-ghost" id="onb-offer-later" style="margin-left:8px">Nanti saja</button>`);
  $('onb-offer-yes')?.addEventListener('click', () => startOnboarding('post_signin'));
  $('onb-offer-later')?.addEventListener('click', () => renderHome());
}

function pushMessage(chat, role, content, html) {
  if (!chat.messages) chat.messages = [];
  chat.messages.push({ role, content: typeof content === 'object' ? content : { text: content }, html, ts: Date.now() });
  saveLocalState();
  if (currentUser && chat.id && _supabase) {
    void _supabase.from('gpt_messages').insert({
      chat_id: chat.id,
      role,
      content: typeof content === 'object' ? content : { text: content },
    });
  }
}

function renderOnboardingStep() {
  const o = state.onboarding;
  const thread = $('chat-thread');
  if (!thread) return;
  thread.innerHTML = '';

  if (o.step === 'city') {
    appendBubble('assistant', `
      <p>Hai! Aku bantu kamu riset produk buat jualan di Shopee, Tokopedia, atau TikTok Shop — gratis, dari data Shopee asli, bukan tebakan AI.</p>
      <p><strong>Kamu jualan dari kota mana?</strong></p>
      <input class="city-search" id="city-search" type="search" placeholder="Cari kota…" value="${esc(state.cityFilter)}">
      <div class="chips" id="city-chips"></div>
    `, { skipScroll: true });
    renderCityChips();
    $('city-search')?.addEventListener('input', e => {
      state.cityFilter = e.target.value;
      renderCityChips();
    });
  } else if (o.step === 'category') {
    appendBubble('assistant', `
      <p>Oke, <strong>${esc(o.city)}</strong>.</p>
      <p><strong>Produk apa yang mau kamu jual?</strong> (pilih kategori, boleh 1–3)</p>
      <div class="chips" id="cat-chips"></div>
      <input class="city-search" id="onb-free" type="text" placeholder="Atau ketik spesifik — misal: produk kayu, perlengkapan mancing…" value="${esc(o.freeText || '')}" style="margin-top:14px;max-width:100%">
      <button type="button" class="btn-primary" id="cat-next" ${o.categories.length || (o.freeText || '').trim() ? '' : 'disabled'}>Lanjut</button>
    `, { skipScroll: true });
    renderCatChips();
    $('onb-free')?.addEventListener('input', e => {
      o.freeText = e.target.value;
      const next = $('cat-next');
      if (next) next.disabled = !(o.categories.length || o.freeText.trim());
    });
    $('cat-next')?.addEventListener('click', () => {
      o.freeText = ($('onb-free')?.value || '').trim();
      if (!o.categories.length && !o.freeText) return;
      o.step = 'experience';
      saveLocalState();
      renderOnboardingStep();
    });
  } else if (o.step === 'experience') {
    // Fork: straight to results, or one optional detail screen ('notes').
    appendBubble('assistant', `
      <p><strong>Mau langsung lihat hasil, atau tambah sedikit info biar rekomendasinya makin pas?</strong></p>
      <button type="button" class="btn-primary" id="onb-results-now">Langsung lihat hasil</button>
      <button type="button" class="btn-ghost" id="onb-more-info">Tambah info biar makin pas</button>
    `, { skipScroll: true });
    $('onb-results-now')?.addEventListener('click', () => { void finishOnboarding(); });
    $('onb-more-info')?.addEventListener('click', () => {
      o.step = 'notes';
      saveLocalState();
      renderOnboardingStep();
    });
  } else if (o.step === 'notes') {
    // Combined optional screen: experience → (pairing + current category) → notes.
    appendBubble('assistant', `
      <p><strong>Kamu penjual baru atau sudah berpengalaman?</strong></p>
      <div class="chips" id="exp-chips">
        <button type="button" class="chip${o.experience === 'first_time' ? ' selected' : ''}" data-exp="first_time">Penjual baru</button>
        <button type="button" class="chip${o.experience === 'existing' ? ' selected' : ''}" data-exp="existing">Sudah berpengalaman</button>
      </div>
      <div id="onb-pairing-wrap" style="display:${o.experience === 'existing' ? '' : 'none'}">
        <p style="margin-top:14px"><strong>Mau produk yang cocok dipasangkan dengan produk kamu sekarang, atau coba yang benar-benar baru?</strong></p>
        <div class="chips" id="pair-chips">
          <button type="button" class="chip${o.pairingMode === 'pairing' ? ' selected' : ''}" data-pair="pairing">Pasangkan dengan yang sekarang</button>
          <button type="button" class="chip${o.pairingMode === 'new' ? ' selected' : ''}" data-pair="new">Coba yang benar-benar baru</button>
        </div>
        <div id="onb-paircat-wrap" style="display:${o.pairingMode === 'pairing' ? '' : 'none'}">
          <p style="margin-top:14px"><strong>Produk kamu sekarang di kategori mana?</strong></p>
          <div class="chips" id="pair-cat-chips"></div>
        </div>
      </div>
      <p style="margin-top:14px"><strong>Ada info lain tentang kamu?</strong> (opsional)</p>
      <textarea class="free-text" id="onb-notes" placeholder="Misal: modal kecil, kirim dari kos, mau dropship…">${esc(o.notes)}</textarea>
      <button type="button" class="btn-primary" id="onb-finish">Lihat rekomendasi</button>
    `, { skipScroll: true });
    const pairingWrap = $('onb-pairing-wrap');
    const paircatWrap = $('onb-paircat-wrap');
    const renderPairCats = () => {
      const wrap = $('pair-cat-chips');
      if (!wrap || wrap.dataset.ready) return;
      wrap.dataset.ready = '1';
      wrap.innerHTML = NU_ONB_CATS.map(c => {
        const slug = CAT_SLUG[c];
        const sel = o.pairingCategory === c ? ' selected' : '';
        return `<button type="button" class="chip cat${sel}" data-pcat="${esc(c)}"><img src="/images/onboarding/categories/${slug}.png" alt="" width="28" height="28">${esc(c)}</button>`;
      }).join('');
      wrap.querySelectorAll('[data-pcat]').forEach(btn => {
        btn.addEventListener('click', () => {
          o.pairingCategory = btn.getAttribute('data-pcat');
          wrap.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
          saveLocalState();
        });
      });
    };
    if (o.pairingMode === 'pairing') renderPairCats();
    thread.querySelectorAll('#exp-chips [data-exp]').forEach(btn => {
      btn.addEventListener('click', () => {
        o.experience = btn.getAttribute('data-exp');
        $('exp-chips').querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
        if (pairingWrap) pairingWrap.style.display = o.experience === 'existing' ? '' : 'none';
        saveLocalState();
      });
    });
    thread.querySelectorAll('#pair-chips [data-pair]').forEach(btn => {
      btn.addEventListener('click', () => {
        o.pairingMode = btn.getAttribute('data-pair');
        $('pair-chips').querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
        if (paircatWrap) paircatWrap.style.display = o.pairingMode === 'pairing' ? '' : 'none';
        if (o.pairingMode === 'pairing') renderPairCats();
        saveLocalState();
      });
    });
    $('onb-finish')?.addEventListener('click', () => {
      o.notes = ($('onb-notes')?.value || '').trim();
      void finishOnboarding();
    });
  }
  // Onboarding is optional now — every step can bail back to the landing.
  const lastBubble = thread.querySelector('.msg:last-child .msg-bubble');
  if (lastBubble && !lastBubble.querySelector('#onb-skip')) {
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn-ghost';
    skip.id = 'onb-skip';
    skip.style.marginLeft = '8px';
    skip.textContent = 'Lewati';
    lastBubble.appendChild(skip);
    skip.addEventListener('click', () => {
      state.onboarding.step = 'idle';
      saveLocalState();
      clarityEvt('gpt_onboarding_skip', {});
      renderHome();
    });
  }
  const panel = $('panel');
  if (panel) scrollChatToBottom();
}

function renderCityChips() {
  const wrap = $('city-chips');
  if (!wrap) return;
  const q = (state.cityFilter || '').toLowerCase();
  const locs = NU_ONB_LOCATIONS.filter(l => !q || l.toLowerCase().includes(q));
  wrap.innerHTML = locs.map(l => `<button type="button" class="chip" data-city="${esc(l)}">${esc(l)}</button>`).join('');
  wrap.querySelectorAll('[data-city]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.onboarding.city = btn.getAttribute('data-city');
      state.onboarding.step = 'category';
      saveLocalState();
      renderOnboardingStep();
    });
  });
}

function renderCatChips() {
  const wrap = $('cat-chips');
  if (!wrap) return;
  const selected = new Set(state.onboarding.categories);
  wrap.innerHTML = NU_ONB_CATS.map(c => {
    const slug = CAT_SLUG[c];
    const sel = selected.has(c) ? ' selected' : '';
    return `<button type="button" class="chip cat${sel}" data-cat="${esc(c)}"><img src="/images/onboarding/categories/${slug}.png" alt="" width="28" height="28">${esc(c)}</button>`;
  }).join('');
  wrap.querySelectorAll('[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.getAttribute('data-cat');
      const arr = state.onboarding.categories;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
      else if (arr.length < 3) arr.push(c);
      saveLocalState();
      renderCatChips();
      const next = $('cat-next');
      if (next) next.disabled = !arr.length;
    });
  });
}

async function finishOnboarding() {
  state.onboarding.step = 'done';
  state.onboarding.completedAnon = !currentUser;
  saveLocalState();
  renderSidebarLocCard();
  await persistOnboardingPrefs();
  void logUserEvent('onboarding_complete', { ui: 'gpt', region: state.onboarding.city, categories: state.onboarding.categories, seller_status: state.onboarding.experience, free_text: (state.onboarding.freeText || '').slice(0, 80) });
  clarityEvt('onboarding_complete', { ui: 'gpt' });
  await startRecommendationChat(true);
}

// ── Recommendations (city + category first) ──────────────────────────────
// Exact Shopee location strings (same clusters as A’s YLK) so `.in('location', …)` hits.
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

function asListingProduct(r) {
  return {
    ...r,
    sold_per_day: Number(r.sold_per_day) > 0
      ? Number(r.sold_per_day)
      : Math.max(0.1, (Number(r.total_sold) || 0) / 90),
    age_days: r.age_days != null ? r.age_days : 90,
  };
}

async function fetchListingsCityCat(locations, cats, limit = 80) {
  if (!_supabase || !locations.length) return [];
  try {
    let q = _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url')
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
  return `<tr>
    <td class="tr-rank">${i + 1}</td>
    <td><div class="tr-prod">${r.image_url ? `<img src="${esc(r.image_url)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div><div class="tr-prod-name">${esc((r.product_name || '').slice(0, 60))}</div><div class="tr-prod-cat">${esc(r.category || '')}</div></div></div></td>
    <td>${pctHtml(r._pct)}</td>
    <td><span class="pct-up">${ico('arrowUp', 11)} ${fmtSold(r._delta)}</span></td>
    <td>${fmtRp(r.price)}</td>
    <td><button type="button" class="btn-outline" data-titem="${esc(r.item_id)}|${esc(r.shop_id)}">Lihat Analisis</button></td>
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
  card.querySelectorAll('[data-titem]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const [item_id, shop_id] = btn.getAttribute('data-titem').split('|');
      const rows = await fetchTrending();
      const r = rows.find(x => String(x.item_id) === String(item_id) && String(x.shop_id) === String(shop_id));
      if (!r) return;
      void openDeepDive(asListingProduct({ ...r, sold_per_day: Math.max(0.1, (Number(r.delta_7d) || 0) / 7) }));
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
  if (/trending|naik daun|lagi (rame|ramai)|produk (yang )?(lagi )?naik|lagi naik/.test(lower)) return 'trending';
  if (/kompetisi rendah|persaingan rendah|belum banyak (penjual|saingan)|cari niche/.test(lower)) return 'lowcomp';
  if (/supplier|pemasok|grosir/.test(lower)) return 'supplier';
  if (/(hitung|estimasi|berapa).{0,24}(profit|untung|margin)|^profit\b/.test(lower)) return 'profit';
  if (/modal\s*(rp\.?\s*)?[\d]|modal (kecil|terbatas)/.test(lower)) return 'modal';
  if (/bandingkan|\bvs\b|dibanding/.test(lower)) return 'bandingkan';
  if (/rencana (jualan|launch)/.test(lower)) return 'rencana';
  return null;
}

// Same daily-limit rules as the search path: server RPC when signed in,
// anon localStorage bump otherwise.
async function ensureIntentChat(chat, title, context) {
  if (currentUser && _supabase && !chat.id) {
    const { data } = await _supabase.rpc('gpt_new_chat', { p_title: String(title).slice(0, 60), p_context: context });
    if (data?.allowed === false) return { ok: false, resetAt: data.reset_at };
    if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; }
  } else if (!currentUser) {
    bumpAnonSearch();
  }
  return { ok: true };
}

function limitReply(loading, resetAt) {
  const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(resetAt || wibMidnightReset())}.`;
  if (loading) loading.querySelector('.msg-bubble').innerHTML = `<p>${esc(msg)}</p>`;
  showToast(msg);
  clarityEvt('gpt_limit_hit', {});
  void logUserEvent('gpt_limit_hit', { ui: 'gpt' });
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
  void logUserEvent('gpt_intent', { ui: 'gpt', intent });
  clarityEvt('gpt_intent', { intent });

  if (intent === 'trending') return handleTrendingIntent(chat);
  if (intent === 'modal') return handleModalIntent(chat, text);
  if (intent === 'supplier') return handleSupplierIntent(chat, text);
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
  if (!rows.length) {
    const nd = mergePool([], await fetchNaikDaunGlobal(60)).slice(0, 3);
    state.recommendations = nd;
    html = nd.length
      ? `<p>Data tren mingguan belum tersedia — ini produk yang lagi naik daun dari data LarisID:</p><div class="card-grid">${nd.map((p, i) => productCardHtml(p, i)).join('')}</div>`
      : `<p>Data tren belum tersedia. Coba lagi nanti.</p>`;
  } else {
    const view = computeTrendingView(rows, '7d');
    html = `<p>Berikut produk yang sedang trending di Shopee berdasarkan peningkatan penjualan — dari data scrape LarisID, bukan tebakan AI.</p>${trendingCardHtml(view)}`;
  }
  loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: 'Produk trending', kind: 'trending' }, html);
  bindProductCards();
  bindTrendingCards();
  updateThreadWide();
  scrollChatToBottom();
  setComposerChips(TRENDING_CHIPS, 'trending');
  void logUserEvent('discover_view', { ui: 'gpt', kind: 'trending' });
  clarityEvt('gpt_trending_view', {});
}

async function handleModalIntent(chat, text) {
  const budget = parseBudget(text);
  if (!budget) {
    const html = `<p>Berapa modal kamu per unit? Contoh: <strong>“Cari produk modal 50rb”</strong> atau <strong>“produk modal 1jt”</strong>.</p>`;
    appendBubble('assistant', html);
    pushMessage(chat, 'assistant', { text: 'Tanya modal' }, html);
    return;
  }
  if (!(await ensureSearchAllowed())) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari produk laris di bawah ${fmtRp(budget)}…</p>`);
  let rows = [];
  try {
    const { data } = await _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url')
      .gte('price', 1000).lte('price', budget)
      .gt('total_sold', 100)
      .order('total_sold', { ascending: false })
      .limit(30);
    rows = (data || []).map(asListingProduct);
  } catch (_) {}
  const gate = await ensureIntentChat(chat, `Modal ${fmtRp(budget)}`, { kind: 'modal', budget });
  if (!gate.ok) { limitReply(loading, gate.resetAt); return; }
  const top = mergePool([], rows).slice(0, 3);
  state.recommendations = top;
  const html = top.length
    ? `<p>Produk laris dengan harga di bawah <strong>${fmtRp(budget)}</strong> — dari data Shopee LarisID:</p><div class="card-grid">${top.map((p, i) => productCardHtml(p, i)).join('')}</div>`
    : `<p>Belum ketemu produk laris di bawah ${fmtRp(budget)}. Coba angka lain.</p>`;
  loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: 'Hasil modal', budget }, html);
  bindProductCards();
  scrollChatToBottom();
}

async function handleSupplierIntent(chat, text) {
  const product = state.deepdiveProduct || activeChat()?.context?.product;
  let term = product?.keyword || '';
  if (!term) {
    term = _searchTerms(String(text).toLowerCase().replace(/supplier|pemasok|grosir|termurah|murah/g, ' ')).join(' ');
  }
  if (!term) {
    const html = `<p>Supplier untuk produk apa? Contoh: <strong>“Cari supplier vas keramik”</strong>.</p>`;
    appendBubble('assistant', html);
    pushMessage(chat, 'assistant', { text: 'Tanya supplier' }, html);
    return;
  }
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari supplier di data…</p>`);
  let rows = [];
  try {
    const { data } = await _supabase.from('mv_supplier_leaderboard')
      .select('keyword,store_name,location,hero_sold,catalog_items,rnk')
      .ilike('keyword', `%${term.slice(0, 40)}%`)
      .order('hero_sold', { ascending: false })
      .limit(8);
    rows = data || [];
  } catch (_) {}
  const html = rows.length
    ? `<p>Toko dengan penjualan terbesar untuk “<strong>${esc(term)}</strong>” — kandidat supplier/benchmark dari data Shopee:</p>
       <div class="ans-panel" style="margin-top:12px"><div class="ans-table-wrap"><table class="tr-table">
       <thead><tr><th>#</th><th>Toko</th><th>Lokasi</th><th>Produk hero terjual</th><th>Katalog</th></tr></thead>
       <tbody>${rows.map((s, i) => `<tr><td class="tr-rank">${i + 1}</td><td><strong>${esc(s.store_name || '')}</strong></td><td>${esc(s.location || '—')}</td><td>${fmtSold(s.hero_sold)}</td><td>${s.catalog_items ?? '—'}</td></tr>`).join('')}</tbody>
       </table></div></div>`
    : `<p>Belum ada data leaderboard untuk “${esc(term)}”. Coba kata kunci lain.</p>`;
  loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: 'Supplier', term }, html);
  scrollChatToBottom();
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
  loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: 'Niche kompetisi rendah', kind: 'lowcomp' }, html);
  loading.querySelectorAll('[data-kwsearch]').forEach(btn => {
    btn.addEventListener('click', () => void handleComposerSubmit(`Cari produk ${btn.getAttribute('data-kwsearch')}`));
  });
  scrollChatToBottom();
}

const MARKETPLACE_FEE = 0.08; // asumsi biaya marketplace, dilabel di UI

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
  <p class="dd-sub" style="margin-top:8px">Hitungan sederhana: harga jual − biaya marketplace (asumsi 8%) − modal. Ongkir/packing belum termasuk.</p>`;
}

async function handleProfitIntent(chat, text) {
  const product = state.deepdiveProduct || activeChat()?.context?.product;
  const nums = extractMoney(text).filter(n => n >= 500);
  let html;
  if (nums.length >= 2) {
    const [modal, jual] = nums[0] <= nums[1] ? [nums[0], nums[1]] : [nums[1], nums[0]];
    html = `<p>Estimasi profit per unit:</p>${profitTableHtml([{ modal, jual }])}`;
  } else if (product && Number(product.price) > 0) {
    const jual = Number(product.price);
    html = `<p>Skenario profit untuk <strong>${esc((product.product_name || '').slice(0, 48))}</strong> di harga jual ${fmtRp(jual)} — tiga asumsi modal (60/70/80% dari harga jual):</p>`
      + profitTableHtml([0.6, 0.7, 0.8].map(f => ({ modal: Math.round(jual * f), jual })));
  } else {
    html = `<p>Sebutkan modal dan harga jual per unit — contoh: <strong>“Hitung profit modal 20rb jual 35rb”</strong>. Atau buka salah satu produk dulu, nanti aku hitung dari harganya.</p>`;
  }
  appendBubble('assistant', html);
  pushMessage(chat, 'assistant', { text: 'Estimasi profit' }, html);
  scrollChatToBottom();
}

async function handleBandingkanIntent(chat, text) {
  const cleaned = String(text).toLowerCase().replace(/bandingkan|dibandingkan|dibanding|dengan produk|dengan/g, ' ');
  const parts = cleaned.split(/\bvs\.?\b|\bdan\b|,|\batau\b/).map(s => _searchTerms(s).join(' ')).filter(Boolean).slice(0, 2);
  if (parts.length < 2) {
    const html = `<p>Sebutkan dua produk yang mau dibandingkan — contoh: <strong>“Bandingkan tumbler vs botol minum”</strong>.</p>`;
    appendBubble('assistant', html);
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
  state.recommendations = mergePool([], [...(sa?.top || []), ...(sb?.top || [])]);
  const side = (label, s) => s
    ? `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4>
       <p class="dd-sub" style="margin:0 0 10px">${s.n} listing terpantau · median harga ${fmtRp(s.median)} · total ${fmtSold(s.sold)} terjual</p>
       <div class="card-grid">${s.top.map((p, i) => productCardHtml(p, i)).join('')}</div></div>`
    : `<div class="ans-panel" style="margin-top:12px"><h4>${esc(label)}</h4><p class="dd-sub">Tidak ketemu di data.</p></div>`;
  let verdict = '';
  if (sa && sb) {
    const win = sa.sold >= sb.sold ? parts[0] : parts[1];
    verdict = `<p style="margin-top:12px">Dari total penjualan yang terpantau, <strong>${esc(win)}</strong> lebih laris. Klik produk untuk analisis lengkap.</p>`;
  }
  const html = `<p>Perbandingan “<strong>${esc(parts[0])}</strong>” vs “<strong>${esc(parts[1])}</strong>” dari data Shopee LarisID:</p>${side(parts[0], sa)}${side(parts[1], sb)}${verdict}`;
  loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: 'Bandingkan', a: parts[0], b: parts[1] }, html);
  bindProductCards();
  scrollChatToBottom();
}

async function handleRencanaIntent(chat) {
  const html = `<p>Buka salah satu produk dulu (klik <strong>Lihat Analisis</strong>), lalu minta rencana jualan — aku susun dari data produknya.</p>`;
  appendBubble('assistant', html);
  pushMessage(chat, 'assistant', { text: 'Rencana perlu produk' }, html);
  scrollChatToBottom();
}

// ── Free-text search (composer + onboarding freeText bias) ──────────────
const SEARCH_STOPWORDS = new Set(['cari','carikan','tolong','coba','tunjukkan','tampilkan','produk','barang',
  'buat','untuk','dijual','jual','jualan','yang','dong','aku','saya','mau','bisa','lagi','dan','apa','the']);

function _searchTerms(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
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

async function searchListings(q, locations = [], limit = 30) {
  if (!_supabase) return [];
  // PostgREST .or() treats , ( ) % as syntax — strip them from user input.
  const clean = String(q || '').replace(/[,()%]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  try {
    let query = _supabase.from('listings_deduped')
      .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url')
      .or(`product_name.ilike.%${clean}%,keyword.ilike.%${clean}%`)
      .gt('total_sold', 0)
      .order('total_sold', { ascending: false })
      .limit(limit);
    if (locations.length) query = query.in('location', locations);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(asListingProduct);
  } catch (_) { return []; }
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

async function pickRecommendations() {
  const o = state.onboarding;
  const cats = (o.categories || []).slice();
  const locations = expandCityLocations(o.city);
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
  if (pool.length < 3 && cats.length) {
    const catOnly = await fetchNaikDaunByCat(cats, 120);
    mergePool(pool, catOnly);
    if (pool.length >= 3) tier = tier === 'empty' ? 'category' : tier;
  }

  // Tier 3: best sellers in city (any category) — still local competition signal
  if (pool.length < 3 && locations.length) {
    const cityOnly = await fetchListingsCityCat(locations, [], 80);
    mergePool(pool, cityOnly);
    if (cityOnly.length) tier = tier === 'empty' ? 'city' : tier;
  }

  // Tier 4: global rising fallback
  if (pool.length < 3) {
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
    if (out.length >= 3) break;
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

function estOmsetBulan(p) {
  const price = Number(p.price) || 0;
  const spd = Number(p.sold_per_day) || 0;
  if (price > 0 && spd > 0) return Math.round(price * spd * 30);
  return 0;
}

function productCardHtml(p, i) {
  const img = p.image_url || '';
  const name = p.product_name || p.keyword || 'Produk';
  const key = `${p.item_id}|${p.shop_id}`;
  const omset = estOmsetBulan(p);
  const loc = p.location ? `<div class="prod-card-loc">${esc(p.location)}</div>` : '';
  return `<button type="button" class="prod-card" data-prod="${esc(key)}" style="animation-delay:${i * 0.06}s">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<div class="prod-card-ph"></div>'}
    <div class="prod-card-body">
      <div class="prod-card-name">${esc(name)}</div>
      ${loc}
      <div class="prod-card-stats">
        <div class="prod-stat">
          <span class="prod-stat-lbl">Harga</span>
          <span class="prod-stat-val">${fmtRp(p.price)}</span>
        </div>
        <div class="prod-stat">
          <span class="prod-stat-lbl">Omset/bulan</span>
          <span class="prod-stat-val">${omset ? fmtOmset(omset) : '—'}</span>
        </div>
      </div>
    </div>
  </button>`;
}

function bindProductCards(root) {
  (root || document).querySelectorAll('[data-prod]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-prod');
      const [item_id, shop_id] = key.split('|');
      const pool = state.recommendations.concat(state.dirRows);
      const p = pool.find(x => String(x.item_id) === String(item_id) && String(x.shop_id) === String(shop_id));
      if (p) void openDeepDive(p);
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
    clarityEvt('gpt_limit_hit', { anon: 1 });
    void logUserEvent('gpt_limit_hit', { ui: 'gpt', anon: true });
    return false;
  }
  return true;
}

async function startRecommendationChat(fromOnboarding) {
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
    if (data && data.allowed === false) {
      const resetAt = data.reset_at || wibMidnightReset();
      showToast(`Batas harian tercapai — reset dalam ${formatCountdown(resetAt)}`);
      clarityEvt('gpt_limit_hit', {});
      void logUserEvent('gpt_limit_hit', { ui: 'gpt' });
      return;
    }
    chat = {
      id: data.chat.id,
      title: data.chat.title,
      context,
      messages: [],
      created_at: Date.now(),
    };
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

  const recs = await pickRecommendations();
  state.recommendations = recs;

  const cards = recs.length
    ? `<div class="card-grid">${recs.map((p, i) => productCardHtml(p, i)).join('')}</div>
       <button type="button" class="btn-ghost" id="btn-more-products">Tampilkan produk lain</button>`
    : `<p>Belum ketemu produk yang cocok. Coba Chat Baru atau buka <strong>Produk</strong> di sidebar.</p>`;

  const html = `<p>${frame}</p><p>Ini <strong>3 produk</strong> dari data LarisID buat kamu cek:</p>${cards}`;
  const thread2 = $('chat-thread');
  if (thread2) thread2.innerHTML = '';
  appendBubble('assistant', html);
  pushMessage(chat, 'assistant', { text: 'Rekomendasi 3 produk', products: recs.map(p => ({ item_id: p.item_id, shop_id: p.shop_id, keyword: p.keyword })) }, html);
  bindProductCards();
  $('btn-more-products')?.addEventListener('click', () => void startRecommendationChat(false));

  void logUserEvent('discover_view', { ui: 'gpt', count: recs.length });
  clarityEvt('discover_view', { ui: 'gpt' });
  clarityEvt('gpt_chat_new', {});
  void logUserEvent('gpt_chat_new', { ui: 'gpt' });
}

async function openChat(id) {
  state.activeChatId = id;
  saveLocalState();
  renderChatList();
  setView('chat');
  const chat = activeChat();
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
    } catch (_) {}
  }
  renderChatThread();
  if (chat?.context?.product) {
    // stay in chat; deepdive opened separately
  }
}

async function newChatFlow() {
  // Chat Baru = the landing: search, chips, and example prompts live there.
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

function ddSummaryText(stats, niche, scoreInfo) {
  const bits = [];
  if (scoreInfo.score >= 70) bits.push('Saya cukup optimis dengan niche ini.');
  else if (scoreInfo.score >= 45) bits.push('Niche ini masuk akal untuk dicoba, dengan catatan.');
  else bits.push('Niche ini berat untuk pemula — pertimbangkan matang-matang.');
  if (stats.n) bits.push(`Kompetisi ${stats.komp.toLowerCase()}: top 3 toko menguasai ${Math.round(stats.top3Share * 100)}% penjualan di keyword ini.`);
  if (niche?.breakout_rate != null && (niche.new_items || 0) >= 15) bits.push(`${Math.round(niche.breakout_rate)}% produk baru di niche ini tembus 100+ terjual.`);
  return bits.join(' ');
}

// Weekly market series from real scrape snapshots: per item, the sold delta
// between consecutive snapshots is spread as a daily rate onto the Monday-
// anchored weeks it overlaps. No synthetic curves — thin data shows a note.
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
    for (let i = 1; i < rows.length; i++) {
      const t0 = Date.parse(rows[i - 1].scraped_at), t1 = Date.parse(rows[i].scraped_at);
      const d = (Number(rows[i].total_sold) || 0) - (Number(rows[i - 1].total_sold) || 0);
      if (!(t1 > t0) || d <= 0) continue;
      maxT = Math.max(maxT, t1);
      const price = Number(rows[i].price) || 0;
      const rate = d / (t1 - t0);
      let cur = weekOf(t0);
      while (cur < t1) {
        const overlap = Math.min(t1, cur + weekMs) - Math.max(t0, cur);
        if (overlap > 0) {
          const w = weeks.get(cur) || { units: 0, omset: 0, items: new Set() };
          const u = rate * overlap;
          w.units += u;
          w.omset += u * price;
          w.items.add(String(rows[i].item_id));
          weeks.set(cur, w);
        }
        cur += weekMs;
      }
    }
  }
  let out = [...weeks.entries()].sort((a, b) => a[0] - b[0])
    .map(([ts, w]) => ({ ts, units: Math.round(w.units), omset: Math.round(w.omset), items: w.items.size }));
  // Trailing week with <3.5 days of observation undercounts — drop it.
  if (out.length && maxT - out[out.length - 1].ts < 3.5 * 864e5) out = out.slice(0, -1);
  return out;
}

function ddShareData(peers) {
  const byShop = new Map();
  for (const p of peers) {
    const k = String(p.shop_id);
    const omzet = (Number(p.total_sold) || 0) * (Number(p.price) || 0);
    const cur = byShop.get(k) || { name: p.store_name || 'Toko', img: p.image_url || '', omzet: 0, sold: 0, sample: p };
    cur.omzet += omzet;
    cur.sold += Number(p.total_sold) || 0;
    if (!cur.img && p.image_url) cur.img = p.image_url;
    byShop.set(k, cur);
  }
  const shops = [...byShop.values()].sort((a, b) => b.omzet - a.omzet);
  const seg = (from, to) => shops.slice(from, to).reduce((s, x) => s + x.omzet, 0);
  const total = seg(0, shops.length) || 1;
  shops.forEach(s => { s.share = Math.round(s.omzet / total * 100); });
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

function ddTilesHtml(product, stats, peers, series) {
  const omset = estOmsetBulan(product);
  const unitMo = Math.round((Number(product.sold_per_day) || 0) * 30);
  const price = Number(product.price) || 0;
  const vsMed = stats.median ? Math.round((price - stats.median) / stats.median * 100) : null;
  const locCount = new Map();
  peers.forEach(p => { const l = (p.location || '').trim(); if (l) locCount.set(l, (locCount.get(l) || 0) + 1); });
  const topLoc = [...locCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const shopN = new Set(peers.map(p => String(p.shop_id))).size;
  // Market momentum from the real weekly series (last 2 complete weeks).
  let delta = null;
  if (series && series.length >= 2) {
    const a = series[series.length - 1], b = series[series.length - 2];
    if (b && b.units > 0) delta = Math.round((a.units - b.units) / b.units * 100);
  }
  const deltaHtml = delta == null
    ? '<div class="sub">Estimasi dari kecepatan jual</div>'
    : `<span class="tile-delta ${delta >= 0 ? 'up' : 'down'}">${ico('arrowUp', 10)} ${delta >= 0 ? '+' : ''}${delta}% pasar vs minggu sebelumnya</span>`;
  return `<div class="ddr-tiles">
    <div class="ddr-tile"><span class="ico" style="background:var(--green-bg);color:var(--green)">${ico('trendUp', 14)}</span><div class="lbl">Est. Omzet / Bulan</div><div class="val">${omset ? fmtRpShort(omset) : '—'}</div>${deltaHtml}</div>
    <div class="ddr-tile"><span class="ico" style="background:var(--blue-bg);color:var(--blue)">${ico('box', 14)}</span><div class="lbl">Est. Penjualan / Bulan</div><div class="val">${unitMo ? unitMo.toLocaleString('id-ID') + ' unit' : '—'}</div><div class="sub">Dari kecepatan jual terpantau</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--amber-bg);color:var(--amber)">${ico('tag', 14)}</span><div class="lbl">Harga Produk</div><div class="val">${fmtRp(price)}</div><div class="sub">${vsMed == null ? 'Median pasar belum ada' : vsMed === 0 ? 'Sama dengan median pasar' : `${Math.abs(vsMed)}% ${vsMed > 0 ? 'di atas' : 'di bawah'} median pasar`}</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--violet-bg);color:var(--violet)">${ico('pin', 14)}</span><div class="lbl">Lokasi Terbanyak</div><div class="val">${topLoc ? esc(topLoc[0]) : '—'}</div><div class="sub">${topLoc ? `${topLoc[1]} penjual dari kota ini` : 'Belum ada data lokasi'}</div></div>
    <div class="ddr-tile"><span class="ico" style="background:var(--red-bg);color:var(--accent)">${ico('users', 14)}</span><div class="lbl">Kompetitor Aktif</div><div class="val">~${shopN} toko</div><div class="sub">Kompetisi ${esc(stats.komp || '—')}</div></div>
  </div>`;
}

function ddWhyHtml(product, stats, niche) {
  const items = [];
  items.push(stats.n >= 8
    ? `Permintaan terpantau di ${stats.n} listing keyword ini — total ${fmtSold(stats.totalSold)} terjual.`
    : `Baru ${stats.n} listing terpantau di keyword ini — data masih tipis, hati-hati baca angkanya.`);
  items.push(stats.top3Share <= 0.35
    ? `Pasar tidak didominasi satu toko — top 3 hanya menguasai ${Math.round(stats.top3Share * 100)}% penjualan.`
    : stats.top3Share <= 0.6
      ? `Top 3 toko menguasai ${Math.round(stats.top3Share * 100)}% penjualan — masih ada ruang untuk bersaing.`
      : `Top 3 toko menguasai ${Math.round(stats.top3Share * 100)}% penjualan — dominasi tinggi, masuk lebih sulit.`);
  if (niche?.breakout_rate != null && (niche.new_items || 0) >= 15) {
    items.push(`${Math.round(niche.breakout_rate)}% produk baru di niche ini berhasil tembus 100+ terjual.`);
  }
  const wall = calcReviewWall(Number(product.reviews) || 0, niche);
  items.push(`Dinding ulasan ±${wall.wall.toLocaleString('id-ID')} — target ulasan minimum supaya masuk radar pembeli.`);
  if (stats.n >= 4) {
    const inZone = Number(product.price) >= stats.p25 && Number(product.price) <= stats.p75;
    items.push(`Rentang harga sehat ${fmtRp(stats.p25)} – ${fmtRp(stats.p75)}; produk ini ${inZone ? 'ada di dalam' : 'di luar'} zona itu.`);
  }
  return `<ul class="check-list">${items.map(s => `<li>${ico('check', 15)}<span>${esc(s)}</span></li>`).join('')}</ul>`;
}

function ddKompetitorTableHtml(share) {
  if (!share.shops.length) return '<p class="dd-sub">Kompetitor belum tersedia untuk keyword ini.</p>';
  const rows = share.shops.slice(0, 15).map((s, i) => {
    const omsetMo = Math.round(s.sold / 6) * Math.round(s.omzet / Math.max(1, s.sold)); // ≈ sold/6 × avg price
    return `<tr${i >= 5 ? ' data-komp-extra hidden' : ''}>
      <td class="tr-rank">${i + 1}</td>
      <td><div class="tr-prod" style="min-width:140px"><span class="comp-av">${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy">` : esc((s.name || 'T').charAt(0).toUpperCase())}</span><div class="tr-prod-name">${esc((s.name || 'Toko').slice(0, 28))}</div></div></td>
      <td>${omsetMo ? fmtRpShort(omsetMo) : '—'}</td>
      <td>${s.share}%</td>
      <td><button type="button" class="btn-outline" data-kshop="${esc(String(s.sample.item_id))}|${esc(String(s.sample.shop_id))}">Lihat</button></td>
    </tr>`;
  }).join('');
  return `<div class="ddr-table-wrap"><table class="ddr-table">
    <thead><tr><th>#</th><th>Toko</th><th>Omzet / Bln (est.)</th><th>Market Share</th><th>Aksi</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${share.shops.length > 5 ? `<button type="button" class="ans-cta" id="ddr-komp-more">Lihat Semua ${Math.min(15, share.shops.length)} Kompetitor</button>` : ''}`;
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
    ctx.fillText('Total omzet', cx, cy - 9);
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

async function openDeepDive(product) {
  if (!currentUser) {
    // Remember the clicked product (survives the OAuth reload) so signup lands
    // the user on the deep dive they asked for, not back at the start.
    state.pendingDeepdive = product;
    saveLocalState();
    openAuthModal('signup', 'gpt_gate_deepdive');
    return;
  }
  if (state.pendingDeepdive) { state.pendingDeepdive = null; saveLocalState(); }
  state.deepdiveProduct = product;
  setView('deepdive');
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = `<p class="dd-sub">Memuat data Deep Dive…</p>`;

  const kw = product.keyword || '';
  let peers = [];
  let niche = product._niche || null;

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

  // Scrape history for the product + top peers → real weekly trend + sparklines.
  let history = [];
  try {
    const ids = [...new Set([product.item_id, ...peers.map(p => p.item_id)])]
      .filter(x => x != null).slice(0, 30);
    if (ids.length) {
      const { data } = await _supabase.from('listings')
        .select('item_id,shop_id,keyword,price,total_sold,scraped_at')
        .in('item_id', ids)
        .order('scraped_at', { ascending: false })
        .limit(1000);
      history = (data || []).reverse();
    }
  } catch (_) {}

  // Attach to active chat session
  let chat = activeChat();
  if (!chat) {
    const title = (product.product_name || product.keyword || 'Produk').slice(0, 60);
    if (currentUser && _supabase) {
      const { data } = await _supabase.rpc('gpt_new_chat', {
        p_title: title,
        p_context: { kind: 'product', keyword: kw, item_id: product.item_id, shop_id: product.shop_id },
      });
      if (data?.allowed === false) {
        // The daily cap is on NEW searches — viewing a product must never be
        // walled (MISSION: no trapping). Keep the session local, keep going.
        chat = { localId: 'local_' + Date.now(), title, context: { kind: 'product', keyword: kw, item_id: product.item_id, shop_id: product.shop_id }, messages: [], created_at: Date.now() };
        state.chats.unshift(chat);
        state.activeChatId = chat.localId;
      } else if (data?.chat) {
        chat = { id: data.chat.id, title, context: data.chat.context, messages: [], created_at: Date.now() };
        state.chats.unshift(chat);
        state.activeChatId = chat.id;
      }
    }
  }
  if (chat) {
    chat.context = { ...(chat.context || {}), product, keyword: kw };
    chat.title = (product.product_name || kw || chat.title || 'Produk').slice(0, 60);
    saveLocalState();
    renderChatList();
  }

  void logUserEvent('deepdive_open', { ui: 'gpt', keyword: kw, item_id: product.item_id, shop_id: product.shop_id });
  clarityEvt('deepdive_open', { keyword: kw });

  const stats = ddStats(peers);
  const series = ddWeeklySeries(history);
  const scoreInfo = ddScore(product, stats, niche);
  const share = ddShareData(peers);
  const age = ddShopAgeBuckets(peers);
  const kwRows = ddKeywordRows(peers);
  _dd = { product, peers, niche, stats, history, series };

  const lastScrape = history.length ? history[history.length - 1].scraped_at : null;
  const price = Number(product.price) || 0;
  const hasTrend = series.length >= 3;
  const bandLo = stats.p25, bandHi = stats.p75;
  const segLeft = stats.max > stats.min ? Math.round((bandLo - stats.min) / (stats.max - stats.min) * 100) : 0;
  const segWidth = stats.max > stats.min ? Math.max(4, Math.round((bandHi - bandLo) / (stats.max - stats.min) * 100)) : 100;
  const agePct = k => age.total ? Math.round(age[k] / age.total * 100) : 0;

  root.innerHTML = `
    <div class="dd-head" style="margin-bottom:12px">
      <button type="button" class="btn-ghost" id="dd-back" style="margin:0">Kembali ke chat</button>
    </div>
    <div class="ddr-header" data-dd-sec="skor">
      ${product.image_url ? `<img src="${esc(product.image_url)}" alt="">` : '<span class="ph"></span>'}
      <div class="ddr-head-main">
        <div class="ddr-title-row">
          <h1>${esc(product.product_name || kw || 'Produk')}</h1>
          <span class="badge ${scoreInfo.cls}">${scoreInfo.label}</span>
        </div>
        <p class="ddr-summary">${esc(ddSummaryText(stats, niche, scoreInfo))}</p>
        <p class="ddr-cat">Kategori: ${esc(product.category || '—')} · Lokasi: ${esc(product.location || '—')} · Keyword: ${esc(kw || '—')}</p>
      </div>
      <div class="ddr-score">
        <div class="lbl">Skor Produk</div>
        <div class="num">${scoreInfo.score}<span>/100</span></div>
        <span class="badge ${scoreInfo.cls}">${scoreInfo.label}</span>
      </div>
    </div>
    ${ddTilesHtml(product, stats, peers, series)}
    <div class="ddr-2col">
      <div class="ddr-card" data-dd-sec="why">
        <h3>${scoreInfo.score >= 60 ? 'Kenapa saya yakin ini peluang bagus?' : 'Yang perlu kamu tahu sebelum masuk'}</h3>
        ${ddWhyHtml(product, stats, niche)}
      </div>
      <div class="ddr-card">
        <h3>Insight LarisID</h3>
        <p class="dd-sub" style="margin:0;line-height:1.6">${esc(scoreInfo.odds.hint)}. ${stats.n ? esc(`Kompetisi ${stats.komp.toLowerCase()} dengan ${new Set(peers.map(p => String(p.shop_id))).size} toko aktif di keyword ini.`) : ''}</p>
        <p class="ddr-caption">Dihitung dari data Shopee — bukan tebakan AI.</p>
      </div>
    </div>
    <div class="ddr-2col">
      <div class="ddr-card" data-dd-sec="tren">
        <h3>Tren Omzet &amp; Unit Terjual</h3>
        ${hasTrend
          ? `<div class="ddr-chart-wrap"><canvas id="ddr-trend-canvas"></canvas></div>
             <div class="chart-legend" style="flex-direction:row;gap:14px">
               <span class="row"><span class="swatch" style="background:#B5202A"></span>Omset (Rp)</span>
               <span class="row"><span class="swatch" style="background:#2563EB"></span>Unit Terjual</span>
               <span class="row"><span class="swatch" style="background:#16A34A"></span>Forecast</span>
             </div>`
          : `<p class="dd-sub">Belum cukup riwayat scrape untuk tren mingguan keyword ini — butuh beberapa gelombang panel. Bagian lain tetap dari data asli.</p>`}
        <p class="ddr-caption">Estimasi mingguan pasar keyword “${esc(kw || '—')}” dari riwayat scrape ${history.length ? `(${new Set(history.map(r => String(r.item_id))).size} listing)` : ''} · scrape terakhir ${esc(fmtAnchorDate(lastScrape))}.</p>
      </div>
      <div class="ddr-card" data-dd-sec="harga">
        <h3>Rentang Harga Optimal</h3>
        ${stats.n >= 4 ? `
          <div class="range-big">${fmtRp(bandLo)} – ${fmtRp(bandHi)}</div>
          <div class="range-bar"><div class="range-seg" style="left:${segLeft}%;width:${segWidth}%"></div></div>
          <div class="range-ticks"><span>${fmtRpShort(stats.min)}</span><span>${fmtRpShort(stats.median)}</span><span>${fmtRpShort(stats.max)}</span></div>
          <div class="range-note">${ico('info', 13)}<span>Rentang harga dari ${stats.n} listing di keyword ini. Rekomendasi masuk pasar: ${fmtRp(stats.p35)} – ${fmtRp(stats.p65)}.</span></div>`
          : '<p class="dd-sub">Belum cukup data harga peer untuk keyword ini.</p>'}
      </div>
    </div>
    <div class="ddr-3col">
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
      <div class="ddr-card" data-dd-sec="distribusi">
        <h3>Distribusi Harga</h3>
        ${stats.n >= 6 ? `
          <div class="ddr-chart-wrap sm"><canvas id="ddr-dist-canvas"></canvas></div>
          <p class="ddr-caption">Titik = listing (harga × terjual). Zona merah muda = rentang ${fmtRpShort(bandLo)} – ${fmtRpShort(bandHi)} tempat sebagian besar penjualan terjadi.</p>`
          : '<p class="dd-sub">Belum cukup listing untuk memetakan distribusi harga.</p>'}
      </div>
    </div>
    <div class="ddr-2col">
      <div class="ddr-card" data-dd-sec="kompetitor">
        <h3>Top Kompetitor</h3>
        ${ddKompetitorTableHtml(share)}
      </div>
      <div class="ddr-card" data-dd-sec="keyword">
        <h3>Top Keyword</h3>
        ${ddKeywordTableHtml(kwRows, peers.length)}
      </div>
    </div>
    <div class="ddr-2col">
      <div class="ddr-card" data-dd-sec="strategi">
        <h3>Rekomendasi Strategi</h3>
        ${ddStrategyHtml(product, stats, niche, kwRows)}
      </div>
      <div class="ddr-side-cta">
        <p style="margin:0">Ingin saya bantu cari supplier atau hitung estimasi profit untuk produk ini?</p>
        <button type="button" class="btn-primary" id="ddr-profit-btn" style="margin:0">Hitung Profit →</button>
      </div>
    </div>
    <button type="button" class="btn-ghost" id="btn-more-from-dd">Tampilkan produk lain</button>
    <p class="ddr-caption" style="margin-top:10px">Semua angka dari data Shopee via LarisID — bukan tebakan AI. Ketik pertanyaan di bawah untuk tanya AI tentang produk ini.</p>
  `;

  $('dd-back')?.addEventListener('click', () => { setView('chat'); renderChatThread(); });
  $('btn-more-from-dd')?.addEventListener('click', () => void startRecommendationChat(false));
  $('ddr-profit-btn')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'profit_cta', via: 'click', keyword: kw || '' });
    void handleComposerSubmit('Hitung estimasi profit');
  });
  const kompMore = $('ddr-komp-more');
  kompMore?.addEventListener('click', () => {
    root.querySelectorAll('[data-komp-extra]').forEach(tr => { tr.hidden = false; });
    kompMore.remove();
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'kompetitor', via: 'click', keyword: kw || '' });
  });
  root.querySelectorAll('[data-kshop]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [iid, sid] = btn.getAttribute('data-kshop').split('|');
      const p = peers.find(x => String(x.item_id) === iid && String(x.shop_id) === sid);
      if (p) void openDeepDive(asListingProduct(p));
    });
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

  setComposerChips(DD_CHIPS, 'deepdive');

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
    makeChart('ddr-dist-canvas', {
      type: 'scatter',
      data: {
        datasets: [{
          data: peers.map(p => ({ x: Number(p.price) || 0, y: Number(p.total_sold) || 0 })),
          backgroundColor: 'rgba(37,99,235,.55)', pointRadius: 3.5,
        }],
      },
      options: {
        maintainAspectRatio: false,
        _band: [bandLo, bandHi],
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { callback: v => v >= 1e6 ? (v / 1e6) + 'jt' : Math.round(v / 1e3) + 'rb', maxTicksLimit: 6 } },
          y: { type: 'logarithmic', ticks: { callback: v => fmtSold(v), maxTicksLimit: 5 } },
        },
      },
      plugins: [_ddBandPlugin],
    });
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

// Real weekly market trend from scrape history. Rule kept from site A: the
// real series stays SHORTER than the labels — only Forecast touches the
// future label. Never draws a synthetic curve.
function ddRenderTrendChart(series) {
  if (typeof Chart === 'undefined' || series.length < 3) return;
  const fmtWk = ts => new Date(ts).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const labels = series.map(w => fmtWk(w.ts));
  labels.push(fmtWk(series[series.length - 1].ts + 7 * 864e5));
  const omset = series.map(w => w.omset);
  const units = series.map(w => w.units);
  const last2 = arr => Math.round((arr[arr.length - 1] + (arr[arr.length - 2] ?? arr[arr.length - 1])) / 2);
  const forecast = Array(series.length - 1).fill(null).concat([omset[omset.length - 1], last2(omset)]);
  makeChart('ddr-trend-canvas', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Omset (Rp)', data: omset, borderColor: '#B5202A', backgroundColor: 'rgba(181,32,42,.06)', borderWidth: 2, fill: true, tension: .35, yAxisID: 'y', pointRadius: 3 },
        { label: 'Unit Terjual', data: units, borderColor: '#2563EB', borderWidth: 2, tension: .35, yAxisID: 'y2', pointRadius: 3 },
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

function buildProductSystemPrompt(p) {
  const niche = p._niche;
  return `Kamu adalah asisten riset produk LarisID (LARISgpt). Jawab dalam Bahasa Indonesia informal ("kamu").
PENTING: Angka spesifik tentang produk/keyword HARUS dari data berikut. Jangan mengarang statistik. Knowledge umum OK untuk konteks (cara jual, packing), tapi label dengan jelas kalau bukan dari data kami. Jangan bilang kamu "melihat" produk — kamu membaca data.

DATA PRODUK:
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

Kartu data di UI BUKAN output AI — jangan klaim begitu.`;
}

async function handleComposerSubmit(text) {
  text = (text || '').trim();
  if (!text) return;

  const lower = text.toLowerCase();
  if (/tampilkan produk lain|produk lain|rekomendasi baru/.test(lower)) {
    await startRecommendationChat(false);
    return;
  }

  const inProductCtx = state.view === 'deepdive' || activeChat()?.context?.product || activeChat()?.context?.keyword;

  // Data-backed intents (home/trending/DD chips + free text). In a product
  // conversation only profit & supplier are intercepted (they use the
  // product's own data); everything else there goes to AI as before.
  const intent = detectIntent(lower);
  if (intent && (!inProductCtx || intent === 'profit' || intent === 'supplier')) {
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

  setView('chat');
  let chat = activeChat();
  if (!chat) {
    // Treat as starting a search-oriented chat without consuming search if just AI on empty — create local thread
    chat = { localId: 'local_' + Date.now(), title: text.slice(0, 40), context: {}, messages: [], created_at: Date.now() };
    state.chats.unshift(chat);
    state.activeChatId = chat.localId;
    renderChatList();
  }

  appendBubble('user', `<p>${esc(text)}</p>`);
  pushMessage(chat, 'user', text);
  void logUserEvent('gpt_message_sent', { ui: 'gpt' });
  clarityEvt('gpt_message_sent', {});

  const product = chat.context?.product || (state.view === 'deepdive' ? state.deepdiveProduct : null);
  if (!product) {
    // No product context — try to treat as keyword search → new recommendation-ish fetch
    if (!(await ensureSearchAllowed())) return;
    const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari di data…</p>`);
    const { city, cleaned } = parseCityFromQuery(text);
    const terms = _searchTerms(cleaned);
    const q = terms.join(' ');
    const locations = city ? expandCityLocations(city) : [];
    let hits = q ? await searchListings(q, locations, 30) : [];
    if (!hits.length && terms.length > 1) hits = await searchListings(terms[0], locations, 30);
    hits = mergePool([], hits).slice(0, 3);
    const usedFallback = !hits.length;
    if (usedFallback) {
      const rows = mergePool([], await fetchNaikDaunGlobal(200));
      state.recommendations = rows.slice(0, 3);
    } else {
      state.recommendations = hits;
    }
    if (currentUser && _supabase && !chat.id) {
      const { data } = await _supabase.rpc('gpt_new_chat', { p_title: text.slice(0, 60), p_context: { kind: 'search', q: text } });
      if (data?.allowed === false) {
        const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(data.reset_at || wibMidnightReset())}.`;
        if (loading) loading.querySelector('.msg-bubble').innerHTML = `<p>${esc(msg)}</p>`;
        showToast(msg);
        clarityEvt('gpt_limit_hit', {});
        void logUserEvent('gpt_limit_hit', { ui: 'gpt' });
        return;
      }
      if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; }
    } else if (!currentUser) {
      bumpAnonSearch();
    }
    const lead = usedFallback
      ? `Belum ketemu yang cocok persis untuk “${esc(text)}” — ini yang lagi naik daun dari data LarisID:`
      : `Hasil dari data LarisID untuk “${esc(q)}”${city ? ` dari seller sekitar <strong>${esc(city)}</strong>` : ''}:`;
    const html = state.recommendations.length
      ? `<p>${lead}</p><div class="card-grid">${state.recommendations.map((p, i) => productCardHtml(p, i)).join('')}</div>`
      : `<p>Belum ketemu. Coba kata kunci lain atau buka Produk.</p>`;
    if (loading) { loading.querySelector('.msg-bubble').innerHTML = html; scrollChatToBottom(); }
    else appendBubble('assistant', html);
    pushMessage(chat, 'assistant', { text: 'Hasil pencarian', q: text }, html);
    bindProductCards();
    void logUserEvent('discover_view', { ui: 'gpt', q: text });
    return;
  }

  if (!(await _useAi('mls_chat'))) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menjawab dari data produk…</p>`);
  const system = buildProductSystemPrompt(product);
  const reply = await _mlsAIRaw(system, [{ role: 'user', content: text }]);
  const html = `<p>${esc(reply).replace(/\n/g, '</p><p>')}</p>`;
  if (loading) loading.querySelector('.msg-bubble').innerHTML = html;
  pushMessage(chat, 'assistant', { text: reply }, html);
  void logUserEvent('gpt_ai_reply', { ui: 'gpt', keyword: product.keyword });
  clarityEvt('gpt_ai_reply', {});
}

// ── Directory ────────────────────────────────────────────────────────────
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
  const o = state.onboarding || {};
  if (!state.dirCat && o.categories?.length) state.dirCat = o.categories[0];
  if (!state.dirCity && o.city) state.dirCity = o.city;
}

async function openDirectory() {
  setView('directory');
  _dirApplyDefaultsOnce();

  const cats = $('dir-cats');
  if (cats && !cats.dataset.ready) {
    cats.dataset.ready = '1';
    cats.innerHTML = `<button type="button" class="chip" data-dcat="">Semua</button>` +
      NU_ONB_CATS.map(c => `<button type="button" class="chip" data-dcat="${esc(c)}">${esc(c)}</button>`).join('');
    cats.querySelectorAll('[data-dcat]').forEach(btn => {
      btn.addEventListener('click', () => {
        // Category filter is free for anonymous (page 2+ / deep-dive stay gated).
        const cat = btn.getAttribute('data-dcat');
        state.dirCat = cat || null;
        state.dirPage = 1;
        cats.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
        void logUserEvent('dir_filter', { ui: 'gpt', kind: 'category', value: state.dirCat || '' });
        void renderDirectory();
      });
    });
  }
  if (cats) {
    cats.querySelectorAll('[data-dcat]').forEach(c => {
      const v = c.getAttribute('data-dcat') || '';
      c.classList.toggle('selected', (state.dirCat || '') === v);
    });
  }

  const citySel = $('dir-city');
  if (citySel && !citySel.dataset.ready) {
    citySel.dataset.ready = '1';
    citySel.innerHTML = `<option value="">Semua kota</option>` +
      NU_ONB_LOCATIONS.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    citySel.addEventListener('change', () => {
      state.dirCity = citySel.value || '';
      state.dirPage = 1;
      void logUserEvent('dir_filter', { ui: 'gpt', kind: 'city', value: state.dirCity });
      void renderDirectory();
    });
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
    note.hidden = !tailored;
  }

  await renderDirectory();
}

async function renderDirectory() {
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  if (!grid) return;
  grid.innerHTML = '<p class="dd-sub">Memuat…</p>';

  const cat = state.dirCat || null;
  const city = state.dirCity || '';
  let rows = [];
  if (city) {
    const locs = expandCityLocations(city);
    rows = await fetchListingsCityCat(locs, cat ? [cat] : [], 200);
  } else {
    rows = mergePool([], await fetchNaikDaunGlobal(200));
    if (cat) {
      const c = cat.toLowerCase();
      rows = rows.filter(r => catMatches(r.category, [cat]) || (r.category || '').toLowerCase().includes(c.slice(0, 5)));
    }
  }
  rows = sortDirRows(rows, state.dirSort || 'terlaris');
  state.dirRows = rows;

  if (state.dirPage > 1 && !currentUser) {
    openAuthModal('signup', 'gpt_gate_directory');
    state.dirPage = 1;
  }
  const start = (state.dirPage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  grid.innerHTML = slice.map((p, i) => productCardHtml(p, i % 3)).join('') || '<p class="dd-sub">Tidak ada produk untuk filter ini.</p>';
  bindProductCards(grid);
  if (pager) {
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
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
  setView('chat');
  renderOnboardingStep();
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
  const input = $('composer-input');
  if (!input) return;
  let i = 0;
  setInterval(() => {
    if (document.activeElement === input || input.value) return;
    i = (i + 1) % COMPOSER_EXAMPLES.length;
    input.placeholder = COMPOSER_EXAMPLES[i];
  }, 5000);
}

// ── Wire DOM ─────────────────────────────────────────────────────────────
function wireUi() {
  startPlaceholderRotation();
  $('btn-menu')?.addEventListener('click', openSidebar);
  $('sidebar-backdrop')?.addEventListener('click', closeSidebar);
  $('btn-home')?.addEventListener('click', goHome);
  $('btn-home-mobile')?.addEventListener('click', goHome);
  $('btn-new-chat')?.addEventListener('click', () => void newChatFlow());
  $('btn-search-chats')?.addEventListener('click', () => {
    if (!currentUser) { openAuthModal('signup', 'gpt_gate_history'); return; }
    const q = prompt('Cari chat (judul / keyword):');
    if (!q) return;
    const qq = q.toLowerCase();
    const hit = state.chats.find(c => (c.title || '').toLowerCase().includes(qq) || (c.context?.keyword || '').toLowerCase().includes(qq));
    if (hit) openChat(hit.id || hit.localId);
    else showToast('Tidak ketemu chat itu.');
  });
  $('btn-produk')?.addEventListener('click', () => void openDirectory());
  $('btn-harga')?.addEventListener('click', () => setView('harga'));
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
    startOnboarding('sidebar');
  });

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
  // Ensure sticky AB is B when visiting /gpt/ directly
  try {
    const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
    if (!ab || (ab.v !== 'A' && ab.v !== 'B' && ab.v !== 'X')) {
      localStorage.setItem('_lid_ab_v1', JSON.stringify({ v: 'B', ts: Date.now() }));
    }
  } catch (_) {}

  wireUi();
  updateAccountUI();

  if (typeof ensureSupabase === 'function') await ensureSupabase();
  await initSupabase();
  try { await consumeOAuthHash(); } catch (_) {}

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

boot();
})();
