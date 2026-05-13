-- Cohort UI extensions: names RPC, streak/rankings, student directory, ping, milestones.key,
-- feed activity RPC, auto-milestone RPC, post comments/reactions, answered_at, last_seen
-- Apply after 20260215120000_cohort_theme_leader_branding.sql

-- ── cohort_members.last_seen_at ──
alter table public.cohort_members
  add column if not exists last_seen_at timestamptz;

-- ── milestones.machine key (optional, for auto-complete) ──
alter table public.milestones
  add column if not exists milestone_key text;

create index if not exists idx_milestones_key on public.milestones (cohort_id, milestone_key) where milestone_key is not null;

-- ── community_posts: answered flag for questions ──
alter table public.community_posts
  add column if not exists answered_at timestamptz;

-- ── cohort_ping: update last_seen for current user in cohort ──
create or replace function public.cohort_ping(p_cohort uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.cohort_members m
  set last_seen_at = now()
  where m.cohort_id = p_cohort
    and m.user_id = auth.uid()
    and m.status = 'active';
end;
$$;

revoke all on function public.cohort_ping(uuid) from public;
grant execute on function public.cohort_ping(uuid) to authenticated;

-- ── Display names for cohort members (cohort-scoped) ──
create or replace function public.cohort_member_names(p_cohort uuid)
returns table(user_id uuid, display_name text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.user_id::uuid,
         coalesce(
           nullif(trim(both from coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
           split_part(u.email, '@', 1),
           'Member'
         )::text as display_name
  from public.cohort_members m
  join auth.users u on u.id = m.user_id
  where m.cohort_id = p_cohort
    and m.status = 'active'
    and (
      exists (
        select 1 from public.cohort_members me
        where me.cohort_id = p_cohort and me.user_id = auth.uid() and me.status = 'active'
      )
      or exists (select 1 from public.cohorts c where c.id = p_cohort and c.mentor_user_id = auth.uid())
    );
$$;

revoke all on function public.cohort_member_names(uuid) from public;
grant execute on function public.cohort_member_names(uuid) to authenticated;

-- ── Recent activity events for merged cohort feed (RLS-safe aggregate view) ──
create or replace function public.cohort_feed_activity_events(p_cohort uuid, p_limit int default 80)
returns table (
  id uuid,
  created_at timestamptz,
  event_type text,
  metadata jsonb,
  user_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.created_at, e.event_type, e.metadata, e.user_id
  from public.activity_events e
  where e.cohort_id = p_cohort
    and coalesce(p_limit, 80) > 0
    and (
      exists (
        select 1 from public.cohort_members m
        where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.status = 'active'
      )
      or exists (select 1 from public.cohorts c where c.id = p_cohort and c.mentor_user_id = auth.uid())
    )
  order by e.created_at desc
  limit least(coalesce(p_limit, 80), 200);
$$;

revoke all on function public.cohort_feed_activity_events(uuid, int) from public;
grant execute on function public.cohort_feed_activity_events(uuid, int) to authenticated;

-- ── Streak: consecutive calendar days (Asia/Jakarta) ending on last active day ──
create or replace function public.cohort_user_streak(p_cohort uuid, p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select distinct (e.created_at at time zone 'Asia/Jakarta')::date as d
    from public.activity_events e
    where e.cohort_id = p_cohort
      and e.user_id = p_user
      and e.created_at >= (timezone('Asia/Jakarta', now()))::date - interval '400 days'
  ),
  numbered as (
    select d, (d - (row_number() over (order by d))::integer) as grp
    from days
  ),
  anchor_grp as (
    select n.grp
    from numbered n
    where n.d = (select max(d) from days)
    limit 1
  )
  select case
    when not exists (select 1 from days) then 0
    else coalesce((select count(*)::int from numbered n where n.grp = (select grp from anchor_grp)), 0)
  end;
$$;

revoke all on function public.cohort_user_streak(uuid, uuid) from public;
grant execute on function public.cohort_user_streak(uuid, uuid) to authenticated;

-- ── Rankings board: all active students, points in window + streak + milestones ──
create or replace function public.cohort_rankings_board(p_cohort uuid, p_days int default 30)
returns table (
  rank bigint,
  user_id uuid,
  points bigint,
  streak int,
  milestones_done bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with authz as (
    select 1 as ok
    where exists (
        select 1 from public.cohort_members m
        where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.status = 'active'
      )
      or exists (select 1 from public.cohorts c where c.id = p_cohort and c.mentor_user_id = auth.uid())
  ),
  members as (
    select m.user_id
    from public.cohort_members m
    cross join authz a
    where a.ok = 1
      and m.cohort_id = p_cohort
      and m.status = 'active'
      and m.role = 'student'
  ),
  base as (
    select e.user_id, count(*)::bigint as pts
    from public.activity_events e
    cross join authz a
    where a.ok = 1
      and e.cohort_id = p_cohort
      and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day')
    group by e.user_id
  ),
  ms as (
    select ump.user_id, count(*)::bigint as mc
    from public.user_milestone_progress ump
    join public.milestones ms on ms.id = ump.milestone_id
    cross join authz a
    where a.ok = 1 and ms.cohort_id = p_cohort
    group by ump.user_id
  ),
  agg as (
    select
      mem.user_id,
      coalesce(b.pts, 0)::bigint as pts,
      public.cohort_user_streak(p_cohort, mem.user_id) as streak,
      coalesce(m.mc, 0)::bigint as milestones_done
    from members mem
    left join base b on b.user_id = mem.user_id
    left join ms m on m.user_id = mem.user_id
  )
  select row_number() over (order by a.pts desc, a.milestones_done desc, a.streak desc, a.user_id) as rank,
         a.user_id, a.pts, a.streak, a.milestones_done
  from agg a;
$$;

revoke all on function public.cohort_rankings_board(uuid, int) from public;
grant execute on function public.cohort_rankings_board(uuid, int) to authenticated;

-- ── Student directory for leaders ──
create or replace function public.cohort_student_directory(p_cohort uuid, p_days int default 30)
returns table (
  user_id uuid,
  display_name text,
  last_event_at timestamptz,
  last_seen_at timestamptz,
  event_count bigint,
  milestones_done bigint,
  engagement_score numeric
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    m.user_id,
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
      split_part(u.email, '@', 1),
      'Member'
    )::text as display_name,
    (select max(e.created_at) from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id) as last_event_at,
    m.last_seen_at,
    (select count(*)::bigint from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day')) as event_count,
    (select count(*)::bigint from public.user_milestone_progress ump join public.milestones ms on ms.id = ump.milestone_id where ms.cohort_id = p_cohort and ump.user_id = m.user_id) as milestones_done,
    (
      (select count(*)::numeric from public.activity_events e where e.cohort_id = p_cohort and e.user_id = m.user_id and e.created_at >= now() - (coalesce(p_days, 30) * interval '1 day'))
      * 1.0
      + (select count(*)::numeric from public.user_milestone_progress ump join public.milestones ms on ms.id = ump.milestone_id where ms.cohort_id = p_cohort and ump.user_id = m.user_id) * 3.0
    ) as engagement_score
  from public.cohort_members m
  join auth.users u on u.id = m.user_id
  where m.cohort_id = p_cohort
    and m.role = 'student'
    and m.status = 'active'
    and exists (select 1 from public.cohorts c where c.id = p_cohort and c.mentor_user_id = auth.uid());
$$;

revoke all on function public.cohort_student_directory(uuid, int) from public;
grant execute on function public.cohort_student_directory(uuid, int) to authenticated;

-- ── Auto-complete milestone by stable key (student self) ──
create or replace function public.cohort_try_complete_system_milestone(p_cohort uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ms uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_key is null or btrim(p_key) = '' then return false; end if;

  if not exists (
    select 1 from public.cohort_members m
    where m.cohort_id = p_cohort and m.user_id = auth.uid() and m.status = 'active' and m.role = 'student'
  ) then
    return false;
  end if;

  select ms.id into v_ms
  from public.milestones ms
  where ms.cohort_id = p_cohort and ms.milestone_key = p_key
  limit 1;

  if v_ms is null then return false; end if;

  insert into public.user_milestone_progress (user_id, milestone_id)
  values (auth.uid(), v_ms)
  on conflict (user_id, milestone_id) do nothing;

  return true;
end;
$$;

revoke all on function public.cohort_try_complete_system_milestone(uuid, text) from public;
grant execute on function public.cohort_try_complete_system_milestone(uuid, text) to authenticated;

-- ── community_post_comments ──
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cpc_post on public.community_post_comments (post_id, created_at desc);

alter table public.community_post_comments enable row level security;

drop policy if exists cpc_select on public.community_post_comments;
create policy cpc_select on public.community_post_comments
  for select using (
    exists (
      select 1 from public.community_posts p
      join public.cohort_members m on m.cohort_id = p.cohort_id
      where p.id = community_post_comments.post_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.community_posts p
      join public.cohorts c on c.id = p.cohort_id
      where p.id = community_post_comments.post_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists cpc_insert on public.community_post_comments;
create policy cpc_insert on public.community_post_comments
  for insert with check (
    author_id = auth.uid()
    and (
      exists (
        select 1 from public.community_posts p
        join public.cohort_members m on m.cohort_id = p.cohort_id
        where p.id = post_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
      or exists (
        select 1 from public.community_posts p
        join public.cohorts c on c.id = p.cohort_id
        where p.id = post_id
          and c.mentor_user_id = auth.uid()
      )
    )
  );

-- ── community_post_reactions ──
create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'celebrate', 'focus')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction)
);

create index if not exists idx_cpr_post on public.community_post_reactions (post_id);

alter table public.community_post_reactions enable row level security;

drop policy if exists cpr_select on public.community_post_reactions;
create policy cpr_select on public.community_post_reactions
  for select using (
    exists (
      select 1 from public.community_posts p
      join public.cohort_members m on m.cohort_id = p.cohort_id
      where p.id = community_post_reactions.post_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    or exists (
      select 1 from public.community_posts p
      join public.cohorts c on c.id = p.cohort_id
      where p.id = community_post_reactions.post_id
        and c.mentor_user_id = auth.uid()
    )
  );

drop policy if exists cpr_insert on public.community_post_reactions;
create policy cpr_insert on public.community_post_reactions
  for insert with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.community_posts p
        join public.cohort_members m on m.cohort_id = p.cohort_id
        where p.id = post_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
      or exists (
        select 1 from public.community_posts p
        join public.cohorts c on c.id = p.cohort_id
        where p.id = post_id
          and c.mentor_user_id = auth.uid()
      )
    )
  );

drop policy if exists cpr_delete on public.community_post_reactions;
create policy cpr_delete on public.community_post_reactions
  for delete using (user_id = auth.uid());
