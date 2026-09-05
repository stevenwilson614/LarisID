import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Classification rules baked into the system prompt ────────────────────────
const SYSTEM_PROMPT = `You are a feedback triage agent for LarisID, a Shopee product intelligence tool for Indonesian e-commerce sellers. Your notes go directly to the developer/admin — be technical and specific.

Return ONLY a valid JSON object, no other text:
{
  "priority": "critical|high|medium|low|personal",
  "scope": "site-wide|section|element|personal-preference",
  "action": "fix-now|investigate|monitor|note-only",
  "notes": "2–3 sentences in English written as developer notes."
}

━━━ GENERAL RULES ━━━

RULE 1 — PERSONAL PREFERENCE (strictest, overrides all others):
Any feedback that is PURELY subjective aesthetic opinion with zero data or functionality impact:
→ priority: personal, scope: personal-preference, action: note-only
Triggers: color opinions, font/size preferences, layout taste, "make it look nicer", "I don't like this", "update the design", "the UI is ugly", "colors suck", "boring", style comparisons.
Even if stated forcefully or repeatedly — design opinions are NEVER bugs.
Notes template: "Personal aesthetic note: [specific complaint]. Will not be actioned automatically. Flag for design review backlog if pattern emerges."

RULE 2 — CRITICAL (fix-now):
→ Chart or section completely blank / returns error / shows NaN or 0 for everything
→ Core functionality broken (can't load, crashes, infinite spinner)
→ Same element reported by multiple users within 24h (site-wide signal)
Notes: state what is likely broken and where to look first in the data pipeline.

RULE 3 — HIGH (investigate):
→ User cites specific numbers that contradict reality ("shows 500 sold but Shopee shows 200")
→ Data clearly wrong with user confidence
→ type = wrong_data or not_working with specific details given
Notes: name the likely Supabase table to audit (weekly_snapshots, keyword_intelligence, listings_deduped, listing_deltas).

RULE 4 — MEDIUM (investigate or monitor):
→ Data seems stale / behind / outdated
→ Calculation seems slightly off, user uncertain
→ type = request_edit with a specific correction
Notes: suggest a targeted query or scrape-run check.

RULE 5 — LOW (monitor):
→ Feature request to improve clarity, single vague report, minor UX friction not affecting data
Notes: note the request briefly.

━━━ SCOPE RULES ━━━
site-wide: multiple reports on the same element, or fundamental pipeline issue
section: affects a whole feature area (all keyword charts, all trend charts)
element: isolated to one specific chart, card, or metric
personal-preference: subjective opinion, no technical component

━━━ APP CONTEXT ━━━
Charts: sales trends (dd-chart-trend), price distribution (dd-chart-dist), competitor donut, category performance, market demand (ap-demand-chart), keyword trend (tren-main-chart), comparison trend (tren-cmp-chart), weekly tracking (trk-chart-weekly), keyword revenue (kd-cat-chart), keyword top-15 trend (kd-trend-chart).
Data pipeline: Shopee scraper → Supabase (weekly_snapshots, keyword_intelligence, listings_deduped, listing_deltas, scrape_runs).
Feedback types: product, idea, feature, other, bug (general) | wrong_data, not_working, request_edit (element-specific).`

const AI_MODEL = 'deepseek-v4-pro'
const DEEPSEEK_MESSAGES_URL = 'https://api.deepseek.com/anthropic/v1/messages'

// ── Main handler ─────────────────────────────────────────────────────────────
function jwtRole(req: Request): string {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role || ''
  } catch {
    return ''
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }
  if (jwtRole(req) !== 'service_role') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
  }

  try {
    const payload = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let items: Record<string, unknown>[] = []

    if (payload.batch) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .is('ai_analyzed_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw new Error(`fetch batch: ${error.message}`)
      items = data || []
    } else {
      let row = payload.record as Record<string, unknown> | null

      if (row?.id) {
        const { data, error } = await supabase
          .from('feedback').select('*').eq('id', row.id).single()
        if (error) console.error('analyze-feedback: row fetch', error.message)
        if (data) row = data
      } else {
        const since = new Date(Date.now() - 60_000).toISOString()
        const { data, error } = await supabase
          .from('feedback').select('*')
          .is('ai_analyzed_at', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
        if (error) console.error('analyze-feedback: fallback fetch', error.message)
        if (data?.[0]) row = data[0]
      }

      if (row) items = [row]
    }

    const results: Record<string, unknown>[] = []
    const errors: { id: unknown; error: string }[] = []

    for (const row of items) {
      try {
        const analysis = await analyzeRow(row, supabase)
        if (analysis) results.push({ id: row.id, ...analysis })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('analyze-feedback: row failed', row.id, msg)
        errors.push({ id: row.id, error: msg })
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results, errors, itemCount: items.length }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('analyze-feedback: fatal', msg)
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  }
})

