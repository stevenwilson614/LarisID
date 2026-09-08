-- Admin Users: surface cohort names (not just counts) so the directory can
-- show which kohort each user is in, and support quick add-to-kohort.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260908180000_admin_user_directory_cohort_names.sql

drop function if exists public.admin_user_directory();

create or replace function public.admin_user_directory()
returns table (
  user_id uuid,
  email text,
  display_name text,
  app_role text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  cohort_count bigint,
  led_cohort_count bigint,
  cohort_names text[],
  last_activity_at timestamptz,
  seller_status text,
  region text,
  city text,
  categories text[],
  onboarding_completed boolean,
  deepdive_count integer,
  tracked_count integer,
  last_discover_at timestamptz,
  wa_number text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(case
        when public.is_phone_like_name(u.raw_user_meta_data ->> 'full_name') then ''
        else trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', ''))
      end, ''),
      nullif(case
        when public.is_phone_like_name(up.display_name) then ''
        else trim(both from coalesce(up.display_name, ''))
      end, ''),
      nullif(trim(both from coalesce(up.first_name || ' ' || up.last_name, '')), ''),
      case
        when u.email ilike '%@wa.larisid.com' then 'Pengguna WA'
        else coalesce(nullif(split_part(u.email, '@', 1), ''), 'Pengguna')
      end
    )::text,
    public.derive_app_role(u.id, u.email::text),
    u.created_at,
    u.last_sign_in_at,
    (select count(*) from public.cohort_members m where m.user_id = u.id and m.status = 'active')::bigint,
    (select count(*) from public.cohorts c where c.mentor_user_id = u.id)::bigint,
    coalesce(
      (
        select array_agg(c.name order by c.name)
        from public.cohort_members m
        join public.cohorts c on c.id = m.cohort_id
        where m.user_id = u.id and m.status = 'active'
      ),
      '{}'::text[]
    ),
    (select max(e.created_at) from public.activity_events e where e.user_id = u.id),
    coalesce(ob.seller_status, up.seller_status)::text,
    ob.region::text,
    up.city::text,
    coalesce(ob.categories, '{}'::text[]),
    (ob.completed_at is not null),
    greatest(
      coalesce(js.deepdive_count, 0),
      coalesce(dd.cnt, 0)
    )::integer,
    coalesce(tp.cnt, 0)::integer,
    js.last_discover_at,
    coalesce(
      public.normalise_wa_phone(up.wa_number),
      public.normalise_wa_phone(up.public_whatsapp),
      public.normalise_wa_phone(st.notify_wa_number),
      public.normalise_wa_phone(u.phone),
      public.normalise_wa_phone(u.raw_user_meta_data ->> 'phone_number'),
      case
        when u.email ilike '%@wa.larisid.com'
          then public.normalise_wa_phone(split_part(u.email, '@', 1))
        else null
      end
    )::text
  from auth.users u
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_tracker_state st on st.user_id = u.id
  left join public.user_journey_stats js on js.user_id = u.id
  left join (
    select e.user_id, count(*)::integer as cnt
    from public.activity_events e
    where e.event_type = 'deepdive_open'
    group by e.user_id
  ) dd on dd.user_id = u.id
  left join (
    select t.user_id, count(*)::integer as cnt
    from public.user_tracked_products t
    group by t.user_id
  ) tp on tp.user_id = u.id
  where public.is_platform_admin()
    and not public.is_dapur_side_account(u.email::text)
  order by u.created_at desc;
$$;

revoke all on function public.admin_user_directory() from public;
grant execute on function public.admin_user_directory() to authenticated;

notify pgrst, 'reload schema';
