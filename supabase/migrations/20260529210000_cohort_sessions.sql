-- Cohort sessions: leader-created calendar entries for scheduling programs,
-- writing session notes, and linking milestones + documents.

create table if not exists public.cohort_sessions (
  id             uuid        primary key default gen_random_uuid(),
  cohort_id      uuid        not null references public.cohorts(id) on delete cascade,
  title          text        not null check (char_length(trim(title)) > 0),
  session_date   date        not null,
  notes          text,
  milestone_ids  uuid[]      not null default '{}',
  document_urls  text[]      not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_cohort_sessions_cohort on public.cohort_sessions (cohort_id, session_date);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.cohort_sessions enable row level security;

create policy cs_select on public.cohort_sessions
  for select using (
    exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohort_sessions.cohort_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (
      select 1 from public.cohorts c
      where c.id = cohort_sessions.cohort_id and c.mentor_user_id = auth.uid()
    )
  );

create policy cs_insert on public.cohort_sessions
  for insert with check (
    exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

create policy cs_update on public.cohort_sessions
  for update using (
    exists (select 1 from public.cohorts c where c.id = cohort_sessions.cohort_id and c.mentor_user_id = auth.uid())
  );

create policy cs_delete on public.cohort_sessions
  for delete using (
    exists (select 1 from public.cohorts c where c.id = cohort_sessions.cohort_id and c.mentor_user_id = auth.uid())
  );
