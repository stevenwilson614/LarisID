-- Live "Minta info" — claim/complete a single PDP while the Deep Dive waits.
--
-- WHY. request_item_detail only parked the item for the next tracked_pass.
-- A person staring at Varian / SKU / ulasan needs the row inside about a minute,
-- the same way My Toko waits on claim_shop_scrape_jobs. The Mac worker leases
-- priority-10 (someone asked) rows, opens the product page, and upserts
-- product_details immediately. Priority 50 (auto, from opening a dive) stays
-- on the daily pass so an idle laptop is not asked to scrape the whole catalog.
--
-- Overnight fallback is unchanged: if the worker is down, the row stays pending
-- and tracked_pass.py still drains v_detail_queue.

begin;
set local statement_timeout to '120s';

alter table public.item_detail_queue
  add column if not exists claimed_by text,
  add column if not exists claimed_at timestamptz,
  add column if not exists lease_expires_at timestamptz;

do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'item_detail_queue'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.item_detail_queue drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.item_detail_queue
  add constraint item_detail_queue_status_check
  check (status in ('pending', 'claimed', 'done', 'failed', 'gone'));

comment on column public.item_detail_queue.claimed_by is
  'Mac host that leased this row for a live PDP fetch. Null when pending.';
comment on column public.item_detail_queue.lease_expires_at is
  'Claim dies after 3 minutes so a crashed worker cannot hold the item.';

