-- ============================================================================
-- Server-side plumbing for "tell me when a market I track moves".
--
-- The hard constraint: get_tracker_rollup() and tracker_has_history() are both
-- bound to auth.uid(), so a service-role cron job cannot call either. Rather
-- than fork ~180 lines of windowing logic (which would drift the moment either
-- copy is tuned), this migration pushes each body down into a
-- user-parameterised inner function and leaves the public RPC as a thin
-- auth.uid() wrapper. Client behaviour is byte-identical.
--
-- Change detection itself needs no new maths: the rollup already returns
-- current-vs-previous pairs for every metric (units/units_prev,
-- avg_price/avg_price_prev, n_sellers/n_sellers_prev), because the UI renders
-- those arrows. The notifier just thresholds them.
-- ============================================================================

begin;

-- ── has_history, user-parameterised ─────────────────────────────────────────
create or replace function public._tracker_has_history_for(p_user_id uuid, p_lookback_days integer default 30)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_days int;
begin
  if p_user_id is null then return false; end if;
  v_days := greatest(1, least(coalesce(p_lookback_days, 30), 90));

  if exists (
    select 1 from public.mv_keyword_daily md
      join public.user_tracked_keywords k
        on lower(btrim(k.keyword)) = md.keyword and k.user_id = p_user_id
     where md.d >= current_date - v_days
  ) then return true; end if;

  if exists (
    select 1 from public.mv_shop_daily sd
      join public.user_tracked_stores s
        on sd.shop_id = s.shop_id and s.user_id = p_user_id
     where sd.d >= current_date - v_days
  ) then return true; end if;

  return false;
end $$;

create or replace function public.tracker_has_history(p_lookback_days integer default 30)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  return public._tracker_has_history_for(v_uid, p_lookback_days);
end $$;

