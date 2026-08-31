-- Mentors (and platform admins) can list LaRISE applicants the same way
-- reviewers already can. Status/notes stay reviewer-only on /rise/admin/.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260831150000_mentor_rise_applications.sql

begin;

create or replace function public.rise_can_see_applications()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.rise_is_reviewer()
    or exists (
      select 1 from public.cohorts c
      where c.mentor_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.cohort_members m
      where m.user_id = (select auth.uid())
        and m.role = 'mentor'
        and m.status = 'active'
    );
$$;

revoke all on function public.rise_can_see_applications() from public, anon, authenticated;
grant execute on function public.rise_can_see_applications() to authenticated;

create or replace function public.rise_applications_list(p_cohort text default 'batch-1')
returns setof public.larisrise_applications
language sql
stable
security definer
set search_path = public
as $$
  -- Non-mentors/reviewers get zero rows rather than an error.
  select a.*
    from public.larisrise_applications a
   where public.rise_can_see_applications()
     and a.cohort = coalesce(nullif(btrim(p_cohort), ''), 'batch-1')
   order by a.created_at asc;
$$;

revoke all on function public.rise_applications_list(text) from public, anon, authenticated;
grant execute on function public.rise_applications_list(text) to authenticated;

commit;
