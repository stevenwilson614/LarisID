#!/usr/bin/env bash
# Schedule rise-crawl-watchdog at 14:00 WIB (07:00 UTC) on Contabo pg_cron.
# Reads SERVICE_ROLE_KEY from the VPS docker/.env — never commits it.
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
# Escape for JSON inside SQL dollar-quote
SR_ESC="${SR//\\/\\\\}"
SR_ESC="${SR_ESC//\"/\\\"}"
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
select cron.unschedule(jobid) from cron.job where jobname = 'rise-crawl-watchdog';
select cron.schedule(
  'rise-crawl-watchdog',
  '0 7 * * *',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/rise-crawl-watchdog',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{}'::jsonb
  )
  \$cron\$
);
select jobname, schedule from cron.job where jobname = 'rise-crawl-watchdog';
SQL
REMOTE
echo "OK — rise-crawl-watchdog scheduled 07:00 UTC (14:00 WIB)"
