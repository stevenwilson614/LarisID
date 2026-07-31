-- ============================================================================
-- Fix: get_product_catalog() times out for every Site A visitor.
--
-- The old body ran `distinct on (keyword) ... from listings where
-- date(scraped_at) = get_latest_panel_date()` against a 1.06M-row / 3.6GB
-- table. `date(scraped_at)` is not sargable against idx_listings_scraped, so
-- it sorted the whole panel day. The function self-caps at statement_timeout
-- 30s and did not finish in 120s on the Contabo box; the client aborts it at
-- 3s (js/laris-app.js loadData), so it effectively NEVER succeeded. Every
-- uncached visitor fell through to the 5x1000-row listings_deduped fallback,
-- which itself returned 500s (57014). 42 such timeouts in 48h, all from
-- https://larisid.com/ (arm A), zero from /gpt/.
--
-- Fix: precompute the one-row-per-keyword catalog into a matview refreshed by
-- the existing refresh_breakout_matviews() hook, and make the RPC a plain
-- indexed read of ~1.5k rows.
-- ============================================================================

-- ── 1. The catalog matview (one row per keyword, current panel date) ────────
-- NOTE the predicate: a half-open range on scraped_at, NOT
-- `date(scraped_at) = get_latest_panel_date()`. The two select the same rows
-- (both resolve the date in the session timezone), but only the range form is
-- sargable against idx_listings_scraped. With date() the build scans all 1.06M
-- rows and was still running after 12 minutes; the range form touches the
-- ~107k rows of the panel day and finishes in seconds. This matters twice
-- over now that the refresh runs inside refresh_breakout_matviews() after
-- every scrape.
drop materialized view if exists public.mv_product_catalog cascade;

create materialized view public.mv_product_catalog as
  select distinct on (keyword)
    keyword,
    product_name,
    price,
    total_sold,
    image_url,
    category,
    rating,
    reviews,
    item_id,
    shop_id
  from public.listings
  where keyword is not null
    and product_name is not null
    and scraped_at >= public.get_latest_panel_date()::timestamptz
    and scraped_at <  (public.get_latest_panel_date() + 1)::timestamptz
  order by keyword, total_sold desc nulls last;

-- Unique index on the distinct key: required for REFRESH ... CONCURRENTLY and
-- makes the RPC's ordered read an index scan.
create unique index if not exists mv_product_catalog_keyword_uidx
  on public.mv_product_catalog (keyword);

-- ── 2. RPC now reads the matview ───────────────────────────────────────────
-- Signature and column order are unchanged, so js/laris-app.js needs no shape
-- change. Timeout kept as a guard but should never be approached now.
create or replace function public.get_product_catalog()
returns table (
  keyword text,
  product_name text,
  price numeric,
  total_sold bigint,
  image_url text,
  category text,
  rating numeric,
  reviews integer,
  item_id bigint,
  shop_id bigint
)
language sql
stable
security definer
set search_path to 'public'
set statement_timeout to '30s'
as $$
  select keyword, product_name, price, total_sold,
         image_url, category, rating, reviews, item_id, shop_id
  from public.mv_product_catalog
  order by keyword;
$$;

-- ── 3. Fold the refresh into the existing scrape hook ──────────────────────
-- mv_product_catalog depends on get_latest_panel_date(), so it must refresh
-- after each scrape load alongside the other matviews.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '900s'
as $$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
  refresh materialized view public.mv_product_catalog;
  perform public.rebuild_keyword_subgroups();
end; $$;

-- ── 4. Grants ──────────────────────────────────────────────────────────────
-- get_product_catalog is SECURITY DEFINER so it does not need matview grants,
-- but grant SELECT anyway for parity with the other matviews (and so ad-hoc
-- anon reads behave predictably). Re-grant EXECUTE explicitly: on this
-- self-hosted box CREATE OR REPLACE does not always preserve prior grants.
grant select on public.mv_product_catalog to anon, authenticated;
grant execute on function public.get_product_catalog() to anon, authenticated;
grant execute on function public.refresh_breakout_matviews() to service_role;

-- PostgREST must reload before the replaced function resolves.
notify pgrst, 'reload schema';
