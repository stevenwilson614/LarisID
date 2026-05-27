-- Monthly free credits renew on each user's signup anniversary (day-of-month),
-- not on the 1st of the calendar month. Run grant_due_monthly_credits() daily
-- via pg_cron / Supabase scheduled job (e.g. 0 3 * * * UTC).

alter table public.user_credits
  add column if not exists last_monthly_grant_at timestamptz,
  add column if not exists monthly_free_expires_at timestamptz;

-- Backfill existing rows from auth.users.created_at
update public.user_credits uc
set
  last_monthly_grant_at = coalesce(uc.last_monthly_grant_at, u.created_at),
  monthly_free_expires_at = coalesce(
    uc.monthly_free_expires_at,
    u.created_at + interval '30 days'
  )
from auth.users u
where uc.user_id = u.id
  and (uc.last_monthly_grant_at is null or uc.monthly_free_expires_at is null);

-- True when p_day (1–31) is today's grant day, clamped to month-end (e.g. signup 31st → Feb 28/29).
create or replace function public.is_billing_anniversary_day(p_anchor_day integer)
returns boolean
language sql
stable
as $$
  select extract(day from current_date)::int = least(
    p_anchor_day,
    extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int
  );
$$;

-- Grant 5 free credits to every user whose anniversary is today and not yet granted this cycle.
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
    values (r.user_id, 5, 5, now(), now() + interval '30 days')
    on conflict (user_id) do update
      set balance = public.user_credits.balance + 5,
          earned_total = public.user_credits.earned_total + 5,
          last_monthly_grant_at = now(),
          monthly_free_expires_at = now() + interval '30 days',
          updated_at = now();

    insert into public.credit_events (user_id, type, amount)
    values (r.user_id, 'earn_monthly', 5);

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.grant_due_monthly_credits() from public;
grant execute on function public.grant_due_monthly_credits() to service_role;

-- Status for dashboard (next grant + expiry countdown)
create or replace function public.get_my_monthly_credit_status()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created_at timestamptz;
  v_anchor_day integer;
  v_last_grant timestamptz;
  v_expires timestamptz;
  v_next_grant date;
  v_cursor date;
  v_last_day integer;
  v_effective integer;
  i integer;
begin
  select created_at into v_created_at
  from auth.users
  where id = auth.uid();

  if v_created_at is null then
    return json_build_object('error', 'not_found');
  end if;

  v_anchor_day := extract(day from v_created_at)::int;

  select last_monthly_grant_at, monthly_free_expires_at
  into v_last_grant, v_expires
  from public.user_credits
  where user_id = auth.uid();

  -- Next grant: today if anniversary and not yet granted today, else next future anchor date
  if public.is_billing_anniversary_day(v_anchor_day)
     and (v_last_grant is null or v_last_grant::date < current_date) then
    v_next_grant := current_date;
  else
    v_cursor := current_date + 1;
    for i in 0..400 loop
      v_last_day := extract(day from (date_trunc('month', v_cursor) + interval '1 month - 1 day'))::int;
      v_effective := least(v_anchor_day, v_last_day);
      if extract(day from v_cursor)::int = v_effective then
        v_next_grant := v_cursor;
        exit;
      end if;
      v_cursor := v_cursor + 1;
    end loop;
  end if;

  if v_next_grant is null then
    v_next_grant := current_date;
  end if;

  return json_build_object(
    'anchor_day', v_anchor_day,
    'signup_at', v_created_at,
    'last_grant_at', v_last_grant,
    'expires_at', v_expires,
    'next_grant_at', v_next_grant,
    'days_until_grant', greatest(0, v_next_grant - current_date),
    'days_until_expiry', case
      when v_expires is null then null
      else greatest(0, ceil(extract(epoch from (v_expires - now())) / 86400.0)::int)
    end
  );
end;
$$;

revoke all on function public.get_my_monthly_credit_status() from public;
grant execute on function public.get_my_monthly_credit_status() to authenticated;
