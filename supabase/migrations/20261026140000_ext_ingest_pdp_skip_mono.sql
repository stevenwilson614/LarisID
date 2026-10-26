-- PDP listing ingest was silently accepting 0 rows in production.
--
-- WHY. ext_ingest_listings() applies a lifetime-sold mono floor
-- (incoming >= 0.9 * max(listings.total_sold)). Search rows carry an exact
-- historical_sold_count. PDP rows carry only Shopee's display bucket
-- ('10RB+' → 10000). For any product already in listings with an exact count
-- above the bucket, every PDP listing row fails the WHERE and accepted=0 —
-- which is why ext_listing_ingest has 0 source='pdp' rows while search is fine.
--
-- Detail ingest (ext_ingest_detail) does not use this floor; that path was
-- empty for a different reason (SPA soft-nav never re-fetched get_pc — fixed
-- in extension 3.0.10). This migration only unblocks the listings-shaped PDP
-- half so a product open can stage a pdp row again.
--
-- For p_source = 'pdp', skip the mono comparison. Merge still sees
-- sold_is_exact=false and must not treat the bucket as an exact counter.

begin;
set local statement_timeout to '60s';

create or replace function public.ext_ingest_listings(
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
  v_row_cap  int  := 20000;
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
        details_today  = case when public.ext_installs.day = v_day
                              then public.ext_installs.details_today else 0 end,
        batches_total  = public.ext_installs.batches_total + 1
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if v_inst.rows_today + v_n > v_row_cap then
    return json_build_object('ok', false, 'reason', 'rate_limited',
                             'rows_today', v_inst.rows_today);
  end if;

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
           case when s.total_sold is null or s.total_sold < 1000 then 0
                when s.total_sold >= 10000                        then 10000
                else (s.total_sold / 1000) * 1000 end as sold_tier
      from src s
     where s.item_id > 0
       and s.shop_id > 0
       and s.scraped_at is not null
       and s.price between 0.1 and 100000000
       and coalesce(s.total_sold, 0) between 0 and 5000000
       and coalesce(s.rating, 0) between 0 and 5
       and coalesce(s.reviews, 0) between 0 and 10000000
       and s.scraped_at between now() - interval '1 hour'
                            and now() + interval '5 minutes'
       -- Search keeps the mono floor. PDP skips it: bucket vs exact would
       -- reject every open of a product we already know from search.
       and (
            p_source = 'pdp'
            or coalesce(s.total_sold, 0) >= coalesce((
                  select max(l.total_sold) from public.listings l
                   where l.item_id = s.item_id and l.shop_id = s.shop_id), 0) * 0.9
           )
  ), ins as (
    insert into public.ext_listing_ingest (
      install_id, source, item_id, shop_id, keyword, category, product_name,
      store_name, location, price, original_price, total_sold, sold_text,
      sold_tier, sold_is_exact, reviews, rating, wishlist, stock, in_stock,
      search_rank, is_ad, shop_tier, listing_date, image_url, url, scraped_at)
    select p_install, p_source, item_id, shop_id, keyword, category, product_name,
           store_name, location, price, original_price, total_sold, sold_text,
           sold_tier, sold_is_exact, reviews, rating, wishlist, stock, in_stock,
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
  'PDP source skips the lifetime-sold mono floor (bucket vs exact). '
  'anon may execute this; anon may NOT insert into the table.';

revoke all on function public.ext_ingest_listings(uuid, text, jsonb, text) from public;
grant execute on function public.ext_ingest_listings(uuid, text, jsonb, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
