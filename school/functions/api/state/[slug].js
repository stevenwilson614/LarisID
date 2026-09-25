/* Shared demo state for MasterMind with Anton GC. Not for larisid.com. */
const MAX_BYTES = 5 * 1024 * 1024;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex'
    }
  });
}

function kvKey(slug) {
  return 'school:' + String(slug || '').trim().toLowerCase();
}

function inviteOf(request) {
  try {
    return new URL(request.url).searchParams.get('k') || '';
  } catch (err) {
    return '';
  }
}

function allowed(env, rec, k, incomingInvite) {
  if (!k) return false;
  if (env.SCHOOL_KEY && k === env.SCHOOL_KEY) return true;
  if (!rec || !rec.key) return true;
  if (k === rec.key) return true;
  if (incomingInvite && k === incomingInvite) return true;
  return false;
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const slug = decodeURIComponent((context.params && context.params.slug) || '');
  if (!slug) return json({ error: 'slug' }, 400);
  if (!env.STATE) return json({ error: 'no_kv' }, 503);
  const k = inviteOf(context.request);
  const rec = await env.STATE.get(kvKey(slug), { type: 'json' });
  if (!allowed(env, rec, k, rec && rec.state && rec.state.inviteCode)) {
    return json({ error: 'forbidden' }, 403);
  }
  if (!rec || !rec.state) return json({ rev: 0, updatedAt: null, state: null }, 404);
  return json({
    rev: rec.rev || 0,
    updatedAt: rec.updatedAt || null,
    state: rec.state
  });
}

export async function onRequestPut(context) {
  const env = context.env || {};
  const slug = decodeURIComponent((context.params && context.params.slug) || '');
  if (!slug) return json({ error: 'slug' }, 400);
  if (!env.STATE) return json({ error: 'no_kv' }, 503);
  const k = inviteOf(context.request);
  if (!k) return json({ error: 'forbidden' }, 403);
  const rec = await env.STATE.get(kvKey(slug), { type: 'json' });
  const text = await context.request.text();
  if (text.length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch (err) {
    return json({ error: 'bad_json' }, 400);
  }
  const incomingInvite = (body && body.state && body.state.inviteCode) || '';
  if (!allowed(env, rec, k, incomingInvite)) return json({ error: 'forbidden' }, 403);
  const incomingRev = Number(body && body.rev) || 0;
  const stored = {
    key: k,
    rev: incomingRev || ((rec && rec.rev) || 0) + 1,
    updatedAt: (body && body.updatedAt) || new Date().toISOString(),
    state: body && body.state ? body.state : null
  };
  await env.STATE.put(kvKey(slug), JSON.stringify(stored));
  return json({ rev: stored.rev, updatedAt: stored.updatedAt });
}

export async function onRequestHead(context) {
  const res = await onRequestGet(context);
  return new Response(null, { status: res.status, headers: res.headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store', allow: 'GET, PUT, OPTIONS' }
  });
}
