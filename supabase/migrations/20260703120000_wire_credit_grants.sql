-- Wire up the credit system so real users actually receive credits.
-- Context (2026-07-03 audit): grant_due_monthly_credits() existed but no cron
-- job ever called it, and nothing created a user_credits row at signup — the
-- client treats a missing row as balance 0, so every non-privileged user had
-- 0 credits forever and the credit-gated Deep Dive tabs were unreachable.
-- Credits stay (anti-bot + Chrome-extension incentive); this only makes the
-- intended 20/month grant real.

-- 1. Welcome credits: create the user_credits row the moment a user signs up.
create or replace function public.handle_new_user_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_credits (user_id, balance, earned_total, last_monthly_grant_at, monthly_free_expires_at)
  values (new.id, 20, 20, now(), now() + interval '30 days')
  on conflict (user_id) do nothing;

  insert into public.credit_events (user_id, type, amount)
  values (new.id, 'earn_welcome', 20);

  return new;
exception when others then
  -- never block signup on credits bookkeeping
  return new;
end;
$$;

revoke all on function public.handle_new_user_credits() from public;

drop trigger if exists on_auth_user_created_credits on auth.users;
create trigger on_auth_user_created_credits
  after insert on auth.users
  for each row execute function public.handle_new_user_credits();

-- 2. Daily cron so the anniversary-based monthly grant actually runs.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'grant-monthly-credits') then
    perform cron.unschedule('grant-monthly-credits');
  end if;
end $$;

select cron.schedule(
  'grant-monthly-credits',
  '15 3 * * *',                      -- daily 03:15 UTC (~10:15 WIB)
  $$select public.grant_due_monthly_credits()$$
);

-- 3. Backfill: welcome credits for every existing user with no credits row.
with missing as (
  select u.id
  from auth.users u
  left join public.user_credits uc on uc.user_id = u.id
  where uc.user_id is null
),
ins as (
  insert into public.user_credits (user_id, balance, earned_total, last_monthly_grant_at, monthly_free_expires_at)
  select id, 20, 20, now(), now() + interval '30 days' from missing
  returning user_id
)
insert into public.credit_events (user_id, type, amount)
select user_id, 'earn_welcome', 20 from ins;

-- 4. Top up any existing zero-balance rows that haven't been granted recently.
with topped as (
  update public.user_credits
  set balance = balance + 20,
      earned_total = earned_total + 20,
      last_monthly_grant_at = now(),
      monthly_free_expires_at = now() + interval '30 days',
      updated_at = now()
  where balance <= 0
    and (last_monthly_grant_at is null or last_monthly_grant_at < now() - interval '27 days')
  returning user_id
)
insert into public.credit_events (user_id, type, amount)
select user_id, 'earn_monthly', 20 from topped;
