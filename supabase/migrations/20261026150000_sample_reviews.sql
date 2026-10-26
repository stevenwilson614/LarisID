-- First-3 sample reviews on product detail (extension + Deep Dive).
--
-- product_reviews already exists (empty, service_role only) from an unfinished
-- collector. We keep writing there for FTS later, and also mirror a slim
-- sample_reviews_json (max 3) onto product_details so Deep Dive needs no
-- extra round trip. Extension fills both via ext_ingest_detail (when bundled
-- with a PDP pass) or ext_ingest_sample_reviews (ratings arrived after detail,
-- or detail was already_fresh).

begin;
set local statement_timeout to '120s';

alter table public.product_details
  add column if not exists sample_reviews_json jsonb;

alter table public.ext_detail_ingest
  add column if not exists sample_reviews_json jsonb;

comment on column public.product_details.sample_reviews_json is
  'Up to 3 slim buyer reviews: [{review_id,rating_star,comment,author,ctime,model_name,image_count}]. '
  'Filled by the Chrome extension from get_ratings; not a full review corpus.';

-- Anon may read sample rows for Deep Dive. Still no anon write.
alter table public.product_reviews enable row level security;
drop policy if exists "anon read product_reviews" on public.product_reviews;
create policy "anon read product_reviews" on public.product_reviews
  for select to anon, authenticated using (true);
grant select on public.product_reviews to anon, authenticated;

-- ── helper: validate + slim a reviews jsonb array ───────────────────────────
create or replace function public._ext_slim_sample_reviews(p_reviews jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  v_id text;
  v_comment text;
  v_author text;
  v_star int;
  n int := 0;
begin
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' then
    return null;
  end if;
  for e in select value from jsonb_array_elements(p_reviews)
  loop
    exit when n >= 3;
    if jsonb_typeof(e) <> 'object' then continue; end if;
    v_id := left(nullif(btrim(coalesce(e->>'review_id', '')), ''), 80);
    if v_id is null then continue; end if;
    v_comment := left(nullif(btrim(coalesce(e->>'comment', '')), ''), 500);
    v_author := left(nullif(btrim(coalesce(e->>'author', 'Pembeli')), ''), 40);
    v_star := least(greatest(coalesce((nullif(e->>'rating_star', ''))::int, 0), 0), 5);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'review_id', v_id,
      'rating_star', nullif(v_star, 0),
      'comment', coalesce(v_comment, ''),
      'author', coalesce(v_author, 'Pembeli'),
      'ctime', (nullif(e->>'ctime', ''))::bigint,
      'model_name', left(nullif(btrim(coalesce(e->>'model_name', '')), ''), 120),
      'image_count', least(greatest(coalesce((nullif(e->>'image_count', ''))::int, 0), 0), 20)
    ));
    n := n + 1;
  end loop;
  if n = 0 then return null; end if;
  return v_out;
end $$;

