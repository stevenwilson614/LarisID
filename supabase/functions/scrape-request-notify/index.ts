// Tells people their requested keyword is now measured.
//
// Pairs with request_scrape_keywords(): a user asks for a keyword, it goes
// into scrape_keywords at sla_days=1, the next daily lane scrapes it, and
// fulfill_scrape_requests() flips the row to 'ready' once it actually appears
// in product_types_v. This function is the WhatsApp half of telling them.
//
// The in-app card is deliberately NOT driven from here — js/gpt-app.js checks
// for ready rows itself on load. So a Fonnte outage costs the WhatsApp, never
// the message: the user still hears about it next time they visit.
//
// Idempotency is the row itself: notified_at is stamped on success, and only
// rows with notify_wa set and notified_at null are ever picked up. A failed
// send leaves the row alone so the next run retries it.
//
// WhatsApp only goes out when FONNTE_DEVICE_READY=true. A skipped send is
// counted and reported, never quietly rewritten into some other channel.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE = 'https://larisid.com'
const WA_READY = (Deno.env.get('FONNTE_DEVICE_READY') || 'false') === 'true'

function waText(keyword: string): string {
  return [
    `Halo! Kamu pernah minta LarisID mengukur "${keyword}".`,
    '',
    'Datanya sudah siap sekarang — jumlah toko, harga median, dan omset pasarnya sudah bisa dilihat.',
    '',
    `Buka di sini: ${SITE}`,
    '',
    'Steven, LarisID',
  ].join('\n')
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

  let opts: { dry_run?: boolean; test_wa?: string; limit?: number } = {}
  try { opts = await req.json() } catch (_) { /* empty body = real run */ }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const FONNTE_TOKEN = Deno.env.get('FONNTE_API_TOKEN')

  // Mark anything whose data has landed since the last run. Cheap, and it
  // means a missed cron tick self-heals instead of stranding requests.
  const { data: flipped, error: fErr } = await db.rpc('fulfill_scrape_requests')
  if (fErr) return new Response(JSON.stringify({ error: fErr.message }), { status: 500 })

  const { data: rows, error } = await db
    .from('keyword_scrape_requests')
    .select('id,user_id,keyword,notify_wa')
    .eq('status', 'ready')
    .not('notify_wa', 'is', null)
    .is('notified_at', null)
    .order('fulfilled_at', { ascending: true })
    .limit(Math.min(opts.limit || 100, 200))
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const pending = rows || []
  const errors: string[] = []
  let sent = 0
  let skipped = 0

  for (const r of pending) {
    const target = String(opts.test_wa || r.notify_wa || '').replace('+', '').trim()
    if (!target) { skipped++; continue }
    if (opts.dry_run) { skipped++; continue }
    if (!WA_READY) { skipped++; continue }
    if (!FONNTE_TOKEN) { errors.push(`${r.id}: FONNTE_API_TOKEN missing`); continue }

    try {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message: waText(r.keyword) }),
      })
      if (!res.ok) {
        errors.push(`${r.id}: ${res.status} ${await res.text().catch(() => '')}`)
        continue
      }
      // Only notified_at here. card_shown_at stays null so the in-app card
      // still greets them — the WhatsApp is a nudge, the card is the link.
      await db.from('keyword_scrape_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', r.id)
      sent++
    } catch (e) {
      errors.push(`${r.id}: ${String(e)}`)
    }
    await new Promise(res => setTimeout(res, 600))
  }

  return new Response(JSON.stringify({
    flipped_to_ready: flipped ?? 0,
    candidates: pending.length,
    sent, skipped, wa_ready: WA_READY,
    errors: errors.slice(0, 20),
  }), { headers: { 'Content-Type': 'application/json' } })
})
