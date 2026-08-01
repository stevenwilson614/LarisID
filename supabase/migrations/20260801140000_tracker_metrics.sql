-- ============================================================================
-- Which metrics a user wants tracked.
--
-- Stored on user_tracker_state, i.e. PER USER, not per keyword. The picker is
-- global in the UI ("Anda bisa mengubahnya kapan saja") and the rollup is one
-- table with one header row — per-keyword metrics would mean a table whose
-- columns change per row, which cannot be rendered coherently.
--
-- The six keys map 1:1 onto columns get_tracker_rollup already returns:
--   units  -> units          omset  -> omset
--   sku    -> n_listings     toko   -> n_sellers
--   harga  -> avg_price      rating -> avg_rating
-- so selecting metrics is purely a display concern; nothing changes about what
-- the scraper collects. A user who adds a metric later immediately sees history
-- for it, because it was being measured all along.
-- ============================================================================

begin;

create or replace function public.tracker_default_metrics() returns text[]
  language sql immutable as $$ select array['units','omset','sku','toko']::text[] $$;

create or replace function public.tracker_valid_metrics() returns text[]
  language sql immutable as $$ select array['units','omset','sku','toko','harga','rating']::text[] $$;

alter table public.user_tracker_state
  add column if not exists metrics text[] not null default array['units','omset','sku','toko']::text[];

-- Reject unknown keys at the boundary. Without this a typo in the client would
-- persist silently and quietly drop a column from that user's table forever.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_tracker_state_metrics_valid'
  ) then
    alter table public.user_tracker_state
      add constraint user_tracker_state_metrics_valid
      check (metrics <@ public.tracker_valid_metrics() and cardinality(metrics) >= 1);
  end if;
end $$;

comment on column public.user_tracker_state.metrics is
  'Display selection only — every metric is collected regardless. Adding one '
  'later surfaces its full history immediately.';

create or replace function public.set_tracker_metrics(p_metrics text[])
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me    uuid := auth.uid();
  v_clean text[];
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- Intersect with the allow-list rather than trusting the payload, and dedupe.
  select coalesce(array_agg(distinct m order by m), '{}'::text[]) into v_clean
  from unnest(coalesce(p_metrics, '{}'::text[])) m
  where m = any(public.tracker_valid_metrics());

  -- An empty table is not a meaningful state; fall back to the defaults so a
  -- user who unticks everything still has something to look at.
  if v_clean is null or cardinality(v_clean) = 0 then
    v_clean := public.tracker_default_metrics();
  end if;

  insert into public.user_tracker_state (user_id, metrics)
  values (v_me, v_clean)
  on conflict (user_id) do update set metrics = excluded.metrics;

  return json_build_object('ok', true, 'metrics', v_clean);
end $$;

-- get_my_tracking gains `metrics` so the client can render the right columns on
-- first paint instead of flashing the defaults and then correcting itself.
create or replace function public.get_my_tracking()
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_st public.user_tracker_state%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_st from public.user_tracker_state where user_id = v_me;

  return json_build_object(
    'keyword_limit', public.tracking_keyword_limit(),
    'store_limit',   public.tracking_store_limit(),
    'paused',        (v_st.paused_at is not null),
    'paused_at',     v_st.paused_at,
    'last_viewed_at',v_st.last_viewed_at,
    'metrics',       coalesce(v_st.metrics, public.tracker_default_metrics()),
    'all_metrics',   public.tracker_valid_metrics(),
    'keywords', coalesce((
      select json_agg(json_build_object(
               'id', k.id, 'keyword', k.keyword, 'category', k.category,
               'created_at', k.created_at) order by k.created_at)
      from public.user_tracked_keywords k where k.user_id = v_me), '[]'::json),
    'stores', coalesce((
      select json_agg(json_build_object(
               'id', s.id, 'shop_id', s.shop_id, 'store_name', s.store_name,
               'created_at', s.created_at) order by s.created_at)
      from public.user_tracked_stores s where s.user_id = v_me), '[]'::json)
  );
end $$;

revoke all on function
  public.set_tracker_metrics(text[]),
  public.tracker_default_metrics(),
  public.tracker_valid_metrics()
from public, anon;

grant execute on function
  public.set_tracker_metrics(text[]),
  public.tracker_default_metrics(),
  public.tracker_valid_metrics()
to authenticated;

commit;

notify pgrst, 'reload schema';
