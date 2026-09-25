import {
  corsOptions,
  json,
  listThreads,
  mentorAllowed,
  slugOf,
  storeName
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('GET, OPTIONS');
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (storeName(env) === 'none') return json({ error: 'no_store' }, 503);
  const slug = slugOf(context.request);
  const threads = await listThreads(env, slug);
  return json({
    ok: true,
    store: storeName(env),
    threads: threads
  });
}
