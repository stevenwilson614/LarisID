-- Expose the velocity nowcast catalog-wide.
--
-- listings_deduped is what Discover, Product DB, MLS and the deep dive read for
-- current product cards. It carries est_omset_monthly (stamped by
-- refresh_omset_estimates on the day of a scrape) but NOT est_velocity_daily and
-- NOT omset_method, so the frontend cannot tell a measured figure from an
-- imputed one, and a product whose last scrape was months ago presents its
-- stale number at the same confidence as one scraped this morning.
--
-- This joins product_velocity (shopee_scraper/velocity_model.sql), which holds a
-- CURRENT estimate for all 511,641 products with no NULLs, plus the provenance
-- to describe it. Names are prefixed nowcast_* so nothing that reads the
-- existing columns changes behaviour.
--
-- listings_deduped has two dependent matviews (mv_product_types, mv_shops) and
-- recreating it needs CASCADE, so this saves their definitions, indexes and
-- grants first and restores them in the same transaction rather than requiring
-- anyone to transcribe them by hand.

set statement_timeout to '1800s';

-- /dev/shm in the supabase-db container is Docker's default 64MB. A parallel
-- build of a 511k-row matview exchanges tuples through shared memory and dies
-- with "could not resize shared memory segment ... No space left on device".
-- Serial execution needs no such segment. Cheaper than resizing the container.
set max_parallel_workers_per_gather to 0;

begin;

-- Capture EVERY dependent, transitively, not just the two obvious matviews:
-- product_types_v is a plain view sitting on top of mv_product_types, so a
-- CASCADE takes it too and a hardcoded list silently loses it. Depth drives
-- the recreate order.
create temp table _saved_defs on commit drop as
with recursive deps as (
    select c.oid, 1 as depth
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = r.ev_class
    join pg_class src on src.oid = d.refobjid
    where src.relname = 'listings_deduped'
      and c.relname <> 'listings_deduped'
      and c.relkind in ('v', 'm')
  union
    select c.oid, deps.depth + 1
    from deps
    join pg_depend d on d.refobjid = deps.oid
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = r.ev_class
    where c.oid <> deps.oid and c.relkind in ('v', 'm')
)
select c.relname,
       c.relkind,
       max(deps.depth) as depth,
       pg_get_viewdef(c.oid, true) as def
from deps
join pg_class c on c.oid = deps.oid
group by c.relname, c.relkind, c.oid;

create temp table _saved_idx on commit drop as
select indexdef from pg_indexes
where schemaname = 'public'
  and tablename in (select relname from _saved_defs);

create temp table _saved_grants on commit drop as
select distinct 'grant ' || privilege_type || ' on public.' || table_name
                || ' to ' || grantee as stmt
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (select relname from _saved_defs)
  and grantee in ('anon', 'authenticated');

drop materialized view if exists public.listings_deduped cascade;

create materialized view public.listings_deduped as
select distinct on (l.item_id, l.shop_id)
       l.item_id, l.shop_id, l.product_name, l.store_name, l.price,
       l.original_price, l.total_sold, l.category, l.image_url, l.url,
       l.scraped_at, l.keyword, l.location, l.rating, l.reviews, l.listing_date,
       l.est_sold, l.sold_tier, l.est_omset_monthly, l.omset_confidence,
       l.in_stock, l.search_rank, l.is_ad, l.wishlist,
       -- carried through from the scrape row so the client can tell a measured
       -- figure from a cohort-imputed one; neither was exposed before
       l.est_velocity_daily, l.omset_method,
       -- the current nowcast: one row per product, never NULL, with provenance
       pv.v_daily        as nowcast_velocity_daily,
       pv.omset_monthly  as nowcast_omset_monthly,
       pv.confidence     as nowcast_confidence,
       pv.method         as nowcast_method,
       pv.last_obs_at    as nowcast_last_obs_at,
       pv.n_obs          as nowcast_n_obs
from public.listings l
left join public.product_velocity pv
       on pv.item_id = l.item_id and pv.shop_id = l.shop_id
order by l.item_id, l.shop_id, l.scraped_at desc;

create index listings_deduped_total_sold_idx
  on public.listings_deduped using btree (total_sold desc);
create index listings_deduped_category_idx
  on public.listings_deduped using btree (category);
create index listings_deduped_location_idx
  on public.listings_deduped using btree (location);
create index listings_deduped_keyword_idx
  on public.listings_deduped using btree (keyword);
create index listings_deduped_pname_trgm_idx
  on public.listings_deduped using gin (product_name gin_trgm_ops);
create index listings_deduped_keyword_trgm_idx
  on public.listings_deduped using gin (keyword gin_trgm_ops);
create index listings_deduped_nowcast_omset_idx
  on public.listings_deduped using btree (nowcast_omset_monthly desc);
-- (item_id, shop_id) lookups were unindexed here, the same trap flagged for
-- listing_deltas and listings: the leading column decides what is sargable.
create unique index listings_deduped_item_shop_idx
  on public.listings_deduped using btree (item_id, shop_id);

grant select on public.listings_deduped to anon, authenticated;

comment on materialized view public.listings_deduped is
  'Latest listing row per (item_id, shop_id), joined to the current velocity '
  'nowcast (nowcast_*). Prefer over raw listings for current product cards / '
  'top-N. Keep raw listings for time-series panels.';

-- Restore the dependents CASCADE just removed.
do $restore$
declare
  r record;
begin
  -- shallowest first: a view on a matview must be recreated after its base
  for r in select relname, relkind, def from _saved_defs order by depth loop
    if r.relkind = 'm' then
      execute format('create materialized view public.%I as %s', r.relname, r.def);
    else
      execute format('create view public.%I as %s', r.relname, r.def);
    end if;
  end loop;
  for r in select indexdef from _saved_idx loop
    execute r.indexdef;
  end loop;
  for r in select stmt from _saved_grants loop
    execute r.stmt;
  end loop;
end
$restore$;

commit;

-- A freshly created matview has no statistics, so the planner mis-plans against
-- it and even an indexed anon query blows the 3s role timeout. Measured: the
-- same top-N query went from a timeout to 48ms after this.
analyze public.listings_deduped;
analyze public.mv_product_types;
analyze public.mv_shops;

notify pgrst, 'reload schema';
