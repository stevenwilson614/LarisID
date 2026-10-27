/**
 * Mayar + WhatsApp routes for Contabo anton-school.
 * Pathnames are without /api prefix (Caddy strips /api).
 */
import crypto from 'node:crypto';

const DEFAULT_SLUG = 'obrolan.marketing';
const DEFAULT_INVITE = 'ANTON-SEP26';
const TERM_MONTHS = { month: 1, autopay: 1, quarter: 3, half: 6, year: 12 };

function envOf(processEnv) {
  return {
    MAYAR_API_KEY: processEnv.MAYAR_API_KEY || '',
    MAYAR_API_BASE: processEnv.MAYAR_API_BASE || 'https://api.mayar.io/hl/v2',
    MAYAR_WEBHOOK_SECRET: processEnv.MAYAR_WEBHOOK_SECRET || '',
    MAYAR_VA_METHOD: processEnv.MAYAR_VA_METHOD || '',
    FONNTE_API_TOKEN: processEnv.FONNTE_API_TOKEN || '',
    FONNTE_DEVICE_READY: processEnv.FONNTE_DEVICE_READY || 'false',
    WA_WEBHOOK_SECRET: processEnv.WA_WEBHOOK_SECRET || '',
    SCHOOL_INVITE: processEnv.ANTON_INVITE || processEnv.SCHOOL_INVITE || DEFAULT_INVITE,
    SCHOOL_KEY: processEnv.SCHOOL_KEY || processEnv.ANTON_ADMIN_KEY || ''
  };
}

function inviteFrom(url, req) {
  const q = url.searchParams.get('k') || url.searchParams.get('invite') || '';
  const auth = String((req.headers && req.headers.authorization) || '');
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return q || bearer;
}

function mentorAllowed(env, url, req) {
  const k = inviteFrom(url, req);
  if (!k) return false;
  if (env.SCHOOL_KEY && k === env.SCHOOL_KEY) return true;
  return k === env.SCHOOL_INVITE;
}

function slugOf(url, body) {
  const raw = (body && (body.slug || body.school)) || url.searchParams.get('slug') || DEFAULT_SLUG;
  return String(raw || DEFAULT_SLUG).trim().toLowerCase() || DEFAULT_SLUG;
}

function mayarMode(env) {
  if (!env.MAYAR_API_KEY) return 'unset';
  const base = String(env.MAYAR_API_BASE || '');
  if (base.indexOf('api.mayar.io') >= 0) return 'sandbox';
  if (base.indexOf('api.mayar.id') >= 0) return 'live';
  return 'custom';
}

function newId(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function normalizePhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  if (d.indexOf('8') === 0 && d.length >= 9) d = '62' + d;
  if (d.indexOf('620') === 0) d = '62' + d.slice(3);
  return d;
}

function stateKey(slug) { return 'school:' + slug; }
function invoiceKey(id) { return 'pay:invoice:' + id; }
function recentKey(slug) { return 'pay:recent:' + slug; }
function grantsKey(slug) { return 'pay:grants:' + slug; }
function metaKey(slug) { return 'pay:meta:' + slug; }
function waIndexKey(slug) { return 'wa:' + slug + ':index'; }
function waMsgsKey(slug, phone) { return 'wa:' + slug + ':msgs:' + phone; }

