-- The sparkline/chart only ever plotted the CURRENT window's daily flow
-- (series filtered to `is_cur`), while the %/color badge next to it compares
-- the current window's TOTAL against the PREVIOUS window's total — two
-- different questions. A keyword can be internally trending up within the
-- current window while still summing to less than the (invisible) previous
-- window, so the line could visually slope up right next to a red "-X%".
-- Confirmed 2026-08-11 on a real tracked keyword.
--
-- Fix: include the previous window's points in `series` too (same `win` CTE
-- already computes them, just drop the `is_cur` filter on the series
-- subquery), tagged with `is_cur` per point so the frontend can mark where
-- "now" starts. The line's overall shape then actually shows the transition
-- the badge is describing.

CREATE OR REPLACE FUNCTION public.get_tracker_rollup(p_days integer DEFAULT 7, p_scope text DEFAULT 'keyword'::text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me      uuid := auth.uid();
  v_days    int  := greatest(1, least(coalesce(p_days, 7), 90));
  v_scope   text := case when p_scope = 'store' then 'store' else 'keyword' end;
  v_cur0    date;
  v_prev0   date;
  v_rows    json;
  v_totals  json;
  v_as_of   date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- Half-open day ranges. Both matviews are keyed on a date column, so these
  -- are plain range predicates on an indexed leading column.
  v_cur0  := (current_date - v_days);
  v_prev0 := (current_date - (v_days * 2));

  if v_scope = 'keyword' then
    with tracked as (
      select lower(btrim(k.keyword)) as keyword,
             max(k.category)         as category,
             min(k.created_at)       as created_at
      from public.user_tracked_keywords k
      where k.user_id = v_me
      group by 1
    ),
    -- A bucket is a flow spread evenly over (d - span_days, d]; only the part
    -- overlapping a window counts toward it. Without this, a keyword scraped
    -- after a three-week gap reports three weeks of sales as "7 hari terakhir".
    win as (
      select t.keyword,
             md.d, md.n_listings, md.n_sellers, md.avg_price, md.median_price,
             md.avg_rating,
             (md.sold_delta  * public._win_overlap(md.d, md.span_days, v_cur0,  current_date))::bigint as sold_delta,
             (md.omset_delta * public._win_overlap(md.d, md.span_days, v_cur0,  current_date))::bigint as omset_delta,
             (md.sold_delta  * public._win_overlap(md.d, md.span_days, v_prev0, v_cur0))::bigint       as sold_delta_prev,
             (md.omset_delta * public._win_overlap(md.d, md.span_days, v_prev0, v_cur0))::bigint       as omset_delta_prev,
             (md.d >= v_cur0) as is_cur
      from tracked t
      join public.mv_keyword_daily md on md.keyword = t.keyword
      where md.d >= v_prev0 - md.span_days
    ),
    -- Point-in-time columns (SKU aktif, toko aktif, harga, rating) come from
    -- the LATEST day in each window, not an average across it: "852 SKU aktif"
    -- is a state, while units and omset are flows that sum.
    latest as (
      select distinct on (keyword, is_cur)
             keyword, is_cur, d, n_listings, n_sellers, avg_price, median_price, avg_rating
      from win order by keyword, is_cur, d desc
    ),
    agg as (
      select w.keyword,
             sum(w.sold_delta)       as units,
             sum(w.omset_delta)      as omset,
             sum(w.sold_delta_prev)  as units_prev,
             sum(w.omset_delta_prev) as omset_prev,
             count(*) filter (where w.is_cur and w.sold_delta > 0) as n_days,
             max(w.d) filter (where w.is_cur)                      as last_d
      from win w group by w.keyword
    )
    select json_agg(x order by x.omset desc nulls last), max(x.last_d)
      into v_rows, v_as_of
    from (
      select
        t.keyword,
        t.category,
        coalesce(a.units, 0)::bigint       as units,
        coalesce(a.omset, 0)::bigint       as omset,
        coalesce(a.units_prev, 0)::bigint  as units_prev,
        coalesce(a.omset_prev, 0)::bigint  as omset_prev,
        lc.n_listings, lc.n_sellers, lc.avg_price, lc.median_price, lc.avg_rating,
        lp.n_listings as n_listings_prev,
        lp.n_sellers  as n_sellers_prev,
        lp.avg_price  as avg_price_prev,
        lp.avg_rating as avg_rating_prev,
        coalesce(a.n_days, 0)::int         as n_days,
        a.last_d,
        coalesce((
          select json_agg(json_build_object(
                            'd', s.d,
                            'units', s.sold_delta,
                            'omset', s.omset_delta,
                            'avg_price', s.avg_price,
                            'n_listings', s.n_listings,
                            'n_sellers', s.n_sellers,
                            'is_cur', s.is_cur
                          ) order by s.d)
          from win s where s.keyword = t.keyword
        ), '[]'::json)                     as series
      from tracked t
      left join agg a  on a.keyword = t.keyword
      left join latest lc on lc.keyword = t.keyword and lc.is_cur
      left join latest lp on lp.keyword = t.keyword and not lp.is_cur
    ) x;
  else
    with tracked as (
      select s.shop_id, max(s.store_name) as store_name, min(s.created_at) as created_at
      from public.user_tracked_stores s
      where s.user_id = v_me
      group by 1
    ),
    win as (
      select t.shop_id,
             sd.d, sd.n_listings, sd.avg_price, sd.median_price, sd.avg_rating,
             (sd.sold_delta  * public._win_overlap(sd.d, sd.span_days, v_cur0,  current_date))::bigint as sold_delta,
             (sd.omset_delta * public._win_overlap(sd.d, sd.span_days, v_cur0,  current_date))::bigint as omset_delta,
             (sd.sold_delta  * public._win_overlap(sd.d, sd.span_days, v_prev0, v_cur0))::bigint       as sold_delta_prev,
             (sd.omset_delta * public._win_overlap(sd.d, sd.span_days, v_prev0, v_cur0))::bigint       as omset_delta_prev,
             (sd.d >= v_cur0) as is_cur
      from tracked t
      join public.mv_shop_daily sd on sd.shop_id = t.shop_id
      where sd.d >= v_prev0 - sd.span_days
    ),
    latest as (
      select distinct on (shop_id, is_cur)
             shop_id, is_cur, d, n_listings, avg_price, median_price, avg_rating
      from win order by shop_id, is_cur, d desc
    ),
    agg as (
      select w.shop_id,
             sum(w.sold_delta)       as units,
             sum(w.omset_delta)      as omset,
             sum(w.sold_delta_prev)  as units_prev,
             sum(w.omset_delta_prev) as omset_prev,
             count(*) filter (where w.is_cur and w.sold_delta > 0) as n_days,
             max(w.d) filter (where w.is_cur)                      as last_d
      from win w group by w.shop_id
    )
    select json_agg(x order by x.omset desc nulls last), max(x.last_d)
      into v_rows, v_as_of
    from (
      select
        t.shop_id,
        coalesce(nullif(t.store_name, ''), 'Toko ' || t.shop_id) as store_name,
        coalesce(a.units, 0)::bigint       as units,
        coalesce(a.omset, 0)::bigint       as omset,
        coalesce(a.units_prev, 0)::bigint  as units_prev,
        coalesce(a.omset_prev, 0)::bigint  as omset_prev,
        lc.n_listings, lc.avg_price, lc.median_price, lc.avg_rating,
        lp.n_listings as n_listings_prev,
        lp.avg_price  as avg_price_prev,
        lp.avg_rating as avg_rating_prev,
        coalesce(a.n_days, 0)::int         as n_days,
        a.last_d,
        coalesce((
          select json_agg(json_build_object(
                            'd', s.d,
                            'units', s.sold_delta,
                            'omset', s.omset_delta,
                            'avg_price', s.avg_price,
                            'n_listings', s.n_listings,
                            'is_cur', s.is_cur
                          ) order by s.d)
          from win s where s.shop_id = t.shop_id
        ), '[]'::json)                     as series
      from tracked t
      left join agg a  on a.shop_id = t.shop_id
      left join latest lc on lc.shop_id = t.shop_id and lc.is_cur
      left join latest lp on lp.shop_id = t.shop_id and not lp.is_cur
    ) x;
  end if;

  -- Totals are summed from the rows above rather than re-queried, so the strip
  -- can never disagree with the table underneath it.
  select json_build_object(
    'tracked',         coalesce(json_array_length(v_rows), 0),
    'units',           coalesce(sum((r->>'units')::bigint), 0),
    'units_prev',      coalesce(sum((r->>'units_prev')::bigint), 0),
    'omset',           coalesce(sum((r->>'omset')::bigint), 0),
    'omset_prev',      coalesce(sum((r->>'omset_prev')::bigint), 0),
    'n_listings',      coalesce(sum((r->>'n_listings')::int), 0),
    'n_listings_prev', coalesce(sum((r->>'n_listings_prev')::int), 0),
    'n_sellers',       coalesce(sum((r->>'n_sellers')::int), 0),
    'n_sellers_prev',  coalesce(sum((r->>'n_sellers_prev')::int), 0),
    'avg_price',       round(coalesce(avg((r->>'avg_price')::numeric), 0)),
    'avg_price_prev',  round(coalesce(avg((r->>'avg_price_prev')::numeric), 0))
  ) into v_totals
  from json_array_elements(coalesce(v_rows, '[]'::json)) r;

  return json_build_object(
    'scope',       v_scope,
    'window_days', v_days,
    'as_of',       v_as_of,
    -- has_history answers "does this user's tracked set have ANY data at all",
    -- NOT "did anything move inside the selected window". Scrape days are
    -- sparse and irregular: a 7-day window with no scrape is not the same as a
    -- market with no history, and conflating the two sent users who track a
    -- keyword with four months of data to the "Mengumpulkan data" screen.
    'has_history', public.tracker_has_history(30),
    'totals',      v_totals,
    'rows',        coalesce(v_rows, '[]'::json)
  );
end $function$;