-- ── write sample reviews onto product_details + product_reviews ─────────────
create or replace function public._ext_apply_sample_reviews(
  p_item_id bigint,
  p_shop_id bigint,
  p_reviews jsonb,
  p_source text default 'ext'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_slim jsonb := public._ext_slim_sample_reviews(p_reviews);
  v_n int := 0;
  e jsonb;
begin
  if p_item_id is null or p_item_id <= 0 or v_slim is null then
    return 0;
  end if;
  v_n := jsonb_array_length(v_slim);

  update public.product_details
     set sample_reviews_json = v_slim,
         reviews_collected   = v_n,
         reviews_scraped_at  = now(),
         reviews_mode        = 'sample3'
   where item_id = p_item_id;

  for e in select value from jsonb_array_elements(v_slim)
  loop
    insert into public.product_reviews (
      review_id, item_id, shop_id, rating_star, comment, ctime, model_name,
      image_count, is_anonymous, filter_used, type_used, scraped_at, source)
    values (
      e->>'review_id', p_item_id, nullif(p_shop_id, 0),
      (nullif(e->>'rating_star', ''))::int,
      nullif(e->>'comment', ''),
      (nullif(e->>'ctime', ''))::bigint,
      nullif(e->>'model_name', ''),
      coalesce((e->>'image_count')::int, 0),
      (coalesce(e->>'author', 'Pembeli') = 'Pembeli'),
      '0', '0', now(), left(coalesce(p_source, 'ext'), 20))
    on conflict (review_id) do update
      set comment      = excluded.comment,
          rating_star  = excluded.rating_star,
          scraped_at   = excluded.scraped_at,
          source       = excluded.source,
          shop_id      = coalesce(excluded.shop_id, product_reviews.shop_id),
          model_name   = coalesce(excluded.model_name, product_reviews.model_name),
          image_count  = excluded.image_count;
  end loop;
  return v_n;
end $$;

revoke all on function public._ext_slim_sample_reviews(jsonb) from public, anon, authenticated;
revoke all on function public._ext_apply_sample_reviews(bigint, bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public._ext_apply_sample_reviews(bigint, bigint, jsonb, text) to service_role;

-- ── standalone ratings ingest (after detail, or detail already_fresh) ───────
drop function if exists public.ext_ingest_sample_reviews(uuid, bigint, bigint, jsonb, text);
create function public.ext_ingest_sample_reviews(
  p_install  uuid,
  p_item_id  bigint,
  p_shop_id  bigint,
  p_reviews  jsonb,
  p_version  text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_day  date := public._usage_day();
  v_inst public.ext_installs%rowtype;
  v_n    int;
begin
  if p_install is null or p_item_id is null or p_item_id <= 0 then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array'
     or jsonb_array_length(p_reviews) = 0
     or jsonb_array_length(p_reviews) > 6 then
    return json_build_object('ok', false, 'reason', 'bad_reviews');
  end if;

  insert into public.ext_installs (install_id, day, version)
       values (p_install, v_day, left(p_version, 20))
  on conflict (install_id) do update
    set last_seen_at = now(),
        day = v_day,
        version = coalesce(left(p_version, 20), public.ext_installs.version),
        rows_today = case when public.ext_installs.day = v_day
                          then public.ext_installs.rows_today else 0 end,
        pages_today = case when public.ext_installs.day = v_day
                           then public.ext_installs.pages_today else 0 end,
        details_today = case when public.ext_installs.day = v_day
                             then public.ext_installs.details_today else 0 end,
        batches_total = public.ext_installs.batches_total + 1
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;

  -- Need a product_details row to hang the sample on. If none yet, stage onto
  -- the freshest unmerged ext_detail_ingest for this item (merge will carry it).
  if exists (select 1 from public.product_details where item_id = p_item_id) then
    v_n := public._ext_apply_sample_reviews(p_item_id, p_shop_id, p_reviews, 'ext');
  else
    update public.ext_detail_ingest
       set sample_reviews_json = public._ext_slim_sample_reviews(p_reviews)
     where id = (
       select i.id from public.ext_detail_ingest i
        where i.item_id = p_item_id and i.merged_at is null and i.reject_reason is null
        order by i.detail_scraped_at desc, i.id desc limit 1);
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return json_build_object('ok', false, 'reason', 'no_detail_yet');
    end if;
    v_n := jsonb_array_length(public._ext_slim_sample_reviews(p_reviews));
  end if;

  return json_build_object('ok', true, 'accepted', v_n);
end $$;

revoke all on function public.ext_ingest_sample_reviews(uuid, bigint, bigint, jsonb, text) from public;
grant execute on function public.ext_ingest_sample_reviews(uuid, bigint, bigint, jsonb, text)
  to anon, authenticated, service_role;

-- ── patch ext_ingest_detail to accept + apply sample_reviews_json ───────────
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
    -- Detail is fresh; still accept sample reviews if the client brought them.
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
    sample_reviews_json)
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
    v_samples);

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

-- ── merge_ext_detail carries sample_reviews_json + applies product_reviews ──
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
    sku_count, tier_count, sample_reviews_json)
  select item_id, shop_id, detail_scraped_at, 'ok', 'ext', product_name,
         description, hashtags, attributes_json, categories_json, brand, condition,
         preorder_days, images_json, video_count, tier_variations_json, models_json,
         rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
         case when jsonb_typeof(models_json) = 'array'
              then jsonb_array_length(models_json) end,
         case when jsonb_typeof(tier_variations_json) = 'array'
              then jsonb_array_length(tier_variations_json) end,
         sample_reviews_json
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
        sample_reviews_json   = coalesce(excluded.sample_reviews_json, product_details.sample_reviews_json)
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
