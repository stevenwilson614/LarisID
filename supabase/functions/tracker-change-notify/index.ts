// Alerts users when a market they track actually moves.
//
// Audience: user_tracker_state rows that are not paused and have picked at
// least one notify channel. Delivery is email (Resend) and/or WhatsApp
// (Fonnte), per the user's own choice.
//
// Two things make this harder than a normal cron mailer, and both are handled
// explicitly below:
//
//  1. FRESHNESS. mv_keyword_daily / mv_shop_daily are refreshed by hand over
//     SSH — there is no cron for it. A job keyed on the calendar date would
//     re-send the same alert every morning the refresh was skipped. So every
//     send is keyed on the matview's own latest day (`data_day`), and the
//     unique index on tracker_notifications makes a repeat a no-op.
//
//  2. REACHABILITY. WhatsApp-OTP signups get a synthetic @wa.larisid.com
//     address that bounces, and most email users have no phone number. The
//     audience RPC returns email_ok per user; a channel with no address is
//     skipped rather than silently failing.
//
// Invoked by pg_cron job `tracker-change-notify` with the service-role bearer,
// same pattern as weekly-digest.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const WINDOW_DAYS = 7

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(data: string, secret: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return await crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function unsubToken(email: string): Promise<string> {
  const secret = Deno.env.get('WINBACK_UNSUB_SECRET')
  if (!secret) throw new Error('WINBACK_UNSUB_SECRET is not set')
  const emailB64 = base64urlEncode(new TextEncoder().encode(email).buffer)
  const sigB64 = base64urlEncode(await hmacSign(email, secret))
  return `${emailB64}.${sigB64}`
}

// What counts as "a change worth interrupting someone for". Tuned to be quiet:
// a tracker that pings on noise gets muted, and then it never works again.
const MIN_UNITS_PCT = 0.20   // ±20% week-over-week units
const MIN_UNITS_ABS = 10     // ...and at least this many units of movement
const MIN_PRICE_PCT = 0.05   // ±5% average price
const MIN_SELLER_DELTA = 1   // any change in the number of active sellers

function fmtShort(n: number): string {
  n = Math.round(n || 0)
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' jt'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'rb'
  return String(n)
}

function pct(cur: number, prev: number): number | null {
  if (!prev) return null
  return (cur - prev) / prev
}

type Change = { label: string; detail: string; dir: 'up' | 'down' | 'flat' }

/** A competitor whose price moved AND whose units moved, in the same window. */
type Move = {
  produk: string; toko: string; harga_sebelum: number; harga_sekarang: number
  turun_pct: number; diskon_naik_pp: number; lonjakan_unit: number
}

// Deliberately conservative on top of what mv_competitor_moves already filters:
// the matview is the "is this a real move" test, this is the "is it worth
// interrupting someone for" test. A 12-unit bump on a rival listing is not.
const MIN_MOVE_UNITS = 25
const MAX_MOVES_PER_MARKET = 3

/** Threshold the current-vs-previous pairs the rollup already returns. */
function changesFor(row: any): Change[] {
  const out: Change[] = []

  const units = Number(row.units || 0)
  const unitsPrev = Number(row.units_prev || 0)
  const uPct = pct(units, unitsPrev)
  if (uPct != null && Math.abs(uPct) >= MIN_UNITS_PCT && Math.abs(units - unitsPrev) >= MIN_UNITS_ABS) {
    out.push({
      label: uPct > 0 ? 'Penjualan naik' : 'Penjualan turun',
      detail: `${fmtShort(unitsPrev)} → ${fmtShort(units)} unit (${uPct > 0 ? '+' : ''}${Math.round(uPct * 100)}%)`,
      dir: uPct > 0 ? 'up' : 'down',
    })
  }

  const price = Number(row.avg_price || 0)
  const pricePrev = Number(row.avg_price_prev || 0)
  const pPct = pct(price, pricePrev)
  if (pPct != null && Math.abs(pPct) >= MIN_PRICE_PCT) {
    out.push({
      label: pPct > 0 ? 'Harga rata-rata naik' : 'Harga rata-rata turun',
      detail: `Rp ${fmtShort(pricePrev)} → Rp ${fmtShort(price)} (${pPct > 0 ? '+' : ''}${Math.round(pPct * 100)}%)`,
      dir: pPct > 0 ? 'up' : 'down',
    })
  }

  const sellers = Number(row.n_sellers || 0)
  const sellersPrev = Number(row.n_sellers_prev || 0)
  if (sellersPrev && Math.abs(sellers - sellersPrev) >= MIN_SELLER_DELTA) {
    const d = sellers - sellersPrev
    out.push({
      label: d > 0 ? 'Penjual bertambah' : 'Penjual berkurang',
      detail: `${sellersPrev} → ${sellers} toko aktif`,
      dir: d > 0 ? 'up' : 'down',
    })
  }

  return out
}

/**
 * The competitor line, and the sentence that keeps it honest.
 *
 * We observed a price move and a unit move on the same listing in the same
 * window. We did NOT observe that one caused the other -- the seller may have
 * discounted because demand was already rising, or both may follow a campaign
 * we cannot see. So the copy reports, and then hands the decision back with the
 * margin question attached. It must never read as "they cut, so cut".
 */
/** Units are counted, not estimated, so they print in full. fmtShort would
 *  round 1.450 unit down to "1rb", which reads as a smaller move than it was. */
function units(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString('id-ID')
}

function movesHtml(moves: Move[]): string {
  if (!moves.length) return ''
  const rows = moves.map(m => {
    const what = m.turun_pct >= 5
      ? `turun ${m.turun_pct}% (Rp ${fmtShort(m.harga_sebelum)} → Rp ${fmtShort(m.harga_sekarang)})`
      : `diskon diperdalam ${m.diskon_naik_pp} poin`
    return `<div style="font-size:12.5px;color:#6B7280;margin-top:4px;">
              <strong style="color:#1A1A1A;">${m.toko}</strong> — ${what},
              dan terjualnya naik ${units(m.lonjakan_unit)} unit di periode yang sama.
            </div>`
  }).join('')
  return `<div style="margin-top:6px;padding:10px 12px;background:#FFF7ED;border-radius:8px;">
            <div style="font-size:12px;font-weight:700;color:#9A3412;">Pesaing bergerak</div>
            ${rows}
            <div style="font-size:11.5px;color:#9CA3AF;margin-top:7px;line-height:1.5;">
              Kami melihat harga turun dan penjualan naik di periode yang sama pada listing
              yang sama. Kami tidak bisa memastikan yang satu menyebabkan yang lain.
              Sebelum ikut turun harga, cek dulu harga pokokmu — ikut perang harga di bawah
              modal akan merugikanmu, bukan mereka.
            </div>
          </div>`
}

function movesText(moves: Move[]): string {
  if (!moves.length) return ''
  const rows = moves.map(m => {
    const what = m.turun_pct >= 5
      ? `turun ${m.turun_pct}%`
      : `diskon +${m.diskon_naik_pp} poin`
    return `  - ${m.toko}: ${what}, terjual +${units(m.lonjakan_unit)} unit`
  }).join('\n')
  return `\n  Pesaing bergerak:\n${rows}\n  (Kami lihat keduanya terjadi bersamaan, bukan bukti sebab-akibat. Cek modalmu dulu sebelum ikut turun harga.)`
}

function emailHtml(blocks: { name: string; changes: Change[]; moves: Move[] }[], unsubUrl: string): string {
  const rows = blocks.map(b =>
    `<div style="padding:11px 0;border-bottom:1px solid #eee;">
       <div style="font-size:13.5px;font-weight:700;">${b.name}</div>
       ${b.changes.map(c => {
         const color = c.dir === 'up' ? '#1A7A46' : '#B5202A'
         return `<div style="font-size:12.5px;color:#6B7280;margin-top:3px;">
                   <strong style="color:${color};">${c.label}</strong> — ${c.detail}
                 </div>`
       }).join('')}
       ${movesHtml(b.moves)}
     </div>`).join('')

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A;">
      <h2 style="font-size:17px;margin:18px 0 4px;">Ada perubahan di pasar yang kamu pantau</h2>
      <p style="font-size:13px;color:#6B7280;margin:0 0 14px;">Dibanding ${WINDOW_DAYS} hari sebelumnya.</p>
      ${rows}
      <p style="margin:22px 0;"><a href="${SITE}" style="background:#B5202A;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:8px;display:inline-block;">Buka Pantauan</a></p>
      <p style="font-size:11.5px;color:#9CA3AF;">Kamu menerima email ini karena memilih notifikasi email di halaman Pantauan.
      <a href="${unsubUrl}" style="color:#9CA3AF;">Berhenti berlangganan</a>.</p>
    </div>`
}

function waText(blocks: { name: string; changes: Change[]; moves: Move[] }[]): string {
  const lines = blocks.slice(0, 3).map(b =>
    `*${b.name}*\n` + b.changes.map(c => `• ${c.label} — ${c.detail}`).join('\n') + movesText(b.moves)
  )
  return `Ada perubahan di pasar yang kamu pantau (${WINDOW_DAYS} hari terakhir):\n\n`
    + lines.join('\n\n')
    + `\n\nLihat detail: ${SITE}`
}

serve(async (req) => {
  // Service-role only (cron). verify_jwt=on means the platform already checked
  // the signature; we additionally require the service_role claim so an anon
  // or user JWT can never trigger a send. Do NOT compare against
  // SUPABASE_SERVICE_ROLE_KEY — that differs from the legacy JWT cron sends.
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  let role = ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    role = payload.role || ''
  } catch (_) { /* not a JWT */ }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
  const FONNTE_TOKEN = Deno.env.get('FONNTE_API_TOKEN')

  let opts: { dry_run?: boolean; test_to?: string; test_wa?: string; force?: boolean } = {}
  try { opts = await req.json() } catch (_) { /* empty body = real run */ }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. Freshness gate. If the matview has not advanced there is nothing new to
  //    say, and re-running would only risk duplicate alerts.
  const { data: wm, error: wmErr } = await db.rpc('tracker_data_watermark')
  if (wmErr) return new Response(JSON.stringify({ error: wmErr.message }), { status: 500 })
  const dataDay: string | null = wm?.keyword_day || null
  if (!dataDay) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no market data' }))
  }

  // 2. Audience.
  const { data: audience, error: audErr } = await db.rpc('tracker_notify_audience')
  if (audErr) return new Response(JSON.stringify({ error: audErr.message }), { status: 500 })
  if (!audience || !audience.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no one opted in', data_day: dataDay }))
  }

  let sent = 0
  const errors: string[] = []
  const plan: any[] = []

  // Competitor moves are a property of the MARKET, not of the user, and a cohort
  // is 20 students choosing from a small pool of markets. Without this the job
  // makes one RPC per tracked keyword per user -- 20 students x 40 keywords is
  // 800 sequential round trips in a single invocation. Cached per run, and the
  // job is short-lived so there is nothing to invalidate.
  const movesCache = new Map<string, Move[]>()
  async function movesFor(keyword: string): Promise<Move[]> {
    const hit = movesCache.get(keyword)
    if (hit) return hit
    const { data: mv } = await db.rpc('competitor_moves_for_keyword', {
      p_keyword: keyword, p_limit: MAX_MOVES_PER_MARKET,
    })
    const out = ((mv || []) as Move[])
      .filter(m => Number(m.lonjakan_unit || 0) >= MIN_MOVE_UNITS)
      .slice(0, MAX_MOVES_PER_MARKET)
    movesCache.set(keyword, out)
    return out
  }

  for (const u of audience) {
    try {
      const channels: string[] = u.notify_channels || []
      const blocks: { name: string; changes: Change[]; moves: Move[] }[] = []

      for (const scope of ['keyword', 'store'] as const) {
        if (scope === 'keyword' && !u.n_keywords) continue
        if (scope === 'store' && !u.n_stores) continue
        const { data: roll } = await db.rpc('tracker_changes_for_user', {
          p_user_id: u.user_id, p_days: WINDOW_DAYS, p_scope: scope,
        })
        for (const row of (roll?.rows || [])) {
          // n_days === 0 means the market has no readings inside the window —
          // absence of data, not a change. Alerting on it would be noise.
          if (!row.n_days) continue
          const changes = changesFor(row)

          // Competitor moves are per-market, so only the keyword scope has them.
          // A rival discounting is worth saying even when the market aggregate
          // did not shift enough to clear the rollup thresholds — that is often
          // exactly the week a seller most wants to know.
          const moves: Move[] = (scope === 'keyword' && row.keyword)
            ? await movesFor(row.keyword)
            : []

          if (!changes.length && !moves.length) continue
          blocks.push({
            name: scope === 'keyword' ? row.keyword : (row.store_name || `Toko ${row.shop_id}`),
            changes,
            moves,
          })
        }
      }

      if (!blocks.length) continue

      // One claim per user per channel per data_day: the digest covers every
      // moved market at once, so the entity key is the whole set.
      for (const channel of channels) {
        if (channel === 'email' && !u.email_ok) continue
        if (channel === 'whatsapp' && !u.notify_wa_number) continue

        const claimKey = 'digest'
        if (!opts.dry_run && !opts.force) {
          const { data: claimed } = await db.rpc('tracker_notify_claim', {
            p_user_id: u.user_id, p_scope: 'keyword', p_entity_key: claimKey,
            p_channel: channel, p_data_day: dataDay,
          })
          if (!claimed) continue   // already sent for this data day
        }

        plan.push({ user_id: u.user_id, channel, markets: blocks.length })
        if (opts.dry_run) continue

        let ok = false
        let detail = ''
        if (channel === 'email') {
          if (!RESEND_KEY) { errors.push(`${u.user_id}: RESEND_API_KEY missing`); continue }
          const unsubUrl = `${PUBLIC_API}/functions/v1/email-unsubscribe?t=${encodeURIComponent(await unsubToken(u.email))}`
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: opts.test_to || u.email,
              subject: 'Ada perubahan di pasar yang kamu pantau',
              html: emailHtml(blocks, unsubUrl),
              headers: {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }),
          })
          ok = res.ok
          if (!ok) detail = `${res.status} ${await res.text().catch(() => '')}`
        } else {
          if (!FONNTE_TOKEN) { errors.push(`${u.user_id}: FONNTE_API_TOKEN missing`); continue }
          // Fonnte: raw token, no Bearer prefix; target is 628… with no plus.
          const target = String(opts.test_wa || u.notify_wa_number).replace('+', '')
          const res = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, message: waText(blocks) }),
          })
          ok = res.ok
          if (!ok) detail = `${res.status} ${await res.text().catch(() => '')}`
        }

        if (ok) sent++
        else errors.push(`${u.user_id}/${channel}: ${detail}`)

        await db.rpc('tracker_notify_mark', {
          p_user_id: u.user_id, p_scope: 'keyword', p_entity_key: claimKey,
          p_channel: channel, p_data_day: dataDay,
          p_status: ok ? 'sent' : 'failed', p_detail: detail || null,
        })

        await new Promise(r => setTimeout(r, 600))  // Resend caps at 2 req/s
      }
    } catch (e) {
      errors.push(`${u.user_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return new Response(JSON.stringify({
    sent, audience: audience.length, data_day: dataDay,
    dry_run: !!opts.dry_run, plan, errors,
  }), { headers: { 'Content-Type': 'application/json' } })
})
