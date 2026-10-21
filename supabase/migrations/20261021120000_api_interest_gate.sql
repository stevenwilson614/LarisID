-- API interest gate: WhatsApp + kota are required, and the admin list
-- can see kota / toko. notified_at stops a second email for the same yes.

begin;

alter table public.api_interests
  add column if not exists notified_at timestamptz;

drop function if exists public.api_submit_interest(boolean, text[], text[], text, text, text, text, text);

create or replace function public.api_submit_interest(
  p_interested boolean,
  p_platforms text[] default '{}',
  p_use_cases text[] default '{}',
  p_other_note text default null,
  p_decline_reason text default null,
  p_name text default null,
  p_email text default null,
  p_whatsapp text default null,
  p_city text default null,
  p_seller_status text default null
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
  v_wa_raw text;
  v_wa_profile text;
  v_auth_email text;
  v_profile_name text;
  v_profile_email text;
  v_profile_wa text;
  v_profile_city text;
  v_platforms text[];
  v_uses text[];
  v_note text;
  v_decline text;
  v_city text;
  v_seller text;
  v_already boolean := false;
  v_was_interested boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'Masuk dulu untuk mencatat minat.');
  end if;
  if p_interested is null then
    return json_build_object('ok', false, 'error', 'Pilih ya atau tidak.');
  end if;

  select
    nullif(btrim(u.email), ''),
    nullif(btrim(p.display_name), ''),
    nullif(btrim(p.contact_email), ''),
    public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                       nullif(btrim(p.public_whatsapp), ''))),
    nullif(btrim(p.city), '')
    into v_auth_email, v_profile_name, v_profile_email, v_profile_wa, v_profile_city
  from auth.users u
  left join public.user_profiles p on p.user_id = u.id
  where u.id = v_uid;

  if v_auth_email is not null and v_auth_email ilike '%@wa.larisid.com' then
    v_auth_email := null;
  end if;

  v_platforms := (
    select coalesce(array_agg(s.x order by s.x), '{}'::text[])
    from (
      select distinct btrim(t) as x
      from unnest(coalesce(p_platforms, '{}'::text[])) as u(t)
      where btrim(t) in ('sheets', 'app', 'bot', 'zapier', 'warehouse', 'other')
    ) s
  );
  v_uses := (
    select coalesce(array_agg(s.x order by s.x), '{}'::text[])
    from (
      select distinct btrim(t) as x
      from unnest(coalesce(p_use_cases, '{}'::text[])) as u(t)
      where btrim(t) in ('search', 'omset', 'deepdive', 'alert', 'export', 'other')
    ) s
  );
  v_note := nullif(left(btrim(coalesce(p_other_note, '')), 240), '');
  v_decline := nullif(btrim(coalesce(p_decline_reason, '')), '');
  if v_decline is not null and v_decline not in ('curious', 'ui_enough', 'too_hard') then
    v_decline := null;
  end if;

  if p_interested then
    v_decline := null;
    if cardinality(v_platforms) = 0 and cardinality(v_uses) = 0 then
      return json_build_object('ok', false, 'error', 'Pilih minimal satu platform atau kebutuhan.');
    end if;
  else
    v_platforms := '{}'::text[];
    v_uses := '{}'::text[];
  end if;

  v_name := left(btrim(coalesce(nullif(btrim(p_name), ''), v_profile_name, '')), 80);
  if p_interested then
    if v_name is null or length(v_name) < 2 then
      return json_build_object('ok', false, 'error', 'Nama wajib diisi.');
    end if;
    if v_name ~ '@' or v_name ~ '^[0-9+().\s-]{9,}$' then
      return json_build_object('ok', false, 'error', 'Pakai nama kamu, bukan nomor atau email.');
    end if;
  elsif v_name is null or length(v_name) < 2 or v_name ~ '@' or v_name ~ '^[0-9+().\s-]{9,}$' then
    v_name := 'Pengguna';
  end if;

  v_email := lower(left(btrim(coalesce(nullif(btrim(p_email), ''), v_profile_email, v_auth_email, '')), 160));
  if v_email = '' or v_email ilike '%@wa.larisid.com' then
    v_email := null;
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    v_email := null;
  end if;

  v_wa_raw := nullif(btrim(p_whatsapp), '');
  v_wa := public.normalise_wa_phone(coalesce(v_wa_raw, v_profile_wa));
  if v_wa is null and v_wa_raw is not null then
    v_wa_raw := regexp_replace(v_wa_raw, '[\s\-().]', '', 'g');
    if v_wa_raw ~ '^\+[1-9][0-9]{7,14}$' then
      v_wa := v_wa_raw;
    end if;
  end if;
  if v_wa is null then
    return json_build_object('ok', false, 'error', 'Nomor WhatsApp wajib diisi.');
  end if;
  v_wa_profile := public.normalise_wa_phone(v_wa);

  v_city := nullif(left(btrim(coalesce(p_city, '')), 80), '');
  if v_city is null then
    v_city := v_profile_city;
  end if;
  if v_city is null then
    select nullif(left(btrim(coalesce(o.region, '')), 80), '')
      into v_city
      from public.user_onboarding_prefs o
     where o.user_id = v_uid;
  end if;
  if v_city is null or length(v_city) < 2 then
    return json_build_object('ok', false, 'error', 'Pilih kota kamu dulu.');
  end if;

  v_seller := nullif(btrim(coalesce(p_seller_status, '')), '');
  if v_seller is not null and v_seller not in ('first_time', 'existing') then
    v_seller := null;
  end if;

  select e.interested
    into v_was_interested
    from public.api_interests e
   where e.user_id = v_uid;
  v_already := FOUND;

  insert into public.api_interests (
    user_id, interested, platforms, use_cases, other_note, decline_reason,
    display_name, email, whatsapp, updated_at
  )
  values (
    v_uid, p_interested, v_platforms, v_uses, v_note, v_decline,
    v_name, v_email, v_wa, now()
  )
  on conflict (user_id) do update
    set interested     = excluded.interested,
        platforms      = excluded.platforms,
        use_cases      = excluded.use_cases,
        other_note     = excluded.other_note,
        decline_reason = excluded.decline_reason,
        display_name   = excluded.display_name,
        email          = coalesce(excluded.email, public.api_interests.email),
        whatsapp       = coalesce(excluded.whatsapp, public.api_interests.whatsapp),
        notified_at    = case
                           when excluded.interested and not coalesce(public.api_interests.interested, false)
                           then null
                           else public.api_interests.notified_at
                         end,
        updated_at     = now();

  insert into public.user_profiles (
    user_id, display_name, first_name, wa_number, contact_email, city, seller_status, updated_at
  )
  values (
    v_uid,
    case when v_name = 'Pengguna' then '' else v_name end,
    case when v_name = 'Pengguna' then '' else split_part(v_name, ' ', 1) end,
    v_wa_profile,
    v_email,
    v_city,
    v_seller,
    now()
  )
  on conflict (user_id) do update
    set display_name = coalesce(nullif(btrim(public.user_profiles.display_name), ''), nullif(excluded.display_name, '')),
        first_name   = case
                         when nullif(btrim(public.user_profiles.first_name), '') is null
                         then coalesce(nullif(excluded.first_name, ''), public.user_profiles.first_name)
                         else public.user_profiles.first_name
                       end,
        wa_number    = coalesce(v_wa_profile, nullif(btrim(public.user_profiles.wa_number), '')),
        contact_email = coalesce(nullif(btrim(public.user_profiles.contact_email), ''), excluded.contact_email),
        city         = coalesce(nullif(btrim(excluded.city), ''), public.user_profiles.city),
        seller_status = coalesce(excluded.seller_status, public.user_profiles.seller_status),
        updated_at   = now();

  insert into public.user_onboarding_prefs (user_id, region, seller_status, updated_at)
  values (v_uid, v_city, v_seller, now())
  on conflict (user_id) do update
    set region = coalesce(excluded.region, public.user_onboarding_prefs.region),
        seller_status = coalesce(excluded.seller_status, public.user_onboarding_prefs.seller_status),
        updated_at = now();

  return json_build_object(
    'ok', true,
    'already', v_already,
    'interested', p_interested,
    'was_interested', v_was_interested
  );
