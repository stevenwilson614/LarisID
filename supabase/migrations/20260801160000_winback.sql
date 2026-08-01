-- ==========================================================================
-- Win‑back campaign and 7‑day unlimited‑dives comeback pass
-- ==========================================================================

-- -------------------------- Part A: tables ---------------------------------

-- Comeback passes (token‑based one‑time activation)
create table if not exists public.comeback_passes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign     text not null,
  token        uuid not null unique default gen_random_uuid(),
  granted_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  expires_at   timestamptz
);

create index if not exists idx_comeback_passes_user
  on public.comeback_passes (user_id);

create unique index if not exists uq_comeback_passes_user_campaign
  on public.comeback_passes (user_id, campaign);

alter table public.comeback_passes enable row level security;
revoke all on public.comeback_passes from anon, authenticated;

-- Email suppressions (unsubscribe, complaint, bounce)
create table if not exists public.email_suppressions (
  email       text primary key,
  reason      text not null check (reason in ('unsubscribe','complaint','bounce')),
  created_at  timestamptz not null default now()
);

create unique index if not exists uq_email_suppressions_lower_email
  on public.email_suppressions (lower(email));

alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;

-- Email sends log
create table if not exists public.email_sends (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  email      text not null,
  campaign   text not null,
  sent_at    timestamptz not null default now(),
  resend_id  text,
  status     text not null default 'sent'
);

create index if not exists idx_email_sends_campaign_sent_at
  on public.email_sends (campaign, sent_at desc);

create index if not exists idx_email_sends_user_id
  on public.email_sends (user_id);

create unique index if not exists uq_email_sends_campaign_lower_email
  on public.email_sends (campaign, lower(email));

alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;

-- -------------------------- Part B: helpers ---------------------------------

-- True when the user owns a claimed, unexpired comeback pass.
create or replace function public._has_comeback_pass(p_user uuid)
 returns boolean
 language plpgsql
 stable
 security definer
 set search_path = public
as $$
begin
  return exists (
    select 1
    from public.comeback_passes
    where user_id   = p_user
      and claimed_at is not null
      and expires_at > now()
  );
end;
$$;

-- Returns the latest expiry among the user's active comeback passes, or null.
create or replace function public._comeback_pass_expiry(p_user uuid)
 returns timestamptz
 language plpgsql
 stable
 security definer
 set search_path = public
as $$
declare
  expiry timestamptz;
begin
  select max(expires_at) into expiry
  from public.comeback_passes
  where user_id   = p_user
    and claimed_at is not null
    and expires_at > now();
  return expiry;
end;
$$;

-- ---------------------------- Part C: claim & grant -------------------------

create or replace function public.claim_comeback_pass(p_token uuid)
 returns json
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_pass     public.comeback_passes%rowtype;
  v_expires  timestamptz;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_pass
    from public.comeback_passes
   where token = p_token;

  if v_pass.id is null then
    return json_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  if v_pass.user_id <> v_me then
    return json_build_object('ok', false, 'reason', 'wrong_user');
  end if;

  if v_pass.claimed_at is not null then
    return json_build_object(
      'ok', true,
      'reason', 'already_claimed',
      'expires_at', v_pass.expires_at
    );
  end if;

  update public.comeback_passes
     set claimed_at = now(),
         expires_at = now() + interval '7 days'
   where id = v_pass.id
  returning expires_at into v_expires;

  return json_build_object(
    'ok', true,
    'reason', 'claimed',
    'expires_at', v_expires,
    'dive_ceiling', 60
  );
end;
$$;

create or replace function public.grant_comeback_pass(
  p_user     uuid,
  p_days     integer default 7,
  p_campaign text    default 'winback'
)
 returns json
 language plpgsql
 security definer
 set search_path = public
as $$
declare
  v_token uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.comeback_passes (user_id, campaign)
  values (p_user, p_campaign)
  on conflict (user_id, campaign) do nothing
  returning token into v_token;

  if v_token is null then
    select token into v_token
      from public.comeback_passes
     where user_id   = p_user
       and campaign  = p_campaign
     limit 1;
  end if;

  return json_build_object('token', v_token);
