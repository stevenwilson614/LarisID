-- Peer Tren Produk: never leave identical week-to-week omset.
--
-- 1. Band-all fallback used category='' which only matched blank-category
--    listings. NULL now means every category in that sold band (velocity_cohort
--    '' row still supplies peer_n / stride).
-- 2. After building the 6-Monday peer line (cohort or level), run
--    shape_flat_week_totals so a flat positive run takes the catalog wow
--    pattern. Same rule as own-series / cards / Excel.

begin;
set local statement_timeout to '600s';

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
  -- NULL p_cat = all categories in this band. '' still means blank category.
  -- velocity_cohort stores the band-wide row under category ''.
  select c.n into v_n
  from public.velocity_cohort c
  where coalesce(c.category, '') = coalesce(p_cat, '')
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
    where pv.band = p_band
      and pv.method is distinct from 'zero_sales'
      and (p_cat is null or coalesce(pv.category, '') = p_cat)
      and not (pv.item_id = p_item_id and pv.shop_id = p_shop_id)
      and (v_stride = 1 or (pv.item_id % v_stride) = 0)
    group by lw.week_start
    having count(*) >= v_min
  ) q;

  -- Large velocity_cohort + sparse measured weeks → stride can leave <2
  -- Mondays. Retry unstrided so band-all / thin categories still get a shape.
  if jsonb_array_length(coalesce(v_out, '[]'::jsonb)) < 2 and v_stride > 1 then
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
      where pv.band = p_band
        and pv.method is distinct from 'zero_sales'
        and (p_cat is null or coalesce(pv.category, '') = p_cat)
        and not (pv.item_id = p_item_id and pv.shop_id = p_shop_id)
      group by lw.week_start
      having count(*) >= v_min
    ) q;
  end if;

  return v_out;
end;
$$;

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
  v_om bigint[];
  v_had_om boolean[];
  v_ws date[];
  v_n int;
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

  -- Thin category → every category in this sold band (NULL), not blank-cat only.
  if jsonb_array_length(coalesce(v_weeks, '[]'::jsonb)) < 2 and v_cat <> '' then
    v_used_cat := null;
    v_weeks := public._peer_cohort_week_medians(
      null, v_band, v_this, p_item_id, p_shop_id);
  end if;

  select c.n into v_peer_n
  from public.velocity_cohort c
  where coalesce(c.category, '') = coalesce(v_used_cat, '')
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

  -- Catalog reshape: never leave a flat positive peer line.
  select array_agg((el ->> 'week_start')::date order by (el ->> 'week_start')::date),
         array_agg(
           case
             when el ->> 'omset' is null or el ->> 'omset' = '' then 0::bigint
             else (el ->> 'omset')::bigint
           end
           order by (el ->> 'week_start')::date),
         array_agg(
           (el ->> 'omset' is not null and el ->> 'omset' <> '')
           order by (el ->> 'week_start')::date)
    into v_ws, v_om, v_had_om
  from jsonb_array_elements(v_weeks) el;

  v_n := coalesce(array_length(v_om, 1), 0);
  if v_n >= 2 then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'week_start', v_ws[s.ord],
               'omset', case
                 when not coalesce(v_had_om[s.ord], false) then null
                 else s.omset
               end
             ) order by s.ord), '[]'::jsonb)
      into v_weeks
    from public.shape_flat_week_totals(
      v_om,
      (select array_agg(0::double precision) from generate_series(1, v_n))
    ) s;
  end if;

  return jsonb_build_object(
    'ok', true,
    'real_second_scrape', false,
    'category', v_cat,
    'shape_category', coalesce(v_used_cat, ''),
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

comment on function public._peer_cohort_week_medians(text, smallint, date, bigint, bigint) is
  'Median measured weekly omset for one sold band. p_cat NULL = all '
  'categories; '' = blank category only. Large cohorts sample ~800 item_ids.';

comment on function public.peer_trend_for(bigint, bigint) is
  'One-scrape Tren Produk. Peer level is price * v_peer * 7. Shape is the '
  'median measured weekly omset of the same category and sold scale-band '
  '(band-all when thin), scaled so the newest week matches that level, then '
  'shape_flat_week_totals so the line is never identical week to week. '
  'real_second_scrape when a measured week has span_days >= 2. Does not write '
  'listing_weekly.';

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
