-- ===========================================================================
-- A/B test analysis: Arm A = classic, Arm B = chat-first
-- Runs under psql with -f; SELECT only. No DDL, no writes.
-- Every block re-declares the preamble CTEs exactly as given.
-- ===========================================================================

/*
 * Preamble copied verbatim into each block that needs the cohort.
 * p.start_at    = 2026-07-17 00:00:00+07
 * p.end_at      = now()
 * The two CTEs (p, attr, cohort) must appear EXACTLY as below.
 */

-- ---------------------------------------------------------------------------
-- BLOCK 2: Activation funnel (per-user binary)
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 2: ACTIVATION FUNNEL (per-user binary) ==='

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_activities as (
  select c.user_id, c.ab_variant,
         coalesce(bool_or(
           e.event_type in ('search_query','gpt_finder_search','gpt_message_sent')
           or (e.event_type = 'discover_view' and e.metadata ? 'q')
         ), false) as has_search,
         coalesce(bool_or(e.event_type in ('deepdive_open','ptype_open')), false) as has_deepdive,
         count(case when e.event_type in ('deepdive_open','ptype_open') then 1 end) as cnt_deepdive,
         coalesce(bool_or(e.event_type in ('track_toggle','tracker_setup_commit','product_saved','sale_marked')), false) as has_track
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
),
funnel as (
  select ab_variant,
         count(*) as users,
         count(*) filter (where has_search) as searched,
         count(*) filter (where has_deepdive) as deep_dived,
         count(*) filter (where cnt_deepdive >= 2) as dived_twice,
         count(*) filter (where has_track) as tracked
  from user_activities
  group by ab_variant
)
select ab_variant,
       users,
       searched,
       deep_dived,
       dived_twice,
       tracked,
       round(100.0 * searched / nullif(users,0), 1) as pct_searched,
       round(100.0 * deep_dived / nullif(users,0), 1) as pct_dived,
       round(100.0 * dived_twice / nullif(users,0), 1) as pct_dived_twice,
       round(100.0 * tracked / nullif(users,0), 1) as pct_tracked
from funnel
order by ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 3: Return distribution
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 3: RETURN DISTRIBUTION ==='

-- Statement 1: active‑days bucket distribution per arm
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_days as (
  select c.user_id, c.ab_variant,
         count(distinct (e.created_at at time zone 'Asia/Jakarta')::date) as active_days
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
),
bucket_assignment as (
  select ab_variant, active_days,
         case
           when active_days = 1 then '1 day'
           when active_days = 2 then '2 days'
           when active_days = 3 then '3 days'
           when active_days between 4 and 6 then '4-6 days'
           when active_days >= 7 then '7+ days'
         end as bucket
  from user_days
  where active_days > 0
),
bucket_counts as (
  select ab_variant, bucket, count(*) as users
  from bucket_assignment
  group by ab_variant, bucket
),
cohort_totals as (
  select ab_variant, count(*) as arm_users
  from cohort
  group by ab_variant
)
select bc.ab_variant,
       bc.bucket,
       bc.users,
       round(100.0 * bc.users / nullif(ct.arm_users,0), 1) as pct_of_arm
from bucket_counts bc
join cohort_totals ct on ct.ab_variant = bc.ab_variant
order by bc.ab_variant,
         case bc.bucket
           when '1 day' then 1
           when '2 days' then 2
           when '3 days' then 3
           when '4-6 days' then 4
           when '7+ days' then 5
         end;

-- Statement 2: summary per arm (ever returned, medians)
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_days as (
  select c.user_id, c.ab_variant,
         count(distinct (e.created_at at time zone 'Asia/Jakarta')::date) as active_days
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
)
select ab_variant,
       count(*) as users,
       count(*) filter (where active_days >= 2) as ever_returned,
       round(100.0 * count(*) filter (where active_days >= 2) / nullif(count(*),0), 1) as pct_returned,
       percentile_cont(0.5) within group (order by active_days) as median_active_days,
       round(avg(active_days)::numeric, 2) as mean_active_days,
       max(active_days) as max_active_days
