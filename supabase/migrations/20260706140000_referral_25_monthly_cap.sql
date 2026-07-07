-- Referral reward changed 50 -> 25 credits per invite, with a MONTHLY CAP of
-- 5 credited invites per referrer (max 125 credits/month). Beyond the cap the
-- referral is still recorded (credited=false) so the friend cannot be re-referred,
-- but no credits are granted. Adds my_referral_stats() to power the UI progress
-- meter and the low-credit "ajak teman" popup. Earn-only, no money.

create or replace function public.redeem_referral(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_me       uuid := auth.uid();
  v_reward   integer := 25;
  v_cap      integer := 5;
  v_created  timestamptz;
  v_month    integer;
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

  -- Monthly cap: count this referrer's already-credited invites this calendar month (UTC).
  select count(*) into v_month
    from public.referrals
    where referrer_id = v_referrer
      and credited = true
      and created_at >= date_trunc('month', now());

  if v_month >= v_cap then
    -- Record the relationship (blocks re-referral) but grant no credits.
    insert into public.referrals(referrer_id, referred_id, credited) values (v_referrer, v_me, false);
    return json_build_object('ok', true, 'capped', true, 'reward', 0);
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

-- Share code + this-month progress for the "Ajak Teman" card and low-credit popup.
create or replace function public.my_referral_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_month integer;
  v_total integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  v_code := public.get_or_create_my_referral_code();
  select count(*) into v_month
    from public.referrals
    where referrer_id = auth.uid() and credited = true
      and created_at >= date_trunc('month', now());
  select count(*) into v_total
    from public.referrals
    where referrer_id = auth.uid();
  return json_build_object(
    'code', v_code,
    'month_count', v_month,
    'total', v_total,
    'cap', 5,
    'per_invite', 25,
    'month_reward', v_month * 25
  );
end;
$$;

revoke all on function public.my_referral_stats() from public;
grant execute on function public.my_referral_stats() to authenticated;
