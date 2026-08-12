-- Pantauan keyword/store charts: bake review-based sold estimates into
-- mv_keyword_daily / mv_shop_daily, then restore the fast series RPCs that
-- densify those matviews.
--
-- 20260812170000 tried to recompute listing_interval_unit_delta live inside
-- keyword_daily_series — that times out on busy keywords. Estimates belong
-- in the matviews (refreshed offline); series RPCs stay O(days).
--
-- Apply on Contabo:
--   ssh … 'docker exec -i supabase-db psql -U postgres' \
--     < supabase/migrations/20260812171000_tracker_mv_use_sold_estimates.sql
-- CREATE MATERIALIZED VIEW populates immediately (can take several minutes).

SET statement_timeout TO 0;

-- ── Keyword daily panel ────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_keyword_daily CASCADE;

CREATE MATERIALIZED VIEW public.mv_keyword_daily AS
WITH per_item AS (
  SELECT
    lower(btrim(keyword)) AS keyword,
    item_id,
    shop_id,
    date(scraped_at) AS d,
    max(total_sold) AS sold,
    max(reviews) AS reviews,
    max(price) FILTER (WHERE price >= 1 AND price < 1e9) AS price,
    max(rating) FILTER (WHERE rating > 0 AND rating <= 5) AS rating,
    mode() WITHIN GROUP (ORDER BY category) AS category
  FROM public.listings
  WHERE keyword IS NOT NULL
    AND btrim(keyword) <> ''
    AND item_id IS NOT NULL
  GROUP BY 1, 2, 3, 4
),
lagged AS (
  SELECT
    p.*,
    lag(p.sold) OVER w AS prev_sold,
    lag(p.reviews) OVER w AS prev_reviews,
    lag(p.d) OVER w AS prev_d
  FROM per_item p
  WINDOW w AS (PARTITION BY p.keyword, p.item_id, p.shop_id ORDER BY p.d)
),
delta AS (
  SELECT
    l.*,
    CASE
      WHEN l.prev_sold IS NULL THEN 0::bigint
      ELSE LEAST(
        public.listing_interval_unit_delta(
          l.prev_sold::bigint, l.sold::bigint,
          l.prev_reviews::bigint, l.reviews::bigint,
          l.category),
        (500 * GREATEST(1, COALESCE(l.d - l.prev_d, 1)))::bigint
      )
    END AS sold_delta,
    GREATEST(1, COALESCE(l.d - l.prev_d, 1))::int AS span_days
  FROM lagged l
)
SELECT
  keyword,
  d,
  count(*)::int AS n_listings,
  count(DISTINCT shop_id)::int AS n_sellers,
  avg(price)::numeric(18,2) AS avg_price,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::numeric(18,2) AS median_price,
  avg(rating)::numeric(4,2) AS avg_rating,
  sum(sold)::bigint AS total_sold_sum,
  sum(sold_delta)::bigint AS sold_delta,
  sum(sold_delta * coalesce(price, 0))::bigint AS omset_delta,
  GREATEST(1, ROUND(
    sum(sold_delta::numeric * span_days)
    / NULLIF(sum(sold_delta), 0)
  ))::int AS span_days,
  now() AS refreshed_at
FROM delta
GROUP BY keyword, d;

CREATE UNIQUE INDEX mv_keyword_daily_pk ON public.mv_keyword_daily (keyword, d);
CREATE INDEX        mv_keyword_daily_d  ON public.mv_keyword_daily (d);

-- ── Shop daily panel ───────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_shop_daily CASCADE;

CREATE MATERIALIZED VIEW public.mv_shop_daily AS
WITH per_item AS (
  SELECT
    shop_id,
    item_id,
    date(scraped_at) AS d,
    max(total_sold) AS sold,
    max(reviews) AS reviews,
    max(price) FILTER (WHERE price >= 1 AND price < 1e9) AS price,
    max(rating) FILTER (WHERE rating > 0 AND rating <= 5) AS rating,
    mode() WITHIN GROUP (ORDER BY store_name) AS store_name,
    mode() WITHIN GROUP (ORDER BY category) AS category
  FROM public.listings
  WHERE shop_id IS NOT NULL
    AND item_id IS NOT NULL
    AND scraped_at >= now() - interval '120 days'
  GROUP BY 1, 2, 3
),
lagged AS (
  SELECT
    p.*,
    lag(p.sold) OVER w AS prev_sold,
    lag(p.reviews) OVER w AS prev_reviews,
    lag(p.d) OVER w AS prev_d
  FROM per_item p
  WINDOW w AS (PARTITION BY p.shop_id, p.item_id ORDER BY p.d)
),
delta AS (
  SELECT
    l.*,
    CASE
      WHEN l.prev_sold IS NULL THEN 0::bigint
      ELSE LEAST(
        public.listing_interval_unit_delta(
          l.prev_sold::bigint, l.sold::bigint,
          l.prev_reviews::bigint, l.reviews::bigint,
          l.category),
        (500 * GREATEST(1, COALESCE(l.d - l.prev_d, 1)))::bigint
      )
    END AS sold_delta,
    GREATEST(1, COALESCE(l.d - l.prev_d, 1))::int AS span_days
  FROM lagged l
)
SELECT
  shop_id,
  d,
  mode() WITHIN GROUP (ORDER BY store_name) AS store_name,
  count(*)::int AS n_listings,
  avg(price)::numeric(18,2) AS avg_price,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY price))::numeric(18,2) AS median_price,
  avg(rating)::numeric(4,2) AS avg_rating,
  sum(sold)::bigint AS total_sold_sum,
  sum(sold_delta)::bigint AS sold_delta,
  sum(sold_delta * coalesce(price, 0))::bigint AS omset_delta,
  GREATEST(1, ROUND(
    sum(sold_delta::numeric * span_days)
    / NULLIF(sum(sold_delta), 0)
  ))::int AS span_days,
  now() AS refreshed_at
