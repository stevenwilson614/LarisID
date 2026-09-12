-- "Minta data varian" — a per-item PDP queue behind the deep dive's
-- Varian & Ulasan cards.
--
-- WHY. product_details (varian, harga per varian, rincian bintang, merek) is
-- written daily by the scraper's tracked pass, so it covers the ~31 favourited
-- items and nothing else: of the 425 products opened in the last 30 days, 15
-- had a row. The two new cards therefore show an honest empty state for almost
-- every dive. This migration is the half that fixes coverage, and it can be
-- small because demand is tiny and concentrated — 425 items a month is ~14/day,
-- well inside what tracked_pass.py already does at its safe 6-14s cadence.
--
-- SHAPE. Two tables, deliberately:
--   item_detail_queue    — item grain, no user. The work list. Auto-filled from
--                          log_deepdive_open, which fires for ANONYMOUS dives
--                          too (they get one free by design), so the queue
--                          cannot hang off a user id.
--   item_detail_requests — user grain. Who asked, so we can tell them when it
--                          lands. Mirrors keyword_scrape_requests field for
--                          field, including the card_shown_at / notified_at
--                          split, so the existing lnotice card can drive it.
--
-- SECURITY. Neither anon nor authenticated may write either table: requests go
-- through request_item_detail() and the auto-enqueue lives inside an existing
-- SECURITY DEFINER function. Grants are written out explicitly because this
-- box's default ACL (pg_default_acl) still grants arwdDxtm in public to BOTH
-- anon and authenticated — 20260905120000 revoked the defaults from anon only,
-- and never touched select or authenticated. A new table inherits privileges
-- nobody asked for unless the migration revokes them by name.
--
-- WHAT THIS DOES NOT DO. Nothing here produces a per-variant sales figure.
-- Shopee's PDP payload returns sold = null and stock = null on every model
-- (0 of 1,675 in the pilot), so per-variant demand is not something we are
-- one scrape away from — it does not exist on the endpoint at all.

-- ── 1. The work queue ────────────────────────────────────────────────────────
create table if not exists public.item_detail_queue (
  item_id         bigint primary key,
  shop_id         bigint,
  keyword         text,
  status          text not null default 'pending'
                  check (status in ('pending', 'done', 'failed', 'gone')),
  -- 10 = a person asked for it, 50 = auto-queued because someone opened it.
  priority        int  not null default 50,
  reason          text not null default 'auto' check (reason in ('auto', 'request', 'admin')),
  open_count      int  not null default 1,
  first_queued_at timestamptz not null default now(),
  last_queued_at  timestamptz not null default now(),
  attempts        int  not null default 0,
  last_attempt_at timestamptz,
  fulfilled_at    timestamptz
);

comment on table public.item_detail_queue is
  'Items whose Shopee product page we still need to open. Drained by '
  'shopee_scraper/tracked_pass.py after the tracked items, capped per run.';
comment on column public.item_detail_queue.open_count is
  'How many dives/requests have piled onto this item. Doubles as the ordering '
  'signal: 46 of last month''s 425 opened items were opened 3+ times.';
comment on column public.item_detail_queue.attempts is
  'Capped at 3 by the pass. One permanently unfetchable item must not be able '
  'to eat the daily budget forever.';

create index if not exists item_detail_queue_pending_idx
  on public.item_detail_queue (priority, open_count desc, last_queued_at desc)
  where status = 'pending';

-- ── 2. Who asked ─────────────────────────────────────────────────────────────
create table if not exists public.item_detail_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  item_id           bigint not null,
  shop_id           bigint,
  keyword           text,
  -- Denormalised on purpose: the "datanya siap" card has to name the product
  -- and reopen its dive, and the listings row may have rotated out by then.
  product_name      text,
  status            text not null default 'pending'
                    check (status in ('pending', 'ready', 'notified', 'cancelled')),
  source            text,
  notify_when_ready boolean not null default true,
  notify_wa         text,
  created_at        timestamptz not null default now(),
  fulfilled_at      timestamptz,
  notified_at       timestamptz,
  card_shown_at     timestamptz
);

create unique index if not exists item_detail_requests_user_item_pending_uidx
  on public.item_detail_requests (user_id, item_id) where status = 'pending';
