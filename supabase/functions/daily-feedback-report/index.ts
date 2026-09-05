import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low', 'personal']
const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high:     '#EA580C',
  medium:   '#D97706',
  low:      '#6B7280',
  personal: '#9CA3AF',
}
const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
  personal: 'Personal',
}
const ACTION_LABEL: Record<string, string> = {
  'fix-now':    'Fix Now',
  'investigate':'Investigate',
  'monitor':    'Monitor',
  'note-only':  'Note Only',
}

function jwtRole(req: Request): string {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role || ''
  } catch {
    return ''
  }
}

serve(async (req) => {
  if (jwtRole(req) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: items, error } = await supabase
      .from('feedback')
      .select('*')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`fetch failed: ${error.message}`)
    if (!items?.length) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no feedback in last 24h' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    // Group by priority
    const grouped: Record<string, typeof items> = {}
    for (const item of items) {
      const p = item.ai_priority ?? 'unanalyzed'
      if (!grouped[p]) grouped[p] = []
      grouped[p].push(item)
    }

    const total = items.length
    const actionable = (grouped['critical']?.length ?? 0) + (grouped['high']?.length ?? 0)

    // Build email HTML
    const subject = actionable > 0
      ? `[LarisID] ${actionable} item${actionable > 1 ? 's' : ''} need attention — ${total} feedback today`
      : `[LarisID] Daily Feedback — ${total} item${total > 1 ? 's' : ''}, nothing critical`

    const prioritySections = PRIORITY_ORDER
      .filter(p => grouped[p]?.length)
      .map(p => {
        const color = PRIORITY_COLOR[p]
        const label = PRIORITY_LABEL[p]
        const rows = grouped[p].map(item => {
          const ctx = item.element_context as { element?: string; section?: string } | null
          const element = ctx?.element ? `${ctx.element}${ctx.section ? ' · ' + ctx.section : ''}` : '—'
          const action = ACTION_LABEL[item.ai_action ?? ''] ?? item.ai_action ?? '—'
          return `
            <tr style="border-bottom:1px solid #F3F4F6;">
              <td style="padding:10px 8px;font-size:13px;color:#374151;vertical-align:top;max-width:200px;">${item.message || '(no message)'}</td>
              <td style="padding:10px 8px;font-size:12px;color:#E8442A;vertical-align:top;white-space:nowrap;">${element}</td>
              <td style="padding:10px 8px;font-size:12px;color:#6B7280;vertical-align:top;white-space:nowrap;">${item.user_email || 'anon'}</td>
              <td style="padding:10px 8px;font-size:12px;font-weight:600;color:${color};vertical-align:top;white-space:nowrap;">${action}</td>
            </tr>
            ${item.ai_notes ? `<tr style="border-bottom:1px solid #E5E7EB;background:#F9FAFB;"><td colspan="4" style="padding:6px 8px 10px;font-size:12px;color:#6B7280;font-style:italic;">${item.ai_notes}</td></tr>` : ''}
          `
        }).join('')

        return `
          <div style="margin-bottom:24px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:3px;">${label.toUpperCase()}</span>
              <span style="font-size:13px;color:#6B7280;">${grouped[p].length} item${grouped[p].length > 1 ? 's' : ''}</span>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #E5E7EB;border-radius:4px;overflow:hidden;">
              <thead>
                <tr style="background:#F9FAFB;">
                  <th style="padding:8px;text-align:left;font-size:11px;color:#9CA3AF;font-weight:600;">Message</th>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#9CA3AF;font-weight:600;">Element</th>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#9CA3AF;font-weight:600;">User</th>
                  <th style="padding:8px;text-align:left;font-size:11px;color:#9CA3AF;font-weight:600;">Action</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `
      }).join('')

    const unanalyzed = grouped['unanalyzed']
    const unanalyzedNote = unanalyzed?.length
      ? `<p style="font-size:12px;color:#9CA3AF;margin:0 0 16px;">${unanalyzed.length} item${unanalyzed.length > 1 ? 's' : ''} not yet analyzed (analysis runs every 3 hours).</p>`
      : ''

    const html = `
      <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
        <div style="background:#1A1F3C;padding:20px 24px;border-radius:6px 6px 0 0;">
          <h1 style="margin:0;font-size:18px;color:#fff;">LarisID · Daily Feedback Report</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#9CA3AF;">${new Date().toLocaleDateString('id-ID', { weekday:'long', year:'numeric', month:'long', day:'numeric' })} · ${total} feedback received</p>
        </div>
        <div style="padding:24px;background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 6px 6px;">
          ${actionable > 0
            ? `<div style="background:#FEF2F2;border-left:4px solid #DC2626;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#DC2626;">${actionable} item${actionable > 1 ? 's' : ''} require immediate attention</p>
               </div>`
            : `<div style="background:#F0FDF4;border-left:4px solid #16A34A;padding:12px 16px;margin-bottom:20px;border-radius:0 4px 4px 0;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#16A34A;">No critical or high priority issues today</p>
               </div>`
          }
          ${unanalyzedNote}
          ${prioritySections}
          <p style="margin-top:24px;font-size:12px;color:#9CA3AF;border-top:1px solid #F3F4F6;padding-top:16px;">
            View all feedback at <a href="https://larisid.com/#admin" style="color:#E8442A;">Admin View → Masukan Pengguna</a>
          </p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>',
        to: 'stevenwilson614@gmail.com',
        subject,
        html,
      }),
    })

    const resBody = await res.json()
    return new Response(
      JSON.stringify({ ok: res.ok, total, actionable, resend: resBody }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('daily-feedback-report: fatal', msg)
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
