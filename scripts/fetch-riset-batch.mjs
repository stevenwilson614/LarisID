#!/usr/bin/env node
/**
 * Appends the next batch of /riset/ keywords to seo-keywords.json + seo-detail.json.
 *
 * Why batches: ~4,300 keywords currently qualify and only 745 are published.
 * Publishing the remainder in one push is the textbook programmatic-SEO spam
 * signal, so this ships a capped slice per run and lets indexation catch up.
 *
 * APPEND-ONLY, and that is load-bearing: seo-keywords.json entries map to page
 * order by array index, so an existing entry must never be reordered or removed.
 * This script only ever concatenates.
 *
 * Usage:
 *   node scripts/fetch-riset-batch.mjs [--limit N] [--dry-run]
 *
 * Then: node scripts/build-seo-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KW_FILE = path.join(__dirname, 'seo-keywords.json');
const DETAIL_FILE = path.join(__dirname, 'seo-detail.json');
const SQL_DIR = path.join(__dirname, 'sql');

const args = process.argv.slice(2);
const argVal = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i === -1 ? dflt : args[i + 1];
};
const LIMIT = Number(argVal('--limit', 500));
const DRY = args.includes('--dry-run');

const SSH_KEY = process.env.SSH_KEY || path.join(process.env.HOME, '.ssh/larisid_hetzner');
const CONTABO_HOST = process.env.CONTABO_HOST || 'root@84.247.147.205';

function psql(sql) {
  return execFileSync('ssh', [
    '-i', SSH_KEY,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=20',
    CONTABO_HOST,
    'docker exec -i supabase-db psql -U postgres -t -A -v ON_ERROR_STOP=1',
  ], { input: sql, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

/** Postgres array literal. Keywords come from our own DB, but quote them properly
 *  anyway — a stray apostrophe would otherwise break the query. */
function pgArray(list) {
  return `array[${list.map((s) => `'${String(s).replace(/'/g, "''")}'`).join(',')}]`;
}

// ---------- 1. all qualifying keywords ----------
console.log('Pulling keyword aggregates from Contabo ...');
const aggSql = fs.readFileSync(path.join(SQL_DIR, 'riset-aggregates.sql'), 'utf8');
const aggRaw = psql(aggSql).trim();
if (!aggRaw) { console.error('FAIL: empty aggregate result'); process.exit(1); }
const all = JSON.parse(aggRaw);
console.log(`  ${all.length} keywords qualify`);

const doc = JSON.parse(fs.readFileSync(KW_FILE, 'utf8'));
const existing = doc.keywords;
const have = new Set(existing.map((k) => k.keyword));
const fresh = all.filter((r) => !have.has(r.keyword));
console.log(`  ${existing.length} published, ${fresh.length} not yet published`);

if (!fresh.length) { console.log('Nothing to add. Done.'); process.exit(0); }

const batch = fresh.slice(0, LIMIT);
console.log(`  taking ${batch.length} this run (--limit ${LIMIT})`);

if (DRY) {
  console.log('Dry run. Sample:', batch.slice(0, 5).map((r) => r.keyword).join(' | '));
  process.exit(0);
}

// ---------- 2. detail for this batch ----------
console.log('Pulling per-keyword detail ...');
const tpl = fs.readFileSync(path.join(SQL_DIR, 'riset-detail.sql.tpl'), 'utf8');
// replaceAll, not replace: the placeholder also appears in the template's own header
// comment, and replacing only the first occurrence leaves the real query untouched.
const detailSql = tpl.replaceAll('__KEYWORDS__', pgArray(batch.map((r) => r.keyword)));
const detailRaw = psql(detailSql).trim();
if (!detailRaw) { console.error('FAIL: empty detail result'); process.exit(1); }
const detailNew = JSON.parse(detailRaw);

// Every keyword in the batch must have detail, or its page renders with holes.
const missing = batch.filter((r) => !detailNew[r.keyword]);
if (missing.length) {
  console.error(`FAIL: ${missing.length} keywords came back without detail, e.g. ${missing.slice(0, 3).map((r) => r.keyword).join(', ')}`);
  process.exit(1);
}

// ---------- 3. append ----------
const shaped = batch.map((r) => ({
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
  snapshot_date: new Date().toISOString().slice(0, 10),
  scaled_note: `Batch ${new Date().toISOString().slice(0, 10)}: ${existing.length} existing + ${shaped.length} new = ${doc.keywords.length}. ${fresh.length - shaped.length} qualifying keywords still unpublished.`,
};

const detail = JSON.parse(fs.readFileSync(DETAIL_FILE, 'utf8'));
for (const [k, v] of Object.entries(detailNew)) detail[k] = v;

fs.writeFileSync(KW_FILE, JSON.stringify(doc, null, 2) + '\n');
fs.writeFileSync(DETAIL_FILE, JSON.stringify(detail, null, 2) + '\n');

console.log(`Appended ${shaped.length}. keywords=${doc.keywords.length} detail=${Object.keys(detail).length}`);
console.log(`Remaining unpublished: ${fresh.length - shaped.length}`);
console.log('Next: node scripts/build-seo-pages.mjs');
