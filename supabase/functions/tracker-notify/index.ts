// tracker-notify — idle-decay warnings and pause application.
//
// Invoked daily by pg_cron job `tracker-idle-decay` with the service-role
// bearer, same pattern as weekly-digest / daily-feedback-report.
//
// Two steps, in this order:
//   1. WARN   users idle >= 11 days that their tracking pauses in 3 days.
//   2. PAUSE  users idle >= 14 days.
// Warning first matters: a user warned today must not also be paused today.
// The 11/14 split guarantees that, but the ordering makes it true even if the
// job is skipped for a few days and both sets overlap on the catch-up run.
//
// The warning is the product. "Your tracking pauses in 3 days" is loss aversion
// on something the user configured themselves, which outperforms any generic
// re-engagement nudge. A send failure must therefore NOT mark the user warned —
// otherwise they lose their only notice before the pause.
//
// Body: { "task": "idle_decay", "dry_run": true?, "test_to": "a@b"? }
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const SITE = 'https://larisid.com'

serve(async (req) => {
  // Service-role only. verify_jwt=on means the platform already validated the
  // signature; we additionally require the service_role claim so a user JWT can
  // never trigger a send. NB: do NOT string-compare against the edge runtime's
  // SUPABASE_SERVICE_ROLE_KEY — that value differs from the legacy JWT the
  // crons actually send.
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
  if (!RESEND_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500 })
  }

  let opts: { task?: string; dry_run?: boolean; test_to?: string } = {}
  try { opts = await req.json() } catch (_) { /* empty body = real run */ }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Warnings ───────────────────────────────────────────────────────────
  const { data: pending, error: pErr } = await db.rpc('tracker_pending_warnings')
  if (pErr) {
    return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  }

  const plan: any[] = []
  let sent = 0
  let failed = 0

  for (const row of pending || []) {
    const { data: userRes } = await db.auth.admin.getUserById(row.user_id)
    const email = userRes?.user?.email
    if (!email) continue

    const days = Math.max(0, 14 - (row.days_idle ?? 0))
    const n = row.keyword_count ?? 0
    const subject = `Pantauan ${n} kata kunci kamu berhenti dalam ${days} hari`
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6">
        <p>Halo,</p>
        <p>Kami masih mengumpulkan data setiap pagi untuk <strong>${n} kata kunci</strong>
           yang kamu pantau. Tapi kamu belum membukanya selama
           ${row.days_idle} hari.</p>
        <p>Supaya tidak boros, pantauan harian akan <strong>berhenti otomatis dalam
           ${days} hari</strong>. Pengaturan dan data kamu tetap tersimpan &mdash;
           begitu kamu buka lagi, pantauan langsung jalan kembali.</p>
        <p><a href="${SITE}/#tracker"
              style="display:inline-block;padding:10px 18px;background:#111;color:#fff;
                     text-decoration:none;border-radius:8px">Lihat data saya</a></p>
        <p style="color:#666;font-size:13px">Balas STOP kalau tidak ingin menerima email ini.</p>
      </div>`

    plan.push({ user_id: row.user_id, email, days_idle: row.days_idle, pauses_in: days })
    if (opts.dry_run) continue

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: opts.test_to || email,
          subject,
          html,
        }),
      })
      if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)

      // Only mark warned AFTER a confirmed send. A failure here means the user
      // is picked up again tomorrow rather than silently losing their notice.
      // Skip the mark on test_to runs so a test never consumes a real warning.
      if (!opts.test_to) await db.rpc('tracker_mark_warned', { p_user_id: row.user_id })
      sent++
    } catch (e) {
      failed++
      console.error(`tracker-notify: warn failed for ${row.user_id}: ${e}`)
    }

    await new Promise(r => setTimeout(r, 600)) // Resend caps at 2 req/s
  }

  // ── 2. Pauses ─────────────────────────────────────────────────────────────
  let paused: unknown = null
  if (!opts.dry_run) {
    const { data: pauseRes, error: pauseErr } = await db.rpc('tracker_apply_pauses')
    if (pauseErr) console.error(`tracker-notify: pause failed: ${pauseErr.message}`)
    paused = pauseRes
  }

  return new Response(JSON.stringify({
    dry_run: !!opts.dry_run,
    warned_planned: plan.length,
    warned_sent: sent,
    warned_failed: failed,
    plan: opts.dry_run ? plan : undefined,
    paused,
  }), { headers: { 'Content-Type': 'application/json' } })
})
