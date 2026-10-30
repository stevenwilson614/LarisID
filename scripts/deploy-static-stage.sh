#!/usr/bin/env bash
# Ship the static site to staging (https://stage.larisid.com).
# Does not touch production www (larisid.com). CI on main does not run this.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
ssh -i "$KEY" -o BatchMode=yes "$HOST" "mkdir -p /root/larisid-infra/docker/volumes/www/stage"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  "$ROOT/_site/" "$HOST:/root/larisid-infra/docker/volumes/www/stage/"
echo "OK — stage.larisid.com"
