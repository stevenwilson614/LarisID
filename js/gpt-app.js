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
  pendingCompare: null, // { a, b } clicked behind login gate; opened after sign-in
  comparePick: null, // { source } — directory is in “pick a product to compare” mode
  // Survives recommendation wipes so chat product cards can reopen Deep Dive.
  productByKey: Object.create(null),

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
    if (raw.pendingCompare) state.pendingCompare = raw.pendingCompare;
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
  if (data.reset_at) {
    const t = data.reset_at instanceof Date ? data.reset_at : new Date(data.reset_at);
    if (!Number.isNaN(t.getTime())) _gptUsage.resetAt = t;
  }
  if (!_gptUsage.resetAt) _gptUsage.resetAt = wibMidnightReset();
  if (isPlatformAdmin()) _gptUsage.unlimited = true;
  renderGptUsage();
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
    const wrap = pill.querySelector('.usage-ring-wrap');
    const prog = pill.querySelector('.prog');
    const numEl = pill.querySelector('.usage-ring-num');
    const popTitleEl = pill.querySelector('.usage-pop-title');
    const popSubEl = pill.querySelector('.usage-pop-sub');
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
    document.addEventListener('click', () => setUsagePopOpen(null, false));
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
      if (data) noteGptUsage(data);
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

// ── Assistant type-out (ChatGPT / Cursor style) ───────────────────────────
let _streamGen = 0;

function abortAssistantStream() {
  _streamGen += 1;
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

async function _typeTextNode(textNode, fullText, gen, cps) {
  const text = String(fullText || '');
  if (!text) return;
  let i = 0;
  let sinceScroll = 0;
  while (i < text.length) {
    if (gen !== _streamGen) return;
    // Chunk a few chars; pause a beat after sentence punctuation.
    let n = 1;
    const ch = text[i];
    if (ch === ' ' || ch === '\n') n = 1;
    else if (/[.,;:!?…]/.test(ch)) n = 1;
    else n = Math.min(3, text.length - i);
    i += n;
    textNode.textContent = text.slice(0, i);
    sinceScroll += n;
    if (sinceScroll >= 28) {
      sinceScroll = 0;
      scrollChatToBottom();
    }
    const pause = /[.]/.test(text[i - 1]) ? 2.6
      : /[,;:!?]/.test(text[i - 1]) ? 1.7
      : 1;
    await _sleep((1000 / cps) * n * pause);
  }
}

async function _streamNode(parent, srcNode, gen, cps) {
  if (gen !== _streamGen) return;
  if (srcNode.nodeType === Node.TEXT_NODE) {
    const tn = document.createTextNode('');
    parent.appendChild(tn);
    await _typeTextNode(tn, srcNode.textContent, gen, cps);
    return;
  }
  if (srcNode.nodeType !== Node.ELEMENT_NODE) return;

  if (_isAtomicStreamBlock(srcNode)) {
    const clone = srcNode.cloneNode(true);
    clone.classList.add('stream-pop');
    parent.appendChild(clone);
    scrollChatToBottom();
    await _sleep(90);
    return;
  }

  const el = srcNode.cloneNode(false);
  parent.appendChild(el);
  for (const child of [...srcNode.childNodes]) {
    if (gen !== _streamGen) return;
    await _streamNode(el, child, gen, cps);
  }
}

/** Type assistant HTML into a bubble like ChatGPT/Cursor. Historical loads use instant. */
async function streamHtmlInto(bubble, html, opts = {}) {
  if (!bubble) return;
  const instant = opts.instant
    || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (instant) {
    bubble.classList.remove('is-streaming');
    bubble.innerHTML = html;
    return;
  }
  const gen = ++_streamGen;
  const cps = Math.max(28, Math.min(90, Number(opts.cps) || 58));
  bubble.classList.add('is-streaming');
  bubble.innerHTML = '';
  const source = document.createElement('div');
  source.innerHTML = html;
  for (const child of [...source.childNodes]) {
    if (gen !== _streamGen) break;
    await _streamNode(bubble, child, gen, cps);
  }
  if (gen === _streamGen) bubble.classList.remove('is-streaming');
  scrollChatToBottom();
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
      else appendBubble('assistant', `<p>${esc(m.content?.text || m.content || '')}</p>`, { skipScroll: true });
    }
    // Re-bind cards
    bindProductCards(thread);
    bindTrendingCards(thread);
    bindGptKalc(thread);
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

function syncDirectoryFromOnboarding() {
  const o = state.onboarding || {};
  if (o.step !== 'done') return;
  if (o.city) state.dirCity = o.city;
  if (o.categories?.length) state.dirCat = o.categories[0];
}

// ── Lokasi & kategori side drawer (does not interrupt the open chat) ──────
let _prefsDraft = { city: '', categories: [], freeText: '', cityFilter: '' };
let _prefsSource = '';

function openPrefsDrawer(source) {
  _prefsSource = source || 'sidebar';
  const o = state.onboarding || {};
  _prefsDraft = {
    city: o.city || '',
    categories: [...(o.categories || [])],
    freeText: o.freeText || '',
    cityFilter: '',
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
  clarityEvt('gpt_prefs_open', { source: _prefsSource });
  void logUserEvent('gpt_prefs_open', { ui: 'gpt', source: _prefsSource });
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

async function savePrefsDrawer() {
  const o = state.onboarding;
  const wasDone = o.step === 'done';
  o.city = _prefsDraft.city || '';
  o.categories = [..._prefsDraft.categories];
  o.freeText = ($('prefs-free')?.value || _prefsDraft.freeText || '').trim();
  if (!o.city && !o.categories.length && !o.freeText) {
    showToast('Pilih kota atau kategori dulu.');
    return;
  }
  o.step = 'done';
  o.completedAnon = !currentUser;
  saveLocalState();
  syncDirectoryFromOnboarding();
  state._dirDefaultsApplied = true;
  renderSidebarLocCard();
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
}

function startOnboarding(source) {
  // Side drawer — keeps the current chat / view intact.
  openPrefsDrawer(source || 'sidebar');
}

function offerOnboardingAfterSignin() {
  _offerActive = false;
  openPrefsDrawer('post_signin');
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
      else if (arr.length < 3) arr.push(c);
      renderPrefsCatChips();
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('prefs-drawer')?.classList.contains('open')) {
      e.preventDefault();
      closePrefsDrawer();
    }
  });
}

