-- merge_ext_ingest() — promote staged extension rows into public.listings.
--
-- Deliberately conservative. Two gates, both about not letting a browser
-- extension author rows in a 4.4M-row production table:
--
--   1. The (item_id, shop_id) pair must ALREADY exist in listings. Discovery of
--      brand-new products stays in staging for review. The extension's value is
--      fresher readings on known products, not catalogue expansion, and an
--      unvetted new pair is the cheapest thing for an attacker to inject.
--   2. sold_tier = 0 (an exact counter) or a non-empty sold_text (a real
--      display bucket). A row with neither has no usable demand signal.
--
-- EVERY CANDIDATE IS RESOLVED IN ONE PASS. listings is per-keyword, so the
-- grain is (item_id, shop_id, keyword) and only the freshest reading in each
-- group is promoted. The losers must be marked in the same run: an earlier
-- draft marked merged_at on the winner only, left its duplicates unmerged, and
-- re-promoted them one per run forever — which put two rows in listings for one
-- product-keyword. Losers now get reject_reason='superseded' immediately.
--
-- est_sold / est_omset_monthly / omset_* / est_velocity_daily are left NULL on
-- purpose: refresh_omset_estimates and product_velocity own those columns and
-- would otherwise be fighting a client for them.
--
-- Call from run_full_scrape.sh AFTER the scraper's own push, so the matview
-- refresh that follows picks up both collectors in one pass. Not on its own
-- cron: a merge that lands between a scrape and its refresh is invisible for a
-- cycle, and a merge that lands mid-refresh is worse.

begin;
set local statement_timeout to '600s';

drop function if exists public.merge_ext_ingest(integer);
create function public.merge_ext_ingest(p_max integer default 20000)
returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare
  v_cand       int := 0;
  v_promoted   int := 0;
  v_merged     int := 0;
  v_superseded int := 0;
  v_aged       int := 0;
begin
  -- Everything eligible this run: unmerged, pair already known, real sold
  -- signal. No de-duplication yet — the losers have to be reachable below.
  create temporary table _ext_cand on commit drop as
  select i.id, i.item_id, i.shop_id, coalesce(btrim(i.keyword), '') as kw, i.scraped_at
    from public.ext_listing_ingest i
   where i.merged_at is null
     and i.reject_reason is null
     and (i.sold_tier = 0 or coalesce(i.sold_text, '') <> '')
     and exists (select 1 from public.listings l
                  where l.item_id = i.item_id and l.shop_id = i.shop_id)
   order by i.received_at
   limit p_max;

  select count(*)::int into v_cand from _ext_cand;

  -- One winner per (item, shop, keyword): the freshest reading.
  create temporary table _ext_win on commit drop as
  select distinct on (item_id, shop_id, kw) id
    from _ext_cand
   order by item_id, shop_id, kw, scraped_at desc, id desc;

  select count(*)::int into v_promoted from _ext_win;

  insert into public.listings (
    keyword, category, scraped_at, item_id, shop_id, product_name, store_name,
    price, original_price, total_sold, rating, reviews, location, image_url,
    listing_date, stock, wishlist, sold_tier, sold_text, shop_tier,
    search_rank, is_ad, in_stock, url, source)
  select coalesce(i.keyword, ''),
         coalesce(i.category, ''),
         i.scraped_at,
         i.item_id, i.shop_id, i.product_name, i.store_name,
         i.price::real, i.original_price::real, i.total_sold, i.rating::real,
         i.reviews, i.location, i.image_url, i.listing_date, i.stock, i.wishlist,
         i.sold_tier, coalesce(i.sold_text, ''), coalesce(i.shop_tier, ''),
         coalesce(i.search_rank, -200), i.is_ad, i.in_stock, i.url, 'ext'
    from public.ext_listing_ingest i
    join _ext_win w on w.id = i.id
  -- Infers listings_scrape_identity_uidx, which is a bare unique INDEX and not
  -- a named constraint, so `on conflict on constraint` cannot reach it. Two
  -- tabs on the same results page in the same second collide here; that is a
  -- duplicate, not an error.
  on conflict (item_id, shop_id, keyword, scraped_at, search_rank) do nothing;

  get diagnostics v_merged = row_count;

  update public.ext_listing_ingest u
     set merged_at = now()
   where u.id in (select id from _ext_win);

  update public.ext_listing_ingest u
     set reject_reason = 'superseded'
   where u.id in (select c.id from _ext_cand c
                   where c.id not in (select id from _ext_win));

  get diagnostics v_superseded = row_count;

  -- Rows that never became promotable. Given a week for a pair to show up in a
  -- scrape before the reason is recorded, which keeps the unmerged partial
  -- index small instead of re-examining the same rows forever.
  update public.ext_listing_ingest u
     set reject_reason = case
           when u.sold_tier <> 0 and coalesce(u.sold_text, '') = '' then 'no_sold_signal'
           when not exists (select 1 from public.listings l
                             where l.item_id = u.item_id and l.shop_id = u.shop_id)
             then 'unknown_pair'
           else 'stale' end
   where u.merged_at is null
     and u.reject_reason is null
     and u.received_at < now() - interval '7 days';

  get diagnostics v_aged = row_count;

  return json_build_object('candidates', v_cand,
                           'promoted',   v_promoted,
                           'merged',     v_merged,
                           'superseded', v_superseded,
                           'aged_out',   v_aged);
end $$;

comment on function public.merge_ext_ingest(integer) is
  'Promotes ext_listing_ingest rows into listings with source=''ext''. Known '
  '(item_id, shop_id) pairs with a real sold signal only, one freshest reading '
  'per (item, shop, keyword). service_role only.';

revoke all on function public.merge_ext_ingest(integer) from public, anon, authenticated;
grant execute on function public.merge_ext_ingest(integer) to service_role;

notify pgrst, 'reload schema';
commit;
