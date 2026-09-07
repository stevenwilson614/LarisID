-- product_type_quartiles: restore the omset band and stop the anon 3s timeout.
--
-- Two regressions, both silent:
--
-- 1) 20260729140000_product_type_omset_percentiles.sql added omset_p60/omset_p100.
--    20260814130000_listings_deduped_per_keyword_and_offtopic.sql then re-declared
--    the function `returns table (keyword, price_p25, price_p75)` — `create or
--    replace` simply won, with no error. js/gpt-app.js has been reading
--    q.omset_p60 / q.omset_p100 ever since (attachTypeQuartiles, and the omset
--    range at ~13891 / 19295), so that band has rendered null since 2026-08-14.
--
-- 2) The function carries no statement_timeout. `anon` is capped at 3s
--    (`authenticated` at 8s), and the query needs ~2.3s warm / more cold once the
--    Cari Produk grid passes more than roughly 24-40 keywords. Anonymous visitors
--    got `57014 canceling statement due to statement timeout` -> HTTP 500;
--    attachTypeQuartiles catches it and console.warns, so the price band simply
--    never appeared. Measured 2026-09-07: 500 at n=40, n=80, n=150, n=300.
--
-- Keeps the `not l.is_offtopic` filter the Aug 14 migration correctly added —
-- listings_deduped is one row per (item, shop, keyword) and every keyword query
-- must exclude off-topic rows.
--
-- Return type changes, so drop + recreate is required.

drop function if exists public.product_type_quartiles(text[]);

create or replace function public.product_type_quartiles(p_keywords text[])
returns table (
  keyword text,
  price_p25 bigint,
  price_p75 bigint,
  omset_p60 bigint,
  omset_p100 bigint
)
language sql
stable
security definer
set search_path = public
-- Above the anon 3s cap. The plan is already index-driven (bitmap scan on
-- listings_deduped_kw_sold_ontopic_idx); the cost is random heap reads, so the
-- honest fix is to let a legitimately ~2-3s aggregate finish rather than to
-- return a 500 the caller swallows.
set statement_timeout = '15s'
as $$
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
    where l.keyword = any (p_keywords)
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
$$;

revoke all on function public.product_type_quartiles(text[]) from public;
grant execute on function public.product_type_quartiles(text[]) to anon, authenticated;

notify pgrst, 'reload schema';
