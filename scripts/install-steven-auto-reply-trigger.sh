#!/usr/bin/env bash
# AFTER INSERT on feedback → steven-auto-reply.
# Reads SERVICE_ROLE_KEY from the VPS docker/.env — never commits it.
# pg_net timeout is 30s so a non-waitUntil runtime can finish the DeepSeek call.
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
drop trigger if exists on_feedback_insert_steven_reply on public.feedback;
create trigger on_feedback_insert_steven_reply
  after insert on public.feedback
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/steven-auto-reply',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer ${SR_ESC}"}',
    '{}',
    '30000'
  );
select tgname from pg_trigger
 where tgname = 'on_feedback_insert_steven_reply'
   and tgrelid = 'public.feedback'::regclass;
SQL
REMOTE
echo "OK — on_feedback_insert_steven_reply"