end;
$$;

revoke all on function public.api_submit_interest(boolean, text[], text[], text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.api_submit_interest(boolean, text[], text[], text, text, text, text, text, text, text) to authenticated;

drop function if exists public.api_interests_list();

create function public.api_interests_list()
returns table (
  user_id uuid,
  interested boolean,
  platforms text[],
  use_cases text[],
  other_note text,
  decline_reason text,
  display_name text,
  email text,
  whatsapp text,
  city text,
  seller_status text,
  store_name text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return;
  end if;
  return query
    select e.user_id, e.interested, e.platforms, e.use_cases, e.other_note,
           e.decline_reason, e.display_name, e.email, e.whatsapp,
           coalesce(nullif(btrim(up.city), ''), nullif(btrim(ob.region), '')) as city,
           coalesce(ob.seller_status, up.seller_status) as seller_status,
           nullif(btrim(up.shopee_store_name), '') as store_name,
           e.created_at, e.updated_at
      from public.api_interests e
      left join public.user_profiles up on up.user_id = e.user_id
      left join public.user_onboarding_prefs ob on ob.user_id = e.user_id
     order by e.updated_at desc;
end;
$$;

revoke all on function public.api_interests_list() from public, anon, authenticated;
grant execute on function public.api_interests_list() to authenticated;

notify pgrst, 'reload schema';

commit;
