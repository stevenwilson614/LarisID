-- ---------------------------------------------------------------------------
-- use_ai: remove the 5-point/day cap. LARISgpt AI is now unlimited.
-- ---------------------------------------------------------------------------
-- Supersedes the pool defined in 20260716120000_daily_usage_limits.sql.
--
-- Signature, every JSON key and the usage_events logging are deliberately
-- unchanged so cached clients (which may run for weeks after a deploy) and all
-- existing analytics keep working. The ONLY behavioural change is that the
-- `ai_used + v_weight <= 5` guard is gone, so the update always lands and the
-- 'limit_reached' branch can no longer be reached.
--
-- 'ai_limit' now returns null rather than 5, so any client rendering it shows
-- nothing instead of a stale number.
--
-- The _usage_is_privileged() short-circuit is dropped: admins/leaders are no
-- longer a special case now that everyone is unlimited, and counting them means
-- daily_usage.ai_used is a complete usage signal for analytics.
--
-- Deep dives (use_dive) and the 3 searches/day gpt_new_chat cap are NOT touched.

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

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set ai_used = ai_used + v_weight, updated_at = now()
   where user_id = v_me and day = public._usage_day()
  returning ai_used into v_used;

  insert into public.usage_events (user_id, kind, action, weight)
  values (v_me, 'ai', p_action, v_weight);

  return json_build_object(
    'allowed', true, 'unlimited', true, 'weight', v_weight,
    'ai_used', coalesce(v_used, 0), 'ai_limit', null,
    'seconds_until_reset', public._usage_seconds_until_reset());
end;
$$;

revoke all on function public.use_ai(text) from public;
grant execute on function public.use_ai(text) to authenticated;
