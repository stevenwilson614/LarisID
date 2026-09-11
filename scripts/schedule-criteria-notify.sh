#!/usr/bin/env bash
# Monday 01:15 WIB = Sunday 18:15 UTC. Emails saved-criteria hits after
# notify_saved_criteria() at 18:00 UTC. Reads SERVICE_ROLE_KEY from the VPS
# docker/.env — never commits it. WhatsApp is skipped inside the function
# while FONNTE_DEVICE_READY is false.
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
select cron.unschedule(jobid) from cron.job where jobname = 'criteria-notify-email';
select cron.schedule(
  'criteria-notify-email',
  '15 18 * * 0',
  \$cron\$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/criteria-notify',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ${SR_ESC}"}'::jsonb,
    body    := '{}'::jsonb
  )
  \$cron\$
);
select jobname, schedule from cron.job
 where jobname in ('notify-saved-criteria', 'criteria-notify-email')
 order by jobname;
SQL
REMOTE
echo "OK — criteria-notify-email scheduled 18:15 UTC Sundays (01:15 WIB Mondays)"
