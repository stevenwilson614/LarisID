-- Redesign of /gpt/ (LARISgpt B): the new "Produk Trending" answer card needs real
-- week-over-week sold deltas, and the rebuilt deep dive needs shop age.
--
-- 1) listings_deduped gains listing_date (shop-age proxy = oldest listing_date per
--    shop). Recreating a matview drops its indexes — every index below must be
--    re-created or anon ilike searches regress to statement-timeout 57014.
-- 2) mv_trending: per-item sold deltas computed straight from listings scrape
--    history. listing_deltas is NOT used — its pipeline stalled 2026-06-10 while
--    listings run to Jul 7. All windows anchor to max(scraped_at), not now():
--    the scraper can go stale and "minggu ini" must mean the last scraped week
--    (the UI shows anchor_at as the honest "Update:" date).

set statement_timeout to '600s';

-- ── 1. listings_deduped + listing_date ──────────────────────────────────────
drop materialized view if exists public.listings_deduped;

create materialized view public.listings_deduped as
select distinct on (item_id, shop_id)
       item_id, shop_id, product_name, store_name, price, total_sold,
       category, image_url, url, scraped_at, keyword, location, rating,
       reviews, listing_date
from public.listings
order by item_id, shop_id, scraped_at desc;

create index listings_deduped_total_sold_idx on public.listings_deduped using btree (total_sold desc);
create index listings_deduped_category_idx   on public.listings_deduped using btree (category);
create index listings_deduped_location_idx   on public.listings_deduped using btree (location);
create index listings_deduped_pname_trgm_idx on public.listings_deduped using gin (product_name gin_trgm_ops);
create index listings_deduped_keyword_trgm_idx on public.listings_deduped using gin (keyword gin_trgm_ops);

grant select on public.listings_deduped to anon, authenticated;

-- ── 2. mv_trending ──────────────────────────────────────────────────────────
drop materialized view if exists public.mv_trending;

create materialized view public.mv_trending as
with anchor as (
  select max(scraped_at) as t0 from public.listings
),
snap as (
  -- Per item: latest total_sold plus total_sold as of t0-7d / -14d / -28d.
  -- max() FILTER is valid because total_sold is monotonic per item.
  select l.item_id, l.shop_id,
         (array_agg(l.total_sold order by l.scraped_at desc))[1] as s0,
         max(l.scraped_at) as last_at,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '7 days')  as s7,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '14 days') as s14,
         max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '28 days') as s28
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '45 days'
    and l.price between 1000 and 50000000
  group by l.item_id, l.shop_id
  having max(l.total_sold) filter (where l.scraped_at <= a.t0 - interval '7 days') is not null
),
latest as (
  select distinct on (item_id, shop_id)
         item_id, shop_id, store_name, product_name, category, keyword,
         price, total_sold, reviews, rating, location, image_url, url,
         listing_date
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '10 days'
  order by item_id, shop_id, scraped_at desc
)
select l.*,
       s.s0 - s.s7                          as delta_7d,
       s.s7 - s.s14                         as delta_prev_7d,
       s.s0 - s.s14                         as delta_14d,
       s.s14 - s.s28                        as delta_prev_14d,
       s.s0 - coalesce(s.s28, s.s14, s.s7)  as delta_30d,
       (select t0 from anchor)              as anchor_at,
       now()                                as refreshed_at
from latest l
join snap s using (item_id, shop_id)
where s.s0 - s.s7 > 0
order by (s.s0 - s.s7) desc
limit 500;

create unique index mv_trending_item_idx on public.mv_trending (item_id, shop_id);
create index mv_trending_cat_idx on public.mv_trending (category);

grant select on public.mv_trending to anon, authenticated;

-- ── 3. fold into the shared ~daily post-scrape refresher ────────────────────
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
end; $function$;
