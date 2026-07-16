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
let _trendChart = null;

function _authSave(session) {
  try {
    localStorage.setItem(_AUTH_SK, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Date.now() + (session.expires_in || 3600) * 1000,
      user: session.user,
    }));
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
  if (!_supabase || !currentUser) return;
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
    step: 'city', // city | category | experience | pairing | notes | done
    city: '',
    categories: [],
    experience: '', // first_time | existing
    pairingMode: '', // pairing | new
    pairingCategory: '',
    notes: '',
  },
  chats: [], // { id, title, context, messages[], localId? }
  activeChatId: null,
  recommendations: [],
  deepdiveProduct: null,
  dirPage: 1,
  dirCat: null,
  dirRows: [],
  cityFilter: '',
  searchOpen: false,
};

function loadLocalState() {
  try {
    const raw = JSON.parse(localStorage.getItem(GPT_STATE_KEY) || 'null');
    if (!raw) return;
    if (raw.onboarding) Object.assign(state.onboarding, raw.onboarding);
    if (Array.isArray(raw.chats)) state.chats = raw.chats;
    if (raw.activeChatId) state.activeChatId = raw.activeChatId;
  } catch (_) {}
}
function saveLocalState() {
  try {
    localStorage.setItem(GPT_STATE_KEY, JSON.stringify({
      onboarding: state.onboarding,
      chats: state.chats,
      activeChatId: state.activeChatId,
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
  state.view = name;
  ['chat', 'deepdive', 'directory', 'harga'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('active', v === name);
  });
  ['btn-produk', 'btn-harga'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle('active', (id === 'btn-produk' && name === 'directory') || (id === 'btn-harga' && name === 'harga'));
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
  renderChatList();
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
    return `<button type="button" class="chat-item${active}" data-chat="${esc(id)}">${esc(c.title || 'Chat')}</button>`;
  }).join('');
  list.querySelectorAll('[data-chat]').forEach(btn => {
    btn.addEventListener('click', () => openChat(btn.getAttribute('data-chat')));
  });
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
  await persistOnboardingPrefs();
  await migrateLocalChatsToDb();
  saveLocalState();
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
  if (!currentUser || !_supabase) return;
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
    scrollChatToBottom();
    return;
  }
  if (state.onboarding.step !== 'done') {
    renderOnboardingStep();
  } else {
    appendBubble('assistant', `<p>Hai! Ketik nama produk atau kategori yang mau kamu riset — atau mulai Chat Baru untuk rekomendasi baru.</p>`);
  }
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
      <p>Hai! Aku bantu kamu riset produk Shopee dari data LarisID — gratis, data asli, bukan tebakan AI.</p>
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
      <p><strong>Kategori apa yang menarik buat kamu?</strong> (pilih 1–3)</p>
      <div class="chips" id="cat-chips"></div>
      <button type="button" class="btn-primary" id="cat-next" ${o.categories.length ? '' : 'disabled'}>Lanjut</button>
    `, { skipScroll: true });
    renderCatChips();
    $('cat-next')?.addEventListener('click', () => {
      if (!o.categories.length) return;
      o.step = 'experience';
      saveLocalState();
      renderOnboardingStep();
    });
  } else if (o.step === 'experience') {
    appendBubble('assistant', `
      <p><strong>Kamu penjual baru atau sudah berpengalaman?</strong></p>
      <div class="chips">
        <button type="button" class="chip" data-exp="first_time">Penjual baru</button>
        <button type="button" class="chip" data-exp="existing">Sudah berpengalaman</button>
      </div>
    `, { skipScroll: true });
    thread.querySelectorAll('[data-exp]').forEach(btn => {
      btn.addEventListener('click', () => {
        o.experience = btn.getAttribute('data-exp');
        o.step = o.experience === 'existing' ? 'pairing' : 'notes';
        saveLocalState();
        renderOnboardingStep();
      });
    });
  } else if (o.step === 'pairing') {
    appendBubble('assistant', `
      <p><strong>Mau produk yang cocok dipasangkan dengan produk kamu sekarang, atau coba yang benar-benar baru?</strong></p>
      <div class="chips">
        <button type="button" class="chip" data-pair="pairing">Pasangkan dengan yang sekarang</button>
        <button type="button" class="chip" data-pair="new">Coba yang benar-benar baru</button>
      </div>
    `, { skipScroll: true });
    thread.querySelectorAll('[data-pair]').forEach(btn => {
      btn.addEventListener('click', () => {
        o.pairingMode = btn.getAttribute('data-pair');
        if (o.pairingMode === 'pairing') {
          o.step = 'pairing_cat';
        } else {
          o.step = 'notes';
        }
        saveLocalState();
        renderOnboardingStep();
      });
    });
  } else if (o.step === 'pairing_cat') {
    appendBubble('assistant', `
      <p><strong>Produk kamu sekarang di kategori mana?</strong></p>
      <div class="chips" id="pair-cat-chips"></div>
    `, { skipScroll: true });
    const wrap = $('pair-cat-chips');
    if (wrap) {
      wrap.innerHTML = NU_ONB_CATS.map(c => {
        const slug = CAT_SLUG[c];
        return `<button type="button" class="chip cat" data-pcat="${esc(c)}"><img src="/images/onboarding/categories/${slug}.png" alt="" width="28" height="28">${esc(c)}</button>`;
      }).join('');
      wrap.querySelectorAll('[data-pcat]').forEach(btn => {
        btn.addEventListener('click', () => {
          o.pairingCategory = btn.getAttribute('data-pcat');
          o.step = 'notes';
          saveLocalState();
          renderOnboardingStep();
        });
      });
    }
  } else if (o.step === 'notes') {
    appendBubble('assistant', `
      <p><strong>Ada info lain tentang kamu?</strong> (opsional)</p>
      <textarea class="free-text" id="onb-notes" placeholder="Misal: modal kecil, kirim dari kos, mau dropship…">${esc(o.notes)}</textarea>
      <button type="button" class="btn-primary" id="onb-finish">Lihat rekomendasi</button>
      <button type="button" class="btn-ghost" id="onb-skip">Lewati</button>
    `, { skipScroll: true });
    $('onb-finish')?.addEventListener('click', () => {
      o.notes = $('onb-notes')?.value.trim() || '';
      void finishOnboarding();
    });
    $('onb-skip')?.addEventListener('click', () => {
      o.notes = '';
      void finishOnboarding();
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
  saveLocalState();
  await persistOnboardingPrefs();
  void logUserEvent('onboarding_complete', { ui: 'gpt', region: state.onboarding.city, categories: state.onboarding.categories, seller_status: state.onboarding.experience });
  clarityEvt('onboarding_complete', { ui: 'gpt' });
  await startRecommendationChat(true);
}

// ── Recommendations ──────────────────────────────────────────────────────
async function fetchNaikDaun(limit = 200) {
  if (!_supabase) return [];
  const { data } = await _supabase.from('mv_naik_daun')
    .select('item_id,shop_id,store_name,product_name,category,keyword,price,total_sold,reviews,rating,location,image_url,url,age_days,sold_per_day')
    .order('sold_per_day', { ascending: false }).limit(limit);
  return data || [];
}

function scoreProduct(row, o) {
  let s = Number(row.sold_per_day) || 0;
  const cats = o.categories || [];
  if (cats.length && cats.some(c => (row.category || '').toLowerCase().includes(c.toLowerCase().slice(0, 5)))) s += 50;
  if (o.city && (row.location || '').toLowerCase().includes(o.city.toLowerCase())) s += 20;
  if (o.pairingMode === 'pairing' && o.pairingCategory) {
    const pc = o.pairingCategory.toLowerCase();
    if ((row.category || '').toLowerCase().includes(pc.slice(0, 5))) s += 40;
  }
  if (o.pairingMode === 'new' && cats.length) {
    // Prefer rising outside exact category match slightly less — still allow
    if (!cats.some(c => (row.category || '').toLowerCase().includes(c.toLowerCase().slice(0, 5)))) s += 15;
  }
  return s;
}

async function pickRecommendations() {
  const rows = await fetchNaikDaun(200);
  const o = state.onboarding;
  const scored = rows.map(r => ({ r, s: scoreProduct(r, o) })).sort((a, b) => b.s - a.s);
  const seen = new Set();
  const out = [];
  for (const { r } of scored) {
    const key = `${r.item_id}_${r.shop_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= 3) break;
  }
  // Enrich with niche breakout when possible
  for (const p of out) {
    if (!p.keyword) continue;
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
  return `<button type="button" class="prod-card" data-prod="${esc(key)}" style="animation-delay:${i * 0.06}s">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<div class="prod-card-ph"></div>'}
    <div class="prod-card-body">
      <div class="prod-card-name">${esc(name)}</div>
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

  const frame = state.onboarding.pairingMode === 'pairing'
    ? `Berdasarkan data tren (naik daun) di kategori yang berdekatan dengan <strong>${esc(state.onboarding.pairingCategory || '')}</strong> — ini rekomendasi berbasis data, bukan tebakan AI.`
    : `Berdasarkan data tren penjualan Shopee yang difilter ke minat kamu${state.onboarding.city ? ` di sekitar <strong>${esc(state.onboarding.city)}</strong>` : ''} — rekomendasi berbasis data, bukan tebakan AI.`;

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
  setView('chat');
  if (state.onboarding.step !== 'done') {
    renderOnboardingStep();
    return;
  }
  await startRecommendationChat(false);
}

// ── Deep dive ────────────────────────────────────────────────────────────
async function openDeepDive(product) {
  if (!currentUser) {
    openAuthModal('signup', 'gpt_gate_deepdive');
    return;
  }
  state.deepdiveProduct = product;
  setView('deepdive');
  const root = $('deepdive-root');
  if (!root) return;
  root.innerHTML = `<p class="dd-sub">Memuat data Deep Dive…</p>`;

  const kw = product.keyword || '';
  let peers = [];
  let niche = product._niche || null;
  let suppliers = [];

  try {
    if (kw) {
      const { data } = await _supabase.from('listings')
        .select('item_id,shop_id,product_name,store_name,price,total_sold,reviews,rating,location,image_url,keyword,category')
        .gt('total_sold', 0)
        .ilike('keyword', `%${kw.slice(0, 40)}%`)
        .order('total_sold', { ascending: false })
        .limit(40);
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

  try {
    if (kw) {
      const { data } = await _supabase.from('mv_supplier_leaderboard')
        .select('store_name,location,hero_sold,catalog_items,has_new_listing,rnk')
        .eq('keyword', kw).order('rnk').limit(6);
      suppliers = data || [];
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
        showToast(`Batas harian tercapai — reset dalam ${formatCountdown(data.reset_at || wibMidnightReset())}`);
        setView('chat');
        return;
      }
      if (data?.chat) {
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

  const prices = peers.map(p => Number(p.price) || 0).filter(Boolean);
  const buckets = [
    { label: '< 100rb', fn: p => p < 100000 },
    { label: '100–150rb', fn: p => p >= 100000 && p < 150000 },
    { label: '150–200rb', fn: p => p >= 150000 && p < 200000 },
    { label: '200–300rb', fn: p => p >= 200000 && p < 300000 },
    { label: '> 300rb', fn: p => p >= 300000 },
  ].map(b => ({ ...b, count: prices.filter(b.fn).length }));
  const maxB = Math.max(...buckets.map(b => b.count), 1);

  const breakoutHtml = niche && niche.breakout_rate != null
    ? `<div class="dd-section"><h3>Peluang breakout</h3>
        <p style="margin:0;font-size:.9rem;line-height:1.5">Dari <strong>${esc(niche.new_items)}</strong> listing baru di keyword ini, <strong>${esc(niche.breakouts)}</strong> tembus 100+ terjual (<strong>${Number(niche.breakout_rate).toFixed(1)}%</strong>). Median harga pemenang: ${fmtRp(niche.median_winner_price)}.</p>
        <p style="margin:8px 0 0;font-size:.78rem;color:var(--muted)">Angka dari data historis LarisID — bukan prediksi AI.</p></div>`
    : '';

  const comps = peers.slice(0, 8).map((r, i) =>
    `<div class="comp-row"><span><strong>#${i + 1}</strong> ${esc((r.product_name || '').slice(0, 42))}</span><span>${fmtSold(r.total_sold)} · ${fmtRp(r.price)}</span></div>`
  ).join('') || '<p class="dd-sub">Kompetitor belum tersedia untuk keyword ini.</p>';

  const reviews = peers.filter(p => p.reviews > 0).slice(0, 8)
    .map(p => `<span class="review-pill">${esc((p.store_name || 'Toko').slice(0, 18))} · ${fmtSold(p.reviews)} ulasan · ★${Number(p.rating || 0).toFixed(1)}</span>`)
    .join('');

  const supplierHtml = suppliers.length
    ? `<div class="dd-section"><h3>Toko pemasok (leaderboard)</h3>${suppliers.map(s =>
        `<div class="comp-row"><span>${esc(s.store_name)}</span><span>${fmtSold(s.hero_sold)} hero · ${esc(s.location || '')}</span></div>`
      ).join('')}</div>`
    : '';

  root.innerHTML = `
    <div class="dd-head">
      <button type="button" class="btn-ghost" id="dd-back" style="margin:0 0 10px">Kembali ke chat</button>
      <h1 class="dd-title">${esc(product.product_name || product.keyword || 'Produk')}</h1>
      <p class="dd-sub">${esc(product.category || '')} · ${esc(product.location || '')} · keyword: ${esc(kw || '—')}</p>
      <span class="data-badge">Deep Dive data · composer tetap aktif di bawah</span>
    </div>
    <div class="dd-metrics">
      <div class="dd-metric"><div class="lbl">Harga</div><div class="val">${fmtRp(product.price)}</div></div>
      <div class="dd-metric"><div class="lbl">Terjual</div><div class="val">${fmtSold(product.total_sold)}</div></div>
      <div class="dd-metric"><div class="lbl">/ hari</div><div class="val">${fmtSold(product.sold_per_day)}</div></div>
      <div class="dd-metric"><div class="lbl">Ulasan</div><div class="val">${fmtSold(product.reviews)} · ★${Number(product.rating || 0).toFixed(1)}</div></div>
    </div>
    <div class="dd-section">
      <h3>Distribusi harga (keyword)</h3>
      <div id="dd-dist">${buckets.map(b => {
        const pct = prices.length ? Math.round(b.count / prices.length * 100) : 0;
        return `<div class="dist-bar"><div style="width:88px;color:var(--muted)">${esc(b.label)}</div><div class="track"><div class="fill" style="width:${Math.round(b.count / maxB * 100)}%"></div></div><div style="width:36px;text-align:right">${pct}%</div></div>`;
      }).join('') || '<p class="dd-sub">Belum ada data harga peer.</p>'}</div>
    </div>
    <div class="dd-section">
      <h3>Tren mingguan (estimasi dari sold/hari)</h3>
      <div class="dd-chart-wrap"><canvas id="dd-trend-canvas"></canvas></div>
      <p class="dd-sub" style="margin-top:8px">Jangkar Senin minggu ini. Estimasi sederhana dari kecepatan jual — bukan omset absolut panel scrape penuh.</p>
    </div>
    <div class="dd-section"><h3>Top kompetitor</h3>${comps}</div>
    ${breakoutHtml}
    ${supplierHtml}
    <div class="dd-section"><h3>Dinding ulasan (peer)</h3><div class="review-wall">${reviews || '<span class="dd-sub">Belum ada data ulasan.</span>'}</div></div>
    <button type="button" class="btn-ghost" id="btn-more-from-dd">Tampilkan produk lain</button>
  `;

  $('dd-back')?.addEventListener('click', () => { setView('chat'); renderChatThread(); });
  $('btn-more-from-dd')?.addEventListener('click', () => void startRecommendationChat(false));

  await larisEnsureChart();
  renderTrendChart(product);
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

function renderTrendChart(product) {
  const canvas = $('dd-trend-canvas');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_trendChart) { try { _trendChart.destroy(); } catch (_) {} }
  const spd = Number(product.sold_per_day) || 0;
  const price = Number(product.price) || 0;
  const mon = mondayOfWeek();
  const labels = [];
  const units = [];
  const omset = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() - i * 7);
    labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    // Soft variation around sold_per_day * 7 for illustrative weekly estimate
    const u = Math.max(0, Math.round(spd * 7 * (0.75 + (3 - i) * 0.08)));
    units.push(u);
    omset.push(u * price);
  }
  _trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Omset est.', data: omset, borderColor: '#1f1f1f', backgroundColor: 'rgba(31,31,31,.05)', borderWidth: 2, fill: true, tension: 0.3, yAxisID: 'y' },
        { label: 'Unit est.', data: units, borderColor: '#8e8e8e', backgroundColor: 'transparent', borderWidth: 2, tension: 0.3, yAxisID: 'y2' },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { position: 'left', ticks: { callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'jt' : v >= 1e3 ? Math.round(v / 1e3) + 'rb' : v } },
        y2: { position: 'right', grid: { drawOnChartArea: false } },
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

  // Free-text AI about product requires login
  if (state.view === 'deepdive' || activeChat()?.context?.product || activeChat()?.context?.keyword) {
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

  const product = state.deepdiveProduct || chat.context?.product;
  if (!product) {
    // No product context — try to treat as keyword search → new recommendation-ish fetch
    if (!(await ensureSearchAllowed())) return;
    appendBubble('assistant', `<p style="opacity:.7;animation:pulseSoft 1.2s infinite">Mencari di data…</p>`);
    const rows = await fetchNaikDaun(200);
    const q = lower;
    const hits = rows.filter(r =>
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.keyword || '').toLowerCase().includes(q) ||
      (r.category || '').toLowerCase().includes(q)
    ).slice(0, 3);
    state.recommendations = hits.length ? hits : rows.slice(0, 3);
    if (currentUser && _supabase && !chat.id) {
      const { data } = await _supabase.rpc('gpt_new_chat', { p_title: text.slice(0, 60), p_context: { kind: 'search', q: text } });
      if (data?.allowed === false) {
        showToast(`Batas harian tercapai — reset dalam ${formatCountdown(data.reset_at || wibMidnightReset())}`);
        return;
      }
      if (data?.chat) { chat.id = data.chat.id; delete chat.localId; state.activeChatId = chat.id; }
    } else if (!currentUser) {
      bumpAnonSearch();
    }
    const html = state.recommendations.length
      ? `<p>Hasil dari data LarisID untuk “${esc(text)}”:</p><div class="card-grid">${state.recommendations.map((p, i) => productCardHtml(p, i)).join('')}</div>`
      : `<p>Belum ketemu. Coba kata kunci lain atau buka Produk.</p>`;
    const thread = $('chat-thread');
    // replace loading: re-render last path simply by appending
    appendBubble('assistant', html);
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
async function openDirectory() {
  setView('directory');
  const cats = $('dir-cats');
  if (cats && !cats.dataset.ready) {
    cats.dataset.ready = '1';
    cats.innerHTML = `<button type="button" class="chip selected" data-dcat="">Semua</button>` +
      NU_ONB_CATS.map(c => `<button type="button" class="chip" data-dcat="${esc(c)}">${esc(c)}</button>`).join('');
    cats.querySelectorAll('[data-dcat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-dcat');
        if (cat && !currentUser) {
          openAuthModal('signup', 'gpt_gate_directory');
          return;
        }
        state.dirCat = cat || null;
        state.dirPage = 1;
        cats.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === btn));
        void renderDirectory();
      });
    });
  }
  await renderDirectory();
}

