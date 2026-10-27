/**
 * Disk-backed store for Contabo anton-school (replaces Cloudflare KV/D1).
 * Files under DATA_DIR/kv/*.json
 */
import fs from 'node:fs';
import path from 'node:path';

export function makeDiskStore(dataDir) {
  const root = path.join(dataDir, 'kv');
  fs.mkdirSync(root, { recursive: true });

  function fileFor(key) {
    const safe = String(key || '').replace(/[^a-zA-Z0-9._:-]+/g, '_');
    return path.join(root, safe + '.json');
  }

  function get(key) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
    } catch (err) {
      return null;
    }
  }

  function put(key, value) {
    const file = fileFor(key);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file);
  }

  return { get, put, root };
}
