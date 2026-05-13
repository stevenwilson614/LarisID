-- Allow cohort leaders/admins to edit cohort identity fields that are not part
-- of the color/theme RPC. Colors, emblem, and motto continue to use
-- cohort_leader_update_branding for backwards compatibility.

create or replace function public.cohort_leader_update_identity(
  p_cohort uuid,
  p_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'forbidden';
  end if;

  v_name := trim(coalesce(p_name, ''));
  if length(v_name) < 2 then
    raise exception 'invalid_cohort_name';
  end if;

  update public.cohorts
  set name = left(v_name, 80)
  where id = p_cohort;
end;
$$;

revoke all on function public.cohort_leader_update_identity(uuid, text) from public;
grant execute on function public.cohort_leader_update_identity(uuid, text) to authenticated;
