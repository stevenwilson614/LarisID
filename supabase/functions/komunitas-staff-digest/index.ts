import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Retired: unanswered digests stopped. Staff email for new posts/replies is
// notify-feature-board. Kept as a no-op so old cron / admin buttons fail soft.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  return new Response(
    JSON.stringify({
      ok: true,
      skipped: 'retired',
      hint: 'Use notify-feature-board for new post/reply emails',
    }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})
