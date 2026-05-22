-- ── ai_usage: rate-limit table for the claude-proxy Edge Function ────────────
-- One row per user per UTC day per call. The Edge Function counts rows to enforce
-- a max of 10 calls/day before forwarding to Anthropic.

create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users on delete cascade,
  date       date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_date_idx on public.ai_usage (user_id, date);

alter table public.ai_usage enable row level security;

-- Users can only read their own usage; the Edge Function writes via service role key
create policy ai_usage_select_own on public.ai_usage
  for select using (user_id = auth.uid());

-- ── user_sessions: signup + return-visit analytics ───────────────────────────
-- Inserted by the client in _authOnSignIn() immediately after auth resolves.
-- is_new_user = true  → signup event  (created_at = last_sign_in_at on Supabase)
-- is_new_user = false → return visit

create table if not exists public.user_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  signed_in_at timestamptz not null default now(),
  is_new_user  boolean not null default false
);

create index if not exists user_sessions_user_idx    on public.user_sessions (user_id);
create index if not exists user_sessions_date_idx    on public.user_sessions (signed_in_at);
create index if not exists user_sessions_new_idx     on public.user_sessions (is_new_user) where is_new_user = true;

alter table public.user_sessions enable row level security;

-- Admins can read all sessions; users can insert their own rows only
create policy user_sessions_select_admin on public.user_sessions
  for select using (public.is_platform_admin());

create policy user_sessions_insert_own on public.user_sessions
  for insert with check (user_id = auth.uid());

-- ── admin_stats: platform-wide metrics RPC used in the Admin tab ─────────────
-- Was called from the client (line 9599) but never defined in migrations.
-- Server-side is_platform_admin() check prevents any non-admin from reading.

create or replace function public.admin_stats()
returns json
language sql
stable
security definer
set search_path = public, auth
as $$
  select json_build_object(
    'total_signups',           (select count(*) from auth.users),
    'signups_last_7d',         (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'signups_last_30d',        (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'users_never_purchased',   0,
    'total_credits_in_circulation',
      coalesce((select sum(balance) from public.user_credits), 0),
    'avg_balance_per_user',
      coalesce((select round(avg(balance), 2) from public.user_credits where balance > 0), 0),
    'recent_events',
      coalesce((
        select json_agg(row_to_json(e) order by e.created_at desc)
        from (
          select ae.event_type as kind, ae.created_at, u.email
          from public.activity_events ae
          join auth.users u on u.id = ae.user_id
          order by ae.created_at desc
          limit 20
        ) e
      ), '[]'::json)
  )
  where public.is_platform_admin()   -- returns no rows (null) for non-admins
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;
