-- Corpus coverage stats for the public /data/ page and the landing stat strip.
--
-- Run via scripts/fetch-coverage.sh (ssh + psql on Contabo). Read-only.
--
-- Two rules this query exists to enforce, because getting either wrong overstates
-- the corpus on a public page:
--
--   1. Snapshot freshness must survive the drip catalog pass (~hundreds–a few
--      thousand listing rows/day across many keywords). A single-day ≥10k gate
--      and bare max(scraped_at) are both wrong: the former blocked Monday SEO
--      for weeks while the corpus stayed current; the latter would let a tiny
--      tracked-only day claim a full refresh.
--
--      Snapshot is the later of:
--        a) last day closing a rolling 7-day window with ≥ SUBSTANTIAL_ROWS, OR
--        b) last_row_day when corpus health is fresh
--           (never_scraped = 0, oldest_age_days ≤ 10, scraped_7d ≥ 85% of active).
--      (b) is the insurance for a slow drip week that still rotated the keyword
--      corpus. A truly stalled scrape fails both and keeps the old snapshot so
--      ci-static-checks refuse to publish.
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
rolling as (
  select d, n,
         sum(n) over (order by d rows between 6 preceding and current row) as rows_7d
  from recent_days
),
substantial as (
  select max(d) as last_full_day,
         (select rows_7d from rolling r2 where r2.d = max(r1.d)) as last_full_rows
  from rolling r1
  where rows_7d >= :SUBSTANTIAL_ROWS
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
),
-- Health backup: keyword rotation is current even if listing-row volume dipped.
health_fresh as (
  select
    (select never_scraped from health) = 0
    and (select oldest_age_days from health) <= 10
    and (select corpus_active from corpus) > 0
    and (select scraped_7d from health)::float
        / (select corpus_active from corpus) >= 0.85
    as ok
),
snap as (
  select
    case
      when (select ok from health_fresh)
        then greatest(
          coalesce((select last_full_day from substantial), date '1970-01-01'),
          (select last_row_day from bounds)
        )
      else (select last_full_day from substantial)
    end as snapshot_day,
    case
      when (select ok from health_fresh)
        and (select last_row_day from bounds)
            >= coalesce((select last_full_day from substantial), date '1970-01-01')
        then coalesce(
          (select rows_7d from rolling r where r.d = (select last_row_day from bounds)),
          (select last_full_rows from substantial),
          0
        )
      else (select last_full_rows from substantial)
    end as snapshot_rows,
    case
      when (select ok from health_fresh)
        and (select last_row_day from bounds)
            > coalesce((select last_full_day from substantial), date '1970-01-01')
        then 'health'
      when (select last_full_day from substantial) is not null
        then 'rolling_7d'
      else 'stale'
    end as snapshot_source
)
select jsonb_pretty(jsonb_build_object(
  'generated_at',          to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
  'snapshot',              (select snapshot_day from snap),
  'snapshot_rows',         (select snapshot_rows from snap),
  'snapshot_source',       (select snapshot_source from snap),
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
