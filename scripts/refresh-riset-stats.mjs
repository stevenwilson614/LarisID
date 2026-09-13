#!/usr/bin/env node
/**
 * Refreshes the stats behind the ALREADY-PUBLISHED /riset/ pages, in place.
 *
 * Why this exists: fetch-riset-batch.mjs is append-only, so it never revisits an
 * entry once published. Left alone, the first batch's numbers stay frozen at their
 * original scrape date while the corpus underneath them keeps growing — by
 * 2026-09-13 the June batch was reporting ~30% fewer listings than we actually had
 * and a median price ~13% off. Stale numbers on a page whose whole value
 * proposition is current market data is both an accuracy problem and a
 * freshness signal we were throwing away.
 *
 * This script only ever OVERWRITES the values of existing entries. It does not
 * append, reorder or remove, so seo-keywords.json stays append-only by index
 * (page order is the array index) and ci-static-checks.sh still passes.
 *
 * Usage:
 *   node scripts/refresh-riset-stats.mjs [--dry-run] [--batch 150]
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
const DRY = args.includes('--dry-run');
const BATCH = Number(argVal('--batch', 150));

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

const doc = JSON.parse(fs.readFileSync(KW_FILE, 'utf8'));
const published = doc.keywords;
console.log(`${published.length} published /riset/ keywords`);

// ---------- 1. headline stats ----------
console.log('Pulling keyword aggregates from Contabo ...');
const aggRaw = psql(fs.readFileSync(path.join(SQL_DIR, 'riset-aggregates.sql'), 'utf8')).trim();
if (!aggRaw) { console.error('FAIL: empty aggregate result'); process.exit(1); }
const fresh = new Map(JSON.parse(aggRaw).map((r) => [r.keyword, r]));

// A published keyword that no longer clears the qualification gate keeps its old
// numbers rather than losing them: the page is live and indexed either way, and a
// half-updated entry is worse than a consistently old one.
const stale = published.filter((k) => !fresh.has(k.keyword));
if (stale.length) {
  console.log(`  ${stale.length} published keywords no longer qualify; leaving their stats untouched`);
}

// ---------- 2. per-keyword detail ----------
// Only for the keywords whose stats we are actually refreshing, so that a page's
// headline numbers and its region / price-band sections always share one vintage.
const targets = published.filter((k) => fresh.has(k.keyword)).map((k) => k.keyword);
console.log(`Pulling detail for ${targets.length} keywords ...`);
const tpl = fs.readFileSync(path.join(SQL_DIR, 'riset-detail.sql.tpl'), 'utf8');
const detailNew = {};
for (let i = 0; i < targets.length; i += BATCH) {
  const slice = targets.slice(i, i + BATCH);
  process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1}: ${slice.length} ... `);
  // replaceAll, not replace: the placeholder also appears in the template's own
  // header comment, and replacing only the first occurrence leaves the query untouched.
  const raw = psql(tpl.replaceAll('__KEYWORDS__', pgArray(slice))).trim();
  if (!raw) { console.error('FAIL: empty detail result'); process.exit(1); }
  let got = 0;
  for (const [k, v] of Object.entries(JSON.parse(raw))) { detailNew[k] = v; got++; }
  console.log(`${got} returned`);
}

// A page whose detail came back empty would render without its top-products table,
// so drop those from the refresh instead of writing a hollow entry.
const noDetail = targets.filter((k) => !detailNew[k] || !Array.isArray(detailNew[k].top) || !detailNew[k].top.length);
if (noDetail.length) {
  console.log(`  ${noDetail.length} keywords came back without usable detail; leaving them untouched`);
  for (const k of noDetail) delete detailNew[k];
}

if (DRY) {
  console.log(`Dry run. Would refresh ${Object.keys(detailNew).length} entries.`);
  process.exit(0);
}

// ---------- 3. write back, in place ----------
const NUMERIC = ['category', 'n', 'avgPrice', 'medPrice', 'minPrice', 'p90Price', 'estSold', 'reviews', 'rating'];
let statsUpdated = 0;
for (const entry of published) {
  const r = fresh.get(entry.keyword);
  if (!r || !detailNew[entry.keyword]) continue;
  for (const f of NUMERIC) if (r[f] !== undefined && r[f] !== null) entry[f] = r[f];
  statsUpdated++;
}

const detail = JSON.parse(fs.readFileSync(DETAIL_FILE, 'utf8'));
for (const [k, v] of Object.entries(detailNew)) detail[k] = v;

const today = new Date().toISOString().slice(0, 10);
doc._meta = {
  ...doc._meta,
  snapshot_date: today,
  scaled_note: `${doc.keywords.length} published. Refreshed ${today}: ${statsUpdated} entries re-pulled in place (stats + detail).`,
};

fs.writeFileSync(KW_FILE, JSON.stringify(doc, null, 2) + '\n');
fs.writeFileSync(DETAIL_FILE, JSON.stringify(detail, null, 2) + '\n');

console.log(`Refreshed ${statsUpdated} entries. snapshot_date=${today}`);
console.log('Next: node scripts/build-seo-pages.mjs');
