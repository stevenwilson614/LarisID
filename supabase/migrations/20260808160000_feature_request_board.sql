-- Community feature-request / complaints board (Site B "Add this feature" page).
--
-- Deliberately NOT built on community_posts — that table's cohort_id is not
-- null and load-bearing through every existing cohort RLS policy (see
-- 20260213120000_cohort_community.sql, 20260215120000_cohort_theme_leader_branding.sql,
-- 20260216120000_cohort_ui_extensions.sql, 20260513150000_roles_admin_leader_infra.sql).
-- Retrofitting a nullable cohort_id there to support a public, cohort-independent
-- board would mean branching every one of those policies on "cohort_id is null",
-- which is real regression risk against a feature actively growing this month
-- (the first 20-student cohort). New parallel tables instead, mirroring only
-- the *shape* of community_post_comments / community_post_reactions.

create table if not exists public.feature_requests (
  id                 uuid primary key default gen_random_uuid(),
  author_id          uuid not null references auth.users (id) on delete cascade,
  -- Snapshot at post time, set server-side by the trigger below — never
  -- trusted from the client, and never a live join to another user's
  -- user_profiles row (which RLS blocks anyway; see user_profiles_own).
  author_first_name  text not null default '',
  kind               text not null check (kind in ('feature', 'complaint')),
  title              text not null check (char_length(trim(title)) between 1 and 120),
  body               text not null check (char_length(trim(body)) between 1 and 4000),
  created_at         timestamptz not null default now()
);

create index if not exists idx_fr_kind_created on public.feature_requests (kind, created_at desc);

create table if not exists public.feature_request_comments (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null references public.feature_requests (id) on delete cascade,
  author_id          uuid not null references auth.users (id) on delete cascade,
  author_first_name  text not null default '',
  body               text not null check (char_length(trim(body)) between 1 and 2000),
  created_at         timestamptz not null default now()
);

create index if not exists idx_frc_request_created on public.feature_request_comments (request_id, created_at);

create table if not exists public.feature_request_likes (
  request_id  uuid not null references public.feature_requests (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

create index if not exists idx_frl_request on public.feature_request_likes (request_id);

-- ── author_first_name: server-set, not client-trusted ───────────────────────
create or replace function public.fr_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
begin
  select nullif(trim(first_name), '') into fname
  from public.user_profiles
  where user_id = new.author_id;
  new.author_first_name := coalesce(fname, 'Pengguna LarisID');
  return new;
end;
$$;

drop trigger if exists fr_set_author_name_trg on public.feature_requests;
create trigger fr_set_author_name_trg
  before insert on public.feature_requests
  for each row execute function public.fr_set_author_name();

drop trigger if exists frc_set_author_name_trg on public.feature_request_comments;
create trigger frc_set_author_name_trg
  before insert on public.feature_request_comments
  for each row execute function public.fr_set_author_name();

-- ── RLS: any signed-in user reads all, writes only their own row ────────────
alter table public.feature_requests enable row level security;
alter table public.feature_request_comments enable row level security;
alter table public.feature_request_likes enable row level security;

drop policy if exists fr_select on public.feature_requests;
create policy fr_select on public.feature_requests
  for select to authenticated using (true);

drop policy if exists fr_insert on public.feature_requests;
create policy fr_insert on public.feature_requests
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists frc_select on public.feature_request_comments;
create policy frc_select on public.feature_request_comments
  for select to authenticated using (true);

drop policy if exists frc_insert on public.feature_request_comments;
create policy frc_insert on public.feature_request_comments
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists frl_select on public.feature_request_likes;
create policy frl_select on public.feature_request_likes
  for select to authenticated using (true);

drop policy if exists frl_insert on public.feature_request_likes;
create policy frl_insert on public.feature_request_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists frl_delete on public.feature_request_likes;
create policy frl_delete on public.feature_request_likes
  for delete to authenticated using (user_id = auth.uid());

-- ── Feed view: counts + "did I like this" pre-joined, avoids N+1 from the client ──
create or replace view public.feature_requests_feed as
select
  fr.id, fr.author_id, fr.author_first_name, fr.kind, fr.title, fr.body, fr.created_at,
  coalesce(lc.n, 0)::int as like_count,
  coalesce(cc.n, 0)::int as comment_count,
  exists (
    select 1 from public.feature_request_likes l
    where l.request_id = fr.id and l.user_id = auth.uid()
  ) as liked_by_me
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;
grant select, insert on public.feature_requests to authenticated;
grant select, insert on public.feature_request_comments to authenticated;
grant select, insert, delete on public.feature_request_likes to authenticated;
