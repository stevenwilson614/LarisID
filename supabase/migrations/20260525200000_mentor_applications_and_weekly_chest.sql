-- Mentor applications + weekly treasure chest tables (were referenced in the app
-- but never migrated; PostgREST returns 404 when tables are missing).

-- ── Mentor applications (Komunitas mentor apply form) ─────────────────────

create table if not exists public.mentor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  whatsapp text,
  email text,
  is_seller boolean not null default false,
  years_exp text,
  omset text,
  why_mentor text,
  want_capital boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_mentor_applications_user
  on public.mentor_applications (user_id);

alter table public.mentor_applications enable row level security;

drop policy if exists mentor_apps_insert_own on public.mentor_applications;
create policy mentor_apps_insert_own on public.mentor_applications
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists mentor_apps_select_own on public.mentor_applications;
create policy mentor_apps_select_own on public.mentor_applications
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists mentor_apps_select_admin on public.mentor_applications;
create policy mentor_apps_select_admin on public.mentor_applications
  for select to authenticated
  using (public.is_platform_admin());

-- ── Weekly chest (from extension credit schema; idempotent) ─────────────────

create table if not exists public.chest_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  reward integer not null,
  week_start date not null,
  unique (user_id, week_start)
);

create index if not exists idx_chest_history_user_week
  on public.chest_history (user_id, week_start);

alter table public.chest_history enable row level security;

drop policy if exists chest_history_own on public.chest_history;
create policy chest_history_own on public.chest_history
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ensure search_completions exists (chest progress counts distinct keywords/week)
create table if not exists public.search_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  keyword text not null,
  completed_date date not null default current_date,
  completed_at timestamptz not null default now(),
  unique (user_id, keyword, completed_date)
);

create index if not exists idx_search_completions_user_date
  on public.search_completions (user_id, completed_date);

alter table public.search_completions enable row level security;

drop policy if exists search_completions_own on public.search_completions;
create policy search_completions_own on public.search_completions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- claim_weekly_chest: 5 distinct keyword searches in the ISO week → random credits
create or replace function public.claim_weekly_chest()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
  v_searches integer;
  v_needed integer := 5;
  v_reward integer;
  v_rand real;
  v_balance integer;
begin
  v_week_start := date_trunc('week', now())::date;

  if exists (
    select 1 from public.chest_history
    where user_id = auth.uid() and week_start = v_week_start
  ) then
    return json_build_object('error', 'already_claimed', 'week_start', v_week_start);
  end if;

  select count(distinct keyword)::int into v_searches
  from public.search_completions
  where user_id = auth.uid()
    and completed_date >= v_week_start;

  if v_searches < v_needed then
    return json_build_object('searches_this_week', v_searches, 'needed', v_needed);
  end if;

  v_rand := random();
  if v_rand < 0.50 then v_reward := 3;
  elsif v_rand < 0.85 then v_reward := 5;
  else v_reward := 10;
  end if;

  insert into public.chest_history (user_id, reward, week_start)
  values (auth.uid(), v_reward, v_week_start);

  insert into public.user_credits (user_id, balance, earned_total)
  values (auth.uid(), v_reward, v_reward)
  on conflict (user_id) do update
    set balance = public.user_credits.balance + excluded.balance,
        earned_total = public.user_credits.earned_total + excluded.balance,
        updated_at = now()
  returning balance into v_balance;

  insert into public.credit_events (user_id, type, amount)
  values (auth.uid(), 'earn_chest', v_reward);

  return json_build_object(
    'reward', v_reward,
    'balance', v_balance,
    'searches_this_week', v_searches
  );
end;
$$;

revoke all on function public.claim_weekly_chest() from public;
grant execute on function public.claim_weekly_chest() to authenticated;
