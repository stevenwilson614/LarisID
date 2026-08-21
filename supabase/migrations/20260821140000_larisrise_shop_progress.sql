-- LarisRise: scrape-verified shop progress — leaderboards, badges, attendance,
-- attempt groups, mentor shop flags. Member-gated. Never supabase db push.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260821140000_larisrise_shop_progress.sql

-- ── Event vocabulary ─────────────────────────────────────────────────────────

insert into public.cohort_event_type (event_type, category, description) values
  ('needs_review',     'ops',     'Shop sold-delta outlier flagged for mentor review'),
  ('shop_confirmed',   'admin',   'Mentor included a shop on Rise boards'),
  ('shop_excluded',    'admin',   'Mentor excluded a shop from Rise boards'),
  ('attendance_marked','mentor',  'Session attendance marked Hadir/Izin/Absen'),
  ('listings_grouped', 'listing', 'Cross-platform copies confirmed as one product')
on conflict (event_type) do nothing;

-- ── Shop board gating ────────────────────────────────────────────────────────

alter table public.student_account
  add column if not exists board_status text not null default 'pending';

alter table public.student_account
  drop constraint if exists student_account_board_status_check;
alter table public.student_account
  add constraint student_account_board_status_check
  check (board_status in ('pending', 'included', 'excluded', 'needs_review'));

comment on column public.student_account.board_status is
  'pending = linked, waiting mentor Day-0 verify; included = counts on Rise boards; excluded = mentor dropped; needs_review = outlier flag.';

-- Already-verified shops stay on the board. Unverified remain pending.
update public.student_account
   set board_status = 'included'
 where kind = 'shop'
   and active
   and verified_at is not null
   and board_status = 'pending';

-- ── Attendance ───────────────────────────────────────────────────────────────

