-- Measured listing momentum (3 real snapshots) + honest week-over-week %.
--
-- Replaces model-vs-model wkPct (nowcast/peer/forecast compared to itself)
-- with sold-count rate_now vs rate_prev from the same (item_id, shop_id).
-- Also stops _lid_corr_sold_delta from clamping exact counters at 500/day.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260906150000_listing_momentum_measured.sql
-- Then:  SELECT refresh_breakout_matviews();   -- picks up new corr in mv_trending

set statement_timeout to '3600s';

-- ---------------------------------------------------------------------------
-- 1. Bucket-only sold correction (exact counters keep the raw delta)
-- ---------------------------------------------------------------------------
-- A value "looks bucketed" when it is a round thousand ≥ 1000, or the pair
-- crosses the 10rb display floor from a round value. Exact counters
-- (206184 → 199471) must never hit the 500/day cap or reviews×3.2 substitute.
create or replace function public._lid_corr_sold_delta(
  s1 integer, s0 integer, r1 integer, r0 integer, days integer
) returns integer
language sql
immutable
as $$
  select case
    when s0 is null or s1 is null then 0
    when s1 = s0 then
      case
        when s1 >= 1000 and mod(s1, 1000) = 0 then
          least(
            greatest(0, round((coalesce(r1, 0) - coalesce(r0, 0)) * 3.2))::integer,
            500 * greatest(days, 1)
          )
        else 0
      end
    when (
          (s0 >= 1000 and mod(s0, 1000) = 0)
       or (s1 >= 1000 and mod(s1, 1000) = 0)
       or (s1 >= 10000 and s0 < 10000
           and (mod(s0, 1000) = 0 or mod(s1, 1000) = 0))
        )
     and (
          (s1 - s0) > (500 * greatest(days, 1))
       or (s0 > 0 and s1::float / s0 >= 3 and (s1 - s0) >= 10000)
       or (s1 >= 10000 and s0 < 10000)
        )
    then
      least(
        greatest(0, s1 - s0),
        case
          when (coalesce(r1, 0) - coalesce(r0, 0)) > 0
            then round((coalesce(r1, 0) - coalesce(r0, 0)) * 3.2)::integer
          else 500 * greatest(days, 1)
        end,
        500 * greatest(days, 1)
      )
    else greatest(0, s1 - s0)
  end
$$;

comment on function public._lid_corr_sold_delta(integer, integer, integer, integer, integer) is
  'Correct Shopee display-bucket jumps only. Exact sold counters keep '
  'greatest(0, s1-s0). Never apply the 500/day cap to a non-round counter.';

-- ---------------------------------------------------------------------------
-- 2. mv_listing_momentum — 3-snapshot measured rate vs previous rate
-- ---------------------------------------------------------------------------
drop view if exists public.product_types_v;
drop materialized view if exists public.mv_keyword_weekly;
drop materialized view if exists public.mv_listing_momentum;