create index if not exists item_detail_requests_user_created_idx
  on public.item_detail_requests (user_id, created_at desc);
create index if not exists item_detail_requests_pending_idx
  on public.item_detail_requests (status, created_at desc) where status = 'pending';

-- ── 3. RLS and grants, spelled out ───────────────────────────────────────────
alter table public.item_detail_queue    enable row level security;
alter table public.item_detail_requests enable row level security;

revoke all on table public.item_detail_queue    from anon, authenticated;
revoke all on table public.item_detail_requests from anon, authenticated;

drop policy if exists "item_detail_queue_admin_all" on public.item_detail_queue;
create policy "item_detail_queue_admin_all" on public.item_detail_queue
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select on public.item_detail_queue to authenticated;

drop policy if exists "item_detail_requests_owner_select" on public.item_detail_requests;
create policy "item_detail_requests_owner_select" on public.item_detail_requests
  for select to authenticated using (user_id = auth.uid());

-- Update, not insert: the client only ever acks its own card (card_shown_at,
-- status -> notified), exactly as it already does for keyword requests.
drop policy if exists "item_detail_requests_owner_update" on public.item_detail_requests;
create policy "item_detail_requests_owner_update" on public.item_detail_requests
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "item_detail_requests_admin_all" on public.item_detail_requests;
create policy "item_detail_requests_admin_all" on public.item_detail_requests
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select, update on public.item_detail_requests to authenticated;

