-- Take two slow queries off the Cari Produk critical path.
--
-- Opening Cari Produk was four strictly serial round trips. Two of them were
-- avoidable:
--
-- 1) product_type_quartiles(p_keywords) re-aggregates raw listings_deduped on
--    every page open, and fetchTerlarisMinggu awaits it before the grid can
--    paint. Measured 2026-09-08 against the live box: n=80 is 0.47s warm but
--    6.48s cold, n=150 is 4.5s warm, and n=1000 -- what the category-click path
--    sends -- returns HTTP 500 after 15.2s on EVERY call, so that browse has
--    been burning 15s on a request that can never succeed.
--
--    Its base filter is identical to the base CTE already inside
--    mv_product_types (total_sold > 0, price between 500 and 50000000,
--    not is_offtopic), so the four percentiles are precomputable. This adds a
--    small keyword-keyed matview rather than rewriting the 234-line
--    mv_product_types: same numbers, none of the risk, and product_types_v
--    already LEFT JOINs two other keyword-keyed relations.
--
--    Keyed by keyword only, deliberately -- that is exactly what the RPC
--    returned. A city-scoped variant would be more correct but is a behaviour
--    change, and this migration is a pure move.
--
--    CAVEAT worth stating rather than hiding: omset_mo divides by listing age
--    from now(), so freezing it in a matview pins it to refresh time. Refresh
--    is daily and the figure is a 30-day estimate, so drift is under a day.
--
-- 2) peta_batch(p_keys, p_weeks) is what gates the "Trending Sekarang" strip,
--    but that path (PetaPeluang.hydrateTrends -> attachTrends) reads only the
--    `momentum` key. The other keys cost: `positions` was 281 KB of the 317 KB
--    response, and `scrapes` runs a DISTINCT over raw public.listings. The
--    function also carries no statement_timeout, so anon's 3s cap killed it --
--    measured HTTP 500 at 3.3s on 2 of 3 cold runs, 4.4s when it landed.
--
--    peta_batch_momentum returns just the momentum array, wrapped in the same
--    {"momentum": [...]} shape so attachTrends needs no reshaping. peta_batch
--    stays exactly as-is for the Peta Peluang canvas, which does read
--    positions and scrapes.

set statement_timeout to '3600s';

begin;

-- ── 1. Precomputed price / omset percentiles, per keyword ────────────────
-- Expressions lifted verbatim from product_type_quartiles
-- (20260907160000_product_type_quartiles_restore_omset_and_timeout.sql).

drop materialized view if exists public.mv_product_type_quartiles;

create materialized view public.mv_product_type_quartiles as
with base as (
  select
    btrim(l.keyword) as keyword,
    l.price::double precision as price,
    case
      when l.listing_date is null
        or coalesce(l.price, 0) <= 0
        or coalesce(l.total_sold, 0) <= 0 then 0::double precision
      else least(
        l.total_sold::double precision
          / greatest(1.0, extract(epoch from (now() - l.listing_date)) / 86400.0),
        500.0
      ) * l.price::double precision * 30.0
    end as omset_mo
  from public.listings_deduped l
  where l.keyword is not null
    and btrim(l.keyword) <> ''
    and l.total_sold > 0
    and l.price between 500 and 50000000
    and not l.is_offtopic
)
select
  b.keyword,
  round((percentile_cont(0.25) within group (order by b.price))::numeric)::bigint as price_p25,
  round((percentile_cont(0.75) within group (order by b.price))::numeric)::bigint as price_p75,
  round((percentile_cont(0.60) within group (order by nullif(b.omset_mo, 0)))::numeric)::bigint as omset_p60,
  round((max(b.omset_mo))::numeric)::bigint as omset_p100
from base b
group by 1;

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
create unique index mv_product_type_quartiles_pk
  on public.mv_product_type_quartiles (keyword);

grant select on public.mv_product_type_quartiles to anon, authenticated;

comment on materialized view public.mv_product_type_quartiles is
  'Price p25/p75 and monthly omset p60/p100 per keyword. Replaces the '
  'per-request product_type_quartiles() aggregate on the Cari Produk path. '
  'omset_p* are frozen at refresh time (they divide by listing age from now()).';

-- ── 2. product_types_v gains the quartiles and a server-side wk_pct ──────
-- The stored definition expands pt.*, so new columns do NOT surface on their
-- own -- the view has to be re-declared. Every existing column is repeated
-- verbatim from the live definition: a create-or-replace that silently drops
-- a column the frontend still reads has bitten this database before.
--
-- wk_pct mirrors weeklyStats() in js/gpt-app.js exactly, so the grid can push
-- its "pct > 0" filter server-side instead of over-fetching 400 rows to keep
-- 80. PostgREST cannot compare two columns in a filter; this is that filter.

