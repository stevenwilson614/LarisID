#!/usr/bin/env node
/**
 * Pulls Indonesia's export trade flows from the UN Comtrade public preview API into
 * scripts/expor-trade.json, for the /expor/ (LarisExpor) product pages.
 *
 * Why Comtrade: it is the only free, citable source that answers "which country actually
 * buys this, and how big is Indonesia's share" — the question no competitor answers well.
 *
 * Run: node scripts/fetch-comtrade.mjs [--years 2021,2022,2023] [--force] [--only slug,slug]
 *
 * The API is free and needs NO key, but it has four traps this script exists to handle:
 *
 *  1. motCode is MODE OF TRANSPORT and the API returns one row PER MODE. For a single
 *     query the US came back three times: motCode 0 (all modes, $1,734.6m), 1000 (sea,
 *     $1,731.3m) and 9100 (air, $3.3m). Only motCode===0 is the true total; summing the
 *     raw rows inflates every figure. This is the Comtrade analogue of listings_deduped.
 *  2. reporterDesc/partnerDesc are ALWAYS null in preview, so names must be joined from
 *     the free reference files.
 *  3. partnerAreas contains residual aggregates -- "Areas, nes", "Other Asia, nes",
 *     "Bunkers", "Free Zones", "Special Categories", "Europe EU, nes" -- which are not
 *     destinations an exporter can target. The API's own isGroup flag is NOT sufficient:
 *     it is true for "World" and false for all 19 of the others, so they must be matched
 *     by name as well or they rank alongside real countries.
 *  4. Preview allows ONE period per call and caps at 500 records, and rate-limits with
 *     HTTP 429 after roughly 6-10 rapid calls. Commodity codes CAN be batched, so world
 *     totals go out ~20 codes at a time; per-destination breakdowns must go one at a time.
 *
 * Not every HS6 code has reported Indonesian trade (940151 "seats of bamboo or rattan"
 * returns zero rows), so each product falls back HS6 -> HS4 -> HS2 and records which level
 * actually produced the data. Pages must state that level rather than implying HS6 precision.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(__dirname, '_expor_raw', 'comtrade');
const OUT = path.join(__dirname, 'expor-trade.json');
const KEYWORDS = path.join(__dirname, 'expor-keywords.json');

const API = 'https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const REF_PARTNER = 'https://comtradeapi.un.org/files/v1/app/reference/partnerAreas.json';
const REF_HS = 'https://comtradeapi.un.org/files/v1/app/reference/H6.json';

const ID_REPORTER = 360;   // Indonesia
const FLOW_EXPORT = 'X';
const WORLD = 0;
const MOT_ALL = 0;         // all modes of transport -- the only non-duplicated rows
const CMD_BATCH = 20;      // commodity codes per world-total call
const THROTTLE_MS = 1300;  // 429 shows up at roughly 6-10 rapid calls
const MAX_RETRY = 4;
const TOP_DESTINATIONS = 8;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const FORCE = args.includes('--force');
const YEARS = flag('--years', '2021,2022,2023').split(',').map((y) => y.trim()).filter(Boolean);
const ONLY = flag('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const LATEST = YEARS[YEARS.length - 1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(RAW, { recursive: true });

let calls = 0, cached = 0;

/** GET with a disk cache, throttling, and 429 backoff. The cache makes re-runs free. */
async function get(url, cacheKey) {
  const file = path.join(RAW, `${cacheKey}.json`);
  if (!FORCE && fs.existsSync(file)) {
    cached++;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    if (calls > 0) await sleep(THROTTLE_MS * (attempt ? 2 ** attempt : 1));
    calls++;
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (e) {
      if (attempt === MAX_RETRY) throw e;
      process.stderr.write(`  network error, retrying: ${e.message}\n`);
      continue;
    }
    if (res.status === 429) {
      process.stderr.write(`  429 rate limited, backing off (attempt ${attempt + 1})\n`);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (attempt === MAX_RETRY) throw new Error(`HTTP ${res.status} for ${url} :: ${body.slice(0, 200)}`);
      continue;
    }
    const json = await res.json();
    fs.writeFileSync(file, JSON.stringify(json));
    return json;
  }
  throw new Error(`exhausted retries for ${url}`);
}

/** Only motCode===0 rows are real totals -- see trap 1. */
const totalsOnly = (json) => (json?.data || []).filter((r) => r.motCode === MOT_ALL);

