-- Tighten shop heuristic: multi-token "* olshop" keywords are product markets
-- (plastik packing olshop, meja packing olshop), not shop names. Short
-- "brand olshop" (≤2 tokens) still counts as shop. Official-store rules unchanged.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261104210000_market_index_shop_heuristic.sql

begin;

create or replace function public.rebuild_market_index()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare v_n int;
begin
  insert into public.market_index as mi
    (keyword, kind, parent_keyword, brand, tokens, canonical, n_listings, omset_top15, source, updated_at)
  select
    p.keyword,
    case
      when p.keyword ~* '(official( store)?)$' then 'shop'
      when p.keyword ~* '\mofficial\M' then 'shop'
      when p.keyword ~* '\molshop\M'
           and cardinality(regexp_split_to_array(btrim(p.keyword), '\s+')) <= 2
        then 'shop'
      when exists (
        select 1 from public.market_brand_names b
         where b.brand = lower(p.keyword) or lower(p.keyword) = any(b.aliases)
      ) then 'brand'
      else 'product'
    end,
    null,
    (select b.brand from public.market_brand_names b
      where b.brand = lower(p.keyword) or lower(p.keyword) = any(b.aliases)
      limit 1),
    coalesce((
      select array_agg(distinct w)
        from regexp_split_to_table(lower(p.keyword), '[^a-z0-9]+') w
       where length(w) >= 2
    ), '{}'),
    p.category_canonical,
    p.n_listings,
    p.omset_top15,
    'rule',
    now()
  from public.product_types_v p
  where p.city = 'ALL'
  on conflict (keyword) do update set
    tokens = excluded.tokens,
    canonical = excluded.canonical,
    n_listings = excluded.n_listings,
    omset_top15 = excluded.omset_top15,
    updated_at = now(),
    kind = case when mi.source in ('ai', 'manual') then mi.kind else excluded.kind end,
    brand = case when mi.source in ('ai', 'manual') then mi.brand else excluded.brand end,
    parent_keyword = case when mi.source in ('ai', 'manual') then mi.parent_keyword else mi.parent_keyword end;

  update public.market_index mi
     set kind = coalesce(o.kind, mi.kind),
         parent_keyword = coalesce(o.parent_keyword, mi.parent_keyword),
         brand = coalesce(o.brand, mi.brand),
         aliases = coalesce(o.aliases, mi.aliases),
         source = 'manual',
         updated_at = now()
    from public.market_index_overrides o
   where o.keyword = mi.keyword;

  select count(*) into v_n from public.market_index;
  return v_n;
end $$;

-- One-shot: flip existing false shops that the old olshop$ rule caught.
update public.market_index
   set kind = 'product',
       parent_keyword = null,
       updated_at = now()
 where kind = 'shop'
   and source = 'rule'
   and keyword ~* '\molshop\M'
   and keyword !~* 'official'
   and cardinality(regexp_split_to_array(btrim(keyword), '\s+')) > 2;

revoke all on function public.rebuild_market_index() from public, anon, authenticated;

commit;
