-- Trending % = this WIB week vs the week before, on the same daily series
-- the Tren Produk chart draws (product_daily_series → Monday buckets).
--
-- The 3-scrape rate in mv_listing_momentum compares two scrape spans that
-- are often 12–22 days and can sit entirely before the chart's last step.
-- A listing can be +7000% on that rate while the chart's latest week is
-- already down. Cards, rows, and Trending Sekarang read these columns.
--
-- This week is a velocity nowcast for any day after the last scrape, so
-- chart_now_measured is false until a scrape covers all 7 days. The previous
-- week is chart_prev_measured only when every day sits inside a real
-- listing_deltas interval. The client shows "—" when that baseline is
-- missing or under Rp 50.000.

begin;

create or replace function public.listing_chart_wow(p_keys jsonb)
returns table (
  item_id bigint,
  shop_id bigint,
  omset_now bigint,
  omset_prev bigint,
  units_now real,
  units_prev real,
  now_measured boolean,
  prev_measured boolean,
  week_now date,
  week_prev date
)
language sql
stable
security invoker
set search_path to 'public'
set statement_timeout to '8s'
as $$
  with keys as (
    select distinct (e->>'item_id')::bigint as item_id,
                    (e->>'shop_id')::bigint as shop_id
    from jsonb_array_elements(coalesce(p_keys, '[]'::jsonb)) e
    where e->>'item_id' is not null and e->>'shop_id' is not null
  ),
  bounds as (
    select listing_week_start(current_date) as w0
  ),
  days as (
    select gs::date as d
    from bounds b
    cross join generate_series(b.w0 - 7, b.w0 + 6, interval '1 day') gs
  ),
  ld as (
    select d.item_id, d.shop_id, d.scraped_at, d.prev_scraped_at,
           coalesce(d.estimated_sold_delta, d.sold_delta_raw, 0) as sold_delta,
           d.price,
           lag(d.price) over (
             partition by d.item_id, d.shop_id order by d.scraped_at
           ) as prev_price
    from listing_deltas d
    join keys k on k.item_id = d.item_id and k.shop_id = d.shop_id
  ),
  iv as (
    select item_id, shop_id,
           prev_scraped_at::date as start_d,
           scraped_at::date as end_d,
           sold_delta::float8
             / greatest(extract(epoch from (scraped_at - prev_scraped_at)) / 86400.0, 0.5) as upd,
           coalesce(prev_price, price) as p0,
           coalesce(price, prev_price) as p1
    from ld
  ),
  edges as (
    select item_id, shop_id,
           max(scraped_at)::date as last_d,
           (array_agg(price order by scraped_at desc))[1] as last_px,
           (array_agg(price order by scraped_at asc))[1] as first_px
    from ld
    group by 1, 2
  ),
  grid as (
    select k.item_id, k.shop_id, dd.d,
           (dd.d - (extract(isodow from dd.d)::int - 1)) as week_start
    from keys k
    cross join days dd
  ),
  calc as (
    select g.item_id, g.shop_id, g.week_start,
           case
             when pv.method = 'zero_sales' then 0::float8
             when hit.upd is not null then hit.upd
             when e.last_d is not null and g.d > e.last_d and pv.item_id is not null then
               velocity_at(
                 pv.w_own,
                 ln(coalesce(pv.v_daily, 0) + 0.01),
                 pv.v_peer,
                 pv.tau_days,
                 velocity_k(velocity_stale_band((g.d - e.last_d)::float8))::float8,
                 greatest(g.d - coalesce(pv.computed_at::date, e.last_d), 0)::float8
               )
             else coalesce(pv.v_peer, 0)::float8
           end as units,
           case
             when hit.upd is not null then
               case when hit.end_d > hit.start_d
                    then hit.p0 + (hit.p1 - hit.p0)
                         * ((g.d - hit.start_d)::float8 / (hit.end_d - hit.start_d))
                    else hit.p1 end
             when e.last_d is not null and g.d > e.last_d then e.last_px
             else coalesce(e.first_px, pv.price, 0)
           end as px,
           case
             when hit.upd is not null and pv.method is distinct from 'zero_sales' then 'measured'
             when e.last_d is not null and g.d > e.last_d then 'forecast'
             else 'prior'
           end as src
    from grid g
    left join product_velocity pv
      on pv.item_id = g.item_id and pv.shop_id = g.shop_id
    left join edges e
      on e.item_id = g.item_id and e.shop_id = g.shop_id
    left join lateral (
      select iv.upd, iv.start_d, iv.end_d, iv.p0, iv.p1
      from iv
      where iv.item_id = g.item_id and iv.shop_id = g.shop_id
        and g.d > iv.start_d and g.d <= iv.end_d
      order by (iv.end_d - iv.start_d), iv.end_d desc
      limit 1
    ) hit on true
  ),
  weeks as (
    select c.item_id, c.shop_id, c.week_start,
           round(sum(c.units))::real as units,
           sum(greatest(0, round(coalesce(c.px, 0)::numeric * c.units::numeric)))::bigint as omset,
           bool_and(c.src = 'measured') as measured
    from calc c
    group by 1, 2, 3
  )
  select k.item_id, k.shop_id,
         coalesce(n.omset, 0) as omset_now,
         coalesce(p.omset, 0) as omset_prev,
         coalesce(n.units, 0) as units_now,
         coalesce(p.units, 0) as units_prev,
         coalesce(n.measured, false) as now_measured,
         coalesce(p.measured, false) as prev_measured,
         b.w0 as week_now,
         (b.w0 - 7) as week_prev
  from keys k
  cross join bounds b
  left join weeks n on n.item_id = k.item_id and n.shop_id = k.shop_id and n.week_start = b.w0
  left join weeks p on p.item_id = k.item_id and p.shop_id = k.shop_id and p.week_start = b.w0 - 7;
