-- WS-A: Times, location, and meeting link for cohort sessions, plus a per-cohort
-- calendar feed token so members can subscribe to an ICS feed (Google Calendar).
-- All session-time columns are nullable so existing rows stay valid (a session
-- is treated as all-day when start_time is null).

-- ── cohort_sessions: time, place, meeting link ───────────────────────────────
alter table public.cohort_sessions
  add column if not exists start_time time,
  add column if not exists end_time   time,
  add column if not exists timezone   text default 'Asia/Jakarta',
  add column if not exists location   text,
  add column if not exists meet_url   text;

-- ── cohorts: stable token for the read-only calendar feed ────────────────────
-- The existing row-level `cohorts_select` policy (members + mentor) has no column
-- restrictions, so cohort members can already read this new column on their cohort
-- row. The token is only useful when paired with the cohort id, and the ICS feed
-- exposes nothing beyond what members can already see in the planner.
alter table public.cohorts
  add column if not exists calendar_token uuid not null default gen_random_uuid();
