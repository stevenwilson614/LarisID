-- ============================================================================
-- Beta: no daily search cap
--
-- HISTORICAL NOTE (added 21 Aug 2026, same day): this migration was written for
-- a three-tier /harga/ page (Free / Laris Pro Rp149.000 / Laris Business
-- Rp399.000) that was RETRACTED hours later as a MISSION.md §3 violation.
-- LarisID is 100% free for everyone, forever; there are no paid plans. The SQL
-- below is still correct and still live -- it only ever lifted a USAGE CAP and
-- raised tracking slots for EVERY account, which is exactly what a free product
-- wants. Read every "Pro" below as "the limits every account now gets".
-- The live comment on _beta_unlimited() still carries the old wording; it is
-- cosmetic and deliberately left alone rather than re-running an applied
-- migration. Do not reintroduce tiers here or anywhere else.
--
-- Original header follows.
--
-- The /harga/ page now sells three tiers (Free / Laris Pro / Laris Business)
-- and promises that every Pro feature is free during the Beta. This migration
-- makes the server keep that promise:
--
--   1. `_beta_unlimited()` — a manually flipped boolean. While it is true,
--      signed-in accounts have NO daily search cap. Flip it to `select false`
--      to end the Beta; nothing else has to change.
--   2. Tracking slots go from 5 keywords / 3 stores to Pro's 40 / 20.
--
-- Shape is lifted from 20260815160000_merdeka_unlimited_dives.sql, which did
-- exactly this for the Independence Day window. Every touchpoint that file had
-- to change (the RPC, the RLS insert policy, and get_my_usage) is changed here
-- for the same reasons — most importantly the RLS policy, which will otherwise
-- reject the insert the RPC just authorised.
--
-- ANONYMOUS USERS ARE DELIBERATELY NOT COVERED. gpt_chats requires auth.uid()
-- anyway, and the signed-out 10/day meter is the strongest reason to register.
-- The client mirrors this: its Beta branch sits AFTER the anon branch.
--
-- Deep dives were never walled to begin with — log_deepdive_open() always
-- inserts. The metered thing is gpt_new_chat (starting a new search/chat), and
-- that is what the usage ring counts, so lifting it is what turns the ring into
-- the ∞ that admins already see.
--
-- AI points stopped being metered in 20260817120000_use_ai_unlimited.sql, so
-- the Beta branch below reports ai_limit null rather than the stale 5 the
-- other branches still return.
--
-- SELF-HOST NOTES:
--   * `create or replace function` PRESERVES the existing ACL. Do NOT re-grant
--     on the replaced functions — re-granting only `authenticated` silently
--     strips anon and service_role (see the warning in
--     20260807120000_daily_limit_10.sql). Only _beta_unlimited() is new and
--     therefore needs explicit grants.
--   * PostgREST caches the schema; the notify at the bottom is not optional.
-- ============================================================================

begin;

-- ── The Beta switch ─────────────────────────────────────────────────────────
-- One line to flip when the Beta ends. Keep the client's BETA_UNLIMITED in
-- js/gpt-app.js in step with it.
create or replace function public._beta_unlimited()
returns boolean
language sql
immutable
as $$ select true $$;

comment on function public._beta_unlimited() is
  'While true, signed-in accounts have no daily search cap (Beta = Laris Pro for '
  'everyone). Flip to `select false` to end the Beta, and flip BETA_UNLIMITED in '
  'js/gpt-app.js to match.';

revoke all on function public._beta_unlimited() from public;
grant execute on function public._beta_unlimited() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- gpt_new_chat: treat the Beta like privileged (unlimited searches)
-- ---------------------------------------------------------------------------
create or replace function public.gpt_new_chat(p_title text, p_context jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me         uuid := auth.uid();
  v_day        date;
  v_count      integer;
  v_limit      integer;
  v_reset_at   timestamptz;
  v_chat       public.gpt_chats%rowtype;
  v_privileged boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  v_day := (now() at time zone 'Asia/Jakarta')::date;
  v_reset_at := ((v_day + 1)::timestamp at time zone 'Asia/Jakarta');
  v_privileged := public._usage_is_privileged()
               or public._merdeka_unlimited()
               or public._beta_unlimited();
  v_limit := public._gpt_chat_limit(v_me);

  select count(*)::integer into v_count
  from public.gpt_chats
  where user_id = v_me
    and (created_at at time zone 'Asia/Jakarta')::date = v_day;

  if not v_privileged and v_count >= v_limit then
    return json_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'used', v_count,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int)
    );
  end if;

  insert into public.gpt_chats (user_id, title, context)
  values (
    v_me,
    coalesce(nullif(trim(p_title), ''), 'Chat baru'),
    coalesce(p_context, '{}'::jsonb)
  )
  returning * into v_chat;

  return json_build_object(
    'allowed', true,
    'unlimited', v_privileged,
    'merdeka', public._merdeka_unlimited(),
    'beta', public._beta_unlimited(),
    'used', v_count + 1,
    'limit', case when v_privileged then null else v_limit end,
    'reset_at', v_reset_at,
    'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int),
    'chat', json_build_object(
      'id', v_chat.id,
      'title', v_chat.title,
      'context', v_chat.context,
      'created_at', v_chat.created_at
    )
  );
