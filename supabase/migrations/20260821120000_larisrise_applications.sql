-- ============================================================================
-- LarisRise (LaRise) — application intake + reviewer board.
--
-- Why this exists: rise/index.html shipped four "Daftar Program LaRise" CTAs
-- pointing at a dead `#daftar` anchor. Batch 1 is 40 known students competing
-- for 20 seats, reviewed by one person (Afryan), who needs status buckets,
-- private notes, and an explicit notify-on-accept step. A Google Form cannot
-- express any of that, so intake lands here instead.
--
-- Access model — deliberately narrow:
--   * Applicants are ANONYMOUS. They have no LarisID account yet (the program
--     teaches selling from zero), so requiring sign-in would cost completions.
--     rise_submit_application() is the single anon-reachable surface.
--   * The table has RLS on and NO policies, mirroring public.deepdive_opens.
--     Every read and write goes through a security-definer RPC, so a leaked
--     anon key cannot enumerate 40 students' names, phone numbers, and essays.
--   * Reviewers are gated by a new 'rise_reviewer' role rather than by
--     is_platform_admin(), so Afryan sees LarisRise applicants and nothing
--     else — not the user directory, not the KPI dashboard, not Win-back.
--     Promoting him to a broader role later is a one-row update.
--
-- Column shape follows public.mentor_applications (20260525200000), the
-- closest existing precedent — same idea, more statuses.
-- ============================================================================

begin;

-- ── Table ───────────────────────────────────────────────────────────────────

create table if not exists public.larisrise_applications (
  id                 uuid primary key default gen_random_uuid(),
  cohort             text not null default 'batch-1',
  -- Linked only once an accepted student actually onboards; null at intake.
  user_id            uuid references auth.users (id) on delete set null,

  nama               text not null,
  whatsapp           text not null,          -- normalised to 628… at insert
  email              text not null,
  kampus             text,
  jurusan            text,
  semester           text,
  kota               text,

  perangkat          text,   -- HP saja | Laptop saja | Keduanya | Belum punya
  pengalaman_jualan  text,   -- Belum pernah | Pernah coba tapi berhenti | Sedang mencoba
  ide_produk         text,   -- optional by design: bothering to fill it is the intent signal

  hari_tersedia      text[] not null default '{}',   -- Senin…Sabtu, min 3 enforced client+server
  jam_per_minggu     text,                           -- <3 | 3-5 | 5-10 | >10

  alasan             text not null,
  target_3bulan      text not null,

  gate_komitmen      boolean not null default false,
  gate_pembukaan     boolean not null default false,
  gate_paham_seleksi boolean not null default false,

  status             text not null default 'baru'
                       check (status in ('baru','mungkin','diterima','batch_berikutnya','ditolak')),
  skor               smallint check (skor is null or skor between 1 and 5),
  catatan_internal   text,

  -- Stamped only when an acceptance message is actually delivered, so the
  -- notify modal can warn before a second send.
  notified_at        timestamptz,
  reviewed_by        text,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists idx_larisrise_apps_cohort_status
  on public.larisrise_applications (cohort, status);
create index if not exists idx_larisrise_apps_created
  on public.larisrise_applications (created_at desc);

alter table public.larisrise_applications enable row level security;
-- No policies, on purpose. See the access model note above.

-- ── Reviewer role ───────────────────────────────────────────────────────────
-- app_role_assignments.role was constrained to admin/leader/student; widen it
-- rather than overloading 'leader', which already carries cohort semantics.

alter table public.app_role_assignments
  drop constraint if exists app_role_assignments_role_check;
alter table public.app_role_assignments
  add constraint app_role_assignments_role_check
  check (role in ('admin', 'leader', 'student', 'rise_reviewer'));

-- Afryan's Google address goes here once Steven confirms it:
-- insert into public.app_role_assignments (email, role, note)
-- values ('AFRYAN_EMAIL_HERE', 'rise_reviewer', 'LarisRise batch 1 reviewer')
-- on conflict (email) do update set role = excluded.role, updated_at = now();

create or replace function public.rise_is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
    where u.id = auth.uid()
      and (ar.role in ('rise_reviewer', 'admin')
           or lower(u.email) in ('stevenwilson614@gmail.com'))
  );
$$;

revoke all on function public.rise_is_reviewer() from public, anon, authenticated;
grant execute on function public.rise_is_reviewer() to authenticated;

-- ── Intake (anonymous) ──────────────────────────────────────────────────────

