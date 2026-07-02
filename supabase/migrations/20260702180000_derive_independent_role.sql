-- Derive user type from cohort membership instead of defaulting everyone to "student".
-- Independent = platform user with no active cohort. Student/leader only when in a kohort.

create or replace function public.derive_app_role(p_user_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when public.is_platform_admin() and p_user_id = auth.uid() then 'admin'
    when lower(coalesce(p_email, '')) = 'stevenwilson614@gmail.com' then 'admin'
    when exists (
      select 1 from public.app_role_assignments ar
      where lower(ar.email) = lower(coalesce(p_email, '')) and ar.role = 'admin'
    ) then 'admin'
    when exists (
      select 1 from public.cohorts c where c.mentor_user_id = p_user_id
    ) then 'leader'
    when exists (
      select 1 from public.app_role_assignments ar
      where lower(ar.email) = lower(coalesce(p_email, '')) and ar.role = 'leader'
    ) then 'leader'
    when exists (
      select 1 from public.cohort_members m
      where m.user_id = p_user_id and m.status = 'active'
    ) then 'student'
    else 'independent'
  end;
$$;

revoke all on function public.derive_app_role(uuid, text) from public;
grant execute on function public.derive_app_role(uuid, text) to authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.derive_app_role(
    auth.uid(),
    (select u.email::text from auth.users u where u.id = auth.uid())
  );
$$;

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
    coalesce(js.deepdive_count, 0)::integer,
    js.last_discover_at
  from auth.users u
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_journey_stats js on js.user_id = u.id
  where public.is_platform_admin()
  order by u.created_at desc;
$$;

-- Drop stale "student" overrides for users who are not in any active cohort.
delete from public.app_role_assignments ar
where ar.role = 'student'
  and not exists (
    select 1
    from auth.users u
    join public.cohort_members m on m.user_id = u.id and m.status = 'active'
    where lower(u.email) = lower(ar.email)
  );

create or replace function public.admin_assign_app_role(p_email text, p_role text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if lower(trim(p_role)) not in ('admin', 'leader', 'independent') then
    raise exception 'invalid_role';
  end if;

  if lower(trim(p_role)) = 'independent' then
    -- Platform user: clear cohort-oriented overrides. Cohort membership (if any)
    -- still drives student/leader via derive_app_role().
    delete from public.app_role_assignments
    where lower(email) = lower(trim(p_email))
      and role <> 'admin';
    return;
  end if;

  insert into public.app_role_assignments (email, role, note)
  values (lower(trim(p_email)), lower(trim(p_role)), p_note)
  on conflict (email) do update
  set role = excluded.role,
      note = coalesce(excluded.note, public.app_role_assignments.note),
      updated_at = now();
end;
$$;
