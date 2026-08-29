-- Pantauan daily panels: tile listing_deltas per listing instead of
-- aggregating scrape-day lumps and then picking the shortest overlapping
-- keyword-level interval. That construction recovered 17-79% of raw units
-- (Cauchy-Schwarz on a units-weighted span, unweighted avg_price, and
-- non-tiling keyword rows).
--
-- Rate is built here, offline, in the matview. keyword_daily_series stays
-- O(days) over already-daily rows (span_days = 1).
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260830150000_keyword_daily_from_listing_deltas.sql
-- Canonical refresh body also lives in ~/shopee_scraper/listing_deltas.sql.

SET statement_timeout TO 0;

ALTER TABLE public.listing_deltas ADD COLUMN IF NOT EXISTS price double precision;
CREATE INDEX IF NOT EXISTS listing_deltas_keyword_idx ON public.listing_deltas (keyword);

UPDATE public.listing_deltas ld
SET price = l.price
FROM public.listings l
WHERE l.item_id = ld.item_id
  AND l.shop_id = ld.shop_id
  AND l.scraped_at = ld.scraped_at
  AND ld.price IS NULL
  AND l.price >= 1 AND l.price < 1e9;

-- Same body as listing_deltas.sql, now writing price so the next scrape
-- day does not leave the new column NULL.
CREATE OR REPLACE FUNCTION refresh_listing_deltas(target_day date DEFAULT current_date)
RETURNS TABLE(rows_upserted bigint, items_on_day bigint, paired bigint,
              exact_hi bigint, threshold_med bigint, review_med bigint, review_lo bigint,
              counter_reset bigint, exact_hi_pct numeric)
LANGUAGE plpgsql
SET statement_timeout TO '900s'
AS $$
DECLARE
  n_items bigint;
BEGIN
  CREATE TEMP TABLE _curr ON COMMIT DROP AS
  SELECT DISTINCT ON (item_id, shop_id)
         item_id, shop_id, keyword, category, total_sold, reviews, price, scraped_at
  FROM listings
  WHERE scraped_at >= target_day::timestamptz
    AND scraped_at <  (target_day + 1)::timestamptz
    AND item_id IS NOT NULL
    AND shop_id IS NOT NULL
  ORDER BY item_id, shop_id, scraped_at DESC;

  SELECT count(*) INTO n_items FROM _curr;
  CREATE INDEX ON _curr (item_id, shop_id);

  CREATE TEMP TABLE _pairs ON COMMIT DROP AS
  SELECT c.item_id, c.shop_id, c.keyword, c.category,
         c.scraped_at,
         p.scraped_at AS prev_scraped_at,
         COALESCE(c.total_sold, 0) AS sold_curr,
         COALESCE(p.total_sold, 0) AS sold_prev,
         COALESCE(c.reviews, 0)    AS review_curr,
         COALESCE(p.reviews, 0)    AS review_prev,
         CASE WHEN c.price >= 1 AND c.price < 1e9 THEN c.price END AS price,
         _lid_price_band(c.price)  AS band
  FROM _curr c
  CROSS JOIN LATERAL (
    SELECT l.total_sold, l.reviews, l.scraped_at
    FROM listings l
    WHERE l.item_id = c.item_id
      AND l.shop_id = c.shop_id
      AND l.scraped_at < target_day::timestamptz
    ORDER BY l.scraped_at DESC
    LIMIT 1
  ) p;

  WITH est AS (
    SELECT pr.*,
           m.mult,
           e.est, e.method, e.confidence
    FROM _pairs pr
    CROSS JOIN LATERAL (
      SELECT _lid_multiplier(pr.category, pr.band,
                             omset_scale_band(pr.sold_curr)::smallint) AS mult
    ) m
    CROSS JOIN LATERAL _lid_estimate(pr.sold_curr, pr.sold_prev,
                                     pr.review_curr, pr.review_prev, m.mult) e
  ), ins AS (
    INSERT INTO listing_deltas (
      item_id, shop_id, keyword, category,
      scraped_at, prev_scraped_at,
      sold_curr, sold_prev, sold_delta_raw,
      review_curr, review_prev, review_delta,
      estimated_sold_delta, estimation_method, confidence, category_multiplier,
      price
    )
    SELECT item_id, shop_id, keyword, category,
           scraped_at, prev_scraped_at,
           sold_curr, sold_prev, GREATEST(0, sold_curr - sold_prev),
           review_curr, review_prev, GREATEST(0, review_curr - review_prev),
           est, method, confidence, round(mult::numeric, 4)::real,
           price
    FROM est
    ON CONFLICT (item_id, shop_id, scraped_at) DO UPDATE SET
      keyword              = EXCLUDED.keyword,
      category             = EXCLUDED.category,
      prev_scraped_at      = EXCLUDED.prev_scraped_at,
      sold_curr            = EXCLUDED.sold_curr,
      sold_prev            = EXCLUDED.sold_prev,
      sold_delta_raw       = EXCLUDED.sold_delta_raw,
      review_curr          = EXCLUDED.review_curr,
      review_prev          = EXCLUDED.review_prev,
      review_delta         = EXCLUDED.review_delta,
      estimated_sold_delta = EXCLUDED.estimated_sold_delta,
      estimation_method    = EXCLUDED.estimation_method,
      confidence           = EXCLUDED.confidence,
      category_multiplier  = EXCLUDED.category_multiplier,
      price                = EXCLUDED.price
    RETURNING 1
  )
  SELECT (SELECT count(*) FROM ins),
         n_items,
         (SELECT count(*) FROM _pairs),
         (SELECT count(*) FROM est WHERE method = 'exact'        AND confidence = 'high'),
         (SELECT count(*) FROM est WHERE method = 'threshold'    AND confidence = 'medium'),
         (SELECT count(*) FROM est WHERE method = 'review_model' AND confidence = 'medium'),
         (SELECT count(*) FROM est WHERE method = 'review_model' AND confidence = 'low'),
         (SELECT count(*) FROM est WHERE method = 'counter_reset'),
         (SELECT round(100.0 * count(*) FILTER (WHERE method = 'exact') / NULLIF(count(*),0), 1)
            FROM est)
  INTO rows_upserted, items_on_day, paired, exact_hi, threshold_med, review_med,
       review_lo, counter_reset, exact_hi_pct;

  RETURN NEXT;
