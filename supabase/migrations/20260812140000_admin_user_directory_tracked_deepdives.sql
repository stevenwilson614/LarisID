-- Admin Users table: tracked product count + lifetime deep dive count.
-- deepdive_count prefers the higher of journey_stats vs activity_events
-- (journey_stats was historically under-counted for Site B).

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
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;
