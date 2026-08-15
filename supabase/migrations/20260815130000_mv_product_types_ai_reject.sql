-- Demote kw_ai_reject rows out of the cover slot and the 5-image gallery.
-- Membership, price_min/median/max, and Deep Dive peers stay unchanged.

set statement_timeout to '3600s';
set max_parallel_workers_per_gather to 0;

begin;

drop view if exists public.product_types_v;
drop materialized view if exists public.mv_product_types;

create materialized view public.mv_product_types as
with city_map(city, loc) as (
  values
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
),
base as (
  select item_id, shop_id, product_name, store_name, price, total_sold, reviews,
         rating, category, btrim(keyword) as keyword, location, image_url, url,
         listing_date, kw_hits
  from public.listings_deduped
  where keyword is not null and btrim(keyword) <> ''
    and total_sold > 0
    and price between 500 and 50000000
    and not is_offtopic
),
expanded as (
  select b.*, 'ALL'::text as city from base b
  union all
  select b.*, cm.city
  from base b
  join city_map cm on lower(b.location) = lower(cm.loc)
),
rated as (
  select e.*,
         case when e.listing_date is null then 0::numeric
              else least(
                e.total_sold::numeric
                  / greatest(1.0, extract(epoch from (now() - e.listing_date)) / 86400.0),
                500.0)
         end as spd
  from expanded e
),
seller as (
  select keyword, city, shop_id,
         sum(coalesce(price, 0) * spd * 30) as omset_mo,
         sum(total_sold)                    as sold
  from rated
  group by keyword, city, shop_id
),
seller_ranked as (
  select s.*,
         row_number() over (partition by keyword, city order by s.omset_mo desc) as rn_omset,
         row_number() over (partition by keyword, city order by s.sold desc)     as rn_sold
  from seller s
),
seller_agg as (
  select keyword, city,
         round(sum(omset_mo) filter (where rn_omset <= 15))::bigint as omset_top15,
         sum(sold) filter (where rn_sold <= 3)                      as sold_top3,
         sum(sold)                                                  as sold_all
  from seller_ranked
  group by keyword, city
),
rel as (
  select keyword, city,
         avg((kw_hits > 0)::int::numeric) as rel_share
  from expanded
  group by keyword, city
),
ranked as (
  select r.*,
         rel.rel_share,
         coalesce(ai.rejected, false) as ai_rejected,
         row_number() over (
           partition by r.keyword, r.city
           order by (case when coalesce(ai.rejected, false) then 1 else 0 end),
                    (case when rel.rel_share >= 0.15 and r.kw_hits = 0 then 1 else 0 end),
                    r.total_sold desc nulls last) as rn
  from rated r
  join rel using (keyword, city)
  left join public.kw_ai_reject ai
    on ai.keyword = r.keyword
   and ai.item_id = r.item_id
   and ai.shop_id = r.shop_id
   and ai.rejected
),
agg as (
  select keyword, city,
         mode() within group (order by category)                       as category,
         count(*)::int                                                 as n_listings,
         count(distinct shop_id)::int                                  as n_sellers,
         round(min(price))::bigint                                     as price_min,
         round((percentile_cont(0.5) within group (order by price))::numeric)::bigint as price_median,
         round(max(price))::bigint                                     as price_max,
         round(avg(total_sold))::bigint                                as avg_sold,
         sum(total_sold)::bigint                                       as total_sold_sum
  from ranked
  group by keyword, city
),
imgs as (
  select keyword, city,
         (array_agg(image_url
            order by (case when ai_rejected then 1 else 0 end),
                     (case when rel_share >= 0.15 and kw_hits = 0 then 1 else 0 end),
                     total_sold desc nulls last)
            filter (where image_url is not null and image_url <> ''
                    and not ai_rejected))[1:5] as images
  from ranked
  group by keyword, city
),
rep as (
  select keyword, city,
         item_id      as rep_item_id,      shop_id     as rep_shop_id,
         product_name as rep_product_name, store_name  as rep_store_name,
         price        as rep_price,        total_sold  as rep_total_sold,
         reviews      as rep_reviews,      rating      as rep_rating,
         location     as rep_location,     image_url   as rep_image_url,
         url          as rep_url,          listing_date as rep_listing_date
  from ranked
  where rn = 1
),
trend as (
  select keyword, sum(delta_30d)::bigint as trend_delta_30d, count(*)::int as trend_items
  from public.mv_trending
  group by keyword
)
select a.keyword, a.city, a.category, a.n_listings, a.n_sellers,
       a.price_min, a.price_median, a.price_max, a.avg_sold, a.total_sold_sum,
       sa.omset_top15,
       case when coalesce(sa.sold_all, 0) > 0
            then round(sa.sold_top3::numeric / sa.sold_all, 3) end as sold_top3_share,
       i.images,
       r.rep_item_id, r.rep_shop_id, r.rep_product_name, r.rep_store_name,
       r.rep_price, r.rep_total_sold, r.rep_reviews, r.rep_rating,
       r.rep_location, r.rep_image_url, r.rep_url, r.rep_listing_date,
       t.trend_delta_30d, t.trend_items,
       nb.breakout_rate, nb.new_items as niche_new_items,
       nb.median_winner_price, nb.median_winner_reviews,
       now() as refreshed_at
from agg a
join imgs i using (keyword, city)
join rep  r using (keyword, city)
left join seller_agg sa using (keyword, city)
left join trend t on t.keyword = a.keyword
left join public.mv_niche_breakout nb on nb.keyword = a.keyword;

create unique index mv_product_types_kw_city_idx on public.mv_product_types (keyword, city);
create index mv_product_types_city_cat_idx
  on public.mv_product_types (city, category, omset_top15 desc nulls last);

grant select on public.mv_product_types to anon, authenticated;

create view public.product_types_v as
select
  pt.*,
  coalesce(ks.canonical, 'Lainnya') as category_canonical,
  coalesce(ks.subgroup,  'Lainnya') as subgroup,
  kw.wk_units,
  kw.wk_base,
  kw.wk_items,
  kw.wk_span_days,
  kw.wk_anchor_at
from public.mv_product_types pt
left join public.keyword_subgroup ks on ks.keyword = pt.keyword
left join public.mv_keyword_weekly kw on kw.keyword = pt.keyword;

grant select on public.product_types_v to anon, authenticated;

commit;

analyze public.mv_product_types;

notify pgrst, 'reload schema';
