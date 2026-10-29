/* Invite share card: HTML with per-mentor title + avatar for crawlers,
   then send humans to /lms/?invite=… */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE = 'https://larisid.com'
const FALLBACK_ICON = `${SITE}/images/brand/appicon-bird.png`

function esc(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function htmlPage(opts: {
  title: string
  image: string
  invite: string
  description: string
}): Response {
  const join = `${SITE}/lms/?invite=${encodeURIComponent(opts.invite)}`
  const title = esc(opts.title)
  const image = esc(opts.image)
  const desc = esc(opts.description)
  const body = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="${image}">
  <link rel="apple-touch-icon" href="${image}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LMS">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${esc(join)}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="512">
  <meta property="og:image:height" content="512">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${image}">
  <meta http-equiv="refresh" content="0;url=${esc(join)}">
  <link rel="canonical" href="${esc(join)}">
</head>
<body>
  <p><a href="${esc(join)}">Buka undangan kelas</a></p>
  <script>location.replace(${JSON.stringify(join)});</script>
</body>
</html>`
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-robots-tag': 'noindex',
    },
  })
}

serve(async (req) => {
  const url = new URL(req.url)
  const invite = (url.searchParams.get('invite') || url.searchParams.get('t') || '').trim()
  const fallback = htmlPage({
    title: 'LMS',
    image: FALLBACK_ICON,
    invite: invite || '',
    description: 'Undangan kelas mentor.',
  })
  if (!invite || invite.length > 128) {
    return htmlPage({
      title: 'LMS',
      image: FALLBACK_ICON,
      invite: '',
      description: 'Undangan kelas mentor.',
    })
  }

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data, error } = await sb.rpc('lms_invite_brand', { p_token: invite })
    if (error) {
      console.error('lms-invite-card rpc', error.message)
      return fallback
    }
    const org = String((data && data.org_name) || '').trim() || 'Kelas'
    const title = String((data && data.brand_title) || `LMS (${org})`)
    const image = String((data && data.avatar_url) || '').trim() || FALLBACK_ICON
    return htmlPage({
      title,
      image,
      invite,
      description: `Gabung kelas ${org} di LMS.`,
    })
  } catch (err) {
    console.error('lms-invite-card', err)
    return fallback
  }
})
