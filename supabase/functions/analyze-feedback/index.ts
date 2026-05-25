import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
Feedback types: bug, feature, other (general) | wrong_data, not_working, request_edit (element-specific).`

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  try {
    const payload = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let items: Record<string, unknown>[] = []

    if (payload.batch) {
      // Batch mode: pick up everything unanalyzed in the last 24 h
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('feedback')
        .select('*')
        .is('ai_analyzed_at', null)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(30)
      items = data || []
    } else {
      // Single mode: resolve the row
      let row = payload.record as Record<string, unknown> | null

      if (row?.id) {
        // Prefer a fresh read so we have all columns
        const { data } = await supabase
          .from('feedback').select('*').eq('id', row.id).single()
        if (data) row = data
      } else {
        // Fallback: find the most recent unanalyzed row (within 60 s)
        const since = new Date(Date.now() - 60_000).toISOString()
        const q = supabase
          .from('feedback').select('*')
          .is('ai_analyzed_at', null)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
        const { data } = await q
        if (data?.[0]) row = data[0]
      }

      if (row) items = [row]
    }

    const results = []
    for (const row of items) {
      const analysis = await analyzeRow(row, supabase)
      if (analysis) results.push({ id: row.id, ...analysis })
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})

// ── Analyze one feedback row ──────────────────────────────────────────────────
async function analyzeRow(
  row: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
): Promise<Record<string, string> | null> {
  // Pattern detection: how many other reports on the same element in last 7 days?
  let patternContext = ''
  const ctx = row.element_context as { element?: string; section?: string } | null
  if (ctx?.element) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: related } = await supabase
      .from('feedback')
      .select('id, type, created_at')
      .contains('element_context', { element: ctx.element })
      .neq('id', row.id as string)
      .gte('created_at', since7d)
      .limit(10)

    const count = related?.length ?? 0
    if (count >= 2) {
      patternContext = `\nPATTERN ALERT: ${count} other user(s) reported issues with "${ctx.element}" in the last 7 days — likely site-wide.`
    }
  }

  // Build the prompt
  const typeMap: Record<string, string> = {
    bug: 'Bug / Error', feature: 'Feature Request', other: 'Other',
    wrong_data: 'Wrong Data', not_working: 'Not Working', request_edit: 'Request Edit',
  }
  const prompt = `Feedback to analyze:
Type: ${typeMap[row.type as string] ?? row.type}
Element: ${ctx?.element ? `${ctx.element}${ctx.section ? ' · ' + ctx.section : ''}` : '(general — no specific element)'}
Message: "${row.message || '(no message provided)'}"
User: ${row.user_email || 'anonymous'}
Page: ${row.page || '—'}
${patternContext}`

  // Call Claude Haiku
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 350,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) return null

  const result = await res.json()
  const text: string = result.content?.[0]?.text ?? ''

  let analysis: Record<string, string> = {}
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) analysis = JSON.parse(match[0])
  } catch {
    return null
  }

  const patch = {
    ai_priority:    analysis.priority  || 'low',
    ai_scope:       analysis.scope     || 'element',
    ai_action:      analysis.action    || 'monitor',
    ai_notes:       analysis.notes     || '',
    ai_analyzed_at: new Date().toISOString(),
  }

  await supabase.from('feedback').update(patch).eq('id', row.id as string)

  return patch
}
