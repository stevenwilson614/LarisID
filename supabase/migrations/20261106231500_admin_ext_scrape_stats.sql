-- Admin: Chrome extension capture totals.
-- Deep-detail passes = rows the extension sent to ext_detail_ingest.
-- Products = distinct item_id the extension sent, from search/PDP cards
-- (ext_listing_ingest) or a detail pass. Windows are rolling on received_at.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261106231500_admin_ext_scrape_stats.sql

create or replace function public.admin_ext_scrape_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
set statement_timeout to '15s'
as $$
declare
  v json;
begin
  if not public.is_platform_admin() then
    return '{}'::json;
  end if;

  with hits as (
    select item_id, received_at
    from public.ext_listing_ingest
    union all
    select item_id, received_at
    from public.ext_detail_ingest
  ),
  products as (
    select
      count(distinct item_id)::bigint as total,
      count(distinct item_id) filter (
        where received_at >= now() - interval '7 days'
      )::bigint as d7,
      count(distinct item_id) filter (
        where received_at >= now() - interval '24 hours'
      )::bigint as h24
    from hits
  ),
  passes as (
    select
      count(*)::bigint as total,
      count(*) filter (
        where received_at >= now() - interval '7 days'
      )::bigint as d7,
      count(*) filter (
        where received_at >= now() - interval '24 hours'
      )::bigint as h24
    from public.ext_detail_ingest
  )
  select json_build_object(
    'ext_detail_passes_total', (select total from passes),
    'ext_detail_passes_7d',    (select d7 from passes),
    'ext_detail_passes_24h',   (select h24 from passes),
    'ext_products_total',      (select total from products),
    'ext_products_7d',         (select d7 from products),
    'ext_products_24h',        (select h24 from products)
  ) into v;

  return v;
end;
$$;

comment on function public.admin_ext_scrape_stats() is
  'Platform-admin counts for the Chrome extension. '
  'ext_detail_passes_* = ext_detail_ingest rows (each deep-detail capture). '
  'ext_products_* = distinct item_id from ext_listing_ingest or ext_detail_ingest. '
  '7d and 24h are rolling windows on received_at.';

revoke all on function public.admin_ext_scrape_stats() from public, anon;
grant execute on function public.admin_ext_scrape_stats() to authenticated;
