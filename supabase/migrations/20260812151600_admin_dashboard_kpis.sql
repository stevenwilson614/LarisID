-- Compact KPI RPC for the admin dashboard mockup.
-- Tracked-product and deep-dive 7-day counts + daily sparkline series.
-- Totals for those metrics can also be summed from admin_user_directory();
-- this function exists because RLS blocks a direct client scan of the
-- underlying tables.

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
  tracked_agg as (
    select
      count(*)::int as total,
      count(*) filter (where tracked_at >= now() - interval '7 days')::int as last_7d
    from public.user_tracked_products
  ),
  tracked_daily as (
    select
      (tracked_at at time zone 'Asia/Jakarta')::date as day,
      count(*)::int as n
    from public.user_tracked_products
    where tracked_at >= now() - interval '14 days'
    group by 1
  ),
  dd_agg as (
    select
      count(*)::int as total,
      count(*) filter (where created_at >= now() - interval '7 days')::int as last_7d
    from public.activity_events
    where event_type = 'deepdive_open'
  ),
  dd_daily as (
    select
      (created_at at time zone 'Asia/Jakarta')::date as day,
      count(*)::int as n
    from public.activity_events
    where event_type = 'deepdive_open'
      and created_at >= now() - interval '14 days'
    group by 1
  )
  select json_build_object(
    'tracked_total',   (select total from tracked_agg),
    'tracked_7d',      (select last_7d from tracked_agg),
    'tracked_daily',   (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'deepdives_total', (select total from dd_agg),
    'deepdives_7d',    (select last_7d from dd_agg),
    'deepdives_daily', (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_kpis() from public;
grant execute on function public.admin_dashboard_kpis() to authenticated;
