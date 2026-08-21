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
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  "$ROOT/_site/" "$HOST:/root/larisid-infra/docker/volumes/www/larisid/"
echo "OK — Contabo /srv/larisid (larisid.com)"
