-- ============================================================================
-- Favorit Aku — product-grain favorites replace keyword Pantauan as the live
-- tracking model.
--
-- Writes resume on user_tracked_products (write path frozen 2026-08-10).
-- Daily PDP refresh is still tracked_pass.py reading v_tracked_products
-- (~200 global ceiling at ~40s/item). Per-user cap is 30, framed as a
-- freshness limit, never an upsell.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260906123000_favorit_aku.sql
-- ============================================================================

begin;

-- ── Cap ─────────────────────────────────────────────────────────────────────
create or replace function public.tracking_product_limit() returns int
  language sql immutable as $$ select 30 $$;

comment on function public.tracking_product_limit() is
  'Per-user Favorit Aku cap. Bound by tracked_pass.py capacity (~200 distinct '
  'products globally), not a paid-tier gate.';

create or replace function public.enforce_tracked_product_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n   int;
  cap int := public.tracking_product_limit();
begin
  select count(*) into n from public.user_tracked_products where user_id = new.user_id;
  if n >= cap then
    raise exception 'product favorite limit reached (% of %)', n, cap
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_utp_limit on public.user_tracked_products;
create trigger trg_utp_limit before insert on public.user_tracked_products
  for each row execute function public.enforce_tracked_product_limit();

-- ── Notify cadence ──────────────────────────────────────────────────────────
alter table public.user_tracker_state
  add column if not exists notify_cadence text not null default 'on_update';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_tracker_state_notify_cadence_valid'
  ) then
    alter table public.user_tracker_state
      add constraint user_tracker_state_notify_cadence_valid
      check (notify_cadence in ('on_update', 'weekly'));
  end if;
end $$;

comment on column public.user_tracker_state.notify_cadence is
  'on_update = send when a favorite moves (max one/day). weekly = Monday 08:00 WIB digest.';

-- CREATE OR REPLACE cannot change the argument list.
drop function if exists public.set_tracker_notify_prefs(text[], text);

create function public.set_tracker_notify_prefs(
  p_channels  text[] default '{}'::text[],
  p_wa_number text default null,
  p_cadence   text default 'on_update'
)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me      uuid := auth.uid();
  v_clean   text[];
  v_phone   text;
  v_cadence text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select coalesce(array_agg(distinct c order by c), '{}'::text[]) into v_clean
  from unnest(coalesce(p_channels, '{}'::text[])) c
  where c = any(public.tracker_valid_notify_channels());

  v_phone := public.normalise_wa_phone(p_wa_number);
  v_cadence := case when p_cadence in ('on_update', 'weekly') then p_cadence else 'on_update' end;

  if v_phone is null then
    select public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                              nullif(btrim(p.public_whatsapp), '')))
      into v_phone
    from public.user_profiles p where p.user_id = v_me;
  end if;

  if 'whatsapp' = any(v_clean) and v_phone is null then
    return json_build_object('ok', false, 'error', 'wa_number_required');
  end if;

  insert into public.user_tracker_state
    (user_id, notify_channels, notify_wa_number, notify_asked_at, notify_cadence)
  values (v_me, v_clean, v_phone, now(), v_cadence)
  on conflict (user_id) do update
    set notify_channels  = excluded.notify_channels,
        notify_wa_number = coalesce(excluded.notify_wa_number, public.user_tracker_state.notify_wa_number),
        notify_asked_at  = now(),
        notify_cadence   = excluded.notify_cadence;

  return json_build_object(
    'ok', true,
    'notify_channels', v_clean,
    'notify_wa_number', v_phone,
    'notify_cadence', v_cadence
  );
end $$;