// ── Kalkulator side panel (Cursor-style resizable right window) ───────────
const CALC_PREFS_KEY = 'gpt_calc_panel_v1';
let _calcFilled = false;

function loadCalcPrefs() {
  try { return JSON.parse(localStorage.getItem(CALC_PREFS_KEY) || '{}') || {}; }
  catch (_) { return {}; }
}
function saveCalcPrefs(patch) {
  try { localStorage.setItem(CALC_PREFS_KEY, JSON.stringify({ ...loadCalcPrefs(), ...patch })); }
  catch (_) {}
}

function setCalcWidth(px) {
  const min = 320;
  const max = Math.max(min, Math.min(window.innerWidth * 0.7, window.innerWidth - 360));
  const w = Math.round(Math.max(min, Math.min(px, max)));
  document.documentElement.style.setProperty('--calc-w', w + 'px');
  return w;
}

function openCalcPanel(opts = {}) {
  const panel = $('calc-panel');
  const body = $('calc-body-inner');
  if (!panel || !body) return;
  // (Re)build kalkulator when product defaults are passed, or on first open.
  if (opts.price != null || !_calcFilled) {
    const kalcOpts = {};
    if (opts.price != null && Number(opts.price) > 0) kalcOpts.price = Math.round(Number(opts.price));
    if (opts.cogs != null && Number(opts.cogs) > 0) kalcOpts.cogs = Math.round(Number(opts.cogs));
    body.innerHTML = gptKalcHtml(kalcOpts);
    _calcFilled = true;
  }
  const ctx = $('calc-context');
  if (ctx) {
    const name = (opts.name || '').trim();
    if (name) { ctx.textContent = name; ctx.hidden = false; }
    else { ctx.textContent = ''; ctx.hidden = true; }
  }
  bindGptKalc(body);
  document.body.classList.add('calc-open');
  panel.setAttribute('aria-hidden', 'false');
  $('calc-rail')?.setAttribute('aria-expanded', 'true');
  saveCalcPrefs({ open: true });
  if (opts.via !== 'restore') {
    void logUserEvent('gpt_calc_panel', { ui: 'gpt', action: 'open', via: opts.via || 'rail', has_product: opts.price != null });
  }
}

