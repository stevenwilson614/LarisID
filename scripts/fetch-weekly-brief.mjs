#!/usr/bin/env node
/**
 * Pull the public weekly-brief rows from Contabo into scripts/weekly-brief.json.
 *
 * Read-only. Same SSH key as scripts/fetch-coverage.sh. The page date is not
 * decided here — build-weekly-brief.mjs stamps the coverage snapshot, and it
 * writes nothing when that snapshot already has a brief.
 *
 * Usage: node scripts/fetch-weekly-brief.mjs
 * Env:   SSH_KEY (default ~/.ssh/larisid_hetzner), CONTABO_HOST
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SSH_KEY = process.env.SSH_KEY || path.join(process.env.HOME, '.ssh/larisid_hetzner');
const CONTABO_HOST = process.env.CONTABO_HOST || 'root@84.247.147.205';
const OUT = path.join(__dirname, 'weekly-brief.json');
const SQL = fs.readFileSync(path.join(__dirname, 'sql/weekly-brief.sql'), 'utf8');

console.log(`Pulling weekly brief from ${CONTABO_HOST} ...`);
const raw = execFileSync('ssh', [
  '-i', SSH_KEY,
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=20',
  CONTABO_HOST,
  'docker exec -i supabase-db psql -U postgres -t -A -v ON_ERROR_STOP=1',
], { input: SQL, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

if (!raw) {
  console.error('FAIL: empty result from psql');
  process.exit(1);
}
const parsed = JSON.parse(raw);
const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
if (!rows.length) {
  console.error('FAIL: mv_keyword_weekly returned no rows above the badge floors');
  process.exit(1);
}
for (const r of rows) {
  if (!r.keyword || r.wk_units == null || r.wk_span_days == null) {
    console.error('FAIL: row missing keyword, wk_units, or wk_span_days');
    process.exit(1);
  }
}
const doc = {
  pulled_at: new Date().toISOString(),
  rows,
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${rows.length} keywords)`);
