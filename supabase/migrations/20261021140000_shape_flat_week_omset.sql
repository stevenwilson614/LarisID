-- Unflatten weekly omset. A flat positive run keeps its total and takes this
-- listing's own earlier shape, or the catalog pattern when it has none
-- (one scrape, or a line that never moved). Zeros stay zero. A series that
-- already changes week to week is left alone.
--
-- Catalog, calibrated 2026-10-21 from listing_weekly source=measured:
--   median |week-to-week| = 0.3743 (607,977 varied adjacent pairs).
--   Last-4-week median relative shape, oldest → newest, scaled so
--   peak-to-peak is that median move: 0.8044, 0.9288, 1.0880, 1.1787.
-- Same numbers as js/omset-week-shape.js. Moved weeks are perkiraan.

begin;

-- ---------------------------------------------------------------------------
-- Weights and integer allocation. Pure. Must match the JS helper.
-- ---------------------------------------------------------------------------

create or replace function public.shape_catalog_weights(p_n int)
returns double precision[]
language plpgsql
immutable
set search_path = public
as $$
declare
  src double precision[] := array[0.8044, 0.9288, 1.0880, 1.1787];
  abs_wow double precision := 0.3743;
  n int := greatest(coalesce(p_n, 0), 0);
  raw double precision[] := array[]::double precision[];
  w double precision[] := array[]::double precision[];
  i int;
  t double precision;
  i0 int;
  f double precision;
  mean double precision := 0;
  lo double precision;
  hi double precision;
  ptp double precision;
  mid double precision;
  scale double precision;
  m2 double precision := 0;
begin
  if n < 1 then
    return array[]::double precision[];
  end if;
  for i in 1..n loop
    t := case when n = 1 then 0 else (i - 1)::double precision / (n - 1) * 3 end;
    i0 := floor(t)::int;
    f := t - i0;
    raw := raw || (src[i0 + 1] * (1 - f) + src[least(4, i0 + 2)] * f);
    mean := mean + raw[i];
  end loop;
  mean := mean / n;
  lo := raw[1] / mean;
  hi := lo;
  for i in 1..n loop
    w := w || (raw[i] / mean);
    if w[i] < lo then lo := w[i]; end if;
    if w[i] > hi then hi := w[i]; end if;
  end loop;
  ptp := hi - lo;
  if ptp > 1e-12 then
    mid := (hi + lo) / 2;
    scale := abs_wow / ptp;
    m2 := 0;
    for i in 1..n loop
      w[i] := mid + (w[i] - mid) * scale;
      m2 := m2 + w[i];
    end loop;
    m2 := m2 / n;
    for i in 1..n loop
      w[i] := w[i] / m2;
    end loop;
  else
    w := array[]::double precision[];
    for i in 1..n loop
      w := w || (1 + (case when n = 1 then 0
                           else (i - 1)::double precision / (n - 1) - 0.5 end) * abs_wow);
    end loop;
  end if;
  return w;
end;
$$;

create or replace function public.shape_history_weights(
  p_values double precision[],
  p_n int
)
returns double precision[]
language plpgsql
immutable
set search_path = public
as $$
declare
  n int := greatest(coalesce(p_n, 0), 0);
  len int;
  med double precision;
  cap double precision;
  allv double precision[] := array[]::double precision[];
  seq double precision[] := array[]::double precision[];
  slicev double precision[];
  i int;
  e int;
  w double precision[] := array[]::double precision[];
  mean double precision := 0;
  lo double precision;
  hi double precision;
  spread boolean;
