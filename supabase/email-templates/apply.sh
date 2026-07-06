#!/usr/bin/env bash
# Apply the Bahasa Indonesia auth email templates to the live Supabase project
# via the Management API. Uses YOUR Supabase CLI login — no token is stored here.
#
#   bash supabase/email-templates/apply.sh
#
# Requires: jq, curl, and either $SUPABASE_ACCESS_TOKEN set or the Supabase CLI
# logged in (`supabase login`). Only touches the 3 email-template fields below;
# every other auth setting (Google OAuth, SMTP, redirect URLs) is left untouched.
set -euo pipefail

REF="bzmvlraziqevqdyotvgy"
DIR="$(cd "$(dirname "$0")" && pwd)"

# --- token: prefer env var, else read the CLI's keychain entry (macOS) ---
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  TOKEN="$(security find-generic-password -s 'Supabase CLI' -w 2>/dev/null || true)"
fi
if [ -z "$TOKEN" ]; then
  echo "No token. Run:  export SUPABASE_ACCESS_TOKEN=<your token from supabase.com/dashboard/account/tokens>"
  exit 1
fi

payload="$(jq -n \
  --arg cs 'Konfirmasi email kamu - LarisID' \
  --rawfile cc "$DIR/confirmation-id.html" \
  --arg rs 'Atur ulang kata sandi kamu - LarisID' \
  --rawfile rc "$DIR/recovery-id.html" \
  --arg ms 'Tautan masuk ke LarisID' \
  --rawfile mc "$DIR/magic-link-id.html" \
  '{
    mailer_subjects_confirmation:        $cs,
    mailer_templates_confirmation_content:$cc,
    mailer_subjects_recovery:            $rs,
    mailer_templates_recovery_content:   $rc,
    mailer_subjects_magic_link:          $ms,
    mailer_templates_magic_link_content: $mc
  }')"

echo "Applying Indonesian email templates to project $REF ..."
curl -sS -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data "$payload" \
  -o /dev/null -w "HTTP %{http_code}\n"
echo "Done. Send yourself a test signup to confirm."
