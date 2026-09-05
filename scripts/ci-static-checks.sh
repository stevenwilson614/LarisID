#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0

echo "== node --check js =="
while IFS= read -r f; do
  node --check "$f" || fail=1
done < <(find js -name '*.js' ! -name '*.bak' ! -name 'laris-app.js' | sort)

echo "== ask-laris followup =="
if [[ -f scripts/test-ask-laris-followup.mjs ]]; then
  node scripts/test-ask-laris-followup.mjs || fail=1
fi

echo "== forbidden strings in _site =="
if [[ -d _site ]]; then
  if grep -R --exclude-dir=.git -n 'bzmvlraziqevqdyotvgy' _site || true | grep -q .; then
    echo "FAIL: stale cloud project ref in _site"
    fail=1
  fi
  if find _site -name '*.bak' | grep -q .; then
    echo "FAIL: .bak shipped in _site"
    fail=1
  fi
fi

echo "== sitemap vs assembled paths =="
if [[ -f sitemap.xml ]]; then
  if ! grep -q 'larisid.com/tentang/' sitemap.xml; then
    echo "FAIL: /tentang/ missing from sitemap.xml"
    fail=1
  fi
fi

echo "== JSON-LD parse index.html =="
node -e '
const fs = require("fs");
const html = fs.readFileSync("index.html","utf8");
const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!blocks.length) { console.error("no JSON-LD"); process.exit(1); }
for (const b of blocks) JSON.parse(b);
console.log("ok", blocks.length, "json-ld blocks");
' || fail=1

exit "$fail"
