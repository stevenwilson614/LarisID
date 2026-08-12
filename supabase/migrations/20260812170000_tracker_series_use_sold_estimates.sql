-- SUPERSEDED by 20260812171000_tracker_mv_use_sold_estimates.sql.
-- Live listing_interval_unit_delta inside keyword_daily_series times out on
-- busy keywords. Estimates are baked into mv_keyword_daily / mv_shop_daily
-- instead; keep this file only for migration history order.
--
-- Pantauan keyword/store daily series: use review-based sold estimates.
--
-- mv_keyword_daily / mv_shop_daily still store RAW total_sold deltas, which
-- go to 0 when Shopee freezes a listing on a display bucket (10rb+/100rb+/…).
-- keyword_daily_series / store_daily_series are what Pantauan "Semua" charts
-- actually plot — rebuild their observation intervals from listings using
-- listing_interval_unit_delta() (same equation Deep Dive uses) so bucketed
-- headlamps etc. contribute review-implied units instead of zeros.
--
-- Apply on Contabo:
--   Prefer 20260812171000_tracker_mv_use_sold_estimates.sql
--
-- Depends on: listing_interval_unit_delta, velocity_* helpers.

DROP FUNCTION IF EXISTS keyword_daily_series(text, date, date);
CREATE OR REPLACE FUNCTION keyword_daily_series(
    p_keyword text, p_from date, p_to date)
RETURNS TABLE(d date, units real, omset bigint, price real, source text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '15s'
AS $$
    WITH bounds AS (
        SELECT GREATEST(p_from, LEAST(p_to, current_date) - 400) AS d0,
               LEAST(p_to, current_date)                          AS d1
    ),
    per_item AS (
        SELECT
            l.item_id,
            l.shop_id,
            date(l.scraped_at) AS d,
            max(l.total_sold) AS sold,
            max(l.reviews) AS reviews,
            max(l.price) FILTER (WHERE l.price >= 1 AND l.price < 1e9) AS price,
            mode() WITHIN GROUP (ORDER BY l.category) AS category
        FROM public.listings l, bounds b
        WHERE lower(btrim(l.keyword)) = lower(btrim(p_keyword))
          AND l.item_id IS NOT NULL
          AND l.scraped_at >= (b.d0 - 45)
          AND l.scraped_at < (b.d1 + 2)
        GROUP BY 1, 2, 3
    ),
    lagged AS (
        SELECT
            p.*,
            lag(p.sold) OVER w AS prev_sold,
            lag(p.reviews) OVER w AS prev_reviews,
            lag(p.d) OVER w AS prev_d
        FROM per_item p
        WINDOW w AS (PARTITION BY p.item_id, p.shop_id ORDER BY p.d)
    ),
    item_delta AS (
        SELECT
            l.d AS end_d,
            GREATEST(1, COALESCE(l.d - l.prev_d, 1))::int AS span_days,
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
            l.price
        FROM lagged l
    ),
    by_day AS (
        SELECT
            end_d,
            SUM(sold_delta)::bigint AS sold_delta,
            AVG(price) FILTER (WHERE price IS NOT NULL) AS avg_price,
            GREATEST(1, ROUND(
              SUM(sold_delta::numeric * span_days)
              / NULLIF(SUM(sold_delta), 0)
            ))::int AS span_days
        FROM item_delta
        GROUP BY end_d
    ),
    raw AS (
        SELECT
            b.end_d,
            GREATEST(COALESCE(b.span_days, 1), 1)::double precision AS gap,
            LEAST(GREATEST(b.sold_delta::double precision
                  / GREATEST(COALESCE(b.span_days, 1), 1), 0), 500000) AS v,
            b.avg_price
        FROM by_day b
        WHERE b.sold_delta IS NOT NULL
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
SET statement_timeout TO '15s'
AS $$
    WITH bounds AS (
        SELECT GREATEST(p_from, LEAST(p_to, current_date) - 400) AS d0,
               LEAST(p_to, current_date)                          AS d1
    ),
    per_item AS (
        SELECT
            l.item_id,
            date(l.scraped_at) AS d,
            max(l.total_sold) AS sold,
            max(l.reviews) AS reviews,
            max(l.price) FILTER (WHERE l.price >= 1 AND l.price < 1e9) AS price,
            mode() WITHIN GROUP (ORDER BY l.category) AS category
        FROM public.listings l, bounds b
        WHERE l.shop_id = p_shop_id
          AND l.item_id IS NOT NULL
          AND l.scraped_at >= (b.d0 - 45)
          AND l.scraped_at < (b.d1 + 2)
        GROUP BY 1, 2
    ),
    lagged AS (
        SELECT
            p.*,
            lag(p.sold) OVER w AS prev_sold,
            lag(p.reviews) OVER w AS prev_reviews,
            lag(p.d) OVER w AS prev_d
        FROM per_item p
        WINDOW w AS (PARTITION BY p.item_id ORDER BY p.d)
    ),
    item_delta AS (
        SELECT
            l.d AS end_d,
            GREATEST(1, COALESCE(l.d - l.prev_d, 1))::int AS span_days,
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
            l.price
        FROM lagged l
    ),
    by_day AS (
        SELECT
            end_d,
            SUM(sold_delta)::bigint AS sold_delta,
            AVG(price) FILTER (WHERE price IS NOT NULL) AS avg_price,
            GREATEST(1, ROUND(
              SUM(sold_delta::numeric * span_days)
              / NULLIF(SUM(sold_delta), 0)
            ))::int AS span_days
        FROM item_delta
        GROUP BY end_d
    ),
    raw AS (
        SELECT
            b.end_d,
            GREATEST(COALESCE(b.span_days, 1), 1)::double precision AS gap,
            LEAST(GREATEST(b.sold_delta::double precision
                  / GREATEST(COALESCE(b.span_days, 1), 1), 0), 500000) AS v,
            b.avg_price
        FROM by_day b
        WHERE b.sold_delta IS NOT NULL
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

GRANT EXECUTE ON FUNCTION keyword_daily_series(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION store_daily_series(bigint, date, date) TO authenticated;
