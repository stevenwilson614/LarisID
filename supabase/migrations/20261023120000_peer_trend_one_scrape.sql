-- One-scrape Deep Dive tren: cohort median weekly shape, scaled to this
-- listing's peer level (price * v_peer * 7). Chart-only. Does not rewrite
-- listing_weekly.source or card omset.
--
-- A measured week with span_days >= 2 is a real second scrape (scrapes land
-- days apart). A same-day extension double hit (span under 2 days) is not,
-- and the client keeps the perkiraan line.
--
-- The expression index matches the cohort filter. Scraper-owned
-- product_velocity DDL does not create it; this migration does.

begin;
set local statement_timeout to '600s';

create index if not exists product_velocity_cat_band_idx
  on public.product_velocity ((coalesce(category, '')), band)
  where method is distinct from 'zero_sales';

create or replace function public.peer_trend_for(
  p_item_id bigint,
  p_shop_id bigint
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_cat text;
  v_band smallint;
  v_peer real;
  v_price real;
  v_method text;
  v_real boolean;
  v_sold bigint;
  v_reviews integer;
  v_from_reviews boolean;
  v_level bigint;
  v_this date;
  v_shape text := 'cohort';
  v_used_cat text;
  v_peer_n integer;
  v_weeks jsonb := '[]'::jsonb;
  v_anchor numeric;
  v_scale numeric;
begin
  select coalesce(pv.category, ''), pv.band, pv.v_peer, pv.price, pv.method
    into v_cat, v_band, v_peer, v_price, v_method
  from public.product_velocity pv
  where pv.item_id = p_item_id and pv.shop_id = p_shop_id;

  if not found
     or v_band is null
     or coalesce(v_peer, 0) <= 0
     or coalesce(v_price, 0) <= 0
     or v_method = 'zero_sales' then
    return jsonb_build_object('ok', false, 'reason', 'no_peer');
  end if;

  v_level := round(v_price::numeric * v_peer::numeric * 7)::bigint;
  if v_level <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_peer');
  end if;

  select exists (
    select 1
    from public.listing_weekly lw
    where lw.item_id = p_item_id
      and lw.shop_id = p_shop_id
      and lw.source = 'measured'
      and lw.span_days >= 2
  ) into v_real;

  if v_real then
    return jsonb_build_object(
      'ok', true,
      'real_second_scrape', true
    );
  end if;

  select d.total_sold, d.reviews
    into v_sold, v_reviews
  from public.listings_deduped d
  where d.item_id = p_item_id and d.shop_id = p_shop_id
  order by d.scraped_at desc nulls last
  limit 1;
  v_from_reviews := coalesce(v_sold, 0) <= 0 and coalesce(v_reviews, 0) > 0;

  v_this := public.listing_week_start(current_date);
  v_used_cat := v_cat;
  v_weeks := public._peer_cohort_week_medians(
    v_cat, v_band, v_this, p_item_id, p_shop_id);

  if jsonb_array_length(coalesce(v_weeks, '[]'::jsonb)) < 2 and v_cat <> '' then
    v_used_cat := '';
    v_weeks := public._peer_cohort_week_medians(
      '', v_band, v_this, p_item_id, p_shop_id);
  end if;

  select c.n into v_peer_n
  from public.velocity_cohort c
  where coalesce(c.category, '') = v_used_cat
    and c.band = v_band
    and c.include_zero = false;

  if jsonb_array_length(coalesce(v_weeks, '[]'::jsonb)) < 2 then
    v_shape := 'level';
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'week_start', (v_this - ((5 - g) * 7)),
               'omset', v_level
             ) order by g), '[]'::jsonb)
      into v_weeks
    from generate_series(0, 5) g;
  else
    -- Newest cohort week scales to this listing's peer level. Weeks in the
    -- last 6 Mondays with too few measured peers stay null (a gap, not a
    -- flat copy). This Monday is the peer level even when the cohort has
    -- not been revised to measured yet.
    v_anchor := (v_weeks -> (jsonb_array_length(v_weeks) - 1) ->> 'med')::numeric;
    if v_anchor is null or v_anchor <= 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_shape');
    end if;
    v_scale := v_level::numeric / v_anchor;
    select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.week_start), '[]'::jsonb)
      into v_weeks
    from (
      select g.week_start,
             case
               when g.week_start = v_this then v_level
               when m.med is not null then round(m.med * v_scale)::bigint
               else null
             end as omset
      from (
        select (v_this - ((5 - i) * 7))::date as week_start
        from generate_series(0, 5) i
      ) g
      left join (
        select (el ->> 'week_start')::date as week_start,
               (el ->> 'med')::numeric as med
        from jsonb_array_elements(v_weeks) el
      ) m on m.week_start = g.week_start
    ) s;
  end if;

  return jsonb_build_object(
    'ok', true,
    'real_second_scrape', false,
    'category', v_cat,
    'shape_category', v_used_cat,
    'band', v_band,
    'peer_n', coalesce(v_peer_n, 0),
    'from_reviews', v_from_reviews,
    'shape', v_shape,
    'level_omset_wk', v_level,
    'weeks', v_weeks,
    'next_week_start', v_this + 7,
    'next_omset', v_level
  );
end;
$$;

-- Median measured omset per WIB week for one (category, sold band).
-- Large cohorts are a stable item_id sample (~800), not the whole band.
create or replace function public._peer_cohort_week_medians(
  p_cat text,
  p_band smallint,
  p_this date,
  p_item_id bigint,
  p_shop_id bigint
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_n integer;
  v_stride integer;
  v_min integer;
  v_out jsonb;
begin
  select c.n into v_n
  from public.velocity_cohort c
  where coalesce(c.category, '') = p_cat
    and c.band = p_band
    and c.include_zero = false;

  v_stride := case
    when coalesce(v_n, 0) <= 2500 then 1
    else greatest(v_n / 800, 1)
  end;
  v_min := case when coalesce(v_n, 0) < 200 then 5 else 15 end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'week_start', q.week_start,
           'med', q.med,
           'n', q.n
         ) order by q.week_start), '[]'::jsonb)
    into v_out
  from (
    select lw.week_start,
           percentile_cont(0.5) within group (order by lw.omset_wk) as med,
           count(*)::int as n
    from public.product_velocity pv
    join public.listing_weekly lw
      on lw.item_id = pv.item_id
     and lw.shop_id = pv.shop_id
     and lw.week_start between p_this - 35 and p_this
     and lw.source = 'measured'
     and lw.omset_wk > 0
    where coalesce(pv.category, '') = p_cat
      and pv.band = p_band
      and pv.method is distinct from 'zero_sales'
      and not (pv.item_id = p_item_id and pv.shop_id = p_shop_id)
      and (v_stride = 1 or (pv.item_id % v_stride) = 0)
    group by lw.week_start
    having count(*) >= v_min
  ) q;

  return v_out;
end;
$$;

comment on function public.peer_trend_for(bigint, bigint) is
  'One-scrape Tren Produk. Peer level is price * v_peer * 7. Shape is the '
  'median measured weekly omset of the same category and sold scale-band, '
  'scaled so the newest week matches that level. real_second_scrape when a '
  'measured week has span_days >= 2. Does not write listing_weekly.';

revoke all on function public._peer_cohort_week_medians(text, smallint, date, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public._peer_cohort_week_medians(text, smallint, date, bigint, bigint)
  to postgres;
revoke all on function public.peer_trend_for(bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.peer_trend_for(bigint, bigint)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
