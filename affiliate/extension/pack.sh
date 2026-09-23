#!/bin/bash
# Zip the unpacked extension for class install. Stay off _site / Web Store.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
VER="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
OUT="$REPO/affiliate/dist/laris-affiliate-$VER.zip"
mkdir -p "$REPO/affiliate/dist"
rm -f "$OUT"
(
  cd "$ROOT"
  zip -r "$OUT" . \
    -x '*.DS_Store' \
    -x 'pack.sh' \
    -x '*/.DS_Store'
)
echo "wrote $OUT"
