import {
  corsOptions,
  deviceReady,
  json,
  mentorAllowed,
  storeName
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('GET, OPTIONS');
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  return json({
    ok: true,
    live: true,
    deviceReady: deviceReady(env),
    hasToken: !!env.FONNTE_API_TOKEN,
    store: storeName(env)
  });
}
