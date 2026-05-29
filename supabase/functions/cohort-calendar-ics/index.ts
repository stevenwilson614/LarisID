// WS-A: Read-only iCalendar (ICS) feed for a cohort's class schedule.
// A cohort member subscribes in Google Calendar via "Other calendars → From URL"
// using webcal://.../cohort-calendar-ics?cohort=<id>&token=<calendar_token>.
// Auth is the unguessable per-cohort calendar_token (calendar clients can't send
// Authorization headers), verified server-side with the service-role key. The feed
// exposes nothing beyond what cohort members already see in the planner.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Escape a text value per RFC 5545 (commas, semicolons, backslashes, newlines).
function icsEscape(value: string): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

// Fold long content lines to <=75 octets per RFC 5545 (continuation = CRLF + space).
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

// "2026-05-30" -> "20260530"
function dateCompact(d: string): string {
  return d.replace(/-/g, '')
}

// "09:00" or "09:00:00" -> "090000"
function timeCompact(t: string): string {
  const [h = '00', m = '00', s = '00'] = String(t).split(':')
  return `${h.padStart(2, '0')}${m.padStart(2, '0')}${s.padStart(2, '0')}`
}

// Add minutes to a "HH:MM[:SS]" wall-clock time, rolling the date forward if needed.
// Returns { date: "YYYYMMDD", time: "HHMMSS" }.
function addMinutes(dateStr: string, timeStr: string, minutes: number) {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const [h = 0, mi = 0, s = 0] = String(timeStr).split(':').map(Number)
  const base = new Date(Date.UTC(y, mo - 1, da, h, mi, s))
  base.setUTCMinutes(base.getUTCMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${base.getUTCFullYear()}${pad(base.getUTCMonth() + 1)}${pad(base.getUTCDate())}`,
    time: `${pad(base.getUTCHours())}${pad(base.getUTCMinutes())}${pad(base.getUTCSeconds())}`,
  }
}

function nextDayCompact(dateStr: string): string {
  const [y, mo, da] = dateStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1, da))
  d.setUTCDate(d.getUTCDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    const url = new URL(req.url)
    const cohortId = url.searchParams.get('cohort')
    const token = url.searchParams.get('token')
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!cohortId || !token || !uuidRe.test(cohortId) || !uuidRe.test(token)) {
      return new Response('Missing or invalid cohort/token', { status: 400, headers: CORS })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: cohort, error: cohortErr } = await supabase
      .from('cohorts')
      .select('id,name,calendar_token')
      .eq('id', cohortId)
      .maybeSingle()

    if (cohortErr) throw cohortErr
    if (!cohort || !cohort.calendar_token || cohort.calendar_token !== token) {
      return new Response('Forbidden', { status: 403, headers: CORS })
    }

    const today = new Date().toISOString().split('T')[0]
    const { data: sessions, error: sessErr } = await supabase
      .from('cohort_sessions')
      .select('id,title,session_date,notes,document_urls,start_time,end_time,timezone,location,meet_url')
      .eq('cohort_id', cohortId)
      .gte('session_date', today)
      .order('session_date', { ascending: true })
      .limit(100)

    if (sessErr) throw sessErr

    const pad = (n: number) => String(n).padStart(2, '0')
    const now = new Date()
    const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
      `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`

    const calName = cohort.name || 'Kalender Kohort'
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LarisID//Cohort Calendar//ID',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape(calName)}`,
      'X-WR-TIMEZONE:Asia/Jakarta',
    ]

    for (const s of sessions || []) {
      const tz = s.timezone || 'Asia/Jakarta'
      const dateStr: string = s.session_date
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:${s.id}@larisid`)
      lines.push(`DTSTAMP:${dtstamp}`)

      if (s.start_time) {
        const startTime = timeCompact(s.start_time)
        lines.push(`DTSTART;TZID=${tz}:${dateCompact(dateStr)}T${startTime}`)
        if (s.end_time) {
          lines.push(`DTEND;TZID=${tz}:${dateCompact(dateStr)}T${timeCompact(s.end_time)}`)
        } else {
          // No explicit end: default to a one-hour block.
          const end = addMinutes(dateStr, s.start_time, 60)
          lines.push(`DTEND;TZID=${tz}:${end.date}T${end.time}`)
        }
      } else {
        // All-day event: DATE value, DTEND is the (exclusive) next day.
        lines.push(`DTSTART;VALUE=DATE:${dateCompact(dateStr)}`)
        lines.push(`DTEND;VALUE=DATE:${nextDayCompact(dateStr)}`)
      }

      lines.push(`SUMMARY:${icsEscape(s.title || 'Sesi')}`)

      const descParts: string[] = []
      if (s.notes) descParts.push(s.notes)
      const docs = (s.document_urls || []).filter(Boolean)
      if (docs.length) descParts.push('Dokumen:\n' + docs.join('\n'))
      if (descParts.length) {
        lines.push(`DESCRIPTION:${icsEscape(descParts.join('\n\n'))}`)
      }

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
        'Content-Disposition': 'inline; filename="larisid-cohort.ics"',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err) {
    console.error('cohort-calendar-ics error:', err)
    return new Response('Internal error', { status: 500, headers: CORS })
  }
})
