// IP -> city/province for the user map, resolved on our server.
//
// This replaces a browser-side call to ipwho.is for two reasons. First,
// ipwho.is returns the ISLAND in its `region` field ("Java", "Sumatra"), not
// the province, which a province map cannot use; ipinfo.io returns the real
// province ("West Java", "Jakarta") and Jakarta kota-level cities. Second,
// doing the lookup here means the visitor's browser never contacts a third
// party, so ad-blockers cannot silently erase a chunk of the map.
//
// We never accept or persist an IP address. The IP is read from the request
// header, exchanged for a place name, and dropped -- nothing writes it to a
// column, a log line, or the response.
//
// This function only resolves a place and hands it back; it writes nothing.
// log_page_view() owns public.visitor_locations — its own header says so — and
// the client passes what it gets here straight into that call. Writing from
// both ends double-counted hit_count on every visit, and needing no
// service-role key here is the better shape anyway.
//
// Place names are returned exactly as ipinfo spells them. public.geo_resolve()
// already knows the English forms, so name normalisation stays in one place
// instead of being half here and half in SQL.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { CORS, JSON_HEADERS, corsOk } from '../_shared/cors.ts'

// Reserved ranges, plus anything that is not a plain IPv4/IPv6 literal. Behind
// Caddy -> Kong the left-most X-Forwarded-For hop is the real client, but a
// direct container-to-container call would put a private address there.
function isPublicIp(ip: string): boolean {
  if (!ip) return false
  if (ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')) return false
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return ip.includes(':') // let public IPv6 through
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 169 && b === 254) return false
  return a > 0 && a < 224
}

const clip = (v: unknown, n: number): string | null => {
  const s = String(v ?? '').trim().slice(0, n)
  return s || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsOk()

  const fail = (reason: string) =>
    new Response(JSON.stringify({ ok: false, reason }), { status: 200, headers: JSON_HEADERS })

  try {
    const ip = (req.headers.get('X-Forwarded-For') ?? '').split(',')[0]?.trim() ?? ''
    if (!isPublicIp(ip)) return fail('no_public_ip')

    const token = Deno.env.get('IPINFO_TOKEN') ?? ''
    const url = `https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ''}`

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    let info: Record<string, unknown>
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
      if (!res.ok) return fail(`lookup_${res.status}`)
      info = await res.json()
    } finally {
      clearTimeout(timer)
    }

    const country = clip(info.country, 2)?.toUpperCase() ?? null
    // Foreign lookups are why "Algiers" and "Chindrieux" sit in
    // user_onboarding_prefs.region today. Report the country, store nothing.
    if (country !== 'ID') return new Response(JSON.stringify({ ok: true, country, city: null, region: null }), { headers: JSON_HEADERS })

    const city = clip(info.city, 80)
    const region = clip(info.region, 80)
    const [latRaw, lonRaw] = String(info.loc ?? '').split(',')
    const lat = Number.isFinite(Number(latRaw)) ? Number(latRaw) : null
    const lon = Number.isFinite(Number(lonRaw)) ? Number(lonRaw) : null
    if (!city && !region) return fail('no_place')

    return new Response(JSON.stringify({ ok: true, city, region, country, lat, lon }), { headers: JSON_HEADERS })
  } catch (err) {
    console.error('geo-locate error:', err)
    return new Response(JSON.stringify({ ok: false, reason: 'error' }), { status: 200, headers: CORS })
  }
})
