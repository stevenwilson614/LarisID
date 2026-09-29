-- Admin KPI: Kalkulator usage, product-export rows, Laris AI prompts,
-- and last-24h new vs returning people.
--
-- Kalk events live in client_events (anon + signed-in), same pattern as
-- cws_ext_click. Product rows come from export_jobs.rows_total (what went
-- into the file). AI prompts are ai_usage rows written by claude-proxy.
-- New vs returning is mutually exclusive: new = auth.users created in the
-- last 24h; returning = a session in the last 24h from an older account
-- (so a same-day refresh of a brand-new signup is not counted as a return).

create index if not exists ai_usage_created_idx
  on public.ai_usage (created_at);

create or replace function public.admin_dashboard_kpis()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
set statement_timeout to '30s'
as $$
declare
  v_result json;
  v_since date := ((now() at time zone 'Asia/Jakarta')::date - 14);
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
    select
      count(*)::int as files,
      coalesce(sum(rows_total), 0)::bigint as rows,
      count(*) filter (where created_at >= now() - interval '24 hours')::int as files_24h,
      coalesce(sum(rows_total) filter (where created_at >= now() - interval '24 hours'), 0)::bigint as rows_24h
    from public.export_jobs
  ),
  downloads_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.export_jobs
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  download_rows_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day,
           coalesce(sum(rows_total), 0)::int as n
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
    where view_day >= v_since
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
      and view_day >= v_since
    group by 1
  ),
  kalc_events as (
    select event, visitor_id, created_at, view_day
    from public.client_events
    where event in ('gpt_kalc_page_open', 'gpt_kalc_pdf', 'gpt_kalc_save_riwayat')
  ),
  kalc_agg as (
    select
      count(*) filter (where event = 'gpt_kalc_page_open')::int as opens,
      count(distinct visitor_id) filter (where event = 'gpt_kalc_page_open')::int as opens_unique,
      count(*) filter (where event = 'gpt_kalc_page_open'
                       and created_at >= now() - interval '24 hours')::int as opens_24h,
      count(*) filter (where event = 'gpt_kalc_pdf')::int as pdfs,
      count(*) filter (where event = 'gpt_kalc_pdf'
                       and created_at >= now() - interval '24 hours')::int as pdfs_24h,
      count(*) filter (where event = 'gpt_kalc_save_riwayat')::int as saves,
      count(*) filter (where event = 'gpt_kalc_save_riwayat'
                       and created_at >= now() - interval '24 hours')::int as saves_24h
    from kalc_events
  ),
  kalc_opens_daily as (
    select view_day as day, count(*)::int as n
    from kalc_events
    where event = 'gpt_kalc_page_open' and view_day >= v_since
    group by 1
  ),
  kalc_pdf_daily as (
    select view_day as day, count(*)::int as n
    from kalc_events
    where event = 'gpt_kalc_pdf' and view_day >= v_since
    group by 1
  ),
  kalc_saves_daily as (
    select view_day as day, count(*)::int as n
    from kalc_events
    where event = 'gpt_kalc_save_riwayat' and view_day >= v_since
    group by 1
  ),
  ai_agg as (
    select
      count(*)::int as total,
      count(*) filter (where created_at >= now() - interval '24 hours')::int as last_24h
    from public.ai_usage
  ),
  ai_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.ai_usage
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  new_24h as (
    select count(*)::int as n
    from auth.users
    where created_at >= now() - interval '24 hours'
      and not public.is_dapur_side_account(email::text)
  ),
  returning_24h as (
    select count(distinct s.user_id)::int as n
    from public.user_sessions s
    join auth.users u on u.id = s.user_id
    where s.signed_in_at >= now() - interval '24 hours'
      and u.created_at < now() - interval '24 hours'
      and not public.is_dapur_side_account(u.email::text)
  ),
  new_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from auth.users
    where created_at >= now() - interval '14 days'
      and not public.is_dapur_side_account(email::text)
    group by 1
  ),
  returning_daily as (
    select (s.signed_in_at at time zone 'Asia/Jakarta')::date as day,
           count(distinct s.user_id)::int as n
    from public.user_sessions s
    join auth.users u on u.id = s.user_id
    where s.signed_in_at >= now() - interval '14 days'
      and (u.created_at at time zone 'Asia/Jakarta')::date
          < (s.signed_in_at at time zone 'Asia/Jakarta')::date
      and not public.is_dapur_side_account(u.email::text)
    group by 1
  )
  select json_build_object(
    'tracked_total',       (select total from tracked_agg),
    'tracked_daily',       (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'downloads_total',     (select files from downloads_agg),
    'downloads_daily',     (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from downloads_daily d),
    'download_rows_total', (select rows from downloads_agg),
    'download_rows_daily', (select coalesce(json_agg(row_to_json(r) order by r.day), '[]'::json) from download_rows_daily r),
    'downloads_24h',       (select files_24h from downloads_agg),
    'download_rows_24h',   (select rows_24h from downloads_agg),
    'stores_total',        (select total from store_agg),
    'stores_daily',        (select coalesce(json_agg(row_to_json(s) order by s.day), '[]'::json) from store_daily s),
    'deepdives_total',     (select total from dd_agg),
    'deepdives_daily',     (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d),
    'ext_clicks_total',    (select total from ext_agg),
    'ext_clicks_daily',    (select coalesce(json_agg(row_to_json(e) order by e.day), '[]'::json) from ext_daily e),
    'kalc_opens_total',    (select opens from kalc_agg),
    'kalc_opens_unique',   (select opens_unique from kalc_agg),
    'kalc_opens_24h',      (select opens_24h from kalc_agg),
    'kalc_opens_daily',    (select coalesce(json_agg(row_to_json(k) order by k.day), '[]'::json) from kalc_opens_daily k),
    'kalc_pdf_total',      (select pdfs from kalc_agg),
    'kalc_pdf_24h',        (select pdfs_24h from kalc_agg),
    'kalc_pdf_daily',      (select coalesce(json_agg(row_to_json(k) order by k.day), '[]'::json) from kalc_pdf_daily k),
    'kalc_saves_total',    (select saves from kalc_agg),
    'kalc_saves_24h',      (select saves_24h from kalc_agg),
    'kalc_saves_daily',    (select coalesce(json_agg(row_to_json(k) order by k.day), '[]'::json) from kalc_saves_daily k),
    'ai_prompts_total',    (select total from ai_agg),
    'ai_prompts_24h',      (select last_24h from ai_agg),
    'ai_prompts_daily',    (select coalesce(json_agg(row_to_json(a) order by a.day), '[]'::json) from ai_daily a),
    'new_users_24h',       (select n from new_24h),
    'returning_users_24h', (select n from returning_24h),
    'new_users_daily',     (select coalesce(json_agg(row_to_json(nd) order by nd.day), '[]'::json) from new_daily nd),
    'returning_users_daily', (select coalesce(json_agg(row_to_json(r) order by r.day), '[]'::json) from returning_daily r)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.admin_dashboard_kpis() is
  'Admin KPI. downloads_total = export_jobs files; download_rows_total = sum(rows_total); '
  'kalc_* = client_events gpt_kalc_*; ai_prompts = ai_usage rows; '
  'new_users_24h = signups last 24h; returning_users_24h = older accounts with a session in last 24h.';

revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;
