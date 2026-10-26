#!/usr/bin/env node
/**
 * Classify market_index rows: kind, parent, brand, a few aliases.
 *
 * Dry-run is the default. A real run calls DeepSeek and writes source='ai'
 * only where source is still 'rule' or 'unknown'. Manual rows are left alone.
 *
 *   node scripts/classify-market-index.mjs                 # print 20 candidates
 *   node scripts/classify-market-index.mjs --limit=20      # classify 20
 *   node scripts/classify-market-index.mjs --keywords="birkenstok,tumbler"
 *
 * Does not walk the whole 6k catalogue. That is a paid batch; run it on purpose.
 */
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SSH_KEY = process.env.LARISID_SSH_KEY || join(homedir(), '.ssh/larisid_hetzner');
const SSH_HOST = process.env.LARISID_SSH_HOST || 'root@84.247.147.205';
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limit = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1] || (apply ? 20 : 20));
const kwArg = (args.find(a => a.startsWith('--keywords=')) || '').slice('--keywords='.length);

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [
      '-i', SSH_KEY, '-o', 'BatchMode=yes', SSH_HOST,
      'docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A',
    ]);
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('close', code => {
      if (code) reject(new Error(err.slice(0, 400) || `psql exit ${code}`));
      else resolve(out);
    });
    child.stdin.write(sql);
    child.stdin.end();
  });
}

function sqlStr(s) {
  return `'${String(s || '').replace(/'/g, "''")}'`;
}

async function candidates() {
  const where = kwArg
    ? `keyword = any(string_to_array(${sqlStr(kwArg.toLowerCase())}, ','))`
    : `kind in ('unknown', 'brand', 'shop') and (parent_keyword is null or kind = 'unknown') and source <> 'manual'`;
  const raw = await psql(
    `select keyword, kind, coalesce(n_listings,0)
       from public.market_index
      where ${where}
      order by coalesce(n_listings,0) desc
      limit ${Math.max(1, Math.min(limit, 40))};`
  );
  return raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [keyword, kind, n] = l.split('|');
    return { keyword, kind, n: Number(n) || 0 };
  });
}

async function titlesFor(keyword) {
  const raw = await psql(
    `select left(product_name, 80)
       from public.listings_deduped
      where keyword = ${sqlStr(keyword)} and not is_offtopic and total_sold > 0
      order by total_sold desc
      limit 3;`
  );
  return raw.split('\n').map(s => s.trim()).filter(Boolean);
}

async function ask(batch) {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0,
      messages: [{
        role: 'user',
        content: `Classify each Shopee keyword. kind is product, brand, shop, modifier, or unknown.
parent is a broader product keyword we might already have, or empty.
brand is the brand name or empty.
Reply with one JSON object per line: {"keyword","kind","parent","brand"}.
No prose.
${batch.map(b => `${b.keyword} | now ${b.kind} | titles: ${b.titles.join(' / ')}`).join('\n')}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}`);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content || '';
  const rows = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf('{');
    const j = line.lastIndexOf('}');
    if (i < 0 || j < i) continue;
    try { rows.push(JSON.parse(line.slice(i, j + 1))); } catch { /* skip */ }
  }
  return rows;
}

const rows = await candidates();
console.log(`${rows.length} candidates${apply ? '' : ' (dry-run, pass --apply to write)'}`);
for (const row of rows) {
  row.titles = await titlesFor(row.keyword);
  console.log(`- ${row.keyword} (${row.kind}, n=${row.n}) ${row.titles[0] || ''}`);
}
if (!apply) process.exit(0);
if (!API_KEY) {
  console.error('Set DEEPSEEK_API_KEY to apply.');
  process.exit(1);
}
const classified = await ask(rows);
const allowed = new Set(['product', 'brand', 'shop', 'modifier', 'unknown']);
for (const row of classified) {
  if (!row.keyword || !allowed.has(row.kind)) continue;
  await psql(
    `update public.market_index
        set kind = ${sqlStr(row.kind)},
            parent_keyword = nullif(${sqlStr(row.parent || '')}, ''),
            brand = nullif(${sqlStr(row.brand || '')}, ''),
            source = 'ai',
            updated_at = now()
      where keyword = ${sqlStr(String(row.keyword).toLowerCase())}
        and source not in ('manual');`
  );
  console.log(`wrote ${row.keyword} → ${row.kind} parent=${row.parent || ''}`);
}
