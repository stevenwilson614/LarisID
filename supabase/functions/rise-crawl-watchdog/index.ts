// Afternoon crawl-dead alert for LARISE shop_crawl.
// Invoked by pg_cron (07:00 UTC = 14:00 WIB) with the service-role bearer.
// If <80% of linked Shopee shops have a same-day ok snapshot, ping ops via Fonnte.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function digits(raw: string): string {
  return String(raw || '').replace(/[^0-9]/g, '')
}

function waTarget(phone: string): string | null {
  let d = digits(phone)
  if (!d) return null
  if (d.startsWith('0')) d = '62' + d.slice(1)
  if (d.startsWith('8')) d = '62' + d
  if (!d.startsWith('62') || d.length < 10) return null
  return d
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const { data: cov, error: covErr } = await supabase.rpc('ssis_shop_crawl_coverage')
    if (covErr) throw covErr
    const coverage = cov || {}
    if (!coverage.alert) {
      return new Response(JSON.stringify({ ok: true, alert: false, coverage }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const FONNTE_TOKEN = Deno.env.get('FONNTE_API_TOKEN')
    if (!FONNTE_TOKEN) {
      console.error('rise-crawl-watchdog: FONNTE_API_TOKEN missing')
      return new Response(JSON.stringify({ error: 'FONNTE_API_TOKEN missing', coverage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const envPhones = String(Deno.env.get('RISE_OPS_WA') || '')
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const { data: rpcPhones } = await supabase.rpc('ssis_ops_wa_targets')
    const fromRpc = (Array.isArray(rpcPhones) ? rpcPhones : [])
      .map((r: { phone?: string }) => r.phone)
      .filter(Boolean)

    const seen = new Set<string>()
    const targets: string[] = []
    for (const raw of [...envPhones, ...fromRpc]) {
      const t = waTarget(String(raw))
      if (t && !seen.has(t)) {
        seen.add(t)
        targets.push(t)
      }
    }

    const pct = coverage.pct != null ? coverage.pct : '?'
    const message =
      `LarisRise crawl-dead: ${coverage.ok_today || 0}/${coverage.linked_shopee || 0} ` +
      `toko Shopee terukur hari ini (${pct}%). Ambang 80%. ` +
      `Rerun: cd ~/shopee_scraper && python3 crawl_student_shops.py`

    let sent = 0
    const failed: string[] = []
    for (const target of targets) {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message }),
      })
      if (res.ok) sent++
      else failed.push(target)
    }

    return new Response(
      JSON.stringify({ ok: true, alert: true, coverage, sent, failed: failed.length }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('rise-crawl-watchdog', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