-- ── Product favorite RPCs ───────────────────────────────────────────────────
create or replace function public.add_tracked_product(
  p_item_id      bigint,
  p_shop_id      bigint,
  p_keyword      text default '',
  p_product_name text default '',
  p_image_url    text default '',
  p_price        numeric default null,
  p_category     text default '',
  p_store_name   text default '',
  p_total_sold   bigint default null
)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_item_id is null or p_shop_id is null then
    return json_build_object('ok', false, 'error', 'listing_required');
  end if;

  insert into public.user_tracker_state (user_id) values (v_me)
    on conflict (user_id) do nothing;

  begin
    insert into public.user_tracked_products (
      user_id, item_id, shop_id, keyword, product_name, image_url,
      price, category, store_name, total_sold, tracked_at
    ) values (
      v_me, p_item_id, p_shop_id,
      coalesce(nullif(btrim(p_keyword), ''), ''),
      coalesce(nullif(btrim(p_product_name), ''), ''),
      coalesce(nullif(btrim(p_image_url), ''), ''),
      p_price,
      coalesce(nullif(btrim(p_category), ''), ''),
      coalesce(nullif(btrim(p_store_name), ''), ''),
      p_total_sold,
      now()
    )
    on conflict (user_id, item_id, shop_id) do update
      set keyword      = coalesce(nullif(btrim(excluded.keyword), ''), public.user_tracked_products.keyword),
          product_name = coalesce(nullif(btrim(excluded.product_name), ''), public.user_tracked_products.product_name),
          image_url    = coalesce(nullif(btrim(excluded.image_url), ''), public.user_tracked_products.image_url),
          price        = coalesce(excluded.price, public.user_tracked_products.price),
          category     = coalesce(nullif(btrim(excluded.category), ''), public.user_tracked_products.category),
          store_name   = coalesce(nullif(btrim(excluded.store_name), ''), public.user_tracked_products.store_name),
          total_sold   = coalesce(excluded.total_sold, public.user_tracked_products.total_sold)
    returning id into v_id;
  exception
    when check_violation then
      return json_build_object('ok', false, 'error', 'limit_reached',
                               'limit', public.tracking_product_limit());
  end;

  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.remove_tracked_product(p_item_id bigint, p_shop_id bigint)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_item_id is null or p_shop_id is null then
    return json_build_object('ok', false, 'error', 'listing_required');
  end if;
  delete from public.user_tracked_products
   where user_id = v_me and item_id = p_item_id and shop_id = p_shop_id;
  return json_build_object('ok', found);
end $$;

-- Current listing snapshot (not bookmark-time), plus store-toggle flag.
create or replace function public.get_my_favorites()
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_st public.user_tracker_state%rowtype;
  v_wa text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_st from public.user_tracker_state where user_id = v_me;

  select public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                            nullif(btrim(p.public_whatsapp), '')))
    into v_wa
  from public.user_profiles p where p.user_id = v_me;

  return json_build_object(
    'product_limit', public.tracking_product_limit(),
    'store_limit',   public.tracking_store_limit(),
    'paused',        (v_st.paused_at is not null),
    'paused_at',     v_st.paused_at,
    'last_viewed_at',v_st.last_viewed_at,
    'notify_channels',   coalesce(v_st.notify_channels, '{}'::text[]),
    'all_notify_channels', public.tracker_valid_notify_channels(),
    'notify_wa_number',  coalesce(v_st.notify_wa_number, v_wa),
    'notify_asked',      (v_st.notify_asked_at is not null),
    'notify_cadence',    coalesce(v_st.notify_cadence, 'on_update'),
    'products', coalesce((
      select json_agg(x order by x.tracked_at desc)
      from (
        select
          t.id, t.item_id, t.shop_id, t.tracked_at,
          coalesce(nullif(cur.product_name, ''), t.product_name) as product_name,
          coalesce(nullif(cur.image_url, ''), t.image_url)       as image_url,
          coalesce(cur.price, t.price)                           as price,
          coalesce(cur.total_sold, t.total_sold)                 as total_sold,
          coalesce(nullif(cur.store_name, ''), t.store_name)     as store_name,
          coalesce(nullif(cur.keyword, ''), t.keyword)           as keyword,
          coalesce(nullif(cur.category, ''), t.category)         as category,
          cur.rating, cur.reviews, cur.scraped_at, cur.sold_text,
          exists (
            select 1 from public.user_tracked_stores s
             where s.user_id = v_me and s.shop_id = t.shop_id
          ) as store_tracked
        from public.user_tracked_products t
        left join lateral (
          select l.product_name, l.image_url, l.price, l.total_sold,
                 l.store_name, l.keyword, l.category, l.rating, l.reviews,
                 l.scraped_at, l.sold_text
          from public.listings l
          where l.item_id = t.item_id and l.shop_id = t.shop_id
          order by l.scraped_at desc
          limit 1
        ) cur on true
        where t.user_id = v_me
      ) x), '[]'::json),
    'stores', coalesce((
      select json_agg(json_build_object(
               'id', s.id, 'shop_id', s.shop_id, 'store_name', s.store_name,
               'created_at', s.created_at) order by s.created_at)
      from public.user_tracked_stores s where s.user_id = v_me), '[]'::json)
  );
