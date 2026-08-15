// HUT RI ke-81 — Deep Dive Search unlimited, 16–17 Agustus 2026.
//
// Invoked by pg_cron job `send-merdeka-2026` at 16 Aug 01:00 UTC (08:00 WIB)
// with the service-role bearer (same pattern as weekly-digest). Platform admin
// may also call it for dry_run / test_to. Sends via Resend.
//
// Audience: every auth.users email that has ever signed up, minus
// email_suppressions, minus addresses already logged in email_sends for
// campaign merdeka_2026. Copy promises the search/chat cap lift only — AI
// points stay metered.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
const FROM_EMAIL = Deno.env.get('WINBACK_FROM_EMAIL') || 'Steven dari Laris <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const CAMPAIGN = 'merdeka_2026'
const CTA = `${SITE}/?utm_source=email&utm_campaign=${CAMPAIGN}`
const MASCOT = `${SITE}/images/brand/mascot-merdeka-email.jpg`
const LOGO = `${SITE}/images/brand/logo-horizontal-red.png`

const WINDOW_START = Date.parse('2026-08-16T01:00:00.000Z') // 08:00 WIB
const WINDOW_END = Date.parse('2026-08-17T17:00:00.000Z')   // 00:00 18 Aug WIB

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

function jwtRole(authHeader: string | null): string {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role || ''
  } catch {
    return ''
  }
}

