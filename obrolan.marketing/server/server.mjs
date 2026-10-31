/**
 * School LMS on disk. Anton (obrolan.marketing) is the test school.
 * Each new coach gets their own file. Not the LarisID Postgres database.
 * Staff with the admin cookie get Anton's file only. A coach JWT is staff
 * only for the school they created. A student session gets only that student's row.
 * The invite code admits a new student. It does not unlock media.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = String(process.env.ANTON_ADMIN_KEY || '');
const DEFAULT_INVITE = String(process.env.ANTON_INVITE || 'ANTON-SEP26');
// Prefer LMS_SESSION_SECRET. Fall back so a restart keeps sessions when only the admin key is set.
const SESSION_SECRET = String(
  process.env.LMS_SESSION_SECRET ||
  process.env.ANTON_ADMIN_KEY ||
  crypto.randomBytes(32).toString('hex')
);
const SLUG = 'obrolan.marketing';
const ANTON_SLUG = SLUG;
const SUPA_URL = String(process.env.SUPABASE_URL || 'https://api.larisid.com').replace(/\/+$/, '');
const SUPA_ANON = String(process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec');
const MENTOR_BANDS = ['1-10', '11-20', '21-30', '31-50', '51-100', '100+'];
/** Platform LMS admin (mentor/student totals). Bearer email must match. */
const PLATFORM_ADMIN_EMAILS = new Set(
  String(process.env.LMS_PLATFORM_ADMIN_EMAILS || 'stevenwilson614@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);
const RESERVED_SLUGS = new Set([
  'lms', 'harga', 'tentang', 'cara-kerja', 'perbandingan', 'riset', 'privacy', 'panduan',
  'kota', 'kalkulator', 'rise', 'data', 'expor', 'js', 'images', 'fonts', 'styles', 'api',
  's', 'gpt', 'admin', 'www', 'login', 'daftar', 'sitemap', 'robots', 'llms', 'assets',
  'school', 'affiliate', 'auth', 'functions', 'rest', 'storage', 'realtime', 'mcp', 'sso',
  'obrolan', 'index', 'favicon', 'manifest', 'health', 'gate', 'slug', 'schools', 'owners',
  'media', 'events', 'issues', 'webhooks', 'pay', 'wa', 'state'
]);
const MAX_STATE = 5 * 1024 * 1024;
const MAX_PART = 8 * 1024 * 1024;
const MAX_VIDEO = 5 * 1024 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_KUR_FILE = 200 * 1024 * 1024;
const MAX_EVENT_BYTES = 16 * 1024;

const stateDir = path.join(DATA, 'state');
const ownersFile = path.join(DATA, 'owners.json');
const mediaDir = path.join(DATA, 'media');
const uploadDir = path.join(DATA, 'uploads');
const eventsFile = path.join(DATA, 'events.jsonl');
const issuesFile = path.join(DATA, 'issues.json');
const lynkPayFile = path.join(DATA, 'lynk-payments.jsonl');
const lynkUnmatchedFile = path.join(DATA, 'lynk-unmatched.json');
const payEventsFile = path.join(DATA, 'pay-events.jsonl');
const paySecretsDir = path.join(DATA, 'pay-secrets');
const LYNK_KEY = String(process.env.LYNK_MERCHANT_KEY || '');

for (const dir of [stateDir, mediaDir, uploadDir, paySecretsDir]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(issuesFile)) fs.writeFileSync(issuesFile, '[]');

let chain = Promise.resolve();
function lock(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function json(res, status, data, extra) {
  const body = JSON.stringify(data);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex'
  };
  if (extra) Object.assign(headers, extra);
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function statePath(slug) {
  return path.join(stateDir, (slug || ANTON_SLUG) + '.json');
}

function validSchoolSlug(slug) {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(String(slug || ''));
}

function schoolFile(slug) {
  return path.join(stateDir, slug + '.json');
}

function slugStatus(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (!validSchoolSlug(slug) || RESERVED_SLUGS.has(slug) || slug === ANTON_SLUG) return 'reserved';
  if (fs.existsSync(schoolFile(slug))) return 'taken';
  return 'free';
}

function resolveLiveSlug(raw) {
  const slug = String(raw || ANTON_SLUG).trim().toLowerCase();
  if (slug === ANTON_SLUG) return ANTON_SLUG;
  if (slugStatus(slug) === 'taken') return slug;
  return '';
}

function readOwners() {
  try { return JSON.parse(fs.readFileSync(ownersFile, 'utf8')); } catch (err) { return {}; }
}

function writeOwners(map) {
  const tmp = ownersFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(map));
  fs.renameSync(tmp, ownersFile);
}

function ownerOf(slug) {
  const map = readOwners();
  const ids = Object.keys(map);
  for (let i = 0; i < ids.length; i += 1) {
    if (map[ids[i]] === slug) return ids[i];
  }
  return '';
}

function bearerToken(req) {
  const header = String((req.headers && req.headers.authorization) || '');
  if (header.slice(0, 7).toLowerCase() !== 'bearer ') return '';
  return header.slice(7).trim();
}

async function supabaseUser(req) {
  const token = bearerToken(req);
  if (!token) return null;
  if (process.env.LMS_AUTH_STUB === '1' && token.indexOf('stub:') === 0) {
    const id = token.slice(5).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    return id ? { id: id, email: id + '@stub.local' } : null;
  }
  try {
    const res = await fetch(SUPA_URL + '/auth/v1/user', {
      headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || !user.id) return null;
    return user;
  } catch (err) {
    return null;
  }
}

function isStaffFor(req, q, slug, user) {
  if (asStudentView(req)) return false;
  if (slug === ANTON_SLUG && adminAuthed(req, q)) return true;
  if (!user || !user.id) return false;
  if (ownerOf(slug) === user.id) return true;
  try {
    const rec = readState(slug);
    const stateOwner = rec && rec.state && rec.state.ownerUserId;
    if (stateOwner && stateOwner === user.id) {
      const owners = readOwners();
      if (owners[user.id] !== slug) {
        owners[user.id] = slug;
        writeOwners(owners);
      }
      return true;
    }
  } catch (err) { /* ignore */ }
  return false;
}

function clip(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanSocials(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  ['website', 'facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube'].forEach((key) => {
    out[key] = clip(src[key], 200);
  });
  return out;
}

function saveProfilePhoto(slug, dataUrl) {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!match) return '';
  const buf = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buf.length < 32 || buf.length > 1500000) return '';
  const ext = match[1] === 'png' ? 'png' : (match[1] === 'webp' ? 'webp' : 'jpg');
  const key = slug + '/profile.' + ext;
  const dest = path.join(mediaDir, slug, 'profile.' + ext);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  fs.writeFileSync(dest + '.json', JSON.stringify({ key: key, type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext), size: buf.length }));
  return '/obrolan.marketing/api/media/file?key=' + encodeURIComponent(key);
}

function inviteFromLabel(label) {
  const raw = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return raw.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function derivedInvite(state, slug) {
  const business = inviteFromLabel(state && state.businessName);
  if (business) return business;
  return inviteFromLabel((state && state.schoolSlug) || slug || '');
}

/** Platform Alat shipped to every new LMS school (not Anton’s lynk catalog). */
function platformCalcSku() {
  return {
    id: 'calc',
    group: 'alat',
    kind: 'tool',
    title: 'TikTok Seller Profit Calculator',
    job: 'Set harga, cek margin, dan simulasi laba rugi. Tarif kategori TikTok.',
    price: 0,
    coret: 0,
    mentorPrice: 0,
    lynk: '',
    cover: './assets/obrolan/cover-calc.webp',
    sheet: './assets/obrolan/calc-sheet.png',
    iframe: './tools/harga.html',
    example: false,
    includedInMentoring: true,
    platform: true
  };
}

/** Ensure platform tools exist on non-Anton schools. Returns true if catalog changed. */
function ensurePlatformCatalog(state, slug) {
  if (!state || typeof state !== 'object' || slug === ANTON_SLUG) return false;
  if (!Array.isArray(state.catalog)) state.catalog = [];
  if (state.catalog.some((p) => p && p.id === 'calc')) return false;
  state.catalog.push(platformCalcSku());
  return true;
}

function emptySchool(slug, user, body, photoUrl) {
  const ownerId = 'u-' + String(user.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  const socials = cleanSocials(body.socials);
  const businessName = clip(body.businessName, 80);
  return {
    key: '',
    rev: 1,
    updatedAt: new Date().toISOString(),
    state: {
      schoolSlug: slug,
      businessName: businessName,
      mentorBand: body.mentorBand,
      ownerId: ownerId,
      ownerUserId: user.id,
      inviteCode: crypto.randomBytes(9).toString('hex'),
      inviteCodeCustom: true,
      schoolProfile: {
        firstName: clip(body.firstName, 40),
        lastName: clip(body.lastName, 80),
        headline: clip(body.headline, 60),
        biography: clip(body.biography, 800),
        photoMode: 'upload',
        photoUrl: photoUrl || '',
        socials: socials
      },
      lectures: [],
      catalog: [platformCalcSku()],
      weeks: [],
      sessions: [],
      pricing: {},
      bank: {},
      people: {},
      liveStudents: [],
      applications: {},
      billing: {},
      crm: {},
      progress: {},
      lastLecture: {},
      enrollments: {},
      timeline: {},
      notes: {},
      tasks: [],
      payments: [],
      remittances: [],
      waQueue: [],
      emailQueue: [],
      waThreads: [],
      waMessages: [],
      posts: [],
      comments: [],
      threads: [],
      replies: [],
      announcements: [],
      chats: {},
      attendance: {},
      directory: [],
      accountSettings: {
        email: ownerAuthEmail(user),
        twoFactor: false,
        passwordSet: false,
        notifications: { studentJoin: true, studentPay: true, lessonComplete: false, comment: true }
      },
      ownerContact: { wa: '', email: ownerAuthEmail(user), waFab: false }
    }
  };
}

function ownerAuthEmail(user) {
  return String(user && user.email || '').trim().slice(0, 160);
}

/** Fill a blank mentor email from Google/password auth. Never replace one they already saved. */
function applyOwnerEmail(state, user) {
  const email = ownerAuthEmail(user);
  if (!email || !state || typeof state !== 'object') return false;
  let changed = false;
  if (!state.accountSettings || typeof state.accountSettings !== 'object' || Array.isArray(state.accountSettings)) {
    state.accountSettings = {};
    changed = true;
  }
  if (!String(state.accountSettings.email || '').trim()) {
    state.accountSettings.email = email;
    changed = true;
  }
  if (!state.ownerContact || typeof state.ownerContact !== 'object' || Array.isArray(state.ownerContact)) {
    state.ownerContact = { wa: '', email: '', waFab: false };
    changed = true;
  }
  if (!String(state.ownerContact.email || '').trim()) {
    state.ownerContact.email = email;
    changed = true;
  }
  return changed;
}

function fillOwnerEmail(slug, user) {
  if (!slug || !ownerAuthEmail(user)) return;
  const rec = readState(slug);
  if (!rec || !rec.state || !applyOwnerEmail(rec.state, user)) return;
  rec.rev = (Number(rec.rev) || 0) + 1;
  rec.updatedAt = new Date().toISOString();
  writeState(rec, slug);
}

function profileKeyOk(key) {
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\/profile\.(png|jpe?g|webp)$/.test(String(key || ''));
}

/** Key stored on schoolProfile after a mentor upload (slug/photo-school/hex). */
function schoolPhotoKeyFromState(slug) {
  const rec = readState(slug);
  const sp = (rec && rec.state && rec.state.schoolProfile) || {};
  const pk = String(sp.photoKey || '').trim();
  if (pk) return pk;
  const url = String(sp.photoUrl || '');
  const m = /[?&]key=([^&]+)/.exec(url);
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (err) { return m[1]; }
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Public school card for PWA manifest + WhatsApp/OG share previews. */
function schoolBrandCard(req, rawSlug) {
  const slug = resolveLiveSlug(rawSlug) || (rawSlug === ANTON_SLUG ? ANTON_SLUG : '');
  if (!slug) return null;
  const rec = readState(slug);
  if (!rec && slug !== ANTON_SLUG) return null;
  const state = (rec && rec.state) || {};
  const sp = state.schoolProfile || {};
  const name = String(state.businessName || '').trim()
    || [sp.firstName, sp.lastName].filter(Boolean).join(' ').trim()
    || (slug === ANTON_SLUG ? 'MasterMind with Anton GC' : 'Kelas');
  const short = String(state.businessName || '').trim().slice(0, 12)
    || name.split(/\s+/).slice(0, 2).join(' ').slice(0, 12)
    || 'Kelas';
  const startPath = slug === ANTON_SLUG ? '/s/obrolan.marketing/' : ('/s/' + slug + '/');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'larisid.com').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const origin = proto + '://' + host;
  let icon = origin + '/obrolan.marketing/assets/obrolan/logo-mark.png';
  const photoUrl = String(sp.photoUrl || '').trim();
  let photoKey = schoolPhotoKeyFromState(slug);
  if (!photoKey) {
    ['png', 'jpg', 'jpeg', 'webp'].some((ext) => {
      const cand = slug + '/profile.' + ext;
      if (fs.existsSync(mediaFile(cand))) {
        photoKey = cand;
        return true;
      }
      return false;
    });
  }
  if (photoUrl) {
    icon = photoUrl.startsWith('http') ? photoUrl : (origin + (photoUrl.startsWith('/') ? photoUrl : '/' + photoUrl));
  } else if (photoKey) {
    icon = origin + '/obrolan.marketing/api/media/file?key=' + encodeURIComponent(photoKey);
  } else if (slug === ANTON_SLUG) {
    icon = origin + '/obrolan.marketing/assets/obrolan/profile.png';
  }
  const headline = String(sp.headline || '').trim();
  return { slug, name, short, startPath, origin, icon, headline };
}

/**
 * School branding photos stay public (no cookie). Signup writes slug/profile.*,
 * Profile picture tab writes slug/photo-school/{hex}. Students and Add-to-Home-Screen
 * icons need that without a media session.
 */
function publicPhotoKey(key) {
  const k = String(key || '');
  if (profileKeyOk(k)) return true;
  const parts = k.split('/');
  if (parts.length !== 3) return false;
  const slug = mediaSlug(parts[0]);
  if (!slug || slug !== parts[0]) return false;
  if (parts[1] === 'photo-school' && /^[A-Za-z0-9]{8,64}$/.test(parts[2])) return true;
  const current = schoolPhotoKeyFromState(slug);
  return !!(current && current === k);
}

function readState(slug) {
  try {
    return JSON.parse(fs.readFileSync(statePath(slug), 'utf8'));
  } catch (err) {
    return null;
  }
}

const STATE_BAK_KEEP = 5;

/** Keep the previous school file as `{slug}.json.bak.1` (newest) through `.bak.5`. */
function rotateStateBackup(file) {
  if (!file || !fs.existsSync(file)) return;
  const oldest = file + '.bak.' + STATE_BAK_KEEP;
  if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  for (let i = STATE_BAK_KEEP - 1; i >= 1; i--) {
    const src = file + '.bak.' + i;
    if (!fs.existsSync(src)) continue;
    fs.renameSync(src, file + '.bak.' + (i + 1));
  }
  fs.copyFileSync(file, file + '.bak.1');
}

function writeState(rec, slug) {
  const file = statePath(slug);
  try { rotateStateBackup(file); } catch (err) {
    console.warn('state-backup ' + (slug || '') + ' ' + (err && err.message ? err.message : 'fail'));
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec));
  fs.renameSync(tmp, file);
}

/** One code per school. Anton's default is only valid on his school. */
function currentInvite(rec, slug) {
  const state = (rec && rec.state) || {};
  const stored = String(state.inviteCode || '').trim();
  if (slug === ANTON_SLUG) {
    if (state.inviteCodeCustom === true && stored && stored !== DEFAULT_INVITE) return stored;
    if (stored && state.inviteCodeCustom !== false && stored !== DEFAULT_INVITE) return stored;
    return DEFAULT_INVITE;
  }
  if (state.inviteCodeCustom === true && stored && stored !== DEFAULT_INVITE) return stored;
  return '';
}

function inviteNeedsRotate(state, slug) {
  if (!state || slug === ANTON_SLUG) return false;
  const stored = String(state.inviteCode || '').trim();
  if (state.inviteCodeCustom === true && stored && stored !== DEFAULT_INVITE) return false;
  return true;
}

function inviteAccepted(rec, got, slug) {
  return sameSecret(got, currentInvite(rec, slug));
}

function bodyInvite(body, q) {
  const src = body && typeof body === 'object' ? body : {};
  const query = q || {};
  return String(src.invite || src.k || query.invite || query.k || '').trim();
}

/** Keep a random school code if a browser hydrated the old name-derived one. */
function keepServerInvite(prev, next, slug) {
  if (!prev || !next || slug === ANTON_SLUG) return;
  const stored = String(prev.inviteCode || '').trim();
  if (!(prev.inviteCodeCustom === true && stored && stored !== DEFAULT_INVITE)) return;
  const incoming = String(next.inviteCode || '').trim();
  const derived = derivedInvite(prev, slug);
  const clientKept = next.inviteCodeCustom === true && incoming && incoming !== DEFAULT_INVITE && incoming !== derived;
  if (clientKept) return;
  next.inviteCode = stored;
  next.inviteCodeCustom = true;
}

function sameSecret(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function cookieValue(req, name) {
  const raw = String((req.headers && req.headers.cookie) || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

function adminAuthed(req, q) {
  if (!ADMIN_KEY) return false;
  if (sameSecret(q.key, ADMIN_KEY)) return true;
  return cookieValue(req, 'anton_admin') === '1';
}

function platformAdminEmail(user) {
  const email = String((user && user.email) || '').trim().toLowerCase();
  return email && PLATFORM_ADMIN_EMAILS.has(email);
}

function countSchoolStudents(state) {
  const seen = new Set();
  (state && state.liveStudents || []).forEach((row) => {
    if (!row || !row.id || isDemoId(row.id) || seen.has(row.id)) return;
    seen.add(row.id);
  });
  const apps = (state && state.applications) || {};
  Object.keys(apps).forEach((id) => {
    if (!id || isDemoId(id) || seen.has(id)) return;
    if (apps[id] && apps[id].at) seen.add(id);
  });
  return seen.size;
}

function schoolDisplayLabel(state, slug) {
  const src = state || {};
  const profile = src.schoolProfile && typeof src.schoolProfile === 'object' ? src.schoolProfile : {};
  const full = [profile.firstName, profile.lastName].map((p) => String(p || '').trim()).filter(Boolean).join(' ');
  return clip(src.businessName || full || src.schoolSlug || slug, 120) || slug;
}

function listSchoolSlugs() {
  const out = new Set();
  try {
    fs.readdirSync(stateDir).forEach((name) => {
      if (!name.endsWith('.json') || name.indexOf('.bak.') >= 0 || name.endsWith('.tmp')) return;
      const slug = name.slice(0, -5);
      if (slug) out.add(slug);
    });
  } catch (err) { /* empty volume */ }
  const owners = readOwners();
  Object.keys(owners).forEach((uid) => {
    const slug = String(owners[uid] || '').trim();
    if (slug) out.add(slug);
  });
  return Array.from(out);
}

function platformSummary() {
  const owners = readOwners();
  const ownerBySlug = {};
  Object.keys(owners).forEach((uid) => {
    const slug = String(owners[uid] || '').trim();
    if (slug && !ownerBySlug[slug]) ownerBySlug[slug] = uid;
  });
  const mentors = [];
  listSchoolSlugs().forEach((slug) => {
    const rec = readState(slug);
    const state = (rec && rec.state) || null;
    if (!state) return;
    const contact = state.ownerContact && typeof state.ownerContact === 'object' ? state.ownerContact : {};
    const account = state.accountSettings && typeof state.accountSettings === 'object' ? state.accountSettings : {};
    const students = countSchoolStudents(state);
    const kur = state.kurikulum && typeof state.kurikulum === 'object' ? state.kurikulum : {};
    mentors.push({
      slug: slug,
      name: schoolDisplayLabel(state, slug),
      email: clip(account.email || contact.email || '', 120),
      ownerUserId: String(state.ownerUserId || ownerBySlug[slug] || ''),
      students: students,
      published: kur.published !== false && curriculumVisible(state, slug),
      updatedAt: (rec && rec.updatedAt) || ''
    });
  });
  mentors.sort((a, b) => {
    if (b.students !== a.students) return b.students - a.students;
    return String(a.name).localeCompare(String(b.name), 'id');
  });
  const studentTotal = mentors.reduce((sum, row) => sum + (Number(row.students) || 0), 0);
  return {
    mentorCount: mentors.length,
    studentCount: studentTotal,
    mentors: mentors
  };
}

function adminCookie(req, value, maxAge) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  const age = maxAge == null ? '' : '; Max-Age=' + maxAge;
  return 'anton_admin=' + value + '; HttpOnly; SameSite=Lax; Path=/obrolan.marketing' + secure + age;
}

function uploadCap(kind, kurikulum) {
  if (kind === 'image') return MAX_IMAGE;
  if (kind === 'file') return kurikulum ? MAX_KUR_FILE : MAX_FILE;
  return MAX_VIDEO;
}

function queryOf(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function mediaSlug(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (!slug || slug === ANTON_SLUG) return ANTON_SLUG;
  return resolveLiveSlug(slug);
}

function keyOk(key) {
  const parts = String(key || '').split('/');
  if (parts.length !== 3) return false;
  const slug = mediaSlug(parts[0]);
  if (!slug || slug !== parts[0]) return false;
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(parts[1])) return false;
  if (!/^[A-Za-z0-9]{8,64}$/.test(parts[2])) return false;
  return true;
}

function mediaGrantRole(staff, staffRow) {
  if (staff) return 'owner';
  if (!staffRow) return '';
  const perms = cleanStaffPerms(staffRow.permissions);
  if (perms.editClasses) return 'edit';
  if (perms.viewClasses) return 'view';
  return '';
}

function signMedia(slug, role) {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ s: slug, e: exp, r: role }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return payload + '.' + sig;
}

const PLAY_TOKEN_MS = 90 * 60 * 1000;

function readMediaMeta(key) {
  try { return JSON.parse(fs.readFileSync(metaFile(key), 'utf8')); } catch (err) { return {}; }
}

function curriculumVideoKey(key) {
  const slug = String(key || '').split('/')[0];
  if (!slug) return false;
  const rec = readState(slug);
  const lectures = rec && rec.state && Array.isArray(rec.state.lectures) ? rec.state.lectures : [];
  return lectures.some((lec) => lec && String(lec.videoKey || '') === key);
}

/** Kurikulum video only. Images, lembar kerja, and diskusi files stay cookie-only. */
function videoNeedsPlayToken(key, meta) {
  const info = meta || {};
  const kind = String(info.kind || '');
  if (kind === 'image' || kind === 'file') return false;
  if (kind === 'video') return true;
  const mime = String(info.type || '').toLowerCase().trim();
  const name = String(info.name || '');
  if (mime.startsWith('video/')) {
    if (/\.(pdf|docx?|xlsx?|pptx?|zip|txt|csv|png|jpe?g|webp|gif)$/i.test(name)) return false;
    return true;
  }
  if (mime) return false;
  return curriculumVideoKey(key);
}

function playActor(req, slug) {
  const grant = readMediaGrant(req);
  if (grant && grant.slug === slug) return 'staff';
  const studentId = readStudentCookie(req);
  if (studentId) return 'stu:' + studentId;
  return 'staff';
}

function signPlayToken(key, actor) {
  const exp = Date.now() + PLAY_TOKEN_MS;
  const payload = Buffer.from(JSON.stringify({ k: key, e: exp, a: actor }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return { token: payload + '.' + sig, exp };
}

function readPlayToken(raw) {
  const text = String(raw || '');
  const dot = text.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const sig = text.slice(dot + 1);
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (!sameSecret(sig, expect)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (err) { return null; }
  if (!data || !data.k || Number(data.e) < Date.now()) return null;
  return { key: String(data.k), exp: Number(data.e), actor: String(data.a || '') };
}

function playFileUrl(key, token) {
  const slug = String(key || '').split('/')[0];
  return '/obrolan.marketing/api/media/file?key=' + encodeURIComponent(key) +
    '&slug=' + encodeURIComponent(slug) +
    '&t=' + encodeURIComponent(token);
}

function readMediaGrant(req) {
  const raw = cookieValue(req, 'lms_media');
  const dot = String(raw || '').lastIndexOf('.');
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  if (!sameSecret(sig, expect)) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (err) { return null; }
  if (!data || !data.s || Number(data.e) < Date.now()) return null;
  if (data.r !== 'owner' && data.r !== 'edit' && data.r !== 'view') return null;
  return { slug: String(data.s), role: data.r };
}

function mediaCookie(req, slug, role) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  return 'lms_media=' + signMedia(slug, role) + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200' + secure;
}

function mediaCookieHeader(req, slug, role) {
  if (!role) return null;
  return { 'set-cookie': mediaCookie(req, slug, role) };
}

async function requestIsStaff(req, q, slug) {
  const live = mediaSlug(slug);
  if (!live || asStudentView(req)) return false;
  const grant = readMediaGrant(req);
  if (grant && grant.slug === live) return true;
  const user = await supabaseUser(req);
  if (isStaffFor(req, q, live, user)) return true;
  const rec = readState(live);
  return !!activeStaffRow((rec && rec.state) || {}, readStaffCookie(req));
}

async function mediaWriteOk(req, q, slug) {
  const live = mediaSlug(slug);
  if (!live || asStudentView(req)) return false;
  const grant = readMediaGrant(req);
  if (grant && grant.slug === live && (grant.role === 'owner' || grant.role === 'edit')) return true;
  const user = await supabaseUser(req);
  if (isStaffFor(req, q, live, user)) return true;
  const rec = readState(live);
  const row = activeStaffRow((rec && rec.state) || {}, readStaffCookie(req));
  return !!(row && cleanStaffPerms(row.permissions).editClasses);
}

async function mediaReadOk(req, q, slug) {
  const live = mediaSlug(slug);
  if (!live) return false;
  const rec = readState(live);
  const state = (rec && rec.state) || {};
  const grant = readMediaGrant(req);
  if (grant && grant.slug === live) return true;
  const user = await supabaseUser(req);
  if (isStaffFor(req, q, live, user)) return true;
  if (!asStudentView(req) && activeStaffRow(state, readStaffCookie(req))) return true;
  const studentId = readStudentCookie(req);
  if (!(studentId && lookupPerson(state, studentId))) return false;
  return curriculumVisible(state, live);
}

function mediaFile(key) {
  return path.join(mediaDir, key.split('/').join(path.sep));
}

function metaFile(key) {
  return mediaFile(key) + '.json';
}

function appendEvent(row) {
  fs.appendFileSync(eventsFile, JSON.stringify(row) + '\n');
}

function readEvents() {
  if (!fs.existsSync(eventsFile)) return [];
  const stat = fs.statSync(eventsFile);
  const start = Math.max(0, stat.size - 2 * 1024 * 1024);
  const fd = fs.openSync(eventsFile, 'r');
  const buf = Buffer.alloc(stat.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const text = buf.toString('utf8');
  const lines = text.split('\n');
  if (start > 0) lines.shift();
  const out = [];
  lines.forEach((line) => {
    if (!line) return;
    try { out.push(JSON.parse(line)); } catch (err) { /* skip torn line */ }
  });
  return out;
}

function readIssues() {
  try {
    const list = JSON.parse(fs.readFileSync(issuesFile, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeIssues(list) {
  const tmp = issuesFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list));
  fs.renameSync(tmp, issuesFile);
}

function dayKey(iso, zone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch (err) {
    return String(iso || '').slice(0, 10);
  }
}

function summary() {
  const events = readEvents().filter((ev) => ev && !ev.staff && !ev.demo && ev.visitorId);
  const issues = readIssues();
  const now = new Date();
  const today = dayKey(now.toISOString(), 'Asia/Jakarta');
  const weekAgo = now.getTime() - 7 * 86400000;
  function inWin(ev, days) {
    const t = new Date(ev.at || 0).getTime();
    if (days === 0) return dayKey(ev.at, 'Asia/Jakarta') === today;
    return t >= weekAgo;
  }
  function counts(days) {
    const rows = events.filter((ev) => inWin(ev, days));
    const visitors = new Set(rows.filter((ev) => ev.type === 'page_view').map((ev) => ev.visitorId));
    return {
      visitors: visitors.size,
      joins: rows.filter((ev) => ev.type === 'join').length,
      lessonOpens: rows.filter((ev) => ev.type === 'lesson_open').length
    };
  }
  const users = new Map();
  events.forEach((ev) => {
    let u = users.get(ev.visitorId);
    if (!u) {
      u = {
        visitorId: ev.visitorId,
        name: '',
        wa: '',
        email: '',
        first: ev.at,
        last: ev.at,
        lessons: [],
        progress: null,
        stage: '',
        openIssues: 0
      };
      users.set(ev.visitorId, u);
    }
    if (ev.at && (!u.first || ev.at < u.first)) u.first = ev.at;
    if (ev.at && ev.at > u.last) u.last = ev.at;
    if (ev.name) u.name = ev.name;
    if (ev.wa) u.wa = ev.wa;
    if (ev.email) u.email = ev.email;
    if (ev.stage) u.stage = ev.stage;
    if (ev.progress != null && ev.progress !== '') u.progress = Number(ev.progress);
    if (ev.lessonId && u.lessons.indexOf(ev.lessonId) < 0) u.lessons.push(ev.lessonId);
  });
  issues.forEach((issue) => {
    if (!issue || issue.status === 'resolved' || !issue.visitorId) return;
    const u = users.get(issue.visitorId);
    if (u) u.openIssues += 1;
  });
  const userRows = Array.from(users.values()).map((u) => ({
    visitorId: u.visitorId,
    name: u.name || '',
    wa: u.wa || '',
    email: u.email || '',
    first: u.first,
    last: u.last,
    lessons: u.lessons.length,
    progress: u.progress,
    stage: u.stage || '',
    openIssues: u.openIssues
  })).sort((a, b) => String(b.last).localeCompare(String(a.last)));
  const arrivals = events
    .filter((ev) => ev.type === 'page_view' || ev.type === 'join')
    .slice(-200)
    .reverse();
  const openIssues = issues.filter((i) => i.status !== 'resolved')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const resolved = issues.filter((i) => i.status === 'resolved').slice(-30).reverse();
  const state = readState();
  const st = (state && state.state) || {};
  const replies = st.replies || [];
  const diskusi = (st.threads || []).filter((t) => !replies.some((r) => r.threadId === t.id && r.isStaff))
    .map((t) => ({
      id: t.id,
      title: t.title || '',
      body: t.body || '',
      lectureId: t.lectureId || '',
      authorId: t.authorId || '',
      at: t.createdAt || ''
    }));
  return {
    today: counts(0),
    week: counts(7),
    arrivals,
    issues: openIssues,
    resolved,
    users: userRows,
    diskusi,
    lynkUnmatched: readUnmatched().slice(-40).reverse()
  };
}

function readUnmatched() {
  try {
    const list = JSON.parse(fs.readFileSync(lynkUnmatchedFile, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function writeUnmatched(list) {
  const tmp = lynkUnmatchedFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list.slice(-200)));
  fs.renameSync(tmp, lynkUnmatchedFile);
}

function seenLynkRef(refId) {
  if (!refId || !fs.existsSync(lynkPayFile)) return false;
  const stat = fs.statSync(lynkPayFile);
  const start = Math.max(0, stat.size - 1024 * 1024);
  const fd = fs.openSync(lynkPayFile, 'r');
  const buf = Buffer.alloc(stat.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n');
  if (start > 0) lines.shift();
  return lines.some((line) => {
    if (!line) return false;
    try { return JSON.parse(line).refId === refId; } catch (err) { return false; }
  });
}

function recordLynkPayment(row) {
  fs.appendFileSync(lynkPayFile, JSON.stringify(row) + '\n');
}

function lynkSignature(amount, refId, messageId, key) {
  return crypto.createHash('sha256')
    .update(String(amount) + String(refId) + String(messageId) + (key || LYNK_KEY))
    .digest('hex');
}

function sigEqual(a, b) {
  const left = Buffer.from(String(a || '').toLowerCase());
  const right = Buffer.from(String(b || '').toLowerCase());
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function dig(obj, paths) {
  for (const keys of paths) {
    let cur = obj;
    let ok = true;
    for (const key of keys) {
      if (!cur || typeof cur !== 'object' || cur[key] == null || cur[key] === '') {
        ok = false;
        break;
      }
      cur = cur[key];
    }
    if (ok) return cur;
  }
  return '';
}

function amountString(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function phoneKey(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  if (d.indexOf('8') === 0 && d.length >= 9) d = '62' + d;
  return d;
}

function phonesMatch(a, b) {
  const left = phoneKey(a);
  const right = phoneKey(b);
  if (left.length < 10 || right.length < 10) return false;
  if (left === right) return true;
  return left.slice(-10) === right.slice(-10);
}

function isDemoId(id) {
  return /^s-/.test(String(id || ''));
}

function isStudentKey(id) {
  return /^(stu_[a-f0-9]{8,32}|live-[A-Za-z0-9]{4,40})$/.test(String(id || ''));
}

function addPeople(map, id, wa, name) {
  if (!id || !wa || isDemoId(id)) return;
  const prev = map.get(id) || { id: String(id), wa: '', name: '' };
  prev.wa = String(wa);
  if (name) prev.name = String(name);
  map.set(id, prev);
}

function peopleInState(state) {
  const map = new Map();
  (state.liveStudents || []).forEach((s) => s && !isDemoId(s.id) && addPeople(map, s.id, s.wa, s.name));
  const people = state.people || {};
  Object.keys(people).forEach((id) => addPeople(map, id, people[id] && people[id].wa, people[id] && people[id].name));
  const apps = state.applications || {};
  Object.keys(apps).forEach((id) => addPeople(map, id, apps[id] && apps[id].wa, apps[id] && apps[id].name));
  const billing = state.billing || {};
  Object.keys(billing).forEach((id) => addPeople(map, id, billing[id] && billing[id].payerWa, ''));
  return Array.from(map.values());
}

function normTitle(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function lynkCatalog(state) {
  const raw = (state && state.lynkProducts) || {};
  return ['month', 'quarter', 'half'].map((term) => {
    const row = raw[term] || {};
    return {
      term,
      title: String(row.title || '').trim(),
      url: String(row.url || '').trim(),
      price: Number(row.price) || 0
    };
  }).filter((row) => row.title);
}

function itemTitles(body) {
  const raw = dig(body, [['items'], ['data', 'items'], ['products'], ['data', 'products']]);
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
  return list.map((item) => String((item && (item.title || item.name || item.product_name || item.productName)) || '').trim()).filter(Boolean);
}

function termMonths(term) {
  if (term === 'quarter') return 3;
  if (term === 'half') return 6;
  return 1;
}

function termLabel(term) {
  if (term === 'quarter') return '3 bulan';
  if (term === 'half') return '6 bulan';
  return '1 bulan';
}

function addMonths(from, months) {
  const until = new Date(from.getTime());
  until.setMonth(until.getMonth() + (Number(months) || 1));
  return until;
}

function extendUntil(existingIso, months) {
  const now = new Date();
  let base = now;
  if (existingIso) {
    const cur = new Date(existingIso);
    if (Number.isFinite(cur.getTime()) && cur.getTime() > now.getTime()) base = cur;
  }
  return addMonths(base, months).toISOString();
}

function grantPaid(state, person, opts) {
  const id = person.id;
  const now = new Date();
  const months = Math.max(1, Number(opts.months) || 1);
  const source = String(opts.source || 'manual');
  const label = String(opts.label || (months + ' bulan'));
  state.billing = state.billing || {};
  const prev = state.billing[id] || {};
  const products = Array.isArray(prev.products) ? prev.products : [];
  state.billing[id] = Object.assign({}, prev, {
    status: 'lunas',
    plan: 'mentoring',
    products,
    term: opts.packageId || prev.term || ('m' + months),
    packageId: opts.packageId || prev.packageId || '',
    source: source,
    amount: Number(opts.amount) || prev.amount || 0,
    paidAt: now.toISOString(),
    accessUntil: extendUntil(prev.accessUntil, months),
    note: source + ' · ' + label,
    payRef: opts.refId || prev.payRef || '',
    lynkRef: source === 'lynk' ? (opts.refId || '') : (prev.lynkRef || ''),
    payerWa: person.wa || prev.payerWa || ''
  });
  delete state.billing[id].pendingTerm;
  delete state.billing[id].pendingAmount;
  delete state.billing[id].pendingAt;
  delete state.billing[id].offerExpiresAt;
  state.crm = state.crm || {};
  const crm = state.crm[id] || {};
  state.crm[id] = Object.assign({}, crm, { stage: 'mentee' });
  delete state.crm[id].endedAt;
  state.timeline = state.timeline || {};
  state.timeline[id] = [{
    at: now.toISOString(),
    kind: 'pay',
    body: 'Bayar ' + source + ' · ' + label
  }].concat(state.timeline[id] || []);
  state.enrollments = state.enrollments || {};
  const enrolled = Array.isArray(state.enrollments[id]) ? state.enrollments[id] : [];
  if (!enrolled.some((row) => row && (row.planId === 'onboarding' || row === 'onboarding'))) {
    state.enrollments[id] = enrolled.concat([{ planId: 'onboarding', at: now.toISOString() }]);
  }
}

function grantLynk(state, person, product, amount, refId) {
  grantPaid(state, person, {
    months: termMonths(product.term),
    packageId: product.id || product.term,
    source: 'lynk',
    amount: Number(amount) || product.price || 0,
    refId: refId,
    label: product.label || termLabel(product.term)
  });
}

function paySecretsPath(slug) {
  return path.join(paySecretsDir, slug + '.json');
}

function readPaySecrets(slug) {
  try {
    const raw = JSON.parse(fs.readFileSync(paySecretsPath(slug), 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) {
    return {};
  }
}

function writePaySecrets(slug, obj) {
  const file = paySecretsPath(slug);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function last4(value) {
  const s = String(value || '');
  return s ? s.slice(-4) : '';
}

function lynkKeyFor(slug) {
  const saved = String(readPaySecrets(slug).lynkMerchantKey || '');
  if (saved) return saved;
  if (slug === ANTON_SLUG && LYNK_KEY) return LYNK_KEY;
  return '';
}

function ensureMayarToken(slug) {
  const secrets = readPaySecrets(slug);
  if (!secrets.mayarWebhookToken) {
    secrets.mayarWebhookToken = crypto.randomBytes(18).toString('hex');
    writePaySecrets(slug, secrets);
  }
  return secrets.mayarWebhookToken;
}

function seenPayRef(refId) {
  if (!refId) return false;
  if (seenLynkRef(refId)) return true;
  if (!fs.existsSync(payEventsFile)) return false;
  const stat = fs.statSync(payEventsFile);
  const start = Math.max(0, stat.size - 1024 * 1024);
  const fd = fs.openSync(payEventsFile, 'r');
  const buf = Buffer.alloc(stat.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const lines = buf.toString('utf8').split('\n');
  if (start > 0) lines.shift();
  return lines.some((line) => {
    if (!line) return false;
    try { return JSON.parse(line).refId === refId; } catch (err) { return false; }
  });
}

function recordPayEvent(row) {
  fs.appendFileSync(payEventsFile, JSON.stringify(row) + '\n');
}

function packageRows(state) {
  return (Array.isArray(state && state.packages) ? state.packages : []).map((row) => ({
    id: String(row && row.id || ''),
    months: Math.max(1, Number(row && row.months) || 1),
    priceIdr: Math.max(0, Number(row && row.priceIdr) || 0),
    label: String(row && row.label || '').trim() || ((Number(row && row.months) || 1) + ' bulan')
  })).filter((row) => row.id);
}

function packageById(state, id) {
  return packageRows(state).find((row) => row.id === id) || null;
}

function lynkPackageCatalog(state) {
  const links = (state && state.lynkByPackage) || {};
  const fromPackages = packageRows(state).map((row) => {
    const link = links[row.id] || {};
    return {
      id: row.id,
      term: row.id,
      months: row.months,
      label: row.label,
      title: String(link.title || '').trim(),
      url: String(link.url || '').trim(),
      price: Number(link.price) || row.priceIdr || 0
    };
  }).filter((row) => row.title);
  if (fromPackages.length) return fromPackages;
  return lynkCatalog(state).map((row) => Object.assign({ id: row.term, months: termMonths(row.term), label: termLabel(row.term) }, row));
}

function personRecord(state, id) {
  const live = (state.liveStudents || []).find((s) => s && s.id === id) || null;
  const person = (state.people && state.people[id]) || null;
  const app = (state.applications && state.applications[id]) || null;
  if (!live && !person && !app) return null;
  return {
    id: id,
    wa: (live && live.wa) || (person && person.wa) || (app && app.wa) || '',
    name: (live && (live.name || [live.firstName, live.lastName].filter(Boolean).join(' '))) ||
      (person && (person.name || [person.firstName, person.lastName].filter(Boolean).join(' '))) ||
      (app && app.name) || '',
    email: (live && live.email) || (person && person.email) || (app && app.email) || ''
  };
}

function saveSchool(rec, slug, state) {
  const stored = {
    key: (rec && rec.key) || DEFAULT_INVITE,
    rev: (Number(rec && rec.rev) || 0) + 1,
    updatedAt: new Date().toISOString(),
    state: state
  };
  writeState(stored, slug);
  return stored;
}

function graceMsOf(state) {
  const days = Number(state && state.dunning && state.dunning.graceDays);
  return (Number.isFinite(days) ? days : 1) * 86400000;
}

function expireAccess(state) {
  if (!state || state.paymentsEnabled !== true) return false;
  const grace = graceMsOf(state);
  const now = Date.now();
  let changed = false;
  const billing = state.billing || {};
  Object.keys(billing).forEach((id) => {
    const b = billing[id];
    if (!b || b.status === 'gratis' || b.plan !== 'mentoring' || !b.accessUntil) return;
    const end = new Date(b.accessUntil).getTime();
    if (!Number.isFinite(end) || now < end + grace) return;
    if (b.status === 'trial' && b.plan === 'preview') return;
    b.status = 'trial';
    b.plan = 'preview';
    state.crm = state.crm || {};
    const crm = state.crm[id] || {};
    if (crm.stage !== 'sudah_keluar') {
      state.crm[id] = Object.assign({}, crm, { stage: 'sudah_keluar' });
      state.timeline = state.timeline || {};
      state.timeline[id] = [{
        at: new Date().toISOString(),
        kind: 'stage',
        body: 'Akses habis.'
      }].concat(state.timeline[id] || []);
    }
    changed = true;
  });
  return changed;
}

function payStatusPublic(slug) {
  const secrets = readPaySecrets(slug);
  const lynk = !!(secrets.lynkMerchantKey || (slug === ANTON_SLUG && LYNK_KEY));
  return {
    ok: true,
    lynk: lynk,
    mayar: !!secrets.mayarApiKey,
    xendit: !!(secrets.xenditSecretKey && secrets.xenditCallbackToken),
    lynkLast4: last4(secrets.lynkMerchantKey || (slug === ANTON_SLUG ? LYNK_KEY : '')),
    mayarLast4: last4(secrets.mayarApiKey),
    xenditKeyLast4: last4(secrets.xenditSecretKey),
    xenditTokenLast4: last4(secrets.xenditCallbackToken),
    mayarWebhookToken: ensureMayarToken(slug),
    unmatched: readUnmatched().filter((row) => !row.slug || row.slug === slug).slice(-30).reverse()
  };
}

function applySecretPatch(slug, body) {
  const secrets = readPaySecrets(slug);
  ['lynkMerchantKey', 'mayarApiKey', 'xenditSecretKey', 'xenditCallbackToken'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return;
    const value = String(body[key] || '').trim();
    if (!value || value.indexOf('•') >= 0) return;
    secrets[key] = value;
  });
  if (!secrets.mayarWebhookToken) secrets.mayarWebhookToken = crypto.randomBytes(18).toString('hex');
  writePaySecrets(slug, secrets);
  return secrets;
}

async function createMayarInvoice(apiKey, payload) {
  const res = await fetch('https://api.mayar.id/hl/v1/invoice/create', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data && data.statusCode && Number(data.statusCode) >= 400)) {
    const err = new Error('mayar');
    err.detail = data;
    throw err;
  }
  const row = data.data || data;
  return {
    id: row.id || row.invoiceId || '',
    transactionId: row.transactionId || row.id || '',
    link: row.link || row.url || ''
  };
}

async function mayarInvoicePaid(apiKey, invoiceId) {
  if (!apiKey || !invoiceId) return null;
  try {
    const res = await fetch('https://api.mayar.id/hl/v1/invoice/' + encodeURIComponent(invoiceId), {
      headers: { Authorization: 'Bearer ' + apiKey }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const row = data.data || data;
    const status = String(row.status || row.paymentStatus || '').toLowerCase();
    if (!status) return null;
    return status === 'paid' || status === 'success' || status === 'settled';
  } catch (err) {
    return null;
  }
}

async function createXenditInvoice(secret, payload) {
  const res = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(secret + ':').toString('base64'),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('xendit');
    err.detail = data;
    throw err;
  }
  return { id: data.id || '', link: data.invoice_url || '' };
}

function rememberUnmatched(row) {
  const list = readUnmatched().filter((item) => item.refId !== row.refId);
  list.push(row);
  writeUnmatched(list);
}

function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : 0;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function signStudent(id) {
  const exp = String(Date.now() + 180 * 86400000);
  const body = id + '.' + exp;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('hex');
  return body + '.' + sig;
}

function readStudentCookie(req) {
  const raw = cookieValue(req, 'lms_student');
  const parts = String(raw || '').split('.');
  if (parts.length !== 3) return '';
  const id = parts[0];
  const exp = parts[1];
  const sig = parts[2];
  if (!isStudentKey(id)) return '';
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return '';
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update(id + '.' + exp).digest('hex');
  if (!sameSecret(sig, expect)) return '';
  return id;
}

function studentCookie(req, token) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  const value = token ? String(token) : '';
  /* Persist across tab closes; Path=/ so /s/{slug} pages still send it to the API. */
  const age = token ? '; Max-Age=15552000' : '; Max-Age=0';
  return 'lms_student=' + value + '; HttpOnly; SameSite=Lax; Path=/' + age + secure;
}

function asStudentView(req) {
  return String(req.headers['x-lms-view'] || '') === 'student';
}

const staffAuthFile = path.join(DATA, 'staff-auth.json');
const STAFF_PERM_KEYS = ['viewStudents', 'editStudents', 'addStudents', 'viewIncome', 'editIncome', 'viewClasses', 'editClasses'];

function defaultStaffPerms() {
  return {
    viewStudents: true,
    editStudents: false,
    addStudents: false,
    viewIncome: false,
    editIncome: false,
    viewClasses: true,
    editClasses: false
  };
}

function cleanStaffPerms(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = defaultStaffPerms();
  STAFF_PERM_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(src, key)) out[key] = !!src[key];
  });
  return out;
}

function hashStaffPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return salt + ':' + hash;
}

function checkStaffPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const got = crypto.scryptSync(String(password), parts[0], 32).toString('hex');
  return sameSecret(got, parts[1]);
}

function readStaffAuth() {
  try {
    const data = JSON.parse(fs.readFileSync(staffAuthFile, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

function writeStaffAuth(data) {
  const tmp = staffAuthFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, staffAuthFile);
}

function staffHashOf(slug, id) {
  const all = readStaffAuth();
  const bag = all[slug] || {};
  return bag[id] || '';
}

function setStaffHash(slug, id, hash) {
  const all = readStaffAuth();
  all[slug] = all[slug] && typeof all[slug] === 'object' ? all[slug] : {};
  all[slug][id] = hash;
  writeStaffAuth(all);
}

function signStaff(id) {
  const exp = String(Date.now() + 30 * 86400000);
  const body = id + '.' + exp;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update('staff:' + body).digest('hex');
  return body + '.' + sig;
}

function readStaffCookie(req) {
  const parts = String(cookieValue(req, 'lms_staff') || '').split('.');
  if (parts.length !== 3) return '';
  const id = parts[0];
  const exp = parts[1];
  const sig = parts[2];
  if (!/^adm-[a-zA-Z0-9_-]{4,64}$/.test(id)) return '';
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return '';
  const expect = crypto.createHmac('sha256', SESSION_SECRET).update('staff:' + id + '.' + exp).digest('hex');
  if (!sameSecret(sig, expect)) return '';
  return id;
}

function staffCookieHeader(req, token) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  const value = token ? String(token) : '';
  const age = token ? '' : '; Max-Age=0';
  return 'lms_staff=' + value + '; HttpOnly; SameSite=Lax; Path=/' + age + secure;
}

function listStaff(state) {
  const list = state && Array.isArray(state.staffAdmins) ? state.staffAdmins : [];
  return list.filter((row) => row && row.id);
}

function publicStaff(row, owner) {
  const status = row.status === 'active' || row.status === 'revoked' || row.status === 'pending' ? row.status : 'pending';
  return {
    id: String(row.id),
    name: clip(row.name, 80),
    email: clip(row.email, 160),
    status: status,
    inviteToken: owner && status === 'pending' ? String(row.inviteToken || '') : '',
    permissions: cleanStaffPerms(row.permissions),
    createdAt: row.createdAt || '',
    acceptedAt: row.acceptedAt || '',
    revokedAt: row.revokedAt || ''
  };
}

function newStaffId() {
  return 'adm-' + crypto.randomBytes(6).toString('hex');
}

function activeStaffRow(state, id) {
  if (!id) return null;
  return listStaff(state).find((row) => row.id === id && row.status === 'active') || null;
}

function viewForStaff(raw, row) {
  const perms = cleanStaffPerms(row && row.permissions);
  const state = Object.assign({}, raw || {});
  state.staffAdmins = listStaff(raw).map((item) => publicStaff(item, false));
  if (!perms.viewIncome) {
    const billing = {};
    Object.keys(state.billing || {}).forEach((id) => {
      billing[id] = Object.assign({}, state.billing[id], { amount: 0, pendingAmount: 0 });
    });
    state.billing = billing;
    state.payments = (state.payments || []).map((item) => Object.assign({}, item, { amount: 0 }));
    state.remittances = (state.remittances || []).map((item) => Object.assign({}, item, { expected: 0, received: 0 }));
  }
  if (!perms.viewStudents) {
    state.people = {};
    state.liveStudents = [];
    state.crm = {};
    state.applications = {};
    state.directory = [];
    state.notes = {};
    state.timeline = {};
  }
  if (!perms.viewClasses) {
    state.lectures = [];
    state.weeks = [];
    state.sessions = [];
    state.kurikulum = { name: '', description: '', published: false };
  }
  return state;
}

function guardStaffWrite(prev, next, perms) {
  const p = cleanStaffPerms(perms);
  const base = prev && typeof prev === 'object' ? prev : {};
  const out = next && typeof next === 'object' ? next : {};
  out.staffAdmins = Array.isArray(base.staffAdmins) ? base.staffAdmins : [];
  if (!p.editIncome || !p.viewIncome) {
    out.billing = base.billing || {};
    out.payments = base.payments || [];
    out.remittances = base.remittances || [];
  }
  if (!p.editClasses || !p.viewClasses) {
    out.lectures = base.lectures || [];
    out.weeks = base.weeks || [];
    out.sessions = base.sessions || [];
    out.kurikulum = base.kurikulum || {};
  }
  if (!p.editStudents || !p.viewStudents) {
    out.people = base.people || {};
    out.liveStudents = base.liveStudents || [];
    out.crm = base.crm || {};
    out.applications = base.applications || {};
    out.directory = base.directory || [];
    out.notes = base.notes || {};
    out.timeline = base.timeline || {};
  }
  return out;
}

function saveStaffState(slug, rec, state) {
  const stored = {
    key: (rec && rec.key) || DEFAULT_INVITE,
    rev: ((rec && Number(rec.rev)) || 0) + 1,
    updatedAt: new Date().toISOString(),
    state: state
  };
  writeRecord(stored, slug);
  return stored;
}

function jsonCookie(res, status, data, cookie) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
    'set-cookie': cookie
  });
  res.end(JSON.stringify(data));
}

function dropDemoKey(obj, changed) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return changed;
  Object.keys(obj).forEach((id) => {
    if (isDemoId(id)) {
      delete obj[id];
      changed.n += 1;
    }
  });
  return changed;
}

function filterDemoRows(list, pred, changed) {
  if (!Array.isArray(list)) return list;
  const next = list.filter((row) => {
    const drop = !row || pred(row);
    if (drop) changed.n += 1;
    return !drop;
  });
  return next;
}

/** Remove the fictional seed cast (ids s-*) from a school file. Returns true if anything changed. */
function stripDemoPeople(state) {
  if (!state || typeof state !== 'object') return false;
  const changed = { n: 0 };
  ['people', 'applications', 'billing', 'crm', 'notes', 'progress', 'lastLecture', 'enrollments', 'timeline', 'kolab'].forEach((key) => {
    dropDemoKey(state[key], changed);
  });
  if (Array.isArray(state.liveStudents)) {
    state.liveStudents = filterDemoRows(state.liveStudents, (s) => isDemoId(s.id), changed);
  }
  state.payments = filterDemoRows(state.payments, (p) => isDemoId(p.personId), changed);
  state.tasks = filterDemoRows(state.tasks, (t) => isDemoId(t.personId), changed);
  state.remittances = filterDemoRows(state.remittances, (r) => isDemoId(r.mentorId), changed);
  state.waQueue = filterDemoRows(state.waQueue, (w) => isDemoId(w.toId), changed);
  state.emailQueue = filterDemoRows(state.emailQueue, (w) => isDemoId(w.toId), changed);
  state.threads = filterDemoRows(state.threads, (t) => isDemoId(t.authorId), changed);
  state.replies = filterDemoRows(state.replies, (r) => isDemoId(r.authorId), changed);
  state.posts = filterDemoRows(state.posts, (p) => isDemoId(p.authorId), changed);
  state.comments = filterDemoRows(state.comments, (c) => isDemoId(c.authorId), changed);
  const dropThreads = new Set();
  if (Array.isArray(state.waThreads)) {
    state.waThreads = state.waThreads.filter((t) => {
      if (t && isDemoId(t.personId)) {
        dropThreads.add(t.id);
        changed.n += 1;
        return false;
      }
      return true;
    });
  }
  if (Array.isArray(state.waMessages)) {
    state.waMessages = state.waMessages.filter((m) => {
      if (m && dropThreads.has(m.threadId)) {
        changed.n += 1;
        return false;
      }
      return true;
    });
  }
  if (state.attendance && typeof state.attendance === 'object') {
    Object.keys(state.attendance).forEach((sid) => dropDemoKey(state.attendance[sid], changed));
  }
  if (state.chats && typeof state.chats === 'object') {
    Object.keys(state.chats).forEach((id) => {
      const chat = state.chats[id];
      if (!chat || typeof chat !== 'object') return;
      ['added', 'removed'].forEach((key) => {
        if (!Array.isArray(chat[key])) return;
        const next = chat[key].filter((sid) => !isDemoId(sid));
        if (next.length !== chat[key].length) {
          chat[key] = next;
          changed.n += 1;
        }
      });
    });
  }
  return changed.n > 0;
}

function takeState(slug) {
  const rec = readState(slug);
  if (rec && rec.state && stripDemoPeople(rec.state)) rec._stripped = true;
  return rec;
}

function writeRecord(rec, slug) {
  if (!rec) return;
  delete rec._stripped;
  writeState(rec, slug);
}

function persistStrip(rec, slug) {
  if (!rec || !rec._stripped) return rec;
  rec.rev = (Number(rec.rev) || 0) + 1;
  rec.updatedAt = new Date().toISOString();
  writeRecord(rec, slug);
  return rec;
}

function eachPerson(state, fn) {
  const seen = new Set();
  (state.liveStudents || []).forEach((row) => {
    if (!row || !row.id || seen.has(row.id) || isDemoId(row.id)) return;
    seen.add(row.id);
    fn(row.id, row);
  });
  const people = state.people || {};
  Object.keys(people).forEach((id) => {
    if (seen.has(id) || isDemoId(id)) return;
    seen.add(id);
    fn(id, people[id] || {});
  });
}

function personWa(state, id, row) {
  const patch = (state.people && state.people[id]) || {};
  const app = (state.applications && state.applications[id]) || {};
  return (row && row.wa) || patch.wa || app.wa || '';
}

function findByVisitor(state, visitorId) {
  const vid = String(visitorId || '');
  if (!vid) return null;
  let found = null;
  eachPerson(state, (id, row) => {
    if (found) return;
    const patch = (state.people && state.people[id]) || {};
    const ids = []
      .concat(Array.isArray(row.visitorIds) ? row.visitorIds : [])
      .concat(Array.isArray(patch.visitorIds) ? patch.visitorIds : []);
    if (ids.indexOf(vid) >= 0) found = Object.assign({ id: id }, row);
  });
  return found;
}

function findByWa(state, wa) {
  if (phoneKey(wa).length < 10) return null;
  let found = null;
  eachPerson(state, (id, row) => {
    if (found) return;
    const have = personWa(state, id, row);
    if (phonesMatch(have, wa)) found = Object.assign({ id: id }, row, { wa: have });
  });
  return found;
}

function lookupPerson(state, id) {
  if (!id) return null;
  const live = (state.liveStudents || []).find((s) => s && s.id === id);
  const patch = (state.people && state.people[id]) || {};
  const app = (state.applications && state.applications[id]) || {};
  const hasPeople = !!(state.people && state.people[id]);
  const hasApp = !!(state.applications && state.applications[id]);
  if (!live && !hasPeople && !hasApp) return null;
  return {
    id: id,
    name: patch.name || (live && live.name) || app.name || '',
    wa: patch.wa || (live && live.wa) || app.wa || '',
    email: patch.email || (live && live.email) || app.email || ''
  };
}

function waTakenByOther(state, wa, selfId) {
  if (phoneKey(wa).length < 10) return false;
  let taken = false;
  eachPerson(state, (id, row) => {
    if (id !== selfId && phonesMatch(personWa(state, id, row), wa)) taken = true;
  });
  return taken;
}

function authorIds(state) {
  const ids = new Set();
  ['posts', 'comments', 'threads', 'replies'].forEach((key) => {
    (state[key] || []).forEach((row) => {
      if (row && row.authorId) ids.add(String(row.authorId));
    });
  });
  return ids;
}

function publicCard(id, state) {
  if (!id || isDemoId(id)) return null;
  const live = (state.liveStudents || []).find((s) => s && s.id === id) || {};
  const patch = (state.people && state.people[id]) || {};
  const name = patch.name || live.name || '';
  const firstName = patch.firstName || live.firstName || '';
  const lastName = patch.lastName || live.lastName || '';
  if (!name && !firstName && !lastName) return null;
  return {
    id: id,
    name: name,
    firstName: firstName,
    lastName: lastName,
    kind: patch.kind === 'mentor' || live.kind === 'mentor' ? 'mentor' : 'student',
    photoUrl: String(patch.photoUrl || live.photoUrl || '').trim()
  };
}

function schoolShell(state) {
  const src = state || {};
  const pick = (key, fallback) => (src[key] != null ? src[key] : fallback);
  return {
    lectures: pick('lectures', []),
    catalog: pick('catalog', []),
    weeks: pick('weeks', []),
    sessions: pick('sessions', []),
    announcements: pick('announcements', []),
    posts: pick('posts', []),
    comments: pick('comments', []),
    threads: pick('threads', []),
    replies: pick('replies', []),
    schoolSlug: pick('schoolSlug', SLUG),
    businessName: pick('businessName', ''),
    mentorBand: pick('mentorBand', ''),
    ownerId: pick('ownerId', ''),
    schoolProfile: pick('schoolProfile', {}),
    pricing: pick('pricing', {}),
    bank: pick('bank', {}),
    onboarding: pick('onboarding', null),
    sectionStyle: pick('sectionStyle', 'minggu'),
    daftarCols: pick('daftarCols', []),
    daftarCustom: pick('daftarCustom', []),
    lynkProducts: pick('lynkProducts', {}),
    packages: pick('packages', []),
    lynkByPackage: pick('lynkByPackage', {}),
    paymentsEnabled: src.paymentsEnabled === true,
    checkoutProvider: pick('checkoutProvider', ''),
    batchNames: pick('batchNames', {}),
    chats: pick('chats', {}),
    ownerContact: pick('ownerContact', { wa: '', email: '', waFab: false }),
    clockOffsetMs: typeof src.clockOffsetMs === 'number' ? src.clockOffsetMs : 0,
    people: {},
    liveStudents: [],
    applications: {},
    billing: {},
    crm: {},
    progress: {},
    lastLecture: {},
    enrollments: {},
    timeline: {},
    kolab: {},
    directory: [],
    notes: {},
    tasks: [],
    payments: [],
    remittances: [],
    waQueue: [],
    emailQueue: [],
    waThreads: [],
    waMessages: [],
    attendance: {}
  };
}

function sliceMap(obj, id) {
  if (!obj || obj[id] == null) return {};
  return { [id]: obj[id] };
}

function curriculumVisible(state, slug) {
  if (slug === ANTON_SLUG) return true;
  const kur = state && state.kurikulum;
  if (kur && kur.published === false) return false;
  if (kur && kur.published === true) return true;
  return Array.isArray(state && state.lectures) && state.lectures.length > 0;
}

function projectPublic(state) {
  const src = state || {};
  const profile = src.schoolProfile && typeof src.schoolProfile === 'object' ? src.schoolProfile : {};
  const contact = src.ownerContact && typeof src.ownerContact === 'object' ? src.ownerContact : {};
  const kur = src.kurikulum && typeof src.kurikulum === 'object' ? src.kurikulum : {};
  const directory = [];
  authorIds(src).forEach((id) => {
    const card = publicCard(id, src);
    if (card) directory.push(card);
  });
  return {
    lectures: [],
    catalog: [],
    weeks: [],
    sessions: [],
    announcements: [],
    posts: [],
    comments: [],
    threads: [],
    replies: [],
    schoolSlug: src.schoolSlug || '',
    businessName: src.businessName || '',
    mentorBand: src.mentorBand || '',
    ownerId: src.ownerId || '',
    schoolProfile: {
      firstName: clip(profile.firstName, 40),
      lastName: clip(profile.lastName, 80),
      headline: clip(profile.headline, 60),
      biography: clip(profile.biography, 800),
      photoMode: clip(profile.photoMode, 20),
      photoUrl: String(profile.photoUrl || '').trim(),
      coverUrl: String(profile.coverUrl || '').trim(),
      coverPosX: profile.coverPosX,
      coverPosY: profile.coverPosY,
      socials: cleanSocials(profile.socials)
    },
    kurikulum: {
      name: clip(kur.name, 120),
      description: clip(kur.description, 800),
      published: false,
      coverUrl: '',
      coverKey: ''
    },
    ownerContact: {
      wa: clip(contact.wa, 32),
      email: '',
      waFab: contact.waFab === true
    },
    pricing: {},
    bank: {},
    onboarding: src.onboarding || null,
    sectionStyle: src.sectionStyle || 'minggu',
    daftarCols: Array.isArray(src.daftarCols) ? src.daftarCols : [],
    daftarCustom: [],
    lynkProducts: {},
    batchNames: {},
    chats: {},
    clockOffsetMs: typeof src.clockOffsetMs === 'number' ? src.clockOffsetMs : 0,
    people: {},
    liveStudents: [],
    applications: {},
    billing: {},
    crm: {},
    progress: {},
    lastLecture: {},
    enrollments: {},
    timeline: {},
    kolab: {},
    directory: directory,
    notes: {},
    tasks: [],
    payments: [],
    remittances: [],
    waQueue: [],
    emailQueue: [],
    waThreads: [],
    waMessages: [],
    attendance: {},
    inviteCode: '',
    inviteCodeCustom: false
  };
}

function memberShell(state) {
  const shell = schoolShell(state);
  const directory = [];
  authorIds(state || {}).forEach((id) => {
    const card = publicCard(id, state || {});
    if (card) directory.push(card);
  });
  shell.directory = directory;
  return shell;
}

function projectGuest(state) {
  return projectPublic(state);
}

function projectStudent(state, studentId, slug) {
  const open = curriculumVisible(state, slug);
  const shell = open ? memberShell(state) : projectPublic(state);
  const src = state || {};
  shell.directory = (shell.directory || []).filter((card) => card.id !== studentId);
  shell.people = sliceMap(src.people, studentId);
  shell.liveStudents = (src.liveStudents || []).filter((s) => s && s.id === studentId);
  shell.applications = sliceMap(src.applications, studentId);
  shell.billing = sliceMap(src.billing, studentId);
  shell.crm = sliceMap(src.crm, studentId);
  shell.progress = sliceMap(src.progress, studentId);
  shell.lastLecture = sliceMap(src.lastLecture, studentId);
  shell.enrollments = sliceMap(src.enrollments, studentId);
  shell.timeline = sliceMap(src.timeline, studentId);
  shell.kolab = sliceMap(src.kolab, studentId);
  return shell;
}

function mergeBilling(prev, incoming) {
  const base = Object.assign({}, prev || {});
  const next = Object.assign({}, base, incoming || {});
  const locked = base.status === 'lunas' || base.status === 'gratis' || base.status === 'cicilan';
  const privileged = next.status === 'lunas' || next.status === 'gratis' || next.status === 'cicilan';
  if (locked || privileged) {
    ['status', 'amount', 'source', 'paidAt', 'accessUntil', 'products', 'plan', 'term', 'lynkRef', 'packageId', 'payRef'].forEach((key) => {
      if (base[key] != null) next[key] = base[key];
    });
    if (!locked && privileged) {
      next.status = base.status || 'trial';
      next.products = Array.isArray(base.products) ? base.products : [];
      ['amount', 'source', 'paidAt', 'accessUntil', 'plan', 'term', 'lynkRef', 'packageId', 'payRef'].forEach((key) => {
        if (base[key] == null) delete next[key];
      });
    }
  }
  return next;
}

function mergeCrm(prev, incoming) {
  const base = Object.assign({}, prev || {});
  const next = Object.assign({}, base, incoming || {});
  if (base.stage === 'mentee' || base.stage === 'mentor') next.stage = base.stage;
  else if (next.stage === 'mentee' || next.stage === 'mentor') next.stage = base.stage || 'form';
  if (base.stage !== 'mentor') {
    delete next.acceptedMentorAt;
    delete next.certSerial;
    delete next.acceptedOverride;
  }
  return next;
}

function mergeOwnedList(base, src, key, authorField, studentId) {
  const incoming = Array.isArray(src[key]) ? src[key] : [];
  const mine = incoming.filter((row) => row && row.id && row[authorField] === studentId);
  if (!mine.length) return;
  const list = Array.isArray(base[key]) ? base[key].slice() : [];
  mine.forEach((row) => {
    const i = list.findIndex((item) => item && item.id === row.id);
    if (i >= 0 && list[i][authorField] !== studentId) return;
    if (i >= 0) list[i] = row;
    else list.push(row);
  });
  base[key] = list;
}

function mergeStudentWrite(stored, incoming, studentId) {
  const base = stored && typeof stored === 'object' ? stored : {};
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  if (!isStudentKey(studentId)) return base;
  stripDemoPeople(base);
  base.people = base.people || {};
  if (src.people && src.people[studentId] && typeof src.people[studentId] === 'object') {
    const prev = base.people[studentId] || {};
    const next = Object.assign({}, prev, src.people[studentId]);
    next.kind = prev.kind === 'mentor' ? 'mentor' : 'student';
    next.mentorId = prev.mentorId || next.mentorId || base.ownerId || '';
    if (prev.authUserId) next.authUserId = prev.authUserId;
    if (next.wa && waTakenByOther(base, next.wa, studentId)) next.wa = prev.wa || '';
    base.people[studentId] = next;
  }
  ['applications', 'progress', 'lastLecture', 'enrollments', 'timeline', 'kolab'].forEach((key) => {
    if (!src[key] || src[key][studentId] == null) return;
    base[key] = base[key] || {};
    base[key][studentId] = src[key][studentId];
  });
  if (src.billing && src.billing[studentId]) {
    base.billing = base.billing || {};
    base.billing[studentId] = mergeBilling(base.billing[studentId], src.billing[studentId]);
  }
  if (src.crm && src.crm[studentId]) {
    base.crm = base.crm || {};
    base.crm[studentId] = mergeCrm(base.crm[studentId], src.crm[studentId]);
  }
  const row = (src.liveStudents || []).find((s) => s && s.id === studentId);
  if (row) {
    base.liveStudents = Array.isArray(base.liveStudents) ? base.liveStudents : [];
    const i = base.liveStudents.findIndex((s) => s && s.id === studentId);
    const prev = i >= 0 ? base.liveStudents[i] : {};
    const next = Object.assign({}, prev, row);
    next.id = studentId;
    next.kind = prev.kind === 'mentor' ? 'mentor' : 'student';
    next.visitorIds = Array.isArray(prev.visitorIds) ? prev.visitorIds.slice() : [];
    next.mentorId = prev.mentorId || next.mentorId || base.ownerId || '';
    if (prev.authUserId) next.authUserId = prev.authUserId;
    if (next.wa && waTakenByOther(base, next.wa, studentId)) next.wa = prev.wa || '';
    if (i >= 0) base.liveStudents[i] = next;
    else base.liveStudents.push(next);
  }
  mergeOwnedList(base, src, 'posts', 'authorId', studentId);
  mergeOwnedList(base, src, 'comments', 'authorId', studentId);
  mergeOwnedList(base, src, 'threads', 'authorId', studentId);
  mergeOwnedList(base, src, 'replies', 'authorId', studentId);
  stripDemoPeople(base);
  return base;
}

function authIdOf(state, id) {
  const live = (state.liveStudents || []).find((s) => s && s.id === id) || {};
  const person = (state.people && state.people[id]) || {};
  return String(live.authUserId || person.authUserId || '');
}

function isMentorRow(state, id, row) {
  const person = (state.people && state.people[id]) || {};
  const kind = (row && row.kind) || person.kind;
  return kind === 'mentor';
}

function findByAuthUser(state, userId) {
  const uid = String(userId || '');
  if (!uid) return null;
  let found = null;
  eachPerson(state, (id, row) => {
    if (found || isMentorRow(state, id, row)) return;
    const person = (state.people && state.people[id]) || {};
    if (String(row.authUserId || person.authUserId || '') === uid) {
      found = Object.assign({ id: id }, row);
    }
  });
  return found;
}

function findByEmail(state, email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want || want.indexOf('@') < 1) return null;
  let found = null;
  eachPerson(state, (id, row) => {
    if (found || isMentorRow(state, id, row)) return;
    const person = (state.people && state.people[id]) || {};
    const app = (state.applications && state.applications[id]) || {};
    const have = String(row.email || person.email || app.email || '').trim().toLowerCase();
    if (have && have === want) found = Object.assign({ id: id }, row);
  });
  return found;
}

function applicationFinished(state, id) {
  const app = state.applications && state.applications[id];
  return !!(app && app.at);
}

function upsertStudentIdentity(state, row) {
  state.liveStudents = Array.isArray(state.liveStudents) ? state.liveStudents : [];
  const i = state.liveStudents.findIndex((s) => s && s.id === row.id);
  const prevLive = i >= 0 ? state.liveStudents[i] : {};
  const next = Object.assign({}, prevLive, {
    id: row.id,
    kind: 'student',
    authUserId: row.authUserId,
    mentorId: row.mentorId || prevLive.mentorId || state.ownerId || '',
    email: row.email || prevLive.email || '',
    wa: row.wa || prevLive.wa || '',
    name: row.name || prevLive.name || '',
    firstName: row.firstName || prevLive.firstName || '',
    lastName: row.lastName || prevLive.lastName || '',
    visitorIds: Array.isArray(prevLive.visitorIds)
      ? prevLive.visitorIds.slice()
      : (Array.isArray(row.visitorIds) ? row.visitorIds.slice() : [])
  });
  if (prevLive.authUserId) next.authUserId = prevLive.authUserId;
  if (i >= 0) state.liveStudents[i] = next;
  else state.liveStudents.push(next);
  state.people = state.people || {};
  const prev = state.people[row.id] || {};
  state.people[row.id] = Object.assign({}, prev, {
    authUserId: next.authUserId,
    email: next.email,
    wa: next.wa || prev.wa || '',
    name: next.name || prev.name || '',
    firstName: next.firstName || prev.firstName || '',
    lastName: next.lastName || prev.lastName || '',
    kind: 'student',
    mentorId: next.mentorId
  });
  return next;
}

function claimStudentAccount(state, user, cookieId, allowCreate) {
  const uid = String(user && user.id || '');
  if (!uid) return null;
  let row = findByAuthUser(state, uid);
  let created = false;
  if (!row && user.email) {
    const byEmail = findByEmail(state, user.email);
    if (byEmail && (!authIdOf(state, byEmail.id) || authIdOf(state, byEmail.id) === uid)) row = byEmail;
  }
  if (!row && user.phone) {
    const byPhone = findByWa(state, user.phone);
    if (byPhone && !isMentorRow(state, byPhone.id, byPhone) &&
        (!authIdOf(state, byPhone.id) || authIdOf(state, byPhone.id) === uid)) {
      row = byPhone;
    }
  }
  if (!row && cookieId && lookupPerson(state, cookieId) && !authIdOf(state, cookieId) && !isMentorRow(state, cookieId, {})) {
    const live = (state.liveStudents || []).find((s) => s && s.id === cookieId) || {};
    const person = (state.people && state.people[cookieId]) || {};
    row = Object.assign({ id: cookieId }, person, live);
  }
  if (row && isMentorRow(state, row.id, row)) row = null;
  if (!row && allowCreate === false) return null;
  if (!row) {
    created = true;
    const email = String(user.email || '').trim().slice(0, 160);
    const meta = (user.user_metadata && typeof user.user_metadata === 'object') ? user.user_metadata : {};
    const full = String(meta.full_name || meta.name || '').trim();
    const parts = full.split(/\s+/).filter(Boolean);
    row = {
      id: 'stu_' + crypto.randomBytes(9).toString('hex'),
      kind: 'student',
      mentorId: state.ownerId || '',
      visitorIds: [],
      name: full.slice(0, 120),
      firstName: (parts[0] || '').slice(0, 40),
      lastName: parts.slice(1).join(' ').slice(0, 80),
      wa: phoneKey(user.phone || ''),
      email: email
    };
  }
  row.authUserId = row.authUserId || uid;
  if (!row.email && user.email) row.email = String(user.email).trim().slice(0, 160);
  if (!row.wa && user.phone) row.wa = phoneKey(user.phone);
  if (!row.mentorId) row.mentorId = state.ownerId || '';
  const saved = upsertStudentIdentity(state, row);
  return { id: saved.id, created: created };
}

function replyStudent(req, res, studentId, extra) {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex',
    'set-cookie': studentCookie(req, signStudent(studentId))
  });
  res.end(JSON.stringify(Object.assign({ role: 'student', studentId: studentId }, extra || {})));
}

function personName(body) {
  const first = String(body.firstName || '').trim();
  const last = String(body.lastName || '').trim();
  const joined = [first, last].filter(Boolean).join(' ');
  return String(body.name || joined || first).trim().slice(0, 120);
}

function applyJoinProfile(row, body) {
  const firstName = String(body.firstName || '').trim().slice(0, 40);
  const lastName = String(body.lastName || '').trim().slice(0, 80);
  row.firstName = firstName || row.firstName || '';
  row.lastName = lastName || row.lastName || '';
  row.name = personName(body) || row.name || row.firstName;
  row.wa = phoneKey(body.wa) || row.wa || '';
  row.email = String(body.email || row.email || '').trim().slice(0, 160);
  row.city = String(body.city || row.city || '').trim().slice(0, 60);
  row.shopName = String(body.shopName || row.shopName || '').trim().slice(0, 80);
  row.shopUrl = String(body.shopUrl || row.shopUrl || '').trim().slice(0, 300);
  const vid = String(body.visitorId || '').slice(0, 80);
  row.visitorIds = Array.isArray(row.visitorIds) ? row.visitorIds : [];
  if (vid && row.visitorIds.indexOf(vid) < 0) row.visitorIds.push(vid);
  return row;
}

/** Merge roster keys so a stale mentor PUT cannot erase students who joined
 *  after the mentor's last pull. Incoming rows win when the same id exists. */
function preserveJoinedRoster(prev, next) {
  const base = prev && typeof prev === 'object' ? prev : {};
  const out = next && typeof next === 'object' ? next : {};
  const prevLive = Array.isArray(base.liveStudents) ? base.liveStudents : [];
  const nextLive = Array.isArray(out.liveStudents) ? out.liveStudents.slice() : [];
  const seen = new Set(nextLive.map((s) => s && s.id).filter(Boolean));
  prevLive.forEach((row) => {
    if (!row || !row.id || seen.has(row.id) || isDemoId(row.id)) return;
    nextLive.push(row);
    seen.add(row.id);
  });
  out.liveStudents = nextLive;
  ['applications', 'crm', 'billing', 'people', 'notes', 'progress', 'lastLecture', 'enrollments', 'timeline', 'kolab'].forEach((key) => {
    const from = base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {};
    const to = out[key] && typeof out[key] === 'object' && !Array.isArray(out[key]) ? Object.assign({}, out[key]) : {};
    Object.keys(from).forEach((id) => {
      if (!id || isDemoId(id) || Object.prototype.hasOwnProperty.call(to, id)) return;
      to[id] = from[id];
    });
    out[key] = to;
  });
  return out;
}

function kurikulumFilled(kur) {
  if (!kur || typeof kur !== 'object' || Array.isArray(kur)) return false;
  if (String(kur.name || '').trim()) return true;
  if (String(kur.description || '').trim()) return true;
  if (String(kur.coverUrl || '').trim() || String(kur.coverKey || '').trim()) return true;
  if (kur.coverBlob === true) return true;
  return false;
}

/** A staff save that drops the outline (empty or missing lectures/weeks) or
 *  an empty kurikulum object keeps the disk copy. Explicit body.reset skips this. */
function preserveCurriculumOutline(prev, next, slug) {
  const base = prev && typeof prev === 'object' ? prev : {};
  const out = next && typeof next === 'object' ? next : {};
  const prevLectures = Array.isArray(base.lectures) ? base.lectures.length : 0;
  const prevWeeks = Array.isArray(base.weeks) ? base.weeks.length : 0;
  const wipeLectures = prevLectures > 0 && (!Array.isArray(out.lectures) || out.lectures.length === 0);
  const wipeWeeks = prevWeeks > 0 && (!Array.isArray(out.weeks) || out.weeks.length === 0);
  let kept = false;
  if (wipeLectures || wipeWeeks) {
    if (wipeLectures) out.lectures = base.lectures;
    if (wipeWeeks) out.weeks = base.weeks;
    if (base.kurikulum && typeof base.kurikulum === 'object') out.kurikulum = base.kurikulum;
    kept = true;
  }
  const nextKur = out.kurikulum;
  const nextEmpty = !nextKur || typeof nextKur !== 'object' || Array.isArray(nextKur) || !kurikulumFilled(nextKur);
  if (kurikulumFilled(base.kurikulum) && nextEmpty) {
    out.kurikulum = base.kurikulum;
    kept = true;
  }
  if (kept) console.warn('preserve-curriculum ' + (slug || '') + ' kept disk outline');
  return out;
}

function upsertJoined(state, row) {
  state.liveStudents = Array.isArray(state.liveStudents) ? state.liveStudents : [];
  const i = state.liveStudents.findIndex((s) => s && s.id === row.id);
  if (i >= 0) state.liveStudents[i] = Object.assign({}, state.liveStudents[i], row);
  else state.liveStudents.push(row);
  state.people = state.people || {};
  const prev = state.people[row.id] || {};
  state.people[row.id] = Object.assign({}, prev, {
    name: row.name,
    firstName: row.firstName,
    lastName: row.lastName,
    wa: row.wa,
    email: row.email || '',
    city: row.city || '',
    shopName: row.shopName || '',
    shopUrl: row.shopUrl || '',
    mentorId: row.mentorId,
    kind: prev.kind === 'mentor' ? 'mentor' : 'student',
    visitorIds: row.visitorIds
  });
  /* Write application + crm on join so mentor Pipa/daftar and student
     return visits do not depend on a later student PUT succeeding. */
  const at = new Date().toISOString();
  state.applications = state.applications || {};
  const prevApp = state.applications[row.id] || {};
  state.applications[row.id] = Object.assign({}, prevApp, {
    name: row.name || prevApp.name || '',
    firstName: row.firstName || prevApp.firstName || '',
    lastName: row.lastName || prevApp.lastName || '',
    wa: row.wa || prevApp.wa || '',
    city: row.city || prevApp.city || '',
    hasShop: !!(row.shopName || row.shopUrl || prevApp.hasShop),
    shopName: row.shopName || prevApp.shopName || '',
    shopUrl: row.shopUrl || prevApp.shopUrl || '',
    heard: prevApp.heard || '',
    answers: prevApp.answers && typeof prevApp.answers === 'object' ? prevApp.answers : {},
    at: prevApp.at || at
  });
  state.crm = state.crm || {};
  const prevCrm = state.crm[row.id] || {};
  const stage = prevCrm.stage && prevCrm.stage !== 'wa_baru' ? prevCrm.stage : 'form';
  state.crm[row.id] = Object.assign({}, prevCrm, { stage: stage });
  state.billing = state.billing || {};
  if (!state.billing[row.id]) {
    state.billing[row.id] = {
      status: 'trial',
      plan: 'preview',
      products: [],
      amount: 0,
      source: 'manual',
      offerStartedAt: at,
      offerExpiresAt: new Date(Date.now() + 24 * 36e5).toISOString(),
      note: 'Bayar nanti · 24 jam'
    };
  }
}

function handleStaff(req, res, url, q, pathname) {
  const slugOfReq = (body) => String((body && body.slug) || q.slug || ANTON_SLUG).trim().toLowerCase() || ANTON_SLUG;

  const inviteLook = pathname.match(/^\/staff\/invite\/([a-f0-9]{16,64})$/);
  if (req.method === 'GET' && inviteLook) {
    const token = inviteLook[1];
    const slug = slugOfReq(null);
    lock(() => {
      const rec = takeState(slug);
      const row = listStaff(rec && rec.state).find((item) => item.inviteToken === token && item.status === 'pending');
      if (!row) {
        json(res, 404, { error: 'invite' });
        return;
      }
      const state = rec.state || {};
      const school = state.businessName || (state.schoolProfile && state.schoolProfile.firstName) || 'Kelas';
      json(res, 200, { ok: true, school: school, status: 'pending' });
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/staff/me') {
    const slug = slugOfReq(null);
    lock(() => {
      const id = readStaffCookie(req);
      const rec = takeState(slug);
      const row = activeStaffRow(rec && rec.state, id);
      if (!row) {
        json(res, 401, { error: 'auth' });
        return;
      }
      json(res, 200, { ok: true, staff: publicStaff(row, false), slug: slug });
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/staff/logout') {
    jsonCookie(res, 200, { ok: true }, staffCookieHeader(req, ''));
    return true;
  }

  if (req.method === 'POST' && (pathname === '/staff/accept' || pathname === '/staff/login' || pathname === '/staff/invite' || pathname === '/staff/update')) {
    readBody(req, 64 * 1024).then((buf) => lock(async () => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = slugOfReq(body);
      const rec = persistStrip(takeState(slug), slug) || { state: {}, rev: 0, key: DEFAULT_INVITE };
      const state = rec.state || {};
      state.staffAdmins = listStaff(state);
      const user = await supabaseUser(req);
      const owner = isStaffFor(req, q, slug, user);

      if (pathname === '/staff/invite' || pathname === '/staff/update') {
        if (!owner) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
      }

      if (pathname === '/staff/invite') {
        let pending = state.staffAdmins.find((item) => item.status === 'pending');
        if (!pending) {
          pending = {
            id: newStaffId(),
            name: '',
            email: '',
            status: 'pending',
            inviteToken: crypto.randomBytes(16).toString('hex'),
            permissions: defaultStaffPerms(),
            createdAt: new Date().toISOString(),
            acceptedAt: '',
            revokedAt: ''
          };
          state.staffAdmins.push(pending);
        } else if (body.rotate || !pending.inviteToken) {
          pending.inviteToken = crypto.randomBytes(16).toString('hex');
        }
        const stored = saveStaffState(slug, rec, state);
        json(res, 200, {
          ok: true,
          token: pending.inviteToken,
          rev: stored.rev,
          staffAdmins: state.staffAdmins.map((item) => publicStaff(item, true))
        });
        return;
      }

      if (pathname === '/staff/update') {
        const row = state.staffAdmins.find((item) => item.id === String(body.id || ''));
        if (!row) {
          json(res, 404, { error: 'missing' });
          return;
        }
        if (body.permissions) row.permissions = cleanStaffPerms(body.permissions);
        if (row.status === 'pending') {
          const storedPending = saveStaffState(slug, rec, state);
          json(res, 200, {
            ok: true,
            rev: storedPending.rev,
            staffAdmins: state.staffAdmins.map((item) => publicStaff(item, true))
          });
          return;
        }
        if (body.status === 'revoked') {
          row.status = 'revoked';
          row.revokedAt = new Date().toISOString();
        } else if (body.status === 'active' && row.status === 'revoked') {
          row.status = 'active';
          row.revokedAt = '';
        }
        const stored = saveStaffState(slug, rec, state);
        json(res, 200, {
          ok: true,
          rev: stored.rev,
          staffAdmins: state.staffAdmins.map((item) => publicStaff(item, true))
        });
        return;
      }

      if (pathname === '/staff/accept') {
        const token = String(body.token || '');
        const name = clip(body.name, 80);
        const email = clip(body.email, 160).toLowerCase();
        const password = String(body.password || '');
        if (name.length < 2) {
          json(res, 400, { error: 'name' });
          return;
        }
        if (!email || email.indexOf('@') < 0) {
          json(res, 400, { error: 'email' });
          return;
        }
        if (password.length < 8) {
          json(res, 400, { error: 'password' });
          return;
        }
        const row = state.staffAdmins.find((item) => item.inviteToken === token && item.status === 'pending');
        if (!row) {
          json(res, 404, { error: 'invite' });
          return;
        }
        const taken = state.staffAdmins.some((item) =>
          item.id !== row.id && item.status === 'active' && String(item.email || '').toLowerCase() === email);
        if (taken) {
          json(res, 409, { error: 'email' });
          return;
        }
        row.name = name;
        row.email = email;
        row.status = 'active';
        row.inviteToken = '';
        row.acceptedAt = new Date().toISOString();
        row.permissions = cleanStaffPerms(row.permissions);
        setStaffHash(slug, row.id, hashStaffPassword(password));
        const stored = saveStaffState(slug, rec, state);
        jsonCookie(res, 200, {
          ok: true,
          rev: stored.rev,
          staff: publicStaff(row, false),
          staffAdmins: state.staffAdmins.map((item) => publicStaff(item, false))
        }, staffCookieHeader(req, signStaff(row.id)));
        return;
      }

      const email = clip(body.email, 160).toLowerCase();
      const password = String(body.password || '');
      const row = state.staffAdmins.find((item) =>
        item.status === 'active' && String(item.email || '').toLowerCase() === email);
      if (!row || !checkStaffPassword(password, staffHashOf(slug, row.id))) {
        json(res, 401, { error: 'auth' });
        return;
      }
      jsonCookie(res, 200, {
        ok: true,
        rev: rec.rev || 0,
        staff: publicStaff(row, false),
        staffAdmins: state.staffAdmins.map((item) => publicStaff(item, false))
      }, staffCookieHeader(req, signStaff(row.id)));
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'staff' });
    });
    return true;
  }

  if (pathname.startsWith('/staff')) {
    json(res, 404, { error: 'not_found' });
    return true;
  }
  return false;
}

function hookParts(pathname) {
  const match = /^\/webhooks\/(lynk|mayar|xendit)(?:\/([a-z0-9][a-z0-9.-]{0,80}))?$/.exec(pathname);
  if (!match) return null;
  return { provider: match[1], slug: mediaSlug(match[2] || ANTON_SLUG) };
}

function safeReturnUrl(raw) {
  const url = String(raw || '').trim();
  if (/^https:\/\/(stage\.larisid\.com|larisid\.com)\//.test(url)) return url;
  return '';
}

function markPending(state, personId, pkg, source, extra) {
  state.billing = state.billing || {};
  const prev = state.billing[personId] || {};
  state.billing[personId] = Object.assign({}, prev, extra || {}, {
    status: 'pending',
    source: source,
    pendingTerm: pkg.id,
    pendingAmount: pkg.priceIdr,
    pendingAt: new Date().toISOString(),
    amount: pkg.priceIdr,
    term: pkg.id,
    packageId: pkg.id,
    note: 'Menunggu ' + source + ' · ' + pkg.label
  });
  if (!state.billing[personId].plan) state.billing[personId].plan = 'preview';
}

async function createPayInvoice(req, res, q, buf) {
  let body = {};
  try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
    json(res, 400, { error: 'bad_json' });
    return;
  }
  const slug = mediaSlug(q.slug || body.slug);
  if (!slug) { json(res, 404, { error: 'slug' }); return; }
  const personId = String(body.personId || '');
  const packageId = String(body.packageId || '');
  const studentId = readStudentCookie(req);
  const staff = await requestIsStaff(req, q, slug);
  if (!staff && (!studentId || studentId !== personId)) {
    json(res, 403, { error: 'forbidden' });
    return;
  }
  const rec = persistStrip(takeState(slug), slug);
  const state = rec && rec.state;
  if (!state || state.paymentsEnabled !== true) {
    json(res, 409, { error: 'payments_off' });
    return;
  }
  const pkg = packageById(state, packageId);
  if (!pkg || pkg.priceIdr < 1000) {
    json(res, 400, { error: 'package' });
    return;
  }
  const person = personRecord(state, personId);
  if (!person) { json(res, 404, { error: 'student' }); return; }
  const provider = String(state.checkoutProvider || '');
  const back = safeReturnUrl(body.returnUrl);
  const secrets = readPaySecrets(slug);
  let link = '';
  let ref = '';
  try {
  if (provider === 'mayar') {
    if (!secrets.mayarApiKey) { json(res, 503, { error: 'unconfigured' }); return; }
    const mobile = phoneKey(person.wa);
    if (mobile.length < 10) { json(res, 400, { error: 'wa' }); return; }
    const inv = await createMayarInvoice(secrets.mayarApiKey, {
      name: person.name || 'Siswa',
      email: person.email || ('siswa+' + personId.replace(/[^a-z0-9]/gi, '').slice(0, 20) + '@larisid.com'),
      mobile: mobile,
      description: pkg.label,
      redirectUrl: back,
      expiredAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      items: [{ quantity: 1, rate: pkg.priceIdr, description: pkg.label }],
      extraData: { slug: slug, personId: personId, packageId: pkg.id }
    });
    if (!inv.link) { json(res, 502, { error: 'mayar_link' }); return; }
    link = inv.link;
    ref = inv.transactionId || inv.id;
    markPending(state, personId, pkg, 'mayar', { mayarTx: ref, mayarInvoice: inv.id, mayarLink: link, payerWa: person.wa });
  } else if (provider === 'xendit') {
    if (!secrets.xenditSecretKey) { json(res, 503, { error: 'unconfigured' }); return; }
    const external = [slug, personId, pkg.id, crypto.randomBytes(4).toString('hex')].join('|');
    const payload = {
      external_id: external,
      amount: pkg.priceIdr,
      description: pkg.label,
      invoice_duration: 86400,
      currency: 'IDR',
      payment_methods: ['QRIS']
    };
    if (back) payload.success_redirect_url = back;
    const customer = { given_names: (person.name || 'Siswa').slice(0, 80) };
    if (person.email) customer.email = person.email;
    const mobile = phoneKey(person.wa);
    if (mobile) customer.mobile_number = '+' + mobile;
    payload.customer = customer;
    const inv = await createXenditInvoice(secrets.xenditSecretKey, payload);
    if (!inv.link) { json(res, 502, { error: 'xendit_link' }); return; }
    link = inv.link;
    ref = external;
    markPending(state, personId, pkg, 'xendit', { xenditRef: external, xenditId: inv.id, xenditLink: link, payerWa: person.wa });
  } else if (provider === 'lynk') {
    const row = (state.lynkByPackage && state.lynkByPackage[pkg.id]) || {};
    const url = String(row.url || '').trim();
    if (!/^https:\/\//i.test(url)) { json(res, 409, { error: 'no_lynk_url' }); return; }
    link = url;
    ref = 'lynk-' + personId + '-' + pkg.id;
    markPending(state, personId, pkg, 'lynk', { lynkUrl: url, payerWa: person.wa });
  } else {
    json(res, 409, { error: 'no_provider' });
    return;
  }
  } catch (err) {
    json(res, 502, { error: 'provider', detail: (err && err.detail) || (err && err.message) || 'fail' });
    return;
  }
  const stored = saveSchool(rec, slug, state);
  json(res, 200, { ok: true, url: link, provider: provider, ref: ref, rev: stored.rev });
}

function finishGrant(res, rec, slug, state, refId, provider, personId, extra) {
  recordPayEvent(Object.assign({
    refId: refId,
    provider: provider,
    slug: slug,
    personId: personId,
    at: new Date().toISOString()
  }, extra || {}));
  const stored = saveSchool(rec, slug, state);
  json(res, 200, { ok: true, matched: true, rev: stored.rev });
}

function grantLynkHook(res, slug, req, body) {
  const key = lynkKeyFor(slug);
  if (!key) { json(res, 503, { error: 'unconfigured' }); return; }
  const event = String(dig(body, [['event'], ['type']]) || '');
  if (event && event !== 'payment.received') {
    json(res, 200, { ok: true, ignored: event });
    return;
  }
  const refId = String(dig(body, [['refId'], ['data', 'refId'], ['ref_id'], ['data', 'ref_id']]) || '');
  const messageId = String(dig(body, [['message_id'], ['data', 'message_id'], ['messageId'], ['data', 'messageId']]) || '');
  const amount = amountString(dig(body, [['grandTotal'], ['data', 'grandTotal'], ['amount'], ['data', 'amount']]));
  const got = String(req.headers['x-lynk-signature'] || '');
  if (!refId || !messageId || !amount || !sigEqual(got, lynkSignature(amount, refId, messageId, key))) {
    json(res, 401, { error: 'signature' });
    return;
  }
  if (seenPayRef(refId)) { json(res, 200, { ok: true, duplicate: true }); return; }
  const phone = String(dig(body, [
    ['customer', 'phone'], ['data', 'customer', 'phone'],
    ['customer', 'mobile'], ['data', 'customer', 'mobile'],
    ['customer', 'whatsapp'], ['data', 'customer', 'whatsapp'],
    ['phone'], ['data', 'phone']
  ]) || '');
  const name = String(dig(body, [['customer', 'name'], ['data', 'customer', 'name'], ['name']]) || '');
  const titles = itemTitles(body);
  const rec = persistStrip(takeState(slug), slug);
  const state = rec && rec.state;
  const catalog = lynkPackageCatalog(state);
  const matched = catalog.filter((row) => titles.some((title) => normTitle(title) === normTitle(row.title)));
  const base = {
    at: new Date().toISOString(),
    slug: slug,
    refId: refId,
    messageId: messageId,
    amount: amount,
    phone: phone,
    name: name.slice(0, 120),
    titles: titles.slice(0, 8)
  };
  if (!state || matched.length !== 1) {
    rememberUnmatched(Object.assign({ reason: !state ? 'no_state' : (matched.length ? 'ambiguous_title' : 'not_mentoring') }, base));
    json(res, 200, { ok: true, matched: false });
    return;
  }
  const product = matched[0];
  const hits = peopleInState(state).filter((person) => phonesMatch(person.wa, phone));
  if (hits.length !== 1) {
    rememberUnmatched(Object.assign({ reason: hits.length ? 'ambiguous_phone' : 'no_phone', term: product.id || product.term, packageId: product.id }, base));
    json(res, 200, { ok: true, matched: false });
    return;
  }
  grantPaid(state, hits[0], {
    months: product.months || termMonths(product.term),
    packageId: product.id,
    source: 'lynk',
    amount: Number(amount) || product.price || 0,
    refId: refId,
    label: product.label || termLabel(product.term)
  });
  writeUnmatched(readUnmatched().filter((item) => item.refId !== refId));
  recordLynkPayment({
    refId: refId,
    at: base.at,
    personId: hits[0].id,
    term: product.term || product.id,
    amount: amount,
    matched: true
  });
  finishGrant(res, rec, slug, state, refId, 'lynk', hits[0].id);
}

async function grantMayarHook(res, slug, q, body) {
  const secrets = readPaySecrets(slug);
  if (!secrets.mayarWebhookToken || !sigEqual(String(q.token || ''), secrets.mayarWebhookToken)) {
    json(res, 401, { error: 'signature' });
    return;
  }
  const event = String(body.event || body.type || '');
  if (event && event !== 'payment.received') {
    json(res, 200, { ok: true, ignored: event });
    return;
  }
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const status = data.status;
  const okStatus = status === true || String(status).toUpperCase() === 'SUCCESS';
  if (!okStatus) { json(res, 200, { ok: true, ignored: 'status' }); return; }
  const tx = String(data.transactionId || data.id || '');
  if (!tx || seenPayRef(tx)) { json(res, 200, { ok: true, duplicate: true }); return; }
  const rec = persistStrip(takeState(slug), slug);
  const state = rec && rec.state;
  if (!state) { json(res, 200, { ok: true, matched: false }); return; }
  const extra = data.extraData || data.extra_data || {};
  let personId = extra && extra.personId ? String(extra.personId) : '';
  if (!personId) {
    const billing = state.billing || {};
    Object.keys(billing).some((id) => {
      const row = billing[id];
      if (row && (row.mayarTx === tx || (data.productId && row.mayarInvoice === String(data.productId)))) {
        personId = id;
        return true;
      }
      return false;
    });
  }
  const person = personId ? personRecord(state, personId) : null;
  if (!person) { json(res, 200, { ok: true, matched: false }); return; }
  const invoiceId = String(data.productId || (state.billing[personId] && state.billing[personId].mayarInvoice) || '');
  const paid = await mayarInvoicePaid(secrets.mayarApiKey, invoiceId);
  if (paid === false) { json(res, 200, { ok: true, matched: false, reason: 'unpaid' }); return; }
  const pkg = packageById(state, (state.billing[personId] && state.billing[personId].packageId) || (extra && extra.packageId) || '');
  grantPaid(state, person, {
    months: pkg ? pkg.months : 1,
    packageId: pkg ? pkg.id : '',
    source: 'mayar',
    amount: Number(data.amount) || (pkg && pkg.priceIdr) || 0,
    refId: tx,
    label: pkg ? pkg.label : 'Mayar'
  });
  finishGrant(res, rec, slug, state, tx, 'mayar', personId);
}

function grantXenditHook(res, slug, req, body) {
  const secrets = readPaySecrets(slug);
  const got = String(req.headers['x-callback-token'] || '');
  if (!secrets.xenditCallbackToken || !sigEqual(got, secrets.xenditCallbackToken)) {
    json(res, 401, { error: 'signature' });
    return;
  }
  const status = String(body.status || '').toUpperCase();
  if (status !== 'PAID' && status !== 'SETTLED') {
    json(res, 200, { ok: true, ignored: status || 'status' });
    return;
  }
  const external = String(body.external_id || '');
  if (!external || seenPayRef(external)) { json(res, 200, { ok: true, duplicate: true }); return; }
  const parts = external.split('|');
  if (parts.length < 3 || parts[0] !== slug) { json(res, 200, { ok: true, matched: false }); return; }
  const rec = persistStrip(takeState(slug), slug);
  const state = rec && rec.state;
  const person = state && personRecord(state, parts[1]);
  const pkg = state && packageById(state, parts[2]);
  if (!state || !person || !pkg) { json(res, 200, { ok: true, matched: false }); return; }
  grantPaid(state, person, {
    months: pkg.months,
    packageId: pkg.id,
    source: 'xendit',
    amount: Number(body.paid_amount || body.amount) || pkg.priceIdr,
    refId: external,
    label: pkg.label
  });
  finishGrant(res, rec, slug, state, external, 'xendit', person.id);
}

async function matchUnpaid(req, res, q, buf) {
  let body = {};
  try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
    json(res, 400, { error: 'bad_json' });
    return;
  }
  const slug = mediaSlug(q.slug || body.slug);
  if (!(await requestIsStaff(req, q, slug))) { json(res, 403, { error: 'forbidden' }); return; }
  const refId = String(body.refId || '');
  const personId = String(body.personId || '');
  const row = readUnmatched().find((item) => item.refId === refId && (!item.slug || item.slug === slug));
  if (!row) { json(res, 404, { error: 'missing' }); return; }
  if (seenPayRef(refId)) { json(res, 200, { ok: true, duplicate: true }); return; }
  const rec = persistStrip(takeState(slug), slug);
  const state = rec && rec.state;
  const person = state && personRecord(state, personId);
  const catalog = lynkPackageCatalog(state || {});
  const product = catalog.find((item) => item.id === row.packageId || item.term === row.term) || catalog[0];
  if (!person || !product) { json(res, 404, { error: 'student' }); return; }
  grantPaid(state, person, {
    months: product.months || termMonths(product.term),
    packageId: product.id,
    source: 'lynk',
    amount: Number(row.amount) || product.price || 0,
    refId: refId,
    label: product.label || termLabel(product.term)
  });
  writeUnmatched(readUnmatched().filter((item) => item.refId !== refId));
  recordLynkPayment({ refId: refId, at: new Date().toISOString(), personId: personId, term: product.id, amount: row.amount, matched: true });
  finishGrant(res, rec, slug, state, refId, 'lynk', personId, { manual: true });
}

function handlePayHttp(req, res, pathname, q) {
  const hook = hookParts(pathname);
  if (hook && req.method === 'POST') {
    if (!hook.slug) { json(res, 404, { error: 'slug' }); return true; }
    readBody(req, 256 * 1024).then((buf) => lock(async () => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      if (hook.provider === 'lynk') grantLynkHook(res, hook.slug, req, body);
      else if (hook.provider === 'mayar') await grantMayarHook(res, hook.slug, q, body);
      else grantXenditHook(res, hook.slug, req, body);
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'pay_hook' });
    });
    return true;
  }
  if (pathname === '/pay/status' && req.method === 'GET') {
    const slug = mediaSlug(q.slug);
    requestIsStaff(req, q, slug).then((ok) => {
      if (!ok) { json(res, 403, { error: 'forbidden' }); return; }
      json(res, 200, payStatusPublic(slug));
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'pay_status' });
    });
    return true;
  }
  if (pathname === '/pay/secrets' && req.method === 'POST') {
    readBody(req, 16 * 1024).then(async (buf) => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = mediaSlug(q.slug || body.slug);
      if (!(await requestIsStaff(req, q, slug))) { json(res, 403, { error: 'forbidden' }); return; }
      applySecretPatch(slug, body);
      json(res, 200, payStatusPublic(slug));
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'pay_secrets' });
    });
    return true;
  }
  if (pathname === '/pay/invoice' && req.method === 'POST') {
    readBody(req, 16 * 1024).then((buf) => lock(() => createPayInvoice(req, res, q, buf))).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'pay_invoice' });
    });
    return true;
  }
  if (pathname === '/pay/match' && req.method === 'POST') {
    readBody(req, 16 * 1024).then((buf) => lock(() => matchUnpaid(req, res, q, buf))).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'pay_match' });
    });
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://anton-school');
  const q = queryOf(url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (handlePayHttp(req, res, pathname, q)) return;
  if (handleStaff(req, res, url, q, pathname)) return;

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  /* Per-school PWA card so Add to Home Screen opens this mentor, not Anton. */
  if (req.method === 'GET' && pathname === '/manifest') {
    const brand = schoolBrandCard(req, q.slug);
    if (!brand) {
      json(res, 404, { error: 'slug' });
      return;
    }
    const body = JSON.stringify({
      name: brand.name,
      short_name: brand.short,
      start_url: brand.startPath,
      scope: brand.startPath,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#101012',
      theme_color: '#101012',
      lang: 'id',
      icons: [{ src: brand.icon, sizes: '192x192', type: 'image/png', purpose: 'any' }]
    });
    res.writeHead(200, {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-robots-tag': 'noindex'
    });
    res.end(body);
    return;
  }

  /* WhatsApp / social crawlers: HTML with org og:title (static SPA says "Kelas"). */
  if (req.method === 'GET' && pathname === '/share-card') {
    const brand = schoolBrandCard(req, q.slug);
    if (!brand) {
      res.writeHead(404, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex'
      });
      res.end('<!DOCTYPE html><title>Kelas</title><p>Kelas tidak ditemukan.</p>');
      return;
    }
    const invite = String(q.invite || '').trim().slice(0, 128);
    const pageUrl = brand.origin + brand.startPath + (invite ? ('?invite=' + encodeURIComponent(invite)) : '');
    const title = brand.name;
    const desc = brand.headline
      ? brand.headline
      : ('Gabung kelas ' + brand.name + ' di LMS.');
    const html = '<!DOCTYPE html>\n' +
      '<html lang="id"><head>\n' +
      '<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + escHtml(title) + '</title>\n' +
      '<meta name="description" content="' + escHtml(desc) + '">\n' +
      '<meta name="robots" content="noindex, nofollow">\n' +
      '<link rel="icon" href="' + escHtml(brand.icon) + '">\n' +
      '<link rel="apple-touch-icon" href="' + escHtml(brand.icon) + '">\n' +
      '<meta property="og:type" content="website">\n' +
      '<meta property="og:site_name" content="LMS">\n' +
      '<meta property="og:title" content="' + escHtml(title) + '">\n' +
      '<meta property="og:description" content="' + escHtml(desc) + '">\n' +
      '<meta property="og:url" content="' + escHtml(pageUrl) + '">\n' +
      '<meta property="og:image" content="' + escHtml(brand.icon) + '">\n' +
      '<meta property="og:image:width" content="512">\n' +
      '<meta property="og:image:height" content="512">\n' +
      '<meta name="twitter:card" content="summary">\n' +
      '<meta name="twitter:title" content="' + escHtml(title) + '">\n' +
      '<meta name="twitter:description" content="' + escHtml(desc) + '">\n' +
      '<meta name="twitter:image" content="' + escHtml(brand.icon) + '">\n' +
      '<link rel="canonical" href="' + escHtml(pageUrl) + '">\n' +
      '</head><body>\n' +
      '<p><a href="' + escHtml(pageUrl) + '">Buka ' + escHtml(title) + '</a></p>\n' +
      '</body></html>\n';
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=120',
      'x-robots-tag': 'noindex'
    });
    res.end(html);
    return;
  }

  if (req.method === 'GET' && pathname === '/admin/enter') {
    if (!ADMIN_KEY) {
      json(res, 503, { error: 'unconfigured' });
      return;
    }
    if (!sameSecret(q.key, ADMIN_KEY)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = proto === 'https' ? '; Secure' : '';
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'set-cookie': 'anton_admin=1; HttpOnly; SameSite=Lax; Path=/obrolan.marketing' + secure
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && pathname === '/admin/check') {
    if (!adminAuthed(req, q)) {
      json(res, 403, { ok: false });
      return;
    }
    if (sameSecret(q.key, ADMIN_KEY)) {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'set-cookie': adminCookie(req, '1')
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/admin/logout') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      'set-cookie': adminCookie(req, '', 0)
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && pathname === '/admin/summary') {
    if (!adminAuthed(req, q)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    lock(() => {
      persistStrip(takeState());
      json(res, 200, summary());
    });
    return;
  }

  /* Platform LMS admin: mentor count + students per mentor. Email allow-list only. */
  if (req.method === 'GET' && pathname === '/platform/me') {
    supabaseUser(req).then((user) => {
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      if (!platformAdminEmail(user)) {
        json(res, 403, { ok: false });
        return;
      }
      json(res, 200, { ok: true, email: String(user.email || '').trim().toLowerCase() });
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/platform/summary') {
    supabaseUser(req).then((user) => {
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      if (!platformAdminEmail(user)) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      lock(() => {
        json(res, 200, platformSummary());
      });
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/owners/me') {
    supabaseUser(req).then((user) => {
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      const map = readOwners();
      let slug = map[user.id] || '';
      if (!slug) {
        try {
          const files = fs.readdirSync(stateDir);
          for (let i = 0; i < files.length; i += 1) {
            if (!files[i].endsWith('.json')) continue;
            const rec = readState(files[i].replace(/\.json$/, ''));
            if (rec && rec.state && rec.state.ownerUserId === user.id) {
              slug = String(rec.state.schoolSlug || files[i].replace(/\.json$/, ''));
              map[user.id] = slug;
              writeOwners(map);
              break;
            }
          }
        } catch (err) { /* ignore */ }
      }
      json(res, 200, { slug: slug || '' });
    });
    return;
  }

  /* Contabo /lms mentor door: create or reuse disk school for this auth user. */
  if (req.method === 'POST' && pathname === '/owners/claim') {
    readBody(req, 64 * 1024).then((buf) => lock(async () => {
      const user = await supabaseUser(req);
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      const owners = readOwners();
      if (owners[user.id]) {
        fillOwnerEmail(owners[user.id], user);
        json(res, 200, { slug: owners[user.id], created: false });
        return;
      }
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = String(body.slug || '').trim().toLowerCase();
      const status = slugStatus(slug);
      if (status === 'reserved') {
        json(res, 409, { error: 'reserved' });
        return;
      }
      const existingOwner = ownerOf(slug);
      if (status === 'taken' && existingOwner && existingOwner !== user.id) {
        json(res, 409, { error: 'taken' });
        return;
      }
      if (status === 'taken' && existingOwner === user.id) {
        owners[user.id] = slug;
        writeOwners(owners);
        fillOwnerEmail(slug, user);
        json(res, 200, { slug: slug, created: false });
        return;
      }
      if (status === 'taken') {
        const held = readState(slug);
        const stateOwner = held && held.state && held.state.ownerUserId;
        if (stateOwner && stateOwner === user.id) {
          owners[user.id] = slug;
          writeOwners(owners);
          fillOwnerEmail(slug, user);
          json(res, 200, { slug: slug, created: false });
          return;
        }
        json(res, 409, { error: 'taken' });
        return;
      }
      const org = clip(body.orgName || body.businessName || slug, 80) || slug;
      const display = clip(body.displayName || body.name || org, 80) || org;
      const parts = display.split(/\s+/).filter(Boolean);
      const firstName = clip(parts[0] || display, 40);
      const lastName = clip(parts.slice(1).join(' ') || firstName, 80);
      writeState(emptySchool(slug, user, {
        firstName: firstName,
        lastName: lastName,
        businessName: org,
        headline: 'Mentor',
        mentorBand: '1-10',
        biography: ''
      }, ''), slug);
      owners[user.id] = slug;
      writeOwners(owners);
      json(res, 201, { slug: slug, created: true });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'school' });
    });
    return;
  }

  const slugLook = pathname.match(/^\/slug\/([^/]+)$/);
  if (req.method === 'GET' && slugLook) {
    const asked = decodeURIComponent(slugLook[1]).toLowerCase();
    json(res, 200, { slug: asked, status: slugStatus(asked) });
    return;
  }

  const gateLook = pathname.match(/^\/gate\/([^/]+)$/);
  if (req.method === 'GET' && gateLook) {
    const asked = decodeURIComponent(gateLook[1]).toLowerCase();
    const known = slugStatus(asked) === 'taken';
    res.writeHead(known ? 204 : 404, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
    res.end();
    return;
  }

  if (req.method === 'POST' && pathname === '/schools') {
    readBody(req, 3 * 1024 * 1024).then((buf) => lock(async () => {
      const user = await supabaseUser(req);
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      const owners = readOwners();
      if (owners[user.id]) {
        fillOwnerEmail(owners[user.id], user);
        json(res, 200, { slug: owners[user.id], created: false });
        return;
      }
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = String(body.slug || '').trim().toLowerCase();
      const status = slugStatus(slug);
      if (status !== 'free') {
        json(res, 409, { error: status === 'taken' ? 'taken' : 'reserved' });
        return;
      }
      if (!clip(body.firstName, 40) || !clip(body.lastName, 80) || !clip(body.businessName, 80) || !clip(body.headline, 60)) {
        json(res, 400, { error: 'profile' });
        return;
      }
      if (MENTOR_BANDS.indexOf(String(body.mentorBand || '')) < 0) {
        json(res, 400, { error: 'band' });
        return;
      }
      let photoUrl = '';
      if (body.photo) {
        photoUrl = saveProfilePhoto(slug, body.photo);
        if (!photoUrl) {
          json(res, 400, { error: 'photo' });
          return;
        }
      }
      writeState(emptySchool(slug, user, body, photoUrl), slug);
      owners[user.id] = slug;
      writeOwners(owners);
      json(res, 201, { slug: slug, created: true });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'school' });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/session') {
    readBody(req, 64 * 1024).then((buf) => lock(async () => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) { body = {}; }
      const slug = resolveLiveSlug(body.slug);
      if (!slug) {
        json(res, 404, { error: 'slug' });
        return;
      }
      const user = await supabaseUser(req);
      if (isStaffFor(req, q, slug, user)) {
        json(res, 200, { role: 'staff' });
        return;
      }
      const rec = takeState(slug) || { rev: 0, state: {} };
      if (!rec.state || typeof rec.state !== 'object') rec.state = {};
      const state = rec.state;
      const cookieId = readStudentCookie(req);
      const known = cookieId && lookupPerson(state, cookieId) ? cookieId : '';
      if (user && user.id) {
        const claimed = claimStudentAccount(state, user, known, inviteAccepted(rec, bodyInvite(body, q), slug));
        if (!claimed) {
          json(res, 200, { role: 'guest', needsAuth: true });
          return;
        }
        const stored = {
          key: rec.key || DEFAULT_INVITE,
          rev: (Number(rec.rev) || 0) + 1,
          updatedAt: new Date().toISOString(),
          state: state
        };
        writeRecord(stored, slug);
        replyStudent(req, res, claimed.id, {
          authed: true,
          created: claimed.created,
          hasApplication: applicationFinished(state, claimed.id),
          rev: stored.rev
        });
        return;
      }
      const visitorHit = findByVisitor(state, body.visitorId);
      const studentId = known || (visitorHit && !isMentorRow(state, visitorHit.id, visitorHit) && visitorHit.id) || '';
      if (!studentId || isMentorRow(state, studentId, {})) {
        json(res, 200, { role: 'guest' });
        return;
      }
      replyStudent(req, res, studentId, {
        authed: false,
        needsAuth: true,
        hasApplication: applicationFinished(state, studentId)
      });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'session' });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/join') {
    readBody(req, 64 * 1024).then((buf) => lock(async () => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = resolveLiveSlug(body.slug);
      if (!slug) {
        json(res, 404, { error: 'slug' });
        return;
      }
      const wa = phoneKey(body.wa);
      const firstName = String(body.firstName || '').trim();
      if (wa.length < 10 || !firstName) {
        json(res, 400, { error: 'profile' });
        return;
      }
      const rec = takeState(slug) || { rev: 0, state: {} };
      if (!rec.state || typeof rec.state !== 'object') rec.state = {};
      stripDemoPeople(rec.state);
      const state = rec.state;
      const user = await supabaseUser(req);
      const cookieId = readStudentCookie(req);
      /* Prefer the signed-in / cookie row so a finished wizard never mints a
         second stu_… when WA was blank on POST /session. */
      let row = null;
      if (cookieId && lookupPerson(state, cookieId) && !isMentorRow(state, cookieId, {})) {
        const live = (state.liveStudents || []).find((s) => s && s.id === cookieId) || {};
        const person = (state.people && state.people[cookieId]) || {};
        row = Object.assign({ id: cookieId }, person, live);
      }
      if (!row && user && user.id) {
        const byAuth = findByAuthUser(state, user.id);
        if (byAuth && !isMentorRow(state, byAuth.id, byAuth)) row = byAuth;
      }
      if (!row) row = findByWa(state, wa);
      let created = false;
      if (!row) {
        const staff = isStaffFor(req, q, slug, user);
        if (!staff && !inviteAccepted(rec, bodyInvite(body, q), slug)) {
          json(res, 403, { error: 'invite' });
          return;
        }
        created = true;
        row = {
          id: 'stu_' + crypto.randomBytes(9).toString('hex'),
          kind: 'student',
          mentorId: state.ownerId || '',
          visitorIds: [],
          tags: []
        };
      } else {
        const live = (state.liveStudents || []).find((s) => s && s.id === row.id);
        row = Object.assign({}, live || {}, row);
      }
      if (user && user.id && !row.authUserId) row.authUserId = user.id;
      applyJoinProfile(row, body);
      if (!row.mentorId) row.mentorId = state.ownerId || '';
      if (row.kind !== 'mentor') row.kind = 'student';
      upsertJoined(state, row);
      const stored = {
        key: rec.key || DEFAULT_INVITE,
        rev: (Number(rec.rev) || 0) + 1,
        updatedAt: new Date().toISOString(),
        state: state
      };
      writeRecord(stored, slug);
      const student = lookupPerson(state, row.id) || { id: row.id, name: row.name, wa: row.wa };
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'set-cookie': studentCookie(req, signStudent(row.id))
      });
      res.end(JSON.stringify({
        role: 'student',
        studentId: row.id,
        created: created,
        rev: stored.rev,
        student: {
          id: row.id,
          name: student.name,
          firstName: row.firstName || '',
          lastName: row.lastName || '',
          wa: student.wa,
          email: row.email || '',
          city: row.city || '',
          shopName: row.shopName || '',
          shopUrl: row.shopUrl || '',
          mentorId: row.mentorId
        }
      }));
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'join' });
    });
    return;
  }

  const stateMatch = pathname.match(/^\/state\/([^/]+)$/);
  if (stateMatch) {
    const slug = decodeURIComponent(stateMatch[1]).toLowerCase();
    if (slug !== ANTON_SLUG && slugStatus(slug) !== 'taken') {
      json(res, 404, { error: 'slug' });
      return;
    }
    if (req.method === 'GET') {
      const askedRev = Number(q.rev);
      Promise.resolve().then(async () => {
        const user = await supabaseUser(req);
        const peek = readState(slug);
        const staff = isStaffFor(req, q, slug, user);
        const staffRow = !staff && !asStudentView(req) ? activeStaffRow(peek && peek.state, readStaffCookie(req)) : null;
        const rotate = !!(staff && peek && peek.state && inviteNeedsRotate(peek.state, slug));
        const peekRev = Number(peek && peek.rev) || 0;
        const extra = mediaCookieHeader(req, slug, mediaGrantRole(staff, staffRow));
        if (!rotate && peek && Number.isFinite(askedRev) && askedRev > 0 && askedRev >= peekRev) {
          json(res, 200, { rev: peekRev, unchanged: true }, extra);
          return;
        }
        await lock(async () => {
          let rec = persistStrip(takeState(slug), slug);
          if (rec && rec.state && expireAccess(rec.state)) {
            rec.rev = (Number(rec.rev) || 0) + 1;
            rec.updatedAt = new Date().toISOString();
            writeState(rec, slug);
          }
          if (staff && rec && rec.state && inviteNeedsRotate(rec.state, slug)) {
            rec.state.inviteCode = crypto.randomBytes(9).toString('hex');
            rec.state.inviteCodeCustom = true;
            rec.rev = (Number(rec.rev) || 0) + 1;
            rec.updatedAt = new Date().toISOString();
            writeState(rec, slug);
          }
          const studentId = readStudentCookie(req);
          const updatedAt = rec && rec.updatedAt || null;
          const rev = rec && rec.rev || 0;
          const raw = rec && rec.state;
          if (raw && ensurePlatformCatalog(raw, slug)) {
            rec.rev = (Number(rec.rev) || 0) + 1;
            rec.updatedAt = new Date().toISOString();
            writeState(rec, slug);
          }
          let state;
          if (staff) {
            if (user && raw && applyOwnerEmail(raw, user)) {
              rec.rev = (Number(rec.rev) || 0) + 1;
              rec.updatedAt = new Date().toISOString();
              writeState(rec, slug);
            }
            state = Object.assign({}, raw || projectGuest(null));
            state.staffAdmins = listStaff(raw).map((item) => publicStaff(item, true));
          } else if (staffRow) state = viewForStaff(raw || {}, staffRow);
          else if (studentId && lookupPerson(raw || {}, studentId)) state = projectStudent(raw || {}, studentId, slug);
          else state = projectGuest(raw || {});
          json(res, 200, { rev: rec && rec.rev || rev, updatedAt: rec && rec.updatedAt || updatedAt, state: state }, extra);
        });
      }).catch((err) => {
        if (!res.headersSent) json(res, err.status || 500, { error: 'state' });
      });
      return;
    }
    if (req.method === 'PUT') {
      readBody(req, MAX_STATE).then((buf) => lock(async () => {
        const user = await supabaseUser(req);
        const rec = persistStrip(takeState(slug), slug);
        let body;
        try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
          json(res, 400, { error: 'bad_json' });
          return;
        }
        const staff = isStaffFor(req, q, slug, user);
        const staffRow = !staff && !asStudentView(req) ? activeStaffRow(rec && rec.state, readStaffCookie(req)) : null;
        const studentId = readStudentCookie(req);
        if (!staff && !staffRow && !studentId) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
        if (body && body.reset === true && !staff) {
          json(res, 403, { error: 'reset_forbidden' });
          return;
        }
        const incomingRev = Number(body && body.rev) || 0;
        if (rec && incomingRev <= (Number(rec.rev) || 0)) {
          json(res, 409, { error: 'stale', rev: rec.rev });
          return;
        }
        let nextState;
        if (staff || staffRow) {
          nextState = body && body.state ? body.state : null;
          if (nextState && typeof nextState === 'object') {
            stripDemoPeople(nextState);
            if (slug !== ANTON_SLUG && rec && rec.state) {
              nextState.ownerUserId = rec.state.ownerUserId;
              nextState.ownerId = rec.state.ownerId;
              nextState.schoolSlug = slug;
            }
            if (staffRow) nextState = guardStaffWrite(rec && rec.state, nextState, staffRow.permissions);
            else if (Array.isArray(nextState.staffAdmins)) {
              nextState.staffAdmins = nextState.staffAdmins.map((item) => {
                const clean = Object.assign({}, item);
                delete clean.passwordHash;
                return clean;
              });
            }
            /* Mentor browsers can push a stale empty roster after /join.
               Keep disk students the client omitted unless this is an explicit reset. */
            if (!(body && body.reset === true) && rec && rec.state) {
              nextState = preserveJoinedRoster(rec.state, nextState);
              nextState = preserveCurriculumOutline(rec.state, nextState, slug);
              keepServerInvite(rec.state, nextState, slug);
            }
            if (staff && user) applyOwnerEmail(nextState, user);
            ensurePlatformCatalog(nextState, slug);
          }
        } else {
          const base = (rec && rec.state) || {};
          nextState = mergeStudentWrite(base, body && body.state, studentId);
        }
        const stored = {
          key: (rec && rec.key) || DEFAULT_INVITE,
          rev: incomingRev || ((rec && rec.rev) || 0) + 1,
          updatedAt: (body && body.updatedAt) || new Date().toISOString(),
          state: nextState
        };
        writeRecord(stored, slug);
        json(res, 200, { rev: stored.rev, updatedAt: stored.updatedAt });
      })).catch((err) => {
        if (!res.headersSent) json(res, err.status || 500, { error: err.message || 'read' });
      });
      return;
    }
  }

  if (pathname === '/media/init' && req.method === 'POST') {
    const slug = mediaSlug(q.slug);
    if (!slug) {
      json(res, 404, { error: 'slug' });
      return;
    }
    mediaWriteOk(req, q, slug).then((ok) => {
      if (!ok) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      readBody(req, 64 * 1024).then((buf) => {
        let body;
        try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
          json(res, 400, { error: 'bad_json' });
          return;
        }
        const kind = body.kind === 'image' || body.kind === 'file' ? body.kind : 'video';
        const kurikulum = kind === 'file' && body.kurikulum === true;
        const cap = uploadCap(kind, kurikulum);
        const size = Number(body.size) || 0;
        if (!size || size > cap) {
          json(res, 413, { error: 'too_large', max: cap });
          return;
        }
        const lecId = String(body.lecId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
        if (!lecId) {
          json(res, 400, { error: 'lec' });
          return;
        }
        const uploadId = crypto.randomBytes(12).toString('hex');
        const key = slug + '/' + lecId + '/' + crypto.randomBytes(8).toString('hex');
        const dir = path.join(uploadDir, uploadId);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
          key,
          name: String(body.name || 'video.mp4').slice(0, 180),
          type: String(body.type || 'video/mp4').slice(0, 80),
          size,
          kind,
          maxSize: cap,
          createdAt: new Date().toISOString()
        }));
        json(res, 200, { uploadId, key });
      }).catch((err) => {
        if (!res.headersSent) json(res, err.status || 500, { error: 'init' });
      });
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'init' });
    });
    return;
  }

  if (pathname === '/media/part' && req.method === 'PUT') {
    const slug = mediaSlug(q.slug);
    if (!slug) {
      json(res, 404, { error: 'slug' });
      return;
    }
    mediaWriteOk(req, q, slug).then((ok) => {
      if (!ok) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      const uploadId = String(q.uploadId || '').replace(/[^a-f0-9]/g, '');
      const partNumber = Number(q.partNumber) || 0;
      const dir = path.join(uploadDir, uploadId);
      if (!uploadId || partNumber < 1 || partNumber > 200 || !fs.existsSync(path.join(dir, 'meta.json'))) {
        json(res, 400, { error: 'upload' });
        return;
      }
      readBody(req, MAX_PART).then((buf) => {
        fs.writeFileSync(path.join(dir, String(partNumber).padStart(4, '0')), buf);
        json(res, 200, { ok: true, partNumber, bytes: buf.length });
      }).catch((err) => {
        if (!res.headersSent) json(res, err.status || 500, { error: 'part' });
      });
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'part' });
    });
    return;
  }

  if (pathname === '/media/complete' && req.method === 'POST') {
    const slug = mediaSlug(q.slug);
    if (!slug) {
      json(res, 404, { error: 'slug' });
      return;
    }
    mediaWriteOk(req, q, slug).then((ok) => {
      if (!ok) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      readBody(req, 64 * 1024).then((buf) => lock(() => {
        let body = {};
        try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) { body = {}; }
        const uploadId = String(q.uploadId || body.uploadId || '').replace(/[^a-f0-9]/g, '');
        const dir = path.join(uploadDir, uploadId);
        const metaPath = path.join(dir, 'meta.json');
        if (!fs.existsSync(metaPath)) {
          json(res, 404, { error: 'upload' });
          return;
        }
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (String(meta.key || '').split('/')[0] !== slug) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
        const parts = fs.readdirSync(dir).filter((name) => /^\d+$/.test(name)).sort();
        if (!parts.length) {
          json(res, 400, { error: 'empty' });
          return;
        }
        const dest = mediaFile(meta.key);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        parts.forEach((name) => {
          fs.appendFileSync(dest, fs.readFileSync(path.join(dir, name)));
        });
        const size = fs.statSync(dest).size;
        const cap = Number(meta.maxSize) || MAX_VIDEO;
        if (size > cap) {
          fs.unlinkSync(dest);
          json(res, 413, { error: 'too_large' });
          return;
        }
        fs.writeFileSync(metaFile(meta.key), JSON.stringify({
          key: meta.key,
          name: meta.name,
          type: meta.type,
          kind: meta.kind === 'image' || meta.kind === 'file' || meta.kind === 'video' ? meta.kind : '',
          size
        }));
        fs.rmSync(dir, { recursive: true, force: true });
        json(res, 200, { key: meta.key, name: meta.name, mime: meta.type, size });
      })).catch((err) => {
        if (!res.headersSent) json(res, err.status || 500, { error: 'complete' });
      });
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'complete' });
    });
    return;
  }

  if (pathname === '/media' && req.method === 'DELETE') {
    readBody(req, 16 * 1024).then((buf) => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) { body = {}; }
      const key = keyOk(body.key) ? body.key : '';
      if (!key) {
        json(res, 400, { error: 'key' });
        return;
      }
      mediaWriteOk(req, q, key.split('/')[0]).then((ok) => {
        if (!ok) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
        const file = mediaFile(key);
        if (fs.existsSync(file)) fs.unlinkSync(file);
        if (fs.existsSync(metaFile(key))) fs.unlinkSync(metaFile(key));
        json(res, 200, { ok: true });
      }).catch(() => {
        if (!res.headersSent) json(res, 400, { error: 'delete' });
      });
    }).catch(() => {
      if (!res.headersSent) json(res, 400, { error: 'delete' });
    });
    return;
  }

  if (pathname === '/media/play-token' && req.method === 'GET') {
    const key = keyOk(q.key) ? q.key : '';
    if (!key) {
      json(res, 400, { error: 'key' });
      return;
    }
    const slug = key.split('/')[0];
    mediaReadOk(req, q, slug).then((ok) => {
      if (!ok) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      const meta = readMediaMeta(key);
      if (!videoNeedsPlayToken(key, meta)) {
        json(res, 400, { error: 'not_video' });
        return;
      }
      const signed = signPlayToken(key, playActor(req, slug));
      json(res, 200, { url: playFileUrl(key, signed.token), exp: signed.exp });
    }).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'media' });
    });
    return;
  }

  if (pathname === '/media/file' && req.method === 'GET') {
    const publicPhoto = publicPhotoKey(q.key);
    const key = publicPhoto ? q.key : (keyOk(q.key) ? q.key : (profileKeyOk(q.key) ? q.key : ''));
    if (!key) {
      json(res, 400, { error: 'key' });
      return;
    }
    const sendFile = (video) => {
      const file = mediaFile(key);
      if (!fs.existsSync(file)) {
        json(res, 404, { error: 'missing' });
        return;
      }
      const meta = readMediaMeta(key);
      const size = fs.statSync(file).size;
      const range = parseRange(req.headers.range, size);
      const mime = meta.type || (publicPhoto ? 'image/jpeg' : 'video/mp4');
      const headers = {
        'content-type': mime,
        'accept-ranges': 'bytes',
        'cache-control': video ? 'private, no-store' : (publicPhoto ? 'public, max-age=86400' : 'private, max-age=3600'),
        'x-robots-tag': 'noindex'
      };
      if (video) headers['content-disposition'] = 'inline';
      if (range) {
        headers['content-range'] = 'bytes ' + range.start + '-' + range.end + '/' + size;
        headers['content-length'] = String(range.end - range.start + 1);
        res.writeHead(206, headers);
        fs.createReadStream(file, { start: range.start, end: range.end }).pipe(res);
        return;
      }
      headers['content-length'] = String(size);
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    };
    if (publicPhoto) {
      sendFile(false);
      return;
    }
    mediaReadOk(req, q, key.split('/')[0]).then((ok) => {
      if (!ok) {
        /* Student may still load their own uploaded profile photo. */
        const studentId = readStudentCookie(req);
        const ownPhoto = studentId && key.indexOf('/photo-' + studentId + '/') !== -1;
        if (!ownPhoto) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
      }
      const meta = readMediaMeta(key);
      const video = videoNeedsPlayToken(key, meta);
      if (video) {
        const tok = readPlayToken(q.t);
        const slug = key.split('/')[0];
        if (!tok || tok.key !== key || tok.actor !== playActor(req, slug)) {
          json(res, 403, { error: 'token' });
          return;
        }
      }
      sendFile(video);
    }).catch(() => {
      if (!res.headersSent) json(res, 500, { error: 'media' });
    });
    return;
  }

  if (pathname === '/events' && req.method === 'POST') {
    readBody(req, MAX_EVENT_BYTES).then((buf) => lock(async () => {
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const slug = resolveLiveSlug(body.slug);
      if (!slug) {
        json(res, 404, { error: 'slug' });
        return;
      }
      const user = await supabaseUser(req);
      const eventStudent = readStudentCookie(req);
      const eventStaff = isStaffFor(req, q, slug, user);
      if (!eventStudent && !eventStaff) {
        json(res, 401, { error: 'auth' });
        return;
      }
      const type = String(body.type || '').slice(0, 40);
      if (!type) {
        json(res, 400, { error: 'type' });
        return;
      }
      const rec = takeState(slug);
      const person = eventStudent ? lookupPerson((rec && rec.state) || {}, eventStudent) : null;
      const row = {
        id: crypto.randomBytes(8).toString('hex'),
        at: new Date().toISOString(),
        type,
        visitorId: String(body.visitorId || '').slice(0, 80),
        path: String(body.path || '').slice(0, 180),
        referrer: String(body.referrer || '').slice(0, 300),
        name: person ? String(person.name || '').slice(0, 120) : '',
        wa: person ? String(person.wa || '').slice(0, 32) : '',
        email: person ? String(person.email || '').slice(0, 160) : '',
        lessonId: String(body.lessonId || '').slice(0, 64),
        lessonTitle: String(body.lessonTitle || '').slice(0, 180),
        personaId: eventStudent || '',
        message: String(body.message || '').slice(0, 500),
        progress: body.progress == null || body.progress === '' ? null : Number(body.progress),
        stage: String(body.stage || '').slice(0, 40),
        staff: !!eventStaff && !eventStudent,
        demo: false
      };
      appendEvent(row);
      json(res, 200, { ok: true, id: row.id });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'event' });
    });
    return;
  }

  if (pathname === '/issues' && req.method === 'POST') {
    readBody(req, MAX_EVENT_BYTES).then(async (buf) => {
      const studentId = readStudentCookie(req);
      const grant = readMediaGrant(req);
      const staffId = readStaffCookie(req);
      if (!studentId && !grant && !staffId && !adminAuthed(req, q)) {
        const user = await supabaseUser(req);
        if (!user) {
          json(res, 401, { error: 'auth' });
          return;
        }
      }
      await lock(() => {
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const text = String(body.body || body.message || '').trim().slice(0, 1000);
      if (!text) {
        json(res, 400, { error: 'body' });
        return;
      }
      const issue = {
        id: 'is-' + crypto.randomBytes(6).toString('hex'),
        at: new Date().toISOString(),
        status: 'open',
        kind: String(body.kind || 'report').slice(0, 20),
        visitorId: String(body.visitorId || '').slice(0, 80),
        name: String(body.name || '').slice(0, 120),
        wa: String(body.wa || '').slice(0, 32),
        lessonId: String(body.lessonId || '').slice(0, 64),
        lessonTitle: String(body.lessonTitle || '').slice(0, 180),
        body: text
      };
      const list = readIssues();
      list.push(issue);
      writeIssues(list);
      appendEvent({
        id: crypto.randomBytes(8).toString('hex'),
        at: issue.at,
        type: 'issue',
        visitorId: issue.visitorId,
        name: issue.name,
        wa: issue.wa,
        lessonId: issue.lessonId,
        message: text,
        staff: false,
        demo: false
      });
      json(res, 200, { ok: true, id: issue.id });
      });
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'issue' });
    });
    return;
  }

  if (pathname === '/issues/resolve' && req.method === 'POST') {
    if (!adminAuthed(req, q)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    readBody(req, 8 * 1024).then((buf) => lock(() => {
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const list = readIssues();
      const hit = list.find((item) => item.id === body.id);
      if (!hit) {
        json(res, 404, { error: 'missing' });
        return;
      }
      hit.status = 'resolved';
      hit.resolvedAt = new Date().toISOString();
      writeIssues(list);
      json(res, 200, { ok: true });
    })).catch(() => {
      if (!res.headersSent) json(res, 400, { error: 'resolve' });
    });
    return;
  }

  // Fonnte WhatsApp bridge (optional). Set FONNTE_API_TOKEN and FONNTE_DEVICE_READY=true.
  const FONNTE_TOKEN = String(process.env.FONNTE_API_TOKEN || '').trim();
  const FONNTE_READY = String(process.env.FONNTE_DEVICE_READY || '').toLowerCase() === 'true';
  if (pathname === '/wa/status') {
    json(res, 200, {
      ok: true,
      live: !!FONNTE_TOKEN,
      deviceReady: !!(FONNTE_TOKEN && FONNTE_READY),
      configured: !!FONNTE_TOKEN,
      threads: [],
      messages: []
    });
    return;
  }
  if (pathname === '/wa/inbox' || pathname === '/wa/thread') {
    json(res, 200, { ok: true, threads: [], messages: [], live: !!FONNTE_TOKEN, deviceReady: !!(FONNTE_TOKEN && FONNTE_READY) });
    return;
  }
  if (pathname === '/wa/send' && req.method === 'POST') {
    readBody(req, 64 * 1024).then(async (raw) => {
      let body;
      try { body = JSON.parse(String(raw || '{}')); } catch (err) { body = {}; }
      const slug = mediaSlug(q.slug || body.slug);
      if (!(await requestIsStaff(req, q, slug))) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      const target = String(body.phone || '').replace(/\D/g, '');
      const message = String(body.body || '').trim();
      if (!FONNTE_TOKEN) {
        json(res, 200, { ok: false, error: 'not_configured', configured: false });
        return;
      }
      if (!FONNTE_READY) {
        json(res, 200, { ok: false, error: 'device_not_ready', deviceReady: false });
        return;
      }
      if (!target || !message) {
        json(res, 400, { error: 'missing_fields' });
        return;
      }
      try {
        const fr = await fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target, message })
        });
        const text = await fr.text();
        let data = {};
        try { data = JSON.parse(text); } catch (err) { data = { raw: text }; }
        if (!fr.ok) {
          json(res, 502, { ok: false, error: 'fonnte_failed', detail: data });
          return;
        }
        json(res, 200, {
          ok: true,
          message: {
            id: 'wm-f-' + Date.now().toString(36),
            providerId: (data && (data.id || data.messageId)) || null,
            body: message,
            at: new Date().toISOString(),
            status: 'sent'
          },
          thread: {
            id: 'th-' + target,
            phone: target,
            personId: body.personId || null,
            updatedAt: new Date().toISOString(),
            unread: 0
          }
        });
      } catch (err) {
        json(res, 502, { ok: false, error: 'fonnte_unreachable' });
      }
    }).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'wa_send' });
    });
    return;
  }
  if (pathname === '/wa/status' || pathname === '/wa/inbox' || pathname === '/wa/thread' || pathname === '/wa/send') {
    json(res, 200, { ok: true, live: false, deviceReady: false, configured: false, threads: [], messages: [] });
    return;
  }
  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write('anton-school listening ' + PORT + '\n');
});

setInterval(() => {
  lock(() => {
    let names = [];
    try { names = fs.readdirSync(stateDir); } catch (err) { return; }
    names.forEach((name) => {
      if (!/\.json$/.test(name) || /\.bak\./.test(name)) return;
      const slug = name.replace(/\.json$/, '');
      const rec = takeState(slug);
      if (!rec || !rec.state || !expireAccess(rec.state)) return;
      rec.rev = (Number(rec.rev) || 0) + 1;
      rec.updatedAt = new Date().toISOString();
      writeState(rec, slug);
    });
  }).catch(() => {});
}, 60000);
