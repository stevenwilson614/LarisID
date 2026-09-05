// One-off feedback ask for repeat Deep Dive users (Sep 2026).
// Audience: feedback_repeat_audience() — 2+ sign-in sessions + ≥1 deepdive_open.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
const FROM_EMAIL = Deno.env.get('WINBACK_FROM_EMAIL') || 'Steven dari Laris <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const CAMPAIGN = 'feedback_repeat_2026_09'

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

function renderHtml(nama: string): string {
  const hello = nama ? `Hey ${esc(nama)},` : 'Hey,'
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5EFE0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:24px auto;padding:28px 24px;background:#fff;border-radius:12px;border:1px solid #E8DFD0;color:#1A1A1A;font-size:15px;line-height:1.6;">
<p style="margin:0 0 14px;">${hello}</p>
<p style="margin:0 0 14px;">Ini Steven. Makasih udah pakai Laris — semoga membantu ya buat riset produkmu.</p>
<p style="margin:0 0 14px;">Karena kamu udah beberapa kali balik ke sini, aku pengen nanya: ada nggak yang menurut kamu masih kurang, atau fitur/data yang pengen banget ditambahin?</p>
<p style="margin:0 0 14px;">Makasih banget kalau mau kasih masukan!</p>
<p style="margin:0 0 14px;">Kalau lebih gampang, bisa langsung WA ke <a href="https://wa.me/16147533043" style="color:#B5202A;">+1 614-753-3043</a> atau DM IG <a href="https://instagram.com/bule_barat" style="color:#B5202A;">@bule_barat</a>.</p>
<p style="margin:18px 0 0;">— Steven</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #F0E6D8;">
<p style="margin:0;font-size:12px;color:#9CA3AF;">Kamu nerima email ini karena pernah daftar di <a href="${SITE}" style="color:#9CA3AF;">larisid.com</a>. Balas aja kalau mau opt-out dari email seperti ini.</p>
</div>
</body>
</html>`
}

function renderText(nama: string): string {
  const hello = nama ? `Hey ${nama},` : 'Hey,'
  return `${hello}

Ini Steven. Makasih udah pakai Laris — semoga membantu ya buat riset produkmu.

Karena kamu udah beberapa kali balik ke sini, aku pengen nanya: ada nggak yang menurut kamu masih kurang, atau fitur/data yang pengen banget ditambahin?

Makasih banget kalau mau kasih masukan!

Kalau lebih gampang, bisa langsung WA ke +1 614-753-3043 atau DM IG @bule_barat.

— Steven

—
Kamu nerima email ini karena pernah daftar di larisid.com. Balas aja kalau mau opt-out dari email seperti ini.
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

    type AudienceRow = {
      user_id: string
      email: string
      display_name: string
      sessions: number
      suppressed: boolean
      already_sent: boolean
    }

    let audience: AudienceRow[] | null = null
    if (role === 'service_role') {
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/feedback_repeat_audience`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!res.ok) throw new Error(`feedback_repeat_audience: ${res.status} ${await res.text()}`)
      audience = await res.json()
    } else {
      const userClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader! } } },
      )
      const { data, error: audErr } = await userClient.rpc('feedback_repeat_audience')
      if (audErr) throw audErr
      audience = data as AudienceRow[] | null
    }

    let rows = ((audience as Array<{
      user_id: string
      email: string
      display_name: string
      sessions: number
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

    const plan: { email: string; nama: string; sessions: number }[] = []
    const failed: { email: string; error: string }[] = []
    let sent = 0
    const subject = 'Mau nanya sedikit soal Laris'

    for (const r of rows) {
      const email = r.email
      try {
        const nama = nameForGreeting(r.display_name)

        if (opts.dry_run) {
          plan.push({ email, nama, sessions: r.sessions })
          continue
        }

        const html = renderHtml(nama)
        const text = renderText(nama)

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
            tags: [{ name: 'campaign', value: CAMPAIGN }],
          }),
        })
        const resBody = await res.json().catch(() => ({}))
        if (res.ok && resBody?.id) {
          sent++
          if (!opts.test_to) {
            await supabaseAdmin.from('email_sends').insert({
              id: crypto.randomUUID(),
              user_id: r.user_id,
              email,
              campaign: CAMPAIGN,
              resend_id: resBody.id,
              status: 'sent',
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
    console.error('send-feedback-repeat error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})
