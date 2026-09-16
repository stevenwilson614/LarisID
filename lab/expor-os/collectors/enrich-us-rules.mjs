#!/usr/bin/env node
/**
 * Validate us-import-rules.json. Does not scrape FDA. Exit 1 on schema errors.
 */
import { DATA, loadCorpus, readJson } from '../lib/paths.mjs';
import { validateRulesDoc } from '../lib/resolve-rules.mjs';
import path from 'node:path';

const rules = readJson(path.join(DATA, 'us-import-rules.json'));
const pilots = readJson(path.join(DATA, 'pilots.json'));
const { keywords } = loadCorpus();
const errors = validateRulesDoc(rules, { keywords, pilots: pilots.slugs });
if (errors.length) {
  process.stderr.write(errors.map((e) => `ERROR: ${e}\n`).join(''));
  process.exit(1);
}
process.stdout.write(`ok: ${Object.keys(rules.by_kategori).length} kategori packs, ${Object.keys(rules.by_slug).length} slug overlays\n`);
