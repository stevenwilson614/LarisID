#!/usr/bin/env node
/**
 * Classify market_index rows: kind, parent, brand.
 *
 * Dry-run is the default. A real run calls DeepSeek and writes source='ai'
 * only where source is still 'rule' or 'unknown'. Manual rows are left alone.
 *
 * Candidates = kind unknown, OR brand/shop with no parent_keyword.
 *
 *   node scripts/classify-market-index.mjs                 # print 20 candidates
 *   node scripts/classify-market-index.mjs --apply --limit=20
 *   node scripts/classify-market-index.mjs --apply --all   # drain the queue
 *   node scripts/classify-market-index.mjs --keywords="birkenstok,tumbler"
 *
 * Env: DEEPSEEK_API_KEY (or ANTHROPIC_API_KEY), LARISID_SSH_KEY, LARISID_SSH_HOST
 */
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SSH_KEY = process.env.LARISID_SSH_KEY || join(homedir(), '.ssh/larisid_hetzner');
const SSH_HOST = process.env.LARISID_SSH_HOST || 'root@84.247.147.205';
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const MODEL = 'deepseek-v4-pro';
const DEEPSEEK_URL = 'https://api.deepseek.com/anthropic/v1/messages';
const BATCH = 15;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const all = args.includes('--all');
const limit = Number((args.find(a => a.startsWith('--limit=')) || '').split('=')[1] || (all ? 200 : 20));
const kwArg = (args.find(a => a.startsWith('--keywords=')) || '').slice('--keywords='.length);

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [
      '-i', SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SSH_HOST,
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

async function candidates(n) {
  const where = kwArg
    ? `keyword = any(string_to_array(${sqlStr(kwArg.toLowerCase())}, ','))`
    : `kind in ('unknown', 'brand', 'shop') and (parent_keyword is null or kind = 'unknown') and source <> 'manual'`;
  const raw = await psql(
    `select keyword, kind, coalesce(n_listings,0)
       from public.market_index
      where ${where}
      order by coalesce(n_listings,0) desc
      limit ${Math.max(1, Math.min(n, 200))};`
  );
  return raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [keyword, kind, nList] = l.split('|');
    return { keyword, kind, n: Number(nList) || 0 };
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

/** Map AI parent hints → existing product keywords (exact, else best trigram ≥0.35). */
async function resolveParents(hints) {
  const cleaned = [...new Set(hints.map(h => String(h || '').toLowerCase().trim()).filter(Boolean))];
  const map = new Map();
  for (const hint of cleaned) {
    const raw = await psql(
      `select keyword from public.match_market_parent(${sqlStr(hint)});`
    );
    const hit = raw.split('\n').map(s => s.trim()).filter(Boolean)[0]?.split('|')[0];
    if (hit) map.set(hint, hit);
  }
  return map;
}

async function ask(batch) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      temperature: 0,
      thinking: { type: 'disabled' },
      system: [
        'You classify Shopee search keywords for LarisID market_index.',
        'kind is product | brand | shop | modifier | unknown.',
        'parent is a broader PRODUCT market keyword (not another brand/shop), or empty.',
        'brand is the brand name or empty.',
        'Rules:',
        '- "* packing olshop", "meja packing olshop", "rak … olshop" with 3+ tokens describing a product = product, not shop.',
        '- "X official" / "X official store" / short "X olshop" (≤2 tokens) = shop; parent = the product they mostly sell.',
        '- Misspelled brand keywords (birkenstok) = brand; parent = the product category (sandal, not the brand itself).',
        '- Prefer a short Indonesian parent that already exists as a product market. Leave parent empty if unsure.',
        '- Never invent English parents when the catalogue is Indonesian.',
        'Reply with ONLY one minified JSON object per line: {"keyword","kind","parent","brand"}. No prose.',
      ].join(' '),
      messages: [{
        role: 'user',
        content: batch.map(b => `${b.keyword} | now ${b.kind} | titles: ${b.titles.join(' / ') || '(none)'}`).join('\n'),
      }],
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const textBlock = Array.isArray(body.content)
    ? (body.content.find(b => b?.type === 'text') || body.content[0])
    : null;
  const text = String(textBlock?.text || body.choices?.[0]?.message?.content || '');
  const rows = [];
  for (const line of text.split('\n')) {
    const i = line.indexOf('{');
    const j = line.lastIndexOf('}');
    if (i < 0 || j < i) continue;
    try { rows.push(JSON.parse(line.slice(i, j + 1))); } catch { /* skip */ }
  }
  return rows;
}

async function writeRows(classified) {
  const allowed = new Set(['product', 'brand', 'shop', 'modifier', 'unknown']);
  const parents = await resolveParents(classified.map(r => r.parent));
  let wrote = 0;
  for (const row of classified) {
    if (!row.keyword || !allowed.has(row.kind)) continue;
    const parentRaw = String(row.parent || '').toLowerCase().trim();
    const parent = parents.get(parentRaw) || '';
    if (parentRaw && parent && parent !== parentRaw) {
      console.log(`parent "${parentRaw}" → "${parent}" for ${row.keyword}`);
    } else if (parentRaw && !parent) {
      console.log(`skip parent "${parentRaw}" for ${row.keyword} (no product match)`);
    }
    if ((row.kind === 'brand' || row.kind === 'shop') && !parent) {
      console.log(`skip ${row.keyword} → ${row.kind} (no usable parent)`);
      continue;
    }
    await psql(
      `update public.market_index
          set kind = ${sqlStr(row.kind)},
              parent_keyword = nullif(${sqlStr(parent)}, ''),
              brand = nullif(${sqlStr(row.brand || '')}, ''),
              source = 'ai',
              updated_at = now()
        where keyword = ${sqlStr(String(row.keyword).toLowerCase())}
          and source not in ('manual');`
    );
    console.log(`wrote ${row.keyword} → ${row.kind} parent=${parent || ''}`);
    wrote += 1;
  }
  return wrote;
}

const rows = await candidates(limit);
console.log(`${rows.length} candidates${apply ? '' : ' (dry-run, pass --apply to write)'}`);
for (const row of rows) {
  row.titles = await titlesFor(row.keyword);
  console.log(`- ${row.keyword} (${row.kind}, n=${row.n}) ${row.titles[0] || ''}`);
}
if (!apply) process.exit(0);
if (!rows.length) {
  console.log('Queue empty.');
  process.exit(0);
}
if (!API_KEY) {
  console.error('Set DEEPSEEK_API_KEY to apply.');
  process.exit(1);
}

let wrote = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const classified = await ask(batch);
  wrote += await writeRows(classified);
}

if (all) {
  // Second pass in case the first batch left skips (bad parents).
  const again = await candidates(limit);
  if (again.length) {
    console.log(`\nSecond pass: ${again.length} still open`);
    for (const row of again) row.titles = await titlesFor(row.keyword);
    for (let i = 0; i < again.length; i += BATCH) {
      wrote += await writeRows(await ask(again.slice(i, i + BATCH)));
    }
  }
}

const left = await candidates(10);
console.log(`\nDone. wrote=${wrote}. Left: ${left.length ? left.map(r => r.keyword).join(', ') : '(empty)'}`);
