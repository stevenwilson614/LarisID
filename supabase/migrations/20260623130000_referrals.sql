-- Referral system: each user has a share code; when a NEW user signs up via a
-- referral link and redeems the code, the referrer earns 50 credits. Earn-only,
-- no money. Guards against self-referral, double-redemption, and old accounts.

create table if not exists public.referral_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code       text unique not null,
  created_at timestamptz not null default now()
);

alter table public.referral_codes enable row level security;

drop policy if exists "own code select" on public.referral_codes;
create policy "own code select" on public.referral_codes
  for select using (auth.uid() = user_id);

create table if not exists public.referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  credited    boolean not null default true,
  unique (referred_id)   -- a user can only be referred once
);

create index if not exists referrals_referrer_idx on public.referrals(referrer_id);

alter table public.referrals enable row level security;

drop policy if exists "own referrals select" on public.referrals;
create policy "own referrals select" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Returns (creating if needed) the caller's share code.
create or replace function public.get_or_create_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select code into v_code from public.referral_codes where user_id = auth.uid();
  if v_code is not null then return v_code; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referral_codes(user_id, code) values (auth.uid(), v_code);
      return v_code;
    exception when unique_violation then
      select code into v_code from public.referral_codes where user_id = auth.uid();
      if v_code is not null then return v_code; end if;
      -- otherwise it was a code collision → loop and retry
    end;
  end loop;
end;
$$;

revoke all on function public.get_or_create_my_referral_code() from public;
grant execute on function public.get_or_create_my_referral_code() to authenticated;

-- Called by the NEWLY signed-up user to redeem a referral code. Credits the
-- referrer +50. Returns { ok, reason?, reward? }.
create or replace function public.redeem_referral(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_me       uuid := auth.uid();
  v_reward   integer := 50;
  v_created  timestamptz;
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

  insert into public.user_credits (user_id, balance, earned_total)
  values (v_referrer, v_reward, v_reward)
  on conflict (user_id) do update
    set balance      = public.user_credits.balance + v_reward,
        earned_total = public.user_credits.earned_total + v_reward,
        updated_at   = now();

  insert into public.credit_events(user_id, type, amount) values (v_referrer, 'earn_referral', v_reward);

  return json_build_object('ok', true, 'reward', v_reward);
end;
$$;

revoke all on function public.redeem_referral(text) from public;
grant execute on function public.redeem_referral(text) to authenticated;
