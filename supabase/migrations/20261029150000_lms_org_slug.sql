-- Stable school URL /lms/{org_slug}/ for invite join + returning student sign-in.
-- Public brand by slug is title + avatar only (never curriculum).
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261029150000_lms_org_slug.sql

begin;

alter table public.lms_accounts
  add column if not exists org_slug text;

create unique index if not exists lms_accounts_org_slug_uidx
  on public.lms_accounts (org_slug)
  where role = 'mentor' and org_slug is not null;

create or replace function public.lms_slugify(p_raw text)
returns text
language sql
immutable
as $$
  select nullif(
    left(
      trim(both '-' from regexp_replace(lower(btrim(coalesce(p_raw, ''))), '[^a-z0-9]+', '-', 'g')),
      48
    ),
    ''
  );
$$;

create or replace function public.lms_allocate_slug(p_raw text, p_exclude uuid default null)
returns text
language plpgsql
as $$
declare
  v_base text := coalesce(public.lms_slugify(p_raw), 'kelas');
  v_slug text;
  v_n int := 0;
begin
  if v_base in ('card', 'js', 'css', 'api', 'static', 'assets', 'index', 'login', 'auth') then
    v_base := v_base || '-kelas';
  end if;
  v_slug := v_base;
  while exists (
    select 1
    from public.lms_accounts a
    where a.role = 'mentor'
      and a.org_slug = v_slug
      and (p_exclude is null or a.user_id <> p_exclude)
  ) loop
    v_n := v_n + 1;
    v_slug := left(v_base, 40) || '-' || v_n::text;
  end loop;
  return v_slug;
end;
$$;

update public.lms_accounts a
set org_slug = public.lms_allocate_slug(coalesce(a.org_name, a.display_name), a.user_id)
where a.role = 'mentor'
  and (a.org_slug is null or btrim(a.org_slug) = '');

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
    'brand_title', public.lms_brand_title(v_org, v_me.display_name)
  );
end;
$$;

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
  v_slug text;
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
  v_slug := public.lms_allocate_slug(v_org, v_uid);
  insert into public.lms_accounts (user_id, role, mentor_id, display_name, org_name, org_slug)
  values (v_uid, 'mentor', null, v_name, v_org, v_slug)
  returning * into v_row;
  return jsonb_build_object(
    'user_id', v_row.user_id,
    'role', v_row.role,
    'display_name', v_row.display_name,
    'org_name', v_row.org_name,
    'org_slug', v_row.org_slug,
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
    'org_slug', v_mentor.org_slug,
    'avatar_url', v_mentor.avatar_url,
    'mentor_name', v_mentor.display_name,
    'brand_title', public.lms_brand_title(v_mentor.org_name, v_mentor.display_name)
  );
end;
$$;

drop function if exists public.lms_update_brand(text, text);

create or replace function public.lms_update_brand(
  p_org text,
  p_avatar_url text default null,
  p_slug text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org text := left(btrim(coalesce(p_org, '')), 80);
  v_avatar text;
  v_slug text;
  v_row public.lms_accounts;
begin
  if v_uid is null or not public.lms_is_mentor() then
    raise exception 'lms_forbidden' using errcode = '42501';
  end if;
  if char_length(v_org) < 1 then
    raise exception 'lms_name' using errcode = '22023';
  end if;
  if p_avatar_url is null then
    v_avatar := null;
  else
    v_avatar := left(btrim(p_avatar_url), 500);
    if v_avatar <> '' and v_avatar !~* '^https://' then
      raise exception 'lms_path' using errcode = '22023';
    end if;
  end if;
  if p_slug is null then
    select org_slug into v_slug from public.lms_accounts where user_id = v_uid;
    if v_slug is null or btrim(v_slug) = '' then
      v_slug := public.lms_allocate_slug(v_org, v_uid);
    end if;
  else
    v_slug := public.lms_slugify(p_slug);
    if v_slug is null then
      raise exception 'lms_name' using errcode = '22023';
    end if;
    if v_slug in ('card', 'js', 'css', 'api', 'static', 'assets', 'index', 'login', 'auth') then
      raise exception 'lms_name' using errcode = '22023';
    end if;
    v_slug := public.lms_allocate_slug(v_slug, v_uid);
  end if;
  update public.lms_accounts
  set org_name = v_org,
      org_slug = v_slug,
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
    'org_slug', v_row.org_slug,
    'avatar_url', v_row.avatar_url,
    'mentor_name', v_row.display_name,
    'brand_title', public.lms_brand_title(v_row.org_name, v_row.display_name)
  );
end;
$$;

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
    'org_slug', v_mentor.org_slug,
    'avatar_url', v_mentor.avatar_url,
    'brand_title', public.lms_brand_title(v_mentor.org_name, v_mentor.display_name)
  );
end;
$$;

-- Returning students / school gate: brand only, keyed by slug (no invite token).
create or replace function public.lms_org_brand(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_slug text := public.lms_slugify(p_slug);
  v_mentor public.lms_accounts;
begin
  if v_slug is null then
    return null;
  end if;
  select * into v_mentor
  from public.lms_accounts
  where role = 'mentor'
    and org_slug = v_slug;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'org_name', coalesce(nullif(btrim(v_mentor.org_name), ''), v_mentor.display_name),
    'org_slug', v_mentor.org_slug,
    'avatar_url', v_mentor.avatar_url,
    'brand_title', public.lms_brand_title(v_mentor.org_name, v_mentor.display_name)
  );
end;
$$;

revoke all on function public.lms_slugify(text) from public, anon;
revoke all on function public.lms_allocate_slug(text, uuid) from public, anon;
revoke all on function public.lms_update_brand(text, text, text) from public, anon;
revoke all on function public.lms_org_brand(text) from public;
revoke all on function public.lms_invite_brand(text) from public;

grant execute on function public.lms_update_brand(text, text, text) to authenticated;
grant execute on function public.lms_org_brand(text) to anon, authenticated;
grant execute on function public.lms_invite_brand(text) to anon, authenticated;
grant execute on function public.lms_me() to authenticated;
grant execute on function public.lms_register_mentor(text, text) to authenticated;
grant execute on function public.lms_accept_invite(text, text) to authenticated;

commit;
