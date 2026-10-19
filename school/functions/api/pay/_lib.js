/* Mayar invoice + shared school state. Key stays in Pages secrets, never in the browser. */

const DEFAULT_SLUG = 'obrolan.marketing';
const DEFAULT_INVITE = 'ANTON-SEP26';
const MAX_BYTES = 5 * 1024 * 1024;

export function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex'
    }
  });
}

export function corsOptions(allow) {
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store', allow: allow || 'GET, POST, OPTIONS' }
  });
}

export function urlOf(request) {
  try { return new URL(request.url); } catch (err) { return new URL('https://invalid.local/'); }
}

export function inviteOf(request) {
  const url = urlOf(request);
  const q = url.searchParams.get('k') || url.searchParams.get('invite') || '';
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  return q || bearer;
}

export function slugOf(request, body) {
  const url = urlOf(request);
  const raw = (body && (body.slug || body.school)) || url.searchParams.get('slug') || DEFAULT_SLUG;
  return String(raw || DEFAULT_SLUG).trim().toLowerCase() || DEFAULT_SLUG;
}

export function mentorAllowed(env, request) {
  const k = inviteOf(request);
  if (!k) return false;
  if (env.SCHOOL_KEY && k === env.SCHOOL_KEY) return true;
  const invite = env.SCHOOL_INVITE || DEFAULT_INVITE;
  return k === invite;
}

export function mayarBase(env) {
  const b = String((env && env.MAYAR_API_BASE) || '').trim().replace(/\/$/, '');
  if (b) return b;
  return 'https://api.mayar.io/hl/v2';
}

export function mayarMode(env) {
  if (!env || !env.MAYAR_API_KEY) return 'unset';
  const base = mayarBase(env);
  if (base.indexOf('api.mayar.io') >= 0) return 'sandbox';
  if (base.indexOf('api.mayar.id') >= 0) return 'live';
  return 'custom';
}

export function webhookUrl(request) {
  const url = urlOf(request);
  const secret = '';
  return url.origin + '/api/pay/webhook' + (secret ? ('?secret=' + encodeURIComponent(secret)) : '');
}

export function publicWebhookUrl(request, env) {
  const url = urlOf(request);
  const secret = env && env.MAYAR_WEBHOOK_SECRET ? String(env.MAYAR_WEBHOOK_SECRET) : '';
  const q = secret ? ('?secret=' + encodeURIComponent(secret)) : '';
  return url.origin + '/api/pay/webhook' + q;
}

export async function readBody(request) {
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (err) { return {}; }
}

function stateKey(slug) { return 'school:' + String(slug || '').trim().toLowerCase(); }
function invoiceKey(id) { return 'pay:invoice:' + String(id || ''); }
function recentKey(slug) { return 'pay:recent:' + String(slug || '').trim().toLowerCase(); }
function grantsKey(slug) { return 'pay:grants:' + String(slug || '').trim().toLowerCase(); }
function metaKey(slug) { return 'pay:meta:' + String(slug || '').trim().toLowerCase(); }

export async function kvGet(env, key) {
  if (!env || !env.STATE) return null;
  return env.STATE.get(key, { type: 'json' });
}

export async function kvPut(env, key, value) {
  if (!env || !env.STATE) return;
  await env.STATE.put(key, JSON.stringify(value));
}

export async function loadStateRec(env, slug) {
  return kvGet(env, stateKey(slug));
}

export async function saveStateRec(env, slug, rec) {
  const text = JSON.stringify(rec);
  if (text.length > MAX_BYTES) throw new Error('too_large');
  await kvPut(env, stateKey(slug), rec);
}

export async function loadGrants(env, slug) {
  const g = await kvGet(env, grantsKey(slug));
  return (g && typeof g === 'object') ? g : {};
}

export async function saveGrants(env, slug, grants) {
  await kvPut(env, grantsKey(slug), grants || {});
}

export async function loadMeta(env, slug) {
  const m = await kvGet(env, metaKey(slug));
  return (m && typeof m === 'object') ? m : {};
}

