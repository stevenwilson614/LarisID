#!/usr/bin/env bash
# Copy supabase/functions/<slug>/ (whole folder) plus _shared/ to Contabo
# and restart edge functions. Also copies into ~/larisid-infra if present.
set -euo pipefail
if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/deploy-function-selfhost.sh <slug>" >&2
  exit 1
fi
SLUG="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/supabase/functions/$SLUG"
if [[ ! -d "$SRC_DIR" ]]; then
  echo "Missing $SRC_DIR" >&2
  exit 1
fi
if [[ ! -f "$SRC_DIR/index.ts" ]]; then
  echo "Missing $SRC_DIR/index.ts" >&2
  exit 1
fi
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
REMOTE_ROOT="/root/larisid-infra/docker/volumes/functions"
echo "Deploy $SLUG → $HOST"
ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST" "mkdir -p $REMOTE_ROOT/$SLUG $REMOTE_ROOT/_shared"
scp -i "$KEY" -o BatchMode=yes -r "$SRC_DIR/." "$HOST:$REMOTE_ROOT/$SLUG/"
if [[ -d "$ROOT/supabase/functions/_shared" ]]; then
  scp -i "$KEY" -o BatchMode=yes -r "$ROOT/supabase/functions/_shared/." "$HOST:$REMOTE_ROOT/_shared/"
fi
ssh -i "$KEY" -o BatchMode=yes "$HOST" "docker restart supabase-edge-functions"
echo "Restarted supabase-edge-functions"

INFRA="${LARISID_INFRA:-$HOME/larisid-infra}"
if [[ -d "$INFRA/docker/volumes/functions" ]]; then
  mkdir -p "$INFRA/docker/volumes/functions/$SLUG" "$INFRA/docker/volumes/functions/_shared"
  cp -R "$SRC_DIR/." "$INFRA/docker/volumes/functions/$SLUG/"
  cp -R "$ROOT/supabase/functions/_shared/." "$INFRA/docker/volumes/functions/_shared/"
  echo "Copied to $INFRA (commit+push that repo so the VPS git pull keeps it)"
fi
echo "OK"
