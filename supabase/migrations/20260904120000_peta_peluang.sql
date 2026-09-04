-- Peta Peluang: listing momentum + weekly positions + batch RPC.
--
-- listing_weekly itself is owned by ~/shopee_scraper/listing_weekly.sql.
-- This file adds the 'estimated' source (in case that file is not applied
-- yet), two matviews, and peta_batch(). Apply with:
--   bash scripts/apply-selfhost.sh supabase/migrations/20260904120000_peta_peluang.sql
-- Then refresh_listing_weekly.sh (backfill + CONCURRENTLY refresh).

alter table public.listing_weekly drop constraint if exists listing_weekly_source_chk;
alter table public.listing_weekly add constraint listing_weekly_source_chk
  check (source in ('measured', 'nowcast', 'forecast', 'peer', 'zero', 'estimated'));

comment on column public.listing_weekly.source is
  'measured | nowcast | forecast | peer | zero | estimated. estimated = backfilled '
  'missed week via velocity_at; UI must label perkiraan (hollow/dashed).';

-- ---------------------------------------------------------------------------
-- backfill (same body as scraper listing_weekly.sql; CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
create or replace function public.backfill_listing_weekly_estimates(p_weeks int default 10)
returns bigint
language plpgsql
set search_path to 'public'
as $$
declare
    week0 date := listing_week_start(current_date);
    n_ins bigint := 0;
    n_this bigint := 0;
    w date;
    w_lo date;
begin
    set local statement_timeout to '900s';
    set local max_parallel_workers_per_gather to 0;
    w_lo := week0 - (greatest(coalesce(p_weeks, 10), 1) * 7);

    for w in select gs::date
             from generate_series(w_lo, week0 - 7, interval '7 days') gs
    loop
        insert into listing_weekly (
            item_id, shop_id, week_start, units_wk, omset_wk, price, v_daily,
            source, confidence, peer_n, delta_units, span_days,
            computed_at, revised_at)
        select
            pv.item_id, pv.shop_id, w,
            coalesce(u.units_wk, 0),
            greatest(0, round(coalesce(pv.price, 0)::numeric
                              * coalesce(u.units_wk, 0)::numeric))::bigint,
            pv.price, pv.v_daily, 'estimated', 'low',
            null, null, null, now(), now()
        from product_velocity pv
        join (
            select distinct l.item_id, l.shop_id
            from listings l
            where l.scraped_at >= w_lo::timestamptz
              and l.item_id is not null and l.shop_id is not null
        ) live on live.item_id = pv.item_id and live.shop_id = pv.shop_id
        cross join lateral (
            select listing_week_units(
                'nowcast', pv.v_latest, pv.v_daily, pv.v_peer, pv.w_own,
                pv.tau_days, pv.last_obs_at::date, pv.computed_at::date, w
            ) as units_wk
        ) u
        where not exists (
            select 1 from listing_weekly lw
            where lw.item_id = pv.item_id
              and lw.shop_id = pv.shop_id
              and lw.week_start = w
        );
        get diagnostics n_this = row_count;
        n_ins := n_ins + n_this;
    end loop;

    return n_ins;
end;
$$;

-- ---------------------------------------------------------------------------
-- mv_listing_momentum
-- ---------------------------------------------------------------------------
drop materialized view if exists public.mv_listing_momentum;
create materialized view public.mv_listing_momentum as
with w0 as (
  select listing_week_start(current_date) as week0
),
ranked as (
  select lw.item_id, lw.shop_id, lw.week_start, lw.units_wk, lw.source,
         (select week0 from w0) as week0
  from listing_weekly lw
  where lw.week_start between listing_week_start(current_date) - 21
                          and listing_week_start(current_date)
),
agg as (
  select
    r.item_id,
    r.shop_id,
    r.week0 as wk0_start,
    avg(r.units_wk) filter (
      where r.week_start between r.week0 - 7 and r.week0) as units_cur,
    avg(r.units_wk) filter (
      where r.week_start between r.week0 - 21 and r.week0 - 14) as units_prev,
    count(*) filter (
      where r.week_start between r.week0 - 21 and r.week0) as weeks_present,
    case
      when bool_or(r.source = 'measured' and r.week_start between r.week0 - 7 and r.week0)
        then 'measured'
      when bool_or(r.source = 'estimated' and r.week_start between r.week0 - 7 and r.week0)
        then 'estimated'
      when bool_or(r.source = 'nowcast' and r.week_start between r.week0 - 7 and r.week0)
        then 'nowcast'
      when bool_or(r.source = 'peer' and r.week_start between r.week0 - 7 and r.week0)
        then 'peer'
      else 'zero'
    end as cur_source,
    case
      when bool_or(r.source = 'measured' and r.week_start between r.week0 - 21 and r.week0 - 14)
        then 'measured'
      when bool_or(r.source = 'estimated' and r.week_start between r.week0 - 21 and r.week0 - 14)
        then 'estimated'
      when bool_or(r.source = 'nowcast' and r.week_start between r.week0 - 21 and r.week0 - 14)
        then 'nowcast'
      when bool_or(r.source = 'peer' and r.week_start between r.week0 - 21 and r.week0 - 14)
        then 'peer'
      else 'zero'
    end as prev_source,
    bool_or(r.source in ('measured', 'estimated', 'nowcast')) as has_real
  from ranked r
  group by r.item_id, r.shop_id, r.week0
)
select
  item_id,
  shop_id,
  wk0_start,
  coalesce(units_cur, 0)::real as units_cur,
  coalesce(units_prev, 0)::real as units_prev,
  greatest(-100, least(300,
    (coalesce(units_cur, 0) - coalesce(units_prev, 0))
    / greatest(coalesce(units_prev, 1), 1) * 100
  ))::real as momentum_pct,
  case
    when weeks_present < 4
      or coalesce(units_prev, 0) < 15
      or not has_real
      then 'belum'
    when (coalesce(units_cur, 0) - coalesce(units_prev, 0))
         / greatest(coalesce(units_prev, 1), 1) * 100 >= 20
      then 'naik'
    when (coalesce(units_cur, 0) - coalesce(units_prev, 0))
         / greatest(coalesce(units_prev, 1), 1) * 100 <= -20
      then 'turun'
    else 'stabil'
  end as momentum_class,
  cur_source,
  prev_source,
  weeks_present::integer
from agg;

create unique index mv_listing_momentum_pk
  on public.mv_listing_momentum (item_id, shop_id);

comment on materialized view public.mv_listing_momentum is
  'Two-week vs two-week weekly-units momentum for Peta Peluang. '
  'Windows: W0+W0-7 vs W0-14+W0-21. Floor units_prev < 15 → belum.';

-- ---------------------------------------------------------------------------
-- mv_listing_week_positions (last 8 WIB weeks)
-- ---------------------------------------------------------------------------
drop materialized view if exists public.mv_listing_week_positions;
create materialized view public.mv_listing_week_positions as
with weeks as (
  select listing_week_start(current_date) - (n * 7) as week_start
  from generate_series(0, 7) n
),
lw as (
  select lw.item_id, lw.shop_id, lw.week_start, lw.units_wk, lw.omset_wk,
         lw.source, lw.price as lw_price
  from listing_weekly lw
  join weeks w on w.week_start = lw.week_start
),
snaps as (
  select distinct on (l.item_id, l.shop_id, listing_week_start(l.scraped_at::date))
         l.item_id, l.shop_id,
         listing_week_start(l.scraped_at::date) as snap_week,
         l.reviews, l.price
  from listings l
  where l.scraped_at >= (listing_week_start(current_date) - 70)::timestamptz
    and l.item_id is not null and l.shop_id is not null
  order by l.item_id, l.shop_id, listing_week_start(l.scraped_at::date), l.scraped_at desc
),
first_snap as (
  select distinct on (l.item_id, l.shop_id)
         l.item_id, l.shop_id, l.reviews, l.price
  from listings l
  where l.scraped_at >= (listing_week_start(current_date) - 180)::timestamptz
    and l.item_id is not null and l.shop_id is not null
  order by l.item_id, l.shop_id, l.scraped_at asc
)
select
  lw.item_id,
  lw.shop_id,
  lw.week_start,
  lw.units_wk,
  lw.omset_wk,
  lw.source,
  coalesce(best.reviews, fs.reviews, 0)::integer as reviews,
  coalesce(best.price, fs.price, lw.lw_price) as price,
  case when best.item_id is not null then 'snapshot' else 'carried' end as reviews_source
from lw
left join lateral (
  select s.item_id, s.reviews, s.price
  from snaps s
  where s.item_id = lw.item_id and s.shop_id = lw.shop_id
    and s.snap_week <= lw.week_start
  order by s.snap_week desc
  limit 1
) best on true
left join first_snap fs
  on fs.item_id = lw.item_id and fs.shop_id = lw.shop_id;

create unique index mv_listing_week_positions_pk
  on public.mv_listing_week_positions (item_id, shop_id, week_start);

comment on materialized view public.mv_listing_week_positions is
  'Last 8 WIB weeks of listing_weekly plus reviews/price as of that week. '
  'Jejak Waktu frames. reviews_source = snapshot | carried.';

-- ---------------------------------------------------------------------------
-- peta_batch RPC
-- ---------------------------------------------------------------------------
create or replace function public.peta_batch(p_keys jsonb, p_weeks int default 8)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  n int;
  weeks_n int := greatest(least(coalesce(p_weeks, 8), 12), 1);
  out_json jsonb;
begin
  if p_keys is null or jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'p_keys must be a JSON array' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_keys);
  if n > 200 then
    raise exception 'p_keys max 200, got %', n using errcode = '22023';
  end if;
  if n = 0 then
    return jsonb_build_object(
      'momentum', '[]'::jsonb,
      'positions', '[]'::jsonb,
      'weeks', '[]'::jsonb,
      'scrapes', '[]'::jsonb
    );
  end if;

  with keys as (
    select distinct (e->>'item_id')::bigint as item_id,
                    (e->>'shop_id')::bigint as shop_id
    from jsonb_array_elements(p_keys) e
    where e->>'item_id' is not null and e->>'shop_id' is not null
  )
  select jsonb_build_object(
    'momentum', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', m.item_id,
        'shop_id', m.shop_id,
        'units_cur', m.units_cur,
        'units_prev', m.units_prev,
        'momentum_pct', m.momentum_pct,
        'momentum_class', m.momentum_class,
        'cur_source', m.cur_source,
        'prev_source', m.prev_source
      ))
      from mv_listing_momentum m
      join keys k on k.item_id = m.item_id and k.shop_id = m.shop_id
    ), '[]'::jsonb),
    'positions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', p.item_id,
        'shop_id', p.shop_id,
        'week_start', p.week_start,
        'units_wk', p.units_wk,
        'omset_wk', p.omset_wk,
        'source', p.source,
        'reviews', p.reviews,
        'price', p.price,
        'reviews_source', p.reviews_source
      ) order by p.week_start, p.item_id)
      from mv_listing_week_positions p
      join keys k on k.item_id = p.item_id and k.shop_id = p.shop_id
      where p.week_start >= listing_week_start(current_date) - ((weeks_n - 1) * 7)
    ), '[]'::jsonb),
    'weeks', (
      select coalesce(jsonb_agg(ws order by ws), '[]'::jsonb)
      from (
        select listing_week_start(current_date) - (g * 7) as ws
        from generate_series(weeks_n - 1, 0, -1) g
      ) s
    ),
    'scrapes', coalesce((
      select jsonb_agg(d order by d)
      from (
        select distinct l.scraped_at::date as d
        from listings l
        join keys k on k.item_id = l.item_id and k.shop_id = l.shop_id
        where l.scraped_at >= (listing_week_start(current_date) - ((weeks_n - 1) * 7))::timestamptz
        order by 1
        limit 24
      ) s
    ), '[]'::jsonb)
  ) into out_json;

  return out_json;
end;
$$;

grant select on public.mv_listing_momentum to anon, authenticated;
grant select on public.mv_listing_week_positions to anon, authenticated;
grant execute on function public.peta_batch(jsonb, int) to anon, authenticated;
grant execute on function public.backfill_listing_weekly_estimates(int) to postgres;

notify pgrst, 'reload schema';
