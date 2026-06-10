import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Shopee serves OG meta tags only to social crawlers, not regular browsers.
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

interface ProductData {
  ok: boolean;
  platform: string;
  title: string;
  description: string;
  price: number | null;
  original_price: number | null;
  rating: number | null;
  reviews_count: number | null;
  total_sold: number | null;
  image_url: string | null;
  shop_id: number | null;
  item_id: number | null;
  keywords: string[];
  category: string | null;
  source: 'database' | 'scrape' | 'url_only';
  error?: string;
}

function detectPlatform(url: string): string {
  if (/shopee\.(co\.id|sg|com|ph|my|vn|tw)|shp\.ee|s\.shopee/i.test(url)) return 'shopee';
  if (/tiktok\.com|shop\.tiktok/i.test(url)) return 'tiktok';
  if (/tokopedia\.com/i.test(url)) return 'tokopedia';
  if (/lazada\.co\.id|lazada\.com/i.test(url)) return 'lazada';
  if (/bukalapak\.com/i.test(url)) return 'bukalapak';
  return 'unknown';
}

function extractShopeeIds(url: string): { shopId: number | null; itemId: number | null } {
  // Canonical: ...-i.SHOPID.ITEMID
  const m1 = url.match(/[.\/-]i\.(\d+)\.(\d+)/i);
  if (m1) return { shopId: parseInt(m1[1], 10), itemId: parseInt(m1[2], 10) };
  // /product/SHOPID/ITEMID
  const m2 = url.match(/\/product\/(\d+)\/(\d+)/i);
  if (m2) return { shopId: parseInt(m2[1], 10), itemId: parseInt(m2[2], 10) };
  return { shopId: null, itemId: null };
}

function getMetaContent(html: string, prop: string): string {
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"'<]*?)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"'<]*?)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return '';
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of matches) {
    try {
      const data = JSON.parse(m[1]);
      const candidates = Array.isArray(data['@graph']) ? data['@graph'] : [data];
      const product = candidates.find((x: Record<string, unknown>) => x['@type'] === 'Product');
      if (product) return product;
    } catch { /* ignore */ }
  }
  return null;
}

function parsePrice(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

function cleanTitle(raw: string, platform: string): string {
  let t = raw.trim();
  // Strip site suffix: "| Shopee Indonesia", "- Tokopedia", etc.
  t = t.replace(/\s*[\|–—-]\s*(Shopee|Tokopedia|TikTok|Lazada|Bukalapak)[^|]*$/i, '').trim();
  // Strip "Jual " prefix common on Shopee titles
  if (platform === 'shopee') t = t.replace(/^Jual\s+/i, '').trim();
  return t;
}

function extractKeywords(title: string): string[] {
  const stopwords = new Set([
    'dan', 'atau', 'untuk', 'dengan', 'yang', 'dari', 'ke', 'di', 'ini', 'itu',
    'jual', 'beli', 'terjual', 'stok', 'pcs', 'set', 'pack', 'free', 'murah',
    'original', 'asli', 'baru', 'gratis', 'bonus', 'promo', 'sale', 'ready',
    'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'and',
    'cm', 'ml', 'gr', 'kg', 'liter', 'persen', 'meter',
  ]);
  const tokens = title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stopwords.has(t) && !/^\d+$/.test(t));
  const unique = [...new Set(tokens)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 5);
}

async function resolveUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': CRAWLER_UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000),
    });
    return res.url || url;
  } catch {
    return url;
  }
}

