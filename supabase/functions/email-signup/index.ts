import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function isAlreadyRegistered(msg: string) {
  const m = (msg || '').toLowerCase()
  return m.includes('already been registered')
    || m.includes('already registered')
    || m.includes('already exists')
    || m.includes('duplicate')
    || m.includes('user already')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const fullName = String(body.full_name || body.name || '').trim()

    if (!email || !EMAIL_RE.test(email)) {
      return json(400, { error: 'Format email tidak valid.' })
    }
    if (password.length < 6) {
      return json(400, { error: 'Password minimal 6 karakter.' })
    }
    if (password.length > 72) {
      return json(400, { error: 'Password terlalu panjang (maks. 72 karakter).' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    let isNew = true
    const meta = fullName ? { full_name: fullName } : {}

    const createResult = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    })

    if (createResult.error) {
      if (!isAlreadyRegistered(createResult.error.message || '')) {
        console.error('createUser failed', createResult.error)
        return json(400, { error: createResult.error.message || 'Daftar gagal. Coba lagi.' })
      }

      // Existing account — allow reclaim only if email was never confirmed
      // (abandoned confirm-email signups). Confirmed accounts must log in.
      const { data: existingId, error: lookupErr } = await admin
        .rpc('get_user_id_by_email', { p_email: email })
      if (lookupErr || !existingId) {
        console.error('lookup failed', lookupErr)
        return json(409, { error: 'Email sudah terdaftar. Coba masuk.' })
      }

      const { data: existingUser, error: getErr } = await admin.auth.admin.getUserById(existingId)
      if (getErr || !existingUser?.user) {
        console.error('getUserById failed', getErr)
        return json(409, { error: 'Email sudah terdaftar. Coba masuk.' })
      }

      if (existingUser.user.email_confirmed_at) {
        return json(409, { error: 'Email sudah terdaftar. Coba masuk.' })
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existingUser.user.user_metadata || {}),
          ...meta,
        },
      })
      if (updErr) {
        console.error('updateUserById failed', updErr)
        return json(400, { error: updErr.message || 'Daftar gagal. Coba lagi.' })
      }
      isNew = false
    }

    // Issue a real session via password grant (works for any email domain).
    const tokenRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })
    const session = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok || !session.access_token) {
      console.error('password grant failed', session)
      return json(500, {
        error: session.msg || session.error_description || session.error || 'Akun dibuat tapi login gagal. Coba masuk.',
      })
    }

    return json(200, {
      ok: true,
      is_new_user: isNew,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in || 3600,
      user: session.user,
    })
  } catch (e) {
    console.error('email-signup error', e)
    return json(500, { error: 'Terjadi kesalahan. Coba lagi.' })
  }
})
