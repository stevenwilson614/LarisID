#!/usr/bin/env node
/**
 * Optional Census International Trade API → data/census-aggregates.json
 * Country×HS aggregates only (Indonesia origin, US imports). Not named importers.
 *
 *   CENSUS_API_KEY=… node lab/expor-os/collectors/fetch-census-imports.mjs
 *
 * Free key: https://api.census.gov/data/key_signup.html
 */
import path from 'node:path';
import { DATA, RAW, loadCorpus, readJson, writeJson } from '../lib/paths.mjs';
import fs from 'node:fs';

const KEY = process.env.CENSUS_API_KEY || '';
const YEAR = process.env.CENSUS_YEAR || '2024';
const CTY = '5600'; // Indonesia

if (!KEY) {
  process.stderr.write(
    'CENSUS_API_KEY is not set. Skipping. Kartu will use Comtrade ID→US destination rows (agregat, bukan nama importer).\n' +
    'Get a free key: https://api.census.gov/data/key_signup.html\n',
  );
  process.exit(0);
}

const pilots = readJson(path.join(DATA, 'pilots.json'));
const { bySlug } = loadCorpus();
const hsSet = [...new Set(pilots.slugs.map((s) => bySlug.get(s)?.hs).filter(Boolean))];

fs.mkdirSync(path.join(RAW, 'census'), { recursive: true });

const by_hs6 = {};
for (const hs of hsSet) {
  const url = `https://api.census.gov/data/timeseries/intltrade/imports/hs?get=I_COMMODITY,CTY_NAME,GEN_VAL_YR,CON_VAL_YR&YEAR=${YEAR}&CTY_CODE=${CTY}&I_COMMODITY=${hs}&COMM_LVL=HS6&key=${encodeURIComponent(KEY)}`;
  const res = await fetch(url);
  const text = await res.text();
  fs.writeFileSync(path.join(RAW, 'census', `${hs}.json`), text);
  if (!res.ok) {
    process.stderr.write(`WARN ${hs}: HTTP ${res.status}\n`);
    continue;
  }
  let json;
  try { json = JSON.parse(text); } catch {
    process.stderr.write(`WARN ${hs}: not JSON\n`);
    continue;
  }
  if (!Array.isArray(json) || json.length < 2) {
    by_hs6[hs] = { year: YEAR, origin: 'Indonesia', gen_val_yr: null, note: 'no census row' };
    continue;
  }
  const head = json[0];
  const row = json[1];
  const obj = Object.fromEntries(head.map((k, i) => [k, row[i]]));
  by_hs6[hs] = {
    year: YEAR,
    origin: obj.CTY_NAME || 'Indonesia',
    gen_val_yr: obj.GEN_VAL_YR != null ? Number(obj.GEN_VAL_YR) : null,
    con_val_yr: obj.CON_VAL_YR != null ? Number(obj.CON_VAL_YR) : null,
  };
  process.stdout.write(`${hs}: ${by_hs6[hs].gen_val_yr}\n`);
}

writeJson(path.join(DATA, 'census-aggregates.json'), {
  _meta: {
    status: Object.keys(by_hs6).length ? 'census_api' : 'empty',
    source: 'US Census International Trade API (imports, HS6, Indonesia)',
    year: YEAR,
    honesty: 'Agregat negara×HS, bukan nama importer.',
    fetched_at: new Date().toISOString(),
  },
  by_hs6,
});
process.stdout.write('wrote data/census-aggregates.json\n');
