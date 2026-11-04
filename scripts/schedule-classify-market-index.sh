#!/usr/bin/env bash
# After nightly matview rebuild (16:15 UTC), classify unknown / parent-less
# brand+shop markets via DeepSeek. 16:45 UTC = 23:45 WIB.
set -euo pipefail
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" bash -s <<'REMOTE'
set -euo pipefail
SR="$(grep -E '^SERVICE_ROLE_KEY=' /root/larisid-infra/docker/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "$SR" ]]; then
  echo "SERVICE_ROLE_KEY missing on VPS docker/.env" >&2
  exit 1
fi
SR_ESC="${SR//\\/\\\\}"
SR_ESC="${SR_ESC//\"/\\\"}"
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
select cron.unschedule(jobid) from cron.job where jobname = 'classify-market-index';
select cron.schedule(
  'classify-market-index',
  '45 16 * * *',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/classify-market-index',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{"limit": 60}'::jsonb
  )
  \$cron\$
);
select jobname, schedule, active from cron.job
 where jobname = 'classify-market-index';
SQL
REMOTE
echo "OK — classify-market-index scheduled 16:45 UTC daily (23:45 WIB), after refresh-breakout-matviews"
