#!/usr/bin/env node
/**
 * Classify the cover + 5-image gallery candidates for each product type.
 *
 * Dumps top-5 listings per keyword (city=ALL, Rule B order, skip is_offtopic)
 * from api.larisid.com via ssh+psql, asks DeepSeek whether each title belongs,
 * upserts public.kw_ai_reject. Does not change is_offtopic or membership.
 *
 * Usage:
 *   node scripts/classify-type-covers.mjs --dry-run
 *   node scripts/classify-type-covers.mjs --keywords="helm full face murah,lensa kamera hp clip"
 *   node scripts/classify-type-covers.mjs
 *   node scripts/classify-type-covers.mjs --force
 *
 * Env:
 *   DEEPSEEK_API_KEY   required (or ANTHROPIC_API_KEY if that is the DeepSeek key)
 *   LARISID_SSH_KEY    default ~/.ssh/larisid_hetzner
 *   LARISID_SSH_HOST   default root@84.247.147.205
 */

import { spawn } from 'node:child_process';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MODEL = 'deepseek-v4-pro';
const DEEPSEEK_URL = 'https://api.deepseek.com/anthropic/v1/messages';
const BATCH_TYPES = 10;
const KNOWN = ['helm full face murah', 'lensa kamera hp clip'];
const SSH_KEY = process.env.LARISID_SSH_KEY || join(homedir(), '.ssh/larisid_hetzner');
const SSH_HOST = process.env.LARISID_SSH_HOST || 'root@84.247.147.205';
const API_KEY = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY || '';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const FORCE = args.includes('--force');
const REFRESH_DUMP = args.includes('--refresh-dump');
const CANDIDATE_PATH = join('tmp', 'type-cover-candidates.jsonl');
const kwArg = args.find((a) => a.startsWith('--keywords='));
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : 0;
const ONLY = kwArg
  ? kwArg.slice('--keywords='.length).split(',').map((s) => s.trim()).filter(Boolean)
  : (DRY ? KNOWN : []);

const SYSTEM = [
  'You classify whether Shopee product titles belong to a LarisID product type (a search keyword).',
  'Reject ONLY when the product is clearly a different kind of good — not a synonym, not a cheaper/generic version, not an accessory that belongs, and not an Indonesian/English naming gap (pupuk=fertilizer, helm=helmet, lensa=lens).',
  'Examples of REJECT: skincare "Face Care" under "helm full face murah"; a Sony A6400 camera kit under "lensa kamera hp clip" (that keyword is clip-on phone lenses, not interchangeable camera lenses); a bra or snack under a hardware keyword.',
  'Examples of KEEP: "Mipanda Lensa Kamera HP Apexel" under "lensa kamera hp clip"; an Indonesian-titled helmet under "helm full face murah"; a visor or spare shell sold as helmet gear under that helm keyword.',
  'Reply with ONLY minified JSON, no prose:',
  '{"results":[{"keyword":"...","item_id":"...","shop_id":"...","rejected":false,"reason":"short"}]}',
  'Include every item you were given. Keep reason under 12 words.',
].join(' ');

function sqlLit(v) {
  if (v == null) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function psqlOnce(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('ssh', [
      '-i', SSH_KEY,
      '-o', 'ConnectTimeout=20',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=120',
      SSH_HOST,
      'docker exec -i supabase-db psql -U postgres -v ON_ERROR_STOP=1 -X',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`psql exit ${code}: ${err || out}`.trim()));
      else resolve(out);
    });
    child.stdin.end(sql);
  });
}

