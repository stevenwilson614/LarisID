-- LMS at /lms. One school per mentor. Students exist only by accepting that
-- mentor's invite. Lesson files live in the private bucket lms-materials.
-- No platform-admin bypass and no invite string that can read a file.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql

begin;

create table if not exists public.lms_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('mentor', 'student')),
  mentor_id uuid,
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint lms_accounts_role_shape check (
    (role = 'mentor' and mentor_id is null)
    or (role = 'student' and mentor_id is not null and mentor_id <> user_id)
  )
);

alter table public.lms_accounts
  drop constraint if exists lms_accounts_mentor_fk;

alter table public.lms_accounts
  add constraint lms_accounts_mentor_fk
  foreign key (mentor_id) references public.lms_accounts (user_id) on delete cascade;

create index if not exists lms_accounts_mentor_idx
  on public.lms_accounts (mentor_id)
  where role = 'student';

create table if not exists public.lms_invites (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.lms_accounts (user_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lms_invites_mentor_idx
  on public.lms_invites (mentor_id, created_at desc);

create table if not exists public.lms_modules (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.lms_accounts (user_id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint lms_modules_title_len check (char_length(title) between 1 and 120),
  constraint lms_modules_sort check (sort_order between 0 and 10000)
);

create index if not exists lms_modules_mentor_idx
  on public.lms_modules (mentor_id, sort_order, created_at);

create table if not exists public.lms_lessons (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.lms_accounts (user_id) on delete cascade,
  module_id uuid not null references public.lms_modules (id) on delete cascade,
  title text not null,
  body text not null default '',
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint lms_lessons_title_len check (char_length(title) between 1 and 120),
  constraint lms_lessons_body_len check (char_length(body) <= 8000),
  constraint lms_lessons_sort check (sort_order between 0 and 10000)
);

create index if not exists lms_lessons_module_idx
  on public.lms_lessons (module_id, sort_order, created_at);

create index if not exists lms_lessons_mentor_idx
  on public.lms_lessons (mentor_id, published);

create table if not exists public.lms_materials (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.lms_accounts (user_id) on delete cascade,
  lesson_id uuid not null references public.lms_lessons (id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  mime text not null,
  byte_size int not null,
  created_at timestamptz not null default now(),
  constraint lms_materials_name_len check (char_length(name) between 1 and 180),
  constraint lms_materials_size check (byte_size > 0 and byte_size <= 52428800)
);

create unique index if not exists lms_materials_one_per_lesson
  on public.lms_materials (lesson_id);

-- Caller helpers. Security definer so policies can read lms_accounts
-- without recursing through that table's own RLS.

create or replace function public.lms_is_mentor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_accounts
    where user_id = auth.uid()
      and role = 'mentor'
  );
$$;

create or replace function public.lms_my_mentor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when role = 'mentor' then user_id
    else mentor_id
  end
  from public.lms_accounts
  where user_id = auth.uid();
$$;

create or replace function public.lms_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me public.lms_accounts;
  v_mentor_name text;
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
    select display_name into v_mentor_name
    from public.lms_accounts
    where user_id = v_me.mentor_id
      and role = 'mentor';
  else
    v_mentor_name := v_me.display_name;
  end if;
  return jsonb_build_object(
    'user_id', v_me.user_id,
    'role', v_me.role,
    'display_name', v_me.display_name,
    'mentor_name', v_mentor_name
  );
end;
$$;

-- True only when the caller is a student of the mentor who owns this
-- exact object, and a published lesson points at it.
create or replace function public.lms_can_read_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_materials mat
    join public.lms_lessons les on les.id = mat.lesson_id
    join public.lms_accounts me on me.user_id = auth.uid()
    where mat.storage_path = p_name
      and les.published
      and me.role = 'student'
      and me.mentor_id = mat.mentor_id
      and les.mentor_id = mat.mentor_id
  );
$$;

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
  end if;
  return new;
end;
$$;

drop trigger if exists lms_accounts_guard on public.lms_accounts;
create trigger lms_accounts_guard
  before insert or update on public.lms_accounts
  for each row execute function public.lms_accounts_guard();

create or replace function public.lms_modules_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.mentor_id is distinct from old.mentor_id
    or old.mentor_id is distinct from v_me
  ) then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  new.mentor_id := v_me;
  new.title := left(btrim(coalesce(new.title, '')), 120);
  if char_length(new.title) < 1 then
    raise exception 'lms_title' using errcode = '22023';
  end if;
  new.sort_order := least(greatest(coalesce(new.sort_order, 0), 0), 10000);
  return new;
end;
$$;

drop trigger if exists lms_modules_stamp on public.lms_modules;
create trigger lms_modules_stamp
  before insert or update on public.lms_modules
  for each row execute function public.lms_modules_stamp();

create or replace function public.lms_lessons_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.mentor_id is distinct from old.mentor_id
    or old.mentor_id is distinct from v_me
  ) then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.lms_modules m
    where m.id = new.module_id
      and m.mentor_id = v_me
  ) then
    raise exception 'lms_module' using errcode = '23503';
  end if;
  new.mentor_id := v_me;
  new.title := left(btrim(coalesce(new.title, '')), 120);
  new.body := left(coalesce(new.body, ''), 8000);
  if char_length(new.title) < 1 then
    raise exception 'lms_title' using errcode = '22023';
  end if;
  new.published := coalesce(new.published, false);
  new.sort_order := least(greatest(coalesce(new.sort_order, 0), 0), 10000);
  return new;