create table if not exists public.session_attendance (
  session_id uuid not null references public.cohort_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null check (status in ('hadir', 'izin', 'absen')),
  marked_by  uuid references auth.users (id) on delete set null,
  marked_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index if not exists idx_session_attendance_user
  on public.session_attendance (user_id, marked_at desc);

alter table public.session_attendance enable row level security;

drop policy if exists sa_select on public.session_attendance;
create policy sa_select on public.session_attendance
  for select using (
    user_id = (select auth.uid())
    or public.is_platform_admin()
    or exists (
      select 1
      from public.cohort_sessions s
      where s.id = session_attendance.session_id
        and public.can_manage_cohort(s.cohort_id)
    )
  );

revoke all on public.session_attendance from public, anon;
grant select on public.session_attendance to authenticated;

-- ── Visibility helper ────────────────────────────────────────────────────────

create or replace function public.rise_can_see_cohort(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.cohorts c
      where c.id = p_cohort and c.mentor_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = p_cohort
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    );
$$;

revoke all on function public.rise_can_see_cohort(uuid) from public, anon;
grant execute on function public.rise_can_see_cohort(uuid) to authenticated;

-- Metric window: greatest(shop link date, cohort starts_at). Program policy default.
create or replace function public.rise_metric_start(p_cohort uuid, p_shop_created timestamptz)
returns date
language sql
stable
as $$
  select greatest(
    coalesce(p_shop_created::date, current_date),
    coalesce((select c.starts_at::date from public.cohorts c where c.id = p_cohort), '-infinity'::date)
  );
$$;

-- Distinct product key: grouped listings share attempt_group_id; ungrouped = own id.
create or replace function public.rise_product_key(p_attempt uuid, p_listing uuid)
returns text
language sql
immutable
as $$
  select coalesce(p_attempt::text, p_listing::text);
$$;

-- ── Board-eligible shops ─────────────────────────────────────────────────────

create or replace function public.rise_shop_counts_on_board(p_student uuid, p_cohort uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.student_account sa
    where sa.student_id = p_student
      and sa.kind = 'shop'
      and sa.active
      and sa.board_status = 'included'
      and sa.verified_at is not null
      and (sa.cohort_id = p_cohort or sa.cohort_id is null)
  );
$$;

-- ── Student shop stats (Toko Saya — own numbers, even if pending) ────────────

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

  select sh.status, sh.day into v_sensor, v_sensor_day
  from public.sensor_health sh
  where sh.student_id = v_me and sh.sensor = 'shop_crawl'
  order by sh.day desc
  limit 1;

  -- Likely same product across platforms (ungrouped, similar titles).
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

revoke all on function public.cohort_my_shop_stats(uuid) from public, anon;
grant execute on function public.cohort_my_shop_stats(uuid) to authenticated;

-- ── Leaderboards (totals only — no raw snapshots) ────────────────────────────

create or replace function public.cohort_shop_leaderboard(p_cohort uuid, p_board text default 'produk')
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  value bigint,
  delta_week bigint,
  reached_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_board text := lower(coalesce(nullif(p_board, ''), 'produk'));
begin
  if not public.rise_can_see_cohort(p_cohort) then
    raise exception 'Tidak di kohort ini';
  end if;
  if v_board not in ('produk', 'terjual', 'ulasan', 'konsistensi') then
    v_board := 'produk';
  end if;

  return query
  with members as (
    select m.user_id
    from public.cohort_members m
    where m.cohort_id = p_cohort and m.status = 'active' and m.role = 'student'
  ),
  shops as (
    select sa.student_id, sa.id as shop_id, sa.created_at as linked_at,
           public.rise_metric_start(p_cohort, sa.created_at) as win_start
    from public.student_account sa
    join members mb on mb.user_id = sa.student_id
    where sa.kind = 'shop'
      and sa.active
      and sa.board_status = 'included'
      and sa.verified_at is not null
  ),
  live as (
    select l.student_id, l.id, l.attempt_group_id, l.first_seen, l.delisted_at
    from public.listing l
    join shops s on s.student_id = l.student_id
  ),
  produk as (
    select l.student_id,
           count(distinct public.rise_product_key(l.attempt_group_id, l.id))
             filter (where l.delisted_at is null)::bigint as val,
           min(l.first_seen) filter (where l.delisted_at is null) as reached
    from live l
    group by l.student_id
  ),
  deltas as (
    select l.student_id,
           s.day,
           greatest(sn.sold - lag(sn.sold) over (partition by sn.listing_id order by sn.day), 0) as d_sold,
           greatest(sn.reviews - lag(sn.reviews) over (partition by sn.listing_id order by sn.day), 0) as d_rev,
           sn.listing_id
    from public.listing_snapshot sn
    join public.listing l on l.id = sn.listing_id
    join shops sh on sh.student_id = l.student_id
    where sn.day >= sh.win_start
  ),
  sold as (
    select d.student_id,
           coalesce(sum(d.d_sold), 0)::bigint as val,
           min(d.day::timestamptz) filter (where d.d_sold > 0) as reached,
           coalesce(sum(d.d_sold) filter (where d.day >= current_date - 7), 0)::bigint as week_delta
    from deltas d
    group by d.student_id
  ),
  ulasan as (
    select d.student_id,
           coalesce(sum(d.d_rev), 0)::bigint as val,
           min(d.day::timestamptz) filter (where d.d_rev > 0) as reached,
           coalesce(sum(d.d_rev) filter (where d.day >= current_date - 7), 0)::bigint as week_delta
    from deltas d
    group by d.student_id
  ),
  kons as (
    select l.student_id,
           count(distinct date_trunc('week', sn.day))::bigint as val,
           max(sn.day)::timestamptz as reached
    from public.listing_snapshot sn
    join public.listing l on l.id = sn.listing_id
    join shops sh on sh.student_id = l.student_id
    where sn.day >= sh.win_start
    group by l.student_id
  ),
  scored as (
    select m.user_id,
           case v_board
             when 'produk' then coalesce(p.val, 0)
             when 'terjual' then coalesce(so.val, 0)
             when 'ulasan' then coalesce(u.val, 0)
             else coalesce(k.val, 0)
           end as val,
           case v_board
             when 'produk' then coalesce(p.reached, now())
             when 'terjual' then coalesce(so.reached, now())
             when 'ulasan' then coalesce(u.reached, now())
             else coalesce(k.reached, now())
           end as reached,
           case v_board
             when 'terjual' then coalesce(so.week_delta, 0)
             when 'ulasan' then coalesce(u.week_delta, 0)
             else 0::bigint
           end as week_delta
    from members m
    left join produk p on p.student_id = m.user_id
    left join sold so on so.student_id = m.user_id
    left join ulasan u on u.student_id = m.user_id
    left join kons k on k.student_id = m.user_id
  ),
  ranked as (
    select s.user_id, s.val, s.reached, s.week_delta,
           rank() over (order by s.val desc, s.reached asc) as rnk
    from scored s
  )
  select r.rnk,
         r.user_id,
         coalesce(nullif(trim(up.display_name), ''), split_part(au.email, '@', 1), 'Anggota') as display_name,
         r.val,
         r.week_delta,
         r.reached
  from ranked r
  left join public.user_profiles up on up.user_id = r.user_id
  left join auth.users au on au.id = r.user_id
  order by r.rnk, r.reached;
end;
$$;

revoke all on function public.cohort_shop_leaderboard(uuid, text) from public, anon;
grant execute on function public.cohort_shop_leaderboard(uuid, text) to authenticated;

-- ── Mentor: confirm / exclude / flag shop ────────────────────────────────────

create or replace function public.ssis_set_shop_board_status(p_id uuid, p_status text)
returns public.student_account
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  rec public.student_account;
  v_status text := lower(trim(p_status));
  v_cid uuid;
begin
  if v_status not in ('pending', 'included', 'excluded', 'needs_review') then
    raise exception 'Status tidak valid';
  end if;

  select * into rec from public.student_account where id = p_id and kind = 'shop';
  if not found then
    raise exception 'Toko tidak ditemukan';
  end if;

  v_cid := rec.cohort_id;
  if v_cid is null then
    select m.cohort_id into v_cid
    from public.cohort_members m
    where m.user_id = rec.student_id and m.status = 'active'
    order by m.joined_at desc limit 1;
  end if;
  if v_cid is null or (not public.can_manage_cohort(v_cid) and not public.is_platform_admin()) then
    raise exception 'Hanya mentor/admin yang bisa mengubah status toko';
  end if;

  update public.student_account
     set board_status = v_status,
         verified_at = case
           when v_status = 'included' then coalesce(verified_at, now())
           else verified_at
         end
   where id = rec.id
  returning * into rec;

  insert into public.cohort_events (student_id, ts, source, platform, event_type, confidence, metadata)
  values (
    rec.student_id, now(), 'laris', rec.platform,
    case v_status
      when 'included' then 'shop_confirmed'
      when 'excluded' then 'shop_excluded'
      else 'needs_review'
    end,
    1.0,
    jsonb_build_object('student_account_id', rec.id, 'board_status', v_status)
  );

  return rec;
end;
$$;

revoke all on function public.ssis_set_shop_board_status(uuid, text) from public, anon;
grant execute on function public.ssis_set_shop_board_status(uuid, text) to authenticated;

-- ── Attempt groups (1 produk, N toko) ────────────────────────────────────────

create or replace function public.ssis_group_listings(p_listing_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_me uuid := (select auth.uid());
  v_gid uuid;
  v_n int;
begin
  if v_me is null then raise exception 'Login diperlukan'; end if;
  if p_listing_ids is null or array_length(p_listing_ids, 1) < 2 then
    raise exception 'Pilih minimal dua listing';
  end if;

  select count(*) into v_n
  from public.listing l
  where l.id = any (p_listing_ids)
    and (
      l.student_id = v_me
      or public.ssis_can_view_student(l.student_id)
         and exists (
           select 1 from public.cohort_members m
           where m.user_id = l.student_id and m.status = 'active'
             and public.can_manage_cohort(m.cohort_id)
         )
    );
  if v_n <> array_length(p_listing_ids, 1) then
    raise exception 'Listing tidak ditemukan';
  end if;

  select l.attempt_group_id into v_gid
  from public.listing l
  where l.id = any (p_listing_ids) and l.attempt_group_id is not null
  limit 1;
  if v_gid is null then v_gid := gen_random_uuid(); end if;

  update public.listing
     set attempt_group_id = v_gid
   where id = any (p_listing_ids);

  insert into public.cohort_events (student_id, ts, source, event_type, confidence, metadata)
  select l.student_id, now(), 'laris', 'listings_grouped', 1.0,
         jsonb_build_object('attempt_group_id', v_gid, 'listing_ids', to_jsonb(p_listing_ids))
  from public.listing l
  where l.id = p_listing_ids[1]
  limit 1;

  return v_gid;
end;
$$;

revoke all on function public.ssis_group_listings(uuid[]) from public, anon;
grant execute on function public.ssis_group_listings(uuid[]) to authenticated;

create or replace function public.ssis_ungroup_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  rec public.listing;
begin
  select * into rec from public.listing where id = p_listing_id;
  if not found then raise exception 'Listing tidak ditemukan'; end if;
  if rec.student_id <> (select auth.uid())
     and not public.can_manage_cohort((
       select m.cohort_id from public.cohort_members m
       where m.user_id = rec.student_id and m.status = 'active' limit 1
     ))
     and not public.is_platform_admin() then
    raise exception 'Tidak diizinkan';
  end if;
  update public.listing set attempt_group_id = null where id = p_listing_id;
end;
$$;

revoke all on function public.ssis_ungroup_listing(uuid) from public, anon;
grant execute on function public.ssis_ungroup_listing(uuid) to authenticated;

-- ── Attendance RPCs ──────────────────────────────────────────────────────────

create or replace function public.session_set_attendance(
  p_session uuid,
  p_user uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_cid uuid;
  v_st text := lower(trim(p_status));
begin
  if v_st not in ('hadir', 'izin', 'absen') then
    raise exception 'Status hadir tidak valid';
  end if;
  select s.cohort_id into v_cid from public.cohort_sessions s where s.id = p_session;
  if v_cid is null then raise exception 'Sesi tidak ditemukan'; end if;
  if not public.can_manage_cohort(v_cid) then
    raise exception 'Hanya mentor yang menandai kehadiran';
  end if;

  insert into public.session_attendance (session_id, user_id, status, marked_by)
  values (p_session, p_user, v_st, (select auth.uid()))
  on conflict (session_id, user_id) do update
    set status = excluded.status,
        marked_by = excluded.marked_by,
        marked_at = now();

  insert into public.cohort_events (student_id, ts, source, event_type, confidence, metadata)
  values (p_user, now(), 'laris', 'attendance_marked', 1.0,
          jsonb_build_object('session_id', p_session, 'status', v_st));
end;
$$;

revoke all on function public.session_set_attendance(uuid, uuid, text) from public, anon;
grant execute on function public.session_set_attendance(uuid, uuid, text) to authenticated;

create or replace function public.session_list_attendance(p_session uuid)
returns table (
  user_id uuid,
  display_name text,
  status text,
  marked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_cid uuid;
begin
  select s.cohort_id into v_cid from public.cohort_sessions s where s.id = p_session;
  if v_cid is null then raise exception 'Sesi tidak ditemukan'; end if;
  if not public.can_manage_cohort(v_cid) then
    raise exception 'Hanya mentor yang melihat daftar hadir';
  end if;

  return query
  select m.user_id,
         coalesce(nullif(trim(up.display_name), ''), split_part(au.email, '@', 1), 'Siswa'),
         a.status,
         a.marked_at
  from public.cohort_members m
  left join public.session_attendance a
    on a.session_id = p_session and a.user_id = m.user_id
  left join public.user_profiles up on up.user_id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.cohort_id = v_cid and m.role = 'student' and m.status = 'active'
  order by coalesce(up.display_name, au.email);
end;
$$;

revoke all on function public.session_list_attendance(uuid) from public, anon;
grant execute on function public.session_list_attendance(uuid) to authenticated;

-- ── Roster health ────────────────────────────────────────────────────────────

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
        (select count(distinct public.rise_product_key(l.attempt_group_id, l.id))
           from public.listing l
          where l.student_id = m.user_id and l.delisted_at is null) as produk,
        coalesce((
          select sh.status from public.sensor_health sh
          where sh.student_id = m.user_id and sh.sensor = 'shop_crawl'
          order by sh.day desc limit 1
        ), 'dark') as sensor,
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
          ) and v_week >= 1 then 1
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
          when (
            select count(*) from public.session_attendance a
            join public.cohort_sessions s on s.id = a.session_id
            where s.cohort_id = p_cohort and a.user_id = m.user_id and a.status = 'absen'
          ) >= 2 then 5
          else 99
        end as help_rank,
        case
          when not exists (
            select 1 from public.student_account sa
            where sa.student_id = m.user_id and sa.kind = 'shop' and sa.active
          ) and v_week >= 1 then 'Belum tautkan toko'
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

revoke all on function public.cohort_roster_health(uuid) from public, anon;
grant execute on function public.cohort_roster_health(uuid) to authenticated;

-- ── Wins digest + celebrate to cohort feed ───────────────────────────────────

create or replace function public.cohort_wins_digest(p_cohort uuid, p_days int default 14)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_cohort(p_cohort) and not public.is_platform_admin() then
    raise exception 'Hanya mentor/admin';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', ua.user_id,
      'display_name', coalesce(nullif(trim(up.display_name), ''), 'Siswa'),
      'key', a.key,
      'title', a.title,
      'awarded_at', ua.awarded_at
    ) order by ua.awarded_at desc)
    from public.user_achievements ua
    join public.achievements a on a.id = ua.achievement_id
    join public.cohort_members m on m.user_id = ua.user_id
      and m.cohort_id = p_cohort and m.status = 'active'
    left join public.user_profiles up on up.user_id = ua.user_id
    where ua.awarded_at >= now() - make_interval(days => greatest(coalesce(p_days, 14), 1))
      and a.key in (
        'first_listing', 'first_sale_verified', 'first_review',
        'lima_produk', 'sepuluh_terjual', 'dua_toko'
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.cohort_wins_digest(uuid, int) from public, anon;
grant execute on function public.cohort_wins_digest(uuid, int) to authenticated;

create or replace function public.cohort_celebrate_win(
  p_cohort uuid,
  p_user uuid,
  p_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_title text;
  v_name text;
  v_id uuid;
  v_body text;
begin
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'Hanya mentor yang merayakan di feed kohort';
  end if;

  select a.title into v_title from public.achievements a where a.key = p_key;
  select coalesce(nullif(trim(up.display_name), ''), 'teman sekelas')
    into v_name
  from public.user_profiles up where up.user_id = p_user;

  v_body := coalesce(v_name, 'Teman sekelas') || ' dapat lencana ' ||
            coalesce(v_title, p_key) || ' ✓';

  insert into public.community_posts (cohort_id, author_id, body, kind, metadata)
  values (
    p_cohort, (select auth.uid()), v_body, 'win',
    jsonb_build_object('badge_key', p_key, 'student_id', p_user, 'celebrate', true)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cohort_celebrate_win(uuid, uuid, text) from public, anon;
grant execute on function public.cohort_celebrate_win(uuid, uuid, text) to authenticated;

-- ── Verified badges ──────────────────────────────────────────────────────────

insert into public.achievements (key, title, description, icon, criteria, sort_order)
values
  ('first_listing', 'Produk terdaftar',
   'Tokomu punya produk pertama yang terukur dari etalase.',
   'tag', 'Listing pertama terverifikasi dari toko.', 40),
  ('first_sale_verified', 'Penjualan pertama ✓',
   'Terjual pertama terverifikasi dari toko — bukan laporan sendiri.',
   'shopping-bag', 'Sold counter naik (terverifikasi dari toko).', 50),
  ('first_review', 'Ulasan pertama',
   'Pembeli pertama meninggalkan ulasan di tokomu.',
   'star', 'Review counter naik (terverifikasi dari toko).', 60),
  ('lima_produk', 'Lima produk',
   'Lima produk berbeda live di etalase (salinan lintas platform dihitung satu).',
   'layers', 'Lima produk aktif terverifikasi.', 70),
  ('sepuluh_terjual', 'Sepuluh terjual',
   'Sepuluh unit terjual selama program, terukur dari toko.',
   'trending-up', '10 unit terjual selama program.', 80),
  ('dua_toko', 'Dua toko',
   'Live di dua marketplace. Satu produk di dua toko tetap satu produk.',
   'store', 'Dua toko aktif tertaut.', 90)
on conflict (key) do update
set title = excluded.title,
    description = excluded.description,
    criteria = excluded.criteria,
    sort_order = excluded.sort_order;

create or replace function public.ssis_award_key(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.achievements where key = p_key;
  if v_id is null or p_user is null then return; end if;
  insert into public.user_achievements (user_id, achievement_id)
  values (p_user, v_id)
  on conflict (user_id, achievement_id) do nothing;
end;
$$;

create or replace function public.ssis_refresh_verified_badges(p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_produk int;
  v_toko int;
  v_sold int;
begin
  select count(distinct public.rise_product_key(l.attempt_group_id, l.id))
    filter (where l.delisted_at is null)
    into v_produk
  from public.listing l where l.student_id = p_student;

  select count(*) into v_toko
  from public.student_account sa
  where sa.student_id = p_student and sa.kind = 'shop' and sa.active;

  select coalesce(sum(d.dsold), 0)
    into v_sold
  from (
    select greatest(sn.sold - lag(sn.sold) over (partition by sn.listing_id order by sn.day), 0) as dsold
    from public.listing_snapshot sn
    join public.listing l on l.id = sn.listing_id
    where l.student_id = p_student
  ) d;

  if coalesce(v_produk, 0) >= 1 then
    perform public.ssis_award_key(p_student, 'first_listing');
  end if;
  if coalesce(v_produk, 0) >= 5 then
    perform public.ssis_award_key(p_student, 'lima_produk');
  end if;
  if coalesce(v_toko, 0) >= 2 then
    perform public.ssis_award_key(p_student, 'dua_toko');
  end if;
  if coalesce(v_sold, 0) >= 1 then
    perform public.ssis_award_key(p_student, 'first_sale_verified');
  end if;
  if coalesce(v_sold, 0) >= 10 then
    perform public.ssis_award_key(p_student, 'sepuluh_terjual');
  end if;
end;
$$;

create or replace function public.award_achievements_from_cohort_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.student_id is null then return new; end if;
  if new.event_type = 'listing_created' then
    perform public.ssis_award_key(new.student_id, 'first_listing');
  elsif new.event_type = 'listing_sold_increased' then
    perform public.ssis_award_key(new.student_id, 'first_sale_verified');
  elsif new.event_type in ('review_received') then
    perform public.ssis_award_key(new.student_id, 'first_review');
  elsif new.event_type = 'shop_linked' then
    perform public.ssis_refresh_verified_badges(new.student_id);
  end if;
  perform public.ssis_refresh_verified_badges(new.student_id);
  return new;
end;
$$;

drop trigger if exists trg_award_achievements_cohort_events on public.cohort_events;
create trigger trg_award_achievements_cohort_events
  after insert on public.cohort_events
  for each row execute function public.award_achievements_from_cohort_event();

-- Review-count bump from snapshots (no email sensor required).
create or replace function public.ssis_note_review_delta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prev int;
  v_student uuid;
begin
  select sn.reviews into v_prev
  from public.listing_snapshot sn
  where sn.listing_id = new.listing_id and sn.day < new.day
  order by sn.day desc
  limit 1;
  if v_prev is not null and new.reviews is not null and new.reviews > v_prev then
    select l.student_id into v_student from public.listing l where l.id = new.listing_id;
    perform public.ssis_award_key(v_student, 'first_review');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ssis_note_review_delta on public.listing_snapshot;
create trigger trg_ssis_note_review_delta
  after insert or update on public.listing_snapshot
  for each row execute function public.ssis_note_review_delta();

-- ── Public profile badges (earned only — no empty slots) ─────────────────────

drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  first_name text,
  city text,
  headshot_url text,
  bio text,
  shopee_store_name text,
  shopee_store_url text,
  is_admin boolean,
  store_links jsonb,
  badges jsonb
)
language sql stable security definer
set search_path = public
as $$
  select
    up.user_id, up.display_name, up.first_name, up.city, up.headshot_url, up.bio,
    up.shopee_store_name,
    coalesce(up.public_shopee_url, up.shopee_store_url) as shopee_store_url,
    public.user_is_platform_admin(up.user_id) as is_admin,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sa.id, 'platform', sa.platform, 'url', sa.url, 'handle', sa.handle
      ) order by sa.created_at)
      from public.student_account sa
      where sa.student_id = up.user_id and sa.kind = 'shop' and sa.active
    ), '[]'::jsonb) as store_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', a.key, 'title', a.title, 'awarded_at', ua.awarded_at
      ) order by ua.awarded_at)
      from public.user_achievements ua
      join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = up.user_id
    ), '[]'::jsonb) as badges
  from public.user_profiles up
  where up.user_id = p_user_id and up.is_public is true;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Own shelf still lists locked badges via achievements catalog.
