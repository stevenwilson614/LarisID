-- Balanced listing pool for a set of keywords (Cari Produk category / home).
-- listings_deduped is keyed (item_id, shop_id, keyword); a raw .in().limit(300)
-- is dominated by one keyword. This takes the top N per keyword.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260905180000_listings_for_keywords.sql

create or replace function public.listings_for_keywords(
  p_keywords text[],
  p_per_kw int default 20,
  p_max int default 300
)
returns setof public.listings_deduped
language sql
stable
security invoker
set search_path = public
as $$
  select (x.row).*
  from (
    select l as row,
           row_number() over (
             partition by btrim(l.keyword)
             order by l.total_sold desc nulls last
           ) as rn
    from public.listings_deduped l
    where btrim(l.keyword) = any (
      select btrim(k) from unnest(coalesce(p_keywords, '{}'::text[])) as k
      where btrim(k) <> ''
    )
      and not l.is_offtopic
      and coalesce(l.total_sold, 0) > 0
  ) x
  where x.rn <= greatest(1, least(coalesce(p_per_kw, 20), 80))
  order by (x.row).total_sold desc nulls last
  limit greatest(1, least(coalesce(p_max, 300), 400));
$$;

comment on function public.listings_for_keywords(text[], int, int) is
  'Top p_per_kw on-topic sold listings per keyword, capped at p_max. '
  'Used by Cari Produk category/home listing rows.';

revoke all on function public.listings_for_keywords(text[], int, int) from public;
grant execute on function public.listings_for_keywords(text[], int, int) to anon, authenticated;

notify pgrst, 'reload schema';