create materialized view public.mv_listing_momentum as
with daily as (
  -- One reading per listing-day: highest sold wins, so a later lower scrape
  -- of the same day (different keyword slot) cannot mint a fake surge.
  select distinct on (l.item_id, l.shop_id, (l.scraped_at at time zone 'Asia/Jakarta')::date)
         l.item_id, l.shop_id, l.scraped_at, l.total_sold, l.reviews
  from public.listings l
  where l.scraped_at >= now() - interval '70 days'
    and l.item_id is not null
    and l.shop_id is not null
    and l.total_sold is not null
  order by l.item_id, l.shop_id,
           (l.scraped_at at time zone 'Asia/Jakarta')::date desc,
           l.total_sold desc, l.scraped_at desc
),
mono as (
  -- Lifetime sold cannot fall. A later lower scrape is slot noise, not a crash.
  select item_id, shop_id, scraped_at, reviews,
         max(total_sold) over (
           partition by item_id, shop_id order by scraped_at
         ) as total_sold
  from daily
),
s0 as (
  select distinct on (item_id, shop_id)
         item_id, shop_id,
         scraped_at as at0,
         total_sold as sold0,
         reviews as rev0
  from mono
  where scraped_at >= now() - interval '21 days'
  order by item_id, shop_id, scraped_at desc
),
s1 as (
  select distinct on (a.item_id, a.shop_id)
         a.item_id, a.shop_id, a.at0, a.sold0, a.rev0,
         b.scraped_at as at1,
         b.total_sold as sold1,
         b.reviews as rev1
  from s0 a
  join mono b
    on b.item_id = a.item_id
   and b.shop_id = a.shop_id
   and b.scraped_at <= a.at0 - interval '7 days'
  order by a.item_id, a.shop_id, b.scraped_at desc
),
s2 as (
  select distinct on (a.item_id, a.shop_id)
         a.item_id, a.shop_id, a.at0, a.sold0, a.rev0, a.at1, a.sold1, a.rev1,
         b.scraped_at as at2,
         b.total_sold as sold2,
         b.reviews as rev2
  from s1 a
  join mono b
    on b.item_id = a.item_id
   and b.shop_id = a.shop_id
   and b.scraped_at <= a.at1 - interval '7 days'
  order by a.item_id, a.shop_id, b.scraped_at desc
),
calc as (
  select
    s2.*,
    (extract(epoch from (s2.at0 - s2.at1)) / 86400.0) as span_now,
    (extract(epoch from (s2.at1 - s2.at2)) / 86400.0) as span_prev,
    public._lid_corr_sold_delta(
      s2.sold0, s2.sold1, s2.rev0, s2.rev1,
      ceil(extract(epoch from (s2.at0 - s2.at1)) / 86400.0)::int
    ) as units_now,
    public._lid_corr_sold_delta(
      s2.sold1, s2.sold2, s2.rev1, s2.rev2,
      ceil(extract(epoch from (s2.at1 - s2.at2)) / 86400.0)::int
    ) as units_prev,
    (s2.sold0 = s2.sold1 and (coalesce(s2.rev0, 0) - coalesce(s2.rev1, 0)) > 5)
      as reviews_flag
  from s2
  where (extract(epoch from (s2.at0 - s2.at1)) / 86400.0) between 7 and 28
    and (extract(epoch from (s2.at1 - s2.at2)) / 86400.0) between 7 and 28
)
select
  item_id,
  shop_id,
  at0,
  at1,
  at2,
  span_now::real,
  span_prev::real,
  units_now,
  units_prev,
  (units_now / span_now)::real as rate_now,
  (units_prev / span_prev)::real as rate_prev,
  (units_now / span_now * 7)::real as units_now_wk,
  (units_prev / span_prev * 7)::real as units_prev_wk,
  greatest(-100, least(300,
    (units_now / span_now - units_prev / span_prev)
    / greatest(units_prev / span_prev, 0.001) * 100
  ))::real as momentum_pct,
  case
    when (units_prev / span_prev) < 1
      or (units_now + units_prev) < 10
      or reviews_flag
      then 'belum'
    when (units_now / span_now - units_prev / span_prev)
         / greatest(units_prev / span_prev, 0.001) * 100 >= 20
      then 'naik'
    when (units_now / span_now - units_prev / span_prev)
         / greatest(units_prev / span_prev, 0.001) * 100 <= -20
      then 'turun'
    else 'stabil'
  end as momentum_class,
  reviews_flag,
  now() as computed_at
from calc;

create unique index mv_listing_momentum_pk
  on public.mv_listing_momentum (item_id, shop_id);

comment on materialized view public.mv_listing_momentum is
  'Measured 3-snapshot sales-rate momentum. S0 newest (≤21d), S1 ≤ S0−7d, '
  'S2 ≤ S1−7d; each span 7–28 days. Daily peak sold, then running-max so a '
  'counter rollback cannot mint a surge. Never uses peer/nowcast/forecast. '
  'belum: rate_prev < 1/day, d_now+d_prev < 10, or sold-flat + reviews up > 5.';

grant select on public.mv_listing_momentum to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. peta_batch — momentum payload now carries measured windows
-- ---------------------------------------------------------------------------
create or replace function public.peta_batch(p_keys jsonb, p_weeks int default 8)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  n int;
  weeks_n int := greatest(least(coalesce(p_weeks, 8), 12), 1);
  out_json jsonb;
