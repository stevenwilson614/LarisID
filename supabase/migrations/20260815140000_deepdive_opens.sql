-- ============================================================================
-- Count every deep-dive open, including anonymous ones.
--
-- Why this exists: after the 2026-08-10 cutover to the gpt-only site, deep-dive
-- volume had no reliable counter.
--   * `use_dive` (usage_events kind='dive', daily_usage.dives_used) is never
--     called by js/gpt-app.js, so both have read 0 since 2026-08-10.
--   * `activity_events.deepdive_open` exists but logUserEvent() early-returns
--     when there is no signed-in user, so EVERY anonymous dive is invisible —
--     and anon users get a free dive by design, so that is real traffic.
--
-- This table is a pure counter. It deliberately does NOT meter or wall:
-- js/gpt-app.js states the contract "viewing a product must never be walled
-- (MISSION: no trapping)", so log_deepdive_open() always inserts and always
-- returns ok. `use_dive` is left untouched — re-wiring it would cap deep dives
-- at 10/day and burn a counter shared with the retired Site A.
--
-- Shape mirrors public.product_views (same visitor_id source, same WIB
-- view_day default) so the two anonymous-friendly counters stay comparable.
-- Unlike product_views there is no per-day dedupe: every open is a row.
-- ============================================================================

begin;

create table if not exists public.deepdive_opens (
  id         bigint generated always as identity primary key,
  user_id    uuid,          -- auth.uid() when signed in, null for anonymous
  visitor_id text,          -- _lid_vid from localStorage; survives sign-out
  item_id    text,          -- text (not bigint) to match product_views
  shop_id    text,
  keyword    text,
  source     text not null default 'app',   -- 'app' | 'backfill'
  created_at timestamptz not null default now(),
  view_day   date not null default ((now() at time zone 'Asia/Jakarta')::date)
);

create index if not exists idx_deepdive_opens_created on public.deepdive_opens (created_at desc);
create index if not exists idx_deepdive_opens_day     on public.deepdive_opens (view_day);
create index if not exists idx_deepdive_opens_user    on public.deepdive_opens (user_id, created_at desc);

-- All writes go through log_deepdive_open(); admins read via the definer
-- admin_dashboard_kpis(). No policy is created, so RLS denies direct access.
alter table public.deepdive_opens enable row level security;

create or replace function public.log_deepdive_open(
  p_item_id    text default null,
  p_shop_id    text default null,
  p_keyword    text default null,
  p_visitor_id text default null,
  p_source     text default 'app'
) returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  -- Never refuses. A deep dive that opened is a deep dive that happened; the
  -- caller must not be able to interpret any return value as a wall.
  insert into public.deepdive_opens
    (user_id, visitor_id, item_id, shop_id, keyword, source)
  values
    (auth.uid(),
     left(nullif(btrim(coalesce(p_visitor_id, '')), ''), 64),
     left(nullif(btrim(coalesce(p_item_id, '')), ''), 40),
     left(nullif(btrim(coalesce(p_shop_id, '')), ''), 40),
     left(nullif(btrim(coalesce(p_keyword, '')), ''), 160),
     case when coalesce(p_source, '') in ('app', 'backfill') then p_source else 'app' end);

  return json_build_object('ok', true);
end;
$$;

-- Explicitly named revoke: default privileges on this box re-grant anon, so a
-- bare `revoke from public` would leave an unintended grant behind.
revoke all on function public.log_deepdive_open(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.log_deepdive_open(text,text,text,text,text) to anon, authenticated;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Historical signed-in dives, so the admin sparkline keeps its history instead
-- of starting from zero today. Anonymous history is NOT recoverable:
-- product_views is deduped per visitor/product/day and would undercount, so it
-- is deliberately not used as a backfill source. Guarded by the source tag so
-- re-running this migration cannot double-count.
insert into public.deepdive_opens
  (user_id, visitor_id, item_id, shop_id, keyword, source, created_at, view_day)
select
  e.user_id,
  null,
  left(nullif(btrim(e.metadata->>'item_id'), ''), 40),
  left(nullif(btrim(e.metadata->>'shop_id'), ''), 40),
  left(nullif(btrim(e.metadata->>'keyword'), ''), 160),
  'backfill',
  e.created_at,
  (e.created_at at time zone 'Asia/Jakarta')::date
from public.activity_events e
where e.event_type = 'deepdive_open'
  and not exists (
    select 1 from public.deepdive_opens d where d.source = 'backfill'
  );

commit;

notify pgrst, 'reload schema';
