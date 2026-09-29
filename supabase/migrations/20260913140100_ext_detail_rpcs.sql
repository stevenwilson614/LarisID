-- ext_ingest_detail() + merge_ext_detail(). Companion to 20260913140000.

begin;
set local statement_timeout to '600s';

-- ── 1. Ingest one detail pass ───────────────────────────────────────────────
drop function if exists public.ext_ingest_detail(uuid, jsonb, text);
create function public.ext_ingest_detail(
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
  v_cap     int  := 400;      -- detail passes per install per day
  v_item    bigint;
  v_shop    bigint;
  v_scraped timestamptz;
  v_inst    public.ext_installs%rowtype;
begin
  if p_install is null or p_row is null or jsonb_typeof(p_row) <> 'object' then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  -- A single PDP payload should never be this big; treat it as hostile.
  if pg_column_size(p_row) > 400000 then
    return json_build_object('ok', false, 'reason', 'too_large',
                             'bytes', pg_column_size(p_row));
  end if;

  v_item    := nullif(p_row->>'item_id', '')::bigint;
  v_shop    := nullif(p_row->>'shop_id', '')::bigint;
  v_scraped := nullif(p_row->>'detail_scraped_at', '')::timestamptz;

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

  -- Skip a re-send of something we already hold a fresh pass for. The scraper's
  -- own tracked pass and another user's browsing both count, so this is checked
  -- against product_details, not just against staging.
  if exists (select 1 from public.product_details d
              where d.item_id = v_item
                and d.fetch_status = 'ok'
                and d.detail_scraped_at > now() - interval '7 days') then
    return json_build_object('ok', true, 'accepted', 0, 'reason', 'already_fresh');
  end if;

  insert into public.ext_detail_ingest (
    install_id, item_id, shop_id, detail_scraped_at, product_name, description,
    hashtags, attributes_json, categories_json, brand, condition, preorder_days,
    images_json, video_count, tier_variations_json, models_json,
    rating_breakdown_json, liked_count, comment_count, ctime, shop_location)
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
    left(nullif(btrim(p_row->>'shop_location'), ''), 120));

  update public.ext_installs
     set details_today = details_today + 1,
         details_total = details_total + 1
   where install_id = p_install;

  return json_build_object('ok', true, 'accepted', 1);
end $$;

comment on function public.ext_ingest_detail(uuid, jsonb, text) is
  'Only write path for extension-captured PDP detail. Validates and stages one '
  'row into ext_detail_ingest; anon may execute it, anon may NOT write the table.';

revoke all on function public.ext_ingest_detail(uuid, jsonb, text) from public;
grant execute on function public.ext_ingest_detail(uuid, jsonb, text)
  to anon, authenticated, service_role;

-- ── 2. Merge into product_details ───────────────────────────────────────────
drop function if exists public.merge_ext_detail(integer);
create function public.merge_ext_detail(p_max integer default 5000)
returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare
  v_cand   int := 0;
  v_merged int := 0;
  v_sup    int := 0;
  v_aged   int := 0;
  v_queue  int := 0;
begin
  -- Freshest pass per item, and only for items listings already knows: the
  -- extension must not be able to mint a product_details row for an item that
  -- exists nowhere else in the corpus.
  create temporary table _ext_det on commit drop as
  select distinct on (i.item_id) i.*
    from public.ext_detail_ingest i
   where i.merged_at is null
     and i.reject_reason is null
     and exists (select 1 from public.listings l where l.item_id = i.item_id)
   order by i.item_id, i.detail_scraped_at desc, i.id desc
   limit p_max;

  select count(*)::int into v_cand from _ext_det;

  insert into public.product_details (
    item_id, shop_id, detail_scraped_at, fetch_status, source, product_name,
    description, hashtags, attributes_json, categories_json, brand, condition,
    preorder_days, images_json, video_count, tier_variations_json, models_json,
    rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
    sku_count, tier_count)
  select item_id, shop_id, detail_scraped_at, 'ok', 'ext', product_name,
         description, hashtags, attributes_json, categories_json, brand, condition,
         preorder_days, images_json, video_count, tier_variations_json, models_json,
         rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
         -- Cheap to derive here and populated on all 996 pre-existing rows, so
         -- leaving them null would make extension rows visibly poorer.
         case when jsonb_typeof(models_json) = 'array'
              then jsonb_array_length(models_json) end,
         case when jsonb_typeof(tier_variations_json) = 'array'
              then jsonb_array_length(tier_variations_json) end
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
        tier_count            = coalesce(excluded.tier_count, product_details.tier_count)
  -- A newer pass wins; an older one must not overwrite a fresher scrape, which
  -- can happen when staging drains after the tracked pass has already run.
  where excluded.detail_scraped_at >= product_details.detail_scraped_at;

  get diagnostics v_merged = row_count;

  update public.ext_detail_ingest u set merged_at = now()
   where u.id in (select id from _ext_det);

  update public.ext_detail_ingest u set reject_reason = 'superseded'
   where u.merged_at is null
     and u.reject_reason is null
     and u.item_id in (select item_id from _ext_det)
     and u.id not in (select id from _ext_det);

  get diagnostics v_sup = row_count;

  -- Items whose pair listings never learned about. Given a week, same as the
  -- listing merge, before the reason is recorded.
  update public.ext_detail_ingest u set reject_reason = 'unknown_item'
   where u.merged_at is null
     and u.reject_reason is null
     and u.received_at < now() - interval '7 days'
     and not exists (select 1 from public.listings l where l.item_id = u.item_id);

  get diagnostics v_aged = row_count;

  -- Existing seam: flips item_detail_queue to done and item_detail_requests to
  -- 'ready' for anything that just gained an 'ok' detail row, so a user opening
  -- a product can fulfil someone else's queued request.
  if v_merged > 0 then
    v_queue := public.fulfill_item_detail_requests();
  end if;

  return json_build_object('candidates', v_cand, 'merged', v_merged,
                           'superseded', v_sup, 'aged_out', v_aged,
                           'requests_marked_ready', v_queue);
end $$;

comment on function public.merge_ext_detail(integer) is
  'Promotes ext_detail_ingest into product_details with source=''ext'' for items '
  'listings already knows, newest pass wins, then drains item_detail_queue via '
  'fulfill_item_detail_requests(). service_role only.';

revoke all on function public.merge_ext_detail(integer) from public, anon, authenticated;
grant execute on function public.merge_ext_detail(integer) to service_role;

notify pgrst, 'reload schema';
commit;
