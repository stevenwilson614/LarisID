-- Leader deletes a cohort they manage. Student auth accounts remain; cohort_members
-- and related rows cascade away so former members become independent users.

create or replace function public.leader_delete_cohort(p_cohort uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_cohort is null then
    raise exception 'Cohort id required';
  end if;

  if not public.can_manage_cohort(p_cohort) then
    raise exception 'Forbidden';
  end if;

  delete from public.cohorts
  where id = p_cohort;

  if not found then
    raise exception 'Cohort not found';
  end if;
end;
$$;

revoke all on function public.leader_delete_cohort(uuid) from public;
grant execute on function public.leader_delete_cohort(uuid) to authenticated;
