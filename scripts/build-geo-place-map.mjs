#!/usr/bin/env node
// Emits the seed rows for public.geo_place_map from scripts/data/id-place-map.json.
//
// raw_norm is lower(strip-non-alphanumeric) of the place name WITHOUT stripping the
// kab./kota prefix — unlike public.norm_loc(). Keeping the prefix is what lets
// "Banjar" (Kota Banjar, Jawa Barat) and "Kab. Banjar" (Kalimantan Selatan) resolve
// to different provinces; norm_loc() folds them onto the same key. Every place is
// therefore seeded three times: bare, kab-prefixed, kota-prefixed.
//
// Usage: node scripts/build-geo-place-map.mjs > /tmp/geo_place_map_seed.sql
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = JSON.parse(readFileSync(join(HERE, 'data', 'id-place-map.json'), 'utf8'));

export const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// The five DKI kota are the only places that carry a kota — they drive the Jakarta inset.
const DKI_KOTA = new Set(['Jakarta Barat', 'Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Timur', 'Jakarta Utara']);

export function buildPlaceMap() {
  const rows = new Map(); // raw_norm -> { province, kota }
  const collisions = [];
  const put = (key, province, kota, hard) => {
    if (!key) return;
    const prev = rows.get(key);
    if (prev && prev.province !== province && !hard) { collisions.push([key, prev.province, province]); return; }
    rows.set(key, { province, kota: kota || null });
  };

  for (const [province, places] of Object.entries(RAW)) {
    if (province.startsWith('_')) continue;
    for (const place of places) {
      const kota = DKI_KOTA.has(place) ? place : null;
      const bare = norm(place);
      put(bare, province, kota);
      put('kab' + bare, province, kota);
      put('kota' + bare, province, kota);
    }
  }
  // Aliases: province names typed directly, English spellings ipinfo returns,
  // and the sub-district names people actually put in the onboarding field.
  for (const [alias, target] of Object.entries(RAW._aliases || {})) {
    if (alias.startsWith('_')) continue;
    const [province, kota] = String(target).split('|');
    put(norm(alias), province, kota || null, true);
  }
  // Ambiguous names win over everything.
  for (const [key, province] of Object.entries(RAW._ambiguous || {})) {
    if (key.startsWith('_')) continue;
    put(key, province, null, true);
  }
  return { rows, collisions };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { rows, collisions } = buildPlaceMap();
  if (collisions.length) {
    console.error(`-- ${collisions.length} collision(s) resolved by first-wins:`);
    for (const c of collisions) console.error('--   ', c.join(' | '));
  }
  const esc = (s) => s.replace(/'/g, "''");
  const vals = [...rows.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `  ('${esc(k)}', '${esc(v.province)}', ${v.kota ? `'${esc(v.kota)}'` : 'null'})`);
  console.log('insert into public.geo_place_map (raw_norm, province, kota) values');
  console.log(vals.join(',\n'));
  console.log('on conflict (raw_norm) do update set province = excluded.province, kota = excluded.kota;');
  console.error(`-- ${rows.size} rows`);
}
