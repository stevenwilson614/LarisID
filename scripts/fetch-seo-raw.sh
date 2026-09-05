#!/usr/bin/env bash
# Fetch raw Shopee listing rows for each curated SEO keyword into scripts/_seo_raw/.
# Uses curl (the build host blocks Node's fetch in sandbox, but allows curl).
# Then run: node scripts/build-seo-pages.mjs   (reads the cached rows, no network).
set -euo pipefail
cd "$(dirname "$0")/.."

URL='https://api.larisid.com/rest/v1/listings'
KEY='sb_publishable_KDSWIJJLckser1e1hk7bbA_yMChRPog'
SEL='item_id,product_name,store_name,price,est_sold,rating,reviews,location,scraped_at'
RAW='scripts/_seo_raw'

rm -rf "$RAW"
mkdir -p "$RAW"

# Emit one keyword per line (Node can read files; it just can't use the network here).
node -e 'const k=require("./scripts/seo-keywords.json").keywords; process.stdout.write(k.map(x=>x.keyword).join("\n"))' > "$RAW/_keywords.txt"

idx=0
total=$(wc -l < "$RAW/_keywords.txt" | tr -d ' ')
while IFS= read -r kw; do
  idx=$((idx+1))
  printf '[%s/%s] %s ... ' "$idx" "$((total+1))" "$kw"
  for page in 0 1; do
    off=$((page*1000))
    curl -s -G "$URL" \
      -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      --data-urlencode "keyword=eq.$kw" \
      --data-urlencode 'price=gt.0' \
      --data-urlencode "select=$SEL" \
      --data-urlencode 'order=scraped_at.desc' \
      --data-urlencode 'limit=1000' \
      --data-urlencode "offset=$off" \
      -o "$RAW/$(printf '%03d' "$idx").p$page.json"
  done
  echo "ok"
done < "$RAW/_keywords.txt"

echo "Done fetching raw rows into $RAW"
