-- LarisID is now 100% free — paid credit packs removed entirely.
-- Free monthly grant raised from 5 to 20 credits, and the initial (welcome)
-- balance default raised from 5 to 20.

alter table public.user_credits alter column balance set default 20;

-- Grant 20 free credits to every user whose anniversary is today and not yet granted this cycle.
create or replace function public.grant_due_monthly_credits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
  v_anchor_day integer;
begin
  for r in
    select u.id as user_id, u.created_at
    from auth.users u
  loop
    v_anchor_day := extract(day from r.created_at)::int;

    if not public.is_billing_anniversary_day(v_anchor_day) then
      continue;
    end if;

    -- Skip if already granted in the last 27 days (one grant per ~monthly cycle)
    if exists (
      select 1
      from public.user_credits uc
      where uc.user_id = r.user_id
        and uc.last_monthly_grant_at is not null
        and uc.last_monthly_grant_at > now() - interval '27 days'
    ) then
      continue;
    end if;

    insert into public.user_credits (user_id, balance, earned_total, last_monthly_grant_at, monthly_free_expires_at)
    values (r.user_id, 20, 20, now(), now() + interval '30 days')
    on conflict (user_id) do update
      set balance = public.user_credits.balance + 20,
          earned_total = public.user_credits.earned_total + 20,
          last_monthly_grant_at = now(),
          monthly_free_expires_at = now() + interval '30 days',
          updated_at = now();

    insert into public.credit_events (user_id, type, amount)
    values (r.user_id, 'earn_monthly', 20);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.grant_due_monthly_credits() from public;
grant execute on function public.grant_due_monthly_credits() to service_role;
