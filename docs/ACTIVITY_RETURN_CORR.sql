-- Signup-day activity vs later return.
-- Companion to docs/RETENTION.sql. Read-only. Run on Contabo:
--   ssh … 'docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1' \
--     < docs/ACTIVITY_RETURN_CORR.sql
--
-- Last run 2026-10-14. Cohort signup_day <= 2026-10-06, n=513
-- (56 newer signups excluded). Ever returned 25.5%, days 1–7 22.2%,
-- days 8–30 9.3% of 377 mature signups. June 2026 onward (n=439,
-- after May's 4.5% return) is 28.5% ever / 25.5% week 1.
-- Signup-day Deep Dive: 33.3% returned vs 13.2% with none (+20 pp).
-- Onboarding, search, and a Laris AI message do not lift that rate.
--
-- Cohort: auth.users minus is_dapur_side_account(), signup_day (WIB)
-- at least 8 days ago so week-1 return is observable.
-- Return: any later WIB activity day in activity_events ∪ user_sessions
-- ∪ client_events ∪ gpt_chats (same union as RETENTION.sql).
-- Predictors are signup-day (WIB calendar) or the first 24h after
-- created_at, so later usage cannot inflate the signal.
-- Lifetime Deep Dive / tracking blocks are labeled confounded: they
-- include actions taken on return visits.

\pset pager off
set statement_timeout = '120s';

drop table if exists feat;
drop table if exists h24;
drop table if exists day0;
drop table if exists ud;
drop table if exists act;
drop table if exists cohort;

create temp table cohort as
select u.id,
       u.created_at,
       (u.created_at at time zone 'Asia/Jakarta')::date as signup_day,
       case
         when coalesce(u.email::text, '') ilike '%@wa.larisid.com' then 'whatsapp'
         when exists (
           select 1 from auth.identities i
           where i.user_id = u.id and i.provider = 'google'
         ) then 'google'
         else 'email_or_other'
       end as auth_path
from auth.users u
where not public.is_dapur_side_account(coalesce(u.email::text, ''))
  and (u.created_at at time zone 'Asia/Jakarta')::date
      <= (timezone('Asia/Jakarta', now()))::date - 8;

create index on cohort (id);

create temp table act as
select user_id, (created_at at time zone 'Asia/Jakarta')::date as d
  from public.activity_events
 where user_id is not null
union
select user_id, (signed_in_at at time zone 'Asia/Jakarta')::date
  from public.user_sessions
union
select user_id, view_day
  from public.client_events
 where user_id is not null
union
select user_id, (created_at at time zone 'Asia/Jakarta')::date
  from public.gpt_chats;

create index on act (user_id, d);

create temp table ud as
select c.id,
       c.signup_day,
       c.created_at,
       c.auth_path,
       count(distinct a.d) as active_days,
       coalesce(bool_or(a.d between c.signup_day + 1 and c.signup_day + 7), false) as ret_d1_7,
       coalesce(bool_or(a.d between c.signup_day + 8 and c.signup_day + 30), false) as ret_d8_30,
       coalesce(bool_or(a.d > c.signup_day), false) as ever_returned,
       (c.signup_day <= (timezone('Asia/Jakarta', now()))::date - 30) as mature_30
from cohort c
left join act a on a.user_id = c.id
group by c.id, c.signup_day, c.created_at, c.auth_path;

create index on ud (id);

create temp table day0 as
select c.id as user_id,
       count(*)::int as n_events,
       count(*) filter (
         where e.event_type in ('deepdive_open', 'ptype_open')
       )::int as dd_n,
       count(*) filter (
         where e.event_type in ('search_query', 'gpt_finder_search', 'gpt_message_sent')
            or (e.event_type = 'discover_view' and coalesce(e.metadata, '{}'::jsonb) ? 'q')
       )::int as search_n,
       count(*) filter (where e.event_type = 'gpt_message_sent')::int as chat_n,
       count(*) filter (where e.event_type = 'view_open')::int as view_n,
       bool_or(e.event_type = 'onboarding_complete') as onb_event,
       bool_or(e.event_type = 'finder_auto_deepdive') as auto_dd,
       bool_or(e.event_type = 'finder_auto_deepdive_skipped') as auto_dd_skip,
       bool_or(e.event_type = 'dir_first_click_deepdive') as dir_first_dd,
       bool_or(e.event_type = 'home_first_dd_click') as home_first_dd,
       bool_or(e.event_type in ('quick_track_added', 'quick_track_notify_on', 'track_toggle')) as quick_track,
       bool_or(e.event_type in ('langkah_view', 'langkah_check', 'langkah_open_dd')) as langkah,
       bool_or(e.event_type in ('gpt_kalc_page_open', 'gpt_kalc_pdf', 'gpt_kalc_save_riwayat')) as kalk,
       bool_or(e.event_type = 'dd_alert_card') as alert_shown,
       bool_or(
         e.event_type = 'dd_alert_card'
         and coalesce(e.metadata->>'action', '') in ('email', 'whatsapp')
       ) as alert_tap,
       bool_or(e.event_type = 'funnel_step' and coalesce(e.metadata->>'step', '') = 'first_search') as funnel_search,
       bool_or(e.event_type = 'funnel_step' and coalesce(e.metadata->>'step', '') = 'first_dive') as funnel_dive,
       bool_or(e.event_type = 'funnel_step' and coalesce(e.metadata->>'step', '') = 'second_dive') as funnel_second,
       bool_or(e.event_type = 'discover_view') as discover_view
from cohort c
join public.activity_events e on e.user_id = c.id
 and (e.created_at at time zone 'Asia/Jakarta')::date = c.signup_day
group by c.id;

create temp table h24 as
select c.id as user_id,
       count(*) filter (
         where e.event_type in ('deepdive_open', 'ptype_open')
       )::int as dd_n,
       count(*) filter (
         where e.event_type in ('search_query', 'gpt_finder_search', 'gpt_message_sent')
            or (e.event_type = 'discover_view' and coalesce(e.metadata, '{}'::jsonb) ? 'q')
       )::int as search_n,
       count(*) filter (where e.event_type = 'gpt_message_sent')::int as chat_n,
       bool_or(e.event_type = 'onboarding_complete') as onb_event,
       bool_or(e.event_type in ('quick_track_added', 'quick_track_notify_on', 'track_toggle')) as quick_track,
       bool_or(e.event_type = 'finder_auto_deepdive') as auto_dd,
       bool_or(
         e.event_type = 'dd_alert_card'
         and coalesce(e.metadata->>'action', '') in ('email', 'whatsapp')
       ) as alert_tap
from cohort c
join public.activity_events e on e.user_id = c.id
 and e.created_at >= c.created_at
 and e.created_at < c.created_at + interval '24 hours'
group by c.id;

create temp table feat as
select u.id,
       u.signup_day,
       u.auth_path,
       u.active_days,
       u.ever_returned,
       u.ret_d1_7,
       u.ret_d8_30,
       u.mature_30,
       coalesce(d.n_events, 0) as events_day0,
       coalesce(d.dd_n, 0) as dd_day0,
       coalesce(d.search_n, 0) as search_day0,
       coalesce(d.chat_n, 0) as chat_day0,
       coalesce(ch.n, 0) as gpt_chats_day0,
       coalesce(j.deepdive_count, 0) as dd_lifetime,
       jsonb_build_object(
         'any_activity_event', coalesce(d.n_events, 0) > 0,
         'deep_dive', coalesce(d.dd_n, 0) > 0,
         'search_or_finder', coalesce(d.search_n, 0) > 0,
         'laris_ai_message', coalesce(d.chat_n, 0) > 0,
         'gpt_chat_created', coalesce(ch.n, 0) > 0,
         'onboarding_done',
           coalesce(d.onb_event, false)
           or exists (
             select 1 from public.user_onboarding_prefs p
             where p.user_id = u.id
               and p.completed_at is not null
               and (p.completed_at at time zone 'Asia/Jakarta')::date = u.signup_day
           ),
         'favorit_or_track',
           coalesce(d.quick_track, false)
           or exists (
             select 1 from public.user_tracked_products t
             where t.user_id = u.id
               and (t.tracked_at at time zone 'Asia/Jakarta')::date = u.signup_day
           )
           or exists (
             select 1 from public.user_tracked_keywords k
             where k.user_id = u.id
               and (k.created_at at time zone 'Asia/Jakarta')::date = u.signup_day
           )
           or exists (
             select 1 from public.user_tracked_stores s
             where s.user_id = u.id
               and (s.created_at at time zone 'Asia/Jakarta')::date = u.signup_day
           ),
         'alert_card_seen', coalesce(d.alert_shown, false),
         'alert_opt_in',
           coalesce(d.alert_tap, false)
           or exists (
             select 1 from public.user_tracker_state st
             where st.user_id = u.id
               and cardinality(st.notify_channels) > 0
               and st.notify_asked_at is not null
               and (st.notify_asked_at at time zone 'Asia/Jakarta')::date = u.signup_day
           ),
         'auto_deepdive', coalesce(d.auto_dd, false),
         'auto_deepdive_skipped', coalesce(d.auto_dd_skip, false),
         'dir_first_click_deepdive', coalesce(d.dir_first_dd, false),
         'home_first_dd', coalesce(d.home_first_dd, false),
         'langkah', coalesce(d.langkah, false),
         'kalkulator', coalesce(d.kalk, false),
         'komunitas',
           exists (
             select 1 from public.feature_requests fr
             where fr.author_id = u.id
               and (fr.created_at at time zone 'Asia/Jakarta')::date = u.signup_day
           )
           or exists (
             select 1 from public.feature_request_comments fc
             where fc.author_id = u.id
               and (fc.created_at at time zone 'Asia/Jakarta')::date = u.signup_day
           ),
         'funnel_first_search', coalesce(d.funnel_search, false),
         'funnel_first_dive', coalesce(d.funnel_dive, false),
         'funnel_second_dive', coalesce(d.funnel_second, false),
         'discover_view', coalesce(d.discover_view, false),
         'two_plus_screens', coalesce(d.view_n, 0) >= 2
       ) as flags,
       jsonb_build_object(
         'deep_dive_24h', coalesce(h.dd_n, 0) > 0,
         'search_or_finder_24h', coalesce(h.search_n, 0) > 0,
         'laris_ai_message_24h', coalesce(h.chat_n, 0) > 0,
         'onboarding_done_24h',
           coalesce(h.onb_event, false)
           or exists (
             select 1 from public.user_onboarding_prefs p
             where p.user_id = u.id
               and p.completed_at is not null
               and p.completed_at >= u.created_at
               and p.completed_at < u.created_at + interval '24 hours'
           ),
         'favorit_or_track_24h',
           coalesce(h.quick_track, false)
           or exists (
             select 1 from public.user_tracked_products t
             where t.user_id = u.id
               and t.tracked_at >= u.created_at
               and t.tracked_at < u.created_at + interval '24 hours'
           ),
         'alert_opt_in_24h',
           coalesce(h.alert_tap, false)
           or exists (
             select 1 from public.user_tracker_state st
             where st.user_id = u.id
               and cardinality(st.notify_channels) > 0
               and st.notify_asked_at >= u.created_at
               and st.notify_asked_at < u.created_at + interval '24 hours'
           ),
         'auto_deepdive_24h', coalesce(h.auto_dd, false)
       ) as flags24
from ud u
left join day0 d on d.user_id = u.id
left join h24 h on h.user_id = u.id
left join lateral (
  select count(*)::int as n
  from public.gpt_chats g
  where g.user_id = u.id
    and (g.created_at at time zone 'Asia/Jakarta')::date = u.signup_day
) ch on true
left join public.user_journey_stats j on j.user_id = u.id;

\echo === headline (signup >= 8 days ago)
select count(*) as users,
       count(*) filter (where ever_returned) as returned,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       count(*) filter (where ret_d1_7) as ret_wk1,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1,
       count(*) filter (where mature_30) as mature_30,
       count(*) filter (where mature_30 and ret_d8_30) as ret_d8_30,
       round(100.0 * count(*) filter (where mature_30 and ret_d8_30)
             / nullif(count(*) filter (where mature_30), 0), 1) as pct_d8_30,
       count(*) filter (where active_days >= 5) as five_plus_days,
       round(100.0 * count(*) filter (where active_days >= 5) / nullif(count(*), 0), 1) as pct_five_plus
from ud;

\echo === recent signups excluded (under 8 days)
select count(*) as excluded_recent
from auth.users u
where not public.is_dapur_side_account(coalesce(u.email::text, ''))
  and (u.created_at at time zone 'Asia/Jakarta')::date
      > (timezone('Asia/Jakarta', now()))::date - 8;

\echo === by signup month
select date_trunc('month', signup_day)::date as mo,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1,
       round(100.0 * count(*) filter (where mature_30 and ret_d8_30)
             / nullif(count(*) filter (where mature_30), 0), 1) as pct_d8_30
from ud
group by 1
order by 1;

\echo === active-days distribution
select least(active_days, 10) as days, count(*) as users
from ud
group by 1
order by 1;

\echo === signup-day signals x return
select e.signal,
       count(*) filter (where e.flag = 'true') as n_yes,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_ever_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_ever_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'true'), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'false'), 0)
       , 1) as lift_ever_pp,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_wk1_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_wk1_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.ret_d1_7)
           / nullif(count(*) filter (where e.flag = 'true'), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.ret_d1_7)
           / nullif(count(*) filter (where e.flag = 'false'), 0)
       , 1) as lift_wk1_pp,
       count(*) filter (where e.flag = 'true' and f.mature_30) as n_yes_m30,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.mature_30 and f.ret_d8_30)
             / nullif(count(*) filter (where e.flag = 'true' and f.mature_30), 0), 1) as pct_d830_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.mature_30 and f.ret_d8_30)
             / nullif(count(*) filter (where e.flag = 'false' and f.mature_30), 0), 1) as pct_d830_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.mature_30 and f.ret_d8_30)
           / nullif(count(*) filter (where e.flag = 'true' and f.mature_30), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.mature_30 and f.ret_d8_30)
           / nullif(count(*) filter (where e.flag = 'false' and f.mature_30), 0)
       , 1) as lift_d830_pp
