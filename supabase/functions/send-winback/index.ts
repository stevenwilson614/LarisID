import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { render, CAMPAIGNS, CAMPAIGN_SEGMENT } from './templates.ts'
import type { Campaign, Ctx, CityRow } from './templates.ts'

const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const SITE = 'https://larisid.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// --- helpers ---

function nameForGreeting(displayName: string): string {
  if (!displayName) return ''
  const first = displayName.trim().split(/\s+/u)[0]
  if (!first) return ''
  if (first.length < 3) return ''
  if (/\d/.test(first)) return ''
  if (!/^[A-Za-z'.\\-]+$/.test(first)) return ''
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
  const keyData = enc.encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', key, enc.encode(data))
}

async function unsubToken(email: string): Promise<string> {
  const secret = Deno.env.get('WINBACK_UNSUB_SECRET')
  if (!secret) throw new Error('WINBACK_UNSUB_SECRET is not set')
  const emailBytes = new TextEncoder().encode(email)
  const emailB64 = base64urlEncode(emailBytes.buffer)
  const sigWith = await hmacSign(email, secret)
  const sigB64 = base64urlEncode(sigWith)
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
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
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
    }

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

    if (!campaign || !CAMPAIGNS.includes(campaign)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing campaign' }), { status: 400, headers: CORS })
    }

    if (campaign === 'wb4_bedah') {
      return new Response(JSON.stringify({ error: 'Bedah campaign not supported for auto-run' }), { status: 400, headers: CORS })
    }

    const { data: audience, error: audErr } = await userClient.rpc('winback_audience')
    if (audErr) throw audErr

    let rows = (audience as any[]) || []
    rows = rows.filter((r: any) => !r.suppressed && r.email)
    const segmentFilter = CAMPAIGN_SEGMENT[campaign]
    if (segmentFilter) {
      rows = rows.filter((r: any) => r.segment === segmentFilter)
    }
    if (only_user) {
      rows = rows.filter((r: any) => r.user_id === only_user)
    }
    rows = rows.filter((r: any) => !(Array.isArray(r.campaigns_sent) && r.campaigns_sent.includes(campaign)))
    if (typeof max_sends === 'number' && max_sends > 0) {
      rows = rows.slice(0, max_sends)
    }

    if (!rows.length) {
      return new Response(JSON.stringify({ campaign, sent: 0, failed: [], total_targets: 0, note: 'No recipients after filtering' }), { headers: CORS })
    }

    // date of latest scrape
    let tanggalData = ''
    const { data: lastList, error: listErr } = await supabaseAdmin
      .from('listings')
      .select('scraped_at')
      .order('scraped_at', { ascending: false })
      .limit(1)
    if (!listErr && lastList?.[0]?.scraped_at) {
      const d = new Date(lastList[0].scraped_at)
      const day = d.getDate()
      const monthIdx = d.getMonth()
      const monthName = MONTHS[monthIdx] ?? 'Januari'
      tanggalData = `${day} ${monthName}`
    }

    // city data once
    const cityMap = new Map<string, CityRow[]>()
    let nasionalRows: CityRow[] = []
    const { data: cityData, error: cityErr } = await supabaseAdmin
      .from('mv_city_email_picks')
      .select('city, product_name, price, total_sold, sellers')
    if (!cityErr && cityData) {
      for (const r of cityData) {
        const c: CityRow = {
          product_name: r.product_name,
          price: r.price,
          total_sold: r.total_sold,
          sellers: r.sellers,
        }
        const cityKey = (r.city || '').trim().toLowerCase()
        if (cityKey) {
          const arr = cityMap.get(cityKey) || []
          arr.push(c)
          cityMap.set(cityKey, arr)
        } else {
          nasionalRows.push(c)
        }
      }
    }

    // pass token for each recipient
    async function getPassToken(userId: string): Promise<string> {
      const { data: res, error } = await supabaseAdmin.rpc('grant_comeback_pass', {
        p_user: userId,
        p_days: 7,
        p_campaign: 'winback',
      })
      if (error) throw error
      return (res as any)?.token ?? ''
    }

    const sentArr: { email: string; segment: string; nama: string; kota: string; subject: string }[] = []
    let sent = 0
    const failed: { email: string; error: string }[] = []
    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set')

    for (const r of rows) {
      try {
        const email = r.email as string
        const nama = nameForGreeting(r.display_name)
        const createdDate = new Date(r.created_at)
        const bulanDaftar = MONTHS[createdDate.getMonth()] ?? 'Januari'

        let kota = (r.city || r.region || '').trim()
        const cityLower = kota.toLowerCase()
        let cityRows: CityRow[] | undefined
        if (cityLower && cityMap.has(cityLower)) {
          cityRows = cityMap.get(cityLower)!
        } else {
          kota = ''
          cityRows = nasionalRows
        }

        let token = ''
        if (campaign !== 'wb5_sunset') {
          token = r.pass_token || (await getPassToken(r.user_id))
        }

        const linkKlaim = token ? `${SITE}/?pass=${token}&utm_source=winback&utm_campaign=${campaign}` : ''
        const linkPantau = `${SITE}/?view=tracker&utm_source=winback&utm_campaign=${campaign}`
        const unsub = await unsubToken(email)
        const linkUnsub = `${Deno.env.get('SUPABASE_URL')!}/functions/v1/email-unsubscribe?t=${encodeURIComponent(unsub)}`

        const ctx: Ctx = {
          nama,
          bulanDaftar,
          kota,
          tanggalData,
          linkKlaim,
          linkPantau,
          linkUnsub,
          rows: cityRows ?? [],
        }

        const rendered = render(campaign, ctx)

        if (dry_run) {
          sentArr.push({ email, segment: r.segment, nama, kota, subject: rendered.subject })
          continue
        }

        const to = test_to || email
        const subject = test_to ? `[TEST utk ${email}] ${rendered.subject}` : rendered.subject

        const resendBody: any = {
          from: FROM_EMAIL,
          reply_to: ADMIN_EMAIL,
          to,
          subject,
          text: rendered.text,
          headers: {
            'List-Unsubscribe': `<${linkUnsub}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
        if (rendered.html !== null) {
          resendBody.html = rendered.html
        }

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(resendBody),
        })
        const resBody = await res.json().catch(() => ({}))
        if (res.ok && resBody?.id) {
          sent++
          if (!test_to) {
            await supabaseAdmin.from('email_sends').insert({
              user_id: r.user_id,
              email,
              campaign,
              resend_id: resBody.id,
              status: 'sent',
            })
          }
        } else {
          failed.push({ email, error: resBody?.message || resBody?.name || JSON.stringify(resBody) })
          if (!test_to) {
            await supabaseAdmin.from('email_sends').insert({
              user_id: r.user_id,
              email,
              campaign,
              status: 'failed',
            })
          }
        }

        await new Promise(resolve => setTimeout(resolve, 600))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        failed.push({ email: r.email || '', error: msg })
      }
    }

    const total_targets = rows.length
    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, campaign, count: sentArr.length, recipients: sentArr }), { headers: CORS })
    }

    return new Response(JSON.stringify({ campaign, sent, failed, total_targets }), { headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
})
