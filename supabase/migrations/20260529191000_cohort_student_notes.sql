-- Private mentor notes on students, so co-mentors (soft-skill + business-skill)
-- can coordinate on each student. Visible only to a cohort's mentor.
-- Already applied. New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

create table if not exists public.cohort_student_notes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  student_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cohort_student_notes_lookup
  on public.cohort_student_notes (cohort_id, student_user_id, created_at desc);

alter table public.cohort_student_notes enable row level security;

-- Only the cohort's mentor may read/write notes for that cohort.
drop policy if exists csn_select on public.cohort_student_notes;
create policy csn_select on public.cohort_student_notes
  for select using (
    exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists csn_insert on public.cohort_student_notes;
create policy csn_insert on public.cohort_student_notes
  for insert with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists csn_delete on public.cohort_student_notes;
create policy csn_delete on public.cohort_student_notes
  for delete using (
    author_user_id = auth.uid()
    and exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );
