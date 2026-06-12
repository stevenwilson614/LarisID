-- Restrict catalog RPC to the latest complete scrape panel (day with most rows in last 7 days).
CREATE OR REPLACE FUNCTION public.get_product_catalog()
RETURNS TABLE(
  keyword text,
  product_name text,
  price numeric,
  total_sold bigint,
  image_url text,
  category text,
  rating numeric,
  reviews integer,
  item_id bigint,
  shop_id bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET statement_timeout = '30s' AS $$
  WITH panel AS (
    SELECT DATE(scraped_at) AS d, COUNT(*) AS cnt
    FROM listings
    WHERE scraped_at >= (CURRENT_DATE - INTERVAL '7 days')
    GROUP BY DATE(scraped_at)
    ORDER BY cnt DESC, d DESC
    LIMIT 1
  )
  SELECT DISTINCT ON (l.keyword)
    l.keyword, l.product_name, l.price, l.total_sold,
    l.image_url, l.category, l.rating, l.reviews, l.item_id, l.shop_id
  FROM listings l
  CROSS JOIN panel p
  WHERE l.keyword IS NOT NULL
    AND l.product_name IS NOT NULL
    AND DATE(l.scraped_at) = p.d
  ORDER BY l.keyword, l.total_sold DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_catalog() TO anon, authenticated;
