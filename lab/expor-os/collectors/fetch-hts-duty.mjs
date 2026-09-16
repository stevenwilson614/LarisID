#!/usr/bin/env node
/**
 * Pull MFN general rates from USITC HTS exportList (public, no key).
 * Writes lab/expor-os/data/hts-duty.json and caches raw JSON under _raw/hts/.
 *
 *   node lab/expor-os/collectors/fetch-hts-duty.mjs
 *   node lab/expor-os/collectors/fetch-hts-duty.mjs --only kopi-gayo
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA, RAW, readJson, writeJson, argList } from '../lib/paths.mjs';

const API = 'https://hts.usitc.gov/reststop/exportList';
const mapDoc = readJson(path.join(DATA, 'hts-map.json'));
const pilots = readJson(path.join(DATA, 'pilots.json'));
const only = argList('--only');
const slugs = only.length ? only : Object.keys(mapDoc.by_slug);

function parseGeneral(raw) {
  const t = String(raw || '').trim();
  if (!t) return { kind: 'missing', duty_pct: null, general_raw: t };
  if (/^free$/i.test(t)) return { kind: 'simple', duty_pct: 0, general_raw: t };
  const m = t.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (m) return { kind: 'simple', duty_pct: Number(m[1]), general_raw: t };
  return { kind: 'complex', duty_pct: null, general_raw: t };
}

function normHts(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

async function exportList(from, to) {
  const url = `${API}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&format=JSON&styles=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`USITC ${res.status} ${url}`);
  return res.json();
}

function pickRow(rows, prefer) {
  const rated = rows.filter((r) => String(r.general || '').trim());
  for (const p of prefer || []) {
    const n = normHts(p);
    const hit = rated.find((r) => normHts(r.htsno) === n)
      || rated.find((r) => normHts(r.htsno).startsWith(n))
      || rows.find((r) => normHts(r.htsno) === n);
    if (hit) return hit;
  }
  return rated[0] || rows.find((r) => r.htsno) || null;
}

fs.mkdirSync(path.join(RAW, 'hts'), { recursive: true });

const by_slug = {};
const errors = [];

for (const slug of slugs) {
  const spec = mapDoc.by_slug[slug];
  if (!spec) {
    errors.push(`no hts-map for ${slug}`);
    continue;
  }
  try {
    const rows = await exportList(spec.fetch_from, spec.fetch_to);
    fs.writeFileSync(path.join(RAW, 'hts', `${slug}.json`), JSON.stringify(rows, null, 2));
    const row = pickRow(rows, spec.prefer);
    const parsed = parseGeneral(row?.general);
    const alts = rows
      .filter((r) => String(r.general || '').trim())
      .map((r) => ({
        htsno: r.htsno,
        general: r.general,
        description: r.description,
        ...parseGeneral(r.general),
      }));
    by_slug[slug] = {
      hs6: spec.hs6,
      htsno: row?.htsno || null,
      description: row?.description || null,
      confidence: spec.confidence,
      note: spec.note,
      ...parsed,
      alts,
    };
    process.stdout.write(`${slug}: ${row?.htsno || '—'} ${parsed.general_raw || '(no general)'}\n`);
  } catch (err) {
    errors.push(`${slug}: ${err.message}`);
    process.stderr.write(`WARN ${slug}: ${err.message}\n`);
  }
}

writeJson(path.join(DATA, 'hts-duty.json'), {
  _meta: {
    source: 'USITC Harmonized Tariff Schedule exportList (MFN general)',
    source_url: API,
    honesty: 'Candidate 10-digit leaves from lab hts-map. Not a binding classification. Indonesia GSP/FTA special rates are not applied.',
    fetched_at: new Date().toISOString(),
    slugs: Object.keys(by_slug).length,
    pilots: pilots.slugs.length,
  },
  by_slug,
});

if (errors.length && !Object.keys(by_slug).length) {
  process.stderr.write('FATAL: no HTS rows fetched\n');
  process.exit(1);
}
process.stdout.write(`wrote data/hts-duty.json (${Object.keys(by_slug).length} slugs)\n`);
