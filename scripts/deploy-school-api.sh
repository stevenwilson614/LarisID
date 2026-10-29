#!/usr/bin/env bash
# Install the class API (anton-school) on Contabo and restart it.
# Static UI is scripts/deploy-static.sh. This file is not in that rsync.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SRC="$ROOT/obrolan.marketing/server/server.mjs"
DEST="/root/larisid-infra/docker/anton-school/server.mjs"
SSH=(ssh -i "$KEY" -o BatchMode=yes)
rsync -az -e "ssh -i $KEY -o BatchMode=yes" "$SRC" "$HOST:$DEST"
# Restart the running container. Compose from this directory fails unless every
# service env var is exported, and the code is bind-mounted so a restart is enough.
"${SSH[@]}" "$HOST" "docker restart supabase-anton-school-1 >/dev/null"
# Confirm a stable session secret is configured. Do not print the value.
if "${SSH[@]}" "$HOST" "docker inspect supabase-anton-school-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Eq '^(LMS_SESSION_SECRET|ANTON_ADMIN_KEY)='"; then
  echo "session-secret: configured"
else
  echo "session-secret: missing — set LMS_SESSION_SECRET or ANTON_ADMIN_KEY on anton-school" >&2
  exit 1
fi
echo "OK — anton-school restarted"
