-- Roadmap status for community usulan: open (baru diajukan), considering
-- (sedang dipertimbangkan), done (sudah diimplementasi). Users may only
-- insert open rows; status changes are admin/service-role for now.

alter table public.feature_requests
  add column if not exists status text not null default 'open'
    check (status in ('open', 'considering', 'done'));

create index if not exists idx_fr_status_kind_created
  on public.feature_requests (status, kind, created_at desc);

-- New inserts must stay status=open so users cannot self-promote to done.
create or replace function public.fr_force_open_status()
returns trigger
language plpgsql
as $$
begin
  new.status := 'open';
  return new;
end;
$$;

drop trigger if exists fr_force_open_status_trg on public.feature_requests;
create trigger fr_force_open_status_trg
  before insert on public.feature_requests
  for each row execute function public.fr_force_open_status();

-- Append status to the feed view (must not reorder existing columns).
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
  fr.status
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;
