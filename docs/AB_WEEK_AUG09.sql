-- ============================================================================
-- LarisID — A/B week scorecard starting 2026-08-09 (WIB)
--
-- *** MOOT as of 2026-08-10: the A/B ended one day into this window. Arm B won
-- and became the whole product at https://larisid.com/; Site A was deleted.
-- This scorecard never got a full week of comparable data — do not "finish"
-- the read. See docs/AB_TEST.sql header for the closure and the final record.
--
-- Why this date: large Site B changes + Cari Supplier public flip + tracking
-- instrumentation gaps closed. Earlier cohorts mix admin-only supplier probe
-- and broken B feedback inserts — do not pool them into these queries.
--
-- WHERE TO RUN (self-host Contabo — NOT the frozen cloud project):
--   ssh -i ~/.ssh/larisid_hetzner root@84.247.147.205 \
--     'docker exec -i supabase-db psql -U postgres' < docs/AB_WEEK_AUG09.sql
--
-- Or paste individual queries into psql one at a time.
--
-- Cohort rules (same as docs/AB_TEST.sql):
--   * Arm from signup_attribution only (never from raw event ab_variant)
--   * Exclude ab_via = direct_gpt and staff ab_variant = X
--   * Missing ab_via treated as random
--
-- Week-1 is instrumentation health + directional smoke. Decision-grade return
-- rate still needs ~6 weeks / ~160 signups per arm (see AB_TEST.sql header).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Q0 — Instrumentation health (run first)
-- Expect: pct_attr ≥ 90; cohort A/B roughly 40–60; missing_attr near 0
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at
),
signups as (
  select id, created_at from auth.users, params p where created_at >= p.flip_at
),
with_attr as (
  select
    s.id,
    a.metadata->>'ab_variant' as ab,
    coalesce(nullif(a.metadata->>'ab_via', ''), 'random') as via,
    a.metadata->>'utm_source' as utm_source
  from signups s
  left join lateral (
    select metadata from activity_events e
    where e.user_id = s.id and e.event_type = 'signup_attribution'
    order by e.created_at limit 1
  ) a on true
)
select
  count(*) as new_users,
  count(*) filter (where ab is not null) as with_attribution,
  round(100.0 * count(*) filter (where ab is not null) / nullif(count(*), 0), 1) as pct_attr,
  count(*) filter (where ab = 'A' and via <> 'direct_gpt') as cohort_a,
  count(*) filter (where ab = 'B' and via <> 'direct_gpt') as cohort_b,
  count(*) filter (where via = 'direct_gpt') as via_direct_gpt,
  count(*) filter (where ab = 'X') as excluded_x,
  count(*) filter (where ab is null) as missing_attr,
  count(*) filter (where utm_source = 'google') as google_utm
from with_attr;


-- ----------------------------------------------------------------------------
-- Q1 — Daily signup split
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via,
    e.created_at
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at
  order by e.user_id, e.created_at
)
select
  (a.created_at at time zone 'Asia/Jakarta')::date as day_wib,
  a.ab_variant,
  count(*) as signups
from attr a
where a.ab_variant in ('A', 'B')
  and a.ab_via <> 'direct_gpt'
group by 1, 2
order by 1, 2;


-- ----------------------------------------------------------------------------
-- Q2 — Core funnel + later-day return (primary decision metrics)
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, u.created_at, a.ab_variant
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and u.created_at < p.end_at
    and a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
),
ev as (
  select user_id,
    bool_or(event_type = 'discover_view')  as did_discover,
    bool_or(event_type = 'deepdive_open')  as did_deepdive,
    bool_or(event_type = 'search_query'
            or event_type = 'gpt_finder_search'
            or event_type = 'gpt_message_sent') as did_search
  from activity_events
  where user_id in (select id from cohort)
  group by user_id
),
ret as (
  select c.id from cohort c
  join activity_events e on e.user_id = c.id
  where (e.created_at at time zone 'Asia/Jakarta')::date
        > (c.created_at at time zone 'Asia/Jakarta')::date
  group by c.id
)
select
  c.ab_variant,
  count(*)                                                       as signed_up,
  count(*) filter (where ev.did_search)                          as did_search,
  count(*) filter (where ev.did_discover)                        as did_discover,
  count(*) filter (where ev.did_deepdive)                        as opened_deep_dive,
  count(*) filter (where c.id in (select id from ret))           as returned_later_day,
  round(100.0 * count(*) filter (where ev.did_deepdive)
        / nullif(count(*),0), 1)                                 as pct_activated,
  round(100.0 * count(*) filter (where c.id in (select id from ret))
        / nullif(count(*),0), 1)                                 as pct_returned
from cohort c
left join ev on ev.user_id = c.id
group by c.ab_variant
order by c.ab_variant;


