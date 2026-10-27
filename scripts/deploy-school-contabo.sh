#!/usr/bin/env bash
# Ship MasterMind LMS to Contabo (larisid.com).
# Live: https://larisid.com/obrolan.marketing/?invite=ANTON-SEP26
#        https://larisid.com/s/obrolan.marketing?invite=ANTON-SEP26
# Static source of truth: obrolan.marketing/ (main). API: school/server (pay/WA + state).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}"
HOST="${LARISID_SSH_HOST:-root@84.247.147.205}"
SSH=(ssh -i "$KEY" -o BatchMode=yes)
RSYNC=(rsync -az -e "ssh -i $KEY -o BatchMode=yes")
WWW_REMOTE="/root/larisid-infra/docker/volumes/www/larisid"
APP_REMOTE="/root/larisid-infra/docker/anton-school"
SRC="$ROOT/obrolan.marketing"
if [[ ! -f "$SRC/index.html" ]]; then
  echo "Missing $SRC — expected main LMS tree" >&2
  exit 1
fi

echo "1/5 Static obrolan.marketing/ → Contabo www (obrolan.marketing + school mirror)"
RSYNC_EXCLUDES=(
  --exclude server
  --exclude '.DS_Store'
)
"${RSYNC[@]}" --delete "${RSYNC_EXCLUDES[@]}" --exclude admin \
  "$SRC/" "$HOST:$WWW_REMOTE/obrolan.marketing/"
if [[ -d "$SRC/admin" ]]; then
  "${RSYNC[@]}" "$SRC/admin/" "$HOST:$WWW_REMOTE/obrolan.marketing/admin/"
fi
"${RSYNC[@]}" --delete "${RSYNC_EXCLUDES[@]}" --exclude admin \
  "$SRC/" "$HOST:$WWW_REMOTE/school/"
"${SSH[@]}" "$HOST" "sed -i 's|href=\"/obrolan.marketing/\"|href=\"/school/\"|g' $WWW_REMOTE/school/index.html"

"${RSYNC[@]}" "$ROOT/fonts/" "$HOST:$WWW_REMOTE/fonts/"

echo "2/5 anton-school Node (state + pay + wa) → Contabo"
"${RSYNC[@]}" \
  "$ROOT/school/server/server.mjs" \
  "$ROOT/school/server/disk-store.mjs" \
  "$ROOT/school/server/pay-wa.mjs" \
  "$HOST:$APP_REMOTE/"
"${SSH[@]}" "$HOST" "cat > $APP_REMOTE/README.md" <<'EOF'
# anton-school

Node process for larisid.com school APIs (state, media, Mayar, WA).
Disk only — not LarisID Postgres.

Static UI: repo `obrolan.marketing/`. API source: `school/server/*.mjs`.
Deploy: bash scripts/deploy-school-contabo.sh
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
ENV=/root/larisid-infra/docker/.env
grep -q '^MAYAR_API_BASE=' "$ENV" 2>/dev/null || echo 'MAYAR_API_BASE=https://api.mayar.io/hl/v2' >> "$ENV"
grep -q '^FONNTE_DEVICE_READY=' "$ENV" 2>/dev/null || echo 'FONNTE_DEVICE_READY=false' >> "$ENV"
REMOTE

echo "4/5 Caddy: /obrolan.marketing/ + /s/* + /api/*"
"${SSH[@]}" "$HOST" bash -s <<'REMOTE'
set -euo pipefail
CADDY=/root/larisid-infra/docker/volumes/proxy/caddy/Caddyfile
cp -a "$CADDY" "$CADDY.bak-school-$(date +%Y%m%d%H%M%S)"
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/root/larisid-infra/docker/volumes/proxy/caddy/Caddyfile")
text = p.read_text()
school_block = """\t# School LMS (Contabo) — obrolan.marketing + /s/{slug}
\thandle_path /api/* {
\t\treverse_proxy anton-school:8787
\t}
\thandle_path /obrolan.marketing/api/* {
\t\treverse_proxy anton-school:8787
\t}
\tredir /obrolan.marketing /obrolan.marketing/ 308
\thandle /s/* {
\t\trewrite * /obrolan.marketing/index.html
\t\tfile_server
\t}
\t@school_admin path /obrolan.marketing/admin /obrolan.marketing/admin/
\thandle @school_admin {
\t\trewrite * /obrolan.marketing/admin/index.html
\t\tfile_server
\t}
"""
pattern = re.compile(
    r"(redir /gpt/\* / 301\n)(.*?)(\thandle \{)",
    re.S,
)
if not pattern.search(text):
    raise SystemExit("could not locate larisid.com school insert point")
p.write_text(pattern.sub(r"\1" + school_block + r"\3", text, count=1))
print("Caddyfile school routes updated")
PY
cd /root/larisid-infra/docker
docker compose -f docker-compose.yml -f docker-compose.larisid.yml -f docker-compose.caddy.yml \
  up -d --force-recreate --no-deps anton-school
docker restart supabase-caddy
REMOTE

echo "5/5 Verify"
sleep 5
"${SSH[@]}" "$HOST" 'docker exec supabase-anton-school-1 wget -qO- http://127.0.0.1:8787/health; echo; curl -sS -o /dev/null -w "legacy:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 https://larisid.com/obrolan.marketing/; curl -sS -o /dev/null -w "s:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 https://larisid.com/s/obrolan.marketing; curl -sS -o /dev/null -w "api:%{http_code}\n" --resolve larisid.com:443:127.0.0.1 "https://larisid.com/api/state/obrolan.marketing?k=ANTON-SEP26"'

echo "OK — https://larisid.com/obrolan.marketing/?invite=ANTON-SEP26"
echo "Also — https://larisid.com/s/obrolan.marketing?invite=ANTON-SEP26"