end;
$$;

-- --------------------- Part D: regenerate use_dive --------------------------

create or replace function public.use_dive(p_product_key text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
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

  -- Branch 1: privileged (unchanged)
  if public._usage_is_privileged() then
    insert into public.product_unlocks (user_id, product_key, scope, unlocked_at, expires_at)
    values (v_me, p_product_key, 'full', now(), now() + interval '7 days')
    on conflict (user_id, product_key, scope) do update
      set expires_at = greatest(public.product_unlocks.expires_at, excluded.expires_at)
    returning expires_at into v_expires;
    return json_build_object('allowed', true, 'unlimited', true,
                             'already_accessed', false, 'expires_at', v_expires);
  end if;

  -- Branch 2: comeback pass (new)
  if public._has_comeback_pass(v_me) then
    -- if already accessed this product
    select expires_at into v_expires
      from public.product_unlocks
     where user_id = v_me
       and product_key = p_product_key
       and scope = 'full'
       and expires_at > now()
     limit 1;
    if v_expires is not null then
      select dives_used into v_used
        from public.daily_usage
       where user_id = v_me
         and day = public._usage_day();
      return json_build_object(
        'allowed', true,
        'already_accessed', true,
        'expires_at', v_expires,
        'dives_used', coalesce(v_used, 0),
        'dive_limit', 60,
        'pass', true,
        'pass_expires_at', public._comeback_pass_expiry(v_me),
        'seconds_until_reset', public._usage_seconds_until_reset()
      );
    end if;

    -- enforce safety ceiling of 60 dives per day
    insert into public.daily_usage (user_id, day)
    values (v_me, public._usage_day())
    on conflict (user_id, day) do nothing;

    update public.daily_usage
       set dives_used = dives_used + 1,
           updated_at = now()
     where user_id = v_me
       and day = public._usage_day()
       and dives_used < 60
    returning dives_used into v_used;

    if v_used is null then
      select dives_used into v_used
        from public.daily_usage
       where user_id = v_me
         and day = public._usage_day();
      return json_build_object(
        'allowed', false,
        'reason', 'pass_ceiling_reached',
        'dives_used', coalesce(v_used, 0),
        'dive_limit', 60,
        'pass', true,
        'pass_expires_at', public._comeback_pass_expiry(v_me),
        'seconds_until_reset', public._usage_seconds_until_reset()
      );
    end if;

    -- upsert product unlock for 7 days (same pattern as normal path)
    insert into public.product_unlocks (user_id, product_key, scope, unlocked_at, expires_at)
    values (v_me, p_product_key, 'full', now(), now() + interval '7 days')
    on conflict (user_id, product_key, scope) do update
      set unlocked_at = now(), expires_at = excluded.expires_at
    returning expires_at into v_expires;

    insert into public.usage_events (user_id, kind, action, weight, product_key)
    values (v_me, 'dive', 'deepdive', 1, p_product_key);

    return json_build_object(
      'allowed', true,
      'already_accessed', false,
      'expires_at', v_expires,
      'dives_used', v_used,
      'dive_limit', 60,
      'pass', true,
      'pass_expires_at', public._comeback_pass_expiry(v_me),
      'seconds_until_reset', public._usage_seconds_until_reset()
    );
  end if;

  -- Branch 3: normal metered path (unchanged)
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

-- ---------------------- Part E: regenerate get_my_usage ---------------------

create or replace function public.get_my_usage()
 returns json
 language plpgsql
 stable
 security definer
 set search_path to 'public'
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
      'dives_used', 0,
      'dive_limit', null,
      'ai_used', 0,
      'ai_limit', null,
      'extension_bonus', 0,
      'referral_bonus', 0,
      'bonus_dives', 0,
      'can_spin', false,
      'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', null
    );
  end if;

  -- comeback‑pass branch (added)
  if public._has_comeback_pass(v_me) then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'dives_used', coalesce(v_row.dives_used, 0),
      'dive_limit', 60,
      'ai_used', coalesce(v_row.ai_used, 0),
      'ai_limit', 5,
      'extension_bonus', case when v_ext then 3 else 0 end,
      'referral_bonus', v_ref,
      'bonus_dives', coalesce(v_row.bonus_dives, 0),
      'can_spin', v_row.spun_at is null,
      'can_claim_feedback', v_row.feedback_bonus_at is null,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', public._comeback_pass_expiry(v_me)
    );
  end if;

  -- normal metered path (unchanged except added pass_expires_at null)
  select * into v_row from public.daily_usage
   where user_id = v_me and day = public._usage_day();

  v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
  v_ref := least(5, coalesce((select count(*)::int from public.referrals
                               where referrer_id = v_me and credited = true), 0));
  v_limit := public._dive_limit(v_me);

  return json_build_object(
    'unlimited', false,
    'dives_used', coalesce(v_row.dives_used, 0),
    'dive_limit', v_limit,
    'ai_used', coalesce(v_row.ai_used, 0),
    'ai_limit', 5,
    'extension_bonus', case when v_ext then 3 else 0 end,
    'referral_bonus', v_ref,
    'bonus_dives', coalesce(v_row.bonus_dives, 0),
    'can_spin', v_row.spun_at is null,
    'can_claim_feedback', v_row.feedback_bonus_at is null,
    'seconds_until_reset', public._usage_seconds_until_reset(),
    'pass_expires_at', null
  );
