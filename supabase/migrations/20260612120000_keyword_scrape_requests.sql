-- Users can request a keyword be scraped when Discover has few/no results.
-- Fulfillment + notify is checked client-side on return visits; admins can
-- prioritize pending rows for the weekly scrape queue.

create table if not exists public.keyword_scrape_requests (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  keyword                 text not null check (char_length(trim(keyword)) >= 2),
  keyword_norm            text generated always as (lower(trim(keyword))) stored,
  status                  text not null default 'pending'
    check (status in ('pending', 'ready', 'notified', 'cancelled')),
  notify_when_ready       boolean not null default true,
  result_count_at_request integer,
  created_at              timestamptz not null default now(),
  fulfilled_at            timestamptz,
  notified_at             timestamptz
);

create index if not exists keyword_scrape_requests_user_created_idx
  on public.keyword_scrape_requests (user_id, created_at desc);

create index if not exists keyword_scrape_requests_pending_idx
  on public.keyword_scrape_requests (status, created_at desc)
  where status = 'pending';

create unique index if not exists keyword_scrape_requests_user_kw_pending_uidx
  on public.keyword_scrape_requests (user_id, keyword_norm)
  where status = 'pending';

alter table public.keyword_scrape_requests enable row level security;

drop policy if exists keyword_scrape_requests_owner_select on public.keyword_scrape_requests;
create policy keyword_scrape_requests_owner_select on public.keyword_scrape_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists keyword_scrape_requests_owner_insert on public.keyword_scrape_requests;
create policy keyword_scrape_requests_owner_insert on public.keyword_scrape_requests
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists keyword_scrape_requests_owner_update on public.keyword_scrape_requests;
create policy keyword_scrape_requests_owner_update on public.keyword_scrape_requests
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists keyword_scrape_requests_admin_all on public.keyword_scrape_requests;
create policy keyword_scrape_requests_admin_all on public.keyword_scrape_requests
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select, insert, update on public.keyword_scrape_requests to authenticated;