begin
  len := coalesce(array_length(p_values, 1), 0);
  if len < 2 or n < 2 then
    return null;
  end if;
  select percentile_cont(0.5) within group (order by v)
    into med
  from unnest(p_values) as v;
  cap := med * 3;
  lo := least(p_values[1], cap);
  hi := lo;
  for i in 1..len loop
    allv := allv || least(p_values[i], cap);
    if allv[i] < lo then lo := allv[i]; end if;
    if allv[i] > hi then hi := allv[i]; end if;
  end loop;
  if lo = hi then
    return null;
  end if;
  if len <= n then
    for i in 1..n loop
      seq := seq || allv[1 + ((i - 1) % len)];
    end loop;
  else
    for e in reverse len..n loop
      slicev := allv[(e - n + 1):e];
      select min(v), max(v) into lo, hi from unnest(slicev) as v;
      if lo is distinct from hi then
        seq := slicev;
        exit;
      end if;
    end loop;
  end if;
  if coalesce(array_length(seq, 1), 0) < 1 then
    return null;
  end if;
  for i in 1..array_length(seq, 1) loop
    mean := mean + seq[i];
  end loop;
  mean := mean / array_length(seq, 1);
  if not (mean > 0) then
    return null;
  end if;
  lo := seq[1] / mean;
  hi := lo;
  for i in 1..array_length(seq, 1) loop
    w := w || (seq[i] / mean);
    if w[i] < lo then lo := w[i]; end if;
    if w[i] > hi then hi := w[i]; end if;
  end loop;
  if hi - lo < 1e-12 then
    return null;
  end if;
  return w;
end;
$$;

create or replace function public.shape_allocate_int(
  p_total bigint,
  p_weights double precision[]
)
returns bigint[]
language plpgsql
immutable
set search_path = public
as $$
declare
  n int;
  tot bigint;
  sumw double precision := 0;
  exact double precision[] := array[]::double precision[];
  outv bigint[] := array[]::bigint[];
  frac double precision[] := array[]::double precision[];
  used boolean[] := array[]::boolean[];
  ord int[] := array[]::int[];
  i int;
  a int;
  best int;
  best_frac double precision;
  rem int;
  guard int;
  moved boolean;
  later_higher boolean;
  donor int;
  fl bigint;
begin
  n := coalesce(array_length(p_weights, 1), 0);
  if n < 1 then
    return array[]::bigint[];
  end if;
  tot := round(coalesce(p_total, 0))::bigint;
  if tot <= 0 then
    return array_fill(0::bigint, array[n]);
  end if;
  for i in 1..n loop
    sumw := sumw + p_weights[i];
  end loop;
  if sumw = 0 then
    sumw := n;
  end if;
  for i in 1..n loop
    exact := exact || ((tot::double precision * p_weights[i]) / sumw);
    fl := floor(greatest(exact[i], 0))::bigint;
    outv := outv || fl;
    frac := frac || (exact[i] - fl);
    used := used || false;
    ord := ord || 0;
  end loop;
  rem := tot - (select coalesce(sum(v), 0) from unnest(outv) as v);
  for a in 1..n loop
    best := null;
    best_frac := null;
    for i in 1..n loop
      if not used[i] and (
        best is null
        or frac[i] > best_frac
        or (frac[i] = best_frac and i < best)
      ) then
        best := i;
        best_frac := frac[i];
      end if;
    end loop;
    ord[a] := best;
    used[best] := true;
  end loop;
  i := 0;
  while rem > 0 and i < n * (rem + 2) loop
    i := i + 1;
    a := ord[1 + ((i - 1) % n)];
    outv[a] := outv[a] + 1;
    rem := rem - 1;
  end loop;

  guard := n * n + 8;
  while guard > 0 loop
    guard := guard - 1;
    moved := false;
    for i in 2..n loop
      if outv[i] is distinct from outv[i - 1] then
        continue;
      end if;
      later_higher := coalesce(p_weights[i], 0) >= coalesce(p_weights[i - 1], 0);
      if later_higher and outv[i - 1] > 0 then
        outv[i - 1] := outv[i - 1] - 1;
        outv[i] := outv[i] + 1;
        moved := true;
        continue;
      end if;
      if not later_higher and outv[i] > 0 then
        outv[i] := outv[i] - 1;
        outv[i - 1] := outv[i - 1] + 1;
        moved := true;
        continue;
      end if;
      if outv[i - 1] > 0 then
        outv[i - 1] := outv[i - 1] - 1;
        outv[i] := outv[i] + 1;
        moved := true;
        continue;
      end if;
      if outv[i] > 0 then
        outv[i] := outv[i] - 1;
        outv[i - 1] := outv[i - 1] + 1;
        moved := true;
        continue;
      end if;
      donor := null;
      for a in 1..n loop
        if a <> i and a <> i - 1 and outv[a] > 0 then
          donor := a;
          exit;
        end if;
      end loop;
      if donor is not null then
        outv[donor] := outv[donor] - 1;
        if later_higher then
          outv[i] := outv[i] + 1;
        else
          outv[i - 1] := outv[i - 1] + 1;
        end if;
        moved := true;
      end if;
    end loop;
    if not moved then
      exit;
    end if;
  end loop;
  return outv;
