#!/usr/bin/env bash
# Deploy static site to Cloudflare Pages project "larisid" (https://larisid.pages.dev).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ "${1:-}" != "--no-assemble" ]]; then
  bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
fi
npx --yes wrangler@4 pages deploy "$ROOT/_site" \
  --project-name=larisid --commit-dirty=true --branch=main
