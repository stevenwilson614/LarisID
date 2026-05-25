import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record ?? payload   // works for both webhook and direct call

    const typeLabel: Record<string, string> = {
      bug:          'Bug / Error',
      feature:      'Saran Fitur',
      wrong_data:   'Data Salah',
      not_working:  'Tidak Berfungsi',
      request_edit: 'Minta Edit',
      other:        'Lainnya',
    }
    const label = typeLabel[record.type] ?? record.type
    const ctx = record.element_context as { element?: string; section?: string; value?: string } | null

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'LarisID Feedback <onboarding@resend.dev>',
        to: 'stevenwilson614@gmail.com',
        subject: `[${label}] Masukan baru dari LarisID`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;">
            <h2 style="color:#1A1F3C;margin-bottom:4px;">Masukan Baru</h2>
            <p style="margin:0 0 16px;font-size:13px;color:#6B7280;">LarisID · ${new Date().toLocaleString('id-ID')}</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;width:100px;">Tipe</td><td style="padding:8px 0;color:#1A1F3C;">${label}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;">Pengguna</td><td style="padding:8px 0;color:#1A1F3C;">${record.user_email || 'Anonim'}</td></tr>
              ${ctx?.element ? `<tr><td style="padding:8px 0;font-weight:700;color:#374151;">Elemen</td><td style="padding:8px 0;color:#E8442A;font-weight:600;">${ctx.element}${ctx.section ? ' · ' + ctx.section : ''}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;color:#374151;">Halaman</td><td style="padding:8px 0;color:#6B7280;">${record.page || '—'}</td></tr>
            </table>
            <div style="margin-top:16px;padding:14px;background:#F9FAFB;border-left:3px solid #E8442A;border-radius:4px;">
              <p style="margin:0;font-size:15px;color:#1A1F3C;line-height:1.6;">${(record.message || '').replace(/\n/g, '<br>')}</p>
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
