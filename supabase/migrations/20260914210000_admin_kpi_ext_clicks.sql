-- Admin KPI: Chrome Web Store "Pasang ekstensi" click-throughs.
-- Counted from client_events (anon + signed-in). activity_events alone would
-- miss everyone who clicks before / without login.

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
    select count(*)::int as total from public.user_tracked_products
  ),
  tracked_daily as (
    select (tracked_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_products
    where tracked_at >= now() - interval '14 days'
    group by 1
  ),
  downloads_agg as (
    select count(*)::int as total from public.export_jobs
  ),
  downloads_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.export_jobs
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
  ),
  ext_agg as (
    select count(*)::int as total
    from public.client_events
    where event = 'cws_ext_click'
  ),
  ext_daily as (
    select view_day as day, count(*)::int as n
    from public.client_events
    where event = 'cws_ext_click'
      and view_day >= ((now() at time zone 'Asia/Jakarta')::date - 14)
    group by 1
  )
  select json_build_object(
    'tracked_total',    (select total from tracked_agg),
    'tracked_daily',    (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'downloads_total',  (select total from downloads_agg),
    'downloads_daily',  (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from downloads_daily d),
    'stores_total',     (select total from store_agg),
    'stores_daily',     (select coalesce(json_agg(row_to_json(s) order by s.day), '[]'::json) from store_daily s),
    'deepdives_total',  (select total from dd_agg),
    'deepdives_daily',  (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d),
    'ext_clicks_total', (select total from ext_agg),
    'ext_clicks_daily', (select coalesce(json_agg(row_to_json(e) order by e.day), '[]'::json) from ext_daily e)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_dashboard_kpis() is
  'Admin KPI. downloads_total = export_jobs; tracked_total = Favorit Aku; '
  'ext_clicks_total = client_events cws_ext_click (Pasang ekstensi).';

revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;
