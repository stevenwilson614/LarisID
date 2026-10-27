#!/usr/bin/env bash
# Ship MasterMind school SPA + anton-school Node API to Contabo (larisid.com).
# Live: https://larisid.com/s/obrolan.marketing?invite=ANTON-SEP26
# Does not use Cloudflare Pages. Does not touch LarisID Postgres.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SSH=(ssh -i "$KEY" -o BatchMode=yes)
RSYNC=(rsync -az -e "ssh -i $KEY -o BatchMode=yes")
WWW_REMOTE="/root/larisid-infra/docker/volumes/www/larisid"
APP_REMOTE="/root/larisid-infra/docker/anton-school"
COMPOSE_REMOTE="/root/larisid-infra/docker"
CADDY_REMOTE="/root/larisid-infra/docker/volumes/proxy/caddy/Caddyfile"

echo "1/5 Static school/ → Contabo www/larisid/school/ + www/larisid/obrolan.marketing/"
RSYNC_EXCLUDES=(
  --exclude functions
  --exclude pages
  --exclude server
  --exclude wrangler.toml
  --exclude '.kv-namespace-id'
  --exclude '.d1-database-id'
  --exclude '.DS_Store'
)
"${RSYNC[@]}" --delete "${RSYNC_EXCLUDES[@]}" \
  "$ROOT/school/" "$HOST:$WWW_REMOTE/school/"

# Legacy public path (bookmarks / WA links). Keep /admin from the older tree.
"${RSYNC[@]}" --delete "${RSYNC_EXCLUDES[@]}" \
  --exclude admin \
  "$ROOT/school/" "$HOST:$WWW_REMOTE/obrolan.marketing/"
"${SSH[@]}" "$HOST" 'sed -i "s|href=\"/school/\"|href=\"/obrolan.marketing/\"|g" '"$WWW_REMOTE"'/obrolan.marketing/index.html '"$WWW_REMOTE"'/obrolan.marketing/present.html 2>/dev/null || true'

# Fonts used by school shell
"${RSYNC[@]}" "$ROOT/fonts/" "$HOST:$WWW_REMOTE/fonts/"

echo "2/5 anton-school Node (state + pay + wa) → Contabo"
"${RSYNC[@]}" \
  "$ROOT/school/server/server.mjs" \
  "$ROOT/school/server/disk-store.mjs" \
  "$ROOT/school/server/pay-wa.mjs" \
  "$HOST:$APP_REMOTE/"
"${SSH[@]}" "$HOST" "cat > $APP_REMOTE/README.md" <<'EOF'
# anton-school

Node process for https://larisid.com/s/{slug} APIs (state, media, Mayar, WA).
Disk only — not LarisID Postgres.

Source: LarisID-astro `school/server/*.mjs`. Deploy with:
  bash scripts/deploy-school-contabo.sh

Secrets live in `docker/.env` on the VPS (ANTON_ADMIN_KEY, FONNTE_*, MAYAR_*, WA_WEBHOOK_SECRET).
EOF

echo "3/5 Compose env pass-through for Mayar + Fonnte"
"${SSH[@]}" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
COMPOSE=/root/larisid-infra/docker/docker-compose.larisid.yml
if ! grep -q 'MAYAR_API_KEY' "$COMPOSE"; then
  python3 - <<'PY'
from pathlib import Path
p = Path("/root/larisid-infra/docker/docker-compose.larisid.yml")
text = p.read_text()
old = """    environment:
      PORT: \"8787\"
      DATA_DIR: /data
      ANTON_ADMIN_KEY: ${ANTON_ADMIN_KEY:-}
      ANTON_INVITE: ${ANTON_INVITE:-ANTON-SEP26}
      LYNK_MERCHANT_KEY: ${LYNK_MERCHANT_KEY:-}
"""
new = """    environment:
      PORT: \"8787\"
      DATA_DIR: /data
      ANTON_ADMIN_KEY: ${ANTON_ADMIN_KEY:-}
      ANTON_INVITE: ${ANTON_INVITE:-ANTON-SEP26}
      LYNK_MERCHANT_KEY: ${LYNK_MERCHANT_KEY:-}
      MAYAR_API_KEY: ${MAYAR_API_KEY:-}
      MAYAR_API_BASE: ${MAYAR_API_BASE:-https://api.mayar.io/hl/v2}
      MAYAR_WEBHOOK_SECRET: ${MAYAR_WEBHOOK_SECRET:-}
      MAYAR_VA_METHOD: ${MAYAR_VA_METHOD:-}
      FONNTE_API_TOKEN: ${FONNTE_API_TOKEN:-}
      FONNTE_DEVICE_READY: ${FONNTE_DEVICE_READY:-false}
      WA_WEBHOOK_SECRET: ${WA_WEBHOOK_SECRET:-}
"""
if old not in text:
    raise SystemExit("compose anton-school environment block not found")
