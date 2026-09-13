#!/usr/bin/env bash
# Monday laptop SEO agent — local Cursor CLI, not Cloud Agents / Automations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT_FILE="$ROOT/scripts/weekly-seo-agent.prompt.md"
LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/seo-weekly-$(date +%Y-%m-%d).log"
CURSOR_BIN="/Applications/Cursor.app/Contents/Resources/app/bin/cursor"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"LarisID SEO weekly\"" >/dev/null 2>&1 || true
}

find_agent() {
  local c
  for c in \
    "${CURSOR_AGENT:-}" \
    "$HOME/.local/bin/agent" \
    "$HOME/.local/share/cursor-agent/versions/"*/cursor-agent \
    /usr/local/bin/agent
  do
    [[ -n "$c" && -x "$c" ]] && { echo "$c"; return 0; }
  done
  return 1
}

cd "$ROOT"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "missing $PROMPT_FILE" | tee -a "$LOG"
  notify "Weekly SEO prompt file is missing."
  exit 1
fi

# Optional local key file — never commit this. Browser login is enough if you ran `agent login`.
if [[ -f "$HOME/.cursor/seo-agent.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.cursor/seo-agent.env"
  set +a
fi

AGENT="$(find_agent || true)"
if [[ -z "$AGENT" ]]; then
  echo "cursor agent CLI not found" | tee -a "$LOG"
  notify "Install the Cursor agent CLI, then re-run the weekly SEO job."
  if [[ -x "$CURSOR_BIN" ]]; then
    "$CURSOR_BIN" -r "$ROOT" -g "$PROMPT_FILE"
  fi
  exit 1
fi

if "$AGENT" status 2>/dev/null | grep -qi 'not logged in' && [[ -z "${CURSOR_API_KEY:-}" ]]; then
  echo "agent is not logged in; opening the prompt in Cursor instead" | tee -a "$LOG"
  notify "Log in once with: agent login. Opening the weekly SEO prompt in Cursor."
  if [[ -x "$CURSOR_BIN" ]]; then
    "$CURSOR_BIN" -r "$ROOT" -g "$PROMPT_FILE"
  fi
  exit 0
fi

{
  echo "=== $(date -Iseconds) weekly SEO agent ==="
  echo "agent=$AGENT"
  echo "workspace=$ROOT"
} >> "$LOG"

notify "Weekly SEO agent starting on this laptop."

# Keep the Mac awake for the run. --print is unattended; --trust skips the workspace prompt;
# --force lets the agent merge/review without a TTY. Still local — no cloud VM.
set +e
/usr/bin/caffeinate -i "$AGENT" \
  --print \
  --trust \
  --force \
  --workspace "$ROOT" \
  --output-format text \
  "$(cat "$PROMPT_FILE")" \
  >>"$LOG" 2>&1
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  notify "Weekly SEO agent finished. See logs/seo-weekly-$(date +%Y-%m-%d).log"
else
  notify "Weekly SEO agent failed (exit $status). See logs/seo-weekly-$(date +%Y-%m-%d).log"
fi
exit "$status"
