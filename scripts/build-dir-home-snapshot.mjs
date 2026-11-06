#!/usr/bin/env node
/**
 * Default Cari Produk snapshot: listings_home rows plus the weekly % the
 * table already shows. The browser paints this file and skips the database
 * when generated_at is within 36 hours (DIR_HOME_SNAP_TTL in js/gpt-app.js).
 *
 * The percent is listing_chart_wow — this WIB week vs the previous one —
 * the same pair trendFromMomentum() reads. It is not momentum_pct.
 *
 * Reads as postgres (docker on the VPS, else SSH) so the anon 3s statement
 * cap does not apply. --via api uses the public RPC instead.
 *
 *   node scripts/build-dir-home-snapshot.mjs
 *   node scripts/build-dir-home-snapshot.mjs --out /path/to/dir-home.json
 *   node scripts/build-dir-home-snapshot.mjs --via api
 *
 * Cron (after refresh_breakout_matviews at 16:15 UTC): scripts/schedule-dir-home-snapshot.sh
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = process.env.LARISID_API_URL || process.env.LARISID_API || 'https://api.larisid.com';
const KEY = process.env.LARISID_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
const SSH_KEY = process.env.LARISID_SSH_KEY || join(homedir(), '.ssh', 'larisid_hetzner');
const SSH_HOST = process.env.LARISID_SSH_HOST || 'root@84.247.147.205';

const CHUNK = 40;
const MIN_WITH_PCT = 10;

const LISTINGS_SQL = `
set statement_timeout = '180s';
set lock_timeout = '20s';
select coalesce(json_agg(row_to_json(x)), '[]'::json)::text
from (
  select
    l.item_id, l.shop_id, l.product_name, l.store_name, l.price, l.original_price,
    l.total_sold, l.reviews, l.rating, l.location, l.image_url, l.url,
    l.keyword, l.category, l.listing_date, l.nowcast_velocity_daily,
    l.nowcast_omset_monthly, l.nowcast_confidence, l.nowcast_method,
    l.is_ad, l.search_rank, l.in_stock, l.wishlist
  from (
    select t.keyword
    from public.product_types_v t
    where t.city = 'ALL'
      and t.n_listings >= 3
      and t.wk_units >= 25
      and t.wk_items >= 2
      and t.wk_pct > 0
      and coalesce((select mi.kind from public.market_index mi where mi.keyword = t.keyword), 'product')
          in ('product', 'unknown')
    order by t.wk_units desc
    limit 15
  ) k
  cross join lateral (
    select d.*
    from public.listings_deduped d
    where d.keyword = k.keyword
      and not d.is_offtopic
      and d.total_sold > 0
    order by d.total_sold desc
    limit 20
  ) l
  order by l.nowcast_omset_monthly desc nulls last, l.total_sold desc
  limit 300
) x;
`;

function argOut() {
  const i = process.argv.indexOf('--out');
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return join(ROOT, 'data', 'dir-home.json');
}

function viaApi() {
  return process.argv.includes('--via api') || process.argv.includes('--via=api');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function emptyTrend() {
  return {
    wkPct: null,
    wkPctRaw: null,
    moPct: null,
    terukur: false,
    held: false,
    belum: true,
    pending: false,
    unitsNowWk: null,
    unitsPrevWk: null,
    spanNow: null,
    spanPrev: null,
    at0: null,
    at1: null,
    at2: null,
    prevMeasured: false,
    omsetNow: null,
    omsetPrev: null,
    weekNow: null,
    weekPrev: null,
  };
}

/** Port of chartWowPct + trendFromMomentum in js/peta-peluang.js. */
function trendFromChart(m) {
  if (!m) return emptyTrend();
  const nowOm = num(m.chart_omset_now != null ? m.chart_omset_now : m.omset_now);
  const prevOm = num(m.chart_omset_prev != null ? m.chart_omset_prev : m.omset_prev);
  let pct = null;
  if (nowOm != null && prevOm != null) pct = prevOm > 0 ? ((nowOm - prevOm) / prevOm) * 100 : 0;
  const belum = pct == null;
  const nowMeasured = (m.chart_now_measured != null ? m.chart_now_measured : m.now_measured) === true;
  const prevMeasured = (m.chart_prev_measured != null ? m.chart_prev_measured : m.prev_measured) === true;
  const weekNow = m.chart_week_now || m.week_now || null;
  const weekPrev = m.chart_week_prev || m.week_prev || null;
  return {
    wkPct: belum ? null : pct,
    wkPctRaw: belum ? null : pct,
    moPct: null,
    terukur: !belum && nowMeasured && prevMeasured,
    held: false,
    belum,
    pending: false,
    unitsNowWk: num(m.chart_units_now != null ? m.chart_units_now : m.units_now),
    unitsPrevWk: num(m.chart_units_prev != null ? m.chart_units_prev : m.units_prev),
    spanNow: 7,
    spanPrev: 7,
    at0: weekNow,
    at1: weekPrev,
    at2: null,
    prevMeasured,
    omsetNow: nowOm,
    omsetPrev: prevOm,
    weekNow,
    weekPrev,
  };
}

