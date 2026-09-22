#!/usr/bin/env bash
# Offline prototype. Do not deploy. Not for larisid.com / Contabo.
# Binds the LAN so a phone on the same Wi-Fi can open it.
#
# Vanity LMS URLs (creator-mentor schools):
#   http://127.0.0.1:8765/s/obrolan.marketing
#   http://127.0.0.1:8765/s/obrolan.marketing?invite=ANTON-SEP26
# Production target (when graduated): https://larisid.com/s/{slug}
#
# Also serves the rest of the repo (school/, fonts/, …) like python -m http.server.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
HOST="${HOST:-0.0.0.0}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
cd "$ROOT"
echo "MasterMind with Anton GC prototype"
echo "  This Mac              → http://127.0.0.1:${PORT}/s/obrolan.marketing"
if [ -n "$LAN_IP" ]; then
  echo "  Phone (same Wi-Fi)    → http://${LAN_IP}:${PORT}/s/obrolan.marketing"
fi
echo "  School (dev path)     → http://127.0.0.1:${PORT}/school/"
echo "  Presentasi dual-view  → http://127.0.0.1:${PORT}/school/present.html"
echo "Offline lock: not on larisid.com, not in _site, not applied to Contabo."
exec python3 - "$PORT" "$HOST" <<'PY'
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

PORT = int(sys.argv[1])
HOST = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
ROOT = Path.cwd()
SCHOOL_INDEX = ROOT / "school" / "index.html"
# Same rules as schools.slug check (draft SQL) + path segment.
SLUG_PATH = re.compile(
    r"^/s/([a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?)/?$",
    re.IGNORECASE,
)


class SchoolHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parts = urlsplit(self.path)
        m = SLUG_PATH.match(unquote(parts.path))
        if m:
            slug = m.group(1).lower()
            if ".." in slug:
                self.send_error(404, "School not found")
                return
            self._serve_school_shell(parts.query)
            return
        return SimpleHTTPRequestHandler.do_GET(self)

    def _serve_school_shell(self, query: str):
        try:
            html = SCHOOL_INDEX.read_text(encoding="utf-8")
        except OSError:
            self.send_error(500, "school/index.html missing")
            return
        # Relative ./css and ./js resolve under /school/ when opened as /s/{slug}.
        if "<base " not in html.lower():
            html = html.replace("<head>", '<head>\n  <base href="/school/">', 1)
        raw = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)
        # query preserved on the browser URL; index reads ?invite= via location.search

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


httpd = ThreadingHTTPServer((HOST, PORT), partial(SchoolHandler, directory=str(ROOT)))
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nstopped", file=sys.stderr)
PY
