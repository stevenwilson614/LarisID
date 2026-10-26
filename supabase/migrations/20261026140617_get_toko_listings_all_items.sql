-- My Toko fallback: return every known item for the shop (latest row each),
-- not only those scraped in a 24h window. Keyword scrapes hit shops sparsely —
-- the 24h cut left sellers with 1 product while listings_deduped had many more.
-- Full toko coverage still comes from ext_shop_claim_snapshots (Mac scrape).

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
  select *
  from (
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
    where l.shop_id = p_shop_id
    order by l.item_id, l.scraped_at desc
  ) d
  order by total_sold desc nulls last
  limit 200;
$$;

revoke all on function public.get_toko_listings(bigint) from public;
grant execute on function public.get_toko_listings(bigint) to authenticated;
