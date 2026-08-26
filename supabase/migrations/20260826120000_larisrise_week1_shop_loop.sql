-- LARISE week-1 shop loop: crawl coverage heartbeat, Toko Saya baseline fields,
-- roster last-crawl + always-flag unlinked shops.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260826120000_larisrise_week1_shop_loop.sql

-- ── Coverage for the afternoon crawl-dead alert (service_role + admin) ────────

create or replace function public.ssis_shop_crawl_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_linked int := 0;
  v_ok int := 0;
begin
  if auth.role() is distinct from 'service_role' and not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;

  select count(*) into v_linked
  from public.student_account sa
  where sa.kind = 'shop' and sa.active and lower(sa.platform) = 'shopee';

  select count(*) into v_ok
  from public.student_account sa
  where sa.kind = 'shop' and sa.active and lower(sa.platform) = 'shopee'
    and exists (
      select 1 from public.sensor_health sh
      where sh.student_id = sa.student_id
        and sh.sensor = 'shop_crawl'
        and sh.day = current_date
        and sh.status = 'ok'
    );

  return jsonb_build_object(
    'day', current_date,
    'linked_shopee', v_linked,
    'ok_today', coalesce(v_ok, 0),
    'pct', case when v_linked = 0 then null
                else round((100.0 * coalesce(v_ok, 0) / v_linked)::numeric, 1) end,
    'alert', v_linked > 0 and (coalesce(v_ok, 0)::numeric / v_linked) < 0.80
  );
end;
$$;

revoke all on function public.ssis_shop_crawl_coverage() from public, anon, authenticated;
grant execute on function public.ssis_shop_crawl_coverage() to authenticated;
do $$
begin
  grant execute on function public.ssis_shop_crawl_coverage() to service_role;
exception when undefined_object then
  null;
end $$;

-- Ops WhatsApp targets: platform admins with a stored number.
create or replace function public.ssis_ops_wa_targets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'phone', public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                                   nullif(btrim(p.public_whatsapp), ''))),
      'display_name', coalesce(nullif(trim(p.display_name), ''), split_part(u.email, '@', 1))
    ))
    from public.app_role_assignments ar
    join auth.users u on lower(u.email) = lower(ar.email)
    left join public.user_profiles p on p.user_id = u.id
    where ar.role = 'admin'
      and public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                             nullif(btrim(p.public_whatsapp), ''))) is not null
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.ssis_ops_wa_targets() from public, anon, authenticated;
do $$
begin
  grant execute on function public.ssis_ops_wa_targets() to service_role;
exception when undefined_object then
  null;
end $$;

-- ── Toko Saya: baseline + last crawl ─────────────────────────────────────────

