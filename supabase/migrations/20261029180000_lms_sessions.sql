-- LMS class schedule. One-way calendar subscribe uses the mentor's calendar_token.
-- Students read their mentor's sessions. The token is not a login.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261029180000_lms_sessions.sql

begin;

alter table public.lms_accounts
  add column if not exists calendar_token uuid;

alter table public.lms_accounts disable trigger lms_accounts_guard;

update public.lms_accounts
set calendar_token = gen_random_uuid()
where calendar_token is null;

alter table public.lms_accounts enable trigger lms_accounts_guard;

alter table public.lms_accounts
  alter column calendar_token set default gen_random_uuid(),
  alter column calendar_token set not null;

create or replace function public.lms_accounts_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.display_name := left(btrim(coalesce(new.display_name, '')), 80);
  if char_length(new.display_name) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and new.role = 'student' then
    if not exists (
      select 1
      from public.lms_accounts mentor
      where mentor.user_id = new.mentor_id
        and mentor.role = 'mentor'
    ) then
      raise exception 'lms_invite' using errcode = '23503';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.role is distinct from old.role
       or new.mentor_id is distinct from old.mentor_id
       or new.created_at is distinct from old.created_at then
      raise exception 'lms_locked' using errcode = '42501';
    end if;
    new.calendar_token := old.calendar_token;
  end if;
  return new;
end;
$$;

create table if not exists public.lms_sessions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.lms_accounts (user_id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  mins int not null default 60,
  meet_url text not null default '',
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint lms_sessions_title_len check (char_length(title) between 1 and 120),
  constraint lms_sessions_mins check (mins between 15 and 480),
  constraint lms_sessions_meet_len check (char_length(meet_url) <= 500),
  constraint lms_sessions_loc_len check (char_length(location) <= 160),
  constraint lms_sessions_notes_len check (char_length(notes) <= 2000),
  constraint lms_sessions_meet_url check (meet_url = '' or meet_url ~* '^https?://')
);

create index if not exists lms_sessions_mentor_starts_idx
  on public.lms_sessions (mentor_id, starts_at);

create or replace function public.lms_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.lms_accounts;
  v_mentor public.lms_accounts;
  v_org text;
  v_avatar text;
  v_slug text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_me
  from public.lms_accounts
  where user_id = auth.uid();
  if not found then
    return null;
  end if;
  if v_me.role = 'student' then
    select * into v_mentor
    from public.lms_accounts
    where user_id = v_me.mentor_id
      and role = 'mentor';
    v_org := coalesce(v_mentor.org_name, v_mentor.display_name);
    v_avatar := v_mentor.avatar_url;
    v_slug := v_mentor.org_slug;
  else
    v_org := coalesce(v_me.org_name, v_me.display_name);
    v_avatar := v_me.avatar_url;
    v_slug := v_me.org_slug;
  end if;
  return jsonb_build_object(
    'user_id', v_me.user_id,
    'role', v_me.role,
    'display_name', v_me.display_name,
    'org_name', v_org,
    'org_slug', v_slug,
    'avatar_url', v_avatar,
    'mentor_name', case when v_me.role = 'student' then v_mentor.display_name else v_me.display_name end,
    'brand_title', public.lms_brand_title(v_org, v_me.display_name),
    'calendar_token', case when v_me.role = 'mentor' then v_me.calendar_token else null end
  );
end;
$$;

create or replace function public.lms_school_mentor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when a.role = 'mentor' then a.user_id
    else a.mentor_id
  end
  from public.lms_accounts a
  where a.user_id = auth.uid();
$$;

create or replace function public.lms_list_sessions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mentor uuid := public.lms_school_mentor();
begin
  if auth.uid() is null or v_mentor is null then
    raise exception 'lms_auth' using errcode = '28000';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) order by s.starts_at)
    from (
      select id, title, starts_at, mins, meet_url, location, notes, created_at
      from public.lms_sessions
      where mentor_id = v_mentor
    ) s
  ), '[]'::jsonb);
end;
$$;

create or replace function public.lms_upsert_session(
  p_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_mins int,
  p_meet_url text,
  p_location text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := left(btrim(coalesce(p_title, '')), 120);
  v_mins int := least(greatest(coalesce(p_mins, 60), 15), 480);
  v_meet text := left(btrim(coalesce(p_meet_url, '')), 500);
  v_loc text := left(btrim(coalesce(p_location, '')), 160);
  v_notes text := left(coalesce(p_notes, ''), 2000);
  v_row public.lms_sessions;
begin
  if v_uid is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if char_length(v_title) < 1 or p_starts_at is null then
    raise exception 'lms_when' using errcode = '22023';
  end if;
  if v_meet <> '' and v_meet !~* '^https?://' then
    raise exception 'lms_session' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.lms_sessions (mentor_id, title, starts_at, mins, meet_url, location, notes)
    values (v_uid, v_title, p_starts_at, v_mins, v_meet, v_loc, v_notes)
    returning * into v_row;
  else
    update public.lms_sessions
    set title = v_title,
        starts_at = p_starts_at,
        mins = v_mins,
        meet_url = v_meet,
        location = v_loc,
        notes = v_notes
    where id = p_id
      and mentor_id = v_uid
    returning * into v_row;
    if not found then
      raise exception 'lms_session' using errcode = '02000';
    end if;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'starts_at', v_row.starts_at,
    'mins', v_row.mins,
    'meet_url', v_row.meet_url,
    'location', v_row.location,
    'notes', v_row.notes,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.lms_delete_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  delete from public.lms_sessions
  where id = p_id
    and mentor_id = auth.uid();
  if not found then
    raise exception 'lms_session' using errcode = '02000';
  end if;
end;
$$;

create or replace function public.lms_calendar_link()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_mentor uuid := public.lms_school_mentor();
  v_token uuid;
  v_https text;
begin
  if auth.uid() is null or v_mentor is null then
    return null;
  end if;
  select calendar_token into v_token
  from public.lms_accounts
  where user_id = v_mentor
    and role = 'mentor';
  if v_token is null then
    return null;
  end if;
  v_https := 'https://api.larisid.com/functions/v1/lms-calendar-ics?mentor='
    || v_mentor::text
    || '&token='
    || v_token::text;
  return jsonb_build_object(
    'https', v_https,
    'webcal', replace(v_https, 'https://', 'webcal://'),
    'calendar_token', case when public.lms_is_mentor() then v_token else null end
  );
end;
$$;

revoke all on function public.lms_school_mentor() from public, anon;
revoke all on function public.lms_list_sessions() from public, anon;
revoke all on function public.lms_upsert_session(uuid, text, timestamptz, int, text, text, text) from public, anon;
revoke all on function public.lms_delete_session(uuid) from public, anon;
revoke all on function public.lms_calendar_link() from public, anon;

grant execute on function public.lms_school_mentor() to authenticated;
grant execute on function public.lms_list_sessions() to authenticated;
grant execute on function public.lms_upsert_session(uuid, text, timestamptz, int, text, text, text) to authenticated;
grant execute on function public.lms_delete_session(uuid) to authenticated;
grant execute on function public.lms_calendar_link() to authenticated;
grant execute on function public.lms_me() to authenticated;

alter table public.lms_sessions enable row level security;

drop policy if exists lms_sessions_select on public.lms_sessions;
create policy lms_sessions_select on public.lms_sessions
  for select to authenticated
  using (
    mentor_id = auth.uid()
    or mentor_id = public.lms_my_mentor()
  );

revoke all on table public.lms_sessions from public, anon;
grant select on table public.lms_sessions to authenticated;

notify pgrst, 'reload schema';

commit;