begin
  if p_keys is null or jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'p_keys must be a JSON array' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_keys);
  if n > 200 then
    raise exception 'p_keys max 200, got %', n using errcode = '22023';
  end if;
  if n = 0 then
    return jsonb_build_object(
      'momentum', '[]'::jsonb,
      'positions', '[]'::jsonb,
      'weeks', '[]'::jsonb,
      'scrapes', '[]'::jsonb
    );
  end if;

  with keys as (
    select distinct (e->>'item_id')::bigint as item_id,
                    (e->>'shop_id')::bigint as shop_id
    from jsonb_array_elements(p_keys) e
    where e->>'item_id' is not null and e->>'shop_id' is not null
  )
  select jsonb_build_object(
    'momentum', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', m.item_id,
        'shop_id', m.shop_id,
        'units_now_wk', m.units_now_wk,
        'units_prev_wk', m.units_prev_wk,
        'units_cur', m.units_now_wk,
        'units_prev', m.units_prev_wk,
        'span_now', m.span_now,
        'span_prev', m.span_prev,
        'at0', m.at0,
        'at1', m.at1,
        'at2', m.at2,
        'momentum_pct', m.momentum_pct,
        'momentum_class', m.momentum_class,
        'cur_source', 'measured',
        'prev_source', 'measured',
        'reviews_flag', m.reviews_flag
      ))
      from mv_listing_momentum m
      join keys k on k.item_id = m.item_id and k.shop_id = m.shop_id
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', p.item_id,
        'shop_id', p.shop_id,
        'week_start', p.week_start,
        'units_wk', p.units_wk,
        'omset_wk', p.omset_wk,
        'source', p.source,
        'reviews', p.reviews,
        'price', p.price,
        'reviews_source', p.reviews_source
      ) order by p.week_start, p.item_id)
      from mv_listing_week_positions p
      join keys k on k.item_id = p.item_id and k.shop_id = p.shop_id
      where p.week_start >= listing_week_start(current_date) - ((weeks_n - 1) * 7)
    ), '[]'::jsonb),
    'weeks', (
      select coalesce(jsonb_agg(ws order by ws), '[]'::jsonb)
      from (
        select listing_week_start(current_date) - (g * 7) as ws
        from generate_series(weeks_n - 1, 0, -1) g
      ) s
    ),
    'scrapes', coalesce((
      select jsonb_agg(d order by d)
      from (
        select distinct l.scraped_at::date as d
        from listings l
        join keys k on k.item_id = l.item_id and k.shop_id = l.shop_id
        where l.scraped_at >= (listing_week_start(current_date) - ((weeks_n - 1) * 7))::timestamptz
        order by 1
        limit 24
      ) s
    ), '[]'::jsonb)
  ) into out_json;

  return out_json;
end;
$$;

