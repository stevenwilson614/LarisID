#!/usr/bin/env bash
# Monday 01:00 UTC = 08:00 Asia/Jakarta. Body {"task":"weekly"} on
# tracker-change-notify. Reads SERVICE_ROLE_KEY from the VPS docker/.env —
# never commits it.
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
select cron.unschedule(jobid) from cron.job where jobname in ('weekly-digest', 'tracker-favorite-weekly');
select cron.schedule(
  'tracker-favorite-weekly',
  '0 1 * * 1',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/tracker-change-notify',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{"task":"weekly"}'::jsonb
  )
  \$cron\$
);
select jobname, schedule from cron.job
 where jobname in ('tracker-change-notify', 'tracker-favorite-weekly', 'weekly-digest')
 order by jobname;
SQL
REMOTE
echo "OK — tracker-favorite-weekly scheduled 01:00 UTC Mondays (08:00 WIB)"
