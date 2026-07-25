-- "Rekomendasi Steven" — weekly, per-city picks of products new sellers are
-- actually succeeding with.
--
-- Why a new matview rather than slicing mv_naik_daun: that view is LIMIT 200
-- GLOBALLY, so filtering it to one city yields almost nothing outside Jakarta.
-- This one partitions by city and keeps the top 20 in each, so every supported
-- city has a full list.
--
-- "Succeeding" reuses the codebase's existing new-seller definition from
-- 20260618140000_naik_daun.sql: listed in the last 120 days, already past 100
-- sales, ranked by sales-since-listing per day. That deliberately excludes the
-- old mega-sellers that a plain `order by total_sold desc` surfaces — those are
-- not products a new seller can realistically enter against.

-- ---------------------------------------------------------------------------
-- 1. Canonical city → Shopee location map
-- ---------------------------------------------------------------------------
-- These buckets already existed in THREE places: YLK_CLUSTERS (js/laris-app.js),
-- CITY_LOCATIONS (js/gpt-app.js) and an inline city_map CTE in
-- 20260723120000_mv_product_types.sql — which already carries a "keep the two in
-- sync" warning. Promoting it to a table so new code has one place to read.
-- mv_product_types should be migrated to select from here on its next rebuild.

create table if not exists public.city_location_map (
  city text not null,
  loc  text not null,
  primary key (city, loc)
);

alter table public.city_location_map enable row level security;

drop policy if exists city_location_map_read_all on public.city_location_map;
create policy city_location_map_read_all on public.city_location_map
  for select using (true);

insert into public.city_location_map (city, loc) values
  ('Jakarta','Jakarta Barat'),('Jakarta','Jakarta Timur'),('Jakarta','Jakarta Selatan'),
  ('Jakarta','Jakarta Utara'),('Jakarta','Jakarta Pusat'),('Jakarta','Kota Tangerang'),
  ('Jakarta','Tangerang Selatan'),('Jakarta','Kab. Tangerang'),('Jakarta','Tangerang'),
  ('Jakarta','Kota Bekasi'),('Jakarta','Kab. Bekasi'),('Jakarta','Bekasi'),
  ('Jakarta','Kota Depok'),('Jakarta','Depok'),('Jakarta','Kota Bogor'),
  ('Jakarta','Kab. Bogor'),('Jakarta','Bogor'),
  ('Bekasi','Kota Bekasi'),('Bekasi','Kab. Bekasi'),('Bekasi','Bekasi'),
  ('Bekasi','Jakarta Timur'),('Bekasi','Jakarta Utara'),('Bekasi','Cikarang'),
  ('Depok','Kota Depok'),('Depok','Depok'),('Depok','Jakarta Selatan'),
  ('Depok','Bogor'),('Depok','Kota Bogor'),('Depok','Kab. Bogor'),
  ('Tangerang','Kota Tangerang'),('Tangerang','Tangerang Selatan'),
  ('Tangerang','Kab. Tangerang'),('Tangerang','Tangerang'),('Tangerang','Jakarta Barat'),
  ('Bogor','Kota Bogor'),('Bogor','Kab. Bogor'),('Bogor','Bogor'),
  ('Bogor','Depok'),('Bogor','Kota Depok'),
  ('Bandung','Bandung'),('Bandung','Kota Bandung'),('Bandung','Kab. Bandung'),
  ('Bandung','Kab. Bandung Barat'),('Bandung','Cimahi'),('Bandung','Kota Cimahi'),
  ('Semarang','Semarang'),('Semarang','Kota Semarang'),('Semarang','Kab. Semarang'),
  ('Yogyakarta','Yogyakarta'),('Yogyakarta','Kota Yogyakarta'),('Yogyakarta','Sleman'),
  ('Yogyakarta','Kab. Sleman'),('Yogyakarta','Bantul'),('Yogyakarta','Kab. Bantul'),
  ('Surabaya','Surabaya'),('Surabaya','Sidoarjo'),('Surabaya','Kab. Sidoarjo'),
  ('Surabaya','Gresik'),('Surabaya','Kab. Gresik'),
  ('Sidoarjo','Sidoarjo'),('Sidoarjo','Kab. Sidoarjo'),('Sidoarjo','Surabaya'),
  ('Sidoarjo','Gresik'),('Sidoarjo','Kab. Gresik'),
  ('Medan','Medan'),('Medan','Kota Medan'),('Medan','Kab. Deli Serdang'),
  ('Makassar','Makassar'),('Makassar','Kota Makassar'),
  ('Palembang','Palembang'),('Palembang','Kota Palembang'),
  ('Denpasar','Denpasar'),('Denpasar','Kota Denpasar'),
  ('Denpasar','Badung'),('Denpasar','Kab. Badung')
