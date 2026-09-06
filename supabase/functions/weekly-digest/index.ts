// RETIRED 2026-09-06.
//
// Audience used to be user_tracked_products leftover from Site A. Favorit Aku
// now writes that table again, and weekly cadence is served by
// tracker-change-notify with {"task":"weekly"}. Sending from here as well
// would double-mail anyone who opted in.
//
// The pg_cron job `weekly-digest` is unscheduled in
// 20260906123000_favorit_aku.sql. This stub stays so a leftover cron or a
// manual invoke cannot resurrect the old mailer.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async () => {
  return new Response(JSON.stringify({
    sent: 0,
    retired: true,
    reason: 'Use tracker-change-notify {"task":"weekly"}',
  }), { headers: { 'Content-Type': 'application/json' } })
})