async function psql(sql, attempt = 1) {
  try {
    return await psqlOnce(sql);
  } catch (err) {
    const transient = /timed out|Connection reset|Connection refused|exit 255/i.test(String(err));
    if (transient && attempt < 4) {
      const wait = attempt * 4000;
      console.warn(`  ssh retry ${attempt} after ${err.message.split('\n')[0]}, wait ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
      return psql(sql, attempt + 1);
    }
    throw err;
  }
}

async function dumpCandidates() {
  const filter = ONLY.length
    ? `and btrim(keyword) in (${ONLY.map(sqlLit).join(',')})`
    : '';
  const sql = `
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
with base as (
  select item_id, shop_id, product_name, price, total_sold,
         btrim(keyword) as keyword, kw_hits
  from public.listings_deduped
  where keyword is not null and btrim(keyword) <> ''
    and total_sold > 0
    and price between 500 and 50000000
    and not is_offtopic
    ${filter}
),
rel as (
  select keyword, avg((kw_hits > 0)::int::numeric) as rel_share
  from base
  group by keyword
),
ranked as (
  select b.*, rel.rel_share,
         row_number() over (
           partition by b.keyword
           order by (case when rel.rel_share >= 0.15 and b.kw_hits = 0 then 1 else 0 end),
                    b.total_sold desc nulls last) as rn
  from base b
  join rel using (keyword)
)
select json_build_object(
  'keyword', r.keyword,
  'item_id', r.item_id::text,
  'shop_id', r.shop_id::text,
  'product_name', left(coalesce(r.product_name, ''), 160),
  'price', r.price,
  'total_sold', r.total_sold,
  'rn', r.rn,
  'category_canonical', coalesce(ks.canonical, 'Lainnya')
)
from ranked r
left join public.keyword_subgroup ks on ks.keyword = r.keyword
where r.rn <= 5
order by r.keyword, r.rn;
`;
  const raw = await psql(sql);
  const rows = [];
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    try { rows.push(JSON.parse(s)); } catch { /* skip chatter */ }
  }
  return rows;
}

async function existingFlags() {
  const raw = await psql(`
\\pset format unaligned
\\pset tuples_only on
\\pset pager off
select json_build_object(
  'keyword', keyword,
  'item_id', item_id::text,
  'shop_id', shop_id::text
)
from public.kw_ai_reject;
`);
  const set = new Set();
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s || s[0] !== '{') continue;
    try {
      const r = JSON.parse(s);
      set.add(`${r.keyword}\t${r.item_id}\t${r.shop_id}`);
    } catch { /* skip */ }
  }
  return set;
}

function groupByKeyword(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.keyword)) map.set(r.keyword, []);
    map.get(r.keyword).push(r);
  }
  return map;
}

function alreadyDone(items, flags) {
  if (FORCE || !items.length) return false;
  return items.every((it) => flags.has(`${it.keyword}\t${it.item_id}\t${it.shop_id}`));
}

function userPrompt(batch) {
  const types = batch.map((t) => ({
    keyword: t.keyword,
    category: t.items[0]?.category_canonical || 'Lainnya',
    items: t.items.map((it) => ({
      item_id: it.item_id,
      shop_id: it.shop_id,
      product_name: it.product_name,
      price: it.price,
    })),
  }));
  return `Classify each item. Keep unless it is clearly a different kind of good than the keyword.\n${JSON.stringify(types)}`;
}

function parseResults(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`no JSON in model reply: ${text.slice(0, 200)}`);
  let raw = m[0];
  try {
    return JSON.parse(raw);
  } catch (first) {
    // Truncated or trailing-comma replies: keep complete result objects only.
    const objs = [];
    const re = /\{\s*"keyword"\s*:\s*"(?:\\.|[^"\\])*"[\s\S]*?\}/g;
    let hit;
    while ((hit = re.exec(raw))) {
      try { objs.push(JSON.parse(hit[0])); } catch { /* skip broken object */ }
    }
    if (!objs.length) throw first;
    return { results: objs };
  }
}

function normalizeResults(results) {
  return (Array.isArray(results) ? results : []).map((r) => ({
    keyword: String(r.keyword || '').trim(),
    item_id: String(r.item_id ?? ''),
    shop_id: String(r.shop_id ?? ''),
    rejected: r.rejected === true,
    reason: String(r.reason || '').slice(0, 160),
    model: MODEL,
  }));
}

async function classifyBatch(batch, attempt = 1) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: userPrompt(batch) }],
    }),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = attempt * 2000;
    console.warn(`  retry ${attempt} after ${res.status}, wait ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return classifyBatch(batch, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const text = (blocks.find((b) => b?.type === 'text') || blocks[0] || {}).text || '';
  let parsed;
  try {
    parsed = parseResults(text);
  } catch (err) {
    if (attempt < 3) {
      console.warn(`  retry ${attempt} after JSON parse, wait ${attempt * 1500}ms`);
      await new Promise((r) => setTimeout(r, attempt * 1500));
      return classifyBatch(batch, attempt + 1);
    }
    if (batch.length > 1) {
      console.warn(`  splitting ${batch.length} types after JSON failure`);
      const mid = Math.ceil(batch.length / 2);
      const a = await classifyBatch(batch.slice(0, mid));
      const b = await classifyBatch(batch.slice(mid));
      return a.concat(b);
    }
    throw err;
  }
  return attachIds(normalizeResults(parsed.results), batch);
}

function attachIds(results, batch) {
  const pool = [];
  for (const t of batch) {
    for (const it of t.items) pool.push(it);
  }
  const used = new Set();
  const out = [];
  for (const r of results) {
    const exact = pool.find((it) =>
      it.keyword === r.keyword && it.item_id === r.item_id && it.shop_id === r.shop_id);
    if (exact) {
      used.add(`${exact.keyword}\t${exact.item_id}\t${exact.shop_id}`);
      out.push({ ...r, item_id: exact.item_id, shop_id: exact.shop_id });
      continue;
    }
    if (!/^\d+$/.test(r.item_id) || !/^\d+$/.test(r.shop_id)) {
      const fallback = pool.find((it) =>
        it.keyword === r.keyword && !used.has(`${it.keyword}\t${it.item_id}\t${it.shop_id}`));
      if (!fallback) continue;
      used.add(`${fallback.keyword}\t${fallback.item_id}\t${fallback.shop_id}`);
      out.push({ ...r, item_id: fallback.item_id, shop_id: fallback.shop_id });
    }
  }
  return out;
}

async function upsertFlags(rows) {
  const valid = rows.filter((r) => /^\d+$/.test(r.item_id) && /^\d+$/.test(r.shop_id) && r.keyword);
  if (valid.length < rows.length) {
    console.warn(`  skipped ${rows.length - valid.length} rows with missing ids`);
  }
  if (!valid.length) return;
  const values = valid.map((r) =>
    `(${sqlLit(r.keyword)}, ${r.item_id}::bigint, ${r.shop_id}::bigint, ${r.rejected}, ${sqlLit(r.reason)}, ${sqlLit(r.model)})`
  ).join(',\n');
  await psql(`
insert into public.kw_ai_reject (keyword, item_id, shop_id, rejected, reason, model)
values ${values}
on conflict (keyword, item_id, shop_id) do update set
  rejected = excluded.rejected,
  reason = excluded.reason,
  model = excluded.model,
  created_at = now();
`);
}

function printKnown(results, candidates) {
  for (const kw of KNOWN) {
    const items = candidates.filter((c) => c.keyword === kw);
    if (!items.length) continue;
    console.log(`\n=== ${kw} ===`);
    for (const it of items) {
      const hit = results.find((r) =>
        r.keyword === kw && r.item_id === it.item_id && r.shop_id === it.shop_id);
      const flag = hit ? (hit.rejected ? 'REJECT' : 'keep  ') : 'miss  ';
      const why = hit?.reason ? ` — ${hit.reason}` : '';
      console.log(`  ${flag}  #${it.rn}  ${it.product_name}${why}`);
    }
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Set DEEPSEEK_API_KEY (or ANTHROPIC_API_KEY) in the environment.');
    process.exit(1);
  }
  mkdirSync('tmp', { recursive: true });
  const auditPath = join('tmp', 'classify-type-covers.jsonl');
  if (!existsSync(auditPath)) writeFileSync(auditPath, '');

  let rows;
  if (!ONLY.length && !REFRESH_DUMP && existsSync(CANDIDATE_PATH)) {
    rows = readFileSync(CANDIDATE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    console.log(`Loaded cached candidates from ${CANDIDATE_PATH}`);
  } else {
    console.log('Dumping top-5 cover/gallery candidates…');
    rows = await dumpCandidates();
    if (!ONLY.length) {
      writeFileSync(CANDIDATE_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      console.log(`  cached ${rows.length} rows to ${CANDIDATE_PATH}`);
    }
  }
  const byKw = groupByKeyword(rows);
  console.log(`  ${rows.length} listings across ${byKw.size} types`);

  const flags = DRY ? new Set() : await existingFlags();
  const pendingAll = [];
  let skipped = 0;
  for (const [keyword, items] of byKw) {
    if (alreadyDone(items, flags)) { skipped += 1; continue; }
    pendingAll.push({ keyword, items });
  }
  const pending = LIMIT ? pendingAll.slice(0, LIMIT) : pendingAll;
  console.log(`  this_run=${pending.length} pending=${pendingAll.length} flagged=${skipped}`);

  const allResults = [];
  for (let i = 0; i < pending.length; i += BATCH_TYPES) {
    const batch = pending.slice(i, i + BATCH_TYPES);
    const n = Math.floor(i / BATCH_TYPES) + 1;
    const total = Math.ceil(pending.length / BATCH_TYPES);
    process.stdout.write(`  batch ${n}/${total} (${batch.length} types)… `);
    const results = await classifyBatch(batch);
    console.log(`${results.filter((r) => r.rejected).length} rejects`);
    for (const r of results) {
      appendFileSync(auditPath, JSON.stringify(r) + '\n');
    }
    allResults.push(...results);
    if (!DRY) await upsertFlags(results);
    if (i + BATCH_TYPES < pending.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  printKnown(allResults, rows);
  const rejects = allResults.filter((r) => r.rejected);
  console.log(`\nDone. ${allResults.length} classified, ${rejects.length} rejected.${DRY ? ' (dry-run, not written)' : ''}`);
  console.log(`Audit: ${auditPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
