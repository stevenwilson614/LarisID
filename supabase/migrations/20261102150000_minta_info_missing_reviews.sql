-- Minta info: a live_pdp row without sample reviews is not "already live".
-- The Mac PDP pass used to skip get_ratings, so Deep Dive got varian/SKU but
-- no top/bottom ulasan. Allow a second ask to re-queue until samples land
-- (or the product has zero comments, so there is nothing to pull).

begin;
set local statement_timeout to '30s';

create or replace function public.request_item_detail(
  p_item_id      bigint,
  p_shop_id      bigint default null,
  p_keyword      text   default null,
  p_product_name text   default null,
  p_source       text   default 'deepdive'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_fresh    timestamptz;
  v_samples  jsonb;
  v_comments int;
  v_recent   int;
  v_verdict  text;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_item_id is null then
    return jsonb_build_object('verdict', 'rejected_input');
  end if;

  select d.detail_scraped_at, d.sample_reviews_json, d.comment_count
    into v_fresh, v_samples, v_comments
    from public.product_details d
   where d.item_id = p_item_id and d.fetch_status = 'ok';

  -- Fresh detail counts as done only when we already have sample reviews,
  -- or the listing has no comments to sample.
  if v_fresh is not null
     and v_fresh > now() - interval '7 days'
     and (
       (jsonb_typeof(v_samples) = 'array' and jsonb_array_length(v_samples) > 0)
       or coalesce(v_comments, 0) = 0
     ) then
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
        attempts       = case when public.item_detail_queue.status in ('failed', 'done')
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

comment on function public.request_item_detail(bigint, bigint, text, text, text) is
  'Deep Dive Minta info enqueue. already_live only when product_details is '
  'fresh AND has sample reviews (or zero comments). Missing top/bottom '
  'ulasan re-queues as queued_refresh.';

notify pgrst, 'reload schema';
commit;
