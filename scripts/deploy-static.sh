#!/usr/bin/env bash
# Ship the static site to Contabo Caddy (https://larisid.com).
# DNS A for @ and www → 84.247.147.205. GitHub Pages and Cloudflare Pages
# mirrors are retired.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
bash "$ROOT/scripts/deploy-static-contabo.sh" --no-assemble
echo "OK — Contabo (larisid.com)"