// ── Analyze one feedback row ──────────────────────────────────────────────────
async function analyzeRow(
  row: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, string> | null> {
  let patternContext = ''
  const ctx = row.element_context as { element?: string; section?: string } | null
  if (ctx?.element) {
    try {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data: related, error } = await supabase
        .from('feedback')
        .select('id, type, created_at, element_context')
        .neq('id', row.id as string)
        .gte('created_at', since7d)
        .limit(20)

      if (!error && related?.length) {
        const sameElement = related.filter((r) => {
          const ec = r.element_context as { element?: string } | null
          return ec?.element === ctx.element
        })
        if (sameElement.length >= 2) {
          patternContext = `\nPATTERN ALERT: ${sameElement.length} other user(s) reported issues with "${ctx.element}" in the last 7 days — likely site-wide.`
        }
      }
    } catch (e) {
      console.warn('analyze-feedback: pattern detection skipped', e)
    }
  }

  const typeMap: Record<string, string> = {
    product: 'Product Request', idea: 'Idea', bug: 'Bug / Error', feature: 'Feature Request', other: 'Feedback',
    wrong_data: 'Wrong Data', not_working: 'Not Working', request_edit: 'Request Edit',
  }
  const prompt = `Feedback to analyze:
Type: ${typeMap[row.type as string] ?? row.type}
Element: ${ctx?.element ? `${ctx.element}${ctx.section ? ' · ' + ctx.section : ''}` : '(general — no specific element)'}
Message: "${row.message || '(no message provided)'}"
User: ${row.user_email || 'anonymous'}
Page: ${row.page || '—'}
${patternContext}`

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY secret not set on Supabase project')

  const res = await fetch(DEEPSEEK_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 350,
      system: SYSTEM_PROMPT,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`DeepSeek ${res.status}: ${errBody.slice(0, 500)}`)
  }

  const result = await res.json()
  const textBlock = Array.isArray(result.content)
    ? (result.content.find((b: { type?: string }) => b?.type === 'text') || result.content[0])
    : null
  const text: string = textBlock?.text ?? ''

  let analysis: Record<string, string> = {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { analysis = JSON.parse(match[0]) } catch {
      console.warn('analyze-feedback: JSON parse failed, using defaults. Raw:', text.slice(0, 200))
    }
  }

  // Normalize to strict enums in case the model goes off-script
  const VALID_PRIORITY = ['critical','high','medium','low','personal']
  const VALID_SCOPE    = ['site-wide','section','element','personal-preference']
  const VALID_ACTION   = ['fix-now','investigate','monitor','note-only']
  const normalizeEnum = (val: string | undefined, valid: string[], fallback: string) => {
    if (!val) return fallback
    const v = val.toLowerCase()
    return valid.find(e => v === e || v.startsWith(e.replace('-','')) || v.startsWith(e)) ?? fallback
  }

  const patch = {
    ai_priority:    normalizeEnum(analysis.priority, VALID_PRIORITY, 'low'),
    ai_scope:       normalizeEnum(analysis.scope,    VALID_SCOPE,    'element'),
    ai_action:      normalizeEnum(analysis.action,   VALID_ACTION,   'monitor'),
    ai_notes:       analysis.notes || text.slice(0, 500) || 'Analysis completed but response was not valid JSON.',
    ai_analyzed_at: new Date().toISOString(),
  }

  const { error: updateErr } = await supabase
    .from('feedback')
    .update(patch)
    .eq('id', row.id as string)

  if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

  return patch
}
