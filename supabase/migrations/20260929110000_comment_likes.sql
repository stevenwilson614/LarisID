-- Likes on Komunitas answers. Same shape as feature_request_likes.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260929110000_comment_likes.sql

begin;

create table if not exists public.feature_request_comment_likes (
  comment_id uuid not null references public.feature_request_comments (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists idx_frcl_comment
  on public.feature_request_comment_likes (comment_id);

alter table public.feature_request_comment_likes enable row level security;

drop policy if exists frcl_select on public.feature_request_comment_likes;
create policy frcl_select on public.feature_request_comment_likes
  for select to authenticated using (true);

drop policy if exists frcl_insert on public.feature_request_comment_likes;
create policy frcl_insert on public.feature_request_comment_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists frcl_delete on public.feature_request_comment_likes;
create policy frcl_delete on public.feature_request_comment_likes
  for delete to authenticated using (user_id = auth.uid());

create or replace view public.feature_request_comments_feed as
select
  c.id,
  c.request_id,
  c.author_id,
  c.author_first_name,
  c.body,
  c.created_at,
  c.author_city,
  c.author_headshot_url,
  c.author_is_admin,
  coalesce(lc.n, 0)::int as like_count,
  exists (
    select 1 from public.feature_request_comment_likes l
    where l.comment_id = c.id and l.user_id = auth.uid()
  ) as liked_by_me
from public.feature_request_comments c
left join (
  select comment_id, count(*) n
  from public.feature_request_comment_likes
  group by comment_id
) lc on lc.comment_id = c.id;

grant select on public.feature_request_comments_feed to authenticated;
grant select, insert, delete on public.feature_request_comment_likes to authenticated;

notify pgrst, 'reload schema';

commit;