async function renderDirectory() {
  const grid = $('dir-grid');
  const pager = $('dir-pager');
  if (!grid) return;
  grid.innerHTML = '<p class="dd-sub">Memuat…</p>';
  let rows = await fetchNaikDaun(200);
  if (state.dirCat) {
    const c = state.dirCat.toLowerCase();
    rows = rows.filter(r => (r.category || '').toLowerCase().includes(c.slice(0, 5)));
  }
  state.dirRows = rows;
  const page = state.dirPage;
  if (page > 1 && !currentUser) {
    openAuthModal('signup', 'gpt_gate_directory');
    state.dirPage = 1;
  }
  const start = (state.dirPage - 1) * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);
  grid.innerHTML = slice.map((p, i) => productCardHtml(p, i % 3)).join('') || '<p class="dd-sub">Tidak ada produk.</p>';
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
  location.href = '/';
}

// ── Wire DOM ─────────────────────────────────────────────────────────────
function wireUi() {
  $('btn-menu')?.addEventListener('click', openSidebar);
  $('sidebar-backdrop')?.addEventListener('click', closeSidebar);
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

  if (state.onboarding.step !== 'done') {
    setView('chat');
    renderOnboardingStep();
  } else if (state.activeChatId && activeChat()) {
    setView('chat');
    renderChatThread();
  } else {
    setView('chat');
    renderOnboardingStep();
    // If onboarding done but no chat, show prompt
    if (state.onboarding.step === 'done') {
      const thread = $('chat-thread');
      if (thread) thread.innerHTML = '';
      appendBubble('assistant', `<p>Selamat datang kembali. Mulai <strong>Chat Baru</strong> untuk rekomendasi, atau tanya di kotak bawah.</p>
        <button type="button" class="btn-primary" id="welcome-new">Chat Baru</button>`);
      $('welcome-new')?.addEventListener('click', () => void newChatFlow());
    }
  }
  renderChatList();
}

boot();
})();
