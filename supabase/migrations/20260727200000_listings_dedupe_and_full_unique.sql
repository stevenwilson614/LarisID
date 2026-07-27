-- Data audit 2026-07-27 — see shopee_scraper/docs/OPS.md
--
-- 1) Content-hash dedupe of push-inflated listings (omset COALESCE into survivor)
-- 2) Sentinel search_rank for every remaining NULL (negative = legacy / ad-organic slots)
-- 3) Replace partial unique index with FULL UNIQUE so PostgREST on_conflict works
--    (partial indexes cannot be ON CONFLICT targets — Postgres 42P10)
--
-- Run via SSH/psql with statement_timeout disabled — NOT through PostgREST.
-- Prerequisite: freeze launchd / live push. Snapshot table kept ~7 days.

SET statement_timeout = 0;
SET maintenance_work_mem = '1GB';

-- ── 0. Snapshot (idempotent name; fail if already exists from a half-run) ────
DO $$
BEGIN
  IF to_regclass('public.listings_pre_dedupe_20260727') IS NOT NULL THEN
    RAISE NOTICE 'snapshot listings_pre_dedupe_20260727 already exists — skipping CREATE';
  ELSE
    CREATE TABLE public.listings_pre_dedupe_20260727 AS TABLE public.listings;
  END IF;
END $$;

-- ── 1. Keep-one map + coalesced omset ────────────────────────────────────────
DROP TABLE IF EXISTS public._listings_dedupe_keep;
CREATE TABLE public._listings_dedupe_keep AS
SELECT
  (array_agg(id ORDER BY
      (est_omset_monthly IS NOT NULL) DESC,
      (est_velocity_daily IS NOT NULL) DESC,
      id))[1] AS keep_id,
  MAX(est_omset_monthly) AS est_omset_monthly,
  MAX(est_velocity_daily) AS est_velocity_daily,
  (array_agg(omset_method ORDER BY (omset_method IS NULL), id))[1] AS omset_method,
  (array_agg(omset_confidence ORDER BY (omset_confidence IS NULL), id))[1] AS omset_confidence
FROM public.listings
GROUP BY item_id, shop_id, keyword, scraped_at, price, original_price, total_sold, reviews;

CREATE UNIQUE INDEX _listings_dedupe_keep_pk ON public._listings_dedupe_keep (keep_id);

-- ── 2. COALESCE omset onto survivors ─────────────────────────────────────────
UPDATE public.listings l
SET
  est_omset_monthly  = COALESCE(l.est_omset_monthly,  k.est_omset_monthly),
  est_velocity_daily = COALESCE(l.est_velocity_daily, k.est_velocity_daily),
  omset_method       = COALESCE(l.omset_method,       k.omset_method),
  omset_confidence   = COALESCE(l.omset_confidence,   k.omset_confidence)
FROM public._listings_dedupe_keep k
WHERE l.id = k.keep_id;

-- ── 3. Delete non-survivors ──────────────────────────────────────────────────
DELETE FROM public.listings l
WHERE NOT EXISTS (
  SELECT 1 FROM public._listings_dedupe_keep k WHERE k.keep_id = l.id
);

-- ── 4. Sentinel ranks (negative = legacy; partition slots for ad/organic) ────
-- Scheme: positive ranks reserved for live scrapes (1..N). Historical / unranked
-- rows get -ROW_NUMBER() within (item_id, shop_id, keyword, scraped_at), so
-- ad+organic pairs at different prices stay distinguishable under the full UNIQUE.
UPDATE public.listings l
SET search_rank = s.rnk
FROM (
  SELECT
    id,
    (-ROW_NUMBER() OVER (
      PARTITION BY item_id, shop_id, keyword, scraped_at
      ORDER BY COALESCE(is_ad, 0) DESC, price NULLS LAST, id
    ))::integer AS rnk
  FROM public.listings
  WHERE search_rank IS NULL
) s
WHERE l.id = s.id;

-- ── 5. Full UNIQUE (drop partial that PostgREST cannot target) ───────────────
DROP INDEX IF EXISTS public.listings_scrape_identity_uidx;

CREATE UNIQUE INDEX listings_scrape_identity_uidx
  ON public.listings (item_id, shop_id, keyword, scraped_at, search_rank);

ALTER TABLE public.listings
  ALTER COLUMN search_rank SET NOT NULL;

COMMENT ON INDEX public.listings_scrape_identity_uidx IS
  'Full unique conflict target for PostgREST Prefer/on_conflict. '
  'search_rank is NOT NULL: live scrapes use 1..N; legacy rows use negative sentinels. '
  'Partial WHERE form was dropped — PostgREST cannot emit ON CONFLICT ... WHERE (42P10).';

COMMENT ON COLUMN public.listings.search_rank IS
  '1-based result position for live scrapes. Negative = legacy sentinel '
  '(-1,-2,… within item_id/shop_id/keyword/scraped_at) so ad vs organic slots '
  'remain distinct under listings_scrape_identity_uidx.';

-- ── 6. Cleanup working table ─────────────────────────────────────────────────
DROP TABLE IF EXISTS public._listings_dedupe_keep;

-- ── 7. Verify (raises if off the rails) ──────────────────────────────────────
DO $$
DECLARE
  n bigint;
  null_ranks bigint;
  multi bigint;
BEGIN
  SELECT count(*) INTO n FROM public.listings;
  SELECT count(*) INTO null_ranks FROM public.listings WHERE search_rank IS NULL;
  SELECT count(*) INTO multi FROM (
    SELECT 1
    FROM public.listings
    GROUP BY item_id, shop_id, keyword, scraped_at, price, original_price, total_sold, reviews
    HAVING count(*) > 1
  ) x;

  RAISE NOTICE 'listings count after dedupe: %', n;
  IF null_ranks <> 0 THEN
    RAISE EXCEPTION 'search_rank still NULL on % rows', null_ranks;
  END IF;
  IF multi <> 0 THEN
    RAISE EXCEPTION 'content-hash duplication still present: % groups', multi;
  END IF;
  IF n < 700000 OR n > 950000 THEN
    RAISE EXCEPTION 'survivor count % outside expected band ~825k–850k', n;
  END IF;
END $$;