create or replace function public.rise_submit_application(payload jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nama    text := left(btrim(coalesce(payload->>'nama', '')), 120);
  v_wa_raw  text := regexp_replace(coalesce(payload->>'whatsapp', ''), '[^0-9]', '', 'g');
  v_wa      text;
  v_email   text := lower(left(btrim(coalesce(payload->>'email', '')), 160));
  v_cohort  text := coalesce(nullif(btrim(payload->>'cohort'), ''), 'batch-1');
  v_hari    text[];
  v_id      uuid;
begin
  -- WhatsApp normalisation: Indonesian numbers arrive as 08…, 8…, +628…, or
  -- 628…. Fonnte needs a bare 628… target, so settle it once at the edge
  -- rather than in every consumer.
  if v_wa_raw like '0%' then
    v_wa := '62' || substr(v_wa_raw, 2);
  elsif v_wa_raw like '62%' then
    v_wa := v_wa_raw;
  elsif v_wa_raw like '8%' then
    v_wa := '62' || v_wa_raw;
  else
    v_wa := v_wa_raw;
  end if;

  if v_nama = '' then
    return json_build_object('ok', false, 'error', 'Nama lengkap wajib diisi.');
  end if;
  if length(v_wa) < 10 or length(v_wa) > 15 then
    return json_build_object('ok', false, 'error', 'Nomor WhatsApp tidak valid.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'Alamat email tidak valid.');
  end if;
  if btrim(coalesce(payload->>'alasan', '')) = ''
     or btrim(coalesce(payload->>'target_3bulan', '')) = '' then
    return json_build_object('ok', false, 'error', 'Pertanyaan motivasi wajib diisi.');
  end if;

  select coalesce(array_agg(d), '{}')
    into v_hari
    from jsonb_array_elements_text(coalesce(payload->'hari_tersedia', '[]'::jsonb)) as d
   where d in ('Senin','Selasa','Rabu','Kamis','Jumat','Sabtu');

  if array_length(v_hari, 1) is null or array_length(v_hari, 1) < 3 then
    return json_build_object('ok', false, 'error', 'Pilih minimal 3 hari yang bisa kamu ikuti.');
  end if;

  -- Soft dedupe: a double-tapped submit button must not create two rows, but a
  -- genuine correction sent the next day should still get through.
  if exists (
    select 1 from public.larisrise_applications a
     where a.cohort = v_cohort
       and lower(a.email) = v_email
       and a.created_at > now() - interval '24 hours'
  ) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.larisrise_applications (
    cohort, nama, whatsapp, email, kampus, jurusan, semester, kota,
    perangkat, pengalaman_jualan, ide_produk, hari_tersedia, jam_per_minggu,
    alasan, target_3bulan, gate_komitmen, gate_pembukaan, gate_paham_seleksi
  ) values (
    v_cohort, v_nama, v_wa, v_email,
    left(btrim(payload->>'kampus'), 160),
    left(btrim(payload->>'jurusan'), 160),
    left(btrim(payload->>'semester'), 40),
    left(btrim(payload->>'kota'), 120),
    left(btrim(payload->>'perangkat'), 40),
    left(btrim(payload->>'pengalaman_jualan'), 60),
    left(btrim(payload->>'ide_produk'), 400),
    v_hari,
    left(btrim(payload->>'jam_per_minggu'), 20),
    left(btrim(payload->>'alasan'), 4000),
    left(btrim(payload->>'target_3bulan'), 4000),
    coalesce((payload->>'gate_komitmen')::boolean, false),
    coalesce((payload->>'gate_pembukaan')::boolean, false),
    coalesce((payload->>'gate_paham_seleksi')::boolean, false)
  )
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.rise_submit_application(jsonb) from public, anon, authenticated;
grant execute on function public.rise_submit_application(jsonb) to anon, authenticated;

-- ── Reviewer reads and writes ───────────────────────────────────────────────

create or replace function public.rise_applications_list(p_cohort text default 'batch-1')
returns setof public.larisrise_applications
language sql
stable
security definer
set search_path = public
as $$
  -- Non-reviewers get zero rows rather than an error, matching
  -- admin_user_directory(). 40 rows per cohort, so no pagination.
  select a.*
    from public.larisrise_applications a
   where public.rise_is_reviewer()
     and a.cohort = coalesce(nullif(btrim(p_cohort), ''), 'batch-1')
   order by a.created_at asc;
$$;

revoke all on function public.rise_applications_list(text) from public, anon, authenticated;
grant execute on function public.rise_applications_list(text) to authenticated;

create or replace function public.rise_set_status(p_id uuid, p_status text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row public.larisrise_applications;
begin
  if not public.rise_is_reviewer() then
    raise exception 'forbidden';
  end if;
  if p_status not in ('baru','mungkin','diterima','batch_berikutnya','ditolak') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.larisrise_applications
     set status      = p_status,
         reviewed_by = coalesce(auth.jwt() ->> 'email', 'unknown'),
         reviewed_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'not found';
  end if;

  return json_build_object(
    'ok', true,
    'status', v_row.status,
    'notified_at', v_row.notified_at
  );
end;
$$;

revoke all on function public.rise_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.rise_set_status(uuid, text) to authenticated;

create or replace function public.rise_set_note(
  p_id   uuid,
  p_note text default null,
  p_skor smallint default null
) returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.rise_is_reviewer() then
    raise exception 'forbidden';
  end if;
  if p_skor is not null and p_skor not between 1 and 5 then
    raise exception 'invalid skor';
  end if;

  update public.larisrise_applications
     set catatan_internal = left(p_note, 4000),
         skor             = p_skor,
         reviewed_by      = coalesce(auth.jwt() ->> 'email', 'unknown'),
         reviewed_at      = now()
   where id = p_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.rise_set_note(uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.rise_set_note(uuid, text, smallint) to authenticated;

-- Called by the rise-notify-accepted edge function after a send succeeds, so
-- the board can warn before notifying the same candidate twice.
create or replace function public.rise_mark_notified(p_id uuid)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.rise_is_reviewer()
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'forbidden';
  end if;

  update public.larisrise_applications
     set notified_at = now()
   where id = p_id;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.rise_mark_notified(uuid) from public, anon, authenticated;
grant execute on function public.rise_mark_notified(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
