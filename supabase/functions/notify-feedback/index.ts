import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { jwtRole } from '../_shared/auth.ts'

// Retired. Older clients still invoke this on insert. steven-auto-reply
// emails Steven once, with the message and the reply that was sent.
serve(async (req) => {
  try {
    const role = jwtRole(req)
    if (role !== 'service_role' && role !== 'authenticated') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true, skipped: 'replaced_by_steven_auto_reply' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
