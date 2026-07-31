-- ============================================================================
-- LarisID — A/B test: Regular site (A) vs LARISgpt (B)
--
-- WHERE TO RUN (updated 2026-07-31): the live DB is SELF-HOSTED on Contabo —
--   ssh -i ~/.ssh/larisid_hetzner root@84.247.147.205 \
--     'docker exec -i supabase-db psql -U postgres' < docs/AB_TEST.sql
-- The old cloud project bzmvlraziqevqdyotvgy is a frozen rollback copy (scrape
-- data stops Jul 7) — running these there gives stale, wrong answers.
--
-- BEFORE FLIP / WEEK-0 CHECKLIST (manual):
--   1. Supabase → Authentication → URL Configuration → Redirect URLs:
--        add https://larisid.com/gpt/
--        add http://localhost:8000/gpt/   (local testing)
--   2. Google Ads final URL = https://larisid.com/ (NOT /gpt/)
--        with utm_source=google&utm_medium=cpc (Query E / Clarity ads filter).
--   3. Clarity → Filters → Custom tags:
--        ab_variant = A | B
--        ab_via = random   (experiment); exclude direct_gpt from primary read
--   4. Confirm RAMP_B=0.5 on production `/` (index.html early script).
--
-- WEEK-1 READOUT (after ~7 days of new traffic):
--   Run QUERY F (health) first — need attribution coverage ≥90% and A/B
--   signup split roughly 40–60 either way before trusting QUERY A.
--   Clarity: signup_success ÷ sessions filtered by ab_variant (+ ab_via=random).
--   Decision rule still needs ~6 weeks / ~160 signups per arm for return rate;
--   week 1 is smoke + instrumentation health, not a ship/kill call.
--
-- DECISION RULE (pre-commit; no peek-and-stop):
--   B wins if later-day return rate is ≥10pp higher than A
--   AND signup conversion is not >20% worse than A.
--   First ad burst (~100–300 visits) = smoke test only; keep split ≥6 weeks
--   for decision-grade signal (return rate needs ~160 signups/arm).
--
-- Cohort MUST start at flip_at — dark-period signups are all force-A and
-- must not enter the experiment cohort.
--
-- Assignment provenance (metadata.ab_via / Clarity ab_via):
--   random       = 50/50 from `/`  → INCLUDE in primary cohort
--   direct_gpt   = landed on /gpt/ without sticky → EXCLUDE (contaminates split)
--   existing_auth / X / kill → EXCLUDE
--
-- REDESIGN RESET (2026-07-17 17:15 WIB): B was redesigned (landing hero +
-- trending answer + full deep-dive report; pre-login onboarding removed).
-- flip_at moved to the redesign deploy — the ~11h of old-B cohort (from the
-- 06:00 flip) is discarded. Semantics changes from this date:
--   * B's reached_onboarding = OPTIONAL post-sign-in onboarding (skippable,
--     one-time offer + "Set lokasi" sidebar card). Expect it to drop vs A by
--     design; it is no longer a comparable funnel stage.
--   * did_discover on B now also counts trending-card views
--     (discover_view metadata kind='trending').
--   * New B events: gpt_landing_view, gpt_chip_click, gpt_intent.
--
-- ── COHORT RESET #2 — flip_at = 2026-07-26 00:00 WIB (set 2026-07-31) ───────
-- Both arms shipped large changes during Jul 17–31, so the earlier pool mixes
-- ~3 different builds and is directional only. Steven set the decision cohort
-- to start 2026-07-26. All queries below use that flip_at.
--   B changed: streaming chat + cross-chat memory, pasar-level search, new
--     product/Deep-Dive cards, canonical taxonomy, city typeahead (Jul 28–29).
--   A changed: Discover cards became markets not listings (Jul 29).
--   Both:      daily prize wheel (Jul 30).
--
-- ── KNOWN MEASUREMENT CAVEATS (read before quoting any number) ──────────────
-- 1. LANDING DENOMINATOR IS ONLY VALID FROM 2026-07-28.
--    Arm B's page-view logger shipped in fc67ab4 (Jul 29); the first '/gpt/'
--    rows in page_views appear Jul 28. Before that B's landing views were
--    invisible, so ANY conversion rate spanning earlier dates divides B's
--    signups by a near-zero denominator and overstates A. QUERY H enforces it.
-- 2. page_views.ab_variant/ab_via exist only from migration 20260731130000.
--    Older rows are NULL — fall back to path ('/gpt/' = B), which holds because
--    the A/B redirect runs in index.html's head before laris-app.js loads, so
--    the two arms' visitor sets are near-disjoint (179/62 disjoint, 7 overlap).
-- 3. ~17% of activity_events carry NO metadata.ab_variant (users who cleared
--    localStorage or arrived via a deep link). NEVER slice events by their own
--    ab_variant tag — always join the arm from the user's signup_attribution
--    row, as every query below does.
-- 4. signup_attribution HAD duplicates (47 rows / 43 users). Migration
--    20260731140000 dedupes and adds a unique index, but keep the
--    `distinct on (user_id) ... order by user_id, created_at` pattern so these
--    queries stay correct against pre-migration snapshots.
-- 5. Arm B recorded ZERO funnel_step{step:'return'} before 2026-07-31: it was
--    called from boot() before the async session restore, so currentUser was
--    null and the event was dropped (arm A called it from _authOnSignIn and
--    recorded normally). Fixed 2026-07-31. Return-rate comparisons BEFORE that
--    date are invalid, not merely small-n. Compute return from raw event dates
--    (QUERY A's `ret` CTE), not from funnel_step, for any earlier window.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- QUERY A — Per-variant funnel (set flip_at, then re-run)
-- Primary cohort = signup_attribution with ab_variant A|B and ab_via≠direct_gpt
-- (missing ab_via treated as random for rows written before via-tagging shipped).
-- ----------------------------------------------------------------------------
with params as (
  -- >>> EDIT: deploy timestamp of RAMP_B=0.5 flip (WIB) <<<
  select timestamptz '2026-07-26 00:00:00+07' as flip_at,
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
    bool_or(event_type = 'onboarding_complete' or event_type like 'onboarding%') as did_onboard,
    bool_or(event_type = 'discover_view')  as did_discover,
    bool_or(event_type = 'deepdive_open')  as did_deepdive
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
  count(*) filter (where ev.did_onboard)                         as reached_onboarding,
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
-- QUERY B — Daily signups per variant (assignment health ~50/50 after flip)
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at
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
-- QUERY C — Engagement (events/user, active days) per variant
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at,
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
  where a.ab_variant in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
)
select
  c.ab_variant,
  count(distinct c.id) as users,
  count(e.id) as events,
  round(count(e.id)::numeric / nullif(count(distinct c.id), 0), 1) as events_per_user,
  round(count(distinct (e.user_id, (e.created_at at time zone 'Asia/Jakarta')::date))::numeric
        / nullif(count(distinct c.id), 0), 1) as active_days_per_user
from cohort c
left join activity_events e on e.user_id = c.id
group by c.ab_variant
order by c.ab_variant;


-- ----------------------------------------------------------------------------
-- QUERY D — B extras: chats/user, limit hits, opt-outs
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at
),
b_users as (
  select distinct e.user_id
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at
    and e.metadata->>'ab_variant' = 'B'
    and coalesce(nullif(e.metadata->>'ab_via', ''), 'random') <> 'direct_gpt'
)
select
  (select count(*) from b_users) as b_signups,
  (select count(*) from gpt_chats g where g.user_id in (select user_id from b_users)) as gpt_chats_total,
  round(
    (select count(*) from gpt_chats g where g.user_id in (select user_id from b_users))::numeric
    / nullif((select count(*) from b_users), 0), 2
  ) as chats_per_user,
  (select count(*) from activity_events e
    where e.user_id in (select user_id from b_users)
      and e.event_type = 'gpt_limit_hit') as limit_hits,
  (select count(*) from activity_events e
    where e.event_type = 'gpt_optout'
      and e.created_at >= (select flip_at from params)) as opt_outs;


