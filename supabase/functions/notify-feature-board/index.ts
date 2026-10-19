import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>'
const SITE = 'https://larisid.com'
const ADMIN_EMAIL = 'stevenwilson614@gmail.com'
const STAFF_FALLBACK = ['stevenwilson614@gmail.com', 'afryannp@gmail.com']

function threadUrl(requestId: string) {
  return `${SITE}/?komunitas=${encodeURIComponent(requestId)}`
}

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

type Kind = 'resolved' | 'new_question' | 'new_post' | 'comment'

function parseKind(raw: unknown): Kind {
  if (raw === 'resolved') return 'resolved'
  if (raw === 'new_question') return 'new_question'
  if (raw === 'new_post') return 'new_post'
  return 'comment'
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
    const kind = parseKind(body?.kind)
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
      .select('id, author_id, title, body, status, kind, topic')
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
    } else if (kind === 'new_question' || kind === 'new_post') {
      if (post.author_id !== user.id && !isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
      }
      if (kind === 'new_question' && post.kind !== 'question') {
        return new Response(JSON.stringify({ ok: true, skipped: 'not_question' }), { headers: CORS })
      }
      if (kind === 'new_post' && post.kind === 'question') {
        return new Response(JSON.stringify({ ok: true, skipped: 'is_question' }), { headers: CORS })
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
    if (kind === 'new_question') {
      if (post.topic) {
        const { data: followers } = await db
          .from('board_topic_follows')
          .select('user_id')
          .eq('topic', post.topic)
        for (const row of followers || []) if (row.user_id) watcherIds.add(row.user_id)
      }
    } else if (kind === 'new_post') {
      // Staff-only below; no topic follows for usulan.
    } else {
      watcherIds.add(post.author_id)
      const [{ data: likes }, { data: comments }] = await Promise.all([
        db.from('feature_request_likes').select('user_id').eq('request_id', requestId),
        db.from('feature_request_comments').select('author_id').eq('request_id', requestId),
      ])
      for (const row of likes || []) if (row.user_id) watcherIds.add(row.user_id)
      for (const row of comments || []) if (row.author_id) watcherIds.add(row.author_id)
    }
    watcherIds.delete(user.id)

    const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY missing' }), { status: 500, headers: CORS })
    }

    const titlePlain = post.title || (kind === 'new_question' ? 'pertanyaan' : 'usulan')
    const title = escapeHtml(titlePlain)
    const ctaHref = threadUrl(post.id)
    const ctaLabel = post.kind === 'question' ? 'Buka Diskusi' : 'Buka Ajukan Fitur'
    const actorEmail = (user.email || '').toLowerCase()

    type Recipient = { id?: string; email: string; isAuthor: boolean; staff: boolean }
    const byEmail = new Map<string, Recipient>()

    for (const id of watcherIds) {
      const { data: userRes } = await db.auth.admin.getUserById(id)
      const email = (userRes?.user?.email || '').toLowerCase()
      if (!email || email === actorEmail) continue
      byEmail.set(email, {
        id,
        email,
        isAuthor: id === post.author_id,
        staff: false,
      })
    }

    // Staff always get new posts and replies (replaces the unanswered digest).
    if (kind === 'new_question' || kind === 'new_post' || kind === 'comment') {
      const staffEmails = new Set<string>(STAFF_FALLBACK.map((e) => e.toLowerCase()))
      const { data: roleRows } = await db
        .from('app_role_assignments')
        .select('email, role')
        .in('role', ['admin', 'leader'])
      for (const row of roleRows || []) {
        if (row.email) staffEmails.add(String(row.email).toLowerCase())
      }
      for (const email of staffEmails) {
        if (!email || email === actorEmail) continue
        const existing = byEmail.get(email)
        if (existing) {
          existing.staff = true
        } else {
          byEmail.set(email, { email, isAuthor: false, staff: true })
        }
      }
    }

    const recipients = [...byEmail.values()]
    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_recipients' }), { headers: CORS })
    }

    let sent = 0
    let failed = 0
    for (const rec of recipients) {
      const isAuthor = rec.isAuthor
      const subject = kind === 'resolved'
        ? (isAuthor ? `Usulanmu sudah selesai: ${titlePlain}` : `Usulan yang kamu ikuti sudah selesai: ${titlePlain}`)
        : kind === 'new_question'
          ? (rec.staff
            ? `Komunitas: pertanyaan baru — ${titlePlain}`
            : `Pertanyaan baru di ${post.topic || 'Diskusi'}: ${titlePlain}`)
          : kind === 'new_post'
            ? `Komunitas: usulan baru — ${titlePlain}`
            : (rec.staff
              ? `Komunitas: balasan baru — ${titlePlain}`
              : (isAuthor ? `Balasan baru pada tulisanmu: ${titlePlain}` : `Balasan baru pada tulisan yang kamu ikuti: ${titlePlain}`))
      const leadResolved = isAuthor
        ? 'Usulanmu di LarisID sudah ditandai <strong>selesai</strong>:'
        : 'Usulan yang kamu dukung atau komentari sudah ditandai <strong>selesai</strong>:'
      const leadComment = rec.staff
        ? `<strong>${escapeHtml(commenterName)}</strong> membalas di Komunitas:`
        : (isAuthor
          ? `<strong>${escapeHtml(commenterName)}</strong> membalas tulisanmu:`
          : `<strong>${escapeHtml(commenterName)}</strong> membalas tulisan yang kamu ikuti:`)
      const leadQuestion = rec.staff
        ? `Ada pertanyaan baru di Komunitas${post.topic ? ` · <strong>${escapeHtml(post.topic)}</strong>` : ''}:`
        : `Ada pertanyaan baru di topik <strong>${escapeHtml(post.topic || 'Diskusi')}</strong>:`
      const leadPost = `Ada usulan baru di Komunitas:`
      const html = kind === 'resolved'
        ? `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6;color:#1A1F3C">
            <p>Halo,</p>
            <p>${leadResolved}</p>
            <p style="font-size:16px;font-weight:700;margin:12px 0">${title}</p>
            <p><a href="${ctaHref}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">${ctaLabel}</a></p>
            <p style="color:#6B7280;font-size:13px">Steven · LarisID</p>
          </div>`
        : kind === 'new_question'
        ? `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6;color:#1A1F3C">
            <p>Halo,</p>
            <p>${leadQuestion}</p>
            <p style="font-size:16px;font-weight:700;margin:12px 0">${title}</p>
            ${post.body ? `<div style="padding:14px;background:#F9FAFB;border-left:3px solid #B5202A;border-radius:4px"><p style="margin:0;white-space:pre-wrap">${escapeHtml(post.body)}</p></div>` : ''}
            <p style="margin-top:16px"><a href="${ctaHref}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">${ctaLabel}</a></p>
            <p style="color:#6B7280;font-size:13px">Steven · LarisID</p>
          </div>`
        : kind === 'new_post'
        ? `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;line-height:1.6;color:#1A1F3C">
            <p>Halo,</p>
            <p>${leadPost}</p>
            <p style="font-size:16px;font-weight:700;margin:12px 0">${title}</p>
            ${post.body ? `<div style="padding:14px;background:#F9FAFB;border-left:3px solid #B5202A;border-radius:4px"><p style="margin:0;white-space:pre-wrap">${escapeHtml(post.body)}</p></div>` : ''}
            <p style="margin-top:16px"><a href="${ctaHref}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">${ctaLabel}</a></p>
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
            <p style="margin-top:16px"><a href="${ctaHref}" style="display:inline-block;padding:10px 18px;background:#B5202A;color:#fff;text-decoration:none;border-radius:8px">${ctaLabel}</a></p>
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
        console.error(`notify-feature-board: send failed for ${rec.email}: ${e}`)
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
