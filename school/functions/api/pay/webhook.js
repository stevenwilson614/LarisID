import {
  applyPaidGrant,
  corsOptions,
  eventName,
  findInvoice,
  json,
  kvPut,
  loadGrants,
  loadMeta,
  loadStateRec,
  overlayGrants,
  readBody,
  saveGrants,
  saveMeta,
  saveStateRec,
  slugOf,
  webhookAllowed
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('POST, OPTIONS');
}

function dataOf(body) {
  if (!body || typeof body !== 'object') return {};
  if (body.data && typeof body.data === 'object') return body.data;
  return body;
}

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!env.STATE) return json({ error: 'no_kv' }, 503);
  const body = await readBody(context.request);
  if (!webhookAllowed(env, context.request, body)) return json({ error: 'forbidden' }, 403);
  const event = eventName(body).toLowerCase();
  const data = dataOf(body);
  const extra = data.extraData || body.extraData || {};
  const slugGuess = extra.slug || slugOf(context.request, body);
  const meta = await loadMeta(env, slugGuess);
  meta.lastWebhookAt = new Date().toISOString();
  meta.lastEvent = event || 'unknown';
  await saveMeta(env, slugGuess, meta);

  const paidEvent = event.indexOf('payment.received') >= 0 || event.indexOf('payment_received') >= 0;
  const statusPaid = data.status === true || data.status === 'true' ||
    String(data.status || '').toLowerCase() === 'paid' || String(data.status || '').toLowerCase() === 'success';
  if (!paidEvent && !(statusPaid && !event)) {
    return json({ ok: true, ignored: event || 'not_paid' });
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
  const row = await findInvoice(env, hints.slug, hints);
  if (!row) return json({ ok: true, ignored: 'unknown_invoice' });
  if (row.test || extra.test === '1' || extra.test === 1) {
    meta.lastTestAt = meta.lastWebhookAt;
    await saveMeta(env, row.slug || slugGuess, meta);
    return json({ ok: true, test: true });
  }
  if (row.granted) return json({ ok: true, duplicate: true });

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
  const grants = await loadGrants(env, row.slug);
  grants[row.personId] = grant;
  await saveGrants(env, row.slug, grants);
  row.granted = true;
  row.grantedAt = grant.paidAt;
  if (row.transactionId) await kvPut(env, 'pay:invoice:' + row.transactionId, row);
  if (row.invoiceId && row.invoiceId !== row.transactionId) {
    await kvPut(env, 'pay:invoice:' + row.invoiceId, row);
  }

  const rec = await loadStateRec(env, row.slug);
  const state = (rec && rec.state) ? rec.state : {};
  applyPaidGrant(state, grant);
  await overlayGrants(env, row.slug, state);
  const stored = {
    key: (rec && rec.key) || '',
    rev: ((rec && Number(rec.rev)) || 0) + 1,
    updatedAt: grant.paidAt,
    state: state
  };
  await saveStateRec(env, row.slug, stored);
  return json({ ok: true, personId: row.personId, rev: stored.rev });
}