end $$;

-- Keep get_my_tracking for admin/legacy; expose products + cadence so older
-- clients that still call it are not empty.
create or replace function public.get_my_tracking()
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_fav json;
  v_st public.user_tracker_state%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  v_fav := public.get_my_favorites();
  select * into v_st from public.user_tracker_state where user_id = v_me;
  return (v_fav::jsonb || jsonb_build_object(
    'keyword_limit', public.tracking_keyword_limit(),
    'metrics',       coalesce(v_st.metrics, public.tracker_default_metrics()),
    'all_metrics',   public.tracker_valid_metrics(),
    'keywords', coalesce((
      select json_agg(json_build_object(
               'id', k.id, 'keyword', k.keyword, 'category', k.category,
               'created_at', k.created_at) order by k.created_at)
      from public.user_tracked_keywords k where k.user_id = v_me), '[]'::json)
  ))::json;
end $$;

-- ── Scraper view: skip paused users (no state row = active) ─────────────────
create or replace view public.v_tracked_products as
select distinct on (t.item_id, t.shop_id)
       t.item_id,
       t.shop_id,
       coalesce(t.keyword, '')      as keyword,
       coalesce(t.category, '')     as category,
       coalesce(t.product_name, '') as product_name
from public.user_tracked_products t
left join public.user_tracker_state s on s.user_id = t.user_id
where t.item_id is not null
  and t.shop_id is not null
  and (s.user_id is null or s.paused_at is null)
order by t.item_id, t.shop_id, t.tracked_at desc nulls last;

comment on view public.v_tracked_products is
  'Distinct active Favorit Aku products for tracked_pass.py. Paused users excluded.';

revoke all on public.v_tracked_products from public, anon;
grant select on public.v_tracked_products to service_role;

-- ── Idle decay covers product favorites ─────────────────────────────────────
create or replace function public.tracker_pending_warnings()
returns table (user_id uuid, last_viewed_at timestamptz, days_idle int,
               keyword_count int, pauses_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.user_id,
         s.last_viewed_at,
         extract(day from (now() - s.last_viewed_at))::int as days_idle,
         (
           (select count(*)::int from public.user_tracked_keywords k where k.user_id = s.user_id)
           + (select count(*)::int from public.user_tracked_products p where p.user_id = s.user_id)
         ) as keyword_count,
         s.last_viewed_at + interval '14 days' as pauses_at
  from public.user_tracker_state s
  where s.paused_at is null
    and s.warned_at is null
    and s.last_viewed_at <= now() - interval '11 days'
    and (
      exists (select 1 from public.user_tracked_keywords k where k.user_id = s.user_id)
      or exists (select 1 from public.user_tracked_products p where p.user_id = s.user_id)
    )
$$;

create or replace function public.tracker_apply_pauses()
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare v_n int;
begin
  with paused as (
    update public.user_tracker_state
       set paused_at = now()
     where paused_at is null
       and last_viewed_at <= now() - interval '14 days'
       and (
         exists (select 1 from public.user_tracked_keywords k
                  where k.user_id = user_tracker_state.user_id)
         or exists (select 1 from public.user_tracked_products p
                     where p.user_id = user_tracker_state.user_id)
       )
    returning user_id
  )
  select count(*)::int into v_n from paused;

  return json_build_object('paused', v_n, 'at', now());
end $$;

-- ── Notify: product-grain changes + expanded ledger scope ───────────────────
alter table public.tracker_notifications
  drop constraint if exists tracker_notifications_scope_check;
alter table public.tracker_notifications
  add constraint tracker_notifications_scope_check
  check (scope in ('keyword', 'store', 'product', 'weekly'));

drop function if exists public.tracker_notify_audience();

create function public.tracker_notify_audience()
returns table (
  user_id uuid, email text, email_ok boolean,
  notify_channels text[], notify_wa_number text, notify_cadence text,
  n_keywords int, n_stores int, n_products int
) language sql stable security definer set search_path to 'public, auth' as $$
  select
    st.user_id,
    u.email::text,
    (u.email is not null
       and u.email not like '%@wa.larisid.com'
       and not exists (select 1 from public.email_suppressions s
                        where lower(s.email) = lower(u.email))) as email_ok,
    st.notify_channels,
    st.notify_wa_number,
    coalesce(st.notify_cadence, 'on_update'),
    (select count(*)::int from public.user_tracked_keywords k where k.user_id = st.user_id),
    (select count(*)::int from public.user_tracked_stores  s where s.user_id = st.user_id),
    (select count(*)::int from public.user_tracked_products p where p.user_id = st.user_id)
  from public.user_tracker_state st
  join auth.users u on u.id = st.user_id
  where st.paused_at is null
    and cardinality(coalesce(st.notify_channels, '{}'::text[])) > 0
    and exists (select 1 from public.user_tracked_products p where p.user_id = st.user_id);
$$;

create or replace function public.tracker_data_watermark()
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'keyword_day',  (select max(d) from public.mv_keyword_daily),
    'store_day',    (select max(d) from public.mv_shop_daily),
    'favorite_day', (
      select max((l.scraped_at at time zone 'Asia/Jakarta')::date)
      from public.listings l
      where l.scraped_at >= now() - interval '10 days'
        and exists (
          select 1 from public.user_tracked_products t
           where t.item_id = l.item_id and t.shop_id = l.shop_id
        )
    ),
    'refreshed_at', (select max(refreshed_at) from public.mv_keyword_daily)
  );
