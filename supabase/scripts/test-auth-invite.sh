#!/usr/bin/env bash
# Send a Supabase Auth invite email (tests custom SMTP / Resend).
# Usage: ./supabase/scripts/test-auth-invite.sh 'you+test@gmail.com'
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/supabase/.env.local"
PROJECT_REF="bzmvlraziqevqdyotvgy"
EMAIL="${1:-}"

if [[ -z "$EMAIL" ]]; then
  echo "Usage: $0 'email@example.com'" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — add SUPABASE_ACCESS_TOKEN from dashboard/account/tokens" >&2
  exit 1
fi
set -a && source "$ENV_FILE" && set +a
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN not set in $ENV_FILE" >&2
  exit 1
fi

echo "Fetching service_role key for $PROJECT_REF..."
KEYS_JSON="$(curl -sS "https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")"
SERVICE_ROLE="$(echo "$KEYS_JSON" | python3 -c "
import json, sys
raw = json.load(sys.stdin)
items = raw if isinstance(raw, list) else raw.get('data', raw)
for row in items:
    if row.get('name') == 'service_role':
        print(row.get('api_key', ''))
        break
")"
if [[ -z "$SERVICE_ROLE" ]]; then
  echo "Could not read service_role from Management API. Response:" >&2
  echo "$KEYS_JSON" >&2
  exit 1
fi

echo "Sending invite to $EMAIL ..."
RESP="$(curl -sS -w "\n%{http_code}" -X POST \
  "https://${PROJECT_REF}.supabase.co/auth/v1/invite" \
  -H "apikey: ${SERVICE_ROLE}" \
  -H "Authorization: Bearer ${SERVICE_ROLE}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\"}")"
BODY="$(echo "$RESP" | sed '$d')"
CODE="$(echo "$RESP" | tail -n1)"

echo "HTTP $CODE"
echo "$BODY" | python3 -m json.tool 2>/dev/null || echo "$BODY"
echo ""
echo "Next: https://resend.com/emails — look for a message to $EMAIL within ~1 minute."
echo "Auth logs: https://supabase.com/dashboard/project/${PROJECT_REF}/auth/logs"
