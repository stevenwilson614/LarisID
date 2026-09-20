#!/usr/bin/env bash
# Localhost-only. Do not deploy. Do not expose past this machine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
cd "$ROOT"
echo "MasterMind with Anton GC prototype → http://127.0.0.1:${PORT}/school/"
echo "Presentasi dual-view → http://127.0.0.1:${PORT}/school/present.html"
echo "Offline lock: not on larisid.com, not in _site, not applied to Contabo."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
