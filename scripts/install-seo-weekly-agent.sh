#!/usr/bin/env bash
# Install (or remove) the Monday laptop SEO agent. No Cloud Agents.
#
#   bash scripts/install-seo-weekly-agent.sh
#   bash scripts/install-seo-weekly-agent.sh --uninstall
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.larisid.seo-weekly"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"
AGENT="${HOME}/.local/bin/agent"

if [[ "${1:-}" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$TARGET" 2>/dev/null || true
  rm -f "$TARGET"
  echo "Uninstalled $LABEL"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/logs"

cat > "$TARGET" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/scripts/weekly-seo-agent.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key>
    <integer>1</integer>
    <key>Hour</key>
    <integer>13</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$ROOT/logs/seo-weekly-launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/logs/seo-weekly-launchd.err.log</string>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$TARGET" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET" 2>/dev/null || launchctl load "$TARGET"

echo "Installed $LABEL → $TARGET"
echo "Runs Mondays at 13:00 local time (after the 10:00 WIB GitHub Action)."
echo
if [[ -x "$AGENT" ]]; then
  if "$AGENT" status 2>/dev/null | grep -qi 'not logged in'; then
    echo "One-time login still needed for unattended runs:"
    echo "  $AGENT login"
    echo "Until then, the Monday job opens the prompt in Cursor instead of running headless."
  else
    echo "Cursor agent CLI is logged in. Unattended Monday runs will use this laptop."
  fi
else
  echo "Cursor agent CLI is not on PATH. Install with:"
  echo "  curl https://cursor.com/install -fsS | bash"
fi
echo
echo "Manual run:  bash $ROOT/scripts/weekly-seo-agent.sh"
echo "Verify:      launchctl print gui/$(id -u)/$LABEL | head"
