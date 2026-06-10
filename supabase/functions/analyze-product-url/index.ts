import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (/shopee\.(co\.id|sg|com|ph|my|vn|tw)/.test(url)) return 'shopee';
  if (/tiktok\.com|shop\.tiktok/.test(url)) return 'tiktok';
  if (/tokopedia\.com/.test(url)) return 'tokopedia';
  if (/lazada\.co\.id|lazada\.com/.test(url)) return 'lazada';
  if (/bukalapak\.com/.test(url)) return 'bukalapak';
  return 'unknown';
}

function extractShopeeIds(url: string): { shopId: number | null; itemId: number | null } {
  // Pattern: shopee.co.id/slug-i.SHOPID.ITEMID or ?i.SHOPID.ITEMID
  const m1 = url.match(/[/-]i\.(\d+)\.(\d+)/);
  if (m1) return { shopId: parseInt(m1[1]), itemId: parseInt(m1[2]) };
  // Pattern: shopee.co.id/product/SHOPID/ITEMID
  const m2 = url.match(/shopee\.[^/]+\/product\/(\d+)\/(\d+)/);
  if (m2) return { shopId: parseInt(m2[1]), itemId: parseInt(m2[2]) };
  return { shopId: null, itemId: null };
}

function getMetaContent(html: string, prop: string): string {
  const pats = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"'<]*?)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"'<]*?)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'),
  ];
  for (const p of pats) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return '';
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

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
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

    const platform = detectPlatform(rawUrl);
    const shopeeIds = platform === 'shopee' ? extractShopeeIds(rawUrl) : { shopId: null, itemId: null };

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
        result.keywords = row.keyword ? [row.keyword, ...extractKeywords(row.product_name ?? '')] : extractKeywords(row.product_name ?? '');
        result.keywords = [...new Set(result.keywords)].slice(0, 5);
      }
    }

    // ── 2. If not in DB or non-Shopee: try page scrape ───────────
    if (!result.ok) {
      let html = '';
      try {
        html = await fetchPage(rawUrl);
      } catch (_e) {
        // Scrape failed; will return what we have from URL only
      }

      if (html) {
        result.source = 'scrape';

        // Try JSON-LD structured data (best quality)
        const jsonLd = extractJsonLdProduct(html);
        if (jsonLd) {
          result.title = (jsonLd.name as string) ?? '';
          if (typeof jsonLd.description === 'string') {
            result.description = jsonLd.description.slice(0, 500);
          }
          const offers = jsonLd.offers as Record<string, unknown> | undefined;
          if (offers) {
            const offerArr = Array.isArray(offers) ? offers[0] : offers;
            result.price = parsePrice(String((offerArr as Record<string, unknown>).price ?? ''));
            result.original_price = parsePrice(String((offerArr as Record<string, unknown>).highPrice ?? ''));
          }
          const rating = jsonLd.aggregateRating as Record<string, unknown> | undefined;
          if (rating) {
            result.rating = parseFloat(String(rating.ratingValue ?? '')) || null;
            result.reviews_count = parseInt(String(rating.reviewCount ?? '')) || null;
          }
          const img = jsonLd.image;
          if (typeof img === 'string') result.image_url = img;
          else if (Array.isArray(img) && img[0]) result.image_url = String(img[0]);
        }

        // Fill gaps from Open Graph tags
        if (!result.title) {
          result.title = getMetaContent(html, 'og:title')
            .replace(/\s*[\|–—-].*$/, '').trim(); // strip site name suffix
        }
        if (!result.description) {
          result.description = getMetaContent(html, 'og:description').slice(0, 500);
        }
        if (!result.image_url) {
          result.image_url = getMetaContent(html, 'og:image');
        }
        if (!result.price) {
          result.price = parsePrice(getMetaContent(html, 'product:price:amount'))
            || parsePrice(getMetaContent(html, 'og:price:amount'));
        }

        // Last resort title from <title> tag
        if (!result.title) {
          const tMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (tMatch) result.title = tMatch[1].replace(/\s*[\|–—-].*$/, '').trim();
        }

        result.ok = result.title.length > 0;
      }
    }

    // ── 3. Always extract keywords from title ─────────────────────
    if (result.title && result.keywords.length === 0) {
      result.keywords = extractKeywords(result.title);
    }

    if (!result.ok && !result.title) {
      result.error = 'Tidak bisa mengambil data produk. Coba pastikan link produk valid dan bisa dibuka di browser.';
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
