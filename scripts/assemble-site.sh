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
cp -r "$ROOT"/images "$ROOT"/styles "$ROOT"/js "$ROOT"/fonts \
      "$ROOT"/privacy "$ROOT"/perbandingan "$ROOT"/harga "$ROOT"/tentang \
      "$ROOT"/cara-kerja "$ROOT"/riset "$ROOT"/panduan "$ROOT"/kota \
      "$ROOT"/kalkulator "$ROOT"/rise "$OUT/"
mkdir -p "$OUT/gpt"
cp "$ROOT"/index.html "$OUT/gpt/index.html"
echo "Assembled $OUT ($(du -sh "$OUT" | awk '{print $1}'))"