from feat f
cross join lateral jsonb_each_text(f.flags) as e(signal, flag)
group by e.signal
order by lift_ever_pp desc nulls last, n_yes desc;

\echo === first-24h signals x return
select e.signal,
       count(*) filter (where e.flag = 'true') as n_yes,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_ever_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_ever_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'true'), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'false'), 0)
       , 1) as lift_ever_pp,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_wk1_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_wk1_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.ret_d1_7)
           / nullif(count(*) filter (where e.flag = 'true'), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.ret_d1_7)
           / nullif(count(*) filter (where e.flag = 'false'), 0)
       , 1) as lift_wk1_pp
from feat f
cross join lateral jsonb_each_text(f.flags24) as e(signal, flag)
group by e.signal
order by lift_ever_pp desc nulls last;

\echo === signup-day deep dive count buckets
select case
         when dd_day0 = 0 then '0'
         when dd_day0 = 1 then '1'
         when dd_day0 <= 3 then '2-3'
         else '4+'
       end as dd_day0,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1,
       round(100.0 * count(*) filter (where mature_30 and ret_d8_30)
             / nullif(count(*) filter (where mature_30), 0), 1) as pct_d830
from feat
group by 1
order by min(dd_day0);

\echo === signup-day search count buckets
select case
         when search_day0 = 0 then '0'
         when search_day0 = 1 then '1'
         else '2+'
       end as search_day0,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
