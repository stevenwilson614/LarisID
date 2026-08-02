// Self-hosted 1x1 open-tracking pixel, embedded in HTML win-back emails as
// <img src=".../email-pixel?s=<email_sends.id>">. Deliberately not Resend's
// native open tracking -- that requires a verified DNS tracking subdomain
// (a Namecheap panel change), which this avoids entirely.
//
// Standard, universal limitation of ALL pixel-based open tracking, not unique
// to this implementation: mail clients that block remote images by default
// never fetch it, so opens are undercounted; Apple Mail Privacy Protection
// pre-fetches every pixel regardless of whether the user opened the mail, so
// Apple Mail recipients look artificially "opened". Directionally useful,
// not a precise instrument.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function gifBytes(): Uint8Array {
  const raw = atob(GIF_BASE64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

const PIXEL = gifBytes()

serve(async (req) => {
  // Always returned, on every code path below, regardless of outcome -- a
  // broken pixel request must never look like anything other than a normal
  // image to the mail client.
  const pixelResponse = () =>
    new Response(PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Content-Length': String(PIXEL.length),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    })

  try {
    const url = new URL(req.url)
    const s = url.searchParams.get('s')
    if (!s || !UUID_RE.test(s)) return pixelResponse()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const ua = req.headers.get('User-Agent') ?? null
    const xForwarded = req.headers.get('X-Forwarded-For') ?? ''
    const ip = xForwarded.split(',')[0]?.trim() || null

    try {
      await supabaseAdmin.from('email_events').insert({
        email_send_id: s,
        event_type: 'opened',
        occurred_at: new Date().toISOString(),
        meta: { user_agent: ua, ip },
      })
    } catch (dbErr) {
      console.error('email-pixel insert error:', dbErr)
    }
  } catch (err) {
    console.error('email-pixel top error:', err)
  }

  return pixelResponse()
})