-- ── 4. The request RPC ───────────────────────────────────────────────────────
-- One verdict, same honesty contract as request_scrape_keywords. No brand-style
-- rejection guard: an item_id is unambiguous, there is nothing to misread.
drop function if exists public.request_item_detail(bigint, bigint, text, text, text);
create function public.request_item_detail(
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

  -- Fresh enough to answer right now: the client just re-reads the row.
  if v_fresh is not null and v_fresh > now() - interval '7 days' then
    return jsonb_build_object('verdict', 'already_live', 'detail_scraped_at', v_fresh);
  end if;

  -- Rolling 24h budget. Higher than the keyword RPC's 3 because one item is
  -- ~25 seconds of scrape time against a whole page set for a keyword.
  select count(*) into v_recent
    from public.item_detail_requests
   where user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    return jsonb_build_object('verdict', 'rate_limited');
  end if;

  insert into public.item_detail_queue (item_id, shop_id, keyword, priority, reason)
  values (p_item_id, p_shop_id, nullif(btrim(coalesce(p_keyword, '')), ''), 10, 'request')
  on conflict (item_id) do update
    set priority       = least(public.item_detail_queue.priority, 10),
        reason         = 'request',
        open_count     = public.item_detail_queue.open_count + 1,
        last_queued_at = now(),
        shop_id        = coalesce(public.item_detail_queue.shop_id, excluded.shop_id),
        keyword        = coalesce(public.item_detail_queue.keyword, excluded.keyword),
        -- A previously failed or done-but-stale item goes back on the list.
        status         = case when public.item_detail_queue.status in ('failed', 'done')
                              then 'pending' else public.item_detail_queue.status end,
        attempts       = case when public.item_detail_queue.status = 'failed'
                              then 0 else public.item_detail_queue.attempts end;

  insert into public.item_detail_requests
         (user_id, item_id, shop_id, keyword, product_name, source)
  values (v_uid, p_item_id, p_shop_id,
          nullif(btrim(coalesce(p_keyword, '')), ''),
          left(nullif(btrim(coalesce(p_product_name, '')), ''), 300),
          p_source)
  on conflict do nothing;

  return jsonb_build_object('verdict',
    case when v_fresh is null then 'queued' else 'queued_refresh' end);
end $$;

revoke all on function public.request_item_detail(bigint, bigint, text, text, text) from public, anon;
grant execute on function public.request_item_detail(bigint, bigint, text, text, text) to authenticated;

-- ── 5. Auto-enqueue, inside the open counter ─────────────────────────────────
-- log_deepdive_open already fires on every dive, anonymous included, is already
-- definer, and is already called fire-and-forget by the client. Appending here
-- costs no round trip and needs no client code.
--
-- Two rules this rewrite must keep:
--   * the enqueue is wrapped in its own exception block. This function's
--     contract is that it never refuses; a constraint violation in a side
--     effect must not turn a dive into an error.
--   * deepdive_opens.item_id is text (it matches product_views), so the cast
--     is guarded by a digits-only test rather than assumed.
create or replace function public.log_deepdive_open(
  p_item_id    text default null,
  p_shop_id    text default null,
  p_keyword    text default null,
  p_visitor_id text default null,
  p_source     text default 'app'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item text := left(nullif(btrim(coalesce(p_item_id, '')), ''), 40);
  v_shop text := left(nullif(btrim(coalesce(p_shop_id, '')), ''), 40);
  v_kw   text := left(nullif(btrim(coalesce(p_keyword, '')), ''), 160);
begin
  -- Never refuses. A deep dive that opened is a deep dive that happened; the
  -- caller must not be able to interpret any return value as a wall.
  insert into public.deepdive_opens
    (user_id, visitor_id, item_id, shop_id, keyword, source)
  values
    (auth.uid(),
     left(nullif(btrim(coalesce(p_visitor_id, '')), ''), 64),
     v_item, v_shop, v_kw,
     case when coalesce(p_source, '') in ('app', 'backfill') then p_source else 'app' end);

  begin
    if v_item ~ '^\d+$' and not exists (
         select 1 from public.product_details d
          where d.item_id = v_item::bigint
            and d.fetch_status = 'ok'
            and d.detail_scraped_at > now() - interval '14 days') then
      insert into public.item_detail_queue (item_id, shop_id, keyword, priority, reason)
      values (v_item::bigint,
              case when v_shop ~ '^\d+$' then v_shop::bigint end,
              v_kw, 50, 'auto')
      on conflict (item_id) do update
        set open_count     = public.item_detail_queue.open_count + 1,
            last_queued_at = now(),
            keyword        = coalesce(public.item_detail_queue.keyword, excluded.keyword),
            shop_id        = coalesce(public.item_detail_queue.shop_id, excluded.shop_id);
    end if;
  exception when others then null;
  end;

  return json_build_object('ok', true);
end $$;

-- log_deepdive_open is called by anonymous visitors: keep its existing grants.
revoke all on function public.log_deepdive_open(text, text, text, text, text) from public;
grant execute on function public.log_deepdive_open(text, text, text, text, text) to anon, authenticated, service_role;

-- ── 6. What the scraper reads ────────────────────────────────────────────────
create or replace view public.v_detail_queue as
  select q.item_id, q.shop_id, q.keyword, q.priority, q.open_count,
         q.attempts, q.last_queued_at
    from public.item_detail_queue q
   where q.status = 'pending' and q.attempts < 3
   order by q.priority, q.open_count desc, q.last_queued_at desc;

revoke all on public.v_detail_queue from anon, authenticated;
grant select on public.v_detail_queue to service_role;

-- ── 7. Fulfilment ────────────────────────────────────────────────────────────
-- Fires on data landing, not on a timer: the scraper can be blocked for a day,
-- and a silent queue is honest where a premature "siap" is not.
drop function if exists public.fulfill_item_detail_requests();
create function public.fulfill_item_detail_requests()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.item_detail_queue q
     set status = 'done', fulfilled_at = now()
   where q.status = 'pending'
     and exists (select 1 from public.product_details d
                  where d.item_id = q.item_id
                    and d.fetch_status = 'ok'
                    and d.detail_scraped_at >= q.last_queued_at);

  update public.item_detail_requests r
     set status = 'ready', fulfilled_at = now()
   where r.status = 'pending'
     and exists (select 1 from public.product_details d
                  where d.item_id = r.item_id
                    and d.fetch_status = 'ok'
                    and d.detail_scraped_at >= r.created_at);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.fulfill_item_detail_requests() from public, anon, authenticated;

-- 02:35 WIB, five minutes after fulfill-scrape-requests and after the daily push.
select cron.unschedule('fulfill-item-detail-requests')
 where exists (select 1 from cron.job where jobname = 'fulfill-item-detail-requests');
select cron.schedule('fulfill-item-detail-requests', '35 19 * * *',
                     $cron$select public.fulfill_item_detail_requests();$cron$);

notify pgrst, 'reload schema';
