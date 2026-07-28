-- Hubungkan Toko: exact-match shop lookup was the reason sellers could not connect.
--
-- public.find_shop_by_name(text) matches on
--   lower(trim(store_name)) = lower(trim(p_store_name))
-- so a seller had to type their shop name character-perfect or get a dead end
-- ("Toko tidak ditemukan dalam database LarisID"). Anything short of exact —
-- a missing " Official Store" suffix, different spacing, wrong case on a word —
-- returned zero rows.
--
-- This adds a shops matview (130k distinct shops, small enough to trigram-index
-- cheaply, unlike the full listings table) and a ranked fuzzy finder that returns
-- several candidates so the client can show a picker.
--
-- The old find_shop_by_name is left in place for stale cached clients.

create extension if not exists pg_trgm;

-- ── Shops matview ────────────────────────────────────────────────────────
drop materialized view if exists public.mv_shops cascade;

-- One row per shop_id. A shop can appear under several trimmed names across
-- scrapes (renames, padding variants), so the display name is the most common
-- one rather than grouping by name — otherwise shop_id is not unique.
create materialized view public.mv_shops as
select
  shop_id,
  mode() within group (order by trim(store_name)) as store_name,
  count(*)::int                                   as n_listings,
  coalesce(sum(total_sold), 0)::bigint            as total_sold,
  mode() within group (order by location)         as location,
  mode() within group (order by category)         as category,
  max(scraped_at)                                 as last_seen_at,
  now()                                           as refreshed_at
from public.listings_deduped
where shop_id is not null
  and coalesce(trim(store_name), '') <> ''
group by shop_id;

create unique index mv_shops_shop_id_idx on public.mv_shops (shop_id);
create index mv_shops_name_lower_idx on public.mv_shops (lower(store_name));
create index mv_shops_name_trgm_idx  on public.mv_shops using gin (lower(store_name) gin_trgm_ops);
create index mv_shops_listings_idx   on public.mv_shops (n_listings desc);

grant select on public.mv_shops to anon, authenticated;

-- ── Ranked fuzzy finder ──────────────────────────────────────────────────
-- match_kind: 'exact' | 'prefix' | 'contains' | 'fuzzy' — the client shows a
-- picker for anything that is not a single exact hit.
drop function if exists public.find_shops_by_name(text, int);
create function public.find_shops_by_name(p_q text, p_limit int default 8)
returns table (
  shop_id     bigint,
  store_name  text,
  n_listings  int,
  total_sold  bigint,
  location    text,
  match_kind  text,
  score       real
)
language sql stable security definer
-- pg_trgm lives in the `extensions` schema on this box, so similarity()/% are
-- not resolvable from a bare `search_path = public`.
set search_path = public, extensions
set statement_timeout = '10s'
as $$
  with q as (
    select lower(trim(coalesce(p_q, ''))) as needle
  )
  select
    s.shop_id,
    s.store_name,
    s.n_listings,
    s.total_sold,
    s.location,
    case
      when lower(s.store_name) = q.needle                then 'exact'
      when lower(s.store_name) like q.needle || '%'      then 'prefix'
      when lower(s.store_name) like '%' || q.needle || '%' then 'contains'
      else 'fuzzy'
    end as match_kind,
    case
      when lower(s.store_name) = q.needle                then 1.0::real
      when lower(s.store_name) like q.needle || '%'      then 0.9::real
      when lower(s.store_name) like '%' || q.needle || '%' then 0.8::real
      else similarity(lower(s.store_name), q.needle)
    end as score
  from public.mv_shops s, q
  where q.needle <> ''
    and (
      lower(s.store_name) like '%' || q.needle || '%'
      or lower(s.store_name) % q.needle
    )
  order by score desc, s.n_listings desc
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;

grant execute on function public.find_shops_by_name(text, int) to authenticated;

-- ── Keep the matview fresh alongside the others ──────────────────────────
-- Re-asserted in full: mv_shops reads listings_deduped, so it must refresh after it.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
end; $function$;
