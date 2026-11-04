// Steven auto-reply. Service role only (feedback insert trigger).
// Casual Indonesian reply as Steven via user_notices.steven_followup.
// May research listings, queue a scrape, or email staff. Never ships UI.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtRole } from '../_shared/auth.ts'
import { escapeHtml } from '../_shared/escape.ts'

const AI_MODEL = 'deepseek-v4-pro'
const DEEPSEEK_MESSAGES_URL = 'https://api.deepseek.com/anthropic/v1/messages'
const FOUNDER = 'stevenwilson614@gmail.com'
const STAFF_TO = 'stevenwilson614@gmail.com'
const REPLY_DELAY_MS = 4000

const INTENTS = [
  'product_research', 'trending', 'affiliate_tiktok', 'api', 'confused',
  'ads_complaint', 'feature_ask', 'data_gap', 'thanks_soft', 'unclear', 'skip',
] as const

type Intent = typeof INTENTS[number]

type Draft = {
  intent: Intent
  keywords: string[]
  needs_research: boolean
  queue_scrape: boolean
  staff_feature: boolean
  go: string
  cta: string
  lead: string
}

type Pick = { keyword: string; name: string; price: number; omset: number }

const SYSTEM_PROMPT = `You reply as Steven, founder of LarisID (Shopee product research for Indonesian sellers). The reply is shown in his chat card. Casual Indonesian, short, warm, one clear ask when something is unclear. Never English unless the user wrote English.

Return ONLY JSON:
{
  "intent": "product_research|trending|affiliate_tiktok|api|confused|ads_complaint|feature_ask|data_gap|thanks_soft|unclear|skip",
  "keywords": ["shopee search phrases, lowercase, max 2"],
  "needs_research": false,
  "queue_scrape": false,
  "staff_feature": false,
  "go": "",
  "cta": "",
  "lead": "the chat reply"
}

Rules:
- product_research / trending: they want a product, niche, or what's selling. needs_research true. keywords are search phrases we can look up (e.g. "kaos kaki olahraga"). Do NOT invent product names, prices, sold counts, or omset — the server appends real picks. lead can greet and say you're looking, or ask which type if the ask is huge.
- affiliate_tiktok: commission, creator, affiliate, live GMV, TikTok, Kalodata. Point them to https://www.kalodata.com/ (TikTok Shop, not Shopee). Do not invent rates.
- api: they want an API. go "api", cta "Buka halaman API". Say the API page is in the left menu, no firm release date, we note who needs it.
- confused: how to use the product. go "edukasi", cta "Buka Belajar". Point at Belajar.
- ads_complaint: too many ads, annoying ads. Light ack only. One soft question is ok ("kalau ada versi bayar tanpa iklan, kamu mau?"). Do not promise a build. staff_feature false.
- feature_ask: a missing feature that might help many sellers (date filter, export, charts). Dig: ask what they need. staff_feature true if it could help everyone, false if it's only their taste. NEVER say you already shipped it.
- data_gap: data incomplete, not accurate, not detailed. Ask what extra detail they want. staff_feature true only if the gap would help all users.
- thanks_soft: thanks, "sudah cukup", "baru nyoba", greetings with no ask. Short thanks. No dig.
- unclear: one clarifying question.
- skip: empty, spam, or nothing to say. lead "".
- go is only "api", "edukasi", "directory", or "".
- directory when you want them to open Cari Produk. cta "Buka Cari Produk".
- Label any sales number the server might add as perkiraan. You still must not invent numbers.
- One reply. No bullet essays. No "sebagai AI".`

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function choseBingung(msg: string) {
  return /bingung|binggung|pusing/i.test(msg)
}
function choseApi(msg: string) {
  return /(?:^|[^a-z0-9])api(?:[^a-z0-9]|$)|api-?nya/i.test(msg)
}
function choseKurangLengkap(msg: string) {
  return /kurang lengkap/i.test(msg)
}

function chipAlreadyHandled(page: string, msg: string) {
  if (page !== 'superuser_prompt') return false
  if (choseApi(msg)) return true
  if (choseBingung(msg)) return true
  if (choseKurangLengkap(msg)) return true
  return false
}