-- ── rollup, user-parameterised ──────────────────────────────────────────────
-- Body lifted verbatim from get_tracker_rollup; the only edits are the source
-- of v_me and the has_history call. Do not tune one without the other.
create or replace function public._tracker_rollup_for(
  p_user_id uuid,
  p_days    integer default 7,
  p_scope   text default 'keyword'
) returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me      uuid := p_user_id;
  v_days    int  := greatest(1, least(coalesce(p_days, 7), 90));
  v_scope   text := case when p_scope = 'store' then 'store' else 'keyword' end;
  v_cur0    date;
  v_prev0   date;
  v_rows    json;
  v_totals  json;
  v_as_of   date;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  v_cur0  := (current_date - v_days);
  v_prev0 := (current_date - (v_days * 2));

  if v_scope = 'keyword' then
    with tracked as (
      select lower(btrim(k.keyword)) as keyword,
             max(k.category)         as category,
             min(k.created_at)       as created_at
      from public.user_tracked_keywords k
      where k.user_id = v_me
      group by 1
    ),
    win as (
      select t.keyword,
             md.d, md.n_listings, md.n_sellers, md.avg_price, md.median_price,
             md.avg_rating,
             (md.sold_delta  * public._win_overlap(md.d, md.span_days, v_cur0,  current_date))::bigint as sold_delta,
             (md.omset_delta * public._win_overlap(md.d, md.span_days, v_cur0,  current_date))::bigint as omset_delta,
             (md.sold_delta  * public._win_overlap(md.d, md.span_days, v_prev0, v_cur0))::bigint       as sold_delta_prev,
             (md.omset_delta * public._win_overlap(md.d, md.span_days, v_prev0, v_cur0))::bigint       as omset_delta_prev,
             (md.d >= v_cur0) as is_cur
      from tracked t
      join public.mv_keyword_daily md on md.keyword = t.keyword
      where md.d >= v_prev0 - md.span_days
    ),
    latest as (
      select distinct on (keyword, is_cur)
             keyword, is_cur, d, n_listings, n_sellers, avg_price, median_price, avg_rating
      from win order by keyword, is_cur, d desc
    ),
    agg as (
      select w.keyword,
             sum(w.sold_delta)       as units,
             sum(w.omset_delta)      as omset,
             sum(w.sold_delta_prev)  as units_prev,
             sum(w.omset_delta_prev) as omset_prev,
             count(*) filter (where w.is_cur and w.sold_delta > 0) as n_days,
             max(w.d) filter (where w.is_cur)                      as last_d
      from win w group by w.keyword
    )
    select json_agg(x order by x.omset desc nulls last), max(x.last_d)
      into v_rows, v_as_of
    from (
      select
        t.keyword,
        t.category,
        coalesce(a.units, 0)::bigint       as units,
        coalesce(a.omset, 0)::bigint       as omset,
        coalesce(a.units_prev, 0)::bigint  as units_prev,
        coalesce(a.omset_prev, 0)::bigint  as omset_prev,
        lc.n_listings, lc.n_sellers, lc.avg_price, lc.median_price, lc.avg_rating,
        lp.n_listings as n_listings_prev,
        lp.n_sellers  as n_sellers_prev,
        lp.avg_price  as avg_price_prev,
        lp.avg_rating as avg_rating_prev,
        coalesce(a.n_days, 0)::int         as n_days,
        a.last_d,
        coalesce((
          select json_agg(json_build_object(
                            'd', s.d,
                            'units', case when s.is_cur then s.sold_delta  else s.sold_delta_prev  end,
                            'omset', case when s.is_cur then s.omset_delta else s.omset_delta_prev end,
                            'avg_price', s.avg_price,
                            'n_listings', s.n_listings,
                            'n_sellers', s.n_sellers,
                            'is_cur', s.is_cur
                          ) order by s.d)
          from win s where s.keyword = t.keyword
        ), '[]'::json)                     as series
      from tracked t
      left join agg a  on a.keyword = t.keyword
      left join latest lc on lc.keyword = t.keyword and lc.is_cur
      left join latest lp on lp.keyword = t.keyword and not lp.is_cur
    ) x;
  else
    with tracked as (
      select s.shop_id, max(s.store_name) as store_name, min(s.created_at) as created_at
      from public.user_tracked_stores s
      where s.user_id = v_me
      group by 1
    ),
    win as (
      select t.shop_id,
             sd.d, sd.n_listings, sd.avg_price, sd.median_price, sd.avg_rating,
             (sd.sold_delta  * public._win_overlap(sd.d, sd.span_days, v_cur0,  current_date))::bigint as sold_delta,
             (sd.omset_delta * public._win_overlap(sd.d, sd.span_days, v_cur0,  current_date))::bigint as omset_delta,
             (sd.sold_delta  * public._win_overlap(sd.d, sd.span_days, v_prev0, v_cur0))::bigint       as sold_delta_prev,
             (sd.omset_delta * public._win_overlap(sd.d, sd.span_days, v_prev0, v_cur0))::bigint       as omset_delta_prev,
             (sd.d >= v_cur0) as is_cur
      from tracked t
      join public.mv_shop_daily sd on sd.shop_id = t.shop_id
      where sd.d >= v_prev0 - sd.span_days
    ),
    latest as (
      select distinct on (shop_id, is_cur)
             shop_id, is_cur, d, n_listings, avg_price, median_price, avg_rating
      from win order by shop_id, is_cur, d desc
    ),
    agg as (
      select w.shop_id,
             sum(w.sold_delta)       as units,
             sum(w.omset_delta)      as omset,
             sum(w.sold_delta_prev)  as units_prev,
             sum(w.omset_delta_prev) as omset_prev,
             count(*) filter (where w.is_cur and w.sold_delta > 0) as n_days,
             max(w.d) filter (where w.is_cur)                      as last_d
      from win w group by w.shop_id
    )
    select json_agg(x order by x.omset desc nulls last), max(x.last_d)
      into v_rows, v_as_of
    from (
      select
        t.shop_id,
        coalesce(nullif(t.store_name, ''), 'Toko ' || t.shop_id) as store_name,
        coalesce(a.units, 0)::bigint       as units,
        coalesce(a.omset, 0)::bigint       as omset,
        coalesce(a.units_prev, 0)::bigint  as units_prev,
        coalesce(a.omset_prev, 0)::bigint  as omset_prev,
        lc.n_listings, lc.avg_price, lc.median_price, lc.avg_rating,
        lp.n_listings as n_listings_prev,
        lp.avg_price  as avg_price_prev,
        lp.avg_rating as avg_rating_prev,
        coalesce(a.n_days, 0)::int         as n_days,
        a.last_d,
        coalesce((
          select json_agg(json_build_object(
                            'd', s.d,
                            'units', case when s.is_cur then s.sold_delta  else s.sold_delta_prev  end,
                            'omset', case when s.is_cur then s.omset_delta else s.omset_delta_prev end,
                            'avg_price', s.avg_price,
                            'n_listings', s.n_listings,
                            'is_cur', s.is_cur
                          ) order by s.d)
          from win s where s.shop_id = t.shop_id
        ), '[]'::json)                     as series
      from tracked t
      left join agg a  on a.shop_id = t.shop_id
      left join latest lc on lc.shop_id = t.shop_id and lc.is_cur
      left join latest lp on lp.shop_id = t.shop_id and not lp.is_cur
    ) x;
  end if;

  select json_build_object(
    'tracked',         coalesce(json_array_length(v_rows), 0),
    'units',           coalesce(sum((r->>'units')::bigint), 0),
    'units_prev',      coalesce(sum((r->>'units_prev')::bigint), 0),
    'omset',           coalesce(sum((r->>'omset')::bigint), 0),
    'omset_prev',      coalesce(sum((r->>'omset_prev')::bigint), 0),
    'n_listings',      coalesce(sum((r->>'n_listings')::int), 0),
    'n_listings_prev', coalesce(sum((r->>'n_listings_prev')::int), 0),
    'n_sellers',       coalesce(sum((r->>'n_sellers')::int), 0),
    'n_sellers_prev',  coalesce(sum((r->>'n_sellers_prev')::int), 0),
    'avg_price',       round(coalesce(avg((r->>'avg_price')::numeric), 0)),
    'avg_price_prev',  round(coalesce(avg((r->>'avg_price_prev')::numeric), 0))
  ) into v_totals
  from json_array_elements(coalesce(v_rows, '[]'::json)) r;

  return json_build_object(
    'scope',       v_scope,
    'window_days', v_days,
    'as_of',       v_as_of,
    'has_history', public._tracker_has_history_for(v_me, 30),
    'totals',      v_totals,
    'rows',        coalesce(v_rows, '[]'::json)
  );
