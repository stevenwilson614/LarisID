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
  # Zero/missing stats always fail — a broken pull must never ship "0 produk".
  # Age is fail-closed only when this commit touches corpus-derived SEO surfaces
  # (/data/, /riset/, coverage/seo JSON). Otherwise a stalled scrape would block
  # every main deploy (harga, llms, bugfixes) while the live /data/ page already
  # shows the honest old snapshot. refresh-seo.yml always changes those paths.
  SEO_SURFACES_TOUCHED=0
  SEO_PATH_RE='^(scripts/coverage\.json|scripts/seo-keywords\.json|scripts/seo-detail\.json|scripts/weekly-brief\.json|scripts/tren-manifest\.json|data/|riset/|tren/)'
  if [[ "${SEO_FRESHNESS_REQUIRED:-}" == "1" ]]; then
    SEO_SURFACES_TOUCHED=1
  else
    # Committed diff (deploy-pages on main) OR dirty tree (refresh-seo before commit).
    if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      if git diff --name-only HEAD~1 HEAD | grep -Eq "$SEO_PATH_RE"; then
        SEO_SURFACES_TOUCHED=1
      fi
    fi
    if git status --porcelain | awk '{print $NF}' | grep -Eq "$SEO_PATH_RE"; then
      SEO_SURFACES_TOUCHED=1
    fi
  fi
  export SEO_SURFACES_TOUCHED
  node -e '
const fs = require("fs");
const c = JSON.parse(fs.readFileSync("scripts/coverage.json", "utf8"));
let bad = 0;
const requireFresh = process.env.SEO_SURFACES_TOUCHED === "1";
for (const k of ["snapshot","listing_rows","products","shops","corpus_active","categories"]) {
  if (c[k] === null || c[k] === undefined || Number(c[k]) === 0) {
    console.error(`FAIL: coverage.${k} missing or zero`); bad = 1;
  }
}
const ageDays = Math.round((Date.now() - new Date(c.snapshot)) / 86400000);
const src = c.snapshot_source || 'unknown';
const healthHint = `source=${src} scraped_7d=${c.scraped_7d}/${c.corpus_active} oldest=${c.oldest_age_days}d never_scraped=${c.never_scraped}`;
if (ageDays > 10) {
  if (requireFresh) {
    console.error(`FAIL: coverage snapshot ${c.snapshot} is ${ageDays} days old (max 10) — refusing to publish (${healthHint})`);
    console.error('Hint: drip scrapes are fine; only a stalled corpus (both rolling-7d rows and keyword health cold) should fail. See docs/seo.md fail-closed freshness.');
    bad = 1;
  } else {
    console.log(`ok coverage snapshot ${c.snapshot} (${ageDays}d old, age gate skipped — no SEO corpus surfaces in this commit), ${c.products} produk (${healthHint})`);
  }
} else {
  console.log(`ok coverage snapshot ${c.snapshot} (${ageDays}d old), ${c.products} produk (${healthHint})`);
}
process.exit(bad);
' || fail=1
fi

echo "== weekly brief date matches coverage snapshot =="
if [[ -f scripts/tren-manifest.json && -f scripts/coverage.json ]]; then
  node -e '
const fs = require("fs");
const { execSync } = require("child_process");
const cov = String(JSON.parse(fs.readFileSync("scripts/coverage.json", "utf8")).snapshot).slice(0, 10);
const man = JSON.parse(fs.readFileSync("scripts/tren-manifest.json", "utf8"));
let bad = 0;
if (man.latest !== cov) {
  console.error(`FAIL: tren brief ${man.latest} != coverage snapshot ${cov}`);
  bad = 1;
}
const page = `tren/${man.latest}/index.html`;
if (!fs.existsSync(page)) {
  console.error(`FAIL: missing ${page}`);
  bad = 1;
} else {
  const html = fs.readFileSync(page, "utf8");
  if (!html.includes(`article:modified_time" content="${cov}"`)) {
    console.error("FAIL: brief dateModified is not the coverage snapshot");
    bad = 1;
  }
}
const home = fs.readFileSync("index.html", "utf8");
if (!home.includes(`data-tren-brief="${cov}"`)) {
  console.error("FAIL: homepage tren block is not stamped with the coverage snapshot");
  bad = 1;
}
function gitShow(p) {
  try { return execSync(`git show HEAD:${p}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch (_) { return null; }
}
const headManRaw = gitShow("scripts/tren-manifest.json");
const headCovRaw = gitShow("scripts/coverage.json");
if (headManRaw && headCovRaw) {
  const headLatest = JSON.parse(headManRaw).latest;
  const headCov = String(JSON.parse(headCovRaw).snapshot).slice(0, 10);
  if (man.latest !== headLatest && cov === headCov) {
    console.error(`FAIL: brief date moved ${headLatest} -> ${man.latest} but coverage snapshot stayed ${cov}`);
    bad = 1;
  }
}
if (!bad) console.log(`ok weekly brief ${man.latest}`);
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

echo "== expor-keywords.json is append-only =="
if git rev-parse --verify HEAD >/dev/null 2>&1 && git cat-file -e HEAD:scripts/expor-keywords.json 2>/dev/null; then
  git show HEAD:scripts/expor-keywords.json > /tmp/_expor_kw_head.json 2>/dev/null || true
  node -e '
const fs = require("fs");
const head = JSON.parse(fs.readFileSync("/tmp/_expor_kw_head.json", "utf8")).keywords;
const cur = JSON.parse(fs.readFileSync("scripts/expor-keywords.json", "utf8")).keywords;
if (cur.length < head.length) {
  console.error(`FAIL: expor-keywords.json shrank ${head.length} -> ${cur.length}`); process.exit(1);
}
for (let i = 0; i < head.length; i++) {
  if (cur[i].slug !== head[i].slug) {
    console.error(`FAIL: expor entry ${i} changed "${head[i].slug}" -> "${cur[i].slug}" (append-only violated)`);
    process.exit(1);
  }
}
console.log(`ok expor append-only: ${head.length} -> ${cur.length} (+${cur.length - head.length})`);
' || fail=1
  rm -f /tmp/_expor_kw_head.json
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
