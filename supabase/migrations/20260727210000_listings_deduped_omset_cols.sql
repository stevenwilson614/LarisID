-- Expand listings_deduped so Discover / Product DB / MLS can read one row per
-- (item_id, shop_id) without falling back to raw listings (post-dedupe hygiene).
-- Recreating drops indexes — recreate every index the anon path needs.

set statement_timeout to '900s';

drop materialized view if exists public.listings_deduped cascade;

create materialized view public.listings_deduped as
select distinct on (item_id, shop_id)
       item_id, shop_id, product_name, store_name, price, original_price, total_sold,
       category, image_url, url, scraped_at, keyword, location, rating,
       reviews, listing_date,
       est_sold, sold_tier, est_omset_monthly, omset_confidence,
       in_stock, search_rank, is_ad, wishlist
from public.listings
order by item_id, shop_id, scraped_at desc;

create index listings_deduped_total_sold_idx
  on public.listings_deduped using btree (total_sold desc);
create index listings_deduped_category_idx
  on public.listings_deduped using btree (category);
create index listings_deduped_location_idx
  on public.listings_deduped using btree (location);
create index listings_deduped_keyword_idx
  on public.listings_deduped using btree (keyword);
create index listings_deduped_pname_trgm_idx
  on public.listings_deduped using gin (product_name gin_trgm_ops);
create index listings_deduped_keyword_trgm_idx
  on public.listings_deduped using gin (keyword gin_trgm_ops);

grant select on public.listings_deduped to anon, authenticated;

comment on materialized view public.listings_deduped is
  'Latest listing row per (item_id, shop_id). Prefer over raw listings for '
  'current product cards / top-N. Keep raw listings for time-series panels.';
