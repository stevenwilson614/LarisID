/**
 * Auto-classify market_index rows that are still unknown, or brand/shop
 * without a parent. Called by pg_cron after the nightly matview rebuild.
 *
 * Auth: service_role only.
 * Deploy: bash scripts/deploy-function-selfhost.sh classify-market-index
 * Schedule: bash scripts/schedule-classify-market-index.sh
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_MODEL = 'deepseek-v4-pro'
const DEEPSEEK_MESSAGES_URL = 'https://api.deepseek.com/anthropic/v1/messages'
const BATCH = 15
const DEFAULT_LIMIT = 40

const SYSTEM = [
  'You classify Shopee search keywords for LarisID market_index.',
  'kind is product | brand | shop | modifier | unknown.',
  'parent is a broader PRODUCT market keyword (not another brand/shop), or empty.',
  'brand is the brand name or empty.',
  'Rules:',
  '- Multi-token product phrases ending in olshop (plastik packing olshop) = product, not shop.',
  '- "X official" / "X official store" / short "X olshop" (≤2 tokens) = shop; parent = the product they mostly sell.',
  '- Misspelled brand keywords (birkenstok) = brand; parent = the product category.',
  '- Prefer a short Indonesian parent. Leave parent empty if unsure.',
  'Reply with ONLY one minified JSON object per line: {"keyword","kind","parent","brand"}. No prose.',
].join(' ')

function jwtRole(req: Request): string {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role || ''
  } catch {
    return ''
  }
}

type Candidate = { keyword: string; kind: string; n_listings: number; titles: string[] }
type Classified = { keyword?: string; kind?: string; parent?: string; brand?: string }

async function ask(batch: Candidate[], apiKey: string): Promise<Classified[]> {
  const res = await fetch(DEEPSEEK_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 2000,
      temperature: 0,
      thinking: { type: 'disabled' },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: batch
          .map((b) => `${b.keyword} | now ${b.kind} | titles: ${b.titles.join(' / ') || '(none)'}`)
          .join('\n'),
      }],
    }),
  })
  if (!res.ok) {
    throw new Error(`DeepSeek ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const body = await res.json()
  const textBlock = Array.isArray(body.content)
    ? (body.content.find((b: { type?: string }) => b?.type === 'text') || body.content[0])
    : null
  const text = String(textBlock?.text || '')
  const rows: Classified[] = []
  for (const line of text.split('\n')) {
    const i = line.indexOf('{')
    const j = line.lastIndexOf('}')
    if (i < 0 || j < i) continue
    try {
      rows.push(JSON.parse(line.slice(i, j + 1)))
    } catch {
      /* skip */
    }
  }
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (jwtRole(req) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY secret not set')

    let limit = DEFAULT_LIMIT
    try {
      const payload = await req.json()
      if (payload && Number(payload.limit) > 0) limit = Math.min(200, Number(payload.limit))
    } catch {
      /* empty body is fine */
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Two queries — PostgREST nested AND inside OR is brittle.
    const [unk, orphan] = await Promise.all([
      supabase
        .from('market_index')
        .select('keyword,kind,n_listings')
        .eq('kind', 'unknown')
        .neq('source', 'manual')
        .order('n_listings', { ascending: false, nullsFirst: false })
        .limit(limit),
      supabase
        .from('market_index')
        .select('keyword,kind,n_listings')
        .in('kind', ['brand', 'shop'])
        .is('parent_keyword', null)
        .neq('source', 'manual')
        .order('n_listings', { ascending: false, nullsFirst: false })
        .limit(limit),
    ])
    if (unk.error) throw unk.error
    if (orphan.error) throw orphan.error

    const seen = new Set<string>()
    const rows: Array<{ keyword: string; kind: string; n_listings: number }> = []
    for (const r of [...(unk.data || []), ...(orphan.data || [])]) {
      if (seen.has(r.keyword)) continue
      seen.add(r.keyword)
      rows.push(r)
    }
    rows.sort((a, b) => (Number(b.n_listings) || 0) - (Number(a.n_listings) || 0))
    rows.splice(limit)

    if (!rows.length) {
      return new Response(JSON.stringify({ ok: true, candidates: 0, wrote: 0 }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const candidates: Candidate[] = []
    for (const row of rows) {
      const { data: titles } = await supabase
        .from('listings_deduped')
        .select('product_name')
        .eq('keyword', row.keyword)
        .eq('is_offtopic', false)
        .gt('total_sold', 0)
        .order('total_sold', { ascending: false })
        .limit(3)
      candidates.push({
        keyword: row.keyword,
        kind: row.kind,
        n_listings: Number(row.n_listings) || 0,
        titles: (titles || []).map((t) => String(t.product_name || '').slice(0, 80)).filter(Boolean),
      })
    }

    const allowed = new Set(['product', 'brand', 'shop', 'modifier', 'unknown'])
    let wrote = 0
    const skipped: string[] = []

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH)
      const classified = await ask(batch, apiKey)
      const parentHints = [...new Set(
        classified.map((c) => String(c.parent || '').toLowerCase().trim()).filter(Boolean),
      )]
      const parentMap = new Map<string, string>()
      for (const hint of parentHints) {
        const { data: exact } = await supabase
          .from('market_index')
          .select('keyword')
          .eq('kind', 'product')
          .eq('keyword', hint)
          .limit(1)
        if (exact?.[0]?.keyword) {
          parentMap.set(hint, exact[0].keyword)
          continue
        }
        // Fuzzy via RPC-free fallback: pull a wider product slice and score client-side.
        const { data: fuzzy } = await supabase.rpc('match_market_parent', { p_hint: hint })
        if (Array.isArray(fuzzy) && fuzzy[0]?.keyword) {
          parentMap.set(hint, fuzzy[0].keyword)
        }
      }

      for (const row of classified) {
        const kw = String(row.keyword || '').toLowerCase().trim()
        const kind = String(row.kind || '').toLowerCase().trim()
        if (!kw || !allowed.has(kind)) continue
        const parentRaw = String(row.parent || '').toLowerCase().trim()
        const parent = parentMap.get(parentRaw) || ''
        if ((kind === 'brand' || kind === 'shop') && !parent) {
          skipped.push(kw)
          continue
        }
        const { error: uErr } = await supabase
          .from('market_index')
          .update({
            kind,
            parent_keyword: parent || null,
            brand: String(row.brand || '').trim() || null,
            source: 'ai',
            updated_at: new Date().toISOString(),
          })
          .eq('keyword', kw)
          .neq('source', 'manual')
        if (uErr) throw uErr
        wrote += 1
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      candidates: candidates.length,
      wrote,
      skipped: skipped.slice(0, 20),
    }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
