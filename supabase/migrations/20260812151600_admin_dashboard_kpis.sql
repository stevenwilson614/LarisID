-- Compact KPI RPC for the admin dashboard.
-- All-time tracked-product and deep-dive totals + daily sparkline series.
-- Totals could also be summed from admin_user_directory(); this function
-- exists because RLS blocks a direct client scan of the underlying tables.

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
    select count(*)::int as total
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
  -- Mirrors admin_user_directory()'s per-user deepdive_count so the headline
  -- matches the Daftar Pengguna column: journey_stats under-counted Site B,
  -- so whichever source is higher wins per user.
  dd_agg as (
    select coalesce(sum(greatest(
      coalesce(js.deepdive_count, 0),
      coalesce(ev.cnt, 0)
    )), 0)::int as total
    from auth.users u
    left join public.user_journey_stats js on js.user_id = u.id
    left join (
      select e.user_id, count(*)::int as cnt
      from public.activity_events e
      where e.event_type = 'deepdive_open'
      group by e.user_id
    ) ev on ev.user_id = u.id
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
    'tracked_daily',   (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'deepdives_total', (select total from dd_agg),
    'deepdives_daily', (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_dashboard_kpis() from public;
grant execute on function public.admin_dashboard_kpis() to authenticated;
