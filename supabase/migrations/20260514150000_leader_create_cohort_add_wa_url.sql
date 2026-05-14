-- Extend leader_create_cohort to accept an optional WhatsApp group URL.
-- Uses CREATE OR REPLACE; new parameter has a default so existing callers
-- without it still work.

create or replace function public.leader_create_cohort(
  p_name                text,
  p_slug                text    default null,
  p_theme_primary       text    default null,
  p_theme_secondary     text    default null,
  p_slogan              text    default null,
  p_invite_code         text    default null,
  p_whatsapp_invite_url text    default null
)
returns public.cohorts
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid       uuid := auth.uid();
  v_pri       text;
  v_sec       text;
  v_slug      text;
  v_code      text;
  v_wa        text;
  v_cohort    public.cohorts;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'name_required';
  end if;

  v_pri := nullif(trim(coalesce(p_theme_primary, '')), '');
  v_sec := nullif(trim(coalesce(p_theme_secondary, '')), '');
  if v_pri is not null and v_pri !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_primary';
  end if;
  if v_sec is not null and v_sec !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_secondary';
  end if;

  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := lower(regexp_replace(
                regexp_replace(trim(p_name), '[^a-zA-Z0-9\s-]', '', 'g'),
                '\s+', '-', 'g'));
    v_slug := left(v_slug, 56) || '-' || substr(md5(random()::text), 1, 4);
  end if;
  if v_slug = '' then v_slug := 'cohort-' || substr(md5(random()::text), 1, 8); end if;

  v_code := nullif(trim(coalesce(p_invite_code, '')), '');
  if v_code is null then
    v_code := upper(substr(
      translate(md5(random()::text || clock_timestamp()::text),
                'abcdefghijklmnopqrstuvwxyz0189',
                'ABCDEFGHJKLMNPQRSTUVWXYZ2345'),
      1, 8));
  end if;

  v_wa := nullif(trim(coalesce(p_whatsapp_invite_url, '')), '');

  insert into public.cohorts (
    name, slug, invite_code, mentor_user_id,
    theme_primary, theme_secondary, slogan, whatsapp_invite_url
  )
  values (
    trim(p_name), v_slug, v_code, v_uid,
    v_pri, v_sec,
    nullif(trim(coalesce(p_slogan, '')), ''),
    v_wa
  )
  returning * into v_cohort;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (v_cohort.id, v_uid, 'mentor', 'active')
  on conflict (cohort_id, user_id)
  do update set role = 'mentor', status = 'active';

  insert into public.app_role_assignments (email, role, note)
  select u.email, 'leader', 'Auto-assigned on cohort creation'
  from auth.users u
  where u.id = v_uid
  on conflict (email) do update
    set role = case
          when public.app_role_assignments.role = 'admin' then 'admin'
          else 'leader'
        end,
        updated_at = now();

  return v_cohort;
end;
$$;

-- Re-grant on the updated signature (old 6-arg signature is replaced).
revoke all on function public.leader_create_cohort(text,text,text,text,text,text,text) from public;
grant execute on function public.leader_create_cohort(text,text,text,text,text,text,text) to authenticated;
