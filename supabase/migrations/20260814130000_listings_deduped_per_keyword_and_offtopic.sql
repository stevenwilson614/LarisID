-- Re-key listings_deduped to one row per (item_id, shop_id, keyword) and stamp
-- a shared is_offtopic flag (Rule A: kw_hits = 0 AND (is_ad OR cat-spread >= 3)).
--
-- Copy of the drop-cascade / save-and-restore-dependents pattern from
-- 20260810120000_listings_deduped_velocity_cols.sql. Dependents today:
-- mv_product_types, mv_shops, product_types_v.

set statement_timeout to '3600s';

-- /dev/shm in the supabase-db container is Docker's default 64MB. A parallel
-- build of a ~800k-row matview exchanges tuples through shared memory and dies
-- with "could not resize shared memory segment ... No space left on device".
-- Serial execution needs no such segment. Cheaper than resizing the container.
set max_parallel_workers_per_gather to 0;

begin;

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
select x.*,
       (x.kw_hits = 0
        and (coalesce(x.is_ad, 0) = 1
             or x.item_cat_spread >= 3)) as is_offtopic
from (
  select distinct on (l.item_id, l.shop_id, btrim(l.keyword))
         l.item_id, l.shop_id, l.product_name, l.store_name, l.price,
         l.original_price, l.total_sold, l.category, l.image_url, l.url,
         l.scraped_at, l.keyword, l.location, l.rating, l.reviews, l.listing_date,
         l.est_sold, l.sold_tier, l.est_omset_monthly, l.omset_confidence,
         l.in_stock, l.search_rank, l.is_ad, l.wishlist,
         l.est_velocity_daily, l.omset_method,
         pv.v_daily        as nowcast_velocity_daily,
         pv.omset_monthly  as nowcast_omset_monthly,
         pv.confidence     as nowcast_confidence,
         pv.method         as nowcast_method,
         pv.last_obs_at    as nowcast_last_obs_at,
         pv.n_obs          as nowcast_n_obs,
         public._lid_kw_hits(l.keyword, l.product_name) as kw_hits,
         coalesce(spread.n_cats, 0::smallint)           as item_cat_spread
  from public.listings l
  left join public.product_velocity pv
         on pv.item_id = l.item_id and pv.shop_id = l.shop_id
  left join (
    select item_id,
           count(distinct nullif(btrim(category), ''))::smallint as n_cats
    from public.listings
    group by item_id
  ) spread on spread.item_id = l.item_id
  order by l.item_id, l.shop_id, btrim(l.keyword), l.scraped_at desc
) x;

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
create unique index listings_deduped_item_shop_kw_idx
  on public.listings_deduped using btree (item_id, shop_id, keyword);
create index listings_deduped_item_shop_idx
  on public.listings_deduped using btree (item_id, shop_id);
create index listings_deduped_kw_sold_ontopic_idx
  on public.listings_deduped using btree (keyword, total_sold desc)
  where not is_offtopic;

grant select on public.listings_deduped to anon, authenticated;

comment on materialized view public.listings_deduped is
  'Latest listing row per (item_id, shop_id, keyword), joined to the current '
  'velocity nowcast (nowcast_*). is_offtopic flags injected ads / category-'
  'sprayed items with no keyword token in the product name. Prefer over raw '
  'listings for current product cards / top-N. Keep raw listings for time-series.';

-- Restore the dependents CASCADE just removed.
do $restore$
declare
  r record;
begin
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

-- mv_shops counted every listings_deduped row. After the re-key that would
-- double-count multi-keyword items. Collapse back to one row per product so
-- shop numbers stay byte-identical to today.
drop materialized view if exists public.mv_shops;

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
from (
  select distinct on (item_id, shop_id) *
  from public.listings_deduped
  order by item_id, shop_id, scraped_at desc
) l
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

-- product_history_coverage counted listings_deduped rows as "products".
create or replace function public.product_history_coverage()
returns table(products bigint, with_history bigint, with_measured bigint, with_omset bigint)
language sql
stable
set search_path to 'public'
set statement_timeout to '5s'
as $function$
    SELECT
      (SELECT count(DISTINCT (item_id, shop_id)) FROM listings_deduped) AS products,
      (SELECT count(DISTINCT (item_id, shop_id)) FROM listing_deltas) AS with_history,
      (SELECT count(DISTINCT (item_id, shop_id))
         FROM listing_deltas
        WHERE estimation_method = 'exact'
          AND confidence = 'high') AS with_measured,
      (SELECT count(DISTINCT (item_id, shop_id)) FROM listings_deduped
        WHERE est_omset_monthly IS NOT NULL) AS with_omset;
$function$;