function closeCalcPanel() {
  document.body.classList.remove('calc-open');
  $('calc-panel')?.setAttribute('aria-hidden', 'true');
  $('calc-rail')?.setAttribute('aria-expanded', 'false');
  saveCalcPrefs({ open: false });
}

function toggleCalcPanel(opts) {
  if (document.body.classList.contains('calc-open')) closeCalcPanel();
  else openCalcPanel(opts);
}

function wireCalcPanel() {
  if (wireCalcPanel._ready) return;
  wireCalcPanel._ready = true;

  const prefs = loadCalcPrefs();
  if (prefs.width) setCalcWidth(prefs.width);

  $('calc-rail')?.addEventListener('click', () => openCalcPanel({ via: 'rail' }));
  $('calc-close')?.addEventListener('click', closeCalcPanel);

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
      saveCalcPrefs({ width: cur });
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

  if (prefs.open) openCalcPanel({ via: 'restore' });
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
    if (data) noteGptUsage(data);
    if (data?.allowed === false) return { ok: false, resetAt: data.reset_at };
    if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; }
  } else if (!currentUser) {
    bumpAnonSearch();
  }
  return { ok: true };
}

function limitReply(loading, resetAt) {
  const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(resetAt || wibMidnightReset())}.`;
  if (loading) void revealAssistant(loading, `<p>${esc(msg)}</p>`, { instant: true });
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
  abortAssistantStream();
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
    rememberProducts(nd);
    html = nd.length
      ? `<p>Data tren mingguan belum tersedia — ini produk yang lagi naik daun dari data LarisID:</p><div class="card-grid">${nd.map((p, i) => productCardHtml(p, i)).join('')}</div>`
      : `<p>Data tren belum tersedia. Coba lagi nanti.</p>`;
  } else {
    const view = computeTrendingView(rows, '7d');
    html = `<p>Berikut produk yang sedang trending di Shopee berdasarkan peningkatan penjualan — dari data scrape LarisID, bukan tebakan AI.</p>${trendingCardHtml(view)}`;
  }
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Produk trending',
    kind: 'trending',
    products: (state.recommendations || []).map(productSnapshot).filter(Boolean),
  }, html);
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
    await appendAssistantStream(html);
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
  rememberProducts(top);
  const html = top.length
    ? `<p>Produk laris dengan harga di bawah <strong>${fmtRp(budget)}</strong> — dari data Shopee LarisID:</p><div class="card-grid">${top.map((p, i) => productCardHtml(p, i)).join('')}</div>`
    : `<p>Belum ketemu produk laris di bawah ${fmtRp(budget)}. Coba angka lain.</p>`;
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', { text: 'Hasil modal', budget, products: top.map(productSnapshot).filter(Boolean) }, html);
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
    await appendAssistantStream(html);
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
  await revealAssistant(loading, html);
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
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', { text: 'Niche kompetisi rendah', kind: 'lowcomp' }, html);
  loading.querySelectorAll('[data-kwsearch]').forEach(btn => {
    btn.addEventListener('click', () => void handleComposerSubmit(`Cari produk ${btn.getAttribute('data-kwsearch')}`));
  });
  scrollChatToBottom();
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
        <div><span>Omzet / pesanan</span><span data-out="omzet">—</span></div>
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
  set('omzet', fmtRp(r.price));
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
  scrollChatToBottom();
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
  state.recommendations = mergePool([], [...(sa?.top || []), ...(sb?.top || [])]);
  rememberProducts(state.recommendations);
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
  await revealAssistant(loading, html);
  pushMessage(chat, 'assistant', {
    text: 'Bandingkan',
    a: parts[0],
    b: parts[1],
    products: state.recommendations.map(productSnapshot).filter(Boolean),
  }, html);
  bindProductCards();
  scrollChatToBottom();
}

async function handleRencanaIntent(chat) {
  const html = `<p>Buka salah satu produk dulu (klik <strong>Lihat Analisis</strong>), lalu minta rencana jualan — aku susun dari data produknya.</p>`;
  await appendAssistantStream(html);
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

function productCardHtml(p, i) {
  rememberProducts([p]);
  const img = p.image_url || '';
  const name = p.product_name || p.keyword || 'Produk';
  const key = `${p.item_id}|${p.shop_id}`;
  const snap = productSnapshot(p);
  const encoded = snap ? encodeURIComponent(JSON.stringify(snap)) : '';
  const omset = estOmsetBulan(p);
  const loc = p.location ? `<div class="prod-card-loc">${esc(p.location)}</div>` : '';
  return `<button type="button" class="prod-card" data-prod="${esc(key)}"${encoded ? ` data-product="${encoded}"` : ''} style="animation-delay:${i * 0.06}s">
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
  rememberProducts(recs);

  const cards = recs.length
    ? `<div class="card-grid">${recs.map((p, i) => productCardHtml(p, i)).join('')}</div>
       <button type="button" class="btn-ghost" id="btn-more-products">Tampilkan produk lain</button>`
    : `<p>Belum ketemu produk yang cocok. Coba Chat Baru atau buka <strong>Produk</strong> di sidebar.</p>`;

  const html = `<p>${frame}</p><p>Ini <strong>3 produk</strong> dari data LarisID buat kamu cek:</p>${cards}`;
  const thread2 = $('chat-thread');
  if (thread2) thread2.innerHTML = '';
  const msg = await appendAssistantStream(html);
  pushMessage(chat, 'assistant', { text: 'Rekomendasi 3 produk', products: recs.map(productSnapshot).filter(Boolean) }, html);
  bindProductCards();

  void logUserEvent('discover_view', { ui: 'gpt', count: recs.length });
  clarityEvt('discover_view', { ui: 'gpt' });
  clarityEvt('gpt_chat_new', {});
  void logUserEvent('gpt_chat_new', { ui: 'gpt' });
}

