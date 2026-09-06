import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REFUSE = /\b(terjual|omset|omzet|terlaris minggu|affiliate|afiliasi|komisi xtra|live gmv|berapa orang live|sold this week)\b/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || '').trim().slice(0, 200);
    if (!query) {
      return new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (REFUSE.test(query)) {
      return new Response(JSON.stringify({
        refused: true,
        reason: 'Angka penjualan, omset, terlaris, atau afiliasi tidak diambil dari web.',
      }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const tavily = Deno.env.get('TAVILY_API_KEY') || '';
    const brave = Deno.env.get('BRAVE_API_KEY') || '';
    let sumber: { judul: string; url: string; cuplikan: string }[] = [];

    if (tavily) {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavily,
          query,
          max_results: 4,
          search_depth: 'basic',
          include_answer: false,
        }),
      });
      const d = await r.json().catch(() => ({}));
      sumber = (d.results || []).slice(0, 4).map((x: { title?: string; url?: string; content?: string }) => ({
        judul: String(x.title || '').slice(0, 140),
        url: String(x.url || ''),
        cuplikan: String(x.content || '').slice(0, 280),
      })).filter((x: { url: string }) => x.url);
    } else if (brave) {
      const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4`, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': brave },
      });
      const d = await r.json().catch(() => ({}));
      sumber = (d.web?.results || []).slice(0, 4).map((x: { title?: string; url?: string; description?: string }) => ({
        judul: String(x.title || '').slice(0, 140),
        url: String(x.url || ''),
        cuplikan: String(x.description || '').slice(0, 280),
      })).filter((x: { url: string }) => x.url);
    } else {
      return new Response(JSON.stringify({
        error: 'web_search_unavailable',
        hint: 'TAVILY_API_KEY / BRAVE_API_KEY belum diset di Contabo.',
      }), {
        status: 503,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      n: sumber.length,
      sumber,
      catatan: 'bukan data LarisID',
    }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err).slice(0, 200) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