$$;

revoke all on function public.listing_chart_wow(jsonb) from public;
grant execute on function public.listing_chart_wow(jsonb) to anon, authenticated;

comment on function public.listing_chart_wow(jsonb) is
  'This WIB week vs the previous week, same grain as the Tren Produk chart. '
  'Current week is a velocity nowcast after the last scrape. Previous week is '
  'measured only when all 7 days sit in a listing_deltas interval.';

-- Directory strip reads peta_batch_momentum. Canvas reads peta_batch.
-- Both keep the 3-scrape fields and add the chart-week pair.

create or replace function public.peta_batch_momentum(p_keys jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
set statement_timeout = '10s'
as $$
declare
  n int;
begin
  if p_keys is null or jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'p_keys must be a JSON array' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_keys);
  if n > 200 then
    raise exception 'p_keys max 200, got %', n using errcode = '22023';
  end if;
  if n = 0 then
    return jsonb_build_object('momentum', '[]'::jsonb);
  end if;

  return (
    with keys as (
      select distinct (e->>'item_id')::bigint as item_id,
                      (e->>'shop_id')::bigint as shop_id
      from jsonb_array_elements(p_keys) e
      where e->>'item_id' is not null and e->>'shop_id' is not null
    ),
    wow as (
      select * from public.listing_chart_wow(p_keys)
    )
    select jsonb_build_object('momentum', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', m.item_id,
        'shop_id', m.shop_id,
        'units_now_wk', m.units_now_wk,
        'units_prev_wk', m.units_prev_wk,
        'units_cur', m.units_now_wk,
        'units_prev', m.units_prev_wk,
        'span_now', m.span_now,
        'span_prev', m.span_prev,
        'at0', m.at0,
        'at1', m.at1,
        'at2', m.at2,
        'momentum_pct', m.momentum_pct,
        'momentum_class', m.momentum_class,
        'fresh', m.fresh,
        'momentum_source', m.momentum_source,
        'cur_source', m.momentum_source,
        'prev_source', 'measured',
        'reviews_flag', m.reviews_flag,
        'chart_omset_now', w.omset_now,
        'chart_omset_prev', w.omset_prev,
        'chart_units_now', w.units_now,
        'chart_units_prev', w.units_prev,
        'chart_now_measured', w.now_measured,
        'chart_prev_measured', w.prev_measured,
        'chart_week_now', w.week_now,
        'chart_week_prev', w.week_prev
      ))
      from mv_listing_momentum m
      join keys k on k.item_id = m.item_id and k.shop_id = m.shop_id
      left join wow w on w.item_id = m.item_id and w.shop_id = m.shop_id
    ), '[]'::jsonb))
  );
end;
$$;

create or replace function public.peta_batch(p_keys jsonb, p_weeks int default 8)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
set statement_timeout = '10s'
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
  ),
  wow as (
    select * from public.listing_chart_wow(p_keys)
  )
  select jsonb_build_object(
    'momentum', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', m.item_id,
        'shop_id', m.shop_id,
        'units_now_wk', m.units_now_wk,
        'units_prev_wk', m.units_prev_wk,
        'units_cur', m.units_now_wk,
        'units_prev', m.units_prev_wk,
        'span_now', m.span_now,
        'span_prev', m.span_prev,
        'at0', m.at0,
        'at1', m.at1,
        'at2', m.at2,
        'momentum_pct', m.momentum_pct,
        'momentum_class', m.momentum_class,
        'fresh', m.fresh,
        'momentum_source', m.momentum_source,
        'cur_source', m.momentum_source,
        'prev_source', 'measured',
        'reviews_flag', m.reviews_flag,
        'chart_omset_now', w.omset_now,
        'chart_omset_prev', w.omset_prev,
        'chart_units_now', w.units_now,
        'chart_units_prev', w.units_prev,
        'chart_now_measured', w.now_measured,
        'chart_prev_measured', w.prev_measured,
        'chart_week_now', w.week_now,
        'chart_week_prev', w.week_prev
      ))
      from mv_listing_momentum m
      join keys k on k.item_id = m.item_id and k.shop_id = m.shop_id
      left join wow w on w.item_id = m.item_id and w.shop_id = m.shop_id
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

commit;
