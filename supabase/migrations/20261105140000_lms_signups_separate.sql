-- LMS class signups share auth.users with Laris. A class-only account
-- (student or mentor who never opened Laris) must not inflate Laris
-- signup KPIs or Daftar Pengguna. Accounts that also use Laris stay counted.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261105140000_lms_signups_separate.sql
-- Then: bash scripts/backfill-lms-auth-users.sh

create table if not exists public.lms_auth_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  slug text not null,
  bound_at timestamptz not null default now()
);

comment on table public.lms_auth_users is
  'Auth user bound to an LMS class. Laris signup KPIs skip these unless the same account has used Laris.';

alter table public.lms_auth_users enable row level security;
revoke all on table public.lms_auth_users from public, anon, authenticated;

create or replace function public.mark_lms_auth(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_slug text := left(lower(trim(coalesce(p_slug, ''))), 80);
begin
  if v_me is null then
    raise exception 'auth required' using errcode = '28000';
  end if;
  if v_slug = '' then
    v_slug := 'lms';
  end if;
  insert into public.lms_auth_users (user_id, slug)
  values (v_me, v_slug)
  on conflict (user_id) do nothing;
end;
$$;

comment on function public.mark_lms_auth(text) is
  'Record the signed-in user as an LMS class account. First slug wins.';

revoke all on function public.mark_lms_auth(text) from public;
grant execute on function public.mark_lms_auth(text) to authenticated;

create or replace function public.is_lms_only_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_auth_users a
    where a.user_id = p_user_id
      and not exists (
        select 1 from public.user_sessions s where s.user_id = a.user_id
      )
      and not exists (
        select 1 from public.page_views p where p.user_id = a.user_id
      )
      and not exists (
        select 1 from public.user_onboarding_prefs o where o.user_id = a.user_id
      )
      and not exists (
        select 1 from public.deepdive_opens d where d.user_id = a.user_id
      )
      and not exists (
        select 1 from public.user_tracked_products t where t.user_id = a.user_id
      )
  );
$$;

comment on function public.is_lms_only_account(uuid) is
  'True when this auth user is bound to LMS and has no Laris session, page view, onboarding, Deep Dive, or tracked product.';

