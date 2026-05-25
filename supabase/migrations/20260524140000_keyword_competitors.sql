-- RPC: return top competitors for a given keyword, excluding the user's own shop.
-- Used by My Toko → Competition section.
create or replace function public.get_keyword_competitors(
  p_keyword  text,
  p_shop_id  bigint,
  p_limit    int default 5
)
returns table(
  comp_rank    bigint,
  store_name   text,
  product_name text,
  price        numeric,
  total_sold   bigint,
  reviews      bigint,
  item_id      bigint,
  shop_id      bigint,
  image_url    text
)
language sql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
  with latest_scrape as (
    select scraped_at
    from listings
    where lower(keyword) = lower(trim(p_keyword))
    order by scraped_at desc
    limit 1
  ),
  ranked as (
    select
      l.store_name::text,
      l.product_name::text,
      l.price,
      l.total_sold,
      l.reviews,
      l.item_id,
      l.shop_id,
      l.image_url::text,
      row_number() over (order by l.total_sold desc) as comp_rank
    from listings l
    join latest_scrape s on l.scraped_at = s.scraped_at
    where lower(l.keyword) = lower(trim(p_keyword))
  )
  select comp_rank, store_name, product_name, price, total_sold, reviews, item_id, shop_id, image_url
  from ranked
  where shop_id != p_shop_id
  order by comp_rank
  limit p_limit;
$$;

revoke all on function public.get_keyword_competitors(text, bigint, int) from public;
grant execute on function public.get_keyword_competitors(text, bigint, int) to authenticated;