async function fetchPage(url: string, platform: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': CRAWLER_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function scrapeFromHtml(html: string, platform: string): Partial<ProductData> {
  const out: Partial<ProductData> = { source: 'scrape' };

  const jsonLd = extractJsonLdProduct(html);
  if (jsonLd) {
    out.title = cleanTitle((jsonLd.name as string) ?? '', platform);
    if (typeof jsonLd.description === 'string') {
      out.description = jsonLd.description.slice(0, 500);
    }
    const offers = jsonLd.offers as Record<string, unknown> | undefined;
    if (offers) {
      const offerArr = Array.isArray(offers) ? offers[0] : offers;
      out.price = parsePrice(String((offerArr as Record<string, unknown>).price ?? ''));
      out.original_price = parsePrice(String((offerArr as Record<string, unknown>).highPrice ?? ''));
    }
    const rating = jsonLd.aggregateRating as Record<string, unknown> | undefined;
    if (rating) {
      out.rating = parseFloat(String(rating.ratingValue ?? '')) || null;
      out.reviews_count = parseInt(String(rating.reviewCount ?? '')) || null;
    }
    const img = jsonLd.image;
    if (typeof img === 'string') out.image_url = img;
    else if (Array.isArray(img) && img[0]) out.image_url = String(img[0]);
  }

  if (!out.title) {
    out.title = cleanTitle(getMetaContent(html, 'og:title'), platform);
  }
  if (!out.description) {
    out.description = getMetaContent(html, 'og:description').slice(0, 500);
  }
  if (!out.image_url) {
    out.image_url = getMetaContent(html, 'og:image');
  }
  if (!out.price) {
    out.price = parsePrice(getMetaContent(html, 'product:price:amount'))
      || parsePrice(getMetaContent(html, 'og:price:amount'));
  }

  if (!out.title) {
    const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (tMatch) out.title = cleanTitle(tMatch[1], platform);
  }

  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    let rawUrl: string = (body.url ?? '').trim();
    if (!rawUrl) {
      return new Response(JSON.stringify({ error: 'url_required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
    if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;

    // Resolve short links (s.shopee.co.id, id.shp.ee, etc.)
    const resolvedUrl = await resolveUrl(rawUrl);

    const platform = detectPlatform(resolvedUrl);
    const shopeeIds = platform === 'shopee' ? extractShopeeIds(resolvedUrl) : { shopId: null, itemId: null };

    const result: ProductData = {
      ok: false,
      platform,
      title: '',
      description: '',
      price: null,
      original_price: null,
      rating: null,
      reviews_count: null,
      total_sold: null,
      image_url: null,
      shop_id: shopeeIds.shopId,
      item_id: shopeeIds.itemId,
      keywords: [],
      category: null,
      source: 'url_only',
    };

    // ── 1. For Shopee: try our own listings DB first ──────────────
    if (platform === 'shopee' && shopeeIds.shopId && shopeeIds.itemId) {
      const { data: rows } = await supabase
        .from('listings')
        .select('product_name, price, total_sold, rating, reviews, image_url, category, keyword')
        .eq('shop_id', shopeeIds.shopId)
        .eq('item_id', shopeeIds.itemId)
        .order('scraped_at', { ascending: false })
        .limit(1);

      if (rows && rows.length > 0) {
        const row = rows[0];
        result.ok = true;
        result.source = 'database';
        result.title = row.product_name ?? '';
        result.price = row.price ? Number(row.price) : null;
        result.rating = row.rating ? Number(row.rating) : null;
        result.reviews_count = row.reviews ? Number(row.reviews) : null;
        result.total_sold = row.total_sold ? Number(row.total_sold) : null;
        result.image_url = row.image_url ?? null;
        result.category = row.category ?? null;
        result.keywords = row.keyword
          ? [row.keyword, ...extractKeywords(row.product_name ?? '')]
          : extractKeywords(row.product_name ?? '');
        result.keywords = [...new Set(result.keywords)].slice(0, 5);
      }
    }

    // ── 2. If not in DB: scrape page with social-crawler UA ───────
    if (!result.ok) {
      let html = '';
      try {
        html = await fetchPage(resolvedUrl, platform);
      } catch (_e) {
        // Scrape failed
      }

      if (html) {
        const scraped = scrapeFromHtml(html, platform);
        result.source = 'scrape';
        if (scraped.title) result.title = scraped.title;
        if (scraped.description) result.description = scraped.description ?? '';
        if (scraped.price) result.price = scraped.price ?? null;
        if (scraped.original_price) result.original_price = scraped.original_price ?? null;
        if (scraped.rating) result.rating = scraped.rating ?? null;
        if (scraped.reviews_count) result.reviews_count = scraped.reviews_count ?? null;
        if (scraped.image_url) result.image_url = scraped.image_url ?? null;
        result.ok = result.title.length > 0;
      }
    }

    // ── 3. Always extract keywords from title ─────────────────────
    if (result.title && result.keywords.length === 0) {
      result.keywords = extractKeywords(result.title);
    }

    if (!result.ok) {
      if (!shopeeIds.shopId && platform === 'shopee') {
        result.error = 'Link Shopee tidak dikenali. Gunakan link produk lengkap (contoh: shopee.co.id/nama-produk-i.123.456) atau link pendek s.shopee.co.id.';
      } else {
        result.error = 'Tidak bisa mengambil data produk. Pastikan link valid dan produk masih aktif di marketplace.';
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