create or replace function public.cohort_my_shop_stats(p_cohort uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_me uuid := (select auth.uid());
  v_start date;
  v_toko int := 0;
  v_produk int := 0;
  v_listings int := 0;
  v_sold int := 0;
  v_reviews int := 0;
  v_sensor text := 'dark';
  v_sensor_day date;
  v_dupes jsonb := '[]'::jsonb;
  v_snap_days int := 0;
  v_last_snap timestamptz;
  v_shopee int := 0;
begin
  if v_me is null or p_cohort is null then
    return '{}'::jsonb;
  end if;
  if not public.rise_can_see_cohort(p_cohort) then
    raise exception 'Tidak di kohort ini';
  end if;

  select public.rise_metric_start(p_cohort, min(sa.created_at))
    into v_start
  from public.student_account sa
  where sa.student_id = v_me and sa.kind = 'shop' and sa.active;

  select count(*) into v_toko
  from public.student_account sa
  where sa.student_id = v_me and sa.kind = 'shop' and sa.active;

  select count(*) into v_shopee
  from public.student_account sa
  where sa.student_id = v_me and sa.kind = 'shop' and sa.active
    and lower(sa.platform) = 'shopee';

  select count(*) filter (where l.delisted_at is null),
         count(distinct public.rise_product_key(l.attempt_group_id, l.id))
           filter (where l.delisted_at is null)
    into v_listings, v_produk
  from public.listing l
  where l.student_id = v_me;

  select coalesce(sum(d.dsold), 0), coalesce(sum(d.drev), 0)
    into v_sold, v_reviews
  from (
    select greatest(s.sold - lag(s.sold) over (partition by s.listing_id order by s.day), 0) as dsold,
           greatest(s.reviews - lag(s.reviews) over (partition by s.listing_id order by s.day), 0) as drev,
           s.day
    from public.listing_snapshot s
    join public.listing l on l.id = s.listing_id
    where l.student_id = v_me
  ) d
  where d.day >= coalesce(v_start, current_date);

  select count(distinct s.day), max(s.captured_at)
    into v_snap_days, v_last_snap
  from public.listing_snapshot s
  join public.listing l on l.id = s.listing_id
  where l.student_id = v_me;

  select sh.status, sh.day into v_sensor, v_sensor_day
  from public.sensor_health sh
  where sh.student_id = v_me and sh.sensor = 'shop_crawl'
  order by sh.day desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'title', l.title, 'platform', l.platform
         ) order by l.title, l.platform), '[]'::jsonb)
    into v_dupes
  from public.listing l
  where l.student_id = v_me
    and l.delisted_at is null
    and l.attempt_group_id is null
    and exists (
      select 1 from public.listing o
      where o.student_id = l.student_id
        and o.id <> l.id
        and o.delisted_at is null
        and o.attempt_group_id is null
        and o.platform <> l.platform
        and lower(left(coalesce(o.title,''), 24)) = lower(left(coalesce(l.title,''), 24))
        and length(coalesce(l.title,'')) >= 8
    );

  return jsonb_build_object(
    'toko', v_toko,
    'produk', coalesce(v_produk, 0),
    'listings', coalesce(v_listings, 0),
    'terjual', coalesce(v_sold, 0),
    'ulasan', coalesce(v_reviews, 0),
    'sensor', coalesce(v_sensor, 'dark'),
    'sensor_day', v_sensor_day,
    'metric_start', v_start,
    'possible_dupes', coalesce(v_dupes, '[]'::jsonb),
    'snapshot_days', coalesce(v_snap_days, 0),
    'last_snapshot_at', v_last_snap,
    'shopee', v_shopee,
    'shops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sa.id,
        'platform', sa.platform,
        'handle', sa.handle,
        'url', sa.url,
        'board_status', sa.board_status,
        'verified_at', sa.verified_at
      ) order by sa.created_at)
      from public.student_account sa
      where sa.student_id = v_me and sa.kind = 'shop' and sa.active
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Roster: last crawl + unlinked students always need a chase ───────────────

