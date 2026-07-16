-- Credits -> daily usage limits (2026-07-16 pivot, Steven-approved).
--
-- Model: 3 deep dives/day (a dive = 'full' product access for 7 days via the
-- existing product_unlocks ledger; re-opening an accessed product is free) and a
-- weighted AI pool of 5 points/day (mls_chat 1, path 2, photo 3). No accumulation;
-- counters reset at midnight Asia/Jakarta. Bonuses on the dive limit: paired Chrome
-- extension +3/day, each credited referral +1/day permanent (capped at +5).
-- Admin/leader (current_app_role()) are unlimited.
--
-- DELIBERATELY KEPT LIVE (stale cached clients + harmless history writers):
--   spend_credit, unlock_product, get_product_unlocks, earn_credit,
--   get_my_monthly_credit_status, get_or_create_my_referral_code,
--   user_credits + credit_events + chest_history tables (read-only history).
-- RETIRED HERE: signup welcome-credit trigger, monthly grant cron, chest claims,
--   credit rewards inside redeem_referral.
--
-- ROLLBACK NOTES
--   * trigger/grant fns: re-run sections 1-2 of 20260703120000_wire_credit_grants.sql
--   * cron: select cron.schedule('grant-monthly-credits','15 3 * * *',
--       'select public.grant_due_monthly_credits()');
--   * redeem_referral / my_referral_stats: prior bodies preserved verbatim in the
--     comment block at the bottom of this file (live snapshot 2026-07-16).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.daily_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  dives_used int  not null default 0,
  ai_used    int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_usage enable row level security;

drop policy if exists "own usage select" on public.daily_usage;
create policy "own usage select" on public.daily_usage
  for select using (auth.uid() = user_id);
-- writes only through the SECURITY DEFINER RPCs below

create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('dive','ai')),
  action      text,                -- 'deepdive' | 'mls_chat' | 'path' | 'photo'
  weight      int  not null default 1,
  product_key text,
  created_at  timestamptz not null default now()
);

create index if not exists usage_events_user_created_idx
  on public.usage_events(user_id, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "own usage events select" on public.usage_events;
create policy "own usage events select" on public.usage_events
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Helpers (not granted to clients; called from the RPCs)
-- ---------------------------------------------------------------------------

create or replace function public._usage_day()
returns date
language sql stable
as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

create or replace function public._usage_seconds_until_reset()
returns integer
language sql stable
as $$
  select greatest(1, extract(epoch from (
    ((public._usage_day() + 1)::timestamp at time zone 'Asia/Jakarta') - now()
  ))::int)
$$;

create or replace function public._usage_is_privileged()
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.current_app_role() in ('admin','leader'), false) $$;

