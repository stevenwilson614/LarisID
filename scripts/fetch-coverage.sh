#!/usr/bin/env bash
# Pull corpus coverage stats from Contabo into scripts/coverage.json.
#
# Why ssh+psql and not PostgREST: these are corpus-wide aggregates over ~4.4M rows
# (PostgREST 504s silently on work this size), and v_scrape_health / scrape_keywords
# are service-role only. The repo already holds CONTABO_SSH_KEY, so CI needs no new
# credential.
#
# Env: SSH_KEY (default ~/.ssh/larisid_hetzner), CONTABO_HOST.
set -euo pipefail
cd "$(dirname "$0")/.."

SSH_KEY="${SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
CONTABO_HOST="${CONTABO_HOST:-root@84.247.147.205}"
OUT='scripts/coverage.json'
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Pulling coverage stats from $CONTABO_HOST ..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ConnectTimeout=20 "$CONTABO_HOST" \
  "docker exec -i supabase-db psql -U postgres -t -A -v ON_ERROR_STOP=1" \
  < scripts/sql/coverage.sql > "$TMP"

# psql -t -A still emits a trailing blank line; node's JSON.parse tolerates it, but
# validate before overwriting a good file — a failed pull must not publish as zeroes.
node -e '
const fs = require("fs");
const raw = fs.readFileSync(process.argv[1], "utf8").trim();
if (!raw) { console.error("FAIL: empty result from psql"); process.exit(1); }
const j = JSON.parse(raw);
const required = ["snapshot","listing_rows","products","shops","corpus_active"];
for (const k of required) {
  if (j[k] === null || j[k] === undefined || Number(j[k]) === 0) {
    console.error(`FAIL: ${k} is missing or zero — refusing to write coverage.json`);
    process.exit(1);
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(j, null, 2) + "\n");
console.log(`ok: snapshot=${j.snapshot} products=${j.products} shops=${j.shops} rows=${j.listing_rows}`);
' "$TMP" "$OUT"

echo "Wrote $OUT"