function nameForGreeting(displayName: string): string {
  if (!displayName) return ''
  const first = displayName.trim().split(/\s+/u)[0]
  if (!first) return ''
  if (first.length < 3) return ''
  if (/\d/.test(first)) return ''
  if (!/^[A-Za-z'.-]+$/.test(first)) return ''
  if (/channel|chanel|official|store|shop|olshop/i.test(displayName)) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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

function renderHtml(nama: string, linkCta: string, linkUnsub: string, pixelUrl?: string): string {
  const hello = nama ? `Halo ${esc(nama)},` : 'Halo,'
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Deep Dive Search tanpa batas</title>
</head>
<body style="margin:0;padding:0;background:#F5EFE0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E8DFD0;">
      <tr>
        <td style="height:10px;background:#B5202A;background-image:repeating-linear-gradient(90deg,#B5202A 0 20px,#FFFFFF 20px 40px);"></td>
      </tr>
      <tr>
        <td style="padding:22px 24px 8px;text-align:center;">
          <img src="${LOGO}" width="140" alt="Laris" style="display:inline-block;border:0;outline:none;height:auto;">
        </td>
      </tr>
      <tr>
        <td style="padding:4px 24px 0;text-align:center;font-family:Georgia,'Times New Roman',serif;">
          <p style="margin:0;color:#B5202A;font-size:28px;line-height:1.15;font-weight:700;">Semangat Kemerdekaan!</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 28px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1A1A1A;">
          <p style="margin:0 0 14px;">${hello}</p>
          <p style="margin:0 0 14px;">Rayakan HUT RI ke-81 bersama Laris. Mulai <strong>Minggu, 16 Agustus 08.00 WIB</strong> sampai <strong>Senin, 17 Agustus 23.59 WIB</strong>, jatah Deep Dive Search 10 per hari dilonggarkan.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#B5202A;border-radius:12px;">
            <tr>
              <td style="padding:18px 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#FFFFFF;">
                <p style="margin:0 0 10px;font-size:13px;line-height:1.45;">Minggu 16 Agustus <strong>08.00</strong> WIB &nbsp;–&nbsp; Senin 17 Agustus <strong>23.59</strong> WIB</p>
                <p style="margin:0 auto 10px;display:inline-block;background:#C9974B;color:#1A1A1A;font-weight:800;letter-spacing:.04em;font-size:16px;padding:8px 18px;border-radius:8px;">TANPA BATAS</p>
                <p style="margin:8px 0 0;font-size:16px;">Deep Dive Search <strong>unlimited</strong></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 24px 0;text-align:center;">
          <img src="${MASCOT}" width="180" alt="" style="display:inline-block;border:0;outline:none;height:auto;max-width:180px;">
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1A1A1A;">
          <p style="margin:0 0 14px;">Cari dan bedah produk sebanyak yang kamu mau selama jendela itu. Setelah Senin malam, jatah harian kembali seperti biasa. Poin AI tetap ada batasnya — yang dilonggarkan hanya Deep Dive Search.</p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:4px 24px 22px;">
          <a href="${esc(linkCta)}" style="background:#B5202A;color:#FFFFFF;text-decoration:none;display:inline-block;padding:13px 22px;border-radius:10px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;">Siap, cari produk terbaik</a>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9CA3AF;border-top:1px solid #F0E6D8;">
          <p style="margin:14px 0 0;">Kamu menerima email ini karena pernah daftar di <a href="${SITE}" style="color:#9CA3AF;">larisid.com</a>.<br>
          <a href="${esc(linkUnsub)}" style="color:#9CA3AF;">Berhenti terima email</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
${pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;">` : ''}
</body>
</html>`
}

function renderText(nama: string, linkCta: string, linkUnsub: string): string {
  const hello = nama ? `Halo ${nama},` : 'Halo,'
  return `${hello}

Rayakan HUT RI ke-81 bersama Laris.

Mulai Minggu, 16 Agustus 08.00 WIB sampai Senin, 17 Agustus 23.59 WIB, jatah Deep Dive Search 10 per hari dilonggarkan. Kamu bisa cari dan bedah produk sebanyak yang kamu mau — tanpa batas.

Yang dilonggarkan hanya Deep Dive Search. Poin AI tetap ada batasnya. Setelah Senin malam, jatah harian kembali seperti biasa.

Buka Laris: ${linkCta}

—
Kamu menerima email ini karena pernah daftar di larisid.com.
Berhenti terima email: ${linkUnsub}
`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    const role = jwtRole(authHeader)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let isAdmin = role === 'service_role'
    if (!isAdmin) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
      }
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      )
      const { data: { user }, error: authErr } = await anonClient.auth.getUser(
        authHeader.replace(/^Bearer\s+/i, ''),
      )
      if (authErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: JSON_HEADERS })
      }
      isAdmin = true
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: JSON_HEADERS })
    }

    let opts: { dry_run?: boolean; test_to?: string; max_sends?: number } = {}
    try { opts = await req.json() } catch { /* empty body = real run */ }

    const now = Date.now()
    if (!opts.dry_run && !opts.test_to && (now < WINDOW_START - 15 * 60 * 1000 || now > WINDOW_END)) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'outside_window', campaign: CAMPAIGN }),
        { headers: JSON_HEADERS },
      )
    }

    const callerClient = role === 'service_role'
      ? supabaseAdmin
      : createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_ANON_KEY')!,
          { global: { headers: { Authorization: authHeader! } } },
        )

    const { data: audience, error: audErr } = await callerClient.rpc('merdeka_audience')
    if (audErr) throw audErr

    let rows = ((audience as Array<{
      user_id: string
      email: string
      display_name: string
      suppressed: boolean
      already_sent: boolean
    }>) || []).filter((r) => r.email && !r.suppressed && !r.already_sent)

    if (typeof opts.max_sends === 'number' && opts.max_sends > 0) {
      rows = rows.slice(0, opts.max_sends)
    }

    if (!rows.length) {
      return new Response(
        JSON.stringify({ campaign: CAMPAIGN, sent: 0, failed: [], total_targets: 0, note: 'No recipients after filtering' }),
        { headers: JSON_HEADERS },
      )
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY && !opts.dry_run) throw new Error('RESEND_API_KEY not set')

    const plan: { email: string; nama: string }[] = []
    const failed: { email: string; error: string }[] = []
    let sent = 0
    const subject = 'Deep Dive Search tanpa batas — 16 & 17 Agustus'

    for (const r of rows) {
      const email = r.email
      try {
        const nama = nameForGreeting(r.display_name)
        const linkUnsub = `${PUBLIC_API}/functions/v1/email-unsubscribe?t=${encodeURIComponent(await unsubToken(email))}`
        const sendId = crypto.randomUUID()
        const pixelUrl = (!opts.dry_run && !opts.test_to)
          ? `${PUBLIC_API}/functions/v1/email-pixel?s=${sendId}`
          : undefined
        const html = renderHtml(nama, CTA, linkUnsub, pixelUrl)
        const text = renderText(nama, CTA, linkUnsub)

        if (opts.dry_run) {
          plan.push({ email, nama })
          continue
        }

        const to = opts.test_to || email
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM_EMAIL,
            reply_to: ADMIN_EMAIL,
            to,
            subject: opts.test_to ? `[TEST utk ${email}] ${subject}` : subject,
            html,
            text,
            headers: {
              'List-Unsubscribe': `<${linkUnsub}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            tags: [{ name: 'campaign', value: CAMPAIGN }],
          }),
        })
        const resBody = await res.json().catch(() => ({}))
        if (res.ok && resBody?.id) {
          sent++
          if (!opts.test_to) {
            await supabaseAdmin.from('email_sends').insert({
              id: sendId, user_id: r.user_id, email, campaign: CAMPAIGN, resend_id: resBody.id, status: 'sent',
            })
          }
        } else {
          failed.push({ email, error: resBody?.message || resBody?.name || JSON.stringify(resBody) })
        }
        await new Promise((resolve) => setTimeout(resolve, 600))
      } catch (e) {
        failed.push({ email: email || '', error: e instanceof Error ? e.message : String(e) })
      }
    }

    if (opts.dry_run) {
      return new Response(
        JSON.stringify({ dry_run: true, campaign: CAMPAIGN, count: plan.length, recipients: plan }),
        { headers: JSON_HEADERS },
      )
    }
    return new Response(
      JSON.stringify({ campaign: CAMPAIGN, sent, failed, total_targets: rows.length, from: FROM_EMAIL }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error('send-merdeka error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})
