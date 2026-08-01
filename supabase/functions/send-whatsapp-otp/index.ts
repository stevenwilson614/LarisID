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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

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

    // Cleanup stale rows opportunistically
    await supabase.rpc('cleanup_whatsapp_otps')

    // Generate 6-digit OTP
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

    // Send via Fonnte (target uses 628xx without the + prefix)
    const fonnteToken = Deno.env.get('FONNTE_API_TOKEN')
    if (!fonnteToken) {
      return new Response(
        JSON.stringify({ error: 'Layanan OTP belum dikonfigurasi. Hubungi admin.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }
    const message = `Kode OTP LarisID kamu: *${otp}*\n\nBerlaku 10 menit. Jangan bagikan ke siapapun.`

    const fonnteRes = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': fonnteToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target: phone.replace('+', ''),
        message,
      }),
    })

    if (!fonnteRes.ok) {
      const body = await fonnteRes.text()
      console.error('Fonnte error:', fonnteRes.status, body)
      // Do not count failed provider deliveries toward rate limits.
      await supabase
        .from('whatsapp_otps')
        .delete()
        .eq('phone', phone)
        .eq('otp_hash', otpHash)
        .eq('used', false)
      return new Response(
        JSON.stringify({ error: 'Gagal mengirim OTP ke WhatsApp. Periksa nomor kamu.' }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } }
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
