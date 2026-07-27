-- Data audit 2026-07-27 — see shopee_scraper/docs/OPS.md
--
-- Adds the four fields the search pass already receives for free and used to
-- discard, plus in_stock to replace the junk `stock` column.
--
-- search_rank + is_ad are not just enrichment: they are a CORRECTNESS
-- prerequisite. One item can legitimately occupy both an ad slot and an organic
-- slot for the same keyword in the same scrape, at different variant prices:
--
--   item 40606772282 / "reel pancing spinning" / 2026-07-24T11:26:07
--     price=47200   orig=70562
--     price=106330  orig=244750
--
-- so (item_id, keyword, scraped_at) is NOT a valid unique key. Without rank
-- there is no column that tells those two rows apart, which is why the
-- de-duplication work (next migration) must land AFTER this one.
--
-- `stock` is left in place for now so the frontend keeps working; it is junk
-- (0/1 only, and hardcoded to 0 on the modern BFF path) and is retired in the
-- frontend pass.

set statement_timeout to '600s';

alter table public.listings
  add column if not exists search_rank integer,
  add column if not exists is_ad       smallint default 0,
  add column if not exists sold_text   text     default '',
  add column if not exists shop_tier   text     default '',
  add column if not exists in_stock    boolean;

comment on column public.listings.search_rank is
  '1-based position of the item within the keyword''s result set for this scrape. '
  'Dense 1..N. NULL for rows scraped before 2026-07-27.';
comment on column public.listings.is_ad is
  '1 = paid placement (adsid/is_ads present). With search_rank this separates the '
  'ad slot from the organic slot for the same item.';
comment on column public.listings.sold_text is
  'Verbatim Shopee sold string, e.g. "10rb+ terjual". Above 1k Shopee only publishes '
  'a bucket, so this pins the bucket floor exactly instead of inferring it.';
comment on column public.listings.shop_tier is
  'official | preferred_plus | preferred | normal | '''' (unknown).';
comment on column public.listings.in_stock is
  'Availability, NOT a quantity — Shopee hides real inventory (is_hide_stock). '
  'NULL = unknown. Replaces the junk `stock` column.';

-- Rank lookups are always scoped to a keyword within one scrape.
create index if not exists listings_keyword_scraped_rank_idx
  on public.listings (keyword, scraped_at, search_rank)
  where search_rank is not null;
