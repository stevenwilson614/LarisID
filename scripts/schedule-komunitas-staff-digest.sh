#!/usr/bin/env bash
# Staff-only Komunitas reminders. Never auto-posts as a user.
#   Tue–Sun 01:00 UTC (08:00 WIB): unanswered threads older than 48h
#   Monday  01:00 UTC (08:00 WIB): unanswered + weekly keyword draft + invite list
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
SR_ESC="${SR//\\/\\\\}"
SR_ESC="${SR_ESC//\"/\\\"}"
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
select cron.unschedule(jobid) from cron.job
 where jobname in ('komunitas-unanswered-daily', 'komunitas-staff-weekly');
select cron.schedule(
  'komunitas-unanswered-daily',
  '0 1 * * 2-7',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/komunitas-staff-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{}'::jsonb
  )
  \$cron\$
);
select cron.schedule(
  'komunitas-staff-weekly',
  '0 1 * * 1',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/komunitas-staff-digest',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{"task":"weekly"}'::jsonb
  )
  \$cron\$
);
select jobname, schedule from cron.job
 where jobname in ('komunitas-unanswered-daily', 'komunitas-staff-weekly')
 order by jobname;
SQL
REMOTE
echo "OK — komunitas digest: Tue–Sun unanswered, Monday weekly (01:00 UTC / 08:00 WIB)"
