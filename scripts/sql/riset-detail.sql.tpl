-- Per-keyword detail for /riset/ leaf pages. __KEYWORDS__ is replaced by the
-- caller (scripts/fetch-riset-batch.mjs) with a quoted array literal of the
-- batch's keywords.
--
-- Output shape must match what build-seo-pages.mjs normalises (see normalizeDetail
-- there): { stores, sampleItems, soldTotal, concentration, top[8], regions[6],
-- buckets[4] }. regions carry raw {loc, sold, count} and buckets are 4 bare counts —
-- the builder derives shares, labels and bucketMax itself. Do not pre-compute those
-- here or the page will render them twice-normalised.
--
-- `distinct on (item_id, keyword)` is deliberate: one item legitimately appears
-- under several keywords, and each /riset/ page is a per-keyword market view.

with kw(keyword) as (
  select unnest(__KEYWORDS__::text[])
),
latest as (
  select distinct on (l.item_id, l.keyword)
    l.item_id, l.keyword, l.shop_id, l.product_name, l.store_name,
    l.price, l.est_sold, l.rating, l.reviews, l.location
  from listings l
  join kw on kw.keyword = l.keyword
  where l.price > 0 and l.price < 1e8
  order by l.item_id, l.keyword, l.scraped_at desc
),
stats as (
  select
    keyword,
    count(distinct shop_id)::int as stores,
    count(distinct item_id)::int as sample_items,
    coalesce(sum(est_sold), 0)::bigint as sold_total,
    percentile_cont(0.5) within group (order by price) as med,
    percentile_cont(0.9) within group (order by price) as p90
  from latest
  group by keyword
),
ranked as (
  select *, row_number() over (partition by keyword order by reviews desc nulls last, est_sold desc nulls last) as rn
  from latest
),
top8 as (
  select
    keyword,
    json_agg(json_build_object(
      'name', product_name,
      'store', store_name,
      'price', round(price)::bigint,
      'rating', rating,
      'reviews', reviews,
      'location', location
    ) order by rn) as t,
    coalesce(sum(est_sold), 0)::bigint as top_sold
  from ranked
  where rn <= 8
  group by keyword
),
region_rank as (
  select
    keyword, location as loc,
    coalesce(sum(est_sold), 0)::bigint as sold,
    count(*)::int as cnt,
    row_number() over (partition by keyword order by coalesce(sum(est_sold), 0) desc, count(*) desc) as rn
  from latest
  where location is not null and location <> ''
  group by keyword, location
),
regions as (
  select keyword, json_agg(json_build_object('loc', loc, 'sold', sold, 'count', cnt) order by rn) as r
  from region_rank
  where rn <= 6
  group by keyword
),
buckets as (
  select
    l.keyword,
    json_build_array(
      count(*) filter (where l.price < s.med * 0.5),
      count(*) filter (where l.price >= s.med * 0.5 and l.price < s.med),
      count(*) filter (where l.price >= s.med and l.price < s.p90),
      count(*) filter (where l.price >= s.p90)
    ) as b
  from latest l
  join stats s on s.keyword = l.keyword
  group by l.keyword
)
select json_object_agg(s.keyword, json_build_object(
  'stores',        s.stores,
  'sampleItems',   s.sample_items,
  'soldTotal',     s.sold_total,
  'concentration', case when s.sold_total > 0
                        then round((t.top_sold::numeric / s.sold_total), 4)::float
                        else 0 end,
  'top',           coalesce(t.t, '[]'::json),
  'regions',       coalesce(r.r, '[]'::json),
  'buckets',       b.b
))
from stats s
left join top8 t on t.keyword = s.keyword
left join regions r on r.keyword = s.keyword
left join buckets b on b.keyword = s.keyword;
