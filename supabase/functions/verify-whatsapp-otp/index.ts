import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalisePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, '')
  if (/^\+62\d{8,13}$/.test(s)) return s
  if (/^628\d{7,12}$/.test(s)) return '+' + s
  if (/^08\d{7,12}$/.test(s)) return '+62' + s.slice(1)
  if (/^8\d{7,12}$/.test(s)) return '+62' + s   // user typed 8xx after the +62 prefix shown in UI
  return null
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const phone = normalisePhone((body.phone || '').trim())
    const otpInput: string = (body.otp || '').trim()

    if (!phone || !/^\d{6}$/.test(otpInput)) {
      return new Response(
        JSON.stringify({ error: 'Nomor atau OTP tidak valid.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ error: 'Konfigurasi server OTP belum lengkap.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // Fetch the most recent valid, unused, unexpired OTP row for this phone
    const { data: rows, error: fetchErr } = await supabase
      .from('whatsapp_otps')
      .select('id, otp_hash, salt, expires_at, attempts')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchErr) throw fetchErr

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'OTP tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const row = rows[0]
    if ((Number(row.attempts) || 0) >= 5) {
      await supabase.from('whatsapp_otps').update({ used: true }).eq('id', row.id)
      return new Response(
        JSON.stringify({ error: 'Terlalu banyak percobaan. Minta kode baru.' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const expectedHash = await sha256Hex(otpInput + row.salt)

    if (expectedHash !== row.otp_hash) {
      await supabase.from('whatsapp_otps').update({ attempts: (Number(row.attempts) || 0) + 1 }).eq('id', row.id)
      return new Response(
        JSON.stringify({ error: 'Kode OTP salah. Periksa pesan WhatsApp kamu.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Mark OTP as used immediately to prevent replay attacks
    const { error: markUsedErr } = await supabase.from('whatsapp_otps').update({ used: true }).eq('id', row.id)
    if (markUsedErr) throw markUsedErr

    // Synthetic email identity for this phone number
    const syntheticEmail = `${phone.replace('+', '')}@wa.larisid.com`

    // Try to create the user — if already exists, look up their ID
    let isNew = false
    const createResult = await supabase.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      phone: phone,
      phone_confirm: true,
      user_metadata: {
        provider: 'whatsapp',
        phone_number: phone,
      },
    })

    if (createResult.error) {
      const msg = createResult.error.message || ''
      if (!msg.includes('already been registered') && !msg.includes('already exists') && !msg.includes('duplicate')) {
        throw createResult.error
      }
      // User already exists — look up via helper function
      const { data: existingId, error: lookupErr } = await supabase
        .rpc('get_user_id_by_email', { p_email: syntheticEmail })
      if (lookupErr || !existingId) throw lookupErr || new Error('Cannot resolve existing user')
    } else {
      isNew = true
    }

    // Generate a one-use magic link and exchange it for a real session
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
    })
    if (linkErr || !linkData) throw linkErr || new Error('generateLink failed')

    // Exchange the hashed token for access+refresh tokens.
    // Prefer POST /verify (JSON body). GET+redirect:manual used to fail every
    // login: GoTrue returns 302 with tokens in Location#hash, and Response.ok
    // is false for 3xx — so we treated a successful exchange as failure.
    const props = linkData.properties || ({} as { action_link?: string; hashed_token?: string })
    const actionLink = props.action_link || ''
    let hashedToken = props.hashed_token || ''
    if (!hashedToken && actionLink) {
      const actionUrl = new URL(actionLink)
      hashedToken = actionUrl.searchParams.get('token')
        || actionUrl.searchParams.get('token_hash')
        || ''
    }
    if (!hashedToken) throw new Error('Magic link token missing')

    let access_token: string | null = null
    let refresh_token: string | null = null
    let expires_in: string | null = null

    const postRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
    })
    if (postRes.ok) {
      const body = await postRes.json().catch(() => ({} as Record<string, unknown>))
      access_token = (body.access_token as string) || null
      refresh_token = (body.refresh_token as string) || null
      expires_in = body.expires_in != null ? String(body.expires_in) : '3600'
    } else {
      const getRes = await fetch(
        `${supabaseUrl}/auth/v1/verify?token=${encodeURIComponent(hashedToken)}&type=magiclink`,
        { method: 'GET', headers: { apikey: anonKey }, redirect: 'manual' }
      )
      const location = getRes.headers.get('location') || ''
      const hashPart = location.includes('#') ? location.split('#')[1] : ''
      const params = new URLSearchParams(hashPart)
      access_token = params.get('access_token')
      refresh_token = params.get('refresh_token')
      expires_in = params.get('expires_in')
      // Do NOT require getRes.ok — 302 with tokens in Location is success.
      if (!access_token) {
        console.error('Token exchange failed. POST status:', postRes.status, 'GET status:', getRes.status, 'Location:', location)
      }
    }

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: 'Gagal membuat sesi. Coba lagi.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        is_new_user: isNew,
        session: {
          access_token,
          refresh_token,
          expires_in: Number(expires_in || 3600),
          user: linkData.user,
        },
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('verify-whatsapp-otp error:', err)
    return new Response(
      JSON.stringify({ error: 'Terjadi kesalahan. Coba lagi.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
