-- ============================================================================
-- Idle decay — warn at day 11, pause the daily scrape at day 14.
--
-- The capacity saving is NOT the point. At validation scale (~100 users x 5
-- keywords ≈ 39 min of scraping) there is no capacity pressure at all. This
-- exists because "your tracking pauses in 3 days" is the strongest re-engagement
-- message available: it is loss aversion on something the user configured
-- themselves, which beats any generic "come back and see what's new".
--
-- 14 days, not 7: the digest goes out Monday. A 7-day threshold could pause a
-- user who read Monday's digest without clicking, before the next one — cutting
-- them off between our own two attempts to reach them.
--
-- Pause NEVER deletes. Config and history are kept; only the daily scrape stops,
-- because v_daily_custom_keywords filters on paused_at is null. Resume is
-- automatic via touch_tracker_viewed() the moment they open the tracker.
-- ============================================================================

begin;

-- Users who should be warned now (idle >= 11d, not yet warned, not yet paused).
-- Exposed as a function rather than a view so the edge function can call it with
-- the service-role key and get a stable contract.
create or replace function public.tracker_pending_warnings()
returns table (user_id uuid, last_viewed_at timestamptz, days_idle int,
               keyword_count int, pauses_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.user_id,
         s.last_viewed_at,
         extract(day from (now() - s.last_viewed_at))::int as days_idle,
         (select count(*)::int from public.user_tracked_keywords k
           where k.user_id = s.user_id) as keyword_count,
         s.last_viewed_at + interval '14 days' as pauses_at
  from public.user_tracker_state s
  where s.paused_at is null
    and s.warned_at is null
    and s.last_viewed_at <= now() - interval '11 days'
    and exists (select 1 from public.user_tracked_keywords k where k.user_id = s.user_id)
$$;

-- Mark a warning as delivered. Called by the edge function AFTER a successful
-- send, never before — otherwise a send failure silently costs the user their
-- only notice before the pause.
create or replace function public.tracker_mark_warned(p_user_id uuid)
returns void language sql volatile security definer set search_path to 'public' as $$
  update public.user_tracker_state set warned_at = now() where user_id = p_user_id
$$;

-- Apply pauses. Idempotent; safe to run repeatedly.
create or replace function public.tracker_apply_pauses()
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v_n int;
begin
  with paused as (
    update public.user_tracker_state
       set paused_at = now()
     where paused_at is null
       and last_viewed_at <= now() - interval '14 days'
       and exists (select 1 from public.user_tracked_keywords k
                    where k.user_id = user_tracker_state.user_id)
    returning user_id
  )
  select count(*)::int into v_n from paused;

  return json_build_object('paused', v_n, 'at', now());
end $$;

revoke all on function
  public.tracker_pending_warnings(),
  public.tracker_mark_warned(uuid),
  public.tracker_apply_pauses()
from public, anon, authenticated;

grant execute on function
  public.tracker_pending_warnings(),
  public.tracker_mark_warned(uuid),
  public.tracker_apply_pauses()
to service_role;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- Cron registration — run MANUALLY after deploying the tracker-notify edge
-- function, and substitute the real service-role bearer.
--
-- Copy the exact Authorization header from an existing job rather than pasting a
-- key by hand:
--     select command from cron.job where jobname = 'weekly-digest';
-- The edge runtime's SUPABASE_SERVICE_ROLE_KEY string is NOT the same value as
-- the legacy service-role JWT these crons send.
--
-- 23:00 UTC = 06:00 Asia/Jakarta — after the morning scrape, so a user who
-- opens the app that morning is never warned about data that just refreshed.
--
--   select cron.schedule('tracker-idle-decay', '0 23 * * *', $CRON$
--     select net.http_post(
--       url     := 'http://kong:8000/functions/v1/tracker-notify',
--       headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_JWT>"}'::jsonb,
--       body    := '{"task":"idle_decay"}'::jsonb
--     );
--   $CRON$);
-- ============================================================================
