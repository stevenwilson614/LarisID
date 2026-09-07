import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const SITE = 'https://larisid.com'
const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
const STAFF_FALLBACK = ['stevenwilson614@gmail.com', 'afryannp@gmail.com']

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function threadUrl(id: string) {
  return `${SITE}/?komunitas=${encodeURIComponent(id)}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const isService = !!serviceKey && token === serviceKey

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceKey,
    )

    if (!isService) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      }
      const anon = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      )
      const { data: { user }, error: authErr } = await anon.auth.getUser(token)
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
      }
      const { data: appRole } = await anon.rpc('current_app_role')
      const isAdmin = appRole === 'admin' || (user.email || '').toLowerCase() === ADMIN_EMAIL
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
      }
    }

    const body = await req.json().catch(() => ({}))
    const includeWeekly = body?.task === 'weekly' || body?.include_weekly === true
    const includeInvites = body?.task === 'weekly' || body?.include_invites === true

    const { data: payload, error: payloadErr } = await db.rpc('komunitas_staff_digest_payload')
    if (payloadErr || !payload) {
      return new Response(JSON.stringify({ error: payloadErr?.message || 'payload failed' }), {
        status: 500,
        headers: CORS,
      })
    }

    const unanswered = Array.isArray(payload.unanswered) ? payload.unanswered : []
    const draft = payload.weekly_draft || null
    const invites = Array.isArray(payload.invites) ? payload.invites : []

    if (!unanswered.length && !includeWeekly && !includeInvites) {
      return new Response(JSON.stringify({ ok: true, skipped: 'empty' }), { headers: CORS })
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500, headers: CORS })
    }

    const recipients = new Set<string>(STAFF_FALLBACK.map((e) => e.toLowerCase()))
    const { data: roleRows } = await db
      .from('app_role_assignments')
      .select('email, role')
      .in('role', ['admin', 'leader'])
    for (const row of roleRows || []) {
      if (row.email) recipients.add(String(row.email).toLowerCase())
    }

    const unansweredHtml = unanswered.length
      ? `<p><strong>${unanswered.length} pertanyaan</strong> sudah 48 jam tanpa jawaban non-staf. Tunggu dulu kalau masih ada seller yang bisa jawab; kalau kosong, balas dan tanya lanjutan.</p>
         <ul>${unanswered.map((row: { id: string; title: string; hours_old: number }) =>
           `<li><a href="${threadUrl(row.id)}">${escapeHtml(row.title)}</a> (${escapeHtml(String(row.hours_old))} jam)</li>`).join('')}</ul>`
      : '<p>Tidak ada pertanyaan yang lewat 48 jam tanpa jawaban non-staf.</p>'

    const weeklyHtml = includeWeekly && draft?.keyword
      ? `<p><strong>Draft thread data minggu ini</strong> (perkiraan, jangan post mentah — tulis pertanyaannya): <em>${escapeHtml(draft.keyword)}</em> ~${escapeHtml(String(draft.wk_units ?? '—'))} unit/minggu.</p>`
      : ''

    const inviteHtml = includeInvites && invites.length
      ? `<p><strong>Calon diundang</strong> (tulis pesan sendiri, jangan blast):</p>
         <ul>${invites.slice(0, 20).map((row: { first_name: string; keyword: string }) =>
           `<li>${escapeHtml(row.first_name || 'Pengguna')} — keyword terakhir: ${escapeHtml(row.keyword || '—')}</li>`).join('')}</ul>`
      : ''

    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;line-height:1.6;color:#1A1F3C">
        <p>Halo tim,</p>
        ${unansweredHtml}
        ${weeklyHtml}
        ${inviteHtml}
        <p><a href="${SITE}/?komunitas=board&tab=diskusi" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">Buka Komunitas</a></p>
        <p style="color:#6B7280;font-size:13px">Jangan auto-post. Jangan jawab sebagai seller lain.</p>
      </div>`

    let sent = 0
    let failed = 0
    for (const email of recipients) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: email,
            subject: unanswered.length
              ? `Komunitas: ${unanswered.length} pertanyaan menunggu`
              : 'Komunitas: digest staf',
            html,
          }),
        })
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
        sent++
      } catch (e) {
        failed++
        console.error(`komunitas-staff-digest: send failed for ${email}: ${e}`)
      }
    }

    return new Response(JSON.stringify({
      ok: failed === 0,
      sent,
      failed,
      unanswered: unanswered.length,
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
