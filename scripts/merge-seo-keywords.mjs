#!/usr/bin/env node
/**
 * One-off: merge an expanded keyword aggregate pull (from Supabase) into
 * scripts/seo-keywords.json WITHOUT disturbing the existing entries.
 *
 * Why append-only: the existing entries map 1:1 (by array index) to cached raw
 * rows in scripts/_seo_raw/NNN.p0.json. Reordering would invalidate that cache.
 * So we keep existing entries in place and append only brand-new keywords.
 *
 * Usage: node scripts/merge-seo-keywords.mjs <path-to-mcp-output.txt>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KW_FILE = path.join(__dirname, 'seo-keywords.json');
const src = process.argv[2];
if (!src) { console.error('Pass the MCP output file path.'); process.exit(1); }

// Extract the inner JSON array from the MCP-wrapped tool output.
const rawText = fs.readFileSync(src, 'utf8');
let pulled;
try {
  const outer = JSON.parse(rawText);
  const s = typeof outer.result === 'string' ? outer.result : rawText;
  const start = s.indexOf('[{"data":');
  const end = s.lastIndexOf(']}]') + 3;
  pulled = JSON.parse(s.slice(start, end))[0].data;
} catch (e) {
  console.error('Failed to parse MCP output:', e.message);
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(KW_FILE, 'utf8'));
const existing = doc.keywords;
const have = new Set(existing.map((k) => k.keyword));

const fresh = pulled.filter((r) => !have.has(r.keyword));
// Keep only the fields the builder expects, same shape/order as existing rows.
const shaped = fresh.map((r) => ({
  keyword: r.keyword,
  category: r.category,
  n: r.n,
  avgPrice: r.avgPrice,
  medPrice: r.medPrice,
  minPrice: r.minPrice,
  p90Price: r.p90Price,
  estSold: r.estSold,
  reviews: r.reviews,
  rating: r.rating,
}));

doc.keywords = existing.concat(shaped);
doc._meta = {
  ...doc._meta,
  note: doc._meta?.note || 'Prices, ratings, reviews are real Shopee values. est_sold (terjual) is an ESTIMATE — label as such on every page.',
  scaled_note: `Batch expanded ${new Date().toISOString().slice(0, 10)}: ${existing.length} existing + ${shaped.length} new = ${doc.keywords.length}. New rows use review-weighted avg rating.`,
};

fs.writeFileSync(KW_FILE, JSON.stringify(doc, null, 2) + '\n');
console.log(`existing=${existing.length} pulled=${pulled.length} new=${shaped.length} total=${doc.keywords.length}`);
console.log('First new indices to fetch:', existing.length + 1, '..', doc.keywords.length);