from user_days
group by ab_variant
order by ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 4: Depth per user
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 4: DEPTH PER USER ==='

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_metrics as (
  select c.user_id, c.ab_variant,
         count(e.id) as total_events,
         count(e.id) filter (where e.event_type in ('deepdive_open','ptype_open')) as deepdive_events,
         count(e.id) filter (where e.event_type in ('search_query','gpt_finder_search','gpt_message_sent')
                or (e.event_type = 'discover_view' and e.metadata ? 'q')) as search_events,
         count(distinct (e.created_at at time zone 'Asia/Jakarta')::date) as active_days
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
)
select ab_variant,
       count(*) as users,
       percentile_cont(0.5) within group (order by total_events) as median_total_events,
       round(avg(total_events)::numeric, 2) as mean_total_events,
       percentile_cont(0.5) within group (order by deepdive_events) as median_deepdive_events,
       round(avg(deepdive_events)::numeric, 2) as mean_deepdive_events,
       percentile_cont(0.5) within group (order by search_events) as median_search_events,
       round(avg(search_events)::numeric, 2) as mean_search_events,
       percentile_cont(0.5) within group (order by active_days) as median_active_days,
       round(avg(active_days)::numeric, 2) as mean_active_days
from user_metrics
group by ab_variant
order by ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 5: Time
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 5: TIME ==='

-- 5a: product_dwell (arm A)  -- DIFFERENT UNITS (per-product) from gpt_dwell
\echo '-- 5a: product_dwell (arm A – seconds in dwell_s)'

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
dwell_events as (
  select e.user_id, c.ab_variant,
         (e.metadata->>'dwell_s')::numeric as dwell_sec
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.event_type = 'product_dwell'
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
    and e.metadata->>'dwell_s' ~ '^[0-9]+(\.[0-9]+)?$'
)
select ab_variant,
       count(*) as n_events,
       count(distinct user_id) as n_users,
       percentile_cont(0.5) within group (order by dwell_sec) as median_s,
       round(avg(dwell_sec)::numeric, 2) as mean_s,
       percentile_cont(0.9) within group (order by dwell_sec) as p90_s
from dwell_events
group by ab_variant
order by ab_variant;

-- 5b: gpt_dwell (arm B)  -- DIFFERENT UNITS (per-category) from product_dwell
\echo '-- 5b: gpt_dwell (arm B – seconds in seconds)'

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
dwell_events as (
  select e.user_id, c.ab_variant,
         (e.metadata->>'seconds')::numeric as dwell_sec
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.event_type = 'gpt_dwell'
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
    and e.metadata->>'seconds' ~ '^[0-9]+(\.[0-9]+)?$'
)
select ab_variant,
       count(*) as n_events,
       count(distinct user_id) as n_users,
       percentile_cont(0.5) within group (order by dwell_sec) as median_s,
       round(avg(dwell_sec)::numeric, 2) as mean_s,
       percentile_cont(0.9) within group (order by dwell_sec) as p90_s
from dwell_events
group by ab_variant
order by ab_variant;

-- 5c: sessionized time-on-site  (30‑minute session boundary, arm‑comparable)
\echo '-- 5c: sessionized time-on-site (30 min gap)'

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
events_with_lag as (
  select e.user_id, c.ab_variant, e.created_at,
         lag(e.created_at) over (partition by e.user_id order by e.created_at) as prev_ts
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
),
session_starts as (
  select *,
         case when prev_ts is null or extract(epoch from created_at - prev_ts) > 1800
              then 1 else 0 end as is_new_session
  from events_with_lag
),
session_groups as (
  select *,
         sum(is_new_session) over (partition by user_id order by created_at
                                   rows between unbounded preceding and current row) as session_id
  from session_starts
),
session_stats as (
  select user_id, ab_variant, session_id,
         count(*) as sesh_events,
         extract(epoch from max(created_at) - min(created_at)) / 60.0 as sesh_dur_min
  from session_groups
  group by user_id, ab_variant, session_id
)
select ab_variant,
       count(*) as sessions,
       count(distinct user_id) as users,
       percentile_cont(0.5) within group (order by sesh_dur_min) as median_session_min,
       round(avg(sesh_dur_min)::numeric, 2) as mean_session_min,
       percentile_cont(0.9) within group (order by sesh_dur_min) as p90_session_min,
       percentile_cont(0.5) within group (order by sesh_events) as median_events_per_session,
       count(*) filter (where sesh_events > 1) as sessions_gt_1_event