end;
$$;

drop trigger if exists lms_lessons_stamp on public.lms_lessons;
create trigger lms_lessons_stamp
  before insert or update on public.lms_lessons
  for each row execute function public.lms_lessons_stamp();

create or replace function public.lms_materials_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_path text;
begin
  if v_me is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.mentor_id is distinct from old.mentor_id
       or new.lesson_id is distinct from old.lesson_id
       or new.storage_path is distinct from old.storage_path
       or old.mentor_id is distinct from v_me then
      raise exception 'lms_locked' using errcode = '42501';
    end if;
    new.mentor_id := v_me;
    new.name := left(btrim(coalesce(new.name, '')), 180);
    if char_length(new.name) < 1 then
      raise exception 'lms_name' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  if not exists (
    select 1
    from public.lms_lessons les
    where les.id = new.lesson_id
      and les.mentor_id = v_me
  ) then
    raise exception 'lms_lesson' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.lms_materials other
    where other.lesson_id = new.lesson_id
  ) then
    raise exception 'lms_one_file' using errcode = '23505';
  end if;
  v_path := v_me::text || '/' || new.id::text;
  if coalesce(new.storage_path, '') <> '' and new.storage_path <> v_path then
    raise exception 'lms_path' using errcode = '42501';
  end if;
  if position(v_me::text || '/' in v_path) <> 1 then
    raise exception 'lms_path' using errcode = '42501';
  end if;
  new.mentor_id := v_me;
  new.storage_path := v_path;
  new.name := left(btrim(coalesce(new.name, '')), 180);
  new.mime := lower(btrim(coalesce(new.mime, '')));
  if char_length(new.name) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if new.mime not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'application/octet-stream'
  ) then
    raise exception 'lms_mime' using errcode = '22023';
  end if;
  if new.byte_size is null or new.byte_size < 1 or new.byte_size > 52428800 then
    raise exception 'lms_size' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists lms_materials_stamp on public.lms_materials;
create trigger lms_materials_stamp
  before insert or update on public.lms_materials
  for each row execute function public.lms_materials_stamp();

create or replace function public.lms_material_purge()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  delete from storage.objects
  where bucket_id = 'lms-materials'
    and name = old.storage_path;
  return old;
end;
$$;