end;
$$;

create or replace function public.shape_flat_week_totals(
  p_omset bigint[],
  p_units double precision[]
)
returns table (ord int, omset bigint, units double precision, changed boolean)
language plpgsql
stable
set search_path = public
as $$
declare
  n int;
  i int;
  j int;
  k int;
  om_arr bigint[];
  un_arr double precision[];
  out_om bigint[];
  out_un double precision[];
  earlier double precision[] ;
  weights double precision[];
  om_total bigint;
  un_total bigint;
  new_om bigint[];
  new_un bigint[];
  run_n int;
begin
  n := coalesce(array_length(p_omset, 1), 0);
  if n < 1 then
    return;
  end if;
  om_arr := array_fill(0::bigint, array[n]);
  un_arr := array_fill(0::double precision, array[n]);
  out_om := array_fill(0::bigint, array[n]);
  out_un := array_fill(0::double precision, array[n]);
  for i in 1..n loop
    om_arr[i] := round(coalesce(p_omset[i], 0))::bigint;
    un_arr[i] := coalesce(p_units[i], 0);
    out_om[i] := om_arr[i];
    out_un[i] := un_arr[i];
  end loop;

  i := 1;
  while i <= n loop
    if om_arr[i] <= 0 then
      i := i + 1;
      continue;
    end if;
    j := i + 1;
    while j <= n and om_arr[j] = om_arr[i] loop
      j := j + 1;
    end loop;
    if j - i >= 2 then
      earlier := array[]::double precision[];
      for k in 1..i - 1 loop
        if om_arr[k] > 0 then
          earlier := earlier || om_arr[k]::double precision;
        end if;
      end loop;
      weights := null;
      if coalesce(array_length(earlier, 1), 0) >= 2
         and (select min(v) from unnest(earlier) v) is distinct from
             (select max(v) from unnest(earlier) v) then
        weights := public.shape_history_weights(earlier, j - i);
      end if;
      if weights is null then
        weights := public.shape_catalog_weights(j - i);
      end if;
      om_total := 0;
      un_total := 0;
      for k in i..j - 1 loop
        om_total := om_total + om_arr[k];
        un_total := un_total + round(un_arr[k])::bigint;
      end loop;
      new_om := public.shape_allocate_int(om_total, weights);
      new_un := public.shape_allocate_int(un_total, weights);
      run_n := j - i;
      for k in 1..run_n loop
        out_om[i + k - 1] := new_om[k];
        out_un[i + k - 1] := new_un[k];
      end loop;
    end if;
    i := j;
  end loop;

  for i in 1..n loop
    ord := i;
    omset := out_om[i];
    units := out_un[i];
    changed := out_om[i] is distinct from om_arr[i]
            or out_un[i] is distinct from un_arr[i];
    return next;
  end loop;
end;
$$;

revoke all on function public.shape_catalog_weights(int) from public;
revoke all on function public.shape_history_weights(double precision[], int) from public;
revoke all on function public.shape_allocate_int(bigint, double precision[]) from public;
revoke all on function public.shape_flat_week_totals(bigint[], double precision[]) from public;
grant execute on function public.shape_catalog_weights(int) to anon, authenticated;
grant execute on function public.shape_history_weights(double precision[], int) to anon, authenticated;
grant execute on function public.shape_allocate_int(bigint, double precision[]) to anon, authenticated;
grant execute on function public.shape_flat_week_totals(bigint[], double precision[]) to anon, authenticated;

comment on function public.shape_flat_week_totals(bigint[], double precision[]) is
  'Reshape flat positive weekly omset runs. Sum of each run is unchanged. '
  'Own earlier weeks supply the shape when they vary; otherwise the catalog '
  'pattern (median |wow| 0.3743, recent week higher). Moved weeks come back changed=true.';

