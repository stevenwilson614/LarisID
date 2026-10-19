import {
  corsOptions,
  json,
  loadMeta,
  mayarMode,
  mentorAllowed,
  publicWebhookUrl,
  slugOf
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('GET, OPTIONS');
}

export async function onRequestGet(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  const slug = slugOf(context.request, null);
  const meta = env.STATE ? await loadMeta(env, slug) : {};
  return json({
    configured: !!(env.MAYAR_API_KEY),
    mode: mayarMode(env),
    webhookUrl: publicWebhookUrl(context.request, env),
    lastWebhookAt: meta.lastWebhookAt || null,
    lastEvent: meta.lastEvent || '',
    lastTestAt: meta.lastTestAt || null
  });
}
