/**
 * MasterMind with Anton GC — class state, video files, arrivals, issues.
 * Disk only. Not the LarisID Postgres database.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const PORT = Number(process.env.PORT || 8787);
const ADMIN_KEY = String(process.env.ANTON_ADMIN_KEY || '');
const DEFAULT_INVITE = String(process.env.ANTON_INVITE || 'ANTON-SEP26');
const SLUG = 'obrolan.marketing';
const MAX_STATE = 5 * 1024 * 1024;
const MAX_PART = 8 * 1024 * 1024;
const MAX_VIDEO = 1024 * 1024 * 1024;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_FILE = 20 * 1024 * 1024;
const MAX_EVENT_BYTES = 16 * 1024;

const stateDir = path.join(DATA, 'state');
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

function statePath() {
  return path.join(stateDir, SLUG + '.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (err) {
    return null;
  }
}

function writeState(rec) {
  const file = statePath();
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

function addPeople(map, id, wa, name) {
  if (!id || !wa) return;
  const prev = map.get(id) || { id: String(id), wa: '', name: '' };
  prev.wa = String(wa);
  if (name) prev.name = String(name);
  map.set(id, prev);
}

function peopleInState(state) {
  const map = new Map();
  (state.liveStudents || []).forEach((s) => s && addPeople(map, s.id, s.wa, s.name));
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
    json(res, 200, summary());
    return;
  }

  const stateMatch = pathname.match(/^\/state\/([^/]+)$/);
  if (stateMatch) {
    const slug = decodeURIComponent(stateMatch[1]);
    if (slug !== SLUG) {
      json(res, 404, { error: 'slug' });
      return;
    }
    if (req.method === 'GET') {
      const rec = readState();
      if (!sameSecret(q.k, inviteOf(rec))) {
        json(res, 403, { error: 'forbidden' });
        return;
      }
      if (!rec || !rec.state) {
        json(res, 404, { rev: 0, updatedAt: null, state: null });
        return;
      }
      json(res, 200, { rev: rec.rev || 0, updatedAt: rec.updatedAt || null, state: rec.state });
      return;
    }
    if (req.method === 'PUT') {
      readBody(req, MAX_STATE).then((buf) => lock(() => {
        const rec = readState();
        let body;
        try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
          json(res, 400, { error: 'bad_json' });
          return;
        }
        const incomingInvite = (body && body.state && body.state.inviteCode) || '';
        const allowed = sameSecret(q.k, inviteOf(rec)) || (!rec && sameSecret(q.k, incomingInvite || DEFAULT_INVITE));
        if (!allowed) {
          json(res, 403, { error: 'forbidden' });
          return;
        }
        if (body && body.reset === true && !adminAuthed(req, q)) {
          json(res, 403, { error: 'reset_forbidden' });
          return;
        }
        const incomingRev = Number(body && body.rev) || 0;
        if (rec && incomingRev <= (Number(rec.rev) || 0)) {
          json(res, 409, { error: 'stale', rev: rec.rev });
          return;
        }
        const stored = {
          key: q.k,
          rev: incomingRev || ((rec && rec.rev) || 0) + 1,
          updatedAt: (body && body.updatedAt) || new Date().toISOString(),
          state: body && body.state ? body.state : null
        };
        writeState(stored);
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
    const rec = readState();
    if (!sameSecret(q.k, inviteOf(rec))) {
      json(res, 403, { error: 'forbidden' });
      return;
    }
    const key = keyOk(q.key) ? q.key : '';
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
    readBody(req, MAX_EVENT_BYTES).then((buf) => lock(() => {
      let body;
      try { body = JSON.parse(buf.toString('utf8')); } catch (err) {
        json(res, 400, { error: 'bad_json' });
        return;
      }
      const type = String(body.type || '').slice(0, 40);
      if (!type) {
        json(res, 400, { error: 'type' });
        return;
      }
      const row = {
        id: crypto.randomBytes(8).toString('hex'),
        at: new Date().toISOString(),
        type,
        visitorId: String(body.visitorId || '').slice(0, 80),
        path: String(body.path || '').slice(0, 180),
        referrer: String(body.referrer || '').slice(0, 300),
        name: String(body.name || '').slice(0, 120),
        wa: String(body.wa || '').slice(0, 32),
        email: String(body.email || '').slice(0, 160),
        lessonId: String(body.lessonId || '').slice(0, 64),
        lessonTitle: String(body.lessonTitle || '').slice(0, 180),
        personaId: String(body.personaId || '').slice(0, 64),
        message: String(body.message || '').slice(0, 500),
        progress: body.progress == null || body.progress === '' ? null : Number(body.progress),
        stage: String(body.stage || '').slice(0, 40),
        staff: !!body.staff,
        demo: !!body.demo || String(body.personaId || '').indexOf('s-') === 0
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
      const rec = readState();
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
