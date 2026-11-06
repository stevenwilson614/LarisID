#!/usr/bin/env bash
# Ship the static site to Contabo Caddy (https://larisid.com).
# DNS A for @ and www → 84.247.147.205. GitHub Pages and Cloudflare Pages
# mirrors are retired.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Refresh the default Cari Produk file when the API is reachable. A failed
# refresh leaves the copy already on the server (the rsync excludes it).
export DIR_HOME_UPLOAD=0
if node "$ROOT/scripts/build-dir-home-snapshot.mjs"; then
  export DIR_HOME_UPLOAD=1
else
  echo "WARN — dir-home snapshot was not refreshed; live file left as-is" >&2
fi
bash "$ROOT/scripts/assemble-site.sh" "$ROOT/_site"
bash "$ROOT/scripts/deploy-static-contabo.sh" --no-assemble
echo "OK — Contabo (larisid.com)"
