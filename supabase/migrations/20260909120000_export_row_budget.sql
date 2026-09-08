-- ============================================================================
-- Export row budget — XLSX/CSV export of product snapshots + weekly history.
--
-- Budget: 90 rows per user per WIB day, but ONLY MEASURED ROWS COST.
--   snapshot row                       -> 1
--   history week, sumber = 'terukur'   -> 1
--   history week, 'perkiraan'/'proyeksi' -> 0   (our estimators, given away)
--
-- TRAP 1 — _beta_unlimited(): DO NOT call it here. It is hardcoded
--   `select true` (20260821120000_beta_unlimited_and_tracking_caps.sql) and
--   would make this budget dead on arrival. Only _usage_is_privileged()
--   (admin/leader) bypasses.
--
-- TRAP 2 — `create or replace function` PRESERVES the existing ACL. These
--   functions are NEW and need explicit grants. If a later migration replaces
--   them, grant `authenticated` ONLY — they must never be reachable by anon.
--
-- TRAP 3 — _product_weeks_batch is deliberately NOT granted. An ungated batch
--   history endpoint would make the row budget pointless.
--
-- TRAP 4 — `revoke ... from public` DOES NOT remove anon here. This database
--   has ALTER DEFAULT PRIVILEGES granting EXECUTE on every new function
--   directly to anon, authenticated and service_role (pg_default_acl:
--   {anon=X/postgres,...}), which is not the PUBLIC grant. Every function below
--   therefore revokes from `public, anon` explicitly. Verified: without the
--   explicit anon revoke, has_function_privilege('anon', 'export_rows', ...)
--   comes back true.
--
-- WHY product_daily_series AND NOT listing_weekly:
--   listing_weekly writes a gap week at the time it is missed and never
--   revises it (backfill_listing_weekly_estimates has WHERE NOT EXISTS), so a
--   product scraped 2026-07-27 then 2026-08-29 keeps 'peer'/'estimated' weeks
--   even though listing_deltas holds an exact 337-unit / 33.1-day delta.
--   product_daily_series spreads that delta correctly (10.17 units/day,
--   labelled 'measured') and is what the deep-dive chart already draws, so
--   building the export on it keeps the file and the chart in agreement.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260909120000_export_row_budget.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
alter table public.daily_usage
  add column if not exists export_rows_used integer not null default 0;

comment on column public.daily_usage.export_rows_used is
  'Measured rows written into XLSX/CSV exports today (WIB). Snapshot rows and '
  'terukur history weeks cost 1 each; perkiraan/proyeksi weeks are free. '
  'Independent of dives_used / ai_used.';

-- usage_events.kind allows only dive|ai today; widen it for 'export'.
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events
  add constraint usage_events_kind_check check (kind in ('dive','ai','export'));