-- Live signature is still (keyword, price_p25, price_p75). Add the offtopic
-- filter; do not change the return type.
create or replace function public.product_type_quartiles(p_keywords text[])
returns table (keyword text, price_p25 bigint, price_p75 bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    btrim(l.keyword) as keyword,
    round((percentile_cont(0.25) within group (order by l.price::double precision))::numeric)::bigint as price_p25,
    round((percentile_cont(0.75) within group (order by l.price::double precision))::numeric)::bigint as price_p75
  from public.listings_deduped l
  where l.keyword = any (p_keywords)
    and l.total_sold > 0
    and l.price between 500 and 50000000
    and not l.is_offtopic
  group by 1;
$$;

revoke all on function public.product_type_quartiles(text[]) from public;
grant execute on function public.product_type_quartiles(text[]) to anon, authenticated;

create or replace function public.rebuild_keyword_subgroups(
  p_min_keywords int default 5,
  p_max_per_cat  int default 8
)
returns table (canonical text, subgroups int, assigned int, leftover int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
#variable_conflict use_column
begin
  create temp table _kw_canon on commit drop as
  select btrim(l.keyword) as keyword,
         public._lid_canonical_category(
           nullif(btrim(mode() within group (order by nullif(btrim(l.category),''))),''),
           btrim(l.keyword)
         ) as canonical,
         count(*) as n_listings
  from public.listings_deduped l
  where l.keyword is not null and btrim(l.keyword) <> ''
    and not l.is_offtopic
  group by btrim(l.keyword);

  create temp table _kw_tok on commit drop as
  select k.keyword, k.canonical, t.tok
  from _kw_canon k,
       lateral unnest(string_to_array(lower(regexp_replace(k.keyword, '[^a-zA-Z0-9 ]', ' ', 'g')), ' ')) as t(tok)
  where length(t.tok) >= 4
    and t.tok !~ '^[0-9]+$'
    and t.tok not in (
      'untuk','dan','yang','dari','dengan','murah','terbaru','best','seller','baru',
      'set','pcs','buah','pack','isi','anti','multi','mini','besar','kecil','model',
      'bahan','warna','size','type','tipe','plus','pro','max','free','gratis','asli',
      'original','import','lokal','premium','grosir','ecer','termurah','terlaris',
      'kualitas','bagus','lucu','cantik','keren','simple','praktis','serbaguna',
      'portable','custom','motif','polos','tebal','tipis','panjang','pendek','made',
      'with','for','the','and','high','low','new','hot','sale','shop','store',
      'minimalis','lipat','otomatis','elektrik','manual','silikon','stainless',
      'plastik','kaca','logam','karet','katun','kulit','kayu','wood','slab',
      'pemula','dewasa','remaja','unisex','import','jumbo','super','ekstra',
      'gores','foil','emas','silver','hitam','putih','bening','transparan'
    );

  create temp table _sg on commit drop as
  select canonical, tok, n_kw,
         row_number() over (partition by canonical order by n_kw desc, tok) as rnk
  from (
    select canonical, tok, count(distinct keyword) as n_kw
    from _kw_tok group by canonical, tok
  ) x
  where n_kw >= p_min_keywords;

  delete from _sg where rnk > p_max_per_cat;

  for i in 1..4 loop
    delete from public.keyword_subgroup;
    insert into public.keyword_subgroup (keyword, canonical, subgroup, updated_at)
    select distinct on (k.keyword)
           k.keyword,
           k.canonical,
           coalesce(initcap(s.tok), 'Lainnya') as subgroup,
           now()
    from _kw_canon k
    left join _kw_tok t on t.keyword = k.keyword
    left join _sg    s on s.canonical = k.canonical and s.tok = t.tok
    order by k.keyword, (s.rnk is null), s.rnk;

    delete from _sg
    where (canonical, tok) in (
      select ks.canonical, lower(ks.subgroup)
      from public.keyword_subgroup ks
      where ks.subgroup <> 'Lainnya'
      group by ks.canonical, lower(ks.subgroup)
      having count(*) < p_min_keywords
    );
    exit when not found;
  end loop;

  return query
  select ks.canonical,
         count(distinct ks.subgroup) filter (where ks.subgroup <> 'Lainnya')::int,
         count(*) filter (where ks.subgroup <> 'Lainnya')::int,
         count(*) filter (where ks.subgroup =  'Lainnya')::int
  from public.keyword_subgroup ks
  group by ks.canonical
  order by ks.canonical;
end; $$;

grant execute on function public.rebuild_keyword_subgroups(int, int) to service_role;

commit;

analyze public.listings_deduped;
analyze public.mv_product_types;
analyze public.mv_shops;

notify pgrst, 'reload schema';
