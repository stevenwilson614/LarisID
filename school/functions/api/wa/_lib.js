/* Shared WhatsApp store for Anton CRM. D1 when bound, else KV (STATE). */

const DEFAULT_SLUG = 'obrolan.marketing';
const DEFAULT_INVITE = 'ANTON-SEP26';

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
    headers: {
      'cache-control': 'no-store',
      allow: allow || 'GET, POST, OPTIONS'
    }
  });
}

export function urlOf(request) {
  try {
    return new URL(request.url);
  } catch (err) {
    return new URL('https://invalid.local/');
  }
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
  const raw = (body && body.slug) || url.searchParams.get('slug') || DEFAULT_SLUG;
  return String(raw || DEFAULT_SLUG).trim().toLowerCase() || DEFAULT_SLUG;
}

export function mentorAllowed(env, request) {
  const k = inviteOf(request);
  if (!k) return false;
  if (env.SCHOOL_KEY && k === env.SCHOOL_KEY) return true;
  const invite = env.SCHOOL_INVITE || DEFAULT_INVITE;
  return k === invite;
}

export function webhookAllowed(env, request) {
  const url = urlOf(request);
  const secret = url.searchParams.get('secret') ||
    request.headers.get('x-webhook-secret') ||
    request.headers.get('x-fonnte-secret') ||
    '';
  if (env.WA_WEBHOOK_SECRET && secret === env.WA_WEBHOOK_SECRET) return true;
  if (env.SCHOOL_KEY && secret === env.SCHOOL_KEY) return true;
  return false;
}

export function deviceReady(env) {
  return String(env.FONNTE_DEVICE_READY || '').toLowerCase() === 'true';
}

export function normalizePhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('0') === 0) d = '62' + d.slice(1);
  if (d.indexOf('8') === 0 && d.length >= 9) d = '62' + d;
  if (d.indexOf('620') === 0) d = '62' + d.slice(3);
  return d;
}

export function newId(prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function useD1(env) {
  return !!(env && env.WA && typeof env.WA.prepare === 'function');
}

export function useKv(env) {
  return !!(env && env.STATE && typeof env.STATE.get === 'function');
}

export function storeName(env) {
  if (useD1(env)) return 'd1';
  if (useKv(env)) return 'kv';
  return 'none';
}

let schemaReady = false;

export async function ensureSchema(env) {
  if (!useD1(env) || schemaReady) return;
  await env.WA.batch([
    env.WA.prepare(
      'CREATE TABLE IF NOT EXISTS wa_threads (' +
      'id TEXT PRIMARY KEY,' +
      'slug TEXT NOT NULL,' +
      'person_id TEXT,' +
      'phone TEXT NOT NULL,' +
      'updated_at TEXT NOT NULL,' +
      'unread INTEGER NOT NULL DEFAULT 0)'
    ),
    env.WA.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS wa_threads_slug_phone ON wa_threads (slug, phone)'
    ),
    env.WA.prepare(
      'CREATE INDEX IF NOT EXISTS wa_threads_slug_person ON wa_threads (slug, person_id)'
    ),
    env.WA.prepare(
      'CREATE TABLE IF NOT EXISTS wa_messages (' +
      'id TEXT PRIMARY KEY,' +
      'thread_id TEXT NOT NULL,' +
      'slug TEXT NOT NULL,' +
      'direction TEXT NOT NULL,' +
      'body TEXT NOT NULL,' +
      'at TEXT NOT NULL,' +
      'status TEXT NOT NULL DEFAULT \'sent\',' +
      'provider_id TEXT)'
    ),
    env.WA.prepare(
      'CREATE INDEX IF NOT EXISTS wa_messages_thread_at ON wa_messages (thread_id, at)'
    )
  ]);
  schemaReady = true;
}

function threadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    personId: row.person_id || row.personId || null,
    phone: row.phone,
    updatedAt: row.updated_at || row.updatedAt,
    unread: Number(row.unread) || 0
  };
}

function messageRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    threadId: row.thread_id || row.threadId,
    direction: row.direction,
    body: row.body,
    at: row.at,
    status: row.status || 'sent',
    providerId: row.provider_id || row.providerId || null
  };
}

function kvIndexKey(slug) {
  return 'wa:' + slug + ':index';
}

function kvMsgsKey(slug, phone) {
  return 'wa:' + slug + ':msgs:' + phone;
}