-- ----------------------------------------------------------------------------
-- QUERY E — Ads segment (utm_source=google) funnel by variant
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at,
         timestamptz '2026-10-01 00:00:00+07' as end_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as ab_variant,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via,
    e.metadata->>'utm_source' as utm_source,
    e.metadata->>'utm_medium' as utm_medium
  from activity_events e, params p
  where e.event_type = 'signup_attribution'
    and e.created_at >= p.flip_at and e.created_at < p.end_at
  order by e.user_id, e.created_at
)
select ab_variant, count(*) as signups
from attr
where utm_source = 'google' and coalesce(utm_medium, '') = 'cpc'
  and ab_variant in ('A', 'B')
  and ab_via <> 'direct_gpt'
group by 1
order by 1;


-- ----------------------------------------------------------------------------
-- QUERY F — Week-1 instrumentation health (run first)
-- Expect: missing_attr near 0; A/B share ~40–60; direct_gpt small if ads→/
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at
),
signups as (
  select id, created_at from auth.users, params p where created_at >= p.flip_at
),
with_attr as (
  select
    s.id,
    s.created_at,
    a.metadata->>'ab_variant' as ab,
    coalesce(nullif(a.metadata->>'ab_via', ''), 'random') as via,
    a.metadata->>'utm_source' as utm_source,
    a.metadata->>'landing' as landing
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
-- QUERY G — Assignment provenance mix (random vs direct_gpt contamination)
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at
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
select ab_variant, ab_via, count(*) as signups
from attr
group by 1, 2
order by 1, 2;


-- ----------------------------------------------------------------------------
-- QUERY H — LANDING → SIGNUP CONVERSION per arm (the second half of the
-- decision rule: "signup conversion is not >20% worse than A").
--
-- Denominator = unique visitors in page_views. Start date is clamped to
-- 2026-07-28 because arm B's page-view logger did not exist before then
-- (caveat 1 in the header) — an earlier start silently overstates A.
--
-- Arm resolution: prefer the real ab_variant column (migration 20260731130000);
-- fall back to path for rows written before it existed. direct_gpt visits are
-- excluded once ab_via is populated, per the pre-committed cohort rule.
-- ----------------------------------------------------------------------------
with params as (
  -- Never move this earlier than 2026-07-28. See header caveat 1.
  select greatest(
           timestamptz '2026-07-26 00:00:00+07',
           timestamptz '2026-07-28 00:00:00+07'
         ) as start_at
),
visits as (
  select
    coalesce(
      pv.ab_variant,                                    -- real tag when present
      case when pv.path like '/gpt%' then 'B' else 'A' end  -- legacy fallback
    ) as arm,
    pv.visitor_id
  from page_views pv, params p
  where pv.created_at >= p.start_at
    and coalesce(pv.ab_via, 'random') <> 'direct_gpt'
),
landed as (
  select arm, count(distinct visitor_id) as visitors
  from visits where arm in ('A', 'B') group by 1
),
attr as (
  select distinct on (e.user_id)
    e.user_id,
    coalesce(e.metadata->>'ab_variant', 'X') as arm,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e
  where e.event_type = 'signup_attribution'
  order by e.user_id, e.created_at
),
signups as (
  select a.arm, count(*) as signups
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.start_at
    and a.arm in ('A', 'B')
    and a.ab_via <> 'direct_gpt'
  group by 1
)
select
  l.arm,
  l.visitors,
  coalesce(s.signups, 0) as signups,
  round(100.0 * coalesce(s.signups, 0) / nullif(l.visitors, 0), 1) as conv_pct
from landed l
left join signups s on s.arm = l.arm
order by l.arm;


-- ----------------------------------------------------------------------------
-- QUERY I — Engagement per user by arm. This is where B has consistently won:
-- the point of the test is that A converts visitors and B activates them, so
-- read QUERY H and QUERY I together, never one alone.
-- ----------------------------------------------------------------------------
with params as (
  select timestamptz '2026-07-26 00:00:00+07' as flip_at
),
attr as (
  select distinct on (e.user_id)
    e.user_id, coalesce(e.metadata->>'ab_variant', 'X') as arm,
    coalesce(nullif(e.metadata->>'ab_via', ''), 'random') as ab_via
  from activity_events e
  where e.event_type = 'signup_attribution'
  order by e.user_id, e.created_at
),
cohort as (
  select u.id, a.arm
  from auth.users u
  join attr a on a.user_id = u.id
  join params p on true
  where u.created_at >= p.flip_at and a.arm in ('A','B') and a.ab_via <> 'direct_gpt'
),
per_user as (
  select c.arm, c.id,
    (select count(*) from activity_events e where e.user_id = c.id) as events,
    (select count(*) from activity_events e where e.user_id = c.id
       and e.event_type = 'deepdive_open') as deepdives,
    (select count(*) from activity_events e where e.user_id = c.id
       and e.event_type in ('gpt_message_sent','search_query','gpt_finder_search')) as searches,
    (select count(distinct (e.created_at at time zone 'Asia/Jakarta')::date)
       from activity_events e where e.user_id = c.id) as active_days
  from cohort c
)
select arm,
  count(*)                       as users,
  round(avg(events), 1)          as avg_events,
  round(percentile_cont(0.5) within group (order by events)::numeric, 1) as median_events,
  round(avg(deepdives), 1)       as avg_deepdives,
  round(avg(searches), 1)        as avg_searches,
  round(avg(active_days), 2)     as avg_active_days
from per_user
group by 1
order by 1;