create or replace function public.cohort_roster_health(p_cohort uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_start date;
  v_week numeric;
begin
  if not public.can_manage_cohort(p_cohort) and not public.is_platform_admin() then
    raise exception 'Hanya mentor/admin';
  end if;

  select c.starts_at::date into v_start from public.cohorts c where c.id = p_cohort;
  v_week := case
    when v_start is null then 0
    else greatest(0, floor(extract(epoch from (now() - v_start::timestamptz)) / 604800.0))
  end;

  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.help_rank, x.display_name)
    from (
      select
        m.user_id,
        coalesce(nullif(trim(up.display_name), ''), split_part(au.email, '@', 1), 'Siswa') as display_name,
        au.email,
        m.last_seen_at,
        m.joined_at,
        (select count(*) from public.student_account sa
          where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active) as toko,
        (select count(*) from public.student_account sa
          where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
            and sa.board_status = 'pending') as pending,
        (select count(distinct public.rise_product_key(l.attempt_group_id, l.id))
           from public.listing l
          where l.student_id = m.user_id and l.delisted_at is null) as produk,
        coalesce((
          select sh.status from public.sensor_health sh
          where sh.student_id = m.user_id and sh.sensor = 'shop_crawl'
          order by sh.day desc limit 1
        ), 'dark') as sensor,
        (select sh.day from public.sensor_health sh
          where sh.student_id = m.user_id and sh.sensor = 'shop_crawl'
          order by sh.day desc limit 1) as last_crawl_day,
        (select sa.board_status from public.student_account sa
          where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
            and sa.board_status in ('needs_review', 'pending')
          order by case sa.board_status when 'needs_review' then 0 else 1 end
          limit 1) as flag,
        (select count(*) from public.session_attendance a
          join public.cohort_sessions s on s.id = a.session_id
         where s.cohort_id = p_cohort and a.user_id = m.user_id and a.status = 'absen') as absen,
        (select count(*) from public.session_attendance a
          join public.cohort_sessions s on s.id = a.session_id
         where s.cohort_id = p_cohort and a.user_id = m.user_id and a.status = 'hadir') as hadir,
        case
          when not exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
          ) then 1
          when not exists (
            select 1 from public.listing l
            where l.student_id = m.user_id and l.delisted_at is null
          ) and v_week >= 3 then 2
          when exists (
            select 1 from public.sensor_health sh
            where sh.student_id = m.user_id and sh.sensor = 'shop_crawl'
              and sh.status = 'dark' and sh.day >= current_date - 2
          ) then 3
          when exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
              and sa.board_status = 'needs_review'
          ) then 4
          when exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
              and sa.board_status = 'pending'
          ) then 5
          when (
            select count(*) from public.session_attendance a
            join public.cohort_sessions s on s.id = a.session_id
            where s.cohort_id = p_cohort and a.user_id = m.user_id and a.status = 'absen'
          ) >= 2 then 6
          else 99
        end as help_rank,
        case
          when not exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
          ) then 'Belum tautkan toko'
          when not exists (
            select 1 from public.listing l
            where l.student_id = m.user_id and l.delisted_at is null
          ) and v_week >= 3 then 'Belum ada produk'
          when exists (
            select 1 from public.sensor_health sh
            where sh.student_id = m.user_id and sh.sensor = 'shop_crawl'
              and sh.status = 'dark' and sh.day >= current_date - 2
          ) then 'Crawl toko gelap'
          when exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
              and sa.board_status = 'needs_review'
          ) then 'Perlu review toko'
          when exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
              and sa.board_status = 'pending'
          ) then 'Menunggu verifikasi Day-0'
          when (
            select count(*) from public.session_attendance a
            join public.cohort_sessions s on s.id = a.session_id
            where s.cohort_id = p_cohort and a.user_id = m.user_id and a.status = 'absen'
          ) >= 2 then 'Absen ≥2 sesi'
          else null
        end as help_reason
      from public.cohort_members m
      left join public.user_profiles up on up.user_id = m.user_id
      left join auth.users au on au.id = m.user_id
      where m.cohort_id = p_cohort and m.role = 'student' and m.status = 'active'
    ) x
  ), '[]'::jsonb);
end;
$$;

create or replace function public.ssis_ops_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cov jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
  v_cov := public.ssis_shop_crawl_coverage();
  return jsonb_build_object(
    'sensor', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'n', s.n))
      from (
        select sh.status, count(*) as n
        from public.sensor_health sh
        where sh.day >= current_date - 1 and sh.sensor = 'shop_crawl'
        group by sh.status
      ) s
    ), '[]'::jsonb),
    'failed_raw', (select count(*) from public.cohort_raw_failed where expires_at > now()),
    'needs_review', (
      select count(*) from public.student_account
      where kind = 'shop' and active and board_status = 'needs_review'
    ),
    'pending_shops', (
      select count(*) from public.student_account
      where kind = 'shop' and active and board_status = 'pending'
    ),
    'active_shops', (
      select count(*) from public.student_account
      where kind = 'shop' and active
    ),
    'crawl_coverage', v_cov
  );
end;
$$;

notify pgrst, 'reload schema';
