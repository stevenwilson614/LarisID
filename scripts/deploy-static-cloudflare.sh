#!/usr/bin/env bash
# Deploy static site to Cloudflare Pages project "larisid".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
npx --yes wrangler@4 pages deploy "$ROOT/_site" \
  --project-name=larisid --commit-dirty=true --branch=main
