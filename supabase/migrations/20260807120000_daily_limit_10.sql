-- Raise the base daily limit from 3 to 10 on both arms.
--
-- WHY: across the Jul 17 - Aug 7 ad cohort, 22 users hit the daily wall and
-- exactly 2 ever came back (A 1/13, B 1/9). ~37% of signups in the most recent
-- ads run hit it. The cap was the single largest measured leak in the funnel and
-- it is arm-independent, so it is being lifted for both.
--
-- The stacking bonuses are deliberately UNCHANGED: a paired extension still adds
-- +3, credited referrals still add +1 each up to 5, and today's earned bonus
-- (spin wheel / feedback) still stacks on top. Only the base moves.
--
-- Both functions are `create or replace` with identical signatures, so the
-- gpt_chats RLS insert policy that calls _gpt_chat_limit() keeps working without
-- being redefined, and get_my_usage() picks up the new number for free.

-- 10 base + 3 if a paired extension + 1 per credited referral (max 5) + earned today
create or replace function public._dive_limit(p_user uuid)
returns integer
language sql stable security definer
set search_path = public
as $$
  select 10
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

-- NOTE: no revoke/grant here on purpose. `create or replace function` preserves
-- the existing ACL, and live grants are anon + authenticated + service_role.
-- Re-granting only `authenticated` would silently strip the other two.

-- Arm B's search/chat cap. Same base, same bonus helper.
create or replace function public._gpt_chat_limit(p_user uuid)
returns integer
language sql stable security definer
set search_path = public
as $$ select 10 + public._dive_bonus(p_user) $$;
