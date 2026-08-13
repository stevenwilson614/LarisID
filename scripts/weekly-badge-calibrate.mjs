#!/usr/bin/env node
/**
 * Calibrate the "Terlaris Minggu Ini" badge thresholds against live data.
 *
 * Read-only. Replicates mv_keyword_weekly (see
 * supabase/migrations/20260813120000_mv_keyword_weekly.sql) in JS so the floor
 * in docs/terlaris-minggu.md can be re-tuned without applying DDL first, and
 * so a future scrape-cadence change can be caught before it silently kills or
 * floods the badge.
 *
 * Usage:
 *   node scripts/weekly-badge-calibrate.mjs
 *   node scripts/weekly-badge-calibrate.mjs "Dapur" "Olahraga & Outdoor"
 */

const SUPA_URL = 'https://api.larisid.com';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg0MzM2Njc5LCJleHAiOjI0MTUwNTY2Nzl9.IuuxcLjM-ljEyrn2lInAqzESImYfMXlBBTZI2i671Ec';
const HDR = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

// Keep these in step with markTerlarisMinggu() in js/gpt-app.js.
const MIN_UNITS = 25;
const MIN_ITEMS = 2;
const SPAN_MIN = 7;
const SPAN_MAX = 21;
const DAY = 86400000;

const CATS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['Olahraga & Outdoor', 'Dapur', 'Perlengkapan Ibadah'];

async function rest(path) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: HDR });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()} — ${path}`);
  return res.json();
}

/** Port of public._lid_corr_sold_delta(). */
function corrSoldDelta(s1, s0, r1, r0, days) {
  if (s0 == null || s1 == null) return 0;
  const d = Math.max(1, days);
  const dr = (r1 || 0) - (r0 || 0);
  if (s1 === s0) return Math.min(Math.max(0, Math.round(dr * 3.2)), 500 * d);
  const bucketJump = (s1 - s0) > 500 * d
    || (s0 > 0 && s1 / s0 >= 3 && (s1 - s0) >= 10000)
    || (s1 >= 10000 && s0 < 10000);
  if (bucketJump) {
    const revEst = dr > 0 ? Math.round(dr * 3.2) : 500 * d;
    return Math.min(Math.max(0, s1 - s0), revEst, 500 * d);
  }
  return Math.max(0, s1 - s0);
}

/** One keyword -> the row mv_keyword_weekly would produce. */
function rollup(listings, t0) {
  const byItem = new Map();
  for (const r of listings) {
    if (r.total_sold == null || r.product_name == null || r.item_id == null) continue;
    if (!(r.price >= 1000 && r.price <= 50_000_000)) continue;
    const t = Date.parse(r.scraped_at);
    if (t <= t0 - 45 * DAY) continue;
    const k = `${r.item_id}|${r.shop_id}`;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push({ ...r, t });
  }

  let units = 0, base = 0, items = 0;
  const spans = [];
  for (const obs of byItem.values()) {
    obs.sort((a, b) => b.t - a.t);
    const cur = obs[0];
    if (cur.t <= t0 - 10 * DAY) continue;          // listing itself is stale
    const prev = obs.find(o => o.t <= t0 - 7 * DAY);
    if (!prev) continue;                            // no baseline at all
    const span = (cur.t - prev.t) / DAY;
    if (span < SPAN_MIN || span > SPAN_MAX) continue;
    const d = corrSoldDelta(cur.total_sold, prev.total_sold, cur.reviews, prev.reviews, Math.ceil(span));
    units += d * 7 / span;                          // 7-day-equivalent rate
    base += Math.max(0, (cur.total_sold || 0) - d);
    if (d > 0) items++;
    spans.push(span);
  }
  if (!spans.length) return null;
  spans.sort((a, b) => a - b);
  const wkUnits = Math.round(units);
  const pct = base >= 50 ? Math.round(wkUnits / base * 100) : null;
  return {
    wkUnits, wkBase: base, wkItems: items,
    span: Math.round(spans[Math.floor(spans.length / 2)]), pct,
    listings: byItem.size,
  };
}

const [{ anchor_at: anchorAt }] = await rest('mv_trending?select=anchor_at&limit=1');
const t0 = Date.parse(anchorAt);
console.log(`anchor t0 = ${anchorAt}`);
console.log(`floor: wk_units >= ${MIN_UNITS}, wk_items >= ${MIN_ITEMS}, pct > 0, span ${SPAN_MIN}-${SPAN_MAX}d\n`);

for (const cat of CATS) {
  const kws = await rest(
    'product_types_v?select=keyword&city=eq.ALL'
    + `&category_canonical=eq.${encodeURIComponent(cat)}`
    + '&order=omset_top15.desc&limit=40'
  );
  const rows = [];
  for (const { keyword } of kws) {
    const listings = await rest(
      'listings?select=item_id,shop_id,total_sold,reviews,price,product_name,scraped_at'
      + `&keyword=eq.${encodeURIComponent(keyword)}&order=scraped_at.desc&limit=3000`
    );
    const r = rollup(listings, t0);
    if (r) rows.push({ keyword, ...r });
  }
  rows.sort((a, b) => b.wkUnits - a.wkUnits);
  const eligible = rows.filter(r => r.wkUnits >= MIN_UNITS && r.wkItems >= MIN_ITEMS && (r.pct || 0) > 0);

  console.log(`### ${cat}`);
  console.log(`    ${kws.length} keywords sampled, ${rows.length} with a usable span, ${eligible.length} clear the floor`);
  for (const r of rows.slice(0, 10)) {
    const flag = eligible.includes(r) ? 'BADGE' : '  --  ';
    console.log(
      `    ${flag} ${r.keyword.slice(0, 38).padEnd(38)} units/wk=${String(r.wkUnits).padStart(6)}`
      + ` items=${String(r.wkItems).padStart(4)} span=${String(r.span).padStart(3)}d`
      + ` base=${String(r.wkBase).padStart(8)} pct=${r.pct}`
    );
  }
  console.log('');
}
