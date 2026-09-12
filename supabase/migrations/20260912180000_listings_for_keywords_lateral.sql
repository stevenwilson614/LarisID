-- Sync repo with the live Contabo body of listings_for_keywords.
-- The original 20260905180000 used btrim(l.keyword) in WHERE (seq scan).
-- Live already uses LATERAL + exact d.keyword = k.kw so the btree
-- listings_deduped_kw_sold_ontopic_idx can be used. This file makes
-- re-apply idempotent. Measured ~0.45s for 15 keywords × 20 rows.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260912180000_listings_for_keywords_lateral.sql

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
  select l.*
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
    order by d.total_sold desc nulls last
    limit greatest(1, least(coalesce(p_per_kw, 20), 80))
  ) l
  order by l.total_sold desc nulls last
  limit greatest(1, least(coalesce(p_max, 300), 400));
$$;

comment on function public.listings_for_keywords(text[], int, int) is
  'Top p_per_kw on-topic sold listings per keyword, capped at p_max. '
  'LATERAL + exact keyword match — do not wrap listings_deduped.keyword in btrim().';

revoke all on function public.listings_for_keywords(text[], int, int) from public;
grant execute on function public.listings_for_keywords(text[], int, int) to anon, authenticated;

notify pgrst, 'reload schema';
