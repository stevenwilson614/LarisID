#!/usr/bin/env node
/**
 * Flat weekly omset reshape. No network.
 * Run: node scripts/test-omset-week-shape.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const shape = require(join(dirname(fileURLToPath(import.meta.url)), '../js/omset-week-shape.js'));

let failed = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) console.log(`ok  ${name}`);
  else {
    failed++;
    console.error(`FAIL ${name}\n  got  ${g}\n  want ${w}`);
  }
}
function ok(name, cond) {
  if (cond) console.log(`ok  ${name}`);
  else { failed++; console.error(`FAIL ${name}`); }
}

function omsets(weeks) { return weeks.map(w => w.omset); }
function units(weeks) { return weeks.map(w => w.units); }
function sum(xs) { return xs.reduce((s, v) => s + v, 0); }
function consecutiveDiffer(xs) {
  for (let i = 1; i < xs.length; i++) if (xs[i] === xs[i - 1]) return false;
  return true;
}

const raw = [0.9315, 0.9562, 0.9878, 1.0058];
const mean = raw.reduce((s, v) => s + v, 0) / raw.length;
const norm = raw.map(v => v / mean);
const ptp0 = Math.max(...norm) - Math.min(...norm);
const derived = norm.map(v => +(1 + (v - 1) * (shape.CATALOG_ABS_WOW / ptp0)).toFixed(4));
eq('catalog pattern is the scaled 4-week median', shape.CATALOG_PATTERN, derived);
ok('catalog amplitude is the measured median move', shape.CATALOG_ABS_WOW === 0.3743);

for (const n of [2, 3, 4, 6, 8]) {
  const w = shape.catalogWeights(n);
  const ptp = Math.max(...w) - Math.min(...w);
  ok(`catalog n=${n} peak-to-peak near 0.3743`, Math.abs(ptp - 0.3743) < 0.02);
  ok(`catalog n=${n} mean is 1`, Math.abs(w.reduce((s, v) => s + v, 0) / n - 1) < 1e-9);
  ok(`catalog n=${n} is not flat`, Math.max(...w) !== Math.min(...w));
}

const variedThenFlat = shape.shapeFlatWeeks([
  { omset: 100, units: 10 },
  { omset: 140, units: 14 },
  { omset: 110, units: 11 },
  { omset: 120, units: 12 },
  { omset: 120, units: 12 },
  { omset: 120, units: 12 },
]);
eq('varied weeks stay put', omsets(variedThenFlat).slice(0, 3), [100, 140, 110]);
eq('flat tail keeps its omset sum', sum(omsets(variedThenFlat).slice(3)), 360);
eq('flat tail keeps its unit sum', sum(units(variedThenFlat).slice(3)), 36);
ok('flat tail weeks differ', consecutiveDiffer(omsets(variedThenFlat).slice(3)));
ok('reshaped tail is perkiraan', variedThenFlat.slice(3).every(w => w.perkiraan === true));
ok('varied weeks are not marked perkiraan', variedThenFlat.slice(0, 3).every(w => !w.perkiraan));
// Own shape: 100, 140, 110 over mean 350/3, applied to 360.
eq('flat tail copies the earlier shape', omsets(variedThenFlat).slice(3), [103, 144, 113]);

const oneScrape = shape.shapeFlatWeeks([
  { omset: 200, units: 4 },
  { omset: 200, units: 4 },
  { omset: 200, units: 4 },
  { omset: 200, units: 4 },
]);
eq('one scrape keeps the total', sum(omsets(oneScrape)), 800);
eq('one scrape keeps the units', sum(units(oneScrape)), 16);
ok('one scrape line is not flat', consecutiveDiffer(omsets(oneScrape)));
ok('one scrape weeks are perkiraan', oneScrape.every(w => w.perkiraan === true));
ok('one scrape recent week is higher', oneScrape[3].omset > oneScrape[0].omset);

const already = shape.shapeFlatWeeks([
  { omset: 100, units: 5 },
  { omset: 101, units: 5 },
  { omset: 99, units: 6 },
]);
eq('a moving series is unchanged', omsets(already), [100, 101, 99]);
ok('a moving series is not marked perkiraan', already.every(w => !w.perkiraan));

const zeros = shape.shapeFlatWeeks([
  { omset: 0, units: 0 },
  { omset: 0, units: 0 },
  { omset: 0, units: 0 },
]);
eq('a zero series stays zero', omsets(zeros), [0, 0, 0]);
ok('zeros are not marked perkiraan', zeros.every(w => !w.perkiraan));

const gap = shape.shapeFlatWeeks([
  { omset: 0, units: 0 },
  { omset: 80, units: 2 },
  { omset: 80, units: 2 },
]);
eq('a real zero stays zero beside a flat run', omsets(gap)[0], 0);
eq('the positive pair keeps its sum', sum(omsets(gap)), 160);
ok('the positive pair differs', omsets(gap)[1] !== omsets(gap)[2]);

const single = shape.shapeFlatWeeks([{ omset: 50, units: 1, perkiraan: false }]);
eq('one week is unchanged', omsets(single), [50]);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