function dockerDb() {
  try {
    execFileSync('docker', ['exec', 'supabase-db', 'true'], { stdio: 'ignore', timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

let _psqlMode;
function psqlMode() {
  if (_psqlMode !== undefined) return _psqlMode;
  if (viaApi()) _psqlMode = null;
  else if (process.env.DIR_HOME_PSQL === 'docker' || dockerDb()) _psqlMode = 'docker';
  else if (existsSync(SSH_KEY)) _psqlMode = 'ssh';
  else _psqlMode = null;
  return _psqlMode;
}

function psql(sql) {
  const mode = psqlMode();
  const psqlArgs = ['exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'];
  const opts = { input: sql, encoding: 'utf8', timeout: 200000, maxBuffer: 32 * 1024 * 1024 };
  if (mode === 'docker') return execFileSync('docker', psqlArgs, opts);
  if (mode === 'ssh') {
    return execFileSync('ssh', [
      '-i', SSH_KEY, '-o', 'ConnectTimeout=20', '-o', 'BatchMode=yes', SSH_HOST,
      'docker exec -i supabase-db psql -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=1',
    ], opts);
  }
  throw new Error('no postgres path');
}

function parsePsqlJson(text) {
  const lines = String(text).split('\n').map((s) => s.trim()).filter(Boolean);
  const line = [...lines].reverse().find((s) => s.startsWith('[') || s.startsWith('{'));
  if (!line) throw new Error(`psql returned no json: ${String(text).slice(0, 240)}`);
  return JSON.parse(line);
}

async function rpc(name, body) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      if (!res.ok) {
        const msg = data && data.message ? data.message : String(text).slice(0, 240);
        throw new Error(`${name} ${res.status}: ${msg}`);
      }
      return data;
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

function wowSql(keys) {
  const payload = JSON.stringify(keys);
  return `
set statement_timeout = '180s';
set lock_timeout = '20s';
select coalesce(json_agg(row_to_json(w)), '[]'::json)::text
from public.listing_chart_wow('${payload}'::jsonb) w;
`;
}

async function chartRows(keys, mode) {
  const rows = [];
  const parts = chunks(keys, CHUNK);
  for (let i = 0; i < parts.length; i++) {
    let batch;
    if (mode) batch = parsePsqlJson(psql(wowSql(parts[i])));
    else batch = await rpc('listing_chart_wow', { p_keys: parts[i] });
    if (!Array.isArray(batch)) throw new Error('listing_chart_wow did not return rows');
    rows.push(...batch);
    console.log(`[dir-home] chart ${i + 1}/${parts.length} (${batch.length} rows)`);
  }
  return rows;
}

function keywordsOf(listings) {
  const seen = new Set();
  const keywords = [];
  for (const row of listings) {
    const keyword = row && row.keyword;
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push({ keyword });
  }
  return keywords;
}

async function loadRaw() {
  const mode = psqlMode();
  if (mode) {
    console.log(`[dir-home] listings via postgres (${mode})`);
    const raw = parsePsqlJson(psql(LISTINGS_SQL));
    if (!Array.isArray(raw)) throw new Error('listings query did not return rows');
    return { raw, mode };
  }
  console.log(`[dir-home] listings_home via ${API}`);
  const raw = await rpc('listings_home', { p_max: 300 });
  if (!Array.isArray(raw)) throw new Error('listings_home did not return rows');
  return { raw, mode: null };
}

async function main() {
  const outPath = argOut();
  const { raw, mode } = await loadRaw();
  if (!raw.length) throw new Error('no home listings — left the previous file in place');
  const seenKey = new Set();
  const keys = [];
  for (const row of raw) {
    if (!row || row.item_id == null || row.shop_id == null) continue;
    const id = `${row.item_id}|${row.shop_id}`;
    if (seenKey.has(id)) continue;
    seenKey.add(id);
    keys.push({ item_id: Number(row.item_id), shop_id: Number(row.shop_id) });
  }
  const wowRows = await chartRows(keys, mode);
  const wow = new Map(wowRows.map((row) => [`${row.item_id}|${row.shop_id}`, row]));
  const listings = raw.map((row) => {
    const src = wow.get(`${row.item_id}|${row.shop_id}`);
    return { ...row, trend: trendFromChart(src) };
  });
  const withPct = listings.filter((row) => row.trend && row.trend.wkPct != null && !row.trend.belum).length;
  if (withPct < Math.min(MIN_WITH_PCT, listings.length)) {
    throw new Error(`only ${withPct} rows have a weekly percent — left the previous file in place`);
  }
  const payload = {
    v: 1,
    generated_at: new Date().toISOString(),
    keywords: keywordsOf(listings),
    listings,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload));
  renameSync(tmp, outPath);
  console.log(`[dir-home] wrote ${listings.length} listings (${withPct} with %) → ${outPath}`);
}

main().catch((err) => {
  console.error('[dir-home]', err && err.message ? err.message : err);
  process.exit(1);
});