FROM delta
GROUP BY shop_id, d;

CREATE UNIQUE INDEX mv_shop_daily_pk ON public.mv_shop_daily (shop_id, d);
CREATE INDEX        mv_shop_daily_d  ON public.mv_shop_daily (d);

REVOKE ALL ON public.mv_keyword_daily FROM anon, authenticated;
REVOKE ALL ON public.mv_shop_daily FROM anon, authenticated;

-- ── Restore fast densifiers (read matviews; hit intervals = estimated) ─────
DROP FUNCTION IF EXISTS keyword_daily_series(text, date, date);
CREATE OR REPLACE FUNCTION keyword_daily_series(
    p_keyword text, p_from date, p_to date)
RETURNS TABLE(d date, units real, omset bigint, price real, source text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
    WITH bounds AS (
        SELECT GREATEST(p_from, LEAST(p_to, current_date) - 400) AS d0,
               LEAST(p_to, current_date)                          AS d1
    ),
    raw AS (
        SELECT k.d AS end_d,
               GREATEST(COALESCE(k.span_days, 1), 1)::double precision AS gap,
               LEAST(GREATEST(k.sold_delta::double precision
                     / GREATEST(COALESCE(k.span_days, 1), 1), 0), 500000) AS v,
               k.avg_price
        FROM mv_keyword_daily k
        WHERE k.keyword = lower(btrim(p_keyword)) AND k.sold_delta IS NOT NULL
    ),
    iv AS (
        SELECT (end_d - gap * interval '1 day')::date AS start_d, end_d, v,
               avg_price::real AS px,
               velocity_weight('threshold', 'medium', gap,
                               (current_date - end_d)::double precision + gap / 2.0,
                               velocity_tau()::double precision) AS w,
               velocity_weight('threshold', 'medium', gap,
                               (current_date - end_d)::double precision + gap / 2.0,
                               365.0) AS w_long
        FROM raw
    ),
    agg AS (
        SELECT SUM(w) AS w_own,
               CASE WHEN SUM(w) > 0 THEN SUM(w * ln(v + 0.01)) / SUM(w) END AS ln_own,
               CASE WHEN SUM(w_long) > 0
                    THEN exp(SUM(w_long * ln(v + 0.01)) / SUM(w_long)) - 0.01
               END AS v_long,
               MAX(end_d) AS last_d, MIN(start_d) AS first_d
        FROM iv
    ),
    px AS (
        SELECT (SELECT px FROM iv ORDER BY end_d DESC LIMIT 1) AS last_px,
               (SELECT px FROM iv ORDER BY end_d ASC  LIMIT 1) AS first_px
    ),
    days AS (
        SELECT gs::date AS d FROM bounds b,
               generate_series(b.d0, b.d1, interval '1 day') gs
    )
    SELECT dd.d,
           COALESCE(hit.v, fb.v)::real AS units,
           GREATEST(0, round(COALESCE(hit.px, fb.px, 0)::numeric
                             * COALESCE(hit.v, fb.v)::numeric))::bigint AS omset,
           COALESCE(hit.px, fb.px, 0)::real AS price,
           COALESCE(hit.src, fb.src) AS source
    FROM days dd
    CROSS JOIN agg a
    CROSS JOIN px
    CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN a.last_d IS NULL THEN 0::real
                 WHEN dd.d > a.last_d THEN
                   velocity_at(a.w_own, a.ln_own, COALESCE(a.v_long, 0),
                               velocity_tau()::double precision,
                               velocity_k(velocity_stale_band(
                                 (dd.d - a.last_d)::double precision))::double precision,
                               (dd.d - a.last_d)::double precision)
                 ELSE COALESCE(a.v_long, 0)::real
               END AS v,
               CASE WHEN dd.d > COALESCE(a.last_d, dd.d)
                    THEN px.last_px ELSE px.first_px END AS px,
               CASE WHEN a.last_d IS NOT NULL AND dd.d > a.last_d
                    THEN 'forecast' ELSE 'prior' END AS src
    ) fb
    LEFT JOIN LATERAL (
        -- Matview sold_delta now uses listing_interval_unit_delta (reviews ×
        -- category mult when Shopee buckets freeze). Label as estimated so
        -- Pantauan legend/meta treat these as estimasi, not raw soldΔ.
        SELECT iv.v, iv.px, 'estimated'::text AS src
        FROM iv WHERE dd.d > iv.start_d AND dd.d <= iv.end_d
        ORDER BY (iv.end_d - iv.start_d) ASC, iv.end_d DESC LIMIT 1
    ) hit ON true
    ORDER BY dd.d;
