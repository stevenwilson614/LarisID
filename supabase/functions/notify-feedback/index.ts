import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { jwtRole } from '../_shared/auth.ts'
import { escapeHtml } from '../_shared/escape.ts'

serve(async (req) => {
  try {
    const role = jwtRole(req)
    if (role !== 'service_role' && role !== 'authenticated') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const payload = await req.json()
    const record = payload.record ?? payload

    const typeLabel: Record<string, string> = {
      product:      'Request Produk',
      idea:         'Ide',
      bug:          'Bug / Error',
      feature:      'Saran Fitur',
      wrong_data:   'Data Salah',
      not_working:  'Tidak Berfungsi',
      request_edit: 'Minta Edit',
      other:        'Feedback',
    }
    const label = escapeHtml(typeLabel[record.type] ?? record.type)
    const ctx = record.element_context as { element?: string; section?: string; value?: string } | null

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'Steven <steven@larisid.com>',
        to: 'stevenwilson614@gmail.com',
        subject: `[${label}] Pesan baru untuk Steven`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;">
            <h2 style="color:#1A1F3C;margin-bottom:4px;">Pesan Baru untuk Steven</h2>
            <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">LarisID · ${new Date().toLocaleString('id-ID')}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;width:100px;">Tipe</td><td style="padding:8px 0;color:#1A1F3C;">${label}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;">Pengguna</td><td style="padding:8px 0;color:#1A1F3C;">${escapeHtml(record.user_email || 'Anonim')}</td></tr>
              ${ctx?.element ? `<tr><td style="padding:8px 0;font-weight:700;color:#374151;">Elemen</td><td style="padding:8px 0;color:#E8442A;font-weight:600;">${escapeHtml(ctx.element)}${ctx.section ? ' · ' + escapeHtml(ctx.section) : ''}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;">Halaman</td><td style="padding:8px 0;color:#6B7280;">${escapeHtml(record.page || '—')}</td></tr>
            </table>
            <div style="margin-top:16px;padding:14px;background:#F9FAFB;border-left:3px solid #E8442A;border-radius:4px;">
              <p style="margin:0;font-size:15px;color:#1A1F3C;line-height:1.6;">${escapeHtml(record.message || '').replace(/\n/g, '<br>')}</p>
            </div>
            <p style="margin-top:20px;font-size:12px;color:#9CA3AF;">
              Lihat semua masukan di <a href="https://larisid.com/#admin" style="color:#E8442A;">Admin View → Masukan Pengguna</a>
            </p>
          </div>
        `,
      }),
    })

    const body = await res.json()
    return new Response(JSON.stringify({ ok: res.ok, resend: body }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
