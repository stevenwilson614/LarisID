-- Cohort community MVP: tables, RLS, join_cohort RPC
-- Apply in Supabase SQL Editor or: supabase db push

-- ── Tables ─────────────────────────────────────────────────────

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  invite_code text unique not null,
  starts_at timestamptz,
  ends_at timestamptz,
  whatsapp_invite_url text,
  mentor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.cohort_members (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'mentor')),
  status text not null default 'active' check (status in ('active', 'paused', 'left')),
  joined_at timestamptz not null default now(),
  unique (cohort_id, user_id)
);

create index if not exists idx_cohort_members_user on public.cohort_members (user_id);
create index if not exists idx_cohort_members_cohort on public.cohort_members (cohort_id);

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_milestones_cohort on public.milestones (cohort_id, sort_order);

create table if not exists public.user_milestone_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, milestone_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_posts_cohort on public.community_posts (cohort_id, created_at desc);

create table if not exists public.cohort_announcements (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cohort_announcements_cohort on public.cohort_announcements (cohort_id, created_at desc);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_cohort_time on public.activity_events (cohort_id, created_at desc);
create index if not exists idx_activity_user_time on public.activity_events (user_id, created_at desc);

-- ── RLS ───────────────────────────────────────────────────────

alter table public.cohorts enable row level security;
alter table public.cohort_members enable row level security;
alter table public.milestones enable row level security;
alter table public.user_milestone_progress enable row level security;
alter table public.community_posts enable row level security;
alter table public.cohort_announcements enable row level security;
alter table public.activity_events enable row level security;

-- Helper: active member of cohort
-- cohorts: members and mentors can read
drop policy if exists cohorts_select on public.cohorts;
create policy cohorts_select on public.cohorts
  for select using (
    exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohorts.id and m.user_id = auth.uid() and m.status = 'active'
    )
    or mentor_user_id = auth.uid()
  );

-- cohort_members
drop policy if exists cohort_members_select on public.cohort_members;
create policy cohort_members_select on public.cohort_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.cohorts c where c.id = cohort_members.cohort_id and c.mentor_user_id = auth.uid())
  );

-- Members are inserted via join_cohort() (security definer) or SQL seeding — no open self-insert.

-- milestones
drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select using (
    exists (
      select 1 from public.cohort_members m
      where m.cohort_id = milestones.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (select 1 from public.cohorts c where c.id = milestones.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists milestones_insert_mentor on public.milestones;
create policy milestones_insert_mentor on public.milestones
  for insert with check (
    exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

-- user_milestone_progress
drop policy if exists ump_select on public.user_milestone_progress;
create policy ump_select on public.user_milestone_progress
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = user_milestone_progress.milestone_id and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists ump_insert on public.user_milestone_progress;
create policy ump_insert on public.user_milestone_progress
  for insert with check (user_id = auth.uid());

drop policy if exists ump_delete on public.user_milestone_progress;
create policy ump_delete on public.user_milestone_progress
  for delete using (user_id = auth.uid());

-- community_posts
drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts
  for select using (
    exists (
      select 1 from public.cohort_members m
      where m.cohort_id = community_posts.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (select 1 from public.cohorts c where c.id = community_posts.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists posts_insert on public.community_posts;
create policy posts_insert on public.community_posts
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.cohort_members m
      where m.cohort_id = community_posts.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

-- cohort_announcements
drop policy if exists ann_select on public.cohort_announcements;
create policy ann_select on public.cohort_announcements
  for select using (
    exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohort_announcements.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (select 1 from public.cohorts c where c.id = cohort_announcements.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists ann_insert on public.cohort_announcements;
create policy ann_insert on public.cohort_announcements
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.cohorts c where c.id = cohort_id and c.mentor_user_id = auth.uid())
  );

-- activity_events
drop policy if exists act_select on public.activity_events;
create policy act_select on public.activity_events
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.cohorts c where c.id = activity_events.cohort_id and c.mentor_user_id = auth.uid())
  );

drop policy if exists act_insert on public.activity_events;
create policy act_insert on public.activity_events
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.cohort_members m
      where m.cohort_id = activity_events.cohort_id and m.user_id = auth.uid() and m.status = 'active'
    )
  );

-- ── join_cohort RPC ───────────────────────────────────────────

create or replace function public.join_cohort(p_invite text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cohort uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select id into v_cohort
  from public.cohorts
  where invite_code = trim(p_invite)
    and (ends_at is null or ends_at > now());

  if v_cohort is null then
    raise exception 'invalid_or_expired_invite';
  end if;

  insert into public.cohort_members (cohort_id, user_id, role, status)
  values (v_cohort, auth.uid(), 'student', 'active')
  on conflict (cohort_id, user_id)
  do update set status = 'active';

  return v_cohort;
end;
$$;

revoke all on function public.join_cohort(text) from public;
grant execute on function public.join_cohort(text) to authenticated;

-- Leaderboard: aggregate activity in cohort (members + mentor can call)
create or replace function public.cohort_leaderboard(p_cohort uuid, p_days int default 30)
returns table (rank bigint, user_id uuid, points bigint)
language sql
stable
security definer
set search_path = public
as $$
  select row_number() over (order by cnt desc) as rank,
         agg.user_id,
         agg.cnt::bigint as points
  from (
    select e.user_id, count(*) as cnt
    from public.activity_events e
    where e.cohort_id = p_cohort
      and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day')
    group by e.user_id
  ) agg
  where exists (
      select 1 from public.cohort_members m
      where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (
      select 1 from public.cohorts c where c.id = p_cohort and c.mentor_user_id = auth.uid()
    )
  order by cnt desc
  limit 50;
$$;

revoke all on function public.cohort_leaderboard(uuid, int) from public;
grant execute on function public.cohort_leaderboard(uuid, int) to authenticated;

-- Optional seed (uncomment, replace YOUR_USER_UUID, set invite_code):
-- insert into public.cohorts (name, slug, invite_code, whatsapp_invite_url, mentor_user_id)
-- values ('Demo Cohort', 'demo', 'LARIS2026', 'https://chat.whatsapp.com/REPLACE', 'YOUR_USER_UUID'::uuid)
-- on conflict (slug) do nothing;