/**
 * Residual aggregates masquerading as countries -- see trap 3. Matched by name because the
 * API's isGroup flag only catches "World". Observed in partnerAreas: Africa CAMEU region nes,
 * Areas nes, Bunkers, CACM nes, Caribbean nes, Eastern Europe nes, Europe EFTA nes,
 * Europe EU nes, Free Zones, LAIA nes, North America and Central America nes, Northern
 * Africa nes, Oceania nes, Other Africa nes, Other Asia nes, Other Europe nes, Rest of
 * America nes, Special Categories, Western Asia nes.
 */
const AGGREGATE_RE = /(,\s*nes$)|^(areas|bunkers|free zones|special categories|world)\b/i;
const isAggregate = (meta) => !meta || meta.isGroup || AGGREGATE_RE.test(meta.name);

async function loadPartnerNames() {
  const json = await get(REF_PARTNER, 'ref-partnerAreas');
  const arr = Array.isArray(json) ? json : json.results || json.data || [];
  const byCode = new Map();
  for (const p of arr) {
    const code = Number(p.PartnerCode ?? p.id);
    if (!Number.isFinite(code)) continue;
    byCode.set(code, {
      name: String(p.PartnerDesc ?? p.text ?? '').trim(),
      iso: p.PartnerCodeIsoAlpha2 || null,
      isGroup: !!p.isGroup,           // trap 3
    });
  }
  return byCode;
}

// Indonesian names for the destinations that actually show up; anything else keeps its
// English Comtrade name rather than being silently mislabelled.
const ID_NAMES = {
  'USA': 'Amerika Serikat', 'United States of America': 'Amerika Serikat',
  'Japan': 'Jepang', 'Netherlands': 'Belanda', 'Germany': 'Jerman', 'Belgium': 'Belgia',
  'Australia': 'Australia', 'China': 'Tiongkok', 'Rep. of Korea': 'Korea Selatan',
  'United Kingdom': 'Inggris', 'France': 'Prancis', 'Italy': 'Italia', 'Spain': 'Spanyol',
  'India': 'India', 'Singapore': 'Singapura', 'Malaysia': 'Malaysia', 'Thailand': 'Thailand',
  'Viet Nam': 'Vietnam', 'Philippines': 'Filipina', 'Saudi Arabia': 'Arab Saudi',
  'United Arab Emirates': 'Uni Emirat Arab', 'Canada': 'Kanada', 'Mexico': 'Meksiko',
  'Brazil': 'Brasil', 'Türkiye': 'Turki', 'Turkey': 'Turki', 'Egypt': 'Mesir',
  'Pakistan': 'Pakistan', 'Bangladesh': 'Bangladesh', 'Russian Federation': 'Rusia',
  'Poland': 'Polandia', 'Sweden': 'Swedia', 'Denmark': 'Denmark', 'Norway': 'Norwegia',
  'Finland': 'Finlandia', 'Switzerland': 'Swiss', 'Austria': 'Austria', 'Greece': 'Yunani',
  'Portugal': 'Portugal', 'Ireland': 'Irlandia', 'New Zealand': 'Selandia Baru',
  'South Africa': 'Afrika Selatan', 'Nigeria': 'Nigeria', 'Morocco': 'Maroko',
  'Chile': 'Cile', 'Argentina': 'Argentina', 'Colombia': 'Kolombia', 'Peru': 'Peru',
  'Hong Kong SAR': 'Hong Kong', 'China, Hong Kong SAR': 'Hong Kong',
  'China, Taiwan Province of': 'Taiwan', 'Other Asia, nes': 'Taiwan',
  'Czechia': 'Ceko', 'Hungary': 'Hungaria', 'Romania': 'Rumania', 'Ukraine': 'Ukraina',
  'Israel': 'Israel', 'Jordan': 'Yordania', 'Kuwait': 'Kuwait', 'Qatar': 'Qatar',
  'Oman': 'Oman', 'Yemen': 'Yaman', 'Iran': 'Iran', 'Iraq': 'Irak',
  'Sri Lanka': 'Sri Lanka', 'Myanmar': 'Myanmar', 'Cambodia': 'Kamboja',
  'Brunei Darussalam': 'Brunei', 'Papua New Guinea': 'Papua Nugini',
  'Timor-Leste': 'Timor Leste', 'Fiji': 'Fiji', 'Maldives': 'Maladewa',
};
const idName = (en) => ID_NAMES[en] || en;

const round = (n, d = 2) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);

/**
 * HS 2022 (H6) code -> official description. The preview API returns cmdDesc: null, and
 * pages must state which HS code the figures describe, so the reference is mandatory.
 *
 * It doubles as a validator. HS2022 restructured several headings and DROPPED codes
 * outright -- 940151 ("seats of bamboo or rattan") no longer exists, it became 940152
 * (bamboo) and 940153 (rattan). An invalid code returns HTTP 200 with zero rows, so
 * without this check a wrong code looks exactly like a product nobody exports.
 */