-- ---------------------------------------------------------------------------
-- Card week-vs-week. Same reshape as the Tren produk chart, over the same
-- ~17 week horizon, skipping prior (pre-scrape) days the chart skips.
-- A moved week is not terukur. prev_measured stays the raw coverage flag so
-- a measured baseline still produces a percent — perkiraan, not 0%.
-- ---------------------------------------------------------------------------

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
    -- This Monday, 16 weeks before it, and the next week. Matches the
    -- ~119-day chart window the Tren produk line is shaped over.
    select gs::date as d
    from bounds b
    cross join generate_series(b.w0 - 112, b.w0 + 13, interval '1 day') gs
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
           bool_and(c.src = 'measured') as measured,
           bool_and(c.src = 'prior') as prior_only
    from calc c
    group by 1, 2, 3
  ),
  packed as (
    select w.item_id, w.shop_id,
           array_agg(w.week_start order by w.week_start)
             filter (where not w.prior_only) as starts,
           array_agg(w.omset order by w.week_start)
             filter (where not w.prior_only) as omsets,
           array_agg(w.units::double precision order by w.week_start)
             filter (where not w.prior_only) as unitss
    from weeks w
    group by 1, 2
  ),
  shaped as (
    select p.item_id, p.shop_id,
           p.starts[s.ord] as week_start,
           s.omset, s.units, s.changed
    from packed p
    cross join lateral public.shape_flat_week_totals(
      coalesce(p.omsets, '{}'::bigint[]),
      coalesce(p.unitss, '{}'::double precision[])
    ) s
    where p.starts is not null
  )
  select k.item_id, k.shop_id,
         coalesce(ns.omset, n.omset, 0) as omset_now,
         coalesce(ps.omset, p.omset, 0) as omset_prev,
         coalesce(ns.units, n.units, 0)::real as units_now,
         coalesce(ps.units, p.units, 0)::real as units_prev,
         coalesce(n.measured, false)
           and not coalesce(ns.changed, false)
           and not coalesce(ps.changed, false) as now_measured,
         coalesce(p.measured, false) as prev_measured,
         b.w0 as week_now,
         (b.w0 - 7) as week_prev
  from keys k
  cross join bounds b
  left join weeks n on n.item_id = k.item_id and n.shop_id = k.shop_id and n.week_start = b.w0
  left join weeks p on p.item_id = k.item_id and p.shop_id = k.shop_id and p.week_start = b.w0 - 7
  left join shaped ns on ns.item_id = k.item_id and ns.shop_id = k.shop_id and ns.week_start = b.w0
  left join shaped ps on ps.item_id = k.item_id and ps.shop_id = k.shop_id and ps.week_start = b.w0 - 7;
$$;

comment on function public.listing_chart_wow(jsonb) is
  'This WIB week vs the previous week, same grain as the Tren Produk chart. '
  'Flat positive weeks are reshaped from this listing''s own history or the '
  'catalog pattern; the stretch total is unchanged. now_measured is false when '
  'either of those two weeks was moved. Previous week is measured only when '
  'all 7 days sit in a listing_deltas interval.';

-- ---------------------------------------------------------------------------
-- Export weeks. Skip prior days (the chart does) and reshape flat runs.
-- A moved terukur week becomes perkiraan and is not billable.
-- ---------------------------------------------------------------------------