p.write_text(text.replace(old, new, 1))
print("compose env updated")
PY
else
  echo "compose already has MAYAR_API_KEY"
fi
# Ensure FONNTE_DEVICE_READY default line exists in .env (do not overwrite token)
ENV=/root/larisid-infra/docker/.env
grep -q '^MAYAR_API_BASE=' "$ENV" 2>/dev/null || echo 'MAYAR_API_BASE=https://api.mayar.io/hl/v2' >> "$ENV"
grep -q '^FONNTE_DEVICE_READY=' "$ENV" 2>/dev/null || echo 'FONNTE_DEVICE_READY=false' >> "$ENV"
REMOTE

echo "4/5 Caddy: /s/* SPA + /api/* → anton-school"
"${SSH[@]}" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
CADDY=/root/larisid-infra/docker/volumes/proxy/caddy/Caddyfile
cp -a "$CADDY" "$CADDY.bak-school-$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/root/larisid-infra/docker/volumes/proxy/caddy/Caddyfile")
text = p.read_text()
# Replace the school-related handlers inside the larisid.com block.
school_block = """\t# School LMS (Contabo) — /s/{slug} + legacy /obrolan.marketing/
\thandle_path /api/* {
\t\treverse_proxy anton-school:8787
\t}
\thandle_path /obrolan.marketing/api/* {
\t\treverse_proxy anton-school:8787
\t}
\tredir /obrolan.marketing /obrolan.marketing/ 308
\thandle /s/* {
\t\trewrite * /school/index.html
\t\tfile_server
\t}
\t@school_admin path /obrolan.marketing/admin /obrolan.marketing/admin/
\thandle @school_admin {
\t\trewrite * /obrolan.marketing/admin/index.html
\t\tfile_server
\t}
"""
# Strip prior school snippets between the gpt redirs and the final handle {
pattern = re.compile(
    r"(redir /gpt/\* / 301\n)(.*?)(\thandle \{)",
    re.S,
)
m = pattern.search(text)
if not m:
    raise SystemExit("could not locate larisid.com school insert point")
text = pattern.sub(r"\1" + school_block + r"\3", text, count=1)
p.write_text(text)
print("Caddyfile school routes updated")
PY
cd /root/larisid-infra/docker
docker compose -f docker-compose.yml -f docker-compose.larisid.yml -f docker-compose.caddy.yml \
  up -d --force-recreate --no-deps anton-school
# Full restart — HUP alone often keeps stale routes for school redirs.
docker restart supabase-caddy
REMOTE

echo "5/5 Verify"
sleep 2
"${SSH[@]}" "$HOST" 'docker exec supabase-anton-school-1 wget -qO- http://127.0.0.1:8787/health; echo; curl -sS -o /dev/null -w "s:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 https://larisid.com/s/obrolan.marketing; curl -sS -o /dev/null -w "legacy:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 https://larisid.com/obrolan.marketing/; curl -sS -o /dev/null -w "api:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 "https://larisid.com/api/state/obrolan.marketing?k=ANTON-SEP26"'

echo "OK — https://larisid.com/s/obrolan.marketing?invite=ANTON-SEP26"
echo "Also — https://larisid.com/obrolan.marketing/ (same new LMS)"
echo "Mayar webhook: https://larisid.com/api/pay/webhook"
echo "WA webhook:    https://larisid.com/api/wa/webhook?secret=…&slug=obrolan.marketing"
echo "Secrets (VPS docker/.env): MAYAR_API_KEY, MAYAR_WEBHOOK_SECRET, FONNTE_*, WA_WEBHOOK_SECRET"