-- ── request: same verdicts, plus item_id, and a dead lease goes back to pending
create or replace function public.request_item_detail(
  p_item_id      bigint,
  p_shop_id      bigint default null,
  p_keyword      text   default null,
  p_product_name text   default null,
  p_source       text   default 'deepdive'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_fresh  timestamptz;
  v_recent int;
  v_verdict text;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_item_id is null then
    return jsonb_build_object('verdict', 'rejected_input');
  end if;

  select detail_scraped_at into v_fresh
    from public.product_details
   where item_id = p_item_id and fetch_status = 'ok';

  if v_fresh is not null and v_fresh > now() - interval '7 days' then
    return jsonb_build_object(
      'verdict', 'already_live',
      'item_id', p_item_id,
      'detail_scraped_at', v_fresh
    );
  end if;

  select count(*) into v_recent
    from public.item_detail_requests
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    return jsonb_build_object('verdict', 'rate_limited', 'item_id', p_item_id);
  end if;

  insert into public.item_detail_queue (item_id, shop_id, keyword, priority, reason)
  values (p_item_id, p_shop_id, nullif(btrim(coalesce(p_keyword, '')), ''), 10, 'request')
  on conflict (item_id) do update
    set priority       = least(public.item_detail_queue.priority, 10),
        reason         = 'request',
        open_count     = public.item_detail_queue.open_count + 1,
        last_queued_at = case
          when public.item_detail_queue.status = 'claimed'
               and coalesce(public.item_detail_queue.lease_expires_at, now()) > now()
          then public.item_detail_queue.last_queued_at
          else now()
        end,
        shop_id        = coalesce(public.item_detail_queue.shop_id, excluded.shop_id),
        keyword        = coalesce(public.item_detail_queue.keyword, excluded.keyword),
        status         = case
          when public.item_detail_queue.status in ('failed', 'done', 'gone') then 'pending'
          when public.item_detail_queue.status = 'claimed'
               and coalesce(public.item_detail_queue.lease_expires_at, '-infinity'::timestamptz) <= now()
          then 'pending'
          else public.item_detail_queue.status
        end,
        attempts       = case when public.item_detail_queue.status = 'failed'
                              then 0 else public.item_detail_queue.attempts end,
        claimed_by     = case
          when public.item_detail_queue.status in ('failed', 'done', 'gone')
            or (public.item_detail_queue.status = 'claimed'
                and coalesce(public.item_detail_queue.lease_expires_at, '-infinity'::timestamptz) <= now())
          then null
          else public.item_detail_queue.claimed_by
        end,
        claimed_at     = case
          when public.item_detail_queue.status in ('failed', 'done', 'gone')
            or (public.item_detail_queue.status = 'claimed'
                and coalesce(public.item_detail_queue.lease_expires_at, '-infinity'::timestamptz) <= now())
          then null
          else public.item_detail_queue.claimed_at
        end,
        lease_expires_at = case
          when public.item_detail_queue.status in ('failed', 'done', 'gone')
            or (public.item_detail_queue.status = 'claimed'
                and coalesce(public.item_detail_queue.lease_expires_at, '-infinity'::timestamptz) <= now())
          then null
          else public.item_detail_queue.lease_expires_at
        end;

  insert into public.item_detail_requests
         (user_id, item_id, shop_id, keyword, product_name, source)
  values (v_uid, p_item_id, p_shop_id,
          nullif(btrim(coalesce(p_keyword, '')), ''),
          left(nullif(btrim(coalesce(p_product_name, '')), ''), 300),
          p_source)
  on conflict do nothing;

  v_verdict := case when v_fresh is null then 'queued' else 'queued_refresh' end;
  return jsonb_build_object('verdict', v_verdict, 'item_id', p_item_id);
end $$;

-- ── poll (SPA) ──────────────────────────────────────────────────────────────
drop function if exists public.get_item_detail_status(bigint);
create function public.get_item_detail_status(p_item_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v_status text;
  v_queued timestamptz;
  v_at     timestamptz;
  v_fs     text;
  v_ready  boolean := false;
begin
  if p_item_id is null or p_item_id <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'bad_args');
  end if;
  if auth.uid() is null and coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'auth required' using errcode = '42501';
  end if;

  select q.status, q.last_queued_at
    into v_status, v_queued
    from public.item_detail_queue q
   where q.item_id = p_item_id;

  select d.detail_scraped_at, d.fetch_status
    into v_at, v_fs
    from public.product_details d
   where d.item_id = p_item_id;

  v_ready := v_fs = 'ok'
    and v_at is not null
    and (
      v_status is null
      or v_status = 'done'
      or v_at >= coalesce(v_queued, '-infinity'::timestamptz) - interval '5 seconds'
    );

  -- A stale row must not look ready while we are still waiting on a new scrape.
  if v_status in ('pending', 'claimed')
     and (v_at is null or v_at < coalesce(v_queued, now()) - interval '5 seconds') then
    v_ready := false;
  end if;

  return jsonb_build_object(
    'ok', true,
    'item_id', p_item_id,
    'status', coalesce(v_status, case when v_ready then 'done' else 'none' end),
    'detail_ready', v_ready,
    'detail_scraped_at', v_at,
    'fetch_status', v_fs
  );
end $$;

comment on function public.get_item_detail_status(bigint) is
  'Deep Dive poll while Minta info waits. detail_ready only after a scrape '
  'newer than this queue entry.';

revoke all on function public.get_item_detail_status(bigint) from public;
grant execute on function public.get_item_detail_status(bigint)
  to authenticated, service_role;

-- ── claim (Mac / service_role) — explicit asks only ────────────────────────
drop function if exists public.claim_item_detail_jobs(text, int);
create function public.claim_item_detail_jobs(
  p_host  text,
  p_limit int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_host text := left(nullif(btrim(coalesce(p_host, '')), ''), 80);
  v_lim  int := greatest(1, least(coalesce(p_limit, 1), 3));
  v_out  jsonb;
begin
  if v_host is null then
    return '[]'::jsonb;
  end if;

  update public.item_detail_queue
     set status = 'pending',
         claimed_by = null,
         claimed_at = null,
         lease_expires_at = null
   where status = 'claimed'
     and coalesce(lease_expires_at, claimed_at) < now();

  with next as (
    select q.item_id
      from public.item_detail_queue q
     where q.status = 'pending'
       and q.attempts < 3
       and q.priority <= 10
       and q.shop_id is not null
       -- A failed live fetch waits 2 minutes unless the person asked again.
       and (
         q.last_attempt_at is null
         or q.last_attempt_at < now() - interval '2 minutes'
         or q.last_queued_at > q.last_attempt_at
       )
     order by q.priority, q.open_count desc, q.last_queued_at
     limit v_lim
     for update skip locked
  ),
  claimed as (
    update public.item_detail_queue q
       set status = 'claimed',
           claimed_by = v_host,
           claimed_at = now(),
           lease_expires_at = now() + interval '3 minutes',
           last_attempt_at = now(),
           attempts = q.attempts + 1
      from next n
     where q.item_id = n.item_id
     returning q.item_id, q.shop_id, q.keyword, q.priority, q.attempts
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', c.item_id,
             'shop_id', c.shop_id,
             'keyword', c.keyword,
             'priority', c.priority,
             'attempts', c.attempts
           )
         ), '[]'::jsonb)
    into v_out
    from claimed c;

  return coalesce(v_out, '[]'::jsonb);
end $$;

comment on function public.claim_item_detail_jobs(text, int) is
  'Mac poller: lease explicit Minta info rows (priority <= 10). '
  'Auto queue (priority 50) stays on tracked_pass. service_role only.';

revoke all on function public.claim_item_detail_jobs(text, int) from public, anon, authenticated;
grant execute on function public.claim_item_detail_jobs(text, int) to service_role;

