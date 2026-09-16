#!/usr/bin/env node
/**
 * Refresh Amazon SERP for the 20 pilots via the existing DataForSEO script.
 * Never ingests to Contabo.
 *
 *   DATAFORSEO_LOGIN=… DATAFORSEO_PASSWORD=… node lab/expor-os/collectors/refresh-amazon-pilots.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, DATA, readJson } from '../lib/paths.mjs';

if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
  process.stderr.write(
    'DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set.\n' +
    'Lab will keep reading scripts/expor-amazon.json (seed: meja-makan-jati, kursi-rotan, minyak-kelapa).\n' +
    'Do not invent prices. Do not run ingest-amazon-listings.mjs --apply from this lab.\n',
  );
  process.exit(0);
}

const pilots = readJson(path.join(DATA, 'pilots.json'));
const only = pilots.slugs.join(',');
const child = spawn(
  process.execPath,
  [path.join(ROOT, 'scripts/fetch-dataforseo-amazon.mjs'), '--only', only],
  { cwd: ROOT, stdio: 'inherit', env: process.env },
);
child.on('exit', (code) => {
  process.stdout.write(
    '\nOffline lab: Amazon JSON updated on disk if the fetch succeeded. ' +
    'Do NOT run scripts/ingest-amazon-listings.mjs --apply.\n',
  );
  process.exit(code || 0);
});
