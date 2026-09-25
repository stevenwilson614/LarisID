import {
  attachThread,
  corsOptions,
  extractInbound,
  insertMessage,
  json,
  newId,
  readBody,
  slugOf,
  storeName,
  webhookAllowed
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('GET, POST, OPTIONS');
}

async function ingest(context) {
  const env = context.env || {};
  if (!webhookAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (storeName(env) === 'none') return json({ error: 'no_store' }, 503);
  const body = context.request.method === 'GET' ? {} : await readBody(context.request);
  const inbound = extractInbound(context.request, body);
  const slug = slugOf(context.request, body);
  if (!inbound.phone) return json({ error: 'bad_phone' }, 400);
  if (!inbound.body) return json({ ok: true, ignored: 'empty' });

  const thread = await attachThread(env, slug, inbound.phone, null);
  if (!thread) return json({ error: 'no_store' }, 503);
  const msg = await insertMessage(env, slug, thread, {
    id: newId('wm'),
    direction: 'in',
    body: inbound.body,
    at: new Date().toISOString(),
    status: 'received',
    providerId: inbound.providerId
  });
  return json({ ok: true, store: storeName(env), thread: thread, message: msg });
}

export async function onRequestPost(context) {
  return ingest(context);
}

export async function onRequestGet(context) {
  return ingest(context);
}