on conflict (city, loc) do nothing;

grant select on public.city_location_map to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. mv_city_weekly_recs — top 20 per city
-- ---------------------------------------------------------------------------

drop materialized view if exists public.mv_city_weekly_recs cascade;

create materialized view public.mv_city_weekly_recs as
with latest as (
  select distinct on (item_id)
         item_id, shop_id, store_name, product_name, category, keyword,
         price, total_sold, reviews, rating, location, image_url, url,
         listing_date, scraped_at,
         greatest(extract(epoch from (scraped_at - listing_date)) / 86400, 1) as age_days
  from public.listings
  where listing_date >= (now() - interval '120 days')
    and price between 1000 and 50000000
    and total_sold >= 100
    and location is not null
    and length(trim(location)) > 0
  order by item_id, scraped_at desc
),
eligible as (
  select l.*, (l.total_sold / l.age_days) as vel
  from latest l
  where l.age_days between 7 and 120
),
per_city as (
  select
    m.city,
    e.item_id, e.shop_id, e.store_name, e.product_name, e.category, e.keyword,
    e.price, e.total_sold, e.reviews, e.rating, e.location, e.image_url, e.url,
    e.listing_date,
    round(e.age_days)::int as age_days,
    round(e.vel)::int      as sold_per_day,
    row_number() over (partition by m.city order by e.vel desc, e.total_sold desc, e.item_id) as rn
  from eligible e
  join public.city_location_map m on m.loc = e.location
)
select
  city, item_id, shop_id, store_name, product_name, category, keyword,
  price, total_sold, reviews, rating, location, image_url, url,
  listing_date, age_days, sold_per_day, rn,
  date_trunc('week', (now() at time zone 'Asia/Jakarta'))::date as week_start,
  now() as refreshed_at
from per_city
where rn <= 20;

-- Unique index is required for REFRESH ... CONCURRENTLY.
create unique index mv_city_weekly_recs_city_item_idx
  on public.mv_city_weekly_recs (city, item_id);
create index mv_city_weekly_recs_city_rank_idx
  on public.mv_city_weekly_recs (city, rn);

grant select on public.mv_city_weekly_recs to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Weekly refresh
-- ---------------------------------------------------------------------------

create or replace function public.refresh_city_weekly_recs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- CONCURRENTLY so readers never see an empty list mid-refresh. Falls back to a
  -- plain refresh if the view has never been populated (concurrent refresh errors
  -- on an unpopulated matview).
  begin
    refresh materialized view concurrently public.mv_city_weekly_recs;
  exception when others then
    refresh materialized view public.mv_city_weekly_recs;
  end;
end;
$$;

revoke all on function public.refresh_city_weekly_recs() from public;

-- NOTE: the cron entry is deliberately NOT created here.
--
-- Migrations are not the source of truth for schedules in this project — the
-- weekly-digest job and the breakout matview refresher both exist only on the
-- live DB. Adding a schedule blind risks duplicating an existing job. Check
-- first, then schedule:
--
--   select jobname, schedule, command from cron.job order by jobname;
--
--   select cron.schedule(
--     'refresh-city-weekly-recs',
--     '0 20 * * 0',                       -- Mon 03:00 WIB
--     $cron$ select public.refresh_city_weekly_recs() $cron$
--   );
--
-- Pure SQL, so it needs no service-role bearer — unlike the two existing
-- net.http_post schedules, which committed a plaintext service-role JWT to this
-- repo. Do not copy that pattern.
