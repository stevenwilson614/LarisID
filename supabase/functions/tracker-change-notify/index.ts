// Alerts users when a Favorit Aku product moves.
//
// Audience: user_tracker_state rows that are not paused, have picked a
// channel, and have ≥ 1 product favorite. Delivery is email (Resend)
// and/or WhatsApp (Fonnte), per the user's choice.
//
// Cadence:
//   on_update — daily cron, only when a favorite fired a trigger
//   weekly    — Monday 08:00 WIB cron ({"task":"weekly"}), always sent
//
// Freshness: on_update is keyed on tracker_data_watermark().favorite_day
// so a skipped scrape produces silence rather than a duplicate.
//
// Reachability: @wa.larisid.com emails bounce. WhatsApp is only sent when
// FONNTE_DEVICE_READY=true; skipped WA sends are counted, never silently
// rewritten as email.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const WA_ALERTS_READY = (Deno.env.get('FONNTE_DEVICE_READY') || 'false') === 'true'

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

function fmtRp(n: number): string {
  return 'Rp ' + fmtShort(n)
}

type Change = { label: string; detail: string; dir: 'up' | 'down' | 'flat' }
type Block = { name: string; changes: Change[] }

function triggersFor(row: any): Change[] {
  const out: Change[] = []
  if (row.gone) {
    out.push({
      label: 'Produk tidak ditemukan lagi',
      detail: 'Listing ini tidak muncul di scrape 3 hari terakhir.',
      dir: 'down',
    })
    return out
  }
  if (row.price_changed) {
    const a = Number(row.price_prev) || 0
    const b = Number(row.price) || 0
    out.push({
      label: b < a ? 'Harga turun' : 'Harga naik',
      detail: `${fmtRp(a)} → ${fmtRp(b)}`,
      dir: b < a ? 'down' : 'up',
    })
  }
  if (row.sold_bucket_changed) {
    const a = row.sold_text_prev || (row.total_sold_prev != null ? fmtShort(Number(row.total_sold_prev)) : '—')
    const b = row.sold_text || (row.total_sold != null ? fmtShort(Number(row.total_sold)) : '—')
    out.push({
      label: 'Angka terjual berubah',
      detail: `${a} → ${b} (perkiraan / bucket, bukan hitungan persis)`,
      dir: 'flat',
    })
  }
  if (row.rating_dropped) {
    out.push({
      label: 'Rating turun',
      detail: `${Number(row.rating_prev).toFixed(1)} → ${Number(row.rating).toFixed(1)}`,
      dir: 'down',
    })
  }
  return out
}

function weeklyChanges(row: any): Change[] {
  const out: Change[] = []
  const price = Number(row.price) || 0
  const pricePrev = Number(row.price_prev) || 0
  if (price && pricePrev && price !== pricePrev) {
    out.push({
      label: price < pricePrev ? 'Harga turun' : 'Harga naik',
      detail: `${fmtRp(pricePrev)} → ${fmtRp(price)}`,
      dir: price < pricePrev ? 'down' : 'up',
    })
  }
  const omset = Number(row.omset) || 0
  const omsetPrev = Number(row.omset_prev) || 0
  if (omsetPrev > 0 && omset > 0) {
    const pct = Math.round(((omset - omsetPrev) / omsetPrev) * 100)
    if (Math.abs(pct) >= 5 && String(row.source) === 'measured') {
      out.push({
        label: pct > 0 ? 'Omset naik' : 'Omset turun',
        detail: `${fmtRp(omsetPrev)} → ${fmtRp(omset)} (${pct > 0 ? '+' : ''}${pct}%, terukur)`,
        dir: pct > 0 ? 'up' : 'down',
      })
    }
  }
  return out
}

