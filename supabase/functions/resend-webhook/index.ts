// Receives Resend's delivery-lifecycle webhooks (sent/delivered/bounced/
// complained -- and, defensively, opened/clicked if ever enabled). Unauth'd
// at the platform-JWT level (listed in NO_VERIFY_JWT_FUNCTIONS); the Svix
// signature is the real security boundary.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

async function verifySvix(req: Request, body: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!secret || !svixId || !svixTimestamp || !svixSignature) return false

  // Basic replay-window check: reject anything more than 5 minutes stale.
  const nowSec = Math.floor(Date.now() / 1000)
  const ts = parseInt(svixTimestamp, 10)
  if (isNaN(ts) || Math.abs(ts - nowSec) > 300) return false

  const rawSecret = secret.replace(/^whsec_/, '')
  const binaryKey = atob(rawSecret)
  const keyBytes = new Uint8Array(binaryKey.length)
  for (let i = 0; i < binaryKey.length; i++) keyBytes[i] = binaryKey.charCodeAt(i)

  const signedContent = `${svixId}.${svixTimestamp}.${body}`
  const keyObj = await crypto.subtle.importKey(
    'raw', keyBytes.buffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signatureBuf = await crypto.subtle.sign('HMAC', keyObj, new TextEncoder().encode(signedContent))
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuf)))

  // svix-signature carries one or more space-separated "v1,<sig>" entries;
  // any match is valid (covers secret rotation with overlapping keys).
  for (const part of svixSignature.split(/\s+/)) {
    if (!part.startsWith('v1,')) continue
    if (timingSafeEqual(part.slice(3), expectedSignature)) return true
  }
  return false
}

const CORS_POST = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature',
      },
    })
  }

  // Raw text, read once, before any parsing -- the signature covers the exact
  // bytes Resend sent, not a round-tripped re-serialization.
  const rawBody = await req.text()

  const signatureValid = await verifySvix(req, rawBody).catch(() => false)
  if (!signatureValid) {
    return new Response(JSON.stringify({ error: 'Invalid signature or timestamp' }), { status: 401, headers: CORS_POST })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS_POST })
  }

  const type = payload.type as string | undefined
  if (!type || !type.startsWith('email.')) {
    // Resend may add event types later; unknown ones are ignored, not errors.
    return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: CORS_POST })
  }

  const eventType = type.slice('email.'.length)
  const data = (payload.data ?? {}) as Record<string, unknown>
  const emailId = data.email_id as string | undefined
  let matchedSendId: string | null = null

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (emailId) {
      const { data: sendRow, error: sendErr } = await supabaseAdmin
        .from('email_sends')
        .select('id,campaign')
        .eq('resend_id', emailId)
        .limit(1)
        .maybeSingle()

      if (sendErr) {
        console.error('resend-webhook lookup error:', sendErr)
      } else if (sendRow) {
        matchedSendId = sendRow.id as string
        const meta = (data.click ?? data.bounce ?? {}) as Record<string, unknown>
        await supabaseAdmin.from('email_events').insert({
          email_send_id: matchedSendId,
          resend_email_id: emailId,
          event_type: eventType,
          // Fall back to "now" rather than an empty string -- an empty string
          // is not a valid timestamptz and would silently drop the row.
          occurred_at: (data.created_at as string) || (payload.created_at as string) || new Date().toISOString(),
          meta,
        })
      }
    }

    // Runs regardless of whether a matching email_sends row was found: the
    // suppression is what protects sender reputation and must not depend on
    // the join succeeding.
    if (eventType === 'bounced' || eventType === 'complained') {
      const toArray = (data.to ?? []) as unknown[]
      const email = Array.isArray(toArray) && toArray.length > 0 ? String(toArray[0]) : null
      if (email) {
        await supabaseAdmin.from('email_suppressions').upsert(
          { email, reason: eventType === 'bounced' ? 'bounce' : 'complaint' },
          { onConflict: 'email' },
        )
      }
    }
  } catch (processingErr) {
    // Never return non-2xx for a processing bug -- Resend would retry
    // indefinitely. The signature check above is the only thing that earns a
    // 401; everything after that degrades to "logged and acknowledged".
    console.error('resend-webhook processing error:', processingErr)
  }

  return new Response(
    JSON.stringify({ ok: true, event_type: eventType, matched: matchedSendId !== null }),
    { headers: CORS_POST },
  )
})
