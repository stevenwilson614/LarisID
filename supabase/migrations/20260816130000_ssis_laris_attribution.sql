-- SSIS: attribute Laris telemetry to cohorts at READ time, and expose one
-- unified student timeline.
--
-- Why read-time rather than stamped-on-insert:
--   js/gpt-app.js logUserEvent() never sets activity_events.cohort_id, so the
--   existing cohort_feed_activity_events() (which filters on e.cohort_id)
--   returns zero rows for every cohort. Rather than change the frontend and
--   only capture events from that point on, resolve membership at read time —
--   it is retroactive over all 8,887 existing rows, survives late enrolment,
--   and needs no frontend change or cache-bust.
--
-- Pre-cohort Laris activity is deliberately NOT filtered out: a student's usage
-- before Day 0 is baseline data. `in_cohort_window` lets analysis choose.
--
-- New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

-- ── Laris events, cohort-attributed ────────────────────────────────────────
-- DISTINCT ON collapses the multi-cohort case: prefer the cohort whose window
-- actually contains the event, then the most recent membership.

create or replace view public.ssis_laris_events as
select distinct on (e.id)
  e.id,
  e.user_id                as student_id,
  m.cohort_id,
  e.created_at             as ts,
  'laris'::text            as source,
  'laris'::text            as platform,
  case e.event_type
    when 'search_query'   then 'laris_search'
    when 'deepdive_open'  then 'laris_deepdive'
    else 'laris_session'
  end                      as event_type,
  1.0::numeric(2,1)        as confidence,
  -- The original ~60-type vocabulary is preserved, not discarded: the spine
  -- keeps a controlled verb set while analysis can still drill all the way in.
  e.metadata || jsonb_build_object('laris_event_type', e.event_type) as metadata,
  (c.starts_at is null or e.created_at >= c.starts_at)
    and (c.ends_at is null or e.created_at <= c.ends_at) as in_cohort_window
from public.activity_events e
join public.cohort_members m
  on m.user_id = e.user_id
 and m.status  = 'active'
join public.cohorts c
  on c.id = m.cohort_id
order by
  e.id,
  ((c.starts_at is null or e.created_at >= c.starts_at)
   and (c.ends_at is null or e.created_at <= c.ends_at)) desc,
  m.joined_at desc;

comment on view public.ssis_laris_events is
  'activity_events attributed to a cohort by read-time cohort_members join. Retroactive; includes pre-cohort baseline activity flagged via in_cohort_window.';

-- ── The unified timeline (plan section 8) ──────────────────────────────────
-- One ordered stream per student across every sensor. A union view rather than
-- a sync job: activity_events stays the system of record for Laris, cohort_events
-- for everything else, and there is nothing to keep in step.

create or replace view public.ssis_timeline as
select
  ev.id, ev.student_id, ev.ts, ev.source, ev.platform, ev.event_type,
  ev.listing_id, ev.content_id, ev.value_idr, ev.confidence, ev.metadata
from public.cohort_events ev
union all
select
  le.id, le.student_id, le.ts, le.source, le.platform, le.event_type,
  null::uuid, null::uuid, null::bigint, le.confidence, le.metadata
from public.ssis_laris_events le;

comment on view public.ssis_timeline is
  'Unified per-student event stream: cohort_events (crawler, email, WhatsApp, mentor) plus cohort-attributed Laris telemetry. Order by (student_id, ts).';

-- ── Access ─────────────────────────────────────────────────────────────────
-- Views run with the invoker''s rights (security_invoker), so the underlying
-- RLS on activity_events and cohort_events governs. Without this the views
-- would run as owner and leak every student to every student.

alter view public.ssis_laris_events set (security_invoker = on);
alter view public.ssis_timeline     set (security_invoker = on);

revoke all on public.ssis_laris_events, public.ssis_timeline from anon;
grant select on public.ssis_laris_events, public.ssis_timeline to authenticated;

-- Supporting index for the read-time join (activity_events already has
-- idx_activity_user_time; cohort_members has idx_cohort_members_user).

notify pgrst, 'reload schema';
