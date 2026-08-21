#!/usr/bin/env bash
# Ship the static site to both live hosts (GitHub Pages is retired).
#   1) Contabo Caddy  — https://larisid.com (DNS A → 84.247.147.205)
#   2) Cloudflare Pages — https://larisid.pages.dev
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
bash "$ROOT/scripts/deploy-static-contabo.sh" --no-assemble
bash "$ROOT/scripts/deploy-static-cloudflare.sh" --no-assemble
echo "OK — Contabo (larisid.com) + Cloudflare Pages (larisid.pages.dev)"
