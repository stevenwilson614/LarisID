import {
  attachThread,
  corsOptions,
  deviceReady,
  insertMessage,
  json,
  mentorAllowed,
  newId,
  normalizePhone,
  readBody,
  sendFonnte,
  slugOf,
  storeName
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('POST, OPTIONS');
}

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (storeName(env) === 'none') return json({ error: 'no_store' }, 503);
  const body = await readBody(context.request);
  const slug = slugOf(context.request, body);
  const phone = normalizePhone(body.phone || body.wa || body.target);
  const text = String(body.body || body.message || '').trim();
  const personId = body.personId ? String(body.personId) : null;
  if (!phone) return json({ error: 'bad_phone' }, 400);
  if (!text) return json({ error: 'empty' }, 400);
  if (!deviceReady(env)) return json({ error: 'device_not_ready' }, 503);
  if (!env.FONNTE_API_TOKEN) return json({ error: 'missing_token' }, 503);

  const thread = await attachThread(env, slug, phone, personId);
  if (!thread) return json({ error: 'no_store' }, 503);
  const sent = await sendFonnte(env, phone, text);
  if (!sent.ok) return json({ error: sent.error, detail: sent.detail || null, thread: thread }, 502);

  const msg = await insertMessage(env, slug, thread, {
    id: newId('wm'),
    direction: 'out',
    body: text,
    at: new Date().toISOString(),
    status: 'sent',
    providerId: sent.providerId
  });
  return json({
    ok: true,
    store: storeName(env),
    thread: thread,
    message: msg
  });
}
