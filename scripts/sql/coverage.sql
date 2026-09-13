-- Corpus coverage stats for the public /data/ page and the landing stat strip.
--
-- Run via scripts/fetch-coverage.sh (ssh + psql on Contabo). Read-only.
--
-- Two rules this query exists to enforce, because getting either wrong overstates
-- the corpus on a public page:
--
--   1. "Last scrape" is the most recent day whose row count clears SUBSTANTIAL_ROWS.
--      max(scraped_at) is the wrong answer: the daily tracked pass writes a few
--      hundred rows for ~15 keywords, so a tracked-only day looks like a full
--      corpus refresh and would claim a freshness the scrape did not deliver.
--   2. Products are count(distinct item_id), never count(*). A product recurs once
--      per (shop, keyword, scrape day), so row counts are ~4x product counts.
--
-- Never filter with date(scraped_at) = X — not sargable against idx_listings_scraped
-- and it full-scans ~4.4M rows.

\set SUBSTANTIAL_ROWS 10000

with bounds as (
  select min(scraped_at)::date as first_scrape,
         max(scraped_at)::date as last_row_day
  from listings
),
recent_days as (
  select scraped_at::date as d, count(*) as n
  from listings
  where scraped_at >= now() - interval '45 days'
  group by 1
),
substantial as (
  select max(d) as last_full_day,
         (select n from recent_days r2 where r2.d = max(r1.d)) as last_full_rows
  from recent_days r1
  where n >= :SUBSTANTIAL_ROWS
),
totals as (
  select count(*)::bigint            as listing_rows,
         count(distinct item_id)::bigint as products,
         count(distinct shop_id)::bigint as shops,
         count(distinct keyword)::bigint as keywords_seen
  from listings
),
cats as (
  select count(distinct category)::int as categories
  from listings
  where category is not null and category <> ''
),
regions as (
  select count(distinct location)::int as locations
  from listings
  where location is not null and location <> ''
),
hist as (select * from product_history_coverage()),
health as (select * from v_scrape_health),
detail as (
  select count(*)::bigint as detail_ok
  from product_details
  where fetch_status = 'ok'
),
corpus as (
  select count(*)::bigint as corpus_total,
         count(*) filter (where active)::bigint as corpus_active
  from scrape_keywords
),
per_category as (
  select json_agg(x order by x.products desc) as j
  from (
    select category,
           count(distinct item_id)::bigint as products,
           count(distinct shop_id)::bigint as shops
    from listings
    where category is not null and category <> ''
    group by category
    order by count(distinct item_id) desc
    limit 12
  ) x
)
select jsonb_pretty(jsonb_build_object(
  'generated_at',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
  'snapshot',              (select last_full_day from substantial),
  'snapshot_rows',         (select last_full_rows from substantial),
  'last_row_day',          (select last_row_day from bounds),
  'first_scrape',          (select first_scrape from bounds),
  'listing_rows',          (select listing_rows from totals),
  'products',              (select products from totals),
  'shops',                 (select shops from totals),
  'keywords_seen',         (select keywords_seen from totals),
  'categories',            (select categories from cats),
  'locations',             (select locations from regions),
  'corpus_total',          (select corpus_total from corpus),
  'corpus_active',         (select corpus_active from corpus),
  'products_with_history', (select with_history from hist),
  'products_with_measured',(select with_measured from hist),
  'products_with_omset',   (select with_omset from hist),
  'detail_ok',             (select detail_ok from detail),
  'sla_days',              7,
  'scraped_7d',            (select scraped_7d from health),
  'oldest_age_days',       (select oldest_age_days from health),
  'days_to_full_coverage', (select days_to_full_coverage from health),
  'never_scraped',         (select never_scraped from health),
  'per_category',          (select j from per_category)
));
