/**
 * School LMS on disk. Anton (obrolan.marketing) is the test school.
 * Each new coach gets their own file. Not the LarisID Postgres database.
 * Staff with the admin cookie get Anton's file only. A coach JWT is staff
 * only for the school they created. A student session gets only that student's row.
 * The invite code is not a credential.
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
const MAX_EVENT_BYTES = 16 * 1024;

const stateDir = path.join(DATA, 'state');
const ownersFile = path.join(DATA, 'owners.json');
const mediaDir = path.join(DATA, 'media');
const uploadDir = path.join(DATA, 'uploads');
const eventsFile = path.join(DATA, 'events.jsonl');
const issuesFile = path.join(DATA, 'issues.json');
const lynkPayFile = path.join(DATA, 'lynk-payments.jsonl');
const lynkUnmatchedFile = path.join(DATA, 'lynk-unmatched.json');
const LYNK_KEY = String(process.env.LYNK_MERCHANT_KEY || '');

for (const dir of [stateDir, mediaDir, uploadDir]) fs.mkdirSync(dir, { recursive: true });
if (!fs.existsSync(issuesFile)) fs.writeFileSync(issuesFile, '[]');

let chain = Promise.resolve();
function lock(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex'
  });
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
  return ownerOf(slug) === user.id;
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

function emptySchool(slug, user, body, photoUrl) {
  const ownerId = 'u-' + String(user.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  const socials = cleanSocials(body.socials);
  return {
    key: '',
    rev: 1,
    updatedAt: new Date().toISOString(),
    state: {
      schoolSlug: slug,
      businessName: clip(body.businessName, 80),
      mentorBand: body.mentorBand,
      ownerId: ownerId,
      ownerUserId: user.id,
      inviteCode: '',
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
      catalog: [],
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
      directory: []
    }
  };
}

function profileKeyOk(key) {
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?\/profile\.(png|jpe?g|webp)$/.test(String(key || ''));
}

function readState(slug) {
  try {
    return JSON.parse(fs.readFileSync(statePath(slug), 'utf8'));
  } catch (err) {
    return null;
  }
}

function writeState(rec, slug) {
  const file = statePath(slug);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec));
  fs.renameSync(tmp, file);
}

function inviteOf(rec) {
  const fromState = rec && rec.state && rec.state.inviteCode;
  return String(fromState || DEFAULT_INVITE);
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

function adminCookie(req, value, maxAge) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = proto === 'https' ? '; Secure' : '';
  const age = maxAge == null ? '' : '; Max-Age=' + maxAge;
  return 'anton_admin=' + value + '; HttpOnly; SameSite=Lax; Path=/obrolan.marketing' + secure + age;
}

function uploadCap(kind) {
  if (kind === 'image') return MAX_IMAGE;
  if (kind === 'file') return MAX_FILE;
  return MAX_VIDEO;
}

function queryOf(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function keyOk(key) {
  return /^obrolan\.marketing\/[A-Za-z0-9_-]+\/[A-Za-z0-9]+$/.test(String(key || ''));
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

function lynkSignature(amount, refId, messageId) {
  return crypto.createHash('sha256')
    .update(String(amount) + String(refId) + String(messageId) + LYNK_KEY)
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

function grantLynk(state, person, product, amount, refId) {
  const id = person.id;
  const now = new Date();
  const until = new Date(now.getTime());
  until.setMonth(until.getMonth() + termMonths(product.term));
  state.billing = state.billing || {};
  const prev = state.billing[id] || {};
  const products = Array.isArray(prev.products) ? prev.products : [];
  state.billing[id] = Object.assign({}, prev, {
    status: 'lunas',
    plan: 'mentoring',
    products,
    term: product.term,
    source: 'lynk',
    amount: Number(amount) || product.price || prev.amount || 0,
    paidAt: now.toISOString(),
    accessUntil: until.toISOString(),
    note: 'Lynk · ' + termLabel(product.term),
    lynkRef: refId,
    payerWa: person.wa
  });
  delete state.billing[id].pendingTerm;
  delete state.billing[id].pendingAmount;
  delete state.billing[id].pendingAt;
  delete state.billing[id].offerExpiresAt;
  state.crm = state.crm || {};
  const crm = state.crm[id] || {};
  if (crm.stage !== 'mentee') {
    state.crm[id] = Object.assign({}, crm, { stage: 'mentee' });
    state.timeline = state.timeline || {};
    const line = state.timeline[id] || [];
    state.timeline[id] = [{ at: now.toISOString(), kind: 'stage', body: 'Lunas mentoring · ' + product.term }].concat(line);
  }
  state.timeline = state.timeline || {};
  state.timeline[id] = [{
    at: now.toISOString(),
    kind: 'pay',
    body: 'Bayar Lynk · ' + termLabel(product.term)
  }].concat(state.timeline[id] || []);
  state.enrollments = state.enrollments || {};
  const enrolled = Array.isArray(state.enrollments[id]) ? state.enrollments[id] : [];
  if (!enrolled.some((row) => row && (row.planId === 'onboarding' || row === 'onboarding'))) {
    state.enrollments[id] = enrolled.concat([{ planId: 'onboarding', at: now.toISOString() }]);
  }
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
  const age = token ? '' : '; Max-Age=0';
  return 'lms_student=' + value + '; HttpOnly; SameSite=Lax; Path=/obrolan.marketing' + age + secure;
}

function asStudentView(req) {
  return String(req.headers['x-lms-view'] || '') === 'student';
}

function staffRequest(req, q) {
  return adminAuthed(req, q) && !asStudentView(req);
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
    kind: patch.kind === 'mentor' || live.kind === 'mentor' ? 'mentor' : 'student'
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
    batchNames: pick('batchNames', {}),
    chats: pick('chats', {}),
    ownerContact: pick('ownerContact', { wa: '', email: '' }),
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

function projectGuest(state) {
  const shell = schoolShell(state);
  const directory = [];
  authorIds(state || {}).forEach((id) => {
    const card = publicCard(id, state || {});
    if (card) directory.push(card);
  });
  shell.directory = directory;
  return shell;
}

function projectStudent(state, studentId) {
  const shell = projectGuest(state);
  const src = state || {};
  shell.directory = shell.directory.filter((card) => card.id !== studentId);
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
    ['status', 'amount', 'source', 'paidAt', 'accessUntil', 'products', 'plan', 'term', 'lynkRef'].forEach((key) => {
      if (base[key] != null) next[key] = base[key];
    });
    if (!locked && privileged) {
      next.status = base.status || 'trial';
      next.products = Array.isArray(base.products) ? base.products : [];
      ['amount', 'source', 'paidAt', 'accessUntil', 'plan', 'term', 'lynkRef'].forEach((key) => {
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
    next.mentorId = prev.mentorId || next.mentorId || base.ownerId || 'u-anton';
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
    next.mentorId = prev.mentorId || next.mentorId || base.ownerId || 'u-anton';
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
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://anton-school');
  const q = queryOf(url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/admin/enter') {
    if (!ADMIN_KEY) {
      json(res, 503, { error: 'unconfigured' });
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

  if (req.method === 'GET' && pathname === '/owners/me') {
    supabaseUser(req).then((user) => {
      if (!user) {
        json(res, 401, { error: 'auth' });
        return;
      }
      const map = readOwners();
      json(res, 200, { slug: map[user.id] || '' });
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
      const rec = persistStrip(takeState(slug), slug);
      const state = (rec && rec.state) || {};
      const cookieId = readStudentCookie(req);
      const known = cookieId && lookupPerson(state, cookieId);
      const visitorHit = findByVisitor(state, body.visitorId);
      const studentId = known ? cookieId : (visitorHit && visitorHit.id);
      if (!studentId) {
        json(res, 200, { role: 'guest' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
        'set-cookie': studentCookie(req, signStudent(studentId))
      });
      res.end(JSON.stringify({ role: 'student', studentId: studentId }));
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'session' });
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/join') {
    readBody(req, 64 * 1024).then((buf) => lock(() => {
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
      let row = findByWa(state, wa);
      let created = false;
      if (!row) {
        created = true;
        row = {
          id: 'stu_' + crypto.randomBytes(9).toString('hex'),
          kind: 'student',
          mentorId: state.ownerId || 'u-anton',
          visitorIds: [],
          tags: []
        };
      } else {
        const live = (state.liveStudents || []).find((s) => s && s.id === row.id);
        row = Object.assign({}, live || {}, row);
      }
      applyJoinProfile(row, body);
      if (!row.mentorId) row.mentorId = state.ownerId || 'u-anton';
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
      lock(async () => {
        const user = await supabaseUser(req);
        const rec = persistStrip(takeState(slug), slug);
        const studentId = readStudentCookie(req);
        const staff = isStaffFor(req, q, slug, user);
        const updatedAt = rec && rec.updatedAt || null;
        const rev = rec && rec.rev || 0;
        const raw = rec && rec.state;
        let state;
        if (staff) state = raw || projectGuest(null);
        else if (studentId && lookupPerson(raw || {}, studentId)) state = projectStudent(raw || {}, studentId);
        else state = projectGuest(raw || {});
        json(res, 200, { rev: rev, updatedAt: updatedAt, state: state });
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
        const studentId = readStudentCookie(req);
        if (!staff && !studentId) {
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
        if (staff) {
          nextState = body && body.state ? body.state : null;
          if (nextState && typeof nextState === 'object') {
            stripDemoPeople(nextState);
            if (slug !== ANTON_SLUG && rec && rec.state) {
              nextState.ownerUserId = rec.state.ownerUserId;
              nextState.ownerId = rec.state.ownerId;
              nextState.schoolSlug = slug;
            }
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
    const rec = readState();
    if (!sameSecret(q.k, inviteOf(rec))) {
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
      const cap = uploadCap(kind);
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
      const key = SLUG + '/' + lecId + '/' + crypto.randomBytes(8).toString('hex');
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
    return;
  }

  if (pathname === '/media/part' && req.method === 'PUT') {
    const rec = readState();
    if (!sameSecret(q.k, inviteOf(rec))) {
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
    return;
  }

  if (pathname === '/media/complete' && req.method === 'POST') {
    const rec = readState();
    if (!sameSecret(q.k, inviteOf(rec))) {
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
        size
      }));
      fs.rmSync(dir, { recursive: true, force: true });
      json(res, 200, { key: meta.key, name: meta.name, mime: meta.type, size });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'complete' });
    });
    return;
  }

  if (pathname === '/media' && req.method === 'DELETE') {
    const rec = readState();
    if (!sameSecret(q.k, inviteOf(rec))) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    readBody(req, 16 * 1024).then((buf) => {
      let body = {};
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) { body = {}; }
      const key = keyOk(body.key) ? body.key : '';
      if (!key) {
        json(res, 400, { error: 'key' });
        return;
      }
      const file = mediaFile(key);
      if (fs.existsSync(file)) fs.unlinkSync(file);
      if (fs.existsSync(metaFile(key))) fs.unlinkSync(metaFile(key));
      json(res, 200, { ok: true });
    }).catch(() => {
      if (!res.headersSent) json(res, 400, { error: 'delete' });
    });
    return;
  }

  if (pathname === '/media/file' && req.method === 'GET') {
    const publicPhoto = profileKeyOk(q.key);
    if (!publicPhoto) {
      const rec = readState();
      if (!sameSecret(q.k, inviteOf(rec))) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
    }
    const key = (publicPhoto || keyOk(q.key)) ? q.key : '';
    if (!key) {
      json(res, 400, { error: 'key' });
      return;
    }
    const file = mediaFile(key);
    if (!fs.existsSync(file)) {
      json(res, 404, { error: 'missing' });
      return;
    }
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile(key), 'utf8')); } catch (err) { meta = {}; }
    const size = fs.statSync(file).size;
    const range = parseRange(req.headers.range, size);
    const mime = meta.type || 'video/mp4';
    const headers = {
      'content-type': mime,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'x-robots-tag': 'noindex'
    };
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
    readBody(req, MAX_EVENT_BYTES).then((buf) => lock(() => {
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
    })).catch((err) => {
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

  if (pathname === '/webhooks/lynk' && req.method === 'POST') {
    if (!LYNK_KEY) {
      json(res, 503, { error: 'unconfigured' });
      return;
    }
    readBody(req, 256 * 1024).then((buf) => lock(() => {
      let body;
      try { body = JSON.parse(buf.toString('utf8') || '{}'); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const event = String(dig(body, [['event'], ['type']]) || '');
      if (event && event !== 'payment.received') {
        json(res, 200, { ok: true, ignored: event });
        return;
      }
      const refId = String(dig(body, [['refId'], ['data', 'refId'], ['ref_id'], ['data', 'ref_id']]) || '');
      const messageId = String(dig(body, [['message_id'], ['data', 'message_id'], ['messageId'], ['data', 'messageId']]) || '');
      const amountRaw = dig(body, [['grandTotal'], ['data', 'grandTotal'], ['amount'], ['data', 'amount']]);
      const amount = amountString(amountRaw);
      const got = String(req.headers['x-lynk-signature'] || '');
      if (!refId || !messageId || !amount || !sigEqual(got, lynkSignature(amount, refId, messageId))) {
        json(res, 401, { error: 'signature' });
        return;
      }
      if (seenLynkRef(refId)) {
        json(res, 200, { ok: true, duplicate: true });
        return;
      }
      const phone = String(dig(body, [
        ['customer', 'phone'], ['data', 'customer', 'phone'],
        ['customer', 'mobile'], ['data', 'customer', 'mobile'],
        ['customer', 'whatsapp'], ['data', 'customer', 'whatsapp'],
        ['phone'], ['data', 'phone']
      ]) || '');
      const name = String(dig(body, [['customer', 'name'], ['data', 'customer', 'name'], ['name']]) || '');
      const titles = itemTitles(body);
      const rec = persistStrip(takeState());
      const state = rec && rec.state;
      const catalog = lynkCatalog(state);
      const matchedProducts = catalog.filter((row) => titles.some((title) => normTitle(title) === normTitle(row.title)));
      const base = {
        at: new Date().toISOString(),
        refId,
        messageId,
        amount,
        phone,
        name: name.slice(0, 120),
        titles: titles.slice(0, 8)
      };
      if (!state || matchedProducts.length !== 1) {
        rememberUnmatched(Object.assign({ reason: !state ? 'no_state' : (matchedProducts.length ? 'ambiguous_title' : 'not_mentoring') }, base));
        json(res, 200, { ok: true, matched: false });
        return;
      }
      const product = matchedProducts[0];
      const hits = peopleInState(state).filter((person) => phonesMatch(person.wa, phone));
      if (hits.length !== 1) {
        rememberUnmatched(Object.assign({ reason: hits.length ? 'ambiguous_phone' : 'no_phone', term: product.term }, base));
        json(res, 200, { ok: true, matched: false });
        return;
      }
      grantLynk(state, hits[0], product, amount, refId);
      writeUnmatched(readUnmatched().filter((item) => item.refId !== refId));
      const stored = {
        key: rec.key || DEFAULT_INVITE,
        rev: (Number(rec.rev) || 0) + 1,
        updatedAt: new Date().toISOString(),
        state
      };
      writeState(stored);
      recordLynkPayment({
        refId,
        at: base.at,
        personId: hits[0].id,
        term: product.term,
        amount,
        matched: true
      });
      json(res, 200, { ok: true, matched: true, rev: stored.rev });
    })).catch((err) => {
      if (!res.headersSent) json(res, err.status || 500, { error: 'lynk' });
    });
    return;
  }

  // Fonnte and Mayar are not wired on this host. Answer so older pages do not poll 404s.
  if (pathname === '/wa/status' || pathname === '/wa/inbox' || pathname === '/wa/thread' || pathname === '/wa/send') {
    json(res, 200, { ok: true, live: false, deviceReady: false, configured: false, threads: [], messages: [] });
    return;
  }
  if (pathname === '/pay/status' || pathname === '/pay/invoice' || pathname === '/pay/webhook') {
    json(res, 200, { configured: false, mode: 'unset', error: 'not_configured' });
    return;
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write('anton-school listening ' + PORT + '\n');
});
