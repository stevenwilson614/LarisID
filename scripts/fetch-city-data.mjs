#!/usr/bin/env node
/**
 * Pulls the precomputed city market aggregates from Supabase into
 * scripts/city-data.json, ready for build-city-pages.mjs.
 *
 * The heavy lifting happens in the DB: refresh_seo_city_data() (migration
 * 20260709120000) aggregates the last 45 days of scrapes into one jsonb row
 * per seller city in public.seo_city_data. This script only reads that table
 * via the public REST API (anon key — the underlying listing data is already
 * publicly readable), so no secrets are needed here.
 *
 * Full refresh flow after a scrape lands:
 *   1. select refresh_seo_city_data();          -- service role, in SQL editor/MCP
 *   2. node scripts/fetch-city-data.mjs
 *   3. node scripts/build-city-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUPA_URL = 'https://bzmvlraziqevqdyotvgy.supabase.co';
const SUPA_KEY = 'sb_publishable_KDSWIJJLckser1e1hk7bbA_yMChRPog'; // public anon key

const res = await fetch(
  `${SUPA_URL}/rest/v1/seo_city_data?select=location,data,refreshed_at&order=location.asc`,
  { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
);
if (!res.ok) {
  console.error(`Supabase request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
if (!Array.isArray(rows) || !rows.length) {
  console.error('No rows in seo_city_data — run `select refresh_seo_city_data();` first.');
  process.exit(1);
}

const refreshed = rows.map((r) => r.refreshed_at).sort().at(-1);
const out = {
  snapshot: String(refreshed).slice(0, 10),
  window_days: 45,
  cities: Object.fromEntries(rows.map((r) => [r.location, r.data])),
};
const file = path.join(__dirname, 'city-data.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`Wrote ${rows.length} cities (snapshot ${out.snapshot}) to ${file}`);
