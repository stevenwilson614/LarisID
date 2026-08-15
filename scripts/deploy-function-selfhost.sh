#!/usr/bin/env bash
# Copy supabase/functions/<slug>/index.ts to Contabo and restart edge functions.
# Also copies into ~/larisid-infra if that repo is present locally.
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/deploy-function-selfhost.sh <slug>" >&2
  exit 1
fi
SLUG="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/supabase/functions/$SLUG/index.ts"
if [[ ! -f "$SRC" ]]; then
  echo "Missing $SRC" >&2
  exit 1
fi
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
REMOTE="/root/larisid-infra/docker/volumes/functions/$SLUG"
echo "Deploy $SLUG → $HOST"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" "mkdir -p $REMOTE"
scp -i "$KEY" -o BatchMode=yes "$SRC" "$HOST:$REMOTE/index.ts"
ssh -i "$KEY" -o BatchMode=yes "$HOST" "docker restart supabase-edge-functions"
echo "Restarted supabase-edge-functions"

INFRA="${LARISID_INFRA:-$HOME/larisid-infra}"
if [[ -d "$INFRA/docker/volumes/functions" ]]; then
  mkdir -p "$INFRA/docker/volumes/functions/$SLUG"
  cp "$SRC" "$INFRA/docker/volumes/functions/$SLUG/index.ts"
  echo "Copied to $INFRA (commit+push that repo so the VPS git pull keeps it)"
fi
echo "OK"
