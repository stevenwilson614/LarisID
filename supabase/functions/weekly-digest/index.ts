// Weekly digest email — "what moved on your tracked products this week".
//
// SUPERSEDED for new users by tracker-change-notify. This function's audience
// comes from user_tracked_products, whose write path went away with Site A at
// the 2026-08-10 cutover: the table took its last row on 2026-08-08 and cannot
// take another, so this reaches a fixed, shrinking set of legacy users (34 as
// of 2026-08-15) and can never reach a new one.
//
// It is kept running because those users still have real products with real
// history worth reporting. Anyone who picks a channel on the Pantauan page is
// EXCLUDED here and served by tracker-change-notify instead, so nobody gets
// both. When the legacy audience decays to zero, delete this function.
//
// Invoked weekly by pg_cron job `weekly-digest` with the service-role bearer,
// same pattern as daily-feedback-report. Sends via Resend (RESEND_API_KEY).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'

function fmtShort(n: number): string {
  n = Math.round(n || 0)
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' jt'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'rb'
  return String(n)
}

serve(async (req) => {
  // Service-role only (cron). verify_jwt=on means the platform has already
  // validated the signature — we additionally require the service_role claim
  // (an anon/user JWT must never trigger a send).
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  let role = ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    role = payload.role || ''
  } catch (_) { /* not a JWT */ }
  if (role !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_KEY) return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500 })

  // { dry_run: true }  → compose everything, send nothing, return the plan.
  // { test_to: "a@b" } → send every composed email to this address instead.
  let opts: { dry_run?: boolean; test_to?: string } = {}
  try { opts = await req.json() } catch (_) { /* empty body = real run */ }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 1. every tracked product, grouped by user (email alerts on by default)
  const { data: tracked, error: trkErr } = await db
    .from('user_tracked_products')
    .select('user_id,item_id,shop_id,product_name,keyword,price,alert_prefs')
  if (trkErr) return new Response(JSON.stringify({ error: trkErr.message }), { status: 500 })

  // Users who answered the notification question on the Pantauan page are
  // served by tracker-change-notify; sending both would double-mail them.
  const { data: optedIn } = await db
    .from('user_tracker_state')
    .select('user_id,notify_channels')
  const migrated = new Set(
    (optedIn || [])
      .filter(r => Array.isArray(r.notify_channels) && r.notify_channels.length > 0)
      .map(r => r.user_id)
  )

  const byUser: Record<string, any[]> = {}
  for (const t of tracked || []) {
    if (t.alert_prefs && t.alert_prefs.email === false) continue
    if (migrated.has(t.user_id)) continue
    ;(byUser[t.user_id] = byUser[t.user_id] || []).push(t)
  }
  const userIds = Object.keys(byUser)
  if (!userIds.length) return new Response(JSON.stringify({ sent: 0, reason: 'no tracked products' }))

  // 2. last two listing_weekly rows per tracked item (never raw total_sold deltas —
  // scrapes land 12–17 days apart; terlaris-minggu.md / listing-weekly.md forbid
  // presenting a two-snapshot delta as "minggu ini").
  const allIds = [...new Set((tracked || []).map(t => t.item_id).filter(Boolean))].slice(0, 200)
  const { data: weekRows } = await db
    .from('listing_weekly')
    .select('item_id,shop_id,week_start,units_wk,omset_wk,price,source')
    .in('item_id', allIds)
    .order('week_start', { ascending: false })
    .limit(800)
  const byItem: Record<string, any[]> = {}
  for (const r of weekRows || []) {
    const k = `${r.item_id}_${r.shop_id}`
    const arr = (byItem[k] = byItem[k] || [])
    if (arr.length < 2) arr.push(r)
  }

  // 3. this week's risers (shared across all emails)
  const { data: risers } = await db
    .from('mv_naik_daun')
    .select('product_name,keyword,price,sold_per_day')
    .order('sold_per_day', { ascending: false })
    .limit(3)

  const riserHtml = (risers && risers.length)
    ? `<h3 style="margin:22px 0 8px;font-size:15px;">Lagi naik daun minggu ini</h3>` + risers.map(r =>
        `<div style="padding:7px 0;border-bottom:1px solid #eee;font-size:13px;">${r.product_name || r.keyword}
         <span style="color:#6B7280;">— Rp ${fmtShort(r.price)} · ~${fmtShort(r.sold_per_day)}/hari (perkiraan)</span></div>`).join('')
    : ''

  // 4. compose + send per user
  let sent = 0
  const errors: string[] = []
  const plan: { email: string; products: number }[] = []
  for (const uid of userIds) {
    try {
      const { data: userRes } = await db.auth.admin.getUserById(uid)
      const email = userRes?.user?.email
      if (!email) continue

      const items = byUser[uid].map(t => {
        const pts = byItem[`${t.item_id}_${t.shop_id}`] || []
        const cur = pts[0]
        if (!cur) return null
        const prev = pts[1]
        const units = Number(cur.units_wk) || 0
        const label = String(cur.source || '') === 'measured' ? 'terukur' : 'perkiraan'
        const priceDelta = prev ? (Number(cur.price) || 0) - (Number(prev.price) || 0) : 0
        return {
          name: t.product_name || t.keyword || 'Produk',
          units,
          label,
          weekStart: cur.week_start,
          priceDelta,
        }
      }).filter(Boolean) as any[]

      if (!items.length) continue // nothing to report — do not send empty email
      items.sort((a, b) => b.units - a.units)

      const rowsHtml = items.slice(0, 8).map(it => {
        const bits = [`~${fmtShort(it.units)} unit/minggu <span style="color:#6B7280;">(${it.label})</span>`]
        if (Math.abs(it.priceDelta) >= 500) bits.push(`harga ${it.priceDelta > 0 ? 'naik' : 'turun'} Rp ${fmtShort(Math.abs(it.priceDelta))}`)
        return `<div style="padding:9px 0;border-bottom:1px solid #eee;font-size:13.5px;">${it.name}<br>${bits.join(' · ')}</div>`
      }).join('')

      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A;">
          <h2 style="font-size:17px;margin:18px 0 4px;">Minggu ini di produk yang kamu lacak</h2>
          <p style="font-size:13px;color:#6B7280;margin:0 0 14px;">Angka unit/minggu dari listing_weekly (disetarakan 7 hari). Terukur = diukur dari scrape; selain itu perkiraan. Bukan selisih dua snapshot mentah.</p>
          ${rowsHtml}
          ${riserHtml}
          <p style="margin:22px 0;"><a href="${SITE}" style="background:#B5202A;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:8px;display:inline-block;">Buka LarisID</a></p>
          <p style="font-size:11.5px;color:#9CA3AF;">Kamu menerima email ini karena melacak produk di LarisID. Balas dengan "STOP" untuk berhenti menerima ringkasan mingguan.</p>
        </div>`

      plan.push({ email, products: items.length })
      if (opts.dry_run) continue

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: opts.test_to || email,
          subject: 'Produk lacakanmu minggu ini — ringkasan LarisID' + (opts.test_to ? ` [TEST utk ${email}]` : ''),
          html,
        }),
      })
      if (res.ok) sent++
      else errors.push(`${uid}: ${res.status} ${await res.text().catch(() => '')}`)
      await new Promise(r => setTimeout(r, 600)) // Resend caps at 2 req/s
    } catch (e) {
      errors.push(`${uid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return new Response(JSON.stringify({ sent, audience: userIds.length, dry_run: !!opts.dry_run, test_to: opts.test_to || null, plan, errors }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
