#!/usr/bin/env bash
# Private MasterMind demo on Cloudflare Pages (separate from larisid.com).
# Does not touch Contabo, assemble-site.sh, or the live larisid Pages project.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_school_site"
PROJECT="${SCHOOL_PAGES_PROJECT:-mastermind-anton}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-721a30ed6330104bd87c64e6024b240f}"
WRANGLER=(npx --yes wrangler@4)
ID_FILE="$ROOT/school/.kv-namespace-id"
D1_FILE="$ROOT/school/.d1-database-id"
D1_NAME="mastermind-anton-wa"
TOML="$ROOT/school/wrangler.toml"

echo "Assembling $OUT"
rm -rf "$OUT"
mkdir -p "$OUT/school" "$OUT/fonts"
rsync -a --delete \
  --exclude functions \
  --exclude pages \
  --exclude wrangler.toml \
  --exclude '.kv-namespace-id' \
  --exclude '.d1-database-id' \
  "$ROOT/school/" "$OUT/school/"
rsync -a "$ROOT/fonts/" "$OUT/fonts/"
cp "$ROOT/school/pages/_redirects" "$OUT/_redirects"
cp "$ROOT/school/pages/_headers" "$OUT/_headers"

if [[ ! -f "$ID_FILE" ]] && grep -q 'id = "' "$TOML" 2>/dev/null; then
  sed -n 's/^id = "\([^"]*\)".*/\1/p' "$TOML" | head -1 > "$ID_FILE"
fi
if [[ ! -f "$ID_FILE" ]]; then
  echo "Creating KV namespace STATE"
  raw="$("${WRANGLER[@]}" kv namespace create STATE 2>&1 || true)"
  echo "$raw"
  id="$(printf '%s\n' "$raw" | sed -n 's/.*id *= *"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -z "$id" ]]; then
    id="$(printf '%s\n' "$raw" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' | head -1)"
  fi
  if [[ -z "$id" ]]; then
    echo "Could not parse KV namespace id" >&2
    exit 1
  fi
  printf '%s\n' "$id" > "$ID_FILE"
fi
KV_ID="$(tr -d '[:space:]' < "$ID_FILE")"

if [[ ! -f "$D1_FILE" ]]; then
  echo "Creating D1 database $D1_NAME"
  raw="$("${WRANGLER[@]}" d1 create "$D1_NAME" 2>&1 || true)"
  echo "$raw"
  id="$(printf '%s\n' "$raw" | sed -n 's/.*database_id *= *"\([^"]*\)".*/\1/p' | head -1)"
  if [[ -z "$id" ]]; then
    id="$(printf '%s\n' "$raw" | sed -n 's/.*"database_id": *"\([^"]*\)".*/\1/p' | head -1)"
  fi
  if [[ -n "$id" ]]; then
    printf '%s\n' "$id" > "$D1_FILE"
  else
    echo "D1 create skipped — WA API will use KV fallback" >&2
  fi
fi
D1_ID=""
if [[ -f "$D1_FILE" ]]; then
  D1_ID="$(tr -d '[:space:]' < "$D1_FILE")"
fi
if [[ -n "$D1_ID" ]]; then
  "${WRANGLER[@]}" d1 execute "$D1_NAME" --remote --file="$ROOT/school/sql/wa-d1.sql" || true
fi

D1_BLOCK=""
if [[ -n "$D1_ID" ]]; then
  D1_BLOCK=$(cat <<D1
[[d1_databases]]
binding = "WA"
database_name = "$D1_NAME"
database_id = "$D1_ID"
D1
)
fi

cat > "$TOML" <<EOF
name = "$PROJECT"
compatibility_date = "2026-09-23"
pages_build_output_dir = "../_school_site"

[vars]
FONNTE_DEVICE_READY = "false"

[[kv_namespaces]]
binding = "STATE"
id = "$KV_ID"
$D1_BLOCK
EOF

if ! "${WRANGLER[@]}" pages project list 2>/dev/null | grep -q "$PROJECT"; then
  echo "Creating Pages project $PROJECT"
  "${WRANGLER[@]}" pages project create "$PROJECT" --production-branch anton-school-remote-demo || true
fi

echo "Deploying $PROJECT from school/ (functions + wrangler.toml)"
(
  cd "$ROOT/school"
  "${WRANGLER[@]}" pages deploy "$OUT" \
    --project-name="$PROJECT" \
    --commit-dirty=true
)

echo "OK — https://${PROJECT}.pages.dev/s/obrolan.marketing?invite=ANTON-SEP26"
echo "KV id ${KV_ID}. Do not deploy this tree to larisid.com."