from session_stats
group by ab_variant
order by ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 6: Where attention goes
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 6: WHERE ATTENTION GOES ==='

-- 6a: event_type mix, per arm, restricted to event types with ≥5 events in that arm
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
arm_events as (
  select c.ab_variant, e.event_type,
         count(*) as events,
         count(distinct e.user_id) as users
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.event_type <> 'spin_preview'
  group by c.ab_variant, e.event_type
  having count(*) >= 5
)
select ab_variant, event_type, events, users,
       round(events * 1.0 / nullif(users,0), 2) as events_per_user
from arm_events
order by ab_variant, events desc;

-- 6b: arm B only – deepdive_section by metadata->'section' and metadata->'via'
-- Arm A has no equivalent instrumentation.
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
)
select
  e.metadata->>'section' as section,
  e.metadata->>'via' as via,
  count(*) as events,
  count(distinct e.user_id) as users
from cohort c
join activity_events e on e.user_id = c.user_id
  and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
where c.ab_variant = 'B'
  and e.event_type = 'deepdive_section'
group by 1,2
order by events desc;



-- ---------------------------------------------------------------------------
-- BLOCK 7: Landing to signup (NARROW WINDOW)
-- ---------------------------------------------------------------------------
-- Page-view logging was broken before 2026‑07‑29, so we use a narrower window here.
\echo ''
\echo '=== BLOCK 7: LANDING TO SIGNUP (NARROW WINDOW 2026-07-29+) ==='

