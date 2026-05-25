create or replace function public.get_similar_competitors(
  p_keyword   text,
  p_category  text,
  p_shop_id   bigint,
  p_limit     int default 15
)
returns table(
  comp_rank    bigint,
  store_name   text,
  product_name text,
  price        numeric,
  total_sold   bigint,
  reviews      bigint,
  est_omset    numeric,
  item_id      bigint,
  shop_id      bigint,
  image_url    text
)
language sql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
  with latest_scrape as (
    select max(scraped_at) as max_ts
    from listings
    where keyword = p_keyword
  ),
  candidates as (
    select distinct on (l.shop_id)
      l.store_name,
      l.product_name,
      l.price,
      l.total_sold,
      l.reviews,
      l.item_id,
      l.shop_id,
      l.image_url,
      round((l.price * l.total_sold / 6.0)::numeric, 0) as est_omset
    from listings l
    cross join latest_scrape ls
    where l.scraped_at >= ls.max_ts - interval '2 hours'
      and (l.keyword = p_keyword or l.category = p_category)
      and l.shop_id != p_shop_id
    order by l.shop_id, l.total_sold desc
  ),
  ranked as (
    select
      row_number() over (order by total_sold desc)::bigint as comp_rank,
      store_name,
      product_name,
      price,
      total_sold,
      reviews,
      est_omset,
      item_id,
      shop_id,
      image_url
    from candidates
  )
  select * from ranked
  limit p_limit;
$$;

revoke all on function public.get_similar_competitors(text, text, bigint, int) from public;
grant execute on function public.get_similar_competitors(text, text, bigint, int) to authenticated;
