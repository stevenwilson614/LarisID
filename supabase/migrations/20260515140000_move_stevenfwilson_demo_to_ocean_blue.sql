-- Move stevenfwilson@gmail.com from demo cohort leadership to Ocean Blue.
-- Safe to re-run: only touches rows tied to this user / known slugs.
-- Requires the user to exist in auth.users (sign in once).

do $$
declare
  v_uid uuid;
  v_demo uuid;
  v_ocean uuid;
  v_old_ocean uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'stevenfwilson@gmail.com' limit 1;
  if v_uid is null then
    raise exception 'auth user stevenfwilson@gmail.com not found — create the account in Auth (sign up once) then re-run.';
  end if;

  select id into v_demo
  from public.cohorts
  where slug = 'demo' or invite_code = 'LARIS2026'
  order by created_at
  limit 1;

  select id into v_ocean from public.cohorts where slug = 'ocean-blue' limit 1;
  if v_ocean is null then
    raise exception 'Ocean Blue cohort (slug ocean-blue) not found — apply 20260513153000_ocean_blue_role_invites.sql first.';
  end if;

  -- Leave demo cohort: clear primary mentor if it was this user; drop mentor membership row.
  if v_demo is not null then
    update public.cohorts
      set mentor_user_id = null
      where id = v_demo and mentor_user_id = v_uid;
    delete from public.cohort_members
      where cohort_id = v_demo and user_id = v_uid and role = 'mentor';
  end if;

  -- Ocean Blue: remember previous mentor_user_id for membership cleanup.
  select mentor_user_id into v_old_ocean from public.cohorts where id = v_ocean;

  update public.cohorts set mentor_user_id = v_uid where id = v_ocean;

  if v_old_ocean is not null and v_old_ocean <> v_uid then
    update public.cohort_members
      set role = 'student', status = 'active'
      where cohort_id = v_ocean and user_id = v_old_ocean and role = 'mentor';
  end if;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (v_ocean, v_uid, 'mentor', 'active')
  on conflict (cohort_id, user_id) do update set role = 'mentor', status = 'active';
end $$;
