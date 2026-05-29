-- WS-E: Assignments as an extension of milestones.
-- Milestones gain an "is_assignment" flag + submission_type so the existing
-- curriculum/Program UI can be reused for authoring. Student submissions live in
-- public.assignment_submissions with dual RLS (student owns their row, cohort
-- mentor reads/grades their cohort's submissions). File uploads use a dedicated
-- storage bucket. Mirrors the policy style of 20260529200000_milestone_content.sql.

-- ── Extend milestones ─────────────────────────────────────────────────────────

alter table public.milestones
  add column if not exists is_assignment boolean not null default false,
  add column if not exists submission_type text
    check (submission_type in ('text','link','file'));

-- ── Table: assignment_submissions ─────────────────────────────────────────────

create table if not exists public.assignment_submissions (
  id              uuid        primary key default gen_random_uuid(),
  milestone_id    uuid        not null references public.milestones(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  submission_text text,
  link_url        text,
  file_url        text,
  status          text        not null default 'submitted'
                    check (status in ('submitted','returned','graded')),
  grade           text,
  feedback        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (milestone_id, user_id)
);

create index if not exists idx_asub_milestone on public.assignment_submissions (milestone_id);
create index if not exists idx_asub_user      on public.assignment_submissions (user_id);

-- ── RLS: assignment_submissions ───────────────────────────────────────────────

alter table public.assignment_submissions enable row level security;

-- Student reads own submission; cohort mentor reads submissions for their cohort.
create policy asub_select on public.assignment_submissions
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = assignment_submissions.milestone_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- Student inserts only their own submission, and only for an active membership.
create policy asub_insert on public.assignment_submissions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.milestones ms
      join public.cohort_members m on m.cohort_id = ms.cohort_id
      where ms.id = milestone_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
  );

-- Student updates own submission; cohort mentor updates (to grade / give feedback).
create policy asub_update on public.assignment_submissions
  for update using (
    user_id = auth.uid()
    or exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = assignment_submissions.milestone_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- ── RPC: leader_grade_submission ──────────────────────────────────────────────
-- Mentor-only grading helper. Verifies the caller owns the cohort, sets the
-- grade/feedback and marks the submission graded.

create or replace function public.leader_grade_submission(
  p_submission uuid,
  p_grade      text,
  p_feedback   text
)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_is_mentor boolean;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;

  select exists (
    select 1
    from public.assignment_submissions s
    join public.milestones ms on ms.id = s.milestone_id
    join public.cohorts c on c.id = ms.cohort_id
    where s.id = p_submission and c.mentor_user_id = auth.uid()
  ) into v_is_mentor;

  if not v_is_mentor then raise exception 'Not authorized to grade this submission'; end if;

  update public.assignment_submissions
  set grade      = p_grade,
      feedback   = p_feedback,
      status     = 'graded',
      updated_at = now()
  where id = p_submission;
end;
$$;

revoke all on function public.leader_grade_submission(uuid, text, text) from public;
grant execute on function public.leader_grade_submission(uuid, text, text) to authenticated;

-- ── Storage bucket: assignment-files ──────────────────────────────────────────
-- Public read (so the cohort mentor can open submitted files); writes scoped to
-- the owner via the path prefix submissions/<user_id>/...

insert into storage.buckets (id, name, public)
values ('assignment-files', 'assignment-files', true)
on conflict (id) do nothing;

drop policy if exists "Public read assignment files" on storage.objects;
create policy "Public read assignment files" on storage.objects
  for select
  using (bucket_id = 'assignment-files');

drop policy if exists "Users manage own assignment files" on storage.objects;
create policy "Users manage own assignment files" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'assignment-files'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'assignment-files'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  );