end;
$$;

-- ---------------------- Part F: winback_audience ----------------------------

create or replace function public.winback_audience(
  p_before timestamptz default '2026-07-16'
)
 returns table(
   user_id            uuid,
   email              text,
   display_name       text,
   created_at         timestamptz,
   segment            text,
   dormancy_days      integer,
   region             text,
   city               text,
   categories         text[],
   deepdive_count     integer,
   last_activity_at   timestamptz,
   suppressed         boolean,
   pass_token         uuid,
   campaigns_sent     text[]
 )
 language plpgsql
 stable
 security definer
 set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    u.id,
    u.email,
    coalesce(
      u.raw_user_meta_data->>'display_name',
      u.raw_user_meta_data->>'full_name',
      split_part(u.email, '@', 1)
    ) as display_name,
    u.created_at,
    case
      when coalesce(dcnt.deepdive_count,0) >= 5 then 'C'
      when coalesce(dcnt.deepdive_count,0) between 1 and 4 then 'B'
      else 'A'
    end as segment,
    greatest(0,
      (extract(epoch from now() - coalesce(act.last_activity_at, u.created_at)) / 86400)::int
    ) as dormancy_days,
    up.region,
    up.city,
    uop.categories,
    coalesce(dcnt.deepdive_count, 0) as deepdive_count,
    act.last_activity_at,
    exists (
      select 1
      from public.email_suppressions es
      where lower(es.email) = lower(u.email)
    ) as suppressed,
    cb.token as pass_token,
    coalesce(ec.campaigns, array[]::text[]) as campaigns_sent
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_onboarding_prefs uop on uop.user_id = u.id
  left join lateral (
    select count(*) as deepdive_count
    from public.activity_events ae
    where ae.user_id = u.id
      and ae.event_type = 'deepdive_open'
  ) dcnt on true
  left join lateral (
    select max(ae.created_at) as last_activity_at
    from public.activity_events ae
    where ae.user_id = u.id
  ) act on true
  left join public.comeback_passes cb
    on cb.user_id = u.id
   and cb.campaign = 'winback'
  left join lateral (
    select array_agg(distinct es.campaign) as campaigns
    from public.email_sends es
    where es.user_id = u.id
  ) ec on true
  where u.created_at < p_before
    and u.email not like '%stevenwilson614%'
    and u.email_confirmed_at is not null
  order by segment, dormancy_days asc;
end;
$$;

-- -------------------------- Part G: grants ----------------------------------

grant execute on function public.claim_comeback_pass to authenticated;
grant execute on function public.grant_comeback_pass   to authenticated;
grant execute on function public.winback_audience        to authenticated;

-- PostgREST needs a schema cache reload after this migration.
-- Run: NOTIFY pgrst, 'reload schema';
