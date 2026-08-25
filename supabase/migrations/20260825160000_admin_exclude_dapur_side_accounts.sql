-- Dapur (kitchen side project) shares Contabo auth.users with LarisID.
-- Synthetic *@dapur.local accounts must not inflate Laris admin signup KPIs
-- or the Daftar Pengguna directory. Real Laris users who also cook
-- (e.g. olivia@gmail / steven@gmail in kitchen_members) stay counted.

create or replace function public.is_dapur_side_account(p_email text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(lower(p_email), '') like '%@dapur.local';
$$;

comment on function public.is_dapur_side_account(text) is
  'True for Dapur kitchen side-project auth emails (*@dapur.local). Not a Laris signup.';

revoke all on function public.is_dapur_side_account(text) from public;
grant execute on function public.is_dapur_side_account(text) to authenticated, service_role;

-- ── admin_stats: exclude dapur from signup totals / monthly / recent ────────

create or replace function public.admin_stats()
 returns json
 language plpgsql
 stable security definer
 set statement_timeout to '30s'
as $function$
declare
  v_result json;
begin
  if not (select is_platform_admin()) then
    return '{}'::json;
  end if;

  with
  signups as (
    select
      count(*)                                                          as total_signups,
      count(*) filter (where created_at >= now() - interval '7 days')  as signups_7d,
      count(*) filter (where created_at >= now() - interval '30 days') as signups_30d
    from auth.users
    where not public.is_dapur_side_account(email::text)
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

-- ── admin_user_directory: hide dapur from Daftar Pengguna + KPI sparkline ───

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
  last_activity_at timestamptz,
  seller_status text,
  region text,
  city text,
  categories text[],
  onboarding_completed boolean,
  deepdive_count integer,
  tracked_count integer,
  last_discover_at timestamptz
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
      nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(both from coalesce(up.display_name, up.first_name || ' ' || up.last_name, '')), ''),
      split_part(u.email, '@', 1),
      'User'
    )::text,
    public.derive_app_role(u.id, u.email::text),
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.cohort_members m where m.user_id = u.id and m.status = 'active')::bigint,
    (select count(*) from public.cohorts c where c.mentor_user_id = u.id)::bigint,
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
    js.last_discover_at
  from auth.users u
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
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
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;

notify pgrst, 'reload schema';
