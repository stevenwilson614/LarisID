-- ============================================================================
-- Tracking RPCs — the shared backend for Site A and Site B.
--
-- Both apps call these identically; only markup and render calls differ between
-- laris-app.js and gpt-app.js. All slot limits, dedupe, pause/resume and delta
-- shaping live here so the bug-prone logic exists exactly once.
--
-- Day boundary follows the existing convention: Asia/Jakarta via _usage_day().
-- ============================================================================

begin;

-- ── Read: the user's whole tracking config in one call ──────────────────────
create or replace function public.get_my_tracking()
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_st public.user_tracker_state%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_st from public.user_tracker_state where user_id = v_me;

  return json_build_object(
    'keyword_limit', public.tracking_keyword_limit(),
    'store_limit',   public.tracking_store_limit(),
    'paused',        (v_st.paused_at is not null),
    'paused_at',     v_st.paused_at,
    'last_viewed_at',v_st.last_viewed_at,
    'keywords', coalesce((
      select json_agg(json_build_object(
               'id', k.id, 'keyword', k.keyword, 'category', k.category,
               'created_at', k.created_at) order by k.created_at)
      from public.user_tracked_keywords k where k.user_id = v_me), '[]'::json),
    'stores', coalesce((
      select json_agg(json_build_object(
               'id', s.id, 'shop_id', s.shop_id, 'store_name', s.store_name,
               'created_at', s.created_at) order by s.created_at)
      from public.user_tracked_stores s where s.user_id = v_me), '[]'::json)
  );
end $$;

