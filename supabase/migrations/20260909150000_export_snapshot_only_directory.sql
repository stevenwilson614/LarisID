-- ============================================================================
-- Product (Cari Produk) exports are monthly-omset snapshot only.
-- Weekly history is Deep Dive / single-product only — refuse otherwise even if
-- a client still sends p_history=true.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260909150000_export_snapshot_only_directory.sql
-- ============================================================================

begin;

create or replace function public.export_rows(
  p_request_id uuid,
  p_item_ids   bigint[],
  p_shop_ids   bigint[],
  p_keywords   text[]  default null,
  p_history    boolean default false,
  p_weeks      int     default 12,
  p_source     text    default 'directory'
)
returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  v_me             uuid    := auth.uid();
  v_limit          integer := public._export_row_limit();
  v_wlimit         integer := public._export_week_limit();
  v_priv           boolean := public._usage_is_privileged();
  v_weeks          integer := greatest(1, least(coalesce(p_weeks, 12), 26));
  v_src            text    := case when coalesce(p_source, 'directory')
                                        in ('directory', 'deepdive', 'favorit')
                                   then p_source else 'directory' end;
  -- Weekly history only for a single Deep Dive product. Multi-product / Cari
  -- Produk downloads are always monthly omset (1 product = 1 row).
  v_hist           boolean := coalesce(p_history, false)
                              and v_src = 'deepdive'
                              and coalesce(array_length(p_item_ids, 1), 0) = 1;
  v_maxkeys        integer;
  v_used           integer;
  v_weeks_used     integer;
  v_remaining      integer;
  v_weeks_rem      integer;
  v_maxord         integer := 0;
  v_cost           integer := 0;
  v_weeks_cost     integer := 0;
  v_kept           integer := 0;
  v_asked          integer := 0;
  v_need           integer := 0;
  v_total          integer := 0;
  v_replay         boolean := false;
  v_prior          public.export_jobs%rowtype;
  v_items          bigint[];
  v_shops          bigint[];
  v_snap           jsonb   := '[]'::jsonb;
  v_weeksall       jsonb   := '[]'::jsonb;
  v_rows           jsonb   := '[]'::jsonb;
  v_series         jsonb   := '[]'::jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  if p_item_ids is null or p_shop_ids is null then raise exception 'missing_keys'; end if;
  if coalesce(array_length(p_item_ids, 1), 0)
     is distinct from coalesce(array_length(p_shop_ids, 1), 0) then
    raise exception 'key_arrays_mismatched';
  end if;

  v_maxkeys := case when v_hist then public._export_history_cap() else v_limit end;

  select * into v_prior from public.export_jobs
   where user_id = v_me and request_id = p_request_id;

  select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
    into v_used, v_weeks_used
    from public.daily_usage where user_id = v_me and day = public._usage_day();
  v_used := coalesce(v_used, 0);
  v_weeks_used := coalesce(v_weeks_used, 0);

  if v_prior.request_id is not null then
    v_replay    := true;
    v_remaining := case when v_hist then v_limit else v_prior.rows_charged end;
    v_weeks_rem := case when v_hist then v_prior.weeks else v_wlimit end;
  elsif v_priv then
    v_remaining := v_limit;
    v_weeks_rem := v_wlimit;
  else
    v_remaining := greatest(0, v_limit - v_used);
    v_weeks_rem := greatest(0, v_wlimit - v_weeks_used);
    if v_hist then
      if v_weeks_rem = 0 then
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit, 'remaining', v_remaining,
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit, 'weeks_remaining', 0,
          'reset_at', public._export_reset_at());
      end if;
      v_weeks := least(v_weeks, v_weeks_rem);
    else
      if v_remaining = 0 then
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit, 'remaining', 0,
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', v_weeks_rem,
          'reset_at', public._export_reset_at());
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ord',            k.ord,
           'item_id',        l.item_id::text,
           'shop_id',        l.shop_id::text,
           'product_name',   l.product_name,
           'store_name',     l.store_name,
           'location',       l.location,
           'category',       l.category,
           'keyword',        l.keyword,
           'price',          l.price,
           'original_price', l.original_price,
           'omset_monthly',  coalesce(l.nowcast_omset_monthly, l.est_omset_monthly),
           'omset_method',   coalesce(l.nowcast_method, l.omset_method),
           'omset_confidence', coalesce(l.nowcast_confidence, l.omset_confidence),
           'v_daily',        coalesce(l.nowcast_velocity_daily, l.est_velocity_daily),
           'total_sold',     l.total_sold,
           'sold_tier',      l.sold_tier,
           'momentum_pct',   m.momentum_pct,
           'momentum_class', coalesce(m.momentum_class, 'belum'),
           'units_now_wk',   m.units_now_wk,
           'units_prev_wk',  m.units_prev_wk,
           'rating',         l.rating,
           'reviews',        l.reviews,
           'wishlist',       l.wishlist,
           'in_stock',       l.in_stock,
           'is_ad',          l.is_ad,
           'search_rank',    l.search_rank,
           'listing_date',   l.listing_date,
           'scraped_at',     l.scraped_at,
           'last_obs_at',    l.nowcast_last_obs_at,
           'n_obs',          l.nowcast_n_obs,
           'url',            l.url,
           'image_url',      l.image_url
         ) order by k.ord), '[]'::jsonb) into v_snap
  from (
    select i::int as ord,
           p_item_ids[i] as item_id,
           p_shop_ids[i] as shop_id,
           nullif(btrim(coalesce(p_keywords[i], '')), '') as keyword
    from generate_subscripts(p_item_ids, 1) as i
    where i <= v_maxkeys
      and p_item_ids[i] is not null and p_shop_ids[i] is not null
  ) k
  cross join lateral (
    select d.*
    from public.listings_deduped d
    where d.item_id = k.item_id and d.shop_id = k.shop_id
      and not d.is_offtopic
    order by (d.keyword is not distinct from k.keyword) desc,
             d.total_sold desc nulls last
    limit 1
  ) l
  left join public.mv_listing_momentum m
    on m.item_id = l.item_id and m.shop_id = l.shop_id;

  v_asked := greatest(coalesce(array_length(p_item_ids, 1), 0),
                      jsonb_array_length(v_snap));
  if jsonb_array_length(v_snap) = 0 then
    return json_build_object('allowed', false, 'reason', 'no_rows',
      'used', v_used, 'limit', v_limit, 'remaining', v_remaining,
      'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
      'weeks_remaining', v_weeks_rem,
      'reset_at', public._export_reset_at());
  end if;

  if v_hist then
    select array_agg((r->>'item_id')::bigint order by (r->>'ord')::int),
           array_agg((r->>'shop_id')::bigint order by (r->>'ord')::int)
      into v_items, v_shops
      from jsonb_array_elements(v_snap) r;

    select coalesce(jsonb_agg(to_jsonb(w) order by w.ord, w.week_start), '[]'::jsonb)
      into v_weeksall
      from public._product_weeks_batch(v_items, v_shops, v_weeks) w;
  end if;

  if v_hist then
    v_kept := jsonb_array_length(v_snap);
    v_maxord := v_kept;
    v_weeks_cost := v_weeks * v_kept;
    v_cost := 0;
    if not v_replay and not v_priv and v_weeks_cost > v_weeks_rem then
      return json_build_object('allowed', false, 'reason', 'not_enough_weeks',
        'need', v_weeks_cost, 'used', v_used, 'limit', v_limit,
        'remaining', v_remaining,
        'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
        'weeks_remaining', v_weeks_rem,
        'reset_at', public._export_reset_at());
    end if;
  else
    with snap as (
      select (r->>'ord')::int as ord from jsonb_array_elements(v_snap) r
    ),
    running as (
      select ord, 1 as c,
             sum(1) over (order by ord rows between unbounded preceding and current row) as cum
      from snap
    ),
    keep as (select ord, cum from running where cum <= v_remaining)
    select coalesce(max(k.ord), 0), coalesce(max(k.cum), 0), count(k.ord)::int,
           1
      into v_maxord, v_cost, v_kept, v_need
    from keep k;

    if v_kept = 0 then
      return json_build_object('allowed', false, 'reason', 'not_enough_rows',
        'need', coalesce(v_need, 1), 'used', v_used, 'limit', v_limit,
        'remaining', v_remaining,
        'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
        'weeks_remaining', v_weeks_rem,
        'reset_at', public._export_reset_at());
    end if;
  end if;

  select coalesce(jsonb_agg(r order by (r->>'ord')::int), '[]'::jsonb) into v_rows
    from jsonb_array_elements(v_snap) r where (r->>'ord')::int <= v_maxord;

  if v_hist then
    select coalesce(jsonb_agg(w order by (w->>'ord')::int, w->>'week_start'), '[]'::jsonb)
      into v_series
      from jsonb_array_elements(v_weeksall) w where (w->>'ord')::int <= v_maxord;
  end if;

  v_total := jsonb_array_length(v_rows) + jsonb_array_length(v_series);

  if not v_replay and not v_priv then
    insert into public.daily_usage (user_id, day)
    values (v_me, public._usage_day())
    on conflict (user_id, day) do nothing;

    if v_hist then
      update public.daily_usage
         set export_weeks_used = export_weeks_used + v_weeks_cost, updated_at = now()
       where user_id = v_me and day = public._usage_day()
         and export_weeks_used + v_weeks_cost <= v_wlimit
      returning export_weeks_used, export_rows_used into v_weeks_used, v_used;

      if v_weeks_used is null then
        select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
          into v_used, v_weeks_used from public.daily_usage
         where user_id = v_me and day = public._usage_day();
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit,
          'remaining', greatest(0, v_limit - v_used),
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', greatest(0, v_wlimit - v_weeks_used),
          'reset_at', public._export_reset_at());
      end if;
    else
      update public.daily_usage
         set export_rows_used = export_rows_used + v_cost, updated_at = now()
       where user_id = v_me and day = public._usage_day()
         and export_rows_used + v_cost <= v_limit
      returning export_rows_used, export_weeks_used into v_used, v_weeks_used;

      if v_used is null then
        select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
          into v_used, v_weeks_used from public.daily_usage
         where user_id = v_me and day = public._usage_day();
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit,
          'remaining', greatest(0, v_limit - v_used),
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', greatest(0, v_wlimit - v_weeks_used),
          'reset_at', public._export_reset_at());
      end if;
    end if;

    insert into public.export_jobs (user_id, request_id, day, shape, weeks,
                                    rows_charged, rows_total, products, truncated, source)
    values (v_me, p_request_id, public._usage_day(),
            case when v_hist then 'history' else 'snapshot' end,
            case when v_hist then v_weeks else 0 end,
            case when v_hist then v_weeks_cost else v_cost end,
            v_total, v_kept, v_kept < v_asked, v_src)
    on conflict (user_id, request_id) do nothing;

    insert into public.usage_events (user_id, kind, action, weight, product_key)
    values (v_me, 'export',
            case when v_hist then 'export_history' else 'export_snapshot' end,
            case when v_hist then v_weeks_cost else v_cost end,
            left(v_src, 40));
  end if;

  return json_build_object(
    'allowed',         true,
    'replay',          v_replay,
    'unlimited',       v_priv,
    'charged',         case when v_replay or v_priv then 0
                            when v_hist then v_weeks_cost else v_cost end,
    'weeks_charged',   case when v_replay or v_priv or not v_hist then 0 else v_weeks_cost end,
    'used',            v_used,
    'limit',           v_limit,
    'remaining',       case when v_priv then null else greatest(0, v_limit - v_used) end,
    'weeks_used',      v_weeks_used,
    'weeks_limit',     v_wlimit,
    'weeks_remaining', case when v_priv then null else greatest(0, v_wlimit - v_weeks_used) end,
    'reset_at',        public._export_reset_at(),
    'products',        v_kept,
    'requested',       v_asked,
    'truncated',       v_kept < v_asked,
    'weeks',           case when v_hist then v_weeks else 0 end,
    'rows_total',      v_total,
    'generated_at',    now(),
    'rows',            v_rows,
    'history',         v_series);
end;
$$;

comment on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text) is
  'Meters and returns XLSX/CSV export rows. Cari Produk = monthly omset snapshot '
  '(1 product = 1 row, 90/day). Weekly history only for Deep Dive single-product '
  '(12 weeks/day). Idempotent on (auth.uid(), p_request_id).';

revoke all on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text)
  from public, anon;
grant execute on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
