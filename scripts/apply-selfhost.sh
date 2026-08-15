#!/usr/bin/env bash
# Apply a SQL file to the live Contabo Postgres (api.larisid.com).
# Never use `supabase db push --linked` — the cloud project is gone.
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/apply-selfhost.sh path/to/file.sql" >&2
  exit 1
fi
SQL="$1"
if [[ ! -f "$SQL" ]]; then
  echo "Not a file: $SQL" >&2
  exit 1
fi
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
echo "Applying $SQL → $HOST supabase-db"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" \
  "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < "$SQL"
echo "OK"
