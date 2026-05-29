-- Cohort class-day documents: private Storage bucket for files attached to
-- cohort_sessions. Object paths are `<cohort_id>/<session_id-or-temp>/<filename>`,
-- so the first folder segment is the cohort id. Members of an active cohort can
-- read; only the cohort mentor can write/replace/delete.

-- ── Bucket ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('cohort-docs', 'cohort-docs', false)
on conflict (id) do nothing;

-- ── Policies on storage.objects (scoped to bucket_id = 'cohort-docs') ───────────
-- Cohort id is the first path segment: (storage.foldername(name))[1]::uuid.
-- Membership checks mirror public.cohort_sessions / public.milestone_content RLS.

drop policy if exists cohort_docs_select on storage.objects;
create policy cohort_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cohort-docs'
    and (
      exists (
        select 1 from public.cohort_members m
        where m.cohort_id = (storage.foldername(name))[1]::uuid
          and m.user_id = auth.uid() and m.status = 'active'
      )
      or exists (
        select 1 from public.cohorts c
        where c.id = (storage.foldername(name))[1]::uuid
          and c.mentor_user_id = auth.uid()
      )
    )
  );

drop policy if exists cohort_docs_insert on storage.objects;
create policy cohort_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cohort-docs'
    and exists (
      select 1 from public.cohorts c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists cohort_docs_update on storage.objects;
create policy cohort_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cohort-docs'
    and exists (
      select 1 from public.cohorts c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.mentor_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'cohort-docs'
    and exists (
      select 1 from public.cohorts c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists cohort_docs_delete on storage.objects;
create policy cohort_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cohort-docs'
    and exists (
      select 1 from public.cohorts c
      where c.id = (storage.foldername(name))[1]::uuid
        and c.mentor_user_id = auth.uid()
    )
  );
