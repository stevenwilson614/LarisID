-- Ocean Blue first cohort + role-specific invite codes.
-- Student code: OCEANBLUE-STUDENT
-- Leader code:  OCEANBLUE-LEADER

create table if not exists public.cohort_invite_codes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  invite_code text not null unique,
  role text not null default 'student' check (role in ('student', 'mentor')),
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cohort_invite_codes_invite_code_lower_idx
  on public.cohort_invite_codes (lower(invite_code));
create index if not exists cohort_invite_codes_cohort_idx
  on public.cohort_invite_codes (cohort_id);

alter table public.cohort_invite_codes enable row level security;

drop policy if exists cohort_invite_codes_manage_select on public.cohort_invite_codes;
create policy cohort_invite_codes_manage_select on public.cohort_invite_codes
  for select using (public.can_manage_cohort(cohort_id));

-- Make leader checks work for both the primary mentor_user_id and mentor
-- membership rows. This keeps room for future multi-leader cohorts.
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
      from public.cohort_members m
      where m.user_id = auth.uid()
        and m.role = 'mentor'
        and m.status = 'active'
    ) then 'leader'
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
    )
    or exists (
      select 1
      from public.cohort_members m
      where m.cohort_id = p_cohort
        and m.user_id = auth.uid()
        and m.role = 'mentor'
        and m.status = 'active'
    );
$$;

revoke all on function public.can_manage_cohort(uuid) from public;
grant execute on function public.can_manage_cohort(uuid) to authenticated;

-- Create/update the first cohort.
insert into public.cohorts (
  name,
  slug,
  invite_code,
  theme_primary,
  theme_secondary,
  badge_icon,
  slogan
)
values (
  'Ocean Blue',
  'ocean-blue',
  'OCEANBLUE-STUDENT',
  '#0c4a6e',
  '#d4b896',
  '🌊',
  'Ocean Blue — fokus, akuntabilitas, dan momentum.'
)
on conflict (slug) do update
set name = excluded.name,
    invite_code = excluded.invite_code,
    theme_primary = excluded.theme_primary,
    theme_secondary = excluded.theme_secondary,
    badge_icon = excluded.badge_icon,
    slogan = excluded.slogan;

insert into public.cohort_invite_codes (cohort_id, invite_code, role, note)
select id, 'OCEANBLUE-STUDENT', 'student', 'Ocean Blue student join code'
from public.cohorts
where slug = 'ocean-blue'
on conflict (invite_code) do update
set cohort_id = excluded.cohort_id,
    role = excluded.role,
    note = excluded.note,
    is_active = true,
    updated_at = now();

insert into public.cohort_invite_codes (cohort_id, invite_code, role, note)
select id, 'OCEANBLUE-LEADER', 'mentor', 'Ocean Blue cohort leader join code'
from public.cohorts
where slug = 'ocean-blue'
on conflict (invite_code) do update
set cohort_id = excluded.cohort_id,
    role = excluded.role,
    note = excluded.note,
    is_active = true,
    updated_at = now();

-- Replace the original student-only join RPC with role-aware invite handling.
-- Existing cohorts.invite_code values still work as student invites.
create or replace function public.join_cohort(p_invite text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code text;
  v_cohort uuid;
  v_role text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_code := lower(trim(coalesce(p_invite, '')));
  if v_code = '' then
    raise exception 'invalid_or_expired_invite';
  end if;

  select ic.cohort_id, ic.role
    into v_cohort, v_role
  from public.cohort_invite_codes ic
  join public.cohorts c on c.id = ic.cohort_id
  where lower(ic.invite_code) = v_code
    and ic.is_active = true
    and (c.ends_at is null or c.ends_at > now())
  limit 1;

  if v_cohort is null then
    select id, 'student'
      into v_cohort, v_role
    from public.cohorts
    where lower(invite_code) = v_code
      and (ends_at is null or ends_at > now())
    limit 1;
  end if;

  if v_cohort is null then
    raise exception 'invalid_or_expired_invite';
  end if;

  if v_role = 'mentor' then
    update public.cohorts
    set mentor_user_id = auth.uid()
    where id = v_cohort;

    select lower(email) into v_email
    from auth.users
    where id = auth.uid();

    if v_email is not null then
      insert into public.app_role_assignments (email, role, note)
      values (v_email, 'leader', 'Joined with Ocean Blue leader invite')
      on conflict (email) do update
      set role = case when public.app_role_assignments.role = 'admin' then 'admin' else 'leader' end,
          updated_at = now();
    end if;
  end if;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (v_cohort, auth.uid(), v_role, 'active')
  on conflict (cohort_id, user_id)
  do update set role = excluded.role,
                status = 'active';

  return v_cohort;
end;
$$;

revoke all on function public.join_cohort(text) from public;
grant execute on function public.join_cohort(text) to authenticated;

-- Starter account assignments, when those Auth users already exist.
do $$
declare
  v_cohort uuid;
  v_leader uuid;
  v_student uuid;
begin
  select id into v_cohort from public.cohorts where slug = 'ocean-blue' limit 1;
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