function applyPaidGrant(state, grant) {
  if (!state || !grant || !grant.personId || grant.test) return state;
  const id = grant.personId;
  const tx = grant.transactionId || grant.invoiceId || '';
  state.billing = state.billing || {};
  const prev = state.billing[id] || {};
  if (prev.status === 'lunas' && prev.mayarTx && tx && prev.mayarTx === tx) return state;
  const months = TERM_MONTHS[grant.term] || 1;
  const start = new Date(grant.paidAt || Date.now());
  const until = new Date(start.getTime());
  until.setMonth(until.getMonth() + months);
  const next = Object.assign({}, prev, {
    status: 'lunas',
    plan: 'mentoring',
    products: Array.isArray(prev.products) ? prev.products : [],
    term: grant.term || 'month',
    source: 'mayar',
    amount: Number(grant.amount) || Number(prev.amount) || 0,
    paidAt: start.toISOString(),
    accessUntil: until.toISOString(),
    note: 'Mayar · ' + (grant.term || 'month'),
    mayarTx: tx,
    mayarLink: grant.link || prev.mayarLink || ''
  });
  delete next.pendingTerm;
  delete next.pendingAmount;
  delete next.pendingAt;
  delete next.offerExpiresAt;
  state.billing[id] = next;
  state.crm = state.crm || {};
  const crm = Object.assign({ stage: 'wa_baru' }, state.crm[id] || {});
  if (crm.stage !== 'mentee' && crm.stage !== 'mentor') crm.stage = 'mentee';
  state.crm[id] = crm;
  state.timeline = state.timeline || {};
  const line = 'Bayar Mayar · ' + (tx || id);
  const feed = Array.isArray(state.timeline[id]) ? state.timeline[id] : [];
  if (!feed.some((n) => n && n.body && String(n.body).indexOf(tx || 'mayar-paid') >= 0 && n.kind === 'pay')) {
    feed.unshift({ at: start.toISOString(), kind: 'pay', body: line });
  }
  state.timeline[id] = feed;
  state.enrollments = state.enrollments || {};
  const raw = state.enrollments[id] || [];
  const list = raw.map((x) => (typeof x === 'string' ? { planId: x } : x));
  if (!list.some((x) => x && x.planId === 'onboarding')) {
    list.push({ planId: 'onboarding', at: start.toISOString() });
  }
  state.enrollments[id] = list;
  if (Array.isArray(state.tasks)) {
    state.tasks.forEach((t) => {
      if (!t || t.done || t.personId !== id) return;
      if (/cek transfer|menunggu mayar/i.test(t.title || '')) t.done = true;
    });
  }
  return state;
}

function overlayGrants(store, slug, state) {
  if (!state) return state;
  const grants = store.get(grantsKey(slug)) || {};
  Object.keys(grants).forEach((id) => applyPaidGrant(state, grants[id]));
  return state;
}

function loadSchoolState(store, slug, readLegacyState) {
  const fromKv = store.get(stateKey(slug));
  if (fromKv && fromKv.state) return fromKv;
  if (typeof readLegacyState === 'function') {
    const legacy = readLegacyState();
    if (legacy && legacy.state) return legacy;
  }
  return null;
}

function saveSchoolState(store, slug, rec, writeLegacyState) {
  store.put(stateKey(slug), rec);
  if (typeof writeLegacyState === 'function') writeLegacyState(rec);
}

