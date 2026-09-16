import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LAB = path.resolve(here, '..');
export const ROOT = path.resolve(LAB, '../..');
export const DATA = path.join(LAB, 'data');
export const KARTU = path.join(LAB, 'kartu');
export const RAW = path.join(LAB, '_raw');
export const COLLECTORS = path.join(LAB, 'collectors');

export function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

export function loadCorpus() {
  const doc = readJson(path.join(ROOT, 'scripts/expor-keywords.json'));
  if (!doc?.keywords) throw new Error('missing scripts/expor-keywords.json');
  const bySlug = new Map(doc.keywords.map((k) => [k.slug, k]));
  return { meta: doc._meta, keywords: doc.keywords, bySlug };
}

export function argList(flag) {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  if (i < 0 || !args[i + 1]) return [];
  return args[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
}

export function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}
