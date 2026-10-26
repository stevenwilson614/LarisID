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

/** OTP.ID wants digits only, e.g. 62812… */
function toOtpIdDestination(e164: string): string {
  return e164.replace(/^\+/, '')
}

function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return hexEncode(new Uint8Array(buf))
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return hexEncode(arr)
}

// Phone OTP via OTP.ID SMS (instant; no Sender ID paperwork).
// Slug stays send-whatsapp-otp so Kong limits / client URLs need no cutover.
const SMS_OTP_ENABLED = true

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!SMS_OTP_ENABLED) {
    return new Response(
      JSON.stringify({ error: 'Login SMS sementara tidak tersedia. Gunakan Google atau Email.' }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }

  try {
    const body = await req.json()
    const phone = normalisePhone((body.phone || '').trim())

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Nomor telepon tidak valid. Contoh: 08123456789' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Rate limit: max 3 OTP requests per phone per hour
    const { data: recentCount } = await supabase.rpc('whatsapp_otp_recent_count', { p_phone: phone })
    if (Number(recentCount ?? 0) >= 3) {
      return new Response(
        JSON.stringify({ error: 'Terlalu banyak permintaan OTP. Coba lagi dalam 1 jam.' }),
        { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    await supabase.rpc('cleanup_whatsapp_otps')

    const digits = new Uint32Array(1)
    crypto.getRandomValues(digits)
    const otp = String(digits[0] % 1000000).padStart(6, '0')

    const salt = randomHex(16)
    const otpHash = await sha256Hex(otp + salt)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: insertErr } = await supabase
      .from('whatsapp_otps')
      .insert({ phone, otp_hash: otpHash, salt, expires_at: expiresAt })

    if (insertErr) throw insertErr

    const apiKey = Deno.env.get('OTP_ID_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Layanan OTP belum dikonfigurasi. Hubungi admin.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // We generate + hash the code ourselves; OTP.ID only delivers SMS.
    const otpIdRes = await fetch('https://api.otp.id/v3/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'sms',
        destination: toOtpIdDestination(phone),
        otp,
        brand: Deno.env.get('OTP_ID_BRAND') || 'LarisID',
        ttl: 600,
      }),
    })

    const otpIdText = await otpIdRes.text()
    let otpIdJson: {
      success?: boolean
      data?: { status?: string; failure?: { code?: string; message?: string } }
      error?: { code?: string; message?: string }
    } = {}
    try { otpIdJson = JSON.parse(otpIdText) } catch { /* non-JSON */ }

    const delivered = otpIdJson.success === true
      && (otpIdJson.data?.status === 'sent' || otpIdJson.data?.status === 'success')

    if (!otpIdRes.ok || !delivered) {
      console.error('OTP.ID SMS error:', otpIdRes.status, otpIdText)
      await supabase
        .from('whatsapp_otps')
        .delete()
        .eq('phone', phone)
        .eq('otp_hash', otpHash)
        .eq('used', false)

      const code = String(otpIdJson.error?.code || otpIdJson.data?.failure?.code || '')
      let msg = otpIdJson.data?.failure?.message
        || otpIdJson.error?.message
        || 'Gagal mengirim OTP via SMS. Periksa nomor kamu.'
      if (otpIdRes.status === 402 || code === 'INSUFFICIENT_BALANCE') {
        msg = 'SMS lagi gangguan. Pakai Google atau email dulu, atau coba lagi nanti.'
      } else if (code === 'DESTINATION_RATE_LIMITED' || otpIdRes.status === 429) {
        msg = 'Terlalu banyak permintaan OTP. Coba lagi sebentar.'
      }
      return new Response(
        JSON.stringify({ error: msg }),
        { status: otpIdRes.status === 429 ? 429 : 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, phone }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('send-whatsapp-otp error:', err)
    return new Response(
      JSON.stringify({ error: 'Terjadi kesalahan. Coba lagi.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
