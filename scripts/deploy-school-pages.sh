#!/usr/bin/env bash
# Retired Cloudflare Pages path. School LMS lives on Contabo (larisid.com).
# Kept so old docs/muscle memory still deploy correctly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "Cloudflare Pages school deploy is retired. Shipping to Contabo…"
exec bash "$ROOT/scripts/deploy-school-contabo.sh"
