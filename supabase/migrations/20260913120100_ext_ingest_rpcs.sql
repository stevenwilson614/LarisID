-- RPCs for the Chrome extension v3.0. Companion to 20260913120000.
--
-- Three anon-executable functions and one service_role-only merge:
--   ext_ingest_listings()   write  — validates, rate-limits, stages
--   ext_omset_batch()       read   — one round trip per Shopee page
--   ext_estimator_bundle()  read   — the peer model, cached client-side 24h
--   merge_ext_ingest()      admin  — staging -> listings, corroboration-gated
--
-- Every function is created with an explicit `drop` first. A bare
-- `create or replace` can silently change a RETURNS shape while the client
-- keeps reading a column that is no longer there.

begin;
set local statement_timeout to '600s';

-- ── 1. Ingest ───────────────────────────────────────────────────────────────
drop function if exists public.ext_ingest_listings(uuid, text, jsonb, text);
create function public.ext_ingest_listings(
  p_install uuid,
  p_source  text,
  p_rows    jsonb,
  p_version text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_day      date := public._usage_day();
  v_row_cap  int  := 20000;   -- ~330 search pages per install per day
  v_n        int;
  v_withsold int;
  v_acc      int;
  v_inst     public.ext_installs%rowtype;
begin
  if p_install is null or p_source is null or p_source not in ('search', 'pdp') then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  v_n := coalesce(jsonb_array_length(p_rows), 0);
  if v_n = 0 or v_n > 200 then
    return json_build_object('ok', false, 'reason', 'bad_batch_size', 'n', v_n);
  end if;

  insert into public.ext_installs (install_id, day, version)
       values (p_install, v_day, left(p_version, 20))
  on conflict (install_id) do update
    set last_seen_at   = now(),
        day            = v_day,
        version        = coalesce(left(p_version, 20), public.ext_installs.version),
        rows_today     = case when public.ext_installs.day = v_day
                              then public.ext_installs.rows_today else 0 end,
        pages_today    = case when public.ext_installs.day = v_day
                              then public.ext_installs.pages_today else 0 end,
        batches_total  = public.ext_installs.batches_total + 1
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if v_inst.rows_today + v_n > v_row_cap then
    return json_build_object('ok', false, 'reason', 'rate_limited',
                             'rows_today', v_inst.rows_today);
  end if;

  -- sold_audit guard, server side. shopee_scraper/sold_audit.py: logged-in
  -- search pages run 80-95% with sold > 0, guest sessions ~0%, and pushing a
  -- guest page's zeros pollutes every downstream delta. 15% is that module's
  -- documented floor. The client runs the same test first, but a client-side
  -- check is a courtesy, not a control.
  if p_source = 'search' and v_n >= 20 then
    select count(*) into v_withsold
      from jsonb_array_elements(p_rows) e
     where coalesce((e->>'total_sold')::int, 0) > 0;
    if v_withsold::numeric / v_n < 0.15 then
      return json_build_object('ok', false, 'reason', 'sold_audit_fail',
                               'with_sold', v_withsold, 'n', v_n);
    end if;
  end if;

  with src as (
    select
      (e->>'item_id')::bigint                            as item_id,
      (e->>'shop_id')::bigint                            as shop_id,
      left(nullif(btrim(e->>'keyword'), ''), 160)        as keyword,
      left(nullif(btrim(e->>'category'), ''), 120)       as category,
      left(nullif(btrim(e->>'product_name'), ''), 500)   as product_name,
      left(nullif(btrim(e->>'store_name'), ''), 200)     as store_name,
      left(nullif(btrim(e->>'location'), ''), 120)       as location,
      (e->>'price')::numeric                             as price,
      (e->>'original_price')::numeric                    as original_price,
      (e->>'total_sold')::int                            as total_sold,
      left(coalesce(e->>'sold_text', ''), 60)            as sold_text,
      coalesce((e->>'sold_is_exact')::boolean, false)     as sold_is_exact,
      (e->>'reviews')::int                               as reviews,
      (e->>'rating')::numeric                            as rating,
      (e->>'wishlist')::int                              as wishlist,
      (e->>'stock')::int                                 as stock,
      (e->>'in_stock')::boolean                          as in_stock,
      (e->>'search_rank')::int                           as search_rank,
      coalesce((e->>'is_ad')::smallint, 0::smallint)      as is_ad,
      left(coalesce(e->>'shop_tier', ''), 20)            as shop_tier,
      nullif(e->>'listing_date', '')::timestamptz        as listing_date,
      left(nullif(e->>'image_url', ''), 400)             as image_url,
      left(nullif(e->>'url', ''), 600)                   as url,
      nullif(e->>'scraped_at', '')::timestamptz          as scraped_at
      from jsonb_array_elements(p_rows) e
  ), ok as (
    select s.*,
           -- Same rule as shopee_scraper/database.py::_get_sold_tier.
           -- 0 = an exact counter; otherwise the bucket floor; 10000 = capped.
           case when s.total_sold is null or s.total_sold < 1000 then 0
                when s.total_sold >= 10000                        then 10000
                else (s.total_sold / 1000) * 1000 end as sold_tier
      from src s
     where s.item_id > 0
       and s.shop_id > 0
       and s.scraped_at is not null
       and s.price between 0.1 and 100000000              -- Rp 0,1 .. Rp 100 M
       and coalesce(s.total_sold, 0) between 0 and 5000000
       and coalesce(s.rating, 0) between 0 and 5
       and coalesce(s.reviews, 0) between 0 and 10000000
       and s.scraped_at between now() - interval '1 hour'
                            and now() + interval '5 minutes'
       -- Lifetime sold cannot fall. Same invariant mv_listing_momentum asserts
       -- in its `mono` CTE; 0.9 leaves room for Shopee re-bucketing a display
       -- value downward without waving through a real regression.
       and coalesce(s.total_sold, 0) >= coalesce((
             select max(l.total_sold) from public.listings l
              where l.item_id = s.item_id and l.shop_id = s.shop_id), 0) * 0.9
  ), ins as (
    insert into public.ext_listing_ingest (
      install_id, source, item_id, shop_id, keyword, category, product_name,
      store_name, location, price, original_price, total_sold, sold_text,
      sold_tier, sold_is_exact, reviews, rating, wishlist, stock, in_stock,
      search_rank, is_ad, shop_tier, listing_date, image_url, url, scraped_at)
    select p_install, p_source, item_id, shop_id, keyword, category, product_name,
           store_name, location, price, original_price, total_sold, sold_text,
           sold_tier, sold_is_exact, reviews, rating, wishlist, stock, in_stock,
           -- -200 marks a row that did not come from a search grid, mirroring
           -- tracked_pass.py's TRACKED_SEARCH_RANK = -100 sentinel convention.
           case when p_source = 'pdp' then -200 else search_rank end,
           is_ad, shop_tier, listing_date, image_url, url, scraped_at
      from ok
    returning 1
  )
  select count(*)::int into v_acc from ins;

  update public.ext_installs
     set rows_today = rows_today + v_acc,
         pages_today = pages_today + 1,
         rows_total  = rows_total + v_acc
   where install_id = p_install;

  return json_build_object('ok', true, 'accepted', v_acc, 'received', v_n);
end $$;

comment on function public.ext_ingest_listings(uuid, text, jsonb, text) is
  'Only write path for the Chrome extension. Validates, rate-limits per '
  'install, applies the sold_audit guard, and stages into ext_listing_ingest. '
  'anon may execute this; anon may NOT insert into the table.';

revoke all on function public.ext_ingest_listings(uuid, text, jsonb, text) from public;
grant execute on function public.ext_ingest_listings(uuid, text, jsonb, text)
  to anon, authenticated, service_role;

-- ── 2. Batch read ───────────────────────────────────────────────────────────
-- One call per Shopee page instead of 60. Dedupe lives here because
-- listings_deduped has been one row per (item, shop, KEYWORD) since
-- 20260814130000, so a plain item_id filter returns several rows per product.
-- Adds no exposure: every column below is already anon-selectable on the
-- matview. It adds a row cap and a statement timeout, which the matview alone
-- does not have.
drop function if exists public.ext_omset_batch(jsonb);
create function public.ext_omset_batch(p_items jsonb)
returns table (
  item_id                bigint,
  shop_id                bigint,
  product_name           text,
  store_name             text,
  keyword                text,
  category               text,
  price                  double precision,
  total_sold             integer,
  rating                 double precision,
  reviews                integer,
  listing_date           timestamptz,
  sold_tier              integer,
  is_ad                  smallint,
  est_velocity_daily     double precision,
  est_omset_monthly      bigint,
  omset_method           text,
  nowcast_velocity_daily double precision,
  nowcast_omset_monthly  bigint,
  nowcast_confidence     text,
  nowcast_method         text,
  nowcast_last_obs_at    timestamptz,
  momentum_pct           double precision,
  momentum_class         text
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with want as (
    select distinct
           (e->>'i')::bigint as item_id,
           (e->>'s')::bigint as shop_id
      from jsonb_array_elements(
             case when jsonb_array_length(p_items) > 120
                  then jsonb_path_query_array(p_items, '$[0 to 119]')
                  else p_items end) e
  ), best as (
    select distinct on (d.item_id, d.shop_id) d.*
      from public.listings_deduped d
      join want w on w.item_id = d.item_id and w.shop_id = d.shop_id
     order by d.item_id, d.shop_id, d.is_offtopic asc, d.scraped_at desc
  )
  select b.item_id, b.shop_id, b.product_name, b.store_name, b.keyword, b.category,
         b.price::double precision, b.total_sold, b.rating::double precision,
         b.reviews, b.listing_date, b.sold_tier, b.is_ad,
         b.est_velocity_daily::double precision, b.est_omset_monthly, b.omset_method,
         b.nowcast_velocity_daily::double precision, b.nowcast_omset_monthly,
         b.nowcast_confidence, b.nowcast_method, b.nowcast_last_obs_at,
         m.momentum_pct::double precision, m.momentum_class
    from best b
    left join public.mv_listing_momentum m
           on m.item_id = b.item_id and m.shop_id = b.shop_id
$$;

comment on function public.ext_omset_batch(jsonb) is
  'Omset rows for up to 120 (item_id, shop_id) pairs, as [{"i":..,"s":..}]. '
  'One round trip per Shopee results page. Off-topic rows lose the tiebreak '
  'but are still returned when they are all a product has.';

revoke all on function public.ext_omset_batch(jsonb) from public;
grant execute on function public.ext_omset_batch(jsonb)
  to anon, authenticated, service_role;

-- ── 3. Estimator bundle ─────────────────────────────────────────────────────
-- The peer model, for products that are not in listings_deduped at all. Same
-- cohort that produces nowcast_method='peer_only', so a card estimated here and
-- a card read from the matview agree by construction.
--
-- Served as one RPC rather than table grants because review_multipliers and
-- category_multipliers are deliberately not anon-selectable. ~4,700 small rows
-- total, so the client caches the whole thing for a day and then estimates
-- offline with no per-item request.
drop function if exists public.ext_estimator_bundle();
create function public.ext_estimator_bundle()
returns json
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  select json_build_object(
    'version',      to_char(coalesce((select max(computed_at) from public.velocity_cohort),
                                     now()), 'YYYYMMDDHH24MI'),
    'computed_at',  (select max(computed_at) from public.velocity_cohort),
    'max_v_daily',  500,        -- DD_MAX_SOLD_PER_DAY, the app's own cap
    -- (category, scale band) -> peer daily velocity. category '' is the
    -- band-only global cell, which is what an unmappable category falls back
    -- to; its samples are the largest in the table.
    'cohort', (
      select coalesce(json_agg(json_build_object(
               'c', category, 'b', band, 'v', round(v_daily::numeric, 4), 'n', n)), '[]'::json)
        from public.velocity_cohort where include_zero = false
    ),
    -- reviews -> sold, for the rare card with no sold figure at all.
    'review_mult', (
      select coalesce(json_agg(json_build_object(
               'c', category, 'p', price_band, 'b', scale_band,
               'm', round(multiplier::numeric, 4), 'n', n_samples)), '[]'::json)
        from public.review_multipliers where n_samples >= 3
    ),
    -- Today's scrape taxonomy -> the peer set's older taxonomy.
    'crosswalk', (
      select coalesce(json_agg(json_build_object('s', src, 'd', dst)), '[]'::json)
        from public.omset_category_crosswalk
    )
  )
$$;

comment on function public.ext_estimator_bundle() is
  'Peer-cohort + review-multiplier model for the Chrome extension, so it can '
  'estimate omset offline for products absent from listings_deduped. Cached '
  'client-side for 24h on the returned version string.';

revoke all on function public.ext_estimator_bundle() from public;
grant execute on function public.ext_estimator_bundle()
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