group by 1
order by min(search_day0);

\echo === signup-day laris ai message buckets
select case
         when chat_day0 = 0 then '0'
         when chat_day0 = 1 then '1'
         when chat_day0 <= 4 then '2-4'
         else '5+'
       end as chat_day0,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
group by 1
order by min(chat_day0);

\echo === signup-day activity event buckets
select case
         when events_day0 = 0 then '0'
         when events_day0 <= 4 then '1-4'
         when events_day0 <= 14 then '5-14'
         else '15+'
       end as events_day0,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
group by 1
order by min(events_day0);

\echo === auth path
select auth_path,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1,
       round(100.0 * count(*) filter (where mature_30 and ret_d8_30)
             / nullif(count(*) filter (where mature_30), 0), 1) as pct_d830
from feat
group by 1
order by users desc;

\echo === lifetime deep dive buckets (confounded: includes later dives)
select case
         when dd_lifetime = 0 then '0'
         when dd_lifetime <= 2 then '1-2'
         else '3+'
       end as dd_lifetime,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
group by 1
order by min(dd_lifetime);

\echo === june-onward cohort (signup_day >= 2026-06-01; May return was 4.5%)
select count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
where signup_day >= date '2026-06-01';

\echo === june-onward auth path
select auth_path,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
where signup_day >= date '2026-06-01'
group by 1
order by users desc;

