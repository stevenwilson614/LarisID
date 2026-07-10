-- City-level market aggregates powering the /kota/ programmatic SEO pages.
-- APPLIED LIVE 2026-07-09.
--
-- refresh_seo_city_data() recomputes one jsonb row per seller city (>= 15
-- distinct shops in the last 45 days of scrapes): item/seller counts, median
-- price, total estimated units sold, top-3 categories, and the top-8 products
-- by cumulative "terjual". Latest scrape row per item wins (distinct on).
--
-- Refresh after a scrape lands (service role only):
--   select refresh_seo_city_data();
-- Then regenerate the static pages:
--   node scripts/fetch-city-data.mjs && node scripts/build-city-pages.mjs

create table if not exists public.seo_city_data (
  location text primary key,
  data jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.seo_city_data enable row level security;
drop policy if exists "seo_city_data_read_all" on public.seo_city_data;
create policy "seo_city_data_read_all" on public.seo_city_data for select using (true);

create or replace function public.refresh_seo_city_data()
returns integer
language sql
security definer
set search_path = public
as $fn$
  with eligible as (
    select location
    from listings
    where scraped_at > now() - interval '45 days' and location is not null and location <> ''
    group by location
    having count(distinct shop_id) >= 15
  ),
  latest as (
    select distinct on (l.item_id) l.item_id, l.shop_id, l.product_name, l.store_name,
      l.price, l.rating, l.reviews, l.total_sold, l.category, l.location
    from listings l join eligible e on l.location = e.location
    where l.scraped_at > now() - interval '45 days'
    order by l.item_id, l.scraped_at desc
  ),
  agg as (
    select location,
      jsonb_build_object(
        'items', count(*),
        'sellers', count(distinct shop_id),
        'medPrice', round(percentile_cont(0.5) within group (order by price)),
        'totalSold', sum(total_sold)::bigint,
        'cats', (select jsonb_agg(x) from (select category as cat, count(*) as n from latest t2 where t2.location = t1.location and category is not null group by 1 order by 2 desc limit 3) x),
        'top', (select jsonb_agg(y) from (select left(product_name,90) as name, left(store_name,40) as store, price, rating, reviews, total_sold as sold, category as cat from latest t3 where t3.location = t1.location order by total_sold desc nulls last limit 8) y)
      ) as data
    from latest t1
    group by location
  ),
  upsert as (
    insert into seo_city_data(location, data, refreshed_at)
    select location, data, now() from agg
    on conflict (location) do update set data = excluded.data, refreshed_at = excluded.refreshed_at
    returning 1
  )
  select count(*)::int from upsert;
$fn$;
revoke execute on function public.refresh_seo_city_data() from public, anon, authenticated;
