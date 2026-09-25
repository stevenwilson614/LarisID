-- Edukasi interest form: accept international E.164 WhatsApp for contact
-- (diaspora / neighbours). Keep user_profiles.wa_number Indonesia-only
-- so Fonnte / OTP paths stay on +62.

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
  v_wa_raw text;
  v_wa_profile text;
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

  v_wa_raw := nullif(btrim(p_whatsapp), '');
  v_wa := public.normalise_wa_phone(coalesce(v_wa_raw, v_profile_wa));
  -- Allow non-ID E.164 for education_interests contact only.
  if v_wa is null and v_wa_raw is not null then
    v_wa_raw := regexp_replace(v_wa_raw, '[\s\-().]', '', 'g');
    if v_wa_raw ~ '^\+[1-9][0-9]{7,14}$' then
      v_wa := v_wa_raw;
    end if;
  end if;
  if v_email is null and v_wa is null then
    return json_build_object('ok', false, 'error', 'Isi email atau WhatsApp — salah satu cukup.');
  end if;

  -- Profile / alerts stay on Indonesian numbers.
  v_wa_profile := public.normalise_wa_phone(v_wa);

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
    v_wa_profile,
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
