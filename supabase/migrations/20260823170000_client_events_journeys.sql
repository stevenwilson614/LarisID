-- ============================================================================
-- client_events — one event stream that includes anonymous visitors.
--
-- Why this exists: the 16-23 Aug 2026 readout could only see 24 of 206 weekly
-- visitors. Every behavioural event goes through logUserEvent() in
-- js/gpt-app.js, which early-returns when there is no signed-in user, so ~88%
-- of traffic left no trace in the database. Supplier clicks, AI messages and
-- in-app navigation were all floors, never totals.
--
-- The pattern here is deliberately a copy of log_deepdive_open()
-- (20260815140000_deepdive_opens.sql), which already solved exactly this for
-- deep dives: anon-executable, security definer, takes the localStorage
-- visitor id, and never refuses. Two additions:
--
--   * session_id + seq, so a visit is an ORDERED path. "Did people go
--     discover -> product -> kompetitor?" becomes `order by seq`, with no
--     funnel definitions to maintain up front.
--   * batching. One row per event at 8x today's volume is needless load, so
--     the client posts arrays via sendBeacon.
--
-- activity_events is left completely alone. logUserEvent() keeps writing to it
-- for signed-in users, so every existing admin query, matview and dashboard
-- behaves exactly as before. This table is additive.
-- ============================================================================

begin;

create table if not exists public.client_events (
  id         bigint generated always as identity primary key,
  visitor_id text not null,               -- _lid_vid from localStorage; survives sign-out
  session_id text,                        -- _lid_sid from sessionStorage; one per tab visit
  seq        integer,                     -- monotonic within session_id — this is what makes paths orderable
  user_id    uuid,                        -- auth.uid() when signed in, null for anonymous
  event      text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  view_day   date not null default ((now() at time zone 'Asia/Jakarta')::date)
);

create index if not exists idx_client_events_created on public.client_events (created_at desc);
create index if not exists idx_client_events_day     on public.client_events (view_day);
create index if not exists idx_client_events_session on public.client_events (session_id, seq);
create index if not exists idx_client_events_event   on public.client_events (event, created_at desc);
create index if not exists idx_client_events_visitor on public.client_events (visitor_id, created_at desc);

-- All writes go through log_client_events(); reads go through the definer
-- reporting functions below. No policy is created, so RLS denies direct access.
alter table public.client_events enable row level security;

-- ── writer ──────────────────────────────────────────────────────────────────
create or replace function public.log_client_events(
  p_visitor_id text,
  p_session_id text default null,
  p_events     jsonb default '[]'::jsonb
) returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  -- Mirrors log_page_view()'s junk guard: bots POST short/absent ids.
  if p_visitor_id is null or length(btrim(p_visitor_id)) < 6 then
    return json_build_object('ok', true, 'stored', 0);
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return json_build_object('ok', true, 'stored', 0);
  end if;

  insert into public.client_events (visitor_id, session_id, seq, user_id, event, props)
  select
    left(btrim(p_visitor_id), 64),
    left(nullif(btrim(coalesce(p_session_id, '')), ''), 64),
    nullif((e->>'seq'), '')::int,
    auth.uid(),
    left(btrim(e->>'event'), 64),
    case when jsonb_typeof(e->'props') = 'object' then e->'props' else '{}'::jsonb end
  from jsonb_array_elements(p_events) as e
  -- A batch is one page's worth of activity. The cap stops a crafted POST from
  -- inserting unbounded rows through an anon-executable function.
  where e->>'event' is not null and btrim(e->>'event') <> ''
  limit 60;

  get diagnostics v_count = row_count;

  -- Never refuses, for the same reason log_deepdive_open never refuses: the
  -- client must not be able to read any return value as a wall (MISSION.md).
  return json_build_object('ok', true, 'stored', v_count);
end;
$$;