end;
$$;

-- RLS insert path must use the same bypass, or it rejects what the RPC allowed.
drop policy if exists gpt_chats_insert_capped on public.gpt_chats;

create policy gpt_chats_insert_capped on public.gpt_chats
  for insert with check (
    auth.uid() = user_id
    and (
      public._usage_is_privileged()
      or public._merdeka_unlimited()
      or public._beta_unlimited()
      or (
        select count(*) from public.gpt_chats c2
        where c2.user_id = auth.uid()
          and (c2.created_at at time zone 'Asia/Jakarta')::date
              = (now() at time zone 'Asia/Jakarta')::date
      ) < public._gpt_chat_limit(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- get_my_usage: report the Beta so the usage pill renders ∞ with Beta wording.
-- The merdeka and comeback-pass branches below become unreachable while the
-- Beta is on; they are kept so both work again the moment it is flipped off.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_usage()
 returns json
 language plpgsql
 stable
 SECURITY DEFINER
 SET search_path TO 'public'
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
      'pass_expires_at', null,
      'merdeka', public._merdeka_unlimited(),
      'beta', public._beta_unlimited()
    );
  end if;

  if public._beta_unlimited() then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'beta', true,
      'merdeka', public._merdeka_unlimited(),
      'dives_used', coalesce(v_row.dives_used, 0),
      'dive_limit', null,
      'ai_used', coalesce(v_row.ai_used, 0),
      'ai_limit', null,
      -- The stacking bonuses keep accruing so they are already banked for the
      -- Free plan the day the Beta ends; they simply have nothing to raise now.
      'extension_bonus', case when v_ext then 3 else 0 end,
      'referral_bonus', v_ref,
      'bonus_dives', coalesce(v_row.bonus_dives, 0),
      'can_spin', false,
      'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', null
    );
  end if;

  if public._merdeka_unlimited() then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'merdeka', true,
      'beta', false,
      'dives_used', coalesce(v_row.dives_used, 0),
      'dive_limit', null,
      'ai_used', coalesce(v_row.ai_used, 0),
      'ai_limit', 5,
      'extension_bonus', case when v_ext then 3 else 0 end,
      'referral_bonus', v_ref,
      'bonus_dives', coalesce(v_row.bonus_dives, 0),
      'can_spin', false,
      'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', null
    );
  end if;

  if public._has_comeback_pass(v_me) then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'beta', false,
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

  select * into v_row from public.daily_usage
   where user_id = v_me and day = public._usage_day();

  v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
  v_ref := least(5, coalesce((select count(*)::int from public.referrals
                               where referrer_id = v_me and credited = true), 0));
  v_limit := public._dive_limit(v_me);

  return json_build_object(
    'unlimited', false,
    'beta', false,
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

-- ---------------------------------------------------------------------------
-- Tracking slots: 5/3 -> Laris Pro's 40/20.
--
-- Nothing else needs touching. get_my_tracking() reads both functions into its
-- payload, and enforce_tracking_limits() (the BEFORE INSERT trigger on
-- user_tracked_keywords / user_tracked_stores) calls them for the write guard,
-- so the API and the enforcement move together.
--
-- These caps are GLOBAL — the functions take no user argument, so every account
-- gets Pro tracking while the Beta is on, which is the intent. Charging for the
-- difference after the Beta needs a (p_user uuid) signature plus a plan column;
-- that is deliberately not built yet.
--
-- Load note: tracked keywords feed the scraper's daily_custom set via
-- v_daily_custom_keywords, scraped every morning. At the time of writing that
-- is 15 distinct keywords across 8 users, so there is ample headroom — but the
-- ceiling now scales at 40/user rather than 5/user as signups land.
-- ---------------------------------------------------------------------------
create or replace function public.tracking_keyword_limit() returns int
  language sql immutable as $$ select 40 $$;

create or replace function public.tracking_store_limit() returns int
  language sql immutable as $$ select 20 $$;

commit;

notify pgrst, 'reload schema';
