-- Kohort Pertama: Bau-Bau mentors Hendra + Afryan, 8 Selasa 15:00 WIB sessions,
-- student signup invite, class roster RPC, and auto/terukur milestones.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260908140000_kohort_pertama.sql

-- ── Class roster for Siswa tab (members see mentors + classmates) ───────────
create or replace function public.cohort_class_roster(p_cohort uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  wa text,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not (
    public.is_platform_admin()
    or public.can_manage_cohort(p_cohort)
    or exists (
      select 1 from public.cohort_members me
      where me.cohort_id = p_cohort
        and me.user_id = auth.uid()
        and me.status = 'active'
    )
  ) then
    raise exception 'not_a_member';
  end if;

  return query
  select
    m.user_id,
    coalesce(
      nullif(trim(both from coalesce(up.display_name, '')), ''),
      nullif(trim(both from coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
      split_part(u.email, '@', 1),
      'Anggota'
    )::text as display_name,
    m.role::text,
    case
      when m.role = 'mentor' then coalesce(
        nullif(btrim(up.wa_number), ''),
        nullif(btrim(up.public_whatsapp), ''),
        (select t.notify_wa_number from public.user_tracker_state t where t.user_id = m.user_id)
      )
      else nullif(btrim(up.public_whatsapp), '')
    end::text as wa,
    (m.user_id = auth.uid()) as is_me
  from public.cohort_members m
  join auth.users u on u.id = m.user_id
  left join public.user_profiles up on up.user_id = m.user_id
  where m.cohort_id = p_cohort
    and m.status = 'active'
    and m.role in ('mentor', 'student')
  order by
    case when m.role = 'mentor' then 0 else 1 end,
    display_name;
end;
$$;

revoke all on function public.cohort_class_roster(uuid) from public;
grant execute on function public.cohort_class_roster(uuid) to authenticated;

-- ── Seed Kohort Pertama ─────────────────────────────────────────────────────
do $$
declare
  v_hendra uuid;
  v_afryan uuid;
  v_cid    uuid;
  v_dates  date[] := array[
    date '2026-09-01',
    date '2026-09-08',
    date '2026-09-15',
    date '2026-09-22',
    date '2026-09-29',
    date '2026-10-06',
    date '2026-10-13',
    date '2026-10-20'
  ];
  i int;
begin
  select id into v_hendra from auth.users where email = 'hendra19feb@gmail.com' limit 1;
  select id into v_afryan from auth.users where email = 'afryannp@gmail.com' limit 1;

  if v_hendra is null then
    raise exception 'mentor_missing: hendra19feb@gmail.com';
  end if;
  if v_afryan is null then
    raise exception 'mentor_missing: afryannp@gmail.com';
  end if;

  -- Leaders so mentors can create/manage. Do not demote Afryan's rise_reviewer.
  insert into public.app_role_assignments (email, role, note)
  values ('hendra19feb@gmail.com', 'leader', 'Kohort Pertama mentor (Hendra)')
  on conflict (email) do update
    set role = case
          when public.app_role_assignments.role = 'admin' then 'admin'
          else 'leader'
        end,
        note = excluded.note,
        updated_at = now();

  insert into public.app_role_assignments (email, role, note)
  values ('afryannp@gmail.com', 'leader', 'Kohort Pertama mentor (Afryan)')
  on conflict (email) do update
    set role = case
          when public.app_role_assignments.role in ('admin', 'rise_reviewer')
            then public.app_role_assignments.role
          else 'leader'
        end,
        note = coalesce(public.app_role_assignments.note, excluded.note),
        updated_at = now();

  insert into public.cohorts (
    name, slug, invite_code, mentor_user_id, starts_at, slogan
  )
  values (
    'Kohort Pertama',
    'kohort-pertama',
    'KOHORT1',
    v_hendra,
    timestamptz '2026-09-01 15:00:00+07',
    'Belajar jualan bareng mentor lokal'
  )
  on conflict (slug) do update
    set name = excluded.name,
        invite_code = excluded.invite_code,
        mentor_user_id = excluded.mentor_user_id,
        starts_at = excluded.starts_at,
        slogan = excluded.slogan
  returning id into v_cid;

  if v_cid is null then
    select id into v_cid from public.cohorts where slug = 'kohort-pertama';
  end if;

  -- Keep invite_code unique even if another row held KOHORT1.
  update public.cohorts
  set invite_code = 'KOHORT1'
  where id = v_cid;

  insert into public.cohort_invite_codes (cohort_id, invite_code, role, note)
  values (v_cid, 'KOHORT1', 'student', 'Kohort Pertama student signup')
  on conflict (invite_code) do update
    set cohort_id = excluded.cohort_id,
        role = excluded.role,
        note = excluded.note;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values
    (v_cid, v_hendra, 'mentor', 'active'),
    (v_cid, v_afryan, 'mentor', 'active')
  on conflict (cohort_id, user_id) do update
    set role = 'mentor', status = 'active';

  -- Jadwal: 8× Selasa 15:00 WIB — Kegiatan 1 … Kegiatan 8
  for i in 1..8 loop
    insert into public.cohort_sessions (
      cohort_id, title, session_date, start_time, end_time, timezone, starts_at, notes, meet_url
    )
    select
      v_cid,
      'Kegiatan ' || i,
      v_dates[i],
      time '15:00',
      time '16:30',
      'Asia/Jakarta',
      ((v_dates[i]::text || ' 15:00:00')::timestamp at time zone 'Asia/Jakarta'),
      'Pertemuan mingguan · Selasa 15:00 WIB',
      'https://us06web.zoom.us/j/88393238624?pwd=pavGSKFeAm0leH7lMSiwau0973UiOn.1'
    where not exists (
      select 1 from public.cohort_sessions s
      where s.cohort_id = v_cid
        and s.session_date = v_dates[i]
        and s.title = 'Kegiatan ' || i
    );
  end loop;

  -- Milestone checklist (auto + terukur)
  insert into public.milestones (cohort_id, title, description, track, milestone_key, sort_order)
  select v_cid, v.title, v.description, v.track, v.milestone_key, v.sort_order
  from (values
    ('Buka Deep Dive pertama',
     'Buka satu analisa produk mendalam di Laris.',
     'business_skill', 'first_deep_dive', 10),
    ('Buka Kalkulator',
     'Buka panel Kalkulator untuk hitung margin / profit.',
     'business_skill', 'open_kalkulator', 20),
    ('Tanya Laris AI',
     'Kirim satu pertanyaan ke Laris AI (composer atau panel AI).',
     'business_skill', 'ask_laris_ai', 30),
    ('Simpan 1 produk ke Favorit',
     'Simpan satu produk ke Favorit Aku.',
     'business_skill', 'save_favorit', 40),
    ('Tautkan toko Shopee',
     'Tempel URL toko Shopee di kartu Toko Saya.',
     'business_skill', 'link_shop', 50),
    ('Listing produk pertama',
     'Toko punya minimal 1 produk live (terukur dari crawl).',
     'business_skill', 'first_listing', 60),
    ('Dapat ulasan pertama',
     'Ada ulasan baru sejak toko terhubung (terukur).',
     'business_skill', 'first_review', 70),
    ('Penjualan pertama',
     'Ada unit terjual sejak toko terhubung (terukur).',
     'business_skill', 'first_sale', 80)
  ) as v(title, description, track, milestone_key, sort_order)
  where not exists (
    select 1 from public.milestones m
    where m.cohort_id = v_cid and m.milestone_key = v.milestone_key
  );
end;
$$;