-- Idempotency ledger: one row per export attempt.
create table if not exists public.export_jobs (
  user_id      uuid not null references auth.users(id) on delete cascade,
  request_id   uuid not null,
  day          date not null,
  shape        text not null check (shape in ('snapshot','history')),
  weeks        int  not null default 0,
  rows_charged int  not null,
  rows_total   int  not null default 0,
  products     int  not null,
  truncated    boolean not null default false,
  source       text,
  created_at   timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index if not exists export_jobs_user_day_idx on public.export_jobs (user_id, day);

alter table public.export_jobs enable row level security;
drop policy if exists "own export jobs select" on public.export_jobs;
create policy "own export jobs select" on public.export_jobs
  for select using (auth.uid() = user_id);
-- writes only through export_rows() (security definer)

grant select on public.export_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers (never granted; called from the definer RPCs)
-- ---------------------------------------------------------------------------
create or replace function public._export_row_limit()
returns integer language sql immutable as $$ select 90 $$;

comment on function public._export_row_limit() is
  'Daily measured-row budget. One number to change. EXPORT_ROW_LIMIT in '
  'js/gpt-app.js is display-only; the server decides.';

-- Max products per history export. Bounds BOTH the response payload (the
-- budget no longer does, since modelled rows are free) and the query time:
-- product_daily_series costs ~270ms on a high-history product, and 40 products
-- took 10.9s, past its own 10s statement_timeout. Do not raise without
-- re-measuring both.
create or replace function public._export_history_cap()
returns integer language sql immutable as $$ select 10 $$;

create or replace function public._export_reset_at()
returns timestamptz language sql stable
set search_path = public
as $$ select ((public._usage_day() + 1)::timestamp at time zone 'Asia/Jakarta') $$;

-- see TRAP 4: `from public` alone leaves the default-privilege grants in place
revoke all on function public._export_row_limit() from public, anon, authenticated;
revoke all on function public._export_history_cap() from public, anon, authenticated;
revoke all on function public._export_reset_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Batch weekly history — same estimator the deep-dive chart uses
-- ---------------------------------------------------------------------------
-- Bucketing must match ddDailyRowsToWeeks() in js/gpt-app.js (WIB Monday, via
-- listing_week_start) or the export and the chart disagree.
--
-- Every week is normalised to a 7-day rate: product_daily_series clamps p_to to
-- current_date + 7, so the leading and trailing buckets are usually partial and
-- a raw sum would understate them. hari_data makes that auditable.
create or replace function public._product_weeks_batch(
  p_item_ids bigint[],
  p_shop_ids bigint[],
  p_weeks    int default 12
)
returns table (
  ord          int,
  item_id      bigint,
  shop_id      bigint,
  week_start   date,
  units_wk     real,
  omset_wk     bigint,
  price        real,
  sumber       text,
  hari_terukur int,
  hari_data    int,
  billable     boolean
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
    -- n full weeks up to and including the current one, plus the forward week.
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
    -- left join, not cross: an inner join silently drops products with no series
    left join lateral public.product_daily_series(k.item_id, k.shop_id, b.d0, b.d1) s
      on true
  )
  select
    r.ord,
    r.item_id,
    r.shop_id,
    public.listing_week_start(r.d)                                   as week_start,
    (sum(r.units) * 7.0 / nullif(count(*), 0))::real                 as units_wk,
    round(sum(r.omset) * 7.0 / nullif(count(*), 0))::bigint          as omset_wk,
    avg(r.price)::real                                               as price,
    -- A week with ANY measured day is grounded in real observation, so it is
    -- 'perkiraan' (hari_terukur shows how much), never 'proyeksi'. Only a week
    -- with no measured day at all and forecast days ahead of the last scrape is
    -- a projection.
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
  group by r.ord, r.item_id, r.shop_id, public.listing_week_start(r.d)
  order by r.ord, week_start;
$$;

comment on function public._product_weeks_batch(bigint[], bigint[], int) is
  'Batch weekly history for the export, bucketed from product_daily_series to '
  'WIB Mondays. NOT GRANTED: it would bypass the export row budget.';

revoke all on function public._product_weeks_batch(bigint[], bigint[], int)
  from public, anon, authenticated;   -- see TRAP 4

-- ---------------------------------------------------------------------------
-- 4. Free quota read (cost preview / modal)
-- ---------------------------------------------------------------------------
create or replace function public.get_my_export_quota()
returns json
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v_me    uuid := auth.uid();
  v_used  integer;
  v_limit integer := public._export_row_limit();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- NOT _beta_unlimited() — see TRAP 1.
  if public._usage_is_privileged() then
    return json_build_object('unlimited', true, 'used', 0, 'limit', null,
      'remaining', null, 'history_cap', public._export_history_cap(),
      'reset_at', public._export_reset_at());
  end if;

  select coalesce(export_rows_used, 0) into v_used
    from public.daily_usage where user_id = v_me and day = public._usage_day();
  v_used := coalesce(v_used, 0);

  return json_build_object(
    'unlimited',   false,
    'used',        v_used,
    'limit',       v_limit,
    'remaining',   greatest(0, v_limit - v_used),
    'history_cap', public._export_history_cap(),
    'reset_at',    public._export_reset_at());
end;
$$;

revoke all on function public.get_my_export_quota() from public, anon;   -- see TRAP 4
grant execute on function public.get_my_export_quota() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The metered export
-- ---------------------------------------------------------------------------
-- Order is RESOLVE -> COST -> CHARGE, all in one transaction, so a product that
-- vanished from the matview between paint and export is never billed, and any
-- exception rolls the charge back with it.
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
  v_me        uuid    := auth.uid();
  v_limit     integer := public._export_row_limit();
  v_priv      boolean := public._usage_is_privileged();
  v_weeks     integer := greatest(1, least(coalesce(p_weeks, 12), 26));
  v_hist      boolean := coalesce(p_history, false);
  v_src       text    := case when coalesce(p_source, 'directory')
                                   in ('directory', 'deepdive', 'favorit')
                              then p_source else 'directory' end;
  v_maxkeys   integer;
  v_used      integer;
  v_remaining integer;
  v_maxord    integer := 0;
  v_cost      integer := 0;
  v_kept      integer := 0;
  v_asked     integer := 0;
  v_need      integer := 0;
  v_total     integer := 0;
  v_replay    boolean := false;
  v_prior     public.export_jobs%rowtype;
  v_items     bigint[];
  v_shops     bigint[];
  v_snap      jsonb   := '[]'::jsonb;
  v_weeksall  jsonb   := '[]'::jsonb;
  v_rows      jsonb   := '[]'::jsonb;
  v_series    jsonb   := '[]'::jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  if p_item_ids is null or p_shop_ids is null then raise exception 'missing_keys'; end if;
  if coalesce(array_length(p_item_ids, 1), 0)
     is distinct from coalesce(array_length(p_shop_ids, 1), 0) then
    raise exception 'key_arrays_mismatched';
  end if;

  -- History is capped by product count as well as by budget: modelled rows are
  -- free, so the budget alone no longer bounds the payload or the query time.
  v_maxkeys := case when v_hist then public._export_history_cap() else v_limit end;

  -- 5a. Idempotent replay: same request_id -> rebuild, never recharge.
  select * into v_prior from public.export_jobs
   where user_id = v_me and request_id = p_request_id;

  select coalesce(export_rows_used, 0) into v_used
    from public.daily_usage where user_id = v_me and day = public._usage_day();
  v_used := coalesce(v_used, 0);

  if v_prior.request_id is not null then
    v_replay    := true;
    v_remaining := v_prior.rows_charged;     -- reproduce the same truncation
  elsif v_priv then
    v_remaining := v_limit;                  -- admins bounded by payload, not budget
  else
    v_remaining := greatest(0, v_limit - v_used);
    if v_remaining = 0 then
      return json_build_object('allowed', false, 'reason', 'limit_reached',
        'used', v_used, 'limit', v_limit, 'remaining', 0,
        'reset_at', public._export_reset_at());
    end if;
  end if;

  -- 5b. Resolve the snapshot rows once, in the client's order.
  -- Explicit keys, not `l.*`: the sheet's column contract lives here, and the
  -- nowcast_* / momentum names are normalised so the client never has to know
  -- which estimator a value came from (the *_method / *_confidence columns say).
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
    -- prefer the exact row the user was looking at; fall back if the matview
    -- refreshed and that (item, shop, keyword) row is gone
    order by (d.keyword is not distinct from k.keyword) desc,
             d.total_sold desc nulls last
    limit 1
  ) l
  left join public.mv_listing_momentum m
    on m.item_id = l.item_id and m.shop_id = l.shop_id;

  -- requested = what the client actually asked for, so a selection clipped by
  -- v_maxkeys reports truncated:true rather than silently looking complete.
  v_asked := greatest(coalesce(array_length(p_item_ids, 1), 0),
                      jsonb_array_length(v_snap));
  if jsonb_array_length(v_snap) = 0 then
    return json_build_object('allowed', false, 'reason', 'no_rows',
      'used', v_used, 'limit', v_limit, 'remaining', v_remaining,
      'reset_at', public._export_reset_at());
  end if;

  -- 5c. Resolve the weekly history once (the expensive call).
  if v_hist then
    select array_agg((r->>'item_id')::bigint order by (r->>'ord')::int),
           array_agg((r->>'shop_id')::bigint order by (r->>'ord')::int)
      into v_items, v_shops
      from jsonb_array_elements(v_snap) r;

    select coalesce(jsonb_agg(to_jsonb(w) order by w.ord, w.week_start), '[]'::jsonb)
      into v_weeksall
      from public._product_weeks_batch(v_items, v_shops, v_weeks) w;
  end if;

  -- 5d. Cost the affordable prefix. Only measured rows count.
  with snap as (
    select (r->>'ord')::int as ord from jsonb_array_elements(v_snap) r
  ),
  bill as (
    select (w->>'ord')::int as ord, count(*)::int as n
    from jsonb_array_elements(v_weeksall) w
    where (w->>'billable')::boolean
    group by 1
  ),
  cost_per as (
    select s.ord, 1 + coalesce(b.n, 0) as c
    from snap s left join bill b on b.ord = s.ord
  ),
  running as (
    select ord, c,
           sum(c) over (order by ord rows between unbounded preceding and current row) as cum
    from cost_per
  ),
  keep as (select ord, cum from running where cum <= v_remaining)
  select coalesce(max(k.ord), 0), coalesce(max(k.cum), 0), count(k.ord)::int,
         (select min(c) from cost_per)
    into v_maxord, v_cost, v_kept, v_need
  from keep k;

  if v_kept = 0 then
    return json_build_object('allowed', false, 'reason', 'not_enough_rows',
      'need', coalesce(v_need, 1), 'used', v_used, 'limit', v_limit,
      'remaining', v_remaining, 'reset_at', public._export_reset_at());
  end if;

  -- 5e. Trim both payloads to the affordable prefix.
  select coalesce(jsonb_agg(r order by (r->>'ord')::int), '[]'::jsonb) into v_rows
    from jsonb_array_elements(v_snap) r where (r->>'ord')::int <= v_maxord;

  if v_hist then
    select coalesce(jsonb_agg(w order by (w->>'ord')::int, w->>'week_start'), '[]'::jsonb)
      into v_series
      from jsonb_array_elements(v_weeksall) w where (w->>'ord')::int <= v_maxord;
  end if;

  v_total := jsonb_array_length(v_rows) + jsonb_array_length(v_series);

  -- 5f. Charge. The guarded UPDATE means two tabs cannot both fit the budget.
  if not v_replay and not v_priv then
    insert into public.daily_usage (user_id, day)
    values (v_me, public._usage_day())
    on conflict (user_id, day) do nothing;

    update public.daily_usage
       set export_rows_used = export_rows_used + v_cost, updated_at = now()
     where user_id = v_me and day = public._usage_day()
       and export_rows_used + v_cost <= v_limit
    returning export_rows_used into v_used;

    if v_used is null then
      select coalesce(export_rows_used, 0) into v_used from public.daily_usage
       where user_id = v_me and day = public._usage_day();
      return json_build_object('allowed', false, 'reason', 'limit_reached',
        'used', v_used, 'limit', v_limit,
        'remaining', greatest(0, v_limit - v_used),
        'reset_at', public._export_reset_at());
    end if;

    insert into public.export_jobs (user_id, request_id, day, shape, weeks,
                                    rows_charged, rows_total, products, truncated, source)
    values (v_me, p_request_id, public._usage_day(),
            case when v_hist then 'history' else 'snapshot' end,
            case when v_hist then v_weeks else 0 end,
            v_cost, v_total, v_kept, v_kept < v_asked, v_src)
    on conflict (user_id, request_id) do nothing;

    -- product_key carries the surface, not a product: exports are list-grain.
    insert into public.usage_events (user_id, kind, action, weight, product_key)
    values (v_me, 'export',
            case when v_hist then 'export_history' else 'export_snapshot' end,
            v_cost, left(v_src, 40));
  end if;

  return json_build_object(
    'allowed',      true,
    'replay',       v_replay,
    'unlimited',    v_priv,
    'charged',      case when v_replay or v_priv then 0 else v_cost end,
    'used',         v_used,
    'limit',        v_limit,
    'remaining',    case when v_priv then null else greatest(0, v_limit - v_used) end,
    'reset_at',     public._export_reset_at(),
    'products',     v_kept,
    'requested',    v_asked,
    'truncated',    v_kept < v_asked,
    'weeks',        case when v_hist then v_weeks else 0 end,
    'rows_total',   v_total,
    'generated_at', now(),
    'rows',         v_rows,
    'history',      v_series);
end;
$$;

comment on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text) is
  'Atomically meters and returns the canonical rows for an XLSX/CSV export. '
  'Cost = measured rows only (1 per snapshot row + 1 per terukur week); '
  'perkiraan and proyeksi weeks are free. Idempotent on (auth.uid(), '
  'p_request_id). Does NOT consult _beta_unlimited().';

revoke all on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text)
  from public, anon;   -- see TRAP 4
grant execute on function public.export_rows(uuid, bigint[], bigint[], text[], boolean, int, text) to authenticated;

commit;

notify pgrst, 'reload schema';
