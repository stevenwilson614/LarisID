#!/usr/bin/env node
/**
 * Licensed BOL CSV → data/bol-importers.json.
 * Do not scrape Panjiva/ImportGenius. Do not invent names.
 *
 *   node lab/expor-os/collectors/ingest-bol-csv.mjs path/to/export.csv
 *   node lab/expor-os/collectors/ingest-bol-csv.mjs fixtures/bol-sample.csv --sample
 *
 * --sample marks the output as fixture (kartu will refuse to show it as real).
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA, loadCorpus, readJson, writeJson, hasFlag } from '../lib/paths.mjs';

const csvPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!csvPath) {
  process.stderr.write('Usage: node ingest-bol-csv.mjs <file.csv> [--sample]\n');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  process.stderr.write(`FATAL: no file ${csvPath}\n`);
  process.exit(1);
}

const sample = hasFlag('--sample');
const { keywords } = loadCorpus();
const hsToSlugs = new Map();
for (const k of keywords) {
  for (const code of [k.hs, k.hs4, k.hs2]) {
    if (!code) continue;
    const n = String(code).replace(/\D/g, '');
    if (!hsToSlugs.has(n)) hsToSlugs.set(n, []);
    hsToSlugs.get(n).push(k.slug);
  }
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function pick(row, names) {
  for (const n of names) {
    if (row[n] != null && String(row[n]).trim()) return String(row[n]).trim();
  }
  return '';
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const buckets = new Map();

for (const row of rows) {
  const name = pick(row, ['importer_name', 'importer', 'consignee_name', 'consignee', 'notify_party']);
  const hs = digits(pick(row, ['hs_code', 'hscode', 'hs', 'commodity_code', 'hts', 'harmonized_code']));
  if (!name || !hs) continue;
  if (/^sample\b/i.test(name) && !sample) continue;
  const origin = pick(row, ['origin', 'country_of_origin', 'shipper_country', 'country']) || null;
  const last = pick(row, ['arrival_date', 'date', 'actual_arrival_date', 'shipment_date']) || null;
  const key = `${hs}|${name.toLowerCase()}`;
  if (!buckets.has(key)) {
    buckets.set(key, { hs, name, shipment_count: 0, last_seen: last, sample_origins: [] });
  }
  const b = buckets.get(key);
  b.shipment_count += 1;
  if (last && (!b.last_seen || last > b.last_seen)) b.last_seen = last;
  if (origin && !b.sample_origins.includes(origin)) b.sample_origins.push(origin);
}

const by_hs = {};
const by_slug = {};

for (const b of buckets.values()) {
  const rec = {
    name: b.name,
    shipment_count: b.shipment_count,
    last_seen: b.last_seen,
    sample_origins: b.sample_origins.slice(0, 5),
  };
  if (!by_hs[b.hs]) by_hs[b.hs] = [];
  by_hs[b.hs].push(rec);
  const slugs = new Set();
  for (let n = b.hs; n.length >= 2; n = n.slice(0, n.length - 1)) {
    for (const s of hsToSlugs.get(n) || []) slugs.add(s);
    if (n.length <= 4 && slugs.size) break;
  }
  for (const slug of slugs) {
    if (!by_slug[slug]) by_slug[slug] = { hs: b.hs, importers: [] };
    by_slug[slug].importers.push(rec);
  }
}

for (const list of Object.values(by_hs)) {
  list.sort((a, b) => b.shipment_count - a.shipment_count);
}
for (const block of Object.values(by_slug)) {
  const seen = new Set();
  block.importers = block.importers
    .sort((a, b) => b.shipment_count - a.shipment_count)
    .filter((x) => {
      const k = x.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 15);
}

const prev = readJson(path.join(DATA, 'bol-importers.json'), { by_slug: {}, by_hs: {} });
const out = {
  _meta: {
    status: sample ? 'sample' : (Object.keys(by_slug).length ? 'licensed_csv' : 'no_subscription'),
    sample,
    source_file: path.basename(csvPath),
    ingested_at: new Date().toISOString(),
    honesty: sample
      ? 'FIXTURE. Names are not real importers. Kartu must not present this as live data.'
      : 'Normalized from a licensed vendor CSV. Not a scrape. Coverage is only what the export contained.',
    rows_in: rows.length,
    importers: buckets.size,
  },
  by_hs: sample ? by_hs : { ...prev.by_hs, ...by_hs },
  by_slug: sample ? by_slug : { ...prev.by_slug, ...by_slug },
};

if (sample) {
  const dest = path.join(DATA, 'bol-importers.sample.json');
  writeJson(dest, out);
  process.stdout.write(`wrote ${dest} (sample — not used by kartu)\n`);
} else {
  writeJson(path.join(DATA, 'bol-importers.json'), out);
  process.stdout.write(`wrote data/bol-importers.json (${Object.keys(out.by_slug).length} slugs)\n`);
}