end $$;

create or replace function public.get_tracker_rollup(p_days integer default 7, p_scope text default 'keyword')
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  return public._tracker_rollup_for(v_me, p_days, p_scope);
end $$;

-- Service-role entry point for the notifier.
create or replace function public.tracker_changes_for_user(
  p_user_id uuid,
  p_days    integer default 7,
  p_scope   text default 'keyword'
) returns json language sql stable security definer set search_path to 'public' as $$
  select public._tracker_rollup_for(p_user_id, p_days, p_scope);
$$;

-- ── send-once ledger ────────────────────────────────────────────────────────
-- data_day is the matview's own latest day, NOT the calendar day: the scrape
-- and the matview refresh are manual (SSH), so a cron that keyed on today's
-- date would re-send the same alert every morning the refresh was skipped.
create table if not exists public.tracker_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  scope      text not null check (scope in ('keyword','store')),
  entity_key text not null,
  channel    text not null check (channel in ('email','whatsapp')),
  data_day   date not null,
  status     text not null default 'sent' check (status in ('sent','failed','skipped')),
  detail     text,
  sent_at    timestamptz not null default now()
);

create unique index if not exists uq_tracker_notifications_once
  on public.tracker_notifications (user_id, scope, entity_key, channel, data_day);
create index if not exists idx_tracker_notifications_user
  on public.tracker_notifications (user_id, sent_at desc);

alter table public.tracker_notifications enable row level security;

-- Atomic claim: returns true only for the caller that won the insert, so two
-- overlapping cron runs cannot both send the same alert.
create or replace function public.tracker_notify_claim(
  p_user_id uuid, p_scope text, p_entity_key text,
  p_channel text, p_data_day date
) returns boolean language plpgsql volatile security definer set search_path to 'public' as $$
declare v_id bigint;
begin
  insert into public.tracker_notifications (user_id, scope, entity_key, channel, data_day, status)
  values (p_user_id, p_scope, p_entity_key, p_channel, p_data_day, 'sent')
  on conflict (user_id, scope, entity_key, channel, data_day) do nothing
  returning id into v_id;
  return v_id is not null;
end $$;

create or replace function public.tracker_notify_mark(
  p_user_id uuid, p_scope text, p_entity_key text,
  p_channel text, p_data_day date, p_status text, p_detail text default null
) returns void language sql volatile security definer set search_path to 'public' as $$
  update public.tracker_notifications
     set status = p_status, detail = left(p_detail, 500)
   where user_id = p_user_id and scope = p_scope and entity_key = p_entity_key
     and channel = p_channel and data_day = p_data_day;
$$;

-- Who to consider, plus how to reach them. Skips paused trackers and anyone
-- who has not picked a channel. `email_ok` is false for @wa.larisid.com users:
-- that address is synthesised by the WhatsApp OTP signup flow and bounces.
create or replace function public.tracker_notify_audience()
returns table (
  user_id uuid, email text, email_ok boolean,
  notify_channels text[], notify_wa_number text,
  n_keywords int, n_stores int
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
    (select count(*)::int from public.user_tracked_keywords k where k.user_id = st.user_id),
    (select count(*)::int from public.user_tracked_stores  s where s.user_id = st.user_id)
  from public.user_tracker_state st
  join auth.users u on u.id = st.user_id
  where st.paused_at is null
    and cardinality(coalesce(st.notify_channels, '{}'::text[])) > 0;
$$;

-- Freshness watermark. The notifier no-ops unless this has advanced, so a
-- skipped matview refresh produces silence rather than a duplicate alert.
create or replace function public.tracker_data_watermark()
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'keyword_day',  (select max(d) from public.mv_keyword_daily),
    'store_day',    (select max(d) from public.mv_shop_daily),
    'refreshed_at', (select max(refreshed_at) from public.mv_keyword_daily)
  );
$$;

revoke all on function
  public._tracker_rollup_for(uuid, integer, text),
  public._tracker_has_history_for(uuid, integer),
  public.tracker_changes_for_user(uuid, integer, text),
  public.tracker_notify_claim(uuid, text, text, text, date),
  public.tracker_notify_mark(uuid, text, text, text, date, text, text),
  public.tracker_notify_audience(),
  public.tracker_data_watermark()
from public, anon, authenticated;

revoke all on function public.get_tracker_rollup(integer, text) from public, anon;
grant execute on function public.get_tracker_rollup(integer, text) to authenticated;
revoke all on function public.tracker_has_history(integer) from public, anon;
grant execute on function public.tracker_has_history(integer) to authenticated;

commit;

notify pgrst, 'reload schema';