-- 3 base + 3 if a paired extension + 1 per credited referral (max 5)
create or replace function public._dive_limit(p_user uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select 3
    + case when exists (
        select 1 from public.extension_codes
        where user_id = p_user and used = true
      ) then 3 else 0 end
    + least(5, coalesce((
        select count(*)::int from public.referrals
        where referrer_id = p_user and credited = true
      ), 0))
$$;

revoke all on function public._usage_day() from public;
revoke all on function public._usage_seconds_until_reset() from public;
revoke all on function public._usage_is_privileged() from public;
revoke all on function public._dive_limit(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. get_my_usage()
-- ---------------------------------------------------------------------------

create or replace function public.get_my_usage()
returns json
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_row   public.daily_usage%rowtype;
  v_limit integer;
  v_ext   boolean;
  v_ref   integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if public._usage_is_privileged() then
    return json_build_object(
      'unlimited', true,
      'dives_used', 0, 'dive_limit', null,
      'ai_used', 0, 'ai_limit', null,
      'extension_bonus', 0, 'referral_bonus', 0,
      'seconds_until_reset', public._usage_seconds_until_reset()
    );
  end if;

  select * into v_row from public.daily_usage
   where user_id = v_me and day = public._usage_day();

  v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
  v_ref := least(5, coalesce((select count(*)::int from public.referrals
                               where referrer_id = v_me and credited = true), 0));
  v_limit := 3 + case when v_ext then 3 else 0 end + v_ref;

  return json_build_object(
    'unlimited', false,
    'dives_used', coalesce(v_row.dives_used, 0),
    'dive_limit', v_limit,
    'ai_used', coalesce(v_row.ai_used, 0),
    'ai_limit', 5,
    'extension_bonus', case when v_ext then 3 else 0 end,
    'referral_bonus', v_ref,
    'seconds_until_reset', public._usage_seconds_until_reset()
  );
end;
$$;

revoke all on function public.get_my_usage() from public;
grant execute on function public.get_my_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. use_dive(product_key)
-- ---------------------------------------------------------------------------
-- Idempotent per product: an active 'full' unlock returns already_accessed with
-- no increment. Otherwise atomically consumes 1 dive (guarded UPDATE so two
-- concurrent calls cannot exceed the limit) and grants 7-day 'full' access via
-- the existing product_unlocks ledger (so old paid unlocks carry over unchanged).

create or replace function public.use_dive(p_product_key text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_me      uuid := auth.uid();
  v_limit   integer;
  v_used    integer;
  v_expires timestamptz;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_product_key is null or length(trim(p_product_key)) = 0 then
    raise exception 'invalid_product_key';
  end if;

  if public._usage_is_privileged() then
    insert into public.product_unlocks (user_id, product_key, scope, unlocked_at, expires_at)
    values (v_me, p_product_key, 'full', now(), now() + interval '7 days')
    on conflict (user_id, product_key, scope) do update
      set expires_at = greatest(public.product_unlocks.expires_at, excluded.expires_at)
    returning expires_at into v_expires;
    return json_build_object('allowed', true, 'unlimited', true,
                             'already_accessed', false, 'expires_at', v_expires);
  end if;

  -- already has active full access -> free re-open, no increment
  select expires_at into v_expires
    from public.product_unlocks
   where user_id = v_me and product_key = p_product_key
     and scope = 'full' and expires_at > now()
   limit 1;

  v_limit := public._dive_limit(v_me);

  if v_expires is not null then
    select dives_used into v_used from public.daily_usage
     where user_id = v_me and day = public._usage_day();
    return json_build_object(
      'allowed', true, 'already_accessed', true, 'expires_at', v_expires,
      'dives_used', coalesce(v_used, 0), 'dive_limit', v_limit,
      'seconds_until_reset', public._usage_seconds_until_reset());
  end if;

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set dives_used = dives_used + 1, updated_at = now()
   where user_id = v_me and day = public._usage_day()
     and dives_used < v_limit
  returning dives_used into v_used;

  if v_used is null then
    select dives_used into v_used from public.daily_usage
     where user_id = v_me and day = public._usage_day();
    return json_build_object(
      'allowed', false, 'reason', 'limit_reached',
      'dives_used', coalesce(v_used, 0), 'dive_limit', v_limit,
      'seconds_until_reset', public._usage_seconds_until_reset());
  end if;

  insert into public.product_unlocks (user_id, product_key, scope, unlocked_at, expires_at)
  values (v_me, p_product_key, 'full', now(), now() + interval '7 days')
  on conflict (user_id, product_key, scope) do update
    set unlocked_at = now(), expires_at = excluded.expires_at
  returning expires_at into v_expires;

  insert into public.usage_events (user_id, kind, action, weight, product_key)
  values (v_me, 'dive', 'deepdive', 1, p_product_key);

  return json_build_object(
    'allowed', true, 'already_accessed', false, 'expires_at', v_expires,
    'dives_used', v_used, 'dive_limit', v_limit,
    'seconds_until_reset', public._usage_seconds_until_reset());
end;
$$;

revoke all on function public.use_dive(text) from public;
grant execute on function public.use_dive(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. use_ai(action)
-- ---------------------------------------------------------------------------
-- Weight is derived server-side; pool of 5 points per Jakarta day.

create or replace function public.use_ai(p_action text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_weight integer;
  v_used   integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  v_weight := case p_action
    when 'mls_chat' then 1
    when 'path'     then 2
    when 'photo'    then 3
    else null end;
  if v_weight is null then raise exception 'invalid_action'; end if;

  if public._usage_is_privileged() then
    return json_build_object('allowed', true, 'unlimited', true, 'weight', v_weight);
  end if;

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set ai_used = ai_used + v_weight, updated_at = now()
   where user_id = v_me and day = public._usage_day()
     and ai_used + v_weight <= 5
  returning ai_used into v_used;

  if v_used is null then
    select ai_used into v_used from public.daily_usage
     where user_id = v_me and day = public._usage_day();
    return json_build_object(
      'allowed', false, 'reason', 'limit_reached', 'weight', v_weight,
      'ai_used', coalesce(v_used, 0), 'ai_limit', 5,
      'seconds_until_reset', public._usage_seconds_until_reset());
  end if;

  insert into public.usage_events (user_id, kind, action, weight)
  values (v_me, 'ai', p_action, v_weight);

  return json_build_object(
    'allowed', true, 'weight', v_weight,
    'ai_used', v_used, 'ai_limit', 5,
    'seconds_until_reset', public._usage_seconds_until_reset());
end;
$$;

revoke all on function public.use_ai(text) from public;
grant execute on function public.use_ai(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Referrals: reward becomes +1 permanent daily dive (cap +5), no credits
-- ---------------------------------------------------------------------------
-- Same signature as before so stale cached clients keep working. All guards
-- kept. credited=true always once guards pass (the +5 cap is applied where the
-- bonus is computed, not at insert time, since the bonus is now permanent).

create or replace function public.redeem_referral(p_code text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_me       uuid := auth.uid();
  v_created  timestamptz;
  v_count    integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_code is null or length(trim(p_code)) = 0 then
    return json_build_object('ok', false, 'reason', 'no_code');
  end if;

  select user_id into v_referrer from public.referral_codes where code = upper(trim(p_code));
  if v_referrer is null then return json_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if v_referrer = v_me then return json_build_object('ok', false, 'reason', 'self'); end if;

  if exists (select 1 from public.referrals where referred_id = v_me) then
    return json_build_object('ok', false, 'reason', 'already_referred');
  end if;

  select created_at into v_created from auth.users where id = v_me;
  if v_created < now() - interval '7 days' then
    return json_build_object('ok', false, 'reason', 'not_new');
  end if;

  insert into public.referrals(referrer_id, referred_id, credited) values (v_referrer, v_me, true);

  select count(*)::int into v_count
    from public.referrals where referrer_id = v_referrer and credited = true;

  -- 'reward' kept for stale clients (they showed a credit amount; 0 is honest now)
  return json_build_object('ok', true, 'reward', 0,
                           'referrer_daily_bonus', least(5, v_count));
end;
$$;

create or replace function public.my_referral_stats()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_code     text;
  v_total    integer;
  v_credited integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_code := public.get_or_create_my_referral_code();
  select count(*) into v_total from public.referrals where referrer_id = auth.uid();
  select count(*) into v_credited from public.referrals
   where referrer_id = auth.uid() and credited = true;
  return json_build_object(
    'code', v_code,
    'total', v_total,
    'credited_count', v_credited,
    'bonus_active', least(5, v_credited),
    'cap', 5,
    'per_invite_bonus', 1,
    -- legacy keys so stale cached clients degrade sanely
    'month_count', least(5, v_credited),
    'per_invite', 1,
    'month_reward', 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Retire credit minting
-- ---------------------------------------------------------------------------

drop trigger if exists on_auth_user_created_credits on auth.users;
drop function if exists public.handle_new_user_credits();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'grant-monthly-credits') then
    perform cron.unschedule('grant-monthly-credits');
  end if;
end $$;

-- chest can no longer mint (UI removed client-side in the same pass)
revoke execute on function public.claim_weekly_chest() from authenticated;

-- ---------------------------------------------------------------------------
-- LIVE SNAPSHOTS (2026-07-16, pre-migration) for rollback
-- ---------------------------------------------------------------------------
-- redeem_referral previously (20260706140000 + live): after the same guards it
-- checked a per-calendar-month credited cap of 5, inserted referrals with
-- credited=false when capped, and on success added 25 credits to the referrer:
--   insert into user_credits(user_id, balance, earned_total) values (v_referrer, 25, 25)
--     on conflict (user_id) do update set balance = user_credits.balance + 25, ...;
--   insert into credit_events(user_id, type, amount) values (v_referrer, 'earn_referral', 25);
--   returned {'ok', true, 'reward', 25} or {'ok', true, 'capped', true, 'reward', 0}.
-- my_referral_stats previously returned:
--   {code, month_count (credited this month), total, cap:5, per_invite:25,
--    month_reward: month_count*25}.
-- spend_credit (kept live, unchanged): deducts from user_credits, inserts
--   credit_events('spend_view', -amount, keyword), upserts keyword_library row,
--   returns new balance. earn_credit (kept live, unchanged): extension earn path,
--   +amount to user_credits and credit_events('earn_search').
