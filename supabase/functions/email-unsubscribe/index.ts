// One-click unsubscribe for win-back email. Unauthenticated by design: it is
// opened straight from an inbox, so it must be listed in NO_VERIFY_JWT_FUNCTIONS.
//
// GET shows a confirm button, POST performs the suppression. That split matters:
// mail scanners and link prefetchers follow GET links, and a GET that
// unsubscribed on sight would silently drop people who never clicked. Gmail's
// List-Unsubscribe-Post one-click sends a POST, so the header path still works
// in a single step.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

function base64urlToBytes(str: string): Uint8Array {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const binary = atob(s)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
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

// Length-independent comparison so a wrong token cannot be narrowed by timing.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let diff = ab.length ^ bb.length
  const n = Math.max(ab.length, bb.length)
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

async function verifyToken(token: string): Promise<string | null> {
  const secret = Deno.env.get('WINBACK_UNSUB_SECRET')
  if (!secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  try {
    const email = new TextDecoder().decode(base64urlToBytes(parts[0]))
    if (!email || !email.includes('@')) return null
    const expected = base64urlEncode(await hmacSign(email, secret))
    return timingSafeEqual(expected, parts[1]) ? email : null
  } catch {
    return null
  }
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px;
         background: #F5F5F4; color: #1A1A1A; }
  .card { max-width: 480px; margin: 40px auto; padding: 32px; border-radius: 12px;
          background: #FFFFFF; border: 1px solid #E5E7EB; }
  h1 { font-size: 1.35rem; margin: 0 0 12px; }
  p { line-height: 1.6; margin: 0 0 14px; }
  a { color: #E8442A; }
  button { background: #E8442A; color: #FFFFFF; border: 0; border-radius: 8px;
           padding: 12px 20px; font-size: 15px; font-weight: 700; cursor: pointer; }
  @media (prefers-color-scheme: dark) {
    body { background: #0F1117; color: #E5E7EB; }
    .card { background: #171A21; border-color: #2A2F3A; }
  }
`

function page(title: string, inner: string, status = 200): Response {
  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="card">${inner}</div>
</body>
</html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

const INVALID = `
  <h1>Link tidak valid</h1>
  <p>Link berhenti berlanggananmu tidak bisa dibaca. Pastikan kamu membuka url yang lengkap dari email.</p>
  <p><a href="https://larisid.com">Kembali ke LarisID</a></p>`

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') ?? ''
    if (!token) return page('Link tidak valid', INVALID, 400)

    const email = await verifyToken(token)
    if (!email) return page('Link tidak valid', INVALID, 400)

    if (req.method === 'GET') {
      return page('Berhenti berlangganan', `
  <h1>Berhenti terima email?</h1>
  <p>Alamat <strong>${email.replace(/</g, '&lt;')}</strong> tidak akan menerima email dari LarisID lagi.
     Akunmu tetap aman dan bisa dipakai kapan saja.</p>
  <form method="POST">
    <button type="submit">Ya, berhenti kirim email</button>
  </form>
  <p style="margin-top:18px"><a href="https://larisid.com">Batal, kembali ke LarisID</a></p>`)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    // Upsert so a second click is harmless.
    const { error } = await supabaseAdmin.from('email_suppressions').upsert(
      { email, reason: 'unsubscribe' },
      { onConflict: 'email' },
    )
    if (error) console.error('email-unsubscribe insert failed:', error)

    return page('Berhenti berlangganan', `
  <h1>Sudah berhenti</h1>
  <p>Email kamu sudah dihapus dari daftar. Akunmu tetap aman.</p>
  <p><a href="https://larisid.com">Kembali ke LarisID</a></p>`)
  } catch (err) {
    console.error('email-unsubscribe error:', err)
    return page('Link tidak valid', INVALID, 400)
  }
})
