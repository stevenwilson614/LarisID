-- Log of chat searches that came back empty even after query-plan expansion,
-- brand-typo correction, and the fuzzy keyword fallback (see
-- searchProductsForQuery's true 'clarify' path in js/gpt-app.js). Lets Steven
-- see what real users are searching for that isn't scraped yet, to decide
-- whether it's worth adding to the scrape keyword list.
--
-- Deliberately a NEW table rather than reusing keyword_scrape_requests: that
-- table requires a non-null user_id and its RLS only grants insert to
-- `authenticated`, so it can't capture anonymous searches — the majority of
-- traffic here. This table accepts anon + authenticated inserts and is
-- admin-read-only (no user-facing "notify me" feature, just a review queue).

create table if not exists public.uncovered_searches (
  id         bigint generated always as identity primary key,
  query_raw  text not null check (char_length(trim(query_raw)) >= 2),
  query_norm text generated always as (lower(trim(query_raw))) stored,
  brand      text,
  category   text,
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists uncovered_searches_norm_idx
  on public.uncovered_searches (query_norm);
create index if not exists uncovered_searches_created_idx
  on public.uncovered_searches (created_at desc);

alter table public.uncovered_searches enable row level security;

drop policy if exists uncovered_searches_insert on public.uncovered_searches;
create policy uncovered_searches_insert on public.uncovered_searches
  for insert to anon, authenticated
  with check (true);

drop policy if exists uncovered_searches_admin_select on public.uncovered_searches;
create policy uncovered_searches_admin_select on public.uncovered_searches
  for select to authenticated
  using (public.is_platform_admin());

grant insert on public.uncovered_searches to anon, authenticated;
grant select on public.uncovered_searches to authenticated;