-- ── Write: add / remove slots ───────────────────────────────────────────────
-- The slot-limit trigger raises check_violation; we translate that into a clean
-- json error so the client never has to parse a Postgres exception string.
create or replace function public.add_tracked_keyword(p_keyword text, p_category text default '')
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_kw text := btrim(coalesce(p_keyword, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if length(v_kw) < 2 then
    return json_build_object('ok', false, 'error', 'keyword_too_short');
  end if;

  insert into public.user_tracker_state (user_id) values (v_me)
    on conflict (user_id) do nothing;

  begin
    insert into public.user_tracked_keywords (user_id, keyword, category)
    values (v_me, v_kw, coalesce(p_category, ''))
    returning id into v_id;
  exception
    when unique_violation then
      return json_build_object('ok', false, 'error', 'already_tracked');
    when check_violation then
      return json_build_object('ok', false, 'error', 'limit_reached',
                               'limit', public.tracking_keyword_limit());
  end;

  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.add_tracked_store(p_shop_id bigint, p_store_name text default '')
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_shop_id is null then
    return json_build_object('ok', false, 'error', 'shop_id_required');
  end if;

  insert into public.user_tracker_state (user_id) values (v_me)
    on conflict (user_id) do nothing;

  begin
    insert into public.user_tracked_stores (user_id, shop_id, store_name)
    values (v_me, p_shop_id, coalesce(p_store_name, ''))
    returning id into v_id;
  exception
    when unique_violation then
      return json_build_object('ok', false, 'error', 'already_tracked');
    when check_violation then
      return json_build_object('ok', false, 'error', 'limit_reached',
                               'limit', public.tracking_store_limit());
  end;

  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.remove_tracked_keyword(p_id uuid)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.user_tracked_keywords where id = p_id and user_id = v_me;
  return json_build_object('ok', found);
end $$;

create or replace function public.remove_tracked_store(p_id uuid)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  delete from public.user_tracked_stores where id = p_id and user_id = v_me;
  return json_build_object('ok', found);
end $$;

-- ── Heartbeat: called when the user opens the tracker ───────────────────────
-- Also the resume path. A paused user who comes back is the conversion event
-- for the day-11 warning, so it is counted separately from ordinary returns.
create or replace function public.touch_tracker_viewed()
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me      uuid := auth.uid();
  v_was_paused boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select (paused_at is not null) into v_was_paused
    from public.user_tracker_state where user_id = v_me;

  insert into public.user_tracker_state (user_id, last_viewed_at)
  values (v_me, now())
  on conflict (user_id) do update
    set last_viewed_at = now(),
        paused_at      = null,
        warned_at      = null,
        -- Unqualified table name: inside DO UPDATE the target row is referenced
        -- by the table's own name, not a schema-qualified path.
        resumed_count  = user_tracker_state.resumed_count
                         + case when user_tracker_state.paused_at is not null
                                then 1 else 0 end;

  return json_build_object('ok', true, 'resumed', coalesce(v_was_paused, false));
end $$;

-- ── The headline screen ─────────────────────────────────────────────────────
-- Returns per-item rollups over a window, for everything the caller tracks.
--
-- WHY A ROLLING WINDOW AND NOT "YESTERDAY":
-- Shopee only exposes exact sold counts below 1,000. Above that the delta model
-- estimates from review_delta x a learned multiplier, and at a 1-day gap a
-- high-volume product often gets zero new reviews — so the honest daily number
-- for a top seller is a spiky sequence of 0, 0, 7. Summing estimated_sold_delta
-- across p_days smooths that into something a seller can act on. Low-volume
-- items are exact-tier and accurate daily; it is specifically the big sellers
-- that need the window.
--
-- Sargability: both branches filter scraped_at with a bare-column range so they
-- use idx_ld_scraped / idx_ld_keyword / idx_ld_shop_scraped. Never wrap
-- scraped_at in date() here — that is a full scan on this box.
create or replace function public.get_tracker_deltas(p_days int default 7)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me    uuid := auth.uid();
  v_from  timestamptz;
  v_days  int := greatest(1, least(coalesce(p_days, 7), 30));
  v_kws   text[];
  v_shops bigint[];
  v_moved json;
  v_fresh timestamptz;
  v_has_history boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  v_from := now() - make_interval(days => v_days);

  select array_agg(lower(btrim(keyword))) into v_kws
    from public.user_tracked_keywords where user_id = v_me;
  select array_agg(shop_id) into v_shops
    from public.user_tracked_stores where user_id = v_me;

  if (v_kws is null or cardinality(v_kws) = 0)
     and (v_shops is null or cardinality(v_shops) = 0) then
    return json_build_object('configured', false, 'moved', '[]'::json,
                             'as_of', null, 'window_days', v_days,
                             'has_history', false);
  end if;

  -- Has the scraper EVER produced a delta row for this user's keywords?
  --
  -- Without this the client cannot tell two very different states apart, because
  -- `as_of` below is max(last_at) over the subquery that already filters
  -- sold_window > 0 — so "nothing moved this week" and "we have never scraped
  -- your keywords" both return moved=[] and as_of=null.
  --
  -- They need opposite screens: the first says "your keywords were quiet", the
  -- second says "we're collecting your first data, come back tomorrow morning".
  -- Getting it wrong means every user whose keywords are merely flat is told to
  -- come back tomorrow, forever. listing_deltas has no grant to `authenticated`,
  -- so the client cannot work this out for itself.
  --
  -- Deliberately NOT time-bounded by v_from: the question is "ever", not
  -- "in the current window".
  select exists (
    select 1 from public.listing_deltas dd
    where ( (v_kws   is not null and lower(dd.keyword) = any(v_kws))
         or (v_shops is not null and dd.shop_id = any(v_shops)) )
  ) into v_has_history;

  with d as (
    select dd.item_id, dd.shop_id, dd.keyword, dd.category,
           dd.estimated_sold_delta, dd.confidence, dd.scraped_at,
           case when v_shops is not null and dd.shop_id = any(v_shops)
                then 'store' else 'keyword' end as source
    from public.listing_deltas dd
    where dd.scraped_at >= v_from
      and ( (v_kws   is not null and lower(dd.keyword) = any(v_kws))
         or (v_shops is not null and dd.shop_id = any(v_shops)) )
  ),
  agg as (
    select item_id, shop_id,
           max(keyword)  as keyword,
           max(category) as category,
           -- 'store' sorts after 'keyword', so max() prefers the store
           -- attribution when an item matches both — the more specific signal.
           max(source)   as source,
           sum(coalesce(estimated_sold_delta, 0))::bigint as sold_window,
           max(scraped_at) as last_at,
           -- Worst confidence across the window: never present a low-confidence
           -- estimate as if it were exact.
           case when bool_or(confidence = 'low')    then 'low'
                when bool_or(confidence = 'medium') then 'medium'
                else 'high' end as confidence
    from d group by item_id, shop_id
  )
  select json_agg(x order by x.sold_window desc), max(x.last_at)
    into v_moved, v_fresh
  from (
    select a.*, l.product_name, l.image_url, l.price, l.store_name, l.total_sold
    from agg a
    join public.listings_latest l
      on l.item_id = a.item_id and l.shop_id = a.shop_id
    where a.sold_window > 0
    -- ORDER BY must be INSIDE the subquery: a bare LIMIT would take an
    -- arbitrary 60 rows, not the top 60 movers. The outer json_agg ORDER BY
    -- only sorts whatever survived the limit.
    order by a.sold_window desc
    limit 60
  ) x;

  return json_build_object(
    'configured',  true,
    'window_days', v_days,
    'as_of',       v_fresh,
    'has_history', v_has_history,
    'moved',       coalesce(v_moved, '[]'::json)
  );
end $$;

-- ── Grants (revoke anon explicitly by name — default privileges re-grant) ───
revoke all on function
  public.get_my_tracking(),
  public.add_tracked_keyword(text, text),
  public.add_tracked_store(bigint, text),
  public.remove_tracked_keyword(uuid),
  public.remove_tracked_store(uuid),
  public.touch_tracker_viewed(),
  public.get_tracker_deltas(int)
from public, anon;

grant execute on function
  public.get_my_tracking(),
  public.add_tracked_keyword(text, text),
  public.add_tracked_store(bigint, text),
  public.remove_tracked_keyword(uuid),
  public.remove_tracked_store(uuid),
  public.touch_tracker_viewed(),
  public.get_tracker_deltas(int)
to authenticated;

commit;

notify pgrst, 'reload schema';
