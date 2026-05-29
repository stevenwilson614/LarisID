-- Fix cohort_sessions RLS: use can_manage_cohort() instead of mentor_user_id only.
-- Platform admins previewing a cohort and mentors assigned via cohort_members.role
-- = 'mentor' (without being cohorts.mentor_user_id) were blocked on insert/update/delete.

drop policy if exists cs_select on public.cohort_sessions;
create policy cs_select on public.cohort_sessions
  for select using (
    public.can_manage_cohort(cohort_id)
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohort_sessions.cohort_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
  );

drop policy if exists cs_insert on public.cohort_sessions;
create policy cs_insert on public.cohort_sessions
  for insert with check (public.can_manage_cohort(cohort_id));

drop policy if exists cs_update on public.cohort_sessions;
create policy cs_update on public.cohort_sessions
  for update using (public.can_manage_cohort(cohort_id))
  with check (public.can_manage_cohort(cohort_id));

drop policy if exists cs_delete on public.cohort_sessions;
create policy cs_delete on public.cohort_sessions
  for delete using (public.can_manage_cohort(cohort_id));

-- Align cohort-docs storage policies (same mentor_user_id-only gap).
drop policy if exists cohort_docs_select on storage.objects;
create policy cohort_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cohort-docs'
    and (
      public.can_manage_cohort((storage.foldername(name))[1]::uuid)
      or exists (
        select 1 from public.cohort_members m
        where m.cohort_id = (storage.foldername(name))[1]::uuid
          and m.user_id = auth.uid() and m.status = 'active'
      )
    )
  );

drop policy if exists cohort_docs_insert on storage.objects;
create policy cohort_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cohort-docs'
    and public.can_manage_cohort((storage.foldername(name))[1]::uuid)
  );

drop policy if exists cohort_docs_update on storage.objects;
create policy cohort_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cohort-docs'
    and public.can_manage_cohort((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'cohort-docs'
    and public.can_manage_cohort((storage.foldername(name))[1]::uuid)
  );

drop policy if exists cohort_docs_delete on storage.objects;
create policy cohort_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cohort-docs'
    and public.can_manage_cohort((storage.foldername(name))[1]::uuid)
  );
