-- ============================================================================
-- Indexes for store tracking.
--
-- RUN THIS SEPARATELY — CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, so this file must NOT be wrapped in begin/commit and must
-- not be bundled with the migration that precedes it.
--
-- WHY CONCURRENTLY: `listings` is ~1.06M rows / 3.6 GB on a 4-core, 8 GB box,
-- and the scraper pushes into it. A plain CREATE INDEX takes an ACCESS
-- EXCLUSIVE lock and would block the morning push for the whole build.
-- CONCURRENTLY is slower but leaves writes running. Expect several minutes.
--
-- WHY AT ALL: every existing index containing shop_id has item_id as its
-- LEADING column --
--     listings_scrape_identity_uidx  (item_id, shop_id, keyword, scraped_at, search_rank)
--     idx_listings_dedup             (item_id, shop_id, scraped_at DESC)
--     idx_listings_latest_composite  (item_id, shop_id, scraped_at DESC)
-- -- so a `WHERE shop_id = ?` lookup can use none of them and degrades to a
-- sequential scan over the whole table on every store-tracker page load.
-- listing_deltas has the same shape: idx_ld_item is (item_id, shop_id).
--
-- Run with psql directly, NOT through PostgREST:
--   ssh -i ~/.ssh/larisid_hetzner root@84.247.147.205
--   docker exec -i supabase-db psql -U postgres -f -
--
-- If a build is interrupted it leaves an INVALID index behind. Check with:
--   select indexrelid::regclass from pg_index where not indisvalid;
-- and DROP it before re-running.
-- ============================================================================

create index concurrently if not exists idx_listings_shop_scraped
  on public.listings (shop_id, scraped_at desc);

create index concurrently if not exists idx_ld_shop_scraped
  on public.listing_deltas (shop_id, scraped_at desc);

-- Sanity check after both complete (expect zero rows):
--   select indexrelid::regclass from pg_index where not indisvalid;
