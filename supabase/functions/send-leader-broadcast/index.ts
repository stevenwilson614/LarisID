import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const REPLY_TO   = 'stevenwilson614@gmail.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    // Verify the calling user's JWT
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    // User-scoped client so security-definer RPCs have auth.uid() set correctly
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // Must be leader or admin
    const { data: role, error: roleErr } = await userClient.rpc('current_app_role')
    if (roleErr || (role !== 'leader' && role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
    }

    const { cohort_id, segment, subject, body, specific_email, group_id, attachment } =
      await req.json()

    if (!cohort_id || !segment || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: cohort_id, segment, subject, body' }),
        { status: 400, headers: CORS },
      )
    }

    let targets: string[] = []

    if (segment === 'specific') {
      if (!specific_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(specific_email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid or missing specific_email' }),
          { status: 400, headers: CORS },
        )
      }
      targets = [specific_email.toLowerCase().trim()]

    } else if (segment === 'all_cohort') {
      const { data: students, error } = await userClient.rpc('cohort_student_directory', {
        p_cohort: cohort_id,
      })
      if (error) throw error
      targets = (students || [])
        .filter((s: any) => s.status === 'active')
        .map((s: any) => s.email)
        .filter(Boolean)

    } else if (segment === 'custom_group') {
      if (!group_id) {
        return new Response(
          JSON.stringify({ error: 'Missing group_id for custom_group segment' }),
          { status: 400, headers: CORS },
        )
      }
      const { data: members, error } = await userClient.rpc('leader_get_email_group_members', {
        p_group: group_id,
      })
      if (error) throw error
      targets = (members || []).map((m: any) => m.email).filter(Boolean)

    } else {
      return new Response(
        JSON.stringify({ error: `Unknown segment: ${segment}` }),
        { status: 400, headers: CORS },
      )
    }

    if (!targets.length) {
      return new Response(
        JSON.stringify({ sent: 0, failed: [], note: 'No recipients in this segment' }),
        { headers: CORS },
      )
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
    const failed: string[]     = []
    const failReasons: string[] = []
    const resendIds: string[]  = []
    let sent = 0

    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#1A1F3C;padding:20px 24px;border-radius:10px 10px 0 0;">
        <span style="color:#fff;font-weight:800;font-size:1.1rem;">LarisID</span>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 10px 10px;">
        ${escapeHtml(body).replace(/\n/g, '<br>')}
        <hr style="margin:24px 0;border:none;border-top:1px solid #E5E7EB;">
        <p style="font-size:12px;color:#9CA3AF;margin:0;">
          Kamu menerima email ini karena terdaftar di <a href="https://larisid.com" style="color:#E8442A;">larisid.com</a>.
        </p>
      </div>
    </div>`

    const baseMsg = {
      from:     FROM_EMAIL,
      reply_to: REPLY_TO,
      subject,
      html:     htmlBody,
      text:     body,
    }

    if (targets.length === 1) {
      const msg: any = { ...baseMsg, to: targets[0] }
      if (attachment?.filename && attachment?.content) {
        msg.attachments = [{ filename: attachment.filename, content: attachment.content }]
      }
      const res = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(msg),
      })
      const rb = await res.json().catch(() => ({}))
      if (res.ok && rb?.id) {
        sent = 1
        resendIds.push(rb.id)
      } else {
        console.error('Resend single error:', res.status, rb)
        failed.push(targets[0])
        failReasons.push(rb.message || rb.name || JSON.stringify(rb))
      }
    } else {
      const BATCH = 50
      for (let i = 0; i < targets.length; i += BATCH) {
        const batch = targets.slice(i, i + BATCH)
        const res = await fetch('https://api.resend.com/emails/batch', {
          method:  'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(batch.map(email => {
            const msg: any = { ...baseMsg, to: email }
            if (attachment?.filename && attachment?.content) {
              msg.attachments = [{ filename: attachment.filename, content: attachment.content }]
            }
            return msg
          })),
        })
        const rb = await res.json().catch(() => ({}))
        if (res.ok && Array.isArray(rb?.data)) {
          sent += rb.data.length
          for (const row of rb.data) {
            if (row?.id) resendIds.push(row.id)
          }
          if (Array.isArray(rb.errors)) {
            for (const err of rb.errors) {
              const email = batch[err.index]
              if (email) {
                failed.push(email)
                failReasons.push(err.message || 'Batch validation failed')
              }
            }
          }
        } else {
          console.error('Resend batch error:', res.status, rb)
          failed.push(...batch)
          failReasons.push(rb.message || rb.name || JSON.stringify(rb))
        }
      }
    }

    return new Response(
      JSON.stringify({
        sent,
        failed,
        fail_reasons:   failReasons,
        total_targets:  targets.length,
        recipients:     targets,
        from:           FROM_EMAIL,
        resend_ids:     resendIds,
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('send-leader-broadcast error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: CORS,
    })
  }
})
