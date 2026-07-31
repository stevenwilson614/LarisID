-- ============================================================================
-- Custom keyword + store tracking
--
-- Users configure up to 5 keywords and 3 stores. The keywords feed the scraper's
-- `daily_custom` set (scraped every morning); the static day1-day5 sets move to a
-- biweekly rotation. Stores need no scraping at all — every row in `listings`
-- already carries shop_id/store_name, so tracking a store is a filter over data
-- we already collect.
--
-- Idle decay: if a user does not open their tracker for 14 days we stop scraping
-- their keywords. Config and data are kept; only the daily scrape stops. The
-- day-11 warning is the point of the feature — "your tracking pauses in 3 days"
-- is a re-engagement message about something the user chose themselves.
--
-- SELF-HOSTED GOTCHAS this migration is written against (all three have cost a
-- debugging cycle on this box before):
--   1. RLS is auto-enabled on new tables in `public`. Without an explicit policy,
--      GRANT SELECT is irrelevant and reads return [] with HTTP 200 — no error.
--   2. Default privileges re-grant to anon. `revoke ... from public` is not
--      enough; anon must be revoked explicitly by name.
--   3. PostgREST caches the schema. New objects 404 with PGRST202 until
--      `notify pgrst, 'reload schema'`.
-- Verify pattern: apply -> notify -> curl the anon REST endpoint -> only then
-- trust it. psql proving the rows exist proves nothing about the API.
-- ============================================================================

begin;

-- ── Slot limits ─────────────────────────────────────────────────────────────
-- Enforced server-side. The client also renders them, but the client is not a
-- security boundary and these tables are writable by authenticated users.
create or replace function public.tracking_keyword_limit() returns int
  language sql immutable as $$ select 5 $$;

create or replace function public.tracking_store_limit() returns int
  language sql immutable as $$ select 3 $$;

-- ── Per-user tracker state (pause/resume lives here, not per-row) ───────────
-- Pause is a property of the USER, not of an individual keyword: a user goes
-- quiet, so all of their scraping stops together.
create table if not exists public.user_tracker_state (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  warned_at      timestamptz,          -- day-11 "about to pause" notice sent
  paused_at      timestamptz,          -- day-14 scrape stopped
  resumed_count  int not null default 0,  -- how often the warning won them back
  created_at     timestamptz not null default now()
);

comment on column public.user_tracker_state.resumed_count is
  'Increments each time a paused user returns. This is the conversion metric for '
  'the loss-aversion nudge — track it separately from ordinary return-rate.';

-- ── Keyword slots ───────────────────────────────────────────────────────────
create table if not exists public.user_tracked_keywords (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  keyword      text not null check (length(btrim(keyword)) between 2 and 120),
  keyword_norm text generated always as (lower(btrim(keyword))) stored,
  category     text not null default '',
  created_at   timestamptz not null default now(),
  unique (user_id, keyword_norm)
);

-- ── Store slots ─────────────────────────────────────────────────────────────
create table if not exists public.user_tracked_stores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  shop_id    bigint not null,
  store_name text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, shop_id)
);

create index if not exists idx_utk_user on public.user_tracked_keywords (user_id);
create index if not exists idx_uts_user on public.user_tracked_stores  (user_id);

-- ── Slot-limit enforcement ──────────────────────────────────────────────────
create or replace function public.enforce_tracking_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n   int;
  cap int;
begin
  if tg_table_name = 'user_tracked_keywords' then
    cap := public.tracking_keyword_limit();
    select count(*) into n from public.user_tracked_keywords where user_id = new.user_id;
    if n >= cap then
      raise exception 'keyword slot limit reached (% of %)', n, cap
        using errcode = 'check_violation';
    end if;
  else
    cap := public.tracking_store_limit();
    select count(*) into n from public.user_tracked_stores where user_id = new.user_id;
    if n >= cap then
      raise exception 'store slot limit reached (% of %)', n, cap
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_utk_limit on public.user_tracked_keywords;
create trigger trg_utk_limit before insert on public.user_tracked_keywords
  for each row execute function public.enforce_tracking_limits();

drop trigger if exists trg_uts_limit on public.user_tracked_stores;
create trigger trg_uts_limit before insert on public.user_tracked_stores
  for each row execute function public.enforce_tracking_limits();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Gotcha 1: these are ON by default on this box; without policies every read
-- returns [] silently.
alter table public.user_tracker_state     enable row level security;
alter table public.user_tracked_keywords  enable row level security;
alter table public.user_tracked_stores    enable row level security;

drop policy if exists p_uts_own on public.user_tracker_state;
create policy p_uts_own on public.user_tracker_state
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_utk_own on public.user_tracked_keywords;
create policy p_utk_own on public.user_tracked_keywords
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_utst_own on public.user_tracked_stores;
create policy p_utst_own on public.user_tracked_stores
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Scraper feed ────────────────────────────────────────────────────────────
-- Read by keywords_daily_custom.py with the SERVICE-ROLE key, which bypasses
-- RLS. Deliberately NOT granted to anon: this view is the union of every user's
-- keyword list, which is private competitive information.
create or replace view public.v_daily_custom_keywords as
  select distinct k.keyword, k.category
  from public.user_tracked_keywords k
  join public.user_tracker_state s on s.user_id = k.user_id
  where s.paused_at is null;

comment on view public.v_daily_custom_keywords is
  'Active user keywords for the scraper daily_custom set. Service-role only.';

-- ── Grants (gotcha 2: revoke anon explicitly, by name) ──────────────────────
revoke all on public.v_daily_custom_keywords from public, anon;
grant select on public.v_daily_custom_keywords to service_role;

revoke all on public.user_tracker_state,
              public.user_tracked_keywords,
              public.user_tracked_stores from public, anon;
grant select, insert, update, delete
  on public.user_tracker_state, public.user_tracked_keywords, public.user_tracked_stores
  to authenticated;

revoke all on function public.enforce_tracking_limits() from public, anon;

commit;

-- ── Gotcha 3 ────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