function emailHtml(title: string, intro: string, blocks: Block[], unsubUrl: string, emptyNote: string): string {
  const rows = blocks.length
    ? blocks.map(b =>
      `<div style="padding:11px 0;border-bottom:1px solid #eee;">
         <div style="font-size:13.5px;font-weight:700;">${b.name}</div>
         ${b.changes.map(c => {
           const color = c.dir === 'up' ? '#1A7A46' : c.dir === 'down' ? '#B5202A' : '#6B7280'
           return `<div style="font-size:12.5px;color:#6B7280;margin-top:3px;">
                     <strong style="color:${color};">${c.label}</strong> — ${c.detail}
                   </div>`
         }).join('')}
       </div>`).join('')
    : `<p style="font-size:13.5px;color:#374151;">${emptyNote}</p>`

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A;">
      <h2 style="font-size:17px;margin:18px 0 4px;">${title}</h2>
      <p style="font-size:13px;color:#6B7280;margin:0 0 14px;">${intro}</p>
      ${rows}
      <p style="margin:22px 0;"><a href="${SITE}" style="background:#B5202A;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:8px;display:inline-block;">Buka Favorit Aku</a></p>
      <p style="font-size:11.5px;color:#9CA3AF;">Kamu menerima email ini karena memilih notifikasi di halaman Favorit Aku.
      <a href="${unsubUrl}" style="color:#9CA3AF;">Berhenti berlangganan</a>.</p>
    </div>`
}

function waText(title: string, blocks: Block[], emptyNote: string): string {
  if (!blocks.length) return `${title}\n\n${emptyNote}\n\nLihat: ${SITE}`
  const lines = blocks.slice(0, 5).map(b =>
    `*${b.name}*\n` + b.changes.map(c => `• ${c.label} — ${c.detail}`).join('\n')
  )
  return `${title}\n\n` + lines.join('\n\n') + `\n\nLihat detail: ${SITE}`
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

  let opts: { dry_run?: boolean; test_to?: string; test_wa?: string; force?: boolean; task?: string } = {}
  try { opts = await req.json() } catch (_) { /* empty body = real run */ }
  const task = opts.task === 'weekly' ? 'weekly' : 'on_update'

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: wm, error: wmErr } = await db.rpc('tracker_data_watermark')
  if (wmErr) return new Response(JSON.stringify({ error: wmErr.message }), { status: 500 })
  const dataDay: string | null = wm?.favorite_day || wm?.keyword_day || null
  if (task === 'on_update' && !dataDay) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no favorite data', task }))
  }
  const claimDay = dataDay || new Date().toISOString().slice(0, 10)

  const { data: audience, error: audErr } = await db.rpc('tracker_notify_audience')
  if (audErr) return new Response(JSON.stringify({ error: audErr.message }), { status: 500 })
  const wanted = (audience || []).filter((u: any) =>
    task === 'weekly'
      ? u.notify_cadence === 'weekly'
      : (u.notify_cadence || 'on_update') === 'on_update'
  )
  if (!wanted.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no one opted in', data_day: claimDay, task }))
  }

  let sent = 0
  let skippedWa = 0
  const errors: string[] = []
  const plan: any[] = []

  for (const u of wanted) {
    try {
      const channels: string[] = u.notify_channels || []
      let blocks: Block[] = []
      let emptyNote = ''

      if (task === 'weekly') {
        const { data: rows } = await db.rpc('favorite_weekly_for_user', { p_user_id: u.user_id })
        blocks = (rows || []).map((row: any) => ({
          name: row.product_name || 'Produk',
          changes: weeklyChanges(row),
        })).filter((b: Block) => b.changes.length)
        emptyNote = 'Semua favorit kamu stabil minggu ini.'
      } else {
        const { data: rows } = await db.rpc('favorite_changes_for_user', { p_user_id: u.user_id })
        blocks = (rows || []).map((row: any) => ({
          name: row.product_name || 'Produk',
          changes: triggersFor(row),
        })).filter((b: Block) => b.changes.length)
        if (!blocks.length) continue
      }

      const title = task === 'weekly'
        ? 'Ringkasan mingguan Favorit Aku'
        : 'Ada perubahan di favorit kamu'
      const intro = task === 'weekly'
        ? 'Angka dari listing_weekly (disetarakan 7 hari). Terukur = diukur dari scrape.'
        : 'Perubahan sejak scrape harian terakhir pada produk yang kamu favoritkan.'

      for (const channel of channels) {
        if (channel === 'email' && !u.email_ok) continue
        if (channel === 'whatsapp') {
          if (!u.notify_wa_number) continue
          if (!WA_ALERTS_READY) {
            skippedWa++
            continue
          }
        }

        const scope = task === 'weekly' ? 'weekly' : 'product'
        const claimKey = task === 'weekly' ? 'weekly' : 'digest'
        if (!opts.dry_run && !opts.force) {
          const { data: claimed } = await db.rpc('tracker_notify_claim', {
            p_user_id: u.user_id, p_scope: scope, p_entity_key: claimKey,
            p_channel: channel, p_data_day: claimDay,
          })
          if (!claimed) continue
        }

        plan.push({ user_id: u.user_id, channel, products: blocks.length, task })
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
              subject: title,
              html: emailHtml(title, intro, blocks, unsubUrl, emptyNote),
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
            body: JSON.stringify({ target, message: waText(title, blocks, emptyNote) }),
          })
          ok = res.ok
          if (!ok) detail = `${res.status} ${await res.text().catch(() => '')}`
        }

        if (ok) sent++
        else errors.push(`${u.user_id}/${channel}: ${detail}`)

        await db.rpc('tracker_notify_mark', {
          p_user_id: u.user_id, p_scope: scope, p_entity_key: claimKey,
          p_channel: channel, p_data_day: claimDay,
          p_status: ok ? 'sent' : 'failed', p_detail: detail || null,
        })

        await new Promise(r => setTimeout(r, 600))
      }
    } catch (e) {
      errors.push(`${u.user_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return new Response(JSON.stringify({
    sent, audience: wanted.length, data_day: claimDay, task,
    skipped_wa: skippedWa, wa_ready: WA_ALERTS_READY,
    dry_run: !!opts.dry_run, plan, errors,
  }), { headers: { 'Content-Type': 'application/json' } })
})
