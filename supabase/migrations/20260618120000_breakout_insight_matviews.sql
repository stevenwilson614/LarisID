-- Breakout-insight data layer
-- Powers: Viability Score breakout-odds factor (A), Discover reality-check (D),
-- "Yang Laku dari Kotamu" region surface, and supplier/competitor leaderboard.
--
-- All views are AGGREGATE, non-PII marketplace stats derived from public `listings`.
-- Definitions (from the new-seller breakout analysis):
--   new product   = listing_date >= 2026-01-01 (genuinely new on Shopee)
--   breakout      = total_sold >= 100 units (meaningful traction)
--   price guard   = price BETWEEN 1000 AND 50,000,000 IDR (drop corrupt rows)
-- total_sold is Shopee's bucketed tier, so unit counts are approximate.

-- ── 1. Niche breakout odds, per search keyword ────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_niche_breakout CASCADE;
CREATE MATERIALIZED VIEW public.mv_niche_breakout AS
WITH latest AS (
  SELECT DISTINCT ON (item_id)
         item_id, keyword, price, total_sold, reviews, listing_date
  FROM public.listings
  WHERE listing_date >= '2026-01-01'
    AND keyword IS NOT NULL AND keyword <> ''
    AND price BETWEEN 1000 AND 50000000
  ORDER BY item_id, scraped_at DESC
)
SELECT
  keyword,
  count(*)::int                                                               AS new_items,
  count(*) FILTER (WHERE total_sold >= 100)::int                              AS breakouts,
  round((100.0 * count(*) FILTER (WHERE total_sold >= 100)
         / NULLIF(count(*), 0))::numeric, 1)                                  AS breakout_rate,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY total_sold))::int         AS median_new_sold,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)
        FILTER (WHERE total_sold >= 100))::int                               AS median_winner_price,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY reviews)
        FILTER (WHERE total_sold >= 100))::int                               AS median_winner_reviews,
  (sum(total_sold) FILTER (WHERE total_sold >= 100))::bigint                  AS units_from_winners,
  now()                                                                       AS refreshed_at
FROM latest
GROUP BY keyword;

CREATE UNIQUE INDEX mv_niche_breakout_keyword_idx ON public.mv_niche_breakout (keyword);

-- ── 2. Region x category breakout stats ───────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_region_category CASCADE;
CREATE MATERIALIZED VIEW public.mv_region_category AS
WITH latest AS (
  SELECT DISTINCT ON (item_id)
         item_id, location, category, price, total_sold, listing_date
  FROM public.listings
  WHERE listing_date >= '2026-01-01'
    AND location IS NOT NULL AND location <> ''
    AND category IS NOT NULL AND category <> ''
    AND price BETWEEN 1000 AND 50000000
  ORDER BY item_id, scraped_at DESC
)
SELECT
  location,
  category,
  count(*)::int                                                               AS new_items,
  count(*) FILTER (WHERE total_sold >= 100)::int                              AS breakouts,
  round((100.0 * count(*) FILTER (WHERE total_sold >= 100)
         / NULLIF(count(*), 0))::numeric, 1)                                  AS breakout_rate,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price)
        FILTER (WHERE total_sold >= 100))::int                               AS median_winner_price,
  now()                                                                       AS refreshed_at
FROM latest
GROUP BY location, category;

CREATE UNIQUE INDEX mv_region_category_idx ON public.mv_region_category (location, category);
CREATE INDEX mv_region_category_loc_idx ON public.mv_region_category (location);

-- ── 3. Supplier / competitor leaderboard, top 30 shops per keyword ────────────
-- Uses ALL listings (not just 2026) so the niche's real incumbents show up.
DROP MATERIALIZED VIEW IF EXISTS public.mv_supplier_leaderboard CASCADE;
CREATE MATERIALIZED VIEW public.mv_supplier_leaderboard AS
WITH latest AS (
  SELECT DISTINCT ON (item_id)
         item_id, keyword, shop_id, store_name, location,
         price, total_sold, rating, listing_date
  FROM public.listings
  WHERE keyword IS NOT NULL AND keyword <> ''
    AND price BETWEEN 1000 AND 50000000
  ORDER BY item_id, scraped_at DESC
),
shop_size AS (
  SELECT shop_id,
         count(DISTINCT item_id)::int AS catalog_items,
         max(total_sold)::bigint      AS shop_best
  FROM public.listings
  GROUP BY shop_id
),
per AS (
  SELECT l.keyword, l.shop_id,
         max(l.store_name)                        AS store_name,
         max(l.location)                          AS location,
         count(*)::int                            AS items_in_niche,
         max(l.total_sold)::bigint                AS hero_sold,
         sum(l.total_sold)::bigint                AS niche_sold,
         round(avg(l.price))::int                 AS avg_price,
         round(avg(l.rating)::numeric, 2)         AS avg_rating,
         bool_or(l.listing_date >= '2026-01-01')  AS has_new_listing
  FROM latest l
  GROUP BY l.keyword, l.shop_id
),
ranked AS (
  SELECT p.*, s.catalog_items, s.shop_best,
         row_number() OVER (PARTITION BY p.keyword ORDER BY p.hero_sold DESC) AS rnk
  FROM per p
  JOIN shop_size s USING (shop_id)
)
SELECT keyword, shop_id, store_name, location, items_in_niche, hero_sold,
       niche_sold, avg_price, avg_rating, catalog_items, shop_best,
       has_new_listing, rnk, now() AS refreshed_at
FROM ranked
WHERE rnk <= 30;

CREATE UNIQUE INDEX mv_supplier_leaderboard_idx ON public.mv_supplier_leaderboard (keyword, rnk);

-- ── Expose read-only to the web client (anon) and signed-in users ─────────────
GRANT SELECT ON public.mv_niche_breakout      TO anon, authenticated;
GRANT SELECT ON public.mv_region_category     TO anon, authenticated;
GRANT SELECT ON public.mv_supplier_leaderboard TO anon, authenticated;

-- ── Refresh helper — call from the scraper push after each load ───────────────
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
END;
$$;

NOTIFY pgrst, 'reload schema';
