#!/usr/bin/env bash
# Write /data/dir-home.json on Contabo every day after the matview refresh.
# refresh-breakout-matviews runs at 16:15 UTC and can take a while, so this
# job is 18:00 UTC (01:00 WIB). That single daily run is both the post-refresh
# hook and the backstop.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SSH=(ssh -i "$KEY" -o ConnectTimeout=20 -o BatchMode=yes "$HOST")
REMOTE_SCRIPT=/root/larisid-infra/cron/build-dir-home-snapshot.mjs
REMOTE_OUT=/root/larisid-infra/docker/volumes/www/larisid/data/dir-home.json

"${SSH[@]}" "mkdir -p /root/larisid-infra/cron $(dirname "$REMOTE_OUT")"
scp -i "$KEY" -o BatchMode=yes \
  "$ROOT/scripts/build-dir-home-snapshot.mjs" \
  "$HOST:$REMOTE_SCRIPT"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
NODE=/opt/node-v20/bin/node
if [[ ! -x "\$NODE" ]]; then
  mkdir -p /opt/node-v20
  curl -fsSL https://nodejs.org/dist/v20.19.0/node-v20.19.0-linux-x64.tar.xz -o /tmp/node-v20.tar.xz
  tar -xJf /tmp/node-v20.tar.xz -C /opt/node-v20 --strip-components=1
  rm -f /tmp/node-v20.tar.xz
fi
"\$NODE" "$REMOTE_SCRIPT" --out "$REMOTE_OUT"
LINE="0 18 * * * \$NODE $REMOTE_SCRIPT --out $REMOTE_OUT >> /var/log/dir-home-snapshot.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'build-dir-home-snapshot' || true
  echo "\$LINE"
) | crontab -
crontab -l | grep build-dir-home-snapshot
REMOTE

echo "OK — dir-home snapshot daily at 18:00 UTC (01:00 WIB), after refresh-breakout-matviews"