create or replace function public._product_weeks_batch(
  p_item_ids bigint[],
  p_shop_ids bigint[],
  p_weeks    int default 12
)
returns table (
  ord            int,
  item_id        bigint,
  shop_id        bigint,
  week_start     date,
  units_wk       real,
  omset_wk       bigint,
  price          real,
  sumber         text,
  hari_terukur   int,
  hari_data      int,
  billable       boolean,
  snap_reviews   bigint,
  snap_rating    numeric,
  snap_sold      bigint,
  snap_harga_asli numeric,
  snap_at        timestamptz
)
language sql
stable
set search_path = public
set statement_timeout = '25s'
as $$
  with lim as (
    select greatest(1, least(coalesce(p_weeks, 12), 26)) as n
  ),
  bounds as (
    select public.listing_week_start(current_date) - ((l.n - 1) * 7) as d0,
           public.listing_week_start(current_date) + 13              as d1
    from lim l
  ),
  keys as materialized (
    select i::int as ord, p_item_ids[i] as item_id, p_shop_ids[i] as shop_id
    from generate_subscripts(p_item_ids, 1) as i
    where p_item_ids[i] is not null and p_shop_ids[i] is not null
  ),
  raw as (
    select k.ord, k.item_id, k.shop_id, s.d, s.units, s.omset, s.price, s.source
    from keys k
    cross join bounds b
    left join lateral public.product_daily_series(k.item_id, k.shop_id, b.d0, b.d1) s
      on true
  ),
  weeks as (
    select
      r.ord,
      r.item_id,
      r.shop_id,
      public.listing_week_start(r.d)                                   as week_start,
      (sum(r.units) * 7.0 / nullif(count(*), 0))::real                 as units_wk,
      round(sum(r.omset) * 7.0 / nullif(count(*), 0))::bigint          as omset_wk,
      avg(r.price)::real                                               as price,
      case
        when bool_and(r.source = 'measured')                     then 'terukur'
        when count(*) filter (where r.source = 'measured') > 0   then 'perkiraan'
        when bool_or(r.source = 'forecast')                      then 'proyeksi'
        else 'perkiraan'
      end                                                              as sumber,
      count(*) filter (where r.source = 'measured')::int               as hari_terukur,
      count(*)::int                                                    as hari_data,
      bool_and(r.source = 'measured')                                  as billable
    from raw r
    where r.d is not null
      and r.source is distinct from 'prior'
    group by r.ord, r.item_id, r.shop_id, public.listing_week_start(r.d)
  ),
  packed as (
    select w.ord, w.item_id, w.shop_id,
           array_agg(w.week_start order by w.week_start) as starts,
           array_agg(w.omset_wk order by w.week_start) as omsets,
           array_agg(w.units_wk::double precision order by w.week_start) as unitss,
           array_agg(w.price order by w.week_start) as prices,
           array_agg(w.sumber order by w.week_start) as sumbers,
           array_agg(w.hari_terukur order by w.week_start) as haris,
           array_agg(w.hari_data order by w.week_start) as haridata,
           array_agg(w.billable order by w.week_start) as bills
    from weeks w
    group by w.ord, w.item_id, w.shop_id
  ),
  shaped as (
    select
      p.ord,
      p.item_id,
      p.shop_id,
      p.starts[s.ord] as week_start,
      s.units::real as units_wk,
      s.omset as omset_wk,
      p.prices[s.ord] as price,
      case
        when s.changed and p.sumbers[s.ord] = 'terukur' then 'perkiraan'
        else p.sumbers[s.ord]
      end as sumber,
      p.haris[s.ord] as hari_terukur,
      p.haridata[s.ord] as hari_data,
      (p.bills[s.ord] and not s.changed) as billable
    from packed p
    cross join lateral public.shape_flat_week_totals(p.omsets, p.unitss) s
  )
  select
    w.ord, w.item_id, w.shop_id, w.week_start, w.units_wk, w.omset_wk, w.price,
    w.sumber, w.hari_terukur, w.hari_data, w.billable,
    snap.reviews, snap.rating, snap.total_sold, snap.original_price, snap.scraped_at
  from shaped w
  left join lateral (
    select l.reviews, l.rating, l.total_sold, l.original_price, l.scraped_at
      from public.listings l
     where l.item_id = w.item_id and l.shop_id = w.shop_id
       and (l.scraped_at at time zone 'Asia/Jakarta')::date >= w.week_start
       and (l.scraped_at at time zone 'Asia/Jakarta')::date <= (w.week_start + 6)
     order by l.scraped_at desc
     limit 1
  ) snap on true
  order by w.ord, w.week_start;
$$;

comment on function public._product_weeks_batch(bigint[], bigint[], int) is
  'Weekly export grain from product_daily_series, prior days skipped, flat '
  'runs reshaped like the Tren produk chart. A moved terukur week is perkiraan '
  'and not billable. NOT GRANTED.';

revoke all on function public._product_weeks_batch(bigint[], bigint[], int)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