async function createMayarInvoice(env, input) {
  if (!env.MAYAR_API_KEY) {
    const err = new Error('not_configured');
    err.code = 'not_configured';
    throw err;
  }
  const amount = Math.max(1000, Math.round(Number(input.amount) || 0));
  const payload = {
    name: String(input.name || 'Siswa').slice(0, 80),
    email: String(input.email || '').trim(),
    mobile: String(input.mobile || '').replace(/\D/g, ''),
    description: String(input.description || 'MasterMind with Anton GC').slice(0, 180),
    expiredAt: input.expiredAt || new Date(Date.now() + 24 * 3600000).toISOString(),
    items: [{
      quantity: 1,
      rate: amount,
      description: String(input.item || input.description || 'Mentoring').slice(0, 120)
    }],
    extraData: {
      personId: String(input.personId || ''),
      term: String(input.term || 'month'),
      slug: String(input.slug || DEFAULT_SLUG),
      amount: String(amount),
      test: input.test ? '1' : '0'
    }
  };
  if (input.paymentMethod) payload.paymentMethod = String(input.paymentMethod);
  const base = String(env.MAYAR_API_BASE || '').replace(/\/$/, '');
  async function post(body) {
    const res = await fetch(base + '/invoices/create', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + env.MAYAR_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    let data = {};
    try { data = await res.json(); } catch (err) { data = {}; }
    return { ok: res.ok, status: res.status, data };
  }
  let res = await post(payload);
  if (!res.ok && payload.paymentMethod && res.status === 400) {
    delete payload.paymentMethod;
    res = await post(payload);
  }
  const data = res.data || {};
  if (!res.ok) {
    const err = new Error((data && (data.messages || data.message)) || ('mayar_' + res.status));
    err.code = 'mayar';
    err.status = res.status;
    throw err;
  }
  const row = (data && data.data) || {};
  return {
    id: row.id || '',
    transactionId: row.transactionId || row.id || '',
    link: row.link || '',
    expiredAt: row.expiredAt || null,
    amount
  };
}

function rememberInvoice(store, row) {
  [row.transactionId, row.invoiceId].filter(Boolean).forEach((id) => store.put(invoiceKey(id), row));
  const list = store.get(recentKey(row.slug || DEFAULT_SLUG)) || [];
  const arr = Array.isArray(list) ? list : [];
  arr.unshift(row);
  store.put(recentKey(row.slug || DEFAULT_SLUG), arr.slice(0, 80));
}

function findInvoice(store, slug, hints) {
  const h = hints || {};
  for (const id of [h.transactionId, h.invoiceId, h.id].filter(Boolean)) {
    const row = store.get(invoiceKey(id));
    if (row && row.personId) return row;
  }
  const recent = store.get(recentKey(slug || h.slug || DEFAULT_SLUG)) || [];
  if (!Array.isArray(recent)) return null;
  if (h.personId) {
    const byPerson = recent.find((r) => r.personId === h.personId && !r.granted);
    if (byPerson) return byPerson;
  }
  const email = String(h.email || '').trim().toLowerCase();
  const amount = Number(h.amount) || 0;
  if (email) {
    const pending = recent.filter((r) => !r.test && !r.granted && String(r.email || '').toLowerCase() === email);
    if (amount) {
      const hit = pending.find((r) => Number(r.amount) === amount);
      if (hit) return hit;
    }
    if (pending.length === 1) return pending[0];
  }
  return null;
}

function loadWaIndex(store, slug) {
  const rec = store.get(waIndexKey(slug));
  if (rec && rec.byPhone) return rec;
  return { byPhone: {} };
}

function upsertWaThread(store, slug, phone, personId) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const index = loadWaIndex(store, slug);
  const now = new Date().toISOString();
  let rec = index.byPhone[p];
  if (rec) {
    rec.personId = personId || rec.personId || null;
    rec.updatedAt = now;
  } else {
    rec = { id: newId('th'), personId: personId || null, phone: p, updatedAt: now, unread: 0 };
    index.byPhone[p] = rec;
  }
  store.put(waIndexKey(slug), index);
  return rec;
}

function findWaThread(store, slug, opts) {
  const index = loadWaIndex(store, slug);
  const phone = normalizePhone(opts && opts.phone);
  if (phone && index.byPhone[phone]) return index.byPhone[phone];
  if (opts && opts.personId) {
    return Object.keys(index.byPhone).map((k) => index.byPhone[k])
      .find((t) => t.personId === opts.personId) || null;
  }
  return null;
}

