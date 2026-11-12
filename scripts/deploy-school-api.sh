#!/usr/bin/env bash
# Install the LMS class API on Contabo (docker anton-school) and restart it.
# Product entry: /lms/. Static UI is scripts/deploy-static.sh. This file is not in that rsync.
# A failed health check restores server.mjs.prev only. state/ and media/ are not touched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SRC="$ROOT/obrolan.marketing/server/server.mjs"
DEST="/root/larisid-infra/docker/anton-school/server.mjs"
CONTAINER="supabase-anton-school-1"
SSH=(ssh -i "$KEY" -o BatchMode=yes)

node --check "$SRC"

if ! "${SSH[@]}" "$HOST" "docker inspect $CONTAINER --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -Eq '^(LMS_SESSION_SECRET|ANTON_ADMIN_KEY)='"; then
  echo "session-secret: missing — set LMS_SESSION_SECRET or ANTON_ADMIN_KEY on $CONTAINER" >&2
  echo "refusing to restart" >&2
  exit 1
fi
echo "session-secret: configured"

"${SSH[@]}" "$HOST" "if [ -f '$DEST' ]; then cp -a '$DEST' '$DEST.prev'; fi"
rsync -az -e "ssh -i $KEY -o BatchMode=yes" "$SRC" "$HOST:$DEST"
"${SSH[@]}" "$HOST" "docker restart $CONTAINER >/dev/null"

healthy=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if "${SSH[@]}" "$HOST" "docker exec $CONTAINER node -e 'fetch(\"http://127.0.0.1:\"+(process.env.PORT||8787)+\"/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'"; then
    healthy=1
    break
  fi
  sleep 1
done

if [[ "$healthy" != 1 ]]; then
  echo "health check failed — restoring previous server.mjs" >&2
  if "${SSH[@]}" "$HOST" "test -f '$DEST.prev'"; then
    "${SSH[@]}" "$HOST" "cp -a '$DEST.prev' '$DEST' && docker restart $CONTAINER >/dev/null"
  fi
  exit 1
fi
echo "OK — $CONTAINER restarted"