with p as (
  select timestamptz '2026-07-29 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort_narrow as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
pv_arm as (
  select distinct visitor_id,
         coalesce(pv.ab_variant,
                  case when pv.path like '/gpt%' then 'B' else 'A' end) as pv_arm
  from page_views pv
  where pv.created_at >= (select start_at from p) and pv.created_at < (select end_at from p)
    -- The '/gpt%' = B path fallback inverts after the 2026-08-10 cutover, when
    -- '/' itself became B. Keep this window inside the experiment.
    and pv.created_at < timestamptz '2026-08-10'
    and coalesce(pv.ab_via,'random') <> 'direct_gpt'
)
select pva.pv_arm as ab_variant,
       count(distinct pva.visitor_id) as visitors,
       coalesce(sgn.signups, 0) as signups,
       round(100.0 * coalesce(sgn.signups,0) / nullif(count(distinct pva.visitor_id),0), 1) as conv_pct
from pv_arm pva
left join (
  select ab_variant, count(*) as signups
  from cohort_narrow
  group by ab_variant
) sgn on sgn.ab_variant = pva.pv_arm
group by pva.pv_arm, sgn.signups
order by pva.pv_arm;



-- ---------------------------------------------------------------------------
-- BLOCK 8: Limits
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 8: LIMITS ==='

-- 8a: Wall events per arm
--     Arm A's usage_limit_shown counts dives & AI separately,
--     Arm B's gpt_limit_hit counts searches/chats. Rate is comparable; resource is not.
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
wall_events as (
  select e.user_id, c.ab_variant
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.event_type in ('usage_limit_shown','gpt_limit_hit')
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
)
select ab_variant,
       (select count(*) from cohort co where co.ab_variant = w.ab_variant) as users,
       count(distinct user_id) as hit_wall_users,
       round(100.0 * count(distinct user_id)
              / nullif((select count(*) from cohort co where co.ab_variant = w.ab_variant), 0), 1) as pct_hit_wall,
       count(*) as wall_events
from wall_events w
group by ab_variant
order by ab_variant;

-- 8b: Arm‑neutral cross‑check from daily_usage
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
daily as (
  select c.ab_variant, d.*
  from cohort c
  join daily_usage d on d.user_id = c.user_id, p
  where d.day >= (p.start_at at time zone 'Asia/Jakarta')::date
)
select ab_variant,
       count(*) as user_days,
       count(*) filter (where dives_used >= 3) as user_days_at_3plus_dives,
       round(100.0 * count(*) filter (where dives_used >= 3) / nullif(count(*),0), 1) as pct_at_cap,
       percentile_cont(0.5) within group (order by dives_used) as median_dives_used
from daily
group by ab_variant
order by ab_variant;

-- 8c: What happened next after a user first hit a wall
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
first_wall as (
  select user_id, min(created_at) as first_wall_at
  from activity_events
  where event_type in ('usage_limit_shown','gpt_limit_hit')
    and created_at >= (select start_at from p) and created_at < (select end_at from p)
  group by user_id
),
later_act as (
  select distinct f.user_id
  from first_wall f
  join activity_events e2 on e2.user_id = f.user_id
    and e2.created_at > f.first_wall_at
    and e2.created_at >= (select start_at from p) and e2.created_at < (select end_at from p)
)
select c.ab_variant,
       count(distinct f.user_id) as hit_wall_users,
       count(distinct la.user_id) as still_active_after,
       round(100.0 * count(distinct la.user_id) / nullif(count(distinct f.user_id),0), 1) as pct_still_active
from cohort c
left join first_wall f on f.user_id = c.user_id
left join later_act la on la.user_id = c.user_id
group by c.ab_variant
order by c.ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 9: Spinner (from 2026-07-30)
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 9: SPINNER (from 2026-07-30) ==='
-- There is NO dismiss event and no spin‑initiated event, so
-- “shown minus awarded” conflates closing the modal with spinning a zero segment.

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
spin_events as (
  select e.user_id, c.ab_variant, e.event_type
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.created_at >= '2026-07-30 00:00:00+07'
    and e.created_at < (select end_at from p)
    and e.event_type in ('spin_shown','spin_awarded')
)
select ab_variant,
       count(distinct user_id) filter (where event_type = 'spin_shown') as users_shown,
       count(distinct user_id) filter (where event_type = 'spin_awarded') as users_awarded,
       round(100.0 * count(distinct user_id) filter (where event_type = 'spin_awarded')
              / nullif(count(distinct user_id) filter (where event_type = 'spin_shown'),0), 1) as pct_awarded,
       count(*) filter (where event_type = 'spin_shown') as shown_events,
       count(*) filter (where event_type = 'spin_awarded') as awarded_events
from spin_events
group by ab_variant
order by ab_variant;

-- Return after award
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
awarded_users as (
  select distinct c.user_id, c.ab_variant
  from activity_events e
  join cohort c on c.user_id = e.user_id
  where e.created_at >= '2026-07-30 00:00:00+07'
    and e.created_at < (select end_at from p)
    and e.event_type = 'spin_awarded'
),
first_award as (
  select user_id, min(created_at) as awarded_at
  from activity_events
  where event_type = 'spin_awarded'
    and created_at >= '2026-07-30 00:00:00+07'
    and created_at < (select end_at from p)
  group by user_id
),
returned as (
  select distinct fa.user_id
  from first_award fa
  join activity_events e2 on e2.user_id = fa.user_id
    and e2.created_at > fa.awarded_at
    and e2.created_at >= (select start_at from p) and e2.created_at < (select end_at from p)
)
select a.ab_variant,
       count(distinct a.user_id) as awarded_users,
       count(distinct r.user_id) as returned_after,
       round(100.0 * count(distinct r.user_id) / nullif(count(distinct a.user_id),0), 1) as pct_returned
from awarded_users a
left join returned r on r.user_id = a.user_id
group by a.ab_variant
order by a.ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 10: Instrumented CTAs
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 10: INSTRUMENTED CTAs ==='

with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
arm_list as (
  select ab_variant from (values ('A'),('B')) t(ab_variant)
),
event_list as (
  select event_type from (values
    ('discover_card_click'),
    ('track_toggle'),
    ('tracker_tab'),
    ('tracker_setup_commit'),
    ('gpt_chip_click'),
    ('dir_filter'),
    ('dir_open'),
    ('ptype_open'),
    ('gpt_side_panel'),
    ('steven_recs_view'),
    ('ylk_open_product'),
    ('gpt_profit_calc'),
    ('changelog_open'),
    ('view_open')
  ) t(event_type)
),
counts as (
  select c.ab_variant, e.event_type,
         count(*) as events,
         count(distinct e.user_id) as users
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.event_type in (select event_type from event_list)
  group by c.ab_variant, e.event_type
),
arm_sizes as (
  select ab_variant, count(*) as arm_users from cohort group by ab_variant
)
select arm.ab_variant,
       el.event_type,
       coalesce(c.events, 0) as events,
       coalesce(c.users, 0) as users,
       round(100.0 * coalesce(c.users, 0) / nullif(sizer.arm_users, 0), 1) as pct_of_arm_users
from arm_list arm
cross join event_list el
left join counts c on c.ab_variant = arm.ab_variant and c.event_type = el.event_type
left join arm_sizes sizer on sizer.ab_variant = arm.ab_variant
order by arm.ab_variant, el.event_type;



-- ---------------------------------------------------------------------------
-- BLOCK 11: Search content
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 11: SEARCH CONTENT ==='

-- 11a: Top 30 search strings across both arms
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
all_search as (
  select c.ab_variant, c.user_id,
         lower(trim(coalesce(e.metadata->>'query', e.metadata->>'q'))) as q
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where (e.event_type = 'search_query' and e.metadata->>'query' is not null)
     or (e.event_type = 'discover_view' and e.metadata ? 'q')
)
select q,
       count(*) filter (where ab_variant='A') as arm_a_events,
       count(*) filter (where ab_variant='B') as arm_b_events,
       count(distinct user_id) as users
from all_search
where q is not null and q <> ''
group by q
order by count(*) desc
limit 30;

-- 11b: Top 20 metadata->>'keyword' values per arm
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
keyword_counts as (
  select c.ab_variant, e.metadata->>'keyword' as keyword,
         count(*) as events,
         count(distinct e.user_id) as users
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.metadata ? 'keyword'
  group by c.ab_variant, keyword
),
ranked_keywords as (
  select *,
         row_number() over (partition by ab_variant order by events desc) as rn
  from keyword_counts
  where keyword is not null and keyword <> ''
)
select ab_variant, keyword, events, users
from ranked_keywords
where rn <= 20
order by ab_variant, events desc;

-- 11c: Top 15 city and top 15 category (effectively arm‑B readouts because
--      arm A has almost no city/category instrumentation)
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
city_counts as (
  select c.ab_variant, e.metadata->>'city' as value,
         count(*) as events,
         count(distinct e.user_id) as users
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.metadata ? 'city'
  group by c.ab_variant, value
),
city_ranked as (
  select *,
         row_number() over (partition by ab_variant order by events desc) as rn
  from city_counts
  where value is not null and value <> ''
)
select ab_variant, value as city, events, users
from city_ranked
where rn <= 15
order by ab_variant, events desc;

-- Top 15 category
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
cat_counts as (
  select c.ab_variant, e.metadata->>'category' as value,
         count(*) as events,
         count(distinct e.user_id) as users
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.metadata ? 'category'
  group by c.ab_variant, value
),
cat_ranked as (
  select *,
         row_number() over (partition by ab_variant order by events desc) as rn
  from cat_counts
  where value is not null and value <> ''
)
select ab_variant, value as category, events, users
from cat_ranked
where rn <= 15
order by ab_variant, events desc;

-- 11d: Zero‑result rate (search_query with numeric results_count)
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
search_rc as (
  select c.ab_variant, e.metadata->>'results_count' as rc
  from cohort c
  join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  where e.event_type = 'search_query'
    and e.metadata->>'results_count' is not null
    and e.metadata->>'results_count' ~ '^[0-9]+$'
)
select ab_variant,
       count(*) as searches,
       count(*) filter (where rc::int = 0) as zero_result_searches,
       round(100.0 * count(*) filter (where rc::int = 0) / nullif(count(*),0), 1) as pct_zero
from search_rc
group by ab_variant
order by ab_variant;



-- ---------------------------------------------------------------------------
-- BLOCK 12: Acquisition source
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 12: ACQUISITION SOURCE ==='

-- 12a: Source buckets for cohort signups
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
signup_sources as (
  select distinct on (e.user_id)
    e.user_id,
    e.metadata->>'utm_source' as utm_source,
    e.metadata->>'utm_medium' as utm_medium,
    e.metadata->>'referrer' as referrer,
    e.metadata->>'utm_campaign' as utm_campaign,
    e.metadata->>'ref_code' as ref_code,
    a.ab_variant
  from activity_events e
  join attr a on a.user_id = e.user_id
  , p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
source_buckets as (
  select user_id, ab_variant,
         case
           when utm_source = 'google' and utm_medium = 'cpc' then 'google_ads'
           when (utm_source ilike '%chatgpt%' or referrer ilike '%chatgpt%')
             then 'chatgpt'
           when referrer ilike '%google.%' then 'google_organic'
           when referrer ilike '%bing.%' then 'bing'
           when referrer is null or referrer = '' or referrer ilike '%(direct)%'
             then 'direct'
           when referrer ilike '%larisid.com%' then 'internal'
           else 'other'
         end as source
  from signup_sources
)
select source,
       count(*) filter (where ab_variant = 'A') as arm_a,
       count(*) filter (where ab_variant = 'B') as arm_b,
       count(*) as total
from source_buckets
group by source
having count(*) > 0
order by total desc;

-- 12b: Source trend by WIB week
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
signup_sources as (
  select distinct on (e.user_id)
    e.user_id,
    e.created_at as attr_created_at,
    e.metadata->>'utm_source' as utm_source,
    e.metadata->>'utm_medium' as utm_medium,
    e.metadata->>'referrer' as referrer,
    a.ab_variant
  from activity_events e
  join attr a on a.user_id = e.user_id
  , p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
source_buckets as (
  select user_id, ab_variant,
         date_trunc('week', (attr_created_at at time zone 'Asia/Jakarta')::date) as wk_wib,
         case
           when utm_source = 'google' and utm_medium = 'cpc' then 'google_ads'
           when (utm_source ilike '%chatgpt%' or referrer ilike '%chatgpt%') then 'chatgpt'
           when referrer ilike '%google.%' then 'google_organic'
           when referrer ilike '%bing.%' then 'bing'
           when referrer is null or referrer = '' or referrer ilike '%(direct)%' then 'direct'
           when referrer ilike '%larisid.com%' then 'internal'
           else 'other'
         end as source
  from signup_sources
)
select wk_wib, source, count(distinct user_id) as signups
from source_buckets
group by wk_wib, source
order by wk_wib, source;

-- 12c: utm_campaign and ref_code value counts (user counts)
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
signup_sources as (
  select distinct on (e.user_id)
    e.user_id,
    e.metadata->>'utm_campaign' as utm_campaign,
    e.metadata->>'ref_code' as ref_code,
    a.ab_variant
  from activity_events e
  join attr a on a.user_id = e.user_id
  , p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
)
select ab_variant, utm_campaign, count(distinct user_id) as users
from signup_sources
where utm_campaign is not null and utm_campaign <> ''
group by ab_variant, utm_campaign
order by users desc;

-- ref_code
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
signup_sources as (
  select distinct on (e.user_id)
    e.user_id,
    e.metadata->>'ref_code' as ref_code,
    a.ab_variant
  from activity_events e
  join attr a on a.user_id = e.user_id
  , p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
)
select ab_variant, ref_code, count(distinct user_id) as users
from signup_sources
where ref_code is not null and ref_code <> ''
group by ab_variant, ref_code
order by users desc;



-- ---------------------------------------------------------------------------
-- BLOCK 13: Path to value
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== BLOCK 13: PATH TO VALUE ==='

-- 13a: Per arm, time & events to first deepdive
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_timeline as (
  select c.user_id, c.ab_variant,
         min(e.created_at) filter (where e.event_type is not null) as first_event_at,
         min(e.created_at) filter (where e.event_type in ('deepdive_open','ptype_open')) as first_deepdive_at,
         min(e.created_at) filter (where e.event_type in ('track_toggle','tracker_setup_commit','product_saved','sale_marked')) as first_track_at
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
),
events_before_deep as (
  select t.user_id,
         count(e.id) as events_before_first_deepdive
  from user_timeline t
  left join activity_events e on e.user_id = t.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
    and t.first_deepdive_at is not null
    and e.created_at < t.first_deepdive_at
  group by t.user_id
)
select t.ab_variant,
       count(*) as users,
       count(t.first_deepdive_at) as users_reaching_deepdive,
       percentile_cont(0.5) within group (order by extract(epoch from t.first_deepdive_at - t.first_event_at)/60.0)
                    filter (where t.first_deepdive_at is not null) as median_min_to_deepdive,
       percentile_cont(0.5) within group (order by coalesce(eb.events_before_first_deepdive,0))
                    filter (where t.first_deepdive_at is not null) as median_events_before_deepdive
from user_timeline t
left join events_before_deep eb on eb.user_id = t.user_id
group by t.ab_variant
order by t.ab_variant;

-- 13b: Path to track, users who ever tracked
with p as (
  select timestamptz '2026-07-17 00:00:00+07' as start_at, now() as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant','X')              as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via',''),'random')  as ab_via
  from activity_events e, p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.start_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
),
cohort as (
  select a.user_id, a.ab_variant, u.created_at
  from attr a join auth.users u on u.id = a.user_id, p
  where u.created_at >= p.start_at
    and a.ab_variant in ('A','B')
    and a.ab_via <> 'direct_gpt'
),
user_timeline as (
  select c.user_id, c.ab_variant,
         min(e.created_at) filter (where e.event_type is not null) as first_event_at,
         min(e.created_at) filter (where e.event_type in ('deepdive_open','ptype_open')) as first_deepdive_at,
         min(e.created_at) filter (where e.event_type in ('track_toggle','tracker_setup_commit','product_saved','sale_marked')) as first_track_at
  from cohort c
  left join activity_events e on e.user_id = c.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
  group by c.user_id, c.ab_variant
),
events_before_track as (
  select t.user_id,
         count(e.id) as events_before_track
  from user_timeline t
  left join activity_events e on e.user_id = t.user_id
    and e.created_at >= (select start_at from p) and e.created_at < (select end_at from p)
    and t.first_track_at is not null
    and e.created_at < t.first_track_at
  group by t.user_id
)
select t.ab_variant,
       count(*) filter (where t.first_track_at is not null) as users_tracked,
       percentile_cont(0.5) within group (order by extract(epoch from t.first_track_at - t.first_event_at)/60.0)
                    filter (where t.first_track_at is not null) as median_min_first_event_to_track,
       percentile_cont(0.5) within group (order by extract(epoch from t.first_track_at - t.first_deepdive_at)/60.0)
                    filter (where t.first_deepdive_at is not null and t.first_track_at is not null) as median_min_deepdive_to_track,
       percentile_cont(0.5) within group (order by coalesce(eb.events_before_track,0))
                    filter (where t.first_track_at is not null) as median_events_before_track
from user_timeline t
left join events_before_track eb on eb.user_id = t.user_id
group by t.ab_variant
order by t.ab_variant;
