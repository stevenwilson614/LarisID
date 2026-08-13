-- Expose listing_weekly / keyword_weekly to the frontend.
--
-- Canonical DDL + refresh_listing_weekly() live in
-- ~/shopee_scraper/listing_weekly.sql (applied over SSH+psql). This migration
-- is the read surface: tables (IF NOT EXISTS so a first-time db push is not
-- blocked on the scraper file), RLS, grants, and the thin RPCs the Deep Dive
-- charts call. It does NOT grant refresh_listing_weekly — that is a 500k-row
-- rebuild and Kong 504s on work this size.
--
-- weekly_snapshots (frozen 2026-06-08) is not touched and must not be revived.

create table if not exists public.listing_weekly (
    item_id      bigint not null,
    shop_id      bigint not null,
    week_start   date   not null,
    units_wk     real   not null,
    omset_wk     bigint not null,
    price        real,
    v_daily      real,
    source       text   not null,
    confidence   text   not null,
    peer_n       integer,
    delta_units  integer,
    span_days    real,
    computed_at  timestamptz not null default now(),
    revised_at   timestamptz not null default now(),
    primary key (item_id, shop_id, week_start)
);

create index if not exists listing_weekly_week_idx
  on public.listing_weekly (week_start, source);

create table if not exists public.keyword_weekly (
    keyword      text   not null,
    week_start   date   not null,
    units_wk     real   not null,
    omset_wk     bigint not null,
    n_listings   integer not null,
    source       text   not null,
    confidence   text   not null,
    peer_n       integer,
    computed_at  timestamptz not null default now(),
    revised_at   timestamptz not null default now(),
    primary key (keyword, week_start)
);

create index if not exists keyword_weekly_week_idx
  on public.keyword_weekly (week_start);

comment on table public.listing_weekly is
  'Weekly snapshot per listing (measured/nowcast/forecast/peer/zero). '
  'Refreshed by refresh_listing_weekly() in shopee_scraper/listing_weekly.sql. '
  'Do not revive weekly_snapshots.';

comment on table public.keyword_weekly is
  'Keyword rollup of listing_weekly, DISTINCT (item_id, shop_id). '
  'Not mv_keyword_weekly (that is the terlaris-minggu badge matview).';

create or replace function public.listing_week_start(p_asof date)
returns date language sql immutable as $$
  select p_asof - ((extract(isodow from p_asof)::integer) - 1);
$$;

create or replace function public.listing_weekly_for(
    p_item_id bigint, p_shop_id bigint, p_weeks int default 8)
returns setof public.listing_weekly
language sql stable
set search_path to 'public'
as $$
  select *
  from listing_weekly
  where item_id = p_item_id and shop_id = p_shop_id
    and week_start >= listing_week_start(current_date)
                       - (greatest(p_weeks, 1) * 7)
  order by week_start;
$$;

create or replace function public.keyword_weekly_for(
    p_keyword text, p_weeks int default 8)
returns setof public.keyword_weekly
language sql stable
set search_path to 'public'
as $$
  select *
  from keyword_weekly
  where keyword = btrim(p_keyword)
    and week_start >= listing_week_start(current_date)
                       - (greatest(p_weeks, 1) * 7)
  order by week_start;
$$;

alter table public.listing_weekly enable row level security;
alter table public.keyword_weekly enable row level security;

drop policy if exists "public read listing_weekly" on public.listing_weekly;
create policy "public read listing_weekly" on public.listing_weekly
  for select to public using (true);
drop policy if exists "public read keyword_weekly" on public.keyword_weekly;
create policy "public read keyword_weekly" on public.keyword_weekly
  for select to public using (true);

grant select on public.listing_weekly, public.keyword_weekly to anon, authenticated;
grant execute on function public.listing_week_start(date) to anon, authenticated;
grant execute on function public.listing_weekly_for(bigint, bigint, int) to anon, authenticated;
grant execute on function public.keyword_weekly_for(text, int) to anon, authenticated;

notify pgrst, 'reload schema';
