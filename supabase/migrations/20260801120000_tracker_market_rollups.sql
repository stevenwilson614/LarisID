-- ============================================================================
-- Tracker rollups — per-keyword and per-shop daily panels, straight from
-- `listings`.
--
-- WHY NOT listing_deltas: the tracker's first screen (get_tracker_deltas) reads
-- public.listing_deltas, which is only recomputed by weekly_scrape.sh on the
-- laptop — run_full_scrape.sh never calls it. On 2026-08-01 its newest row was
-- 2026-07-27 (157 rows) while `listings` was current to 2026-07-31 (35.8k rows
-- that day). Anything user-facing built on listing_deltas ships onto dead data,
-- so the Robinhood tracker aggregates `listings` itself.
--
-- WHY MATVIEWS: the aggregate is a full scan of ~1.1M rows (measured 2.3s for
-- keywords, 2.4s for shops). That is fine once per scrape, not once per page
-- load. Reads then hit 12.6k / 451k row matviews with a leading-column index.
--
-- WHY PER-DAY DELTAS AND NOT sum(total_sold): total_sold is a lifetime counter,
-- so summing it across a window measures inventory age, not sales. The window
-- functions below take each item's day-over-day increase instead — the first
-- snapshot of an item is a baseline contributing zero, never sales.
--
-- THE 500/DAY CLAMP: Shopee only shows exact sold counts below 1,000; above
-- that the UI rounds into display buckets (10rb+, 100rb+, 1jt+). A listing
-- crossing a bucket edge looks like it sold hundreds of thousands of units
-- overnight. js/gpt-app.js already corrects for this in ddCorrectSoldDelta
-- (DD_MAX_SOLD_PER_DAY = 500 sustained units/day); the same ceiling is applied
-- here so the tracker and the Deep Dive cannot disagree about the same product.
--
-- THE PRICE SANITY BOUND: `listings` holds at least one row priced at 1e13
-- (item 57009130827 — Rp 10 trillion, obvious scrape garbage). One such row
-- overflows numeric(18,2) and, short of that, would single-handedly wreck the
-- average price of whatever shop or keyword it lands in. Prices outside
-- [1, 1e9] are treated as unknown: the item's units still count, its price
-- simply contributes to neither the average nor the omset.
-- ============================================================================

begin;

-- ── Per-keyword daily panel ────────────────────────────────────────────────
drop materialized view if exists public.mv_keyword_daily cascade;

create materialized view public.mv_keyword_daily as
with per_item as (
  -- One row per (keyword, listing, scrape day). A single day can hold several
  -- scrapes of the same listing; max() picks the latest observed state.
  select
    lower(btrim(keyword))          as keyword,
    item_id,
    shop_id,
    date(scraped_at)               as d,
    max(total_sold)                as sold,
    max(price) filter (where price >= 1 and price < 1e9) as price,
    max(rating) filter (where rating > 0 and rating <= 5) as rating
  from public.listings
  where keyword is not null
    and btrim(keyword) <> ''
    and item_id is not null
  group by 1, 2, 3, 4
),
lagged as (
  select
    p.*,
    lag(p.sold) over w as prev_sold,
    lag(p.d)    over w as prev_d
  from per_item p
  window w as (partition by p.keyword, p.item_id, p.shop_id order by p.d)
),
delta as (
  select
    l.*,
    case
      when l.prev_sold is null then 0          -- baseline snapshot, not a sale
      when l.sold <= l.prev_sold then 0        -- relist / correction
      else least(l.sold - l.prev_sold,
                 500 * greatest(1, (l.d - l.prev_d)))
    end::bigint as sold_delta,
    greatest(1, coalesce(l.d - l.prev_d, 1))::int as span_days
  from lagged l
)
select
  keyword,
  d,
  count(*)::int                                                as n_listings,
  count(distinct shop_id)::int                                 as n_sellers,
  avg(price)::numeric(18,2)                                    as avg_price,
  (percentile_cont(0.5) within group (order by price))::numeric(18,2)
                                                               as median_price,
  avg(rating)::numeric(4,2)                                    as avg_rating,
  sum(sold)::bigint                                            as total_sold_sum,
  sum(sold_delta)::bigint                                      as sold_delta,
  sum(sold_delta * coalesce(price, 0))::bigint                 as omset_delta,
  -- Sales-weighted mean gap back to the previous observation of these items.
  -- A bucket measured after a 21-day gap holds 21 days of sales, so the RPC
  -- needs the span to work out how much of it falls inside a 7-day window.
  greatest(1, round(
    sum(sold_delta::numeric * span_days)
    / nullif(sum(sold_delta), 0)
  ))::int                                                      as span_days,
  now()                                                        as refreshed_at
from delta
group by keyword, d;

create unique index mv_keyword_daily_pk  on public.mv_keyword_daily (keyword, d);
create index        mv_keyword_daily_d   on public.mv_keyword_daily (d);

-- ── Per-shop daily panel ───────────────────────────────────────────────────
-- Bounded to 120 days: the tracker's widest window is 30 days and this one is
-- 36x wider than the keyword panel (451k rows unbounded).
drop materialized view if exists public.mv_shop_daily cascade;

