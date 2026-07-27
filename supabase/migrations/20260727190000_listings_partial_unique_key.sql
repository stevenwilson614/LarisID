-- Data audit 2026-07-27 — see shopee_scraper/docs/OPS.md §2
--
-- Seals the insert path. Until now `listings` had NO unique constraint, so the
-- `Prefer: resolution=ignore-duplicates` header sent by database.py was a no-op
-- and every push INSERTed fresh rows. Three separate paths push the same rows
-- (save_listings' live push, start_day5_host.sh --push, push_today.py), which
-- produced ~2-3x duplication in the live table.
--
-- SUPERSEDED 2026-07-27 by 20260727200000_listings_dedupe_and_full_unique.sql.
-- Partial unique indexes cannot be PostgREST ON CONFLICT targets (42P10).
-- Kept for migration history; live DB now has a FULL unique index + NOT NULL
-- search_rank (negative sentinels for legacy rows).
--
-- WHY PARTIAL (original rationale, no longer used): rows scraped before
-- 2026-07-27 had search_rank IS NULL, and Postgres treats NULLs as distinct.
--
-- WHY search_rank IS IN THE KEY: one item can legitimately occupy both an ad
-- slot and an organic slot for the same keyword in the same scrape, at
-- different variant prices. (item_id, shop_id, keyword, scraped_at) alone would
-- collapse those two real rows into one.
--
-- WHY shop_id: identity in this stack is (item_id, shop_id) — listings_deduped
-- already keys on that pair.
--
-- Historical duplicates are NOT touched here. They are removed by the dedupe
-- migration that follows, which must run after this one so the table cannot
-- re-inflate while it is being cleaned.

set statement_timeout to '900s';

create unique index if not exists listings_scrape_identity_uidx
  on public.listings (item_id, shop_id, keyword, scraped_at, search_rank)
  where search_rank is not null;

comment on index public.listings_scrape_identity_uidx is
  'Conflict target for PostgREST upserts. Partial: only rows carrying a '
  'search_rank (2026-07-27 onward) are constrained, because NULL ranks on '
  'historical rows are mutually distinct and would defeat a plain index.';
