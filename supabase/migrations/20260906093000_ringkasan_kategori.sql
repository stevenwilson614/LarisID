-- ringkasan_kategori — top-N pasar per canonical category in one call.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260906093000_ringkasan_kategori.sql

begin;

create or replace function public.ringkasan_kategori(p_top int default 8)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      category_canonical,
      keyword,
      n_sellers,
      n_listings,
      omset_top15,
      wk_units,
      row_number() over (
        partition by category_canonical
        order by omset_top15 desc nulls last
      ) as rn
    from public.product_types_v
    where city = 'ALL'
      and category_canonical is not null
      and n_listings >= 3
  ),
  cats as (
    select
      category_canonical,
      count(*)::int as n_pasar,
      sum(omset_top15)::bigint as omset_top15_sum
    from ranked
    group by 1
    order by omset_top15_sum desc nulls last
    limit 18
  )
  select jsonb_build_object(
    'catatan', 'Snapshot Shopee Indonesia, sapuan 12–17 hari. Bukan agregat tahunan.',
    'kategori', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'kategori', c.category_canonical,
          'n_pasar', c.n_pasar,
          'omset_top15_sum', c.omset_top15_sum,
          'pasar', (
            select jsonb_agg(
              jsonb_build_object(
                'pasar', r.keyword,
                'seller', r.n_sellers,
                'listing', r.n_listings,
                'omset_top15_jt', round((coalesce(r.omset_top15, 0) / 1000000.0)::numeric, 1),
                'terjual_minggu', r.wk_units
              )
              order by r.omset_top15 desc nulls last
            )
            from ranked r
            where r.category_canonical = c.category_canonical
              and r.rn <= least(greatest(coalesce(p_top, 8), 3), 15)
          )
        )
        order by c.omset_top15_sum desc nulls last
      )
      from cats c
    ), '[]'::jsonb)
  );
$$;

comment on function public.ringkasan_kategori(int) is
  'Top-N pasar per canonical category for Laris AI. One round-trip; not a yearly GMV.';

grant execute on function public.ringkasan_kategori(int) to anon, authenticated;

commit;
