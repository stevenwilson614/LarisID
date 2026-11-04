-- Fuzzy parent lookup for classify-market-index (edge + local script).
-- Returns the closest product market for an AI parent hint.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261104211500_match_market_parent.sql

begin;

create or replace function public.match_market_parent(p_hint text)
returns table (keyword text, sim real, n_listings int)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with h as (
    select lower(btrim(coalesce(p_hint, ''))) as hint
  )
  select mi.keyword,
         extensions.similarity(mi.keyword, h.hint)::real as sim,
         coalesce(mi.n_listings, 0)::int as n_listings
    from public.market_index mi, h
   where mi.kind = 'product'
     and h.hint <> ''
     and (
       mi.keyword = h.hint
       or extensions.similarity(mi.keyword, h.hint) >= 0.35
     )
   order by (mi.keyword = h.hint) desc,
            extensions.similarity(mi.keyword, h.hint) desc,
            coalesce(mi.n_listings, 0) desc
   limit 1;
$$;

revoke all on function public.match_market_parent(text) from public, anon;
grant execute on function public.match_market_parent(text) to service_role, authenticated;

commit;
