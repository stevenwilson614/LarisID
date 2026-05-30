-- Capture each user's keyword searches and product deep-dives so the dashboard
-- can surface recommendations that follow their interests (battery packs today,
-- shirts tomorrow) instead of the same global top-5 every day.
-- Privacy: a user can only read/write their OWN history (RLS below).
-- Apply in Supabase SQL Editor or: supabase db push

create table if not exists public.user_search_history (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  keyword    text,
  item_id    bigint,        -- product opened/deep-dived (nullable; null for pure keyword searches)
  source     text,          -- 'search' | 'product_open' | 'suggestion' etc. (free-form, for analytics)
  created_at timestamptz not null default now()
);

-- Fast lookups of a user's most recent activity.
create index if not exists user_search_history_user_recent_idx
  on public.user_search_history (user_id, created_at desc);

alter table public.user_search_history enable row level security;

-- Owner-only: a user may read and write only their own history rows.
drop policy if exists user_search_history_owner on public.user_search_history;
create policy user_search_history_owner on public.user_search_history
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