create or replace view public.product_types_v as
select
  pt.keyword,
  pt.city,
  pt.category,
  pt.n_listings,
  pt.n_sellers,
  pt.price_min,
  pt.price_median,
  pt.price_max,
  pt.avg_sold,
  pt.total_sold_sum,
  pt.omset_top15,
  pt.sold_top3_share,
  pt.images,
  pt.rep_item_id,
  pt.rep_shop_id,
  pt.rep_product_name,
  pt.rep_store_name,
  pt.rep_price,
  pt.rep_total_sold,
  pt.rep_reviews,
  pt.rep_rating,
  pt.rep_location,
  pt.rep_image_url,
  pt.rep_url,
  pt.rep_listing_date,
  pt.trend_delta_30d,
  pt.trend_items,
  pt.breakout_rate,
  pt.niche_new_items,
  pt.median_winner_price,
  pt.median_winner_reviews,
  pt.refreshed_at,
  coalesce(ks.canonical, 'Lainnya'::text) as category_canonical,
  coalesce(ks.subgroup,  'Lainnya'::text) as subgroup,
  kw.wk_units,
  kw.wk_base,
  kw.wk_items,
  kw.wk_span_days,
  kw.wk_anchor_at,
  kw.wk_units_prev,
  kw.wk_items_prev,
  case
    when kw.wk_units_prev >= 25 and kw.wk_items_prev >= 2
      then round((kw.wk_units - kw.wk_units_prev)::numeric
                 / greatest(kw.wk_units_prev, 1) * 100)::integer
  end as wk_pct,
  q.price_p25,
  q.price_p75,
  q.omset_p60,
  q.omset_p100
from public.mv_product_types pt
  left join public.keyword_subgroup ks on ks.keyword = pt.keyword
  left join public.mv_keyword_weekly kw on kw.keyword = pt.keyword
  left join public.mv_product_type_quartiles q on q.keyword = pt.keyword;

grant select on public.product_types_v to anon, authenticated;

-- ── 3. Momentum-only batch for the trending strip ────────────────────────

create or replace function public.peta_batch_momentum(p_keys jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
-- anon is capped at 3s and authenticated at 8s. This reads one matview by
-- primary key, so it should never come close -- the cap is here so a cold
-- buffer cache degrades into a slow strip rather than an HTTP 500 the caller
-- swallows into an empty one.
set statement_timeout = '10s'
as $$
declare
  n int;
begin
  if p_keys is null or jsonb_typeof(p_keys) is distinct from 'array' then
    raise exception 'p_keys must be a JSON array' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_keys);
  if n > 200 then
    raise exception 'p_keys max 200, got %', n using errcode = '22023';
  end if;
  if n = 0 then
    return jsonb_build_object('momentum', '[]'::jsonb);
  end if;

  return (
    with keys as (
      select distinct (e->>'item_id')::bigint as item_id,
                      (e->>'shop_id')::bigint as shop_id
      from jsonb_array_elements(p_keys) e
      where e->>'item_id' is not null and e->>'shop_id' is not null
    )
    select jsonb_build_object('momentum', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', m.item_id,
        'shop_id', m.shop_id,
        'units_now_wk', m.units_now_wk,
        'units_prev_wk', m.units_prev_wk,
        'units_cur', m.units_now_wk,
        'units_prev', m.units_prev_wk,
        'span_now', m.span_now,
        'span_prev', m.span_prev,
        'at0', m.at0,
        'at1', m.at1,
        'at2', m.at2,
        'momentum_pct', m.momentum_pct,
        'momentum_class', m.momentum_class,
        'fresh', m.fresh,
        'momentum_source', m.momentum_source,
        'cur_source', m.momentum_source,
        'prev_source', 'measured',
        'reviews_flag', m.reviews_flag
      ))
      from mv_listing_momentum m
      join keys k on k.item_id = m.item_id and k.shop_id = m.shop_id
    ), '[]'::jsonb))
  );
end;
$$;

revoke all on function public.peta_batch_momentum(jsonb) from public;
grant execute on function public.peta_batch_momentum(jsonb) to anon, authenticated;

comment on function public.peta_batch_momentum(jsonb) is
  'The momentum half of peta_batch, for callers that never read positions or '
  'scrapes (the Cari Produk trending strip). Same {"momentum": [...]} shape.';

commit;

-- ── 4. Keep the new matview fresh alongside the others ───────────────────
-- Appended right after mv_product_types, which it mirrors the population of.
-- Cannot run inside the transaction above: concurrent refresh needs to COMMIT.

create or replace procedure public.refresh_breakout_matviews_concurrent()
language plpgsql
security definer
set search_path = public
set statement_timeout = '3600s'
as $$
begin
  refresh materialized view concurrently public.listings_deduped;
  commit;
  refresh materialized view concurrently public.mv_niche_breakout;
  commit;
  refresh materialized view concurrently public.mv_region_category;
  commit;
  refresh materialized view concurrently public.mv_supplier_leaderboard;
  commit;
  refresh materialized view concurrently public.mv_naik_daun;
  commit;
  refresh materialized view concurrently public.mv_trending;
  commit;
  refresh materialized view concurrently public.mv_keyword_weekly;
  commit;
  refresh materialized view concurrently public.mv_product_types;
  commit;
  refresh materialized view concurrently public.mv_product_type_quartiles;
  commit;
  refresh materialized view concurrently public.mv_shops;
  commit;
  refresh materialized view concurrently public.mv_keyword_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_daily;
  commit;
  refresh materialized view concurrently public.mv_shop_cohort;
  commit;
  refresh materialized view concurrently public.mv_new_seller_market;
  commit;
  refresh materialized view concurrently public.mv_new_shop_items;
  commit;
  refresh materialized view concurrently public.mv_new_shop_traits;
  commit;
  refresh materialized view concurrently public.mv_new_shop_pricemove;
  commit;
  refresh materialized view concurrently public.mv_new_shop_speed;
  commit;
  refresh materialized view concurrently public.mv_competitor_moves;
  commit;
  refresh materialized view concurrently public.mv_seller_locations;
  perform public.rebuild_keyword_subgroups();
end;
$$;

notify pgrst, 'reload schema';
