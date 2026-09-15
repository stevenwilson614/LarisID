-- Cari Produk was hitting anon's 3s statement_timeout on listings_for_keywords
-- (8+ keywords → HTTP 500). Cause: ORDER BY total_sold DESC NULLS LAST does
-- not match listings_deduped_kw_sold_ontopic_idx (keyword, total_sold DESC),
-- so Postgres bitmap-scanned every on-topic row for the keyword (~190) and
-- heap-sorted, instead of an index scan that stops at p_per_kw.
-- total_sold > 0 already excludes NULLs, so NULLS LAST is redundant.
--
-- Also slim the RPC projection (Cari Produk never reads est_*/kw_hits/…)
-- and add listings_home so the default Cari Produk page is one round-trip.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260915160000_listings_for_keywords_index_order.sql
-- Do not re-apply 20260905180000 or 20260912180000 after this.

begin;

drop function if exists public.listings_for_keywords(text[], integer, integer);

create function public.listings_for_keywords(
  p_keywords text[],
  p_per_kw int default 20,
  p_max int default 300
)
returns table (
  item_id bigint,
  shop_id bigint,
  product_name text,
  store_name text,
  price real,
  original_price real,
  total_sold integer,
  reviews integer,
  rating real,
  location text,
  image_url text,
  url text,
  keyword text,
  category text,
  listing_date timestamptz,
  nowcast_velocity_daily real,
  nowcast_omset_monthly bigint,
  nowcast_confidence text,
  nowcast_method text,
  is_ad smallint,
  search_rank integer,
  in_stock boolean,
  wishlist integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.item_id, l.shop_id, l.product_name, l.store_name, l.price, l.original_price,
    l.total_sold, l.reviews, l.rating, l.location, l.image_url, l.url,
    l.keyword, l.category, l.listing_date, l.nowcast_velocity_daily,
    l.nowcast_omset_monthly, l.nowcast_confidence, l.nowcast_method,
    l.is_ad, l.search_rank, l.in_stock, l.wishlist
  from (
    select distinct btrim(k) as kw
    from unnest(coalesce(p_keywords, '{}'::text[])) as k
    where btrim(k) <> ''
  ) k
  cross join lateral (
    select d.*
    from public.listings_deduped d
    where d.keyword = k.kw
      and not d.is_offtopic
      and d.total_sold > 0
    order by d.total_sold desc
    limit greatest(1, least(coalesce(p_per_kw, 20), 80))
  ) l
  order by l.total_sold desc
  limit greatest(1, least(coalesce(p_max, 300), 400));
$$;

comment on function public.listings_for_keywords(text[], int, int) is
  'Top p_per_kw on-topic sold listings per keyword, capped at p_max. '
  'LATERAL + exact keyword match. ORDER BY total_sold DESC (not NULLS LAST) '
  'so listings_deduped_kw_sold_ontopic_idx can stop at LIMIT. Slim columns.';

revoke all on function public.listings_for_keywords(text[], int, int) from public;
grant execute on function public.listings_for_keywords(text[], int, int) to anon, authenticated;

drop function if exists public.listings_home(integer);

create function public.listings_home(p_max int default 300)
returns table (
  item_id bigint,
  shop_id bigint,
  product_name text,
  store_name text,
  price real,
  original_price real,
  total_sold integer,
  reviews integer,
  rating real,
  location text,
  image_url text,
  url text,
  keyword text,
  category text,
  listing_date timestamptz,
  nowcast_velocity_daily real,
  nowcast_omset_monthly bigint,
  nowcast_confidence text,
  nowcast_method text,
  is_ad smallint,
  search_rank integer,
  in_stock boolean,
  wishlist integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.item_id, l.shop_id, l.product_name, l.store_name, l.price, l.original_price,
    l.total_sold, l.reviews, l.rating, l.location, l.image_url, l.url,
    l.keyword, l.category, l.listing_date, l.nowcast_velocity_daily,
    l.nowcast_omset_monthly, l.nowcast_confidence, l.nowcast_method,
    l.is_ad, l.search_rank, l.in_stock, l.wishlist
  from (
    select t.keyword
    from public.product_types_v t
    where t.city = 'ALL'
      and t.n_listings >= 3
      and t.wk_units >= 25
      and t.wk_items >= 2
      and t.wk_pct > 0
    order by t.wk_units desc
    limit 15
  ) k
  cross join lateral (
    select d.*
    from public.listings_deduped d
    where d.keyword = k.keyword
      and not d.is_offtopic
      and d.total_sold > 0
    order by d.total_sold desc
    limit 20
  ) l
  order by l.nowcast_omset_monthly desc nulls last, l.total_sold desc
  limit greatest(1, least(coalesce(p_max, 300), 400));
$$;

comment on function public.listings_home(int) is
  'Default Cari Produk pool: top 15 terlaris-minggu keywords × 20 listings. '
  'Same LATERAL index scan as listings_for_keywords. One round-trip.';

revoke all on function public.listings_home(int) from public;
grant execute on function public.listings_home(int) to anon, authenticated;

commit;

notify pgrst, 'reload schema';
