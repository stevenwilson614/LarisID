import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CALLS_PER_DAY = 10;
const DEFAULT_MODEL = 'deepseek-v4-pro';
// DeepSeek Anthropic-compatible Messages API (same response shape clients already parse).
const DEEPSEEK_MESSAGES_URL = 'https://api.deepseek.com/anthropic/v1/messages';

// Platform admins are exempt from the daily AI rate limit (mirrors PLATFORM_ADMIN_EMAILS client-side)
const ADMIN_EMAILS = ['stevenwilson614@gmail.com'];

/** Map legacy Claude model ids from Site A/B clients → DeepSeek V4 Pro. */
function resolveModel(model?: string): string {
  const m = String(model || '').trim();
  if (!m || m.startsWith('claude-') || m === 'deepseek-chat' || m === 'deepseek-reasoner') {
    return DEFAULT_MODEL;
  }
  if (m === 'deepseek-v4-flash' || m === 'deepseek-v4-pro') return m;
  return DEFAULT_MODEL;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    // Require a valid Supabase JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Resolve caller identity from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);
    const isAdmin = ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());

    // Rate limit: max MAX_CALLS_PER_DAY per user per UTC day (admins exempt)
    if (!isAdmin) {
      const { count } = await supabase
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('date', today);

      if ((count ?? 0) >= MAX_CALLS_PER_DAY) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded', limit: MAX_CALLS_PER_DAY }),
          { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      }
    }

    // Parse request body
    const body = await req.json();
    const { messages, model, system } = body;
    const maxTokens = Number(body.max_tokens);
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'missing_api_key' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Forward to DeepSeek (Anthropic-compatible). Thinking off so content[0].text
    // is always the reply Site A/B already expect.
    const upstream = await fetch(DEEPSEEK_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModel(model),
        max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 4096) : 700,
        system: system ?? '',
        thinking: { type: 'disabled' },
        messages,
      }),
    });

    const result = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify(result), {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Normalize: prefer first text block (skip any residual thinking blocks).
    if (Array.isArray(result?.content)) {
      const textBlock = result.content.find((b: { type?: string }) => b?.type === 'text')
        || result.content.find((b: { text?: string }) => typeof b?.text === 'string');
      if (textBlock && result.content[0] !== textBlock) {
        result.content = [textBlock, ...result.content.filter((b: unknown) => b !== textBlock)];
      }
    }

    // Log successful call for rate limiting (skip for admins — they're unlimited)
    if (!isAdmin) {
      await supabase.from('ai_usage').insert({ user_id: userId, date: today });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
