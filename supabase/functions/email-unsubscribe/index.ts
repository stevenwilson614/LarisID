import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SECRET = Deno.env.get('WINBACK_UNSUB_SECRET')
if (!SECRET) throw new Error('WINBACK_UNSUB_SECRET is not set')

function base64urlDecodeB64(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return atob(s)
}

async function base64urlDecodeUtf8(str: string): Promise<string> {
  const binary = base64urlDecodeB64(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function hmacSign(data: string, secret: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const keyData = enc.encode(secret)
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return await crypto.subtle.sign('HMAC', key, enc.encode(data))
}

function base64urlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function verifyToken(token: string): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [emailB64, sigB64] = parts
  try {
    const email = await base64urlDecodeUtf8(emailB64)
    if (!email) return null
    const expectedSig = await hmacSign(email, SECRET)
    const expectedB64 = base64urlEncode(expectedSig)
    // simple constant-length compare
    if (expectedB64 !== sigB64) return null
    return email
  } catch {
    return null
  }
}

const htmlPage = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Unsubscribe</title>
<style>
  body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 20px;
    background: #F5F5F4;
    color: #1A1A1A;
    transition: background .3s, color .3s;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0F1117; color: #E5E7EB; }
  }
  a { color: #E8442A; }
  .card {
    max-width: 480px;
    margin: 40px auto;
    padding: 32px;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #E5E7EB;
  }
</style>
</head>
<body>
<div class="card">
  <h1 style="font-size:1.5rem;margin:0 0 12px">Berhenti berlangganan</h1>
  <p>Email kamu sudah dihapus dari daftar. Akunmu tetap aman.</p>
  <p><a href="https://larisid.com">Kembali ke LarisID</a></p>
</div>
</body>
</html>`

const badHtml = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Invalid link</title>
<style>
  body {
    font-family: system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 20px;
    background: #F5F5F4;
    color: #1A1A1A;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0F1117; color: #E5E7EB; }
  }
</style>
</head>
<body>
<div style="max-width:480px;margin:40px auto;padding:32px;border-radius:12px;background:#fff;border:1px solid #E5E7EB">
  <p>Link tidak valid. Pastikan url lengkap.</p>
</div>
</body>
</html>`

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('t') ?? ''
    if (!token) {
      return new Response(badHtml, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    const email = await verifyToken(token)
    if (!email) {
      return new Response(badHtml, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    await supabaseAdmin.from('email_suppressions').upsert(
      { email, reason: 'unsubscribe' },
      { onConflict: 'email' },
    )

    return new Response(htmlPage, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (err) {
    return new Response(badHtml, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
})