export async function saveMeta(env, slug, meta) {
  await kvPut(env, metaKey(slug), meta || {});
}

export async function rememberInvoice(env, row) {
  if (!row) return;
  const ids = [row.transactionId, row.invoiceId].filter(Boolean);
  for (let i = 0; i < ids.length; i += 1) {
    await kvPut(env, invoiceKey(ids[i]), row);
  }
  const slug = row.slug || DEFAULT_SLUG;
  const recent = (await kvGet(env, recentKey(slug))) || [];
  const list = Array.isArray(recent) ? recent : [];
  list.unshift(row);
  await kvPut(env, recentKey(slug), list.slice(0, 80));
}

export async function findInvoice(env, slug, hints) {
  const h = hints || {};
  const tryIds = [h.transactionId, h.invoiceId, h.id].filter(Boolean);
  for (let i = 0; i < tryIds.length; i += 1) {
    const row = await kvGet(env, invoiceKey(tryIds[i]));
    if (row && row.personId) return row;
  }
  const recent = (await kvGet(env, recentKey(slug || h.slug || DEFAULT_SLUG))) || [];
  if (!Array.isArray(recent)) return null;
  if (h.personId) {
    const byPerson = recent.find((r) => r.personId === h.personId && !r.granted);
    if (byPerson) return byPerson;
  }
  const email = String(h.email || '').trim().toLowerCase();
  const amount = Number(h.amount) || 0;
  if (email) {
    const pending = recent.filter((r) =>
      !r.test && !r.granted && String(r.email || '').toLowerCase() === email
    );
    if (amount) {
      const hit = pending.find((r) => Number(r.amount) === amount);
      if (hit) return hit;
    }
    if (pending.length === 1) return pending[0];
  }
  return null;
}

const TERM_MONTHS = { month: 1, autopay: 1, quarter: 3, half: 6, year: 12 };

/** Overlay a confirmed Mayar payment onto the shared school blob. Idempotent. */
export function applyPaidGrant(state, grant) {
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

export async function overlayGrants(env, slug, state) {
  if (!state) return state;
  const grants = await loadGrants(env, slug);
  Object.keys(grants).forEach((id) => {
    applyPaidGrant(state, grants[id]);
  });
  return state;
}

export function eventName(body) {
  if (!body || typeof body !== 'object') return '';
  const raw = body.event || body.eventName || body.type || body['event.received'] || '';
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return raw.name || raw.received || raw.type || '';
  return '';
}

export function webhookAllowed(env, request, body) {
  const url = urlOf(request);
  const fromBody = body && typeof body === 'object' ? (body.secret || '') : '';
  const secret = url.searchParams.get('secret') ||
    request.headers.get('x-webhook-secret') ||
    fromBody ||
    '';
  const expect = env && env.MAYAR_WEBHOOK_SECRET ? String(env.MAYAR_WEBHOOK_SECRET) : '';
  if (!expect) return true;
  return secret === expect;
}

export async function createMayarInvoice(env, input) {
  const key = env && env.MAYAR_API_KEY;
  if (!key) {
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
  const base = mayarBase(env);
  let res = await postInvoice(base, key, payload);
  if (!res.ok && payload.paymentMethod && res.status === 400) {
    delete payload.paymentMethod;
    res = await postInvoice(base, key, payload);
  }
  const data = res.data || {};
  if (!res.ok) {
    const err = new Error((data && (data.messages || data.message)) || ('mayar_' + res.status));
    err.code = 'mayar';
    err.status = res.status;
    err.body = data;
    throw err;
  }
  const row = (data && data.data) || {};
  return {
    id: row.id || '',
    transactionId: row.transactionId || row.id || '',
    link: row.link || '',
    expiredAt: row.expiredAt || null,
    amount: amount
  };
}

async function postInvoice(base, key, payload) {
  const res = await fetch(base + '/invoices/create', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + key,
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  let data = {};
  try { data = await res.json(); } catch (err) { data = {}; }
  return { ok: res.ok, status: res.status, data: data };
}