async function kvLoadIndex(env, slug) {
  const rec = await env.STATE.get(kvIndexKey(slug), { type: 'json' });
  if (rec && rec.byPhone) return rec;
  return { byPhone: {} };
}

async function kvSaveIndex(env, slug, index) {
  await env.STATE.put(kvIndexKey(slug), JSON.stringify(index));
}

async function kvLoadMsgs(env, slug, phone) {
  const list = await env.STATE.get(kvMsgsKey(slug, phone), { type: 'json' });
  return Array.isArray(list) ? list : [];
}

async function kvSaveMsgs(env, slug, phone, list) {
  await env.STATE.put(kvMsgsKey(slug, phone), JSON.stringify(list));
}

export async function upsertThread(env, slug, opts) {
  const phone = normalizePhone(opts && opts.phone);
  if (!phone) return null;
  const personId = (opts && opts.personId) || null;
  const now = (opts && opts.updatedAt) || new Date().toISOString();
  await ensureSchema(env);
  if (useD1(env)) {
    const found = await env.WA.prepare(
      'SELECT * FROM wa_threads WHERE slug = ? AND phone = ?'
    ).bind(slug, phone).first();
    if (found) {
      const nextPerson = personId || found.person_id || null;
      await env.WA.prepare(
        'UPDATE wa_threads SET person_id = ?, updated_at = ? WHERE id = ?'
      ).bind(nextPerson, now, found.id).run();
      return threadRow(Object.assign({}, found, { person_id: nextPerson, updated_at: now }));
    }
    const id = newId('th');
    await env.WA.prepare(
      'INSERT INTO wa_threads (id, slug, person_id, phone, updated_at, unread) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(id, slug, personId, phone, now).run();
    return { id: id, personId: personId, phone: phone, updatedAt: now, unread: 0 };
  }
  if (!useKv(env)) return null;
  const index = await kvLoadIndex(env, slug);
  let rec = index.byPhone[phone];
  if (rec) {
    rec.personId = personId || rec.personId || null;
    rec.updatedAt = now;
  } else {
    rec = { id: newId('th'), personId: personId, phone: phone, updatedAt: now, unread: 0 };
    index.byPhone[phone] = rec;
  }
  await kvSaveIndex(env, slug, index);
  return threadRow(rec);
}

export async function findThread(env, slug, opts) {
  const phone = normalizePhone(opts && opts.phone);
  const personId = (opts && opts.personId) || null;
  await ensureSchema(env);
  if (useD1(env)) {
    if (phone) {
      const byPhone = await env.WA.prepare(
        'SELECT * FROM wa_threads WHERE slug = ? AND phone = ?'
      ).bind(slug, phone).first();
      if (byPhone) return threadRow(byPhone);
    }
    if (personId) {
      const byPerson = await env.WA.prepare(
        'SELECT * FROM wa_threads WHERE slug = ? AND person_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).bind(slug, personId).first();
      if (byPerson) return threadRow(byPerson);
    }
    return null;
  }
  if (!useKv(env)) return null;
  const index = await kvLoadIndex(env, slug);
  if (phone && index.byPhone[phone]) return threadRow(index.byPhone[phone]);
  if (personId) {
    const hit = Object.keys(index.byPhone).map((p) => index.byPhone[p])
      .find((t) => t.personId === personId);
    return hit ? threadRow(hit) : null;
  }
  return null;
}

export async function listThreads(env, slug) {
  await ensureSchema(env);
  if (useD1(env)) {
    const res = await env.WA.prepare(
      'SELECT * FROM wa_threads WHERE slug = ? ORDER BY updated_at DESC'
    ).bind(slug).all();
    return (res.results || []).map(threadRow);
  }
  if (!useKv(env)) return [];
  const index = await kvLoadIndex(env, slug);
  return Object.keys(index.byPhone).map((p) => threadRow(index.byPhone[p]))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function listMessages(env, slug, thread) {
  if (!thread) return [];
  await ensureSchema(env);
  if (useD1(env)) {
    const res = await env.WA.prepare(
      'SELECT * FROM wa_messages WHERE thread_id = ? ORDER BY at ASC'
    ).bind(thread.id).all();
    return (res.results || []).map(messageRow);
  }
  if (!useKv(env)) return [];
  const list = await kvLoadMsgs(env, slug, thread.phone);
  return list.map(messageRow).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export async function insertMessage(env, slug, thread, msg) {
  const row = {
    id: msg.id || newId('wm'),
    threadId: thread.id,
    direction: msg.direction,
    body: String(msg.body || ''),
    at: msg.at || new Date().toISOString(),
    status: msg.status || 'sent',
    providerId: msg.providerId || null
  };
  await ensureSchema(env);
  if (useD1(env)) {
    if (row.providerId) {
      const dup = await env.WA.prepare(
        'SELECT id FROM wa_messages WHERE provider_id = ?'
      ).bind(row.providerId).first();
      if (dup) return messageRow(Object.assign({}, row, { id: dup.id }));
    }
    try {
      await env.WA.prepare(
        'INSERT INTO wa_messages (id, thread_id, slug, direction, body, at, status, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(row.id, thread.id, slug, row.direction, row.body, row.at, row.status, row.providerId).run();
    } catch (err) {
      return row;
    }
    const unreadBump = row.direction === 'in' ? 1 : 0;
    await env.WA.prepare(
      'UPDATE wa_threads SET updated_at = ?, unread = unread + ? WHERE id = ?'
    ).bind(row.at, unreadBump, thread.id).run();
    return row;
  }
  if (!useKv(env)) return row;
  const list = await kvLoadMsgs(env, slug, thread.phone);
  if (row.providerId && list.some((m) => m.providerId === row.providerId)) {
    return list.find((m) => m.providerId === row.providerId);
  }
  list.push(row);
  await kvSaveMsgs(env, slug, thread.phone, list);
  const index = await kvLoadIndex(env, slug);
  const rec = index.byPhone[thread.phone] || thread;
  rec.updatedAt = row.at;
  rec.unread = (Number(rec.unread) || 0) + (row.direction === 'in' ? 1 : 0);
  rec.personId = rec.personId || thread.personId || null;
  index.byPhone[thread.phone] = rec;
  await kvSaveIndex(env, slug, index);
  return row;
}

export async function markRead(env, slug, thread) {
  if (!thread) return null;
  await ensureSchema(env);
  const now = new Date().toISOString();
  if (useD1(env)) {
    await env.WA.prepare(
      'UPDATE wa_threads SET unread = 0, updated_at = ? WHERE id = ?'
    ).bind(now, thread.id).run();
    return threadRow(Object.assign({}, thread, { unread: 0, updatedAt: now, personId: thread.personId }));
  }
  if (!useKv(env)) return thread;
  const index = await kvLoadIndex(env, slug);
  const rec = index.byPhone[thread.phone];
  if (rec) {
    rec.unread = 0;
    index.byPhone[thread.phone] = rec;
    await kvSaveIndex(env, slug, index);
    return threadRow(rec);
  }
  return thread;
}

export async function attachThread(env, slug, phone, personId) {
  const thread = await upsertThread(env, slug, { phone: phone, personId: personId });
  return thread;
}

export async function sendFonnte(env, phone, body) {
  const token = env.FONNTE_API_TOKEN;
  if (!token) return { ok: false, error: 'missing_token' };
  if (!deviceReady(env)) return { ok: false, error: 'device_not_ready' };
  const target = normalizePhone(phone);
  if (!target) return { ok: false, error: 'bad_phone' };
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ target: target, message: String(body || '') })
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
  return { ok: true, providerId: providerId || null, raw: parsed };
}

export function extractInbound(request, body) {
  const url = urlOf(request);
  const src = Object.assign({}, body || {});
  url.searchParams.forEach((v, k) => {
    if (src[k] == null) src[k] = v;
  });
  const phone = normalizePhone(
    src.sender || src.from || src.nomor || src.phone || src.number || src.wa || src.msisdn
  );
  let text = src.message || src.pesan || src.body || src.text || src.caption || '';
  if (text && typeof text === 'object') {
    text = text.body || text.text || text.caption || '';
  }
  text = String(text || '').trim();
  if (!text && (src.url || src.file || src.filename)) text = '[media]';
  const providerId = String(src.id || src.message_id || src.msgid || src.msgId || '').trim() || null;
  return { phone: phone, body: text, providerId: providerId, name: src.name || src.pushName || '' };
}

export async function readBody(request) {
  const ctype = String(request.headers.get('content-type') || '');
  if (ctype.indexOf('application/json') >= 0) {
    try { return await request.json(); } catch (err) { return {}; }
  }
  if (ctype.indexOf('form') >= 0) {
    const fd = await request.formData();
    const out = {};
    fd.forEach((v, k) => { out[k] = typeof v === 'string' ? v : (v && v.name) || ''; });
    return out;
  }
  const text = await request.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch (err) { return { message: text }; }
}
