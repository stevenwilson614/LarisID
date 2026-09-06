-- ============================================================================
-- admin_dashboard_kpis: track what the product actually tracks now.
--
-- Two changes, both consequences of the 2026-08-10 gpt-only cutover:
--
-- 1. KEYWORDS + TOKO were the live tracking model here. Superseded 2026-09-06
--    by Favorit Aku (`20260906123000_favorit_aku.sql`): user_tracked_products
--    is live again (product favorites, daily tracked_pass). KPI now exposes
--    favorited_products_distinct vs scraper_ceiling = 200. Do not treat this
--    table as an archive.
--
-- 2. DEEP DIVES now come from public.deepdive_opens rather than the
--    greatest(user_journey_stats, activity_events) reconciliation. That
--    reconciliation existed to paper over Site B under-counting in
--    journey_stats; deepdive_opens supersedes both and additionally counts
--    ANONYMOUS dives, which activity_events structurally cannot see (its logger
--    early-returns without a signed-in user). Expect the number to step up:
--    it is now measuring more, not measuring differently.
-- ============================================================================

create or replace function public.admin_dashboard_kpis()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result json;
begin
  if not public.is_platform_admin() then
    return '{}'::json;
  end if;

  with
  -- Archive: frozen since 2026-08-08, retained for history only.
  tracked_agg as (
    select count(*)::int as total from public.user_tracked_products
  ),
  tracked_daily as (
    select (tracked_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_products
    where tracked_at >= now() - interval '14 days'
    group by 1
  ),
  kw_agg as (
    select count(*)::int as total from public.user_tracked_keywords
  ),
  kw_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_keywords
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  store_agg as (
    select count(*)::int as total from public.user_tracked_stores
  ),
  store_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_stores
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  dd_agg as (
    select count(*)::int as total from public.deepdive_opens
  ),
  dd_daily as (
    select view_day as day, count(*)::int as n
    from public.deepdive_opens
    where view_day >= ((now() at time zone 'Asia/Jakarta')::date - 14)
    group by 1
  )
  select json_build_object(
    'tracked_total',   (select total from tracked_agg),
    'tracked_daily',   (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'keywords_total',  (select total from kw_agg),
    'keywords_daily',  (select coalesce(json_agg(row_to_json(k) order by k.day), '[]'::json) from kw_daily k),
    'stores_total',    (select total from store_agg),
    'stores_daily',    (select coalesce(json_agg(row_to_json(s) order by s.day), '[]'::json) from store_daily s),
    'deepdives_total', (select total from dd_agg),
    'deepdives_daily', (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;

notify pgrst, 'reload schema';