END;
$$;

-- ── Keyword daily panel ────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_keyword_daily CASCADE;

CREATE MATERIALIZED VIEW public.mv_keyword_daily AS
WITH iv AS (
  SELECT
    lower(btrim(ld.keyword)) AS keyword,
    ld.item_id,
    ld.shop_id,
    ld.prev_scraped_at::date AS start_d,
    ld.scraped_at::date AS end_d,
    GREATEST(1, (ld.scraped_at::date - ld.prev_scraped_at::date))::int AS span,
    LEAST(
      GREATEST(COALESCE(ld.estimated_sold_delta, 0), 0),
      500 * GREATEST(1, (ld.scraped_at::date - ld.prev_scraped_at::date))
    )::numeric AS sold,
    CASE WHEN ld.price >= 1 AND ld.price < 1e9 THEN ld.price END AS price
  FROM public.listing_deltas ld
  WHERE ld.keyword IS NOT NULL AND btrim(ld.keyword) <> ''
    AND ld.estimated_sold_delta IS NOT NULL
    AND ld.prev_scraped_at IS NOT NULL
    AND ld.scraped_at >= (current_date - 400)
),
expanded AS (
  SELECT
    i.keyword,
    gs::date AS d,
    i.item_id,
    i.shop_id,
    i.sold / i.span AS units_day,
    i.price
  FROM iv i
  CROSS JOIN LATERAL generate_series(
    GREATEST(i.start_d + 1, current_date - 400),
    LEAST(i.end_d, current_date),
    interval '1 day') gs
)
SELECT
  keyword,
  d,
  count(DISTINCT (item_id, shop_id))::int AS n_listings,
  count(DISTINCT shop_id)::int AS n_sellers,
  (sum(units_day * price) FILTER (WHERE price IS NOT NULL)
    / NULLIF(sum(units_day) FILTER (WHERE price IS NOT NULL), 0)
  )::numeric(18,2) AS avg_price,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY price)
    FILTER (WHERE price IS NOT NULL))::numeric(18,2) AS median_price,
  NULL::numeric(4,2) AS avg_rating,
  0::bigint AS total_sold_sum,
  round(sum(units_day))::bigint AS sold_delta,
  round(
    sum(units_day) * COALESCE(
      sum(units_day * price) FILTER (WHERE price IS NOT NULL)
        / NULLIF(sum(units_day) FILTER (WHERE price IS NOT NULL), 0),
      0)
  )::bigint AS omset_delta,
  1 AS span_days,
  now() AS refreshed_at
FROM expanded
GROUP BY keyword, d;

CREATE UNIQUE INDEX mv_keyword_daily_pk ON public.mv_keyword_daily (keyword, d);
CREATE INDEX        mv_keyword_daily_d  ON public.mv_keyword_daily (d);

-- ── Shop daily panel ───────────────────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.mv_shop_daily CASCADE;

