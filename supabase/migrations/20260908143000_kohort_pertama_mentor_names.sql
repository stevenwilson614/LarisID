-- Ensure Afryan + Hendra show as named mentors on Kohort Pertama.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260908143000_kohort_pertama_mentor_names.sql

do $$
declare
  v_cid uuid;
  v_hendra uuid;
  v_afryan uuid;
begin
  select id into v_cid from public.cohorts where slug = 'kohort-pertama';
  select id into v_hendra from auth.users where email = 'hendra19feb@gmail.com' limit 1;
  select id into v_afryan from auth.users where email = 'afryannp@gmail.com' limit 1;

  if v_cid is null then
    raise exception 'kohort_pertama_missing';
  end if;

  -- Keep both as active mentors (idempotent).
  if v_hendra is not null then
    insert into public.cohort_members (cohort_id, user_id, role, status)
    values (v_cid, v_hendra, 'mentor', 'active')
    on conflict (cohort_id, user_id) do update
      set role = 'mentor', status = 'active';

    insert into public.user_profiles (user_id, display_name, updated_at)
    values (v_hendra, 'Hendra', now())
    on conflict (user_id) do update
      set display_name = coalesce(nullif(trim(public.user_profiles.display_name), ''), 'Hendra'),
          updated_at = now();
  end if;

  if v_afryan is not null then
    insert into public.cohort_members (cohort_id, user_id, role, status)
    values (v_cid, v_afryan, 'mentor', 'active')
    on conflict (cohort_id, user_id) do update
      set role = 'mentor', status = 'active';

    insert into public.user_profiles (user_id, display_name, updated_at)
    values (v_afryan, 'Afryan', now())
    on conflict (user_id) do update
      set display_name = coalesce(nullif(trim(public.user_profiles.display_name), ''), 'Afryan'),
          updated_at = now();
  end if;

  -- Primary mentor column stays Hendra; Afryan remains co-mentor via cohort_members.
  if v_hendra is not null then
    update public.cohorts
    set mentor_user_id = v_hendra
    where id = v_cid;
  end if;
end;
$$;
