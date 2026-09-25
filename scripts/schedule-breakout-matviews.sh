#!/usr/bin/env bash
# Publish listings_deduped (what the site reads) after the day's scrapes.
# 16:15 UTC = 23:15 WIB. The hourly delta catchup does not refresh this view.
set -euo pipefail
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" \
  "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" <<'SQL'
select cron.unschedule(jobid) from cron.job
 where jobname in (
   'refresh-breakout-matviews',
   'merge-ext-ingest',
   'merge-ext-detail'
 );
select cron.schedule(
  'merge-ext-ingest',
  '0 16 * * *',
  $$SELECT public.merge_ext_ingest(20000)$$
);
select cron.schedule(
  'merge-ext-detail',
  '5 16 * * *',
  $$SELECT public.merge_ext_detail(5000)$$
);
select cron.schedule(
  'refresh-breakout-matviews',
  '15 16 * * *',
  $$SELECT public.refresh_breakout_matviews()$$
);
select jobname, schedule, active from cron.job
 where jobname in (
   'merge-ext-ingest',
   'merge-ext-detail',
   'refresh-breakout-matviews'
 )
 order by jobname;
SQL
echo "OK — merge-ext-ingest 16:00 UTC, merge-ext-detail 16:05 UTC, refresh-breakout-matviews 16:15 UTC (23:00 / 23:05 / 23:15 WIB)"
