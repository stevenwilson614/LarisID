-- Skill-tracked milestones: soft-skill vs business-skill tracks for cohort education.
-- Adds track/description/due_at to milestones, lets mentors complete milestones on
-- behalf of students, and seeds a starter curriculum for the Ocean Blue cohort.
-- Apply in Supabase SQL Editor or: supabase db push

-- ── Columns ────────────────────────────────────────────────────
alter table public.milestones
  add column if not exists track text not null default 'general'
    check (track in ('soft_skill', 'business_skill', 'general'));

alter table public.milestones
  add column if not exists description text;

alter table public.milestones
  add column if not exists due_at timestamptz;

create index if not exists idx_milestones_cohort_track
  on public.milestones (cohort_id, track, sort_order);

-- ── Mentor-completes-for-student RLS ───────────────────────────
-- Existing ump_insert/ump_delete are self-only (user_id = auth.uid()).
-- Add permissive mentor policies (RLS policies are OR'd) so a cohort's mentor
-- may record/undo milestone completion for that cohort's members — needed for
-- outcomes the system can't auto-detect (e.g. "delivered their pitch").
drop policy if exists ump_insert_mentor on public.user_milestone_progress;
create policy ump_insert_mentor on public.user_milestone_progress
  for insert with check (
    exists (
      select 1
      from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = user_milestone_progress.milestone_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists ump_delete_mentor on public.user_milestone_progress;
create policy ump_delete_mentor on public.user_milestone_progress
  for delete using (
    exists (
      select 1
      from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = user_milestone_progress.milestone_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- ── Starter curriculum seed (Ocean Blue) ───────────────────────
-- Idempotent: keyed on (cohort_id, milestone_key). Safe to re-run.
insert into public.milestones (cohort_id, title, description, track, milestone_key, sort_order)
select c.id, v.title, v.description, v.track, v.milestone_key, v.sort_order
from public.cohorts c
cross join (values
  -- Soft skills (sort_order 100s)
  ('Perkenalkan diri di komunitas', 'Tulis perkenalan singkat di feed kohort — siapa kamu dan kenapa kamu di sini.', 'soft_skill', 'ss_intro', 100),
  ('Tetapkan tujuan pribadi',        'Tentukan satu tujuan yang ingin kamu capai semester ini.',                       'soft_skill', 'ss_goal', 101),
  ('Ajukan pertanyaan pertama',      'Bertanya itu kekuatan. Ajukan satu pertanyaan di feed kohort.',                  'soft_skill', 'ss_first_question', 102),
  ('Bantu sesama siswa',             'Balas atau bantu satu teman sekohort dengan jawaban atau saran.',                'soft_skill', 'ss_help_peer', 103),
  ('Bagikan progres mingguan',       'Ceritakan progres kamu minggu ini — menang kecil tetap menang.',                'soft_skill', 'ss_weekly_update', 104),
  ('Presentasikan ide bisnis',       'Sampaikan ide bisnismu ke mentor atau kohort dengan percaya diri.',             'soft_skill', 'ss_pitch', 105),
  -- Business skills (sort_order 200s)
  ('Lacak 5 produk pertama',         'Pakai Discover untuk menemukan dan melacak 5 produk yang menarik.',              'business_skill', 'bs_track_5', 200),
  ('Selesaikan satu Deep Dive',      'Analisa satu produk secara mendalam: pasar, kompetitor, dan keyword.',           'business_skill', 'bs_deep_dive', 201),
  ('Pilih produk untuk dijual',      'Tandai satu produk dengan "Saya jual ini" sebagai fokus bisnismu.',             'business_skill', 'bs_pick_product', 202),
  ('Hitung unit economics',          'Pakai Kalkulator untuk tahu BEP, profit per unit, dan ROI produkmu.',           'business_skill', 'bs_unit_economics', 203),
  ('Susun Rencana Bisnis',           'Isi Rencana Bisnis: niche, target pasar, dan target 90 hari.',                  'business_skill', 'bs_business_plan', 204),
  ('Catat penjualan pertama',        'Catat penjualan pertamamu — bukti bisnis sudah jalan.',                         'business_skill', 'bs_first_sale', 205)
) as v(title, description, track, milestone_key, sort_order)
where c.slug = 'ocean-blue'
  and not exists (
    select 1 from public.milestones m
    where m.cohort_id = c.id and m.milestone_key = v.milestone_key
  );
