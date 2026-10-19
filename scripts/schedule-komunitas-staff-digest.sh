#!/usr/bin/env bash
# Retire Komunitas unanswered digests. Staff now get email only on new post/reply
# via notify-feature-board. This script only unschedules the old cron jobs.
# Reads SERVICE_ROLE_KEY from the VPS docker/.env — never commits it.
set -euo pipefail
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" bash -s <<'REMOTE'
set -euo pipefail
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
select cron.unschedule(jobid) from cron.job
 where jobname in ('komunitas-unanswered-daily', 'komunitas-staff-weekly');
select jobname, schedule from cron.job
 where jobname in ('komunitas-unanswered-daily', 'komunitas-staff-weekly')
 order by jobname;
SQL
REMOTE
echo "OK — komunitas unanswered digests unscheduled (email only on new post/reply)"