$$;

DROP FUNCTION IF EXISTS store_daily_series(bigint, date, date);
CREATE OR REPLACE FUNCTION store_daily_series(
    p_shop_id bigint, p_from date, p_to date)
RETURNS TABLE(d date, units real, omset bigint, price real, source text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '10s'
AS $$
    WITH bounds AS (
        SELECT GREATEST(p_from, LEAST(p_to, current_date) - 400) AS d0,
               LEAST(p_to, current_date)                          AS d1
    ),
    raw AS (
        SELECT s.d AS end_d,
               GREATEST(COALESCE(s.span_days, 1), 1)::double precision AS gap,
               LEAST(GREATEST(s.sold_delta::double precision
                     / GREATEST(COALESCE(s.span_days, 1), 1), 0), 500000) AS v,
               s.avg_price
        FROM mv_shop_daily s
        WHERE s.shop_id = p_shop_id AND s.sold_delta IS NOT NULL
    ),
    iv AS (
        SELECT (end_d - gap * interval '1 day')::date AS start_d, end_d, v,
               avg_price::real AS px,
               velocity_weight('threshold', 'medium', gap,
                               (current_date - end_d)::double precision + gap / 2.0,
                               velocity_tau()::double precision) AS w,
               velocity_weight('threshold', 'medium', gap,
                               (current_date - end_d)::double precision + gap / 2.0,
                               365.0) AS w_long
        FROM raw
    ),
    agg AS (
        SELECT SUM(w) AS w_own,
               CASE WHEN SUM(w) > 0 THEN SUM(w * ln(v + 0.01)) / SUM(w) END AS ln_own,
               CASE WHEN SUM(w_long) > 0
                    THEN exp(SUM(w_long * ln(v + 0.01)) / SUM(w_long)) - 0.01
               END AS v_long,
               MAX(end_d) AS last_d, MIN(start_d) AS first_d
        FROM iv
    ),
    px AS (
        SELECT (SELECT px FROM iv ORDER BY end_d DESC LIMIT 1) AS last_px,
               (SELECT px FROM iv ORDER BY end_d ASC  LIMIT 1) AS first_px
    ),
    days AS (
        SELECT gs::date AS d FROM bounds b,
               generate_series(b.d0, b.d1, interval '1 day') gs
    )
    SELECT dd.d,
           COALESCE(hit.v, fb.v)::real AS units,
           GREATEST(0, round(COALESCE(hit.px, fb.px, 0)::numeric
                             * COALESCE(hit.v, fb.v)::numeric))::bigint AS omset,
           COALESCE(hit.px, fb.px, 0)::real AS price,
           COALESCE(hit.src, fb.src) AS source
    FROM days dd
    CROSS JOIN agg a
    CROSS JOIN px
    CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN a.last_d IS NULL THEN 0::real
                 WHEN dd.d > a.last_d THEN
                   velocity_at(a.w_own, a.ln_own, COALESCE(a.v_long, 0),
                               velocity_tau()::double precision,
                               velocity_k(velocity_stale_band(
                                 (dd.d - a.last_d)::double precision))::double precision,
                               (dd.d - a.last_d)::double precision)
                 ELSE COALESCE(a.v_long, 0)::real
               END AS v,
               CASE WHEN dd.d > COALESCE(a.last_d, dd.d)
                    THEN px.last_px ELSE px.first_px END AS px,
               CASE WHEN a.last_d IS NOT NULL AND dd.d > a.last_d
                    THEN 'forecast' ELSE 'prior' END AS src
    ) fb
    LEFT JOIN LATERAL (
        SELECT iv.v, iv.px, 'estimated'::text AS src
        FROM iv WHERE dd.d > iv.start_d AND dd.d <= iv.end_d
        ORDER BY (iv.end_d - iv.start_d) ASC, iv.end_d DESC LIMIT 1
    ) hit ON true
    ORDER BY dd.d;
$$;

GRANT EXECUTE ON FUNCTION keyword_daily_series(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION store_daily_series(bigint, date, date) TO authenticated;

COMMENT ON MATERIALIZED VIEW public.mv_keyword_daily IS
  'Per-keyword daily sold/omset deltas via listing_interval_unit_delta (review×mult when Shopee buckets freeze).';
COMMENT ON MATERIALIZED VIEW public.mv_shop_daily IS
  'Per-shop daily sold/omset deltas via listing_interval_unit_delta (review×mult when Shopee buckets freeze).';
