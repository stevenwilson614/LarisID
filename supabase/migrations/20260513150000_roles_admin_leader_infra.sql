-- Role infrastructure for LarisID: platform admins, cohort leaders, and students.
-- Apply after the cohort migrations.

-- Global app role assignments are keyed by email so they can be seeded before
-- or after the Auth user exists. Cohort membership/leadership still lives in
-- cohorts.mentor_user_id and cohort_members.
create table if not exists public.app_role_assignments (
  email text primary key,
  role text not null check (role in ('admin', 'leader', 'student')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_role_assignments enable row level security;

-- Bootstrap known roles. Admin is intentionally duplicated in the
-- is_platform_admin() fallback below so the first admin can manage this table.
insert into public.app_role_assignments (email, role, note)
values
  ('stevenwilson614@gmail.com', 'admin', 'Bootstrap platform admin'),
  ('stevenfwilson1@gmail.com', 'leader', 'Bootstrap cohort leader'),
  ('olivia.melia.park@gmail.com', 'student', 'Bootstrap student account')
on conflict (email) do update
set role = excluded.role,
    note = excluded.note,
    updated_at = now();

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
    where u.id = auth.uid()
      and (
        ar.role = 'admin'
        or lower(u.email) in ('stevenwilson614@gmail.com')
      )
  );
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists app_roles_select_self_or_admin on public.app_role_assignments;
create policy app_roles_select_self_or_admin on public.app_role_assignments
  for select using (
    lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    or public.is_platform_admin()
  );

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when public.is_platform_admin() then 'admin'
    when exists (select 1 from public.cohorts c where c.mentor_user_id = auth.uid()) then 'leader'
    when exists (
      select 1
      from auth.users u
      join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
      where u.id = auth.uid() and ar.role = 'leader'
    ) then 'leader'
    else 'student'
  end;
$$;

revoke all on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.can_manage_cohort(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.cohorts c
      where c.id = p_cohort
        and c.mentor_user_id = auth.uid()
    );
$$;

revoke all on function public.can_manage_cohort(uuid) from public;
grant execute on function public.can_manage_cohort(uuid) to authenticated;

-- Upgrade cohort visibility policies so admins can inspect everything while
-- students remain scoped to their cohorts and leaders to cohorts they manage.
drop policy if exists cohorts_select on public.cohorts;
create policy cohorts_select on public.cohorts
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohorts.id and m.user_id = auth.uid() and m.status = 'active'
    )
    or mentor_user_id = auth.uid()
  );

