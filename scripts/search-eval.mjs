#!/usr/bin/env node
/**
 * Score resolve_market against scripts/data/search-golden.json.
 *
 *   node scripts/search-eval.mjs                 # fail on hard-case regressions
 *   node scripts/search-eval.mjs --all           # fail on every case
 *   node scripts/search-eval.mjs --baseline      # snapshot today's search_listings
 *                                                # into scripts/data/search-golden-baseline.json
 *
 * Read-only. Uses the public anon key, same as the browser.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = join(ROOT, 'scripts/data/search-golden.json');
const BASELINE = join(ROOT, 'scripts/data/search-golden-baseline.json');
const URL = process.env.LARISID_API || 'https://api.larisid.com';
const KEY = process.env.LARISID_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';

const args = new Set(process.argv.slice(2));
const baselineMode = args.has('--baseline');
const failAll = args.has('--all');

async function rpc(name, body) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = data && data.message ? data.message : text.slice(0, 240);
    throw new Error(`${name} ${res.status}: ${msg}`);
  }
  return data;
}

function keywordsOf(row) {
  const markets = Array.isArray(row?.markets) ? row.markets : [];
  return markets.map((m) => String(m.keyword || '')).filter(Boolean);
}

function check(spec, row) {
  const fails = [];
  const tier = String(row?.tier || '');
  const brand = row?.brand == null ? '' : String(row.brand);
  const corrected = String(row?.corrected_query || '');
  const kws = keywordsOf(row);
  const blob = kws.join(' | ').toLowerCase();
  if (spec.expect_tier && !spec.expect_tier.includes(tier)) {
    fails.push(`tier ${tier || '(empty)'} not in ${spec.expect_tier.join('/')}`);
  }
  if (spec.expect_brand != null && brand !== spec.expect_brand) {
    fails.push(`brand ${JSON.stringify(brand)} != ${JSON.stringify(spec.expect_brand)}`);
  }
  if (spec.expect_brand_missing != null && !!row?.brand_missing !== !!spec.expect_brand_missing) {
    fails.push(`brand_missing ${row?.brand_missing} != ${spec.expect_brand_missing}`);
  }
  if (spec.expect_corrected_includes && !corrected.toLowerCase().includes(spec.expect_corrected_includes.toLowerCase())) {
    fails.push(`corrected ${JSON.stringify(corrected)} missing ${spec.expect_corrected_includes}`);
  }
  if (spec.overlap && spec.overlap.length && !(spec.allow_empty && !kws.length && tier === 'none')) {
    const hit = spec.overlap.some((s) => blob.includes(String(s).toLowerCase()));
    if (!hit) fails.push(`no market overlapped ${spec.overlap.join(' / ')} (got ${kws.slice(0, 4).join(', ') || 'none'})`);
  }
  if (spec.forbid) {
    for (const s of spec.forbid) {
      if (blob.includes(String(s).toLowerCase())) fails.push(`forbidden ${s}`);
    }
  }
  return fails;
}

async function runEval() {
  const specs = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  let hardFail = 0;
  let softFail = 0;
  let ok = 0;
  for (const spec of specs) {
    let row;
    try {
      row = await rpc('resolve_market', { p_q: spec.q, p_city: 'ALL', p_limit: 8 });
    } catch (err) {
      console.log(`FAIL  ${spec.q}  ${err.message}`);
      if (spec.hard || failAll) hardFail += 1;
      else softFail += 1;
      continue;
    }
    const fails = check(spec, row);
    const kws = keywordsOf(row).slice(0, 3).join(', ');
    if (!fails.length) {
      ok += 1;
      console.log(`ok    ${spec.q}  ${row.tier}  ${row.corrected_query || ''}  ${kws}`);
    } else {
      const hard = spec.hard || failAll;
      if (hard) hardFail += 1;
      else softFail += 1;
      console.log(`${hard ? 'FAIL' : 'warn'}  ${spec.q}  ${fails.join('; ')}`);
    }
  }
  console.log(`\n${ok} ok, ${hardFail} hard fail, ${softFail} soft fail, ${specs.length} total`);
  if (hardFail) process.exit(1);
}

async function runBaseline() {
  const specs = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  const dirTiming = {
    'ayam grepuk': { match: 'keyword', listings: 201, note: 'dry cat food (makanan kucing kering)' },
    'sorel boots': { match: 'keyword', listings: 120, note: 'booth tent 3x3' },
    'birkenstok sandel': { match: 'keyword', listings: 155, note: 'generic sandals, no birkenstock' },
  };
  const out = {
    captured_at: new Date().toISOString(),
    method: 'search_listings RPC (pre-resolver) plus dir-timing on larisid.com for the three reported queries',
    dir_timing: dirTiming,
    queries: {},
  };
  for (const spec of specs) {
    try {
      const rows = await rpc('search_listings', {
        q: spec.q, lim: 8, off: 0, cats: null, price_min: null, price_max: null,
      });
      const list = Array.isArray(rows) ? rows : [];
      const kws = [];
      for (const r of list) {
        if (r.keyword && !kws.includes(r.keyword)) kws.push(r.keyword);
      }
      out.queries[spec.q] = {
        n: list.length,
        keywords: kws.slice(0, 6),
        sample: (list[0] && list[0].product_name) ? String(list[0].product_name).slice(0, 80) : '',
        dir_timing: dirTiming[spec.q] || null,
      };
      console.log(`${spec.q}  n=${list.length}  ${kws.slice(0, 3).join(', ')}`);
    } catch (err) {
      out.queries[spec.q] = { error: err.message };
      console.log(`${spec.q}  ERROR ${err.message}`);
    }
  }
  writeFileSync(BASELINE, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${BASELINE}`);
}

if (baselineMode) await runBaseline();
else await runEval();
