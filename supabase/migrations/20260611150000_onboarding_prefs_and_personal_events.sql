-- First-login onboarding picker: per-user category + budget preferences,
-- and cohort-less personal funnel events in activity_events.
-- Applied to live project bzmvlraziqevqdyotvgy on 2026-06-11 via MCP.

create table if not exists public.user_onboarding_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  categories text[] not null default '{}',
  budget_min integer,
  budget_max integer,
  completed_at timestamptz,
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_prefs enable row level security;

drop policy if exists onb_prefs_own on public.user_onboarding_prefs;
create policy onb_prefs_own on public.user_onboarding_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Personal (cohort-less) events: previously cohort_id was NOT NULL and the
-- insert policy required active cohort membership, so events from regular
-- users were silently dropped. Allow cohort_id null for self-owned events.
alter table public.activity_events alter column cohort_id drop not null;

drop policy if exists act_insert on public.activity_events;
create policy act_insert on public.activity_events
  for insert with check (
    user_id = auth.uid()
    and (
      cohort_id is null
      or exists (
        select 1 from cohort_members m
        where m.cohort_id = activity_events.cohort_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );
