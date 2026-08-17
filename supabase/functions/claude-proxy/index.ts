import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    // Parse the body first — the lightweight `search_plan` query-planner route is
    // intentionally open (anon + logged-in), so we branch on purpose before auth.
    const body = await req.json();
    const { messages, model, system, purpose, tools, tool_choice, thinking } = body;
    // Opt-in SSE relay. Callers that do not ask for it keep the exact
    // JSON response shape they parse today.
    const wantStream = body.stream === true && purpose !== 'search_plan';
    const maxTokens = Number(body.max_tokens);
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'bad_request' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const isSearchPlan = purpose === 'search_plan';
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const wantThinking = !!thinking && thinking.type === 'enabled';

    // search_plan is deliberately unauthenticated (see the auth block below).
    // Without this an anonymous caller could drive an arbitrarily expensive
    // multi-turn tool agent, or extended thinking, entirely for free.
    if (isSearchPlan && (hasTools || tool_choice || wantThinking)) {
      return new Response(JSON.stringify({ error: 'tools_not_allowed_on_search_plan' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth: search_plan is unauthenticated so logged-out visitors get smart queries
    // too. Every other purpose (chat) still requires a valid Supabase JWT.
    let userId: string | null = null;
    let isAdmin = false;
    if (!isSearchPlan) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'invalid_token' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
      isAdmin = ADMIN_EMAILS.includes((user.email ?? '').toLowerCase());
    }

    const today = new Date().toISOString().slice(0, 10);
    // There is no daily AI cap: it was removed here, and in the use_ai RPC by
    // migration 20260817120000. Successful authenticated calls are still logged
    // to ai_usage below for analytics.

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'missing_api_key' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Forward to DeepSeek (Anthropic-compatible). Tools, tool_choice and
    // thinking are opt-in pass-throughs: a caller that sends none of them gets
    // byte-identical behaviour to before, so old cached clients are unaffected.
    // budget_tokens is ignored upstream but is part of the schema shape.
    const upstream = await fetch(DEEPSEEK_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: resolveModel(model),
        // search_plan returns a tiny JSON blob — clamp it hard so even a direct
        // (unauthenticated) hit on that open route stays cheap.
        max_tokens: isSearchPlan
          ? Math.min(Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 300, 400)
          : (Number.isFinite(maxTokens) && maxTokens > 0 ? Math.min(maxTokens, 4096) : 1600),
        system: system ?? '',
        thinking: wantThinking ? { type: 'enabled', budget_tokens: 2048 } : { type: 'disabled' },
        stream: wantStream,
        messages,
        ...(hasTools ? { tools } : {}),
        ...(tool_choice ? { tool_choice } : {}),
      }),
    });

    // Stream path: relay the upstream SSE body untouched. Usage is logged up
    // front because the response is handed to the client before it finishes.
    if (wantStream) {
      if (!upstream.ok || !upstream.body) {
        const errText = await upstream.text().catch(() => '');
        return new Response(JSON.stringify({ error: 'upstream_error', detail: errText.slice(0, 500) }), {
          status: upstream.status || 502,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      if (userId && !isAdmin) {
        await supabase.from('ai_usage').insert({ user_id: userId, date: today });
      }
      return new Response(upstream.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          // Caddy/kong sit in front of this; without it the whole stream can be
          // buffered and delivered as one chunk, defeating the point.
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const result = await upstream.json();

    if (!upstream.ok) {
      return new Response(JSON.stringify(result), {
        status: upstream.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Normalize: prefer first text block (skip any residual thinking blocks).
    // NEVER do this on a tool turn — the caller replays that content verbatim as
    // an assistant turn, and hoisting text ahead of a thinking/tool_use block
    // produces an ordering the API rejects.
    if (!hasTools && Array.isArray(result?.content)) {
      const textBlock = result.content.find((b: { type?: string }) => b?.type === 'text')
        || result.content.find((b: { text?: string }) => typeof b?.text === 'string');
      if (textBlock && result.content[0] !== textBlock) {
        result.content = [textBlock, ...result.content.filter((b: unknown) => b !== textBlock)];
      }
    }

    // Log successful authenticated calls for analytics (anon search_plan has no
    // user_id; admins are unlimited and not tracked).
    if (userId && !isAdmin) {
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
