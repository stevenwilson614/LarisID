-- Earn extra daily searches: daily spinner + feedback grant.
--
-- Why: docs/user-research-jul26.md found the free cap is a terminal screen, not a
-- throttle. 6 of 17 active user-days ended at the 3-dive ceiling, and for 4 of 30
-- users a limit event is the LAST thing they ever did. Two-stage relief:
--   * the spinner is offered after the user's 2nd dive of the day (before the wall),
--     awarding +1 / +2 / +5, once per WIB day;
--   * once the raised limit is exhausted, submitting feedback earns +3 more.
--
-- Design notes:
--   * The cap was previously DERIVED (3 + extension 3 + referrals<=5) with the
--     literal 3 duplicated in _dive_limit() AND inline in get_my_usage(). Both now
--     read a single _dive_limit(), so the number lives in exactly one place.
--   * The once-per-day guarantee is the (user_id, day) primary key on daily_usage
--     plus a guarded UPDATE (... where spun_at is null), not an advisory check —
--     concurrent calls serialise on the row lock and the loser gets `already_spun`.
--   * Arm B does not use use_dive at all: its cap is a count of gpt_chats rows per
--     WIB day, enforced in BOTH gpt_new_chat() and an RLS with-check that
--     re-implements the same `< 3`. Both are updated here, otherwise RLS would
--     reject the insert the RPC just authorised.

-- ---------------------------------------------------------------------------
-- 1. Per-day earned bonus
-- ---------------------------------------------------------------------------

alter table public.daily_usage
  add column if not exists bonus_dives       integer     not null default 0,
  add column if not exists spun_at           timestamptz,
  add column if not exists feedback_bonus_at timestamptz;

comment on column public.daily_usage.bonus_dives is
  'Extra dives earned today (spinner + feedback). Additive on top of the derived base limit.';

-- Today's earned bonus for a user. Separate helper so _dive_limit and the arm B
-- chat cap share one definition.
create or replace function public._dive_bonus(p_user uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select bonus_dives from public.daily_usage
     where user_id = p_user and day = public._usage_day()
  ), 0)
$$;

-- 3 base + 3 if a paired extension + 1 per credited referral (max 5) + earned today
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
    + public._dive_bonus(p_user)
$$;

revoke all on function public._dive_bonus(uuid) from public;
revoke all on function public._dive_limit(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. get_my_usage() — single source of truth for the limit
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
      'bonus_dives', 0, 'can_spin', false, 'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset()
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
    'dives_used', coalesce(v_row.dives_used, 0),
    'dive_limit', v_limit,
    'ai_used', coalesce(v_row.ai_used, 0),
    'ai_limit', 5,
    'extension_bonus', case when v_ext then 3 else 0 end,
    'referral_bonus', v_ref,
    'bonus_dives', coalesce(v_row.bonus_dives, 0),
    'can_spin', v_row.spun_at is null,
    'can_claim_feedback', v_row.feedback_bonus_at is null,
    'seconds_until_reset', public._usage_seconds_until_reset()
  );
end;
$$;

revoke all on function public.get_my_usage() from public;
grant execute on function public.get_my_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. spin_daily_bonus() — once per WIB day, weighted +1 / +2 / +5
-- ---------------------------------------------------------------------------

create or replace function public.spin_daily_bonus()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_roll   double precision;
  v_award  integer;
  v_bonus  integer;
  v_used   integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- Privileged accounts are already unlimited; spinning would be a no-op.
  if public._usage_is_privileged() then
    return json_build_object('allowed', false, 'reason', 'unlimited');
  end if;

  v_roll := random();
  v_award := case when v_roll < 0.50 then 1
                  when v_roll < 0.85 then 2
                  else 5 end;

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set bonus_dives = bonus_dives + v_award,
         spun_at     = now(),
         updated_at  = now()
   where user_id = v_me
     and day = public._usage_day()
     and spun_at is null
  returning bonus_dives, dives_used into v_bonus, v_used;

  if not found then
    return json_build_object(
      'allowed', false,
      'reason', 'already_spun',
      'dives_used', coalesce((select dives_used from public.daily_usage
                               where user_id = v_me and day = public._usage_day()), 0),
      'dive_limit', public._dive_limit(v_me),
      'seconds_until_reset', public._usage_seconds_until_reset()
    );
  end if;

  return json_build_object(
    'allowed', true,
    'award', v_award,
    'bonus_dives', v_bonus,
    'dives_used', v_used,
    'dive_limit', public._dive_limit(v_me),
    'seconds_until_reset', public._usage_seconds_until_reset()
  );
end;
$$;

revoke all on function public.spin_daily_bonus() from public;
grant execute on function public.spin_daily_bonus() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. claim_feedback_bonus() — +3 once per WIB day, for real feedback
-- ---------------------------------------------------------------------------

create or replace function public.claim_feedback_bonus(p_feedback_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_me    uuid := auth.uid();
  v_ok    boolean;
  v_bonus integer;
  v_used  integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if public._usage_is_privileged() then
    return json_build_object('allowed', false, 'reason', 'unlimited');
  end if;

  -- Must be the caller's own feedback, submitted today, with a real message.
  -- The 10-character floor mirrors the client-side minimum in js/laris-app.js.
  select exists (
    select 1 from public.feedback f
     where f.id = p_feedback_id
       and f.user_id = v_me
       and (f.created_at at time zone 'Asia/Jakarta')::date = public._usage_day()
       and length(coalesce(trim(f.message), '')) >= 10
  ) into v_ok;

  if not v_ok then
    return json_build_object('allowed', false, 'reason', 'invalid_feedback');
  end if;

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set bonus_dives       = bonus_dives + 3,
         feedback_bonus_at = now(),
         updated_at        = now()
   where user_id = v_me
     and day = public._usage_day()
     and feedback_bonus_at is null
  returning bonus_dives, dives_used into v_bonus, v_used;

  if not found then
    return json_build_object(
      'allowed', false,
      'reason', 'already_claimed',
      'dive_limit', public._dive_limit(v_me),
      'seconds_until_reset', public._usage_seconds_until_reset()
    );
  end if;

  return json_build_object(
    'allowed', true,
    'award', 3,
    'bonus_dives', v_bonus,
    'dives_used', v_used,
    'dive_limit', public._dive_limit(v_me),
    'seconds_until_reset', public._usage_seconds_until_reset()
  );
end;
$$;

revoke all on function public.claim_feedback_bonus(uuid) from public;
grant execute on function public.claim_feedback_bonus(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Arm B: the earned bonus also raises the LARISgpt new-chat cap
-- ---------------------------------------------------------------------------

create or replace function public._gpt_chat_limit(p_user uuid)
returns integer
language sql stable security definer
set search_path = public
as $$ select 3 + public._dive_bonus(p_user) $$;

revoke all on function public._gpt_chat_limit(uuid) from public;

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
  v_privileged := public._usage_is_privileged();
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

revoke all on function public.gpt_new_chat(text, jsonb) from public;
grant execute on function public.gpt_new_chat(text, jsonb) to authenticated;

-- RLS insert path must use the same limit, or it rejects what the RPC allowed.
drop policy if exists gpt_chats_insert_capped on public.gpt_chats;

create policy gpt_chats_insert_capped on public.gpt_chats
  for insert with check (
    auth.uid() = user_id
    and (
      public._usage_is_privileged()
      or (
        select count(*) from public.gpt_chats c2
        where c2.user_id = auth.uid()
          and (c2.created_at at time zone 'Asia/Jakarta')::date
              = (now() at time zone 'Asia/Jakarta')::date
      ) < public._gpt_chat_limit(auth.uid())
    )
  );
