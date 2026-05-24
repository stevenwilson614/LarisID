-- RPC: fetch all products for a connected toko by shop_id from the latest scrape.
-- Used by My Toko to auto-populate product cards when the user hasn't manually tracked
-- any selling products yet.
create or replace function public.get_toko_listings(p_shop_id bigint)
returns table(
  item_id   bigint,
  product_name text,
  price     numeric,
  total_sold bigint,
  rating    numeric,
  reviews   bigint,
  image_url text,
  category  text,
  keyword   text
)
language sql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
  with latest as (
    select max(scraped_at) as ts
    from listings
    where shop_id = p_shop_id
  )
  select
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
  join latest on l.scraped_at = latest.ts
  where l.shop_id = p_shop_id
  order by l.total_sold desc
  limit 100;
$$;

revoke all on function public.get_toko_listings(bigint) from public;
grant execute on function public.get_toko_listings(bigint) to authenticated;
