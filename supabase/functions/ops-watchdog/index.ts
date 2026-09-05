// Hourly ops ping: scrape staleness, listing_weekly freshness, cron failures, AI spend.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtRole } from '../_shared/auth.ts'

function waTarget(phone: string): string | null {
  let d = String(phone || '').replace(/[^0-9]/g, '')
  if (!d) return null
  if (d.startsWith('0')) d = '62' + d.slice(1)
  if (d.startsWith('8')) d = '62' + d
  if (!d.startsWith('62') || d.length < 10) return null
  return d
}

serve(async (req) => {
  if (jwtRole(req) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const alerts: string[] = []

  const { data: scrape } = await db.from('listings').select('scraped_at').order('scraped_at', { ascending: false }).limit(1)
  const scrapedAt = scrape?.[0]?.scraped_at ? new Date(scrape[0].scraped_at) : null
  if (!scrapedAt || Date.now() - scrapedAt.getTime() > 20 * 864e5) {
    alerts.push(`listings.scraped_at stale: ${scrapedAt ? scrapedAt.toISOString() : 'none'}`)
  }

  const { data: week } = await db.from('listing_weekly').select('week_start').order('week_start', { ascending: false }).limit(1)
  const weekStart = week?.[0]?.week_start ? new Date(week[0].week_start) : null
  const thisMonday = new Date()
  const dow = thisMonday.getUTCDay() || 7
  thisMonday.setUTCDate(thisMonday.getUTCDate() - (dow - 1))
  thisMonday.setUTCHours(0, 0, 0, 0)
  if (!weekStart || weekStart < new Date(thisMonday.getTime() - 14 * 864e5)) {
    alerts.push(`listing_weekly.week_start stale: ${weekStart ? weekStart.toISOString().slice(0, 10) : 'none'}`)
  }

  const { count: aiCount } = await db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString())
  const aiThreshold = Number(Deno.env.get('AI_USAGE_ALERT_N') || 400)
  if ((aiCount || 0) > aiThreshold) alerts.push(`ai_usage last 24h = ${aiCount} (threshold ${aiThreshold})`)

  if (!alerts.length) {
    return new Response(JSON.stringify({ ok: true, alerts: [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  const token = Deno.env.get('FONNTE_API_TOKEN')
  const dest = waTarget(Deno.env.get('RISE_OPS_WA') || '')
  if (token && dest) {
    await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: dest, message: 'LarisID ops-watchdog\n' + alerts.join('\n') }),
    })
  }
  return new Response(JSON.stringify({ ok: true, alerts, sent: !!(token && dest) }), { headers: { 'Content-Type': 'application/json' } })
})
