// Tells one LaRise applicant they were accepted — email (Resend) and
// WhatsApp (Fonnte).
//
// Unlike every other notifier in this project, this one is NOT on cron and
// never sends in bulk. It fires from a single click in /rise/admin/, behind a
// confirmation modal, for exactly one applicant at a time. That is deliberate:
// batch 1 is 40 students Steven and Afryan know personally, and an accidental
// "you're in" is not recoverable.
//
// Auth: the reviewer's own JWT. The caller must pass rise_is_reviewer(), which
// is re-checked here server-side rather than trusted from the board.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'LarisID <steven@larisid.com>'
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')
const FONNTE_TOKEN = Deno.env.get('FONNTE_API_TOKEN')
const SITE = 'https://larisid.com'

const MULAI = '2 September 2026'

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function emailHtml(nama: string, unsubUrl: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1A1A1A;">
      <h2 style="font-size:19px;margin:18px 0 10px;">Selamat, ${escapeHtml(nama)} — kamu diterima di LaRise Batch 1.</h2>
      <p style="font-size:14px;line-height:1.65;margin:0 0 14px;">
        Dari semua yang mendaftar, kamu termasuk 20 peserta yang terpilih untuk batch pertama
        LARIS RISE. Kami membaca jawaban kamu satu per satu, dan kami senang kamu ikut.
      </p>
      <p style="font-size:14px;line-height:1.65;margin:0 0 14px;">
        Program dimulai <strong>${MULAI}</strong> dan berjalan 1× seminggu (Rabu 16:00–18:00 WITA)
        sampai 28 Oktober 2026, seluruhnya online — total 8 sesi. Detail jadwal dan tautan
        sesi pertama kami kirim lewat WhatsApp beberapa hari sebelum mulai.
      </p>
      <p style="font-size:14px;line-height:1.65;margin:0 0 18px;">
        Satu hal yang kami minta: hadir sejak sesi pertama. Materinya bertahap, dan yang
        tertinggal di awal akan terasa berat di tengah.
      </p>
      <p style="margin:22px 0;">
        <a href="${SITE}/rise/" style="background:#B5202A;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 20px;border-radius:8px;display:inline-block;">Lihat halaman program</a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#6B7280;margin:0 0 16px;">
        Sampai ketemu di sesi pertama.<br>— Tim LARIS RISE
      </p>
      <p style="font-size:11.5px;color:#9CA3AF;">Kamu menerima email ini karena mendaftar program LaRise.
      <a href="${unsubUrl}" style="color:#9CA3AF;">Berhenti berlangganan</a>.</p>
    </div>`
}

function waText(nama: string): string {
  return `Halo ${nama}!

Selamat — kamu diterima di *LARIS RISE Batch 1*. Dari semua yang mendaftar, kamu termasuk 20 peserta yang terpilih.

Program mulai *${MULAI}*, 1x seminggu (Rabu 16:00–18:00 WITA) sampai 28 Oktober — total 8 sesi, semuanya online. Detail jadwal dan link sesi pertama kami kirim di sini beberapa hari sebelum mulai.

Satu permintaan: usahakan hadir sejak sesi pertama, karena materinya bertahap.

Sampai ketemu!
— Tim LARIS RISE
${SITE}/rise/`
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

    // Verify the caller, then verify they are a reviewer. The board already
    // checks rise_is_reviewer() for its own chrome, but that is a client
    // check — re-run it here against the caller's real token.
    const asUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error: authErr } = await asUser.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    }
    const { data: isReviewer } = await asUser.rpc('rise_is_reviewer')
    if (isReviewer !== true) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })
    }

    const body = await req.json()
    const id = body?.id
    if (!id) {
      return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: CORS })
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: app, error: appErr } = await db
      .from('larisrise_applications')
      .select('id, nama, email, whatsapp, status')
      .eq('id', id)
      .maybeSingle()

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: CORS })
    }
    // Refuse to congratulate someone who is not actually accepted — guards
    // against a stale board sending on a row that was moved back.
    if (app.status !== 'diterima') {
      return new Response(JSON.stringify({ error: 'Applicant is not accepted' }), { status: 409, headers: CORS })
    }

    const nama = String(app.nama || '').split(' ')[0] || 'teman'
    let sentEmail = false
    let sentWa = false

    // ── Email ───────────────────────────────────────────────────────────────
    // WhatsApp-OTP signups carry a synthetic @wa.larisid.com address that
    // bounces; suppressed addresses must never be mailed again. Same guards as
    // tracker_notify_audience().
    const email = String(app.email || '').toLowerCase()
    const emailUsable = email && !email.endsWith('@wa.larisid.com')

    if (emailUsable && RESEND_KEY) {
      const { data: sup } = await db
        .from('email_suppressions')
        .select('email')
        .eq('email', email)
        .maybeSingle()

      if (!sup) {
        const unsubUrl = `${SITE}/functions/v1/email-unsubscribe?e=${encodeURIComponent(email)}`
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_KEY}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: email,
            subject: 'Kamu diterima di LARIS RISE Batch 1',
            html: emailHtml(app.nama, unsubUrl),
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }),
        })
        sentEmail = res.ok
        if (!res.ok) console.error('resend failed', await res.text())
      }
    }

    // ── WhatsApp ────────────────────────────────────────────────────────────
    // Fonnte: raw token, no Bearer prefix; target is 628… with no plus.
    const target = String(app.whatsapp || '').replace(/[^0-9]/g, '')
    if (target && FONNTE_TOKEN) {
      const res = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { 'Authorization': FONNTE_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message: waText(nama) }),
      })
      sentWa = res.ok
      if (!res.ok) console.error('fonnte failed', await res.text())
    }

    if (!sentEmail && !sentWa) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Tidak ada channel yang berhasil dikirim.' }),
        { status: 502, headers: CORS },
      )
    }

    await db.rpc('rise_mark_notified', { p_id: id })

    return new Response(
      JSON.stringify({ ok: true, email: sentEmail, whatsapp: sentWa }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS })
  }
})