function fmtRp(n: number) {
  const v = Math.round(Number(n) || 0)
  if (v >= 1_000_000) {
    const jt = v / 1_000_000
    const s = jt >= 10 ? String(Math.round(jt)) : jt.toFixed(1).replace('.', ',')
    return `Rp${s}jt`
  }
  if (v >= 1000) return `Rp${Math.round(v / 1000)}rb`
  return `Rp${v}`
}

function cleanLead(s: string) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
}

function stripPrices(s: string) {
  return s
    .replace(/rp\s?[\d.,]+(\s?(rb|ribu|jt|juta|m))?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeIntent(v: unknown): Intent {
  const s = String(v || '').toLowerCase().trim()
  return (INTENTS as readonly string[]).includes(s) ? s as Intent : 'unclear'
}

function parseDraft(text: string): Draft {
  let raw: Record<string, unknown> = {}
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { raw = JSON.parse(match[0]) } catch { raw = {} }
  }
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((k) => String(k || '').trim().toLowerCase()).filter((k) => k.length >= 3).slice(0, 2)
    : []
  const goRaw = String(raw.go || '').toLowerCase()
  const go = goRaw === 'api' || goRaw === 'edukasi' || goRaw === 'directory' ? goRaw : ''
  return {
    intent: normalizeIntent(raw.intent),
    keywords,
    needs_research: raw.needs_research === true,
    queue_scrape: raw.queue_scrape === true,
    staff_feature: raw.staff_feature === true,
    go,
    cta: String(raw.cta || '').slice(0, 40),
    lead: cleanLead(String(raw.lead || '')),
  }
}

async function classify(message: string, page: string): Promise<Draft> {
  const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY secret not set')
  const res = await fetch(DEEPSEEK_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      thinking: { type: 'disabled' },
      messages: [{
        role: 'user',
        content: `Page: ${page || '—'}\nMessage: ${JSON.stringify(message).slice(0, 2000)}`,
      }],
    }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`DeepSeek ${res.status}: ${errBody.slice(0, 300)}`)
  }
  const result = await res.json()
  const textBlock = Array.isArray(result.content)
    ? (result.content.find((b: { type?: string }) => b?.type === 'text') || result.content[0])
    : null
  return parseDraft(String(textBlock?.text || ''))
}

function fallbackLead(intent: Intent): string {
  switch (intent) {
    case 'affiliate_tiktok':
      return 'Hai! Kalau yang kamu cari data afiliasi, komisi, atau live, itu lebih pas di Kalodata (https://www.kalodata.com/) — alat TikTok Shop, bukan Shopee. Di LarisID kami riset listing Shopee.'
    case 'api':
      return 'Hai! Halaman API ada di menu kiri. Di situ bisa catat minat dan WhatsApp-mu. Belum ada jadwal rilis pasti, tapi kami catat siapa yang butuh.'
    case 'confused':
      return 'Hai! Kalau masih bingung cara pakainya, buka halaman Belajar di menu kiri ya. Langkahnya pelan-pelan, dari cari produk sampai pantau toko.'
    case 'ads_complaint':
      return 'Hai! Makasih sudah jujur soal iklannya. Kalau nanti ada versi bayar tanpa iklan, kamu lebih suka yang itu?'
    case 'feature_ask':
    case 'data_gap':
      return 'Hai! Makasih sudah bilang. Biar kami kerjakan yang tepat — bagian mana yang kurang, atau fitur apa yang paling kamu butuh? Tulis singkat di sini ya.'
    case 'thanks_soft':
      return 'Hai! Makasih ya. Kalau nanti ada yang mau ditambah, tulis aja di sini.'
    default:
      return 'Hai! Boleh ceritain sedikit lebih spesifik? Lagi cari produk, nanya fitur, atau ada data yang terasa kurang?'
  }
}

