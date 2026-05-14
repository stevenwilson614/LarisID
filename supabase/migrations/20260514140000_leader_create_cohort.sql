-- Allow authenticated leaders (and admins) to create new cohorts.
-- Direct INSERT on cohorts is blocked by RLS; all writes go through
-- SECURITY DEFINER functions. This RPC creates the cohort row AND
-- immediately adds the caller as its mentor member in one transaction.

create or replace function public.leader_create_cohort(
  p_name          text,
  p_slug          text    default null,
  p_theme_primary text    default null,
  p_theme_secondary text  default null,
  p_slogan        text    default null,
  p_invite_code   text    default null
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
  v_cohort    public.cohorts;
begin
  -- Must be authenticated.
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Name is required.
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'name_required';
  end if;

  -- Validate hex colors when provided.
  v_pri := nullif(trim(coalesce(p_theme_primary, '')), '');
  v_sec := nullif(trim(coalesce(p_theme_secondary, '')), '');
  if v_pri is not null and v_pri !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_primary';
  end if;
  if v_sec is not null and v_sec !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_secondary';
  end if;

  -- Build a safe slug: sanitise caller-supplied value or derive from name.
  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    v_slug := lower(regexp_replace(
                regexp_replace(trim(p_name), '[^a-zA-Z0-9\s-]', '', 'g'),
                '\s+', '-', 'g'));
    -- Append 4-char random suffix to avoid slug collisions.
    v_slug := left(v_slug, 56) || '-' || substr(md5(random()::text), 1, 4);
  end if;
  if v_slug = '' then v_slug := 'cohort-' || substr(md5(random()::text), 1, 8); end if;

  -- Use caller-supplied invite code or generate one.
  v_code := nullif(trim(coalesce(p_invite_code, '')), '');
  if v_code is null then
    -- 8-char uppercase alphanumeric (no O/0/I/1 to avoid confusion).
    v_code := upper(substr(
      translate(md5(random()::text || clock_timestamp()::text),
                'abcdefghijklmnopqrstuvwxyz0189',
                'ABCDEFGHJKLMNPQRSTUVWXYZ2345'),
      1, 8));
  end if;

  -- Insert the cohort.
  insert into public.cohorts (
    name, slug, invite_code, mentor_user_id,
    theme_primary, theme_secondary, slogan
  )
  values (
    trim(p_name), v_slug, v_code, v_uid,
    v_pri, v_sec,
    nullif(trim(coalesce(p_slogan, '')), '')
  )
  returning * into v_cohort;

  -- Immediately add creator as active mentor member.
  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (v_cohort.id, v_uid, 'mentor', 'active')
  on conflict (cohort_id, user_id)
  do update set role = 'mentor', status = 'active';

  -- Ensure they have at least the 'leader' app role.
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

revoke all on function public.leader_create_cohort(text, text, text, text, text, text) from public;
grant execute on function public.leader_create_cohort(text, text, text, text, text, text) to authenticated;
