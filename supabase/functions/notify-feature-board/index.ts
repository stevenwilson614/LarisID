import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const SITE = 'https://larisid.com'
const ADMIN_EMAIL = 'stevenwilson614@gmail.com'

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data: { user }, error: authErr } = await anon.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }

    const body = await req.json()
    const kind = body?.kind === 'resolved' ? 'resolved' : 'comment'
    const requestId = body?.request_id
    const commentId = body?.comment_id
    if (!requestId) {
      return new Response(JSON.stringify({ error: 'Missing request_id' }), { status: 400, headers: CORS })
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: post, error: postErr } = await db
      .from('feature_requests')
      .select('id, author_id, title, body, status')
      .eq('id', requestId)
      .single()
    if (postErr || !post) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS })
    }

    let commentBody = ''
    let commenterName = ''

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: appRole } = await userClient.rpc('current_app_role')
    const isAdmin = appRole === 'admin' || (user.email || '').toLowerCase() === ADMIN_EMAIL

    if (kind === 'resolved') {
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
      }
      if (post.status !== 'done') {
        return new Response(JSON.stringify({ ok: true, skipped: 'not_done' }), { headers: CORS })
      }
    } else {
      if (!commentId) {
        return new Response(JSON.stringify({ error: 'Missing comment_id' }), { status: 400, headers: CORS })
      }
      const { data: comment, error: cErr } = await db
        .from('feature_request_comments')
        .select('id, author_id, author_first_name, body, request_id')
        .eq('id', commentId)
        .single()
      if (cErr || !comment || comment.request_id !== requestId) {
        return new Response(JSON.stringify({ error: 'Comment not found' }), { status: 404, headers: CORS })
      }
      if (comment.author_id !== user.id && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
      }
      commentBody = comment.body || ''
      commenterName = comment.author_first_name || 'Seseorang'
    }

    const watcherIds = new Set<string>()
    watcherIds.add(post.author_id)
    const [{ data: likes }, { data: comments }] = await Promise.all([
      db.from('feature_request_likes').select('user_id').eq('request_id', requestId),
      db.from('feature_request_comments').select('author_id').eq('request_id', requestId),
    ])
    for (const row of likes || []) if (row.user_id) watcherIds.add(row.user_id)
    for (const row of comments || []) if (row.author_id) watcherIds.add(row.author_id)
    watcherIds.delete(user.id)

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500, headers: CORS })
    }

    const titlePlain = post.title || 'usulan'
    const title = escapeHtml(titlePlain)
    const recipients: { id: string; email: string }[] = []
    for (const id of watcherIds) {
      const { data: userRes } = await db.auth.admin.getUserById(id)
      const email = userRes?.user?.email
      if (email) recipients.push({ id, email })
    }
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_recipients' }), { headers: CORS })
    }

    let sent = 0
    let failed = 0
    for (const rec of recipients) {
      const isAuthor = rec.id === post.author_id
      const subject = kind === 'resolved'
        ? (isAuthor ? `Usulanmu sudah selesai: ${titlePlain}` : `Usulan yang kamu ikuti sudah selesai: ${titlePlain}`)
        : (isAuthor ? `Komentar baru pada usulanmu: ${titlePlain}` : `Komentar baru pada usulan yang kamu ikuti: ${titlePlain}`)
      const leadResolved = isAuthor
        ? 'Usulanmu di LarisID sudah ditandai <strong>selesai</strong>:'
        : 'Usulan yang kamu dukung atau komentari sudah ditandai <strong>selesai</strong>:'
      const leadComment = isAuthor
        ? `<strong>${escapeHtml(commenterName)}</strong> mengomentari usulanmu:`
        : `<strong>${escapeHtml(commenterName)}</strong> mengomentari usulan yang kamu ikuti:`
      const html = kind === 'resolved'
        ? `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6;color:#1A1F3C">
            <p>Halo,</p>
            <p>${leadResolved}</p>
            <p style="font-size:16px;font-weight:700;margin:12px 0">${title}</p>
            <p><a href="${SITE}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">Buka Ajukan Fitur</a></p>
            <p style="color:#6B7280;font-size:13px">Steven · LarisID</p>
          </div>`
        : `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6;color:#1A1F3C">
            <p>Halo,</p>
            <p>${leadComment}</p>
            <p style="font-size:16px;font-weight:700;margin:12px 0">${title}</p>
            <div style="padding:14px;background:#F9FAFB;border-left:3px solid #B5202A;border-radius:4px">
              <p style="margin:0;white-space:pre-wrap">${escapeHtml(commentBody)}</p>
            </div>
            <p style="margin-top:16px"><a href="${SITE}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">Buka Ajukan Fitur</a></p>
            <p style="color:#6B7280;font-size:13px">Steven · LarisID</p>
          </div>`

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: FROM_EMAIL, to: rec.email, subject, html }),
        })
        if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
        sent++
      } catch (e) {
        failed++
        console.error(`notify-feature-board: send failed for ${rec.id}: ${e}`)
      }
      if (recipients.length > 1) await sleep(600)
    }

    return new Response(JSON.stringify({ ok: failed === 0, sent, failed }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
