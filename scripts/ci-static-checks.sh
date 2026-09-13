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

echo "== coverage.json sanity =="
if [[ -f scripts/coverage.json ]]; then
  node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync("scripts/coverage.json", "utf8"));
let bad = 0;
// A failed pull that writes zeroes would publish "0 produk dipantau" to the world.
for (const k of ["snapshot","listing_rows","products","shops","corpus_active","categories"]) {
  if (c[k] === null || c[k] === undefined || Number(c[k]) === 0) {
    console.error(`FAIL: coverage.${k} missing or zero`); bad = 1;
  }
}
// Fail closed on staleness. The whole point of /data/ is an honest freshness claim,
// so a stalled scrape must block the publish rather than ship a fresh dateModified.
const ageDays = Math.round((Date.now() - new Date(c.snapshot)) / 86400000);
if (ageDays > 10) {
  console.error(`FAIL: coverage snapshot ${c.snapshot} is ${ageDays} days old (max 10) — refusing to publish`);
  bad = 1;
} else {
  console.log(`ok coverage snapshot ${c.snapshot} (${ageDays}d old), ${c.products} produk`);
}
process.exit(bad);
' || fail=1
fi

echo "== landing stat tiles are generator-owned =="
for key in products shops keywords categories; do
  if ! grep -q "data-coverage=\"$key\"" index.html; then
    echo "FAIL: index.html lost data-coverage=\"$key\" — build-coverage-page.mjs can no longer refresh that tile"
    fail=1
  fi
done

echo "== seo-keywords.json is append-only =="
# Page order is the array index, so reordering or dropping an entry silently
# repoints published URLs. Compare the prefix against the committed version.
if git rev-parse --verify HEAD >/dev/null 2>&1 && git cat-file -e HEAD:scripts/seo-keywords.json 2>/dev/null; then
  git show HEAD:scripts/seo-keywords.json > /tmp/_kw_head.json 2>/dev/null || true
  node -e '
const fs = require("fs");
const head = JSON.parse(fs.readFileSync("/tmp/_kw_head.json", "utf8")).keywords;
const cur = JSON.parse(fs.readFileSync("scripts/seo-keywords.json", "utf8")).keywords;
if (cur.length < head.length) {
  console.error(`FAIL: seo-keywords.json shrank ${head.length} -> ${cur.length}`); process.exit(1);
}
for (let i = 0; i < head.length; i++) {
  if (cur[i].keyword !== head[i].keyword) {
    console.error(`FAIL: entry ${i} changed "${head[i].keyword}" -> "${cur[i].keyword}" (append-only violated)`);
    process.exit(1);
  }
}
console.log(`ok append-only: ${head.length} -> ${cur.length} (+${cur.length - head.length})`);
' || fail=1
  rm -f /tmp/_kw_head.json
fi

echo "== forbidden pricing/quota copy =="
# docs/seo.md messaging rules: LarisID is free with no tiers, and Laris AI is uncapped.
for s in "paket Free" "Laris Pro" "Laris Business" "gratis selama Beta"; do
  if grep -rl "$s" data riset perbandingan panduan kalkulator harga index.html 2>/dev/null | grep -q .; then
    echo "FAIL: forbidden string present: $s"
    fail=1
  fi
done

echo "== /data/ labels estimates =="
if [[ -f data/index.html ]]; then
  if ! grep -qi 'estimasi' data/index.html; then
    echo "FAIL: data/index.html prints figures without an estimate label"
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
