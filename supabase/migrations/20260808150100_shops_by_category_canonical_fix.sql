-- Fix 20260808150000: find_shops_by_category matched against mv_shops.category,
-- which is the RAW per-shop mode category (e.g. "Sepatu & Sandal", "Tas") —
-- but the app's category picker (S.categories, from getCategories()) sends the
-- CANONICAL bucket label (e.g. "Sepatu, Tas & Aksesoris", per category_map from
-- 20260728130000). Those canonical strings never appear as a raw category
-- value, so the RPC returned zero rows for every bucket except the handful
-- where canonical happens to equal the raw string verbatim (e.g. "Fashion").
--
-- Recompute mv_shops with an added `canonical_category` (mode of each
-- listing's category_map-mapped bucket, not the mode of the raw string) and
-- match on that instead. `category` (raw) is kept as-is — find_shops_by_name
-- and any other existing reader still gets the same column.

drop materialized view if exists public.mv_shops cascade;

create materialized view public.mv_shops as
select
  l.shop_id,
  mode() within group (order by trim(l.store_name))                    as store_name,
  count(*)::int                                                        as n_listings,
  coalesce(sum(l.total_sold), 0)::bigint                                as total_sold,
  mode() within group (order by l.location)                            as location,
  mode() within group (order by l.category)                            as category,
  mode() within group (order by coalesce(cm.canonical, l.category))    as canonical_category,
  max(l.scraped_at)                                                    as last_seen_at,
  now()                                                                as refreshed_at
from public.listings_deduped l
left join public.category_map cm on cm.raw_category = l.category
where l.shop_id is not null
  and coalesce(trim(l.store_name), '') <> ''
group by l.shop_id;

create unique index mv_shops_shop_id_idx on public.mv_shops (shop_id);
create index mv_shops_name_lower_idx on public.mv_shops (lower(store_name));
create index mv_shops_name_trgm_idx  on public.mv_shops using gin (lower(store_name) gin_trgm_ops);
create index mv_shops_listings_idx   on public.mv_shops (n_listings desc);
create index mv_shops_canon_cat_idx  on public.mv_shops (canonical_category);

grant select on public.mv_shops to anon, authenticated;

-- Recreate both mv_shops readers. The cascade above only drops relations
-- formally dependent on mv_shops (there are none) — these two functions
-- merely reference it in their SQL body, which Postgres does not track as a
-- cascade dependency, so they still exist and need `or replace`.
create or replace function public.find_shops_by_name(p_q text, p_limit int default 8)
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

create or replace function public.find_shops_by_category(p_category text, p_limit int default 30)
returns table (
  shop_id     bigint,
  store_name  text,
  n_listings  int,
  total_sold  bigint,
  location    text,
  category    text
)
language sql stable security definer
set search_path = public
set statement_timeout = '10s'
as $$
  select s.shop_id, s.store_name, s.n_listings, s.total_sold, s.location, s.canonical_category as category
  from public.mv_shops s
  where p_category is not null and trim(p_category) <> ''
    and s.canonical_category = p_category
  order by s.total_sold desc, s.n_listings desc
  limit greatest(1, least(coalesce(p_limit, 30), 60));
$$;

grant execute on function public.find_shops_by_category(text, int) to authenticated;

-- mv_shops is refreshed inside refresh_breakout_matviews() by name only — the
-- function body doesn't reference columns, so no change needed there.
