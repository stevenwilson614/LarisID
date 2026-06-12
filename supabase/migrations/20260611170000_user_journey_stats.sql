-- Lightweight funnel stats for progressive Discover → Deep Dive UX.

create table if not exists public.user_journey_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deepdive_count integer not null default 0,
  first_deepdive_at timestamptz,
  last_discover_at timestamptz,
  full_deepdive_unlocked boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.user_journey_stats enable row level security;

drop policy if exists journey_stats_own on public.user_journey_stats;
create policy journey_stats_own on public.user_journey_stats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