async function openChat(id) {
  abortAssistantStream();
  state.activeChatId = id;
  saveLocalState();
  renderChatList();
  setView('chat');
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
  renderChatThread();
  // Product / deep-dive chats keep analysis reachable — reopen Deep Dive
  // from the persisted context so it never "disappears" from the chat.
  // Login gate stays inside openDeepDive; skip auto-restore when logged out
  // so opening history doesn't spam the auth modal.
  if (chat?.context?.product && currentUser) {
    rememberProducts([chat.context.product]);
    void openDeepDive(chat.context.product);
  }
}

async function newChatFlow() {
  abortAssistantStream();
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
// Those look like real sales but are UI tier jumps. We mirror site A's
// correction: prefer review-based estimates when the raw jump is absurd.
const DD_SOLD_BUCKETS = new Set([1, 2, 5, 10, 50, 100, 500, 1000, 2000, 3000, 5000, 7000, 8000, 9000]);
const DD_MAX_SOLD_PER_DAY = 500; // sustained panel rate; higher is almost always a bucket/glitch
const DD_REVIEW_TO_SOLD = 3.2;   // ~median category multiplier from site A

function ddSoldIsBucket(sold) {
  const s = Number(sold) || 0;
  if (s >= 10000) return true;
  return DD_SOLD_BUCKETS.has(s);
}

/** Correct one interval's unit delta so bucket/glitch jumps don't inflate weekly omset. */
function ddCorrectSoldDelta(prev, next, spanMs) {
  const s0 = Number(prev.total_sold) || 0;
  const s1 = Number(next.total_sold) || 0;
  const raw = Math.max(0, s1 - s0);
  if (raw <= 0) return 0;

  const days = Math.max(spanMs / 864e5, 1 / 24);
  const rate = raw / days;
  const rev0 = Number(prev.reviews) || 0;
  const rev1 = Number(next.reviews) || 0;
  const reviewEst = Math.max(0, Math.round((rev1 - rev0) * DD_REVIEW_TO_SOLD));
  const bucket0 = ddSoldIsBucket(s0);
  const bucket1 = ddSoldIsBucket(s1);
  const tierJump = s0 > 0 && s1 / s0 >= 3 && raw >= 10000;

  // Same display bucket twice → no real sold change; use reviews if any.
  if (bucket0 && bucket1 && s0 === s1) return reviewEst;

  // Crossing into / within 10rb+ display tiers: raw delta is a floor jump, not sales.
  if ((s0 < 10000 && s1 >= 10000) || (s0 >= 10000 && s1 >= 10000 && (bucket0 || bucket1))) {
    if (reviewEst > 0) return reviewEst;
    // No reviews — cap to a plausible daily rate instead of dumping the tier gap.
    return Math.min(raw, Math.round(DD_MAX_SOLD_PER_DAY * days));
  }

  // Absurd rate or 3×+ jump vs previous reading.
  if (rate > DD_MAX_SOLD_PER_DAY || tierJump) {
    if (reviewEst > 0) return Math.min(raw, Math.max(reviewEst, Math.round(DD_MAX_SOLD_PER_DAY * days)));
    return Math.min(raw, Math.round(DD_MAX_SOLD_PER_DAY * days));
  }

  // Raw jump wildly above review-implied sales.
  if (reviewEst > 0 && raw > reviewEst * 5) return reviewEst;

  return raw;
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
  rememberProducts([product]);
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

  // Keyword scrape history → market weekly trend + sparklines.
  // Top-N peers by lifetime sold often appear in only 1–2 waves (bucket
  // leaders), so item_id IN (peers) + limit 1000 collapses Tren Omzet to a
  // handful of early weeks even when the keyword has many later scrapes.
  let history = [];
  try {
    const histCols = 'item_id,shop_id,keyword,price,total_sold,reviews,scraped_at';
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

  // Attach to active chat session
  let chat = activeChat();
  if (!chat) {
    const title = (product.product_name || product.keyword || 'Produk').slice(0, 60);
    if (currentUser && _supabase) {
      const { data } = await _supabase.rpc('gpt_new_chat', {
        p_title: title,
        p_context: { kind: 'product', keyword: kw, item_id: product.item_id, shop_id: product.shop_id },
      });
      if (data) noteGptUsage(data);
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
    chat.context = {
      ...(chat.context || {}),
      product,
      keyword: kw,
      peers: (peers || []).slice(0, 50).map(r => ({
        product_name: r.product_name,
        store_name: r.store_name,
        price: r.price,
        total_sold: r.total_sold,
        item_id: r.item_id,
        shop_id: r.shop_id,
      })),
    };
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
        <p class="ddr-caption">Estimasi mingguan pasar keyword “${esc(kw || '—')}” dari selisih scrape berurutan (snapshot pertama = baseline, bukan omzet)${hasTrend ? ' · tampilan dari 27 Apr 2026' : ''} ${history.length ? `· ${new Set(history.map(r => String(r.item_id))).size} listing` : ''} · scrape terakhir ${esc(fmtAnchorDate(lastScrape))}.</p>
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
        <p style="margin:0">Ingin hitung estimasi profit dengan angka kamu sendiri?</p>
        <button type="button" class="btn-primary" id="ddr-profit-btn" style="margin:0">Buka Kalkulator →</button>
      </div>
    </div>
    <div class="ddr-card" data-dd-sec="profit" id="ddr-kalc-anchor" style="margin-top:14px;padding:0;border:none;background:transparent">
      ${gptKalcHtml({ price, cogs: Math.round(price * 0.33) })}
    </div>
    <button type="button" class="btn-ghost" id="btn-more-from-dd">Tampilkan produk lain</button>
    <p class="ddr-caption" style="margin-top:10px">Semua angka dari data Shopee via LarisID — bukan tebakan AI. Ketik pertanyaan di bawah untuk tanya AI tentang produk ini.</p>
  `;

  $('dd-back')?.addEventListener('click', () => { setView('chat'); renderChatThread(); });
  $('btn-more-from-dd')?.addEventListener('click', () => void openMoreProductsDirectory());
  $('ddr-profit-btn')?.addEventListener('click', () => {
    void logUserEvent('deepdive_section', { ui: 'gpt', section: 'profit_cta', via: 'click', keyword: kw || '' });
    openCalcPanel({
      price,
      cogs: Math.round(price * 0.33),
      name: (product.product_name || product.keyword || '').slice(0, 80),
      via: 'deepdive',
    });
  });
  bindGptKalc(root);
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

  return `Kamu adalah asisten riset produk LarisID (LARISgpt). Jawab dalam Bahasa Indonesia informal ("kamu").
PENTING:
- Angka penjualan/harga/rating HARUS dari data berikut. Jangan mengarang statistik pasar.
- Untuk pertanyaan desain/spesifikasi (kantong/pocket, bahan, warna, model, ukuran, fitur): WAJIB sift dari SAMPLE NAMA PRODUK + TOP PENJUAL di bawah. Hitung pola yang paling umum — terutama di listing terlaris. Jangan bilang "aku nggak punya info" kalau ada nama produk di bawah.
- Kalau STATISTIK SPESIFIKASI atau KANTONG ada, pakai angka itu dulu. Contoh: "Dari 40 listing sejenis, kebanyakan sebut 2 kantong; di top 10 terlaris yang menyebut jumlah, mayoritas 2–4 kantong."
- Jangan arahkan ke "tanya toko" sebagai jawaban utama kalau data pasar sudah bisa menjawab. Boleh sebut konfirmasi ke toko hanya sebagai catatan sekunder.
- Knowledge umum OK hanya sebagai pelengkap singkat, dan label jelas kalau bukan dari data.
- Jangan bilang kamu "melihat" produk — kamu membaca data.
- Jawaban singkat, langsung ke poin (2–5 kalimat). Hindari emoji berlebihan.

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

  // Product-context “bandingkan …” → pick another listing (directory), unless
  // the user typed an explicit “A vs B” keyword compare.
  if (productCtx && /bandingkan|dibanding/.test(lower)) {
    const explicitVs = /\bvs\.?\b/.test(lower) && !/produk lain|yang mirip/.test(lower);
    if (!explicitVs) {
      await startComparePick(productCtx);
      return;
    }
  }

  // Data-backed intents (home/trending/DD chips + free text). In a product
  // conversation only profit & supplier are intercepted (they use the
  // product's own data); everything else there goes to AI as before.
  // Bandingkan with explicit “A vs B” is also allowed in product context.
  const intent = detectIntent(lower);
  if (intent && (!inProductCtx || intent === 'profit' || intent === 'supplier' || intent === 'bandingkan')) {
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
    rememberProducts(state.recommendations);
    if (currentUser && _supabase && !chat.id) {
      const { data } = await _supabase.rpc('gpt_new_chat', { p_title: text.slice(0, 60), p_context: { kind: 'search', q: text } });
      if (data) noteGptUsage(data);
      if (data?.allowed === false) {
        const msg = `Batas pencarian harian tercapai — reset dalam ${formatCountdown(data.reset_at || wibMidnightReset())}.`;
        if (loading) await revealAssistant(loading, `<p>${esc(msg)}</p>`, { instant: true });
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
    if (loading) await revealAssistant(loading, html);
    else await appendAssistantStream(html);
    pushMessage(chat, 'assistant', {
      text: 'Hasil pencarian',
      q: text,
      products: state.recommendations.map(productSnapshot).filter(Boolean),
    }, html);
    bindProductCards();
    void logUserEvent('discover_view', { ui: 'gpt', q: text });
    return;
  }

  if (!(await _useAi('mls_chat'))) return;
  const loading = appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Menjawab dari data produk…</p>`);
  const peers = await ensurePeerRowsForAi(product);
  const system = buildProductSystemPrompt(product, text, peers);
  const reply = await _mlsAIRaw(system, [{ role: 'user', content: text }]);
  const html = `<p>${esc(reply).replace(/\n/g, '</p><p>')}</p>`;
  if (loading) await revealAssistant(loading, html);
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
  if (match) state.dirCat = match;
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
  setComposerChips(DD_CHIPS, 'compare');
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

async function openDirectory() {
  setView('directory');
  _dirApplyDefaultsOnce();
  updateDirCompareBanner();

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
    note.hidden = !tailored || !!state.comparePick;
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
  rememberProducts(rows);

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
  // Ensure sticky AB is B when visiting /gpt/ directly
  try {
    const ab = JSON.parse(localStorage.getItem('_lid_ab_v1') || 'null');
    if (!ab || (ab.v !== 'A' && ab.v !== 'B' && ab.v !== 'X')) {
      localStorage.setItem('_lid_ab_v1', JSON.stringify({ v: 'B', ts: Date.now() }));
    }
  } catch (_) {}

  wireUi();
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

boot();
})();
