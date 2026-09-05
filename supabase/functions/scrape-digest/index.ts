// One email (and optional WhatsApp) after each *measured* scrape lands.
//
// Audience: every signed-up Deep Dive user, not only Pantauan opt-ins.
// WhatsApp only when they opted in (notify_wa_number on user_tracker_state).
// Keyed on scrape_digest_watermark().data_day so a skipped scrape is silence,
// not a repeat of last week's numbers.
//
// Cron: scrape-digest at 03:00 UTC (10:00 WIB), after tracker-change-notify.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const WINDOW_DAYS = 14

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

function fmtShort(n: number): string {
  n = Math.round(n || 0)
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' jt'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'rb'
  return String(n)
}

function sourceLabel(src: string): string {
  return src === 'measured' ? 'terukur' : 'perkiraan'
}

function fmtDay(iso: string): string {
  try {
    const [y, m, d] = iso.split('-').map(Number)
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(Date.UTC(y, m - 1, d)))
  } catch {
    return iso
  }
}

type Row = {
  keyword: string
  units: number
  units_prev: number
  avg_price: number
  avg_price_prev: number
  n_sellers: number
  n_sellers_prev: number
  n_days: number
  source: string
}

function lineFor(row: Row): { html: string; text: string } {
  const label = sourceLabel(row.source || '')
  const units = fmtShort(row.units)
  const prev = fmtShort(row.units_prev)
  const moved = row.units_prev > 0 && row.units !== row.units_prev
  const unitsBit = moved ? `${prev} → ${units} unit/minggu` : `${units} unit/minggu`
  const html = `<div style="padding:11px 0;border-bottom:1px solid #eee;">
    <div style="font-size:13.5px;font-weight:700;">${row.keyword}</div>
    <div style="font-size:12.5px;color:#6B7280;margin-top:3px;">${unitsBit} <em>(${label})</em></div>
  </div>`
  const text = `*${row.keyword}*\n${unitsBit} (${label})`
  return { html, text }
}

function emailHtml(dataDay: string, blocks: { html: string }[], why: string, unsubUrl: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A;">
      <h2 style="font-size:17px;margin:18px 0 4px;">Data baru masuk</h2>
      <p style="font-size:13px;color:#6B7280;margin:0 0 14px;">Scrape ${fmtDay(dataDay)}. Angka di bawah memakai jendela ${WINDOW_DAYS} hari, dilabeli terukur atau perkiraan.</p>
      ${blocks.map(b => b.html).join('')}
      <p style="margin:22px 0;"><a href="${SITE}" style="background:#B5202A;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:8px;display:inline-block;">Buka LarisID</a></p>
      <p style="font-size:11.5px;color:#9CA3AF;">Kamu menerima email ini karena ${why}.
      <a href="${unsubUrl}" style="color:#9CA3AF;">Berhenti berlangganan</a>.</p>
    </div>`
}

function waText(dataDay: string, lines: string[]): string {
  return `Data baru masuk (scrape ${fmtDay(dataDay)}):\n\n`
    + lines.slice(0, 3).join('\n\n')
    + `\n\nLihat detail: ${SITE}`
}

serve(async (req) => {
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

  const { data: wm, error: wmErr } = await db.rpc('scrape_digest_watermark')
  if (wmErr) return new Response(JSON.stringify({ error: wmErr.message }), { status: 500 })
  const dataDay: string | null = wm?.data_day || null
  if (!dataDay) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no measured scrape' }))
  }

  const { data: audience, error: audErr } = await db.rpc('scrape_digest_audience')
  if (audErr) return new Response(JSON.stringify({ error: audErr.message }), { status: 500 })
  if (!audience || !audience.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no deep-dive users', data_day: dataDay }))
  }

  let sent = 0
  const errors: string[] = []
  const plan: any[] = []

  for (const u of audience) {
    try {
      const kws: string[] = (u.keywords || []).filter(Boolean).slice(0, 3)
      if (!kws.length) continue

      const { data: pack } = await db.rpc('scrape_digest_changes', {
        p_keywords: kws, p_days: WINDOW_DAYS,
      })
      const rows: Row[] = (pack?.rows || []).filter((r: Row) => r && r.keyword)
      if (!rows.length) continue

      const blocks = rows.map(lineFor)
      const whyKw = rows[0].keyword
      const why = `kamu pernah membuka analisis ${whyKw}`

      const channels: string[] = []
      if (u.email_ok) channels.push('email')
      if (u.notify_wa_number) channels.push('whatsapp')
      if (!channels.length) continue

      for (const channel of channels) {
        if (!opts.dry_run && !opts.force) {
          const { data: claimed } = await db.rpc('tracker_notify_claim', {
            p_user_id: u.user_id, p_scope: 'keyword', p_entity_key: 'scrape_digest',
            p_channel: channel, p_data_day: dataDay,
          })
          if (!claimed) continue
        }

        plan.push({ user_id: u.user_id, channel, keywords: kws })
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
              subject: `Data baru masuk — scrape ${fmtDay(dataDay)}`,
              html: emailHtml(dataDay, blocks, why, unsubUrl),
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
          const target = String(opts.test_wa || u.notify_wa_number).replace('+', '')
          const res = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, message: waText(dataDay, blocks.map(b => b.text)) }),
          })
          ok = res.ok
          if (!ok) detail = `${res.status} ${await res.text().catch(() => '')}`
        }

        if (ok) sent++
        else errors.push(`${u.user_id}/${channel}: ${detail}`)

        await db.rpc('tracker_notify_mark', {
          p_user_id: u.user_id, p_scope: 'keyword', p_entity_key: 'scrape_digest',
          p_channel: channel, p_data_day: dataDay,
          p_status: ok ? 'sent' : 'failed', p_detail: detail || null,
        })

        await new Promise(r => setTimeout(r, 600))
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
