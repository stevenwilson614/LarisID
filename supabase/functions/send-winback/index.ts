import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { render, CAMPAIGNS, CAMPAIGN_SEGMENT, PLAIN_ONLY } from './templates.ts'
import type { Campaign, Ctx, CityRow, MarketTeardown } from './templates.ts'

const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
// Deliberately its own env var, not RESEND_FROM_EMAIL: that one is shared by
// weekly-digest and send-broadcast, and this campaign's sender identity
// ("Steven dari Laris", personal and brand-dropped-the-ID) is intentionally
// different from theirs.
const FROM_EMAIL = Deno.env.get('WINBACK_FROM_EMAIL') || 'Steven dari Laris <steven@larisid.com>'
const SITE = 'https://larisid.com'

// SUPABASE_URL inside the functions container is http://kong:8000, which is
// useless in an email. Unsubscribe links must use the public API hostname.
const PUBLIC_API = Deno.env.get('PUBLIC_API_URL') || 'https://api.larisid.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' }

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const NATIONAL_KEY = '(nasional)'

// --- helpers ---

// Returns the greeting name, or '' meaning "use the neutral greeting". Real
// display names in this cohort include "BaCoKeR Channel", "419 FATHI MUBAROK"
// and "Plakatana Official"; sending "Halo 419," would be worse than no name.
function nameForGreeting(displayName: string): string {
  if (!displayName) return ''
  const first = displayName.trim().split(/\s+/u)[0]
  if (!first) return ''
  if (first.length < 3) return ''
  if (/\d/.test(first)) return ''
  if (!/^[A-Za-z'.-]+$/.test(first)) return ''
  if (/channel|chanel|official|store|shop|olshop/i.test(displayName)) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function hmacSign(data: string, secret: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return await crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function unsubToken(email: string): Promise<string> {
  const secret = Deno.env.get('WINBACK_UNSUB_SECRET')
  if (!secret) throw new Error('WINBACK_UNSUB_SECRET is not set')
  const emailB64 = base64urlEncode(new TextEncoder().encode(email).buffer)
  const sigB64 = base64urlEncode(await hmacSign(email, secret))
  return `${emailB64}.${sigB64}`
}

// --- main handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: JSON_HEADERS })
    }

    // winback_audience() self-gates on is_platform_admin() and needs auth.uid(),
    // so it must be called with the caller's JWT, not the service-role client.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const body = await req.json()
    const campaign = body.campaign as Campaign | undefined
    const dry_run = !!body.dry_run
    const test_to = body.test_to as string | undefined
    const max_sends = body.max_sends as number | undefined
    const only_user = body.only_user as string | undefined
    const pasar = body.pasar as MarketTeardown | undefined

    if (!campaign || !CAMPAIGNS.includes(campaign)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing campaign' }), { status: 400, headers: JSON_HEADERS })
    }
    // The teardown email has no automated data source: the market and its
    // one-line insight are chosen by hand and passed in the request.
    if (campaign === 'wb4_bedah' && !pasar) {
      return new Response(
        JSON.stringify({ error: 'wb4_bedah requires a "pasar" object in the request body' }),
        { status: 400, headers: JSON_HEADERS },
      )
    }

    const { data: audience, error: audErr } = await userClient.rpc('winback_audience')
    if (audErr) throw audErr

    let rows = (audience as any[]) || []
    rows = rows.filter((r: any) => !r.suppressed && r.email)

    const segmentFilter = CAMPAIGN_SEGMENT[campaign]
    if (segmentFilter) rows = rows.filter((r: any) => r.segment === segmentFilter)
    if (only_user) rows = rows.filter((r: any) => r.user_id === only_user)

    // campaigns_sent only aggregates successful sends, so a previously failed
    // address is still eligible for a retry.
    rows = rows.filter((r: any) => !(Array.isArray(r.campaigns_sent) && r.campaigns_sent.includes(campaign)))

    // Day-7 email splits on whether the pass was actually claimed.
    if (campaign === 'wb3_pantau_a' || campaign === 'wb3_pantau_b') {
      const { data: claimedRows } = await supabaseAdmin
        .from('comeback_passes')
        .select('user_id, claimed_at')
        .eq('campaign', 'winback')
        .not('claimed_at', 'is', null)
      const claimed = new Set((claimedRows || []).map((c: any) => c.user_id))
      rows = rows.filter((r: any) =>
        campaign === 'wb3_pantau_a' ? claimed.has(r.user_id) : !claimed.has(r.user_id))
    }

    if (typeof max_sends === 'number' && max_sends > 0) rows = rows.slice(0, max_sends)

    if (!rows.length) {
      return new Response(
        JSON.stringify({ campaign, sent: 0, failed: [], total_targets: 0, note: 'No recipients after filtering' }),
        { headers: JSON_HEADERS },
      )
    }

    // Latest scrape date, fetched once. Never hardcode it: an email that cites a
    // stale date is worse than one that cites none.
    let tanggalData = ''
    const { data: lastList } = await supabaseAdmin
      .from('listings')
      .select('scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(1)
    if (lastList?.[0]?.scraped_at) {
      const d = new Date(lastList[0].scraped_at)
      tanggalData = `${d.getDate()} ${MONTHS[d.getMonth()] ?? 'Januari'}`
    }

    // City picks loaded once for the whole run, ordered by rank.
    const cityMap = new Map<string, CityRow[]>()
    const { data: cityData } = await supabaseAdmin
      .from('mv_city_email_picks')
      .select('city, rn, product_name, price, total_sold, sellers')
      .order('city', { ascending: true })
      .order('rn', { ascending: true })
    for (const r of (cityData || [])) {
      const key = String(r.city || '').trim().toLowerCase()
      if (!key) continue
      const arr = cityMap.get(key) || []
      arr.push({
        product_name: r.product_name,
        price: r.price,
        total_sold: r.total_sold,
        sellers: r.sellers,
      })
      cityMap.set(key, arr)
    }
    const nasionalRows = cityMap.get(NATIONAL_KEY) || []

    async function getPassToken(userId: string): Promise<string> {
      const { data: res, error } = await supabaseAdmin.rpc('grant_comeback_pass', {
        p_user: userId, p_days: 7, p_campaign: 'winback',
      })
      if (error) throw error
      return (res as any)?.token ?? ''
    }

    const plan: { email: string; segment: string; nama: string; kota: string; subject: string }[] = []
    const failed: { email: string; error: string }[] = []
    let sent = 0

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY && !dry_run) throw new Error('RESEND_API_KEY not set')

    for (const r of rows) {
      const email = r.email as string
      try {
        const nama = nameForGreeting(r.display_name)
        const bulanDaftar = MONTHS[new Date(r.created_at).getMonth()] ?? 'Januari'

        let kota = String(r.city || r.region || '').trim()
        const cityKey = kota.toLowerCase()
        let cityRows: CityRow[]
        if (cityKey && cityKey !== NATIONAL_KEY && cityMap.has(cityKey)) {
          cityRows = cityMap.get(cityKey)!
        } else {
          kota = ''
          cityRows = nasionalRows
        }

        // A dry run must never mutate: no pass is granted, so the link carries a
        // visible placeholder instead of a real token.
        let token = ''
        if (campaign !== 'wb5_sunset') {
          if (dry_run) token = r.pass_token || 'DRY-RUN-NO-TOKEN'
          else token = r.pass_token || (await getPassToken(r.user_id))
        }

        const linkKlaim = token
          ? `${SITE}/?pass=${token}&utm_source=winback&utm_campaign=${campaign}`
          : `${SITE}/?utm_source=winback&utm_campaign=${campaign}`
        const linkPantau = `${SITE}/?view=tracker&utm_source=winback&utm_campaign=${campaign}`
        const linkUnsub = `${PUBLIC_API}/functions/v1/email-unsubscribe?t=${encodeURIComponent(await unsubToken(email))}`

        // Generated here rather than left to the DB default, so it can be
        // embedded in the open-tracking pixel URL before the email is sent.
        // Real sends use it as the email_sends primary key; test/dry-run
        // sends never insert a row so the id is simply discarded.
        const sendId = crypto.randomUUID()
        const pixelUrl = (!dry_run && !test_to && !PLAIN_ONLY.includes(campaign))
          ? `${PUBLIC_API}/functions/v1/email-pixel?s=${sendId}`
          : undefined

        const ctx: Ctx = {
          nama, bulanDaftar, kota, tanggalData,
          linkKlaim, linkPantau, linkUnsub,
          rows: cityRows,
          pasar,
          pixelUrl,
        }
        const rendered = render(campaign, ctx)

        if (dry_run) {
          plan.push({ email, segment: r.segment, nama, kota, subject: rendered.subject })
          continue
        }

        const to = test_to || email
        const subject = test_to ? `[TEST utk ${email}] ${rendered.subject}` : rendered.subject

        const resendBody: Record<string, unknown> = {
          from: FROM_EMAIL,
          reply_to: ADMIN_EMAIL,
          to,
          subject,
          text: rendered.text,
          headers: {
            'List-Unsubscribe': `<${linkUnsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
          // Echoed back on every Resend webhook event, so a payload is
          // self-describing even before joining email_sends. Tag values are
          // restricted by Resend to ASCII letters/digits/underscore/dash.
          tags: [{ name: 'campaign', value: campaign }],
        }
        if (rendered.html !== null) resendBody.html = rendered.html

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(resendBody),
        })
        const resBody = await res.json().catch(() => ({}))

        if (res.ok && resBody?.id) {
          sent++
          // test_to sends are rehearsals; they must not consume the campaign slot.
          // Uses the id generated earlier so it matches the pixel URL already
          // baked into the HTML that was just sent.
          if (!test_to) {
            await supabaseAdmin.from('email_sends').insert({
              id: sendId, user_id: r.user_id, email, campaign, resend_id: resBody.id, status: 'sent',
            })
          }
        } else {
          failed.push({ email, error: resBody?.message || resBody?.name || JSON.stringify(resBody) })
        }

        // Resend caps at 2 requests/second; without this pause it returns 429.
        await new Promise((resolve) => setTimeout(resolve, 600))
      } catch (e) {
        // One bad address must not abort the wave.
        failed.push({ email: email || '', error: e instanceof Error ? e.message : String(e) })
      }
    }

    if (dry_run) {
      return new Response(
        JSON.stringify({ dry_run: true, campaign, count: plan.length, recipients: plan }),
        { headers: JSON_HEADERS },
      )
    }
    return new Response(
      JSON.stringify({ campaign, sent, failed, total_targets: rows.length }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error('send-winback error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS })
  }
})