-- Public classmates only see earned keys from get_public_profile.

drop policy if exists user_achievements_select on public.user_achievements;
create policy user_achievements_select on public.user_achievements
  for select using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.cohort_members m
      join public.cohorts c on c.id = m.cohort_id
      where m.user_id = user_achievements.user_id
        and c.mentor_user_id = auth.uid()
    )
    or exists (
      select 1 from public.user_profiles up
      where up.user_id = user_achievements.user_id
        and up.is_public is true
    )
  );

-- ── New shops start pending (mentor Day-0 verify) ────────────────────────────

create or replace function public.ssis_link_shop(p_url text)
returns public.student_account
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  parsed record;
  v_cohort uuid;
  v_count int;
  rec public.student_account;
begin
  if v_me is null then
    raise exception 'Login diperlukan';
  end if;

  select * into parsed from public.ssis_parse_shop_url(p_url);

  select count(*) into v_count
  from public.student_account
  where student_id = v_me and kind = 'shop' and active;
  if v_count >= 8 then
    raise exception 'Maksimal 8 toko. Nonaktifkan yang lama dulu.';
  end if;

  select m.cohort_id into v_cohort
  from public.cohort_members m
  where m.user_id = v_me and m.status = 'active'
  order by m.joined_at desc nulls last
  limit 1;

  insert into public.student_account (
    student_id, cohort_id, kind, platform, handle, url, platform_ref, active, board_status
  ) values (
    v_me, v_cohort, 'shop', parsed.platform, parsed.handle,
    parsed.canonical_url, parsed.platform_ref, true, 'pending'
  )
  on conflict (student_id, platform, kind, handle) do update
    set url          = excluded.url,
        platform_ref = coalesce(excluded.platform_ref, public.student_account.platform_ref),
        cohort_id    = coalesce(excluded.cohort_id, public.student_account.cohort_id),
        active       = true
        -- relink does not reset board_status / verified_at
  returning * into rec;

  insert into public.cohort_events (
    student_id, ts, source, platform, event_type, confidence, metadata
  ) values (
    v_me, now(), 'laris', rec.platform, 'shop_linked', 1.0,
    jsonb_build_object('student_account_id', rec.id, 'url', rec.url, 'handle', rec.handle)
  );

  if rec.platform = 'shopee' then
    update public.user_profiles
       set public_shopee_url = rec.url,
           shopee_store_url  = rec.url,
           shopee_store_name = coalesce(nullif(shopee_store_name, ''), rec.handle)
     where user_id = v_me;
  end if;

  return rec;
