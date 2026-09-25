import {
  attachThread,
  corsOptions,
  findThread,
  json,
  listMessages,
  markRead,
  mentorAllowed,
  readBody,
  slugOf,
  storeName
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('GET, POST, OPTIONS');
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (storeName(env) === 'none') return json({ error: 'no_store' }, 503);
  const url = new URL(context.request.url);
  const slug = slugOf(context.request);
  const personId = url.searchParams.get('personId') || '';
  const phone = url.searchParams.get('phone') || '';
  if (!personId && !phone) return json({ error: 'need_person_or_phone' }, 400);
  let thread = await findThread(env, slug, { personId: personId, phone: phone });
  if (thread && personId && !thread.personId && phone) {
    thread = await attachThread(env, slug, phone, personId);
  }
  const messages = thread ? await listMessages(env, slug, thread) : [];
  return json({
    ok: true,
    store: storeName(env),
    thread: thread,
    messages: messages
  });
}

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (storeName(env) === 'none') return json({ error: 'no_store' }, 503);
  const body = await readBody(context.request);
  const slug = slugOf(context.request, body);
  const action = String(body.action || '').toLowerCase();
  const personId = body.personId ? String(body.personId) : '';
  const phone = body.phone || '';
  let thread = await findThread(env, slug, { personId: personId, phone: phone });
  if (action === 'attach') {
    if (!phone || !personId) return json({ error: 'need_person_and_phone' }, 400);
    thread = await attachThread(env, slug, phone, personId);
    return json({ ok: true, thread: thread });
  }
  if (action === 'read') {
    if (!thread) return json({ ok: true, thread: null });
    thread = await markRead(env, slug, thread);
    return json({ ok: true, thread: thread });
  }
  return json({ error: 'bad_action' }, 400);
}
