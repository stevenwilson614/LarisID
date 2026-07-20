-- Landing-page + visitor tracking (anonymous-friendly) and admin_stats extension.
--
-- Motivation: the admin overview previously showed only signup counts and
-- signed-in-user session return-rate. There was NO record of anonymous landing
-- traffic in the DB (that data lived only in Clarity/Cloudflare). This adds a
-- lightweight page_views table written through a SECURITY DEFINER RPC so anon
-- visitors can be counted, and surfaces landing views + returning visitors in
-- admin_stats. Numbers build up from deploy time forward (anon history is not
-- backfillable — Clarity holds the pre-deploy record).

create table if not exists public.page_views (
  id             uuid primary key default gen_random_uuid(),
  visitor_id     text not null,          -- anon id from localStorage (_lid_vid)
  session_id     text,                   -- per-tab session id (sessionStorage)
  path           text,
  referrer       text,
  utm_source     text,
  is_new_session boolean not null default false,
  user_id        uuid,                   -- auth.uid() when signed in, else null
  created_at     timestamptz not null default now()
);

create index if not exists idx_page_views_created on public.page_views (created_at desc);
create index if not exists idx_page_views_visitor on public.page_views (visitor_id, created_at);

-- All writes go through log_page_view(); admins read via admin_stats (definer).
alter table public.page_views enable row level security;

create or replace function public.log_page_view(
  p_visitor_id     text,
  p_session_id     text default null,
  p_path           text default null,
  p_referrer       text default null,
  p_utm_source     text default null,
  p_is_new_session boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ignore obviously invalid ids (bots hitting the RPC with junk).
  if p_visitor_id is null or length(p_visitor_id) < 6 then
    return;
  end if;
  insert into public.page_views
    (visitor_id, session_id, path, referrer, utm_source, is_new_session, user_id)
  values
    (left(p_visitor_id, 64), left(p_session_id, 64), left(p_path, 200),
     left(p_referrer, 300), left(p_utm_source, 80), coalesce(p_is_new_session, false),
     auth.uid());
end;
$$;

revoke all on function public.log_page_view(text,text,text,text,text,boolean) from public;
grant execute on function public.log_page_view(text,text,text,text,text,boolean) to anon, authenticated;

-- ── admin_stats: add landing-view + visitor metrics ─────────────────────────
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
    from public.user_sessions
  ),
  credits_agg as (
    select
      coalesce(sum(balance), 0)          as total_credits,
      coalesce(avg(balance) filter (where balance > 0), 0) as avg_balance
    from public.user_credits
  ),

  -- ── Landing-page views + anonymous visitors ────────────────
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
    order by s.signed_in_at desc
    limit 25
  ),

  dau_raw as (
    select
      date_trunc('day', signed_in_at at time zone 'Asia/Jakarta')::date as day,
      count(distinct user_id) as active_users
    from public.user_sessions
    where signed_in_at >= now() - interval '30 days'
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

    -- landing / visitor metrics (v3)
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
    'landing_views_daily',     (select coalesce(json_agg(row_to_json(pv_daily)), '[]') from pv_daily),

    'cohorts_overview',        (select coalesce(json_agg(row_to_json(cohorts_detail)), '[]') from cohorts_detail),
    'recent_signups',          (select coalesce(json_agg(row_to_json(recent_signups_raw)), '[]') from recent_signups_raw),
    'dau_last_30d',            (select coalesce(json_agg(row_to_json(dau_raw)), '[]') from dau_raw),
    'credit_events_by_type',   (select coalesce(json_agg(row_to_json(credit_events)), '[]') from credit_events),
    'top_keywords',            (select coalesce(json_agg(row_to_json(top_kw)), '[]') from top_kw)
  ) into v_result;

  return v_result;
end;
$function$;
