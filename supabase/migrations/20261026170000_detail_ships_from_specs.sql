-- ships_from (may differ from shop_location) + free-shipping flag on detail staging.
-- Attributes (material, etc.) already live in attributes_json; Deep Dive will read them.

begin;
set local statement_timeout to '120s';

alter table public.product_details
  add column if not exists ships_from text,
  add column if not exists is_free_shipping boolean;

alter table public.ext_detail_ingest
  add column if not exists ships_from text,
  add column if not exists is_free_shipping boolean;

comment on column public.product_details.ships_from is
  'Warehouse / “Dikirim dari” from PDP product_shipping or Ships From attribute. '
  'May differ from shop_location (toko).';

-- Backfill ships_from from attributes already stored (Ships From / Dikirim dari)
update public.product_details d
   set ships_from = left(btrim(a.val), 120)
  from (
    select pd.item_id,
           (select nullif(btrim(elem->>'value'), '')
              from jsonb_array_elements(
                     case when jsonb_typeof(pd.attributes_json) = 'array'
                          then pd.attributes_json else '[]'::jsonb end) elem
             where lower(coalesce(elem->>'name', ''))
                   in ('ships from', 'dikirim dari', 'pengiriman dari', 'ship from')
             limit 1) as val
      from public.product_details pd
     where pd.ships_from is null
       and pd.attributes_json is not null
  ) a
 where d.item_id = a.item_id
   and a.val is not null;

