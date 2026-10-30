#!/usr/bin/env bash
# Install the LMS class API on the staging container only (anton-school-stage).
# Disk is docker/volumes/anton-school-stage — never the production volume.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SRC="$ROOT/obrolan.marketing/server/server.mjs"
DEST="/root/larisid-infra/docker/anton-school-stage/server.mjs"
SSH=(ssh -i "$KEY" -o BatchMode=yes)
"${SSH[@]}" "$HOST" "mkdir -p /root/larisid-infra/docker/anton-school-stage /root/larisid-infra/docker/volumes/anton-school-stage"
rsync -az -e "ssh -i $KEY -o BatchMode=yes" "$SRC" "$HOST:$DEST"
if "${SSH[@]}" "$HOST" "docker inspect supabase-anton-school-stage-1 >/dev/null 2>&1"; then
  "${SSH[@]}" "$HOST" "docker restart supabase-anton-school-stage-1 >/dev/null"
else
  echo "stage container missing — bring up anton-school-stage from larisid-infra first" >&2
  exit 1
fi
if "${SSH[@]}" "$HOST" "docker inspect supabase-anton-school-stage-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Eq '^(LMS_SESSION_SECRET|ANTON_ADMIN_KEY)='"; then
  echo "session-secret: configured"
else
  echo "session-secret: missing — set LMS_SESSION_SECRET or ANTON_ADMIN_KEY on anton-school-stage" >&2
  exit 1
fi
echo "OK — anton-school-stage restarted"
