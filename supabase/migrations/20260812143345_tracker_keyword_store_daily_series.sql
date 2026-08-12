-- Pantauan dense daily series (keyword + store).
--
-- get_tracker_rollup returns sparse scrape buckets whose spans can overlap,
-- so summing them double-counts and charts look arbitrary. These RPCs
-- de-overlap (one interval wins per day) and fill every remaining day from
-- the velocity nowcast — same machinery as product_daily_series, one level
-- up. Applied on Contabo via shopee_scraper/product_daily_series.sql; this
-- migration keeps LarisID-astro rebuildable.
--
-- Depends on: velocity_at, velocity_weight, velocity_tau, velocity_k,
-- velocity_stale_band (from velocity_model.sql), mv_keyword_daily,
-- mv_shop_daily.

-- 3.  keyword_daily_series / store_daily_series
-- ---------------------------------------------------------------------------
-- Same machinery one level up, so a tracked keyword whose products have not
-- been scraped inside the selected window still draws a line instead of a row
-- of zeros and "Belum ada tren".
--
-- A keyword has no product scale band and so no peer cohort of its own. Rather
-- than invent a keyword taxonomy, it shrinks toward ITS OWN long-run rate: the
-- same weighted mean computed at tau = 365, i.e. nearly flat over all available
-- history. mv_keyword_daily deltas carry no per-row estimation method, so they
-- take a flat 0.6 reliability -- the same credit the product model gives its
-- 'threshold' tier.
DROP FUNCTION IF EXISTS keyword_daily_series(text, date, date);
CREATE OR REPLACE FUNCTION keyword_daily_series(
    p_keyword text, p_from date, p_to date)
RETURNS TABLE(d date, units real, omset bigint, price real, source text)
LANGUAGE sql STABLE
-- SECURITY DEFINER because mv_keyword_daily / mv_shop_daily are deliberately not
-- granted to anon. This exposes only the aggregated per-day series the caller
-- asked for, rather than widening access to the underlying matviews. search_path
-- is pinned above, which is what makes that safe.
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
        WHERE k.keyword = p_keyword AND k.sold_delta IS NOT NULL
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
-- SECURITY DEFINER because mv_keyword_daily / mv_shop_daily are deliberately not
-- granted to anon. This exposes only the aggregated per-day series the caller
-- asked for, rather than widening access to the underlying matviews. search_path
-- is pinned above, which is what makes that safe.
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
        SELECT iv.v, iv.px, 'measured'::text AS src
        FROM iv WHERE dd.d > iv.start_d AND dd.d <= iv.end_d
        ORDER BY (iv.end_d - iv.start_d) ASC, iv.end_d DESC LIMIT 1
    ) hit ON true
    ORDER BY dd.d;
$$;


-- Grants and PostgREST pickup
GRANT EXECUTE ON FUNCTION keyword_daily_series(text, date, date)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION store_daily_series(bigint, date, date)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
