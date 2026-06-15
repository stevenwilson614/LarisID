-- find_shop_by_name: trim scraped store_name so padded listings match user input.
-- ~900 shops were stored with trailing spaces (e.g. "KEEONE Official Store ").

drop function if exists public.find_shop_by_name(text);
create function public.find_shop_by_name(p_store_name text)
returns table(shop_id bigint, store_name text, match_count bigint)
language sql stable security definer
set search_path = public
set statement_timeout = '10s'
as $$
  select shop_id, trim(store_name) as store_name, count(*) as match_count
  from listings
  where lower(trim(store_name)) = lower(trim(p_store_name))
  group by shop_id, trim(store_name)
  order by match_count desc
  limit 5;
$$;

create index if not exists idx_listings_store_name_trim_lower
  on public.listings (lower(trim(store_name)));

grant execute on function public.find_shop_by_name(text) to authenticated;
