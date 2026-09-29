-- Komunitas photos: one optional image on a post and on each jawaban.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260929140000_komunitas_photos.sql

begin;

alter table public.feature_requests
  add column if not exists image_url text;

alter table public.feature_request_comments
  add column if not exists image_url text;

alter table public.feature_request_comments
  drop constraint if exists feature_request_comments_body_check;

alter table public.feature_request_comments
  alter column body set default '';

-- Body may be blank when a photo is attached; still cap length.
alter table public.feature_request_comments
  add constraint feature_request_comments_body_check
  check (char_length(trim(body)) <= 2000);

alter table public.feature_request_comments
  drop constraint if exists feature_request_comments_content_check;

alter table public.feature_request_comments
  add constraint feature_request_comments_content_check
  check (
    char_length(trim(body)) >= 1
    or (image_url is not null and char_length(trim(image_url)) > 0)
  );

-- Append-only feed columns stay at the end.
create or replace view public.feature_requests_feed as
select
  fr.id, fr.author_id, fr.author_first_name,
  fr.kind, fr.title, fr.body, fr.created_at,
  coalesce(lc.n, 0)::int as like_count,
  coalesce(cc.n, 0)::int as comment_count,
  exists (
    select 1 from public.feature_request_likes l
    where l.request_id = fr.id and l.user_id = auth.uid()
  ) as liked_by_me,
  fr.author_city, fr.author_headshot_url,
  fr.status,
  fr.author_is_admin,
  fr.topic,
  coalesce(nsc.n, 0)::int as non_staff_comment_count,
  fr.image_url
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id
left join (
  select request_id, count(*) n
  from public.feature_request_comments
  where coalesce(author_is_admin, false) is false
  group by request_id
) nsc on nsc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;

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
  ) as liked_by_me,
  c.image_url
from public.feature_request_comments c
left join (
  select comment_id, count(*) n
  from public.feature_request_comment_likes
  group by comment_id
) lc on lc.comment_id = c.id;

grant select on public.feature_request_comments_feed to authenticated;

insert into storage.buckets (id, name, public)
values ('komunitas-photos', 'komunitas-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read komunitas photos" on storage.objects;
create policy "Public read komunitas photos" on storage.objects
  for select
  using (bucket_id = 'komunitas-photos');

-- Path shape: posts/<user_id>/… or comments/<user_id>/…
drop policy if exists "Users manage own komunitas photos" on storage.objects;
create policy "Users manage own komunitas photos" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'komunitas-photos'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'komunitas-photos'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  );

notify pgrst, 'reload schema';

commit;
