-- ============================================================================
-- dir_hero_stats(): one round trip for the Cari Produk header carousel.
--
-- The hero needs three things that are all GROUP BY aggregates over the whole
-- of product_types_v (~69k rows): per-canonical-category weekly units, the
-- market-wide totals on the Insight slide, and the "most active categories"
-- ranking. PostgREST caps a table read at 1000 rows and truncates silently, so
-- doing this from the browser would quietly show a wrong (small) number rather
-- than fail. Hence one SECURITY DEFINER aggregate instead.
--
-- Grouping is on category_canonical, NOT listings.category. The raw scrape
-- vocabulary ("Body Care", "Perlengkapan Usaha", …) is a different list from
-- the canonical buckets the directory filters on, and a hero tile labelled
-- with the wrong vocabulary would filter to zero rows when clicked.
--
-- Weekly growth is wk_units / wk_base, the same pair the directory's own cards
-- use, so the hero and the grid can never disagree.
-- ============================================================================

create or replace function public.dir_hero_stats()
returns json
language sql
stable
security definer
set search_path = public
set statement_timeout to '15s'
as $$
  with cats as (
    select
      category_canonical                                as cat,
      coalesce(sum(wk_units), 0)::bigint                as units,
      coalesce(sum(wk_base), 0)::bigint                 as base,
      count(*)::int                                     as types
    from public.product_types_v
    where category_canonical is not null
      and category_canonical <> 'Lainnya'
    group by 1
  ),
  scored as (
    select
      cat, units, base, types,
      case when base > 0
        then round(100.0 * units / base, 1)
        else 0
      end::numeric as pct
    from cats
  ),
  totals as (
    select
      (select count(*) from public.product_types_v)::bigint            as types,
      (select coalesce(sum(wk_units), 0) from public.product_types_v)::bigint as wk_units,
      -- "naik signifikan" = a product type that moved at least 5% of its own
      -- installed base in the last weekly window. Relative, so a small niche
      -- can qualify; absolute unit counts would only ever surface Kecantikan.
      (select count(*) from public.product_types_v
        where wk_base > 0 and wk_units::numeric / wk_base >= 0.05)::bigint as risers,
      (select count(*) from public.mv_shops)::bigint                   as shops,
      (select max(refreshed_at) from public.product_types_v)           as refreshed_at
  )
  select json_build_object(
    'refreshed_at', (select refreshed_at from totals),
    'totals', (select json_build_object(
        'types', types, 'wk_units', wk_units, 'risers', risers, 'shops', shops
      ) from totals),
    -- Full canonical list, ordered by volume. The client picks its own top-N
    -- for the bar chart and re-sorts by pct for the "paling aktif" ranking,
    -- so a copy change never needs a migration.
    'cats', (
      select coalesce(json_agg(json_build_object(
        'cat', cat, 'units', units, 'base', base, 'types', types, 'pct', pct
      ) order by units desc), '[]'::json)
      from scored
    )
  );
$$;

comment on function public.dir_hero_stats() is
  'Aggregates behind the Cari Produk hero carousel. Anon-readable: it exposes only market-wide totals already visible in the directory grid.';

grant execute on function public.dir_hero_stats() to anon, authenticated;

notify pgrst, 'reload schema';
