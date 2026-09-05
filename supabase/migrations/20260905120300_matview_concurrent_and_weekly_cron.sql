-- Unique indexes required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
-- Concurrent refresh cannot run inside a function transaction, so callers that
-- can COMMIT (scraper post-push, pg_cron CALL) should use
-- refresh_breakout_matviews_concurrent(). The existing function stays
-- non-concurrent for ad-hoc SELECT compatibility.

create unique index if not exists listings_deduped_pk
  on public.listings_deduped (item_id, shop_id, keyword);
create unique index if not exists mv_niche_breakout_pk
  on public.mv_niche_breakout (keyword);
create unique index if not exists mv_region_category_pk
  on public.mv_region_category (location, category);
create unique index if not exists mv_supplier_leaderboard_pk
  on public.mv_supplier_leaderboard (keyword, shop_id);
create unique index if not exists mv_naik_daun_pk
  on public.mv_naik_daun (item_id, shop_id);
create unique index if not exists mv_trending_pk
  on public.mv_trending (item_id, shop_id);

create or replace procedure public.refresh_breakout_matviews_concurrent()
language plpgsql
security definer
set search_path = public
set statement_timeout = '3600s'
as $$
begin
  refresh materialized view concurrently public.listings_deduped;
  commit;
  refresh materialized view concurrently public.mv_niche_breakout;
  commit;
  refresh materialized view concurrently public.mv_region_category;
  commit;
  refresh materialized view concurrently public.mv_supplier_leaderboard;
  commit;
  refresh materialized view concurrently public.mv_naik_daun;
  commit;
  refresh materialized view concurrently public.mv_trending;
  commit;
  refresh materialized view concurrently public.mv_keyword_weekly;
  commit;
  refresh materialized view concurrently public.mv_product_types;
  commit;
  refresh materialized view concurrently public.mv_shops;
  commit;
  refresh materialized view concurrently public.mv_keyword_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_cohort;
  commit;
  refresh materialized view concurrently public.mv_new_seller_market;
  commit;
  refresh materialized view concurrently public.mv_new_shop_items;
  commit;
  refresh materialized view concurrently public.mv_new_shop_traits;
  commit;
  refresh materialized view concurrently public.mv_new_shop_pricemove;
  commit;
  refresh materialized view concurrently public.mv_new_shop_speed;
  commit;
  refresh materialized view concurrently public.mv_competitor_moves;
  commit;
  refresh materialized view concurrently public.mv_seller_locations;
  perform public.rebuild_keyword_subgroups();
end;
$$;

-- Daily listing_weekly refresh so no-scrape days still decay forecasts.
-- Function lives in scraper listing_weekly.sql; skip if not installed yet.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'refresh_listing_weekly'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'refresh-listing-weekly';
    perform cron.schedule(
      'refresh-listing-weekly',
      '15 17 * * *',
      $cron$select public.refresh_listing_weekly(current_date)$cron$
    );
  end if;
end $$;
