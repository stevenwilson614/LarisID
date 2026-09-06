-- Held momentum: 3 real scrapes whose newest point is older than 21 days.
--
-- Fresh rows (S0 ≤ 21d) stay terukur. Older 3-snapshot rows keep the same
-- span-normalised % as an estimate of recent trend (momentum_source = held).
-- Do not invent peer/nowcast/forecast. Terlaris Minggu Ini stays fresh-only.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260906183000_listing_momentum_held.sql

set statement_timeout to '3600s';

begin;

drop view if exists public.product_types_v;
drop materialized view if exists public.mv_keyword_weekly;
drop materialized view if exists public.mv_listing_momentum;

create materialized view public.mv_listing_momentum as
with daily as (
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
  select item_id, shop_id, scraped_at, reviews,
         max(total_sold) over (
           partition by item_id, shop_id order by scraped_at
         ) as total_sold
  from daily
),
s0 as (
  -- Newest scrape in the 70-day window (was 21d). Held rows are labelled
  -- in the outer select; Trending Sekarang / keyword weekly stay fresh.
  select distinct on (item_id, shop_id)
         item_id, shop_id,
         scraped_at as at0,
         total_sold as sold0,
         reviews as rev0
  from mono
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
  (at0 >= now() - interval '21 days') as fresh,
  case
    when at0 >= now() - interval '21 days' then 'measured'
    else 'held'
  end as momentum_source,
  now() as computed_at
from calc;

create unique index mv_listing_momentum_pk
  on public.mv_listing_momentum (item_id, shop_id);

comment on materialized view public.mv_listing_momentum is
  'Measured 3-snapshot sales-rate momentum. S0 newest in 70d, S1 ≤ S0−7d, '
  'S2 ≤ S1−7d; each span 7–28 days. fresh/measured = S0 ≤ 21d (terukur). '
  'held = same % from older 3 scrapes (perkiraan of recent trend). '
  'Never peer/nowcast/forecast. belum: rate_prev < 1/day, d_now+d_prev < 10, '
  'or sold-flat + reviews up > 5.';

grant select on public.mv_listing_momentum to anon, authenticated;

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
        'fresh', m.fresh,
        'momentum_source', m.momentum_source,
        'cur_source', m.momentum_source,
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
  and m.fresh
group by l.keyword;

create unique index mv_keyword_weekly_kw_idx on public.mv_keyword_weekly (keyword);
create index mv_keyword_weekly_units_idx
  on public.mv_keyword_weekly (wk_units desc nulls last);

comment on materialized view public.mv_keyword_weekly is
  'Keyword 7-day-equivalent units from fresh (S0 ≤ 21d) 3-snapshot momentum. '
  'Held/stale listing % does not feed Terlaris Minggu Ini. '
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

commit;

notify pgrst, 'reload schema';
