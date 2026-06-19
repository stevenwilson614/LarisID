-- "Naik Daun" watchlist: young products (listed in the last ~120 days) that are
-- already selling fast — the new-seller breakouts you can ride as a fast second.
-- Velocity here is sales-since-listing (total_sold / age_days). True week-over-week
-- momentum needs the listing_deltas pipeline revived; this is the honest proxy
-- available from the listings panel today.
DROP MATERIALIZED VIEW IF EXISTS public.mv_naik_daun CASCADE;
CREATE MATERIALIZED VIEW public.mv_naik_daun AS
WITH latest AS (
  SELECT DISTINCT ON (item_id)
         item_id, shop_id, store_name, product_name, category, keyword,
         price, total_sold, reviews, rating, location, image_url, url,
         listing_date, scraped_at,
         GREATEST(EXTRACT(epoch FROM (scraped_at - listing_date)) / 86400, 1) AS age_days
  FROM public.listings
  WHERE listing_date >= (now() - interval '120 days')
    AND price BETWEEN 1000 AND 50000000
    AND total_sold >= 100
  ORDER BY item_id, scraped_at DESC
)
SELECT
  item_id, shop_id, store_name, product_name, category, keyword,
  price, total_sold, reviews, rating, location, image_url, url,
  round(age_days)::int                       AS age_days,
  round((total_sold / age_days))::int         AS sold_per_day,
  listing_date,
  now()                                       AS refreshed_at
FROM latest
WHERE age_days BETWEEN 7 AND 120
ORDER BY total_sold / age_days DESC
LIMIT 200;

CREATE UNIQUE INDEX mv_naik_daun_item_idx ON public.mv_naik_daun (item_id);
CREATE INDEX mv_naik_daun_cat_idx ON public.mv_naik_daun (category);

GRANT SELECT ON public.mv_naik_daun TO anon, authenticated;

-- fold into the shared refresh helper
CREATE OR REPLACE FUNCTION public.refresh_breakout_matviews()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_niche_breakout;
  REFRESH MATERIALIZED VIEW public.mv_region_category;
  REFRESH MATERIALIZED VIEW public.mv_supplier_leaderboard;
  REFRESH MATERIALIZED VIEW public.mv_naik_daun;
END;
$$;