revoke all on function public.log_client_events(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.log_client_events(text,text,jsonb) to anon, authenticated;

-- ── reporting: whole ordered paths ──────────────────────────────────────────
-- Collapses consecutive repeats (three deepdive_section events in a row are one
-- "looked at the analysis" step, not three) and returns the most common routes.
create or replace function public.journey_paths(
  p_days  int default 7,
  p_limit int default 25,
  p_steps int default 8
) returns table (path text[], sessions bigint, signed_in bigint, anon bigint)
language sql
stable
security definer
set search_path = public
set statement_timeout to '30s'
as $$
  with ordered as (
    select session_id, seq, event, user_id,
           lag(event) over (partition by session_id order by seq) as prev
    from public.client_events
    where created_at >= now() - make_interval(days => greatest(p_days, 1))
      and session_id is not null
  ),
  deduped as (
    select session_id, seq, event, user_id
    from ordered
    where prev is distinct from event
  ),
  trimmed as (
    select session_id, event, user_id,
           row_number() over (partition by session_id order by seq) as rn
    from deduped
  ),
  paths as (
    select session_id,
           array_agg(event order by rn) filter (where rn <= greatest(p_steps, 1)) as path,
           bool_or(user_id is not null) as was_signed_in
    from trimmed
    group by session_id
  )
  select path,
         count(*)                                        as sessions,
         count(*) filter (where was_signed_in)           as signed_in,
         count(*) filter (where not was_signed_in)       as anon
  from paths
  where path is not null
  group by path
  order by sessions desc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.journey_paths(int,int,int) from public, anon, authenticated;
grant execute on function public.journey_paths(int,int,int) to authenticated, service_role;

-- ── reporting: step-to-step transitions ─────────────────────────────────────
-- More robust than whole-path matching for "where do they go from the
-- directory?" — long tails of unique paths don't drown the signal.
create or replace function public.journey_transitions(
  p_days  int default 7,
  p_limit int default 40
) returns table (from_event text, to_event text, moves bigint, sessions bigint)
language sql
stable
security definer
set search_path = public
set statement_timeout to '30s'
as $$
  with ordered as (
    select session_id, seq, event,
           lag(event) over (partition by session_id order by seq) as prev
    from public.client_events
    where created_at >= now() - make_interval(days => greatest(p_days, 1))
      and session_id is not null
  ),
  deduped as (
    select session_id, seq, event
    from ordered
    where prev is distinct from event
  ),
  steps as (
    select session_id, event as from_event,
           lead(event) over (partition by session_id order by seq) as to_event
    from deduped
  )
  select from_event,
         coalesce(to_event, '(exit)') as to_event,
         count(*)                     as moves,
         count(distinct session_id)   as sessions
  from steps
  group by 1, 2
  order by moves desc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.journey_transitions(int,int) from public, anon, authenticated;
grant execute on function public.journey_transitions(int,int) to authenticated, service_role;

commit;

-- ── path labels ─────────────────────────────────────────────────────────────
-- First cut deduped on the bare event name, which collapsed
-- view_open(home) -> view_open(directory) into a single step and destroyed the
-- exact detail the journey question is about. The step identity is the event
-- PLUS the prop that names it, so a path reads
--   view:home -> view:directory -> deepdive -> section:kompetitor
-- rather than view_open -> deepdive_open -> deepdive_section.
create or replace function public._journey_label(p_event text, p_props jsonb)
returns text
language sql
immutable
parallel safe
as $$
  select case p_event
    when 'view_open'        then 'view:'    || coalesce(p_props->>'view', '?')
    when 'deepdive_section' then 'section:' || coalesce(p_props->>'section', '?')
    when 'gpt_gate_shown'   then 'gate:'    || coalesce(p_props->>'source', '?')
    when 'gpt_intent'       then 'intent:'  || coalesce(p_props->>'intent', '?')
    when 'funnel_step'      then 'funnel:'  || coalesce(p_props->>'step', '?')
    else p_event
  end;
$$;

create or replace function public.journey_paths(
  p_days  int default 7,
  p_limit int default 25,
  p_steps int default 8
) returns table (path text[], sessions bigint, signed_in bigint, anon bigint)
language sql
stable
security definer
set search_path = public
set statement_timeout to '30s'
as $$
  with labelled as (
    select session_id, seq, user_id,
           public._journey_label(event, props) as step
    from public.client_events
    where created_at >= now() - make_interval(days => greatest(p_days, 1))
      and session_id is not null
  ),
  ordered as (
    select session_id, seq, user_id, step,
           lag(step) over (partition by session_id order by seq) as prev
    from labelled
  ),
  trimmed as (
    select session_id, user_id, step,
           row_number() over (partition by session_id order by seq) as rn
    from ordered
    where prev is distinct from step
  ),
  paths as (
    select session_id,
           array_agg(step order by rn) filter (where rn <= greatest(p_steps, 1)) as path,
           bool_or(user_id is not null) as was_signed_in
    from trimmed
    group by session_id
  )
  select path,
         count(*)                                  as sessions,
         count(*) filter (where was_signed_in)     as signed_in,
         count(*) filter (where not was_signed_in) as anon
  from paths
  where path is not null
  group by path
  order by sessions desc
  limit greatest(p_limit, 1);
$$;

create or replace function public.journey_transitions(
  p_days  int default 7,
  p_limit int default 40
) returns table (from_event text, to_event text, moves bigint, sessions bigint)
language sql
stable
security definer
set search_path = public
set statement_timeout to '30s'
as $$
  with labelled as (
    select session_id, seq, public._journey_label(event, props) as step
    from public.client_events
    where created_at >= now() - make_interval(days => greatest(p_days, 1))
      and session_id is not null
  ),
  ordered as (
    select session_id, seq, step,
           lag(step) over (partition by session_id order by seq) as prev
    from labelled
  ),
  steps as (
    select session_id, step as from_event,
           lead(step) over (partition by session_id order by seq) as to_event
    from ordered
    where prev is distinct from step
  )
  select from_event,
         coalesce(to_event, '(exit)') as to_event,
         count(*)                     as moves,
         count(distinct session_id)   as sessions
  from steps
  group by 1, 2
  order by moves desc
  limit greatest(p_limit, 1);
$$;

revoke all on function public.journey_paths(int,int,int) from public, anon, authenticated;
grant execute on function public.journey_paths(int,int,int) to authenticated, service_role;
revoke all on function public.journey_transitions(int,int) from public, anon, authenticated;
grant execute on function public.journey_transitions(int,int) to authenticated, service_role;
