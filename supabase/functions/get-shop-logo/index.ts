// get-shop-logo Edge Function
// Fetches a Shopee shop portrait for a tracked store and caches it in
// public.shop_logo_cache. Invoked by authenticated Pantauan clients on cache miss.
//
// Deploy: scp to Contabo functions volume, then docker restart supabase-edge-functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { shop_id?: unknown };
    const shopId = Number(body.shop_id);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return json({ error: "shop_id required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json({ error: "server misconfigured" }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const shopeeUrl =
      `https://shopee.co.id/api/v4/shop/get_shop_detail?shopid=${Math.trunc(shopId)}`;
    const res = await fetch(shopeeUrl, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        "Accept-Language": "id-ID,id;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return json({ error: `shopee ${res.status}` }, 422);
    }

    const payload = (await res.json()) as {
      data?: { account?: { portrait?: string } };
      error?: unknown;
    };
    const portrait = payload?.data?.account?.portrait;
    if (!portrait || typeof portrait !== "string") {
      return json({ error: "portrait missing" }, 422);
    }

    const logo_url = `https://cf.shopee.co.id/file/${portrait}`;

    const { error: upsertErr } = await admin.from("shop_logo_cache").upsert(
      {
        shop_id: Math.trunc(shopId),
        logo_url,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "shop_id" },
    );
    if (upsertErr) {
      console.error("shop_logo_cache upsert failed", upsertErr);
      // Still return the URL — client can display it even if cache write failed.
    }

    return json({ logo_url, shop_id: Math.trunc(shopId) });
  } catch (e) {
    console.error(e);
    return json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      422,
    );
  }
});
