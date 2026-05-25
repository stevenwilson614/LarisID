-- Fix 1: find_shop_by_name — add search_path so listings table resolves correctly
-- Must drop first because return type changed
drop function if exists public.find_shop_by_name(text);
create function public.find_shop_by_name(p_store_name text)
returns table(shop_id bigint, store_name text, match_count bigint)
language sql stable security definer
set search_path = public
set statement_timeout = '10s'
as $$
  select shop_id, store_name, count(*) as match_count
  from listings
  where lower(store_name) = lower(trim(p_store_name))
  group by shop_id, store_name
  order by match_count desc
  limit 5;
$$;

-- Fix 2: get_competitive_position — percentile_cont cannot use OVER (),
-- move it to its own aggregate CTE; also add search_path
create or replace function public.get_competitive_position(
  p_keyword   text,
  p_shop_id   bigint,
  p_item_id   bigint
)
returns json
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_result json;
begin
  with latest_scrape as (
    select scraped_at
    from listings
    where lower(keyword) = lower(p_keyword)
    order by scraped_at desc
    limit 1
  ),
  market as (
    select
      item_id, shop_id, store_name, product_name,
      price, total_sold, rating, reviews,
      row_number() over (order by total_sold desc)   as rank,
      count(*)    over ()                            as total_sellers,
      sum(total_sold) over ()                        as market_total_sold,
      avg(price)  over ()                            as avg_price
    from listings l
    join latest_scrape s on l.scraped_at = s.scraped_at
    where lower(l.keyword) = lower(p_keyword)
  ),
  median_cte as (
    -- percentile_cont is an ordered-set aggregate, cannot be a window function
    select percentile_cont(0.5) within group (order by price) as median_price
    from market
  ),
  mine as (
    select * from market
    where shop_id = p_shop_id
    limit 1
  ),
  top3 as (
    select avg(reviews) as top3_reviews, avg(price) as top3_price
    from market where rank <= 3
  )
  select json_build_object(
    'found',         (select count(*) > 0 from mine),
    'my_rank',       (select rank from mine),
    'total_sellers', (select total_sellers from market limit 1),
    'my_sold',       (select total_sold from mine),
    'market_total',  (select market_total_sold from market limit 1),
    'market_share',  round((select total_sold::numeric / nullif(market_total_sold, 0) * 100 from mine), 1),
    'my_price',      (select price from mine),
    'median_price',  round((select median_price from median_cte)::numeric, 0),
    'my_reviews',    (select reviews from mine),
    'top3_reviews',  round((select top3_reviews from top3)::numeric, 0),
    'top3_price',    round((select top3_price from top3)::numeric, 0),
    'my_name',       (select product_name from mine)
  ) into v_result;

  return v_result;
end;
$$;

-- Fix 3: get_toko_listings — use DISTINCT ON (item_id) within a 24-hour window
-- so all products scraped recently are included, not just the single latest timestamp
create or replace function public.get_toko_listings(p_shop_id bigint)
returns table(
  item_id      bigint,
  product_name text,
  price        numeric,
  total_sold   bigint,
  rating       numeric,
  reviews      bigint,
  image_url    text,
  category     text,
  keyword      text
)
language sql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
  with latest as (
    select max(scraped_at) as ts
    from listings
    where shop_id = p_shop_id
  ),
  deduped as (
    select distinct on (l.item_id)
      l.item_id,
      l.product_name::text,
      l.price,
      l.total_sold,
      l.rating,
      l.reviews,
      l.image_url::text,
      l.category::text,
      l.keyword::text
    from listings l
    cross join latest
    where l.shop_id = p_shop_id
      and l.scraped_at >= latest.ts - interval '24 hours'
    order by l.item_id, l.scraped_at desc
  )
  select * from deduped
  order by total_sold desc
  limit 200;
$$;

revoke all on function public.get_toko_listings(bigint) from public;
grant execute on function public.get_toko_listings(bigint) to authenticated;
