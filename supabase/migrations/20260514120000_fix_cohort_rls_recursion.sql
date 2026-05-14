-- Fix infinite recursion: cohorts_select referenced cohort_members, and
-- cohort_members_select referenced cohorts, so each SELECT re-evaluated the other policy.
--
-- Replace the inline EXISTS (cohorts ...) branch with a SECURITY DEFINER helper
-- so cohort visibility checks do not re-enter cohorts_select from inside
-- cohort_members policies.

create or replace function public.can_leader_view_cohort_roster(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.cohorts c
      where c.id = p_cohort
        and c.mentor_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.cohort_members m
      where m.cohort_id = p_cohort
        and m.user_id = auth.uid()
        and m.role = 'mentor'
        and m.status = 'active'
    );
$$;

revoke all on function public.can_leader_view_cohort_roster(uuid) from public;
grant execute on function public.can_leader_view_cohort_roster(uuid) to authenticated;

drop policy if exists cohort_members_select on public.cohort_members;
create policy cohort_members_select on public.cohort_members
  for select using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or public.can_leader_view_cohort_roster(cohort_members.cohort_id)
  );