function applyRoutes(draft: Draft) {
  if (draft.intent === 'api') {
    draft.go = 'api'
    draft.cta = draft.cta || 'Buka halaman API'
  } else if (draft.intent === 'confused') {
    draft.go = 'edukasi'
    draft.cta = draft.cta || 'Buka Belajar'
  } else if (draft.intent === 'ads_complaint' || draft.intent === 'thanks_soft') {
    draft.go = ''
    draft.cta = ''
    draft.needs_research = false
    draft.queue_scrape = false
    draft.staff_feature = false
  }
  if (draft.intent === 'feature_ask') draft.staff_feature = true
  if (draft.intent === 'affiliate_tiktok') {
    draft.needs_research = false
    draft.queue_scrape = false
    if (!/kalodata/i.test(draft.lead)) draft.lead = fallbackLead('affiliate_tiktok')
  }
}

function composeLead(draft: Draft, research: { picks: Pick[]; closest: string | null; queued: string | null }) {
  let lead = draft.lead || fallbackLead(draft.intent)
  if (!draft.lead) lead = fallbackLead(draft.intent)
  if (research.picks.length && (draft.intent === 'product_research' || draft.intent === 'trending' || draft.needs_research)) {
    const bits = research.picks.slice(0, 2).map((p, i) =>
      `${i + 1}) ${p.name} — sekitar ${fmtRp(p.price)}`)
    const kw = research.picks[0].keyword
    const tail = `Yang lagi kelihatan ramai (omset = perkiraan): ${bits.join('. ')}. Coba ketik "${kw}" di Cari Produk.`
    const head = stripPrices(lead)
    lead = cleanLead(`${head} ${tail}`)
    draft.go = draft.go || 'directory'
    draft.cta = draft.cta || 'Buka Cari Produk'
  } else if (research.queued) {
    const close = research.closest
      ? ` Sementara data mirip sudah ada — coba "${research.closest}" di Cari Produk.`
      : ''
    lead = cleanLead(`${stripPrices(lead)} Aku masukin "${research.queued}" ke antrean scrape.${close}`)
    draft.go = draft.go || 'directory'
    draft.cta = draft.cta || 'Buka Cari Produk'
  }
  if (draft.go === 'api' && !draft.cta) draft.cta = 'Buka halaman API'
  if (draft.go === 'edukasi' && !draft.cta) draft.cta = 'Buka Belajar'
  if (draft.go === 'directory' && !draft.cta) draft.cta = 'Buka Cari Produk'
  return lead
}