\echo === june-onward signup-day deep dive
select (dd_day0 > 0) as deep_dive,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
where signup_day >= date '2026-06-01'
group by 1
order by 1;

\echo === june-onward signup-day deep dive buckets
select case
         when dd_day0 = 0 then '0'
         when dd_day0 = 1 then '1'
         when dd_day0 <= 3 then '2-3'
         else '4+'
       end as dd_day0,
       count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / nullif(count(*), 0), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / nullif(count(*), 0), 1) as pct_wk1
from feat
where signup_day >= date '2026-06-01'
group by 1
order by min(dd_day0);

\echo === june-onward key flags
select e.signal,
       count(*) filter (where e.flag = 'true') as n_yes,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_ever_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_ever_no,
       round(
         100.0 * count(*) filter (where e.flag = 'true' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'true'), 0)
         - 100.0 * count(*) filter (where e.flag = 'false' and f.ever_returned)
           / nullif(count(*) filter (where e.flag = 'false'), 0)
       , 1) as lift_ever_pp,
       round(100.0 * count(*) filter (where e.flag = 'true' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'true'), 0), 1) as pct_wk1_yes,
       round(100.0 * count(*) filter (where e.flag = 'false' and f.ret_d1_7)
             / nullif(count(*) filter (where e.flag = 'false'), 0), 1) as pct_wk1_no