revoke all on function public.is_lms_only_account(uuid) from public, anon, authenticated;


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
    from auth.users u
    where u.created_at >= now() - interval '24 hours'
      and not public.is_dapur_side_account(u.email::text)
      and not public.is_lms_only_account(u.id)
  ),
  lms_24h as (
    select count(*)::int as n
    from auth.users u
    where u.created_at >= now() - interval '24 hours'
      and public.is_lms_only_account(u.id)
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
    select (u.created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from auth.users u
    where u.created_at >= now() - interval '14 days'
      and not public.is_dapur_side_account(u.email::text)
      and not public.is_lms_only_account(u.id)
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
    'lms_new_24h',         (select n from lms_24h),
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
  'new_users_24h = Laris signups last 24h (LMS-only class accounts excluded); '
  'lms_new_24h = class-only signups last 24h; '
  'returning_users_24h = older accounts with a session in last 24h.';

revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;

create or replace function public.admin_stats()
 returns json
 language plpgsql
 stable security definer
 set statement_timeout to '30s'
 set search_path to public
as $function$
declare
  v_result json;
  v_now timestamptz;
  v_jkt timestamp;
  v_month_start timestamptz;
  v_prev_start timestamptz;
  v_elapsed interval;
  v_prev_end timestamptz;
  v_prev_capped boolean;
begin
  if not (select is_platform_admin()) then
    return '{}'::json;
  end if;

  v_now := now();
  v_jkt := v_now at time zone 'Asia/Jakarta';
  v_month_start := date_trunc('month', v_jkt) at time zone 'Asia/Jakarta';
  v_prev_start := (date_trunc('month', v_jkt) - interval '1 month') at time zone 'Asia/Jakarta';
  v_elapsed := v_now - v_month_start;
  v_prev_end := least(v_prev_start + v_elapsed, v_month_start);
  v_prev_capped := (v_prev_start + v_elapsed) > v_month_start;

  with
  signups as (
    select
      count(*)                                                          as total_signups,
      count(*) filter (where created_at >= now() - interval '7 days')  as signups_7d,
      count(*) filter (where created_at >= now() - interval '30 days') as signups_30d
    from auth.users
    where not public.is_dapur_side_account(email::text)
      and not public.is_lms_only_account(id)
  ),
  sessions_agg as (
    select
      count(*)                                                                   as total_sessions,
      count(distinct user_id)                                                    as users_with_session,
      count(distinct user_id) filter (
        where user_id in (
          select user_id from public.user_sessions
          group by user_id having count(*) > 1
        )
      )                                                                          as returning_users
    from public.user_sessions s
    where not exists (
      select 1 from auth.users u
      where u.id = s.user_id and public.is_dapur_side_account(u.email::text)
    )
  ),
  credits_agg as (
    select
      coalesce(sum(balance), 0)          as total_credits,
      coalesce(avg(balance) filter (where balance > 0), 0) as avg_balance
    from public.user_credits
  ),

  pv_agg as (
    select
      count(*)                                                                as views_total,
      count(*) filter (where created_at >= now() - interval '7 days')         as views_7d,
      count(*) filter (where created_at >= now() - interval '30 days')        as views_30d,
      count(distinct visitor_id) filter (where created_at >= now() - interval '7 days')  as uniq_7d,
      count(distinct visitor_id) filter (where created_at >= now() - interval '30 days') as uniq_30d
    from public.page_views
  ),
  visitor_days as (
    select visitor_id,
           count(distinct (created_at at time zone 'Asia/Jakarta')::date) as active_days
    from public.page_views
    group by visitor_id
  ),
  ret_vis as (
    select
      count(*) filter (where active_days >= 2) as returning_visitors,
      count(*)                                 as visitors_total
    from visitor_days
  ),
  pv_daily as (
    select
      (created_at at time zone 'Asia/Jakarta')::date as day,
      count(*)                   as views,
      count(distinct visitor_id) as visitors
    from public.page_views
    where created_at >= now() - interval '30 days'
    group by 1
    order by 1
  ),

  signups_monthly as (
    select
      date_trunc('month', created_at at time zone 'Asia/Jakarta')::date as month,
      count(*)::int as signups
    from auth.users
    where not public.is_dapur_side_account(email::text)
      and not public.is_lms_only_account(id)
    group by 1
  ),
  pv_monthly as (
    select
      date_trunc('month', created_at at time zone 'Asia/Jakarta')::date as month,
      count(*)::int as views,
      count(distinct visitor_id)::int as visitors
    from public.page_views
    group by 1
  ),
  pace_views as (
    select
      count(*) filter (where created_at >= v_month_start and created_at < v_now)::int as views_mtd,
      count(*) filter (where created_at >= v_prev_start and created_at < v_prev_end)::int as views_prev
    from public.page_views
  ),
  pace_signups as (
    select
      count(*) filter (where created_at >= v_month_start and created_at < v_now)::int as signups_mtd,
      count(*) filter (where created_at >= v_prev_start and created_at < v_prev_end)::int as signups_prev
    from auth.users
    where not public.is_dapur_side_account(email::text)
      and not public.is_lms_only_account(id)
  ),

  role_counts as (
    select
      count(*) filter (where role = 'leader') as active_leaders,
      count(*) filter (where role = 'admin')  as admin_count
    from public.app_role_assignments
  ),

  cohort_student_counts as (
    select cohort_id, count(*) as student_count
    from public.cohort_members
    where role = 'student' and status = 'active'
    group by cohort_id
  ),
  cohort_last_activity as (
    select cohort_id, max(created_at) as last_activity
    from public.activity_events
    group by cohort_id
  ),
  active_cohorts_count as (
    select count(*) as cnt
    from cohort_student_counts
    where student_count > 0
  ),
  cohorts_detail as (
    select
      c.id,
      c.name,
      coalesce(u.email, '—') as leader_email,
      coalesce(sc.student_count, 0) as student_count,
      la.last_activity
    from public.cohorts c
    left join auth.users u on u.id = c.mentor_user_id
    left join cohort_student_counts sc on sc.cohort_id = c.id
    left join cohort_last_activity la on la.cohort_id = c.id
    order by sc.student_count desc nulls last, c.created_at desc
    limit 30
  ),

  recent_signups_raw as (
    select
      s.user_id,
      s.signed_in_at,
      s.is_new_user,
      u.email
    from public.user_sessions s
    left join auth.users u on u.id = s.user_id
    where s.is_new_user = true
      and not public.is_dapur_side_account(u.email::text)
    order by s.signed_in_at desc
    limit 25
  ),

  dau_raw as (
    select
      date_trunc('day', s.signed_in_at at time zone 'Asia/Jakarta')::date as day,
      count(distinct s.user_id) as active_users
    from public.user_sessions s
    where s.signed_in_at >= now() - interval '30 days'
      and not exists (
        select 1 from auth.users u
        where u.id = s.user_id and public.is_dapur_side_account(u.email::text)
      )
    group by 1
    order by 1
  ),

  credit_events as (
    select
      event_type as type,
      count(*) as events,
      coalesce(sum((metadata->>'credits')::int), 0) as total_credits
    from public.activity_events
    where event_type ilike '%credit%' or event_type ilike '%search%'
    group by event_type
    order by events desc
    limit 10
  ),

  top_kw as (
    select
      metadata->>'keyword' as keyword,
      count(*) as completions
    from public.activity_events
    where event_type = 'search_completion'
      and metadata->>'keyword' is not null
    group by 1
    order by completions desc
    limit 10
  )

  select json_build_object(
    'total_signups',           (select total_signups from signups),
    'signups_last_7d',         (select signups_7d from signups),
    'signups_last_30d',        (select signups_30d from signups),
    'users_never_purchased',   0,
    'total_credits_in_circulation', (select total_credits from credits_agg),
    'avg_balance_per_user',    (select round(avg_balance::numeric, 1) from credits_agg),

    'total_sessions',          (select total_sessions from sessions_agg),
    'returning_users',         (select returning_users from sessions_agg),
    'return_rate',             (select case when users_with_session > 0
                                  then round(returning_users::numeric / users_with_session * 100, 1)
                                  else 0 end from sessions_agg),
    'active_leaders',          (select active_leaders from role_counts),
    'active_cohorts',          (select cnt from active_cohorts_count),

    'landing_views_total',     (select views_total from pv_agg),
    'landing_views_7d',        (select views_7d from pv_agg),
    'landing_views_30d',       (select views_30d from pv_agg),
    'unique_visitors_7d',      (select uniq_7d from pv_agg),
    'unique_visitors_30d',     (select uniq_30d from pv_agg),
    'returning_visitors',      (select returning_visitors from ret_vis),
    'visitors_total',          (select visitors_total from ret_vis),
    'visitor_return_rate',     (select case when visitors_total > 0
                                  then round(returning_visitors::numeric / visitors_total * 100, 1)
                                  else 0 end from ret_vis),
    'landing_views_daily',     (select coalesce(json_agg(row_to_json(pv_daily) order by pv_daily.day), '[]') from pv_daily),

    'signups_monthly',         (select coalesce(json_agg(row_to_json(s) order by s.month), '[]') from signups_monthly s),
    'landing_views_monthly',   (select coalesce(json_agg(row_to_json(p) order by p.month), '[]') from pv_monthly p),
    'month_pace', json_build_object(
      'month', (v_month_start at time zone 'Asia/Jakarta')::date,
      'prev_month', (v_prev_start at time zone 'Asia/Jakarta')::date,
      'day_of_month', extract(day from v_jkt)::int,
      'prev_capped', v_prev_capped,
      'views_mtd', (select views_mtd from pace_views),
      'views_prev', (select views_prev from pace_views),
      'signups_mtd', (select signups_mtd from pace_signups),
      'signups_prev', (select signups_prev from pace_signups)
    ),

    'cohorts_overview',        (select coalesce(json_agg(row_to_json(cohorts_detail)), '[]') from cohorts_detail),
    'recent_signups',          (select coalesce(json_agg(row_to_json(recent_signups_raw)), '[]') from recent_signups_raw),
    'dau_last_30d',            (select coalesce(json_agg(row_to_json(dau_raw)), '[]') from dau_raw),
    'credit_events_by_type',   (select coalesce(json_agg(row_to_json(credit_events)), '[]') from credit_events),
    'top_keywords',            (select coalesce(json_agg(row_to_json(top_kw)), '[]') from top_kw)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

drop function if exists public.admin_user_directory();

create or replace function public.admin_user_directory()
returns table (
  user_id uuid,
  email text,
  display_name text,
  app_role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  cohort_count bigint,
  led_cohort_count bigint,
  cohort_names text[],
  last_activity_at timestamptz,
  seller_status text,
  region text,
  city text,
  categories text[],
  onboarding_completed boolean,
  deepdive_count integer,
  tracked_count integer,
  last_discover_at timestamptz,
  wa_number text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(case
        when public.is_phone_like_name(u.raw_user_meta_data ->> 'full_name') then ''
        else trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', ''))
      end, ''),
      nullif(case
        when public.is_phone_like_name(up.display_name) then ''
        else trim(both from coalesce(up.display_name, ''))
      end, ''),
      nullif(trim(both from coalesce(up.first_name || ' ' || up.last_name, '')), ''),
      case
        when u.email ilike '%@wa.larisid.com' then 'Pengguna WA'
        else coalesce(nullif(split_part(u.email, '@', 1), ''), 'Pengguna')
      end
    )::text,
    public.derive_app_role(u.id, u.email::text),
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.cohort_members m where m.user_id = u.id and m.status = 'active')::bigint,
    (select count(*) from public.cohorts c where c.mentor_user_id = u.id)::bigint,
    coalesce(
      (
        select array_agg(c.name order by c.name)
        from public.cohort_members m
        join public.cohorts c on c.id = m.cohort_id
        where m.user_id = u.id and m.status = 'active'
      ),
      '{}'::text[]
    ),
    (select max(e.created_at) from public.activity_events e where e.user_id = u.id),
    coalesce(ob.seller_status, up.seller_status)::text,
    ob.region::text,
    up.city::text,
    coalesce(ob.categories, '{}'::text[]),
    (ob.completed_at is not null),
    greatest(
      coalesce(js.deepdive_count, 0),
      coalesce(dd.cnt, 0)
    )::integer,
    coalesce(tp.cnt, 0)::integer,
    js.last_discover_at,
    coalesce(
      public.normalise_wa_phone(up.wa_number),
      public.normalise_wa_phone(up.public_whatsapp),
      public.normalise_wa_phone(st.notify_wa_number),
      public.normalise_wa_phone(u.phone),
      public.normalise_wa_phone(u.raw_user_meta_data ->> 'phone_number'),
      case
        when u.email ilike '%@wa.larisid.com'
          then public.normalise_wa_phone(split_part(u.email, '@', 1))
        else null
      end
    )::text
  from auth.users u
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_tracker_state st on st.user_id = u.id
  left join public.user_journey_stats js on js.user_id = u.id
  left join (
    select e.user_id, count(*)::integer as cnt
    from public.activity_events e
    where e.event_type = 'deepdive_open'
    group by e.user_id
  ) dd on dd.user_id = u.id
  left join (
    select t.user_id, count(*)::integer as cnt
    from public.user_tracked_products t
    group by t.user_id
  ) tp on tp.user_id = u.id
  where public.is_platform_admin()
    and not public.is_dapur_side_account(u.email::text)
    and not public.is_lms_only_account(u.id)
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;

notify pgrst, 'reload schema';