async function emailStaff(
  row: Record<string, unknown>,
  draft: Draft,
  lead: string,
) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return
  const subject = `[Fitur?] ${draft.intent} — ${String(row.user_email || 'user').slice(0, 40)}`
  const html = `
    <div style="font-family:sans-serif;max-width:520px;">
      <p style="margin:0 0 8px;">Steven auto-reply flagged this as worth a look. No code was shipped.</p>
      <p style="margin:0 0 8px;"><strong>Intent:</strong> ${escapeHtml(draft.intent)}</p>
      <p style="margin:0 0 8px;"><strong>From:</strong> ${escapeHtml(row.user_email || '—')}</p>
      <p style="margin:0 0 8px;"><strong>They wrote:</strong> ${escapeHtml(row.message || '')}</p>
      <p style="margin:0 0 8px;"><strong>Reply sent:</strong> ${escapeHtml(lead)}</p>
      <p style="margin:12px 0 0;font-size:13px;color:#6B7280;">Inbox: <a href="https://larisid.com/#admin">Admin → Masukan Pengguna</a></p>
    </div>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>',
      to: STAFF_TO,
      subject,
      html,
    }),
  })
}

async function processPayload(payload: Record<string, unknown>) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let row = (payload.record || null) as Record<string, unknown> | null
  const id = row?.id as string | undefined
  if (id) {
    const { data, error } = await supabase.from('feedback').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(error.message)
    if (data) row = data
  } else {
    const since = new Date(Date.now() - 60_000).toISOString()
    const { data, error } = await supabase.from('feedback').select('*')
      .is('auto_replied_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw new Error(error.message)
    row = data?.[0] || null
  }
  if (!row?.id) return { ok: true, skipped: 'no_row' }

  const message = String(row.message || '').trim()
  const email = String(row.user_email || '').toLowerCase()
  const page = String(row.page || '')
  const userId = row.user_id as string | null

  if (row.auto_replied_at) return { ok: true, skipped: 'already' }
  if (!message) return { ok: true, skipped: 'empty', id: row.id }
  if (!userId) return { ok: true, skipped: 'anon', id: row.id }
  if (email === FOUNDER) return { ok: true, skipped: 'founder', id: row.id }
  if (chipAlreadyHandled(page, message)) return { ok: true, skipped: 'chip', id: row.id }

  const { data: openNotes, error: noteErr } = await supabase
    .from('user_notices')
    .select('id,payload')
    .eq('user_id', userId)
    .eq('kind', 'steven_followup')
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(5)
  if (noteErr) throw new Error(noteErr.message)
  const openBot = (openNotes || []).filter((n) => n?.payload?.source === 'steven_auto_reply')
  if (openBot.length && page !== 'steven_followup') {
    return { ok: true, skipped: 'open_bot_notice', id: row.id }
  }

  await sleep(REPLY_DELAY_MS)

  // Re-check after the pause so a parallel trigger cannot double-send.
  const { data: fresh } = await supabase.from('feedback').select('auto_replied_at').eq('id', row.id).maybeSingle()
  if (fresh?.auto_replied_at) return { ok: true, skipped: 'already', id: row.id }

  const draft = await classify(message, page)
  if (draft.intent === 'skip' || !draft.lead && draft.intent === 'skip') {
    return { ok: true, skipped: 'model_skip', id: row.id }
  }
  applyRoutes(draft)

  let research: { picks: Pick[]; closest: string | null; queued: string | null } = {
    picks: [], closest: null, queued: null,
  }
  const wantResearch = draft.needs_research || draft.intent === 'product_research' || draft.intent === 'trending'
  if (wantResearch && draft.keywords.length) {
    const { data, error } = await supabase.rpc('steven_auto_reply_research', {
      p_keywords: draft.keywords,
      p_queue: draft.queue_scrape === true,
    })
    if (error) console.warn('steven-auto-reply research:', error.message)
    else if (data && typeof data === 'object') {
      const d = data as { picks?: Pick[]; closest?: string | null; queued?: string | null }
      research = {
        picks: Array.isArray(d.picks) ? d.picks : [],
        closest: d.closest || null,
        queued: d.queued || null,
      }
    }
  }

  const lead = composeLead(draft, research)
  if (!lead) return { ok: true, skipped: 'empty_lead', id: row.id }

  if (openBot.length) {
    const ids = openBot.map((n) => n.id)
    await supabase.from('user_notices').update({ dismissed_at: new Date().toISOString() }).in('id', ids)
  }

  const payloadNotice: Record<string, string> = {
    lead,
    feedback_id: String(row.id),
    source: 'steven_auto_reply',
    intent: draft.intent,
  }
  if (draft.go) payloadNotice.go = draft.go
  if (draft.cta && draft.go) payloadNotice.cta = draft.cta

  const { error: insErr } = await supabase.from('user_notices').insert({
    user_id: userId,
    kind: 'steven_followup',
    payload: payloadNotice,
  })
  if (insErr) throw new Error(insErr.message)

  await supabase.from('feedback').update({
    auto_replied_at: new Date().toISOString(),
  }).eq('id', row.id)
  await supabase.from('feedback').update({ status: 'reviewing' }).eq('id', row.id).eq('status', 'new')

  if (draft.staff_feature && (draft.intent === 'feature_ask' || draft.intent === 'data_gap')) {
    try { await emailStaff(row, draft, lead) } catch (e) {
      console.warn('steven-auto-reply staff email:', e instanceof Error ? e.message : e)
    }
  }

  return { ok: true, id: row.id, intent: draft.intent }
}

serve(async (req) => {
  if (jwtRole(req) !== 'service_role') return json({ error: 'Forbidden' }, 403)
  let payload: Record<string, unknown> = {}
  try { payload = await req.json() } catch { payload = {} }

  const run = processPayload(payload).then((r) => {
    console.log('steven-auto-reply', JSON.stringify(r))
    return r
  }).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('steven-auto-reply:', msg)
    return { ok: false, error: msg }
  })

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(run)
    return json({ ok: true, queued: true })
  }
  return json(await run)
})