async function loadHsRef() {
  const json = await get(REF_HS, 'ref-H6');
  const arr = Array.isArray(json) ? json : json.results || json.data || [];
  const byId = new Map();
  for (const h of arr) {
    const id = String(h.id ?? '').trim();
    if (!id) continue;
    // text is "090111 - Coffee; not roasted or decaffeinated"
    const desc = String(h.text ?? '').replace(/^\s*\S+\s*-\s*/, '').trim();
    byId.set(id, desc || String(h.text || ''));
  }
  return byId;
}

async function main() {
  const corpus = JSON.parse(fs.readFileSync(KEYWORDS, 'utf8'));
  let products = corpus.keywords;
  if (ONLY.length) products = products.filter((p) => ONLY.includes(p.slug));
  if (!products.length) throw new Error('no products selected');

  const hsRef = await loadHsRef();
  const invalid = [...new Set(products.map((p) => p.hs))].filter((h) => !hsRef.has(h));
  if (invalid.length) {
    process.stderr.write(`\nWARNING: ${invalid.length} HS code(s) are not valid HS 2022 (H6) and will return zero rows:\n`);
    for (const h of invalid) {
      const slugs = products.filter((p) => p.hs === h).map((p) => p.slug).join(', ');
      process.stderr.write(`  ${h} -> ${slugs}\n`);
    }
    process.stderr.write('Fix them in scripts/expor-keywords.json before trusting this output.\n\n');
  } else {
    process.stderr.write(`All ${new Set(products.map((p) => p.hs)).size} HS codes validate against HS 2022 (H6)\n`);
  }

  const partners = await loadPartnerNames();
  const aggCount = [...partners.values()].filter(isAggregate).length;
  process.stderr.write(`Loaded ${partners.size} partner areas (${aggCount} residual aggregates excluded from destination rankings)\n`);

  // ---- Phase 1: world totals per HS code per year, batched by commodity ----
  // Collect every candidate code up front: HS6 plus its HS4/HS2 fallbacks.
  const codes = new Set();
  for (const p of products) { codes.add(p.hs); codes.add(p.hs4); codes.add(p.hs2); }
  const codeList = [...codes];
  process.stderr.write(`Phase 1: world totals for ${codeList.length} codes x ${YEARS.length} years\n`);

  // world[year][cmdCode] = { value, netWgt }
  const world = {};
  for (const year of YEARS) {
    world[year] = {};
    for (let i = 0; i < codeList.length; i += CMD_BATCH) {
      const batch = codeList.slice(i, i + CMD_BATCH);
      const url = `${API}?reporterCode=${ID_REPORTER}&period=${year}&flowCode=${FLOW_EXPORT}&partnerCode=${WORLD}&cmdCode=${batch.join(',')}`;
      const json = await get(url, `world-${year}-${i}`);
      for (const r of totalsOnly(json)) {
        world[year][String(r.cmdCode)] = {
          value: r.primaryValue || 0,
          netWgt: r.netWgt || null,
        };
      }
      process.stderr.write(`  ${year} batch ${i / CMD_BATCH + 1}/${Math.ceil(codeList.length / CMD_BATCH)} -> ${Object.keys(world[year]).length} codes with data\n`);
    }
  }

  // ---- Phase 2: pick the HS level that actually has data, then fetch destinations ----
  const out = [];
  let n = 0;
  for (const p of products) {
    n++;
    const chain = [
      { code: p.hs, level: 6 },
      { code: p.hs4, level: 4 },
      { code: p.hs2, level: 2 },
    ];
    const hit = chain.find((c) => (world[LATEST][c.code]?.value || 0) > 0);
    if (!hit) {
      process.stderr.write(`  [${n}/${products.length}] ${p.slug}: no Comtrade data at any HS level, skipping\n`);
      out.push({
        slug: p.slug, hs_used: null, hs_level: null,
        hs_desc: null, hs_desc_exact: hsRef.get(p.hs) || null,
        has_data: false,
        hs_valid: hsRef.has(p.hs),
      });
      continue;
    }

    const trend = YEARS.map((y) => ({
      year: Number(y),
      value: round(world[y][hit.code]?.value ?? 0, 0),
      netWgt: world[y][hit.code]?.netWgt ?? null,
    }));
    const latest = trend[trend.length - 1];

    // Destinations need partnerCode omitted, which cannot be batched with other codes
    // without risking the 500-record cap.
    const durl = `${API}?reporterCode=${ID_REPORTER}&period=${LATEST}&flowCode=${FLOW_EXPORT}&cmdCode=${hit.code}`;
    const djson = await get(durl, `dest-${LATEST}-${hit.code}`);
    const allRows = totalsOnly(djson).filter((r) => r.partnerCode !== WORLD);
    const rows = allRows.filter((r) => !isAggregate(partners.get(r.partnerCode)));
    const droppedValue = allRows
      .filter((r) => isAggregate(partners.get(r.partnerCode)))
      .reduce((a, r) => a + (r.primaryValue || 0), 0);

    const worldValue = latest.value || 0;
    const dest = rows
      .sort((a, b) => (b.primaryValue || 0) - (a.primaryValue || 0))
      .slice(0, TOP_DESTINATIONS)
      .map((r) => {
        const meta = partners.get(r.partnerCode);
        return {
          code: r.partnerCode,
          iso: meta.iso,
          name_en: meta.name,
          nama: idName(meta.name),
          value: round(r.primaryValue || 0, 0),
          share: worldValue > 0 ? round(((r.primaryValue || 0) / worldValue) * 100, 1) : null,
        };
      });

    // Export unit value: netWgt is kilograms, so this is Indonesia's realised FOB price
    // per kg -- the number that makes the Amazon retail comparison meaningful. Only where
    // netWgt is actually reported; many codes report none.
    const usdPerKg = latest.netWgt > 0 ? round(worldValue / latest.netWgt, 3) : null;

    const first = trend.find((t) => t.value > 0);
    const growth = first && first.value > 0 && first.year !== latest.year
      ? round(((worldValue - first.value) / first.value) * 100, 1)
      : null;

    out.push({
      slug: p.slug,
      hs_used: hit.code,
      hs_level: hit.level,
      // What the HS code actually covers. Always broader than one product -- several
      // corpus entries legitimately share a code (every coffee origin is 090111), so
      // pages must show this rather than implying the figures are product-specific.
      hs_desc: hsRef.get(hit.code) || null,
      hs_desc_exact: hsRef.get(p.hs) || null,
      has_data: true,
      year: Number(LATEST),
      world_value: worldValue,
      world_net_kg: latest.netWgt ?? null,
      usd_per_kg: usdPerKg,
      growth_pct: growth,
      destinations_total: rows.length,
      // How much of the world total sits in residual aggregates ("Areas, nes", Bunkers,
      // Free Zones). High values mean the destination breakdown is less complete.
      unallocated_value: round(droppedValue, 0),
      unallocated_share: worldValue > 0 ? round((droppedValue / worldValue) * 100, 1) : null,
      destinations: dest,
      trend,
    });
    process.stderr.write(`  [${n}/${products.length}] ${p.slug}: HS${hit.level} ${hit.code} -> $${(worldValue / 1e6).toFixed(1)}m, ${rows.length} destinations, top ${dest[0]?.nama || 'n/a'} ${dest[0]?.share ?? '?'}%\n`);
  }

  const withData = out.filter((o) => o.has_data);
  const result = {
    _meta: {
      source: 'UN Comtrade public preview API (free, no API key)',
      hs_revision: 'HS 2022 (H6); descriptions from the official Comtrade H6 reference because the preview API returns cmdDesc: null',
      source_url: API,
      reporter: 'Indonesia (360)',
      flow: 'Exports (X)',
      years: YEARS.map(Number),
      latest_year: Number(LATEST),
      dedupe: 'Only motCode=0 (all modes of transport) rows are used. The API returns one row per transport mode; summing them double-counts.',
      excluded: 'Residual aggregates (World, "Areas, nes", "Other Asia, nes", Bunkers, Free Zones, Special Categories, regional "nes" buckets) are excluded from destination rankings; the API isGroup flag only marks World, so they are matched by name. unallocated_share reports how much of the world total they held.',
      hs_fallback: 'Each product falls back HS6 -> HS4 -> HS2 until a level has reported trade. hs_level records which level the figures describe.',
      unit_value: 'usd_per_kg = world_value / world_net_kg, i.e. realised FOB export price. null where netWgt is not reported.',
      caveat: 'Trade flows describe Indonesia total exports at an HS code, not one seller and not one product variant. HS codes are broader than a single product.',
      fetched_at: new Date().toISOString(),
      products_with_data: withData.length,
      products_total: out.length,
    },
    products: out,
  };

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(`\nDone. ${withData.length}/${out.length} products have trade data. ${calls} API calls, ${cached} from cache.\n-> ${path.relative(ROOT, OUT)}\n`);
}

main().catch((e) => { process.stderr.write(`FATAL: ${e.stack || e.message}\n`); process.exit(1); });
