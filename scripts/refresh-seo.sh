#!/usr/bin/env bash
# Monthly SEO refresh against live Contabo API (not the dead cloud project).
set -euo pipefail
cd "$(dirname "$0")/.."
export LARISID_API_URL="${LARISID_API_URL:-https://api.larisid.com}"
bash scripts/fetch-seo-raw.sh
node scripts/build-seo-pages.mjs
node scripts/fetch-city-data.mjs
node scripts/build-city-pages.mjs
node scripts/build-comparisons.mjs
node scripts/build-guides.mjs
node scripts/build-tools.mjs
echo "SEO refresh done. Review git diff, then commit + deploy-static."
