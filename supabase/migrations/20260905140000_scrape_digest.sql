-- Scrape-cycle digest: one honest "data baru masuk" mail per measured scrape
-- landing, to every Deep Dive user (not only Pantauan opt-ins).
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260905140000_scrape_digest.sql
--
-- Watermark is the latest listing_deltas.scraped_at that has a previous
-- snapshot (a real scrape pair), NOT mv_keyword_daily.d (that advances on
-- nowcast days). Ledger reuses tracker_notifications with
-- entity_key = 'scrape_digest'.

begin;

-- Keyword-only rollup used by tracker AND the digest, so the two cannot drift.
create or replace function public._keyword_rollup(p_keywords text[], p_days integer default 7)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days  int := greatest(1, least(coalesce(p_days, 7), 90));
  v_cur0  date;
  v_prev0 date;
  v_rows  json;
  v_as_of date;
begin
  v_cur0  := (current_date - v_days);
  v_prev0 := (current_date - (v_days * 2));

  with tracked as (
    select distinct lower(btrim(k)) as keyword
    from unnest(coalesce(p_keywords, '{}'::text[])) k
    where length(btrim(coalesce(k, ''))) > 1
  ),
  cats as (
    select lower(btrim(keyword)) as keyword, max(category) as category
    from public.user_tracked_keywords
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
  ),
  src as (
    select distinct on (keyword) keyword, source
    from public.keyword_weekly
    order by keyword, week_start desc
  )
  select json_agg(x order by x.omset desc nulls last), max(x.last_d)
    into v_rows, v_as_of
  from (
    select
      t.keyword,
      c.category,
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
      coalesce(s.source, 'nowcast')      as source
    from tracked t
    left join cats c on c.keyword = t.keyword
    left join agg a  on a.keyword = t.keyword
    left join latest lc on lc.keyword = t.keyword and lc.is_cur
    left join latest lp on lp.keyword = t.keyword and not lp.is_cur
    left join src s on s.keyword = t.keyword
  ) x;

  return json_build_object(
    'rows',  coalesce(v_rows, '[]'::json),
    'as_of', v_as_of
  );
end $$;

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
  v_pack    json;
  v_kws     text[];
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if v_scope = 'keyword' then
    select coalesce(array_agg(lower(btrim(keyword))), '{}'::text[])
      into v_kws
    from public.user_tracked_keywords
    where user_id = v_me;
    v_pack := public._keyword_rollup(v_kws, v_days);
    v_rows := v_pack->'rows';
    v_as_of := nullif(v_pack->>'as_of', '')::date;
  else
    v_cur0  := (current_date - v_days);
    v_prev0 := (current_date - (v_days * 2));
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
        a.last_d
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

create or replace function public.scrape_digest_watermark()
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select json_build_object(
    'data_day', (
      select max(scraped_at)::date
      from public.listing_deltas
      where prev_scraped_at is not null
    ),
    'week_start', (
      select max(week_start)
      from public.listing_weekly
      where source = 'measured'
    )
  );
$$;

create or replace function public.scrape_digest_changes(p_keywords text[], p_days integer default 14)
returns json
language sql
stable
security definer
set search_path to 'public'
as $$
  select public._keyword_rollup(p_keywords, p_days);
$$;

create or replace function public.scrape_digest_audience()
returns table (
  user_id uuid,
  email text,
  email_ok boolean,
  notify_wa_number text,
  keywords text[]
)
language sql
stable
security definer
set search_path to 'public, auth'
as $$
  with divers as (
    select distinct a.user_id
    from public.activity_events a
    where a.event_type = 'deepdive_open'
      and a.user_id is not null
  ),
  dd_kw as (
    select a.user_id,
           lower(btrim(a.metadata->>'keyword')) as keyword,
           max(a.created_at) as last_at
    from public.activity_events a
    where a.event_type = 'deepdive_open'
      and coalesce(a.metadata->>'keyword', '') <> ''
    group by 1, 2
  ),
  ranked_dd as (
    select user_id, keyword,
           row_number() over (partition by user_id order by last_at desc) as rn
    from dd_kw
  ),
  tracked as (
    select user_id, lower(btrim(keyword)) as keyword, min(created_at) as created_at
    from public.user_tracked_keywords
    group by 1, 2
  ),
  picked as (
    select user_id, keyword, pri, ts
    from (
      select t.user_id, t.keyword, 0 as pri, t.created_at as ts
      from tracked t
      union all
      select r.user_id, r.keyword, 1 as pri, now() - (r.rn || ' days')::interval
      from ranked_dd r
      where r.rn <= 5
    ) s
  )
  select
    d.user_id,
    u.email::text,
    (u.email is not null
       and u.email not like '%@wa.larisid.com'
       and not exists (select 1 from public.email_suppressions s
                        where lower(s.email) = lower(u.email))) as email_ok,
    case
      when st.notify_channels is not null
           and 'whatsapp' = any(st.notify_channels)
      then st.notify_wa_number
      else null
    end,
    coalesce((
      select array_agg(z.keyword order by z.rn)
      from (
        select keyword, row_number() over (order by pri, ts desc) as rn
        from (
          select distinct on (p.keyword) p.keyword, p.pri, p.ts
          from picked p
          where p.user_id = d.user_id
          order by p.keyword, p.pri
        ) u
      ) z
      where z.rn <= 3
    ), '{}'::text[])
  from divers d
  join auth.users u on u.id = d.user_id
  left join public.user_tracker_state st on st.user_id = d.user_id
  where not public.is_dapur_side_account(u.email::text)
    and coalesce(st.paused_at, null) is null;
$$;

revoke all on function
  public._keyword_rollup(text[], integer),
  public.scrape_digest_watermark(),
  public.scrape_digest_changes(text[], integer),
  public.scrape_digest_audience()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
