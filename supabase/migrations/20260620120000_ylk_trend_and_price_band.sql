-- Extend mv_region_category with a recency-window trend signal (recent 45d vs
-- prior 45-90d, computed straight from listings.listing_date — matches the
-- now()-relative window pattern already used in mv_naik_daun) and a
-- breakout-item price band (p25/p75) for "Lihat Produk" pre-filtering on
-- Discover. Existing columns (location, category, new_items, breakouts,
-- breakout_rate, median_winner_price, refreshed_at) keep identical
-- names/semantics — confirmed only the YLK card reads this view.

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
),
recent AS (
  SELECT location, category,
         count(*)::int                                                  AS new_items_recent,
         count(*) FILTER (WHERE total_sold >= 100)::int                 AS breakouts_recent
  FROM latest
  WHERE listing_date >= (now() - interval '45 days')
  GROUP BY location, category
),
prior AS (
  SELECT location, category,
         count(*)::int                                                  AS new_items_prior,
         count(*) FILTER (WHERE total_sold >= 100)::int                 AS breakouts_prior
  FROM latest
  WHERE listing_date >= (now() - interval '90 days')
    AND listing_date <  (now() - interval '45 days')
  GROUP BY location, category
)
SELECT
  l.location,
  l.category,
  count(*)::int                                                               AS new_items,
  count(*) FILTER (WHERE l.total_sold >= 100)::int                           AS breakouts,
  round((100.0 * count(*) FILTER (WHERE l.total_sold >= 100)
         / NULLIF(count(*), 0))::numeric, 1)                                 AS breakout_rate,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price)
        FILTER (WHERE l.total_sold >= 100))::int                            AS median_winner_price,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY l.price)
        FILTER (WHERE l.total_sold >= 100))::int                            AS price_p25_breakout,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY l.price)
        FILTER (WHERE l.total_sold >= 100))::int                            AS price_p75_breakout,
  COALESCE(r.new_items_recent, 0)                                            AS new_items_recent,
  COALESCE(p.new_items_prior, 0)                                             AS new_items_prior,
  CASE WHEN COALESCE(r.new_items_recent, 0) >= 5
       THEN round((100.0 * r.breakouts_recent / NULLIF(r.new_items_recent, 0))::numeric, 1)
       ELSE NULL END                                                         AS breakout_rate_recent,
  CASE WHEN COALESCE(p.new_items_prior, 0) >= 5
       THEN round((100.0 * p.breakouts_prior / NULLIF(p.new_items_prior, 0))::numeric, 1)
       ELSE NULL END                                                         AS breakout_rate_prior,
  CASE WHEN COALESCE(r.new_items_recent, 0) >= 5 AND COALESCE(p.new_items_prior, 0) >= 5
       THEN round((100.0 * r.breakouts_recent / NULLIF(r.new_items_recent, 0))::numeric, 1)
          - round((100.0 * p.breakouts_prior / NULLIF(p.new_items_prior, 0))::numeric, 1)
       ELSE NULL END                                                         AS trend_delta,
  now()                                                                      AS refreshed_at
FROM latest l
LEFT JOIN recent r USING (location, category)
LEFT JOIN prior  p USING (location, category)
GROUP BY l.location, l.category, r.new_items_recent, r.breakouts_recent,
         p.new_items_prior, p.breakouts_prior;

CREATE UNIQUE INDEX mv_region_category_idx ON public.mv_region_category (location, category);
CREATE INDEX mv_region_category_loc_idx ON public.mv_region_category (location);

GRANT SELECT ON public.mv_region_category TO anon, authenticated;

-- refresh_breakout_matviews() already calls REFRESH MATERIALIZED VIEW
-- public.mv_region_category with no column references — no change needed.

NOTIFY pgrst, 'reload schema';
