#!/usr/bin/env bash
# Assemble the static tree Contabo + Cloudflare Pages serve.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/_site}"
rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT"/index.html "$ROOT"/CNAME "$ROOT"/robots.txt "$ROOT"/sitemap.xml \
   "$ROOT"/manifest.webmanifest "$ROOT"/llms.txt "$ROOT"/llms-full.txt \
   "$ROOT"/BingSiteAuth.xml "$ROOT"/55677968d982482614b7ad24398e836c.txt "$OUT/"
if [[ -f "$ROOT/_headers" ]]; then
  cp "$ROOT/_headers" "$OUT/"
fi
cp -r "$ROOT"/images "$ROOT"/styles "$ROOT"/fonts \
      "$ROOT"/privacy "$ROOT"/perbandingan "$ROOT"/harga "$ROOT"/tentang \
      "$ROOT"/cara-kerja "$ROOT"/riset "$ROOT"/panduan "$ROOT"/kota \
      "$ROOT"/kalkulator "$ROOT"/rise "$OUT/"
mkdir -p "$OUT/js"
# Live JS only — do not ship laris-app.js, pre-cutover backups, or unused vendors.
rsync -a --exclude '*.bak' --exclude 'laris-app.js' \
  --exclude 'laris-catpicker.js' --exclude 'laris-finder.js' \
  --exclude 'laris-side-panel.js' --exclude 'laris-trending.js' \
  --exclude 'lp-scroll-story.js' --exclude 'vendor/gsap*' \
  "$ROOT"/js/ "$OUT/js/"
# Do not ship brand source / debug art (moved or leftover).
rm -rf "$OUT/images/brand/generated" \
       "$OUT/images/branding-sheet.png" \
       "$OUT/images/landing/hero" \
       "$OUT"/images/**/*_debug* \
       "$OUT"/images/**/*-source.png 2>/dev/null || true
find "$OUT/images" -name '*_debug*' -delete 2>/dev/null || true
find "$OUT/images" -name '*-source.png' -delete 2>/dev/null || true
echo "Assembled $OUT ($(du -sh "$OUT" | awk '{print $1}'))"
