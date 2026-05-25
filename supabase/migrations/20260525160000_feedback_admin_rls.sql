-- Platform admins can read and update all feedback (admin dashboard + vault)
create policy "platform admin can read all feedback"
  on public.feedback
  for select
  to authenticated
  using (public.is_platform_admin());

create policy "platform admin can update feedback"
  on public.feedback
  for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Default status for new rows if column exists without default
alter table public.feedback
  alter column status set default 'new';
