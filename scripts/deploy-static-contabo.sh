#!/usr/bin/env bash
# Sync static site to Contabo (/srv/larisid via Caddy).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  "$ROOT/_site/" "$HOST:/root/larisid-infra/docker/volumes/www/larisid/"
echo "Synced to Contabo. Live once DNS A records point at 84.247.147.205"
