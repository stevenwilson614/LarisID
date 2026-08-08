-- Pantau Toko category dropdown: today store selection is name-search only
-- (find_shops_by_name), so a seller who doesn't know a shop's exact name has
-- no way in. mv_shops (from 20260728120000) already carries a per-shop
-- `category` (mode of its listings' category), so a ranked by-category finder
-- is a small addition, not a new matview.

create or replace function public.find_shops_by_category(p_category text, p_limit int default 30)
returns table (
  shop_id     bigint,
  store_name  text,
  n_listings  int,
  total_sold  bigint,
  location    text,
  category    text
)
language sql stable security definer
set search_path = public
set statement_timeout = '10s'
as $$
  select s.shop_id, s.store_name, s.n_listings, s.total_sold, s.location, s.category
  from public.mv_shops s
  where p_category is not null and trim(p_category) <> ''
    and s.category = p_category
  order by s.total_sold desc, s.n_listings desc
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

grant execute on function public.find_shops_by_category(text, int) to authenticated;
