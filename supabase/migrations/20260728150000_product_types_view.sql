-- product_types_v: mv_product_types + canonical category + subgroup.
--
-- Deliberately a VIEW over the existing matview rather than a rebuild of it.
-- mv_product_types is a 187-line definition with a hand-maintained city_map CTE;
-- regenerating it to bolt on two columns risks silently changing the aggregates.
-- keyword_subgroup already stores canonical + subgroup per keyword (one row per
-- keyword, indexed), so a join gives the same result with none of that risk.
--
-- Clients read THIS, not mv_product_types, whenever they need category chips.
-- Filtering .eq('category_canonical', ...) pushes down to
-- keyword_subgroup_canon_idx; .eq('city', ...) still uses the matview indexes.

create or replace view public.product_types_v as
select
  pt.*,
  coalesce(ks.canonical, 'Lainnya') as category_canonical,
  coalesce(ks.subgroup,  'Lainnya') as subgroup
from public.mv_product_types pt
left join public.keyword_subgroup ks on ks.keyword = pt.keyword;

grant select on public.product_types_v to anon, authenticated;

-- Keep subgroups in step with the data: rebuilt as part of the standard
-- post-scrape refresh, after listings_deduped so it sees the new keywords.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '900s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
  perform public.rebuild_keyword_subgroups();
end; $function$;
