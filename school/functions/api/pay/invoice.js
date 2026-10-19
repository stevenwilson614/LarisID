import {
  corsOptions,
  createMayarInvoice,
  json,
  loadStateRec,
  mayarMode,
  mentorAllowed,
  overlayGrants,
  readBody,
  rememberInvoice,
  saveStateRec,
  slugOf
} from './_lib.js';

export async function onRequestOptions() {
  return corsOptions('POST, OPTIONS');
}

function emailFor(body) {
  const raw = String(body.email || '').trim();
  if (raw && raw.indexOf('@') > 0) return raw;
  const id = String(body.personId || 'siswa').replace(/[^a-z0-9._-]/gi, '');
  return (id || 'siswa') + '@students.obrolan.marketing';
}

function mobileFor(body) {
  let d = String(body.mobile || body.wa || '').replace(/\D/g, '');
  if (d.indexOf('62') === 0) d = '0' + d.slice(2);
  if (d && d.indexOf('0') !== 0) d = '0' + d;
  return d || '080000000000';
}

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!mentorAllowed(env, context.request)) return json({ error: 'forbidden' }, 403);
  if (!env.STATE) return json({ error: 'no_kv' }, 503);
  const body = await readBody(context.request);
  const slug = slugOf(context.request, body);
  const test = body.test === true || body.test === '1' || body.test === 1;
  const personId = String(body.personId || (test ? 'mayar-test' : '')).trim();
  if (!personId) return json({ error: 'person' }, 400);
  const term = String(body.term || 'month');
  const amount = test ? 10000 : Math.max(1000, Math.round(Number(body.amount) || 0));
  if (!amount) return json({ error: 'amount' }, 400);
  const termLabel = { month: '1 bulan', quarter: '3 bulan', half: '6 bulan', autopay: 'autopay', year: 'tahun' }[term] || term;
  try {
    const inv = await createMayarInvoice(env, {
      name: body.name || (test ? 'Tes Mayar' : 'Siswa'),
      email: emailFor(body),
      mobile: mobileFor(body),
      description: test
        ? 'Tes invoice MasterMind (bukan akses kelas)'
        : ('Mentoring MasterMind · ' + termLabel),
      item: test ? 'Tes Mayar Rp10.000' : ('Mentoring · ' + termLabel),
      amount: amount,
      personId: personId,
      term: term,
      slug: slug,
      test: test,
      paymentMethod: body.paymentMethod || env.MAYAR_VA_METHOD || ''
    });
    const row = {
      slug: slug,
      personId: personId,
      term: term,
      amount: amount,
      email: emailFor(body),
      transactionId: inv.transactionId,
      invoiceId: inv.id,
      link: inv.link,
      test: test,
      granted: false,
      createdAt: new Date().toISOString()
    };
    await rememberInvoice(env, row);
    if (!test) {
      const rec = await loadStateRec(env, slug);
      if (rec && rec.state) {
        rec.state.billing = rec.state.billing || {};
        const prev = rec.state.billing[personId] || {};
        if (prev.status !== 'lunas') {
          rec.state.billing[personId] = Object.assign({}, prev, {
            status: 'pending',
            source: 'mayar',
            plan: prev.plan || 'preview',
            amount: amount,
            term: term,
            pendingTerm: term,
            pendingAmount: amount,
            pendingAt: row.createdAt,
            mayarLink: inv.link,
            mayarTx: inv.transactionId,
            note: 'Menunggu pembayaran Mayar · ' + termLabel
          });
          rec.state = await overlayGrants(env, slug, rec.state);
          rec.rev = (Number(rec.rev) || 0) + 1;
          rec.updatedAt = new Date().toISOString();
          await saveStateRec(env, slug, rec);
        }
      }
    }
    return json({
      ok: true,
      mode: mayarMode(env),
      link: inv.link,
      transactionId: inv.transactionId,
      invoiceId: inv.id,
      expiredAt: inv.expiredAt,
      amount: amount,
      test: test
    });
  } catch (err) {
    const code = err && err.code;
    if (code === 'not_configured') return json({ error: 'not_configured', configured: false }, 503);
    return json({
      error: 'mayar',
      message: (err && err.message) || 'mayar',
      status: err && err.status
    }, 502);
  }
}