drop trigger if exists lms_material_purge on public.lms_materials;
create trigger lms_material_purge
  after delete on public.lms_materials
  for each row execute function public.lms_material_purge();

create or replace function public.lms_register_mentor(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_row public.lms_accounts;
begin
  if v_uid is null then
    raise exception 'lms_auth' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if exists (select 1 from public.lms_accounts where user_id = v_uid) then
    raise exception 'lms_exists' using errcode = '23505';
  end if;
  insert into public.lms_accounts (user_id, role, mentor_id, display_name)
  values (v_uid, 'mentor', null, v_name)
  returning * into v_row;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'mentor_name', v_row.display_name
  );
end;
$$;

create or replace function public.lms_create_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_hash text;
  v_exp timestamptz := now() + interval '14 days';
begin
  if v_uid is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex');
  insert into public.lms_invites (mentor_id, token_hash, expires_at)
  values (v_uid, v_hash, v_exp);
  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_exp
  );
end;
$$;

create or replace function public.lms_accept_invite(p_token text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
  v_hash text;
  v_inv public.lms_invites;
  v_name text;
  v_row public.lms_accounts;
  v_mentor_name text;
begin
  if v_uid is null then
    raise exception 'lms_auth' using errcode = '28000';
  end if;
  if v_token = '' then
    raise exception 'lms_invite' using errcode = '22023';
  end if;
  if exists (select 1 from public.lms_accounts where user_id = v_uid) then
    raise exception 'lms_exists' using errcode = '23505';
  end if;
  v_hash := encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex');
  select * into v_inv
  from public.lms_invites
  where token_hash = v_hash
  for update;
  if not found
     or v_inv.used_at is not null
     or v_inv.expires_at <= now()
     or not exists (
       select 1 from public.lms_accounts mentor
       where mentor.user_id = v_inv.mentor_id
         and mentor.role = 'mentor'
     ) then
    raise exception 'lms_invite' using errcode = '22023';
  end if;
  select left(btrim(coalesce(
    p_name,
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1),
    'Siswa'
  )), 80)
  into v_name
  from auth.users
  where id = v_uid;
  if coalesce(v_name, '') = '' then
    v_name := 'Siswa';
  end if;
  insert into public.lms_accounts (user_id, role, mentor_id, display_name)
  values (v_uid, 'student', v_inv.mentor_id, v_name)
  returning * into v_row;
  update public.lms_invites
  set used_by = v_uid,
      used_at = now()
  where id = v_inv.id;
  select display_name into v_mentor_name
  from public.lms_accounts
  where user_id = v_row.mentor_id;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'mentor_name', v_mentor_name
  );
end;
$$;

revoke all on function public.lms_is_mentor() from public, anon;
revoke all on function public.lms_my_mentor() from public, anon;
revoke all on function public.lms_me() from public, anon;
revoke all on function public.lms_can_read_object(text) from public, anon;
revoke all on function public.lms_register_mentor(text) from public, anon;
revoke all on function public.lms_create_invite() from public, anon;
revoke all on function public.lms_accept_invite(text, text) from public, anon;
revoke all on function public.lms_accounts_guard() from public, anon;
revoke all on function public.lms_modules_stamp() from public, anon;
revoke all on function public.lms_lessons_stamp() from public, anon;
revoke all on function public.lms_materials_stamp() from public, anon;
revoke all on function public.lms_material_purge() from public, anon;

grant execute on function public.lms_is_mentor() to authenticated;
grant execute on function public.lms_my_mentor() to authenticated;
grant execute on function public.lms_me() to authenticated;
grant execute on function public.lms_can_read_object(text) to authenticated;
grant execute on function public.lms_register_mentor(text) to authenticated;
grant execute on function public.lms_create_invite() to authenticated;
grant execute on function public.lms_accept_invite(text, text) to authenticated;

alter table public.lms_accounts enable row level security;
alter table public.lms_invites enable row level security;
alter table public.lms_modules enable row level security;
alter table public.lms_lessons enable row level security;
alter table public.lms_materials enable row level security;

