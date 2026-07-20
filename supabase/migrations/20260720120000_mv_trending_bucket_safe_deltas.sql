-- Cap mv_trending deltas so Shopee display-bucket floor jumps
-- are not treated as real weekly sales. Prefer review-implied units
-- when the raw sold jump is absurd; hard-cap at ~500 units/day.

create or replace function public._lid_corr_sold_delta(
  s1 integer, s0 integer, r1 integer, r0 integer, days integer
) returns integer
language sql
immutable
as $$
  select case
    when s0 is null or s1 is null then 0
    when s1 = s0 then
      least(
        greatest(0, round((coalesce(r1,0) - coalesce(r0,0)) * 3.2))::integer,
        500 * greatest(days, 1)
      )
    when (s1 - s0) > (500 * greatest(days, 1))
      or (s0 > 0 and s1::float / s0 >= 3 and (s1 - s0) >= 10000)
      or (s1 >= 10000 and s0 < 10000) then
      -- bucket / glitch jump: prefer review est, hard-cap at 500/day
      least(
        greatest(0, s1 - s0),
        case
          when (coalesce(r1,0) - coalesce(r0,0)) > 0
            then round((coalesce(r1,0) - coalesce(r0,0)) * 3.2)::integer
          else 500 * greatest(days, 1)
        end,
        500 * greatest(days, 1)
      )
    else greatest(0, s1 - s0)
  end
$$;

drop materialized view if exists public.mv_trending;

create materialized view public.mv_trending as
with anchor as (
  select max(scraped_at) as t0 from public.listings
),
snap as (
  select l.item_id, l.shop_id,
         (array_agg(l.total_sold order by l.scraped_at desc))[1] as s0,
         (array_agg(l.reviews   order by l.scraped_at desc))[1] as r0,
         max(l.scraped_at) as last_at,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '7 days')  as s7,
         max(l.reviews)    filter (where l.scraped_at <= a.t0 - interval '7 days')  as r7,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '14 days') as s14,
         max(l.reviews)    filter (where l.scraped_at <= a.t0 - interval '14 days') as r14,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '28 days') as s28,
         max(l.reviews)    filter (where l.scraped_at <= a.t0 - interval '28 days') as r28
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '45 days'
    and l.price between 1000 and 50000000
    and l.product_name is not null
    and l.item_id is not null
    and l.total_sold is not null
  group by l.item_id, l.shop_id
  having max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '7 days') is not null
),
corr as (
  select s.*,
         public._lid_corr_sold_delta(s.s0, s.s7, s.r0, s.r7, 7) as d7,
         public._lid_corr_sold_delta(s.s7, s.s14, s.r7, s.r14, 7) as d_prev7,
         public._lid_corr_sold_delta(s.s0, s.s14, s.r0, s.r14, 14) as d14,
         public._lid_corr_sold_delta(coalesce(s.s14, s.s7), s.s28, coalesce(s.r14, s.r7), s.r28, 14) as d_prev14
  from snap s
),
latest as (
  select distinct on (item_id, shop_id)
         item_id, shop_id, store_name, product_name, category, keyword,
         price, total_sold, reviews, rating, location, image_url, url,
         listing_date
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '10 days'
    and l.product_name is not null
    and l.item_id is not null
    and l.total_sold is not null
  order by item_id, shop_id, scraped_at desc
)
select l.*,
       c.d7                                         as delta_7d,
       c.d_prev7                                    as delta_prev_7d,
       c.d14                                        as delta_14d,
       c.d_prev14                                   as delta_prev_14d,
       greatest(0, c.d7 + c.d_prev7 + c.d_prev14)   as delta_30d,
       (select t0 from anchor)                      as anchor_at,
       now()                                        as refreshed_at
from latest l
join corr c using (item_id, shop_id)
where c.d7 > 0
order by c.d7 desc
limit 500;

create unique index mv_trending_item_idx on public.mv_trending (item_id, shop_id);
create index mv_trending_cat_idx on public.mv_trending (category);

grant select on public.mv_trending to anon, authenticated;
grant execute on function public._lid_corr_sold_delta(integer, integer, integer, integer, integer) to anon, authenticated;
