-- Headline stats per qualifying keyword, for /riset/ page generation.
--
-- This is the query preserved in docs/seo.md, committed as a real file so a
-- refresh no longer depends on copying SQL out of a markdown doc.
--
-- Filter matches the batch already published: >=100 distinct items, >=3-word
-- keyword, category present. (The original est_sold > 200000 gate was dropped in
-- the July 2026 expansion.) Rating is review-weighted, which is why it lands
-- around 4.x and not a flat unweighted mean.
--
-- Returns every qualifying keyword; the caller filters out already-published ones
-- and caps the batch. Publishing all of them at once is a spam signal.

with latest as (
  select distinct on (item_id)
    item_id, keyword, category, price, est_sold, rating, reviews
  from listings
  where price > 0
    and price < 1e8
    and keyword is not null
    and category is not null
    and category <> ''
  order by item_id, scraped_at desc
)
select json_agg(row_to_json(a))
from (
  select
    keyword,
    mode() within group (order by category) as category,
    count(*)::int as n,
    round(avg(price))::bigint as "avgPrice",
    round(percentile_cont(0.5) within group (order by price))::bigint as "medPrice",
    min(price)::bigint as "minPrice",
    round(percentile_cont(0.9) within group (order by price))::bigint as "p90Price",
    sum(est_sold)::bigint as "estSold",
    sum(reviews)::bigint as reviews,
    round((
      sum(rating * reviews) filter (where reviews > 0 and rating > 0)
      / nullif(sum(reviews) filter (where reviews > 0 and rating > 0), 0)
    )::numeric, 2)::float as rating
  from latest
  where array_length(regexp_split_to_array(btrim(keyword), '\s+'), 1) >= 3
  group by keyword
  having count(*) >= 100
  order by sum(est_sold) desc
) a;