end;
$$;

revoke all on function public.ssis_link_shop(text) from public, anon;
grant execute on function public.ssis_link_shop(text) to authenticated;

-- ── Crawler ingest (service_role only) ───────────────────────────────────────

create or replace function public.ssis_list_crawl_shops()
returns table (
  student_account_id uuid,
  student_id uuid,
  platform text,
  handle text,
  url text,
  platform_ref text
)
language sql
stable
security definer
set search_path = public
as $$
  select sa.id, sa.student_id, sa.platform, sa.handle, sa.url, sa.platform_ref
  from public.student_account sa
  where sa.kind = 'shop' and sa.active;
$$;

revoke all on function public.ssis_list_crawl_shops() from public, anon, authenticated;

create or replace function public.ssis_ingest_shop_day(
  p_student uuid,
  p_platform text,
  p_day date,
  p_listings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_listing uuid;
  v_prev_sold int;
  v_prev_rev int;
  v_sold int;
  v_rev int;
  v_created int := 0;
  v_snap int := 0;
  v_flagged boolean := false;
  v_shop uuid;
  v_age_days int;
begin
  if p_student is null or p_listings is null then
    raise exception 'student and listings required';
  end if;

  select sa.id, greatest(1, (current_date - sa.created_at::date))
    into v_shop, v_age_days
  from public.student_account sa
  where sa.student_id = p_student and sa.kind = 'shop' and sa.platform = p_platform and sa.active
  limit 1;

  for item in select * from jsonb_array_elements(p_listings)
  loop
    insert into public.listing (student_id, platform, platform_item_id, title, first_seen, last_seen)
    values (
      p_student,
      p_platform,
      item->>'platform_item_id',
      left(coalesce(item->>'title', ''), 400),
      now(), now()
    )
    on conflict (student_id, platform, platform_item_id) do update
      set title = excluded.title,
          last_seen = now(),
          delisted_at = null;

    select l.id into v_listing
    from public.listing l
    where l.student_id = p_student
      and l.platform = p_platform
      and l.platform_item_id = item->>'platform_item_id';

    if not exists (
      select 1 from public.cohort_events e
      where e.listing_id = v_listing and e.event_type = 'listing_created'
    ) then
      insert into public.cohort_events (
        student_id, ts, source, platform, event_type, listing_id, confidence, metadata
      ) values (
        p_student, now(), 'shop_crawl', p_platform, 'listing_created', v_listing, 1.0,
        jsonb_build_object('title', item->>'title')
      );
      v_created := v_created + 1;
    end if;

    select sn.sold, sn.reviews into v_prev_sold, v_prev_rev
    from public.listing_snapshot sn
    where sn.listing_id = v_listing and sn.day < p_day
    order by sn.day desc
    limit 1;

    v_sold := nullif(item->>'sold', '')::int;
    v_rev := nullif(item->>'reviews', '')::int;

    insert into public.listing_snapshot (
      listing_id, day, captured_at, price_idr, stock, sold, rating, reviews, photos
    ) values (
      v_listing, p_day, now(),
      nullif(item->>'price_idr', '')::bigint,
      nullif(item->>'stock', '')::int,
      v_sold,
      nullif(item->>'rating', '')::numeric,
      v_rev,
      nullif(item->>'photos', '')::int
    )
    on conflict (listing_id, day) do update
      set captured_at = now(),
          price_idr = excluded.price_idr,
          stock = excluded.stock,
          sold = excluded.sold,
          rating = excluded.rating,
          reviews = excluded.reviews,
          photos = excluded.photos;
    v_snap := v_snap + 1;

    if v_prev_sold is not null and v_sold is not null and v_sold > v_prev_sold then
      insert into public.cohort_events (
        student_id, ts, source, platform, event_type, listing_id, quantity, confidence, metadata
      ) values (
        p_student, now(), 'shop_crawl', p_platform, 'listing_sold_increased', v_listing,
        v_sold - v_prev_sold, 1.0,
        jsonb_build_object('from', v_prev_sold, 'to', v_sold)
      );
      if (v_sold - v_prev_sold) > 30 and v_age_days < 60
         and coalesce(v_rev, 0) <= coalesce(v_prev_rev, 0) then
        v_flagged := true;
      end if;
    end if;

    if v_prev_rev is not null and v_rev is not null and v_rev > v_prev_rev then
      insert into public.cohort_events (
        student_id, ts, source, platform, event_type, listing_id, quantity, confidence, metadata
      ) values (
        p_student, now(), 'shop_crawl', p_platform, 'review_received', v_listing,
        v_rev - v_prev_rev, 1.0,
        jsonb_build_object('from', v_prev_rev, 'to', v_rev)
      );
    end if;
  end loop;

  insert into public.sensor_health (student_id, sensor, day, events_seen, expected, status)
  values (p_student, 'shop_crawl', p_day, v_snap, 1, case when v_snap > 0 then 'ok' else 'dark' end)
  on conflict (student_id, sensor, day) do update
    set events_seen = excluded.events_seen,
        expected = excluded.expected,
        status = excluded.status;

  if v_flagged and v_shop is not null then
    update public.student_account
       set board_status = 'needs_review'
     where id = v_shop and board_status = 'included';
    insert into public.cohort_events (student_id, ts, source, platform, event_type, confidence, metadata)
    values (p_student, now(), 'shop_crawl', p_platform, 'needs_review', 1.0,
            jsonb_build_object('reason', 'sold_delta_without_reviews'));
  end if;

  perform public.ssis_refresh_verified_badges(p_student);

  return jsonb_build_object('created', v_created, 'snapshots', v_snap, 'flagged', v_flagged);
end;
$$;

revoke all on function public.ssis_ingest_shop_day(uuid, text, date, jsonb) from public, anon, authenticated;
revoke all on function public.ssis_list_crawl_shops() from public, anon, authenticated;
do $$
begin
  grant execute on function public.ssis_ingest_shop_day(uuid, text, date, jsonb) to service_role;
  grant execute on function public.ssis_list_crawl_shops() to service_role;
exception when undefined_object then
  null;
end $$;

-- ── WA recipient list for send-cohort-whatsapp ───────────────────────────────

create or replace function public.cohort_member_phones(p_cohort uuid)
returns table (user_id uuid, display_name text, phone text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_manage_cohort(p_cohort) and not public.is_platform_admin() then
    raise exception 'Hanya mentor/admin';
  end if;
  return query
  select m.user_id,
         coalesce(nullif(trim(up.display_name), ''), split_part(au.email, '@', 1), 'Siswa'),
         coalesce(
           (select t.notify_wa_number from public.user_tracker_state t where t.user_id = m.user_id),
           nullif(btrim(up.public_whatsapp), '')
         )
  from public.cohort_members m
  left join public.user_profiles up on up.user_id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.cohort_id = p_cohort and m.status = 'active' and m.role = 'student';
end;
$$;

revoke all on function public.cohort_member_phones(uuid) from public, anon;
grant execute on function public.cohort_member_phones(uuid) to authenticated;

-- ── Admin ops rollup ─────────────────────────────────────────────────────────

create or replace function public.ssis_ops_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Admin only';
  end if;
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
    )
  );
end;
$$;

revoke all on function public.ssis_ops_overview() from public, anon;
grant execute on function public.ssis_ops_overview() to authenticated;

notify pgrst, 'reload schema';
