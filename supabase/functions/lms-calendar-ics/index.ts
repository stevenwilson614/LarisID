// Read-only iCalendar feed for one LMS mentor's class schedule.
// Google Calendar and Apple Calendar subscribe with the URL; they cannot send
// a Supabase JWT. Auth is the unguessable calendar_token on the mentor row.
// The feed is session title, time, place, and meet link only — no curriculum
// and no student names.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/

function icsEscape(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

function foldLine(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let idx = 0
  parts.push(line.slice(0, 75))
  idx = 75
  while (idx < line.length) {
    parts.push(' ' + line.slice(idx, idx + 74))
    idx += 74
  }
  return parts.join('\r\n')
}

function tokenOk(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function utcStamp(value: string | number | Date): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    const url = new URL(req.url)
    const mentorId = url.searchParams.get('mentor') || ''
    const slug = (url.searchParams.get('slug') || '').toLowerCase()
    const token = url.searchParams.get('token') || ''
    if (!UUID_RE.test(token)) {
      return new Response('Missing or invalid token', { status: 400, headers: CORS })
    }
    if (!mentorId && !slug) {
      return new Response('Missing mentor or slug', { status: 400, headers: CORS })
    }
    if (mentorId && !UUID_RE.test(mentorId)) {
      return new Response('Missing or invalid mentor', { status: 400, headers: CORS })
    }
    if (slug && !SLUG_RE.test(slug)) {
      return new Response('Missing or invalid slug', { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let query = supabase
      .from('lms_accounts')
      .select('user_id, org_name, display_name, calendar_token')
      .eq('role', 'mentor')
    query = mentorId ? query.eq('user_id', mentorId) : query.eq('org_slug', slug)

    const { data: mentor, error: mentorErr } = await query.maybeSingle()
    if (mentorErr) throw mentorErr
    if (!mentor || !mentor.calendar_token || !tokenOk(String(mentor.calendar_token), token)) {
      return new Response('Forbidden', { status: 403, headers: CORS })
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: sessions, error: sessErr } = await supabase
      .from('lms_sessions')
      .select('id, title, starts_at, mins, meet_url, location, notes')
      .eq('mentor_id', mentor.user_id)
      .gte('starts_at', since)
      .order('starts_at', { ascending: true })
      .limit(200)

    if (sessErr) throw sessErr

    const calName = (mentor.org_name || mentor.display_name || 'Kelas') + ' · Jadwal'
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LarisID//LMS Calendar//ID',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape(calName)}`,
      'X-WR-TIMEZONE:Asia/Jakarta',
    ]

    const dtstamp = utcStamp(new Date())
    for (const s of sessions || []) {
      const start = utcStamp(s.starts_at)
      if (!start) continue
      const mins = Math.max(15, Math.min(480, Number(s.mins) || 60))
      const end = utcStamp(new Date(s.starts_at).getTime() + mins * 60 * 1000)
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${s.id}@larisid-lms`)
      lines.push(`DTSTAMP:${dtstamp}`)
      lines.push(`DTSTART:${start}`)
      lines.push(`DTEND:${end}`)
      lines.push(`SUMMARY:${icsEscape(s.title || 'Sesi kelas')}`)
      const desc = [s.notes, s.meet_url ? 'Meet: ' + s.meet_url : ''].filter(Boolean).join('\n\n')
      if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`)
      if (s.location) lines.push(`LOCATION:${icsEscape(s.location)}`)
      if (s.meet_url) lines.push(`URL:${icsEscape(s.meet_url)}`)
      lines.push('END:VEVENT')
    }

    lines.push('END:VCALENDAR')
    const body = lines.map(foldLine).join('\r\n') + '\r\n'

    return new Response(body, {
      headers: {
        ...CORS,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="jadwal-lms.ics"',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err) {
    console.error('lms-calendar-ics error:', err)
    return new Response('Internal error', { status: 500, headers: CORS })
  }
})