CREATE MATERIALIZED VIEW public.mv_shop_daily AS
WITH iv AS (
  SELECT
    ld.shop_id,
    ld.item_id,
    ld.prev_scraped_at::date AS start_d,
    ld.scraped_at::date AS end_d,
    GREATEST(1, (ld.scraped_at::date - ld.prev_scraped_at::date))::int AS span,
    LEAST(
      GREATEST(COALESCE(ld.estimated_sold_delta, 0), 0),
      500 * GREATEST(1, (ld.scraped_at::date - ld.prev_scraped_at::date))
    )::numeric AS sold,
    CASE WHEN ld.price >= 1 AND ld.price < 1e9 THEN ld.price END AS price
  FROM public.listing_deltas ld
  WHERE ld.shop_id IS NOT NULL
    AND ld.estimated_sold_delta IS NOT NULL
    AND ld.prev_scraped_at IS NOT NULL
    AND ld.scraped_at >= (current_date - 140)
),
expanded AS (
  SELECT
    i.shop_id,
    gs::date AS d,
    i.item_id,
    i.sold / i.span AS units_day,
    i.price
  FROM iv i
  CROSS JOIN LATERAL generate_series(
    GREATEST(i.start_d + 1, current_date - 120),
    LEAST(i.end_d, current_date),
    interval '1 day') gs
)
SELECT
  shop_id,
  d,
  NULL::text AS store_name,
  count(DISTINCT item_id)::int AS n_listings,
  (sum(units_day * price) FILTER (WHERE price IS NOT NULL)
    / NULLIF(sum(units_day) FILTER (WHERE price IS NOT NULL), 0)
  )::numeric(18,2) AS avg_price,
  (percentile_cont(0.5) WITHIN GROUP (ORDER BY price)
    FILTER (WHERE price IS NOT NULL))::numeric(18,2) AS median_price,
  NULL::numeric(4,2) AS avg_rating,
  0::bigint AS total_sold_sum,
  round(sum(units_day))::bigint AS sold_delta,
  round(
    sum(units_day) * COALESCE(
      sum(units_day * price) FILTER (WHERE price IS NOT NULL)
        / NULLIF(sum(units_day) FILTER (WHERE price IS NOT NULL), 0),
      0)
  )::bigint AS omset_delta,
  1 AS span_days,
  now() AS refreshed_at
FROM expanded
GROUP BY shop_id, d;

CREATE UNIQUE INDEX mv_shop_daily_pk ON public.mv_shop_daily (shop_id, d);
CREATE INDEX        mv_shop_daily_d  ON public.mv_shop_daily (d);

REVOKE ALL ON public.mv_keyword_daily FROM anon, authenticated;
REVOKE ALL ON public.mv_shop_daily FROM anon, authenticated;

-- ── Series RPCs (same shape as ~/shopee_scraper/product_daily_series.sql) ──
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
        SELECT GREATEST(p_from, LEAST(p_to, current_date + 7) - 400) AS d0,
               LEAST(p_to, current_date + 7)                          AS d1
    ),
    raw AS (
        SELECT k.d AS end_d,
               GREATEST(COALESCE(k.span_days, 1), 1)::double precision AS gap,
               LEAST(GREATEST(k.sold_delta::double precision
                     / GREATEST(COALESCE(k.span_days, 1), 1), 0), 500000) AS v,
               COALESCE(
                 NULLIF(k.omset_delta, 0)::double precision
                   / NULLIF(k.sold_delta, 0),
                 k.avg_price) AS avg_price
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
        SELECT iv.v, iv.px, 'measured'::text AS src
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
        SELECT GREATEST(p_from, LEAST(p_to, current_date + 7) - 400) AS d0,
               LEAST(p_to, current_date + 7)                          AS d1
    ),
    raw AS (
        SELECT s.d AS end_d,
               GREATEST(COALESCE(s.span_days, 1), 1)::double precision AS gap,
               LEAST(GREATEST(s.sold_delta::double precision
                     / GREATEST(COALESCE(s.span_days, 1), 1), 0), 500000) AS v,
               COALESCE(
                 NULLIF(s.omset_delta, 0)::double precision
                   / NULLIF(s.sold_delta, 0),
                 s.avg_price) AS avg_price
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
        SELECT iv.v, iv.px, 'measured'::text AS src
        FROM iv WHERE dd.d > iv.start_d AND dd.d <= iv.end_d
        ORDER BY (iv.end_d - iv.start_d) ASC, iv.end_d DESC LIMIT 1
    ) hit ON true
    ORDER BY dd.d;
$$;

GRANT EXECUTE ON FUNCTION keyword_daily_series(text, date, date) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION store_daily_series(bigint, date, date) TO authenticated, anon;

COMMENT ON MATERIALIZED VIEW public.mv_keyword_daily IS
  'Per-keyword daily units/omset from listing_deltas tiled per listing (span_days=1).';
COMMENT ON MATERIALIZED VIEW public.mv_shop_daily IS
  'Per-shop daily units/omset from listing_deltas tiled per listing (span_days=1).';

NOTIFY pgrst, 'reload schema';