grant execute on function public.peta_batch(jsonb, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. mv_keyword_weekly — add wk_units_prev / wk_items_prev from momentum
-- ---------------------------------------------------------------------------
-- Both windows use the same listing set (non-belum 3-snapshot rows) so the
-- card % is (this window) vs (previous window), not vs lifetime sales.
drop view if exists public.product_types_v;
drop materialized view if exists public.mv_keyword_weekly;

create materialized view public.mv_keyword_weekly as
with anchor as (
  select max(scraped_at) as t0 from public.listings
),
latest as (
  select distinct on (l.item_id, l.shop_id)
         l.item_id, l.shop_id, btrim(l.keyword) as keyword, l.total_sold
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '10 days'
    and l.product_name is not null
    and l.item_id is not null
    and l.total_sold is not null
    and l.keyword is not null
    and btrim(l.keyword) <> ''
  order by l.item_id, l.shop_id, l.scraped_at desc
)
select
  l.keyword,
  round(sum(m.units_now_wk))::bigint                         as wk_units,
  sum(greatest(0, l.total_sold - m.units_now))::bigint       as wk_base,
  count(*) filter (where m.units_now > 0)::int               as wk_items,
  round(percentile_cont(0.5) within group (order by m.span_now))::int
                                                             as wk_span_days,
  (select t0 from anchor)                                    as wk_anchor_at,
  now()                                                      as refreshed_at,
  round(sum(m.units_prev_wk))::bigint                        as wk_units_prev,
  count(*) filter (where m.units_prev > 0)::int              as wk_items_prev
from latest l
join public.mv_listing_momentum m using (item_id, shop_id)
where m.momentum_class is distinct from 'belum'
group by l.keyword;

create unique index mv_keyword_weekly_kw_idx on public.mv_keyword_weekly (keyword);
create index mv_keyword_weekly_units_idx
  on public.mv_keyword_weekly (wk_units desc nulls last);

comment on materialized view public.mv_keyword_weekly is
  'Keyword 7-day-equivalent units from measured 3-snapshot momentum. '
  'wk_units / wk_units_prev are the same listing set (non-belum). '
  'Missing row = never measured; do not render as 0 sold.';

grant select on public.mv_keyword_weekly to anon, authenticated;

create view public.product_types_v as
select
  pt.*,
  coalesce(ks.canonical, 'Lainnya') as category_canonical,
  coalesce(ks.subgroup,  'Lainnya') as subgroup,
  kw.wk_units,
  kw.wk_base,
  kw.wk_items,
  kw.wk_span_days,
  kw.wk_anchor_at,
  kw.wk_units_prev,
  kw.wk_items_prev
from public.mv_product_types pt
left join public.keyword_subgroup ks on ks.keyword = pt.keyword
left join public.mv_keyword_weekly kw on kw.keyword = pt.keyword;

grant select on public.product_types_v to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Refresh hooks — momentum rides listings push, not the velocity chain
-- ---------------------------------------------------------------------------
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '3600s'
as $$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_listing_momentum;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_keyword_weekly;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
  refresh materialized view public.mv_keyword_daily;
  refresh materialized view public.mv_shop_daily;
  refresh materialized view public.mv_shop_cohort;
  refresh materialized view public.mv_new_seller_market;
  refresh materialized view public.mv_new_shop_items;
  refresh materialized view public.mv_new_shop_traits;
  refresh materialized view public.mv_new_shop_pricemove;
  refresh materialized view public.mv_new_shop_speed;
  refresh materialized view public.mv_competitor_moves;
  refresh materialized view public.mv_seller_locations;
  perform public.rebuild_keyword_subgroups();
end;
$$;

create or replace procedure public.refresh_breakout_matviews_concurrent()
language plpgsql
security definer
set search_path = public
set statement_timeout = '3600s'
as $$
begin
  refresh materialized view concurrently public.listings_deduped;
  commit;
  refresh materialized view concurrently public.mv_listing_momentum;
  commit;
  refresh materialized view concurrently public.mv_niche_breakout;
  commit;
  refresh materialized view concurrently public.mv_region_category;
  commit;
  refresh materialized view concurrently public.mv_supplier_leaderboard;
  commit;
  refresh materialized view concurrently public.mv_naik_daun;
  commit;
  refresh materialized view concurrently public.mv_trending;
  commit;
  refresh materialized view concurrently public.mv_keyword_weekly;
  commit;
  refresh materialized view concurrently public.mv_product_types;
  commit;
  refresh materialized view concurrently public.mv_shops;
  commit;
  refresh materialized view concurrently public.mv_keyword_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_cohort;
  commit;
  refresh materialized view concurrently public.mv_new_seller_market;
  commit;
  refresh materialized view concurrently public.mv_new_shop_items;
  commit;
  refresh materialized view concurrently public.mv_new_shop_traits;
  commit;
  refresh materialized view concurrently public.mv_new_shop_pricemove;
  commit;
  refresh materialized view concurrently public.mv_new_shop_speed;
  commit;
  refresh materialized view concurrently public.mv_competitor_moves;
  commit;
  refresh materialized view concurrently public.mv_seller_locations;
  perform public.rebuild_keyword_subgroups();
end;
$$;

notify pgrst, 'reload schema';