$$;

-- Latest two listing-days per favorite. Used by tracker-change-notify.
create or replace function public.favorite_changes_for_user(p_user_id uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_rows json;
begin
  if p_user_id is null then return '[]'::json; end if;

  with tracked as (
    select t.item_id, t.shop_id,
           coalesce(nullif(t.product_name, ''), 'Produk') as product_name,
           coalesce(nullif(t.store_name, ''), '') as store_name
    from public.user_tracked_products t
    where t.user_id = p_user_id
  ),
  days as (
    select distinct on (l.item_id, l.shop_id, (l.scraped_at at time zone 'Asia/Jakarta')::date)
           l.item_id, l.shop_id,
           (l.scraped_at at time zone 'Asia/Jakarta')::date as d,
           l.price, l.total_sold, l.rating, l.sold_text, l.product_name
    from public.listings l
    join tracked t on t.item_id = l.item_id and t.shop_id = l.shop_id
    where l.scraped_at >= now() - interval '21 days'
    order by l.item_id, l.shop_id,
             (l.scraped_at at time zone 'Asia/Jakarta')::date desc,
             l.scraped_at desc
  ),
  ranked as (
    select *, row_number() over (partition by item_id, shop_id order by d desc) as rn
    from days
  )
  select coalesce(json_agg(x order by x.product_name), '[]'::json) into v_rows
  from (
    select
      t.item_id, t.shop_id,
      coalesce(nullif(c.product_name, ''), t.product_name) as product_name,
      t.store_name,
      c.d as last_d,
      c.price as price, p.price as price_prev,
      c.total_sold as total_sold, p.total_sold as total_sold_prev,
      c.rating as rating, p.rating as rating_prev,
      c.sold_text as sold_text, p.sold_text as sold_text_prev,
      (c.item_id is null or c.d < (timezone('Asia/Jakarta', now()))::date - 3) as gone,
      (c.price is not null and p.price is not null and c.price is distinct from p.price) as price_changed,
      (
        (c.sold_text is not null and p.sold_text is not null and c.sold_text is distinct from p.sold_text)
        or (c.total_sold is not null and p.total_sold is not null and c.total_sold is distinct from p.total_sold)
      ) as sold_bucket_changed,
      (c.rating is not null and p.rating is not null and (p.rating - c.rating) >= 0.1) as rating_dropped
    from tracked t
    left join ranked c on c.item_id = t.item_id and c.shop_id = t.shop_id and c.rn = 1
    left join ranked p on p.item_id = t.item_id and p.shop_id = t.shop_id and p.rn = 2
  ) x;

  return coalesce(v_rows, '[]'::json);
end $$;

-- Weekly digest rows: last two listing_weekly weeks per favorite.
create or replace function public.favorite_weekly_for_user(p_user_id uuid)
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_rows json;
begin
  if p_user_id is null then return '[]'::json; end if;

  with tracked as (
    select t.item_id, t.shop_id,
           coalesce(nullif(t.product_name, ''), 'Produk') as product_name,
           coalesce(nullif(t.store_name, ''), '') as store_name
    from public.user_tracked_products t
    where t.user_id = p_user_id
  ),
  wk as (
    select w.*,
           row_number() over (partition by w.item_id, w.shop_id order by w.week_start desc) as rn
    from public.listing_weekly w
    join tracked t on t.item_id = w.item_id and t.shop_id = w.shop_id
  )
  select coalesce(json_agg(x order by coalesce(x.omset, 0) desc), '[]'::json) into v_rows
  from (
    select
      t.item_id, t.shop_id, t.product_name, t.store_name,
      c.week_start, c.units_wk as units, c.omset_wk as omset, c.price, c.source,
      p.units_wk as units_prev, p.omset_wk as omset_prev, p.price as price_prev
    from tracked t
    left join wk c on c.item_id = t.item_id and c.shop_id = t.shop_id and c.rn = 1
    left join wk p on p.item_id = t.item_id and p.shop_id = t.shop_id and p.rn = 2
  ) x;

  return coalesce(v_rows, '[]'::json);
end $$;

-- ── Backfill: keyword tracks + Rencana Jualan → product favorites ───────────
-- Disable the cap trigger so a user with 40 keywords does not abort the
-- transaction; we cap in the SELECT instead.
alter table public.user_tracked_products disable trigger trg_utp_limit;

insert into public.user_tracked_products (
  user_id, item_id, shop_id, keyword, product_name, category,
  image_url, price, total_sold, store_name, tracked_at
)
select user_id, item_id, shop_id, keyword, product_name, category,
       image_url, price, total_sold, store_name, tracked_at
from (
  select
    k.user_id, l.item_id, l.shop_id, k.keyword,
    l.product_name, coalesce(nullif(k.category, ''), l.category) as category,
    l.image_url, l.price, l.total_sold, l.store_name, k.created_at as tracked_at,
    row_number() over (
      partition by k.user_id
      order by k.created_at, l.total_sold desc nulls last
    ) as rn
  from public.user_tracked_keywords k
  join lateral (
    select d.item_id, d.shop_id, d.product_name, d.image_url, d.price,
           d.total_sold, d.store_name, d.category
    from public.listings_deduped d
    where lower(btrim(d.keyword)) = k.keyword_norm
      and coalesce(d.is_offtopic, false) = false
      and d.item_id is not null and d.shop_id is not null
    order by d.total_sold desc nulls last
    limit 1
  ) l on true
) x
where x.rn <= public.tracking_product_limit()
on conflict (user_id, item_id, shop_id) do nothing;

insert into public.user_tracked_products (
  user_id, item_id, shop_id, product_name, price, tracked_at
)
select bp.user_id, bp.item_id, bp.shop_id,
       coalesce(bp.product_name, ''), bp.price_target, now()
from public.business_plans bp
where bp.item_id is not null and bp.shop_id is not null
  and (
    select count(*) from public.user_tracked_products t where t.user_id = bp.user_id
  ) < public.tracking_product_limit()
on conflict (user_id, item_id, shop_id) do nothing;

alter table public.user_tracked_products enable trigger trg_utp_limit;

-- ── Admin KPI: live favorites vs scraper ceiling ────────────────────────────
create or replace function public.admin_dashboard_kpis()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result json;
begin
  if not public.is_platform_admin() then
    return '{}'::json;
  end if;

  with
  tracked_agg as (
    select count(*)::int as total from public.user_tracked_products
  ),
  tracked_daily as (
    select (tracked_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_products
    where tracked_at >= now() - interval '14 days'
    group by 1
  ),
  fav_distinct as (
    select count(distinct (item_id, shop_id))::int as n from public.user_tracked_products
  ),
  kw_agg as (
    select count(*)::int as total from public.user_tracked_keywords
  ),
  kw_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_keywords
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  store_agg as (
    select count(*)::int as total from public.user_tracked_stores
  ),
  store_daily as (
    select (created_at at time zone 'Asia/Jakarta')::date as day, count(*)::int as n
    from public.user_tracked_stores
    where created_at >= now() - interval '14 days'
    group by 1
  ),
  dd_agg as (
    select count(*)::int as total from public.deepdive_opens
  ),
  dd_daily as (
    select view_day as day, count(*)::int as n
    from public.deepdive_opens
    where view_day >= ((now() at time zone 'Asia/Jakarta')::date - 14)
    group by 1
  )
  select json_build_object(
    'tracked_total',   (select total from tracked_agg),
    'tracked_daily',   (select coalesce(json_agg(row_to_json(t) order by t.day), '[]'::json) from tracked_daily t),
    'favorited_products_distinct', (select n from fav_distinct),
    'scraper_ceiling', 200,
    'keywords_total',  (select total from kw_agg),
    'keywords_daily',  (select coalesce(json_agg(row_to_json(k) order by k.day), '[]'::json) from kw_daily k),
    'stores_total',    (select total from store_agg),
    'stores_daily',    (select coalesce(json_agg(row_to_json(s) order by s.day), '[]'::json) from store_daily s),
    'deepdives_total', (select total from dd_agg),
    'deepdives_daily', (select coalesce(json_agg(row_to_json(d) order by d.day), '[]'::json) from dd_daily d)
  ) into v_result;

  return v_result;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on function
  public.tracking_product_limit(),
  public.add_tracked_product(bigint, bigint, text, text, text, numeric, text, text, bigint),
  public.remove_tracked_product(bigint, bigint),
  public.get_my_favorites(),
  public.set_tracker_notify_prefs(text[], text, text)
from public, anon;

grant execute on function
  public.tracking_product_limit(),
  public.add_tracked_product(bigint, bigint, text, text, text, numeric, text, text, bigint),
  public.remove_tracked_product(bigint, bigint),
  public.get_my_favorites(),
  public.set_tracker_notify_prefs(text[], text, text)
to authenticated;

revoke all on function
  public.favorite_changes_for_user(uuid),
  public.favorite_weekly_for_user(uuid),
  public.tracker_notify_audience(),
  public.tracker_data_watermark()
from public, anon, authenticated;

grant execute on function
  public.favorite_changes_for_user(uuid),
  public.favorite_weekly_for_user(uuid),
  public.tracker_notify_audience(),
  public.tracker_data_watermark()
to service_role;

revoke all on function public.admin_dashboard_kpis() from public, anon;
grant execute on function public.admin_dashboard_kpis() to authenticated;

revoke all on function
  public.tracker_pending_warnings(),
  public.tracker_apply_pauses()
from public, anon, authenticated;
grant execute on function
  public.tracker_pending_warnings(),
  public.tracker_apply_pauses()
to service_role;

-- Retire the Site-A weekly-digest cron; Favorit Aku weekly cadence is served
-- by tracker-change-notify with {"task":"weekly"}.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from cron.job where jobname = 'weekly-digest') then
    perform cron.unschedule('weekly-digest');
  end if;
exception when undefined_table then
  null;
end $$;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- Cron — run MANUALLY after deploying tracker-change-notify (copy the
-- Authorization header from the existing tracker-change-notify job):
--
--   -- daily on_update (keep existing job body, or add task):
--   --   body := '{"task":"on_update"}'
--
--   -- Monday 01:00 UTC = 08:00 Asia/Jakarta
--   select cron.schedule('tracker-favorite-weekly', '0 1 * * 1', $CRON$
--     select net.http_post(
--       url     := 'http://kong:8000/functions/v1/tracker-change-notify',
--       headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_JWT>"}'::jsonb,
--       body    := '{"task":"weekly"}'::jsonb
--     );
--   $CRON$);
-- ============================================================================
