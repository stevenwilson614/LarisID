#!/bin/bash
# Daily changelog writer. Runs late each evening from cron: reads the day's
# commits, and asks Claude to append one dated entry to js/changelog.js —
# each item written twice, plain-language first and technical second.
#
# No commits today => exits without touching anything.
set -euo pipefail

REPO="/Users/sow/LarisID-astro"
LOG="$REPO/scripts/changelog-daily.log"
CLAUDE="/Users/sow/.local/bin/claude"
cd "$REPO"

TODAY=$(date +%F)
COMMITS=$(git log --since="$TODAY 00:00" --pretty=format:"%h %s%n%b" --no-merges)

if [ -z "$COMMITS" ]; then
  echo "[$(date)] no commits for $TODAY, skipping" >> "$LOG"
  exit 0
fi

if grep -q "date: '$TODAY'" js/changelog.js; then
  echo "[$(date)] entry for $TODAY already exists, skipping" >> "$LOG"
  exit 0
fi

git pull --rebase --quiet || true

PROMPT="Add today's changelog entry to js/changelog.js in this repo.

Today is $TODAY. These are today's commits:

$COMMITS

Rules:
- Prepend ONE new entry object at the top of the window.LARIS_CHANGELOG array (newest first), with date: '$TODAY'.
- Write a short Indonesian title summarising the day.
- Each item is { text, tech }. 'text' = what changed for the seller, plain
  Indonesian, no jargon, no acronyms — a non-technical shop owner must get it.
  'tech' = the same change stated in technical/CS terms (data model, jobs,
  queries, endpoints, algorithms), also in Indonesian.
- Skip commits that are invisible to users (formatting, deps, internal
  refactors with no behaviour change). If nothing user-visible shipped, make no
  edit at all and say so.
- Do not use emojis. Do not touch anything else in the file.
- If you edited the file, bump the ?v= query string on the /js/changelog.js
  script tag in index.html to v=$(date +%Y%m%d)a,
  then commit with message 'Changelog: $TODAY' and push."

"$CLAUDE" -p "$PROMPT" --permission-mode acceptEdits >> "$LOG" 2>&1
echo "[$(date)] done for $TODAY" >> "$LOG"
