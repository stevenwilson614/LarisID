-- Leader email groups: persistent named subsets of cohort students for broadcast email.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.leader_email_groups (
  id             uuid        primary key default gen_random_uuid(),
  leader_user_id uuid        not null references auth.users(id) on delete cascade,
  cohort_id      uuid        not null references public.cohorts(id) on delete cascade,
  name           text        not null check (char_length(trim(name)) between 1 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(leader_user_id, cohort_id, name)
);

create table public.leader_email_group_members (
  group_id uuid        not null references public.leader_email_groups(id) on delete cascade,
  user_id  uuid        not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key(group_id, user_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.leader_email_groups        enable row level security;
alter table public.leader_email_group_members enable row level security;

-- Groups: leader owns their own rows
create policy "leg_select" on public.leader_email_groups
  for select to authenticated using (leader_user_id = auth.uid());

create policy "leg_insert" on public.leader_email_groups
  for insert to authenticated
  with check (leader_user_id = auth.uid() and public.can_manage_cohort(cohort_id));

create policy "leg_update" on public.leader_email_groups
  for update to authenticated
  using (leader_user_id = auth.uid())
  with check (leader_user_id = auth.uid());

create policy "leg_delete" on public.leader_email_groups
  for delete to authenticated using (leader_user_id = auth.uid());

-- Group members: accessible only through the group the leader owns
create policy "legm_select" on public.leader_email_group_members
  for select to authenticated using (
    exists (
      select 1 from public.leader_email_groups g
      where g.id = group_id and g.leader_user_id = auth.uid()
    )
  );

create policy "legm_insert" on public.leader_email_group_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.leader_email_groups g
      where g.id = group_id and g.leader_user_id = auth.uid()
    )
  );

create policy "legm_delete" on public.leader_email_group_members
  for delete to authenticated using (
    exists (
      select 1 from public.leader_email_groups g
      where g.id = group_id and g.leader_user_id = auth.uid()
    )
  );

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- List groups for a cohort the caller manages, with member counts.
create or replace function public.leader_get_email_groups(p_cohort uuid)
returns table(id uuid, name text, member_count bigint, created_at timestamptz)
language sql stable security definer
set search_path = public, auth
as $$
  select
    g.id,
    g.name,
    count(m.user_id)::bigint as member_count,
    g.created_at
  from public.leader_email_groups g
  left join public.leader_email_group_members m on m.group_id = g.id
  where g.cohort_id  = p_cohort
    and g.leader_user_id = auth.uid()
    and public.can_manage_cohort(p_cohort)
  group by g.id, g.name, g.created_at
  order by g.created_at;
$$;

revoke all on function public.leader_get_email_groups(uuid) from public;
grant execute on function public.leader_get_email_groups(uuid) to authenticated;

-- Create a new named group.
create or replace function public.leader_create_email_group(p_cohort uuid, p_name text)
returns uuid
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'Forbidden: not a cohort manager';
  end if;
  if trim(p_name) = '' then
    raise exception 'Group name cannot be empty';
  end if;
  insert into public.leader_email_groups(leader_user_id, cohort_id, name)
  values (auth.uid(), p_cohort, trim(p_name))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.leader_create_email_group(uuid, text) from public;
grant execute on function public.leader_create_email_group(uuid, text) to authenticated;

-- Rename an existing group.
create or replace function public.leader_rename_email_group(p_group uuid, p_name text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  if trim(p_name) = '' then
    raise exception 'Group name cannot be empty';
  end if;
  update public.leader_email_groups
  set name = trim(p_name), updated_at = now()
  where id = p_group and leader_user_id = auth.uid();
  if not found then
    raise exception 'Forbidden or group not found';
  end if;
end;
$$;

revoke all on function public.leader_rename_email_group(uuid, text) from public;
grant execute on function public.leader_rename_email_group(uuid, text) to authenticated;

-- Delete a group (members cascade automatically).
create or replace function public.leader_delete_email_group(p_group uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  delete from public.leader_email_groups
  where id = p_group and leader_user_id = auth.uid();
  if not found then
    raise exception 'Forbidden or group not found';
  end if;
end;
$$;

revoke all on function public.leader_delete_email_group(uuid) from public;
grant execute on function public.leader_delete_email_group(uuid) to authenticated;

-- List members of a group the caller owns.
create or replace function public.leader_get_email_group_members(p_group uuid)
returns table(user_id uuid, email text, display_name text)
language sql stable security definer
set search_path = public, auth
as $$
  select
    m.user_id,
    u.email::text,
    coalesce(
      nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
      split_part(u.email, '@', 1)
    )::text as display_name
  from public.leader_email_group_members m
  join auth.users u on u.id = m.user_id
  join public.leader_email_groups g on g.id = m.group_id
  where m.group_id = p_group
    and g.leader_user_id = auth.uid()
  order by 3;
$$;

revoke all on function public.leader_get_email_group_members(uuid) from public;
grant execute on function public.leader_get_email_group_members(uuid) to authenticated;

-- Add a student to a group; student must be an active cohort member.
create or replace function public.leader_add_email_group_member(p_group uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_cohort uuid;
begin
  select g.cohort_id into v_cohort
  from public.leader_email_groups g
  where g.id = p_group and g.leader_user_id = auth.uid();

  if not found then
    raise exception 'Forbidden or group not found';
  end if;

  if not exists (
    select 1 from public.cohort_members
    where cohort_id = v_cohort
      and user_id   = p_user_id
      and status    = 'active'
      and role      = 'student'
  ) then
    raise exception 'User is not an active student in this cohort';
  end if;

  insert into public.leader_email_group_members(group_id, user_id)
  values (p_group, p_user_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.leader_add_email_group_member(uuid, uuid) from public;
grant execute on function public.leader_add_email_group_member(uuid, uuid) to authenticated;

-- Remove a student from a group.
create or replace function public.leader_remove_email_group_member(p_group uuid, p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
begin
  delete from public.leader_email_group_members m
  using public.leader_email_groups g
  where m.group_id = p_group
    and m.user_id  = p_user_id
    and g.id       = p_group
    and g.leader_user_id = auth.uid();
end;
$$;

revoke all on function public.leader_remove_email_group_member(uuid, uuid) from public;
grant execute on function public.leader_remove_email_group_member(uuid, uuid) to authenticated;
