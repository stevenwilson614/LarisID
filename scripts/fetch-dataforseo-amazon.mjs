#!/usr/bin/env node
/**
 * Pulls Amazon US demand + listing samples from DataForSEO into
 * scripts/expor-amazon.json, for the /expor/ (LarisExpor) product pages.
 *
 * Run (after funding the account):
 *   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... node scripts/fetch-dataforseo-amazon.mjs
 *
 * Flags: --force  ignore the disk cache    --only slug,slug
 *
 * This script is a no-op without credentials on purpose. Never fabricate a
 * search volume or a price — build-expor.mjs already degrades to an honest
 * empty Amazon section when this file is absent.
 *
 * Two endpoints, billed separately:
 *   1. dataforseo_labs/amazon/bulk_search_volume/live  — all keywords in one call
 *   2. merchant/amazon/products/task_post → task_get/advanced — SERP sample per keyword
 *
 * Reviews endpoint is documented temporarily unavailable; we never call it.
 * Review counts on the SERP items are a competition proxy, labelled as such
 * on the generated pages, never as units sold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(__dirname, '_expor_raw', 'amazon');
const OUT = path.join(__dirname, 'expor-amazon.json');
const KEYWORDS = path.join(__dirname, 'expor-keywords.json');

const API = 'https://api.dataforseo.com/v3';
const LOCATION_NAME = 'United States';
const LOCATION_CODE = 2840;
const LANGUAGE_NAME = 'English';
const LANGUAGE_CODE = 'en_US';
const SERP_DEPTH = 20;
const POST_BATCH = 8;
const POLL_MS = 8000;
const POLL_MAX = 24;
const TOP_ASINS = 5;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY = (() => {
  const i = args.indexOf('--only');
  return i >= 0 && args[i + 1] ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : [];
})();

const LOGIN = process.env.DATAFORSEO_LOGIN || '';
const PASSWORD = process.env.DATAFORSEO_PASSWORD || '';
if (!LOGIN || !PASSWORD) {
  process.stderr.write(
    'FATAL: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are not set.\n' +
    'Create and fund a DataForSEO account, then re-run. This script will not invent prices.\n',
  );
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(`${LOGIN}:${PASSWORD}`).toString('base64');
fs.mkdirSync(RAW, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(pathname, payload, cacheKey) {
  const file = path.join(RAW, `${cacheKey}.json`);
  if (!FORCE && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  if (!res.ok || json.status_code >= 40000) {
    throw new Error(`${pathname} HTTP ${res.status} status_code=${json.status_code} ${json.status_message || ''}`);
  }
  return json;
}

async function get(pathname, cacheKey) {
  const file = path.join(RAW, `${cacheKey}.json`);
  if (!FORCE && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const res = await fetch(`${API}${pathname}`, {
    headers: { Authorization: AUTH, accept: 'application/json' },
  });
  const json = await res.json();
  if (json.status_code === 40601 || json.status_code === 40602) {
    // Task still in queue / in progress — do not cache.
    return json;
  }
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function itemPrice(it) {
  const p = it.price;
  if (p && typeof p === 'object') {
    const n = Number(p.current ?? p.value ?? p.current_price);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const n = Number(it.price_from ?? it.price_to ?? it.price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function itemReviews(it) {
  const n = Number(it.reviews_count ?? it.reviews ?? it.rating?.votes_count);
  return Number.isFinite(n) ? n : null;
}

function itemRating(it) {
  const n = Number(it.rating?.value ?? it.rating?.rating_value ?? it.rating);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const corpus = JSON.parse(fs.readFileSync(KEYWORDS, 'utf8'));
  let products = corpus.keywords;
  if (ONLY.length) products = products.filter((p) => ONLY.includes(p.slug));
  if (!products.length) throw new Error('no products selected');

  const kws = [...new Set(products.map((p) => p.kw))];
  process.stderr.write(`DataForSEO Amazon US: ${products.length} products, ${kws.length} unique keywords\n`);

  // ---- 1. search volume, one call ----
  process.stderr.write('Phase 1: bulk_search_volume\n');
  const volJson = await post('/dataforseo_labs/amazon/bulk_search_volume/live', [{
    keywords: kws,
    location_name: LOCATION_NAME,
    language_name: LANGUAGE_NAME,
  }], 'volume-us');
  const volByKw = new Map();
  for (const task of volJson.tasks || []) {
    for (const result of task.result || []) {
      for (const item of result.items || []) {
        volByKw.set(String(item.keyword || '').toLowerCase(), item.search_volume ?? null);
      }
    }
  }
  process.stderr.write(`  volumes for ${volByKw.size} keywords\n`);

  // ---- 2. SERP samples, batched task_post then poll ----
  process.stderr.write(`Phase 2: products SERP (depth ${SERP_DEPTH}), ${kws.length} tasks\n`);
  const tasks = [];
  for (let i = 0; i < kws.length; i += POST_BATCH) {
    const batch = kws.slice(i, i + POST_BATCH);
    const payload = batch.map((kw) => ({
      keyword: kw,
      location_code: LOCATION_CODE,
      language_code: LANGUAGE_CODE,
      depth: SERP_DEPTH,
    }));
    const json = await post('/merchant/amazon/products/task_post', payload, `post-${i}`);
    for (const t of json.tasks || []) {
      if (t.id) tasks.push({ id: t.id, kw: t.data?.keyword || batch[tasks.length % batch.length] });
    }
    process.stderr.write(`  posted ${Math.min(i + POST_BATCH, kws.length)}/${kws.length}\n`);
    await sleep(400);
  }

  const serpByKw = new Map();
  for (const t of tasks) {
    let json = null;
    for (let attempt = 0; attempt < POLL_MAX; attempt++) {
      json = await get(`/merchant/amazon/products/task_get/advanced/${t.id}`, `get-${t.id}`);
      const code = json.tasks?.[0]?.status_code ?? json.status_code;
      if (code === 20000) break;
      if (code && code !== 40601 && code !== 40602 && code >= 40000) {
        process.stderr.write(`  task ${t.id} (${t.kw}) failed: ${code} ${json.tasks?.[0]?.status_message || ''}\n`);
        json = null;
        break;
      }
      await sleep(POLL_MS);
    }
    const items = json?.tasks?.[0]?.result?.[0]?.items || [];
    serpByKw.set(String(t.kw || '').toLowerCase(), items);
    process.stderr.write(`  ${t.kw}: ${items.length} items\n`);
  }

  const fetchedAt = new Date().toISOString().slice(0, 10);
  const out = [];
  for (const p of products) {
    const key = String(p.kw).toLowerCase();
    const items = serpByKw.get(key) || [];
    const prices = items.map(itemPrice).filter((n) => n != null);
    const reviews = items.map(itemReviews).filter((n) => n != null);
    const top = items.slice(0, TOP_ASINS).map((it) => ({
      asin: it.asin || null,
      title: String(it.title || '').slice(0, 180),
      price: itemPrice(it),
      rating: itemRating(it),
      reviews: itemReviews(it),
    }));
    out.push({
      slug: p.slug,
      kw: p.kw,
      search_volume: volByKw.get(key) ?? null,
      results_count: items.length || null,
      price_min: prices.length ? Math.min(...prices) : null,
      price_median: median(prices),
      price_max: prices.length ? Math.max(...prices) : null,
      reviews_median: median(reviews),
      top_asins: top,
      fetched_at: fetchedAt,
    });
  }

  const withPrice = out.filter((o) => o.price_median != null);
  const result = {
    _meta: {
      source: 'DataForSEO Amazon US (bulk_search_volume + merchant/amazon/products)',
      location: LOCATION_NAME,
      location_code: LOCATION_CODE,
      language: LANGUAGE_CODE,
      depth: SERP_DEPTH,
      honesty: 'Amazon exposes no country-of-origin field. These are search results for English keywords mapped to Indonesian export goods, not "Indonesian products found on Amazon". Review counts are a competition proxy, not units sold.',
      fetched_at: new Date().toISOString(),
      products_with_price: withPrice.length,
      products_total: out.length,
    },
    products: out,
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(`\nDone. ${withPrice.length}/${out.length} products have a price sample.\n-> ${path.relative(ROOT, OUT)}\nThen: node scripts/build-expor.mjs\n`);
}

main().catch((e) => { process.stderr.write(`FATAL: ${e.stack || e.message}\n`); process.exit(1); });
