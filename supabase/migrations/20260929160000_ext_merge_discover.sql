-- Extension discovery: promote unknown products + queue their keywords.
--
-- WHY. merge_ext_ingest() used to require (item_id, shop_id) already in
-- listings, and aged unknown pairs out as reject_reason='unknown_pair'. That
-- kept the extension from minting catalogue rows (sensible for an anon write
-- path) but also threw away ~1.3k real products users were already looking at,
-- and never fed those search terms into scrape_keywords. Same gate on
-- merge_ext_detail() meant a user opening a product we did not know could not
-- fill product_details either.
--
-- NEW POSTURE.
--   1. Listings merge promotes any staged row with a real sold signal, known
--      pair or not. New pairs land with source='ext'.
--   2. Distinct keywords from promoted rows are inserted into scrape_keywords
--      (source_set='ext', sla_days=1) so the next queue lane covers them —
--      subject to the same brand/length guards as request_scrape_keywords, plus
--      a global daily ceiling so one install cannot flood the queue.
--   3. Detail merge no longer requires a prior listings row. It bootstraps a
--      thin listings row from the PDP fields (price from models when present)
--      and then upserts product_details. A keyword derived from the first
--      category (else a cleaned product_name stem) is queued the same way.
--
-- Abuse still has the existing walls: sold_audit on search pages, per-install
-- row/detail caps, scraped_at freshness, mono sold floor, and the keyword
-- brand guard. What changes is discovery, not the intake gates.

begin;
set local statement_timeout to '600s';

