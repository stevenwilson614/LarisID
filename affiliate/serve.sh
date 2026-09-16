#!/usr/bin/env bash
# LAN prototype. Do not deploy. Do not bind this past your Wi-Fi.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8766}"
cd "$ROOT"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo "Laris Affiliate"
echo "  Phone (same Wi-Fi) → http://${IP:-<laptop-ip>}:${PORT}/affiliate/"
echo "  Laptop             → http://127.0.0.1:${PORT}/affiliate/"
echo "Safari → Share → Add to Home Screen. Offline lock: not on larisid.com, not in _site."
exec python3 -m http.server "$PORT" --bind 0.0.0.0