drop policy if exists lms_accounts_select on public.lms_accounts;
create policy lms_accounts_select on public.lms_accounts
  for select to authenticated
  using (user_id = auth.uid() or mentor_id = auth.uid());

drop policy if exists lms_accounts_update on public.lms_accounts;
create policy lms_accounts_update on public.lms_accounts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists lms_invites_select on public.lms_invites;
create policy lms_invites_select on public.lms_invites
  for select to authenticated
  using (mentor_id = auth.uid() and public.lms_is_mentor());

drop policy if exists lms_modules_select on public.lms_modules;
create policy lms_modules_select on public.lms_modules
  for select to authenticated
  using (
    mentor_id = auth.uid()
    or (
      mentor_id = public.lms_my_mentor()
      and exists (
        select 1
        from public.lms_lessons les
        where les.module_id = lms_modules.id
          and les.published
          and les.mentor_id = lms_modules.mentor_id
      )
    )
  );

drop policy if exists lms_modules_write on public.lms_modules;
create policy lms_modules_write on public.lms_modules
  for all to authenticated
  using (mentor_id = auth.uid() and public.lms_is_mentor())
  with check (mentor_id = auth.uid() and public.lms_is_mentor());

drop policy if exists lms_lessons_select on public.lms_lessons;
create policy lms_lessons_select on public.lms_lessons
  for select to authenticated
  using (
    mentor_id = auth.uid()
    or (published and mentor_id = public.lms_my_mentor())
  );

drop policy if exists lms_lessons_write on public.lms_lessons;
create policy lms_lessons_write on public.lms_lessons
  for all to authenticated
  using (mentor_id = auth.uid() and public.lms_is_mentor())
  with check (mentor_id = auth.uid() and public.lms_is_mentor());

drop policy if exists lms_materials_select on public.lms_materials;
create policy lms_materials_select on public.lms_materials
  for select to authenticated
  using (
    mentor_id = auth.uid()
    or (
      mentor_id = public.lms_my_mentor()
      and exists (
        select 1
        from public.lms_lessons les
        where les.id = lms_materials.lesson_id
          and les.published
          and les.mentor_id = lms_materials.mentor_id
      )
    )
  );

drop policy if exists lms_materials_write on public.lms_materials;
create policy lms_materials_write on public.lms_materials
  for all to authenticated
  using (mentor_id = auth.uid() and public.lms_is_mentor())
  with check (mentor_id = auth.uid() and public.lms_is_mentor());

revoke all on table public.lms_accounts from public, anon;
revoke all on table public.lms_invites from public, anon;
revoke all on table public.lms_modules from public, anon;
revoke all on table public.lms_lessons from public, anon;
revoke all on table public.lms_materials from public, anon;

grant select, update on table public.lms_accounts to authenticated;
grant select on table public.lms_invites to authenticated;
grant select, insert, update, delete on table public.lms_modules to authenticated;
grant select, insert, update, delete on table public.lms_lessons to authenticated;
grant select, insert, update, delete on table public.lms_materials to authenticated;

insert into storage.buckets (id, name, public)
values ('lms-materials', 'lms-materials', false)
on conflict (id) do update set public = false;

drop policy if exists lms_materials_object_select on storage.objects;
create policy lms_materials_object_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lms-materials'
    and (
      (
        public.lms_is_mentor()
        and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      )
      or public.lms_can_read_object(name)
    )
  );

drop policy if exists lms_materials_object_insert on storage.objects;
create policy lms_materials_object_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lms-materials'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

drop policy if exists lms_materials_object_update on storage.objects;
create policy lms_materials_object_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lms-materials'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  )
  with check (
    bucket_id = 'lms-materials'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

drop policy if exists lms_materials_object_delete on storage.objects;
create policy lms_materials_object_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lms-materials'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  );

notify pgrst, 'reload schema';

commit;
