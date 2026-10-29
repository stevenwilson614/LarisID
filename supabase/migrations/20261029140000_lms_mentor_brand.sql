-- Mentor school brand for browser tab + invite share previews.
-- org_name + avatar_url are public via lms_invite_brand only (token must match).
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261029140000_lms_mentor_brand.sql

begin;

alter table public.lms_accounts
  add column if not exists org_name text,
  add column if not exists avatar_url text;

update public.lms_accounts
set org_name = display_name
where role = 'mentor'
  and (org_name is null or btrim(org_name) = '');

create or replace function public.lms_brand_title(p_org text, p_fallback text)
returns text
language sql
immutable
as $$
  select 'LMS (' || left(btrim(coalesce(nullif(btrim(p_org), ''), nullif(btrim(p_fallback), ''), 'Kelas')), 80) || ')';
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
  v_mentor public.lms_accounts;
  v_org text;
  v_avatar text;
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
  else
    v_org := coalesce(v_me.org_name, v_me.display_name);
    v_avatar := v_me.avatar_url;
  end if;
  return jsonb_build_object(
    'user_id', v_me.user_id,
    'role', v_me.role,
    'display_name', v_me.display_name,
    'org_name', v_org,
    'avatar_url', v_avatar,
    'mentor_name', case when v_me.role = 'student' then v_mentor.display_name else v_me.display_name end,
    'brand_title', public.lms_brand_title(v_org, v_me.display_name)
  );
end;
$$;

drop function if exists public.lms_register_mentor(text);
drop function if exists public.lms_register_mentor(text, text);

drop function if exists public.lms_register_mentor(text);

create or replace function public.lms_register_mentor(p_name text, p_org text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_org text := left(btrim(coalesce(p_org, p_name, '')), 80);
  v_row public.lms_accounts;
begin
  if v_uid is null then
    raise exception 'lms_auth' using errcode = '28000';
  end if;
  if char_length(v_name) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if char_length(v_org) < 1 then
    v_org := v_name;
  end if;
  if exists (select 1 from public.lms_accounts where user_id = v_uid) then
    raise exception 'lms_exists' using errcode = '23505';
  end if;
  insert into public.lms_accounts (user_id, role, mentor_id, display_name, org_name)
  values (v_uid, 'mentor', null, v_name, v_org)
  returning * into v_row;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'org_name', v_row.org_name,
    'avatar_url', v_row.avatar_url,
    'mentor_name', v_row.display_name,
    'brand_title', public.lms_brand_title(v_row.org_name, v_row.display_name)
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
  v_mentor public.lms_accounts;
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
  select * into v_mentor
  from public.lms_accounts
  where user_id = v_row.mentor_id;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'org_name', coalesce(v_mentor.org_name, v_mentor.display_name),
    'avatar_url', v_mentor.avatar_url,
    'mentor_name', v_mentor.display_name,
    'brand_title', public.lms_brand_title(v_mentor.org_name, v_mentor.display_name)
  );
end;
$$;

create or replace function public.lms_update_brand(p_org text, p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org text := left(btrim(coalesce(p_org, '')), 80);
  v_avatar text;
  v_row public.lms_accounts;
begin
  if v_uid is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if char_length(v_org) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if p_avatar_url is null then
    v_avatar := null; -- keep existing avatar
  else
    v_avatar := left(btrim(p_avatar_url), 500);
    if v_avatar <> '' and v_avatar !~* '^https://' then
      raise exception 'lms_path' using errcode = '22023';
    end if;
  end if;
  update public.lms_accounts
  set org_name = v_org,
      avatar_url = case
        when p_avatar_url is null then avatar_url
        else nullif(v_avatar, '')
      end
  where user_id = v_uid
    and role = 'mentor'
  returning * into v_row;
  if not found then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'org_name', v_row.org_name,
    'avatar_url', v_row.avatar_url,
    'mentor_name', v_row.display_name,
    'brand_title', public.lms_brand_title(v_row.org_name, v_row.display_name)
  );
end;
$$;

-- Public brand lookup for invite share cards / crawlers. Returns only
-- title + avatar — never curriculum or student data.
create or replace function public.lms_invite_brand(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_hash text;
  v_mentor public.lms_accounts;
begin
  if v_token = '' or char_length(v_token) > 128 then
    return null;
  end if;
  v_hash := encode(extensions.digest(convert_to(v_token, 'utf8'), 'sha256'), 'hex');
  select m.* into v_mentor
  from public.lms_invites i
  join public.lms_accounts m on m.user_id = i.mentor_id and m.role = 'mentor'
  where i.token_hash = v_hash
    and i.expires_at > now();
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'org_name', coalesce(nullif(btrim(v_mentor.org_name), ''), v_mentor.display_name),
    'avatar_url', v_mentor.avatar_url,
    'brand_title', public.lms_brand_title(v_mentor.org_name, v_mentor.display_name)
  );
end;
$$;

revoke all on function public.lms_brand_title(text, text) from public, anon;
revoke all on function public.lms_update_brand(text, text) from public, anon;
revoke all on function public.lms_invite_brand(text) from public;

grant execute on function public.lms_brand_title(text, text) to authenticated;
grant execute on function public.lms_update_brand(text, text) to authenticated;
grant execute on function public.lms_invite_brand(text) to anon, authenticated;
grant execute on function public.lms_register_mentor(text, text) to authenticated;
grant execute on function public.lms_me() to authenticated;
grant execute on function public.lms_accept_invite(text, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('lms-avatars', 'lms-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists lms_avatars_public_read on storage.objects;
create policy lms_avatars_public_read on storage.objects
  for select
  using (bucket_id = 'lms-avatars');

drop policy if exists lms_avatars_mentor_write on storage.objects;
create policy lms_avatars_mentor_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lms-avatars'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/avatar\.(jpg|jpeg|png|webp)$')
  );

drop policy if exists lms_avatars_mentor_update on storage.objects;
create policy lms_avatars_mentor_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lms-avatars'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/avatar\.(jpg|jpeg|png|webp)$')
  )
  with check (
    bucket_id = 'lms-avatars'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/avatar\.(jpg|jpeg|png|webp)$')
  );

drop policy if exists lms_avatars_mentor_delete on storage.objects;
create policy lms_avatars_mentor_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lms-avatars'
    and public.lms_is_mentor()
    and name ~ ('^' || auth.uid()::text || '/avatar\.(jpg|jpeg|png|webp)$')
  );

notify pgrst, 'reload schema';

commit;