create materialized view public.mv_shop_daily as
with per_item as (
  select
    shop_id,
    item_id,
    date(scraped_at)  as d,
    max(total_sold)   as sold,
    max(price) filter (where price >= 1 and price < 1e9) as price,
    max(rating) filter (where rating > 0 and rating <= 5) as rating,
    mode() within group (order by store_name) as store_name
  from public.listings
  where shop_id is not null
    and item_id is not null
    and scraped_at >= now() - interval '120 days'
  group by 1, 2, 3
),
lagged as (
  select
    p.*,
    lag(p.sold) over w as prev_sold,
    lag(p.d)    over w as prev_d
  from per_item p
  window w as (partition by p.shop_id, p.item_id order by p.d)
),
delta as (
  select
    l.*,
    case
      when l.prev_sold is null then 0
      when l.sold <= l.prev_sold then 0
      else least(l.sold - l.prev_sold,
                 500 * greatest(1, (l.d - l.prev_d)))
    end::bigint as sold_delta,
    greatest(1, coalesce(l.d - l.prev_d, 1))::int as span_days
  from lagged l
)
select
  shop_id,
  d,
  mode() within group (order by store_name)                    as store_name,
  count(*)::int                                                as n_listings,
  avg(price)::numeric(18,2)                                    as avg_price,
  (percentile_cont(0.5) within group (order by price))::numeric(18,2)
                                                               as median_price,
  avg(rating)::numeric(4,2)                                    as avg_rating,
  sum(sold)::bigint                                            as total_sold_sum,
  sum(sold_delta)::bigint                                      as sold_delta,
  sum(sold_delta * coalesce(price, 0))::bigint                 as omset_delta,
  -- Sales-weighted mean gap back to the previous observation of these items.
  -- A bucket measured after a 21-day gap holds 21 days of sales, so the RPC
  -- needs the span to work out how much of it falls inside a 7-day window.
  greatest(1, round(
    sum(sold_delta::numeric * span_days)
    / nullif(sum(sold_delta), 0)
  ))::int                                                      as span_days,
  now()                                                        as refreshed_at
from delta
group by shop_id, d;

create unique index mv_shop_daily_pk on public.mv_shop_daily (shop_id, d);
create index        mv_shop_daily_d  on public.mv_shop_daily (d);

-- ── Window-overlap fraction ────────────────────────────────────────────────
-- A daily bucket measured on day `d` after a gap of `span` days represents
-- sales accumulated over (d - span, d]. This returns how much of that interval
-- lands inside the half-open window [w_from, w_to), as a 0..1 fraction, so a
-- caller can pro-rate the bucket instead of counting all of it or none of it.
create or replace function public._win_overlap(
  d date, span int, w_from date, w_to date
) returns numeric language sql immutable parallel safe as $$
  select case
    when coalesce(span, 1) <= 0 then 0::numeric
    else greatest(0, least(d, w_to) - greatest(d - coalesce(span, 1), w_from))::numeric
         / greatest(1, coalesce(span, 1))
  end;
$$;

-- ── The Robinhood screen ───────────────────────────────────────────────────
-- One call returns everything the table needs: per-row current + previous
-- window figures, a daily series for the sparkline, and the summed totals for
-- the stat strip.
--
-- n_days is load-bearing on the client: with only 1 snapshot in a window there
-- is no delta to show and no curve to draw, and most tracked keywords are in
-- exactly that state until the daily_custom scrape set has run for a while.
-- The client prints "Baru" rather than inventing a percentage.
create or replace function public.get_tracker_rollup(
  p_days  int  default 7,
  p_scope text default 'keyword'
)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me      uuid := auth.uid();
  v_days    int  := greatest(1, least(coalesce(p_days, 7), 30));
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
          select json_agg(json_build_object('d', s.d, 'units', s.sold_delta, 'omset', s.omset_delta)
                          order by s.d)
          from win s where s.keyword = t.keyword and s.is_cur and s.sold_delta > 0
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
          select json_agg(json_build_object('d', s.d, 'units', s.sold_delta, 'omset', s.omset_delta)
                          order by s.d)
          from win s where s.shop_id = t.shop_id and s.is_cur and s.sold_delta > 0
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
    'has_history', exists (
      select 1 from json_array_elements(coalesce(v_rows, '[]'::json)) r
      where (r->>'n_days')::int > 0
    ),
    'totals',      v_totals,
    'rows',        coalesce(v_rows, '[]'::json)
  );
end $$;

-- ── Refresh wiring ─────────────────────────────────────────────────────────
-- Appended after mv_shops so the panels are rebuilt by the same post-scrape
-- call everything else already uses.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '900s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
  refresh materialized view public.mv_keyword_daily;
  refresh materialized view public.mv_shop_daily;
  perform public.rebuild_keyword_subgroups();
end; $function$;

-- ── Grants ─────────────────────────────────────────────────────────────────
-- Revoke by name: default privileges on this box re-grant anon, so a bare
-- "revoke from public" leaves the function callable without a session.
revoke all on function public.get_tracker_rollup(int, text) from public, anon;
grant execute on function public.get_tracker_rollup(int, text) to authenticated;

-- The panels themselves carry no user data (they are whole-market aggregates),
-- and the typeahead reads product_types_v, so no table grants are added here.
revoke all on public.mv_keyword_daily from anon, authenticated;
revoke all on public.mv_shop_daily    from anon, authenticated;

commit;

notify pgrst, 'reload schema';
