// Monday email for saved search criteria. Notices are inserted by
// notify_saved_criteria(); this function only emails users who opted into email.
// WhatsApp is skipped while FONNTE_DEVICE_READY is not true.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'
const WA_ALERTS_READY = (Deno.env.get('FONNTE_DEVICE_READY') || 'false') === 'true'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } })
  }
  const db = createClient(
    Deno.env.get('SUPABASE_URL') || PUBLIC_API,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { persistSession: false } },
  )
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY') || ''
  const { data: rows, error } = await db.rpc('criteria_notify_audience')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let sent = 0
  let skippedWa = 0
  const errors: string[] = []
  for (const r of rows || []) {
    const channels: string[] = r.notify_channels || ['email']
    if (channels.includes('whatsapp') && !WA_ALERTS_READY) skippedWa++
    if (!channels.includes('email')) continue
    if (!r.email_ok || !r.email) continue
    if (!RESEND_KEY) { errors.push('RESEND_API_KEY missing'); break }
    const name = r.name || r.query || 'pencarian tersimpan'
    const n = r.n || 0
    const html = `<p>${n} produk baru cocok kriteria “${name}”.</p>
      <p>Angka dari scrape terbaru — bukan janji penjualanmu. Buka <a href="${SITE}">LarisID</a>.</p>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: r.email,
        subject: `${n} produk baru untuk “${name}”`,
        html,
      }),
    })
    if (res.ok) sent++
    else errors.push(`${r.user_id}: ${res.status}`)
  }
  return new Response(JSON.stringify({ sent, skipped_wa: skippedWa, errors }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
