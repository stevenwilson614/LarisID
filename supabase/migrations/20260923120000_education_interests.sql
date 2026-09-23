-- ============================================================================
-- Education interest — logged-in "Ya, saya tertarik" capture.
--
-- Why this exists: the in-app Edukasi panel and popup collect a yes from people
-- already using LarisID. That is a different job from public.larisrise_applications
-- (anonymous essays, gates, 20 seats). Follow-up may be an independent mentor
-- or the next course, so we store interest only — not enrollment.
--
-- Access model:
--   * Submitters are authenticated. education_submit_interest() is the only
--     write path and stamps auth.uid().
--   * The table has RLS on and NO policies. Reads go through
--     education_interest_mine() (own row) and education_interests_list()
--     (reviewers / platform admins).
-- ============================================================================

begin;

create table if not exists public.education_interests (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email        text,
  whatsapp     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_education_interests_created
  on public.education_interests (created_at desc);

alter table public.education_interests enable row level security;
-- No policies, on purpose. Same pattern as larisrise_applications.

create or replace function public.education_interest_mine()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.education_interests;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'login_required');
  end if;
  select * into v_row from public.education_interests where user_id = v_uid;
  return json_build_object(
    'ok', true,
    'interested', v_row.user_id is not null,
    'created_at', v_row.created_at,
    'can_list', public.rise_is_reviewer() or public.is_platform_admin()
  );
end;
$$;

revoke all on function public.education_interest_mine() from public, anon, authenticated;
grant execute on function public.education_interest_mine() to authenticated;

create or replace function public.education_submit_interest(
  p_name text,
  p_email text default null,
  p_whatsapp text default null
)
returns json
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
  v_wa text;
  v_auth_email text;
  v_profile_name text;
  v_profile_email text;
  v_profile_wa text;
  v_already boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'Masuk dulu untuk mencatat minat.');
  end if;

  select
    nullif(btrim(u.email), ''),
    nullif(btrim(p.display_name), ''),
    nullif(btrim(p.contact_email), ''),
    public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                       nullif(btrim(p.public_whatsapp), '')))
    into v_auth_email, v_profile_name, v_profile_email, v_profile_wa
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.id = v_uid;

  if v_auth_email is not null and v_auth_email ilike '%@wa.larisid.com' then
    v_auth_email := null;
  end if;

  v_name := left(btrim(coalesce(nullif(btrim(p_name), ''), v_profile_name, '')), 80);
  if v_name is null or length(v_name) < 2 then
    return json_build_object('ok', false, 'error', 'Nama wajib diisi.');
  end if;
  if v_name ~ '@' or v_name ~ '^[0-9+().\s-]{9,}$' then
    return json_build_object('ok', false, 'error', 'Pakai nama kamu, bukan nomor atau email.');
  end if;

  v_email := lower(left(btrim(coalesce(nullif(btrim(p_email), ''), v_profile_email, v_auth_email, '')), 160));
  if v_email = '' or v_email ilike '%@wa.larisid.com' then
    v_email := null;
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'Masukkan alamat email yang valid.');
  end if;

  v_wa := public.normalise_wa_phone(coalesce(nullif(btrim(p_whatsapp), ''), v_profile_wa));
  if v_email is null and v_wa is null then
    return json_build_object('ok', false, 'error', 'Isi email atau WhatsApp — salah satu cukup.');
  end if;

  select exists(select 1 from public.education_interests e where e.user_id = v_uid)
    into v_already;

  insert into public.education_interests (user_id, display_name, email, whatsapp)
  values (v_uid, v_name, v_email, v_wa)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        email        = coalesce(excluded.email, public.education_interests.email),
        whatsapp     = coalesce(excluded.whatsapp, public.education_interests.whatsapp);

  insert into public.user_profiles (user_id, display_name, first_name, wa_number, contact_email, updated_at)
  values (
    v_uid,
    v_name,
    split_part(v_name, ' ', 1),
    v_wa,
    v_email,
    now()
  )
  on conflict (user_id) do update
    set display_name = coalesce(nullif(btrim(public.user_profiles.display_name), ''), excluded.display_name),
        first_name   = case
                         when nullif(btrim(public.user_profiles.first_name), '') is null
                         then excluded.first_name
                         else public.user_profiles.first_name
                       end,
        wa_number    = coalesce(nullif(btrim(public.user_profiles.wa_number), ''), excluded.wa_number),
        contact_email = coalesce(nullif(btrim(public.user_profiles.contact_email), ''), excluded.contact_email),
        updated_at   = now();

  return json_build_object('ok', true, 'already', v_already);
end;
$$;

revoke all on function public.education_submit_interest(text, text, text) from public, anon, authenticated;
grant execute on function public.education_submit_interest(text, text, text) to authenticated;

create or replace function public.education_interests_list()
returns table (
  user_id uuid,
  display_name text,
  email text,
  whatsapp text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select e.user_id, e.display_name, e.email, e.whatsapp, e.created_at
    from public.education_interests e
   where public.rise_is_reviewer() or public.is_platform_admin()
   order by e.created_at desc;
$$;

revoke all on function public.education_interests_list() from public, anon, authenticated;
grant execute on function public.education_interests_list() to authenticated;

commit;
