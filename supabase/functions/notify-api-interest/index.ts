// Email Steven once when a signed-in user says they want the public API.
// The row must already exist (api_submit_interest). notified_at makes a
// second call a no-op, including a refresh.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const TO_EMAIL = 'stevenwilson614@gmail.com'

const PLATFORM: Record<string, string> = {
  sheets: 'Google Sheets / Excel',
  app: 'App sendiri',
  bot: 'Bot WhatsApp / Telegram',
  zapier: 'Zapier / Make',
  warehouse: 'Database / warehouse',
  other: 'Lainnya',
}
const USE: Record<string, string> = {
  search: 'Cari keyword / listing',
  omset: 'Omset & tren',
  deepdive: 'Deep Dive',
  alert: 'Alert otomatis',
  export: 'Export bulk',
  other: 'Lainnya',
}

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function labels(map: Record<string, string>, ids: unknown) {
  const list = Array.isArray(ids) ? ids : []
  const text = list.map((id) => map[String(id)] || String(id)).filter(Boolean)
  return text.length ? text.join(', ') : '—'
}

function tokoLabel(status: string | null, store: string | null) {
  if (status === 'existing' || store) {
    return store ? `Sudah punya toko · ${store}` : 'Sudah punya toko'
  }
  if (status === 'first_time') return 'Belum punya toko'
  return 'Belum diisi'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!)
    const { data: { user }, error: authErr } = await anon.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: row, error: rowErr } = await db
      .from('api_interests')
      .select('user_id, interested, platforms, use_cases, other_note, display_name, email, whatsapp, notified_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (rowErr) return json({ error: rowErr.message }, 500)
    if (!row?.interested) return json({ ok: true, skipped: 'not_interested' })
    if (row.notified_at) return json({ ok: true, skipped: 'already' })

    const claimedAt = new Date().toISOString()
    const { data: claimed, error: claimErr } = await db
      .from('api_interests')
      .update({ notified_at: claimedAt })
      .eq('user_id', user.id)
      .eq('interested', true)
      .is('notified_at', null)
      .select('user_id')
      .maybeSingle()
    if (claimErr) return json({ error: claimErr.message }, 500)
    if (!claimed) return json({ ok: true, skipped: 'already' })

    const [{ data: profile }, { data: prefs }] = await Promise.all([
      db.from('user_profiles')
        .select('city, seller_status, shopee_store_name, display_name, wa_number, contact_email')
        .eq('user_id', user.id)
        .maybeSingle(),
      db.from('user_onboarding_prefs')
        .select('region, seller_status')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    const name = profile?.display_name || row.display_name || 'Pengguna'
    const city = profile?.city || prefs?.region || '—'
    const seller = prefs?.seller_status || profile?.seller_status || null
    const store = profile?.shopee_store_name || null
    const wa = row.whatsapp || profile?.wa_number || '—'
    const email = row.email || profile?.contact_email || user.email || '—'
    const note = row.other_note || '—'

    const key = Deno.env.get('RESEND_API_KEY')
    if (!key) {
      await db.from('api_interests').update({ notified_at: null }).eq('user_id', user.id).eq('notified_at', claimedAt)
      return json({ error: 'RESEND_API_KEY missing' }, 500)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: TO_EMAIL,
        subject: `[API] ${name} tertarik API`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;">
            <h2 style="color:#1A1F3C;margin-bottom:4px;">Ada yang tertarik API</h2>
            <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">LarisID · ${esc(new Date().toLocaleString('id-ID'))}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;width:120px;">Nama</td><td>${esc(name)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">WhatsApp</td><td>${esc(wa)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Email</td><td>${esc(email)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Kota</td><td>${esc(city)}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Toko</td><td>${esc(tokoLabel(seller, store))}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Platform</td><td>${esc(labels(PLATFORM, row.platforms))}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Kebutuhan</td><td>${esc(labels(USE, row.use_cases))}</td></tr>
              <tr><td style="padding:6px 0;font-weight:700;color:#374151;">Catatan</td><td>${esc(note)}</td></tr>
            </table>
            <p style="margin-top:18px;font-size:12px;color:#9CA3AF;">Daftar lengkap ada di Admin → Minat API.</p>
          </div>
        `,
      }),
    })
    if (!res.ok) {
      await db.from('api_interests').update({ notified_at: null }).eq('user_id', user.id).eq('notified_at', claimedAt)
      return json({ error: `resend ${res.status}` }, 502)
    }
    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