drop policy if exists cohort_members_select on public.cohort_members;
create policy cohort_members_select on public.cohort_members
  for select using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or exists (select 1 from public.cohorts c where c.id = cohort_members.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = milestones.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (select 1 from public.cohorts c where c.id = milestones.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists milestones_insert_mentor on public.milestones;
create policy milestones_insert_mentor on public.milestones
  for insert with check (
    public.is_platform_admin()
    or exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists ump_select on public.user_milestone_progress;
create policy ump_select on public.user_milestone_progress
  for select using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = user_milestone_progress.milestone_id and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts
  for select using (
    public.is_platform_admin()
    or (
      exists (
        select 1 from public.cohort_members m
        where m.cohort_id = community_posts.cohort_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
      and (community_posts.hidden_at is null or community_posts.author_id = auth.uid())
    )
    or exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists posts_update_leader on public.community_posts;
create policy posts_update_leader on public.community_posts
  for update using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists ann_select on public.cohort_announcements;
create policy ann_select on public.cohort_announcements
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohort_announcements.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (select 1 from public.cohorts c where c.id = cohort_announcements.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists ann_insert on public.cohort_announcements;
create policy ann_insert on public.cohort_announcements
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_platform_admin()
      or exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
    )
  );

drop policy if exists act_select on public.activity_events;
create policy act_select on public.activity_events
  for select using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or exists (select 1 from public.cohorts c where c.id = activity_events.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists cpc_select on public.community_post_comments;
create policy cpc_select on public.community_post_comments
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.community_posts p
      join public.cohort_members m on m.cohort_id = p.cohort_id
      where p.id = community_post_comments.post_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.community_posts p
      join public.cohorts c on c.id = p.cohort_id
      where p.id = community_post_comments.post_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists cpr_select on public.community_post_reactions;
create policy cpr_select on public.community_post_reactions
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.community_posts p
      join public.cohort_members m on m.cohort_id = p.cohort_id
      where p.id = community_post_reactions.post_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.community_posts p
      join public.cohorts c on c.id = p.cohort_id
      where p.id = community_post_reactions.post_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- Admin user directory for the Admin tab.
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
  last_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text,
    coalesce(nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''), split_part(u.email, '@', 1), 'User')::text,
    coalesce(ar.role, case when lower(u.email) = 'stevenwilson614@gmail.com' then 'admin' else 'student' end)::text,
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.cohort_members m where m.user_id = u.id and m.status = 'active')::bigint,
    (select count(*) from public.cohorts c where c.mentor_user_id = u.id)::bigint,
    (select max(e.created_at) from public.activity_events e where e.user_id = u.id)
  from auth.users u
  left join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
  where public.is_platform_admin()
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;

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
  if lower(trim(p_role)) not in ('admin', 'leader', 'student') then
    raise exception 'invalid_role';
  end if;

  insert into public.app_role_assignments (email, role, note)
  values (lower(trim(p_email)), lower(trim(p_role)), p_note)
  on conflict (email) do update
  set role = excluded.role,
      note = coalesce(excluded.note, public.app_role_assignments.note),
      updated_at = now();
end;
$$;

revoke all on function public.admin_assign_app_role(text, text, text) from public;
grant execute on function public.admin_assign_app_role(text, text, text) to authenticated;

create or replace function public.admin_assign_cohort_leader(p_email text, p_cohort uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'user_not_found';
  end if;

  update public.cohorts
  set mentor_user_id = v_user
  where id = p_cohort;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (p_cohort, v_user, 'mentor', 'active')
  on conflict (cohort_id, user_id)
  do update set role = 'mentor', status = 'active';

  insert into public.app_role_assignments (email, role, note)
  values (lower(trim(p_email)), 'leader', 'Assigned as cohort leader')
  on conflict (email) do update
  set role = case when public.app_role_assignments.role = 'admin' then 'admin' else 'leader' end,
      updated_at = now();
end;
$$;

revoke all on function public.admin_assign_cohort_leader(text, uuid) from public;
grant execute on function public.admin_assign_cohort_leader(text, uuid) to authenticated;

-- Replace the earlier branding RPC so platform admins can also change cohort
-- branding, while leaders remain scoped to cohorts they own.
create or replace function public.cohort_leader_update_branding(
  p_cohort uuid,
  p_theme_primary text,
  p_theme_secondary text,
  p_slogan text,
  p_badge_icon text,
  p_theme_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pri text;
  v_sec text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'forbidden';
  end if;

  v_pri := case when p_theme_primary is null then null else trim(p_theme_primary) end;
  v_sec := case when p_theme_secondary is null then null else trim(p_theme_secondary) end;

  if v_pri is not null and v_pri <> '' and v_pri !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_primary';
  end if;
  if v_sec is not null and v_sec <> '' and v_sec !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_secondary';
  end if;

  update public.cohorts set
    theme_primary = case
      when p_theme_primary is null then theme_primary
      when v_pri = '' or v_pri is null then null
      else v_pri
    end,
    theme_secondary = case
      when p_theme_secondary is null then theme_secondary
      when v_sec = '' or v_sec is null then null
      else v_sec
    end,
    slogan = case
      when p_slogan is null then slogan
      else left(trim(p_slogan), 280)
    end,
    badge_icon = case
      when p_badge_icon is null then badge_icon
      else left(trim(p_badge_icon), 64)
    end,
    theme_json = case
      when p_theme_json is null then coalesce(theme_json, '{}'::jsonb)
      else p_theme_json
    end
  where id = p_cohort;
end;
$$;

revoke all on function public.cohort_leader_update_branding(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.cohort_leader_update_branding(uuid, text, text, text, text, jsonb) to authenticated;

create or replace function public.cohort_leader_set_student_status(
  p_cohort uuid,
  p_student uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'forbidden';
  end if;
  if p_status not in ('active', 'paused', 'left') then
    raise exception 'invalid_status';
  end if;

  update public.cohort_members
  set status = p_status
  where cohort_id = p_cohort
    and user_id = p_student
    and role = 'student';
end;
$$;

revoke all on function public.cohort_leader_set_student_status(uuid, uuid, text) from public;
grant execute on function public.cohort_leader_set_student_status(uuid, uuid, text) to authenticated;

create or replace function public.cohort_leader_add_student_by_email(
  p_cohort uuid,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid;
begin
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'forbidden';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user is null then
    raise exception 'user_not_found';
  end if;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (p_cohort, v_user, 'student', 'active')
  on conflict (cohort_id, user_id)
  do update set role = 'student', status = 'active';

  insert into public.app_role_assignments (email, role, note)
  values (lower(trim(p_email)), 'student', 'Assigned to cohort')
  on conflict (email) do update
  set role = case when public.app_role_assignments.role in ('admin', 'leader') then public.app_role_assignments.role else 'student' end,
      updated_at = now();

  return v_user;
end;
$$;

revoke all on function public.cohort_leader_add_student_by_email(uuid, text) from public;
grant execute on function public.cohort_leader_add_student_by_email(uuid, text) to authenticated;

-- Extend the existing directory with membership status and email while preserving
-- the original function name used by the site. Return columns changed, so drop
-- before recreating.
drop function if exists public.cohort_student_directory(uuid, int);
create or replace function public.cohort_student_directory(p_cohort uuid, p_days int default 30)
returns table (
  user_id uuid,
  email text,
  display_name text,
  status text,
  joined_at timestamptz,
  last_event_at timestamptz,
  last_seen_at timestamptz,
  event_count bigint,
  milestones_done bigint,
  engagement_score numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    m.user_id,
    u.email::text,
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
      split_part(u.email, '@', 1),
      'Member'
    )::text as display_name,
    m.status::text,
    m.joined_at,
    (select max(e.created_at) from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id) as last_event_at,
    m.last_seen_at,
    (select count(*)::bigint from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day')) as event_count,
    (select count(*)::bigint from public.user_milestone_progress ump join public.milestones ms on ms.id = ump.milestone_id where ms.cohort_id = p_cohort and ump.user_id = m.user_id) as milestones_done,
    (
      (select count(*)::numeric from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day'))
      * 1.0
      + (select count(*)::numeric from public.user_milestone_progress ump join public.milestones ms on ms.id = ump.milestone_id where ms.cohort_id = p_cohort and ump.user_id = m.user_id) * 3.0
    ) as engagement_score
  from public.cohort_members m
  join auth.users u on u.id = m.user_id
  where m.cohort_id = p_cohort
    and m.role = 'student'
    and public.can_manage_cohort(p_cohort)
  order by m.status, engagement_score desc, m.joined_at desc;
$$;

grant execute on function public.cohort_student_directory(uuid, int) to authenticated;

-- Demo assignments: make Steven leader of the demo cohort and Olivia a student
-- when those Auth users and the demo cohort already exist.
do $$
declare
  v_cohort uuid;
  v_leader uuid;
  v_student uuid;
begin
  select id into v_cohort from public.cohorts where slug = 'demo' or invite_code = 'LARIS2026' order by created_at limit 1;
  select id into v_leader from auth.users where lower(email) = 'stevenfwilson1@gmail.com' limit 1;
  select id into v_student from auth.users where lower(email) = 'olivia.melia.park@gmail.com' limit 1;

  if v_cohort is not null and v_leader is not null then
    update public.cohorts set mentor_user_id = v_leader where id = v_cohort;
    insert into public.cohort_members (cohort_id, user_id, role, status)
    values (v_cohort, v_leader, 'mentor', 'active')
    on conflict (cohort_id, user_id) do update set role = 'mentor', status = 'active';
  end if;

  if v_cohort is not null and v_student is not null then
    insert into public.cohort_members (cohort_id, user_id, role, status)
    values (v_cohort, v_student, 'student', 'active')
    on conflict (cohort_id, user_id) do update set role = 'student', status = 'active';
  end if;
end $$;