function listWaThreads(store, slug) {
  const index = loadWaIndex(store, slug);
  return Object.keys(index.byPhone).map((k) => index.byPhone[k])
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function listWaMessages(store, slug, thread) {
  if (!thread) return [];
  const list = store.get(waMsgsKey(slug, thread.phone)) || [];
  return (Array.isArray(list) ? list : []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function insertWaMessage(store, slug, thread, msg) {
  const row = {
    id: msg.id || newId('wm'),
    threadId: thread.id,
    direction: msg.direction,
    body: String(msg.body || ''),
    at: msg.at || new Date().toISOString(),
    status: msg.status || 'sent',
    providerId: msg.providerId || null
  };
  const list = store.get(waMsgsKey(slug, thread.phone)) || [];
  const arr = Array.isArray(list) ? list : [];
  if (row.providerId && arr.some((m) => m.providerId === row.providerId)) {
    return arr.find((m) => m.providerId === row.providerId);
  }
  arr.push(row);
  store.put(waMsgsKey(slug, thread.phone), arr);
  const index = loadWaIndex(store, slug);
  const rec = index.byPhone[thread.phone] || thread;
  rec.updatedAt = row.at;
  rec.unread = (Number(rec.unread) || 0) + (row.direction === 'in' ? 1 : 0);
  rec.personId = rec.personId || thread.personId || null;
  index.byPhone[thread.phone] = rec;
  store.put(waIndexKey(slug), index);
  return row;
}

async function sendFonnte(env, phone, body) {
  if (!env.FONNTE_API_TOKEN) return { ok: false, error: 'missing_token' };
  if (String(env.FONNTE_DEVICE_READY || '').toLowerCase() !== 'true') {
    return { ok: false, error: 'device_not_ready' };
  }
  const target = normalizePhone(phone);
  if (!target) return { ok: false, error: 'bad_phone' };
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: { Authorization: env.FONNTE_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, message: String(body || '') })
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch (err) { parsed = { raw: text }; }
  const status = parsed.status ?? parsed.Status;
  if (!res.ok || status !== true) {
    return { ok: false, error: 'fonnte_failed', detail: parsed.reason || text.slice(0, 240) };
  }
  const idList = parsed.id;
  const providerId = Array.isArray(idList) ? String(idList[0] || '') : String(idList || parsed.process || '');
  return { ok: true, providerId: providerId || null };
}

function extractInbound(url, body) {
  const src = Object.assign({}, body || {});
  url.searchParams.forEach((v, k) => { if (src[k] == null) src[k] = v; });
  const phone = normalizePhone(src.sender || src.from || src.nomor || src.phone || src.number || src.wa || src.msisdn);
  let text = src.message || src.pesan || src.body || src.text || src.caption || '';
  if (text && typeof text === 'object') text = text.body || text.text || text.caption || '';
  text = String(text || '').trim();
  if (!text && (src.url || src.file || src.filename)) text = '[media]';
  const providerId = String(src.id || src.message_id || src.msgid || src.msgId || '').trim() || null;
  return { phone, body: text, providerId };
}

function readJsonBody(buf) {
  if (!buf || !buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (err) { return {}; }
}

/**
 * @returns {boolean} true if handled
 */
export function handlePayWa(ctx) {
  const {
    req, res, url, pathname, method, json, readBody, store,
    readLegacyState, writeLegacyState
  } = ctx;
  const env = envOf(process.env);

  // GET /pay/status
  if (pathname === '/pay/status' && method === 'GET') {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    const slug = slugOf(url, null);
    const meta = store.get(metaKey(slug)) || {};
    const secret = env.MAYAR_WEBHOOK_SECRET ? ('?secret=' + encodeURIComponent(env.MAYAR_WEBHOOK_SECRET)) : '';
    json(res, 200, {
      configured: !!env.MAYAR_API_KEY,
      mode: mayarMode(env),
      webhookUrl: 'https://larisid.com/api/pay/webhook' + secret,
      lastWebhookAt: meta.lastWebhookAt || null,
      lastEvent: meta.lastEvent || '',
      lastTestAt: meta.lastTestAt || null
    });
    return true;
  }

  // POST /pay/invoice
  if (pathname === '/pay/invoice' && method === 'POST') {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    readBody(req, 256 * 1024).then(async (buf) => {
      const body = readJsonBody(buf);
      const slug = slugOf(url, body);
      const test = body.test === true || body.test === '1' || body.test === 1;
      const personId = String(body.personId || (test ? 'mayar-test' : '')).trim();
      if (!personId) return json(res, 400, { error: 'person' });
      const term = String(body.term || 'month');
      const amount = test ? 10000 : Math.max(1000, Math.round(Number(body.amount) || 0));
      if (!amount) return json(res, 400, { error: 'amount' });
      const termLabel = { month: '1 bulan', quarter: '3 bulan', half: '6 bulan', autopay: 'autopay' }[term] || term;
      let email = String(body.email || '').trim();
      if (!email || email.indexOf('@') < 1) {
        email = (personId.replace(/[^a-z0-9._-]/gi, '') || 'siswa') + '@students.obrolan.marketing';
      }
      let mobile = String(body.mobile || body.wa || '').replace(/\D/g, '');
      if (mobile.indexOf('62') === 0) mobile = '0' + mobile.slice(2);
      if (mobile && mobile.indexOf('0') !== 0) mobile = '0' + mobile;
      mobile = mobile || '080000000000';
      try {
        const inv = await createMayarInvoice(env, {
          name: body.name || (test ? 'Tes Mayar' : 'Siswa'),
          email, mobile, amount, personId, term, slug, test,
          description: test ? 'Tes invoice MasterMind (bukan akses kelas)' : ('Mentoring MasterMind · ' + termLabel),
          item: test ? 'Tes Mayar Rp10.000' : ('Mentoring · ' + termLabel),
          paymentMethod: body.paymentMethod || env.MAYAR_VA_METHOD || ''
        });
        const row = {
          slug, personId, term, amount, email,
          transactionId: inv.transactionId, invoiceId: inv.id, link: inv.link,
          test, granted: false, createdAt: new Date().toISOString()
        };
        rememberInvoice(store, row);
        if (!test) {
          const rec = loadSchoolState(store, slug, readLegacyState) || { key: '', rev: 0, state: {} };
          rec.state = rec.state || {};
          rec.state.billing = rec.state.billing || {};
          const prev = rec.state.billing[personId] || {};
          if (prev.status !== 'lunas') {
            rec.state.billing[personId] = Object.assign({}, prev, {
              status: 'pending', source: 'mayar', plan: prev.plan || 'preview',
              amount, term, pendingTerm: term, pendingAmount: amount, pendingAt: row.createdAt,
              mayarLink: inv.link, mayarTx: inv.transactionId,
              note: 'Menunggu pembayaran Mayar · ' + termLabel
            });
            overlayGrants(store, slug, rec.state);
            rec.rev = (Number(rec.rev) || 0) + 1;
            rec.updatedAt = new Date().toISOString();
            saveSchoolState(store, slug, rec, writeLegacyState);
          }
        }
        json(res, 200, {
          ok: true, mode: mayarMode(env), link: inv.link,
          transactionId: inv.transactionId, invoiceId: inv.id,
          expiredAt: inv.expiredAt, amount, test
        });
      } catch (err) {
        if (err && err.code === 'not_configured') return json(res, 503, { error: 'not_configured', configured: false });
        json(res, 502, { error: 'mayar', message: (err && err.message) || 'mayar', status: err && err.status });
      }
    }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'read' }); });
    return true;
  }

  // POST /pay/webhook
  if (pathname === '/pay/webhook' && method === 'POST') {
    readBody(req, 512 * 1024).then((buf) => {
      const body = readJsonBody(buf);
      const secret = url.searchParams.get('secret') ||
        String((req.headers && req.headers['x-webhook-secret']) || '') ||
        (body && body.secret) || '';
      if (env.MAYAR_WEBHOOK_SECRET && secret !== env.MAYAR_WEBHOOK_SECRET) {
        return json(res, 403, { error: 'forbidden' });
      }
      const event = String(body.event || body.eventName || body.type || '').toLowerCase();
      const data = (body.data && typeof body.data === 'object') ? body.data : body;
      const extra = data.extraData || body.extraData || {};
      const slugGuess = extra.slug || slugOf(url, body);
      const meta = store.get(metaKey(slugGuess)) || {};
      meta.lastWebhookAt = new Date().toISOString();
      meta.lastEvent = event || 'unknown';
      store.put(metaKey(slugGuess), meta);
      const paidEvent = event.indexOf('payment.received') >= 0 || event.indexOf('payment_received') >= 0;
      const statusPaid = data.status === true || data.status === 'true' ||
        String(data.status || '').toLowerCase() === 'paid' || String(data.status || '').toLowerCase() === 'success';
      if (!paidEvent && !(statusPaid && !event)) {
        return json(res, 200, { ok: true, ignored: event || 'not_paid' });
      }
      const hints = {
        transactionId: data.transactionId || data.trxId || extra.transactionId || '',
        invoiceId: data.invoiceId || data.id || '',
        id: data.id || '',
        personId: extra.personId || data.personId || '',
        email: data.customerEmail || data.email || '',
        amount: Number(data.amount || data.paidAmount || 0),
        slug: extra.slug || slugGuess
      };
      const row = findInvoice(store, hints.slug, hints);
      if (!row) return json(res, 200, { ok: true, ignored: 'unknown_invoice' });
      if (row.test || extra.test === '1' || extra.test === 1) {
        meta.lastTestAt = meta.lastWebhookAt;
        store.put(metaKey(row.slug || slugGuess), meta);
        return json(res, 200, { ok: true, test: true });
      }
      if (row.granted) return json(res, 200, { ok: true, duplicate: true });
      const grant = {
        personId: row.personId,
        transactionId: row.transactionId || hints.transactionId,
        invoiceId: row.invoiceId || hints.invoiceId,
        term: row.term || 'month',
        amount: Number(row.amount) || hints.amount || 0,
        paidAt: new Date().toISOString(),
        link: row.link || '',
        slug: row.slug
      };
      const grants = store.get(grantsKey(row.slug)) || {};
      grants[row.personId] = grant;
      store.put(grantsKey(row.slug), grants);
      row.granted = true;
      row.grantedAt = grant.paidAt;
      if (row.transactionId) store.put(invoiceKey(row.transactionId), row);
      if (row.invoiceId && row.invoiceId !== row.transactionId) store.put(invoiceKey(row.invoiceId), row);
      const rec = loadSchoolState(store, row.slug, readLegacyState) || { key: '', rev: 0, state: {} };
      const state = rec.state || {};
      applyPaidGrant(state, grant);
      overlayGrants(store, row.slug, state);
      const stored = {
        key: rec.key || '',
        rev: (Number(rec.rev) || 0) + 1,
        updatedAt: grant.paidAt,
        state
      };
      saveSchoolState(store, row.slug, stored, writeLegacyState);
      json(res, 200, { ok: true, personId: row.personId, rev: stored.rev });
    }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'read' }); });
    return true;
  }

  // WA status
  if (pathname === '/wa/status' && method === 'GET') {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    json(res, 200, {
      ok: true, live: true,
      deviceReady: String(env.FONNTE_DEVICE_READY || '').toLowerCase() === 'true',
      hasToken: !!env.FONNTE_API_TOKEN,
      store: 'disk'
    });
    return true;
  }

  // WA inbox
  if (pathname === '/wa/inbox' && method === 'GET') {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    const slug = slugOf(url, null);
    json(res, 200, { ok: true, store: 'disk', threads: listWaThreads(store, slug) });
    return true;
  }

  // WA thread
  if (pathname === '/wa/thread' && (method === 'GET' || method === 'POST')) {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    if (method === 'GET') {
      const slug = slugOf(url, null);
      const personId = url.searchParams.get('personId') || '';
      const phone = url.searchParams.get('phone') || '';
      if (!personId && !phone) return json(res, 400, { error: 'need_person_or_phone' }), true;
      let thread = findWaThread(store, slug, { personId, phone });
      if (thread && personId && !thread.personId && phone) {
        thread = upsertWaThread(store, slug, phone, personId);
      }
      json(res, 200, {
        ok: true, store: 'disk', thread,
        messages: thread ? listWaMessages(store, slug, thread) : []
      });
      return true;
    }
    readBody(req, 256 * 1024).then((buf) => {
      const body = readJsonBody(buf);
      const slug = slugOf(url, body);
      const action = String(body.action || '').toLowerCase();
      const personId = body.personId ? String(body.personId) : '';
      const phone = body.phone || '';
      let thread = findWaThread(store, slug, { personId, phone });
      if (action === 'attach') {
        if (!phone || !personId) return json(res, 400, { error: 'need_person_and_phone' });
        thread = upsertWaThread(store, slug, phone, personId);
        return json(res, 200, { ok: true, thread });
      }
      if (action === 'read') {
        if (!thread) return json(res, 200, { ok: true, thread: null });
        const index = loadWaIndex(store, slug);
        const rec = index.byPhone[thread.phone];
        if (rec) {
          rec.unread = 0;
          index.byPhone[thread.phone] = rec;
          store.put(waIndexKey(slug), index);
          thread = rec;
        }
        return json(res, 200, { ok: true, thread });
      }
      json(res, 400, { error: 'bad_action' });
    }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'read' }); });
    return true;
  }

  // WA send
  if (pathname === '/wa/send' && method === 'POST') {
    if (!mentorAllowed(env, url, req)) return json(res, 403, { error: 'forbidden' }), true;
    readBody(req, 256 * 1024).then(async (buf) => {
      const body = readJsonBody(buf);
      const slug = slugOf(url, body);
      const phone = normalizePhone(body.phone || body.wa || body.target);
      const text = String(body.body || body.message || '').trim();
      const personId = body.personId ? String(body.personId) : null;
      if (!phone) return json(res, 400, { error: 'bad_phone' });
      if (!text) return json(res, 400, { error: 'empty' });
      const thread = upsertWaThread(store, slug, phone, personId);
      if (!thread) return json(res, 503, { error: 'no_store' });
      const sent = await sendFonnte(env, phone, text);
      if (!sent.ok) return json(res, 502, { error: sent.error, detail: sent.detail || null, thread });
      const msg = insertWaMessage(store, slug, thread, {
        id: newId('wm'), direction: 'out', body: text,
        at: new Date().toISOString(), status: 'sent', providerId: sent.providerId
      });
      json(res, 200, { ok: true, store: 'disk', thread, message: msg });
    }).catch(() => { if (!res.headersSent) json(res, 500, { error: 'read' }); });
    return true;
  }

  // WA webhook
  if (pathname === '/wa/webhook' && (method === 'GET' || method === 'POST')) {
    const secret = url.searchParams.get('secret') ||
      String((req.headers && (req.headers['x-webhook-secret'] || req.headers['x-fonnte-secret'])) || '');
    if (env.WA_WEBHOOK_SECRET && secret !== env.WA_WEBHOOK_SECRET &&
      !(env.SCHOOL_KEY && secret === env.SCHOOL_KEY)) {
      return json(res, 403, { error: 'forbidden' }), true;
    }
    const finish = (body) => {
      const inbound = extractInbound(url, body);
      const slug = slugOf(url, body);
      if (!inbound.phone) return json(res, 400, { error: 'bad_phone' });
      if (!inbound.body) return json(res, 200, { ok: true, ignored: 'empty' });
      const thread = upsertWaThread(store, slug, inbound.phone, null);
      if (!thread) return json(res, 503, { error: 'no_store' });
      const msg = insertWaMessage(store, slug, thread, {
        id: newId('wm'), direction: 'in', body: inbound.body,
        at: new Date().toISOString(), status: 'received', providerId: inbound.providerId
      });
      json(res, 200, { ok: true, store: 'disk', thread, message: msg });
    };
    if (method === 'GET') {
      finish({});
      return true;
    }
    readBody(req, 512 * 1024).then((buf) => finish(readJsonBody(buf)))
      .catch(() => { if (!res.headersSent) json(res, 500, { error: 'read' }); });
    return true;
  }

  return false;
}

export { overlayGrants, loadSchoolState, saveSchoolState, stateKey, envOf };