-- Patch ext_ingest_detail to accept ships_from + is_free_shipping
create or replace function public.ext_ingest_detail(
  p_install uuid,
  p_row     jsonb,
  p_version text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_day     date := public._usage_day();
  v_cap     int  := 400;
  v_item    bigint;
  v_shop    bigint;
  v_scraped timestamptz;
  v_inst    public.ext_installs%rowtype;
  v_samples jsonb;
begin
  if p_install is null or p_row is null or jsonb_typeof(p_row) <> 'object' then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;
  if pg_column_size(p_row) > 400000 then
    return json_build_object('ok', false, 'reason', 'too_large',
                             'bytes', pg_column_size(p_row));
  end if;

  v_item    := nullif(p_row->>'item_id', '')::bigint;
  v_shop    := nullif(p_row->>'shop_id', '')::bigint;
  v_scraped := nullif(p_row->>'detail_scraped_at', '')::timestamptz;
  v_samples := public._ext_slim_sample_reviews(p_row->'sample_reviews_json');

  if v_item is null or v_item <= 0 then
    return json_build_object('ok', false, 'reason', 'bad_item');
  end if;
  if v_scraped is null
     or v_scraped < now() - interval '1 hour'
     or v_scraped > now() + interval '5 minutes' then
    return json_build_object('ok', false, 'reason', 'bad_timestamp');
  end if;

  insert into public.ext_installs (install_id, day, version)
       values (p_install, v_day, left(p_version, 20))
  on conflict (install_id) do update
    set last_seen_at  = now(),
        day           = v_day,
        version       = coalesce(left(p_version, 20), public.ext_installs.version),
        rows_today    = case when public.ext_installs.day = v_day
                             then public.ext_installs.rows_today else 0 end,
        pages_today   = case when public.ext_installs.day = v_day
                             then public.ext_installs.pages_today else 0 end,
        details_today = case when public.ext_installs.day = v_day
                             then public.ext_installs.details_today else 0 end,
        batches_total = public.ext_installs.batches_total + 1
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if v_inst.details_today >= v_cap then
    return json_build_object('ok', false, 'reason', 'rate_limited',
                             'details_today', v_inst.details_today);
  end if;

  if exists (select 1 from public.product_details d
              where d.item_id = v_item
                and d.fetch_status = 'ok'
                and d.detail_scraped_at > now() - interval '7 days') then
    -- Opportunistic enrich: ships_from / attrs / free-shipping without a full re-merge.
    update public.product_details
       set ships_from = coalesce(
             nullif(btrim(left(coalesce(p_row->>'ships_from', ''), 120)), ''),
             ships_from),
           is_free_shipping = coalesce(
             case when p_row ? 'is_free_shipping'
                  then (p_row->>'is_free_shipping')::boolean end,
             is_free_shipping),
           attributes_json = coalesce(
             case when jsonb_typeof(p_row->'attributes_json') = 'array'
                       and jsonb_array_length(p_row->'attributes_json') > 0
                  then p_row->'attributes_json' end,
             attributes_json)
     where item_id = v_item;
    if v_samples is not null then
      perform public._ext_apply_sample_reviews(v_item, v_shop, v_samples, 'ext');
      return json_build_object('ok', true, 'accepted', 0, 'reason', 'already_fresh',
                               'reviews', jsonb_array_length(v_samples));
    end if;
    return json_build_object('ok', true, 'accepted', 0, 'reason', 'already_fresh');
  end if;

  insert into public.ext_detail_ingest (
    install_id, item_id, shop_id, detail_scraped_at, product_name, description,
    hashtags, attributes_json, categories_json, brand, condition, preorder_days,
    images_json, video_count, tier_variations_json, models_json,
    rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
    sample_reviews_json, ships_from, is_free_shipping)
  values (
    p_install, v_item, nullif(v_shop, 0), v_scraped,
    left(nullif(btrim(p_row->>'product_name'), ''), 500),
    left(nullif(p_row->>'description', ''), 20000),
    left(nullif(p_row->>'hashtags', ''), 2000),
    case when jsonb_typeof(p_row->'attributes_json')      = 'array'  then p_row->'attributes_json' end,
    case when jsonb_typeof(p_row->'categories_json')      = 'array'  then p_row->'categories_json' end,
    left(nullif(btrim(p_row->>'brand'), ''), 200),
    left(nullif(btrim(p_row->>'condition'), ''), 20),
    (nullif(p_row->>'preorder_days', ''))::int,
    case when jsonb_typeof(p_row->'images_json')          = 'array'  then p_row->'images_json' end,
    (nullif(p_row->>'video_count', ''))::int,
    case when jsonb_typeof(p_row->'tier_variations_json') = 'array'  then p_row->'tier_variations_json' end,
    case when jsonb_typeof(p_row->'models_json')          = 'array'  then p_row->'models_json' end,
    case when jsonb_typeof(p_row->'rating_breakdown_json') in ('array','object')
         then p_row->'rating_breakdown_json' end,
    least(greatest((nullif(p_row->>'liked_count', ''))::int, 0), 100000000),
    least(greatest((nullif(p_row->>'comment_count', ''))::int, 0), 100000000),
    nullif(p_row->>'ctime', '')::timestamptz,
    left(nullif(btrim(p_row->>'shop_location'), ''), 120),
    v_samples,
    left(nullif(btrim(p_row->>'ships_from'), ''), 120),
    case when p_row ? 'is_free_shipping'
         then (p_row->>'is_free_shipping')::boolean end);

  update public.ext_installs
     set details_today = details_today + 1,
         details_total = details_total + 1
   where install_id = p_install;

  return json_build_object('ok', true, 'accepted', 1,
                           'reviews', coalesce(jsonb_array_length(v_samples), 0));
end $$;

revoke all on function public.ext_ingest_detail(uuid, jsonb, text) from public;
grant execute on function public.ext_ingest_detail(uuid, jsonb, text)
  to anon, authenticated, service_role;

-- merge_ext_detail: carry ships_from + is_free_shipping onto product_details
create or replace function public.merge_ext_detail(p_max integer default 5000)
returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare
  v_cand      int := 0;
  v_merged    int := 0;
  v_boot      int := 0;
  v_sup       int := 0;
  v_aged      int := 0;
  v_queue     int := 0;
  v_kw_queued int := 0;
  v_reviews   int := 0;
  r           record;
  v_verdict   text;
  v_kw        text;
  v_cat       text;
  v_n         int;
begin
  create temporary table _ext_det on commit drop as
  select distinct on (i.item_id) i.*
    from public.ext_detail_ingest i
   where i.merged_at is null
     and i.reject_reason is null
   order by i.item_id, i.detail_scraped_at desc, i.id desc
   limit p_max;

  select count(*)::int into v_cand from _ext_det;

  insert into public.listings (
    keyword, category, scraped_at, item_id, shop_id, product_name, store_name,
    price, original_price, total_sold, rating, reviews, location, image_url,
    listing_date, wishlist, sold_tier, sold_text, shop_tier,
    search_rank, is_ad, in_stock, url, source, brand)
  select
    coalesce(
      nullif(btrim(
        case when jsonb_typeof(d.categories_json) = 'array'
                  and jsonb_array_length(d.categories_json) > 0
             then lower(d.categories_json->>0) end), ''),
      ''),
    coalesce(
      nullif(btrim(
        case when jsonb_typeof(d.categories_json) = 'array'
                  and jsonb_array_length(d.categories_json) > 0
             then d.categories_json->>0 end), ''),
      ''),
    d.detail_scraped_at,
    d.item_id,
    coalesce(d.shop_id, 0),
    d.product_name,
    null,
    (select min((m->>'price')::numeric)::real
       from jsonb_array_elements(
              case when jsonb_typeof(d.models_json) = 'array' then d.models_json
                   else '[]'::jsonb end) m
      where nullif(m->>'price', '') is not null),
    (select min((m->>'price_before')::numeric)::real
       from jsonb_array_elements(
              case when jsonb_typeof(d.models_json) = 'array' then d.models_json
                   else '[]'::jsonb end) m
      where nullif(m->>'price_before', '') is not null),
    0,
    null,
    coalesce(d.comment_count, 0),
    d.shop_location,
    case when jsonb_typeof(d.images_json) = 'array'
              and jsonb_array_length(d.images_json) > 0
         then left(d.images_json->>0, 400) end,
    d.ctime,
    d.liked_count,
    0,
    '',
    '',
    -200,
    0::smallint,
    true,
    case when d.shop_id is not null and d.shop_id > 0
         then 'https://shopee.co.id/product/' || d.shop_id || '/' || d.item_id
         end,
    'ext',
    d.brand
    from _ext_det d
   where d.shop_id is not null and d.shop_id > 0
     and not exists (
           select 1 from public.listings l where l.item_id = d.item_id);

  get diagnostics v_boot = row_count;

  insert into public.product_details (
    item_id, shop_id, detail_scraped_at, fetch_status, source, product_name,
    description, hashtags, attributes_json, categories_json, brand, condition,
    preorder_days, images_json, video_count, tier_variations_json, models_json,
    rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
    sku_count, tier_count, sample_reviews_json, ships_from, is_free_shipping)
  select item_id, shop_id, detail_scraped_at, 'ok', 'ext', product_name,
         description, hashtags, attributes_json, categories_json, brand, condition,
         preorder_days, images_json, video_count, tier_variations_json, models_json,
         rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
         case when jsonb_typeof(models_json) = 'array'
              then jsonb_array_length(models_json) end,
         case when jsonb_typeof(tier_variations_json) = 'array'
              then jsonb_array_length(tier_variations_json) end,
         sample_reviews_json, ships_from, is_free_shipping
    from _ext_det
  on conflict (item_id) do update
    set shop_id               = coalesce(excluded.shop_id, product_details.shop_id),
        detail_scraped_at     = excluded.detail_scraped_at,
        fetch_status          = 'ok',
        source                = 'ext',
        product_name          = coalesce(nullif(excluded.product_name, ''), product_details.product_name),
        description           = coalesce(nullif(excluded.description, ''), product_details.description),
        hashtags              = excluded.hashtags,
        attributes_json       = coalesce(excluded.attributes_json, product_details.attributes_json),
        categories_json       = coalesce(excluded.categories_json, product_details.categories_json),
        brand                 = coalesce(nullif(excluded.brand, ''), product_details.brand),
        condition             = coalesce(excluded.condition, product_details.condition),
        preorder_days         = coalesce(excluded.preorder_days, product_details.preorder_days),
        images_json           = coalesce(excluded.images_json, product_details.images_json),
        video_count           = coalesce(excluded.video_count, product_details.video_count),
        tier_variations_json  = coalesce(excluded.tier_variations_json, product_details.tier_variations_json),
        models_json           = coalesce(excluded.models_json, product_details.models_json),
        rating_breakdown_json = coalesce(excluded.rating_breakdown_json, product_details.rating_breakdown_json),
        liked_count           = excluded.liked_count,
        comment_count         = excluded.comment_count,
        ctime                 = coalesce(excluded.ctime, product_details.ctime),
        shop_location         = coalesce(nullif(excluded.shop_location, ''), product_details.shop_location),
        sku_count             = coalesce(excluded.sku_count, product_details.sku_count),
        tier_count            = coalesce(excluded.tier_count, product_details.tier_count),
        sample_reviews_json   = coalesce(excluded.sample_reviews_json, product_details.sample_reviews_json),
        ships_from            = coalesce(nullif(excluded.ships_from, ''), product_details.ships_from),
        is_free_shipping      = coalesce(excluded.is_free_shipping, product_details.is_free_shipping)
  where excluded.detail_scraped_at >= product_details.detail_scraped_at;

  get diagnostics v_merged = row_count;

  for r in select * from _ext_det where sample_reviews_json is not null loop
    v_n := public._ext_apply_sample_reviews(r.item_id, r.shop_id, r.sample_reviews_json, 'ext');
    if v_n > 0 then v_reviews := v_reviews + 1; end if;
  end loop;

  update public.ext_detail_ingest u set merged_at = now()
   where u.id in (select id from _ext_det);

  update public.ext_detail_ingest u set reject_reason = 'superseded'
   where u.merged_at is null
     and u.reject_reason is null
     and u.item_id in (select item_id from _ext_det)
     and u.id not in (select id from _ext_det);

  get diagnostics v_sup = row_count;

  for r in select * from _ext_det loop
    v_cat := nullif(btrim(
      case when jsonb_typeof(r.categories_json) = 'array'
                and jsonb_array_length(r.categories_json) > 0
           then r.categories_json->>0 end), '');
    v_kw := coalesce(
      v_cat,
      nullif(btrim(left(regexp_replace(
        lower(coalesce(r.product_name, '')), '[^a-z0-9 ]', ' ', 'g'), 60)), ''));
    if v_kw is not null then
      v_verdict := public._ext_queue_scrape_keyword(v_kw, coalesce(v_cat, ''));
      if v_verdict = 'queued' then
        v_kw_queued := v_kw_queued + 1;
      end if;
    end if;
  end loop;

  update public.ext_detail_ingest u set reject_reason = 'stale'
   where u.merged_at is null
     and u.reject_reason is null
     and u.received_at < now() - interval '7 days';

  get diagnostics v_aged = row_count;

  if v_merged > 0 then
    v_queue := public.fulfill_item_detail_requests();
  end if;

  return json_build_object(
    'candidates',             v_cand,
    'bootstrapped_listings',  v_boot,
    'merged',                 v_merged,
    'superseded',             v_sup,
    'kw_queued',              v_kw_queued,
    'aged_out',               v_aged,
    'requests_marked_ready',  v_queue,
    'sample_reviews_items',   v_reviews);
end $$;

revoke all on function public.merge_ext_detail(integer) from public, anon, authenticated;
grant execute on function public.merge_ext_detail(integer) to service_role;

notify pgrst, 'reload schema';
commit;