-- ── helper: queue one keyword for the scrape lane ───────────────────────────
create or replace function public._ext_queue_scrape_keyword(
  p_keyword  text,
  p_category text default ''
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_today int;
  v_cap   int := 200;   -- new ext keywords per UTC day
begin
  v_norm := btrim(regexp_replace(
              regexp_replace(lower(btrim(coalesce(p_keyword, ''))), '[^a-z0-9 ]', ' ', 'g'),
              '\s+', ' ', 'g'));
  if char_length(v_norm) < 3 or char_length(v_norm) > 60 then
    return 'rejected_length';
  end if;

  if exists (select 1 from public.scrape_keywords sk where sk.keyword = v_norm) then
    return 'already_queued';
  end if;

  -- Same brand guard as request_scrape_keywords: at least one real corpus token.
  if not exists (
        select 1
          from unnest(string_to_array(v_norm, ' ')) as t(tok)
         where char_length(t.tok) >= 3
           and exists (select 1 from public.scrape_keywords sk
                        where sk.keyword = t.tok
                           or sk.keyword like t.tok || ' %'
                           or sk.keyword like '% ' || t.tok || ' %'
                           or sk.keyword like '% ' || t.tok)) then
    return 'rejected_brand';
  end if;

  select count(*)::int into v_today
    from public.scrape_keywords
   where source_set = 'ext'
     and created_at >= date_trunc('day', now() at time zone 'utc');
  if v_today >= v_cap then
    return 'rate_limited';
  end if;

  insert into public.scrape_keywords (keyword, category, source_set, sla_days)
  values (v_norm, coalesce(nullif(btrim(p_category), ''), ''), 'ext', 1)
  on conflict (keyword) do nothing;

  return 'queued';
end $$;

comment on function public._ext_queue_scrape_keyword(text, text) is
  'Internal: insert a keyword into scrape_keywords from extension discovery. '
  'Brand/length guarded, 200/day ceiling, source_set=ext, sla_days=1.';

revoke all on function public._ext_queue_scrape_keyword(text, text)
  from public, anon, authenticated;
grant execute on function public._ext_queue_scrape_keyword(text, text) to service_role;

-- ── reopen previously aged unknown pairs / items ────────────────────────────
update public.ext_listing_ingest
   set reject_reason = null
 where reject_reason = 'unknown_pair';

update public.ext_detail_ingest
   set reject_reason = null
 where reject_reason = 'unknown_item';

-- ── listings merge ──────────────────────────────────────────────────────────
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
  v_new_pairs  int := 0;
  v_kw_queued  int := 0;
  v_kw_skip    int := 0;
  r            record;
  v_verdict    text;
begin
  create temporary table _ext_cand on commit drop as
  select i.id, i.item_id, i.shop_id, coalesce(btrim(i.keyword), '') as kw,
         i.category, i.scraped_at,
         exists (select 1 from public.listings l
                  where l.item_id = i.item_id and l.shop_id = i.shop_id) as known_pair
    from public.ext_listing_ingest i
   where i.merged_at is null
     and i.reject_reason is null
     and (i.sold_tier = 0 or coalesce(i.sold_text, '') <> '')
   order by i.received_at
   limit p_max;

  select count(*)::int into v_cand from _ext_cand;

  create temporary table _ext_win on commit drop as
  select distinct on (item_id, shop_id, kw) id, item_id, shop_id, kw, category, known_pair
    from _ext_cand
   order by item_id, shop_id, kw, scraped_at desc, id desc;

  select count(*)::int into v_promoted from _ext_win;
  select count(*)::int into v_new_pairs
    from (select distinct item_id, shop_id from _ext_win where not known_pair) t;

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

  -- Queue distinct search keywords from this run (known or new).
  for r in
    select distinct nullif(btrim(kw), '') as keyword,
           nullif(btrim(category), '') as category
      from _ext_win
     where nullif(btrim(kw), '') is not null
  loop
    v_verdict := public._ext_queue_scrape_keyword(r.keyword, coalesce(r.category, ''));
    if v_verdict = 'queued' then
      v_kw_queued := v_kw_queued + 1;
    else
      v_kw_skip := v_kw_skip + 1;
    end if;
  end loop;

  -- Age out rows that still cannot promote: no sold signal, or stuck for a week
  -- for some other reason. unknown_pair is gone — discovery is the point now.
  update public.ext_listing_ingest u
     set reject_reason = case
           when u.sold_tier <> 0 and coalesce(u.sold_text, '') = '' then 'no_sold_signal'
           else 'stale' end
   where u.merged_at is null
     and u.reject_reason is null
     and u.received_at < now() - interval '7 days';

  get diagnostics v_aged = row_count;

  return json_build_object(
    'candidates',   v_cand,
    'promoted',     v_promoted,
    'merged',       v_merged,
    'new_pairs',    v_new_pairs,
    'kw_queued',    v_kw_queued,
    'kw_skipped',   v_kw_skip,
    'superseded',   v_superseded,
    'aged_out',     v_aged);
end $$;

comment on function public.merge_ext_ingest(integer) is
  'Promotes ext_listing_ingest into listings with source=''ext'' (known or new '
  'pairs, sold signal required), queues distinct keywords into scrape_keywords '
  '(source_set=ext), one freshest reading per (item, shop, keyword). service_role only.';

revoke all on function public.merge_ext_ingest(integer) from public, anon, authenticated;
grant execute on function public.merge_ext_ingest(integer) to service_role;

-- ── detail merge ────────────────────────────────────────────────────────────
drop function if exists public.merge_ext_detail(integer);
create function public.merge_ext_detail(p_max integer default 5000)
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
  r           record;
  v_verdict   text;
  v_kw        text;
  v_cat       text;
begin
  -- Freshest pass per item. No listings gate: we bootstrap a row when needed.
  create temporary table _ext_det on commit drop as
  select distinct on (i.item_id) i.*
    from public.ext_detail_ingest i
   where i.merged_at is null
     and i.reject_reason is null
   order by i.item_id, i.detail_scraped_at desc, i.id desc
   limit p_max;

  select count(*)::int into v_cand from _ext_det;

  -- Bootstrap thin listings rows for items the corpus has never seen, so the
  -- rest of the app (dedupe views, Deep Dive, Favorit) can resolve the pair.
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
    -- Prefer the cheapest model price when the PDP carried models; else null.
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
    sku_count, tier_count)
  select item_id, shop_id, detail_scraped_at, 'ok', 'ext', product_name,
         description, hashtags, attributes_json, categories_json, brand, condition,
         preorder_days, images_json, video_count, tier_variations_json, models_json,
         rating_breakdown_json, liked_count, comment_count, ctime, shop_location,
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

  -- Queue a scrape keyword from category or a cleaned product-name stem so the
  -- next search pass covers the neighbourhood of this newly discovered item.
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

  -- Only age out rows that still cannot land (e.g. missing shop_id forever).
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
    'requests_marked_ready',  v_queue);
end $$;

comment on function public.merge_ext_detail(integer) is
  'Promotes ext_detail_ingest into product_details (source=ext), bootstrapping a '
  'listings row when the item is new, and queues a category/name keyword into '
  'scrape_keywords. Newest pass wins. service_role only.';

revoke all on function public.merge_ext_detail(integer) from public, anon, authenticated;
grant execute on function public.merge_ext_detail(integer) to service_role;

comment on table public.ext_listing_ingest is
  'Staging for rows the Chrome extension captured from Shopee pages the user '
  'browsed. Promoted into public.listings by merge_ext_ingest() (known or new '
  'pairs with a sold signal). Keywords are queued into scrape_keywords. '
  'Never read by the frontend.';

comment on table public.ext_detail_ingest is
  'Staging for PDP detail passes the Chrome extension captured from product '
  'pages a user opened. Promoted into product_details by merge_ext_detail(); '
  'unknown items get a bootstrapped listings row. Never read by the frontend.';

notify pgrst, 'reload schema';
commit;
