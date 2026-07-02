-- Prerequisites that may not yet be on remote (seller_status + journey stats).
alter table public.user_onboarding_prefs
  add column if not exists seller_status text
  check (seller_status is null or seller_status in ('first_time', 'existing'));

create table if not exists public.user_journey_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deepdive_count integer not null default 0,
  first_deepdive_at timestamptz,
  last_discover_at timestamptz,
  full_deepdive_unlocked boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_journey_stats enable row level security;

drop policy if exists journey_stats_own on public.user_journey_stats;
create policy journey_stats_own on public.user_journey_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Extend admin_user_directory with onboarding / profile / journey fields
-- so the Admin Users tab can show platform users independently of cohorts.

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
    coalesce(ar.role, case when lower(u.email) = 'stevenwilson614@gmail.com' then 'admin' else 'student' end)::text,
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
    coalesce(js.deepdive_count, 0)::integer,
    js.last_discover_at
  from auth.users u
  left join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_journey_stats js on js.user_id = u.id
  where public.is_platform_admin()
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;