-- ----------------------------------------------------------------------------
-- Q3 — Products / keywords tracked (ground truth + events)
-- Ground truth: user_tracked_keywords / user_tracked_stores created ≥ flip_at
-- Events: tracker_tab, tracker_setup_commit, tracker_keyword_add, track_cta
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, a.ab_variant
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and u.created_at < p.end_at
    and a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
),
kw as (
  select k.user_id, count(*) as kw_n
  from user_tracked_keywords k
  join params p on true
  where k.created_at >= p.flip_at
    and k.user_id in (select id from cohort)
  group by k.user_id
),
st as (
  select s.user_id, count(*) as st_n
  from user_tracked_stores s
  join params p on true
  where s.created_at >= p.flip_at
    and s.user_id in (select id from cohort)
  group by s.user_id
),
ev as (
  select user_id,
    bool_or(event_type = 'tracker_tab') as opened_tracker,
    bool_or(event_type = 'tracker_setup_commit') as setup_commit,
    bool_or(event_type = 'tracker_keyword_add') as keyword_add,
    bool_or(event_type = 'deepdive_section'
            and metadata->>'section' = 'track_cta') as track_cta,
    bool_or(event_type in (
      'tracker_setup_commit','tracker_keyword_add','track_toggle'
    )) as any_track_event
  from activity_events
  where user_id in (select id from cohort)
  group by user_id
)
select
  c.ab_variant,
  count(*) as signed_up,
  count(*) filter (where kw.user_id is not null) as users_with_keyword,
  coalesce(sum(kw.kw_n), 0) as keywords_total,
  count(*) filter (where st.user_id is not null) as users_with_store,
  coalesce(sum(st.st_n), 0) as stores_total,
  count(*) filter (where ev.opened_tracker) as opened_tracker_tab,
  count(*) filter (where ev.track_cta) as clicked_track_cta,
  count(*) filter (where ev.setup_commit) as setup_commit,
  count(*) filter (where ev.keyword_add) as mid_session_keyword_add,
  round(100.0 * count(*) filter (where kw.user_id is not null)
        / nullif(count(*),0), 1) as pct_tracked_keyword
from cohort c
left join kw on kw.user_id = c.id
left join st on st.user_id = c.id
left join ev on ev.user_id = c.id
group by c.ab_variant
order by c.ab_variant;


-- ----------------------------------------------------------------------------
-- Q4 — Cari Supplier funnel (public since SUPPLIER_PROBE_PUBLIC=true)
-- CTA → tab open → outbound link → survey / demand response
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, a.ab_variant
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and u.created_at < p.end_at
    and a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
),
ev as (
  select user_id,
    bool_or(event_type = 'supplier_cta_click') as cta,
    bool_or(event_type = 'supplier_tab_open') as tab_open,
    bool_or(event_type = 'supplier_link_click') as link_click,
    bool_or(event_type = 'supplier_survey_response') as survey,
    bool_or(event_type = 'supplier_request_response') as demand,
    count(*) filter (where event_type = 'supplier_link_click') as link_clicks_n
  from activity_events
  where user_id in (select id from cohort)
    and event_type like 'supplier_%'
  group by user_id
)
select
  c.ab_variant,
  count(*) as signed_up,
  count(*) filter (where ev.cta) as clicked_cta,
  count(*) filter (where ev.tab_open) as opened_tab,
  count(*) filter (where ev.link_click) as clicked_outbound,
  coalesce(sum(ev.link_clicks_n), 0) as outbound_clicks_total,
  count(*) filter (where ev.survey) as survey_response,
  count(*) filter (where ev.demand) as demand_response,
  round(100.0 * count(*) filter (where ev.link_click)
        / nullif(count(*),0), 1) as pct_outbound_of_signups,
  round(100.0 * count(*) filter (where ev.link_click)
        / nullif(count(*) filter (where ev.cta or ev.tab_open),0), 1)
    as pct_outbound_of_engagers
from cohort c
left join ev on ev.user_id = c.id
group by c.ab_variant
order by c.ab_variant;


-- ----------------------------------------------------------------------------
-- Q5 — Feedback (table + event). Prefer feedback rows as ground truth.
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, a.ab_variant
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and u.created_at < p.end_at
    and a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
),
fb as (
  select f.user_id, count(*) as n
  from feedback f
  join params p on true
  where f.created_at >= p.flip_at and f.created_at < p.end_at
    and f.user_id in (select id from cohort)
  group by f.user_id
),
ev as (
  select user_id,
    bool_or(event_type = 'feedback_submitted') as submitted_evt,
    count(*) filter (where event_type = 'feedback_submitted') as evt_n
  from activity_events
  where user_id in (select id from cohort)
    and event_type = 'feedback_submitted'
  group by user_id
)
select
  c.ab_variant,
  count(*) as signed_up,
  count(*) filter (where fb.user_id is not null) as users_with_feedback,
  coalesce(sum(fb.n), 0) as feedback_rows,
  count(*) filter (where ev.submitted_evt) as users_with_feedback_event,
  coalesce(sum(ev.evt_n), 0) as feedback_events,
  round(100.0 * count(*) filter (where fb.user_id is not null)
        / nullif(count(*),0), 1) as pct_feedback
from cohort c
left join fb on fb.user_id = c.id
left join ev on ev.user_id = c.id
group by c.ab_variant
order by c.ab_variant;


-- ----------------------------------------------------------------------------
-- Q6 — Tab / view navigation (needs view_open instrumentation from 2026-08-08)
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, a.ab_variant
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and u.created_at < p.end_at
    and a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
)
select
  c.ab_variant,
  coalesce(e.metadata->>'view', '(none)') as view_name,
  count(*) as events,
  count(distinct e.user_id) as users
from cohort c
join activity_events e on e.user_id = c.id
where e.event_type = 'view_open'
group by 1, 2
order by 1, users desc, events desc;


-- ----------------------------------------------------------------------------
-- Q7 — Sticky smoke: recent supplier_* / tracker_* / feedback_submitted counts
-- (all signed-in users since flip — not limited to new cohort; useful day-0)
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-08-09 00:00:00+07' as flip_at
)
select
  e.event_type,
  coalesce(e.metadata->>'ui', e.metadata->>'site', '?') as ui_or_site,
  count(*) as events,
  count(distinct e.user_id) as users
from activity_events e, params p
where e.created_at >= p.flip_at
  and (
    e.event_type like 'supplier_%'
    or e.event_type in (
      'tracker_tab','tracker_setup_commit','tracker_keyword_add',
      'feedback_submitted','view_open'
    )
    or (e.event_type = 'deepdive_section' and e.metadata->>'section' = 'track_cta')
  )
group by 1, 2
order by 1, 2;
