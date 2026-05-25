import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_EMAIL = 'stevenwilson614@gmail.com'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    // Verify caller is authenticated and is platform admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the calling user is admin
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
    }

    const { segment, subject, body, specific_email, attachment } = await req.json()
    if (!segment || !subject || !body) {
      return new Response(JSON.stringify({ error: 'Missing segment, subject, or body' }), { status: 400, headers: CORS })
    }

    let targets: string[] = []

    if (segment === 'specific') {
      if (!specific_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(specific_email)) {
        return new Response(JSON.stringify({ error: 'Invalid or missing specific_email' }), { status: 400, headers: CORS })
      }
      targets = [specific_email.toLowerCase().trim()]
    } else {
      // Fetch emails by segment using the admin_user_directory view
      const { data: users, error: usersErr } = await supabase.rpc('admin_user_directory')
      if (usersErr) throw usersErr

      if (segment === 'all') {
        targets = (users || []).map((u: any) => u.email).filter(Boolean)
      } else if (segment === 'leaders') {
        targets = (users || []).filter((u: any) => u.app_role === 'leader').map((u: any) => u.email).filter(Boolean)
      } else if (segment === 'students') {
        targets = (users || [])
          .filter((u: any) => u.app_role === 'student' && (u.cohort_count || 0) > 0)
          .map((u: any) => u.email).filter(Boolean)
      } else if (segment === 'independents') {
        targets = (users || [])
          .filter((u: any) => u.app_role === 'student' && (u.cohort_count || 0) === 0)
          .map((u: any) => u.email).filter(Boolean)
      }
    }

    if (!targets.length) {
      return new Response(JSON.stringify({ sent: 0, failed: [], note: 'No recipients in this segment' }), { headers: CORS })
    }

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
    const failed: string[] = []
    let sent = 0

    // Send in batches of 50 to stay within Resend rate limits
    const BATCH = 50
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH)
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map(email => {
          const msg: any = {
            from: 'LarisID <noreply@larisid.com>',
            to: email,
            subject,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#1A1F3C;padding:20px 24px;border-radius:10px 10px 0 0;">
                <span style="color:#fff;font-weight:800;font-size:1.1rem;">LarisID</span>
              </div>
              <div style="padding:24px;background:#fff;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 10px 10px;">
                ${body.replace(/\n/g, '<br>')}
                <hr style="margin:24px 0;border:none;border-top:1px solid #E5E7EB;">
                <p style="font-size:12px;color:#9CA3AF;margin:0;">
                  Kamu menerima email ini karena terdaftar di <a href="https://larisid.com" style="color:#E8442A;">larisid.com</a>.
                </p>
              </div>
            </div>`,
          }
          if (attachment?.filename && attachment?.content) {
            msg.attachments = [{ filename: attachment.filename, content: attachment.content }]
          }
          return msg
        })),
      })

      if (res.ok) {
        sent += batch.length
      } else {
        const errBody = await res.json().catch(() => ({}))
        console.error('Resend batch error:', errBody)
        failed.push(...batch)
      }
    }

    return new Response(JSON.stringify({ sent, failed, total_targets: targets.length }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('send-broadcast error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
