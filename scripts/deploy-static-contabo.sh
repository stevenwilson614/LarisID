#!/usr/bin/env bash
# Sync static site to Contabo Caddy (live https://larisid.com).
# DNS A for @ and www → 84.247.147.205. API stays on the same box at api.larisid.com.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
if [[ "${1:-}" != "--no-assemble" ]]; then
  bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
fi
# data/dir-home.json is written by the daily cron and by a fresh build.
# Keep a newer server copy when this deploy did not rebuild it.
rsync -az --delete --exclude 'data/dir-home.json' -e "ssh -i $KEY -o BatchMode=yes" \
  "$ROOT/_site/" "$HOST:/root/larisid-infra/docker/volumes/www/larisid/"
if [[ "${DIR_HOME_UPLOAD:-0}" == 1 && -f "$ROOT/data/dir-home.json" ]]; then
  rsync -az -e "ssh -i $KEY -o BatchMode=yes" \
    "$ROOT/data/dir-home.json" \
    "$HOST:/root/larisid-infra/docker/volumes/www/larisid/data/dir-home.json"
fi
echo "OK — Contabo /srv/larisid (larisid.com)"
