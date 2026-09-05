-- LarisID retention baseline (2026-09-05) and the 4-week re-read.
-- Run on Contabo: ssh + docker exec psql, or paste into Studio.
-- Excludes dapur / side accounts via is_dapur_side_account().
--
-- Targets vs this file's first run:
--   dd=0 share           52% → under 30%
--   alert opt-in among DD users  ~3% → 25%
--   weeks 2–4 return      6% → 15%

\pset pager off

create temp view ru as
select u.id, u.email, u.created_at,
       (u.created_at at time zone 'Asia/Jakarta')::date as signup_day
from auth.users u
where not public.is_dapur_side_account(u.email::text);

create temp view act as
select user_id, (created_at at time zone 'Asia/Jakarta')::date d
  from public.activity_events where user_id is not null
union select user_id, (signed_in_at at time zone 'Asia/Jakarta')::date
  from public.user_sessions
union select user_id, view_day
  from public.client_events where user_id is not null
union select user_id, (created_at at time zone 'Asia/Jakarta')::date
  from public.gpt_chats;

create temp view ud as
select r.id, r.signup_day,
       count(distinct a.d) active_days,
       bool_or(a.d between r.signup_day + 1 and r.signup_day + 7) as ret_d1_7,
       bool_or(a.d between r.signup_day + 8 and r.signup_day + 30) as ret_d8_30,
       bool_or(a.d > r.signup_day) as ever_returned
from ru r left join act a on a.user_id = r.id
group by 1, 2;

\echo === headline
select count(*) users,
       count(*) filter (where ever_returned) returned,
       round(100.0 * count(*) filter (where ever_returned) / count(*), 1) pct_returned,
       count(*) filter (where ret_d1_7) ret_wk1,
       count(*) filter (where ret_d8_30) ret_wk2_4,
       count(*) filter (where active_days >= 5) five_plus_days,
       count(*) filter (where exists (
         select 1 from act a where a.user_id = ud.id and a.d >= current_date - 14
       )) active_last_14d
from ud;

\echo === by signup month
select date_trunc('month', signup_day)::date mo, count(*) users,
       round(100.0 * count(*) filter (where ever_returned) / count(*), 1) pct_ret,
       round(100.0 * count(*) filter (where ret_d1_7) / count(*), 1) pct_wk1,
       round(100.0 * count(*) filter (where ret_d8_30) / count(*), 1) pct_wk2_4
from ud group by 1 order by 1;

\echo === active-days distribution
select least(active_days, 10) days, count(*) from ud group by 1 order by 1;

\echo === Deep Dive conditional return
with f as (
  select ud.id, ud.ever_returned, ud.active_days,
         coalesce((select deepdive_count from public.user_journey_stats j where j.user_id = ud.id), 0) dd,
         exists(select 1 from public.user_tracked_keywords k where k.user_id = ud.id)
           or exists(select 1 from public.user_tracked_stores s where s.user_id = ud.id) as tracks
  from ud
)
select 'dd=0' k, count(*) n, round(100.0 * count(*) filter (where ever_returned) / count(*)) pct_ret
from f where dd = 0
union all select 'dd 1-2', count(*), round(100.0 * count(*) filter (where ever_returned) / count(*)) from f where dd between 1 and 2
union all select 'dd 3+', count(*), round(100.0 * count(*) filter (where ever_returned) / count(*)) from f where dd >= 3
union all select 'tracking', count(*), round(100.0 * count(*) filter (where ever_returned) / count(*)) from f where tracks
union all select 'no tracking', count(*), round(100.0 * count(*) filter (where ever_returned) / count(*)) from f where not tracks;

\echo === alert opt-in
select count(*) tracker_state,
       count(*) filter (where cardinality(notify_channels) > 0) with_channels
from public.user_tracker_state;
select channel, status, count(*), min(sent_at)::date first, max(sent_at)::date last
from public.tracker_notifications group by 1, 2 order by 1, 2;

\echo === scrape digest sends (entity_key = scrape_digest)
select channel, status, count(*), min(data_day) first_day, max(data_day) last_day
from public.tracker_notifications
where entity_key = 'scrape_digest'
group by 1, 2 order by 1, 2;

\echo === activation events (since 2026-09-05 loop)
select event_type, count(*), count(distinct user_id)
from public.activity_events
where event_type in (
  'finder_auto_deepdive', 'finder_auto_deepdive_skipped',
  'dir_first_click_deepdive', 'home_first_dd_click',
  'dd_alert_card', 'quick_track_added', 'quick_track_notify_on',
  'langkah_view', 'langkah_check', 'langkah_open_dd'
)
group by 1 order by 1;

-- Zero-activity signups (62 as of 2026-09-05): 51 Google, latest 2026-08-12.
-- All predate client_events (2026-08-23). 10 never signed in; the rest have
-- GoTrue last_sign_in_at but no user_sessions row — OAuth bounce before
-- _authOnSignIn. Closed as historical unless new rows appear after 2026-08-23.