from feat f
cross join lateral jsonb_each_text(f.flags) as e(signal, flag)
where f.signup_day >= date '2026-06-01'
  and e.signal in (
    'deep_dive', 'search_or_finder', 'laris_ai_message', 'onboarding_done',
    'favorit_or_track', 'langkah', 'auto_deepdive', 'gpt_chat_created',
    'any_activity_event', 'alert_card_seen'
  )
group by e.signal
order by lift_ever_pp desc nulls last;

\echo === lifetime tracking and current alert opt-in (confounded)
select 'lifetime_track' as signal,
       count(*) filter (where tracked) as n_yes,
       round(100.0 * count(*) filter (where tracked and ever_returned)
             / nullif(count(*) filter (where tracked), 0), 1) as pct_ever_yes,
       round(100.0 * count(*) filter (where not tracked and ever_returned)
             / nullif(count(*) filter (where not tracked), 0), 1) as pct_ever_no
from (
  select f.ever_returned,
         (
           exists (select 1 from public.user_tracked_products t where t.user_id = f.id)
           or exists (select 1 from public.user_tracked_keywords k where k.user_id = f.id)
           or exists (select 1 from public.user_tracked_stores s where s.user_id = f.id)
         ) as tracked
  from feat f
) x
union all
select 'current_alert_opt_in',
       count(*) filter (where opted),
       round(100.0 * count(*) filter (where opted and ever_returned)
             / nullif(count(*) filter (where opted), 0), 1),
       round(100.0 * count(*) filter (where not opted and ever_returned)
             / nullif(count(*) filter (where not opted), 0), 1)
from (
  select f.ever_returned,
         exists (
           select 1 from public.user_tracker_state st
           where st.user_id = f.id and cardinality(st.notify_channels) > 0
         ) as opted
  from feat f
) y;
