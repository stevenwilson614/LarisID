-- ============================================================================
-- LarisID — Video launch funnel & live-watch queries
-- Run in Supabase SQL editor (project bzmvlraziqevqdyotvgy) or via MCP.
-- Source of truth for "signed up" = auth.users.created_at (100% accurate, no
-- client-side event drop). All times normalized to Asia/Jakarta (WIB).
--
-- HOW TO USE during the launch:
--   1. Set start_at / end_at in the `params` CTE to your launch window.
--   2. Re-run Query A every few hours to watch the cohort move down the funnel.
--   3. Run Query C to get the list of signups who have NOT come back, then send
--      them the Day-1 / Day-3 follow-up (see LAUNCH_FOLLOWUP.md).
--
-- Baseline before launch (trailing 21 days, n=13): 77% reached onboarding,
-- 69% opened a Deep Dive, 31% returned a later day. Watch for big drops vs this.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- QUERY A — The funnel (set the window, then re-run to watch it fill)
-- ----------------------------------------------------------------------------
with params as (
  -- >>> EDIT THESE TWO LINES to your launch window (WIB) <<<
  select timestamptz '2026-06-26 00:00:00+07' as start_at,
         timestamptz '2026-07-10 00:00:00+07' as end_at
),
cohort as (
  select u.id, u.created_at
  from auth.users u, params p
  where u.created_at >= p.start_at and u.created_at < p.end_at
),
ev as (
  select user_id,
    bool_or(event_type like 'onboarding%') as did_onboard,
    bool_or(event_type = 'discover_view')  as did_discover,
    bool_or(event_type = 'deepdive_open')  as did_deepdive
  from activity_events
  where user_id in (select id from cohort)
  group by user_id
),
ret as (  -- returned on a later WIB calendar day than they signed up
  select c.id from cohort c
  join activity_events e on e.user_id = c.id
  where (e.created_at at time zone 'Asia/Jakarta')::date
        > (c.created_at at time zone 'Asia/Jakarta')::date
  group by c.id
)
select
  (select count(*) from cohort)                          as signed_up,
  count(*) filter (where ev.did_onboard)                 as reached_onboarding,
  count(*) filter (where ev.did_discover)                as did_discover_search,
  count(*) filter (where ev.did_deepdive)                as opened_deep_dive,
  (select count(*) from ret)                             as returned_later_day,
  -- percentages
  round(100.0 * count(*) filter (where ev.did_deepdive)
        / nullif((select count(*) from cohort),0), 0)    as pct_activated,
  round(100.0 * (select count(*) from ret)
        / nullif((select count(*) from cohort),0), 0)    as pct_returned
from cohort c left join ev on ev.user_id = c.id;


-- ----------------------------------------------------------------------------
-- QUERY B — Daily signup volume (did the video actually drive a spike?)
-- ----------------------------------------------------------------------------
select (created_at at time zone 'Asia/Jakarta')::date as day_wib, count(*) as signups
from auth.users
where created_at > now() - interval '14 days'
group by 1 order by 1;


-- ----------------------------------------------------------------------------
-- QUERY C — Cohort members who have NOT returned (the follow-up send list)
-- Gives you email + whether they ever opened a Deep Dive, so you can tailor
-- the message. Edit the window to match Query A.
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-06-26 00:00:00+07' as start_at,
         timestamptz '2026-07-10 00:00:00+07' as end_at
),
cohort as (
  select u.id, u.email, u.created_at
  from auth.users u, params p
  where u.created_at >= p.start_at and u.created_at < p.end_at
),
returned as (
  select distinct c.id from cohort c
  join activity_events e on e.user_id = c.id
  where (e.created_at at time zone 'Asia/Jakarta')::date
        > (c.created_at at time zone 'Asia/Jakarta')::date
),
activated as (
  select distinct user_id from activity_events
  where event_type = 'deepdive_open' and user_id in (select id from cohort)
)
select c.email,
       (c.created_at at time zone 'Asia/Jakarta')::date as signed_up_wib,
       (c.id in (select user_id from activated))         as opened_deep_dive
from cohort c
where c.id not in (select id from returned)
order by c.created_at;
