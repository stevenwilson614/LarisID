// Mirror cohort announcements / session reminders to WhatsApp (Fonnte).
// Auth: caller's JWT must pass can_manage_cohort / is_platform_admin via RPCs.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await asUser.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const body = await req.json().catch(() => ({}))
    const cohortId = body?.cohort_id
    const kind = String(body?.kind || 'announcement')
    let text = String(body?.text || '').trim()
    if (!cohortId) {
      return new Response(JSON.stringify({ error: 'Missing cohort_id' }), { status: 400, headers: CORS })
    }

    const { data: can, error: canErr } = await asUser.rpc('can_manage_cohort', { p_cohort: cohortId })
    const { data: role } = await asUser.rpc('current_app_role')
    if (canErr || (can !== true && role !== 'admin')) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
    }

    const { data: cohort } = await asUser.from('cohorts').select('name,whatsapp_invite_url').eq('id', cohortId).maybeSingle()
    const cohortName = cohort?.name || 'kohort'

    if (kind === 'reminder' && !text) {
      const { data: next } = await asUser.from('cohort_sessions')
        .select('session_date,start_time,title,meet_url,notes')
        .eq('cohort_id', cohortId)
        .gte('session_date', new Date().toISOString().slice(0, 10))
        .order('session_date', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!next) {
        return new Response(JSON.stringify({ error: 'Tidak ada sesi berikutnya.' }), { status: 404, headers: CORS })
      }
      const when = [next.session_date, next.start_time ? String(next.start_time).slice(0, 5) : ''].filter(Boolean).join(' ')
      text = `Pengingat sesi *${cohortName}*\n${when}${next.title ? '\n' + next.title : ''}${next.meet_url ? '\n' + next.meet_url : ''}\n\nHadir ya — materinya bertahap.`
    } else if (!text) {
      text = `Pengumuman *${cohortName}* dari mentor.`
    }

    const { data: members, error: memErr } = await asUser.rpc('cohort_member_phones', { p_cohort: cohortId })
    if (memErr) throw memErr

    const FONNTE_TOKEN = Deno.env.get('FONNTE_API_TOKEN')
    if (!FONNTE_TOKEN) {
      return new Response(JSON.stringify({ error: 'FONNTE_API_TOKEN missing' }), { status: 500, headers: CORS })
    }

    let sent = 0
    const failed: string[] = []
    for (const row of members || []) {
      const target = waTarget(row.phone || '')
      if (!target) { failed.push(row.display_name || row.user_id); continue }
      const nama = String(row.display_name || '').split(' ')[0] || 'teman'
      const message = `Halo ${nama}!\n\n${text}\n\n— ${cohortName}`
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message }),
      })
      if (res.ok) sent++
      else failed.push(target)
    }

    return new Response(
      JSON.stringify({ ok: true, sent, failed: failed.length, skipped: failed }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('send-cohort-whatsapp', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