-- ── complete (Mac) → product_details now, not at the nightly push ──────────
drop function if exists public.complete_item_detail(bigint, text, boolean, jsonb, text, text);
create function public.complete_item_detail(
  p_item_id      bigint,
  p_host         text,
  p_ok           boolean,
  p_detail       jsonb default null,
  p_fetch_status text default null,
  p_error        text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_q      public.item_detail_queue%rowtype;
  v_host   text := left(nullif(btrim(coalesce(p_host, '')), ''), 80);
  v_shop   bigint;
  v_models jsonb;
  v_tiers  jsonb;
  v_attrs  jsonb;
  v_cats   jsonb;
  v_images jsonb;
  v_rating jsonb;
  v_fs     text;
begin
  if p_item_id is null or p_item_id <= 0 or v_host is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_args');
  end if;

  select * into v_q
    from public.item_detail_queue
   where item_id = p_item_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_q.status = 'done' then
    return jsonb_build_object('ok', true, 'status', 'done', 'already', true);
  end if;
  if v_q.status = 'claimed' and v_q.claimed_by is distinct from v_host then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  v_fs := lower(coalesce(nullif(btrim(p_fetch_status), ''), ''));

  if not coalesce(p_ok, false) or v_fs = 'gone' then
    update public.item_detail_queue
       set status = case when v_fs = 'gone' then 'gone'
                         when attempts >= 3 then 'failed'
                         else 'pending' end,
           claimed_by = null,
           claimed_at = null,
           lease_expires_at = null,
           fulfilled_at = case when v_fs = 'gone' or attempts >= 3 then now() else null end
     where item_id = p_item_id;
    return jsonb_build_object(
      'ok', true,
      'status', (select status from public.item_detail_queue where item_id = p_item_id),
      'error', left(coalesce(p_error, v_fs, 'failed'), 400)
    );
  end if;

  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    update public.item_detail_queue
       set status = case when attempts >= 3 then 'failed' else 'pending' end,
           claimed_by = null,
           claimed_at = null,
           lease_expires_at = null
     where item_id = p_item_id;
    return jsonb_build_object('ok', false, 'reason', 'bad_detail');
  end if;
  if pg_column_size(p_detail) > 500000 then
    return jsonb_build_object('ok', false, 'reason', 'too_large');
  end if;

  v_shop := coalesce(
    nullif(p_detail->>'shop_id', '')::bigint,
    v_q.shop_id
  );

  v_models := case
    when jsonb_typeof(p_detail->'models_json') = 'array' then p_detail->'models_json'
    when jsonb_typeof(p_detail->'models_json') = 'string'
         and (p_detail->>'models_json') ~ '^\s*\[' then (p_detail->>'models_json')::jsonb
    else null end;
  v_tiers := case
    when jsonb_typeof(p_detail->'tier_variations_json') = 'array' then p_detail->'tier_variations_json'
    when jsonb_typeof(p_detail->'tier_variations_json') = 'string'
         and (p_detail->>'tier_variations_json') ~ '^\s*\[' then (p_detail->>'tier_variations_json')::jsonb
    else null end;
  v_attrs := case
    when jsonb_typeof(p_detail->'attributes_json') in ('array', 'object') then p_detail->'attributes_json'
    when jsonb_typeof(p_detail->'attributes_json') = 'string'
         and (p_detail->>'attributes_json') ~ '^\s*[\[{]' then (p_detail->>'attributes_json')::jsonb
    else null end;
  v_cats := case
    when jsonb_typeof(p_detail->'categories_json') in ('array', 'object') then p_detail->'categories_json'
    when jsonb_typeof(p_detail->'categories_json') = 'string'
         and (p_detail->>'categories_json') ~ '^\s*[\[{]' then (p_detail->>'categories_json')::jsonb
    else null end;
  v_images := case
    when jsonb_typeof(p_detail->'images_json') = 'array' then p_detail->'images_json'
    when jsonb_typeof(p_detail->'images_json') = 'string'
         and (p_detail->>'images_json') ~ '^\s*\[' then (p_detail->>'images_json')::jsonb
    else null end;
  v_rating := case
    when jsonb_typeof(p_detail->'rating_breakdown_json') in ('array', 'object') then p_detail->'rating_breakdown_json'
    when jsonb_typeof(p_detail->'rating_breakdown_json') = 'string'
         and (p_detail->>'rating_breakdown_json') ~ '^\s*[\[{]' then (p_detail->>'rating_breakdown_json')::jsonb
    else null end;

  insert into public.product_details (
    item_id, shop_id, detail_scraped_at, fetch_status, source, product_name,
    description, hashtags, search_keywords, attributes_json, categories_json,
    brand, condition, preorder_days, images_json, video_count,
    tier_variations_json, models_json, rating_breakdown_json,
    liked_count, comment_count, ctime, shop_location, ships_from, is_free_shipping,
    sku_count, tier_count)
  values (
    p_item_id,
    v_shop,
    now(),
    'ok',
    'live_pdp',
    left(nullif(btrim(p_detail->>'product_name'), ''), 500),
    left(nullif(p_detail->>'description', ''), 20000),
    left(nullif(p_detail->>'hashtags', ''), 2000),
    left(nullif(p_detail->>'search_keywords', ''), 2000),
    v_attrs,
    v_cats,
    left(nullif(btrim(p_detail->>'brand'), ''), 200),
    left(nullif(btrim(p_detail->>'condition'), ''), 40),
    case when coalesce(p_detail->>'preorder_days', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
         then trunc((p_detail->>'preorder_days')::numeric)::int end,
    v_images,
    case when coalesce(p_detail->>'video_count', '') ~ '^-?[0-9]+$'
         then (p_detail->>'video_count')::int end,
    v_tiers,
    v_models,
    v_rating,
    case when coalesce(p_detail->>'liked_count', '') ~ '^-?[0-9]+$'
         then (p_detail->>'liked_count')::int end,
    case when coalesce(p_detail->>'comment_count', '') ~ '^-?[0-9]+$'
         then (p_detail->>'comment_count')::int end,
    case when coalesce(p_detail->>'ctime', '') ~ '^[0-9]{4}-'
         then (p_detail->>'ctime')::timestamptz end,
    left(nullif(btrim(p_detail->>'shop_location'), ''), 120),
    left(nullif(btrim(p_detail->>'ships_from'), ''), 120),
    case
      when jsonb_typeof(p_detail->'is_free_shipping') = 'boolean'
        then (p_detail->>'is_free_shipping')::boolean
      when lower(coalesce(p_detail->>'is_free_shipping', '')) in ('true', 't', '1') then true
      when lower(coalesce(p_detail->>'is_free_shipping', '')) in ('false', 'f', '0') then false
      else null
    end,
    case when jsonb_typeof(v_models) = 'array' then jsonb_array_length(v_models) end,
    case when jsonb_typeof(v_tiers) = 'array' then jsonb_array_length(v_tiers) end
  )
  on conflict (item_id) do update
    set shop_id               = coalesce(excluded.shop_id, product_details.shop_id),
        detail_scraped_at     = excluded.detail_scraped_at,
        fetch_status          = 'ok',
        source                = 'live_pdp',
        product_name          = coalesce(nullif(excluded.product_name, ''), product_details.product_name),
        description           = coalesce(nullif(excluded.description, ''), product_details.description),
        hashtags              = coalesce(excluded.hashtags, product_details.hashtags),
        search_keywords       = coalesce(excluded.search_keywords, product_details.search_keywords),
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
        liked_count           = coalesce(excluded.liked_count, product_details.liked_count),
        comment_count         = coalesce(excluded.comment_count, product_details.comment_count),
        ctime                 = coalesce(excluded.ctime, product_details.ctime),
        shop_location         = coalesce(nullif(excluded.shop_location, ''), product_details.shop_location),
        ships_from            = coalesce(nullif(excluded.ships_from, ''), product_details.ships_from),
        is_free_shipping      = coalesce(excluded.is_free_shipping, product_details.is_free_shipping),
        sku_count             = coalesce(excluded.sku_count, product_details.sku_count),
        tier_count            = coalesce(excluded.tier_count, product_details.tier_count);

  if jsonb_typeof(p_detail->'sample_reviews_json') = 'array' then
    perform public._ext_apply_sample_reviews(
      p_item_id, v_shop, p_detail->'sample_reviews_json', 'live_pdp');
  end if;

  update public.item_detail_queue
     set status = 'done',
         fulfilled_at = now(),
         claimed_by = null,
         claimed_at = null,
         lease_expires_at = null,
         shop_id = coalesce(shop_id, v_shop)
   where item_id = p_item_id;

  perform public.fulfill_item_detail_requests();

  return jsonb_build_object(
    'ok', true,
    'status', 'done',
    'item_id', p_item_id,
    'shop_id', v_shop
  );
exception
  when invalid_text_representation or datetime_field_overflow then
    update public.item_detail_queue
       set status = case when attempts >= 3 then 'failed' else 'pending' end,
           claimed_by = null,
           claimed_at = null,
           lease_expires_at = null
     where item_id = p_item_id;
    return jsonb_build_object('ok', false, 'reason', 'bad_detail', 'error', left(sqlerrm, 300));
end $$;

comment on function public.complete_item_detail(bigint, text, boolean, jsonb, text, text) is
  'Mac: finish a live PDP fetch into product_details and wake Minta info. '
  'service_role only. Does not wait for push_details.py.';

revoke all on function public.complete_item_detail(bigint, text, boolean, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_item_detail(bigint, text, boolean, jsonb, text, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
